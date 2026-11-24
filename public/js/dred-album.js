/* global reportEvent, flattenGallery, mergeGalleryImages, applyGalleryImage, resolveLink, isExternalLink, localLikeCount, localAdjustLike */
/* DRED album. The seed matches src/lib/world/album-pick.js. */

var REVEAL_MS = 1700;
var EASE = 0.075;

function hash32(value) {
  var hash = 2166136261;
  var text = String(value);
  for (var i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededIds(ids, date) {
  var seen = Object.create(null);
  var unique = [];
  for (var i = 0; i < ids.length; i += 1) {
    var id = ids[i];
    if (!id || seen[id]) continue;
    seen[id] = true;
    unique.push(id);
  }
  if (unique.length <= 3) return unique.slice();
  var ranked = unique.map(function (id) {
    return { id: id, rank: hash32(date + ':' + id) };
  });
  ranked.sort(function (a, b) {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });
  return ranked.slice(0, 3).map(function (item) {
    return item.id;
  });
}

function kstDateKey(now) {
  var parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  function pick(type) {
    for (var i = 0; i < parts.length; i += 1) {
      if (parts[i].type === type) return parts[i].value;
    }
    return '';
  }
  return pick('year') + '-' + pick('month') + '-' + pick('day');
}

function perspectiveLine(value) {
  var line = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!line) return '';
  var sentence = line.split(/(?<=[.。…])\s/)[0] || line;
  return sentence.length > 80 ? sentence.slice(0, 80).trim() : sentence;
}

function reportToDred(eventType, payload) {
  reportEvent('dred', { service: 'gallery', event_type: eventType, payload: payload || {} });
}

var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var coarse = window.matchMedia('(pointer: coarse)').matches;
var lang = localStorage.getItem('kxd_lang') || (navigator.language.startsWith('ko') ? 'ko' : 'en');
var items = [];
var byId = Object.create(null);
var pick = null;
var index = 0;
var y = 0;
var target = 0;
var offsets = [];
var detailOpen = false;
var gridOpen = false;
var gridOpener = null;
var gridRevealRemaining = null;
var revealDeadline = 0;
var revealTimer = 0;
var wheelLock = 0;
var viewed = Object.create(null);

var $track = document.getElementById('track');
var $reel = document.getElementById('reel');
var $picks = document.getElementById('picks');
var $line = document.getElementById('pick-line');
var $row = document.getElementById('pick-row');
var $kicker = document.getElementById('pick-kicker');
var $index = document.getElementById('index');
var $ticks = document.getElementById('index-ticks');
var $grid = document.getElementById('grid-panel');
var $sheet = document.getElementById('grid-sheet');
var $gridClose = document.getElementById('grid-close');
var $panel = document.getElementById('detail-panel');
var $ltKo = document.getElementById('lt-ko');
var $ltEn = document.getElementById('lt-en');

function panels() {
  return [$picks].concat(Array.prototype.slice.call($reel.children));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function titleOf(item) {
  return (item && (item['title_' + lang] || item.title_ko || item.title_en)) || '';
}

function lineOf(item) {
  return (item && (item['dred_perspective_' + lang] || item.dred_perspective_ko)) || '';
}

function setLang(next) {
  lang = next;
  localStorage.setItem('kxd_lang', next);
  document.documentElement.lang = next;
  $ltKo.classList.toggle('active', next === 'ko');
  $ltEn.classList.toggle('active', next === 'en');
  $kicker.textContent = next === 'ko' ? '오늘 DRED가 골랐다' : 'Today DRED picked';
  paintCopy();
  if (detailOpen) fillDetail(index > 0 ? index - 1 : 0);
}

function paintCopy() {
  var slides = $reel.children;
  for (var i = 0; i < slides.length; i += 1) {
    var item = items[i];
    var sub = slides[i].querySelector('.subtitle');
    var img = slides[i].querySelector('img');
    if (sub) sub.textContent = lineOf(item);
    if (img) img.alt = titleOf(item);
  }
  var picks = $row.children;
  for (var j = 0; j < picks.length; j += 1) {
    var id = picks[j].getAttribute('data-id');
    var chosen = byId[id];
    var cap = picks[j].querySelector('span');
    var photo = picks[j].querySelector('img');
    if (cap && chosen) cap.textContent = titleOf(chosen);
    if (photo && chosen) photo.alt = titleOf(chosen);
  }
  var tiles = $sheet.children;
  for (var n = 0; n < tiles.length; n += 1) {
    tiles[n].setAttribute('aria-label', titleOf(items[n]));
  }
  var ticks = $ticks.children;
  for (var k = 0; k < ticks.length; k += 1) {
    ticks[k].setAttribute('aria-label', titleOf(items[k]) || String(k + 1));
  }
}

function renderSlides() {
  $reel.innerHTML = '';
  items.forEach(function (item, i) {
    var slide = document.createElement('section');
    slide.className = 'slide' + (reduced ? ' revealed' : '');
    var img = document.createElement('img');
    applyGalleryImage(img, item.filename, 'hero');
    img.alt = titleOf(item);
    img.draggable = false;
    if (i > 1) img.loading = 'lazy';
    var veil = document.createElement('div');
    veil.className = 'veil';
    var sub = document.createElement('p');
    sub.className = 'subtitle';
    sub.textContent = lineOf(item);
    var bar = document.createElement('div');
    bar.className = 'slide-bar';
    var info = document.createElement('button');
    info.type = 'button';
    info.className = 'info';
    info.textContent = 'info';
    info.addEventListener('click', function (event) {
      event.stopPropagation();
      openDetail(i);
    });
    var count = document.createElement('span');
    count.className = 'count';
    count.textContent = String(i + 1).padStart(2, '0');
    bar.appendChild(count);
    bar.appendChild(info);
    bar.appendChild(gridEntry());
    if ((item.actions[lang] || item.actions.ko || []).length) {
      var badge = document.createElement('span');
      badge.className = 'act';
      badge.textContent = 'action';
      bar.appendChild(badge);
    }
    slide.appendChild(img);
    slide.appendChild(veil);
    slide.appendChild(sub);
    slide.appendChild(bar);
    $reel.appendChild(slide);
  });
}

function renderIndex() {
  $ticks.innerHTML = '';
  items.forEach(function (item, i) {
    var tick = document.createElement('button');
    tick.type = 'button';
    tick.className = 'tick';
    tick.setAttribute('aria-label', titleOf(item) || String(i + 1));
    tick.addEventListener('click', function () {
      go(i + 1);
    });
    $ticks.appendChild(tick);
  });
  markIndex();
  renderGrid();
}

function gridEntry() {
  var button = document.createElement('button');
  button.type = 'button';
  button.className = 'grid-entry';
  button.textContent = 'index';
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', String(gridOpen));
  button.setAttribute('aria-controls', 'grid-panel');
  button.addEventListener('click', function () {
    openGrid(button);
  });
  return button;
}

function markGrid() {
  var ids = (pick && pick.item_ids) || [];
  Array.prototype.forEach.call($sheet.children, function (tile, i) {
    if (index === i + 1) tile.setAttribute('aria-current', 'true');
    else tile.removeAttribute('aria-current');
    tile.querySelector('.grid-today').hidden = ids.indexOf(items[i].id) < 0;
  });
}

function renderGrid() {
  $sheet.innerHTML = '';
  document.getElementById('grid-count').textContent = items.length + ' photos';
  items.forEach(function (item, i) {
    var tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'grid-tile';
    tile.setAttribute('aria-label', titleOf(item));
    var image = document.createElement('img');
    applyGalleryImage(image, item.filename, 'grid');
    image.alt = '';
    image.loading = 'lazy';
    image.draggable = false;
    var number = document.createElement('span');
    number.className = 'grid-number';
    number.textContent = String(i + 1).padStart(2, '0');
    var today = document.createElement('span');
    today.className = 'grid-today';
    today.textContent = 'today';
    tile.appendChild(image);
    tile.appendChild(number);
    tile.appendChild(today);
    tile.addEventListener('click', function () {
      closeGrid();
      go(i + 1, reduced);
      arm(currentSlide());
    });
    $sheet.appendChild(tile);
  });
  markGrid();
  if (gridOpen) focusGrid();
}

function focusGrid() {
  var current = $sheet.querySelector('[aria-current="true"]');
  (current || $gridClose).focus({ preventScroll: true });
  if (current) current.scrollIntoView({ block: 'nearest' });
}

function openGrid(opener) {
  if (detailOpen || gridOpen) return;
  gridOpener = opener;
  gridOpen = true;
  touching = false;
  // Pause the reveal while the visitor is browsing the index.
  gridRevealRemaining = revealDeadline ? Math.max(0, revealDeadline - performance.now()) : null;
  window.clearTimeout(revealTimer);
  document.body.classList.add('grid-open');
  $grid.inert = false;
  $grid.setAttribute('aria-hidden', 'false');
  $grid.classList.add('open');
  document.querySelectorAll('.grid-entry').forEach(function (button) {
    button.setAttribute('aria-expanded', 'true');
  });
  stage.inert = true;
  $index.inert = true;
  document.getElementById('header').inert = true;
  markGrid();
  focusGrid();
}

function closeGrid() {
  if (!gridOpen) return;
  gridOpen = false;
  $grid.classList.remove('open');
  document.body.classList.remove('grid-open');
  stage.inert = false;
  $index.inert = false;
  document.getElementById('header').inert = false;
  document.querySelectorAll('.grid-entry').forEach(function (button) {
    button.setAttribute('aria-expanded', 'false');
  });
  if (gridOpener && gridOpener.isConnected) gridOpener.focus({ preventScroll: true });
  $grid.inert = true;
  $grid.setAttribute('aria-hidden', 'true');
  if (gridRevealRemaining !== null) arm(currentSlide(), gridRevealRemaining);
  gridRevealRemaining = null;
}

function renderPicks() {
  $row.innerHTML = '';
  markGrid();
  if (!pick) return;
  $line.textContent = pick.line || '';
  (pick.item_ids || []).forEach(function (id) {
    var item = byId[id];
    if (!item) return;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'pick';
    button.setAttribute('data-id', id);
    var img = document.createElement('img');
    applyGalleryImage(img, item.filename, 'pick');
    img.alt = titleOf(item);
    var cap = document.createElement('span');
    cap.textContent = titleOf(item);
    button.appendChild(img);
    button.appendChild(cap);
    button.addEventListener('click', function () {
      var at = items.findIndex(function (entry) {
        return entry.id === id;
      });
      if (at >= 0) go(at + 1);
    });
    $row.appendChild(button);
  });
}

function measure() {
  offsets = panels().map(function (el) {
    return el.offsetTop;
  });
  target = offsets[index] || 0;
  if (reduced) y = target;
}

function markIndex() {
  var ticks = $ticks.children;
  for (var i = 0; i < ticks.length; i += 1) {
    ticks[i].classList.toggle('on', index > 0 && i === index - 1);
  }
  var current = ticks[index - 1];
  if (!current) return;
  if ($index.scrollWidth > $index.clientWidth + 4) {
    $index.scrollLeft = current.offsetLeft - $index.clientWidth / 2;
  }
  if ($index.scrollHeight > $index.clientHeight + 4) {
    $index.scrollTop = current.offsetTop - $index.clientHeight / 2;
  }
}

function currentSlide() {
  return index > 0 ? $reel.children[index - 1] : null;
}

function reveal(slide) {
  if (!slide) return;
  slide.classList.add('revealed');
}

function arm(slide, delay) {
  window.clearTimeout(revealTimer);
  revealDeadline = 0;
  if (!slide || reduced || slide.classList.contains('revealed')) return;
  var wait = delay === undefined ? REVEAL_MS : delay;
  revealDeadline = performance.now() + wait;
  revealTimer = window.setTimeout(function () {
    revealDeadline = 0;
    reveal(slide);
  }, wait);
}

function noteView(i) {
  var item = items[i];
  if (!item || viewed[item.id]) return;
  viewed[item.id] = true;
  reportToDred('image_viewed', {
    item_id: item.item_id || item.id,
    title: titleOf(item) || item.title_ko,
    style: item.style,
    lang: lang,
  });
}

function go(next, instant) {
  var list = panels();
  index = clamp(next, 0, list.length - 1);
  target = offsets[index] || 0;
  if (instant || reduced) y = target;
  markIndex();
  markGrid();
  var slide = currentSlide();
  if (slide) {
    arm(slide);
    noteView(index - 1);
  } else {
    window.clearTimeout(revealTimer);
    revealDeadline = 0;
  }
}

function point(clientX, clientY) {
  if (gridOpen || detailOpen) return;
  var slide = currentSlide();
  if (!slide || reduced || slide.classList.contains('revealed')) return;
  var rect = slide.getBoundingClientRect();
  slide.style.setProperty('--x', clientX - rect.left + 'px');
  slide.style.setProperty('--y', clientY - rect.top + 'px');
  slide.classList.add('looking');
}

function localPick(date) {
  var ids = seededIds(
    items.map(function (item) {
      return item.id;
    }),
    date
  );
  var first = byId[ids[0]];
  var line = perspectiveLine(first && first.dred_perspective_ko);
  if (!/[가-힣]/.test(line)) line = perspectiveLine('몸은 가는데 마음은 아직. 뭐 다 그렇지.');
  return { date: date, item_ids: ids, line: line, source: 'fallback' };
}

async function loadPick() {
  var date = kstDateKey(new Date());
  try {
    var response = await fetch('/api/gallery/dred/pick', {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    if (response.ok) {
      var body = await response.json();
      if (body && Array.isArray(body.item_ids) && body.item_ids.length && body.line) return body;
    }
  } catch (error) {
    return localPick(date);
  }
  return localPick(date);
}

async function fetchItems() {
  var response = await fetch(document.getElementById('stage').getAttribute('data-gallery'));
  if (!response.ok) throw new Error('gallery');
  var doc = await response.json();
  try {
    var extra = await fetch('/api/gallery/dred', { headers: { accept: 'application/json' } });
    if (extra.ok) {
      var more = await extra.json();
      doc.images = mergeGalleryImages(doc.images, more && more.images);
    }
  } catch (error) {
    return flattenGallery(doc);
  }
  return flattenGallery(doc);
}

function fillDetail(i) {
  var item = items[i];
  if (!item) return;
  document.getElementById('detail-eyebrow').textContent =
    'DRED · ' + String(i + 1).padStart(2, '0') + ' / ' + items.length;
  document.getElementById('detail-title').textContent = titleOf(item);
  document.getElementById('detail-technique').textContent = item['technique_' + lang] || '';
  document.getElementById('detail-desc').textContent = item['description_' + lang] || '';
  document.getElementById('detail-kin').textContent = item['kin_perspective_' + lang] || '';
  document.getElementById('detail-dred').textContent = item['dred_perspective_' + lang] || '';
  document.getElementById('detail-counter').textContent =
    String(i + 1).padStart(2, '0') + ' / ' + items.length;
  var image = document.getElementById('detail-img-el');
  applyGalleryImage(image, item.filename, 'detail');
  image.alt = titleOf(item);
  var section = document.getElementById('detail-action-section');
  var acts = document.getElementById('detail-actions');
  acts.innerHTML = '';
  var actions = item.actions[lang] || [];
  if (actions.length) {
    actions.forEach(function (action) {
      var link = document.createElement('a');
      link.className = 'action-btn';
      link.textContent = action.label || '';
      link.href = resolveLink(action.url);
      if (isExternalLink(action.url)) {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
      acts.appendChild(link);
    });
    section.style.display = 'block';
  } else {
    section.style.display = 'none';
  }
  var tags = document.getElementById('detail-tags');
  tags.innerHTML = '';
  (item.tags || []).forEach(function (tag) {
    var span = document.createElement('span');
    span.className = 'tag';
    span.textContent = tag['name_' + lang] || tag.name_ko || '';
    if (span.textContent) tags.appendChild(span);
  });
  var itemId = item.item_id || item.id;
  updateLike(itemId);
}

function openDetail(i) {
  if (!items[i]) return;
  closeGrid();
  go(i + 1, true);
  detailOpen = true;
  history.pushState({ detail: true }, '');
  fillDetail(i);
  $panel.classList.add('open');
}

function closeDetailUI() {
  $panel.classList.remove('open');
  detailOpen = false;
}

function closeDetail() {
  if (history.state && history.state.detail) history.back();
  else closeDetailUI();
}

function navDetail(dir) {
  if (!items.length) return;
  var next = (index - 1 + dir + items.length) % items.length;
  openDetail(next);
}

var LIKED_KEY = 'kxd_liked';

function likedMap() {
  try {
    return JSON.parse(localStorage.getItem(LIKED_KEY) || '{}');
  } catch (error) {
    return {};
  }
}

function setLiked(itemId, value) {
  try {
    var liked = likedMap();
    if (value) liked[itemId] = true;
    else delete liked[itemId];
    localStorage.setItem(LIKED_KEY, JSON.stringify(liked));
  } catch (error) {
    return;
  }
}

function updateLike(itemId) {
  var button = document.getElementById('like-btn');
  var heart = button.querySelector('.like-heart');
  var count = document.getElementById('like-count');
  var liked = likedMap()[itemId];
  count.textContent = String(localLikeCount(itemId));
  button.classList.toggle('liked', Boolean(liked));
  heart.textContent = liked ? '❤' : '♡';
}

function frame() {
  if (!reduced && y !== target) {
    y += (target - y) * EASE;
    if (Math.abs(target - y) < 0.5) y = target;
  }
  $track.style.transform = 'translate3d(0,' + -y.toFixed(2) + 'px,0)';
  requestAnimationFrame(frame);
}

$ltKo.addEventListener('click', function () {
  setLang('ko');
});
$ltEn.addEventListener('click', function () {
  setLang('en');
});

document.getElementById('like-btn').addEventListener('click', function () {
  if (!detailOpen || index < 1) return;
  var item = items[index - 1];
  if (!item) return;
  var itemId = item.item_id || item.id;
  var liked = likedMap()[itemId];
  setLiked(itemId, !liked);
  localAdjustLike(itemId);
  updateLike(itemId);
  if (!liked) {
    reportToDred('image_liked', {
      item_id: itemId,
      title: titleOf(item) || item.title_ko,
      style: item.style,
      lang: lang,
    });
  }
});

document.getElementById('detail-close').addEventListener('click', closeDetail);
$panel.addEventListener('click', function (event) {
  if (event.target === $panel) closeDetail();
});
document.getElementById('dn-prev').addEventListener('click', function () {
  navDetail(-1);
});
document.getElementById('dn-next').addEventListener('click', function () {
  navDetail(1);
});

window.addEventListener('popstate', function (event) {
  if (!(event.state && event.state.detail) && detailOpen) closeDetailUI();
});

window.addEventListener('keydown', function (event) {
  if (detailOpen) {
    if (event.key === 'Escape') closeDetail();
    if (event.key === 'ArrowRight') navDetail(1);
    if (event.key === 'ArrowLeft') navDetail(-1);
    return;
  }
  if (gridOpen) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeGrid();
    }
    if (event.key === 'Tab') {
      var controls = [$gridClose].concat(Array.prototype.slice.call($sheet.children));
      var at = controls.indexOf(document.activeElement);
      var next = (at + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
      event.preventDefault();
      controls[next].focus();
    }
    return;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowRight' || event.key === 'PageDown') {
    event.preventDefault();
    go(index + 1);
  }
  if (event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.key === 'PageUp') {
    event.preventDefault();
    go(index - 1);
  }
});

window.addEventListener(
  'wheel',
  function (event) {
    if (detailOpen || gridOpen) return;
    event.preventDefault();
    var now = performance.now();
    if (now < wheelLock) return;
    if (Math.abs(event.deltaY) < 4 && Math.abs(event.deltaX) < 4) return;
    wheelLock = now + (reduced ? 0 : 680);
    go(index + (event.deltaY + event.deltaX > 0 ? 1 : -1));
  },
  { passive: false }
);

var touchX = 0;
var touchY = 0;
var touching = false;
var stage = document.getElementById('stage');

stage.addEventListener(
  'touchstart',
  function (event) {
    if (detailOpen || gridOpen || event.target.closest('button, a, #index')) return;
    touching = true;
    touchX = event.touches[0].clientX;
    touchY = event.touches[0].clientY;
  },
  { passive: true }
);

stage.addEventListener(
  'touchmove',
  function (event) {
    if (!touching || detailOpen || gridOpen) return;
    point(event.touches[0].clientX, event.touches[0].clientY);
    if (Math.abs(event.touches[0].clientY - touchY) > 12) event.preventDefault();
  },
  { passive: false }
);

stage.addEventListener('touchend', function (event) {
  if (!touching || detailOpen || gridOpen) return;
  touching = false;
  var dy = event.changedTouches[0].clientY - touchY;
  var dx = event.changedTouches[0].clientX - touchX;
  if (Math.abs(dy) > 48 && Math.abs(dy) > Math.abs(dx)) go(index + (dy < 0 ? 1 : -1));
  else if (Math.abs(dy) < 12 && Math.abs(dx) < 12) reveal(currentSlide());
});

stage.addEventListener('pointermove', function (event) {
  if (event.pointerType === 'touch') return;
  point(event.clientX, event.clientY);
});

stage.addEventListener('click', function (event) {
  if (gridOpen || detailOpen || event.target.closest('button, a, #index, #picks')) return;
  reveal(currentSlide());
});

window.addEventListener('resize', function () {
  measure();
});

var cursor = document.getElementById('cur');
if (coarse || reduced) {
  cursor.style.display = 'none';
} else {
  document.addEventListener('mousemove', function (event) {
    cursor.style.left = event.clientX + 'px';
    cursor.style.top = event.clientY + 'px';
  });
}

var back = document.querySelector('.h-back');
var fade = document.createElement('div');
fade.id = 'leave';
document.body.appendChild(fade);
function leave(href) {
  fade.classList.add('on');
  window.setTimeout(
    function () {
      window.location.href = href;
    },
    reduced ? 0 : 400
  );
}
back.addEventListener('click', function () {
  leave('../main.html');
});
document.getElementById('nav-kin').addEventListener('click', function () {
  leave('../kin/');
});

document.querySelector('#index .grid-entry').addEventListener('click', function (event) {
  openGrid(event.currentTarget);
});
$gridClose.addEventListener('click', closeGrid);
$grid.addEventListener('click', function (event) {
  if (event.target === $grid || event.target === $sheet) closeGrid();
});

setLang(lang);
requestAnimationFrame(frame);

fetchItems()
  .then(function (data) {
    items = data;
    byId = Object.create(null);
    items.forEach(function (item) {
      byId[item.id] = item;
    });
    renderSlides();
    renderIndex();
    measure();
    var loading = document.getElementById('loading');
    loading.style.opacity = '0';
    window.setTimeout(
      function () {
        loading.style.display = 'none';
      },
      reduced ? 0 : 400
    );
    reportToDred('gallery_visit', { item_count: data.length, lang: lang });
    return loadPick();
  })
  .then(function (body) {
    pick = body;
    renderPicks();
  })
  .catch(function () {
    document.querySelector('#loading span').textContent = 'error';
  });
