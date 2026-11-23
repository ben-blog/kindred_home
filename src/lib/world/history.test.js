import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCanon } from '../../../world/load.js';
import { createLimiter } from '../proxy.js';
import { HISTORY_TIMEOUT_MS, handleWorldHistory, historyPath, parseMemoryHistory } from './history.js';

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
const from = '2000-01-01T00:00:00.000Z';
const to = '2026-11-23T00:00:00.000Z';

function row(extra) {
  return {
    id: 'r1',
    kind: 'reflection',
    createdAt: '2026-11-02T00:00:00.000Z',
    snippet: 'a note',
    x: 0.2,
    y: 0.1,
    z: 0.4,
    placement: 'reflection-shell',
    ...extra,
  };
}

function page(extra) {
  return {
    character: 'someone',
    from,
    to,
    limit: 5000,
    returned: 1,
    total: 1,
    truncated: false,
    nextCursor: null,
    basisVersion: 3,
    basisFingerprint: 'abc123def456',
    kinds: ['experience', 'reflection'],
    rows: [row()],
    meta: {
      removedSupported: false,
      weakeningSupported: 'current',
      snapshotsSupported: false,
      removalNote: 'secret upstream note',
      token: 'kin-admin-key-0123456789',
    },
    secret: 'nope',
    ...extra,
  };
}

test('history path stays beside the memory map', () => {
  assert.equal(historyPath('/api/kin/memory/map'), '/api/kin/memory/history');
  assert.equal(historyPath('/api/dred/memory/map'), '/api/dred/memory/history');
  assert.equal(historyPath('/api/kin/memory'), '');
});

test('the history adapter keeps snippets, reflections, and current metrics', () => {
  const parsed = parseMemoryHistory(
    page({
      rows: [
        row({
          snippet: `  hello\n${'x'.repeat(400)}`,
          importance: '0.8',
          strength: 0.2,
          decay: 0.4,
          weight: 0.08,
          removedAt: '2026-11-20T00:00:00.000Z',
          prompt: 'hidden',
          token: 'kin-admin-key-0123456789',
        }),
        { id: 'bad', kind: 'reflection', createdAt: 'yesterday', x: 1, y: 0, z: 0 },
        { id: 'flat', kind: 'nope', createdAt: '2026-11-01T00:00:00.000Z', x: 1, y: 0, z: 0 },
      ],
    }),
    'kin'
  );
  assert.equal(parsed.character, 'kin');
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].kind, 'reflection');
  assert.equal(parsed.rows[0].placement, 'reflection-shell');
  assert.equal(parsed.rows[0].x, 0.2);
  assert.equal(parsed.rows[0].snippet.length, 300);
  assert.equal(parsed.rows[0].importance, 0.8);
  assert.equal(parsed.rows[0].strength, 0.2);
  assert.equal(parsed.rows[0].removedAt, '2026-11-20T00:00:00.000Z');
  assert.equal(parsed.meta.removedSupported, false);
  assert.equal(parsed.meta.weakeningSupported, 'current');
  assert.equal(parsed.meta.snapshotsSupported, false);
  assert.equal(JSON.stringify(parsed).includes('hidden'), false);
  assert.equal(JSON.stringify(parsed).includes('kin-admin-key'), false);
  assert.equal(JSON.stringify(parsed).includes('secret'), false);
  assert.equal(parseMemoryHistory({ rows: 'nope' }, 'kin'), null);
});

