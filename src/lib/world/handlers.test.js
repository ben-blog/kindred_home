import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadCanon } from '../../../world/load.js';
import { createState } from '../../../world/state.js';
import { hashIp } from './hash.js';
import {
  handleWorldGet,
  handleWorldIngest,
  handleWorldMagic,
  handleWorldSession,
  handleWorldSignal,
  handleWorldTick,
} from './handlers.js';
import { USER_AGENT } from './sources/common.js';

const canon = loadCanon();
const leaderId = '11111111-1111-4111-8111-111111111111';
const env = {
  WORLD_SUPABASE_URL: 'https://world.example.test',
  WORLD_SUPABASE_SERVICE_KEY: 'service-key-0123456789abcdef',
  WORLD_SUPABASE_ANON_KEY: 'anon-key-0123456789abcdef',
  WORLD_LEADER_USER_ID: leaderId,
  WORLD_IP_SALT: 'ip-salt-0123456789',
  CRON_SECRET: 'cron-secret-0123456789',
};
const lyric = 'verse one that must never be stored in the world';

function fixture(name) {
  return JSON.parse(
    readFileSync(new URL(`./sources/fixtures/${name}.json`, import.meta.url), 'utf8')
  );
}

function request(path, { method = 'GET', body, headers = {}, cookie } = {}) {
  const init = { method, headers: { ...headers } };
  if (cookie) init.headers.cookie = cookie;
  if (body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  return new Request(`https://kinxdred.com${path}`, init);
}

function base(extra = {}) {
  return { env, canon, ...extra };
}

test('world endpoints fail closed when any env var is missing or unsafe', async () => {
  const handlers = [
    handleWorldGet,
    handleWorldSignal,
    handleWorldTick,
    handleWorldIngest,
    handleWorldMagic,
    handleWorldSession,
  ];
  for (const handle of handlers) {
    const closed = await handle(request('/api/world', { method: 'POST' }), { canon, env: {} });
    assert.equal(closed.status, 503);
    assert.equal(await closed.text(), '{"error":"unavailable"}');
  }
  const unsafe = await handleWorldGet(request('/api/world'), {
    canon,
    env: { ...env, WORLD_SUPABASE_URL: 'http://world.example.test' },
  });
  assert.equal(unsafe.status, 503);
  const missingCron = await handleWorldGet(request('/api/world'), {
    canon,
    env: { ...env, CRON_SECRET: '' },
  });
  assert.equal(missingCron.status, 503);
});

test('GET /api/world returns the public snapshot and hides the log', async () => {
  const state = createState(canon);
  state.log.push({ id: 'secret', who: 'visitor:abcdef123456', what: 'influence' });
  state.pending.push({ id: 'wait', who: 'visitor:abcdef123456', what: 'influence' });
  let called = false;
  const response = await handleWorldGet(
    request('/api/world'),
    base({
      store: {
        async latest() {
          called = true;
          return { state };
        },
      },
    })
  );
  assert.equal(called, true);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.tick, 0);
  assert.equal(body.leaderSlug, 'ben');
  assert.equal(body.pending, 1);
  assert.equal(body.characters.kin.status, 'active');
  assert.equal(body.log, undefined);
  assert.equal(JSON.stringify(body).includes('visitor:'), false);
});

test('a signal is same-origin, capped at 2KB, rate limited, and stores a hashed address', async () => {
  const saved = [];
  const store = {
    async append(event) {
      saved.push(event);
      return { ok: true, duplicate: false };
    },
  };
  const ip = '203.0.113.8';
  const ok = await handleWorldSignal(
    request('/api/world/signal', {
      method: 'POST',
      headers: { origin: 'https://kinxdred.com', 'x-real-ip': ip },
      body: { target: 'kin', amount: 1, where: '/characters/kin' },
    }),
    base({ store, id: 'sig-1', now: () => Date.parse('2026-11-22T00:00:00.000Z') })
  );
  assert.equal(ok.status, 200);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].source, 'visitor-influence');
  assert.equal(saved[0].target, 'kin');
  assert.equal(saved[0].payload.amount, 1);
  assert.equal(saved[0].ipHash, hashIp(ip, env.WORLD_IP_SALT));
  assert.equal(saved[0].who, `visitor:${saved[0].ipHash.slice(0, 12)}`);
  assert.equal(JSON.stringify(saved[0]).includes(ip), false);

  const cross = await handleWorldSignal(
    request('/api/world/signal', {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'x-real-ip': ip },
      body: { target: 'kin' },
    }),
    base({ store })
  );
  assert.equal(cross.status, 403);
  assert.equal(saved.length, 1);

  const archived = structuredClone(canon);
  archived.characters.push({ slug: 'old', status: 'archived' });
  const dropped = await handleWorldSignal(
    request('/api/world/signal', {
      method: 'POST',
      headers: { origin: 'https://kinxdred.com' },
      body: { target: 'old' },
    }),
    base({ canon: archived, store })
  );
  assert.equal(dropped.status, 400);

  const huge = await handleWorldSignal(
    request('/api/world/signal', {
      method: 'POST',
      headers: { origin: 'https://kinxdred.com' },
      body: { target: 'kin', note: 'x'.repeat(2100) },
    }),
    base({ store })
  );
  assert.equal(huge.status, 413);

  const limited = await handleWorldSignal(
    request('/api/world/signal', {
      method: 'POST',
      headers: { origin: 'https://kinxdred.com' },
      body: { target: 'dred', amount: 9 },
    }),
    base({ store })
  );
  assert.equal(limited.status, 400);

  const memory = await handleWorldSignal(
    request('/api/world/signal', {
      method: 'POST',
      headers: { origin: 'https://kinxdred.com' },
      body: { target: 'kin' },
    }),
    base({ store, limiter: { allow: () => false } })
  );
  assert.equal(memory.status, 429);
  assert.equal(saved.length, 1);

  const database = await handleWorldSignal(
    request('/api/world/signal', {
      method: 'POST',
      headers: { origin: 'https://kinxdred.com' },
      body: { target: 'kin' },
    }),
    base({
      store: { append: async () => ({ ok: false, error: 'rate_limited' }) },
    })
  );
  assert.equal(database.status, 429);
});

