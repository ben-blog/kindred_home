import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { characterSchema, agentUpstreamKeys } from '../../world/schema.js';
import { loadCanon, repoRoot } from '../../world/load.js';
import {
  BODY_LIMIT,
  RATE_LIMIT,
  agentRoutes,
  clientAddress,
  createLimiter,
  handleEventRequest,
  handleScopedRequest,
  upstreamTokens,
} from './proxy.js';

const canon = loadCanon();
const kinEvent = {
  service: 'gallery',
  event_type: 'gallery_visit',
  payload: { item_count: 23, lang: 'ko' },
  timestamp: '2026-11-22T03:17:00.123Z',
};

test('upstream keys and token names stay paired', () => {
  assert.deepEqual(Object.keys(upstreamTokens), [...agentUpstreamKeys]);
  for (const key of agentUpstreamKeys) assert.match(upstreamTokens[key], /_TOKEN$/);
});

test('canon routes come from character files, not a fixed cast', () => {
  const routes = agentRoutes(canon.characters);
  assert.equal(routes.get('kin').upstream, 'KIN_AGENT_URL');
  assert.equal(routes.get('kin').path, '/api/kin/event');
  assert.deepEqual(routes.get('kin').methods, ['POST']);
  assert.equal(routes.get('dred').upstream, 'DRED_AGENT_URL');
  assert.equal(routes.get('dred').path, '/api/dred/event');
  assert.equal(routes.has('ben'), false);

  const withThird = agentRoutes([
    ...canon.characters,
    character('mira', 'MIRRORED_API_URL'),
    character('drafty', 'KIN_AGENT_URL', 'draft'),
    character('retired', 'DRED_AGENT_URL', 'archived'),
  ]);
  assert.equal(withThird.get('mira').path, '/api/mira/event');
  assert.equal(withThird.get('mira').token, 'MIRRORED_API_TOKEN');
  assert.equal(withThird.has('drafty'), false);
  assert.equal(withThird.get('retired').upstream, 'DRED_AGENT_URL');
});

test('a character cannot point the proxy at an arbitrary env var or path', () => {
  const routes = agentRoutes([
    character('mira', 'SUPABASE_SERVICE_ROLE_KEY'),
    {
      slug: 'kin',
      status: 'active',
      agent: {
        service: 'kin-agent',
        upstream: 'KIN_AGENT_URL',
        path: '/api/dred/event',
        methods: ['POST'],
      },
    },
    {
      slug: 'nova',
      status: 'active',
      agent: {
        service: 'nova-agent',
        upstream: 'KIN_AGENT_URL',
        path: '/api/nova/event',
        methods: ['GET'],
      },
    },
  ]);
  assert.equal(routes.size, 0);

  const kin = structuredClone(canon.characters.find((item) => item.slug === 'kin'));
  kin.agent.path = '/api/dred/event';
  assert.equal(characterSchema.safeParse(kin).success, false);
});

