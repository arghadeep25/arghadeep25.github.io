/**
 * Spring physics for a single dot. Pure: no DOM, no globals.
 *
 * A dot has a position (x, y), a velocity (vx, vy) and a target (tx, ty).
 * It is pulled to its target by a damped spring and pushed away from the pointer.
 */

/**
 * @typedef {{ x: number, y: number, vx: number, vy: number, tx: number, ty: number }} Dot
 * @typedef {{ x: number, y: number } | null} Pointer
 * @typedef {{ stiffness?: number, damping?: number, radius?: number, force?: number }} SpringOptions
 */

export const SPRING_DEFAULTS = Object.freeze({
  stiffness: 46,
  damping: 9.5,
  radius: 90,
  force: 2600,
});

/**
 * Advance one dot by `dt` seconds (semi-implicit Euler).
 * @param {Dot} dot
 * @param {number} dt seconds
 * @param {Pointer} pointer pointer position in the same space as the dot, or null
 * @param {SpringOptions} [options]
 * @returns {number} 0..1, how close the pointer is (1 at the pointer), for glow effects
 */
export function stepDot(dot, dt, pointer, options = {}) {
  const { stiffness, damping, radius, force } = { ...SPRING_DEFAULTS, ...options };
  let ax = -stiffness * (dot.x - dot.tx) - damping * dot.vx;
  let ay = -stiffness * (dot.y - dot.ty) - damping * dot.vy;
  let near = 0;

  if (pointer) {
    const dx = dot.x - pointer.x;
    const dy = dot.y - pointer.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      const d = Math.sqrt(d2) + 0.001;
      const f = 1 - d / radius;
      ax += (dx / d) * f * f * force;
      ay += (dy / d) * f * f * force;
      near = f * f;
    }
  }

  dot.vx += ax * dt;
  dot.vy += ay * dt;
  dot.x += dot.vx * dt;
  dot.y += dot.vy * dt;
  return near;
}

/** Distance from a dot to its target. Handy for "has it settled?" checks. */
export function distanceToTarget(dot) {
  return Math.hypot(dot.x - dot.tx, dot.y - dot.ty);
}
