/**
 * @typedef {{ x0: number, y0: number, x1: number, y1: number }} Box axis-aligned, x0 < x1, y0 < y1
 */

/** Intersection over union of two boxes, 0 when they do not overlap. */
export function iou(a, b) {
  const w = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const h = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const inter = w * h;
  const areaA = (a.x1 - a.x0) * (a.y1 - a.y0);
  const areaB = (b.x1 - b.x0) * (b.y1 - b.y0);
  return inter / (areaA + areaB - inter + 1e-6);
}

/** Distance between box centres. */
export function centreDistance(a, b) {
  return Math.hypot((a.x0 + a.x1) / 2 - (b.x0 + b.x1) / 2, (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
}

/** Box moved by (dx, dy). */
export function shift(box, dx, dy) {
  return { x0: box.x0 + dx, x1: box.x1 + dx, y0: box.y0 + dy, y1: box.y1 + dy };
}
