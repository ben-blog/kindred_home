import { upstreamTokens, clientAddress, createLimiter, sameOrigin } from '../proxy.js';
import { createAlbumStore } from './album-store.js';
import { albumCandidates, askDredPick, ensureAlbumPick, fallbackPick } from './album-pick.js';
import { createWorldStore } from './store.js';
import { kstDateKey, perceiveChat } from './perception.js';
import { voiceFor } from './album-voice.js';
import { httpsOrigin, worldConfig } from './env.js';
import { guard, json } from './http.js';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CHAT_PATH = /^\/api\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:[_-][a-z0-9]+)*)+$/;
const TOKEN = /^[\x21-\x7E]{1,4096}$/;
const pickLimiter = createLimiter({ limit: 60, windowMs: 60_000 });

/**
 * The observing album is the void layout. A board hub has no pick route.
 */
export function albumObserver(character) {
  if (!character || (character.status !== 'active' && character.status !== 'archived')) return null;
  if (character.layout !== 'void') return null;
  const agent = character.agent;
  if (!agent || typeof agent.chat !== 'string' || !CHAT_PATH.test(agent.chat)) return null;
  if (!agent.chat.startsWith(`/api/${character.slug}/`)) return null;
  if (!Object.hasOwn(upstreamTokens, agent.upstream)) return null;
  if (typeof character.slug !== 'string' || !SLUG.test(character.slug)) return null;
  return {
    slug: character.slug,
    upstream: agent.upstream,
    tokenEnv: upstreamTokens[agent.upstream],
    path: agent.chat,
  };
}

export function handleAlbumPick(request, options = {}) {
  return guard(() => serve(request, options));
}

export async function observeDueAlbums(input) {
  if (typeof input.store?.findEvent !== 'function' || typeof input.store?.append !== 'function') {
    return [];
  }
  const gallery = input.staticGallery;
  if (typeof gallery !== 'function') return [];
  const out = [];
  for (const character of input.canon?.characters || []) {
    const observer = albumObserver(character);
    const doc = observer ? gallery(observer.slug) : null;
    if (!observer || !doc) continue;
    try {
      const rows = await rowsFor(input, observer.slug);
      const pick = await resolveObserver({
        observer,
        canon: input.canon,
        store: input.store,
        env: input.env,
        fetchImpl: input.fetchImpl,
        now: input.now,
        rows,
        staticDoc: doc,
      });
      out.push({ slug: observer.slug, ok: true, source: pick.source });
    } catch {
      out.push({ slug: observer.slug, ok: false, source: 'fallback' });
    }
  }
  return out;
}

async function rowsFor(input, slug) {
  if (Array.isArray(input.rows)) return input.rows;
  if (!input.config) return [];
  try {
    const album = input.albumStore ?? createAlbumStore(input.config, input.fetchImpl);
    return await album.activeItems(slug);
  } catch {
    return [];
  }
}

async function serve(request, options) {
  if (!sameOrigin(request)) return json(403, { error: 'forbidden' });
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json(405, { error: 'method not allowed' }, { allow: 'GET' });
  }
  const slug = typeof options.slug === 'string' ? options.slug : '';
  const canon = options.canon;
  const character = (canon?.characters || []).find((item) => item.slug === slug);
  const observer = albumObserver(character);
  const gallery = options.staticGallery;
  const doc = observer && typeof gallery === 'function' ? gallery(slug) : null;
  if (!observer || !doc || !canon?.world?.id) return json(404, { error: 'not found' });

  const limiter = options.limiter ?? pickLimiter;
  const nowMs = options.now ?? Date.now;
  if (!limiter.allow(clientAddress(request), nowMs())) {
    return json(429, { error: 'too many requests' }, { 'retry-after': '60' });
  }

  const now = new Date(nowMs());
  const env = options.env ?? process.env;
  const config = worldConfig(env);
  const staticItems = albumCandidates(doc, []);
  if (!config) {
    if (!staticItems.length) return json(404, { error: 'not found' });
    const pick = fallbackPick(staticItems, kstDateKey(now), voiceFor(slug));
    return json(200, publicPick(kstDateKey(now), pick, 'fallback'), {
      'cache-control': 'no-store',
    });
  }

  const fetchImpl = options.fetch ?? globalThis.fetch;
  const world = options.store ?? createWorldStore(config, fetchImpl);
  let rows = [];
  if (Array.isArray(options.rows)) rows = options.rows;
  else {
    try {
      const album = options.albumStore ?? createAlbumStore(config, fetchImpl);
      rows = await album.activeItems(slug);
    } catch {
      rows = [];
    }
  }
  if (!albumCandidates(doc, rows).length) return json(404, { error: 'not found' });
  const pick = await resolveObserver({
    observer,
    canon,
    store: world,
    env,
    fetchImpl,
    now,
    rows,
    staticDoc: doc,
    ask: options.ask,
    loadWorld: options.loadWorld,
    waitMs: options.waitMs,
    sleep: options.sleep,
  });
  const cache = pick.stored ? `public, max-age=60, s-maxage=${seoulCacheSeconds(now)}` : 'no-store';
  return json(200, publicPick(pick.date || kstDateKey(now), pick, pick.source), {
    'cache-control': cache,
  });
}

async function resolveObserver(input) {
  const items = albumCandidates(input.staticDoc, input.rows || []);
  const voice = voiceFor(input.observer.slug);
  const ask = input.ask === undefined ? askFromEnv(input) : input.ask;
  return ensureAlbumPick({
    now: input.now,
    worldId: input.canon.world.id,
    slug: input.observer.slug,
    items,
    voice,
    store: input.store,
    waitMs: input.waitMs,
    sleep: input.sleep,
    loadWorld:
      input.loadWorld === undefined
        ? () =>
            perceiveChat({
              store: input.store,
              canon: input.canon,
              slug: input.observer.slug,
              now: input.now,
              leader: false,
            }).then((perceived) => perceived.worldState)
        : input.loadWorld,
    ask,
  });
}

function askFromEnv(input) {
  const env = input.env || {};
  const origin = httpsOrigin(env[input.observer.upstream]);
  const token = env[input.observer.tokenEnv];
  if (!origin || typeof token !== 'string' || !TOKEN.test(token)) return null;
  return ({ prompt, worldState, date }) =>
    askDredPick({
      origin,
      token,
      path: input.observer.path,
      worldState,
      prompt,
      date,
      fetchImpl: input.fetchImpl,
      timeoutMs: 12_000,
    });
}

function publicPick(date, pick, source) {
  return {
    date: date || '',
    item_ids: pick.item_ids,
    line: pick.line,
    source: source === 'agent' ? 'agent' : 'fallback',
  };
}

export function seoulCacheSeconds(now) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const num = (type) => Number(parts.find((part) => part.type === type)?.value);
  const hour = num('hour');
  const minute = num('minute');
  const second = num('second');
  if (![hour, minute, second].every((value) => Number.isInteger(value))) return 300;
  const elapsed = (hour % 24) * 3600 + minute * 60 + second;
  return Math.max(30, Math.min(3600, 86400 - elapsed));
}
