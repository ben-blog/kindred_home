import { createMessageId, excerptFrom, isReplyId, normalizeReply } from '../lib/chat-reply.js';
import { dayKey, groupsTogether, nearBottom } from '../lib/chat-thread.js';
import { safeHttpUrl } from '../lib/safe-url.js';
import { mountPhotoViewer } from './call-viewer.js';
import {
  clampHistory,
  createSseReader,
  explainFailure,
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
  const stage = root;
  const avatar = document.querySelector('#call-avatar-image');
  const openPhoto = mountPhotoViewer(root);
  document
    .querySelector('#call-avatar')
    ?.addEventListener('click', (event) =>
      openPhoto(avatar?.src, avatar?.alt, event.currentTarget)
    );
  const form = document.querySelector('#call-form');
  const input = document.querySelector('#call-input');
  const log = document.querySelector('#call-log');
  const status = document.querySelector('#call-status');
  const searchToggle = document.querySelector('#call-search');
  const replyBar = root.querySelector('#call-reply-bar');
  const menu = root.querySelector('#call-reply-menu');
  let replyTarget = null;
  let menuRow = null;
  let menuReturn = null;
  let suppressClickUntil = 0;
  const messages = [];
  const pending = [];
  const cursor = { calm: 1 };
  let plan;
  let sessionId = '';

  let started = 0;
  let draining = false;
  let rerun = false;
  let holdUntil = 0;
  let holdTimer = 0;
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

  let locationLabel = '';
  function updatePresence(emotion, world) {
    document.querySelector('#call-mood').textContent = emotion || 'calm';
    const place = world?.location;
    if (typeof place === 'string') locationLabel = config.locationNames?.[place] || place;
    else if (place && typeof place.name === 'string') locationLabel = place.name;
    document.querySelector('#call-location').textContent = locationLabel
      ? ` · ${locationLabel}`
      : '';
  }
  function show(emotion) {
    const list = pool(emotion);
    stage.dataset.mood = emotion;
    updatePresence(emotion);
    if (!list.length) return;
    const index = cursor[emotion] ?? 0;
    cursor[emotion] = index + 1;
    const frame = list[index % list.length];
    if (avatar) {
      avatar.src = frame.src;
      avatar.alt = frame.title || name;
    }
    return frame;
  }

  let pinned = true;
  let lastLine = null;
  const jump = document.querySelector('#call-jump');
  function pin(force = false) {
    if (force) pinned = true;
    if (!pinned) return;
    requestAnimationFrame(() => {
      if (pinned) {
        log.scrollTop = log.scrollHeight;
        jump.hidden = true;
      }
    });
  }
  log.addEventListener('scroll', () => {
    pinned = nearBottom(log);
    if (pinned) jump.hidden = true;
  });
  jump.addEventListener('click', () => pin(true));
  root.addEventListener('call-viewport', () => pin());
  new ResizeObserver(() => pin()).observe(log);
  function autosize() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(126, Math.max(42, input.scrollHeight))}px`;
    document.querySelector('.call-send').disabled = !input.value.trim();
    pin();
  }
  input.addEventListener('input', autosize);
  input.addEventListener('focus', () => pin());
  autosize();

  function targetFrom(row) {
    const media = row.querySelector('.call-media img');
    return {
      id: row.dataset.id,
      excerpt: excerptFrom({ content: row.querySelector('p')?.textContent || '' }),
      thumb: media?.src || '',
    };
  }

  function closeMenu(restore = false) {
    menuRow?.classList.remove('is-selected');
    menu.hidden = true;
    menuRow = null;
    if (restore) menuReturn?.focus({ preventScroll: true });
  }

  function startReply(row) {
    if (row.classList.contains('call-typing') || row.classList.contains('is-you')) return;
    replyTarget = targetFrom(row);
    closeMenu();
    const mark = replyBar.querySelector('.call-reply-mark');
    mark.replaceChildren();
    if (replyTarget.thumb) {
      const img = document.createElement('img');
      img.src = replyTarget.thumb;
      img.alt = '';
      mark.append(img);
    } else mark.textContent = '↶';
    replyBar.querySelector('b').textContent = name;
    replyBar.querySelector('.call-reply-summary span').textContent = replyTarget.excerpt;
    replyBar.hidden = false;
    root.querySelector('#call-reply-status').textContent = `Replying to ${name}`;
    pin(true);
    input.focus();
  }
  root.querySelector('#call-reply-cancel').addEventListener('click', () => {
    replyTarget = null;
    replyBar.hidden = true;
    root.querySelector('#call-reply-status').textContent = '';
    input.focus();
    pin();
  });

  function quoteChip(body, quote) {
    if (!quote) return;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'call-quote';
    chip.setAttribute('aria-label', copy.jumpToQuote);
    const title = document.createElement('b');
    title.textContent = name;
    const excerpt = document.createElement('span');
    excerpt.textContent = quote.excerpt;
    chip.append(title, excerpt);
    body.prepend(chip);
    chip.addEventListener('click', () => {
      const original = [...log.querySelectorAll('.call-line')].find(
        (row) => row.dataset.id === quote.id
      );
      if (!original) return;
      pinned = false;
      original.scrollIntoView({
        block: 'center',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
      original.classList.add('is-highlighted');
      clearTimeout(original.highlightTimer);
      original.highlightTimer = setTimeout(() => original.classList.remove('is-highlighted'), 1200);
    });
  }

  function showMenu(row) {
    closeMenu();
    menuRow = row;
    menuReturn = row.querySelector('.call-reply-action');
    row.classList.add('is-selected');
    menu.hidden = false;
    const rect = row.querySelector('p, .call-media').getBoundingClientRect();
    const bounds = root.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(rect.left - bounds.left, bounds.width - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(rect.bottom - bounds.top + 4, bounds.height - menu.offsetHeight - 8))}px`;
    menu.querySelector('button').focus({ preventScroll: true });
  }
  menu.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action || !menuRow) return;
    if (action === 'reply') startReply(menuRow);
    else {
      const text = menuRow.querySelector('p')?.textContent || copy.photo;
      closeMenu(true);
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        status.textContent = 'Copy unavailable.';
      }
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!menu.hidden && !menu.contains(event.target)) {
      suppressClickUntil = Date.now() + 800;
      closeMenu(true);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (menu.hidden) return;
    const items = [...menu.querySelectorAll('button')];
    const index = items.indexOf(document.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu(true);
    } else if (['Tab', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? items.length - 1
            : (index +
                (event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey) ? -1 : 1) +
                items.length) %
              items.length;
      items[next].focus();
    }
  });
  log.addEventListener('scroll', () => {
    closeMenu();
    cancelGesture();
  });
  let gesture = null;
  function cancelGesture() {
    if (!gesture) return;
    clearTimeout(gesture.timer);
    gesture.row.classList.remove('is-swiping');
    gesture = null;
  }
  log.addEventListener('pointerdown', (event) => {
    if (gesture) {
      cancelGesture();
      return;
    }
    if (event.pointerType === 'mouse' || !event.isPrimary) return;
    const bubble = event.target.closest(
      '.call-line:not(.is-you):not(.call-typing) > p, .call-line:not(.is-you):not(.call-typing) > .call-media'
    );
    if (!bubble) return;
    const row = bubble.closest('.call-line');
    gesture = { row, id: event.pointerId, x: event.clientX, y: event.clientY, swipe: false };
    gesture.timer = setTimeout(() => {
      if (!gesture) return;
      showMenu(row);
      suppressClickUntil = Date.now() + 800;
      cancelGesture();
    }, 450);
  });
  log.addEventListener('pointermove', (event) => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (Math.hypot(dx, dy) >= 12) clearTimeout(gesture.timer);
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) >= 12) {
      cancelGesture();
      return;
    }
    gesture.swipe = dx >= 48 && dx > Math.abs(dy);
    gesture.row.classList.toggle('is-swiping', gesture.swipe);
  });
  document.addEventListener('pointerup', (event) => {
    if (menuRow) {
      suppressClickUntil = Date.now() + 800;
      return;
    }
    if (!gesture || gesture.id !== event.pointerId) return;
    const { row, swipe } = gesture;
    cancelGesture();
    if (swipe) {
      suppressClickUntil = Date.now() + 800;
      startReply(row);
    }
  });
  document.addEventListener('pointercancel', cancelGesture);
  log.addEventListener('contextmenu', (event) => {
    const row = event.target.closest('.call-line:not(.is-you):not(.call-typing)');
    if (!row) return;
    event.preventDefault();
    cancelGesture();
    suppressClickUntil = Date.now() + 800;
    showMenu(row);
  });
  log.addEventListener(
    'click',
    (event) => {
      if (Date.now() < suppressClickUntil) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true
  );

  function line(who, value, mine, at = Date.now(), saved = {}) {
    const item = document.createElement('li');
    item.className = mine ? 'call-line is-you' : 'call-line';
    item.dataset.id = isReplyId(saved.id) ? saved.id : createMessageId();
    const previous = lastLine;
    const record = {
      mine,
      at,
      item,
      previous,
      id: item.dataset.id,
      role: mine ? 'user' : 'assistant',
      content: value,
      reply_to: saved.reply_to,
    };
    item.threadRecord = record;
    if (!previous || dayKey(previous.at) !== dayKey(at)) {
      const day = document.createElement('li');
      day.className = 'call-day';
      const label = document.createElement('span');
      label.textContent =
        dayKey(at) === dayKey(Date.now())
          ? 'Today'
          : new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      day.append(label);
      log.append(day);
    }
    if (groupsTogether(previous, record)) {
      item.classList.add('is-connected');
      previous.item.classList.add('has-next');
      const previousTime = previous.item.querySelector('.call-time');
      if (previousTime) previousTime.hidden = true;
    }
    if (!mine && avatar?.src) {
      const face = document.createElement('img');
      face.className = 'call-line-avatar';
      face.src = avatar.src;
      face.alt = who;
      item.append(face);
    }
    const body = document.createElement('p');
    body.textContent = value;
    if (mine) quoteChip(body, saved.reply_to);
    const stamp = document.createElement('time');
    stamp.className = 'call-time';
    stamp.dateTime = new Date(at).toISOString();
    stamp.textContent = new Date(at).toLocaleTimeString(undefined, {
      timeZone: 'Asia/Seoul',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    item.append(body, stamp);
    if (!mine) {
      const reply = document.createElement('button');
      reply.type = 'button';
      reply.className = 'call-reply-action';
      reply.textContent = '↶';
      const update = () =>
        reply.setAttribute('aria-label', `Reply to ${name}: ${targetFrom(item).excerpt}`);
      update();
      new MutationObserver(update).observe(body, {
        childList: true,
        characterData: true,
        subtree: true,
      });
      reply.addEventListener('click', () => startReply(item));
      item.append(reply);
    }
    log.append(item);
    lastLine = record;
    if (!mine && !pinned) jump.hidden = false;
    pin(mine);
    return { item, body };
  }
  function typing(body, on) {
    const row = body.closest('.call-line');
    if (!row) return;
    row.classList.toggle('call-typing', on);
    body.removeAttribute('aria-label');
    if (on) {
      body.replaceChildren(...[0, 1, 2].map(() => document.createElement('i')));
      body.setAttribute('aria-label', `${name} is typing`);
    }
    pin();
  }
  function mediaLine(media, existingBody, mine = false, at = Date.now(), saved = {}) {
    const url = safeHttpUrl(media?.url);
    if (!url) return;
    const { item, body } = existingBody
      ? { item: existingBody.closest('.call-line'), body: existingBody }
      : line(mine ? copy.you : name, '', mine, at, saved);
    body.remove();
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'call-media';
    const image = document.createElement('img');
    image.src = url;
    image.alt = typeof media.alt === 'string' ? media.alt : `${name} photo`;
    button.setAttribute('aria-label', `View ${image.alt}`);
    image.addEventListener('load', () => pin());
    image.addEventListener('error', () => {
      const previous = item.threadRecord?.previous;
      item.remove();
      if (lastLine?.item === item) {
        lastLine = previous || null;
        previous?.item.classList.remove('has-next');
        const stamp = previous?.item.querySelector('.call-time');
        if (stamp) stamp.hidden = false;
      }
      pin();
    });
    button.append(image);
    item.prepend(button);
    button.addEventListener('click', () => openPhoto(url, image.alt, button));
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

  async function readStream(response, body, turn) {
    const reader = response.body.getReader();
    const parser = createSseReader();
    let reply = '';
    let expression = 'calm';
    let world = null;
    let media = null;
    const paint = (flush) => {
      const shown = flush ? reply : stablePrefix(reply);
      if (shown) typing(body, false);
      body.textContent = shown;
      turn.reply.body.textContent = shown;
      pin();
    };
    const handle = (data) => {
      if (!data || typeof data !== 'object') return;
      if (data.type === 'token' && typeof data.text === 'string') {
        typing(body, false);
        reply += data.text;
        paint(false);
      } else if (data.type === 'trace' && data.stage === 'retrieved') {
        turn.retrievedSeen = true;
        fillRetrieved(turn.retrieved, data.items || []);
        root.dispatchEvent(new CustomEvent('memory-trace', { detail: data }));
      } else if (data.type === 'trace' && data.stage === 'web_search') {
        addWebSearch(turn, data);
      } else if (data.type === 'done') {
        media = data.media || null;
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
    return { reply, expression, world, media };
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
    typing(body, true);
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
    typing(body, false);
    const world = result.world;
    updatePresence(result.expression, world);
    turn.world.body.textContent = world
      ? `mood ${world.mood ?? copy.none} · energy ${world.energy ?? copy.none}`
      : copy.none;
    turn.emotion.body.textContent = frame?.title
      ? `${result.expression || 'calm'} · ${frame.title}`
      : result.expression || 'calm';
    body.textContent = result.reply;
    if (result.media) mediaLine(result.media, result.reply ? null : body);
    pin();
  }

  function failTurn(body, turn, reason, code) {
    typing(body, false);
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
    const quote = batch[0].reply_to;
    messages.push({
      id: batch[0].row?.dataset.id || createMessageId(),
      reply_to: quote,
      role: 'user',
      content: text,
    });
    const { body, turn } = openTurn(text);
    status.textContent = '';
    stage.classList.add('is-talking');
    try {
      const payload = { messages: clampHistory(messages) };
      if (quote) payload.reply_to = { id: quote.id, excerpt: quote.excerpt };
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
        typing(body, false);
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
      if (!reply && !safeHttpUrl(result.media?.url)) {
        failTurn(body, turn, 'empty', response.status);
        return 'fail';
      }
      const replyId = body.closest('.call-line').dataset.id;
      finishTurn(body, turn, { ...result, reply });
      messages.push({
        id: replyId,
        role: 'assistant',
        content: reply,
      });
      armSaved(turn.saved);
      return 'ok';
    } catch {
      failTurn(body, turn, 'network');
      return 'fail';
    } finally {
      typing(body, false);
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
      autosize();
      document.querySelector('#call-empty')?.remove();
      const quote = replyTarget;
      replyTarget = null;
      replyBar.hidden = true;
      root.querySelector('#call-reply-status').textContent = '';
      const { item } = line(copy.you, value, true, Date.now(), { reply_to: quote });
      setQueued(item, true);
      pending.push({ text: value, row: item, reply_to: quote });
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
      pollMemory();
      fetch('/api/world')
        .then((r) => (r.ok ? r.json() : null))
        .then((world) => {
          if (world?.characters?.[slug])
            updatePresence(stage.dataset.mood || 'calm', world.characters[slug]);
        })
        .catch(() => {});
      setInterval(pollMemory, 10000);
      drain();
    } catch {
      status.textContent = copy.dropped;
    }
  }

  for (const item of Array.isArray(config.history) ? config.history : []) {
    if (!item || !['assistant', 'user'].includes(item.role)) continue;
    document.querySelector('#call-empty')?.remove();
    const mine = item.role === 'user';
    const saved = {
      id: isReplyId(item.id) ? item.id : createMessageId(),
      reply_to: normalizeReply(item.reply_to) || undefined,
    };
    const at = Number.isFinite(Date.parse(item.at)) ? Date.parse(item.at) : Date.now();
    if (typeof item.content === 'string' && item.content) {
      line(mine ? copy.you : name, item.content, mine, at, saved);
      messages.push({ ...saved, role: item.role, content: item.content });
    }
    if (item.media) mediaLine(item.media, null, mine, at, item.content ? {} : saved);
  }
  connect();

  function setSearch(on) {
    if (!searchToggle) return;
    searchToggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    searchToggle.classList.toggle('is-on', on);
    root.querySelector('#call-search-status').hidden = !on;
    pin();
  }
  searchToggle?.addEventListener('click', () => {
    setSearch(searchToggle.getAttribute('aria-pressed') !== 'true');
  });

  root.addEventListener('memory-hover', (event) => {
    const id = event.detail?.id || '';
    for (const chip of document.querySelectorAll('.call-chip')) {
      chip.classList.toggle('is-hot', chip.dataset.id === id);
    }
  });
}
