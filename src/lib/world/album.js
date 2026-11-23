import { randomUUID } from 'node:crypto';
import { upstreamTokens, clientAddress, createLimiter, sameOrigin } from '../proxy.js';
import { requireLeader } from './auth.js';
import { cleanCaption, requestCaption } from './album-caption.js';
import { toWebp } from './album-image.js';
import { createAlbumStore } from './album-store.js';
import { httpsOrigin, worldConfig } from './env.js';
import { composeFeltMemory } from './felt.js';
import { corsHeaders, guard, json, readJson } from './http.js';

export const MAX_BYTES = 15 * 1024 * 1024;
export const CHUNK_BYTES = 3 * 1024 * 1024;
const NOTE_MAX = 200;
const REASON_MAX = 500;
const TOKEN = /^[\x21-\x7E]{1,4096}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SITE_GALLERY = 'https://www.kinxdred.com/assets/gallery/';

const albumLimiter = createLimiter({ limit: 30, windowMs: 60_000 });
const generateLimiter = createLimiter({ limit: 8, windowMs: 60_000 });

export function handleAlbum(request, options = {}) {
  return guard(() => dispatch(request, options));
}

export function albumNames(slug, id) {
  const hex = id.replace(/-/g, '').slice(0, 12);
  const stem = `${slug}_album_${hex}`;
  return { itemId: stem, filename: `${stem}.webp` };
}

export function galleryUrl(filename) {
  return `${SITE_GALLERY}${filename}`;
}

export function galleryRow(slug, itemId, filename, order, caption) {
  return {
    item_id: itemId,
    character: slug,
    filename,
    style: caption.style,
    order_num: order,
    is_active: true,
    show_on_main: caption.show_on_main === true,
    title_ko: caption.ko.title,
    title_en: caption.en.title,
    technique_ko: caption.ko.technique,
    technique_en: caption.en.technique,
    description_ko: caption.ko.description,
    description_en: caption.en.description,
    kin_perspective_ko: caption.ko.kin_perspective,
    kin_perspective_en: caption.en.kin_perspective,
    dred_perspective_ko: caption.ko.dred_perspective,
    dred_perspective_en: caption.en.dred_perspective,
    actions: {},
    tags: caption.tags.map((tag) => tag.name_ko),
  };
}

export function sniffImage(bytes) {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return '';
}

async function dispatch(request, options) {
  const opened = await openLeader(request, options);
  if (opened.response) return opened.response;
  const route = matchRoute(new URL(request.url).pathname);
  if (!route) return fail(404, { error: 'not found' }, opened);
  if (route.kind === 'collection') return collection(request, opened, options);
  const row = await opened.store.getSubmission(route.id);
  if (!row) return fail(404, { error: 'not found' }, opened);
  if (route.kind === 'file') return file(request, opened, row);
  if (route.kind === 'chunk') return chunk(request, opened, row);
  if (route.kind === 'receive') return receive(request, opened, row, options);
  if (route.kind === 'generate') return generate(request, opened, row, options);
  if (route.kind === 'reject') return reject(request, opened, row);
  if (route.kind === 'publish') return publish(request, opened, row, options);
  if (request.method === 'GET') return ok(200, present(row), opened);
  if (request.method === 'PATCH') return edit(request, opened, row);
  return methodNotAllowed(request, opened, 'GET, PATCH');
}

