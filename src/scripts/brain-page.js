import { safeHttpUrl } from '../lib/safe-url.js';
import { memoryKindCss } from '../lib/memory-kind.js';
import {
  ADULT_MEMORY_BADGE,
  diffMemories,
  filterPoints,
  formatDay,
  formatStamp,
  rangeBounds,
  regionModel,
  summarizeDays,
} from '../lib/brain.js';
import { mountSphere } from './memory-sphere.js';

const RANGES = [
  ['today', '오늘'],
  ['7', '7일'],
  ['30', '30일'],
  ['all', '전체'],
  ['custom', '직접'],
];
const SPEEDS = [1, 2, 4, 8];
const PLAY_MS = 16000;
const LIST_CAP = 48;
const SECTION_LABEL = {
  knowledge: 'knowledge',
  reflection: 'reflection',
  behavior: 'pattern',
  user: 'experience',
};

export function mountBrain(config) {
  const root = document.querySelector('.brain');
  if (!root || root.dataset.mounted === '1') return;
  root.dataset.mounted = '1';
  const person = config?.person;
  const status = document.querySelector('#brain-status');
  const panel = document.querySelector('#brain-panel');
  const sphereRoot = document.querySelector('#brain-sphere');
  if (!person || typeof person.slug !== 'string' || !person.slug) {
    say('memory route가 있는 캐릭터가 없습니다.');
    return;
  }
  try {
    localStorage.setItem('kindred-brain-slug', person.slug);
  } catch {
    /* The chooser can stay put when storage is blocked. */
  }
  let preset = '7';
  let custom = { from: '', to: '' };
  let tab = 'timelapse';
  let diffA = '';
  let diffB = '';
  let diffTouched = false;
  let speed = 1;
  let cursor = Number.POSITIVE_INFINITY;
  let playing = false;
  let playFrom = 0;
  let playStart = 0;
  let playFrame = 0;
  let sphere = null;
  let sphereToken = 0;
  let signature = '';
  let cached = null;
  const mobileQuery = window.matchMedia('(max-width: 800px)');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.documentElement.style.setProperty('--accent', person.accent);
  document.documentElement.style.setProperty('--ground', person.ground);
  if (person.ink) document.documentElement.style.setProperty('--ink', person.ink);
  root.dataset.layout = person.layout || 'sheet';
  buildRanges();
  wireTabs();
  wireCustom();

  function say(text) {
    if (status) status.textContent = text;
  }

  function buildRanges() {
    const host = document.querySelector('#brain-ranges');
    host.replaceChildren();
    for (const [id, label] of RANGES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.range = id;
      button.textContent = label;
      button.addEventListener('click', () => {
        preset = id;
        document.querySelector('#brain-custom').hidden = id !== 'custom';
        stopPlay();
        cursor = Number.POSITIVE_INFINITY;
        signature = '';
        paintRange();
        render();
      });
      host.append(button);
    }
    paintRange();
  }

  function paintRange() {
    for (const button of document.querySelectorAll('[data-range]')) {
      button.setAttribute('aria-pressed', button.dataset.range === preset ? 'true' : 'false');
    }
  }

  function wireCustom() {
    const form = document.querySelector('#brain-custom');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      custom = {
        from: document.querySelector('#brain-from').value,
        to: document.querySelector('#brain-to').value,
      };
      preset = 'custom';
      stopPlay();
      cursor = Number.POSITIVE_INFINITY;
      signature = '';
      render();
    });
  }

  function wireTabs() {
    for (const button of document.querySelectorAll('[data-tab]')) {
      button.addEventListener('click', () => {
        tab = button.dataset.tab;
        stopPlay();
        signature = '';
        for (const item of document.querySelectorAll('[data-tab]')) {
          item.setAttribute('aria-selected', item === button ? 'true' : 'false');
        }
        render();
      });
    }
  }

  function bounds() {
    return rangeBounds(preset, Date.now(), custom);
  }

  function filtered() {
    return filterPoints(mapPoints(), bounds());
  }

  function mapPoints() {
    return Array.isArray(cached?.points) ? cached.points : [];
  }

  async function refresh() {
    say('불러오는 중');
    const token = ++sphereToken;
    try {
      const body = await loadMap();
      if (token !== sphereToken || !body) return;
      const name = body.source === 'history' ? 'history' : 'map';
      say(body.truncated ? `${name} ${body.points.length} · 잘림` : `${name} ${body.points.length}`);
      await ensureSphere(token);
      render();
    } catch (error) {
      if (token !== sphereToken) return;
      say(error?.status === 429 ? '잠시 후 다시 시도해 주세요.' : 'memory를 불러오지 못했습니다.');
    }
  }

  async function loadMap() {
    if (cached) return cached;
    const history = await loadHistory(person.slug);
    if (history === null) return null;
    const clean = history || (await loadLegacy(person.slug));
    if (!clean) return null;
    cached = clean;
    return cached;
  }

  async function loadHistory(slug) {
    const to = new Date().toISOString();
    const response = await fetch(
      `/api/world/brain/${slug}/history?from=2000-01-01T00:00:00.000Z&to=${encodeURIComponent(to)}`,
      { headers: { accept: 'application/json' }, credentials: 'same-origin' }
    );
    if (response.status === 401 || response.status === 403) {
      location.replace('/login');
      return null;
    }
    if (!response.ok) return false;
    const body = await response.json().catch(() => null);
    if (!body || !Array.isArray(body.rows)) return false;
    return {
      source: 'history',
      points: body.rows.map(historyPoint),
      truncated: body.truncated === true,
      basisFingerprint: typeof body.basisFingerprint === 'string' ? body.basisFingerprint : '',
      meta: body.meta && typeof body.meta === 'object' ? body.meta : {},
    };
  }

  function historyPoint(row) {
    const snippet = typeof row.snippet === 'string' ? row.snippet : '';
    return {
      ...row,
      label: snippet,
      snippet,
    };
  }

  async function loadLegacy(slug) {
    const response = await fetch(`/api/world/chat/${slug}/memory`, {
      headers: { accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (response.status === 401 || response.status === 403) {
      location.replace('/login');
      return null;
    }
    if (!response.ok) {
      const error = new Error('memory');
      error.status = response.status;
      throw error;
    }
    const body = await response.json();
    const points = Array.isArray(body.points) ? body.points : [];
    return {
      source: 'map',
      points: points.map(({ origin, ...point }) => ({
        ...point,
        ...(origin === 'leader_adult' ? { origin } : {}),
        snippet: point.label || '',
      })),
      truncated: body.truncated === true,
      basisFingerprint: typeof body.basisFingerprint === 'string' ? body.basisFingerprint : '',
      meta: null,
    };
  }

  async function ensureSphere(token) {
    if (sphere && sphere.slug === person.slug) return;
    if (sphere) sphere.stop();
    sphere = null;
    signature = '';
    sphereRoot.replaceChildren();
    const api = await mountSphere(sphereRoot, sphereRoot, {
      accent: person.accent,
      layout: person.layout,
      colorMode: 'kind',
      reduced,
    });
    if (token !== sphereToken) {
      api?.stop();
      return;
    }
    if (!api) {
      say('sphere를 그리지 못했습니다.');
      return;
    }
    api.slug = person.slug;
    sphere = api;
  }

  function render() {
    const view = filtered();
    if (!diffTouched) {
      const range = bounds();
      diffA = range.from == null ? '' : inputDay(range.from);
      diffB = range.to == null ? inputDay(range.to) : inputDay(range.to);
      if (!diffA || !diffB) {
        const dated = view.points.map((point) => Date.parse(point.createdAt)).filter(Number.isFinite);
        if (dated.length) {
          diffA = diffA || inputDay(Math.min(...dated));
          diffB = diffB || inputDay(Math.max(...dated));
        }
      }
    }
    if (tab === 'diff') renderDiff(view);
    else if (tab === 'regions') renderRegions(view);
    else if (tab === 'daily') renderDaily(view);
    else renderTimelapse(view);
    const extra = [];
    if (view.undated && bounds().from != null) extra.push(`시각 없는 memory ${view.undated}`);
    if (cached?.truncated) extra.push('응답이 잘려 일부 memory만 있습니다');
    const count = cached
      ? `${cached.source === 'history' ? 'history' : 'map'} ${cached.points.length}`
      : status.textContent.split(' · ')[0];
    say([count, ...extra].filter(Boolean).join(' · '));
  }

  function captions() {
    if (!cached) return [];
    if (cached.source !== 'history') {
      return [
        'history를 불러오지 못해 memory map을 표시합니다.',
        'reflection은 이 map에 없습니다.',
      ];
    }
    const meta = cached.meta || {};
    const lines = [];
    if (meta.removedSupported === false) lines.push('삭제 이력은 knowledge archive만 지원합니다.');
    if (meta.weakeningSupported === 'current') {
      lines.push('약화는 현재 strength, weight, decay만 있습니다.');
    }
    if (meta.snapshotsSupported === false) lines.push('snapshots는 현재 값입니다.');
    return lines;
  }

  function renderTimelapse(view) {
    const points = view.points;
    if (!Number.isFinite(cursor) || cursor > points.length) cursor = points.length;
    const notes = [
      'created_at 순서로 memory가 나타납니다.',
      bounds().swapped ? '기간을 바꿔 적용했습니다.' : '',
      mobileQuery.matches && points.length > 480 ? '작은 화면의 sphere는 최근 480 memory만 그립니다.' : '',
      ...captions(),
    ].filter(Boolean);
    panel.replaceChildren(timelapseControls(points, notes));
    syncSphere(points, { cutoff: cursor, marks: null, mode: 'time' });
  }

  function timelapseControls(points, notes) {
    const wrap = document.createElement('div');
    wrap.className = 'brain-tools';
    const row = document.createElement('div');
    row.className = 'brain-row';
    const play = document.createElement('button');
    play.type = 'button';
    play.id = 'brain-play';
    play.textContent = playing ? '일시정지' : '재생';
    play.setAttribute('aria-pressed', playing ? 'true' : 'false');
    play.disabled = points.length === 0;
    play.addEventListener('click', () => {
      if (playing) stopPlay();
      else startPlay(points.length);
      render();
    });
    row.append(play);
    for (const value of SPEEDS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${value}×`;
      button.setAttribute('aria-pressed', speed === value ? 'true' : 'false');
      button.addEventListener('click', () => {
        speed = value;
        if (playing) startPlay(points.length, cursor);
        render();
      });
      row.append(button);
    }
    const date = document.createElement('p');
    date.className = 'brain-date';
    date.textContent = currentDate(points);
    const scrub = document.createElement('input');
    scrub.type = 'range';
    scrub.min = '0';
    scrub.max = String(Math.max(points.length, 1));
    scrub.value = String(Math.min(cursor, points.length));
    scrub.disabled = points.length === 0;
    scrub.setAttribute('aria-label', '날짜');
    scrub.addEventListener('input', () => {
      stopPlay();
      cursor = Number(scrub.value);
      date.textContent = currentDate(points);
      play.textContent = '재생';
      play.setAttribute('aria-pressed', 'false');
      if (sphere) sphere.setCutoff(cursor);
      const count = wrap.querySelector('.brain-count');
      if (count) count.textContent = `${cursor} / ${points.length} memory`;
    });
    const count = document.createElement('p');
    count.className = 'brain-count';
    count.textContent = points.length ? `${cursor} / ${points.length} memory` : '이 범위에 memory가 없습니다.';
    wrap.append(row, date, scrub, count, ...notes.map(note));
    return wrap;
  }

  function note(text) {
    const p = document.createElement('p');
    p.className = 'brain-note';
    p.textContent = text;
    return p;
  }

  function currentDate(points) {
    if (!points.length || cursor <= 0) return '시작 전';
    const point = points[Math.min(cursor, points.length) - 1];
    const ms = Date.parse(point?.createdAt);
    return Number.isFinite(ms) ? formatStamp(ms) : '시각 없음';
  }

  function startPlay(length, from = cursor >= length ? 0 : cursor) {
    stopPlay();
    if (!length) return;
    playing = true;
    playFrom = from;
    cursor = from;
    playStart = performance.now();
    const tick = (now) => {
      if (!playing) return;
      const duration = PLAY_MS / speed;
      const t = Math.min(1, (now - playStart) / duration);
      cursor = playFrom + Math.round(t * (length - playFrom));
      if (sphere) sphere.setCutoff(cursor);
      const scrub = panel.querySelector('input[type="range"]');
      const date = panel.querySelector('.brain-date');
      const count = panel.querySelector('.brain-count');
      const play = panel.querySelector('#brain-play');
      if (scrub) scrub.value = String(cursor);
      if (date) date.textContent = currentDate(filtered().points);
      if (count) count.textContent = `${cursor} / ${length} memory`;
      if (t >= 1) {
        playing = false;
        if (play) {
          play.textContent = '재생';
          play.setAttribute('aria-pressed', 'false');
        }
        return;
      }
      playFrame = requestAnimationFrame(tick);
    };
    playFrame = requestAnimationFrame(tick);
  }

  function stopPlay() {
    playing = false;
    if (playFrame) cancelAnimationFrame(playFrame);
    playFrame = 0;
  }

  function renderDiff() {
    const diff = diffMemories(mapPoints(), diffA, diffB);
    const wrap = document.createElement('div');
    wrap.className = 'brain-tools';
    const form = document.createElement('form');
    form.className = 'brain-row';
    form.append(
      labeledDate('날짜 A', 'brain-diff-a', diffA),
      labeledDate('날짜 B', 'brain-diff-b', diffB)
    );
    const apply = document.createElement('button');
    apply.type = 'submit';
    apply.textContent = '적용';
    form.append(apply);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      diffTouched = true;
      diffA = form.querySelector('#brain-diff-a').value;
      diffB = form.querySelector('#brain-diff-b').value;
      signature = '';
      render();
    });
    const lines = [
      diff.swapped ? '날짜 A와 B를 바꿔 비교합니다.' : '',
      ...captions(),
      diff.weakened.length ? '약해진 memory는 현재 값 기준입니다.' : '',
      diff.additionsOnly ? '추가된 memory만 표시합니다.' : '',
    ].filter(Boolean);
    wrap.append(form, ...lines.map(note));
    wrap.append(listBlock(`추가 ${diff.added.length}`, diff.added));
    wrap.append(listBlock(`약해짐 ${diff.weakened.length}`, diff.weakened));
    wrap.append(listBlock(`삭제 ${diff.removed.length}`, diff.removed));
    panel.replaceChildren(wrap);
    const drawn = drawable([...diff.present, ...diff.removed]);
    syncSphere(drawn, {
      cutoff: drawn.length,
      marks: {
        added: new Set(diff.added.map((point) => point.id)),
        weakened: new Set(diff.weakened.map((point) => point.id)),
        removed: new Set(diff.removed.map((point) => point.id)),
      },
      mode: 'diff',
    });
  }

  function labeledDate(label, id, value) {
    const field = document.createElement('label');
    field.className = 'brain-field';
    field.textContent = label;
    const input = document.createElement('input');
    input.type = 'date';
    input.id = id;
    input.value = value || '';
    field.append(input);
    return field;
  }

  function renderRegions(view) {
    const model = regionModel(view.points, bounds());
    const wrap = document.createElement('div');
    wrap.className = 'brain-tools';
    wrap.append(
      note(
        model.stepDays > 1
          ? `${model.stepDays}일 단위로 묶은 kind별 memory 수입니다.`
          : '날짜별 kind memory 수입니다. 면은 누적입니다.'
      ),
      ...captions().map(note)
    );
    if (!model.buckets.length) {
      wrap.append(note('이 범위에 memory가 없습니다.'));
    } else {
      wrap.append(chart(model));
      wrap.append(density(model));
    }
    panel.replaceChildren(wrap);
    syncSphere(view.points, { cutoff: view.points.length, marks: null, mode: 'region' });
  }

  function chart(model) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 640 240');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'kind counts');
    svg.classList.add('brain-chart');
    const width = 640;
    const height = 240;
    const pad = { l: 36, r: 12, t: 16, b: 32 };
    const max = model.max || 1;
    const n = model.buckets.length;
    const x = (index) =>
      n === 1 ? (pad.l + width - pad.r) / 2 : pad.l + (index / (n - 1)) * (width - pad.l - pad.r);
    const y = (value) => pad.t + (1 - value / max) * (height - pad.t - pad.b);
    let base = model.buckets.map(() => 0);
    for (const kind of model.kinds) {
      const top = model.buckets.map((bucket, index) => base[index] + bucket.cumulative[kind]);
      const forward = top.map((value, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(value).toFixed(1)}`);
      const back = base.map((value, index) => `L${x(n - 1 - index).toFixed(1)},${y(base[n - 1 - index]).toFixed(1)}`);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `${forward.join(' ')} ${back.join(' ')} Z`);
      path.setAttribute('fill', memoryKindCss(person.accent, kind, person.layout));
      path.setAttribute('fill-opacity', '0.78');
      svg.append(path);
      base = top;
    }
    const axis = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    axis.setAttribute('x', String(pad.l));
    axis.setAttribute('y', String(height - 8));
    axis.setAttribute('fill', 'rgba(255,255,255,0.5)');
    axis.setAttribute('font-size', '12');
    axis.textContent = formatDay(model.buckets[0].start);
    const end = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    end.setAttribute('x', String(width - pad.r));
    end.setAttribute('y', String(height - 8));
    end.setAttribute('text-anchor', 'end');
    end.setAttribute('fill', 'rgba(255,255,255,0.5)');
    end.setAttribute('font-size', '12');
    end.textContent = formatDay(model.buckets[n - 1].start);
    const baseline = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    baseline.setAttribute('x1', x(0).toFixed(1));
    baseline.setAttribute('x2', x(n - 1).toFixed(1));
    baseline.setAttribute('y1', y(0).toFixed(1));
    baseline.setAttribute('y2', y(0).toFixed(1));
    baseline.setAttribute('stroke', 'rgba(255,255,255,0.28)');
    svg.append(baseline, axis, end);
    return svg;
  }

  function density(model) {
    const total = Object.values(model.totals).reduce((sum, value) => sum + value, 0) || 1;
    const list = document.createElement('ul');
    list.className = 'brain-density';
    for (const kind of model.kinds) {
      const count = model.totals[kind] || 0;
      const item = document.createElement('li');
      const swatch = document.createElement('i');
      swatch.style.background = memoryKindCss(person.accent, kind, person.layout);
      const name = document.createElement('span');
      name.textContent = kind;
      const meta = document.createElement('span');
      meta.textContent = `${count} · ${Math.round((count / total) * 100)}%`;
      const bar = document.createElement('span');
      bar.className = 'brain-meter';
      const fill = document.createElement('span');
      fill.style.width = `${Math.max(2, (count / total) * 100)}%`;
      fill.style.background = memoryKindCss(person.accent, kind, person.layout);
      bar.append(fill);
      item.append(swatch, name, meta, bar);
      list.append(item);
    }
    return list;
  }

  function renderDaily(view) {
    const summary = summarizeDays(view.points, bounds());
    const wrap = document.createElement('div');
    wrap.className = 'brain-tools';
    const lines = [
      'knowledge, reflection, pattern, experience로 나눕니다.',
      ...captions(),
      summary.omittedEmpty ? '긴 범위에서는 memory가 있는 날만 보여 줍니다.' : '',
      summary.undated ? `시각 없는 memory ${summary.undated}` : '',
    ].filter(Boolean);
    wrap.append(...lines.map(note));
    if (!summary.cards.length) wrap.append(note('이 범위에 memory가 없습니다.'));
    for (const card of summary.cards) {
      const article = document.createElement('article');
      article.className = 'brain-day';
      const head = document.createElement('header');
      const time = document.createElement('time');
      time.dateTime = new Date(card.day).toISOString();
      time.textContent = formatDay(card.day);
      const count = document.createElement('span');
      count.textContent = `${card.count} memory`;
      head.append(time, count);
      article.append(head);
      for (const section of card.sections) {
        article.append(sectionBlock(SECTION_LABEL[section.id], section.items));
      }
      for (const group of card.extra) article.append(sectionBlock(group.kind, group.items));
      wrap.append(article);
    }
    panel.replaceChildren(wrap);
    syncSphere(view.points, { cutoff: view.points.length, marks: null, mode: 'daily' });
  }

  function sectionBlock(label, items) {
    const section = document.createElement('section');
    const title = document.createElement('h3');
    title.textContent = `${label} ${items.length}`;
    section.append(title);
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'brain-empty';
      empty.textContent = '없음';
      section.append(empty);
      return section;
    }
    section.append(pointList(items));
    return section;
  }

  function listBlock(label, items) {
    const section = document.createElement('section');
    const title = document.createElement('h3');
    title.textContent = label;
    section.append(title);
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'brain-empty';
      empty.textContent = '없음';
      section.append(empty);
      return section;
    }
    section.append(pointList(items));
    return section;
  }

  function pointList(items) {
    const list = document.createElement('ul');
    list.className = 'brain-points';
    for (const point of items.slice(0, LIST_CAP)) list.append(pointItem(point));
    if (items.length > LIST_CAP) {
      const more = document.createElement('li');
      more.className = 'brain-more';
      more.textContent = `외 ${items.length - LIST_CAP}`;
      list.append(more);
    }
    return list;
  }

  function pointItem(point) {
    const item = document.createElement('li');
    const kind = document.createElement('span');
    kind.className = 'brain-kind';
    kind.textContent = point.kind || '';
    const label = document.createElement('span');
    label.textContent = point.snippet || point.label || point.id || '';
    item.append(kind);
    if (point.origin === 'leader_adult') {
      const badge = document.createElement('span');
      badge.className = 'brain-badge';
      badge.textContent = ADULT_MEMORY_BADGE;
      item.append(badge);
    }
    item.append(label);
    const href = safeHttpUrl(point.url);
    if (href) {
      const link = document.createElement('a');
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'link';
      item.append(link);
    }
    const metrics = ['weight', 'strength', 'decay'].filter((key) => typeof point[key] === 'number');
    const bits = metrics.map((key) => `${key} ${point[key]}`);
    if (point.removedAt) bits.push(`removedAt ${point.removedAt.slice(0, 10)}`);
    if (bits.length) {
      const meta = document.createElement('span');
      meta.className = 'brain-meta';
      meta.textContent = bits.join(' · ');
      item.append(meta);
    }
    return item;
  }

  function drawable(points) {
    const seen = new Set();
    const out = [];
    for (const point of points) {
      if (!point || seen.has(point.id)) continue;
      if (![point.x, point.y, point.z].every((value) => typeof value === 'number' && Number.isFinite(value))) {
        continue;
      }
      seen.add(point.id);
      out.push(point);
    }
    return out;
  }

  function syncSphere(points, options) {
    if (!sphere) return;
    const placed = drawable(points);
    points = placed;
    const next = `${person.slug}|${options.mode}|${points.map((point) => point.id).join(',')}|${options.marks ? 'm' : ''}`;
    sphere.setMarks(options.marks);
    if (next !== signature) {
      signature = next;
      sphere.setMap({
        points,
        basisFingerprint: cached?.basisFingerprint || person.slug,
        cutoff: options.cutoff,
      });
      return;
    }
    sphere.setCutoff(options.cutoff);
  }

  function inputDay(ms) {
    const date = new Date(ms);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

  void (async () => {
    try {
      const response = await fetch('/api/world/auth/session', {
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
      });
      if (response.status === 503) {
        say('연결할 수 없습니다.');
        return;
      }
      const body = await response.json().catch(() => ({}));
      if (!body.signedIn) {
        location.replace('/login');
        return;
      }
      await refresh();
    } catch {
      say('연결할 수 없습니다.');
    }
  })();
}
