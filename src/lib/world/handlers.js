import { randomUUID } from 'node:crypto';
import { createLimiter, clientAddress, sameOrigin } from '../proxy.js';
import { eventSchema } from '../../../world/schema.js';
import { createState } from '../../../world/state.js';
import {
  acceptAccessToken,
  clearCookies,
  exchangeAuthCode,
  leaderRedirect,
  requestMagicLink,
  requireLeader,
  sessionCookies,
  validEmail,
  verifyMagicLink,
} from './auth.js';
import { worldConfig } from './env.js';
import { safeEqual, hashIp } from './hash.js';
import {
  bearer,
  corsHeaders,
  guard,
  json,
  readJson,
  SESSION_BODY_LIMIT,
  SIGNAL_BODY_LIMIT,
} from './http.js';
import { observeDueAlbums } from './album-observe.js';
import { ingestWorld } from './ingest.js';
import { leaderTickEvent, reduceTick } from './pipeline.js';
import { publicState } from './present.js';
import { createWorldStore } from './store.js';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const WHERE = /^\/[A-Za-z0-9/_-]{0,120}$/;
const TOKEN = /^[\x21-\x7E]{1,4096}$/;
const WARMTH_WINDOW_MS = 10 * 60 * 1000;
const warmthLimiter = createLimiter({ limit: 1, windowMs: WARMTH_WINDOW_MS });

export function handleWorldGet(request, options = {}) {
  return guard(() => readWorld(request, options));
}

export function handleWorldSignal(request, options = {}) {
  return guard(() => postSignal(request, options));
}

export function handleWorldTick(request, options = {}) {
  return guard(() => postTick(request, options));
}

export function handleWorldIngest(request, options = {}) {
  return guard(() => runIngest(request, options));
}

export function handleWorldMagic(request, options = {}) {
  return guard(() => postMagic(request, options));
}

export function handleWorldSession(request, options = {}) {
  return guard(() => session(request, options));
}

async function readWorld(request, options) {
  const opened = open(options);
  if (opened.response) return opened.response;
  if (request.method !== 'GET') return methodNotAllowed(request, 'GET');
  const store = options.store ?? createWorldStore(opened.config, options.fetch);
  let row;
  try {
    row = await store.latest(opened.canon.world.id);
  } catch {
    return json(502, { error: 'unavailable' });
  }
  const state = row?.state ?? createState(opened.canon);
  let extras;
  try {
    const records = await store.pendingEvents(opened.canon.world.id, row?.last_event_seq ?? 0);
    const at = new Date((options.now ?? Date.now)()).toISOString();
    const preview = reduceTick(state, records, leaderTickEvent(state, 'preview', at));
    extras = { preview: preview.state };
  } catch {
    // A queued-event read must not hide the last persisted snapshot.
  }
  const view = publicState(state, extras);
  if (!view) return json(502, { error: 'unavailable' });
  return json(200, view);
}

