const REST_TIMEOUT_MS = 8000;
const BINARY_TIMEOUT_MS = 25_000;
const MAX_JSON = 1_000_000;
const MAX_BINARY = 16 * 1024 * 1024;
const OBJECT_PATH =
  /^(?:drafts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\/[0-9]+|\.webp)|[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9][a-z0-9_-]{0,80}\.webp)$/;

const ITEM_COLUMNS = [
  'id',
  'item_id',
  'character',
  'filename',
  'style',
  'order_num',
  'created_at',
  'is_active',
  'show_on_main',
  'title_ko',
  'title_en',
  'technique_ko',
  'technique_en',
  'description_ko',
  'description_en',
  'kin_perspective_ko',
  'kin_perspective_en',
  'dred_perspective_ko',
  'dred_perspective_en',
  'actions',
  'tags',
].join(',');

export function createAlbumStore(config, fetchImpl = globalThis.fetch) {
  const headers = {
    apikey: config.serviceKey,
    authorization: `Bearer ${config.serviceKey}`,
    accept: 'application/json',
  };

  async function jsonRequest(url, init = {}) {
    const response = await fetchImpl(url, {
      ...init,
      headers: { ...headers, 'content-type': 'application/json', ...init.headers },
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(REST_TIMEOUT_MS),
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!response.ok || bytes.byteLength > MAX_JSON) throw new Error('store');
    if (bytes.byteLength === 0) return null;
    try {
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
      throw new Error('store');
    }
  }

  function rest(path) {
    return `${config.url}/rest/v1/${path}`;
  }

  function objectUrl(objectPath) {
    if (!OBJECT_PATH.test(objectPath)) throw new Error('store');
    return `${config.url}/storage/v1/object/assets/${objectPath}`;
  }

  return {
    insertSubmission(row) {
      return one(
        jsonRequest(rest('album_submissions'), {
          method: 'POST',
          headers: { prefer: 'return=representation' },
          body: JSON.stringify(row),
        })
      );
    },
    async updateSubmission(id, patch, status) {
      const filter = status ? `&status=eq.${encodeURIComponent(status)}` : '';
      const rows = await jsonRequest(
        rest(`album_submissions?id=eq.${encodeURIComponent(id)}${filter}`),
        {
          method: 'PATCH',
          headers: { prefer: 'return=representation' },
          body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
        }
      );
      return Array.isArray(rows) ? rows[0] || null : null;
    },
    async getSubmission(id) {
      const rows = await jsonRequest(
        rest(`album_submissions?id=eq.${encodeURIComponent(id)}&select=*`),
        { method: 'GET' }
      );
      return Array.isArray(rows) ? rows[0] || null : null;
    },
    async listSubmissions() {
      const rows = await jsonRequest(
        rest('album_submissions?select=*&order=created_at.desc&limit=40'),
        { method: 'GET' }
      );
      return Array.isArray(rows) ? rows : [];
    },
    async maxOrder() {
      const rows = await jsonRequest(
        rest('gallery_items?select=order_num&order=order_num.desc.nullslast&limit=1'),
        { method: 'GET' }
      );
      const max = Array.isArray(rows) ? rows[0]?.order_num : 0;
      return Number.isInteger(max) ? max : 0;
    },
    async itemByFilename(filename) {
      const rows = await jsonRequest(
        rest(
          `gallery_items?select=item_id,filename,character,is_active&filename=eq.${encodeURIComponent(filename)}&is_active=eq.true&limit=1`
        ),
        { method: 'GET' }
      );
      return Array.isArray(rows) ? rows[0] || null : null;
    },
    async activeItems(character) {
      const rows = await jsonRequest(
        rest(
          `gallery_items?select=${ITEM_COLUMNS}&character=eq.${encodeURIComponent(character)}&is_active=eq.true&order=created_at.desc.nullslast,order_num.desc,item_id.asc`
        ),
        { method: 'GET' }
      );
      return Array.isArray(rows) ? rows : [];
    },
    async tagNames() {
      const rows = await jsonRequest(rest('tags?select=name_ko,name_en'), { method: 'GET' });
      const names = new Map();
      for (const row of Array.isArray(rows) ? rows : []) {
        if (row?.name_ko) names.set(row.name_ko, row.name_en || row.name_ko);
      }
      return names;
    },
    async likeCounts() {
      const rows = await jsonRequest(rest('gallery_likes?select=item_id,count'), { method: 'GET' });
      const counts = new Map();
      for (const row of Array.isArray(rows) ? rows : []) {
        if (row?.item_id && Number.isInteger(row.count)) counts.set(row.item_id, row.count);
      }
      return counts;
    },
    insertGalleryItem(row) {
      return one(
        jsonRequest(rest('gallery_items'), {
          method: 'POST',
          headers: { prefer: 'return=representation' },
          body: JSON.stringify(row),
        })
      );
    },
    async ensureTag(tag) {
      const existing = await jsonRequest(
        rest(
          `tags?select=id,name_ko,name_en&name_ko=eq.${encodeURIComponent(tag.name_ko)}&limit=1`
        ),
        { method: 'GET' }
      );
      if (Array.isArray(existing) && existing[0]) return existing[0];
      try {
        return await one(
          jsonRequest(rest('tags'), {
            method: 'POST',
            headers: { prefer: 'return=representation' },
            body: JSON.stringify({ name_ko: tag.name_ko, name_en: tag.name_en }),
          })
        );
      } catch {
        const again = await jsonRequest(
          rest(
            `tags?select=id,name_ko,name_en&name_ko=eq.${encodeURIComponent(tag.name_ko)}&limit=1`
          ),
          { method: 'GET' }
        );
        if (Array.isArray(again) && again[0]) return again[0];
        throw new Error('store');
      }
    },
    async linkTags(galleryId, tagIds) {
      if (!tagIds.length) return;
      await jsonRequest(rest('gallery_item_tags'), {
        method: 'POST',
        headers: { prefer: 'return=minimal' },
        body: JSON.stringify(tagIds.map((tagId) => ({ item_id: galleryId, tag_id: tagId }))),
      });
    },
    async insertLike(itemId) {
      await jsonRequest(rest('gallery_likes?on_conflict=item_id'), {
        method: 'POST',
        headers: { prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify({ item_id: itemId, count: 0 }),
      });
    },
    async upload(objectPath, bytes, type, upsert = false) {
      const response = await fetchImpl(objectUrl(objectPath), {
        method: 'POST',
        headers: {
          ...headers,
          'content-type': type,
          'x-upsert': upsert ? 'true' : 'false',
          'cache-control': 'public, max-age=31536000',
        },
        body: bytes,
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(BINARY_TIMEOUT_MS),
      });
      await response.body?.cancel().catch(() => {});
      if (!response.ok) throw new Error('store');
    },
    async download(objectPath) {
      const response = await fetchImpl(objectUrl(objectPath), {
        method: 'GET',
        headers,
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(BINARY_TIMEOUT_MS),
      });
      if (response.status === 404) {
        await response.body?.cancel().catch(() => {});
        return null;
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!response.ok || bytes.byteLength > MAX_BINARY) throw new Error('store');
      return bytes;
    },
    async remove(paths) {
      const safe = paths.filter((path) => OBJECT_PATH.test(path));
      if (!safe.length) return;
      const response = await fetchImpl(`${config.url}/storage/v1/object/assets`, {
        method: 'DELETE',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ prefixes: safe }),
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(REST_TIMEOUT_MS),
      });
      await response.body?.cancel().catch(() => {});
      if (!response.ok && response.status !== 404) throw new Error('store');
    },
    async move(from, to) {
      if (!OBJECT_PATH.test(from) || !OBJECT_PATH.test(to)) throw new Error('store');
      const response = await fetchImpl(`${config.url}/storage/v1/object/move`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ bucketId: 'assets', sourceKey: from, destinationKey: to }),
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(REST_TIMEOUT_MS),
      });
      await response.body?.cancel().catch(() => {});
      if (!response.ok) throw new Error('store');
    },
  };
}

async function one(request) {
  const rows = await request;
  if (!Array.isArray(rows) || !rows[0]) throw new Error('store');
  return rows[0];
}
