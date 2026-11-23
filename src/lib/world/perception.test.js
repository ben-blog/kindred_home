import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCanon } from '../../../world/load.js';
import { createState } from '../../../world/state.js';
import { step } from '../../../world/step.js';
import { createWorldStore } from './store.js';
import {
  DAILY_CHAT_GRANT,
  dailyGrantEvent,
  dailyGrantId,
  kstDateKey,
  perceiveChat,
  sealWorldState,
} from './perception.js';

const canon = loadCanon();

function memoryStore(snapshot = null) {
  const events = [];
  return {
    events,
    async latest() {
      return snapshot;
    },
    async findEvent(id) {
      return events.find((event) => event.id === id) ?? null;
    },
    async listPendingInfluence(worldId, target, afterSeq) {
      return events.filter(
        (event) =>
          event.worldId === worldId &&
          event.what === 'influence' &&
          event.target === target &&
          Number(event.seq) > afterSeq
      );
    },
    async append(event) {
      if (events.some((item) => item.id === event.id)) return { ok: true, duplicate: true };
      const seq = events.reduce((max, item) => Math.max(max, Number(item.seq) || 0), 0) + 1;
      events.push({ ...event, seq });
      return { ok: true, duplicate: false };
    },
  };
}

test('the Seoul calendar day changes at 15:00 UTC', () => {
  assert.equal(kstDateKey(new Date('2026-11-22T14:59:59.000Z')), '2026-11-22');
  assert.equal(kstDateKey(new Date('2026-11-22T15:00:00.000Z')), '2026-11-23');
  const early = dailyGrantId('kinxdred', 'kin', new Date('2026-11-22T14:59:59.000Z'));
  const late = dailyGrantId('kinxdred', 'kin', new Date('2026-11-22T15:00:00.000Z'));
  assert.equal(early, 'ben-chat-daily:kinxdred:kin:2026-11-22');
  assert.equal(late, 'ben-chat-daily:kinxdred:kin:2026-11-23');
  assert.notEqual(early, late);
});

test('the unchanged reducer applies the daily grant on the next tick', () => {
  const start = createState(canon);
  const now = new Date('2026-11-22T16:30:00.000Z');
  const event = dailyGrantEvent({
    id: dailyGrantId(start.worldId, 'kin', now),
    worldId: start.worldId,
    slug: 'kin',
    leaderSlug: start.leaderSlug,
    amount: 2,
    now,
  });
  const next = step(start, [
    event,
    {
      id: 'tick-1',
      worldId: start.worldId,
      tick: null,
      at: '2026-11-23T15:00:00.000Z',
      who: start.leaderSlug,
      what: 'tick',
      where: null,
      payload: {},
      source: 'leader',
    },
  ]);
  assert.equal(next.characters.kin.energy, 7);
  assert.equal(next.characters.kin.xp, 2);
  const applied = next.log.find((entry) => entry.id === event.id);
  assert.ok(applied);
  assert.equal(applied.source, 'visitor-influence');
  assert.deepEqual(applied.payload, { kind: 'warmth', amount: 2 });
});

test('the first leader chat of a Seoul day queues two warmth and does not repeat', async () => {
  const state = createState(canon);
  state.characters.kin.energy = 4;
  state.characters.kin.mood = 3;
  state.characters.kin.level = 2;
  state.log.push(
    {
      id: 'old',
      at: '2026-11-20T00:00:00.000Z',
      what: 'influence',
      target: 'kin',
      payload: { kind: 'warmth', amount: 5 },
      source: 'visitor-influence',
      who: 'visitor:oldsecret',
    },
    {
      id: 'recent',
      at: '2026-11-22T10:00:00.000Z',
      what: 'influence',
      target: 'kin',
      payload: { kind: 'warmth', amount: 1 },
      source: 'visitor-influence',
      who: 'visitor:recentsecret',
    }
  );
  const store = memoryStore({ state, last_event_seq: 2 });
  store.events.push({
    seq: 3,
    id: 'visitor-warmth',
    worldId: 'kinxdred',
    at: '2026-11-23T01:00:00.000Z',
    who: 'visitor:secretaddress',
    what: 'influence',
    target: 'kin',
    payload: { kind: 'warmth', amount: 1 },
    source: 'visitor-influence',
    ipHash: 'ab'.repeat(32),
  });
  store.events.push({
    seq: 4,
    id: 'too-big',
    worldId: 'kinxdred',
    at: '2026-11-23T01:00:00.000Z',
    what: 'influence',
    target: 'kin',
    payload: { kind: 'warmth', amount: 9 },
    source: 'visitor-influence',
  });
  store.events.push({
    seq: 5,
    id: 'other-source',
    worldId: 'kinxdred',
    at: '2026-11-23T01:00:00.000Z',
    what: 'influence',
    target: 'kin',
    payload: { kind: 'warmth', amount: 1 },
    source: 'agent',
  });
  const now = new Date('2026-11-22T16:30:00.000Z');
  const first = await perceiveChat({ store, canon, slug: 'kin', now, leader: true });
  assert.deepEqual(first.worldState, {
    energy: 4,
    energy_max: 10,
    mood: 3,
    level: 2,
    pending_warmth: 3,
    recent_warmth: 1,
    daily_chat_bonus_granted_now: true,
  });
  const grant = store.events.find((event) => event.payload?.grant === DAILY_CHAT_GRANT);
  assert.ok(grant);
  assert.equal(grant.source, 'visitor-influence');
  assert.equal(grant.who, 'ben');
  assert.equal(grant.target, 'kin');
  assert.equal(grant.payload.amount, 2);
  assert.equal(grant.ipHash, undefined);
  assert.equal(JSON.stringify(first.worldState).includes('visitor:'), false);
  assert.equal(JSON.stringify(first.worldState).includes('secret'), false);

  const again = await perceiveChat({ store, canon, slug: 'kin', now, leader: true });
  assert.equal(again.worldState.daily_chat_bonus_granted_now, false);
  assert.equal(again.worldState.pending_warmth, 3);
  assert.equal(store.events.filter((event) => event.payload?.grant === DAILY_CHAT_GRANT).length, 1);

  const nextDay = await perceiveChat({
    store,
    canon,
    slug: 'kin',
    now: new Date('2026-11-23T16:30:00.000Z'),
    leader: true,
  });
  assert.equal(nextDay.worldState.daily_chat_bonus_granted_now, true);
  assert.equal(store.events.filter((event) => event.payload?.grant === DAILY_CHAT_GRANT).length, 2);

  const other = await perceiveChat({ store, canon, slug: 'dred', now, leader: true });
  assert.equal(other.worldState.daily_chat_bonus_granted_now, true);
  assert.equal(other.worldState.pending_warmth, 2);
});

