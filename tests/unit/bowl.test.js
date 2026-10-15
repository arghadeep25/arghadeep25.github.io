import { describe, expect, it } from 'vitest';
import { stepsFrom } from '../../src/blog/figs/bowl.js';

describe('Gauss-Newton steps on one pin', () => {
  it('walks down to the square root of 2', () => {
    const xs = stepsFrom(2.9, 6);
    expect(xs[xs.length - 1]).toBeCloseTo(Math.SQRT2, 6);
  });
  it('gets closer at every step', () => {
    const xs = stepsFrom(2.9);
    for (let i = 1; i < xs.length; i++) {
      expect(Math.abs(xs[i] - Math.SQRT2)).toBeLessThan(Math.abs(xs[i - 1] - Math.SQRT2));
    }
  });
});
