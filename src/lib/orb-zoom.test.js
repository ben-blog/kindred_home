import test from 'node:test';
import assert from 'node:assert/strict';
import { clampZ, pinchZ, wheelZ, doubleTapZ, resetZoom, Z_MIN, Z_MAX } from './orb-zoom.js';
test('camera distance is finite and clamped', () => {
  assert.equal(clampZ(), 4.05);
  assert.equal(clampZ(NaN), 4.05);
  assert.equal(clampZ(-20), Z_MIN);
  assert.equal(clampZ(20), Z_MAX);
});
test('pinch ratio zooms in and out and clamps', () => {
  assert.equal(pinchZ(4.05, 100, 200), 2.025);
  assert.equal(pinchZ(4.05, 100, 50), 6.5);
  assert.equal(pinchZ(4.05, 100, 1000), 1.6);
  assert.equal(pinchZ(4.05, 100, 0), 4.05);
});
test('wheel direction and delta modes', () => {
  assert.ok(wheelZ(4.05, 100) > 4.05);
  assert.ok(wheelZ(4.05, -100) < 4.05);
  assert.equal(wheelZ(4.05, 1, 1), wheelZ(4.05, 16));
  assert.equal(wheelZ(4.05, 1, 2, 500), wheelZ(4.05, 500));
});
test('double tap toggles region zoom and default', () => {
  assert.equal(doubleTapZ(4.05), 2.2);
  assert.equal(doubleTapZ(2.2), 4.05);
});
test('reset clears camera offsets', () => {
  assert.deepEqual(resetZoom({ x: 2, y: 3, z: 2 }), { x: 0, y: 0, z: 4.05 });
});
