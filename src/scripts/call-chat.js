import {
  clampHistory,
  createSseReader,
  EMOJI_GROUPS,
  explainFailure,
  insertAtCaret,
  joinBatch,
  retryDelayMs,
  stablePrefix,
  takeBatch,
} from '../lib/chat-compose.js';

export function mountCall(config) {
  const root = document.querySelector('.call');
  if (!root || !config || root.dataset.mounted === '1') return;
  root.dataset.mounted = '1';

  const { slug, name, frames, copy } = config;
  const stage = document.querySelector('.call-stage');
  const photos = [...document.querySelectorAll('.call-photo')];
  const form = document.querySelector('#call-form');
  const input = document.querySelector('#call-input');
  const log = document.querySelector('#call-log');
  const status = document.querySelector('#call-status');
  const timer = document.querySelector('#call-timer');
  const searchToggle = document.querySelector('#call-search');
  const emojiToggle = document.querySelector('#call-emoji');
  const emojiPanel = document.querySelector('#call-emoji-panel');
  const messages = [];
  const pending = [];
  const cursor = { calm: 1 };
  let plan;
  let sessionId = '';
  let front = 0;
  let started = 0;
  let draining = false;
  let rerun = false;
  let holdUntil = 0;
  let holdTimer = 0;
  let composing = false;
  let caret = { start: 0, end: 0 };
  let pendingSaved = null;
  let since = '';
  let polling = false;

  function pool(emotion) {
    const tagged = frames.filter((frame) => frame.emotions.includes(emotion));
    const portraits = tagged.filter((frame) => frame.portrait);
    if (portraits.length) return portraits;
    if (tagged.length) return tagged;
    const faces = frames.filter((frame) => frame.portrait);
    return faces.length ? faces : frames;
  }

  function show(emotion) {
    const list = pool(emotion);
    if (!list.length || photos.length < 2) return;
    const index = cursor[emotion] ?? 0;
    cursor[emotion] = index + 1;
    const frame = list[index % list.length];
    const next = 1 - front;
    photos[next].src = frame.src;
    photos[next].alt = frame.title || name;
    photos[next].classList.add('is-shown');
    photos[next].removeAttribute('aria-hidden');
    photos[front].classList.remove('is-shown');
    photos[front].setAttribute('aria-hidden', 'true');
    front = next;
    stage.dataset.mood = emotion;
    return frame;
  }

  function line(who, value, mine) {
    const item = document.createElement('li');
    item.className = mine ? 'call-line is-you' : 'call-line';
    const label = document.createElement('span');
    label.textContent = who;
    const body = document.createElement('p');
    body.textContent = value;
    item.append(label, body);
    log.append(item);
    log.scrollTop = log.scrollHeight;
    return { item, body };
  }

  function setQueued(row, queued) {
    if (!row) return;
    row.classList.toggle('is-queued', queued);
    const mark = row.querySelector('.call-queue-mark');
    if (!queued) {
      mark?.remove();
      return;
    }
    if (mark) return;
    const badge = document.createElement('span');
    badge.className = 'call-queue-mark';
    badge.textContent = copy.queued;
    row.firstElementChild?.append(badge);
  }

  function release(batch) {
    for (const item of batch) {
      if (!item.row) continue;
      item.row.classList.remove('is-queued', 'is-failed');
      item.row.querySelector('.call-queue-mark')?.remove();
      item.row.querySelector('.call-retry')?.remove();
    }
  }

  function showRetry(batch, mode) {
    const row = batch.filter((item) => item.row).at(-1)?.row;
    if (!row || row.querySelector('.call-retry')) return;
    for (const item of batch) {
      if (!item.row) continue;
      item.row.classList.add('is-failed');
      setQueued(item.row, mode === 'rate');
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'call-retry';
    button.textContent = copy.retry;
    row.append(button);
    button.addEventListener('click', () => {
      if (Date.now() < holdUntil) {
        status.textContent = copy.wait;
        return;
      }
      button.remove();
      for (const item of batch) setQueued(item.row, true);
      if (mode === 'parked') pending.unshift(...batch);
      drain();
    });
  }

  function armHold(until) {
    holdUntil = Math.max(holdUntil, until);
    clearTimeout(holdTimer);
    holdTimer = setTimeout(
      () => {
        holdUntil = 0;
        drain();
      },
      Math.max(0, holdUntil - Date.now())
    );
  }

  function tick() {
    const seconds = Math.max(0, Math.floor((Date.now() - started) / 1000));
    const text = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    timer.textContent = text;
    timer.dateTime = `PT${seconds}S`;
  }

  async function readStream(response, body, turn) {
    const reader = response.body.getReader();
    const parser = createSseReader();
    let reply = '';
    let expression = 'calm';
    let world = null;
    const paint = (flush) => {
      const shown = flush ? reply : stablePrefix(reply);
      body.textContent = shown;
      turn.reply.body.textContent = shown;
      log.scrollTop = log.scrollHeight;
    };
    const handle = (data) => {
      if (!data || typeof data !== 'object') return;
      if (data.type === 'token' && typeof data.text === 'string') {
        reply += data.text;
        paint(false);
      } else if (data.type === 'trace' && data.stage === 'retrieved') {
        turn.retrievedSeen = true;
        fillRetrieved(turn.retrieved, data.items || []);
        root.dispatchEvent(new CustomEvent('memory-trace', { detail: data }));
      } else if (data.type === 'trace' && data.stage === 'web_search') {
        addWebSearch(turn, data);
      } else if (data.type === 'done') {
        if (typeof data.expression === 'string') expression = data.expression;
        if (data.world && typeof data.world === 'object') world = data.world;
        if (typeof data.sessionId === 'string') {
          sessionId = data.sessionId;
          try {
            sessionStorage.setItem(`call:${slug}`, sessionId);
          } catch {
            sessionId = data.sessionId;
          }
        }
        if (data.plan && typeof data.plan === 'object') plan = data.plan;
      } else if (data.type === 'error') {
        const failure = new Error('stream');
        failure.reason = 'stream';
        throw failure;
      }
    };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const data of parser.push(value)) handle(data);
    }
    for (const data of parser.flush()) handle(data);
    paint(true);
    return { reply, expression, world };
  }

  function step(label, value) {
    const row = document.createElement('p');
    const title = document.createElement('span');
    title.dataset.label = label;
    title.textContent = label;
    const body = document.createElement('span');
    body.textContent = value;
    row.append(title, body);
    return { row, body };
  }

  function renumber(article) {
    let index = 0;
    for (const row of article.querySelectorAll('p')) {
      const title = row.firstElementChild;
      if (!title || !title.dataset.label) continue;
      index += 1;
      title.textContent = `${index} ${title.dataset.label}`;
    }
  }

  function safeHttpUrl(value) {
    if (typeof value !== 'string') return '';
    const text = value.trim();
    if (!text || text.length > 300) return '';
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      if (code <= 32 || code === 127) return '';
    }
    let url;
    try {
      url = new URL(text);
    } catch {
      return '';
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    if (url.username || url.password) return '';
    if (url.href.length > 300) return '';
    return url.href;
  }

  function fillRetrieved(slot, items) {
    slot.body.replaceChildren();
    if (!items.length) {
      slot.body.textContent = copy.none;
      return;
    }
    const list = document.createElement('span');
    list.className = 'call-retrieved';
    for (const item of items) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'call-chip';
      chip.dataset.id = item.id;
      const score = typeof item.score === 'number' ? ` ${item.score}` : ` ${copy.recent}`;
      chip.textContent = `${item.label || item.kind}${score}`;
      if (item.kind !== 'reflection') {
        chip.addEventListener('pointerenter', () => {
          root.dispatchEvent(new CustomEvent('memory-focus', { detail: { id: item.id } }));
        });
        chip.addEventListener('pointerleave', () => {
          root.dispatchEvent(new CustomEvent('memory-focus', { detail: { id: '' } }));
        });
      }
      list.append(chip);
    }
    slot.body.append(list);
  }

  function fillWebSearch(slot, data) {
    slot.body.replaceChildren();
    const query = document.createElement('span');
    query.className = 'call-query';
    query.textContent = typeof data.query === 'string' && data.query ? data.query : copy.none;
    slot.body.append(query);
    const results = Array.isArray(data.results) ? data.results.slice(0, 5) : [];
    const list = document.createElement('span');
    list.className = 'call-retrieved';
    for (const item of results) {
      const href = safeHttpUrl(item && item.url);
      const title = item && typeof item.title === 'string' ? item.title : '';
      if (!href) continue;
      const link = document.createElement('a');
      link.className = 'call-source';
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = title || href;
      list.append(link);
    }
    if (list.childNodes.length) slot.body.append(list);
  }

  function addWebSearch(turn, data) {
    const slot = step(copy.webSearch, '');
    fillWebSearch(slot, data);
    if (!turn.retrievedSeen) turn.traces.insertBefore(slot.row, turn.retrieved.row);
    else turn.traces.append(slot.row);
    renumber(turn.article);
    const think = document.querySelector('#call-think');
    think.scrollTop = think.scrollHeight;
  }

  function armSaved(slot) {
    const at = Date.now();
    pendingSaved = { slot, at, until: at + 60_000 };
    slot.body.textContent = copy.pending;
  }

  function noteSaved(points, at) {
    if (!pendingSaved) return;
    if (at > pendingSaved.until) {
      pendingSaved = null;
      return;
    }
    const fresh = points.filter((point) => Date.parse(point.createdAt) >= pendingSaved.at);
    if (!fresh.length) return;
    pendingSaved.slot.body.textContent = fresh.map((point) => point.label || point.id).join(', ');
    pendingSaved = null;
  }

  async function pollMemory() {
    if (polling) return;
    polling = true;
    try {
      await readMap(false);
    } catch {
      const memoryStatus = document.querySelector('#call-memory-status');
      if (memoryStatus) memoryStatus.hidden = false;
    } finally {
      polling = false;
    }
  }

  async function readMap(forceFull) {
    const query = !forceFull && since ? `?since=${encodeURIComponent(since)}` : '';
    const memoryStatus = document.querySelector('#call-memory-status');
    const startedAt = Date.now();
    const response = await fetch(`/api/world/chat/${slug}/memory${query}`, {
      headers: { accept: 'application/json' },
    });
    if (response.status === 401 || response.status === 403) {
      location.replace('/login');
      return;
    }
    if (response.status === 429) {
      if (!root.memoryMap) memoryStatus.hidden = false;
      return;
    }
    if (!response.ok) throw new Error('memory');
    const body = await response.json();
    const current = root.memoryMap;
    if (
      query &&
      current?.basisFingerprint &&
      body.basisFingerprint &&
      body.basisFingerprint !== current.basisFingerprint
    ) {
      since = '';
      root.memoryMap = null;
      root.dispatchEvent(
        new CustomEvent('memory-map', {
          detail: { basisVersion: '', basisFingerprint: '', points: [], reset: true },
        })
      );
      return readMap(true);
    }
    const known = new Set((current?.points || []).map((point) => point.id));
    let points = Array.isArray(body.points) ? body.points : [];
    if (
      query &&
      current &&
      body.basisFingerprint &&
      body.basisFingerprint === current.basisFingerprint
    ) {
      points = current.points.concat(points.filter((point) => !known.has(point.id)));
    }
    const arrived = points.filter((point) => !known.has(point.id));
    const detail = {
      basisVersion: body.basisVersion ?? '',
      basisFingerprint: body.basisFingerprint || '',
      points,
    };
    root.memoryMap = detail;
    root.dispatchEvent(new CustomEvent('memory-map', { detail }));
    for (const point of points) {
      if (point.createdAt && point.createdAt > since) since = point.createdAt;
    }
    memoryStatus.hidden = true;
    noteSaved(query ? arrived : points, startedAt);
  }

  function openTurn(text) {
    const { body } = line(name, '', false);
    const traces = document.createElement('div');
    traces.className = 'call-traces';
    const turn = {
      traces,
      retrievedSeen: false,
      retrieved: step(copy.retrieved, copy.none),
      world: step(copy.world, copy.none),
      emotion: step(copy.emotion, copy.none),
      reply: step(copy.reply, ''),
      saved: step(copy.saved, copy.none),
    };
    traces.append(turn.retrieved.row);
    const article = document.createElement('article');
    article.className = 'call-turn';
    turn.article = article;
    article.append(
      step(copy.received, text).row,
      traces,
      turn.world.row,
      turn.emotion.row,
      turn.reply.row,
      turn.saved.row
    );
    renumber(article);
    const think = document.querySelector('#call-think');
    think.append(article);
    think.scrollTop = think.scrollHeight;
    return { body, turn };
  }

  function finishTurn(body, turn, result) {
    const frame = show(result.expression || 'calm');
    const world = result.world;
    turn.world.body.textContent = world
      ? `mood ${world.mood ?? copy.none} · energy ${world.energy ?? copy.none}`
      : copy.none;
    turn.emotion.body.textContent = frame?.title
      ? `${result.expression || 'calm'} · ${frame.title}`
      : result.expression || 'calm';
    body.textContent = result.reply;
  }

  function failTurn(body, turn, reason, code) {
    const key = explainFailure({ status: code, reason });
    const message = copy[key] || copy.dropped;
    body.textContent = message;
    if (turn?.reply?.body) turn.reply.body.textContent = message;
    status.textContent = message;
    console.warn('[call] chat failed', code ?? reason);
    if (messages.at(-1)?.role === 'user') messages.pop();
  }

  async function perform(batch) {
    const text = joinBatch(batch);
    messages.push({ role: 'user', content: text });
    const { body, turn } = openTurn(text);
    status.textContent = '';
    stage.classList.add('is-talking');
    try {
      const payload = { messages: clampHistory(messages) };
      if (sessionId) payload.sessionId = sessionId;
      if (plan) payload.plan = plan;
      if (searchToggle?.getAttribute('aria-pressed') === 'true') payload.forceWebSearch = true;
      setSearch(false);
      let response;
      try {
        response = await fetch(`/api/world/chat/${slug}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
          body: JSON.stringify(payload),
        });
      } catch {
        failTurn(body, turn, 'network');
        return 'fail';
      }
      if (response.status === 401 || response.status === 403) {
        location.replace('/login');
        return 'auth';
      }
      if (response.status === 429) {
        body.textContent = copy.wait;
        status.textContent = copy.wait;
        console.warn('[call] chat failed', response.status);
        if (messages.at(-1)?.role === 'user') messages.pop();
        holdUntil = Date.now() + retryDelayMs(response.headers.get('retry-after'));
        return 'rate';
      }
      if (!response.ok || !response.body) {
        failTurn(body, turn, '', response.status);
        return 'fail';
      }
      let result;
      try {
        result = await readStream(response, body, turn);
      } catch (error) {
        failTurn(body, turn, error?.reason === 'stream' ? 'stream' : 'network', response.status);
        return 'fail';
      }
      const reply = typeof result.reply === 'string' ? result.reply.trim() : '';
      if (!reply) {
        failTurn(body, turn, 'empty', response.status);
        return 'fail';
      }
      finishTurn(body, turn, { ...result, reply });
      messages.push({ role: 'assistant', content: reply });
      armSaved(turn.saved);
      return 'ok';
    } catch {
      failTurn(body, turn, 'network');
      return 'fail';
    } finally {
      stage.classList.remove('is-talking');
    }
  }

  function drain() {
    if (!started) return;
    if (Date.now() < holdUntil) return;
    if (draining) {
      rerun = true;
      return;
    }
    draining = true;
    void pump();
  }

  async function pump() {
    let failures = 0;
    try {
      while (pending.length && failures < 2) {
        if (Date.now() < holdUntil) {
          armHold(holdUntil);
          return;
        }
        const batch = takeBatch(pending);
        if (!batch.length) break;
        release(batch);
        const result = await perform(batch);
        if (result === 'auth') return;
        if (result === 'ok') {
          failures = 0;
          continue;
        }
        if (result === 'rate') {
          pending.unshift(...batch);
          showRetry(batch, 'rate');
          armHold(holdUntil);
          return;
        }
        showRetry(batch, 'parked');
        failures += 1;
      }
    } finally {
      draining = false;
      if (rerun) {
        rerun = false;
        drain();
      }
    }
  }

  let handling = false;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (handling) return;
    handling = true;
    try {
      const value = input.value.trim();
      if (!value) return;
      input.value = '';
      document.querySelector('#call-empty')?.remove();
      const { item } = line(copy.you, value, true);
      setQueued(item, true);
      pending.push({ text: value, row: item });
      drain();
      input.focus();
    } finally {
      handling = false;
    }
  });

  try {
    const stored = sessionStorage.getItem(`call:${slug}`) || '';
    if (/^[a-zA-Z0-9-]{1,64}$/.test(stored)) sessionId = stored;
  } catch {
    sessionId = '';
  }

  async function connect() {
    try {
      const response = await fetch('/api/world/auth/session', {
        headers: { accept: 'application/json' },
      });
      if (response.status === 503) {
        status.textContent = copy.dropped;
        return;
      }
      const body = await response.json().catch(() => ({}));
      if (!body.signedIn) {
        location.replace('/login');
        return;
      }
      started = Date.now();
      tick();
      setInterval(tick, 1000);
      pollMemory();
      setInterval(pollMemory, 10000);
      input.focus();
      drain();
    } catch {
      status.textContent = copy.dropped;
    }
  }

  connect();

  function setSearch(on) {
    if (!searchToggle) return;
    searchToggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    searchToggle.classList.toggle('is-on', on);
  }
  searchToggle?.addEventListener('click', () => {
    setSearch(searchToggle.getAttribute('aria-pressed') !== 'true');
  });

  const mobileQuery = window.matchMedia('(max-width: 800px)');
  document.querySelector('#call-think-toggle')?.addEventListener('click', () => {
    if (mobileQuery.matches) {
      root.dispatchEvent(new CustomEvent('call-sheet', { detail: { tab: 'trace' } }));
      return;
    }
    const panel = document.querySelector('#call-think');
    panel.hidden = !panel.hidden;
  });
  document.querySelector('#call-memory-toggle')?.addEventListener('click', () => {
    if (mobileQuery.matches) {
      root.dispatchEvent(new CustomEvent('call-sheet', { detail: { tab: 'sphere' } }));
      return;
    }
    document.querySelector('#call-memory')?.classList.toggle('is-open');
  });
  root.addEventListener('memory-hover', (event) => {
    const id = event.detail?.id || '';
    for (const chip of document.querySelectorAll('.call-chip')) {
      chip.classList.toggle('is-hot', chip.dataset.id === id);
    }
  });

  function rememberCaret() {
    if (document.activeElement !== input) return;
    if (input.selectionStart == null || input.selectionEnd == null) return;
    caret = { start: input.selectionStart, end: input.selectionEnd };
  }
  for (const type of ['keyup', 'pointerup', 'select', 'input']) {
    input.addEventListener(type, rememberCaret);
  }

  function setPicker(open) {
    if (!emojiPanel || !emojiToggle) return;
    emojiPanel.hidden = !open;
    emojiToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  if (emojiPanel && emojiToggle) {
    for (const group of EMOJI_GROUPS) {
      const section = document.createElement('section');
      section.className = 'call-emoji-group';
      const title = document.createElement('p');
      title.textContent = copy[group.id] || group.id;
      const grid = document.createElement('div');
      grid.className = 'call-emoji-grid';
      grid.setAttribute('role', 'group');
      grid.setAttribute('aria-label', title.textContent);
      for (const emoji of group.emoji) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.emoji = emoji;
        button.textContent = emoji;
        button.setAttribute('aria-label', emoji);
        grid.append(button);
      }
      section.append(title, grid);
      emojiPanel.append(section);
    }

    emojiToggle.addEventListener('pointerdown', () => {
      if (document.activeElement === input) rememberCaret();
    });
    emojiToggle.addEventListener('click', () => {
      setPicker(emojiPanel.hidden);
    });
    emojiPanel.addEventListener('pointerdown', (event) => {
      const button = event.target.closest('[data-emoji]');
      if (!button) return;
      event.preventDefault();
      if (composing) return;
      const focused = document.activeElement === input;
      const placed = insertAtCaret(input, button.dataset.emoji, {
        composing: false,
        start: focused ? input.selectionStart : caret.start,
        end: focused ? input.selectionEnd : caret.end,
      });
      if (!placed) return;
      caret = {
        start: input.selectionStart ?? caret.start,
        end: input.selectionEnd ?? caret.end,
      };
      input.focus();
    });
    document.addEventListener('pointerdown', (event) => {
      if (emojiPanel.hidden) return;
      if (emojiPanel.contains(event.target) || emojiToggle.contains(event.target)) return;
      setPicker(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || emojiPanel.hidden) return;
      setPicker(false);
      emojiToggle.focus();
    });
  }

  input.addEventListener('compositionstart', () => {
    composing = true;
  });
  input.addEventListener('compositionend', () => {
    composing = false;
    rememberCaret();
  });
}
