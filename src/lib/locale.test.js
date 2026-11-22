import assert from 'node:assert/strict';
import test from 'node:test';
import { text } from './locale.js';

const englishOnly = { defaultLocale: 'en', locales: ['en'] };
const withKorean = { defaultLocale: 'en', locales: ['en', 'ko'] };
const copy = { en: 'Watches first.', ko: '먼저 본다.' };

test('the helper uses the requested enabled locale and falls back to en', () => {
  assert.equal(text(copy, 'en', englishOnly), 'Watches first.');
  assert.equal(text(copy, 'ko', englishOnly), 'Watches first.');
  assert.equal(text(copy, 'ko', withKorean), '먼저 본다.');
  assert.equal(text({ en: 'Hello' }, 'ko', withKorean), 'Hello');
  assert.equal(text('A friend.', 'ko', withKorean), 'A friend.');
  assert.equal(text(undefined, 'en', englishOnly), '');
});

test('the live site default is english', () => {
  assert.equal(text(copy), 'Watches first.');
  assert.equal(text(copy, 'ko'), 'Watches first.');
});
