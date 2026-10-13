import { centreDistance, iou, shift } from './box.js';

/**
 * @typedef {import('./box.js').Box} Box
 * @typedef {{ id: number, box: Box, prev: Box | null, vx: number, vy: number, hits: number, miss: number,
 *   coast: boolean, conf: number, birth: number, hist: number[][], dir: number, counted: boolean,
 *   payload: unknown }} Track
 */

/**
 * Multi-object tracker for a fixed camera.
 *
 * Each frame: predict every track forward with its velocity, pair tracks with detections
 * (IoU, or centre distance when boxes barely overlap), keep unmatched tracks alive by
 * coasting on their velocity, and start new tracks for unmatched detections.
 */
export class Tracker {
  /**
   * @param {object} [options]
   * @param {number} [options.dt] seconds between detections
   * @param {number} [options.maxMiss] frames a track may coast before it is dropped
   * @param {number} [options.minIou] overlap that qualifies a pair
   * @param {number} [options.gate] centre distance, in box widths, that also qualifies a pair
   * @param {(t: Track) => boolean} [options.keep] extra rule; return false to drop a track (e.g. left the scene)
   */
  constructor({ dt = 1 / 17, maxMiss = 10, minIou = 0.08, gate = 0.9, keep = () => true } = {}) {
    this.dt = dt;
    this.maxMiss = maxMiss;
    this.minIou = minIou;
    this.gate = gate;
    this.keep = keep;
    /** @type {Track[]} */
    this.tracks = [];
    this.nextId = 1;
  }

  /**
   * Process one frame of detections.
   * @param {(Box & { conf?: number, payload?: unknown })[]} detections
   * @param {number} time seconds, stored in each track's history
   * @returns {{ matched: [number, Box, Box][] }} matched: [track id, previous box, new box]
   */
  update(detections, time) {
    const { dt, tracks } = this;
    const used = new Set();
    const matchedTracks = new Set();
    const matched = [];

    for (const t of tracks) t.predicted = shift(t.box, t.vx * dt, t.vy * dt);

    const pairs = [];
    for (const t of tracks) {
      detections.forEach((d, i) => {
        const q = iou(t.predicted, d);
        const dist = centreDistance(t.predicted, d);
        const size = Math.max(t.predicted.x1 - t.predicted.x0, 6);
        if (q > this.minIou || dist < size * this.gate) {
          pairs.push([q + (1 - Math.min(1, dist / size)) * 0.5, t, i]);
        }
      });
    }
    pairs.sort((a, b) => b[0] - a[0]);

    for (const [, t, i] of pairs) {
      if (matchedTracks.has(t) || used.has(i)) continue;
      matchedTracks.add(t);
      used.add(i);
      const d = detections[i];
      const before = t.box;
      const vy = (d.y1 - before.y1) / dt;
      const vx = ((d.x0 + d.x1) / 2 - (before.x0 + before.x1) / 2) / dt;
      t.vx = t.vx * 0.6 + vx * 0.4;
      t.vy = t.vy * 0.6 + vy * 0.4;
      t.prev = before;
      t.box = { x0: d.x0, x1: d.x1, y0: d.y0, y1: d.y1 };
      t.hits += 1;
      t.miss = 0;
      t.coast = false;
      t.conf = d.conf ?? 1;
      t.payload = d.payload;
      t.hist.push([(d.x0 + d.x1) / 2, d.y1, time]);
      if (t.hist.length > 60) t.hist.shift();
      matched.push([t.id, before, t.box]);
    }

    for (const t of tracks) {
      if (matchedTracks.has(t)) continue;
      t.miss += 1;
      t.coast = true;
      t.prev = t.box;
      t.box = shift(t.box, t.vx * dt, t.vy * dt);
    }

    detections.forEach((d, i) => {
      if (used.has(i)) return;
      tracks.push({
        id: this.nextId++,
        box: { x0: d.x0, x1: d.x1, y0: d.y0, y1: d.y1 },
        prev: null,
        vx: 0,
        vy: 0,
        hits: 1,
        miss: 0,
        coast: false,
        conf: d.conf ?? 1,
        birth: time,
        hist: [[(d.x0 + d.x1) / 2, d.y1, time]],
        dir: 0,
        counted: false,
        payload: d.payload,
      });
    });

    this.tracks = tracks.filter((t) => t.miss < this.maxMiss && this.keep(t));
    return { matched };
  }
}
