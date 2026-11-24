import assert from 'node:assert/strict';
import test from 'node:test';
import { adminCopy, adminMessage, relativeTime } from './admin-copy.js';
import { warmthWaitNote } from '../scripts/warmth.js';

test('leader copy contains no empty strings and substitutes status', () => {
  for (const value of Object.values(adminCopy))
    assert.ok(typeof value === 'string' && value.trim());
  assert.equal(
    adminMessage(adminCopy.worldFail, { status: 503 }),
    '세계 상태를 못 불러왔습니다 (503)'
  );
  assert.equal(relativeTime('2026-11-24T08:00:00Z', Date.parse('2026-11-24T08:12:00Z')), '12분 전');
});
test('warmth wait override is Korean while public default stays English', () => {
  assert.equal(warmthWaitNote(90, adminCopy.wait), 'Warmth · 2분 뒤');
  assert.equal(warmthWaitNote(null, adminCopy.wait), 'Warmth · 10분 뒤');
  assert.equal(warmthWaitNote(600), 'already sent, try again in 10 min');
});
