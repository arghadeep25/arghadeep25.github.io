import { describe, expect, it } from 'vitest';
import { gaussian, mulberry32 } from '../../src/core/random.js';

describe('mulberry32', () => {
  it('repeats for the same seed and differs for another', () => {
    const a = mulberry32(5);
    const b = mulberry32(5);
    const c = mulberry32(6);
    const xs = [a(), a(), a()];
    expect(xs).toEqual([b(), b(), b()]);
    expect(xs).not.toEqual([c(), c(), c()]);
  });
  it('stays inside [0, 1)', () => {
    const r = mulberry32(1);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('gaussian', () => {
  it('has mean near 0 and standard deviation near 1', () => {
    const g = gaussian(mulberry32(42));
    const xs = Array.from({ length: 20000 }, g);
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(Math.abs(sd - 1)).toBeLessThan(0.03);
  });
});
