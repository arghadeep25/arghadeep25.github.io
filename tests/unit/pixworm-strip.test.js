import { describe, expect, it } from 'vitest';
import { trackOffset, pinProgress } from '../../src/pixworm/strip.js';
import { nextIndex } from '../../src/pixworm/hero.js';

describe('trackOffset', () => {
  it('starts at 0 and ends with the strip end at the right edge', () => {
    expect(trackOffset(0, 3000, 1000)).toBeCloseTo(0);
    expect(trackOffset(1, 3000, 1000)).toBe(-2000);
    expect(trackOffset(0.5, 3000, 1000)).toBe(-1000);
  });

  it('does not move when the strip fits', () => {
    expect(trackOffset(1, 800, 1000)).toBeCloseTo(0);
  });

  it('clamps the progress', () => {
    expect(trackOffset(2, 3000, 1000)).toBe(-2000);
    expect(trackOffset(-1, 3000, 1000)).toBeCloseTo(0);
  });
});

describe('pinProgress', () => {
  it('is 0 before the pin starts and 1 at the end', () => {
    expect(pinProgress(100, 3000, 900)).toBe(0);
    expect(pinProgress(0, 3000, 900)).toBe(0);
    expect(pinProgress(-1050, 3000, 900)).toBeCloseTo(0.5);
    expect(pinProgress(-2100, 3000, 900)).toBe(1);
    expect(pinProgress(-5000, 3000, 900)).toBe(1);
  });
});

describe('nextIndex', () => {
  it('loops', () => {
    expect(nextIndex(0, 3)).toBe(1);
    expect(nextIndex(2, 3)).toBe(0);
  });
});
