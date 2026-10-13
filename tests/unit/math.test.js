import { describe, expect, it } from 'vitest';
import { TAU, clamp, mix, smoothstep } from '../../src/core/math.js';

describe('math helpers', () => {
  it('clamps', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.4, 0, 1)).toBe(0.4);
  });
  it('mixes', () => {
    expect(mix(10, 20, 0)).toBe(10);
    expect(mix(10, 20, 1)).toBe(20);
    expect(mix(10, 20, 0.25)).toBe(12.5);
  });
  it('eases with smoothstep', () => {
    expect(smoothstep(-1)).toBe(0);
    expect(smoothstep(2)).toBe(1);
    expect(smoothstep(0.5)).toBe(0.5);
    expect(smoothstep(0.25)).toBeLessThan(0.25);
  });
  it('has TAU as a full turn', () => {
    expect(TAU).toBeCloseTo(6.283185, 5);
  });
});