test('tick requires the leader and returns 409 when a tick is already running', async () => {
  const anonymous = await handleWorldTick(
    request('/api/world/tick', { method: 'POST', headers: { origin: 'https://kinxdred.com' } }),
    base({
      store: {
        begin() {
          throw new Error('should not run');
        },
      },
    })
  );
  assert.equal(anonymous.status, 401);

  const stranger = await handleWorldTick(
    request('/api/world/tick', {
      method: 'POST',
      headers: { origin: 'https://kinxdred.com' },
      cookie: 'world_access=leader.access.token',
    }),
    base({
      fetch: async () =>
        new Response(JSON.stringify({ id: '22222222-2222-4222-8222-222222222222' }), {
          status: 200,
        }),
      store: {
        begin() {
          throw new Error('should not run');
        },
      },
    })
  );
  assert.equal(stranger.status, 403);

  let committed = false;
  const busy = await handleWorldTick(
    request('/api/world/tick', {
      method: 'POST',
      headers: { origin: 'https://kinxdred.com' },
      cookie: 'world_access=leader.access.token',
    }),
    base({
      fetch: leaderFetch(leaderId),
      store: {
        async begin() {
          return { acquired: false };
        },
        async commit() {
          committed = true;
        },
      },
    })
  );
  assert.equal(busy.status, 409);
  assert.deepEqual(await busy.json(), { error: 'busy' });
  assert.equal(committed, false);

  const commits = [];
  const ran = await handleWorldTick(
    request('/api/world/tick', {
      method: 'POST',
      headers: { origin: 'https://kinxdred.com' },
      cookie: 'world_access=leader.access.token',
    }),
    base({
      id: 'tick-1',
      now: () => Date.parse('2026-11-22T12:00:00.000Z'),
      fetch: leaderFetch(leaderId),
      store: {
        async begin() {
          return {
            acquired: true,
            token: 'lock-token',
            snapshot: null,
            lastEventSeq: 0,
            events: [
              {
                seq: 3,
                id: 'inf-kin',
                worldId: 'kinxdred',
                at: '2026-11-22T01:00:00.000Z',
                who: 'visitor:abc',
                what: 'influence',
                target: 'kin',
                payload: { kind: 'warmth', amount: 1 },
                source: 'visitor-influence',
              },
            ],
          };
        },
        async commit(args) {
          commits.push(args);
          return { ok: true, tick: args.tick };
        },
        async abort() {
          throw new Error('should not abort');
        },
      },
    })
  );
  assert.equal(ran.status, 200);
  assert.equal((await ran.json()).tick, 1);
  assert.equal(commits.length, 1);
  assert.equal(commits[0].state.tick, 1);
  assert.equal(commits[0].state.characters.kin.xp, 1);
  assert.equal(commits[0].lastEventSeq, 3);
  assert.equal(commits[0].input.at(-1).what, 'tick');
  assert.equal(commits[0].input.at(-1).who, 'ben');
  assert.equal(commits[0].before.tick, 0);
});

