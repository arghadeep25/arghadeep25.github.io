import { describe, expect, it } from 'vitest';
import { centreDistance, iou, shift } from '../../src/algos/box.js';

const box = (x0, y0, x1, y1) => ({ x0, y0, x1, y1 });

describe('iou', () => {
  it('is 1 for identical boxes', () => {
    expect(iou(box(0, 0, 10, 10), box(0, 0, 10, 10))).toBeCloseTo(1, 4);
  });
  it('is 0 for disjoint boxes', () => {
    expect(iou(box(0, 0, 10, 10), box(20, 20, 30, 30))).toBe(0);
  });
  it('is 1/3 for two boxes overlapping by half', () => {
    expect(iou(box(0, 0, 10, 10), box(5, 0, 15, 10))).toBeCloseTo(1 / 3, 4);
  });
  it('is symmetric', () => {
    const a = box(0, 0, 10, 8);
    const b = box(4, 2, 12, 9);
    expect(iou(a, b)).toBeCloseTo(iou(b, a), 10);
  });
});

describe('centreDistance and shift', () => {
  it('measures the 3-4-5 triangle', () => {
    expect(centreDistance(box(0, 0, 2, 2), box(6, 8, 8, 10))).toBeCloseTo(10);
  });
  it('shifts without mutating', () => {
    const b = box(0, 0, 2, 2);
    expect(shift(b, 3, -1)).toEqual(box(3, -1, 5, 1));
    expect(b).toEqual(box(0, 0, 2, 2));
  });
});
