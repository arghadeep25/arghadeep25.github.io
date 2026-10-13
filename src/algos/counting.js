/**
 * Direction and line-crossing logic for counting vehicles with a single camera.
 *
 * Image y grows downward, so a vehicle moving away from the camera has y decreasing.
 * +1 means "away" (entering), -1 means "toward" (leaving).
 */

/**
 * Direction of travel from the last `window` history points.
 * @param {number[][]} hist points [x, y, time], oldest first
 * @param {{ window?: number, threshold: number }} options threshold: smallest |dy| that counts as movement
 * @returns {-1 | 0 | 1} 0 when there is not enough history or movement
 */
export function directionFromHistory(hist, { window = 5, threshold }) {
  if (hist.length < window) return 0;
  const dy = hist[hist.length - 1][1] - hist[hist.length - window][1];
  if (Math.abs(dy) <= threshold) return 0;
  return dy < 0 ? 1 : -1;
}

/**
 * Did a point travelling in direction `dir` cross the line between two consecutive frames?
 * @param {number} prevY
 * @param {number} y
 * @param {number} dir +1 away (y decreasing), -1 toward (y increasing)
 * @param {number} lineY
 */
export function crossedLine(prevY, y, dir, lineY) {
  if (dir > 0) return prevY >= lineY && y < lineY;
  if (dir < 0) return prevY <= lineY && y > lineY;
  return false;
}

/**
 * Counts each tracked vehicle once, at the moment it crosses the line.
 */
export class LineCounter {
  /**
   * @param {object} options
   * @param {number} options.lineY image y of the counting line
   * @param {number} options.threshold minimum |dy| over the window to decide a direction
   * @param {number} [options.minHits] detections a track needs before its direction is trusted
   * @param {number} [options.window] history points used for the direction
   */
  constructor({ lineY, threshold, minHits = 5, window = 5 }) {
    this.lineY = lineY;
    this.threshold = threshold;
    this.minHits = minHits;
    this.window = window;
    this.entered = 0;
    this.left = 0;
  }

  /**
   * Update directions and counts for the current tracks. Mutates `dir` and `counted` on each track.
   * @param {{ hits: number, hist: number[][], dir: number, counted: boolean }[]} tracks
   * @returns {{ track: object, dir: 1 | -1 }[]} crossings that happened this frame
   */
  update(tracks) {
    const events = [];
    for (const t of tracks) {
      if (t.hits >= this.minHits && !t.dir) {
        t.dir = directionFromHistory(t.hist, { window: this.window, threshold: this.threshold });
      }
      if (t.counted || !t.dir || t.hist.length < 2) continue;
      const prevY = t.hist[t.hist.length - 2][1];
      const y = t.hist[t.hist.length - 1][1];
      if (crossedLine(prevY, y, t.dir, this.lineY)) {
        t.counted = true;
        if (t.dir > 0) this.entered += 1;
        else this.left += 1;
        events.push({ track: t, dir: t.dir });
      }
    }
    return events;
  }

  /** Vehicles currently inside, given a starting count. */
  occupancy(start = 0) {
    return Math.max(0, start + this.entered - this.left);
  }
}