test('current hub payloads are forwarded unchanged to the character upstream', async () => {
  const samples = [
    {
      slug: 'kin',
      event: {
        service: 'gallery',
        event_type: 'image_click',
        payload: { filename: 'kin_g3_bus_risograph.webp', title: 'Two Stops Away', index: 1 },
        timestamp: '2026-11-22T03:17:00.123Z',
      },
    },
    {
      slug: 'kin',
      event: {
        service: 'gallery',
        event_type: 'image_liked',
        payload: { item_id: 'kin_g3_bus_risograph', filename: 'kin_g3_bus_risograph.webp' },
        timestamp: '2026-11-22T03:17:00.123Z',
      },
    },
    { slug: 'kin', event: kinEvent },
    {
      slug: 'dred',
      event: {
        service: 'gallery',
        event_type: 'image_viewed',
        payload: { item_id: 4, title: 'rain', style: 'G — Risograph Print', lang: 'en' },
      },
    },
    {
      slug: 'dred',
      event: {
        service: 'gallery',
        event_type: 'image_liked',
        payload: { item_id: '4', title: 'rain', style: null, lang: 'ko' },
      },
    },
    {
      slug: 'dred',
      event: {
        service: 'd14',
        event_type: 'message_generated',
        payload: {
          hour: 3,
          day: 0,
          period_name: 'dawn',
          lang: 'ko',
          moon: 'new',
          season: 'winter',
          message: '아무것도 끝나지 않은 채로 새벽이 왔어.',
        },
      },
    },
  ];

  for (const sample of samples) {
    const seen = [];
    const response = await postEvent(sample, {
      characters: canon.characters,
      env: {
        KIN_AGENT_URL: 'https://kin.example',
        DRED_AGENT_URL: 'https://dred.example/',
      },
      fetch: async (url, init) => {
        seen.push({ url, init });
        return new Response(JSON.stringify({ echoed: 'secret-stack' }), { status: 200 });
      },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    const upstream = sample.slug === 'kin' ? 'https://kin.example' : 'https://dred.example';
    assert.equal(seen[0].url, `${upstream}/api/${sample.slug}/event`);
    assert.equal(seen[0].init.method, 'POST');
    assert.equal(seen[0].init.redirect, 'manual');
    assert.deepEqual(JSON.parse(seen[0].init.body), sample.event);
    assert.equal(seen[0].init.headers.get('cookie'), null);
    assert.equal(seen[0].init.headers.get('connection'), null);
    assert.equal(seen[0].init.headers.get('authorization'), null);
  }
});

test('a third character follows its own upstream key', async () => {
  const seen = [];
  const response = await postEvent(
    {
      slug: 'mira',
      event: {
        service: 'gallery',
        event_type: 'gallery_visit',
        payload: { item_count: 1, lang: 'en' },
      },
    },
    {
      characters: [character('mira', 'MIRRORED_API_URL'), ...canon.characters],
      env: { MIRRORED_API_URL: 'https://mira.example', MIRRORED_API_TOKEN: 'mira-token' },
      fetch: async (url, init) => {
        seen.push({ url, authorization: init.headers.get('authorization') });
        return new Response(null, { status: 204 });
      },
    }
  );
  assert.equal(response.status, 200);
  assert.equal(seen[0].url, 'https://mira.example/api/mira/event');
  assert.equal(seen[0].authorization, 'Bearer mira-token');
  assert.equal((await response.text()).includes('mira-token'), false);
});

test('the scoped path forwards only the allowlisted path and the raw event', async () => {
  const seen = [];
  const ok = await postScoped('/api/kin/event', kinEvent, {
    fetch: async (url, init) => {
      seen.push({ url, body: init.body, cookie: init.headers.get('cookie') });
      return new Response('{"ok":true}', { status: 200 });
    },
  });
  assert.equal(ok.status, 200);
  assert.equal(seen[0].url, 'https://kin.example/api/kin/event');
  assert.deepEqual(JSON.parse(seen[0].body), kinEvent);
  assert.equal(seen[0].cookie, null);

  const missing = await postScoped('/api/kin/admin', kinEvent, {
    fetch: async () => {
      throw new Error('should not forward');
    },
  });
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: 'not found' });

  const encoded = await handleScopedRequest(
    new Request('https://kinxdred.com/api/kin/%2e%2e/secret', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(kinEvent),
    }),
    base({
      fetch: async () => {
        throw new Error('should not forward');
      },
    })
  );
  assert.equal(encoded.status, 404);
});

test('client hop-by-hop, cookie, and authorization headers are not forwarded', async () => {
  let sent;
  const response = await handleEventRequest(
    request(
      '/api/event',
      { slug: 'kin', event: kinEvent },
      {
        cookie: 'session=secret',
        connection: 'keep-alive',
        authorization: 'Bearer client-secret',
        'x-forwarded-for': '1.2.3.4',
        upgrade: 'websocket',
      }
    ),
    {
      characters: canon.characters,
      env: { KIN_AGENT_URL: 'https://kin.example', KIN_AGENT_TOKEN: 'server-token' },
      limiter: createLimiter(),
      fetch: async (_url, init) => {
        sent = init.headers;
        return new Response('Error: SECRET_STACK\n    at hidden', { status: 200 });
      },
    }
  );
  assert.equal(sent.get('cookie'), null);
  assert.equal(sent.get('connection'), null);
  assert.equal(sent.get('upgrade'), null);
  assert.equal(sent.get('x-forwarded-for'), null);
  assert.equal(sent.get('authorization'), 'Bearer server-token');
  const text = await response.text();
  assert.equal(text.includes('client-secret'), false);
  assert.equal(text.includes('server-token'), false);
  assert.equal(text.includes('SECRET_STACK'), false);
});

