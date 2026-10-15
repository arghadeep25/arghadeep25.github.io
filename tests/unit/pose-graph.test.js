import { describe, expect, it } from 'vitest';
import { relativePose, wrapAngle } from '../../src/algos/geometry.js';
import { graphCost, poseCovariances, solvePoseGraph } from '../../src/algos/pose-graph.js';
import { mulberry32 } from './helpers.js';

/** Compose pose `a` with a relative motion `d` expressed in a's frame. */
const compose = (a, d) => {
  const c = Math.cos(a[2]);
  const s = Math.sin(a[2]);
  return [a[0] + c * d[0] - s * d[1], a[1] + s * d[0] + c * d[1], wrapAngle(a[2] + d[2])];
};

/** A closed loop of n poses around a circle, heading along the tangent. */
function circle(n, radius) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [radius * Math.cos(a), radius * Math.sin(a), wrapAngle(a + Math.PI / 2)];
  });
}

const meanError = (est, truth) =>
  est.reduce((s, p, i) => s + Math.hypot(p[0] - truth[i][0], p[1] - truth[i][1]), 0) / est.length;

function scenario(seed) {
  const rnd = mulberry32(seed);
  const truth = circle(40, 20);
  const edges = [];
  const odom = [truth[0].slice()];
  for (let i = 0; i < truth.length - 1; i++) {
    const z = relativePose(truth[i], truth[i + 1]);
    // each odometry step is slightly wrong: a small scale error and heading bias
    const noisy = [
      z[0] * 1.02 + (rnd() - 0.5) * 0.05,
      z[1] + (rnd() - 0.5) * 0.05,
      z[2] + 0.012 + (rnd() - 0.5) * 0.01,
    ];
    odom.push(compose(odom[i], noisy));
    edges.push({ i, j: i + 1, z: noisy, w: [1 / 0.05 ** 2, 1 / 0.05 ** 2, 1 / 0.01 ** 2] });
  }
  // loop closure: the last pose is seen to be next to the first one
  edges.push({
    i: truth.length - 1,
    j: 0,
    z: relativePose(truth[truth.length - 1], truth[0]),
    w: [1e3, 1e3, 1e5],
  });
  const priors = [{ i: 0, t: 'anchor', z: truth[0], w: 1e6 }];
  return { truth, odom, edges, priors };
}

describe('solvePoseGraph', () => {
  it('lowers the cost and never raises it', () => {
    const { odom, edges, priors } = scenario(1);
    const { cost } = solvePoseGraph(odom, edges, priors, 12);
    expect(cost[cost.length - 1]).toBeLessThan(cost[0] / 10);
    for (let i = 1; i < cost.length; i++) expect(cost[i]).toBeLessThanOrEqual(cost[i - 1] * 1.0001);
  });

  it('pulls a drifted trajectory back onto the truth after a loop closure', () => {
    const { truth, odom, edges, priors } = scenario(2);
    const before = meanError(odom, truth);
    const { solutions } = solvePoseGraph(odom, edges, priors, 15);
    const after = meanError(solutions[solutions.length - 1], truth);
    expect(before).toBeGreaterThan(1.5);
    expect(after).toBeLessThan(before / 3);
  });

  it('leaves a perfect graph untouched', () => {
    const truth = circle(12, 10);
    const edges = truth
      .slice(0, -1)
      .map((p, i) => ({ i, j: i + 1, z: relativePose(p, truth[i + 1]), w: [100, 100, 1000] }));
    const { solutions, cost } = solvePoseGraph(
      truth,
      edges,
      [{ i: 0, t: 'anchor', z: truth[0], w: 1e6 }],
      5,
    );
    expect(cost[0]).toBeCloseTo(0, 8);
    expect(meanError(solutions[solutions.length - 1], truth)).toBeLessThan(1e-4);
  });

  it('uses gps and heading priors', () => {
    const poses = [
      [0, 0, 0],
      [1, 0, 0],
    ];
    const edges = [{ i: 0, j: 1, z: [1, 0, 0], w: [10, 10, 10] }];
    const priors = [
      { i: 0, t: 'gps', z: [2, 3], w: 100 },
      { i: 0, t: 'imu', z: 0.2, w: 100 },
    ];
    const { solutions } = solvePoseGraph(poses, edges, priors, 20);
    const last = solutions[solutions.length - 1];
    expect(last[0][0]).toBeCloseTo(2, 1);
    expect(last[0][1]).toBeCloseTo(3, 1);
    expect(last[0][2]).toBeCloseTo(0.2, 1);
  });

  it('reports the same cost as graphCost', () => {
    const { odom, edges, priors } = scenario(3);
    const { cost } = solvePoseGraph(odom, edges, priors, 1);
    expect(cost[0]).toBeCloseTo(graphCost(odom, edges, priors), 6);
  });
});

describe('poseCovariances', () => {
  const poses = circle(20, 10);
  const edges = [];
  for (let i = 0; i < poses.length - 1; i++) {
    edges.push({ i, j: i + 1, z: relativePose(poses[i], poses[i + 1]), w: [400, 400, 1600] });
  }
  const anchor = [{ i: 0, t: 'anchor', z: poses[0], w: 1e6 }];

  it('is sure about the pinned pin and less sure further along', () => {
    const c = poseCovariances(poses, edges, anchor);
    expect(c[0][0] + c[0][2]).toBeLessThan(1e-5);
    expect(c[19][0] + c[19][2]).toBeGreaterThan(c[5][0] + c[5][2]);
  });

  it('is surer everywhere once the loop is closed', () => {
    const loop = { i: 19, j: 0, z: relativePose(poses[19], poses[0]), w: [400, 400, 1600] };
    const open = poseCovariances(poses, edges, anchor);
    const closed = poseCovariances(poses, [...edges, loop], anchor);
    expect(closed[19][0] + closed[19][2]).toBeLessThan(open[19][0] + open[19][2]);
    expect(closed[10][0] + closed[10][2]).toBeLessThan(open[10][0] + open[10][2]);
  });
});
