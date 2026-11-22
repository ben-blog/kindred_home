import assert from 'node:assert/strict';
import test from 'node:test';
import { localizedSchema, siteSchema } from './schema.js';

test('a localized field requires en and keeps extra locales', () => {
  assert.deepEqual(localizedSchema.parse({ en: 'Hello' }), { en: 'Hello' });
  assert.deepEqual(localizedSchema.parse({ en: 'Hello', ko: '안녕', ja: 'こんにちは' }), {
    en: 'Hello',
    ko: '안녕',
    ja: 'こんにちは',
  });

  const missing = localizedSchema.safeParse({ ko: '안녕' });
  assert.equal(missing.success, false);
  assert.ok(missing.error.issues.some((issue) => issue.message === 'en is required'));

  assert.equal(localizedSchema.safeParse({}).success, false);
  assert.equal(localizedSchema.safeParse({ en: '' }).success, false);
  assert.equal(localizedSchema.safeParse({ en: 'Hello', note: 'not a locale' }).success, false);
});

test('the site locale list must include en and the default', () => {
  assert.deepEqual(siteSchema.parse({ defaultLocale: 'en', locales: ['en'] }).locales, ['en']);
  assert.equal(siteSchema.safeParse({ defaultLocale: 'en', locales: ['ko'] }).success, false);
  assert.equal(siteSchema.safeParse({ defaultLocale: 'ko', locales: ['en'] }).success, false);
  assert.equal(siteSchema.safeParse({ defaultLocale: 'en', locales: ['en', 'ko'] }).success, true);
});
