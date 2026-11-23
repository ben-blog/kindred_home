import assert from 'node:assert/strict';
import test from 'node:test';
import { createState } from '../../../world/state.js';
import { loadCanon } from '../../../world/load.js';
import { step } from '../../../world/step.js';
import {
  albumCandidates,
  albumPickId,
  askDredPick,
  buildPrompt,
  ensureAlbumPick,
  fallbackPick,
  parseChoice,
  resetAlbumPicks,
  seededIds,
} from './album-pick.js';
import { albumObserver, handleAlbumPick, seoulCacheSeconds } from './album-observe.js';
import { voiceFor } from './album-voice.js';

const canon = loadCanon();
const dred = canon.characters.find((item) => item.slug === 'dred');
const kin = canon.characters.find((item) => item.slug === 'kin');

function items() {
  return [
    {
      id: 'a',
      filename: 'a.webp',
      order: 1,
      title: '하나',
      perspective: '렌즈 통해 보면 필요 없는 것들이 사라짐.',
    },
    {
      id: 'b',
      filename: 'b.webp',
      order: 2,
      title: '둘',
      perspective: '비가 소음 지움. 그 안에서 들릴 게 들림.',
    },
    { id: 'c', filename: 'c.webp', order: 3, title: '셋', perspective: '몸은 가는데 마음은 아직.' },
    {
      id: 'd',
      filename: 'd.webp',
      order: 4,
      title: '넷',
      perspective: '빈 의자가 더 많은 말을 함.',
    },
  ];
}

function memoryStore() {
  const rows = new Map();
  return {
    rows,
    async findEvent(id) {
      return rows.get(id) || null;
    },
    async append(event) {
      if (rows.has(event.id)) return { ok: true, duplicate: true };
      rows.set(event.id, {
        id: event.id,
        at: event.at,
        payload: event.payload,
        what: event.what,
        source: event.source,
        target: event.target,
        seq: rows.size + 1,
      });
      return { ok: true, duplicate: false };
    },
    async latest() {
      return { state: createState(canon), last_event_seq: 0 };
    },
    async listPendingInfluence() {
      return [];
    },
  };
}

function staticDoc() {
  return {
    character: 'DRED',
    images: items().map((item) => ({
      id: item.id,
      filename: item.filename,
      order_num: item.order,
      is_active: true,
      ko: { title: item.title, dred_perspective: item.perspective },
    })),
  };
}

function galleryOf(slug) {
  return slug === 'dred' ? staticDoc() : null;
}

function at(day) {
  return new Date(`2026-11-${String(day).padStart(2, '0')}T03:00:00.000Z`);
}

test('a date seed picks the same three ids and a different day can differ', () => {
  const ids = ['d', 'b', 'a', 'c', 'e'];
  assert.deepEqual(seededIds(ids, '2026-11-23'), seededIds(ids, '2026-11-23'));
  assert.equal(seededIds(ids, '2026-11-23').length, 3);
  assert.equal(new Set(seededIds(ids, '2026-11-23')).size, 3);
  const other = seededIds(ids, '2026-12-01');
  assert.equal(other.length, 3);
});

test('the model reply has to be three known ids and one Korean line', () => {
  const allowed = new Set(['a', 'b', 'c', 'd']);
  const sse = [
    'data: {"type":"token","text":"{\\"item_ids\\":[\\"b\\",\\"a\\",\\"d\\"],"}',
    '',
    'data: {"type":"token","text":"\\"line\\":\\"비가 소음 지움.\\"}"}',
    '',
    'data: {"type":"done","emotion":"speaking"}',
    '',
  ].join('\n');
  assert.deepEqual(parseChoice(sse, allowed, '2026-11-23'), {
    item_ids: ['b', 'a', 'd'],
    line: '비가 소음 지움.',
  });
  assert.equal(
    parseChoice('{"item_ids":["nope","a","b"],"line":"비가 소음 지움."}', allowed),
    null
  );
  assert.equal(parseChoice('{"item_ids":["a","b","c"],"line":"why?"}', allowed), null);
  assert.equal(parseChoice('{"item_ids":["a","a","b"],"line":"비가 소음 지움."}', allowed), null);
  assert.equal(parseChoice('not json', allowed), null);
});

test('the prompt names the stills and not a secret', () => {
  const prompt = buildPrompt(items(), voiceFor('dred'), '2026-11-23');
  assert.match(prompt, /banmal/);
  assert.match(prompt, /- a \|/);
  assert.equal(prompt.includes('service_role'), false);
  assert.equal(prompt.includes('Bearer'), false);
  assert.ok(prompt.length < 7000);
});

