import { describe, expect, it } from 'vitest';
import { relativePose, wrapAngle } from '../../src/algos/geometry.js';

describe('wrapAngle', () => {
  it('keeps small angles unchanged', () => {
    expect(wrapAngle(0.5)).toBeCloseTo(0.5);
  });
  it('wraps angles beyond a half turn', () => {
    expect(wrapAngle(Math.PI * 1.5)).toBeCloseTo(-Math.PI / 2);
    expect(wrapAngle(-Math.PI * 1.5)).toBeCloseTo(Math.PI / 2);
    expect(wrapAngle(Math.PI * 4)).toBeCloseTo(0);
  });
});

describe('relativePose', () => {
  it('is the offset when headings are zero', () => {
    expect(relativePose([1, 2, 0], [4, 6, 0])).toEqual([3, 4, 0]);
  });
  it('rotates the offset into the first pose frame', () => {
    const r = relativePose([0, 0, Math.PI / 2], [0, 1, Math.PI / 2]);
    expect(r[0]).toBeCloseTo(1);
    expect(r[1]).toBeCloseTo(0);
    expect(r[2]).toBeCloseTo(0);
  });
  it('wraps the heading difference', () => {
    const r = relativePose([0, 0, Math.PI - 0.1], [0, 0, -Math.PI + 0.1]);
    expect(r[2]).toBeCloseTo(0.2);
  });
});