async function postSignal(request, options) {
  const allowed = await allowPost(request, options, 'POST');
  if (allowed.response) return allowed.response;
  const { opened } = allowed;
  const cors = corsHeaders(request, sameOrigin);
  if (!sameOrigin(request)) return json(403, { error: 'forbidden' });

  const read = await readJson(request, SIGNAL_BODY_LIMIT);
  if (read.error) return json(read.status, { error: read.error }, cors);
  const signal = normalizeSignal(read.value, opened.canon);
  if (!signal) return json(400, { error: 'bad request' }, cors);

  const now = options.now ?? Date.now;
  const atMs = now();
  const ip = clientAddress(request);
  const ipHash = hashIp(ip, opened.config.ipSalt);
  const session = await warmthSession(request, opened.config, options);
  if (session.response) return session.response;

  if (!session.leader) {
    const limiter = options.limiter ?? warmthLimiter;
    if (!limiter.allow(`${ipHash}:${signal.target}`, atMs)) {
      return json(
        429,
        { error: 'too many requests' },
        { 'retry-after': '600', ...cors },
        session.cookies
      );
    }
    const reader = options.store ?? createWorldStore(opened.config, options.fetch);
    if (typeof reader.recentWarmth === 'function') {
      let recent = false;
      try {
        recent = await reader.recentWarmth({
          ipHash,
          target: signal.target,
          since: new Date(atMs - WARMTH_WINDOW_MS).toISOString(),
        });
      } catch {
        return json(502, { error: 'unavailable' }, cors, session.cookies);
      }
      if (recent) {
        return json(
          429,
          { error: 'too many requests' },
          { 'retry-after': '600', ...cors },
          session.cookies
        );
      }
    }
  }

  const event = {
    id: options.id ?? randomUUID(),
    worldId: opened.canon.world.id,
    tick: null,
    at: new Date(atMs).toISOString(),
    who: `visitor:${ipHash.slice(0, 12)}`,
    what: 'influence',
    where: signal.where,
    target: signal.target,
    payload: { kind: 'warmth', amount: 1 },
    source: 'visitor-influence',
  };
  const parsed = eventSchema.safeParse(event);
  if (!parsed.success) return json(400, { error: 'bad request' }, cors, session.cookies);

  const store = options.store ?? createWorldStore(opened.config, options.fetch);
  let saved;
  try {
    saved = await store.append({ ...parsed.data, ipHash });
  } catch {
    return json(502, { error: 'unavailable' }, cors, session.cookies);
  }
  if (saved?.error === 'rate_limited') {
    return json(
      429,
      { error: 'too many requests' },
      { 'retry-after': '60', ...cors },
      session.cookies
    );
  }
  if (!saved?.ok) return json(502, { error: 'unavailable' }, cors, session.cookies);
  return json(200, { ok: true }, cors, session.cookies);
}

async function warmthSession(request, config, options) {
  const cookies = request.headers.get('cookie') || '';
  if (!/(?:^|;\s*)world_(?:access|refresh)=/.test(cookies)) return { leader: false, cookies: [] };
  const leader = await requireLeader(request, config, options);
  if (leader.status === 503) {
    return {
      response: json(
        503,
        { error: 'unavailable' },
        corsHeaders(request, sameOrigin),
        leader.cookies ?? []
      ),
    };
  }
  return { leader: leader.ok === true, cookies: leader.cookies ?? [] };
}

async function postTick(request, options) {
  const allowed = await allowPost(request, options, 'POST');
  if (allowed.response) return allowed.response;
  const { opened } = allowed;
  if (!sameOrigin(request)) return json(403, { error: 'forbidden' });
  const leader = await requireLeader(request, opened.config, options);
  if (!leader.ok)
    return json(
      leader.status,
      { error: leader.error },
      corsHeaders(request, sameOrigin),
      leader.cookies ?? []
    );

  const store = options.store ?? createWorldStore(opened.config, options.fetch);
  let begun;
  try {
    begun = await store.begin(opened.canon.world.id);
  } catch {
    return json(502, { error: 'unavailable' }, corsHeaders(request, sameOrigin), leader.cookies);
  }
  if (!begun?.acquired || typeof begun.token !== 'string') {
    return json(409, { error: 'busy' }, corsHeaders(request, sameOrigin), leader.cookies);
  }

  try {
    const base = begun.snapshot == null ? createState(opened.canon) : begun.snapshot;
    if (
      !base ||
      typeof base !== 'object' ||
      Array.isArray(base) ||
      base.worldId !== opened.canon.world.id
    ) {
      throw new Error('state');
    }
    const at = new Date((options.now ?? Date.now)()).toISOString();
    const tickEvent = leaderTickEvent(base, options.id ?? randomUUID(), at);
    const reduced = reduceTick(base, begun.events, tickEvent);
    const lastEventSeq = Math.max(Number(begun.lastEventSeq) || 0, reduced.lastEventSeq);
    const saved = await store.commit({
      worldId: opened.canon.world.id,
      token: begun.token,
      before: base,
      tick: reduced.state.tick,
      state: reduced.state,
      lastEventSeq,
      input: reduced.input,
    });
    if (!saved?.ok) {
      return json(409, { error: 'busy' }, corsHeaders(request, sameOrigin), leader.cookies);
    }
    return json(
      200,
      { ok: true, tick: reduced.state.tick },
      corsHeaders(request, sameOrigin),
      leader.cookies
    );
  } catch {
    await store.abort(opened.canon.world.id, begun.token).catch(() => {});
    return json(502, { error: 'unavailable' }, corsHeaders(request, sameOrigin), leader.cookies);
  }
}

