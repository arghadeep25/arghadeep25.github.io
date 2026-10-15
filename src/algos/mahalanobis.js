/**
 * Mahalanobis and Euclidean distance of a point from the centre of a 2D Gaussian whose axes
 * are rotated by `phi` and have standard deviations `s1` (along the axis) and `s2` (across it).
 *
 * @param {number} dx point minus centre, x
 * @param {number} dy point minus centre, y
 * @param {{ s1: number, s2: number, phi: number }} model
 * @returns {{ mahalanobis: number, euclidean: number }}
 */
export function distances2D(dx, dy, { s1, s2, phi }) {
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  const u = (dx * c + dy * s) / s1;
  const v = (-dx * s + dy * c) / s2;
  return { mahalanobis: Math.hypot(u, v), euclidean: Math.hypot(dx, dy) };
}