async function collection(request, opened, options) {
  if (request.method === 'GET') {
    const rows = await opened.store.listSubmissions();
    return ok(200, { submissions: rows.map(present) }, opened);
  }
  if (request.method !== 'POST') return methodNotAllowed(request, opened, 'GET, POST');
  const read = await readJson(request, 4096);
  if (read.error) return fail(read.status, { error: read.error }, opened);
  const type = read.value.type === 'image/jpg' ? 'image/jpeg' : read.value.type;
  if (type !== 'image/png' && type !== 'image/jpeg' && type !== 'image/webp') {
    return fail(400, { error: 'bad request', detail: 'Use a png, jpeg, or webp.' }, opened);
  }
  const bytes = read.value.bytes;
  if (!Number.isInteger(bytes) || bytes < 32 || bytes > MAX_BYTES) {
    return fail(413, { error: 'too large', detail: 'The picture must be under 15MB.' }, opened);
  }
  const note = clipNote(read.value.note);
  if (note == null)
    return fail(400, { error: 'bad request', detail: 'The note is too long.' }, opened);
  const character = findCharacter(options.canon, read.value.character, 'active');
  if (!character?.agent?.album) {
    return fail(400, { error: 'bad request', detail: 'Pick a character.' }, opened);
  }
  const id = options.id ?? randomUUID();
  const chunkCount = Math.ceil(bytes / CHUNK_BYTES);
  const row = await opened.store.insertSubmission({
    id,
    character: character.slug,
    status: 'drafted',
    generated: {
      leaderNote: note,
      sourceType: type,
      bytes,
      chunkCount,
      received: [],
    },
  });
  return ok(201, { id: row.id, chunkBytes: CHUNK_BYTES, chunkCount }, opened);
}

async function chunk(request, opened, row) {
  if (request.method !== 'PUT') return methodNotAllowed(request, opened, 'PUT');
  if (row.status !== 'drafted') {
    return fail(409, { error: 'conflict', detail: 'This picture is no longer a draft.' }, opened);
  }
  const book = draftBook(row);
  if (!book) return fail(409, { error: 'conflict', detail: 'Upload the picture again.' }, opened);
  const index = Number(new URL(request.url).searchParams.get('index'));
  if (!Number.isInteger(index) || index < 0 || index >= book.chunkCount) {
    return fail(400, { error: 'bad request' }, opened);
  }
  const read = await readBytes(request, CHUNK_BYTES);
  if (read.error) return fail(read.status, { error: read.error }, opened);
  const expected = index === book.chunkCount - 1 ? book.bytes - index * CHUNK_BYTES : CHUNK_BYTES;
  if (read.bytes.byteLength !== expected) {
    return fail(400, { error: 'bad request', detail: 'That piece is the wrong size.' }, opened);
  }
  await opened.store.upload(
    `drafts/${row.id}/${index}`,
    read.bytes,
    'application/octet-stream',
    true
  );
  const received = [...new Set([...(book.received || []), index])].sort((a, b) => a - b);
  const next = await opened.store.updateSubmission(
    row.id,
    { generated: { ...book, received } },
    'drafted'
  );
  if (!next) return fail(409, { error: 'conflict' }, opened);
  return ok(200, { received }, opened);
}

async function receive(request, opened, row, options) {
  if (request.method !== 'POST') return methodNotAllowed(request, opened, 'POST');
  if (row.status !== 'drafted') {
    return fail(409, { error: 'conflict', detail: 'This picture is no longer a draft.' }, opened);
  }
  if (row.draft_path) return ok(200, present(row), opened);
  const book = draftBook(row);
  if (!book) return fail(409, { error: 'conflict', detail: 'Upload the picture again.' }, opened);
  for (let index = 0; index < book.chunkCount; index += 1) {
    if (!book.received?.includes(index)) {
      return fail(409, { error: 'conflict', detail: 'A piece of the upload is missing.' }, opened);
    }
  }
  const parts = [];
  for (let index = 0; index < book.chunkCount; index += 1) {
    const part = await opened.store.download(`drafts/${row.id}/${index}`);
    if (!part)
      return fail(409, { error: 'conflict', detail: 'A piece of the upload is missing.' }, opened);
    parts.push(part);
  }
  const bytes = concat(parts);
  if (bytes.byteLength !== book.bytes) {
    return fail(400, { error: 'bad request', detail: 'The upload did not arrive whole.' }, opened);
  }
  if (sniffImage(bytes) !== book.sourceType) {
    return fail(
      400,
      { error: 'bad request', detail: 'That file is not a png, jpeg, or webp.' },
      opened
    );
  }
  let webp;
  try {
    webp = await (options.convert ?? toWebp)(bytes);
  } catch {
    return fail(400, { error: 'bad request', detail: 'That image could not be read.' }, opened);
  }
  const path = `drafts/${row.id}.webp`;
  await opened.store.upload(path, webp, 'image/webp', true);
  await opened.store.remove(
    Array.from({ length: book.chunkCount }, (_, index) => `drafts/${row.id}/${index}`)
  );
  const next = await opened.store.updateSubmission(
    row.id,
    { draft_path: path, generated: { leaderNote: book.leaderNote || '' } },
    'drafted'
  );
  if (!next) return fail(409, { error: 'conflict' }, opened);
  return ok(200, present(next), opened);
}

