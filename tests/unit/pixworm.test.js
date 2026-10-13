import { describe, expect, it } from 'vitest';
import { coverCrop } from '../../src/sections/pixworm.js';

describe('coverCrop', () => {
  it('crops the sides of a wide image, centred', () => {
    const [sx, sy, sw, sh] = coverCrop(1000, 500, 0.8, 0.5);
    expect(sh).toBe(500);
    expect(sw).toBeCloseTo(400);
    expect(sx).toBeCloseTo(300);
    expect(sy).toBe(0);
  });
  it('crops the top and bottom of a tall image, using the focus', () => {
    const top = coverCrop(400, 800, 0.8, 0);
    const bottom = coverCrop(400, 800, 0.8, 1);
    expect(top[2]).toBe(400);
    expect(top[3]).toBeCloseTo(500);
    expect(top[1]).toBe(0);
    expect(bottom[1]).toBeCloseTo(300);
  });
  it('always returns a window with the requested aspect, inside the image', () => {
    for (const [w, h] of [
      [411, 793],
      [1920, 1080],
      [500, 500],
    ]) {
      const [sx, sy, sw, sh] = coverCrop(w, h, 0.8, 0.6);
      expect(sw / sh).toBeCloseTo(0.8, 5);
      expect(sx).toBeGreaterThanOrEqual(0);
      expect(sy).toBeGreaterThanOrEqual(0);
      expect(sx + sw).toBeLessThanOrEqual(w + 1e-6);
      expect(sy + sh).toBeLessThanOrEqual(h + 1e-6);
    }
  });
});
