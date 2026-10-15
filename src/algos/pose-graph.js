import { choleskyInverse, choleskySolve } from './cholesky.js';
import { relativePose, wrapAngle } from './geometry.js';

/**
 * Planar pose-graph optimiser (Levenberg-Marquardt, dense, numeric Jacobians).
 *
 * Poses are [x, y, heading]. Constraints:
 *  - edge:  relative-pose measurement between poses i and j, z = [dx, dy, dtheta] in i's frame,
 *           w = [wx, wy, wtheta] information (1 / sigma^2) per component
 *  - prior: absolute measurement on one pose, t = 'gps' (z = [x, y]), 'imu' (z = heading)
 *           or 'anchor' (z = [x, y, heading]), w = information
 *
 * @typedef {{ i: number, j: number, z: number[], w: number[] }} Edge
 * @typedef {{ i: number, t: 'gps' | 'imu' | 'anchor', z: number | number[], w: number }} Prior
 */

const eps = 1e-6;

function edgeResidual(pi, pj, z) {
  const r = relativePose(pi, pj);
  return [r[0] - z[0], r[1] - z[1], wrapAngle(r[2] - z[2])];
}

/** Weighted sum of squared residuals for a set of poses. */
export function graphCost(poses, edges, priors) {
  let c = 0;
  for (const e of edges) {
    const r = edgeResidual(poses[e.i], poses[e.j], e.z);
    for (let k = 0; k < 3; k++) c += e.w[k] * r[k] * r[k];
  }
  for (const p of priors) {
    const x = poses[p.i];
    if (p.t === 'gps') c += p.w * ((x[0] - p.z[0]) ** 2 + (x[1] - p.z[1]) ** 2);
    else if (p.t === 'imu') c += p.w * wrapAngle(x[2] - p.z) ** 2;
    else c += p.w * ((x[0] - p.z[0]) ** 2 + (x[1] - p.z[1]) ** 2 + wrapAngle(x[2] - p.z[2]) ** 2);
  }
  return c;
}

/**
 * The Gauss-Newton system around a set of poses: H = sum of J' W J and g = sum of J' W r over every
 * edge and prior, with numeric Jacobians. H is the information matrix of the graph.
 * @returns {{ H: Float64Array, g: Float64Array, dim: number }}
 */
export function linearize(X, edges, priors) {
  const dim = 3 * X.length;
  const H = new Float64Array(dim * dim);
  const g = new Float64Array(dim);

  for (const e of edges) {
    const pi = X[e.i];
    const pj = X[e.j];
    const r0 = edgeResidual(pi, pj, e.z);
    const J = [[], [], []];
    for (let a = 0; a < 6; a++) {
      const qi = pi.slice();
      const qj = pj.slice();
      if (a < 3) qi[a] += eps;
      else qj[a - 3] += eps;
      const r1 = edgeResidual(qi, qj, e.z);
      for (let k = 0; k < 3; k++) J[k][a] = (r1[k] - r0[k]) / eps;
    }
    const idx = (a) => (a < 3 ? 3 * e.i + a : 3 * e.j + a - 3);
    for (let a = 0; a < 6; a++) {
      let gb = 0;
      for (let k = 0; k < 3; k++) gb += e.w[k] * J[k][a] * r0[k];
      g[idx(a)] += gb;
      for (let c = 0; c < 6; c++) {
        let s = 0;
        for (let k = 0; k < 3; k++) s += e.w[k] * J[k][a] * J[k][c];
        H[idx(a) * dim + idx(c)] += s;
      }
    }
  }

  for (const p of priors) {
    const x = X[p.i];
    const o = 3 * p.i;
    if (p.t === 'gps') {
      H[o * dim + o] += p.w;
      H[(o + 1) * dim + o + 1] += p.w;
      g[o] += p.w * (x[0] - p.z[0]);
      g[o + 1] += p.w * (x[1] - p.z[1]);
    } else if (p.t === 'imu') {
      H[(o + 2) * dim + o + 2] += p.w;
      g[o + 2] += p.w * wrapAngle(x[2] - p.z);
    } else {
      for (let k = 0; k < 3; k++) {
        H[(o + k) * dim + o + k] += p.w;
        g[o + k] += p.w * (k < 2 ? x[k] - p.z[k] : wrapAngle(x[2] - p.z[2]));
      }
    }
  }
  return { H, g, dim };
}

/**
 * Optimise a pose graph.
 * @param {number[][]} initial starting poses
 * @param {Edge[]} edges
 * @param {Prior[]} priors
 * @param {number} [iterations]
 * @returns {{ solutions: number[][][], cost: number[] }} the poses after each iteration, and the
 *   cost before the first iteration followed by the cost after each one
 */
export function solvePoseGraph(initial, edges, priors, iterations = 10) {
  const n = initial.length;
  const dim = 3 * n;
  let X = initial.map((p) => p.slice());
  const solutions = [];
  const cost = [graphCost(X, edges, priors)];
  let lambda = 0.6;
  for (let iter = 0; iter < iterations; iter++) {
    const { H, g } = linearize(X, edges, priors);

    for (let i = 0; i < dim; i++) {
      H[i * dim + i] += lambda * (H[i * dim + i] + 1e-6);
      g[i] = -g[i];
    }
    const d = choleskySolve(H, g, dim);

    let largest = 0;
    X = X.map((x, i) => {
      largest = Math.max(largest, Math.abs(d[3 * i]), Math.abs(d[3 * i + 1]));
      return [x[0] + d[3 * i], x[1] + d[3 * i + 1], x[2] + d[3 * i + 2]];
    });
    solutions.push(X.map((x) => x.slice()));
    cost.push(graphCost(X, edges, priors));
    lambda *= 0.45;
    if (largest < 2e-3) break;
  }
  return { solutions, cost };
}

/**
 * How unsure each pin is: the covariance of its position, from the inverse of the information
 * matrix. Returns [[xx, xy, yy, tt], ...] per pose, where tt is the variance of the heading.
 */
export function poseCovariances(poses, edges, priors) {
  const { H, dim } = linearize(poses, edges, priors);
  for (let i = 0; i < dim; i++) H[i * dim + i] += 1e-9;
  const inv = choleskyInverse(H, dim);
  return poses.map((_, i) => {
    const o = 3 * i;
    return [
      inv[o * dim + o],
      inv[o * dim + o + 1],
      inv[(o + 1) * dim + o + 1],
      inv[(o + 2) * dim + o + 2],
    ];
  });
}
