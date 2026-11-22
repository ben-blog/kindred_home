/**
 * Adapter for the agent memory map and the chat trace.
 * GET map: { character, basisVersion, basisFingerprint, total, limit, truncated, nextCursor, points }
 * points: { id, kind, label, createdAt, x, y, z }. Label is one line, at most 80 characters.
 * Trace, once, before tokens: { stage: 'retrieved', items: [{ id, kind, label, score }] }.
 * score null is a recency recall. Reflections are listed there and are not on the sphere.
 * This proxy follows nextCursor itself and caches the assembled map for a few seconds.
 * Change this file if that contract moves.
 */
import { clientAddress, createLimiter, sameOrigin } from '../proxy.js';
import { requireLeader } from './auth.js';
import { chatRoutes } from './chat.js';
import { httpsOrigin, worldConfig } from './env.js';
import { corsHeaders, guard, json } from './http.js';

export const MEMORY_RATE_LIMIT = 12;
export const MEMORY_TIMEOUT_MS = 8_000;
const CACHE_MS = 8_000;
const UPSTREAM_LIMIT = 16;
const MAX_POINTS = 4000;
const MAX_ITEMS = 40;
const MAX_PAGES = 5;
const MAX_BODY = 2 * 1024 * 1024;
const PAGE_LIMIT = 1000;
const LABEL = 80;
const ID = 80;
const SPHERE_KINDS = new Set([
  'experience',
  'knowledge',
  'declaration',
  'pattern',
  'album_moment',
]);
const TRACE_KINDS = new Set([...SPHERE_KINDS, 'reflection']);
const SINCE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const FINGERPRINT = /^[0-9a-f]{12}$/;
const CURSOR = /^[A-Za-z0-9_-]{1,200}$/;
const TOKEN = /^[\x21-\x7E]{1,4096}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const sharedLimiter = createLimiter({ limit: MEMORY_RATE_LIMIT, windowMs: 60_000 });
const upstreamLimiter = createLimiter({ limit: UPSTREAM_LIMIT, windowMs: 60_000 });
const memoryCache = new Map();
const memoryInflight = new Map();

export function parseMemoryMap(raw, slug) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (!Array.isArray(raw.points)) return null;
  const fingerprint =
    typeof raw.basisFingerprint === 'string' ? raw.basisFingerprint.trim().toLowerCase() : '';
  if (!FINGERPRINT.test(fingerprint)) return null;
  if (raw.nextCursor != null && raw.nextCursor !== '') {
    if (typeof raw.nextCursor !== 'string' || !CURSOR.test(raw.nextCursor)) return null;
  }
  const points = [];
  for (const point of raw.points) {
    const clean = cleanPoint(point);
    if (clean) points.push(clean);
    if (points.length >= MAX_POINTS) break;
  }
  const total = Number.isFinite(raw.total) ? Math.max(0, Math.floor(raw.total)) : points.length;
  const limit = cleanLimit(raw.limit);
  return {
    character: slug,
    basisVersion: cleanVersion(raw.basisVersion),
    basisFingerprint: fingerprint,
    total,
    limit: limit ?? PAGE_LIMIT,
    truncated: raw.truncated === true,
    nextCursor: raw.nextCursor ? raw.nextCursor : null,
    points,
  };
}

export function parseTrace(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.stage !== 'retrieved' || !Array.isArray(raw.items)) return null;
  const items = [];
  for (const item of raw.items) {
    const clean = cleanItem(item);
    if (clean) items.push(clean);
    if (items.length >= MAX_ITEMS) break;
  }
  return { type: 'trace', stage: 'retrieved', items };
}

export function handleWorldMemory(request, options = {}) {
  return guard(() => readMemory(request, options));
}

