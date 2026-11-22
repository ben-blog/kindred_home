import { agentUpstreamKeys } from '../../world/schema.js';

/** Reject bodies larger than this. The hubs send small gallery events. */
export const BODY_LIMIT = 32 * 1024;
export const TIMEOUT_MS = 8000;
export const RATE_LIMIT = 30;
export const RATE_WINDOW_MS = 60_000;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PATH = /^\/api\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:[_-][a-z0-9]+)*)+$/;
const SERVICE = /^[a-z][a-z0-9-]{0,63}$/;
const EVENT_TYPE = /^[a-z][a-z0-9_]{0,63}$/;
const PAYLOAD_KEY = /^[a-z][a-z0-9_]{0,40}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const TOKEN = /^[\x21-\x7E]{1,4096}$/;

/**
 * Token env var paired with each allowlisted origin.
 * Content chooses the origin key. It cannot name a different secret.
 */
export const upstreamTokens = {
  KIN_AGENT_URL: 'KIN_AGENT_TOKEN',
  DRED_AGENT_URL: 'DRED_AGENT_TOKEN',
  MIRRORED_API_URL: 'MIRRORED_API_TOKEN',
};

const sharedLimiter = createLimiter();

export function createLimiter({
  limit = RATE_LIMIT,
  windowMs = RATE_WINDOW_MS,
  maxKeys = 1000,
} = {}) {
  const buckets = new Map();
  return {
    allow(key, now) {
      const id = typeof key === 'string' && key ? key : 'unknown';
      const time = typeof now === 'number' ? now : Date.now();
      const current = buckets.get(id);
      if (!current || time - current.start >= windowMs) {
        if (buckets.has(id)) buckets.delete(id);
        if (buckets.size >= maxKeys) buckets.delete(buckets.keys().next().value);
        buckets.set(id, { start: time, count: 1 });
        return true;
      }
      if (current.count >= limit) return false;
      current.count += 1;
      return true;
    },
  };
}

export function clientAddress(request) {
  const real = request.headers.get('x-real-ip')?.trim();
  if (isIp(real)) return real;
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    const last = parts[parts.length - 1];
    if (isIp(last)) return last;
  }
  return 'unknown';
}

export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (origin == null || origin === '') return true;
  let declared;
  try {
    declared = new URL(origin);
  } catch {
    return false;
  }
  if (declared.origin === 'null') return false;
  return declared.origin === new URL(request.url).origin;
}

/** Public characters only. Drafts and unknown upstream keys are left out. */
export function agentRoutes(characters) {
  const routes = new Map();
  for (const character of Array.isArray(characters) ? characters : []) {
    const route = routeFrom(character);
    if (!route || routes.has(route.slug)) continue;
    routes.set(route.slug, route);
  }
  return routes;
}

export function handleEventRequest(request, options = {}) {
  return guard(() => dispatch(request, { ...options, mode: 'event' }));
}

export function handleScopedRequest(request, options = {}) {
  return guard(() => dispatch(request, { ...options, mode: 'scoped' }));
}

async function guard(run) {
  try {
    return await run();
  } catch {
    return json(500, { error: 'unavailable' });
  }
}

