import { UKF, ctrv } from './ukf.js';

/**
 * @typedef {{ x: number, y: number, cls?: string }} Detection a measured position and, optionally, a class
 * @typedef {{ id: number, cls: string, filter: UKF, state: 'tentative' | 'confirmed' | 'coasting',
 *   hits: number, misses: number, age: number, trail: number[][], lastDet: Detection | null }} Track
 */

/**
 * Multi-object tracker: one UKF per object.
 *
 * Each step: predict every track, pair detections with tracks by Mahalanobis distance (greedy,
 * smallest first, inside a gate), update the pairs, coast tracks that found nothing, and start
 * tentative tracks for leftover detections. A track becomes confirmed after a few hits, so a one-off
 * false detection never turns into an object. A confirmed track that goes unseen keeps predicting
 * (coasting) for a while, and is picked up again under the same id if the object reappears.
 */
export class UkfTracker {
  /**
   * @param {object} [o]
   * @param {number} [o.gate2] squared Mahalanobis gate; 9.21 is the 99% bound for 2 degrees of freedom
   * @param {number} [o.confirmHits] hits needed to confirm a new track
   * @param {number} [o.rescue] metres: a detection this close to a track that found nothing else still goes to it
   * @param {number} [o.maxCoast] steps a confirmed track may go unseen before it is dropped
   * @param {number} [o.tentativeMiss] misses that kill a tentative track
   * @param {object} [o.noise] passed to every filter: accel, yawAccel, meas
   */
  constructor({
    gate2 = 9.21,
    confirmHits = 3,
    maxCoast = 14,
    tentativeMiss = 1,
    rescue = 1.5,
    noise = {},
  } = {}) {
    this.gate2 = gate2;
    this.rescue = rescue;
    this.confirmHits = confirmHits;
    this.maxCoast = maxCoast;
    this.tentativeMiss = tentativeMiss;
    this.noise = noise;
    /** @type {Track[]} */
    this.tracks = [];
    this.nextId = 1;
  }

  /**
   * One detection cycle.
   * @param {number} dt seconds since the previous cycle
   * @param {Detection[]} detections
   * @returns {{ pairs: { track: Track, det: Detection, d2: number }[], born: Track[], dropped: Track[] }}
   */
  step(dt, detections) {
    for (const t of this.tracks) t.filter.predict(dt);

    const cand = [];
    this.tracks.forEach((t) =>
      detections.forEach((d, j) => {
        if (d.cls && t.cls && d.cls !== t.cls) return;
        const d2 = t.filter.distance2([d.x, d.y]);
        if (d2 < this.gate2) cand.push({ t, j, d2 });
      }),
    );
    cand.sort((a, b) => a.d2 - b.d2);
    const usedT = new Set();
    const usedD = new Set();
    const pairs = [];
    for (const c of cand) {
      if (usedT.has(c.t) || usedD.has(c.j)) continue;
      usedT.add(c.t);
      usedD.add(c.j);
      pairs.push({ track: c.t, det: detections[c.j], d2: c.d2 });
    }
    // second chance: a detection just outside the gate of a track that found nothing is still its
    // object, which beats starting a duplicate track beside it
    const near = [];
    for (const t of this.tracks) {
      if (usedT.has(t)) continue;
      detections.forEach((d, j) => {
        if (usedD.has(j) || (d.cls && t.cls && d.cls !== t.cls)) return;
        const dist = Math.hypot(d.x - t.filter.x[0], d.y - t.filter.x[1]);
        if (dist < this.rescue) near.push({ t, j, dist });
      });
    }
    near.sort((a, b) => a.dist - b.dist);
    for (const c of near) {
      if (usedT.has(c.t) || usedD.has(c.j)) continue;
      usedT.add(c.t);
      usedD.add(c.j);
      pairs.push({ track: c.t, det: detections[c.j], d2: c.dist * c.dist });
    }

    for (const { track: t, det } of pairs) {
      t.filter.update([det.x, det.y]);
      t.hits++;
      t.misses = 0;
      t.lastDet = det;
      if (t.state !== 'confirmed' && t.hits >= this.confirmHits) t.state = 'confirmed';
      else if (t.state === 'coasting') t.state = 'confirmed';
      t.trail.push([t.filter.x[0], t.filter.x[1]]);
      if (t.trail.length > 40) t.trail.shift();
    }

    const dropped = [];
    for (const t of this.tracks) {
      t.age += dt;
      if (usedT.has(t)) continue;
      t.misses++;
      t.lastDet = null;
      if (t.state === 'confirmed') t.state = 'coasting';
      const limit = t.state === 'tentative' ? this.tentativeMiss : this.maxCoast;
      if (t.misses > limit) dropped.push(t);
    }
    this.tracks = this.tracks.filter((t) => !dropped.includes(t));

    const born = [];
    detections.forEach((d, j) => {
      if (usedD.has(j)) return;
      const t = {
        id: this.nextId++,
        cls: d.cls || '',
        filter: new UKF({ x: d.x, y: d.y }, this.noise),
        state: 'tentative',
        hits: 1,
        misses: 0,
        age: 0,
        trail: [[d.x, d.y]],
        lastDet: d,
      };
      this.tracks.push(t);
      born.push(t);
    });
    return { pairs, born, dropped };
  }
}

/**
 * Where a track expects its object to be over the next `horizon` seconds, as [x, y] points.
 * @param {Track} track
 */
export function predictPath(track, horizon = 2, step = 0.25) {
  const out = [];
  let s = [...track.filter.x, 0, 0];
  for (let t = step; t <= horizon + 1e-9; t += step) {
    s = [...ctrv(s, step).slice(0, 5), 0, 0];
    out.push([s[0], s[1]]);
  }
  return out;
}
