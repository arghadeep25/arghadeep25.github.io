import { describe, expect, it } from 'vitest';
import { buildKdTree, nearest } from '../../src/algos/kdtree.js';
import { mulberry32 } from './helpers.js';

const key = (p) => p.key;
const dist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

function randomPoints(n, dims, rnd) {
  return Array.from({ length: n }, (_, id) => ({
    id,
    key: Array.from({ length: dims }, () => rnd() * 100),
  }));
}

describe('k-d tree', () => {
  it('returns nothing for an empty tree', () => {
    expect(nearest(buildKdTree([], key), [0, 0], 3)).toEqual([]);
  });

  it('finds the single nearest point', () => {
    const pts = [{ key: [0, 0] }, { key: [10, 10] }, { key: [4, 5] }];
    const [hit] = nearest(buildKdTree(pts, key), [5, 5]);
    expect(hit.item).toBe(pts[2]);
    expect(hit.distance).toBeCloseTo(1);
  });

  it.each([2, 3, 6])('matches brute force for k nearest in %i dimensions', (dims) => {
    const rnd = mulberry32(dims * 7);
    const pts = randomPoints(300, dims, rnd);
    const tree = buildKdTree(pts, key);
    for (let q = 0; q < 25; q++) {
      const query = Array.from({ length: dims }, () => rnd() * 100);
      const k = 5;
      const fast = nearest(tree, query, k).map((h) => h.item.id);
      const slow = [...pts]
        .sort((a, b) => dist(a.key, query) - dist(b.key, query))
        .slice(0, k)
        .map((p) => p.id);
      expect(fast).toEqual(slow);
    }
  });

  it('returns results closest first', () => {
    const rnd = mulberry32(3);
    const tree = buildKdTree(randomPoints(100, 2, rnd), key);
    const d = nearest(tree, [50, 50], 8).map((h) => h.distance);
    expect(d).toEqual([...d].sort((a, b) => a - b));
  });
});
