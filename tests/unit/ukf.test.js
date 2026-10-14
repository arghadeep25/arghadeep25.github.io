import { describe, expect, it } from 'vitest';
import { UKF, cholesky, ctrv } from '../../src/algos/ukf.js';
import { mulberry32 } from './helpers.js';
import { gaussian } from '../../src/core/random.js';

/** A target driving a gentle curve, observed with noise. */
function simulate({ steps, dt = 0.1, speed = 8, yawRate = 0.2, noise = 0.3, seed = 3 }) {
  const rnd = mulberry32(seed);
  const g = gaussian(rnd);
  let x = 0;
  let y = 0;
  let yaw = 0.4;
  const out = [];
  for (let i = 0; i < steps; i++) {
    x += speed * Math.cos(yaw) * dt;
    y += speed * Math.sin(yaw) * dt;
    yaw += yawRate * dt;
    out.push({ truth: { x, y, yaw, speed }, z: [x + noise * g(), y + noise * g()] });
  }
  return out;
}

describe('cholesky', () => {
  it('factors a matrix so that L times L-transposed gives it back', () => {
    const A = [
      [4, 2, 0.6],
      [2, 5, 1],
      [0.6, 1, 3],
    ];
    const L = cholesky(A);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        let s = 0;
        for (let k = 0; k < 3; k++) s += L[i][k] * L[j][k];
        expect(s).toBeCloseTo(A[i][j], 9);
      }
  });
});

describe('ctrv', () => {
  it('goes straight when the turn rate is zero', () => {
    const [x, y, v, yaw] = ctrv([0, 0, 10, Math.PI / 2, 0, 0, 0], 2);
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(20, 9);
    expect(v).toBe(10);
    expect(yaw).toBeCloseTo(Math.PI / 2, 9);
  });

  it('follows a circle of radius speed / turn rate', () => {
    const [x, y] = ctrv([0, 0, 4, 0, 1, 0, 0], Math.PI / 2);
    expect(x).toBeCloseTo(4, 6);
    expect(y).toBeCloseTo(4, 6);
  });
});

describe('UKF', () => {
  it('locks on to a moving target and recovers its speed and heading', () => {
    const data = simulate({ steps: 80 });
    const f = new UKF({ x: data[0].z[0], y: data[0].z[1] });
    for (let i = 1; i < data.length; i++) {
      f.predict(0.1);
      f.update(data[i].z);
    }
    const { truth } = data[data.length - 1];
    expect(Math.hypot(f.x[0] - truth.x, f.x[1] - truth.y)).toBeLessThan(0.4);
    expect(Math.abs(f.x[2] - truth.speed)).toBeLessThan(1.2);
    expect(Math.abs(f.x[3] - truth.yaw)).toBeLessThan(0.25);
  });

  it('beats the raw measurements on position error', () => {
    const data = simulate({ steps: 120, noise: 0.5 });
    const f = new UKF({ x: data[0].z[0], y: data[0].z[1] }, { meas: 0.5 });
    let raw = 0;
    let filt = 0;
    for (let i = 1; i < data.length; i++) {
      f.predict(0.1);
      f.update(data[i].z);
      if (i < 40) continue;
      const t = data[i].truth;
      raw += Math.hypot(data[i].z[0] - t.x, data[i].z[1] - t.y);
      filt += Math.hypot(f.x[0] - t.x, f.x[1] - t.y);
    }
    expect(filt).toBeLessThan(raw * 0.8);
  });

  it('grows its uncertainty without measurements and shrinks it with one', () => {
    const f = new UKF({ x: 0, y: 0, speed: 5 });
    f.predict(0.1);
    f.update([0.5, 0.1]);
    const settled = f.ellipse().a;
    for (let i = 0; i < 10; i++) f.predict(0.1);
    const blind = f.ellipse().a;
    expect(blind).toBeGreaterThan(settled);
    f.update(f.position);
    expect(f.ellipse().a).toBeLessThan(blind);
  });

  it('gives a small distance to a plausible detection and a large one to a far detection', () => {
    const data = simulate({ steps: 40 });
    const f = new UKF({ x: data[0].z[0], y: data[0].z[1] });
    for (let i = 1; i < 39; i++) {
      f.predict(0.1);
      f.update(data[i].z);
    }
    f.predict(0.1);
    expect(f.distance2(data[39].z)).toBeLessThan(9);
    expect(f.distance2([data[39].z[0] + 15, data[39].z[1] - 15])).toBeGreaterThan(100);
  });

  it('is statistically consistent: the mean normalised innovation is near 2', () => {
    const data = simulate({ steps: 300, noise: 0.3, seed: 11 });
    const f = new UKF({ x: data[0].z[0], y: data[0].z[1] });
    let sum = 0;
    let n = 0;
    for (let i = 1; i < data.length; i++) {
      f.predict(0.1);
      f.update(data[i].z);
      if (i > 30) {
        sum += f.nis;
        n++;
      }
    }
    const mean = sum / n;
    expect(mean).toBeGreaterThan(0.7);
    expect(mean).toBeLessThan(4);
  });

  it('keeps the heading wrapped to one turn', () => {
    const f = new UKF({ x: 0, y: 0, speed: 6, heading: Math.PI - 0.05 });
    for (let i = 0; i < 30; i++) {
      f.predict(0.1);
      f.update([f.x[0] - 0.6, f.x[1] - 0.05]);
      expect(Math.abs(f.x[3])).toBeLessThanOrEqual(Math.PI + 1e-9);
    }
  });

  it('exposes position and velocity', () => {
    const f = new UKF({ x: 3, y: -2, speed: 10, heading: Math.PI / 2 });
    expect(f.position).toEqual([3, -2]);
    expect(f.velocity[0]).toBeCloseTo(0, 9);
    expect(f.velocity[1]).toBeCloseTo(10, 9);
  });
});
