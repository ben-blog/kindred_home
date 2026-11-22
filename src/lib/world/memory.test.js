import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCanon } from '../../../world/load.js';
import { createLimiter } from '../proxy.js';
import { handleWorldMemory, parseMemoryMap, parseTrace } from './memory.js';

const canon = loadCanon();
const leaderId = '11111111-1111-4111-8111-111111111111';
const env = {
  WORLD_SUPABASE_URL: 'https://world.example.test',
  WORLD_SUPABASE_SERVICE_KEY: 'service-key-0123456789abcdef',
  WORLD_SUPABASE_ANON_KEY: 'anon-key-0123456789abcdef',
  WORLD_LEADER_USER_ID: leaderId,
  WORLD_IP_SALT: 'ip-salt-0123456789',
  CRON_SECRET: 'cron-secret-0123456789',
  KIN_AGENT_URL: 'https://kin-agent.example.test',
  DRED_AGENT_URL: 'https://dred-agent.example.test',
  KIN_AGENT_TOKEN: 'kin-admin-key-0123456789',
  DRED_AGENT_TOKEN: 'dred-admin-key-0123456789',
};

function request(path, { method = 'GET', headers = {}, cookie } = {}) {
  const init = { method, headers: { origin: 'https://kinxdred.com', ...headers } };
  if (cookie) init.headers.cookie = cookie;
  return new Request(`https://kinxdred.com${path}`, init);
}