async function readMemory(request, options) {
  const env = options.env ?? process.env;
  const config = worldConfig(env);
  if (!config) return json(503, { error: 'unavailable' });
  const canon = options.canon;
  if (!canon?.world?.id || !Array.isArray(canon.characters)) {
    return json(503, { error: 'unavailable' });
  }
  const cors = corsHeaders(request, sameOrigin);
  if (request.method === 'OPTIONS') {
    if (!sameOrigin(request)) return json(403, { error: 'forbidden' });
    return new Response(null, {
      status: 204,
      headers: {
        ...cors,
        'access-control-allow-methods': 'GET',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '600',
        'cache-control': 'no-store',
      },
    });
  }
  if (request.method !== 'GET') {
    return json(405, { error: 'method not allowed' }, { allow: 'GET', ...cors });
  }
  if (!sameOrigin(request)) return json(403, { error: 'forbidden' });

  const limiter = options.limiter ?? sharedLimiter;
  const now = options.now ?? Date.now;
  if (!limiter.allow(clientAddress(request), now())) {
    return json(429, { error: 'too many requests' }, { 'retry-after': '60', ...cors });
  }

  const leader = await requireLeader(request, config, options);
  if (!leader.ok) {
    return json(leader.status, { error: leader.error }, cors, leader.cookies ?? []);
  }

  const slug = typeof options.slug === 'string' ? options.slug : '';
  if (!SLUG.test(slug)) return json(404, { error: 'not found' }, cors, leader.cookies);
  const route = chatRoutes(canon.characters).get(slug);
  if (!route?.memory) return json(404, { error: 'not found' }, cors, leader.cookies);

  const origin = httpsOrigin(env[route.upstream]);
  const token = env[route.token];
  if (!origin || typeof token !== 'string' || !TOKEN.test(token)) {
    return json(503, { error: 'unavailable' }, cors, leader.cookies);
  }

  const params = new URL(request.url).searchParams;
  const sinceRaw = params.get('since');
  if (sinceRaw != null && sinceRaw !== '' && !SINCE.test(sinceRaw)) {
    return json(400, { error: 'bad request' }, cors, leader.cookies);
  }
  const limit = parseLimit(params.get('limit'));
  if (limit == null) return json(400, { error: 'bad request' }, cors, leader.cookies);
  const cursorRaw = params.get('cursor');
  if (cursorRaw != null && cursorRaw !== '' && !CURSOR.test(cursorRaw)) {
    return json(400, { error: 'bad request' }, cors, leader.cookies);
  }

  const since = sinceRaw && SINCE.test(sinceRaw) ? sinceRaw : '';
  const cursor = cursorRaw && CURSOR.test(cursorRaw) ? cursorRaw : '';
  const cache = options.cache ?? memoryCache;
  const inflight = options.inflight ?? memoryInflight;
  const key = `${slug}\n${since}\n${cursor}\n${limit}`;
  const hit = cache.get(key);
  if (hit && now() - hit.at < CACHE_MS) return json(200, hit.body, cors, leader.cookies);

  let job = inflight.get(key);
  if (!job) {
    job = loadPages({
      origin,
      path: route.memory,
      token,
      slug,
      since,
      cursor,
      limit,
      fetchImpl: options.fetch ?? globalThis.fetch,
      timeoutMs: options.timeoutMs ?? MEMORY_TIMEOUT_MS,
      now,
      upstreamLimiter: options.upstreamLimiter ?? upstreamLimiter,
    });
    inflight.set(key, job);
  }

  try {
    const result = await job;
    if (result.status === 200) cache.set(key, { at: now(), body: result.payload });
    const extra =
      result.status === 429 ? { 'retry-after': '60', ...cors } : cors;
    return json(result.status, result.payload, extra, leader.cookies);
  } finally {
    if (inflight.get(key) === job) inflight.delete(key);
  }
}

async function loadPages(ctx) {
  let since = ctx.since;
  let cursor = ctx.cursor;
  let restarted = false;
  let fingerprint = '';
  let basisVersion = 0;
  let total = 0;
  let limit = ctx.limit;
  let truncated = false;
  let more = false;
  const points = [];
  const seen = new Set();
  let pages = 0;

  while (pages < MAX_PAGES) {
    if (!ctx.upstreamLimiter.allow('memory', ctx.now())) {
      return { status: 429, payload: { error: 'too many requests' } };
    }
    const fetched = await fetchPage(ctx, { since, cursor });
    if (fetched.status !== 200) return fetched;
    const map = fetched.payload;
    if (fingerprint && map.basisFingerprint !== fingerprint) {
      if (restarted) return { status: 502, payload: { error: 'unavailable' } };
      restarted = true;
      since = '';
      cursor = '';
      fingerprint = '';
      points.length = 0;
      seen.clear();
      truncated = false;
      pages = 0;
      continue;
    }
    if (!fingerprint) {
      fingerprint = map.basisFingerprint;
      basisVersion = map.basisVersion;
      total = map.total;
      limit = map.limit;
    }
    if (map.truncated) truncated = true;
    for (const point of map.points) {
      if (seen.has(point.id)) continue;
      seen.add(point.id);
      points.push(point);
      if (points.length >= MAX_POINTS) break;
    }
    pages += 1;
    cursor = map.nextCursor || '';
    if (!cursor || points.length >= MAX_POINTS) {
      more = Boolean(cursor) && points.length >= MAX_POINTS;
      break;
    }
  }

  return {
    status: 200,
    payload: {
      character: ctx.slug,
      basisVersion,
      basisFingerprint: fingerprint,
      total,
      limit,
      truncated: truncated || more,
      nextCursor: null,
      points,
    },
  };
}

