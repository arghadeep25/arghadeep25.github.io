import { composePose, relativePose, wrapAngle } from '../algos/geometry.js';
import { solvePoseGraph } from '../algos/pose-graph.js';
import { TAU } from '../core/math.js';
import { gaussian, mulberry32 } from '../core/random.js';

/**
 * The robot journey every figure in the Graph SLAM post shares: one closed lap, the odometry
 * measured along it, and the loop closure seen at the end. World units are metres.
 *
 * The random noise is drawn once, so sliding the "wobble" knob scales the same wiggles up and
 * down instead of redrawing them.
 */

/** Position on the lap at fraction u (0..1). */
export function lapPoint(u) {
  const s = u * TAU;
  return [9 * Math.cos(s) + 1.4 * Math.cos(3 * s), 5.4 * Math.sin(s) + 1.1 * Math.sin(2 * s)];
}

/** What the odometry is believed to be good to: metres, metres, radians. */
export const SIGMA = [0.07, 0.07, 0.025];
export const INFO = SIGMA.map((s) => 1 / (s * s));

/** Mean distance between estimated and true positions. */
export function meanError(est, truth) {
  return (
    est.reduce((s, p, i) => s + Math.hypot(p[0] - truth[i][0], p[1] - truth[i][1]), 0) / est.length
  );
}

/**
 * @param {{ n?: number, seed?: number }} [opts] n: poses on the lap
 */
export function makeScene({ n = 36, seed = 5 } = {}) {
  const truth = Array.from({ length: n }, (_, i) => {
    const [x, y] = lapPoint(i / n);
    const [nx, ny] = lapPoint((i + 1) / n);
    return [x, y, Math.atan2(ny - y, nx - x)];
  });
  const gauss = gaussian(mulberry32(seed));
  // one set of wiggles per step: distance, sideways, turn
  const wiggle = Array.from({ length: n - 1 }, () => [gauss(), gauss(), gauss()]);
  const clean = truth.slice(0, -1).map((p, i) => relativePose(p, truth[i + 1]));

  /** Odometry for a given wobble (0 = perfect, 1 = rough): the edges and the path they add up to. */
  function odometry(wobble) {
    const edges = [];
    const poses = [truth[0].slice()];
    clean.forEach((z0, i) => {
      const w = wiggle[i];
      const z = [
        z0[0] * (1 + 0.02 * wobble) + 0.05 * wobble * w[0],
        z0[1] + 0.04 * wobble * w[1],
        z0[2] + 0.018 * wobble + 0.03 * wobble * w[2],
      ];
      edges.push({ i, j: i + 1, z, w: INFO.slice() });
      poses.push(composePose(poses[i], z));
    });
    return { edges, poses };
  }

  /** The loop closure: the last pose sees the first one again. */
  const loop = {
    i: n - 1,
    j: 0,
    z: relativePose(truth[n - 1], truth[0]),
    w: INFO.slice(),
  };

  /** Pull the whole lap into shape using the odometry and, if given, the loop closures. */
  function solve(wobble, loops = [loop], iterations = 12) {
    const { edges, poses } = odometry(wobble);
    const anchor = { i: 0, t: 'anchor', z: truth[0], w: 1e6 };
    return solvePoseGraph(poses, [...edges, ...loops], [anchor], iterations);
  }

  const cache = new Map();
  /**
   * The solver's frames for a wobble, ready to play back: the start, then the poses after each
   * iteration, with the cost at each.
   */
  function frames(wobble, loops = [loop]) {
    const key = `${wobble}|${loops.length}`;
    if (!cache.has(key)) {
      const start = odometry(wobble).poses;
      const out = solve(wobble, loops);
      cache.set(key, { poses: [start, ...out.solutions], cost: out.cost });
      if (cache.size > 40) cache.delete(cache.keys().next().value);
    }
    return cache.get(key);
  }

  /** A wrong loop closure: it says pin 26 is the very same place as pin 8, but they are far apart. */
  const wrong = { i: 8, j: 26, z: [0, 0, 0], w: INFO.slice() };

  /** The graph with the wrong closure added, solved with or without the robust weighting. */
  const wrongCache = new Map();
  function withWrong(wobble, robust) {
    const key = `${wobble}|${robust}`;
    if (!wrongCache.has(key)) {
      const { edges, poses } = odometry(wobble);
      const all = [...edges, loop, wrong];
      const anchor = [{ i: 0, t: 'anchor', z: truth[0], w: 1e6 }];
      if (robust) {
        wrongCache.set(key, solveRobust(poses, all, anchor));
      } else {
        const out = solvePoseGraph(poses, all, anchor, 12);
        wrongCache.set(key, { frames: [poses, ...out.solutions], trust: all.map(() => 1) });
      }
    }
    return wrongCache.get(key);
  }

  return { n, truth, odometry, loop, wrong, solve, frames, withWrong };
}

/**
 * How much to trust an edge that misses by `chi` standard deviations. Cauchy weighting: close to 1
 * for a small miss, then falling towards 0, so one wild edge is all but ignored.
 */
export const robustWeight = (chi, delta = 12) => 1 / (1 + (chi / delta) ** 2);

/** Size of an edge's miss, in standard deviations. */
export function chiOf(poses, e) {
  const r = relativePose(poses[e.i], poses[e.j]);
  const d = [r[0] - e.z[0], r[1] - e.z[1], wrapAngle(r[2] - e.z[2])];
  return Math.sqrt(d.reduce((s, v, k) => s + e.w[k] * v * v, 0));
}

/**
 * Solve a graph that may hold a wrong edge, trusting each edge less the more it disagrees with the
 * rest (iteratively reweighted least squares, so nothing is thrown away until it is clear it is wrong). Returns the frames to play back, and the final trust
 * in each edge.
 */
export function solveRobust(
  initial,
  edges,
  priors,
  { delta = 12, rounds = 8, iterations = 8 } = {},
) {
  let X = initial;
  const frames = [initial];
  let trust = edges.map((e) => robustWeight(chiOf(X, e), delta));
  for (let r = 0; r < rounds; r++) {
    const scaled = edges.map((e, k) => ({ ...e, w: e.w.map((v) => v * trust[k]) }));
    const out = solvePoseGraph(X, scaled, priors, iterations);
    if (!out.solutions.length) break;
    frames.push(...out.solutions);
    X = out.solutions[out.solutions.length - 1];
    trust = edges.map((e) => robustWeight(chiOf(X, e), delta));
  }
  return { frames, trust };
}

let shared;
/** The one scene all the figures on the page draw from. */
export const sharedScene = () => (shared ||= makeScene());
