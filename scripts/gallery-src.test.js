import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const context = vm.createContext({ asset: (path) => path });
vm.runInContext(readFileSync(new URL('../public/js/gallery.js', import.meta.url), 'utf8'), context);

test('gallery variants use responsive sizes and preserve album and unsafe name handling', () => {
  const sizes = {
    'kin-thumb': '(max-width: 680px) 50vw, 25vw',
    'kin-detail': '(max-width: 680px) 100vw, 320px',
    hero: '100vw',
    pick: '(min-width: 800px) 300px, 33vw',
    grid: '(min-width: 800px) 17vw, 33vw',
    detail: '(max-width: 680px) 100vw, 280px',
  };
  for (const [role, size] of Object.entries(sizes)) {
    const image = context.galleryImage('example.webp', role);
    assert.equal(
      image.src,
      `/assets/gallery/w${role === 'hero' || role === 'detail' ? 1200 : 600}/example.webp`
    );
    assert.equal(
      image.srcset,
      '/assets/gallery/w600/example.webp 600w, /assets/gallery/w1200/example.webp 1200w' +
        (role === 'hero' ? ', /assets/gallery/example.webp 1920w' : '')
    );
    assert.equal(image.sizes, size);
  }
  for (const name of ['kin_album_new.webp', 'dred_album_new.webp']) {
    const image = context.galleryImage(name, 'hero');
    assert.equal(image.src, `/api/gallery/file?name=${name}`);
    assert.equal(image.srcset, '');
    assert.equal(image.sizes, '');
  }
  for (const name of ['../x.webp', 'X.webp', '']) {
    const image = context.galleryImage(name, 'grid');
    assert.equal(image.src, context.gallerySrc(name));
    assert.equal(image.srcset, '');
  }
});

test('failed variants fall back once, including when the detail image is reused', () => {
  const handlers = new Map();
  const img = {
    addEventListener(type, handler, options) {
      handlers.set(type, { handler, options });
    },
    removeEventListener(type, handler) {
      if (handlers.get(type)?.handler === handler) handlers.delete(type);
    },
    removeAttribute(name) {
      delete this[name];
    },
  };
  context.applyGalleryImage(img, 'first.webp', 'detail');
  context.applyGalleryImage(img, 'second.webp', 'hero');
  assert.equal(img.decoding, 'async');
  const { handler, options } = handlers.get('error');
  assert.equal(options.once, true);
  handler();
  assert.equal(img.src, '/assets/gallery/second.webp');
  assert.equal(img.srcset, undefined);
  assert.equal(img.sizes, undefined);
});

test('flattenGallery sorts by upload time, then order_num, newest first', () => {
  const images = context.flattenGallery({
    character: 'kin',
    images: [
      { id: 'old-high', filename: 'old-high.webp', order_num: 30, is_active: true, ko: { title: 'old' } },
      {
        id: 'new',
        filename: 'kin_album_new.webp',
        order_num: 31,
        created_at: '2026-11-24T12:00:00.000Z',
        is_active: true,
        ko: { title: 'new' },
      },
      { id: 'older', filename: 'older.webp', order_num: 2, is_active: true, ko: { title: 'older' } },
      {
        id: 'tied-a',
        filename: 'tied-a.webp',
        order_num: 8,
        created_at: '2026-11-01T00:00:00.000Z',
        is_active: true,
      },
      {
        id: 'tied-b',
        filename: 'tied-b.webp',
        order_num: 8,
        created_at: '2026-11-01T00:00:00.000Z',
        is_active: true,
      },
    ],
  });
  assert.deepEqual(
    images.map((image) => image.id),
    ['new', 'tied-a', 'tied-b', 'old-high', 'older']
  );
});

test('mergeGalleryImages keeps new stills and flattenGallery puts them first', () => {
  const merged = context.mergeGalleryImages(
    [
      { id: 'kept', filename: 'kept.webp', order_num: 1, is_active: true },
      { id: 'later', filename: 'later.webp', order_num: 4, is_active: true },
    ],
    [
      { id: 'kept', filename: 'kept.webp', order_num: 1, created_at: '2026-04-02T00:00:00.000Z' },
      {
        id: 'kin_album_new',
        filename: 'kin_album_new.webp',
        order_num: 33,
        created_at: '2026-11-24T12:00:00.000Z',
        is_active: true,
      },
    ]
  );
  const images = context.flattenGallery({ character: 'kin', images: merged });
  assert.deepEqual(
    images.map((image) => image.id),
    ['kin_album_new', 'later', 'kept']
  );
  assert.equal(images[0].created_at, '2026-11-24T12:00:00.000Z');
});
