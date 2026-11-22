import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCanon } from '../../../world/load.js';
import { createState } from '../../../world/state.js';
import { step } from '../../../world/step.js';
import { leaderTickEvent, normalizeTime, reduceTick } from './pipeline.js';

const canon = loadCanon();

test('normalizeTime trims a postgres timestamp to an event timestamp', () => {
  assert.equal(normalizeTime('2026-11-22T03:04:05.123456+00:00'), '2026-11-22T03:04:05.123Z');
  assert.equal(normalizeTime('not-a-time'), null);
});

test('a tick reduces pending records through step and ignores a second copy', () => {
  const start = createState(canon);
  const records = [
    {
      seq: 4,
      id: 'inf-kin',
      worldId: 'kinxdred',
      at: '2026-11-22T03:00:00.000Z',
      who: 'visitor:abc123',
      what: 'influence',
      where: '/characters/kin',
      target: 'kin',
      payload: { kind: 'warmth', amount: 1 },
      source: 'visitor-influence',
    },
    {
      seq: 5,
      id: 'ext-weather',
      worldId: 'kinxdred',
      at: '2026-11-22T04:00:00.000Z',
      who: 'source:shared-weather',
      what: 'external',
      payload: { category: 'weather', kind: 'season', season: 'autumn' },
      source: 'external',
    },
  ];
  const tick = leaderTickEvent(start, 'tick-1', '2026-11-22T12:00:00.000Z');
  const reduced = reduceTick(start, records, tick);
  const direct = step(start, [
    {
      id: 'inf-kin',
      worldId: 'kinxdred',
      tick: null,
      at: '2026-11-22T03:00:00.000Z',
      who: 'visitor:abc123',
      what: 'influence',
      where: '/characters/kin',
      target: 'kin',
      payload: { kind: 'warmth', amount: 1 },
      source: 'visitor-influence',
    },
    {
      id: 'ext-weather',
      worldId: 'kinxdred',
      tick: null,
      at: '2026-11-22T04:00:00.000Z',
      who: 'source:shared-weather',
      what: 'external',
      where: null,
      payload: { category: 'weather', kind: 'season', season: 'autumn' },
      source: 'external',
    },
    tick,
  ]);
  assert.deepEqual(reduced.state, direct);
  assert.equal(reduced.state.tick, 1);
  assert.equal(reduced.state.characters.kin.xp, 1);
  assert.equal(reduced.state.characters.kin.mood, start.characters.kin.mood);
  assert.equal(reduced.lastEventSeq, 5);
  assert.equal(
    reduced.state.log.some((entry) => entry.what === 'external'),
    true
  );
  assert.equal(reduced.input.at(-1).what, 'tick');
  assert.equal(reduced.input.at(-1).who, start.leaderSlug);

  const again = reduceTick(
    reduced.state,
    records,
    leaderTickEvent(reduced.state, 'tick-2', tick.at)
  );
  assert.equal(again.state.characters.kin.xp, 1);
});
