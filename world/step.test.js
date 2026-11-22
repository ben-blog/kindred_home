import assert from 'node:assert/strict';
import test from 'node:test';
import { createState } from './state.js';
import { step, whereIs } from './step.js';

const rules = {
  moodThreshold: 10,
  moodMax: 5,
  energyMax: 10,
  energyIdleDecay: 1,
  xpPerLevel: 10,
  relationMax: 8,
  tensionMax: 10,
  maxInfluencePerEvent: 5,
};

function canon() {
  return {
    world: { id: 'test', name: 'test', tick: 0, rules },
    entities: [
      { slug: 'leader', kind: 'leader', name: 'Leader', status: 'active', role: { ko: '리더', en: 'Leader' } },
      { slug: 'alpha', kind: 'character', name: 'Alpha', status: 'active' },
      { slug: 'beta', kind: 'character', name: 'Beta', status: 'active' },
      { slug: 'gamma', kind: 'character', name: 'Gamma', status: 'active' },
      { slug: 'old', kind: 'character', name: 'Old', status: 'archived' },
      { slug: 'hidden', kind: 'character', name: 'Hidden', status: 'draft' },
    ],
    characters: [
      character('alpha', 'active'),
      character('beta', 'active', [
        {
          id: 'beta-note',
          title: { ko: '노트', en: 'Note' },
          body: { ko: '본문', en: 'Body' },
          unlock: { stage: 2 },
        },
      ]),
      character('gamma', 'active'),
      character('old', 'archived'),
      character('hidden', 'draft'),
    ],
    locations: [{ slug: 'a-place' }, { slug: 'b-place' }, { slug: 'hall' }],
    relations: [
      { id: 'alpha-leader', from: 'alpha', to: 'leader', kinds: ['leader', 'friend'], strength: 2 },
      {
        id: 'beta-leader',
        from: 'beta',
        to: 'leader',
        kinds: ['leader', 'friend', '썸'],
        strength: 2,
        tension: 1,
      },
      { id: 'gamma-leader', from: 'gamma', to: 'leader', kinds: ['leader', 'friend'], strength: 0 },
      { id: 'old-leader', from: 'old', to: 'leader', kinds: ['leader', 'friend'], strength: 1 },
      { id: 'hidden-leader', from: 'hidden', to: 'leader', kinds: ['leader', 'friend'], strength: 0 },
      { id: 'alpha-beta', from: 'alpha', to: 'beta', kinds: ['peer'], strength: 1 },
    ],
    sources: [
      {
        id: 'alpha-sub',
        scope: 'character',
        character: 'alpha',
        category: 'subculture',
        kinds: ['anime_release'],
        fetch: false,
      },
      {
        id: 'shared-weather',
        scope: 'shared',
        category: 'weather',
        kinds: ['weather', 'season'],
        fetch: false,
      },
    ],
  };
}

function character(slug, status, lore = []) {
  return {
    slug,
    status,
    location: slug === 'beta' ? 'b-place' : 'a-place',
    initial: { mood: 2, energy: 5, xp: 0, level: 1 },
    lore,
  };
}

function influence(target, amount = 1, id = `inf-${target}-${amount}`) {
  return {
    id,
    worldId: 'test',
    tick: null,
    at: '2026-11-22T12:00:00+09:00',
    who: 'visitor:anon',
    what: 'influence',
    where: `/characters/${target}`,
    target,
    payload: { kind: 'warmth', amount },
    source: 'visitor-influence',
  };
}