async function generate(request, opened, row, options) {
  if (request.method !== 'POST') return methodNotAllowed(request, opened, 'POST');
  const limiter = options.generateLimiter ?? generateLimiter;
  const now = options.now ?? Date.now;
  if (!limiter.allow(clientAddress(request), now())) {
    return fail(
      429,
      { error: 'too many requests', detail: 'Wait a minute, then regenerate.' },
      opened
    );
  }
  if (row.status !== 'drafted' && row.status !== 'generated') {
    return fail(
      409,
      { error: 'conflict', detail: 'This picture can no longer be regenerated.' },
      opened
    );
  }
  const path = row.draft_path || row.final_path;
  if (!path) return fail(409, { error: 'conflict', detail: 'The picture is not ready.' }, opened);
  const character = findCharacter(options.canon, row.character, 'active');
  if (!character) return fail(404, { error: 'not found' }, opened);
  const bytes = await opened.store.download(path);
  if (!bytes)
    return fail(404, { error: 'not found', detail: 'The picture file is missing.' }, opened);
  const captionOf = options.caption ?? requestCaption;
  const result = await captionOf({
    env: opened.env,
    bytes,
    character,
    note: row.generated?.leaderNote || '',
    fetchImpl: options.fetch ?? globalThis.fetch,
  });
  if (result.error) {
    return fail(result.status, { error: result.error, detail: result.detail }, opened);
  }
  const next = await opened.store.updateSubmission(row.id, {
    status: 'generated',
    generated: { ...result.caption, leaderNote: row.generated?.leaderNote || '' },
    edited: null,
  });
  if (!next) return fail(409, { error: 'conflict' }, opened);
  return ok(200, present(next), opened);
}

async function edit(request, opened, row) {
  if (row.status !== 'generated') {
    return fail(
      409,
      { error: 'conflict', detail: 'Edit the caption after it has been generated.' },
      opened
    );
  }
  const read = await readJson(request, 24_000);
  if (read.error) return fail(read.status, { error: read.error }, opened);
  const caption = cleanCaption(read.value.caption ?? read.value);
  if (!caption) {
    return fail(400, { error: 'bad request', detail: 'The caption is missing a field.' }, opened);
  }
  const next = await opened.store.updateSubmission(row.id, { edited: caption });
  if (!next) return fail(409, { error: 'conflict' }, opened);
  return ok(200, present(next), opened);
}

async function reject(request, opened, row) {
  if (request.method !== 'POST') return methodNotAllowed(request, opened, 'POST');
  if (row.status !== 'drafted' && row.status !== 'generated') {
    return fail(
      409,
      { error: 'conflict', detail: 'This picture can no longer be rejected.' },
      opened
    );
  }
  const read = await readJson(request, 4096);
  if (read.error) return fail(read.status, { error: read.error }, opened);
  const reason = clipReason(read.value.reason);
  if (!reason) {
    return fail(400, { error: 'bad request', detail: 'A rejection needs a reason.' }, opened);
  }
  const paths = [];
  if (row.draft_path) paths.push(row.draft_path);
  const book = draftBook(row);
  if (book) {
    for (let index = 0; index < book.chunkCount; index += 1)
      paths.push(`drafts/${row.id}/${index}`);
  }
  await opened.store.remove(paths).catch(() => {});
  const next = await opened.store.updateSubmission(row.id, {
    status: 'rejected',
    reviewer_note: reason,
  });
  if (!next) return fail(409, { error: 'conflict' }, opened);
  return ok(200, present(next), opened);
}

