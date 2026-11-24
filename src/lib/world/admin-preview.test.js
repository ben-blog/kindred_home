import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCanon } from '../../../world/load.js';
import { createState } from '../../../world/state.js';
import { reduceTick, leaderTickEvent } from './pipeline.js';
import { publicState } from './present.js';
import { createWorldStore } from './store.js';
import { bandOf } from './gauge.js';

const at = '2026-11-24T08:00:00.000Z';
function fixture() {
  const state = createState(loadCanon());
  state.tick = 3;
  for (const c of Object.values(state.characters)) {
    c.mood = 2;
    c.energy = 2;
    c.xp = 0;
    c.level = 1;
  }
  const records = [];
  for (const [target, amounts] of [
    ['dred', [5, 5, 3]],
    ['kin', [5, 5]],
  ]) {
    for (const amount of amounts)
      records.push({
        seq: records.length + 1,
        id: `event-${records.length}`,
        worldId: state.worldId,
        tick: null,
        at,
        who: 'visitor:private',
        ip_hash: 'private',
        what: 'influence',
        source: 'visitor-influence',
        target,
        payload: { kind: 'warmth', amount },
      });
  }
  return { state, records };
}
test('admin preview uses accepted reducer events, hides identities, and leaves snapshot intact', () => {
  const { state, records } = fixture();
  records.push({ ...records[0], id: 'invalid', payload: { kind: 'warmth', amount: 99 } });
  const preview = reduceTick(state, records, leaderTickEvent(state, 'preview', at)).state;
  const view = publicState(state, { preview });
  assert.deepEqual(view.next.dred, { mood: 3, energy: 10, xp: 13, level: 2 });
  assert.deepEqual(view.next.kin, { mood: 3, energy: 10, xp: 10, level: 2 });
  assert.equal(view.pending, 5);
  assert.deepEqual(view.pendingWarmth, { dred: 13, kin: 10 });
  assert.equal(view.lastWarmthAt.dred, at);
  assert.equal(state.tick, 3);
  assert.equal(state.characters.dred.energy, 2);
  const encoded = JSON.stringify(view);
  for (const privateKey of ['ip_hash', '"who"', 'visitor:private', 'event-'])
    assert.equal(encoded.includes(privateKey), false);
});
test('preview with no warmth decays energy and keeps mood', () => {
  const { state } = fixture();
  const preview = reduceTick(state, [], leaderTickEvent(state, 'preview', at)).state;
  const view = publicState(state, { preview });
  assert.equal(view.next.dred.energy, 1);
  assert.equal(view.next.dred.mood, 2);
  assert.equal(view.pending, 0);
  assert.equal(publicState(state).next, undefined);
});
test('pending store GET selects only required columns and maps tick records', async () => {
  let seen;
  const store = createWorldStore(
    { url: 'https://store.example.test', serviceKey: 'fixture' },
    async (url, init) => {
      seen = { url: new URL(url), init };
      return new Response(
        JSON.stringify([
          {
            seq: 12,
            id: 'e',
            world_id: 'kinxdred',
            place: '/world/admin',
            who: 'visitor:private',
            at,
          },
        ])
      );
    }
  );
  const rows = await store.pendingEvents('kinxdred', 7);
  assert.equal(seen.init.method, 'GET');
  assert.equal(
    seen.url.searchParams.get('select'),
    'seq,id,world_id,at,who,what,place,target,payload,source'
  );
  assert.equal(seen.url.searchParams.get('seq'), 'gt.7');
  assert.equal(seen.url.searchParams.get('limit'), '2000');
  assert.equal(seen.url.searchParams.get('what'), 'neq.tick');
  assert.equal(rows[0].worldId, 'kinxdred');
  assert.equal(rows[0].where, '/world/admin');
  assert.equal(rows[0].tick, null);
  await assert.rejects(() => store.pendingEvents('bad?id', 0));
});
test('gauge bands include every boundary and honor configured maxima', () => {
  const rules = { moodMax: 5, energyMax: 10 };
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5].map((n) => bandOf('mood', n, rules)),
    ['낮음', '낮음', '보통', '보통', '높음', '높음']
  );
  assert.deepEqual(
    [0, 2, 3, 6, 7, 10].map((n) => bandOf('energy', n, rules)),
    ['피곤', '피곤', '보통', '보통', '높음', '높음']
  );
  assert.equal(bandOf('energy', 12, { energyMax: 12 }), '높음');
});