test('ingest accepts only the cron secret and parses fixtures offline', async () => {
  const closed = await handleWorldIngest(request('/api/world/ingest'), base());
  assert.equal(closed.status, 401);
  const wrong = await handleWorldIngest(
    request('/api/world/ingest', { headers: { authorization: 'Bearer not-the-secret' } }),
    base()
  );
  assert.equal(wrong.status, 401);

  const appended = [];
  const runs = [];
  const calls = [];
  const response = await handleWorldIngest(
    request('/api/world/ingest', { headers: { authorization: `Bearer ${env.CRON_SECRET}` } }),
    base({
      now: () => Date.parse('2026-11-22T15:00:00.000Z'),
      store: {
        async append(event) {
          appended.push(event);
          return { ok: true, duplicate: false };
        },
        async recordRun(row) {
          runs.push(row);
        },
      },
      fetch: async (url, init) => {
        const href = String(url);
        calls.push({ href, init });
        if (href.includes('graphql.anilist.co')) {
          return new Response(JSON.stringify(fixture('anilist')), { status: 200 });
        }
        if (href.includes('musicbrainz.org')) {
          return new Response(JSON.stringify(fixture('musicbrainz')), { status: 200 });
        }
        if (href.includes('api.open-meteo.com')) {
          return new Response(JSON.stringify(fixture('open-meteo')), { status: 200 });
        }
        throw new Error(href);
      },
    })
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(
    body.sources.every((source) => source.ok),
    true
  );
  assert.equal(
    appended.some((event) => event.payload.kind === 'new_song'),
    true
  );
  assert.equal(
    appended.some((event) => event.payload.kind === 'anime_release'),
    true
  );
  assert.equal(
    appended.some((event) => event.payload.kind === 'season'),
    true
  );
  assert.equal(JSON.stringify(appended).includes(lyric), false);
  assert.equal(runs.length, canon.sources.filter((source) => source.fetch).length);
  const music = calls.find((call) => call.href.includes('musicbrainz.org'));
  assert.equal(music.init.headers['user-agent'], USER_AGENT);
  const weather = canon.sources.find((source) => source.provider === 'open-meteo');
  const meteo = calls.find((call) => call.href.includes('api.open-meteo.com'));
  assert.equal(new URL(meteo.href).searchParams.get('latitude'), String(weather.latitude));
});

test('magic link uses the anon key on the server and the session cookie is httpOnly', async () => {
  const calls = [];
  const sent = await handleWorldMagic(
    request('/api/world/auth/magic', {
      method: 'POST',
      headers: { origin: 'https://kinxdred.com' },
      body: { email: 'leader@example.test' },
    }),
    base({
      fetch: async (url, init) => {
        calls.push({ url: String(url), init });
        return new Response('{}', { status: 200 });
      },
    })
  );
  assert.equal(sent.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers.apikey, env.WORLD_SUPABASE_ANON_KEY);
  assert.equal(calls[0].init.headers.authorization, `Bearer ${env.WORLD_SUPABASE_ANON_KEY}`);
  assert.equal(calls[0].init.headers.authorization.includes(env.WORLD_SUPABASE_SERVICE_KEY), false);
  assert.equal(JSON.parse(calls[0].init.body).create_user, false);
  const redirect = new URL(calls[0].url).searchParams.get('redirect_to');
  assert.equal(redirect, 'https://kinxdred.com/world/admin');

  const cross = await handleWorldMagic(
    request('/api/world/auth/magic', {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
      body: { email: 'leader@example.test' },
    }),
    base({
      fetch: async () => {
        throw new Error('should not send');
      },
    })
  );
  assert.equal(cross.status, 403);

  const session = await handleWorldSession(
    request('/api/world/auth/session', {
      method: 'POST',
      headers: { origin: 'https://kinxdred.com' },
      body: { tokenHash: 'one-time-token', type: 'magiclink' },
    }),
    base({
      fetch: async () =>
        new Response(
          JSON.stringify({
            access_token: 'access.token.value',
            refresh_token: 'refresh.token.value',
            expires_in: 3600,
            user: { id: leaderId },
          }),
          { status: 200 }
        ),
    })
  );
  assert.equal(session.status, 200);
  const cookies = session.headers.getSetCookie();
  assert.equal(
    cookies.some((cookie) => cookie.startsWith('world_access=access.token.value')),
    true
  );
  assert.equal(
    cookies.every((cookie) => cookie.includes('HttpOnly')),
    true
  );
  assert.equal(
    cookies.every((cookie) => cookie.includes('Secure')),
    true
  );
  assert.equal(JSON.stringify(cookies).includes(env.WORLD_SUPABASE_SERVICE_KEY), false);

  const other = await handleWorldSession(
    request('/api/world/auth/session', {
      method: 'POST',
      headers: { origin: 'https://kinxdred.com' },
      body: { tokenHash: 'one-time-token', type: 'magiclink' },
    }),
    base({
      fetch: async () =>
        new Response(
          JSON.stringify({
            access_token: 'access.token.value',
            refresh_token: 'refresh.token.value',
            user: { id: '22222222-2222-4222-8222-222222222222' },
          }),
          { status: 200 }
        ),
    })
  );
  assert.equal(other.status, 403);
  const denied = other.headers.getSetCookie().join('\n');
  assert.equal(denied.includes('world_access=access.token.value'), false);
});

function leaderFetch(id) {
  return async (url) => {
    const href = String(url);
    if (href.endsWith('/auth/v1/user')) {
      return new Response(JSON.stringify({ id }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(href);
  };
}