function tick(id = 'tick-1', who = 'leader') {
  return {
    id,
    worldId: 'test',
    tick: null,
    at: '2026-11-22T18:00:00+09:00',
    who,
    what: 'tick',
    where: null,
    payload: {},
    source: 'leader',
  };
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

test('draft characters are omitted and archived characters stay', () => {
  const state = createState(canon());
  assert.equal(state.leaderSlug, 'leader');
  assert.equal(state.characters.hidden, undefined);
  assert.equal(state.characters.old.status, 'archived');
  assert.equal(state.relations.some((relation) => relation.id === 'hidden-leader'), false);
});

test('influence waits in pending until the leader ticks', () => {
  const start = freeze(createState(canon()));
  const pending = step(start, [influence('alpha', 4)]);
  assert.equal(pending.tick, 0);
  assert.equal(pending.characters.alpha.mood, 2);
  assert.equal(pending.characters.alpha.energy, 5);
  assert.equal(pending.pending.length, 1);
  assert.equal(pending.pending[0].tick, null);
  assert.deepEqual(start.pending, []);

  const advanced = step(pending, [tick()]);
  assert.equal(advanced.tick, 1);
  assert.equal(advanced.pending.length, 0);
  assert.equal(advanced.characters.alpha.xp, 4);
  assert.equal(advanced.characters.alpha.mood, 2);
  assert.equal(advanced.characters.alpha.energy, 9);
  assert.equal(advanced.relations.find((relation) => relation.id === 'alpha-leader').strength, 3);
  assert.deepEqual(advanced.activeLocations, ['a-place']);
  assert.equal(advanced.log[0].what, 'tick');
  assert.equal(advanced.log[0].who, 'leader');
  assert.equal(advanced.log[1].what, 'influence');
  assert.equal(advanced.log[1].tick, 1);
});

test('warmth at the threshold raises mood, level, and unlocked lore', () => {
  const advanced = step(createState(canon()), [
    influence('beta', 5, 'warm-a'),
    influence('beta', 5, 'warm-b'),
    tick('tick-beta'),
  ]);
  const beta = advanced.characters.beta;
  assert.equal(beta.mood, 3);
  assert.equal(beta.xp, 10);
  assert.equal(beta.level, 2);
  assert.deepEqual(beta.unlocked, ['beta-note']);
  assert.equal(beta.energy, 10);
  const bond = advanced.relations.find((relation) => relation.id === 'beta-leader');
  assert.equal(bond.strength, 3);
  assert.equal(bond.tension, 2);
});

test('썸 tension stays put until that character is influenced on a tick', () => {
  const onlyAlpha = step(createState(canon()), [influence('alpha', 1, 'a'), tick('t')]);
  assert.equal(onlyAlpha.relations.find((relation) => relation.id === 'beta-leader').tension, 1);
  const held = step(createState(canon()), [influence('beta', 1, 'b')]);
  assert.equal(held.relations.find((relation) => relation.id === 'beta-leader').tension, 1);
});

test('two influenced characters strengthen the relation between them', () => {
  const both = step(createState(canon()), [
    influence('alpha', 1, 'a'),
    influence('beta', 1, 'b'),
    tick(),
  ]);
  assert.equal(both.relations.find((relation) => relation.id === 'alpha-beta').strength, 2);
  const one = step(createState(canon()), [influence('alpha', 1, 'a'), tick()]);
  assert.equal(one.relations.find((relation) => relation.id === 'alpha-beta').strength, 1);
});

test('an idle tick decays energy and clears location activity', () => {
  const advanced = step(createState(canon()), [tick()]);
  assert.equal(advanced.tick, 1);
  assert.equal(advanced.characters.alpha.energy, 4);
  assert.equal(advanced.characters.gamma.energy, 4);
  assert.equal(advanced.characters.old.energy, 5);
  assert.deepEqual(advanced.activeLocations, []);
});

test('archived and invalid events do not change the world', () => {
  const start = createState(canon());
  const next = step(start, [
    influence('old', 5, 'old'),
    influence('hidden', 5, 'hidden'),
    influence('missing', 1, 'missing'),
    { what: 'influence' },
    { ...influence('alpha', 9, 'too-big'), payload: { kind: 'warmth', amount: 9 } },
    { ...tick('stranger'), who: 'alpha' },
    { ...influence('alpha', 1, 'wrong-source'), source: 'agent' },
  ]);
  assert.equal(next.pending.length, 0);
  assert.equal(next.tick, 0);
  assert.equal(next.characters.old.mood, 2);
  assert.equal(next.characters.alpha.mood, 2);
});

test('events after a tick stay pending', () => {
  const next = step(createState(canon()), [tick('first'), influence('gamma', 2, 'later')]);
  assert.equal(next.tick, 1);
  assert.equal(next.pending.length, 1);
  assert.equal(next.characters.gamma.xp, 0);
  const applied = step(next, [tick('second')]);
  assert.equal(applied.characters.gamma.xp, 2);
  assert.equal(applied.tick, 2);
});

test('folding events one at a time matches one batch', () => {
  const events = [influence('alpha', 3, 'a'), influence('beta', 1, 'b'), tick()];
  const batch = step(createState(canon()), events);
  let folded = createState(canon());
  for (const event of events) folded = step(folded, [event]);
  assert.deepEqual(folded, batch);
});

test('archived influence records are not applied twice', () => {
  const once = step(createState(canon()), [influence('alpha', 2, 'once'), tick()]);
  const again = step(once, [once.log.find((entry) => entry.what === 'influence')]);
  assert.equal(again.pending.length, 0);
  assert.equal(again.characters.alpha.xp, 2);
});

test('agent moves apply on the tick, notes do not change stats', () => {
  const start = createState(canon());
  const queued = step(start, [
    {
      id: 'move-1',
      worldId: 'test',
      tick: null,
      at: '2026-11-22T12:00:00Z',
      who: 'agent:alpha',
      what: 'agent_action',
      target: 'alpha',
      payload: { action: 'move', location: 'hall' },
      source: 'agent',
    },
    {
      id: 'note-1',
      worldId: 'test',
      tick: null,
      at: '2026-11-22T12:05:00Z',
      who: 'agent:alpha',
      what: 'agent_action',
      target: 'alpha',
      payload: { action: 'note', text: 'seen' },
      source: 'agent',
    },
  ]);
  assert.equal(whereIs(queued, 'alpha'), 'a-place');
  const advanced = step(queued, [tick()]);
  assert.equal(whereIs(advanced, 'alpha'), 'hall');
  assert.equal(advanced.characters.alpha.mood, 2);
  assert.equal(whereIs(advanced, 'nobody'), null);
});

test('external events are logged on the tick and do not change stats', () => {
  const next = step(createState(canon()), [
    {
      id: 'ext-1',
      worldId: 'test',
      tick: null,
      at: '2026-11-22T09:00:00+09:00',
      who: 'source:shared-weather',
      what: 'external',
      payload: { category: 'weather', kind: 'season' },
      source: 'external',
    },
    {
      id: 'ext-bad',
      worldId: 'test',
      tick: null,
      at: '2026-11-22T09:00:00+09:00',
      who: 'source:nope',
      what: 'external',
      payload: { category: 'news', kind: 'headline' },
      source: 'external',
    },
    tick(),
  ]);
  assert.equal(next.characters.alpha.mood, 2);
  assert.equal(next.characters.alpha.energy, 4);
  assert.equal(next.log.filter((entry) => entry.what === 'external').length, 1);
});

test('a third character follows the same rules', () => {
  const next = step(createState(canon()), [
    influence('gamma', 5, 'g1'),
    influence('gamma', 5, 'g2'),
    tick(),
  ]);
  assert.equal(next.characters.gamma.mood, 3);
  assert.equal(next.characters.gamma.level, 2);
  assert.equal(next.relations.find((relation) => relation.id === 'gamma-leader').strength, 1);
});

test('step rejects a non-array event list', () => {
  assert.throws(() => step(createState(canon()), influence('alpha')), /events must be an array/);
});
