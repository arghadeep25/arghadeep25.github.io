/**
 * Route planning on a grid of streets.
 *
 * `makeCity` builds the street graph. `astar` finds the cheapest route over it, where turning
 * costs extra and turning back on yourself is not allowed. `buildRoute` turns a list of waypoints
 * into a smooth driveable line that keeps to one lane, with rounded corners, and answers
 * "where is s metres along the route, d metres to the left" and its inverse.
 */

/** Directions as unit steps: 0 east, 1 north, 2 west, 3 south. */
export const DIRS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/**
 * @param {{ cols: number, rows: number, spacing: number }} o
 */
export function makeCity({ cols, rows, spacing }) {
  const nodes = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) nodes.push({ i, j, x: i * spacing, y: j * spacing });
  const id = (i, j) => (i < 0 || j < 0 || i >= cols || j >= rows ? -1 : j * cols + i);
  return {
    cols,
    rows,
    spacing,
    nodes,
    id,
    width: (cols - 1) * spacing,
    height: (rows - 1) * spacing,
  };
}

/** Index of the direction that leads from node a to the adjacent node b, or -1. */
export function dirBetween(city, a, b) {
  const A = city.nodes[a];
  const B = city.nodes[b];
  const dx = Math.sign(B.i - A.i);
  const dy = Math.sign(B.j - A.j);
  if (Math.abs(B.i - A.i) + Math.abs(B.j - A.j) !== 1) return -1;
  return DIRS.findIndex((d) => d[0] === dx && d[1] === dy);
}

/**
 * A* over (node, heading) states.
 * @param {ReturnType<typeof makeCity>} city
 * @param {number} start node to start from
 * @param {number} goal node to reach
 * @param {{ heading?: number, turnCost?: number }} [o] heading: direction we arrive at start with, so the
 *   route cannot turn straight back; turnCost: extra metres charged for each turn
 * @returns {{ path: number[], cost: number, expanded: { node: number, from: number }[] } | null}
 */
export function astar(city, start, goal, { heading = -1, turnCost = 30 } = {}) {
  const key = (n, h) => n * 5 + (h < 0 ? 4 : h);
  const G = city.nodes[goal];
  const hfn = (n) => Math.abs(city.nodes[n].x - G.x) + Math.abs(city.nodes[n].y - G.y);
  const best = new Map();
  const prev = new Map();
  const open = [];
  const push = (n, h, g, from) => {
    const k = key(n, h);
    if (best.has(k) && best.get(k) <= g) return;
    best.set(k, g);
    prev.set(k, from);
    open.push({ n, h, g, f: g + hfn(n), k });
  };
  push(start, heading, 0, -1);
  const expanded = [];
  const seen = new Set();
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur.g > (best.get(cur.k) ?? Infinity)) continue;
    if (!seen.has(cur.n)) {
      seen.add(cur.n);
      const p = prev.get(cur.k);
      expanded.push({ node: cur.n, from: p === -1 ? -1 : Math.floor(p / 5) });
    }
    if (cur.n === goal) {
      const path = [];
      let k = cur.k;
      while (k !== -1) {
        path.push(Math.floor(k / 5));
        k = prev.get(k);
      }
      return { path: path.reverse(), cost: cur.g, expanded };
    }
    const N = city.nodes[cur.n];
    for (let d = 0; d < 4; d++) {
      if (cur.h >= 0 && d === (cur.h + 2) % 4) continue;
      const m = city.id(N.i + DIRS[d][0], N.j + DIRS[d][1]);
      if (m < 0) continue;
      const turn = cur.h >= 0 && d !== cur.h ? turnCost : 0;
      push(m, d, cur.g + city.spacing + turn, cur.k);
    }
  }
  return null;
}

