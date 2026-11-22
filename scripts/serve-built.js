import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { resolveRoute } from '../routing/apply.js';
import { handleEventRequest, handleScopedRequest } from '../src/lib/proxy.js';
import { GET } from '../src/pages/api/health.js';
import { loadCanon, repoRoot } from '../world/load.js';

const staticRoot = path.join(repoRoot, '.vercel', 'output', 'static');
const routes = JSON.parse(
  readFileSync(path.join(repoRoot, '.vercel', 'output', 'config.json'), 'utf8')
).routes;
const characters = loadCanon().characters;

const port = Number(process.env.PORT || 4321);
const server = http.createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname);
  const resolved = resolveRoute(routes, pathname, fileExists);
  try {
    if (resolved.type === 'redirect') {
      response.writeHead(resolved.status, { location: resolved.location });
      response.end();
      return;
    }
    if (resolved.type === 'rewrite') {
      const upstream = await fetch(resolved.dest, { redirect: 'manual' });
      response.writeHead(upstream.status, {
        'content-type': upstream.headers.get('content-type') || 'text/plain',
      });
      response.end(Buffer.from(await upstream.arrayBuffer()));
      return;
    }
    if (resolved.type === 'function' && pathname === '/api/health') {
      const result = await GET();
      await send(response, result);
      return;
    }
    if (resolved.type === 'function' && pathname.startsWith('/api/')) {
      const web = await toWebRequest(request, port);
      const result =
        pathname === '/api/event'
          ? await handleEventRequest(web, { characters })
          : await handleScopedRequest(web, { characters });
      await send(response, result);
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
  } catch {
    response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'unavailable' }));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`serving build on http://127.0.0.1:${port}`);
});

async function send(response, result) {
  const headers = {};
  result.headers.forEach((value, key) => {
    headers[key] = value;
  });
  response.writeHead(result.status, headers);
  response.end(Buffer.from(await result.arrayBuffer()));
}

async function toWebRequest(incoming, listenPort) {
  const chunks = [];
  for await (const chunk of incoming) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const headers = new Headers();
  for (const [key, value] of Object.entries(incoming.headers)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }
  const host = headers.get('host') || `127.0.0.1:${listenPort}`;
  const url = new URL(incoming.url, `http://${host}`);
  const init = { method: incoming.method, headers };
  if (incoming.method !== 'GET' && incoming.method !== 'HEAD') init.body = body;
  return new Request(url, init);
}

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
