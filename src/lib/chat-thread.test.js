import test from 'node:test';
import assert from 'node:assert/strict';
import { groupsTogether, nearBottom } from './chat-thread.js';
test('group by speaker, calendar day and time proximity', () => {
  const at = new Date(2026, 10, 24, 23, 59).getTime();
  assert.ok(groupsTogether({ mine: true, at }, { mine: true, at: at + 1000 }));
  assert.equal(groupsTogether({ mine: true, at }, { mine: false, at }), false);
  assert.equal(groupsTogether({ mine: true, at }, { mine: true, at: at + 60_000 }), false);
  assert.equal(groupsTogether({ mine: true, at }, { mine: true, at: at + 180_000 }), false);
});
test('pin near bottom, preserve reading position above', () => {
  assert.ok(nearBottom({ scrollHeight: 1000, clientHeight: 500, scrollTop: 450 }));
  assert.equal(nearBottom({ scrollHeight: 1000, clientHeight: 500, scrollTop: 100 }), false);
});
