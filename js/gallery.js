/* Flatten restored gallery JSON (v2.1) into the shape the pages already render,
   and keep likes on this browser. */

function flattenGallery(doc) {
  var images = (doc && doc.images) || [];
  return images
    .filter(function (im) { return im.is_active !== false; })
    .sort(function (a, b) { return (a.order_num || 0) - (b.order_num || 0); })
    .map(function (im) {
      var ko = im.ko || {};
      var en = im.en || {};
      var actions = im.actions || {};
      var tags = normalizeTags(im.tags);
      if (!tags.length && im.style) {
        tags = [{ name_ko: im.style, name_en: im.style }];
      }
      return {
        id: im.id,
        item_id: im.id,
        filename: im.filename,
        style: im.style || '',
        order_num: im.order_num || 0,
        character: (doc.character || '').toLowerCase(),
        title_ko: ko.title || '',
        title_en: en.title || '',
        technique_ko: ko.technique || '',
        technique_en: en.technique || '',
        description_ko: ko.description || '',
        description_en: en.description || '',
        kin_perspective_ko: ko.kin_perspective || '',
        kin_perspective_en: en.kin_perspective || '',
        dred_perspective_ko: ko.dred_perspective || '',
        dred_perspective_en: en.dred_perspective || '',
        actions: {
          ko: Array.isArray(actions.ko) ? actions.ko : [],
          en: Array.isArray(actions.en) ? actions.en : [],
        },
        tags: tags,
      };
    });
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .map(function (t) {
      if (typeof t === 'string') return { name_ko: t, name_en: t };
      if (!t || typeof t !== 'object') return null;
      var ko = t.name_ko || t.ko || '';
      var en = t.name_en || t.en || ko;
      if (!ko && !en) return null;
      return { name_ko: ko, name_en: en };
    })
    .filter(Boolean);
}

function gallerySrc(filename) {
  return asset('/assets/gallery/' + filename);
}

function resolveLink(url) {
  if (!url) return '#';
  if (url.charAt(0) === '/' && url.charAt(1) !== '/') return asset(url);
  return url;
}

function isExternalLink(url) {
  return /^https?:/i.test(url || '');
}

function actionLinkHtml(action, className) {
  var raw = (action && action.url) || '#';
  var href = resolveLink(raw);
  var attrs = isExternalLink(raw) ? ' target="_blank" rel="noopener noreferrer"' : '';
  return '<a class="' + className + '" href="' + href + '"' + attrs + '>' + (action.label || '') + '</a>';
}

var LIKE_COUNTS_KEY = 'kxd_like_counts';

function readLikeCounts() {
  try { return JSON.parse(localStorage.getItem(LIKE_COUNTS_KEY) || '{}'); }
  catch (e) { return {}; }
}

function localLikeCount(itemId) {
  var counts = readLikeCounts();
  if (Object.prototype.hasOwnProperty.call(counts, itemId)) return counts[itemId] || 0;
  try {
    var liked = JSON.parse(localStorage.getItem('kxd_liked') || '{}');
    return liked[itemId] ? 1 : 0;
  } catch (e) { return 0; }
}

function localAdjustLike(itemId, delta) {
  var counts = readLikeCounts();
  var base = Object.prototype.hasOwnProperty.call(counts, itemId)
    ? (counts[itemId] || 0)
    : localLikeCount(itemId);
  counts[itemId] = Math.max(0, base + delta);
  try { localStorage.setItem(LIKE_COUNTS_KEY, JSON.stringify(counts)); }
  catch (e) {}
  return counts[itemId];
}
