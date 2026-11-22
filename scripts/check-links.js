import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { resolveRoute } from '../routing/apply.js';
import { GET } from '../src/pages/api/health.js';
import { repoRoot } from '../world/load.js';

const staticRoot = path.join(repoRoot, '.vercel', 'output', 'static');
const configPath = path.join(repoRoot, '.vercel', 'output', 'config.json');
const routes = JSON.parse(readFileSync(configPath, 'utf8')).routes ?? [];
const failures = [];

const preserved = [
  'index.html',
  'main.html',
  'favicon.svg',
  'kin/index.html',
  'dred/index.html',
  'dred/d14/index.html',
  'js/site-base.js',
  'js/gallery.js',
  'js/d14.js',
  'data/kindred_gallery_kin.json',
  'data/kindred_gallery_dred.json',
  'data/main-actions.json',
  'kin_default.webp',
  'dred_default2.webp',
];

for (const rel of preserved) {
  const source = readFileSync(path.join(repoRoot, 'public', rel));
  const built = path.join(staticRoot, rel);
  if (!existsSync(built) || !readFileSync(built).equals(source)) {
    failures.push(`preserved file changed or missing: ${rel}`);
  }
}

if (existsSync(path.join(staticRoot, 'c', 'template', 'index.html'))) {
  failures.push('draft campaign /c/template was published');
}
const d14 = readFileSync(path.join(staticRoot, 'dred/d14/index.html'), 'utf8');
const threeUrl = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
if (!d14.includes(threeUrl)) failures.push('D14 no longer loads three.js r128 from cdnjs');
if (!readFileSync(path.join(staticRoot, 'kin/index.html'), 'utf8').includes('kindred_gallery_kin.json')) {
  failures.push('KIN hub no longer reads its gallery JSON');
}
if (!readFileSync(path.join(staticRoot, 'dred/index.html'), 'utf8').includes('kindred_gallery_dred.json')) {
  failures.push('DRED hub no longer reads its gallery JSON');
}

for (const html of walkHtml(staticRoot)) {
  const text = readFileSync(html, 'utf8');
  const rel = path.relative(staticRoot, html);
  if (rel.startsWith(`characters${path.sep}`) || rel.startsWith(`works${path.sep}`)) {
    if (text.includes('railway.app')) failures.push(`${rel} exposes an agent URL`);
  }
  const base = pageBase(rel);
  for (const href of linksIn(text)) {
    let target;
    try {
      target = new URL(href, base);
    } catch {
      failures.push(`${rel}: unreadable link ${href}`);
      continue;
    }
    if (target.origin !== 'http://local') continue;
    const resolved = resolveRoute(routes, target.pathname, fileExists);
    if (resolved.type === 'miss') failures.push(`${rel}: broken link ${target.pathname}`);
  }
}

const probes = [
  ['/', 'file'],
  ['/index.html', 'file'],
  ['/main.html', 'file'],
  ['/kin', 'file'],
  ['/kin/', 'file'],
  ['/dred', 'file'],
  ['/dred/', 'file'],
  ['/dred/d14', 'file'],
  ['/dred/d14/', 'file'],
  ['/data/kindred_gallery_kin.json', 'file'],
  ['/data/kindred_gallery_dred.json', 'file'],
  ['/data/main-actions.json', 'file'],
  ['/js/site-base.js', 'file'],
  ['/js/gallery.js', 'file'],
  ['/js/d14.js', 'file'],
  ['/favicon.svg', 'file'],
  ['/kin_default.webp', 'file'],
  ['/dred_default2.webp', 'file'],
  ['/assets/gallery/dred_rooftop_sunset_v1.webp', 'file'],
  ['/characters', 'file'],
  ['/characters/', 'file'],
  ['/characters/kin', 'file'],
  ['/characters/kin/', 'file'],
  ['/characters/dred', 'file'],
  ['/characters/dred/', 'file'],
  ['/works/', 'file'],
  ['/works/d14/', 'file'],
  ['/works/gaze/', 'file'],
  ['/kin/k2', 'redirect', '/main.html'],
  ['/kin/k2/', 'redirect', '/main.html'],
  ['/kin/k2/foo', 'redirect', '/main.html'],
  ['/kin/k2/foo/', 'redirect', '/main.html'],
  ['/dred/d2', 'redirect', '/main.html'],
  ['/dred/d2/', 'redirect', '/main.html'],
  ['/dred/d2/foo', 'redirect', '/main.html'],
  ['/dred/d2/foo/', 'redirect', '/main.html'],
  ['/mood-camera', 'rewrite', 'https://mirrored-five.vercel.app/mood-camera'],
  ['/mood-camera/play', 'rewrite', 'https://mirrored-five.vercel.app/mood-camera/play'],
  ['/_next/static/chunk.js', 'rewrite', 'https://mirrored-five.vercel.app/_next/static/chunk.js'],
  ['/api/health', 'function'],
];