test('one claim calls the agent once and the next read does not', async () => {
  resetAlbumPicks();
  const store = memoryStore();
  let calls = 0;
  let seenState = null;
  const worldState = {
    energy: 4,
    energy_max: 10,
    mood: 3,
    level: 1,
    pending_warmth: 2,
    recent_warmth: 1,
    daily_chat_bonus_granted_now: false,
  };
  const ask = async ({ worldState: state, prompt }) => {
    calls += 1;
    seenState = state;
    assert.match(prompt, /"item_ids"/);
    return '{"item_ids":["c","a","b"],"line":"빈 자리가 더 정확하다."}';
  };
  const input = {
    now: at(3),
    worldId: 'kinxdred',
    slug: 'dred',
    items: items(),
    voice: voiceFor('dred'),
    store,
    waitMs: 0,
    sleep: async () => {},
    loadWorld: async () => worldState,
    ask,
  };
  const first = await ensureAlbumPick(input);
  const second = await ensureAlbumPick(input);
  assert.equal(calls, 1);
  assert.equal(seenState, worldState);
  assert.deepEqual(first.item_ids, ['c', 'a', 'b']);
  assert.equal(first.source, 'agent');
  assert.equal(first.stored, true);
  assert.deepEqual(second.item_ids, first.item_ids);
  assert.equal(second.line, first.line);
  const row = store.rows.get(albumPickId('kinxdred', 'dred', '2026-11-03'));
  assert.equal(row.payload.kind, 'dred_album_pick');
  assert.equal(row.payload.action, 'note');
  assert.equal(row.source, 'agent');
  assert.equal(JSON.stringify(row).includes('service_role'), false);
});

test('an invalid reply is stored once as the date seed', async () => {
  resetAlbumPicks();
  const store = memoryStore();
  let calls = 0;
  const list = items();
  const input = {
    now: at(4),
    worldId: 'kinxdred',
    slug: 'dred',
    items: list,
    voice: voiceFor('dred'),
    store,
    waitMs: 0,
    sleep: async () => {},
    loadWorld: async () => null,
    ask: async () => {
      calls += 1;
      return 'I will not.';
    },
  };
  const pick = await ensureAlbumPick(input);
  resetAlbumPicks();
  const again = await ensureAlbumPick(input);
  assert.equal(calls, 1);
  assert.equal(pick.source, 'fallback');
  assert.deepEqual(again.item_ids, pick.item_ids);
  assert.equal(again.line, pick.line);
  assert.deepEqual(pick.item_ids, fallbackPick(list, '2026-11-04', voiceFor('dred')).item_ids);
  assert.match(pick.line, /[가-힣]/);
});

test('a pick note does not change stats and a claim is not applied', () => {
  const state = createState(canon);
  const now = '2026-11-23T03:00:00.000Z';
  const claim = {
    id: 'album-pick:kinxdred:dred:2026-11-23:claim',
    worldId: 'kinxdred',
    tick: null,
    at: now,
    who: 'dred',
    what: 'agent_action',
    target: 'dred',
    payload: { action: 'note', kind: 'dred_album_pick', phase: 'claim', date: '2026-11-23' },
    source: 'album-pick',
  };
  const note = {
    id: 'album-pick:kinxdred:dred:2026-11-23',
    worldId: 'kinxdred',
    tick: null,
    at: now,
    who: 'dred',
    what: 'agent_action',
    target: 'dred',
    payload: {
      action: 'note',
      kind: 'dred_album_pick',
      date: '2026-11-23',
      item_ids: ['a', 'b', 'c'],
      line: '비가 소음 지움.',
    },
    source: 'agent',
  };
  const tick = {
    id: 'tick-1',
    worldId: 'kinxdred',
    tick: null,
    at: now,
    who: 'ben',
    what: 'tick',
    payload: {},
    source: 'leader',
  };
  const plain = step(step(state, []), [tick]);
  const withNote = step(step(state, [note]), [{ ...tick, id: 'tick-2' }]);
  const withClaim = step(step(state, [claim]), [{ ...tick, id: 'tick-3' }]);
  assert.equal(withNote.characters.dred.energy, plain.characters.dred.energy);
  assert.equal(withNote.characters.dred.mood, plain.characters.dred.mood);
  assert.equal(withNote.characters.dred.xp, plain.characters.dred.xp);
  assert.equal(
    withNote.log.some((entry) => entry.payload?.kind === 'dred_album_pick'),
    true
  );
  assert.equal(
    withClaim.log.some((entry) => entry.id === claim.id),
    false
  );
});

