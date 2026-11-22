import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { resolveRoute } from '../routing/apply.js';
import { GET } from '../src/pages/api/health.js';
import { repoRoot } from '../world/load.js';

const staticRoot = path.join(repoRoot, '.vercel', 'output', 'static');
const routes = JSON.parse(readFileSync(path.join(repoRoot, '.vercel', 'output', 'config.json'), 'utf8')).routes;

const port = Number(process.env.PORT || 4321);
const server = http.createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname);
  const resolved = resolveRoute(routes, pathname, fileExists);
  if (resolved.type === 'redirect') {
    response.writeHead(resolved.status, { location: resolved.location });
    response.end();
    return;
  }
  if (resolved.type === 'rewrite') {
    const upstream = await fetch(resolved.dest, { redirect: 'manual' });
    response.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') || 'text/plain' });
    response.end(Buffer.from(await upstream.arrayBuffer()));
    return;
  }
  if (resolved.type === 'function' && pathname === '/api/health') {
    const result = await GET();
    response.writeHead(result.status, { 'content-type': 'application/json; charset=utf-8' });
    response.end(Buffer.from(await result.arrayBuffer()));
    return;
  }
  const file = findFile(pathname);
  if (file) {
    response.writeHead(200);
    createReadStream(file).pipe(response);
    return;
  }
  response.writeHead(404);
  response.end('missing');
});

server.listen(port, '127.0.0.1', () => {
  console.log(`serving build on http://127.0.0.1:${port}`);
});

function fileExists(pathname) {
  return Boolean(findFile(pathname));
}

function findFile(pathname) {
  const rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  if (rel.split('/').includes('..')) return null;
  const candidates =
    rel === '' || rel.endsWith('/')
      ? [path.join(staticRoot, rel, 'index.html')]
      : [path.join(staticRoot, rel), path.join(staticRoot, rel, 'index.html')];
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (!resolved.startsWith(staticRoot)) continue;
    if (existsSync(resolved) && statSync(resolved).isFile()) return resolved;
  }
  return null;
}
