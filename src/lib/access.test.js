import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { guardRequest } from './access/guard.js';

const PRIVATE_PAGES = [
  '../pages/world/index.astro',
  '../pages/world/admin.astro',
  '../pages/world/admin/album.astro',
  '../pages/world/brain.astro',
  '../pages/world/chat/[slug].astro',
];

const leaderId = '11111111-1111-4111-8111-111111111111';
const env = {
  WORLD_SUPABASE_URL: 'https://world.example.test',
  WORLD_SUPABASE_SERVICE_KEY: 'service-key-0123456789abcdef',
  WORLD_SUPABASE_ANON_KEY: 'anon-key-0123456789abcdef',
  WORLD_LEADER_USER_ID: leaderId,
  WORLD_IP_SALT: 'ip-salt-0123456789',
  CRON_SECRET: 'cron-secret-0123456789',
};

function request(path, { method = 'GET', cookie, headers = {} } = {}) {
  return new Request(`https://kinxdred.com${path}`, {
    method,
    headers: cookie ? { ...headers, cookie } : headers,
  });
}

function ok() {
  return new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } });
}

const PUBLIC = [
  ['/', 'GET'],
  ['/index.html', 'GET'],
  ['/main.html', 'GET'],
  ['/kin', 'GET'],
  ['/kin/', 'GET'],
  ['/kin/k2', 'GET'],
  ['/dred', 'GET'],
  ['/dred/d14', 'GET'],
  ['/dred/d14/', 'GET'],
  ['/characters', 'GET'],
  ['/characters/kin', 'GET'],
  ['/works', 'GET'],
  ['/works/gaze', 'GET'],
  ['/c/spring', 'GET'],
  ['/favicon.svg', 'GET'],
  ['/kin_default.webp', 'GET'],
  ['/assets/gallery/still.webp', 'GET'],
  ['/data/kindred_gallery_kin.json', 'GET'],
  ['/js/site-base.js', 'GET'],
  ['/_astro/app.css', 'GET'],
  ['/robots.txt', 'GET'],
  ['/sitemap.xml', 'GET'],
  ['/og.png', 'GET'],
  ['/login', 'GET'],
  ['/auth/callback', 'GET'],
  ['/mood-camera', 'GET'],
  ['/mood-camera/play', 'GET'],
  ['/_next/static/chunk.js', 'GET'],
  ['/api/health', 'GET'],
  ['/api/event', 'POST'],
  ['/api/kin/event', 'POST'],
  ['/api/gallery/kin', 'GET'],
  ['/api/gallery/file?name=still.webp', 'GET'],
  ['/api/world/auth/magic', 'POST'],
  ['/api/world/auth/session', 'GET'],
  ['/api/world/auth/session', 'POST'],
  ['/api/world/tick', 'OPTIONS'],
];

const PRIVATE_PAGE_URLS = ['/world', '/world/admin', '/world/admin/album', '/world/brain', '/world/chat/kin'];

const PRIVATE_APIS = [
  ['/api/world', 'GET'],
  ['/api/world/tick', 'POST'],
  ['/api/world/signal', 'POST'],
  ['/api/world/chat/kin', 'POST'],
  ['/api/world/chat/kin/memory', 'GET'],
  ['/api/world/brain/kin/history', 'GET'],
  ['/api/world/album', 'GET'],
  ['/api/world/album/11111111-1111-4111-8111-111111111111/publish', 'POST'],
  ['/api/gallery/kin', 'POST'],
  ['/api/not-a-route', 'GET'],
];

test('private pages are rendered on demand so Vercel cannot serve them as static files', () => {
  for (const file of PRIVATE_PAGES) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /export const prerender = false/, file);
  }
});

test('public routes stay open without a session', async () => {
  for (const [path, method] of PUBLIC) {
    let called = false;
    const response = await guardRequest(request(path, { method }), {
      env: {},
      next: () => {
        called = true;
        return ok();
      },
    });
    assert.equal(called, true, path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('x-robots-tag'), null, path);
  }
});

test('OPTIONS on a private page does not render it', async () => {
  let called = false;
  const response = await guardRequest(request('/world', { method: 'OPTIONS' }), {
    env: {},
    next: () => {
      called = true;
      return ok();
    },
  });
  assert.equal(called, false);
  assert.equal(response.status, 204);
  assert.equal(await response.text(), '');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('cdn-cache-control'), 'no-store');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
});

test('private pages redirect and private APIs return 401 without a session', async () => {
  for (const path of PRIVATE_PAGE_URLS) {
    let called = false;
    const response = await guardRequest(request(path), {
      env: {},
      next: () => {
        called = true;
        return ok();
      },
    });
    assert.equal(called, false, path);
    assert.equal(response.status, 302, path);
    const location = response.headers.get('location');
    assert.equal(location.startsWith('/login?next='), true, location);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
  for (const [path, method] of PRIVATE_APIS) {
    let called = false;
    const response = await guardRequest(request(path, { method }), {
      env: {},
      next: () => {
        called = true;
        return ok();
      },
    });
    assert.equal(called, false, path);
    assert.equal(response.status, 401, path);
    assert.equal(await response.json().then((body) => body.error), 'unauthorized');
  }
});

test('an old magic link on the hub is sent to the callback with its query', async () => {
  const response = await guardRequest(
    request('/world/admin?token_hash=abc&type=magiclink'),
    { env: {}, next: () => ok() }
  );
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get('location'), 'https://kinxdred.com');
  assert.equal(location.pathname, '/auth/callback');
  assert.equal(location.searchParams.get('token_hash'), 'abc');
  assert.equal(location.searchParams.get('type'), 'magiclink');
  assert.equal(location.searchParams.get('next'), '/world/admin');
});

test('the cron route is not the leader cookie, and a leader session stamps noindex', async () => {
  let cron = false;
  const ingest = await guardRequest(request('/api/world/ingest'), {
    env: {},
    next: () => {
      cron = true;
      return ok();
    },
  });
  assert.equal(cron, true);
  assert.equal(ingest.status, 200);
  assert.equal(ingest.headers.get('x-robots-tag'), null);

  const response = await guardRequest(request('/world/brain', { cookie: 'world_access=leader.access.token' }), {
    env,
    fetch: async (url) => {
      assert.equal(String(url).endsWith('/auth/v1/user'), true);
      return new Response(JSON.stringify({ id: leaderId }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
    next: () => ok(),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(await response.text(), 'ok');
});
