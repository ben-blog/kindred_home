import { safeEqual } from './equal.js';

const TOKEN = /^[\x21-\x7E]{1,4096}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIMEOUT_MS = 8000;
const ACCESS_COOKIE = 'world_access';
const REFRESH_COOKIE = 'world_refresh';

export function readCookies(request) {
  const header = request.headers.get('cookie') || '';
  const out = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name && TOKEN.test(value)) out[name] = value;
  }
  return out;
}

export function sessionCookies(request, session) {
  if (!session || !TOKEN.test(session.access_token) || !TOKEN.test(session.refresh_token)) {
    return null;
  }
  const base = cookieBase(request);
  const accessAge = clamp(session.expires_in, 60, 60 * 60 * 24);
  return [
    `${ACCESS_COOKIE}=${session.access_token}; ${base}; Max-Age=${accessAge}`,
    `${REFRESH_COOKIE}=${session.refresh_token}; ${base}; Max-Age=${60 * 60 * 24 * 30}`,
  ];
}

export function clearCookies(request) {
  const base = cookieBase(request);
  return [`${ACCESS_COOKIE}=; ${base}; Max-Age=0`, `${REFRESH_COOKIE}=; ${base}; Max-Age=0`];
}

/**
 * Confirm the session cookie belongs to WORLD_LEADER_USER_ID.
 * Returns a response-shaped failure, or `{ ok: true, cookies }` when a refresh rotated the pair.
 */
export async function requireLeader(request, config, options = {}) {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const cookies = readCookies(request);
  let access = cookies[ACCESS_COOKIE] || '';
  let refresh = cookies[REFRESH_COOKIE] || '';
  let rotated = [];

  if (!access && refresh) {
    const renewed = await refreshSession(config, fetchImpl, refresh);
    if (!renewed)
      return { ok: false, status: 401, error: 'unauthorized', cookies: clearCookies(request) };
    access = renewed.access_token;
    refresh = renewed.refresh_token;
    rotated = sessionCookies(request, renewed) ?? [];
    if (!access || rotated.length === 0) {
      return { ok: false, status: 401, error: 'unauthorized', cookies: clearCookies(request) };
    }
  }

  if (!access) return { ok: false, status: 401, error: 'unauthorized' };

  const user = await fetchUser(config, fetchImpl, access);
  if (user === 'expired' && refresh) {
    const renewed = await refreshSession(config, fetchImpl, refresh);
    const next = renewed ? sessionCookies(request, renewed) : null;
    if (!renewed || !next) {
      return { ok: false, status: 401, error: 'unauthorized', cookies: clearCookies(request) };
    }
    const again = await fetchUser(config, fetchImpl, renewed.access_token);
    if (again === 'unavailable') return { ok: false, status: 503, error: 'unavailable' };
    if (!again || !safeEqual(again.id.toLowerCase(), config.leaderId)) {
      return { ok: false, status: 403, error: 'forbidden', cookies: clearCookies(request) };
    }
    return { ok: true, cookies: next };
  }
  if (user === 'unavailable') return { ok: false, status: 503, error: 'unavailable' };
  if (user === 'expired' || !user || !safeEqual(user.id.toLowerCase(), config.leaderId)) {
    const status = user && user !== 'expired' ? 403 : 401;
    return {
      ok: false,
      status,
      error: status === 403 ? 'forbidden' : 'unauthorized',
      cookies: clearCookies(request),
    };
  }
  return { ok: true, cookies: rotated };
}

export async function requestMagicLink(config, fetchImpl, email, redirectTo) {
  const url = new URL('/auth/v1/otp', config.url);
  url.searchParams.set('redirect_to', redirectTo);
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: authHeaders(config),
    body: JSON.stringify({ email, create_user: false }),
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  await response.body?.cancel().catch(() => {});
  return response.ok;
}

export async function acceptAccessToken(config, fetchImpl, access, refresh) {
  if (!TOKEN.test(access) || !TOKEN.test(refresh))
    return { ok: false, status: 401, error: 'unauthorized' };
  const user = await fetchUser(config, fetchImpl, access);
  if (user === 'unavailable') return { ok: false, status: 503, error: 'unavailable' };
  if (!user || user === 'expired' || !safeEqual(user.id.toLowerCase(), config.leaderId)) {
    const forbidden = user && user !== 'expired';
    return {
      ok: false,
      status: forbidden ? 403 : 401,
      error: forbidden ? 'forbidden' : 'unauthorized',
    };
  }
  return {
    ok: true,
    session: { access_token: access, refresh_token: refresh, expires_in: 3600 },
  };
}

export async function verifyMagicLink(config, fetchImpl, tokenHash, type) {
  const response = await authPost(config, fetchImpl, '/auth/v1/verify', {
    token_hash: tokenHash,
    type,
  });
  if (!response) return null;
  if (!response.access_token || !response.user?.id) return null;
  return response;
}

export function leaderRedirect(request) {
  const origin = new URL(request.url).origin;
  return `${origin}/login`;
}

export function validEmail(value) {
  return typeof value === 'string' && value.length <= 200 && EMAIL.test(value);
}

function authHeaders(config) {
  return {
    apikey: config.anonKey,
    authorization: `Bearer ${config.anonKey}`,
    accept: 'application/json',
    'content-type': 'application/json',
  };
}

async function fetchUser(config, fetchImpl, access) {
  try {
    const response = await fetchImpl(new URL('/auth/v1/user', config.url), {
      method: 'GET',
      headers: {
        apikey: config.anonKey,
        authorization: `Bearer ${access}`,
        accept: 'application/json',
      },
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel().catch(() => {});
      return 'expired';
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return 'unavailable';
    }
    const body = await response.json();
    if (!body || typeof body.id !== 'string') return null;
    return body;
  } catch {
    return 'unavailable';
  }
}

async function refreshSession(config, fetchImpl, refresh) {
  const url = new URL('/auth/v1/token', config.url);
  url.searchParams.set('grant_type', 'refresh_token');
  return authPost(config, fetchImpl, url, { refresh_token: refresh });
}

async function authPost(config, fetchImpl, path, body) {
  try {
    const response = await fetchImpl(path instanceof URL ? path : new URL(path, config.url), {
      method: 'POST',
      headers: authHeaders(config),
      body: JSON.stringify(body),
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return null;
    }
    return await response.json();
  } catch {
    return null;
  }
}

function cookieBase(request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `HttpOnly; Path=/api/world; SameSite=Lax${secure}`;
}

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 3600;
  return Math.min(max, Math.max(min, Math.floor(number)));
}
