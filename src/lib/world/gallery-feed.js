const FILENAME = /^[a-z0-9][a-z0-9_-]{0,80}\.webp$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function filenamesOf(doc) {
  const images = Array.isArray(doc?.images) ? doc.images : [];
  return images.map((image) => image?.filename).filter((name) => typeof name === 'string');
}

export function publicImages(staticDoc, rows, likes, tagNames) {
  const seen = new Set();
  for (const image of Array.isArray(staticDoc?.images) ? staticDoc.images : []) {
    if (image?.id) seen.add(String(image.id));
    if (image?.filename) seen.add(`file:${image.filename}`);
  }
  const extra = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || row.is_active === false || !row.item_id || !row.filename) continue;
    if (seen.has(String(row.item_id)) || seen.has(`file:${row.filename}`)) continue;
    extra.push(toGalleryImage(row, likes, tagNames));
  }
  extra.sort(compareGalleryNewestFirst);
  return extra;
}

export function compareGalleryNewestFirst(a, b) {
  const left = galleryRecency(a);
  const right = galleryRecency(b);
  if (left.time !== right.time) return right.time - left.time;
  if (left.order !== right.order) return right.order - left.order;
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

function galleryRecency(image) {
  const time = Date.parse(image?.created_at || image?.createdAt || '');
  return {
    time: Number.isFinite(time) ? time : 0,
    order: Number.isInteger(image?.order_num) ? image.order_num : 0,
    id: String(image?.id || image?.item_id || image?.filename || ''),
  };
}

export function toGalleryImage(row, likes, tagNames) {
  const names = tagNames instanceof Map ? tagNames : new Map();
  const counts = likes instanceof Map ? likes : new Map();
  const tags = Array.isArray(row.tags) ? row.tags : [];
  return {
    id: row.item_id,
    filename: row.filename,
    style: row.style || '',
    order_num: Number.isInteger(row.order_num) ? row.order_num : 0,
    created_at: typeof row.created_at === 'string' ? row.created_at : '',
    is_active: true,
    show_on_main: row.show_on_main === true,
    like_count: counts.get(row.item_id) || 0,
    tags: tags
      .filter((tag) => typeof tag === 'string' && tag.trim())
      .map((tag) => ({ name_ko: tag, name_en: names.get(tag) || tag })),
    ko: side(row, 'ko'),
    en: side(row, 'en'),
    actions: row.actions && typeof row.actions === 'object' ? row.actions : {},
  };
}

export function storagePublicUrl(origin, character, filename) {
  if (!SLUG.test(character) || !FILENAME.test(filename)) return '';
  return `${origin}/storage/v1/object/public/assets/${character}/${filename}`;
}

function side(row, locale) {
  return {
    title: text(row[`title_${locale}`]),
    technique: text(row[`technique_${locale}`]),
    description: text(row[`description_${locale}`]),
    kin_perspective: text(row[`kin_perspective_${locale}`]),
    dred_perspective: text(row[`dred_perspective_${locale}`]),
  };
}

function text(value) {
  return typeof value === 'string' ? value : '';
}
