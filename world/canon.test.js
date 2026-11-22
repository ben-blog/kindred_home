import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCanon } from './load.js';
import { createState } from './state.js';
import { step } from './step.js';

const canon = loadCanon();
const state = createState(canon);

test('the roster is data: KIN and DRED are present, and the count is not fixed in the reducer', () => {
  assert.equal(state.worldId, 'kinxdred');
  assert.equal(state.leaderSlug, 'ben');
  assert.equal(state.characters.kin.status, 'active');
  assert.equal(state.characters.dred.status, 'active');
  assert.ok(Object.keys(state.characters).length >= 2);
});

test('identity colors and the leader relations are the v0 canon', () => {
  const kin = canon.characters.find((character) => character.slug === 'kin');
  const dred = canon.characters.find((character) => character.slug === 'dred');
  assert.equal(kin.identity.color.toLowerCase(), '#ffe500');
  assert.equal(dred.identity.color.toLowerCase(), '#5b4fcf');
  assert.equal(kin.layout, 'board');
  assert.equal(kin.identity.mark.type, 'gaze');
  assert.deepEqual(kin.identity.mark.easing, [0.87, 0, 0.13, 1]);
  assert.equal(dred.layout, 'void');
  assert.equal(dred.identity.mark.type, 'room');
  assert.deepEqual(dred.identity.mark.easing, [0.34, 1.56, 0.64, 1]);
  assert.notEqual(kin.layout, dred.layout);
  assert.deepEqual(kin.aliases, ['/kin']);
  assert.deepEqual(dred.aliases, ['/dred']);

  const kinBen = state.relations.find((relation) => relation.id === 'kin-ben');
  const dredBen = state.relations.find((relation) => relation.id === 'dred-ben');
  assert.ok(kinBen.kinds.includes('leader') && kinBen.kinds.includes('friend'));
  assert.equal(kinBen.kinds.includes('썸'), false);
  assert.ok(dredBen.kinds.includes('leader'));
  assert.ok(dredBen.kinds.includes('friend'));
  assert.ok(dredBen.kinds.includes('썸'));
  assert.equal(typeof dredBen.tension, 'number');
});

test('v0 rules pool visitor influence until Ben ticks', () => {
  assert.equal(canon.world.rules.moodThreshold, 10);
  const held = step(state, [
    {
      id: 'canon-inf',
      worldId: 'kinxdred',
      tick: null,
      at: '2026-11-22T12:00:00+09:00',
      who: 'visitor:anon',
      what: 'influence',
      where: '/characters/dred',
      target: 'dred',
      payload: { kind: 'warmth', amount: 1 },
      source: 'visitor-influence',
    },
  ]);
  assert.equal(held.tick, 0);
  assert.equal(
    held.relations.find((relation) => relation.id === 'dred-ben').tension,
    state.relations.find((r) => r.id === 'dred-ben').tension
  );

  const advanced = step(held, [
    {
      id: 'canon-tick',
      worldId: 'kinxdred',
      tick: null,
      at: '2026-11-22T18:00:00+09:00',
      who: 'ben',
      what: 'tick',
      payload: {},
      source: 'leader',
    },
  ]);
  assert.equal(advanced.tick, 1);
  assert.equal(advanced.characters.dred.xp, 1);
  assert.equal(
    advanced.relations.find((relation) => relation.id === 'dred-ben').tension,
    state.relations.find((relation) => relation.id === 'dred-ben').tension + 1
  );
  assert.equal(
    advanced.relations.find((relation) => relation.id === 'kin-ben').strength,
    state.relations.find((relation) => relation.id === 'kin-ben').strength
  );
});

test('external sources name a provider in data and do not fetch lyric bodies', () => {
  const byId = Object.fromEntries(canon.sources.map((source) => [source.id, source]));
  assert.equal(byId['kin-subculture'].character, 'kin');
  assert.equal(byId['kin-subculture'].provider, 'anilist');
  assert.deepEqual(byId['kin-subculture'].kinds, ['anime_release', 'manga_release']);
  assert.equal(byId['dred-music'].character, 'dred');
  assert.equal(byId['dred-music'].provider, 'musicbrainz');
  assert.equal(byId['dred-music'].releaseKind, 'new_song');
  assert.notEqual(byId['dred-music'].releaseKind, 'lyrics');
  assert.deepEqual(byId['dred-music'].kinds, ['new_song', 'lyrics']);
  assert.equal(byId['shared-weather'].scope, 'shared');
  assert.equal(byId['shared-weather'].provider, 'open-meteo');
  assert.equal(byId['shared-weather'].character, undefined);
  assert.deepEqual(byId['shared-weather'].kinds, ['weather', 'season']);
  for (const source of canon.sources) {
    if (source.fetch) assert.equal(typeof source.provider, 'string');
  }
});