async function publish(request, opened, row, options) {
  if (request.method !== 'POST') return methodNotAllowed(request, opened, 'POST');
  let caption;
  if (request.headers.get('content-length') !== '0' && request.headers.get('content-type')) {
    const read = await readJson(request, 24_000);
    if (read.error) return fail(read.status, { error: read.error }, opened);
    if (read.value.caption) {
      caption = cleanCaption(read.value.caption);
      if (!caption) {
        return fail(
          400,
          { error: 'bad request', detail: 'The caption is missing a field.' },
          opened
        );
      }
    }
  }
  let result;
  try {
    result = await publishSubmission(row, {
      store: opened.store,
      canon: options.canon,
      caption,
      reserved: options.reservedFilenames ?? new Set(),
      remember:
        options.remember ??
        ((args) => rememberMoment({ ...args, env: opened.env, fetchImpl: options.fetch })),
      now: options.clock ?? (() => new Date().toISOString()),
    });
  } catch {
    return fail(
      502,
      { error: 'unavailable', detail: 'The gallery could not be updated. Publish again.' },
      opened
    );
  }
  if (result.error) return fail(result.status, result, opened);
  return ok(200, result, opened);
}

export async function publishSubmission(row, deps) {
  let current = row;
  if (current.status === 'published') {
    const names = albumNames(current.character, current.id);
    return {
      ok: true,
      status: 'published',
      itemId: current.gallery_item_id || names.itemId,
      url: galleryUrl(names.filename),
    };
  }
  if (current.status === 'generated') {
    if (deps.caption) {
      current = await deps.store.updateSubmission(current.id, { edited: deps.caption });
      if (!current) return { status: 409, error: 'conflict' };
    }
    current = await deps.store.updateSubmission(current.id, { status: 'approved' }, 'generated');
    if (!current) {
      return { status: 409, error: 'conflict', detail: 'This picture is already being published.' };
    }
  } else if (current.status !== 'approved') {
    return { status: 409, error: 'conflict', detail: 'Generate a caption before publishing.' };
  }

  const names = albumNames(current.character, current.id);
  if (deps.reserved?.has(names.filename)) {
    return { status: 409, error: 'conflict', detail: 'That filename is already on the gallery.' };
  }
  const finalPath = `${current.character}/${names.filename}`;
  if (!current.final_path) {
    if (!current.draft_path) {
      return { status: 409, error: 'conflict', detail: 'The picture is not ready.' };
    }
    await deps.store.move(current.draft_path, finalPath);
    current = await deps.store.updateSubmission(current.id, { final_path: finalPath });
    if (!current) return { status: 409, error: 'conflict' };
  }

  if (!current.gallery_item_id) {
    const caption = chosen(current);
    if (!caption) {
      return { status: 409, error: 'conflict', detail: 'The caption is missing a field.' };
    }
    const existing = await deps.store.itemByFilename(names.filename);
    if (!existing) {
      const order = (await deps.store.maxOrder()) + 1;
      const inserted = await deps.store.insertGalleryItem(
        galleryRow(current.character, names.itemId, names.filename, order, caption)
      );
      const tagIds = [];
      for (const tag of caption.tags) {
        const saved = await deps.store.ensureTag(tag);
        if (saved?.id) tagIds.push(saved.id);
      }
      await deps.store.linkTags(inserted.id, tagIds);
      await deps.store.insertLike(names.itemId);
    } else if (existing.item_id !== names.itemId) {
      return { status: 409, error: 'conflict', detail: 'That filename is already on the gallery.' };
    }
    current = await deps.store.updateSubmission(current.id, { gallery_item_id: names.itemId });
    if (!current) return { status: 409, error: 'conflict' };
  }

  const caption = chosen(current);
  if (!caption)
    return { status: 409, error: 'conflict', detail: 'The caption is missing a field.' };
  const character = findCharacter(deps.canon, current.character);
  if (!character?.agent?.album) {
    return {
      status: 502,
      error: 'memory',
      detail:
        'This character has no album memory route. The picture is on the gallery. Publish again after the route exists.',
      galleryItemId: names.itemId,
      url: galleryUrl(names.filename),
    };
  }
  const memory = await deps.remember({
    character,
    summary: caption.felt.summary,
    emotion: caption.felt.emotion,
    itemId: names.itemId,
    filename: names.filename,
  });
  if (!memory?.ok) {
    return {
      status: memory?.status || 502,
      error: memory?.error || 'memory',
      detail:
        memory?.detail ||
        'The memory write failed. The picture is on the gallery. Publish again to retry it.',
      galleryItemId: names.itemId,
      url: galleryUrl(names.filename),
    };
  }
  const published = await deps.store.updateSubmission(current.id, {
    status: 'published',
    published_at: deps.now(),
  });
  if (!published) return { status: 409, error: 'conflict' };
  return {
    ok: true,
    status: 'published',
    itemId: names.itemId,
    url: galleryUrl(names.filename),
    memory: composeFeltMemory(caption.felt.summary, caption.felt.emotion),
  };
}

