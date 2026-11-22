import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getTransformedRoutes } from '@vercel/routing-utils';
import { vercelRedirects, vercelRewrites } from '../routing/legacy.js';
import { repoRoot } from '../world/load.js';

const configPath = path.join(repoRoot, '.vercel', 'output', 'config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const redirectRoutes = routesOf(getTransformedRoutes({ redirects: vercelRedirects })).filter(
  (route) => route.status
);
const rewriteRoutes = routesOf(getTransformedRoutes({ rewrites: vercelRewrites })).filter(
  (route) => route.dest
);

const filesystemAt = config.routes.findIndex((route) => route.handle === 'filesystem');
if (filesystemAt === -1) {
  throw new Error('Vercel output is missing the filesystem handle');
}

const seen = new Set(config.routes.map(routeKey));
const missingRedirects = redirectRoutes.filter((route) => !seen.has(routeKey(route)));
const missingRewrites = rewriteRoutes.filter((route) => !seen.has(routeKey(route)));
config.routes.splice(filesystemAt, 0, ...missingRedirects);
const filesystemNow = config.routes.findIndex((route) => route.handle === 'filesystem');
config.routes.splice(filesystemNow + 1, 0, ...missingRewrites);
// A file already in public/assets/gallery wins. Only a missing file falls through
// to the storage redirect, so that rewrite has to sit after the filesystem handle.
const gallery = [];
const seenGallery = new Set();
config.routes = config.routes.filter((route) => {
  if (!isGalleryFileRewrite(route)) return true;
  const key = routeKey(route);
  if (!seenGallery.has(key)) {
    seenGallery.add(key);
    gallery.push(route);
  }
  return false;
});
const filesystemAtEnd = config.routes.findIndex((route) => route.handle === 'filesystem');
config.routes.splice(filesystemAtEnd + 1, 0, ...gallery);
// One registration. Vercel also reads vercel.json crons and rejects a second copy.
config.crons = [{ path: '/api/world/ingest', schedule: '0 15 * * *' }];
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

function routesOf(result) {
  if (result.error) throw new Error(result.error.message);
  return result.routes ?? [];
}

function routeKey(route) {
  return `${route.src}|${route.dest ?? ''}|${route.headers?.Location ?? ''}`;
}

function isGalleryFileRewrite(route) {
  return (
    typeof route.src === 'string' &&
    route.src.includes('assets/gallery') &&
    typeof route.dest === 'string' &&
    route.dest.includes('/api/gallery/file')
  );
}
