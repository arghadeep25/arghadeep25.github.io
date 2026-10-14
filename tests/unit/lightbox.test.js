import { describe, expect, it } from 'vitest';
import { parseHash, swipeDirection, wrap } from '../../src/pixworm/lightbox.js';

describe('wrap', () => {
  it('wraps both ways', () => {
    expect(wrap(5, 5)).toBe(0);
    expect(wrap(-1, 5)).toBe(4);
    expect(wrap(2, 5)).toBe(2);
    expect(wrap(-6, 5)).toBe(4);
  });
});

describe('parseHash', () => {
  it('reads a 1 based photo number', () => {
    expect(parseHash('#p1', 10)).toBe(0);
    expect(parseHash('#p10', 10)).toBe(9);
  });

  it('ignores anything else', () => {
    expect(parseHash('', 10)).toBe(-1);
    expect(parseHash('#p0', 10)).toBe(-1);
    expect(parseHash('#p11', 10)).toBe(-1);
    expect(parseHash('#about', 10)).toBe(-1);
    expect(parseHash('#p3x', 10)).toBe(-1);
  });
});

describe('swipeDirection', () => {
  it('maps a left swipe to next and a right swipe to previous', () => {
    expect(swipeDirection(-120, 5)).toBe(1);
    expect(swipeDirection(120, 5)).toBe(-1);
  });

  it('ignores short or mostly vertical moves', () => {
    expect(swipeDirection(30, 0)).toBe(0);
    expect(swipeDirection(80, 90)).toBe(0);
  });
});
