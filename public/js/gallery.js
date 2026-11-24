/* Flatten restored gallery JSON (v2.1) into the shape the pages already render,
   and keep likes on this browser. */

var LIKE_BASE = Object.create(null);

function compareGalleryNewestFirst(a, b) {
  var left = galleryRecency(a);
  var right = galleryRecency(b);
  if (left.time !== right.time) return right.time - left.time;
  if (left.order !== right.order) return right.order - left.order;
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

function galleryRecency(image) {
  var time = Date.parse((image && (image.created_at || image.createdAt)) || '');
  var order = image && Number.isInteger(image.order_num) ? image.order_num : 0;
  return {
    time: Number.isFinite(time) ? time : 0,
    order: order,
    id: String((image && (image.id || image.item_id || image.filename)) || ''),
  };
}

function flattenGallery(doc) {
  var images = (doc && doc.images) || [];
  return images
    .filter(function (im) {
      return im.is_active !== false && im.filename;
    })
    .sort(compareGalleryNewestFirst)
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
        created_at: im.created_at || im.createdAt || '',
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
  var name = filename || '';
  if (name.indexOf('kin_album_') === 0 || name.indexOf('dred_album_') === 0) {
    return asset('/api/gallery/file?name=' + encodeURIComponent(name));
  }
  return asset('/assets/gallery/' + name);
}

function galleryImage(filename, role) {
  var name = filename || '';
  var plain = { src: gallerySrc(name), srcset: '', sizes: '' };
  if (
    name.indexOf('kin_album_') === 0 ||
    name.indexOf('dred_album_') === 0 ||
    !/^[a-z0-9][a-z0-9_.-]{0,80}\.webp$/.test(name)
  )
    return plain;
  var sizes = {
    'kin-thumb': '(max-width: 680px) 50vw, 25vw',
    'kin-detail': '(max-width: 680px) 100vw, 320px',
    hero: '100vw',
    pick: '(min-width: 800px) 300px, 33vw',
    grid: '(min-width: 800px) 17vw, 33vw',
    detail: '(max-width: 680px) 100vw, 280px',
  };
  var small = asset('/assets/gallery/w600/' + name);
  var large = asset('/assets/gallery/w1200/' + name);
  return {
    src: role === 'hero' || role === 'detail' ? large : small,
    srcset:
      small +
      ' 600w, ' +
      large +
      ' 1200w' +
      (role === 'hero' ? ', ' + gallerySrc(name) + ' 1920w' : ''),
    sizes: sizes[role] || '',
  };
}

function applyGalleryImage(img, filename, role) {
  var image = galleryImage(filename, role);
  // A reused detail element must fall back to its current image only.
  if (img.galleryFallback) img.removeEventListener('error', img.galleryFallback);
  img.galleryFallback = null;
  if (image.srcset) {
    img.galleryFallback = function () {
      img.removeAttribute('srcset');
      img.removeAttribute('sizes');
      img.src = gallerySrc(filename);
    };
    img.addEventListener('error', img.galleryFallback, { once: true });
  }
  img.decoding = 'async';
  if (image.sizes) img.sizes = image.sizes;
  else img.removeAttribute('sizes');
  if (image.srcset) img.srcset = image.srcset;
  else img.removeAttribute('srcset');
  img.src = image.src;
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
  return (
    '<a class="' + className + '" href="' + href + '"' + attrs + '>' + (action.label || '') + '</a>'
  );
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
