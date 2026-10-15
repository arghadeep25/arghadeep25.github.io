import { describe, expect, it } from 'vitest';
import { comp, gauss, hash, relp, wrapA } from '../../src/demos/common.js';

describe('demo helpers', () => {
  it('hash is repeatable and in [0, 1)', () => {
    expect(hash(3)).toBe(hash(3));
    expect(hash(3)).not.toBe(hash(4));
    for (let i = 0; i < 500; i++) {
      const h = hash(i);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });

  it('gauss returns finite values with a sensible spread', () => {
    const xs = Array.from({ length: 4000 }, gauss);
    expect(xs.every(Number.isFinite)).toBe(true);
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(Math.abs(mean)).toBeLessThan(0.1);
  });

  it('comp and relp are inverses', () => {
    const a = [3, -2, 0.8];
    const motion = [1.5, 0.4, -0.3];
    const b = comp(a, motion);
    const back = relp(a, b);
    motion.forEach((v, i) => expect(back[i]).toBeCloseTo(v, 9));
  });

  it('wrapA wraps to the half turn', () => {
    expect(wrapA(Math.PI * 3)).toBeCloseTo(Math.PI, 9);
  });
});