function leaderFetch(id, upstream) {
  return async (url, init) => {
    const href = String(url);
    if (href.endsWith('/auth/v1/user')) {
      return new Response(JSON.stringify({ id }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return upstream(href, init);
  };
}

const signedIn = { cookie: 'world_access=leader.access.token' };
const map = {
  character: 'someone-else',
  basisVersion: 1,
  basisFingerprint: 'abc123def456',
  total: 2,
  limit: 1000,
  truncated: false,
  nextCursor: null,
  secret: 'nope',
  points: [
    {
      id: 'a',
      kind: 'Experience',
      label: 'the late bus',
      createdAt: '2026-11-22T00:00:00.000Z',
      x: 0,
      y: 1,
      z: 0,
      prompt: 'hidden',
    },
    { id: 'b', kind: 'album_moment', label: 'x'.repeat(200), x: 3, y: 0, z: 0 },
    { id: 'r', kind: 'reflection', label: 'not on the sphere', x: 1, y: 0, z: 0 },
  ],
};

function isolated() {
  return {
    cache: new Map(),
    inflight: new Map(),
    upstreamLimiter: createLimiter({ limit: 100, windowMs: 60_000 }),
  };
}

function page(extra) {
  return {
    character: 'kin',
    basisVersion: 1,
    basisFingerprint: 'abc123def456',
    total: 2,
    limit: 1000,
    truncated: false,
    nextCursor: null,
    ...extra,
  };
}

test('the memory adapter keeps the public shape and drops secrets', () => {
  const parsed = parseMemoryMap(map, 'kin');
  assert.equal(parsed.character, 'kin');
  assert.equal(parsed.basisVersion, 1);
  assert.equal(parsed.basisFingerprint, 'abc123def456');
  assert.equal(parsed.points[0].kind, 'experience');
  assert.equal(parsed.points[0].y, 1);
  assert.equal(parsed.points[1].kind, 'album_moment');
  assert.equal(parsed.points[1].label.length, 80);
  assert.equal(parsed.points.some((point) => point.kind === 'reflection'), false);
  assert.equal(parsed.nextCursor, null);
  assert.equal(JSON.stringify(parsed).includes('hidden'), false);
  assert.equal(JSON.stringify(parsed).includes('nope'), false);
  assert.equal(
    parseMemoryMap(
      {
        basisFingerprint: 'abc123def456',
        points: [{ id: 'a', kind: 'experience', x: 0, y: 0, z: 0 }],
      },
      'kin'
    ).points.length,
    0
  );
  assert.equal(parseMemoryMap({ points: [] }, 'kin'), null);

  const retrieved = parseTrace({
    stage: 'retrieved',
    items: [
      { id: 'a', kind: 'experience', label: 'bus', score: 0.5, system: 'prompt' },
      { id: 'b', kind: 'reflection', label: 'a note\nkept', score: null },
    ],
  });
  assert.deepEqual(retrieved.items, [
    { id: 'a', kind: 'experience', label: 'bus', score: 0.5 },
    { id: 'b', kind: 'reflection', label: 'a note kept', score: null },
  ]);
  assert.equal(parseTrace({ stage: 'saved', ids: ['a'] }), null);
  assert.equal(parseTrace({ stage: 'other' }), null);
});

test('memory fails closed without a session, a route, or agent config', async () => {
  const closed = await handleWorldMemory(request('/api/world/chat/kin/memory', signedIn), {
    canon,
    slug: 'kin',
    env: {},
  });
  assert.equal(closed.status, 503);

  const anonymous = await handleWorldMemory(request('/api/world/chat/kin/memory'), {
    env,
    canon,
    slug: 'kin',
    limiter: createLimiter(),
  });
  assert.equal(anonymous.status, 401);

  const local = structuredClone(canon);
  delete local.characters.find((item) => item.slug === 'kin').agent.memory;
  const missing = await handleWorldMemory(request('/api/world/chat/kin/memory', signedIn), {
    env,
    canon: local,
    slug: 'kin',
    limiter: createLimiter(),
    fetch: leaderFetch(leaderId, () => {
      throw new Error('no');
    }),
  });
  assert.equal(missing.status, 404);

  let called = false;
  const noToken = await handleWorldMemory(request('/api/world/chat/kin/memory', signedIn), {
    env: { ...env, KIN_AGENT_TOKEN: '' },
    canon,
    slug: 'kin',
    limiter: createLimiter(),
    fetch: leaderFetch(leaderId, () => {
      called = true;
      throw new Error('no');
    }),
  });
  assert.equal(noToken.status, 503);
  assert.equal(called, false);
});

test('memory is same-origin, rate limited, and returns a sanitized map', async () => {
  const cross = await handleWorldMemory(
    request('/api/world/chat/kin/memory', { headers: { origin: 'https://evil.example' } }),
    {
      env,
      canon,
      slug: 'kin',
      limiter: createLimiter(),
      fetch: () => {
        throw new Error('no');
      },
    }
  );
  assert.equal(cross.status, 403);

  const limiter = createLimiter({ limit: 1, windowMs: 60_000 });
  const first = await handleWorldMemory(request('/api/world/chat/kin/memory'), {
    env,
    canon,
    slug: 'kin',
    limiter,
    now: () => 0,
  });
  assert.equal(first.status, 401);
  const second = await handleWorldMemory(request('/api/world/chat/kin/memory'), {
    env,
    canon,
    slug: 'kin',
    limiter,
    now: () => 10,
  });
  assert.equal(second.status, 429);

  const fetch = leaderFetch(leaderId, async (href, init) => {
    assert.equal(
      href,
      'https://kin-agent.example.test/api/kin/memory/map?since=2026-11-22T00%3A00%3A00.000Z&limit=1000'
    );
    assert.equal(init.headers.get('x-admin-key'), env.KIN_AGENT_TOKEN);
    assert.equal(init.headers.get('origin'), null);
    return new Response(JSON.stringify(map), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  const response = await handleWorldMemory(
    request('/api/world/chat/kin/memory?since=2026-11-22T00:00:00.000Z', signedIn),
    { env, canon, slug: 'kin', limiter: createLimiter(), fetch, ...isolated() }
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.character, 'kin');
  assert.equal(body.points.length, 2);
  assert.equal(JSON.stringify(body).includes(env.KIN_AGENT_TOKEN), false);

  const badSince = await handleWorldMemory(
    request('/api/world/chat/kin/memory?since=yesterday', signedIn),
    {
      env,
      canon,
      slug: 'kin',
      limiter: createLimiter(),
      fetch: leaderFetch(leaderId, () => {
        throw new Error('no');
      }),
    }
  );
  assert.equal(badSince.status, 400);

  const down = await handleWorldMemory(request('/api/world/chat/kin/memory', signedIn), {
    env,
    canon,
    slug: 'kin',
    limiter: createLimiter(),
    ...isolated(),
    fetch: leaderFetch(
      leaderId,
      async () => new Response('{"error":"https://secret.railway.app"}', { status: 500 })
    ),
  });
  assert.equal(down.status, 502);
  assert.equal(await down.text(), '{"error":"unavailable"}');

  const locked = await handleWorldMemory(request('/api/world/chat/kin/memory', signedIn), {
    env,
    canon,
    slug: 'kin',
    limiter: createLimiter(),
    ...isolated(),
    fetch: leaderFetch(
      leaderId,
      async () => new Response('{"error":"인증이 필요해"}', { status: 401 })
    ),
  });
  assert.equal(locked.status, 503);
  assert.equal(await locked.text(), '{"error":"unavailable"}');
});

test('memory follows nextCursor, reloads when the basis changes, and caches the map', async () => {
  const seen = [];
  const fetch = leaderFetch(leaderId, async (href) => {
    const url = new URL(href);
    seen.push(`${url.searchParams.get('since') || ''}|${url.searchParams.get('cursor') || ''}`);
    const cursor = url.searchParams.get('cursor');
    if (!cursor) {
      return new Response(
        JSON.stringify(
          page({
            nextCursor: 'cursor-1',
            points: [
              {
                id: 'a',
                kind: 'experience',
                label: 'late bus',
                createdAt: '2026-11-22T00:00:00.000Z',
                x: 1,
                y: 0,
                z: 0,
              },
            ],
          })
        ),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    return new Response(
      JSON.stringify(
        page({
          points: [
            {
              id: 'b',
              kind: 'album_moment',
              label: 'the rain',
              createdAt: '2026-11-22T00:00:01.000Z',
              x: 0,
              y: 1,
              z: 0,
            },
          ],
        })
      ),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  });
  const options = {
    env,
    canon,
    slug: 'kin',
    limiter: createLimiter(),
    fetch,
    ...isolated(),
  };
  const response = await handleWorldMemory(request('/api/world/chat/kin/memory', signedIn), options);
  const body = await response.json();
  assert.deepEqual(seen, ['|', '|cursor-1']);
  assert.deepEqual(
    body.points.map((point) => point.id),
    ['a', 'b']
  );
  assert.equal(body.nextCursor, null);
  assert.equal(body.basisFingerprint, 'abc123def456');
  assert.equal(body.total, 2);
  const again = await handleWorldMemory(request('/api/world/chat/kin/memory', signedIn), options);
  assert.equal(again.status, 200);
  assert.equal(seen.length, 2);

  const shifted = [];
  const reload = leaderFetch(leaderId, async (href) => {
    const url = new URL(href);
    shifted.push(`${url.searchParams.get('since') || ''}|${url.searchParams.get('cursor') || ''}`);
    const since = url.searchParams.get('since');
    const cursor = url.searchParams.get('cursor');
    if (since && !cursor) {
      return new Response(
        JSON.stringify(
          page({
            basisFingerprint: 'aaaaaaaaaaaa',
            nextCursor: 'cursor-2',
            points: [
              { id: 'old', kind: 'knowledge', label: 'old', x: 1, y: 0, z: 0 },
            ],
          })
        ),
        { status: 200 }
      );
    }
    if (cursor) {
      return new Response(
        JSON.stringify(
          page({
            basisFingerprint: 'bbbbbbbbbbbb',
            points: [{ id: 'moved', kind: 'pattern', label: 'moved', x: 0, y: 1, z: 0 }],
          })
        ),
        { status: 200 }
      );
    }
    return new Response(
      JSON.stringify(
        page({
          basisFingerprint: 'bbbbbbbbbbbb',
          total: 1,
          points: [
            {
              id: 'fresh',
              kind: 'declaration',
              label: 'fresh',
              createdAt: '2026-11-22T00:00:02.000Z',
              x: 0,
              y: 0,
              z: 1,
            },
          ],
        })
      ),
      { status: 200 }
    );
  });
  const reset = await handleWorldMemory(
    request('/api/world/chat/kin/memory?since=2026-11-22T00:00:00.000Z', signedIn),
    { env, canon, slug: 'kin', limiter: createLimiter(), fetch: reload, ...isolated() }
  );
  const resetBody = await reset.json();
  assert.deepEqual(shifted, ['2026-11-22T00:00:00.000Z|', '2026-11-22T00:00:00.000Z|cursor-2', '|']);
  assert.equal(resetBody.basisFingerprint, 'bbbbbbbbbbbb');
  assert.deepEqual(
    resetBody.points.map((point) => point.id),
    ['fresh']
  );

  let maps = 0;
  const bad = await handleWorldMemory(
    request('/api/world/chat/kin/memory?limit=1001&cursor=not valid', signedIn),
    {
      env,
      canon,
      slug: 'kin',
      limiter: createLimiter(),
      ...isolated(),
      fetch: leaderFetch(leaderId, () => {
        maps += 1;
        throw new Error('no');
      }),
    }
  );
  assert.equal(bad.status, 400);
  assert.equal(maps, 0);
});