test('a visitor call and a failed queue do not grant warmth', async () => {
  const store = memoryStore();
  const now = new Date('2026-11-22T16:30:00.000Z');
  const visitor = await perceiveChat({ store, canon, slug: 'kin', now, leader: false });
  assert.equal(visitor.worldState.daily_chat_bonus_granted_now, false);
  assert.equal(store.events.length, 0);

  const broken = memoryStore();
  broken.append = async () => {
    throw new Error('db down secret');
  };
  const failed = await perceiveChat({ store: broken, canon, slug: 'kin', now, leader: true });
  assert.equal(failed.worldState.daily_chat_bonus_granted_now, false);
  assert.equal(failed.worldState.pending_warmth, 0);
  assert.equal(JSON.stringify(failed).includes('secret'), false);

  const unread = memoryStore();
  let appended = false;
  unread.listPendingInfluence = async () => {
    throw new Error('unread');
  };
  unread.append = async () => {
    appended = true;
    return { ok: true, duplicate: false };
  };
  const blind = await perceiveChat({ store: unread, canon, slug: 'kin', now, leader: true });
  assert.equal(blind.worldState, null);
  assert.equal(appended, false);
});

test('an archived character is not granted, and the amount respects the cap', async () => {
  const archived = structuredClone(canon);
  archived.characters.find((item) => item.slug === 'kin').status = 'archived';
  const store = memoryStore();
  const now = new Date('2026-11-22T16:30:00.000Z');
  const held = await perceiveChat({ store, canon: archived, slug: 'kin', now, leader: true });
  assert.equal(held.worldState.daily_chat_bonus_granted_now, false);
  assert.equal(held.worldState.pending_warmth, 0);
  assert.equal(store.events.length, 0);

  const state = createState(canon);
  state.rules = { ...state.rules, maxInfluencePerEvent: 1 };
  const capped = memoryStore({ state, last_event_seq: 0 });
  const result = await perceiveChat({ store: capped, canon, slug: 'kin', now, leader: true });
  assert.equal(result.worldState.pending_warmth, 1);
  assert.equal(capped.events[0].payload.amount, 1);
});

test('a duplicate insert is not a second grant, and seal drops extra keys', async () => {
  const store = memoryStore();
  store.findEvent = async () => null;
  store.append = async () => ({ ok: true, duplicate: true });
  const now = new Date('2026-11-22T16:30:00.000Z');
  const result = await perceiveChat({ store, canon, slug: 'kin', now, leader: true });
  assert.equal(result.worldState.daily_chat_bonus_granted_now, false);
  assert.equal(result.worldState.pending_warmth, 2);

  const sealed = sealWorldState({
    energy: 1,
    energy_max: 10,
    mood: 2,
    level: 1,
    pending_warmth: 0,
    daily_chat_bonus_granted_now: false,
    who: 'visitor:secret',
    ipHash: 'nope',
  });
  assert.deepEqual(Object.keys(sealed).sort(), [
    'daily_chat_bonus_granted_now',
    'energy',
    'energy_max',
    'level',
    'mood',
    'pending_warmth',
  ]);
  assert.equal(sealWorldState({ ...sealed, recent_warmth: '2' }), null);
});

test('influence reads do not select who or an address hash', async () => {
  const seen = [];
  const store = createWorldStore(
    { url: 'https://world.example.test', serviceKey: 'service-key-0123456789abcdef' },
    async (url) => {
      seen.push(String(url));
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    }
  );
  assert.equal(await store.findEvent('ben-chat-daily:kinxdred:kin:2026-11-23'), null);
  assert.deepEqual(await store.listPendingInfluence('kinxdred', 'kin', 4), []);
  assert.equal(seen.length, 2);
  for (const href of seen) {
    const query = new URL(href).searchParams;
    assert.equal(query.get('select'), 'seq,id,at,target,payload,source,what');
    assert.equal(href.includes('ip_hash'), false);
    assert.equal(href.includes('who'), false);
    assert.equal(href.includes('service-key'), false);
  }
  assert.equal(
    new URL(seen[0]).searchParams.get('id'),
    'eq.ben-chat-daily:kinxdred:kin:2026-11-23'
  );
  assert.equal(new URL(seen[1]).searchParams.get('seq'), 'gt.4');
  await assert.rejects(() => store.listPendingInfluence('kinxdred', '../kin', 0));
  await assert.rejects(() => store.findEvent('id&select=who,ip_hash'));
});
