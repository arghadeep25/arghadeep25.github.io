import { describe, expect, it } from 'vitest';
import { SHAPES, sampleShape } from '../../src/sections/skills-shapes.js';

describe('skills shapes', () => {
  it.each(Object.keys(SHAPES))(
    '%s returns exactly n finite points inside the unit square',
    (name) => {
      for (const n of [200, 520, 760]) {
        const pts = sampleShape(name, n);
        expect(pts).toHaveLength(n);
        for (const p of pts) {
          expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
          expect(Math.abs(p.x)).toBeLessThanOrEqual(0.6);
          expect(Math.abs(p.y)).toBeLessThanOrEqual(0.6);
        }
      }
    },
  );

  it('puts the eye pupil rings at the centre and the crosshair ticks at the edge', () => {
    const eye = sampleShape('eye', 760);
    expect(eye.some((p) => Math.hypot(p.x, p.y) < 0.06)).toBe(true);
    const pin = sampleShape('pin', 760);
    expect(Math.max(...pin.map((p) => Math.hypot(p.x, p.y)))).toBeGreaterThan(0.44);
  });

  it('rejects an unknown shape', () => {
    expect(() => sampleShape('nope', 10)).toThrow(/Unknown shape/);
  });
});
