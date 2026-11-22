/**
 * Adapter for the agent memory map and the chat trace.
 * Map: { character, basisVersion, total, points: [{ id, kind, label, createdAt, x, y, z }] }
 * Trace event `event: trace`: { stage: 'retrieved', items } or { stage: 'saved', ids }
 * Change this file if that contract moves. The proxy and the call both use it.
 */
import { clientAddress, createLimiter, sameOrigin } from '../proxy.js';
import { requireLeader } from './auth.js';
import { chatRoutes } from './chat.js';
import { httpsOrigin, worldConfig } from './env.js';
import { corsHeaders, guard, json } from './http.js';

export const MEMORY_RATE_LIMIT = 40;
export const MEMORY_TIMEOUT_MS = 8_000;
const MAX_POINTS = 400;
const MAX_ITEMS = 12;
const MAX_IDS = 40;
const MAX_BODY = 512 * 1024;
const LABEL = 80;
const ID = 80;
const KIND = /^[a-z0-9][a-z0-9_-]{0,39}$/i;
const SINCE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const TOKEN = /^[\x21-\x7E]{1,4096}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const sharedLimiter = createLimiter({ limit: MEMORY_RATE_LIMIT, windowMs: 60_000 });

export function parseMemoryMap(raw, slug) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (!Array.isArray(raw.points)) return null;
  const points = [];
  for (const point of raw.points) {
    const clean = cleanPoint(point);
    if (clean) points.push(clean);
    if (points.length >= MAX_POINTS) break;
  }
  const version = cleanVersion(raw.basisVersion);
  const total = Number.isFinite(raw.total) ? Math.max(0, Math.floor(raw.total)) : points.length;
  return {
    character: slug,
    basisVersion: version,
    total,
    points,
  };
}

export function parseTrace(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.stage === 'retrieved') {
    if (!Array.isArray(raw.items)) return null;
    const items = [];
    for (const item of raw.items) {
      const clean = cleanItem(item);
      if (clean) items.push(clean);
      if (items.length >= MAX_ITEMS) break;
    }
    return { type: 'trace', stage: 'retrieved', items };
  }
  if (raw.stage === 'saved') {
    if (!Array.isArray(raw.ids)) return null;
    const ids = [];
    for (const id of raw.ids) {
      const clean = cleanId(id);
      if (clean) ids.push(clean);
      if (ids.length >= MAX_IDS) break;
    }
    return { type: 'trace', stage: 'saved', ids };
  }
  return null;
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

  const since = new URL(request.url).searchParams.get('since');
  if (since != null && !SINCE.test(since)) {
    return json(400, { error: 'bad request' }, cors, leader.cookies);
  }

  const headers = new Headers();
  headers.set('accept', 'application/json');
  headers.set('authorization', `Bearer ${token}`);
  headers.set('x-admin-key', token);
  const url = new URL(route.memory, origin);
  if (since) url.searchParams.set('since', since);

  const fetchImpl = options.fetch ?? globalThis.fetch;
  let upstream;
  try {
    upstream = await fetchImpl(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(options.timeoutMs ?? MEMORY_TIMEOUT_MS),
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    return json(502, { error: 'unavailable' }, cors, leader.cookies);
  }
  if (!upstream.ok) {
    await upstream.body?.cancel().catch(() => {});
    return json(502, { error: 'unavailable' }, cors, leader.cookies);
  }
  const text = await upstream.text();
  if (text.length > MAX_BODY) return json(502, { error: 'unavailable' }, cors, leader.cookies);
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return json(502, { error: 'unavailable' }, cors, leader.cookies);
  }
  const map = parseMemoryMap(raw, slug);
  if (!map) return json(502, { error: 'unavailable' }, cors, leader.cookies);
  return json(200, map, cors, leader.cookies);
}

function cleanPoint(point) {
  if (!point || typeof point !== 'object' || Array.isArray(point)) return null;
  const id = cleanId(point.id);
  const kind =
    typeof point.kind === 'string' && KIND.test(point.kind) ? point.kind.toLowerCase() : '';
  if (!id || !kind) return null;
  const vector = unitVector(point.x, point.y, point.z);
  if (!vector) return null;
  const clean = { id, kind, label: clipLabel(point.label), ...vector };
  if (typeof point.createdAt === 'string' && SINCE.test(point.createdAt))
    clean.createdAt = point.createdAt;
  return clean;
}

function cleanItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const id = cleanId(item.id);
  const kind = typeof item.kind === 'string' && KIND.test(item.kind) ? item.kind.toLowerCase() : '';
  if (!id || !kind) return null;
  const clean = { id, kind, label: clipLabel(item.label) };
  if (typeof item.score === 'number' && Number.isFinite(item.score)) {
    clean.score = Math.round(item.score * 1000) / 1000;
  }
  return clean;
}

function cleanId(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > ID || hasControl(trimmed)) return '';
  return trimmed;
}

function clipLabel(value) {
  if (typeof value !== 'string') return '';
  return stripControl(value).trim().slice(0, LABEL);
}

function cleanVersion(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return '';
  return stripControl(value).trim().slice(0, 80);
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