/** The point on the street network closest to (x, y): which street, how far along, and where. */
export function snapToStreets(city, x, y) {
  let best = null;
  const { cols, rows } = city;
  const consider = (a, b) => {
    const A = city.nodes[a];
    const B = city.nodes[b];
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const len = Math.hypot(dx, dy);
    const u = Math.max(0, Math.min(1, ((x - A.x) * dx + (y - A.y) * dy) / (len * len)));
    const px = A.x + dx * u;
    const py = A.y + dy * u;
    const d = Math.hypot(x - px, y - py);
    if (!best || d < best.d) best = { a, b, u, x: px, y: py, d, len };
  };
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      if (i + 1 < cols) consider(city.id(i, j), city.id(i + 1, j));
      if (j + 1 < rows) consider(city.id(i, j), city.id(i, j + 1));
    }
  return best;
}

/**
 * Cheapest way to arrive at a point on a street, coming from a start node with a heading.
 * Tries both ends of the street the point is on and keeps whichever is cheaper.
 * @returns {{ nodes: number[], end: { x: number, y: number }, expanded: object[], cost: number } | null}
 */
export function planToPoint(city, start, heading, snap, opts = {}) {
  const options = [];
  for (const [near, far] of [
    [snap.a, snap.b],
    [snap.b, snap.a],
  ]) {
    const r = astar(city, start, near, { heading, ...opts });
    if (!r) continue;
    // arriving at `near`, the last leg runs near -> far; reversing into it is not allowed
    const arrive = r.path.length > 1 ? dirBetween(city, r.path[r.path.length - 2], near) : heading;
    if (arrive >= 0 && arrive === (dirBetween(city, near, far) + 2) % 4) continue;
    options.push({ r, extra: (near === snap.a ? snap.u : 1 - snap.u) * snap.len });
  }
  if (!options.length) return null;
  options.sort((p, q) => p.r.cost + p.extra - (q.r.cost + q.extra));
  const o = options[0];
  return {
    nodes: o.r.path,
    end: { x: snap.x, y: snap.y },
    expanded: o.r.expanded,
    cost: o.r.cost + o.extra,
  };
}

/**
 * Turn waypoints into a driveable line in one lane.
 * @param {{ x: number, y: number }[]} pts waypoints on the street centre line, first and last included
 * @param {{ offset?: number, radius?: number, step?: number }} [o] offset: how far to the right of the
 *   centre line the lane sits; radius: corner radius; step: sample spacing in metres
 */
