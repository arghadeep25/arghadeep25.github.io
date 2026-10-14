/**
 * Small, pure rules for the driving behaviours shown in the route planning demo: following a
 * vehicle, stopping for a signal or a crossing, slowing for a corner, and deciding whether to
 * overtake. Speeds are m/s, distances are metres along the route.
 */

/** Fastest speed from which the vehicle can still stop within `dist` at a steady `decel`. */
export const stopSpeed = (dist, decel = 2.5) => Math.sqrt(2 * decel * Math.max(0, dist));

/**
 * Speed to hold behind a vehicle. It keeps a time gap, and never goes faster than would let it
 * stop in the space left if the vehicle ahead braked to a halt (a hard cap that works even when the
 * gap is short).
 * @param {{ gap: number, v: number, vLead: number, headway?: number, minGap?: number, brake?: number }} o
 */
export function followSpeed({ gap, v, vLead, headway = 1.5, minGap = 4, brake = 7 }) {
  const desired = minGap + headway * v;
  const smooth = vLead + 0.45 * (gap - desired);
  const safe = Math.sqrt(Math.max(0, vLead * vLead + 2 * brake * Math.max(0, gap - minGap)));
  return Math.max(0, Math.min(smooth, safe));
}

/** Fastest comfortable speed through a bend of the given curvature (1/m). */
export function curveSpeed(kappa, aLat = 2.2, vMax = 15) {
  const k = Math.abs(kappa);
  return k < 1e-4 ? vMax : Math.min(vMax, Math.sqrt(aLat / k));
}

/**
 * Should the vehicle stop at a signal? Red: yes. Yellow: only if it can stop comfortably before the
 * line. Green: no. Past the line, never.
 * @param {{ state: 'green' | 'yellow' | 'red', dist: number, v: number, decel?: number, react?: number }} o
 */
export function mustStopForLight({ state, dist, v, decel = 3, react = 0.6 }) {
  if (dist < -1 || state === 'green') return false;
  if (state === 'red') return true;
  return v * react + (v * v) / (2 * decel) <= dist;
}

/**
 * What an overtake would take, for a vehicle ahead of us.
 * @param {{ gap: number, vLead: number, leadLen?: number, vPass?: number, margin?: number }} o
 * @returns {{ time: number, distance: number } | null} null when the vehicle is not slow enough to be worth passing
 */
export function overtakePlan({ gap, vLead, leadLen = 4.4, vPass = 11, margin = 10 }) {
  const rel = vPass - vLead;
  if (rel < 2.5) return null;
  const time = (gap + leadLen + 2 * margin) / rel;
  return { time, distance: vPass * time };
}

/**
 * Is the lane next to us free for the whole overtake? Oncoming vehicles are given by how far ahead
 * of us they are (negative once they have passed) and their speed towards us.
 * @param {{ time: number, distance: number }} plan
 * @param {{ gap: number, v: number }[]} oncoming
 * @returns {{ ok: boolean, blocker: { gap: number, v: number } | null }}
 */
export function laneIsFree(plan, oncoming, { clearance = 25, passedBy = 10 } = {}) {
  for (const o of oncoming) {
    if (o.gap < -passedBy) continue;
    const remaining = o.gap - (11 + o.v) * plan.time;
    if (o.gap < 0 || remaining < clearance) return { ok: false, blocker: o };
  }
  return { ok: true, blocker: null };
}