export async function rememberMoment({
  env,
  character,
  summary,
  emotion,
  itemId,
  filename,
  fetchImpl,
}) {
  const agent = character?.agent;
  const origin = agent ? httpsOrigin(env?.[agent.upstream]) : null;
  const token = agent ? env?.[upstreamTokens[agent.upstream]] : '';
  if (!agent?.album || !origin || typeof token !== 'string' || !TOKEN.test(token)) {
    return { status: 503, error: 'memory', detail: 'The character agent is not configured.' };
  }
  const url = galleryUrl(filename);
  let response;
  try {
    response = await fetchImpl(`${origin}${agent.album}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        'x-admin-key': token,
      },
      body: JSON.stringify({ gallery: character.slug, itemId, summary, emotion, url }),
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return {
      status: 502,
      error: 'memory',
      detail:
        'The character agent did not answer. The picture is on the gallery. Publish again to retry the memory.',
    };
  }
  const raw = await response.text();
  if (response.status === 200 || response.status === 201) return { ok: true, url };
  let code = '';
  try {
    code = JSON.parse(raw).error;
  } catch {
    code = '';
  }
  if (response.status === 404) {
    return {
      status: 502,
      error: 'memory',
      detail:
        'The character agent has no album-moment route yet. Deploy that change, then publish again. The picture is already on the gallery.',
    };
  }
  if (response.status === 401 || response.status === 403) {
    return {
      status: 502,
      error: 'memory',
      detail:
        'The character agent refused the memory write. Check that the agent token is the admin key, then publish again.',
    };
  }
  if (code === 'burial' || response.status === 422) {
    return {
      status: 422,
      error: 'memory',
      detail: 'Burial text is not stored as a memory. The picture is on the gallery.',
    };
  }
  return {
    status: 502,
    error: 'memory',
    detail: 'The memory write failed. The picture is on the gallery. Publish again to retry it.',
  };
}

async function file(request, opened, row) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return methodNotAllowed(request, opened, 'GET');
  }
  const path = row.draft_path || row.final_path;
  if (!path) return fail(404, { error: 'not found' }, opened);
  const bytes = await opened.store.download(path);
  if (!bytes) return fail(404, { error: 'not found' }, opened);
  const headers = new Headers({
    'content-type': 'image/webp',
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
  });
  for (const cookie of opened.cookies) headers.append('set-cookie', cookie);
  return new Response(request.method === 'HEAD' ? null : bytes, { status: 200, headers });
}

async function openLeader(request, options) {
  const env = options.env ?? process.env;
  const config = worldConfig(env);
  if (!config) return { response: json(503, { error: 'unavailable' }) };
  const cors = corsHeaders(request, sameOrigin);
  if (request.method === 'OPTIONS') {
    if (!sameOrigin(request)) return { response: json(403, { error: 'forbidden' }) };
    return {
      response: new Response(null, {
        status: 204,
        headers: {
          ...cors,
          'access-control-allow-methods': 'GET, POST, PUT, PATCH',
          'access-control-allow-headers': 'content-type',
          'access-control-max-age': '600',
          'cache-control': 'no-store',
        },
      }),
    };
  }
  if (!sameOrigin(request)) return { response: json(403, { error: 'forbidden' }) };
  const limiter = options.limiter ?? albumLimiter;
  const now = options.now ?? Date.now;
  if (!limiter.allow(clientAddress(request), now())) {
    return {
      response: json(429, { error: 'too many requests' }, { 'retry-after': '60', ...cors }),
    };
  }
  const leader = await requireLeader(request, config, options);
  if (!leader.ok) {
    return { response: json(leader.status, { error: leader.error }, cors, leader.cookies ?? []) };
  }
  return {
    env,
    config,
    cors,
    cookies: leader.cookies ?? [],
    store: options.store ?? createAlbumStore(config, options.fetch ?? globalThis.fetch),
  };
}

function matchRoute(pathname) {
  const path = pathname.replace(/\/$/, '');
  if (path === '/api/world/album') return { kind: 'collection' };
  const match = path.match(
    /^\/api\/world\/album\/([0-9a-f-]{36})(?:\/(chunk|receive|generate|publish|reject|file))?$/i
  );
  if (!match || !UUID.test(match[1])) return null;
  return { id: match[1].toLowerCase(), kind: match[2] || 'one' };
}

function present(row) {
  const caption = chosen(row);
  return {
    id: row.id,
    character: row.character,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    galleryItemId: row.gallery_item_id || '',
    leaderNote: row.generated?.leaderNote || '',
    reviewerNote: row.reviewer_note || '',
    ready: Boolean(row.draft_path || row.final_path),
    caption,
  };
}

function chosen(row) {
  const edited = row.edited && row.edited.ko ? row.edited : null;
  const generated = row.generated && row.generated.ko ? row.generated : null;
  return cleanCaption(edited || generated);
}

function draftBook(row) {
  const book = row.generated;
  if (!book || !Number.isInteger(book.bytes) || !Number.isInteger(book.chunkCount)) return null;
  if (!book.sourceType) return null;
  return book;
}

function findCharacter(canon, slug, status) {
  if (typeof slug !== 'string') return null;
  return (
    (canon?.characters || []).find((item) => {
      if (item.slug !== slug) return false;
      if (status) return item.status === status;
      return item.status === 'active' || item.status === 'archived';
    }) || null
  );
}

function clipNote(value) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length > NOTE_MAX) return null;
  return text;
}

function clipReason(value) {
  if (typeof value !== 'string') return '';
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text || text.length > REASON_MAX) return '';
  return text;
}

function concat(parts) {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

function ascii(bytes, start, end) {
  let out = '';
  for (let index = start; index < end; index += 1) out += String.fromCharCode(bytes[index]);
  return out;
}

async function readBytes(request, limit) {
  const type = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/octet-stream') return { status: 400, error: 'bad request' };
  const declared = request.headers.get('content-length');
  if (declared != null) {
    if (!/^\d+$/.test(declared)) return { status: 400, error: 'bad request' };
    if (Number(declared) > limit) return { status: 413, error: 'too large' };
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > limit) return { status: 413, error: 'too large' };
  if (bytes.byteLength === 0) return { status: 400, error: 'bad request' };
  return { bytes };
}

function ok(status, body, opened) {
  return json(status, body, opened.cors, opened.cookies);
}

function fail(status, body, opened) {
  return json(status, body, opened.cors, opened.cookies);
}

function methodNotAllowed(request, opened, allow) {
  if (!sameOrigin(request)) return json(403, { error: 'forbidden' });
  return json(405, { error: 'method not allowed' }, { allow, ...opened.cors }, opened.cookies);
}