async function runIngest(request, options) {
  const opened = open(options);
  if (opened.response) return opened.response;
  if (request.method !== 'GET') return methodNotAllowed(request, 'GET');
  const secret = bearer(request);
  if (!secret || !safeEqual(secret, opened.config.cronSecret)) {
    return json(401, { error: 'unauthorized' });
  }
  const store = options.store ?? createWorldStore(opened.config, options.fetch);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const now = options.now ? new Date(options.now()) : new Date();
  const sources = await ingestWorld({
    canon: opened.canon,
    store,
    fetch: fetchImpl,
    now,
  });
  let album = [];
  try {
    album = await observeDueAlbums({
      canon: opened.canon,
      store,
      env: options.env ?? process.env,
      fetchImpl,
      now,
      config: opened.config,
      staticGallery: options.staticGallery,
    });
  } catch {
    album = [];
  }
  return json(200, { ok: true, sources, album });
}

async function postMagic(request, options) {
  const allowed = await allowPost(request, options, 'POST');
  if (allowed.response) return allowed.response;
  const { opened } = allowed;
  if (!sameOrigin(request)) return json(403, { error: 'forbidden' });
  const read = await readJson(request, SIGNAL_BODY_LIMIT);
  if (read.error) return json(read.status, { error: read.error }, corsHeaders(request, sameOrigin));
  const keys = Object.keys(read.value);
  if (keys.length !== 1 || keys[0] !== 'email' || !validEmail(read.value.email)) {
    return json(400, { error: 'bad request' }, corsHeaders(request, sameOrigin));
  }
  const fetchImpl = options.fetch ?? globalThis.fetch;
  let sent = false;
  try {
    sent = await requestMagicLink(
      opened.config,
      fetchImpl,
      read.value.email,
      leaderRedirect(request)
    );
  } catch {
    sent = false;
  }
  if (!sent) return json(502, { error: 'unavailable' }, corsHeaders(request, sameOrigin));
  return json(200, { ok: true }, corsHeaders(request, sameOrigin));
}

async function session(request, options) {
  const opened = open(options);
  if (opened.response) return opened.response;
  const cors = corsHeaders(request, sameOrigin);
  if (request.method === 'OPTIONS') return preflight(request, 'GET, POST, DELETE');
  if (!sameOrigin(request)) return json(403, { error: 'forbidden' });
  const fetchImpl = options.fetch ?? globalThis.fetch;

  if (request.method === 'GET') {
    const leader = await requireLeader(request, opened.config, options);
    if (!leader.ok && leader.status === 503) return json(503, { error: 'unavailable' });
    if (!leader.ok) return json(200, { signedIn: false }, cors, leader.cookies ?? []);
    return json(200, { signedIn: true }, cors, leader.cookies);
  }

  if (request.method === 'DELETE') {
    return json(200, { ok: true }, cors, clearCookies(request));
  }

  if (request.method !== 'POST') return methodNotAllowed(request, 'GET, POST, DELETE');
  const read = await readJson(request, SESSION_BODY_LIMIT);
  if (read.error) return json(read.status, { error: read.error }, cors);
  const established = await establish(read.value, opened.config, fetchImpl);
  if (!established.ok) {
    return json(established.status, { error: established.error }, cors, clearCookies(request));
  }
  const cookies = sessionCookies(request, established.session);
  if (!cookies) return json(401, { error: 'unauthorized' }, cors, clearCookies(request));
  return json(200, { ok: true }, cors, cookies);
}

