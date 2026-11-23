import {
  clearCookies,
  exchangeAuthCode,
  sessionCookies,
  verifyMagicLink,
} from './auth.js';
import { safeEqual } from './equal.js';
import { worldConfig } from './env.js';

const TYPE = /^(?:magiclink|email)$/;

export function safeNext(value) {
  if (typeof value !== 'string' || value.length > 200) return '/world/admin';
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || value.includes('\0')) {
    return '/world/admin';
  }
  const path = value.split('?')[0];
  if (path === '/auth/callback' || path === '/login') return '/world/admin';
  return value;
}

/** Query-string auth on any page except the callback itself. The hash is not visible here. */
export function callbackLocation(url) {
  const next = safeNext(url.searchParams.get('next') || url.pathname || '/world/admin');
  const target = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (key === 'next') continue;
    target.append(key, value);
  }
  target.set('next', next);
  return `/auth/callback?${target.toString()}`;
}

/**
 * Finish a magic link from the query string. token_hash works in any browser.
 * A PKCE code only works when this request also carries the verifier.
 * Returns null when the token is in the URL hash and the page script has to read it.
 */
export async function finishCallback(request, options = {}) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get('token_hash');
  const code = url.searchParams.get('code');
  if (!tokenHash && !code) return null;
  if (url.searchParams.get('error')) return null;

  const config = worldConfig(options.env ?? process.env);
  if (!config) return plain(503, 'Unavailable.');

  const fetchImpl = options.fetch ?? globalThis.fetch;
  const type = url.searchParams.get('type') || 'magiclink';
  let session = null;
  if (tokenHash) {
    if (!TYPE.test(type)) return plain(400, 'The link did not work.');
    session = await verifyMagicLink(config, fetchImpl, tokenHash, type);
  } else {
    const verifier = url.searchParams.get('code_verifier') || '';
    // The verifier lives in the browser that asked for the link. Let that page attach it.
    if (!verifier) return null;
    session = await exchangeAuthCode(config, fetchImpl, code, verifier);
  }

  if (!session?.user?.id) return plain(401, 'The link did not work.');
  if (!safeEqual(String(session.user.id).toLowerCase(), config.leaderId)) {
    return plain(403, 'The link did not work.', clearCookies(request));
  }
  const cookies = sessionCookies(request, session);
  if (!cookies) return plain(401, 'The link did not work.');

  const headers = new Headers({
    location: safeNext(url.searchParams.get('next')),
    'cache-control': 'private, no-store',
  });
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  return new Response(null, { status: 302, headers });
}

function plain(status, text, cookies = []) {
  const headers = new Headers({
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'private, no-store',
  });
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  return new Response(text, { status, headers });
}
