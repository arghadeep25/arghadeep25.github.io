import { describe, expect, it } from 'vitest';
import { advance, fmtKnob } from '../../src/blog/figure.js';
import { alpha } from '../../src/blog/palette.js';

describe('advance', () => {
  it('moves the clock on', () => {
    expect(advance(1, 0.5, 10, true)).toEqual({ t: 1.5, done: false });
  });
  it('wraps when it loops', () => {
    const s = advance(9.8, 0.5, 10, true);
    expect(s.done).toBe(false);
    expect(s.t).toBeCloseTo(0.3);
  });
  it('stops at the end when it does not loop', () => {
    expect(advance(9.8, 0.5, 10, false)).toEqual({ t: 10, done: true });
  });
});

describe('fmtKnob', () => {
  it('rounds whole steps', () => expect(fmtKnob(3.2, 1)).toBe('3'));
  it('keeps one decimal for 0.1 steps', () => expect(fmtKnob(0.46, 0.1)).toBe('0.5'));
  it('keeps two decimals for finer steps', () => expect(fmtKnob(0.456, 0.01)).toBe('0.46'));
});

describe('alpha', () => {
  it('turns a hex colour into rgba', () => {
    expect(alpha('#8b7cff', 0.5)).toBe('rgba(139,124,255,0.5)');
  });
});