async function establish(body, config, fetchImpl) {
  const keys = Object.keys(body);
  if (keys.length === 2 && keys.includes('tokenHash') && keys.includes('type')) {
    if (!TOKEN.test(body.tokenHash) || (body.type !== 'magiclink' && body.type !== 'email')) {
      return { ok: false, status: 400, error: 'bad request' };
    }
    const session = await verifyMagicLink(config, fetchImpl, body.tokenHash, body.type);
    if (!session?.user?.id) return { ok: false, status: 401, error: 'unauthorized' };
    if (!safeEqual(String(session.user.id).toLowerCase(), config.leaderId)) {
      return { ok: false, status: 403, error: 'forbidden' };
    }
    return { ok: true, session };
  }
  if (keys.length === 2 && keys.includes('accessToken') && keys.includes('refreshToken')) {
    return acceptAccessToken(config, fetchImpl, body.accessToken, body.refreshToken);
  }
  if (
    keys.includes('code') &&
    keys.every((key) => key === 'code' || key === 'codeVerifier')
  ) {
    if (!TOKEN.test(body.code) || (body.codeVerifier != null && !TOKEN.test(body.codeVerifier))) {
      return { ok: false, status: 400, error: 'bad request' };
    }
    const session = await exchangeAuthCode(config, fetchImpl, body.code, body.codeVerifier);
    if (!session?.user?.id) return { ok: false, status: 401, error: 'unauthorized' };
    if (!safeEqual(String(session.user.id).toLowerCase(), config.leaderId)) {
      return { ok: false, status: 403, error: 'forbidden' };
    }
    return { ok: true, session };
  }
  return { ok: false, status: 400, error: 'bad request' };
}

function open(options) {
  const config = worldConfig(options.env ?? process.env);
  if (!config) return { response: json(503, { error: 'unavailable' }) };
  const canon = options.canon;
  if (!canon?.world?.id || !Array.isArray(canon.characters) || !Array.isArray(canon.sources)) {
    return { response: json(503, { error: 'unavailable' }) };
  }
  return { config, canon };
}

async function allowPost(request, options, allow) {
  const opened = open(options);
  if (opened.response) return { response: opened.response };
  if (request.method === 'OPTIONS') return { response: preflight(request, 'POST') };
  if (request.method !== 'POST') return { response: methodNotAllowed(request, allow) };
  return { opened };
}

function preflight(request, methods) {
  if (!sameOrigin(request)) return json(403, { error: 'forbidden' });
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(request, sameOrigin),
      'access-control-allow-methods': methods,
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '600',
      'cache-control': 'no-store',
    },
  });
}

function methodNotAllowed(request, allow) {
  return json(405, { error: 'method not allowed' }, { allow, ...corsHeaders(request, sameOrigin) });
}

function normalizeSignal(body, canon) {
  const keys = Object.keys(body);
  if (
    !keys.includes('target') ||
    keys.some((key) => !['target', 'amount', 'where'].includes(key))
  ) {
    return null;
  }
  if (typeof body.target !== 'string' || !SLUG.test(body.target)) return null;
  const character = canon.characters.find(
    (item) => item.slug === body.target && item.status === 'active'
  );
  if (!character) return null;
  const amount = body.amount == null ? 1 : body.amount;
  const max = canon.world?.rules?.maxInfluencePerEvent;
  if (amount !== 1 || !Number.isInteger(max) || amount > max) return null;
  if (body.where != null && (typeof body.where !== 'string' || !WHERE.test(body.where)))
    return null;
  return { target: body.target, amount, where: body.where ?? null };
}
