import assert from 'node:assert/strict';
import test from 'node:test';
import { rateNote } from '../scripts/warmth.js';

test('a rate limit says how many minutes to wait', () => {
  assert.equal(rateNote('600'), 'already sent, try again in 10 min');
  assert.equal(rateNote('60'), 'already sent, try again in 1 min');
  assert.equal(rateNote('90'), 'already sent, try again in 2 min');
  assert.equal(rateNote(null), 'already sent, try again in 10 min');
});
