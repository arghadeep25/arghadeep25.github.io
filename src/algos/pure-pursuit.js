/**
 * Pure-pursuit path following for a point vehicle (bicycle without a wheelbase).
 *
 * The vehicle chases a "carrot": the first point on the path at least `lookAhead` away.
 * It steers with curvature 2 sin(alpha) / lookAhead, where alpha is the angle from its heading to the carrot.
 *
 * @typedef {{ x: number, y: number, heading: number }} Vehicle
 */

/**
 * First point on the path that is at least `lookAhead` from the vehicle, scanning in +x.
 * @param {(x: number) => number} pathY path as y = f(x)
 * @param {Vehicle} car
 * @param {number} lookAhead
 * @param {number} xMax stop scanning here; the path end is used as a fallback
 * @param {number} [step] scan step
 * @returns {{ x: number, y: number }}
 */
export function lookAheadPoint(pathY, car, lookAhead, xMax, step = 3) {
  for (let x = car.x; x < xMax; x += step) {
    const y = pathY(x);
    if (Math.hypot(x - car.x, y - car.y) >= lookAhead) return { x, y };
  }
  const x = car.x + lookAhead;
  return { x, y: pathY(x) };
}

/**
 * Advance the vehicle by `dt` seconds at constant speed `v`.
 * @param {Vehicle} car mutated in place
 * @param {{ x: number, y: number }} target the carrot
 * @param {number} lookAhead
 * @param {number} v speed
 * @param {number} dt
 */
export function stepPurePursuit(car, target, lookAhead, v, dt) {
  const alpha = Math.atan2(target.y - car.y, target.x - car.x) - car.heading;
  const curvature = (2 * Math.sin(alpha)) / lookAhead;
  car.heading += v * curvature * dt;
  car.x += Math.cos(car.heading) * v * dt;
  car.y += Math.sin(car.heading) * v * dt;
}