async function dispatch(request, options) {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const limiter = options.limiter ?? sharedLimiter;
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  const routes = agentRoutes(options.characters);
  const cors = corsHeaders(request);

  if (request.method === 'OPTIONS') {
    if (!sameOrigin(request)) return json(403, { error: 'forbidden' });
    return new Response(null, {
      status: 204,
      headers: {
        ...cors,
        'access-control-allow-methods': 'POST',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '600',
        'cache-control': 'no-store',
      },
    });
  }

  if (request.method !== 'POST') {
    return json(405, { error: 'method not allowed' }, { ...cors, allow: 'POST' });
  }

  const ip = clientAddress(request);
  if (!sameOrigin(request)) {
    limiter.allow(ip, now());
    return json(403, { error: 'forbidden' });
  }
  if (!limiter.allow(ip, now())) {
    return json(429, { error: 'too many requests' }, { ...cors, 'retry-after': '60' });
  }

  let route;
  if (options.mode === 'scoped') {
    const pathname = safePathname(request);
    route = pathname ? [...routes.values()].find((item) => item.path === pathname) : undefined;
    if (!route) return json(404, { error: 'not found' }, cors);
  }

  const read = await readBody(request);
  if (read.error) return json(read.status, { error: read.error }, cors);

  let parsed;
  try {
    parsed = JSON.parse(read.text);
  } catch {
    return json(400, { error: 'bad request' }, cors);
  }

  if (options.mode === 'event') {
    if (!exactKeys(parsed, ['slug', 'event']) || typeof parsed.slug !== 'string') {
      return json(400, { error: 'bad request' }, cors);
    }
    if (!SLUG.test(parsed.slug)) return json(400, { error: 'bad request' }, cors);
    route = routes.get(parsed.slug);
    if (!route) return json(404, { error: 'not found' }, cors);
    parsed = parsed.event;
  }

  if (!route.methods.includes('POST')) return json(405, { error: 'method not allowed' }, cors);

  const event = normalizeEvent(parsed);
  if (!event) return json(400, { error: 'bad request' }, cors);

  const origin = upstreamOrigin(env[route.upstream]);
  if (!origin) return json(503, { error: 'unavailable' }, cors);

  const headers = new Headers();
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('accept', 'application/json');
  const token = env[route.token];
  if (token != null && token !== '') {
    if (typeof token !== 'string' || !TOKEN.test(token)) {
      return json(503, { error: 'unavailable' }, cors);
    }
    headers.set('authorization', `Bearer ${token}`);
  }

  try {
    const upstream = await fetchImpl(`${origin}${route.path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'manual',
      cache: 'no-store',
    });
    await upstream.body?.cancel().catch(() => {});
    if (upstream.status >= 200 && upstream.status < 300) return json(200, { ok: true }, cors);
    return json(502, { error: 'unavailable' }, cors);
  } catch {
    return json(502, { error: 'unavailable' }, cors);
  }
}

function routeFrom(character) {
  if (!character || (character.status !== 'active' && character.status !== 'archived')) return null;
  const agent = character.agent;
  if (
    !agent ||
    typeof agent.upstream !== 'string' ||
    !Object.hasOwn(upstreamTokens, agent.upstream)
  ) {
    return null;
  }
  if (!agentUpstreamKeys.includes(agent.upstream)) return null;
  if (typeof character.slug !== 'string' || !SLUG.test(character.slug)) return null;
  if (typeof agent.path !== 'string' || !PATH.test(agent.path)) return null;
  if (!agent.path.startsWith(`/api/${character.slug}/`)) return null;
  const listed = Array.isArray(agent.methods) ? agent.methods : ['POST'];
  const methods = listed.filter((method) => method === 'POST');
  if (!methods.includes('POST')) return null;
  return {
    slug: character.slug,
    upstream: agent.upstream,
    token: upstreamTokens[agent.upstream],
    path: agent.path,
    methods,
  };
}

function upstreamOrigin(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.search || url.hash) return null;
  if (url.pathname !== '/' && url.pathname !== '') return null;
  if (!url.hostname) return null;
  return url.origin;
}

async function readBody(request) {
  const type = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') return { status: 400, error: 'bad request' };
  const declared = request.headers.get('content-length');
  if (declared != null) {
    if (!/^\d+$/.test(declared)) return { status: 400, error: 'bad request' };
    if (Number(declared) > BODY_LIMIT) return { status: 413, error: 'too large' };
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > BODY_LIMIT) return { status: 413, error: 'too large' };
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!text) return { status: 400, error: 'bad request' };
    return { text };
  } catch {
    return { status: 400, error: 'bad request' };
  }
}

function normalizeEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
  const keys = Object.keys(event);
  const allowed = new Set(['service', 'event_type', 'payload', 'timestamp']);
  if (!keys.every((key) => allowed.has(key))) return null;
  if (!keys.includes('service') || !keys.includes('event_type') || !keys.includes('payload'))
    return null;
  if (typeof event.service !== 'string' || !SERVICE.test(event.service)) return null;
  if (typeof event.event_type !== 'string' || !EVENT_TYPE.test(event.event_type)) return null;
  if (event.timestamp !== undefined) {
    if (typeof event.timestamp !== 'string' || !TIMESTAMP.test(event.timestamp)) return null;
  }
  const payload = normalizePayload(event.payload);
  if (!payload) return null;
  const clean = { service: event.service, event_type: event.event_type, payload };
  if (event.timestamp !== undefined) clean.timestamp = event.timestamp;
  return clean;
}

function normalizePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const entries = Object.entries(payload);
  if (entries.length > 16) return null;
  const clean = {};
  for (const [key, value] of entries) {
    if (!PAYLOAD_KEY.test(key) || !isPrimitive(value)) return null;
    clean[key] = value;
  }
  return clean;
}

function isPrimitive(value) {
  if (value == null) return true;
  if (typeof value === 'boolean') return true;
  if (typeof value === 'string') return value.length <= 2000;
  if (typeof value === 'number') return Number.isFinite(value);
  return false;
}

function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const got = Object.keys(value);
  return got.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function safePathname(request) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url).pathname);
  } catch {
    return null;
  }
  if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.slice(0, -1);
  if (!pathname.startsWith('/api/')) return null;
  if (pathname.includes('\\') || pathname.includes('..') || pathname.includes('//')) return null;
  return pathname;
}

function corsHeaders(request) {
  const origin = request.headers.get('origin');
  if (!origin || !sameOrigin(request)) return {};
  return {
    'access-control-allow-origin': origin,
    vary: 'origin',
  };
}

function json(status, body, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extra,
    },
  });
}

function isIp(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) {
    return value.split('.').every((part) => Number(part) <= 255);
  }
  return value.includes(':') && /^[0-9a-f:]+$/i.test(value);
}
