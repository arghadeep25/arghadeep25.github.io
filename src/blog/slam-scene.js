import { composePose, relativePose } from '../algos/geometry.js';
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

  return { n, truth, odometry, loop, solve };
}

let shared;
/** The one scene all the figures on the page draw from. */
export const sharedScene = () => (shared ||= makeScene());
