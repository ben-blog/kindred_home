import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCanon } from '../../../world/load.js';
import { albumNames, galleryRow, handleAlbum, publishSubmission, sniffImage } from './album.js';
import { captionFailure, cleanCaption, parseCaption, requestCaption } from './album-caption.js';
import { composeFeltMemory } from './felt.js';
import { publicImages } from './gallery-feed.js';
import { handleGalleryFeed, handleGalleryFile } from './gallery-public.js';

const canon = loadCanon();
const leaderId = '11111111-1111-4111-8111-111111111111';
const env = {
  WORLD_SUPABASE_URL: 'https://world.example.test',
  WORLD_SUPABASE_SERVICE_KEY: 'service-key-0123456789abcdef',
  WORLD_SUPABASE_ANON_KEY: 'anon-key-0123456789abcdef',
  WORLD_LEADER_USER_ID: leaderId,
  WORLD_IP_SALT: 'ip-salt-0123456789',
  CRON_SECRET: 'cron-secret-0123456789',
  KIN_AGENT_URL: 'https://kin.example.test',
  KIN_AGENT_TOKEN: 'kin-token-0123456789abcdef',
  ANTHROPIC_API_KEY: 'sk-ant-test-key-0123456789',
};
const submissionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function request(path, { method = 'GET', body, headers = {}, cookie } = {}) {
  const init = { method, headers: { origin: 'https://kinxdred.com', ...headers } };
  if (cookie) init.headers.cookie = cookie;
  if (body !== undefined) {
    if (body instanceof Uint8Array) {
      init.headers['content-type'] = 'application/octet-stream';
      init.body = body;
    } else {
      init.headers['content-type'] = 'application/json';
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
  }
  return new Request(`https://kinxdred.com${path}`, init);
}

function leaderFetch(id) {
  return async (url) => {
    const href = String(url);
    if (href.endsWith('/auth/v1/user')) {
      return new Response(JSON.stringify({ id }), { status: 200 });
    }
    throw new Error(href);
  };
}

function caption(extra = {}) {
  return {
    style: 'G — Risograph Print',
    tags: [
      { name_ko: '밤', name_en: 'night' },
      { name_ko: '창', name_en: 'window' },
    ],
    ko: {
      title: '창가',
      technique: '리소 2도.',
      description: '버스 창가에 앉은 사람.',
      kin_perspective: '어 나 여기 있었네.',
      dred_perspective: '창은 가는데 자리는 그대로다.',
    },
    en: {
      title: 'Window',
      technique: 'Two-color risograph.',
      description: 'Someone in a window seat.',
      kin_perspective: 'oh I was here.',
      dred_perspective: 'the window moves. the seat does not.',
    },
    felt: {
      summary: '노란 재킷을 입고 심야 버스 창가에 앉아 다음 정류장을 기다렸다.',
      emotion: { label: 'calm', intensity: 0.42, reason: '창밖이 느렸다' },
    },
    show_on_main: false,
    ...extra,
  };
}

function memoryStore(seed = {}) {
  const submissions = new Map(seed.submissions || []);
  const calls = [];
  return {
    calls,
    async insertSubmission(row) {
      calls.push(['insertSubmission', row]);
      submissions.set(row.id, { ...row, created_at: '2026-11-22T00:00:00.000Z' });
      return submissions.get(row.id);
    },
    async updateSubmission(id, patch, status) {
      const current = submissions.get(id);
      if (!current) return null;
      if (status && current.status !== status) return null;
      const next = { ...current, ...patch, updated_at: '2026-11-22T00:01:00.000Z' };
      submissions.set(id, next);
      calls.push(['updateSubmission', id, patch.status || '']);
      return next;
    },
    async getSubmission(id) {
      return submissions.get(id) || null;
    },
    async listSubmissions() {
      return [...submissions.values()];
    },
    async maxOrder() {
      return 32;
    },
    async itemByFilename() {
      return null;
    },
    async insertGalleryItem(row) {
      calls.push(['insertGalleryItem', row]);
      return { id: 90, ...row };
    },
    async ensureTag(tag) {
      calls.push(['ensureTag', tag.name_ko]);
      return { id: tag.name_ko.length, ...tag };
    },
    async linkTags(id, tagIds) {
      calls.push(['linkTags', id, tagIds]);
    },
    async insertLike(itemId) {
      calls.push(['insertLike', itemId]);
    },
    async upload(path, bytes) {
      calls.push(['upload', path, bytes.byteLength]);
    },
    async download(path) {
      calls.push(['download', path]);
      return seed.files?.get(path) || null;
    },
    async remove(paths) {
      calls.push(['remove', paths]);
    },
    async move(from, to) {
      calls.push(['move', from, to]);
    },
    async activeItems() {
      return seed.rows || [];
    },
    async tagNames() {
      return new Map([['밤', 'night']]);
    },
    async likeCounts() {
      return new Map();
    },
  };
}

function authed(extra = {}) {
  return {
    env,
    canon,
    fetch: leaderFetch(leaderId),
    id: submissionId,
    convert: async () => new Uint8Array([1, 2, 3]),
    ...extra,
  };
}

const cookie = 'world_access=leader.access.token';

test('album routes fail closed without the world env or a leader session', async () => {
  const closed = await handleAlbum(request('/api/world/album', { method: 'POST', body: {} }), {
    canon,
    env: {},
  });
  assert.equal(closed.status, 503);
  const anonymous = await handleAlbum(
    request('/api/world/album', { method: 'POST', body: {}, cookie: '' }),
    authed()
  );
  assert.equal(anonymous.status, 401);
  const foreign = await handleAlbum(
    request('/api/world/album', {
      method: 'POST',
      body: {},
      headers: { origin: 'https://evil.example' },
      cookie,
    }),
    authed()
  );
  assert.equal(foreign.status, 403);
});

test('an upload rejects the wrong type and anything over 15MB', async () => {
  const store = memoryStore();
  const badType = await handleAlbum(
    request('/api/world/album', {
      method: 'POST',
      cookie,
      body: { character: 'kin', type: 'image/gif', bytes: 1000 },
    }),
    authed({ store })
  );
  assert.equal(badType.status, 400);
  const huge = await handleAlbum(
    request('/api/world/album', {
      method: 'POST',
      cookie,
      body: { character: 'kin', type: 'image/png', bytes: 16 * 1024 * 1024 },
    }),
    authed({ store })
  );
  assert.equal(huge.status, 413);
  assert.equal(store.calls.length, 0);
});

test('a caption names a missing credit balance instead of hiding it', () => {
  const failure = captionFailure(
    400,
    JSON.stringify({ error: { message: 'Your credit balance is too low to access the API.' } })
  );
  assert.equal(failure.status, 402);
  assert.equal(failure.error, 'credit');
  assert.match(failure.detail, /no credit/);
  assert.equal(failure.detail.includes('sk-ant'), false);
});

test('captionFailure names overloaded and invalid request failures', () => {
  const busy = captionFailure(
    529,
    JSON.stringify({ error: { type: 'overloaded_error', message: 'Overloaded' } })
  );
  assert.equal(busy.retryable, true);
  assert.match(busy.detail, /busy right now/);
  const invalid = captionFailure(
    400,
    JSON.stringify({
      error: {
        type: 'invalid_request_error',
        message: 'Image exceeds size limit. key sk-ant-secretvalue1234567890',
      },
    })
  );
  assert.match(invalid.detail, /rejected/);
  assert.match(invalid.detail, /Image exceeds size limit/);
  assert.equal(invalid.detail.includes('sk-ant-secretvalue'), false);
  assert.match(invalid.detail, /\[redacted\]/);
});

test('requestCaption logs distinct failures and retries timeout once', async () => {
  const logs = [];
  const originalError = console.error;
  console.error = (...args) => logs.push(args.join(' '));
  const sleeps = [];
  let calls = 0;
  try {
    const timeout = await requestCaption({
      env,
      bytes: new Uint8Array([1, 2, 3, 4]),
      character: { slug: 'kin' },
      note: '',
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      fetchImpl: async () => {
        calls += 1;
        const error = new Error('The operation was aborted due to timeout');
        error.name = 'TimeoutError';
        throw error;
      },
    });
    assert.equal(timeout.status, 502);
    assert.match(timeout.detail, /took too long/);
    assert.equal(timeout.retryable, undefined);
    assert.equal(calls, 2);
    assert.deepEqual(sleeps, [1500]);
    assert.equal(logs.length, 2);
    const first = JSON.parse(logs[0]);
    assert.equal(first.scope, 'album-caption');
    assert.equal(first.case, 'timeout');
    assert.equal(first.status, null);
    assert.equal(first.errorType, null);
    assert.equal(first.imageBytes, 4);
    assert.equal(typeof first.elapsedMs, 'number');
    assert.equal(JSON.stringify(first).includes('sk-ant'), false);
  } finally {
    console.error = originalError;
  }
});

test('requestCaption retries overloaded once and surfaces a busy detail', async () => {
  const logs = [];
  const originalError = console.error;
  console.error = (...args) => logs.push(args.join(' '));
  let calls = 0;
  try {
    const busy = await requestCaption({
      env,
      bytes: new Uint8Array([9, 9]),
      character: { slug: 'kin' },
      note: '',
      sleep: async () => {},
      fetchImpl: async () => {
        calls += 1;
        return new Response(
          JSON.stringify({ error: { type: 'overloaded_error', message: 'Overloaded' } }),
          { status: 529, headers: { 'content-type': 'application/json' } }
        );
      },
    });
    assert.equal(calls, 2);
    assert.match(busy.detail, /busy right now/);
    assert.equal(JSON.parse(logs[0]).case, 'http');
    assert.equal(JSON.parse(logs[0]).status, 529);
    assert.equal(JSON.parse(logs[0]).errorType, 'overloaded_error');
    assert.equal(JSON.parse(logs[0]).imageBytes, 2);
  } finally {
    console.error = originalError;
  }
});

test('requestCaption recovers after one network failure and keeps max_tokens', async () => {
  const logs = [];
  const originalError = console.error;
  console.error = (...args) => logs.push(args.join(' '));
  const bodies = [];
  let calls = 0;
  try {
    const ok = await requestCaption({
      env,
      bytes: new Uint8Array([7]),
      character: { slug: 'kin' },
      note: 'bus',
      sleep: async () => {},
      fetchImpl: async (_url, init) => {
        calls += 1;
        bodies.push(JSON.parse(init.body));
        if (calls === 1) throw new TypeError('fetch failed');
        return new Response(
          JSON.stringify({
            content: [{ type: 'text', text: JSON.stringify(caption()) }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      },
    });
    assert.equal(calls, 2);
    assert.equal(ok.caption.ko.title, '창가');
    assert.equal(bodies[0].max_tokens, 2500);
    assert.equal(JSON.parse(logs[0]).case, 'network');
  } finally {
    console.error = originalError;
  }
});

test('requestCaption does not retry bad JSON or a 400 invalid request', async () => {
  const logs = [];
  const originalError = console.error;
  console.error = (...args) => logs.push(args.join(' '));
  try {
    let badJsonCalls = 0;
    const badJson = await requestCaption({
      env,
      bytes: new Uint8Array([1]),
      character: { slug: 'kin' },
      note: '',
      sleep: async () => {
        throw new Error('should not sleep');
      },
      fetchImpl: async () => {
        badJsonCalls += 1;
        return new Response('not-json', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        });
      },
    });
    assert.equal(badJsonCalls, 1);
    assert.match(badJson.detail, /did not answer/);
    assert.equal(JSON.parse(logs[0]).case, 'bad_json');

    let invalidCalls = 0;
    const invalid = await requestCaption({
      env,
      bytes: new Uint8Array([1, 2]),
      character: { slug: 'kin' },
      note: '',
      sleep: async () => {
        throw new Error('should not sleep');
      },
      fetchImpl: async () => {
        invalidCalls += 1;
        return new Response(
          JSON.stringify({
            error: {
              type: 'invalid_request_error',
              message: 'image too large for sk-ant-shouldhide123456789',
            },
          }),
          { status: 400, headers: { 'content-type': 'application/json' } }
        );
      },
    });
    assert.equal(invalidCalls, 1);
    assert.match(invalid.detail, /image too large/i);
    assert.equal(invalid.detail.includes('sk-ant-shouldhide'), false);
    const httpLog = JSON.parse(logs[1]);
    assert.equal(httpLog.case, 'http');
    assert.equal(httpLog.status, 400);
    assert.equal(httpLog.errorType, 'invalid_request_error');
    assert.match(httpLog.message, /\[redacted\]/);
  } finally {
    console.error = originalError;
  }
});

test('gallery copy has to include both languages, both perspectives, and a felt memory', () => {
  const parsed = parseCaption('```json\n' + JSON.stringify(caption()) + '\n```');
  assert.equal(parsed.ko.title, '창가');
  assert.equal(parsed.felt.emotion.label, 'calm');
  assert.equal(cleanCaption({ ...caption(), ko: { ...caption().ko, title: '' } }), null);
  const felt = composeFeltMemory(parsed.felt.summary, parsed.felt.emotion);
  assert.match(felt, /^느낌: calm 0\.42 — 창밖이 느렸다\n/);
});

test('publish appends the next gallery row and writes one felt memory', async () => {
  const names = albumNames('kin', submissionId);
  const store = memoryStore({
    submissions: [
      [
        submissionId,
        {
          id: submissionId,
          character: 'kin',
          status: 'generated',
          draft_path: `drafts/${submissionId}.webp`,
          generated: { ...caption(), leaderNote: 'bus window' },
          created_at: '2026-11-22T00:00:00.000Z',
        },
      ],
    ],
  });
  let memory;
  const result = await publishSubmission(await store.getSubmission(submissionId), {
    store,
    canon,
    reserved: new Set(['kin_g3_bus_risograph.webp']),
    now: () => '2026-11-22T01:00:00.000Z',
    remember: async (args) => {
      memory = args;
      return { ok: true };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.url, `https://www.kinxdred.com/assets/gallery/${names.filename}`);
  const inserted = store.calls.find((call) => call[0] === 'insertGalleryItem')[1];
  assert.equal(inserted.order_num, 33);
  assert.equal(inserted.like_count, undefined);
  assert.equal(inserted.is_active, true);
  assert.deepEqual(inserted.tags, ['밤', '창']);
  assert.equal(
    store.calls.some((call) => call[0] === 'insertLike' && call[1] === names.itemId),
    true
  );
  assert.equal(memory.itemId, names.itemId);
  assert.equal(memory.summary, caption().felt.summary);
  assert.equal(memory.emotion.label, 'calm');
  const saved = await store.getSubmission(submissionId);
  assert.equal(saved.status, 'published');
  assert.equal(saved.gallery_item_id, names.itemId);
});

test('a memory failure leaves the gallery row in place for a retry', async () => {
  const store = memoryStore({
    submissions: [
      [
        submissionId,
        {
          id: submissionId,
          character: 'kin',
          status: 'generated',
          draft_path: `drafts/${submissionId}.webp`,
          generated: caption(),
        },
      ],
    ],
  });
  const first = await publishSubmission(await store.getSubmission(submissionId), {
    store,
    canon,
    now: () => '2026-11-22T01:00:00.000Z',
    remember: async () => ({ status: 502, error: 'memory', detail: 'The agent missed it.' }),
  });
  assert.equal(first.error, 'memory');
  assert.equal(first.detail, 'The agent missed it.');
  const mid = await store.getSubmission(submissionId);
  assert.equal(mid.status, 'approved');
  assert.ok(mid.gallery_item_id);
  let remembered = 0;
  const second = await publishSubmission(mid, {
    store,
    canon,
    now: () => '2026-11-22T01:02:00.000Z',
    remember: async () => {
      remembered += 1;
      return { ok: true };
    },
  });
  assert.equal(second.ok, true);
  assert.equal(remembered, 1);
  assert.equal(store.calls.filter((call) => call[0] === 'insertGalleryItem').length, 1);
});

test('a rejection stores the reason and does not publish', async () => {
  const store = memoryStore({
    submissions: [
      [
        submissionId,
        {
          id: submissionId,
          character: 'kin',
          status: 'generated',
          draft_path: `drafts/${submissionId}.webp`,
          generated: caption(),
        },
      ],
    ],
  });
  const response = await handleAlbum(
    request(`/api/world/album/${submissionId}/reject`, {
      method: 'POST',
      cookie,
      body: { reason: 'not this one' },
    }),
    authed({ store })
  );
  assert.equal(response.status, 200);
  const saved = await store.getSubmission(submissionId);
  assert.equal(saved.status, 'rejected');
  assert.equal(saved.reviewer_note, 'not this one');
  assert.equal(
    store.calls.some((call) => call[0] === 'insertGalleryItem'),
    false
  );
});

test('a chunk that is not the promised size is refused', async () => {
  const store = memoryStore({
    submissions: [
      [
        submissionId,
        {
          id: submissionId,
          character: 'kin',
          status: 'drafted',
          generated: {
            leaderNote: '',
            sourceType: 'image/png',
            bytes: 100,
            chunkCount: 1,
            received: [],
          },
        },
      ],
    ],
  });
  const response = await handleAlbum(
    request(`/api/world/album/${submissionId}/chunk?index=0`, {
      method: 'PUT',
      cookie,
      body: new Uint8Array(40),
    }),
    authed({ store })
  );
  assert.equal(response.status, 400);
});

test('new database rows are added after the static gallery and do not replace it', () => {
  const images = publicImages(
    { images: [{ id: 'kept', filename: 'kept.webp', order_num: 1 }] },
    [
      { item_id: 'kept', filename: 'kept.webp', is_active: true, order_num: 1, title_ko: 'old' },
      {
        item_id: 'kin_album_new',
        filename: 'kin_album_new.webp',
        is_active: true,
        order_num: 33,
        style: 'LINE',
        title_ko: '새',
        title_en: 'New',
        technique_ko: '선',
        technique_en: 'line',
        description_ko: '방',
        description_en: 'room',
        kin_perspective_ko: '나',
        kin_perspective_en: 'me',
        dred_perspective_ko: '거기',
        dred_perspective_en: 'there',
        tags: ['밤'],
        show_on_main: false,
      },
    ],
    new Map(),
    new Map([['밤', 'night']])
  );
  assert.equal(images.length, 1);
  assert.equal(images[0].id, 'kin_album_new');
  assert.equal(images[0].order_num, 33);
  assert.equal(images[0].like_count, 0);
  assert.deepEqual(images[0].tags, [{ name_ko: '밤', name_en: 'night' }]);
  assert.equal(
    galleryRow('kin', 'kin_album_new', 'kin_album_new.webp', 33, caption()).is_active,
    true
  );
});

test('the public gallery feed hides ids the static file already has', async () => {
  const store = memoryStore({
    rows: [
      { item_id: 'kept', filename: 'kept.webp', is_active: true, order_num: 1 },
      {
        item_id: 'added',
        filename: 'added.webp',
        is_active: true,
        order_num: 40,
        title_en: 'Added',
      },
    ],
  });
  const response = await handleGalleryFeed(request('/api/gallery/kin'), {
    env,
    canon,
    slug: 'kin',
    store,
    staticDoc: { images: [{ id: 'kept', filename: 'kept.webp' }] },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(
    body.images.map((image) => image.id),
    ['added']
  );
});

test('a missing gallery file redirects to storage and an existing name is not invented', async () => {
  const missing = await handleGalleryFile(request('/assets/gallery/nope.webp'), {
    env,
    filename: 'nope.webp',
    store: memoryStore(),
  });
  assert.equal(missing.status, 404);
  const found = await handleGalleryFile(request('/assets/gallery/kin_album_new.webp'), {
    env,
    filename: 'kin_album_new.webp',
    store: {
      async itemByFilename() {
        return { character: 'kin', filename: 'kin_album_new.webp', is_active: true };
      },
    },
  });
  assert.equal(found.status, 302);
  assert.equal(
    found.headers.get('location'),
    'https://world.example.test/storage/v1/object/public/assets/kin/kin_album_new.webp'
  );
});

test('png, jpeg, and webp signatures are recognized', () => {
  assert.equal(sniffImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])), 'image/png');
  assert.equal(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0])), 'image/jpeg');
  const webp = new Uint8Array(12);
  webp.set([0x52, 0x49, 0x46, 0x46], 0);
  webp.set([0x57, 0x45, 0x42, 0x50], 8);
  assert.equal(sniffImage(webp), 'image/webp');
  assert.equal(sniffImage(Uint8Array.from([0, 1, 2, 3])), '');
});