test('database stills join the static album without replacing it', () => {
  const doc = {
    images: [
      {
        id: 'keep',
        filename: 'keep.webp',
        order_num: 1,
        is_active: true,
        ko: { title: '그대로', dred_perspective: '그대로 본다.' },
      },
    ],
  };
  const rows = [
    {
      item_id: 'keep',
      filename: 'keep.webp',
      is_active: true,
      order_num: 1,
      title_ko: '다른',
      dred_perspective_ko: '다른 말.',
    },
    {
      item_id: 'new',
      filename: 'new_album.webp',
      is_active: true,
      order_num: 2,
      title_ko: '새로',
      dred_perspective_ko: '새로 본다.',
    },
  ];
  const candidates = albumCandidates(doc, rows);
  assert.deepEqual(
    candidates.map((item) => item.id),
    ['keep', 'new']
  );
  assert.equal(candidates[0].perspective, '그대로 본다.');
});

test('the public pick is the void album, never the board hub', async () => {
  assert.equal(albumObserver(kin), null);
  assert.equal(albumObserver(dred)?.path, '/api/dred/chat');
  const closed = await handleAlbumPick(new Request('https://kinxdred.com/api/gallery/kin/pick'), {
    canon,
    slug: 'kin',
    env: {},
  });
  assert.equal(closed.status, 404);

  resetAlbumPicks();
  const store = memoryStore();
  let calls = 0;
  const response = await handleAlbumPick(
    new Request('https://kinxdred.com/api/gallery/dred/pick'),
    {
      canon,
      slug: 'dred',
      env: {
        WORLD_SUPABASE_URL: 'https://world.example.test',
        WORLD_SUPABASE_SERVICE_KEY: 'service-key-0123456789abcdef',
        WORLD_SUPABASE_ANON_KEY: 'anon-key-0123456789abcdef',
        WORLD_LEADER_USER_ID: '11111111-1111-4111-8111-111111111111',
        WORLD_IP_SALT: 'ip-salt-0123456789',
        CRON_SECRET: 'cron-secret-0123456789',
        DRED_AGENT_URL: 'https://dred.example.test',
        DRED_AGENT_TOKEN: 'dred-admin-key-0123456789',
      },
      store,
    rows: [],
    staticGallery: galleryOf,
    now: () => at(5).getTime(),
      waitMs: 0,
      sleep: async () => {},
      loadWorld: async () => ({
        energy: 5,
        energy_max: 10,
        mood: 2,
        level: 1,
        pending_warmth: 0,
        recent_warmth: 0,
        daily_chat_bonus_granted_now: false,
      }),
      ask: async ({ worldState }) => {
        calls += 1;
        assert.equal(worldState.daily_chat_bonus_granted_now, false);
        return '{"item_ids":["c","a","b"],"line":"오늘은 이 셋이다."}';
      },
    }
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(calls, 1);
  assert.deepEqual(body.item_ids, ['c', 'a', 'b']);
  assert.equal(body.line, '오늘은 이 셋이다.');
  assert.equal(body.source, 'agent');
  assert.equal(JSON.stringify(body).includes('dred-admin-key'), false);
  assert.match(response.headers.get('cache-control'), /public/);
  const grants = [...store.rows.values()].filter((row) => row.payload?.grant === 'ben-chat-daily');
  assert.equal(grants.length, 0);

  resetAlbumPicks();
  const quiet = await handleAlbumPick(new Request('https://kinxdred.com/api/gallery/dred/pick'), {
    canon,
    slug: 'dred',
    env: {},
    staticGallery: galleryOf,
    now: () => at(6).getTime(),
  });
  const quietBody = await quiet.json();
  assert.equal(quiet.status, 200);
  assert.equal(quietBody.item_ids.length, 3);
  assert.equal(quiet.headers.get('cache-control'), 'no-store');
  assert.equal(seoulCacheSeconds(at(5)) > 30, true);
});

test('the agent call posts world_state and reads the stream', async () => {
  let sent = null;
  const reply = await askDredPick({
    origin: 'https://dred.example.test',
    token: 'dred-admin-key-0123456789',
    path: '/api/dred/chat',
    date: '2026-11-07',
    prompt: 'choose',
    worldState: {
      energy: 5,
      energy_max: 10,
      mood: 2,
      level: 1,
      pending_warmth: 0,
      daily_chat_bonus_granted_now: false,
    },
    timeoutMs: 1000,
    fetchImpl: async (url, init) => {
      sent = { url, init, body: JSON.parse(init.body) };
      return new Response(
        'data: {"type":"token","text":"{\\"item_ids\\":[\\"a\\",\\"b\\",\\"c\\"],\\"line\\":\\"봤다.\\"}"}\n\n',
        { status: 200, headers: { 'content-type': 'text/event-stream' } }
      );
    },
  });
  assert.equal(sent.url, 'https://dred.example.test/api/dred/chat');
  assert.equal(sent.init.headers.authorization, 'Bearer dred-admin-key-0123456789');
  assert.equal(sent.body.world_state.energy, 5);
  assert.equal(sent.body.sessionId, 'album-2026-11-07');
  assert.equal(reply.includes('봤다'), true);
  assert.equal(sent.init.body.includes('dred-admin-key'), false);
});
