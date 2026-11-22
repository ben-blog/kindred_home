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
  basisVersion: 'v1',
  total: 2,
  secret: 'nope',
  points: [
    {
      id: 'a',
      kind: 'Note',
      label: 'the late bus',
      createdAt: '2026-11-22T00:00:00.000Z',
      x: 0,
      y: 1,
      z: 0,
      prompt: 'hidden',
    },
    { id: 'b', kind: 'song', label: 'x'.repeat(200), x: 3, y: 0, z: 0 },
  ],
};

test('the memory adapter keeps the public shape and drops secrets', () => {
  const parsed = parseMemoryMap(map, 'kin');
  assert.equal(parsed.character, 'kin');
  assert.equal(parsed.basisVersion, 'v1');
  assert.equal(parsed.points[0].kind, 'note');
  assert.equal(parsed.points[0].y, 1);
  assert.equal(parsed.points[1].label.length, 80);
  assert.equal(JSON.stringify(parsed).includes('hidden'), false);
  assert.equal(JSON.stringify(parsed).includes('nope'), false);
  assert.equal(
    parseMemoryMap({ points: [{ id: 'a', kind: 'note', x: 0, y: 0, z: 0 }] }, 'kin').points.length,
    0
  );

  const retrieved = parseTrace({
    stage: 'retrieved',
    items: [{ id: 'a', kind: 'note', label: 'bus', score: 0.5, system: 'prompt' }],
  });
  assert.deepEqual(retrieved.items[0], { id: 'a', kind: 'note', label: 'bus', score: 0.5 });
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
      'https://kin-agent.example.test/api/kin/memory/map?since=2026-11-22T00%3A00%3A00.000Z'
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
    { env, canon, slug: 'kin', limiter: createLimiter(), fetch }
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
    fetch: leaderFetch(
      leaderId,
      async () => new Response('{"error":"https://secret.railway.app"}', { status: 500 })
    ),
  });
  assert.equal(down.status, 502);
  assert.equal(await down.text(), '{"error":"unavailable"}');
});
