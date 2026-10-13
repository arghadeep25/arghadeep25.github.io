/** Wrap an angle to (-PI, PI]. */
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Pose of `b` expressed in the frame of pose `a`. Poses are [x, y, heading].
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]} [dx, dy, dtheta] in a's frame
 */
export function relativePose(a, b) {
  const c = Math.cos(a[2]);
  const s = Math.sin(a[2]);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return [c * dx + s * dy, -s * dx + c * dy, wrapAngle(b[2] - a[2])];
}
