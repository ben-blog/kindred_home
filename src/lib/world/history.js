/**
 * Leader proxy for the agent memory history.
 * GET /memory/history?from&to&limit&cursor
 * rows: { id, kind, createdAt, snippet, x, y, z, placement?, importance?, strength?, decay?, weight?, lastAccessed?, updatedAt?, removedAt? }
 * This follows nextCursor until the upstream is done or the row cap is reached.
 * The agent token stays on the server. Change this file if that contract moves.
 */
import { clientAddress, createLimiter, sameOrigin } from '../proxy.js';
import { requireLeader } from './auth.js';
import { chatRoutes } from './chat.js';
import { httpsOrigin, worldConfig } from './env.js';
import { corsHeaders, guard, json } from './http.js';

export const HISTORY_RATE_LIMIT = 8;
export const HISTORY_TIMEOUT_MS = 50_000;
const CACHE_MS = 8_000;
const UPSTREAM_LIMIT = 8;
const PAGE_LIMIT = 5_000;
const MAX_ROWS = 20_000;
const MAX_PAGES = 4;
const MAX_BODY = 8 * 1024 * 1024;
const SNIPPET = 300;
const ID = 80;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const FINGERPRINT = /^[0-9a-f]{12}$/;
const CURSOR = /^[A-Za-z0-9_-]{1,240}$/;
const TOKEN = /^[\x21-\x7E]{1,4096}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const KINDS = new Set([
  'experience',
  'knowledge',
  'declaration',
  'pattern',
  'album_moment',
  'reflection',
]);
const PLACEMENTS = new Set(['basis', 'related-centroid', 'reflection-shell', 'hash']);

const sharedLimiter = createLimiter({ limit: HISTORY_RATE_LIMIT, windowMs: 60_000 });
const upstreamLimiter = createLimiter({ limit: UPSTREAM_LIMIT, windowMs: 60_000 });
const historyCache = new Map();
const historyInflight = new Map();

export function historyPath(memoryPath) {
  if (typeof memoryPath !== 'string' || !memoryPath.endsWith('/memory/map')) return '';
  return `${memoryPath.slice(0, -4)}/history`;
}

export function parseMemoryHistory(raw, slug) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (!Array.isArray(raw.rows)) return null;
  if (raw.nextCursor != null && raw.nextCursor !== '') {
    if (typeof raw.nextCursor !== 'string' || !CURSOR.test(raw.nextCursor)) return null;
  }
  const rows = [];
  for (const row of raw.rows) {
    const clean = cleanRow(row);
    if (clean?.origin === 'leader_adult' && slug !== 'dred') continue;
    if (clean) rows.push(clean);
    if (rows.length >= MAX_ROWS) break;
  }
  const fingerprint =
    typeof raw.basisFingerprint === 'string' ? raw.basisFingerprint.trim().toLowerCase() : '';
  return {
    character: slug,
    from: cleanIso(raw.from),
    to: cleanIso(raw.to),
    limit: cleanLimit(raw.limit) ?? PAGE_LIMIT,
    returned: rows.length,
    total: cleanTotal(raw.total, rows.length),
    truncated: raw.truncated === true,
    nextCursor: raw.nextCursor ? raw.nextCursor : null,
    basisVersion: cleanVersion(raw.basisVersion),
    basisFingerprint: FINGERPRINT.test(fingerprint) ? fingerprint : '',
    kinds: cleanKinds(raw.kinds),
    rows,
    meta: cleanMeta(raw.meta),
  };
}

export function handleWorldHistory(request, options = {}) {
  return guard(() => readHistory(request, options));
}

async function readHistory(request, options) {
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
  const path = historyPath(route?.memory);
  if (!path) return json(404, { error: 'not found' }, cors, leader.cookies);

  const origin = httpsOrigin(env[route.upstream]);
  const token = env[route.token];
  if (!origin || typeof token !== 'string' || !TOKEN.test(token)) {
    return json(503, { error: 'unavailable' }, cors, leader.cookies);
  }

  const params = new URL(request.url).searchParams;
  const from = params.get('from') || '';
  const to = params.get('to') || '';
  if (!ISO.test(from) || !ISO.test(to) || Date.parse(from) > Date.parse(to)) {
    return json(400, { error: 'bad request' }, cors, leader.cookies);
  }

  const cache = options.cache ?? historyCache;
  const inflight = options.inflight ?? historyInflight;
  const key = `${slug}\n${from}\n${to}`;
  const hit = cache.get(key);
  if (hit && now() - hit.at < CACHE_MS) return json(200, hit.body, cors, leader.cookies);

  let job = inflight.get(key);
  if (!job) {
    job = loadPages({
      origin,
      path,
      token,
      slug,
      from,
      to,
      fetchImpl: options.fetch ?? globalThis.fetch,
      timeoutMs: options.timeoutMs ?? HISTORY_TIMEOUT_MS,
      now,
      upstreamLimiter: options.upstreamLimiter ?? upstreamLimiter,
    });
    inflight.set(key, job);
  }

  try {
    const result = await job;
    if (result.status === 200) cache.set(key, { at: now(), body: result.payload });
    const extra = result.status === 429 ? { 'retry-after': '60', ...cors } : cors;
    return json(result.status, result.payload, extra, leader.cookies);
  } finally {
    if (inflight.get(key) === job) inflight.delete(key);
  }
}

