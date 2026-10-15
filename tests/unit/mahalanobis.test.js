import { describe, expect, it } from 'vitest';
import { distances2D } from '../../src/algos/mahalanobis.js';

describe('distances2D', () => {
  const model = { s1: 4, s2: 1, phi: 0 };

  it('is zero at the centre', () => {
    expect(distances2D(0, 0, model)).toEqual({ mahalanobis: 0, euclidean: 0 });
  });
  it('counts standard deviations along each axis', () => {
    expect(distances2D(4, 0, model).mahalanobis).toBeCloseTo(1);
    expect(distances2D(0, 1, model).mahalanobis).toBeCloseTo(1);
  });
  it('treats the same Euclidean distance differently along and across the data', () => {
    const along = distances2D(3, 0, model);
    const across = distances2D(0, 3, model);
    expect(along.euclidean).toBeCloseTo(across.euclidean);
    expect(across.mahalanobis).toBeGreaterThan(along.mahalanobis * 3);
  });
  it('follows the rotation of the axes', () => {
    const rotated = { s1: 4, s2: 1, phi: Math.PI / 2 };
    expect(distances2D(0, 4, rotated).mahalanobis).toBeCloseTo(1);
    expect(distances2D(1, 0, rotated).mahalanobis).toBeCloseTo(1);
  });
  it('reduces to Euclidean distance when the spread is equal', () => {
    const round = { s1: 1, s2: 1, phi: 0.7 };
    const d = distances2D(3, 4, round);
    expect(d.mahalanobis).toBeCloseTo(5);
    expect(d.euclidean).toBeCloseTo(5);
  });
});
