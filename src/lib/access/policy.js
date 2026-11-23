/**
 * Deny-by-default access for kinxdred.com.
 * A path is public only when it is listed here. New routes are leader-only
 * until they are added.
 */

const PUBLIC_EXACT = new Set([
  '/',
  '/index.html',
  '/main.html',
  '/kin',
  '/dred',
  '/characters',
  '/works',
  '/c',
  '/favicon.svg',
  '/favicon.ico',
  '/kin_default.webp',
  '/dred_default2.webp',
  '/robots.txt',
  '/sitemap.xml',
  '/login',
  '/api/health',
  '/api/event',
]);

const PUBLIC_PREFIXES = [
  '/kin/',
  '/dred/',
  '/characters/',
  '/works/',
  '/c/',
  '/assets/',
  '/data/',
  '/js/',
  '/_astro/',
  '/mood-camera',
  '/_next/',
];

const ASSET = /\.(?:avif|css|gif|ico|jpeg|jpg|js|json|map|png|svg|txt|webp|xml|woff2?)$/i;

export function normalizePath(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.includes('\\')) {
    return '/';
  }
  if (pathname.includes('\0') || pathname.includes('..')) return '/';
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

export function classify(url, method = 'GET') {
  const verb = String(method || 'GET').toUpperCase();
  if (verb === 'OPTIONS') return { access: 'public' };
  const path = normalizePath(url.pathname);
  if (isPublic(path, verb)) return { access: 'public' };
  if (path === '/api/world/ingest') return { access: 'cron' };
  if (path === '/world/admin' && magicQuery(url)) {
    return { access: 'redirect', location: `/login${url.search}` };
  }
  return { access: 'leader', api: path === '/api' || path.startsWith('/api/') };
}

function isPublic(path, method) {
  if (PUBLIC_EXACT.has(path)) return true;
  if (PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  if (ASSET.test(path) && !path.startsWith('/world') && !path.startsWith('/api')) return true;
  if (method === 'GET' || method === 'HEAD') {
    if (path === '/api/gallery/file') return true;
    if (/^\/api\/gallery\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path)) return true;
  }
  if (path === '/api/world/auth/magic' || path === '/api/world/auth/session') return true;
  if (method === 'POST' && /^\/api\/[a-z0-9]+(?:-[a-z0-9]+)*\/event$/.test(path)) return true;
  return false;
}

function magicQuery(url) {
  const keys = ['token_hash', 'type', 'code', 'error', 'error_description'];
  return keys.some((key) => url.searchParams.has(key));
}

export function loginLocation(url) {
  const next = `${url.pathname}${url.search}`;
  return `/login?next=${encodeURIComponent(next)}`;
}
