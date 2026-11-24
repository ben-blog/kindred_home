import { adminCopy as copy, adminMessage, relativeTime } from '../lib/admin-copy.js';
import { bandOf, gaugeBands } from '../lib/world/gauge.js';
import { bindWarmth } from './warmth.js';

const $ = (selector) => document.querySelector(selector);
const people = JSON.parse($('#characters').dataset.characters);
const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const nameOf = (slug) =>
  people.find((person) => person.slug === slug)?.name ??
  (slug === world?.leaderSlug ? 'Ben' : slug);
let world;
let busy = false;
let refreshId = 0;
let retryAction = () => refresh();
function error(message, retry = () => refresh()) {
  $('#error-bar').hidden = false;
  $('[data-admin-message]').textContent = message;
  retryAction = retry;
}
async function read(url, init) {
  const response = await fetch(url, init);
  if ([401, 403].includes(response.status)) location.replace('/login?next=/world/admin');
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}
const delta = (now, next) => `${now} → <span class="${now !== next ? 'up' : ''}">${next}</span>`;
function gauge(kind, value, next, rules) {
  const max = rules[kind === 'mood' ? 'moodMax' : 'energyMax'];
  const bands = gaugeBands(kind, rules);
  return `<div class="gauge"><div class="g-head"><span class="g-label">${kind} · ${kind === 'mood' ? '기분' : '기운'}</span><span class="g-value">${value} <small>/ ${max} · ${bandOf(kind, value, rules)}</small></span></div>
    <div class="cells" role="img" aria-label="${kind} ${value}/${max}${next == null ? '' : `, tick 후 ${next}`}" style="grid-template-columns:repeat(${max},1fr)">${Array.from({ length: max }, (_, i) => `<i class="cell ${i < value ? (next != null && i >= next ? 'next' : 'on') : next != null && i < next ? 'next' : ''}"></i>`).join('')}</div>
    <div class="bands" style="grid-template-columns:${bands.map((b) => Math.max(1, b.max - Math.max(1, b.min) + 1) + 'fr').join(' ')}">${bands.map((b) => `<span class="${value >= b.min && value <= b.max ? 'cur' : ''}">${b.min}–${b.max} ${b.label}</span>`).join('')}</div></div>`;
}
function renderWorld(view) {
  world = view;
  const total = Object.values(view.pendingWarmth ?? {}).reduce((a, b) => a + b, 0);
  const known = !!view.next;
  $('#world-status').className = 'status loaded';
  $('#world-status').innerHTML =
    `<span class="dot"></span><b>Tick ${view.tick}</b> · warmth ${known ? total : '—'} 대기 · 이벤트 ${known ? view.pending : '—'}개`;
  $('#tick-preview').innerHTML = people
    .filter((p) => view.characters[p.slug])
    .map((p) => {
      const current = view.characters[p.slug],
        next = view.next?.[p.slug];
      return `<li><span class="n" style="color:${p.color}">${escape(p.name)}</span>${next ? `mood ${delta(current.mood, next.mood)} · energy ${delta(current.energy, next.energy)}<span class="lv"> · Lv ${delta(current.level, next.level)}</span>` : copy.previewFail}</li>`;
    })
    .join('');
  $('#empty-warmth').textContent =
    known && !total ? adminMessage(copy.noWarmth, { decay: view.rules.energyIdleDecay }) : '';
  for (const p of people) {
    const card = document.querySelector(`[data-character="${p.slug}"]`),
      current = view.characters[p.slug];
    if (!current) {
      card.hidden = true;
      continue;
    }
    const next = view.next?.[p.slug];
    card.querySelector('.face').hidden = current.energy > 2;
    card.querySelector('.where').textContent = current.location;
    card.querySelector('[data-gauges]').innerHTML =
      gauge('mood', current.mood, next?.mood, view.rules) +
      gauge('energy', current.energy, next?.energy, view.rules);
    const progress = ((current.xp % view.rules.xpPerLevel) / view.rules.xpPerLevel) * 100;
    const forecast = next
      ? Math.min(100, progress + ((next.xp - current.xp) / view.rules.xpPerLevel) * 100)
      : progress;
    card.querySelector('[data-xp]').innerHTML =
      `<span>Lv ${current.level}</span><span class="track"><i style="width:${progress}%"></i><u style="left:${progress}%;width:${forecast - progress}%"></u></span><span>xp ${current.xp}${next ? ` → ${next.xp}` : ''}</span>`;
    card.querySelector('[data-pending]').innerHTML =
      `warmth <b>${known ? (view.pendingWarmth[p.slug] ?? 0) : '—'}</b> 대기 중 · tick 때 반영`;
    const note = card.querySelector('[data-warmth-note]');
    if (!note.classList.contains('is-on')) {
      note.textContent = view.lastWarmthAt?.[p.slug]
        ? `마지막 warmth · ${relativeTime(view.lastWarmthAt[p.slug])}`
        : '';
      note.hidden = !note.textContent;
    }
    const warmth = card.querySelector('[data-warmth] button');
    if (!warmth.dataset.waitUntil && !warmth.dataset.sending) warmth.disabled = false;
  }
  $('#rule-note').textContent =
    `mood는 한 tick에 warmth ${view.rules.moodThreshold} 이상이면 +1, energy는 warmth 없으면 tick마다 −${view.rules.energyIdleDecay}`;
  $('#bonds').innerHTML = view.relations
    .map(
      (r) =>
        `<span class="chip">${escape(nameOf(r.from))} × ${escape(nameOf(r.to))} · ${escape(r.kinds.includes('썸') ? '썸' : r.kinds.filter((k) => k !== 'leader').join(', '))} · strength ${r.strength}${r.tension == null ? '' : ` · tension ${r.tension}`}</span>`
    )
    .join('');
  const summaries = people
    .filter((p) => view.next?.[p.slug])
    .map((p) => {
      const c = view.characters[p.slug],
        n = view.next[p.slug];
      return {
        name: escape(p.name),
        values: `mood ${c.mood}→${n.mood} · energy ${c.energy}→${n.energy}`,
      };
    });
  const summary =
    new Set(summaries.map((s) => s.values)).size === 1
      ? summaries[0].values
      : summaries.map((s) => `${s.name} ${s.values}`).join('<br>');
  $('#mobile-summary').innerHTML =
    `Tick ${view.tick} · warmth ${known ? total : '—'} 대기<br><span class="up">${known ? `누르면 ${summary}` : copy.previewFail}</span>`;
  document.querySelectorAll('[data-tick]').forEach((button) => {
    button.disabled = busy || !known;
    button.textContent = busy
      ? copy.tickRunning
      : `Tick 진행${button.closest('.mobile-tick') ? '' : ` → ${view.tick + 1}`}`;
  });
  $('#updated-at').textContent =
    new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date()) + ' KST 기준';
  if (!known) error(copy.previewFail);
}
function renderQueue(rows) {
  const queue = rows
    .filter((r) => ['drafted', 'generated'].includes(r.status))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  $('#queue-count').textContent = `${queue.length}건 · 오래된 순`;
  $('#review-queue').innerHTML = queue.length
    ? queue
        .map(
          (row) => `<li data-item="${escape(row.id)}">
    <div class="thumb">${row.ready ? `<img src="/api/world/album/${encodeURIComponent(row.id)}/file" alt="" loading="lazy">` : ''}</div>
    <div><div class="t">${escape(row.caption?.ko?.title || row.caption?.en?.title || copy.untitled)}</div><div class="m"><span class="tag ${row.status === 'generated' ? 'ready' : ''}">${row.status}</span>${escape(nameOf(row.character))} · ${row.status === 'generated' ? copy.captionReady : copy.captionDraft} · ${relativeTime(row.createdAt)}</div></div>
    <div class="acts"><a class="btn small ghost" href="/world/admin/album?id=${encodeURIComponent(row.id)}">${row.status === 'generated' ? copy.review : copy.captionCreate}</a>${row.status === 'generated' ? `<button class="btn small" data-publish>${copy.publish}</button>` : ''}<button class="btn small ghost" data-reject>${copy.reject}</button></div>
    <form class="reject-row" hidden><input aria-label="거절 이유" maxlength="500" placeholder="거절 이유"><button class="btn small" type="submit">${copy.rejectConfirm}</button></form></li>`
        )
        .join('')
    : `<li>${copy.noReview}</li>`;
}
async function refresh() {
  const id = ++refreshId;
  const results = await Promise.allSettled([read('/api/world'), read('/api/world/album')]);
  if (id !== refreshId) return false;
  $('#error-bar').hidden = true;
  if (results[0].status === 'fulfilled') renderWorld(results[0].value);
  else {
    $('#world-status').className = 'status failed';
    $('#world-status').innerHTML = '<span class="dot"></span>연결 실패';
    document.querySelectorAll('[data-tick], [data-warmth] button').forEach((b) => {
      b.disabled = true;
    });
    error(adminMessage(copy.worldFail, { status: results[0].reason.message }));
  }
  if (results[1].status === 'fulfilled') renderQueue(results[1].value.submissions ?? []);
  else error(adminMessage(copy.fail, { detail: `앨범 목록 (${results[1].reason.message})` }));
  return results[0].status === 'fulfilled';
}
async function tick() {
  if (busy) return;
  busy = true;
  document.querySelectorAll('[data-tick]').forEach((b) => {
    b.disabled = true;
  });
  $('#action-status').textContent = copy.tickRunning;
  let failure;
  try {
    await read('/api/world/tick', { method: 'POST' });
    document.querySelectorAll('[data-character] [data-warmth-note]').forEach((note) => {
      note.classList.remove('is-on');
      note.hidden = true;
    });
  } catch (e) {
    failure =
      e.message === '409' ? copy.tickBusy : adminMessage(copy.tickFail, { status: e.message });
  }
  busy = false;
  const refreshed = await refresh();
  if (failure) {
    $('#action-status').textContent = '';
    error(failure, tick);
  } else if (refreshed)
    $('#action-status').textContent =
      `Tick ${world.tick} 완료 · ` +
      people
        .filter((p) => world.characters[p.slug])
        .map(
          (p) =>
            `${p.name} mood ${world.characters[p.slug].mood}, energy ${world.characters[p.slug].energy}`
        )
        .join(' · ');
  else $('#action-status').textContent = 'tick 요청 완료 · 최신 상태를 다시 불러와 주세요.';
}
async function albumAction(id, action, reason) {
  if (busy) return;
  if (action === 'publish' && !confirm(copy.confirmPublish)) return;
  busy = true;
  $('#action-status').textContent = action === 'publish' ? copy.publishing : copy.saving;
  let failure;
  try {
    await read(`/api/world/album/${encodeURIComponent(id)}/${action}`, {
      method: 'POST',
      ...(reason
        ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason }) }
        : {}),
    });
    $('#action-status').textContent = action === 'publish' ? copy.published : copy.rejected;
  } catch (e) {
    failure = adminMessage(copy.fail, { detail: e.message });
    $('#action-status').textContent = '';
  }
  busy = false;
  await refresh();
  if (failure) error(failure);
}
$('#retry').addEventListener('click', () => retryAction());
document.querySelectorAll('[data-tick]').forEach((b) => b.addEventListener('click', tick));
$('#review-queue').addEventListener('click', (event) => {
  const row = event.target.closest('[data-item]');
  if (!row) return;
  if (event.target.closest('[data-publish]')) albumAction(row.dataset.item, 'publish');
  if (event.target.closest('[data-reject]')) {
    row.querySelector('form').hidden = false;
    row.querySelector('input').focus();
  }
});
$('#review-queue').addEventListener('submit', (event) => {
  event.preventDefault();
  const reason = event.target.querySelector('input').value.trim();
  if (!reason) {
    error(copy.reasonRequired);
    return;
  }
  albumAction(event.target.closest('[data-item]').dataset.item, 'reject', reason);
});
bindWarmth(document);
document.addEventListener('warmth:sent', () => refresh());
document.addEventListener('warmth:failed', () => error(copy.warmthFail));
await refresh();
await Promise.allSettled(
  people.map(async (p) => {
    const response = await fetch(`/api/gallery/${p.slug}/pick`);
    if (!response.ok) return;
    const pick = await response.json();
    const chip = document.createElement('a');
    chip.className = 'chip';
    chip.href = p.gallery || `/characters/${p.slug}`;
    chip.textContent = `${p.name} 오늘의 pick · ${pick.source === 'agent' && pick.date ? pick.date.slice(5).replace('-', '/') + ' 완료' : '아직'}`;
    $('#gallery-chips').prepend(chip);
    const index = document.createElement('a');
    index.className = 'chip';
    index.href = `${p.gallery || `/characters/${p.slug}`}#index`;
    index.textContent = `${p.name} index 격자`;
    $('#gallery-chips').append(index);
  })
);
