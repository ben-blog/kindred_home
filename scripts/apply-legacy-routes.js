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
