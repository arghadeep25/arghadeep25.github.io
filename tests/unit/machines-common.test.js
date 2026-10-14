import { describe, expect, it } from 'vitest';
import {
  approach,
  bump,
  lidarScan,
  noisy,
  rayBox,
  rayCircle,
} from '../../src/sections/machines/common.js';
import { mulberry32 } from './helpers.js';

describe('approach', () => {
  it('moves towards the target without overshooting', () => {
    expect(approach(0, 10, 2, 1)).toBe(2);
    expect(approach(9, 10, 2, 1)).toBe(10);
    expect(approach(10, 0, 4, 1)).toBe(6);
    expect(approach(1, 0, 4, 1)).toBe(0);
  });
});

describe('bump', () => {
  it('peaks at the centre and is zero outside the width', () => {
    expect(bump(5, 5, 3)).toBe(1);
    expect(bump(8, 5, 3)).toBe(0);
    expect(bump(1, 5, 3)).toBe(0);
    expect(bump(6.5, 5, 3)).toBeCloseTo(0.5, 9);
  });
});

describe('rays', () => {
  const box = { x0: 4, y0: -1, x1: 6, y1: 1 };
  it('hits the near face of a box', () => {
    expect(rayBox(0, 0, 1, 0, box)).toBeCloseTo(4, 9);
  });
  it('misses a box that is off to the side or behind', () => {
    expect(rayBox(0, 3, 1, 0, box)).toBe(Infinity);
    expect(rayBox(0, 0, -1, 0, box)).toBe(Infinity);
  });
  it('hits a circle at its near edge', () => {
    expect(rayCircle(0, 0, 1, 0, { x: 5, y: 0, r: 1 })).toBeCloseTo(4, 9);
    expect(rayCircle(0, 0, 0, 1, { x: 5, y: 0, r: 1 })).toBe(Infinity);
  });
});

describe('lidarScan', () => {
  it('returns only the rays that hit something, at the right distance', () => {
    const hits = lidarScan(0, 0, 4, 10, [{ x0: 3, y0: -1, x1: 4, y1: 1 }], []);
    expect(hits).toHaveLength(1);
    expect(hits[0].d).toBeCloseTo(3, 9);
    expect(hits[0].what).toBe('box');
  });
  it('ignores things beyond its range', () => {
    expect(lidarScan(0, 0, 4, 2, [{ x0: 3, y0: -1, x1: 4, y1: 1 }], [])).toHaveLength(0);
  });
  it('sees a circle', () => {
    const hits = lidarScan(0, 0, 8, 10, [], [{ x: 0, y: 5, r: 0.5 }]);
    expect(hits.some((h) => h.what === 'circle' && Math.abs(h.d - 4.5) < 1e-6)).toBe(true);
  });
});

describe('noisy', () => {
  it('stays near the point and is repeatable for a seed', () => {
    const a = noisy({ x: 3, y: 4 }, 10, mulberry32(1));
    const b = noisy({ x: 3, y: 4 }, 10, mulberry32(1));
    expect(a).toEqual(b);
    expect(Math.hypot(a.x - 3, a.y - 4)).toBeLessThan(1.5);
  });
});
