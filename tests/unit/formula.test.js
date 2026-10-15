import { describe, expect, it } from 'vitest';
import { arrowFrom, nextIndex, ringFor } from '../../src/blog/formula.js';

describe('nextIndex', () => {
  it('steps on and wraps', () => {
    expect(nextIndex(0, 3)).toBe(1);
    expect(nextIndex(2, 3)).toBe(0);
  });
});

describe('ringFor', () => {
  it('goes round the box with room to spare', () => {
    const r = ringFor({ x: 10, y: 20, w: 40, h: 30 }, 7);
    expect(r.cx).toBe(30);
    expect(r.cy).toBe(35);
    expect(r.rx).toBeGreaterThan(20);
    expect(r.ry).toBeGreaterThan(15);
  });
});

describe('arrowFrom', () => {
  const ring = { cx: 100, cy: 50, rx: 30, ry: 20 };
  it('starts at the bottom of the ring and ends on the note', () => {
    const a = arrowFrom(ring, { x: 140, y: 150 });
    expect(a.d.startsWith('M100.0 70.0')).toBe(true);
    expect(a.d.endsWith('140.0 150.0')).toBe(true);
    expect(a.x).toBe(140);
    expect(a.y).toBe(150);
  });
  it('points downwards when the note is below', () => {
    const a = arrowFrom(ring, { x: 100, y: 150 });
    expect(Math.sin(a.angle)).toBeGreaterThan(0.9);
  });
});
