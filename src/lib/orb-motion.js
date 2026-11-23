/** Screen-space drag for the memory orb. Auto-spin is separate from the user's throw. */

export const ORB_SPIN = 0.16;
export const ORB_RESUME_MS = 2000;
export const ORB_EASE_MS = 900;
export const ORB_DAMP = 2.8;
const STOP = 0.0008;

/**
 * Advance inertia and auto-spin for one frame while the pointer is up.
 * `releasedAt` far in the past means auto-spin is already at full speed.
 * Reduced motion keeps a throw, and never starts the automatic spin.
 */
export function stepOrbMotion(state, dt, { reduced = false, now = 0 } = {}) {
  const damp = Math.exp(-ORB_DAMP * dt);
  let vx = state.vx || 0;
  let vy = state.vy || 0;
  let dyaw = 0;
  let dpitch = 0;
  if (Math.abs(vx) > STOP || Math.abs(vy) > STOP) {
    dyaw += vx * dt;
    dpitch += vy * dt;
    vx *= damp;
    vy *= damp;
    if (Math.abs(vx) <= STOP) vx = 0;
    if (Math.abs(vy) <= STOP) vy = 0;
  } else {
    vx = 0;
    vy = 0;
  }
  let auto = 0;
  if (!reduced) {
    const since = now - (state.releasedAt ?? -1e15);
    if (since >= ORB_RESUME_MS) auto = Math.min(1, (since - ORB_RESUME_MS) / ORB_EASE_MS);
    dyaw += ORB_SPIN * auto * dt;
  }
  return { dyaw, dpitch, vx, vy, auto };
}
