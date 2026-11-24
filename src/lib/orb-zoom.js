export const Z_MIN = 1.6;
export const Z_MAX = 6.5;
export const Z_DEFAULT = 4.05;
export function clampZ(z = Z_DEFAULT) {
  return Number.isFinite(z) ? Math.min(Z_MAX, Math.max(Z_MIN, z)) : Z_DEFAULT;
}
export function pinchZ(z, startDistance, currentDistance) {
  return clampZ(
    startDistance > 0 && currentDistance > 0 ? (z * startDistance) / currentDistance : z
  );
}
export function wheelZ(z, deltaY, deltaMode = 0, pageHeight = 800) {
  const pixels = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? pageHeight : 1);
  return clampZ(z * Math.exp(Math.max(-2, Math.min(2, pixels * 0.001))));
}
export function doubleTapZ(z) {
  return z < 3 ? Z_DEFAULT : 2.2;
}
export function resetZoom() {
  return { x: 0, y: 0, z: Z_DEFAULT };
}