test('missing or unsafe upstream config fails closed and does not call out', async () => {
  const cases = [
    {},
    { KIN_AGENT_URL: '' },
    { KIN_AGENT_URL: 'http://kin.example' },
    { KIN_AGENT_URL: 'https://user:pass@kin.example' },
    { KIN_AGENT_URL: 'https://kin.example/api' },
    { KIN_AGENT_URL: 'https://kin.example', KIN_AGENT_TOKEN: 'bad token\n' },
  ];
  for (const env of cases) {
    let called = false;
    const response = await postEvent(
      { slug: 'kin', event: kinEvent },
      {
        env,
        fetch: async () => {
          called = true;
          return new Response('{}', { status: 200 });
        },
      }
    );
    assert.equal(called, false);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'unavailable' });
  }
});

test('upstream failures stay generic', async () => {
  const response = await postEvent(
    { slug: 'kin', event: kinEvent },
    {
      fetch: async () =>
        new Response('Error: SECRET_STACK\n    at Function.execute', { status: 500 }),
    }
  );
  assert.equal(response.status, 502);
  const text = await response.text();
  assert.equal(text.includes('SECRET_STACK'), false);
  assert.deepEqual(JSON.parse(text), { error: 'unavailable' });

  const redirected = await postEvent(
    { slug: 'kin', event: kinEvent },
    {
      fetch: async () =>
        new Response('go', { status: 302, headers: { location: 'https://evil.example/steal' } }),
    }
  );
  const redirectText = await redirected.text();
  assert.equal(redirected.status, 502);
  assert.equal(redirectText.includes('evil.example'), false);
  assert.equal(redirected.headers.get('location'), null);

  const aborted = await postEvent(
    { slug: 'kin', event: kinEvent },
    {
      fetch: async (_url, init) => {
        assert.ok(init.signal);
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        throw error;
      },
    }
  );
  assert.equal(aborted.status, 502);
  assert.deepEqual(await aborted.json(), { error: 'unavailable' });
});

test('method, origin, shape, and size are rejected before an upstream call', async () => {
  const fetch = async () => {
    throw new Error('should not forward');
  };
  const get = await handleEventRequest(new Request('https://kinxdred.com/api/event'), {
    characters: canon.characters,
    env: { KIN_AGENT_URL: 'https://kin.example' },
    limiter: createLimiter(),
    fetch,
  });
  assert.equal(get.status, 405);

  const foreign = await handleEventRequest(
    request('/api/event', { slug: 'kin', event: kinEvent }, { origin: 'https://evil.example' }),
    base({ fetch })
  );
  assert.equal(foreign.status, 403);
  assert.equal(foreign.headers.get('access-control-allow-origin'), null);

  const same = await handleEventRequest(
    request('/api/event', { slug: 'kin', event: kinEvent }, { origin: 'https://kinxdred.com' }),
    base({
      fetch: async () => new Response('{}', { status: 200 }),
    })
  );
  assert.equal(same.status, 200);
  assert.equal(same.headers.get('access-control-allow-origin'), 'https://kinxdred.com');

  const unknown = await postEvent({ slug: 'nope', event: kinEvent }, { fetch });
  assert.equal(unknown.status, 404);

  const extra = await postEvent({ slug: 'kin', event: kinEvent, note: 'x' }, { fetch });
  assert.equal(extra.status, 400);

  const nested = await postEvent(
    { slug: 'kin', event: { ...kinEvent, payload: { item_count: { n: 1 } } } },
    { fetch }
  );
  assert.equal(nested.status, 400);

  const huge = 'x'.repeat(BODY_LIMIT + 1);
  const oversized = await handleEventRequest(
    new Request('https://kinxdred.com/api/event', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': String(huge.length) },
      body: huge,
    }),
    base({ fetch })
  );
  assert.equal(oversized.status, 413);
  assert.deepEqual(await oversized.json(), { error: 'too large' });
});

