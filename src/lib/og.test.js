import assert from 'node:assert/strict';
import test from 'node:test';
import { ogImageFor } from './og.js';

test('OG images use existing files and default for unknown or unsafe slugs', () => {
  assert.equal(ogImageFor('kin'), '/og/og-kin.jpg');
  assert.equal(ogImageFor('dred'), '/og/og-dred.jpg');
  for (const slug of ['unknown-character', '../x', 'KIN', '', null]) {
    assert.equal(ogImageFor(slug), '/og/og-home.jpg');
  }
});
