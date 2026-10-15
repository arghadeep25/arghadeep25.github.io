import { describe, expect, it } from 'vitest';
import { lapPoint, makeScene, meanError } from '../../src/blog/slam-scene.js';

describe('lap', () => {
  it('is a closed curve', () => {
    const a = lapPoint(0);
    const b = lapPoint(1);
    expect(b[0]).toBeCloseTo(a[0]);
    expect(b[1]).toBeCloseTo(a[1]);
  });
});

describe('scene', () => {
  const s = makeScene();
  it('has one pose per step and one odometry edge between neighbours', () => {
    const { edges, poses } = s.odometry(0.5);
    expect(poses).toHaveLength(s.n);
    expect(edges).toHaveLength(s.n - 1);
    expect(edges.every((e) => e.j === e.i + 1)).toBe(true);
  });
  it('is exact with no wobble', () => {
    expect(meanError(s.odometry(0).poses, s.truth)).toBeLessThan(1e-9);
  });
  it('drifts more the rougher the odometry', () => {
    const calm = meanError(s.odometry(0.2).poses, s.truth);
    const rough = meanError(s.odometry(1).poses, s.truth);
    expect(rough).toBeGreaterThan(calm);
    expect(rough).toBeGreaterThan(0.5);
  });
  it('is the same scene every time', () => {
    const a = makeScene().odometry(1).poses[10];
    expect(a).toEqual(makeScene().odometry(1).poses[10]);
  });
  it('sees the start again from the last pose', () => {
    expect(s.loop.i).toBe(s.n - 1);
    expect(s.loop.j).toBe(0);
    expect(Math.hypot(s.loop.z[0], s.loop.z[1])).toBeLessThan(3);
  });
  it('is pulled into shape by the loop closure', () => {
    const before = meanError(s.odometry(1).poses, s.truth);
    const out = s.solve(1);
    const after = meanError(out.solutions[out.solutions.length - 1], s.truth);
    expect(after).toBeLessThan(before * 0.5);
    expect(out.cost[out.cost.length - 1]).toBeLessThan(out.cost[0]);
  });
});
