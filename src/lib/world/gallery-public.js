import { createLimiter, clientAddress, sameOrigin } from '../proxy.js';
import { worldConfig } from './env.js';
import { createAlbumStore } from './album-store.js';
import { publicImages, storagePublicUrl } from './gallery-feed.js';
import { guard, json } from './http.js';

const FILENAME = /^[a-z0-9][a-z0-9_-]{0,80}\.webp$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const feedLimiter = createLimiter({ limit: 60, windowMs: 60_000 });
const fileLimiter = createLimiter({ limit: 180, windowMs: 60_000 });

export function handleGalleryFeed(request, options = {}) {
  return guard(() => feed(request, options));
}

export function handleGalleryFile(request, options = {}) {
  return guard(() => file(request, options));
}

async function feed(request, options) {
  if (!sameOrigin(request)) return json(403, { error: 'forbidden' });
  if (request.method !== 'GET') return json(405, { error: 'method not allowed' }, { allow: 'GET' });
  const config = worldConfig(options.env ?? process.env);
  if (!config) return json(503, { error: 'unavailable' });
  const slug = typeof options.slug === 'string' ? options.slug : '';
  if (!SLUG.test(slug) || !publicCharacter(options.canon, slug)) {
    return json(404, { error: 'not found' });
  }
  const limiter = options.limiter ?? feedLimiter;
  const now = options.now ?? Date.now;
  if (!limiter.allow(clientAddress(request), now())) {
    return json(429, { error: 'too many requests' }, { 'retry-after': '60' });
  }
  const store = options.store ?? createAlbumStore(config, options.fetch ?? globalThis.fetch);
  try {
    const [rows, likes, names] = await Promise.all([
      store.activeItems(slug),
      store.likeCounts(),
      store.tagNames(),
    ]);
    return json(200, { images: publicImages(options.staticDoc, rows, likes, names) });
  } catch {
    return json(502, { error: 'unavailable' });
  }
}

async function file(request, options) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json(405, { error: 'method not allowed' }, { allow: 'GET' });
  }
  const filename = typeof options.filename === 'string' ? options.filename : '';
  if (!FILENAME.test(filename)) return json(404, { error: 'not found' });
  const config = worldConfig(options.env ?? process.env);
  if (!config) return json(404, { error: 'not found' });
  const limiter = options.limiter ?? fileLimiter;
  const now = options.now ?? Date.now;
  if (!limiter.allow(clientAddress(request), now())) {
    return json(429, { error: 'too many requests' }, { 'retry-after': '60' });
  }
  const store = options.store ?? createAlbumStore(config, options.fetch ?? globalThis.fetch);
  let row;
  try {
    row = await store.itemByFilename(filename);
  } catch {
    return json(404, { error: 'not found' });
  }
  if (!row || row.is_active === false) return json(404, { error: 'not found' });
  const location = storagePublicUrl(config.url, row.character, row.filename);
  if (!location) return json(404, { error: 'not found' });
  return new Response(null, {
    status: 302,
    headers: {
      location,
      'cache-control': 'public, max-age=86400',
      'x-content-type-options': 'nosniff',
    },
  });
}

function publicCharacter(canon, slug) {
  return (canon?.characters || []).some(
    (item) => item.slug === slug && (item.status === 'active' || item.status === 'archived')
  );
}