for (const [pathname, type, expected] of probes) {
  const resolved = resolveRoute(routes, pathname, fileExists);
  if (resolved.type !== type) {
    failures.push(`${pathname}: expected ${type}, got ${resolved.type}`);
    continue;
  }
  if (type === 'redirect' && resolved.location !== expected) {
    failures.push(`${pathname}: redirect ${resolved.location} !== ${expected}`);
  }
  if (type === 'rewrite' && resolved.dest !== expected) {
    failures.push(`${pathname}: rewrite ${resolved.dest} !== ${expected}`);
  }
}

const health = await GET();
const healthBody = await health.json();
if (health.status !== 200 || healthBody.ok !== true) failures.push('/api/health handler did not return {ok:true}');

const server = http.createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname);
  const resolved = resolveRoute(routes, pathname, fileExists);
  if (resolved.type === 'redirect') {
    response.writeHead(resolved.status, { location: resolved.location });
    response.end();
    return;
  }
  if (resolved.type === 'rewrite') {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'x-rewrite-dest': resolved.dest });
    response.end(resolved.dest);
    return;
  }
  if (resolved.type === 'function' && pathname === '/api/health') {
    const result = await GET();
    response.writeHead(result.status, { 'content-type': 'application/json; charset=utf-8' });
    response.end(Buffer.from(await result.arrayBuffer()));
    return;
  }
  if (resolved.type === 'file') {
    const file = findFile(pathname);
    response.writeHead(200);
    createReadStream(file).pipe(response);
    return;
  }
  response.writeHead(404);
  response.end('missing');
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const rows = [];

for (const [pathname, type, expected] of probes) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { redirect: 'manual' });
  let ok = true;
  let detail = String(response.status);
  if (type === 'redirect') {
    ok = response.status === 308 && response.headers.get('location') === expected;
    detail = `${response.status} ${response.headers.get('location')}`;
  } else if (type === 'rewrite') {
    const body = await response.text();
    ok = response.status === 200 && body === expected;
    detail = body;
  } else if (type === 'function') {
    const body = await response.json();
    ok = response.status === 200 && body.ok === true;
    detail = JSON.stringify(body);
  } else {
    ok = response.status === 200;
    await response.arrayBuffer();
  }
  if (!ok) failures.push(`curl ${pathname}: ${detail}`);
  rows.push({ pathname, result: ok ? detail : `FAIL ${detail}` });
}

server.close();

console.table(rows);
if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
console.log(`link check ok (${rows.length} routes)`);

function fileExists(pathname) {
  return Boolean(findFile(pathname));
}

function findFile(pathname) {
  let rel = decodeURIComponent(pathname).replace(/^\/+/, '');
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

function walkHtml(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(full, found);
    else if (entry.name.endsWith('.html')) found.push(full);
  }
  return found;
}

function pageBase(rel) {
  const urlPath = `/${rel.split(path.sep).join('/')}`;
  if (urlPath.endsWith('/index.html')) {
    return `http://local${urlPath.slice(0, -'index.html'.length)}`;
  }
  return `http://local${urlPath}`;
}

function linksIn(html) {
  const found = [];
  const pattern = /\s(?:href|src)=["']([^"']+)["']/g;
  for (const match of html.matchAll(pattern)) found.push(match[1]);
  return found;
}