async function fetchPage(ctx, { since, cursor }) {
  const url = new URL(ctx.path, ctx.origin);
  if (since) url.searchParams.set('since', since);
  url.searchParams.set('limit', String(ctx.limit));
  if (cursor) url.searchParams.set('cursor', cursor);
  const headers = new Headers();
  headers.set('accept', 'application/json');
  headers.set('authorization', `Bearer ${ctx.token}`);
  headers.set('x-admin-key', ctx.token);
  let upstream;
  try {
    upstream = await ctx.fetchImpl(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(ctx.timeoutMs),
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    return { status: 502, payload: { error: 'unavailable' } };
  }
  if (!upstream.ok) {
    await upstream.body?.cancel().catch(() => {});
    const status = publicUpstreamStatus(upstream.status);
    return {
      status,
      payload: { error: status === 429 ? 'too many requests' : 'unavailable' },
    };
  }
  const text = await upstream.text();
  if (text.length > MAX_BODY) return { status: 502, payload: { error: 'unavailable' } };
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { status: 502, payload: { error: 'unavailable' } };
  }
  const map = parseMemoryMap(raw, ctx.slug);
  if (!map) return { status: 502, payload: { error: 'unavailable' } };
  return { status: 200, payload: map };
}

function publicUpstreamStatus(status) {
  if (status === 400) return 400;
  if (status === 429) return 429;
  if (status === 401 || status === 503) return 503;
  return 502;
}

function parseLimit(value) {
  if (value == null || value === '') return PAGE_LIMIT;
  if (!/^\d+$/.test(value)) return null;
  const limit = Number(value);
  if (limit < 1 || limit > PAGE_LIMIT) return null;
  return limit;
}

function cleanPoint(point) {
  if (!point || typeof point !== 'object' || Array.isArray(point)) return null;
  const id = cleanId(point.id);
  const kind = cleanKind(point.kind, SPHERE_KINDS);
  if (!id || !kind) return null;
  const vector = unitVector(point.x, point.y, point.z);
  if (!vector) return null;
  const clean = { id, kind, label: clipLabel(point.label), ...vector };
  if (typeof point.createdAt === 'string' && SINCE.test(point.createdAt)) {
    clean.createdAt = point.createdAt;
  }
  return clean;
}

function cleanItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const id = cleanId(item.id);
  const kind = cleanKind(item.kind, TRACE_KINDS);
  if (!id || !kind) return null;
  return { id, kind, label: clipLabel(item.label), score: roundScore(item.score) };
}

function cleanKind(value, allowed) {
  if (typeof value !== 'string') return '';
  const kind = value.trim().toLowerCase();
  return allowed.has(kind) ? kind : '';
}

function cleanId(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > ID || hasControl(trimmed)) return '';
  return trimmed;
}

function clipLabel(value) {
  if (typeof value !== 'string') return '';
  let out = '';
  for (let index = 0; index < value.length; index += 1) {
    out += value.charCodeAt(index) < 32 ? ' ' : value[index];
  }
  return out.replace(/ +/g, ' ').trim().slice(0, LABEL);
}

function cleanVersion(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 1_000_000) {
    return value;
  }
  if (typeof value !== 'string') return 0;
  const trimmed = stripControl(value).trim().slice(0, 80);
  return /^\d+$/.test(trimmed) ? Number(trimmed) : trimmed;
}

function cleanLimit(value) {
  const limit = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > PAGE_LIMIT) return null;
  return limit;
}

function roundScore(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(value * 10000) / 10000;
}

function hasControl(value) {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) < 32) return true;
  }
  return false;
}

function stripControl(value) {
  let out = '';
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) >= 32) out += value[index];
  }
  return out;
}

function unitVector(x, y, z) {
  if (![x, y, z].every((value) => typeof value === 'number' && Number.isFinite(value))) return null;
  const length = Math.hypot(x, y, z);
  if (length === 0) return null;
  return { x: x / length, y: y / length, z: z / length };
}
