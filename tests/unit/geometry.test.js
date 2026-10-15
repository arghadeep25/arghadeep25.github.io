import { describe, expect, it } from 'vitest';
import { relativePose, segmentHitsBox, wrapAngle } from '../../src/algos/geometry.js';

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

describe('segmentHitsBox', () => {
  it('hits when the segment passes through the box', () => {
    expect(segmentHitsBox(-5, 0, 5, 0, 0, 0, 0, 2, 2)).toBe(true);
  });
  it('misses when the segment passes beside it', () => {
    expect(segmentHitsBox(-5, 3, 5, 3, 0, 0, 0, 2, 2)).toBe(false);
  });
  it('misses when the segment stops short', () => {
    expect(segmentHitsBox(-5, 0, -2, 0, 0, 0, 0, 2, 2)).toBe(false);
  });
  it('respects the rotation of the box', () => {
    // a long thin box turned to point up: a horizontal segment at y=3 hits it, one at x=3 does not
    expect(segmentHitsBox(-5, 3, 5, 3, 0, 0, Math.PI / 2, 8, 1)).toBe(true);
    expect(segmentHitsBox(3, -5, 3, 5, 0, 0, Math.PI / 2, 8, 1)).toBe(false);
  });
  it('hits a segment that starts inside the box', () => {
    expect(segmentHitsBox(0, 0, 9, 9, 0, 0, 0.3, 4, 4)).toBe(true);
  });
});

describe('composePose', () => {
  it('undoes relativePose', async () => {
    const { composePose, relativePose } = await import('../../src/algos/geometry.js');
    const a = [3, -2, 0.7];
    const b = [5, 1, -1.9];
    const back = composePose(a, relativePose(a, b));
    expect(back[0]).toBeCloseTo(b[0]);
    expect(back[1]).toBeCloseTo(b[1]);
    expect(back[2]).toBeCloseTo(b[2]);
  });
  it('drives forward along the heading', async () => {
    const { composePose } = await import('../../src/algos/geometry.js');
    const p = composePose([0, 0, Math.PI / 2], [2, 0, 0]);
    expect(p[0]).toBeCloseTo(0);
    expect(p[1]).toBeCloseTo(2);
  });
});