test('per-IP rate limit is best-effort and shared across characters', async () => {
  const limiter = createLimiter({ limit: RATE_LIMIT, windowMs: 60_000 });
  let now = 1_000;
  const deps = {
    characters: [character('mira', 'MIRRORED_API_URL'), ...canon.characters],
    env: { KIN_AGENT_URL: 'https://kin.example', MIRRORED_API_URL: 'https://mira.example' },
    limiter,
    now: () => now,
    fetch: async () => new Response('{}', { status: 200 }),
  };
  for (let i = 0; i < RATE_LIMIT; i += 1) {
    const slug = i % 2 === 0 ? 'kin' : 'mira';
    const response = await postEvent({ slug, event: kinEvent }, deps);
    assert.equal(response.status, 200);
  }
  const blocked = await postEvent({ slug: 'kin', event: kinEvent }, deps);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('retry-after'), '60');

  const otherIp = await handleEventRequest(
    request('/api/event', { slug: 'kin', event: kinEvent }, { 'x-real-ip': '203.0.113.8' }),
    deps
  );
  assert.equal(otherIp.status, 200);

  now += 60_000;
  const again = await postEvent({ slug: 'kin', event: kinEvent }, deps);
  assert.equal(again.status, 200);
});

test('client address prefers the platform IP over a spoofed first hop', () => {
  const request = new Request('https://kinxdred.com/api/event', {
    headers: { 'x-real-ip': '203.0.113.9', 'x-forwarded-for': '1.1.1.1, 198.51.100.4' },
  });
  assert.equal(clientAddress(request), '203.0.113.9');
  const forwarded = new Request('https://kinxdred.com/api/event', {
    headers: { 'x-real-ip': 'nope', 'x-forwarded-for': '1.1.1.1, 198.51.100.4' },
  });
  assert.equal(clientAddress(forwarded), '198.51.100.4');
  const v6 = new Request('https://kinxdred.com/api/event', {
    headers: { 'x-real-ip': '2001:db8::1' },
  });
  assert.equal(clientAddress(v6), '2001:db8::1');
});

test('the browser and content do not carry railway hosts or service keys', () => {
  const banned = ['railway.app', 'supabase.co', 'service_role', 'eyJhbGci'];
  for (const file of walk([path.join(repoRoot, 'public'), path.join(repoRoot, 'src')])) {
    const text = readFileSync(file, 'utf8');
    for (const token of banned) {
      assert.equal(
        text.includes(token),
        false,
        `${path.relative(repoRoot, file)} contains ${token}`
      );
    }
  }
  const example = readFileSync(path.join(repoRoot, '.env.example'), 'utf8');
  for (const name of [...agentUpstreamKeys, ...Object.values(upstreamTokens)]) {
    assert.match(example, new RegExp(`^${name}=$`, 'm'));
  }
  assert.equal(example.includes('railway.app'), false);
  assert.doesNotMatch(example, /https?:\/\//);
});

function character(slug, upstream, status = 'active') {
  return {
    slug,
    status,
    agent: {
      service: `${slug}-agent`,
      upstream,
      path: `/api/${slug}/event`,
      methods: ['POST'],
    },
  };
}

function base(extra) {
  return {
    characters: canon.characters,
    env: { KIN_AGENT_URL: 'https://kin.example', DRED_AGENT_URL: 'https://dred.example' },
    limiter: createLimiter(),
    ...extra,
  };
}

function request(pathname, body, headers = {}) {
  return new Request(`https://kinxdred.com${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function postEvent(body, extra) {
  return handleEventRequest(request('/api/event', body), base(extra));
}

function postScoped(pathname, body, extra) {
  return handleScopedRequest(request(pathname, body, { cookie: 'a=b' }), base(extra));
}

function walk(dirs, found = []) {
  for (const dir of dirs) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk([full], found);
      else if (/\.(html|js|mjs|json|astro)$/.test(entry.name) && !entry.name.endsWith('.test.js')) {
        found.push(full);
      }
    }
  }
  return found;
}