async function loadPages(ctx) {
  const started = ctx.now();
  let cursor = '';
  let fingerprint = '';
  let basisVersion = 0;
  let from = ctx.from;
  let to = ctx.to;
  let kinds = [];
  let meta = emptyMeta();
  let truncated = false;
  const rows = [];
  const seen = new Set();
  let pages = 0;

  while (pages < MAX_PAGES && rows.length < MAX_ROWS) {
    // A full history scan can run well past the old 12s abort. One finished
    // page is enough; do not start another if this function is near its limit.
    if (pages > 0 && ctx.now() - started > ctx.timeoutMs * 0.8) {
      truncated = true;
      break;
    }
    if (!ctx.upstreamLimiter.allow('history', ctx.now())) {
      if (pages === 0) return { status: 429, payload: { error: 'too many requests' } };
      truncated = true;
      break;
    }
    const fetched = await fetchPage(ctx, { cursor });
    if (fetched.status !== 200) {
      if (pages === 0) return fetched;
      truncated = true;
      break;
    }
    const page = fetched.payload;
    if (!fingerprint) {
      fingerprint = page.basisFingerprint;
      basisVersion = page.basisVersion;
      from = page.from || from;
      to = page.to || to;
      kinds = page.kinds;
      meta = page.meta;
    }
    if (page.truncated) truncated = true;
    for (const row of page.rows) {
      const key = `${row.kind}\0${row.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
      if (rows.length >= MAX_ROWS) break;
    }
    pages += 1;
    cursor = page.nextCursor || '';
    if (!cursor || rows.length >= MAX_ROWS) {
      if (cursor) truncated = true;
      break;
    }
  }

  return {
    status: 200,
    payload: {
      character: ctx.slug,
      from,
      to,
      limit: PAGE_LIMIT,
      returned: rows.length,
      total: rows.length,
      truncated,
      nextCursor: null,
      basisVersion,
      basisFingerprint: fingerprint,
      kinds,
      rows,
      meta,
      source: 'history',
    },
  };
}

async function fetchPage(ctx, { cursor }) {
  const url = new URL(ctx.path, ctx.origin);
  url.searchParams.set('from', ctx.from);
  url.searchParams.set('to', ctx.to);
  url.searchParams.set('limit', String(PAGE_LIMIT));
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
  const history = parseMemoryHistory(raw, ctx.slug);
  if (!history) return { status: 502, payload: { error: 'unavailable' } };
  return { status: 200, payload: history };
}

function publicUpstreamStatus(status) {
  if (status === 400) return 400;
  if (status === 429) return 429;
  if (status === 401 || status === 503) return 503;
  return 502;
}

function cleanRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const id = cleanId(row.id);
  const kind = cleanKind(row.kind);
  const createdAt = cleanIso(row.createdAt);
  if (!id || !kind || !createdAt) return null;
  const vector = finiteVector(row.x, row.y, row.z);
  if (!vector) return null;
  const clean = {
    id,
    kind,
    createdAt,
    snippet: clipText(row.snippet, SNIPPET),
    ...vector,
  };
  const placement = cleanPlacement(row.placement);
  if (row.origin === 'leader_adult') clean.origin = row.origin;
  if (placement) clean.placement = placement;
  for (const key of ['importance', 'strength', 'decay', 'weight']) {
    const metric = cleanMetric(row[key]);
    if (metric != null) clean[key] = metric;
  }
  for (const key of ['lastAccessed', 'updatedAt', 'removedAt']) {
    const at = cleanIso(row[key]);
    if (at) clean[key] = at;
  }
  return clean;
}

function cleanMeta(meta) {
  const source = meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {};
  const weakening = clipText(source.weakeningSupported, 40);
  return {
    removedSupported: source.removedSupported === true,
    weakeningSupported: weakening || 'current',
    snapshotsSupported: source.snapshotsSupported === true,
  };
}

function emptyMeta() {
  return { removedSupported: false, weakeningSupported: 'current', snapshotsSupported: false };
}

function cleanKinds(values) {
  if (!Array.isArray(values)) return [];
  const kinds = [];
  for (const value of values) {
    const kind = cleanKind(value);
    if (kind && !kinds.includes(kind)) kinds.push(kind);
  }
  return kinds;
}

function cleanKind(value) {
  if (typeof value !== 'string') return '';
  const kind = value.trim().toLowerCase();
  return KINDS.has(kind) ? kind : '';
}

function cleanId(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > ID || hasControl(trimmed)) return '';
  return trimmed;
}

function cleanIso(value) {
  if (typeof value !== 'string' || !ISO.test(value)) return '';
  return value;
}

function cleanPlacement(value) {
  return typeof value === 'string' && PLACEMENTS.has(value) ? value : '';
}

function cleanMetric(value) {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(number) || number < 0 || number > 1_000_000) return null;
  return Math.round(number * 10000) / 10000;
}

function cleanTotal(value, fallback) {
  if (value == null) return fallback;
  const total = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(total) || total < 0) return fallback;
  return Math.floor(total);
}

function cleanLimit(value) {
  const limit = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ROWS) return null;
  return limit;
}

function cleanVersion(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 1_000_000) {
    return value;
  }
  return 0;
}

function finiteVector(x, y, z) {
  if (![x, y, z].every((value) => typeof value === 'number' && Number.isFinite(value))) return null;
  const length = Math.hypot(x, y, z);
  if (length === 0 || length > 2) return null;
  return { x, y, z };
}

function clipText(value, max) {
  if (typeof value !== 'string' || max < 1) return '';
  let out = '';
  for (let index = 0; index < value.length; index += 1) {
    out += value.charCodeAt(index) < 32 ? ' ' : value[index];
  }
  return out.replace(/ +/g, ' ').trim().slice(0, max);
}

function hasControl(value) {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) < 32) return true;
  }
  return false;
}
