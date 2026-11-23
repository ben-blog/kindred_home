import assert from 'node:assert/strict';
import test from 'node:test';
import { ORB_EASE_MS, ORB_RESUME_MS, ORB_SPIN, stepOrbMotion } from './orb-motion.js';

test('a fresh orb auto-spins, and a drag throw damps without auto-spin', () => {
  const coasting = stepOrbMotion({ vx: 0, vy: 0, releasedAt: -1e15 }, 0.5, { now: 0 });
  assert.equal(coasting.auto, 1);
  assert.equal(coasting.dyaw, ORB_SPIN * 0.5);

  const thrown = stepOrbMotion({ vx: 1, vy: -0.5, releasedAt: 0 }, 0.1, { now: 100 });
  assert.equal(thrown.auto, 0);
  assert.equal(thrown.dyaw, 0.1);
  assert.equal(thrown.dpitch, -0.05);
  assert.ok(Math.abs(thrown.vx) < 1);
  assert.ok(Math.abs(thrown.vy) < 0.5);
});

test('auto-spin stays off until two seconds after release, then eases in', () => {
  const waiting = stepOrbMotion({ vx: 0, vy: 0, releasedAt: 0 }, 0.1, { now: ORB_RESUME_MS - 1 });
  assert.equal(waiting.auto, 0);
  assert.equal(waiting.dyaw, 0);

  const mid = stepOrbMotion({ vx: 0, vy: 0, releasedAt: 0 }, 0.1, {
    now: ORB_RESUME_MS + ORB_EASE_MS / 2,
  });
  assert.ok(mid.auto > 0.4 && mid.auto < 0.6);
  assert.ok(mid.dyaw > 0 && mid.dyaw < ORB_SPIN * 0.1);
});

test('reduced motion keeps the throw and does not resume auto-spin', () => {
  const held = stepOrbMotion({ vx: 0.4, vy: 0, releasedAt: 0 }, 0.2, {
    reduced: true,
    now: ORB_RESUME_MS + ORB_EASE_MS + 1000,
  });
  assert.equal(held.auto, 0);
  assert.equal(held.dyaw, 0.4 * 0.2);
  assert.ok(held.vx < 0.4);
});
