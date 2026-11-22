/* Flatten restored gallery JSON (v2.1) into the shape the pages already render,
   and keep likes on this browser. */

var LIKE_BASE = Object.create(null);

function flattenGallery(doc) {
  var images = (doc && doc.images) || [];
  return images
    .filter(function (im) { return im.is_active !== false && im.filename; })
    .sort(function (a, b) { return (a.order_num || 0) - (b.order_num || 0); })
    .map(function (im) {
      var ko = im.ko || {};
      var en = im.en || {};
      var actions = im.actions || {};
      var tags = normalizeTags(im.tags);
      if (!tags.length && im.style) {
        tags = [{ name_ko: im.style, name_en: im.style }];
      }
      var likeCount = typeof im.like_count === 'number' ? im.like_count : 0;
      if (im.id) LIKE_BASE[im.id] = likeCount;
      return {
        id: im.id,
        item_id: im.id,
        filename: im.filename,
        style: im.style || '',
        order_num: im.order_num || 0,
        character: (doc.character || '').toLowerCase(),
        show_on_main: im.show_on_main === true,
        like_count: likeCount,
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

function mergeGalleryImages(images, extra) {
  var seen = Object.create(null);
  var out = Array.isArray(images) ? images.slice() : [];
  for (var i = 0; i < out.length; i++) {
    var current = out[i];
    if (current && current.id) seen[current.id] = true;
    if (current && current.filename) seen['file:' + current.filename] = true;
  }
  var more = Array.isArray(extra) ? extra : [];
  for (var j = 0; j < more.length; j++) {
    var im = more[j];
    if (!im || !im.filename) continue;
    if ((im.id && seen[im.id]) || seen['file:' + im.filename]) continue;
    out.push(im);
  }
  return out;
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

/* DB count is the baseline. This browser adds one only while kxd_liked is set. */
function localLikeCount(itemId) {
  var base = Object.prototype.hasOwnProperty.call(LIKE_BASE, itemId) ? LIKE_BASE[itemId] : 0;
  try {
    var liked = JSON.parse(localStorage.getItem('kxd_liked') || '{}');
    if (liked[itemId]) return base + 1;
  } catch (e) {}
  return base;
}

function localAdjustLike(itemId) {
  return localLikeCount(itemId);
}