test('history fails closed without a session, a route, or a safe window', async () => {
  const closed = await handleWorldHistory(
    request(`/api/world/brain/kin/history?from=${from}&to=${to}`, signedIn),
    { canon, slug: 'kin', env: {} }
  );
  assert.equal(closed.status, 503);

  const anonymous = await handleWorldHistory(
    request(`/api/world/brain/kin/history?from=${from}&to=${to}`),
    { env, canon, slug: 'kin', limiter: createLimiter() }
  );
  assert.equal(anonymous.status, 401);

  const bad = await handleWorldHistory(
    request('/api/world/brain/kin/history?from=yesterday&to=today', signedIn),
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
  assert.equal(bad.status, 400);

  let called = false;
  const down = await handleWorldHistory(
    request(`/api/world/brain/kin/history?from=${from}&to=${to}`, signedIn),
    {
      env,
      canon,
      slug: 'kin',
      limiter: createLimiter(),
      cache: new Map(),
      inflight: new Map(),
      upstreamLimiter: createLimiter({ limit: 10, windowMs: 60_000 }),
      fetch: leaderFetch(leaderId, () => {
        called = true;
        return new Response('no', { status: 404 });
      }),
    }
  );
  assert.equal(down.status, 502);
  assert.equal(called, true);
  assert.equal(await down.text(), '{"error":"unavailable"}');
});

test('history follows nextCursor and keeps the agent token on the server', async () => {
  const calls = [];
  const fetch = leaderFetch(leaderId, async (href) => {
    const url = new URL(href);
    calls.push(`${url.pathname}?${url.searchParams.toString()}`);
    const cursor = url.searchParams.get('cursor');
    if (!cursor) {
      return new Response(
        JSON.stringify(
          page({
            truncated: true,
            nextCursor: 'cursor-1',
            rows: [row({ id: 'a' }), row({ id: 'b', kind: 'knowledge', placement: 'basis', x: 1, y: 0, z: 0 })],
          })
        ),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    return new Response(
      JSON.stringify(
        page({
          nextCursor: null,
          rows: [row({ id: 'b', kind: 'knowledge' }), row({ id: 'c', kind: 'experience', x: 0, y: 1, z: 0 })],
        })
      ),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  });
  const response = await handleWorldHistory(
    request(`/api/world/brain/kin/history?from=${from}&to=${to}`, signedIn),
    {
      env,
      canon,
      slug: 'kin',
      limiter: createLimiter(),
      cache: new Map(),
      inflight: new Map(),
      upstreamLimiter: createLimiter({ limit: 10, windowMs: 60_000 }),
      fetch,
    }
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(
    body.rows.map((item) => item.id),
    ['a', 'b', 'c']
  );
  assert.equal(body.source, 'history');
  assert.equal(body.nextCursor, null);
  assert.equal(calls.length, 2);
  assert.match(calls[0], /\/api\/kin\/memory\/history\?/);
  assert.match(calls[0], /limit=5000/);
  assert.equal(calls[0].includes('kin-admin-key'), false);
  const headerCheck = await handleWorldHistory(
    request(`/api/world/brain/dred/history?from=${from}&to=${to}`, signedIn),
    {
      env,
      canon,
      slug: 'dred',
      limiter: createLimiter(),
      cache: new Map(),
      inflight: new Map(),
      upstreamLimiter: createLimiter({ limit: 10, windowMs: 60_000 }),
      fetch: leaderFetch(leaderId, async (_href, init) => {
        assert.equal(init.headers.get('authorization'), 'Bearer dred-admin-key-0123456789');
        assert.equal(init.headers.get('x-admin-key'), 'dred-admin-key-0123456789');
        return new Response(JSON.stringify(page({ rows: [] })), { status: 200 });
      }),
    }
  );
  assert.equal(headerCheck.status, 200);
});

test('a slow history page is not aborted at 12 seconds, and a second page waits for time', async () => {
  assert.equal(HISTORY_TIMEOUT_MS >= 45_000, true);
  let upstreams = 0;
  let clock = 0;
  const response = await handleWorldHistory(
    request(`/api/world/brain/kin/history?from=${from}&to=${to}`, signedIn),
    {
      env,
      canon,
      slug: 'kin',
      limiter: createLimiter(),
      cache: new Map(),
      inflight: new Map(),
      upstreamLimiter: createLimiter({ limit: 10, windowMs: 60_000 }),
      timeoutMs: 50_000,
      now: () => clock,
      fetch: leaderFetch(leaderId, async () => {
        upstreams += 1;
        clock = 45_000;
        return new Response(
          JSON.stringify(page({ truncated: true, nextCursor: 'cursor-1', rows: [row({ id: 'only' })] })),
          { status: 200 }
        );
      }),
    }
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(upstreams, 1);
  assert.equal(body.truncated, true);
  assert.equal(body.rows.length, 1);
  assert.equal(body.source, 'history');
});
