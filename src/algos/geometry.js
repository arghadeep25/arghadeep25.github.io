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

/**
 * Pose reached by driving the relative motion `d` from pose `a`. The opposite of relativePose.
 * @param {number[]} a [x, y, heading]
 * @param {number[]} d [dx, dy, dtheta] in a's frame
 * @returns {number[]}
 */
export function composePose(a, d) {
  const c = Math.cos(a[2]);
  const s = Math.sin(a[2]);
  return [a[0] + c * d[0] - s * d[1], a[1] + s * d[0] + c * d[1], wrapAngle(a[2] + d[2])];
}

/**
 * Does the segment a to b cross a rotated rectangle? The rectangle has its centre at (cx, cy),
 * its length along `yaw` and its width across. Used for line of sight checks.
 */
export function segmentHitsBox(ax, ay, bx, by, cx, cy, yaw, len, wid) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const x0 = (ax - cx) * c + (ay - cy) * s;
  const y0 = -(ax - cx) * s + (ay - cy) * c;
  const x1 = (bx - cx) * c + (by - cy) * s;
  const y1 = -(bx - cx) * s + (by - cy) * c;
  let t0 = 0;
  let t1 = 1;
  for (const [p, d, h] of [
    [x0, x1 - x0, len / 2],
    [y0, y1 - y0, wid / 2],
  ]) {
    if (Math.abs(d) < 1e-12) {
      if (Math.abs(p) > h) return false;
      continue;
    }
    let ta = (-h - p) / d;
    let tb = (h - p) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}
