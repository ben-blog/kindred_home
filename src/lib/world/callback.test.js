import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { callbackLocation, finishCallback, safeNext } from './callback.js';

const leaderId = '11111111-1111-4111-8111-111111111111';
const env = {
  WORLD_SUPABASE_URL: 'https://world.example.test',
  WORLD_SUPABASE_SERVICE_KEY: 'service-key-0123456789abcdef',
  WORLD_SUPABASE_ANON_KEY: 'anon-key-0123456789abcdef',
  WORLD_LEADER_USER_ID: leaderId,
  WORLD_IP_SALT: 'ip-salt-0123456789',
  CRON_SECRET: 'cron-secret-0123456789',
};

function sessionBody(id = leaderId) {
  return new Response(
    JSON.stringify({
      access_token: 'access.token.value',
      refresh_token: 'refresh.token.value',
      expires_in: 3600,
      user: { id },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
}

test('the homepage script forwards auth params, including a hash, to the callback', () => {
  const source = readFileSync(new URL('../../../public/js/site-base.js', import.meta.url), 'utf8');
  assert.match(source, /\/auth\/callback/);
  assert.match(source, /access_token/);
  assert.match(source, /token_hash/);
  assert.match(source, /location\.hash/);
});

test('a hub magic link keeps the token out of next', () => {
  const location = callbackLocation(
    new URL('https://www.kinxdred.com/world/admin?token_hash=abc&type=magiclink')
  );
  const url = new URL(location, 'https://www.kinxdred.com');
  assert.equal(url.pathname, '/auth/callback');
  assert.equal(url.searchParams.get('token_hash'), 'abc');
  assert.equal(url.searchParams.get('next'), '/world/admin');
  assert.equal(safeNext('https://evil.example'), '/world/admin');
  assert.equal(safeNext('//evil.example'), '/world/admin');
});

test('token_hash signs the leader in and redirects without a browser verifier', async () => {
  let verify = '';
  const response = await finishCallback(
    new Request(
      'https://www.kinxdred.com/auth/callback?token_hash=one-time-token&type=magiclink&next=/world/admin'
    ),
    {
      env,
      fetch: async (url, init) => {
        verify = String(url);
        assert.equal(JSON.parse(init.body).token_hash, 'one-time-token');
        assert.equal(JSON.parse(init.body).type, 'magiclink');
        return sessionBody();
      },
    }
  );
  assert.equal(verify.endsWith('/auth/v1/verify'), true);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/world/admin');
  const cookies = response.headers.getSetCookie();
  assert.equal(cookies.some((cookie) => cookie.startsWith('world_access=access.token.value')), true);
  assert.equal(cookies.every((cookie) => cookie.includes('Path=/;')), true);
  assert.equal(cookies.some((cookie) => cookie.includes('Path=/api/world')), false);
});

test('a hash-only arrival is left for the page script', async () => {
  const response = await finishCallback(
    new Request('https://www.kinxdred.com/auth/callback?next=/world/admin'),
    { env, fetch: async () => { throw new Error('no server exchange'); } }
  );
  assert.equal(response, null);
});

test('a pkce code without a verifier stays on the page', async () => {
  const response = await finishCallback(
    new Request('https://www.kinxdred.com/auth/callback?code=auth-code&next=/world'),
    {
      env,
      fetch: async () => {
        throw new Error('verifier stays in the browser');
      },
    }
  );
  assert.equal(response, null);
});
