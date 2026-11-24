import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { loadCanon } from '../../world/load.js';
import { createState } from '../../world/state.js';
import { reduceTick, leaderTickEvent } from './world/pipeline.js';
import { publicState } from './world/present.js';

// Exercise the shipped controller against a minimal DOM and real reducer responses.
class Node {
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.listeners = {};
    this.nodes = {};
    this.textContent = '';
    this.innerHTML = '';
    this.hidden = false;
    this.disabled = false;
    this.classes = new Set();
    this.classList = {
      contains: (key) => this.classes.has(key),
      add: (key) => this.classes.add(key),
    };
  }
  querySelector(key) {
    return this.nodes[key];
  }
  querySelectorAll() {
    return [];
  }
  closest() {
    return null;
  }
  addEventListener(key, fn) {
    this.listeners[key] = fn;
  }
  dispatchEvent(event) {
    return this.listeners[event.type]?.(event);
  }
  append() {}
  prepend() {}
  focus() {}
}
const settle = async () => {
  for (let i = 0; i < 12; i++) await new Promise((resolve) => setImmediate(resolve));
};

test('hub loads reducer preview, confirms saved-caption publish, rejects with reason, and refreshes after tick/warmth', async () => {
  const canon = loadCanon();
  let state = createState(canon);
  state.tick = 3;
  for (const c of Object.values(state.characters)) {
    c.energy = 2;
    c.mood = 2;
  }
  let records = [];
  for (const [target, amounts] of [
    ['dred', [5, 5, 3]],
    ['kin', [5, 5]],
  ]) {
    for (const amount of amounts)
      records.push({
        id: `e${records.length}`,
        seq: records.length + 1,
        worldId: state.worldId,
        at: '2026-11-24T08:00:00Z',
        who: 'visitor:fixture',
        what: 'influence',
        source: 'visitor-influence',
        target,
        payload: { kind: 'warmth', amount },
      });
  }
  const people = canon.characters.map((p) => ({
    slug: p.slug,
    name: p.name.en,
    color: p.identity.color,
  }));
  const nodes = new Map();
  const node = (key) => {
    if (!nodes.has(key)) nodes.set(key, new Node());
    return nodes.get(key);
  };
  node('#characters').dataset.characters = JSON.stringify(people);
  const ticks = [new Node(), new Node()];
  ticks[1].closest = () => new Node();
  const controls = people.map((p) => {
    const card = node(`[data-character="${p.slug}"]`);
    for (const key of [
      '.face',
      '.where',
      '[data-gauges]',
      '[data-xp]',
      '[data-pending]',
      '[data-warmth-note]',
      '[data-warmth] button',
    ])
      card.nodes[key] = new Node();
    const control = new Node({
      warmth: p.slug,
      noteSent: '보냄 · 다음 tick에 반영',
      noteWait: 'Warmth · {minutes}분 뒤',
      noteFail: 'warmth를 못 보냈습니다. 다시 시도',
    });
    control.nodes.button = card.nodes['[data-warmth] button'];
    control.closest = () => card;
    control.dispatchEvent = (event) => document.listeners[event.type]?.(event);
    return control;
  });
  const document = new Node();
  document.querySelector = node;
  document.querySelectorAll = (key) =>
    key === '[data-warmth]' ? controls : key.includes('data-tick') ? ticks : [];
  document.createElement = () => new Node();
  globalThis.document = document;
  globalThis.location = { pathname: '/world/admin', replace: () => {} };
  const calls = [];
  let allowPublish = false;
  const dialogs = [];
  globalThis.confirm = (message) => {
    dialogs.push(message);
    return allowPublish;
  };
  let rows = [
    {
      id: 'photo',
      status: 'generated',
      character: 'dred',
      createdAt: '2026-11-24T07:00:00Z',
      caption: { ko: { title: '<safe title>' } },
    },
  ];
  const view = () =>
    publicState(state, {
      preview: reduceTick(state, records, leaderTickEvent(state, 'preview', '2026-11-24T08:00:00Z'))
        .state,
    });
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, ...init });
    if (url === '/api/world') return Response.json(view());
    if (url === '/api/world/album') return Response.json({ submissions: rows });
    if (url === '/api/world/tick') {
      state = reduceTick(
        state,
        records,
        leaderTickEvent(state, `tick${state.tick}`, '2026-11-24T08:00:00Z')
      ).state;
      records = [];
      return Response.json({ tick: state.tick });
    }
    if (url === '/api/world/signal') {
      records.push({
        id: 'warmth',
        seq: 99,
        worldId: state.worldId,
        at: '2026-11-24T08:01:00Z',
        who: 'visitor:fixture',
        what: 'influence',
        source: 'visitor-influence',
        target: JSON.parse(init.body).target,
        payload: { kind: 'warmth', amount: 1 },
      });
      return Response.json({ ok: true });
    }
    if (url.endsWith('/publish') || url.endsWith('/reject')) {
      rows = [];
      return Response.json({ ok: true });
    }
    return new Response('{}', { status: 404 });
  };
  await import('../scripts/admin-hub.js');
  assert.match(node('#world-status').innerHTML, /warmth 23 대기/);
  assert.match(node('#tick-preview').innerHTML, /mood 2 → .*3/);
  assert.match(node('#tick-preview').innerHTML, /energy 2 → .*10/);
  assert.match(node('#review-queue').innerHTML, /&lt;safe title&gt;/);
  assert.equal(ticks[0].disabled, false);
  const row = new Node({ item: 'photo' });
  const reason = new Node();
  const form = new Node();
  form.nodes.input = reason;
  row.nodes.form = form;
  row.nodes.input = reason;
  const target = {
    closest: (key) => (key === '[data-item]' ? row : key === '[data-publish]' ? {} : null),
  };
  document.querySelector('#review-queue').listeners.click({ target });
  await settle();
  assert.equal(dialogs[0], '게시하면 갤러리에 바로 보입니다. 게시할까요?');
  assert.equal(
    calls.some((c) => c.url.endsWith('/publish')),
    false
  );
  allowPublish = true;
  document.querySelector('#review-queue').listeners.click({ target });
  await settle();
  const publish = calls.find((c) => c.url.endsWith('/publish'));
  assert.equal(publish.method, 'POST');
  assert.equal(publish.body, undefined);
  assert.match(node('#review-queue').innerHTML, /검토할 사진이 없습니다/);
  form.closest = () => row;
  reason.value = '  ';
  node('#review-queue').listeners.submit({ preventDefault() {}, target: form });
  assert.equal(node('[data-admin-message]').textContent, '거절 이유를 적어 주세요');
  assert.equal(
    calls.some((c) => c.url.endsWith('/reject')),
    false
  );
  reason.value = '톤을 다시 보고 싶어';
  node('#review-queue').listeners.submit({ preventDefault() {}, target: form });
  await settle();
  assert.deepEqual(JSON.parse(calls.find((c) => c.url.endsWith('/reject')).body), {
    reason: reason.value,
  });
  await ticks[0].listeners.click();
  assert.equal(state.tick, 4);
  assert.equal(state.characters.dred.xp, 13);
  assert.match(node('#action-status').textContent, /Tick 4 완료/);
  const previousMood = state.characters.dred.mood;
  controls[0].nodes.button.listeners.click();
  await settle();
  assert.equal(state.characters.dred.mood, previousMood);
  assert.match(node('#world-status').innerHTML, /warmth 1 대기/);
  assert.equal(
    node('[data-character="dred"]').nodes['[data-warmth-note]'].textContent,
    '보냄 · 다음 tick에 반영'
  );
  const source = readFileSync(new URL('../scripts/warmth.js', import.meta.url), 'utf8');
  assert.ok(source.includes("const NOTE = '+1 warmth, applied at next tick'"));
});
