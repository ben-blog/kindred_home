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
      url: 'https://example.com/bus',
      emotion: ' Joy ',
      intensity: 0,
    },
    {
      id: 'b',
      kind: 'album_moment',
      label: 'x'.repeat(200),
      x: 3,
      y: 0,
      z: 0,
      url: 'javascript:alert(1)',
      emotion: 'rage',
      intensity: 1.4,
    },
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
  assert.equal(parsed.points[0].url, 'https://example.com/bus');
  assert.equal(parsed.points[0].createdAt, '2026-11-22T00:00:00.000Z');
  assert.equal(parsed.points[0].emotion, 'joy');
  assert.equal(parsed.points[0].intensity, 0);
  assert.equal(parsed.points[1].kind, 'album_moment');
  assert.equal(parsed.points[1].url, undefined);
  assert.equal(parsed.points[1].emotion, undefined);
  assert.equal(parsed.points[1].intensity, undefined);
  assert.equal(parsed.points[1].label.length, 80);
  assert.equal(
    parsed.points.some((point) => point.kind === 'reflection'),
    false
  );
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
  const shaded = parseMemoryMap(
    {
      basisFingerprint: 'abc123def456',
      points: [
        { id: 'c', kind: 'knowledge', x: 0, y: 0, z: 1, emotion: 'tired', intensity: 0.3334 },
        { id: 'd', kind: 'pattern', x: 1, y: 0, z: 0, emotion: 4, intensity: '0.2' },
      ],
    },
    'kin'
  );
  assert.equal(shaded.points[0].emotion, 'tired');
  assert.equal(shaded.points[0].intensity, 0.333);
  assert.equal(shaded.points[1].emotion, undefined);
  assert.equal(shaded.points[1].intensity, undefined);
  const weighed = parseMemoryMap(
    {
      basisFingerprint: 'abc123def456',
      points: [
        {
          id: 'w',
          kind: 'knowledge',
          x: 0,
          y: 1,
          z: 0,
          weight: 0.5,
          strength: 2,
          decay: 0.25,
          salience: 0.9,
          secret: 'hidden',
        },
        {
          id: 'bad',
          kind: 'knowledge',
          x: 1,
          y: 0,
          z: 0,
          weight: -1,
          strength: 'high',
          decay: Number.NaN,
        },
      ],
    },
    'kin'
  );
  assert.equal(weighed.points[0].weight, 0.5);
  assert.equal(weighed.points[0].strength, 2);
  assert.equal(weighed.points[0].decay, 0.25);
  assert.equal(weighed.points[0].salience, undefined);
  assert.equal(JSON.stringify(weighed).includes('hidden'), false);
  assert.equal(weighed.points[1].weight, undefined);
  assert.equal(weighed.points[1].strength, undefined);
  assert.equal(weighed.points[1].decay, undefined);

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

  const searched = parseTrace({
    stage: 'web_search',
    query: ' subculture\nzines <script>alert(1)</script> ',
    secret: 'hidden',
    results: [
      { title: '<b>A stack of zines</b>', url: 'https://example.com/zines', html: '<img src=x>' },
      { title: 'skip', url: 'javascript:alert(1)' },
      { title: 'notes', url: 'http://notes.example/a' },
      { title: 'creds', url: 'https://user:pass@example.com/secret' },
      { title: '', url: 'https://example.com/plain' },
      { title: 'four', url: 'https://example.com/four' },
      { title: 'five', url: 'https://example.com/five' },
      { title: 'sixth', url: 'https://example.com/sixth' },
      { title: 'space', url: 'https://example.com/a b' },
    ],
  });
  assert.equal(searched.stage, 'web_search');
  assert.equal(searched.query, 'subculture zines <script>alert(1)</script>');
  assert.equal(searched.results.length, 5);
  assert.deepEqual(searched.results[0], {
    title: '<b>A stack of zines</b>',
    url: 'https://example.com/zines',
  });
  assert.deepEqual(searched.results[1], { title: 'notes', url: 'http://notes.example/a' });
  assert.deepEqual(searched.results[2], {
    title: 'https://example.com/plain',
    url: 'https://example.com/plain',
  });
  assert.equal(JSON.stringify(searched).includes('secret'), false);
  assert.equal(JSON.stringify(searched).includes('javascript'), false);
  assert.equal(JSON.stringify(searched).includes('sixth'), false);
  assert.equal(JSON.stringify(searched).includes('<img'), false);
  assert.equal(parseTrace({ stage: 'web_search', query: '   ', results: [] }), null);
  assert.equal(parseTrace({ stage: 'web_search', query: 'zines' }).results.length, 0);
});

test('the memory map keeps only the adult origin and only for DRED', () => {
  const raw = page({
    points: [
      { ...map.points[0], origin: 'leader_adult' },
      { ...map.points[0], id: 'other', origin: 'unknown' },
    ],
  });
  const dred = parseMemoryMap(raw, 'dred');
  assert.equal(dred.points[0].origin, 'leader_adult');
  assert.equal(Object.hasOwn(dred.points[1], 'origin'), false);
  for (const slug of ['kin', 'other']) {
    const parsed = parseMemoryMap(raw, slug);
    assert.deepEqual(
      parsed.points.map((item) => item.id),
      ['other']
    );
    assert.equal(Object.hasOwn(parsed.points[0], 'origin'), false);
  }
});

for (const slug of ['kin', 'dred']) {
  test(`${slug} memory map requires a leader session before fetching adult memories`, async () => {
    const path = `/api/world/chat/${slug}/memory`;
    let calls = 0;
    const options = {
      env,
      canon,
      slug,
      limiter: createLimiter(),
      ...isolated(),
      fetch: leaderFetch(leaderId, () => {
        calls += 1;
        return new Response(
          JSON.stringify(page({ points: [{ ...map.points[0], origin: 'leader_adult' }] }))
        );
      }),
    };
    const signed = await handleWorldMemory(request(path, signedIn), options);
    assert.equal(signed.status, 200);
    const body = await signed.json();
    assert.equal(body.points.length, slug === 'dred' ? 1 : 0);
    if (slug === 'dred') assert.equal(body.points[0].origin, 'leader_adult');
    const anonymous = await handleWorldMemory(request(path), options);
    assert.equal(anonymous.status, 401);
    assert.equal(calls, 1);
    assert.equal((await anonymous.text()).includes('leader_adult'), false);
  });
}

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
  const response = await handleWorldMemory(
    request('/api/world/chat/kin/memory', signedIn),
    options
  );
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
            points: [{ id: 'old', kind: 'knowledge', label: 'old', x: 1, y: 0, z: 0 }],
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
  assert.deepEqual(shifted, [
    '2026-11-22T00:00:00.000Z|',
    '2026-11-22T00:00:00.000Z|cursor-2',
    '|',
  ]);
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