export function buildRoute(pts, { offset = 1.8, radius = 9, step = 1 } = {}) {
  const n = pts.length;
  const dir = [];
  const nor = []; // right-hand normals
  for (let k = 0; k < n - 1; k++) {
    const dx = pts[k + 1].x - pts[k].x;
    const dy = pts[k + 1].y - pts[k].y;
    const L = Math.hypot(dx, dy) || 1;
    dir.push([dx / L, dy / L, L]);
    nor.push([dy / L, -dx / L]);
  }
  // the offset corner points
  const Q = pts.map((p, k) => {
    if (k === 0) return [p.x + nor[0][0] * offset, p.y + nor[0][1] * offset];
    if (k === n - 1) return [p.x + nor[n - 2][0] * offset, p.y + nor[n - 2][1] * offset];
    const a = nor[k - 1];
    const b = nor[k];
    const k2 = offset / (1 + a[0] * b[0] + a[1] * b[1]);
    return [p.x + (a[0] + b[0]) * k2, p.y + (a[1] + b[1]) * k2];
  });

  const xs = [];
  const ys = [];
  const corners = []; // index of the sample nearest each waypoint
  const add = (x, y) => {
    xs.push(x);
    ys.push(y);
  };
  add(Q[0][0], Q[0][1]);
  corners.push(0);
  for (let k = 1; k < n - 1; k++) {
    const d0 = dir[k - 1];
    const d1 = dir[k];
    const cross = d0[0] * d1[1] - d0[1] * d1[0];
    const q = Q[k];
    if (Math.abs(cross) < 1e-6) {
      add(q[0], q[1]);
      corners.push(xs.length - 1);
      continue;
    }
    const r = Math.min(radius, d0[2] * 0.45, d1[2] * 0.45);
    const ax = q[0] - d0[0] * r;
    const ay = q[1] - d0[1] * r;
    const bx = q[0] + d1[0] * r;
    const by = q[1] + d1[1] * r;
    const m = 12;
    for (let i = 0; i <= m; i++) {
      const t = i / m;
      const u = 1 - t;
      add(u * u * ax + 2 * u * t * q[0] + t * t * bx, u * u * ay + 2 * u * t * q[1] + t * t * by);
    }
    corners.push(xs.length - 1 - Math.floor(m / 2));
  }
  add(Q[n - 1][0], Q[n - 1][1]);
  corners.push(xs.length - 1);

  // resample at even spacing
  const cum0 = [0];
  for (let i = 1; i < xs.length; i++)
    cum0.push(cum0[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]));
  const length = cum0[cum0.length - 1];
  const count = Math.max(2, Math.ceil(length / step) + 1);
  const X = new Float64Array(count);
  const Y = new Float64Array(count);
  let seg = 0;
  for (let i = 0; i < count; i++) {
    const s = Math.min(length, (i / (count - 1)) * length);
    while (seg < cum0.length - 2 && cum0[seg + 1] < s) seg++;
    const span = cum0[seg + 1] - cum0[seg] || 1;
    const t = (s - cum0[seg]) / span;
    X[i] = xs[seg] + (xs[seg + 1] - xs[seg]) * t;
    Y[i] = ys[seg] + (ys[seg + 1] - ys[seg]) * t;
  }
  const ds = length / (count - 1);
  const TH = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(count - 1, i + 1);
    TH[i] = Math.atan2(Y[b] - Y[a], X[b] - X[a]);
  }
  // curvature, for the speed limit through corners
  const K = new Float64Array(count);
  for (let i = 1; i < count - 1; i++) {
    let d = TH[i + 1] - TH[i - 1];
    d = Math.atan2(Math.sin(d), Math.cos(d));
    K[i] = d / (2 * ds);
  }
  const nodeS = corners.map((ci) => cum0[ci]);

  const idx = (s) => Math.max(0, Math.min(count - 1.000001, s / ds));
  return {
    length,
    ds,
    count,
    nodeS,
    kappa: K,
    /** Position and heading at arc length s, shifted `lat` metres to the left of the route. */
    pointAt(s, lat = 0) {
      const f = idx(s);
      const i = Math.floor(f);
      const t = f - i;
      const x = X[i] + (X[i + 1] - X[i]) * t;
      const y = Y[i] + (Y[i + 1] - Y[i]) * t;
      const d = Math.atan2(Math.sin(TH[i + 1] - TH[i]), Math.cos(TH[i + 1] - TH[i]));
      const th = TH[i] + d * t;
      // beyond the ends, carry on straight
      const over = s < 0 ? s : s > length ? s - length : 0;
      return {
        x: x - Math.sin(th) * lat + Math.cos(th) * over,
        y: y + Math.cos(th) * lat + Math.sin(th) * over,
        th,
      };
    },
    curvatureAt(s) {
      return K[Math.round(idx(s))];
    },
    /** The route coordinates of a world point: how far along, and how far to the left. */
    project(x, y) {
      let bi = 0;
      let bd = Infinity;
      for (let i = 0; i < count; i++) {
        const d = (X[i] - x) ** 2 + (Y[i] - y) ** 2;
        if (d < bd) {
          bd = d;
          bi = i;
        }
      }
      const th = TH[bi];
      const dx = x - X[bi];
      const dy = y - Y[bi];
      return {
        s: bi * ds + (dx * Math.cos(th) + dy * Math.sin(th)),
        lat: -dx * Math.sin(th) + dy * Math.cos(th),
      };
    },
    /** Sampled line from s0 to s1, for drawing. */
    line(s0, s1, lat = 0, every = 2) {
      const out = [];
      for (let s = Math.max(0, s0); s <= Math.min(length, s1) + 1e-6; s += every) {
        const p = this.pointAt(s, lat);
        out.push([p.x, p.y]);
      }
      return out;
    },
  };
}
