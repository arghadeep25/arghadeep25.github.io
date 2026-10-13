import { TAU } from '../core/math.js';

/**
 * Outline shapes for the skills icon, in a unit square centred on (0, 0).
 * Each shape is a list of paths; a path has a length and a function from 0..1 to a point.
 * @typedef {{ len: number, at: (u: number) => [number, number] }} Path
 */

const circle = (cx, cy, r) => ({
  len: TAU * r,
  at: (u) => [cx + r * Math.cos(u * TAU), cy + r * Math.sin(u * TAU)],
});

const ellipse = (cx, cy, a, b) => ({
  len: (TAU * (a + b)) / 2,
  at: (u) => [cx + a * Math.cos(u * TAU), cy + b * Math.sin(u * TAU)],
});

const line = (x1, y1, x2, y2) => ({
  len: Math.hypot(x2 - x1, y2 - y1),
  at: (u) => [x1 + (x2 - x1) * u, y1 + (y2 - y1) * u],
});

/** A function graph y = f(x) between x0 and x1. */
function curve(f, x0, x1, steps = 60) {
  const pts = [];
  let total = 0;
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const y = f(x);
    if (i) total += Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1]);
    pts.push([x, y, total]);
  }
  return {
    len: total,
    at: (u) => {
      const d = u * total;
      let i = 1;
      while (i < pts.length - 1 && pts[i][2] < d) i++;
      const a = pts[i - 1];
      const b = pts[i];
      const k = (d - a[2]) / Math.max(1e-6, b[2] - a[2]);
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    },
  };
}

const polygon = (pts) =>
  pts.map((p, i) => line(p[0], p[1], pts[(i + 1) % pts.length][0], pts[(i + 1) % pts.length][1]));

export const SHAPES = {
  /** Perception: an eye, a lens. */
  eye: () => [
    ellipse(0, 0, 0.46, 0.27),
    circle(0, 0, 0.2),
    circle(0, 0, 0.15),
    circle(0, 0, 0.1),
    circle(0, 0, 0.05),
    circle(0.07, -0.07, 0.015),
  ],
  /** Localization and mapping: a crosshair. */
  pin: () => [
    circle(0, 0, 0.36),
    circle(0, 0, 0.22),
    line(0, -0.46, 0, -0.28),
    line(0, 0.28, 0, 0.46),
    line(-0.46, 0, -0.28, 0),
    line(0.28, 0, 0.46, 0),
    circle(0, 0, 0.06),
    circle(0, 0, 0.03),
  ],
  /** Planning and control: a path with a look-ahead point. */
  path: () => {
    const f = (x) => 0.2 * Math.sin(x * 6.9) - 0.02;
    return [
      curve(f, -0.46, 0.46),
      curve((x) => f(x) + 0.02, -0.46, 0.46),
      curve((x) => f(x) - 0.02, -0.46, 0.46),
      circle(0, f(0), 0.08),
      circle(0, f(0), 0.035),
      line(0, f(0), 0.24, f(0.24)),
      circle(0.24, f(0.24), 0.03),
    ];
  },
  /** Software engineering: a cube. */
  cube: () => {
    const R = 0.42;
    const v = (i) => [
      R * Math.cos(Math.PI / 6 + (i * Math.PI) / 3),
      R * Math.sin(Math.PI / 6 + (i * Math.PI) / 3),
    ];
    const h = [0, 1, 2, 3, 4, 5].map(v);
    return [...polygon(h), line(0, 0, ...h[1]), line(0, 0, ...h[3]), line(0, 0, ...h[5])];
  },
  /** Embedded and edge: a chip with pins. */
  chip: () => {
    const s = 0.26;
    const out = [
      ...polygon([
        [-s, -s],
        [s, -s],
        [s, s],
        [-s, s],
      ]),
      ...polygon([
        [-0.14, -0.14],
        [0.14, -0.14],
        [0.14, 0.14],
        [-0.14, 0.14],
      ]),
    ];
    for (let i = 0; i < 5; i++) {
      const p = -0.18 + i * 0.09;
      out.push(
        line(p, -s, p, -s - 0.12),
        line(p, s, p, s + 0.12),
        line(-s, p, -s - 0.12, p),
        line(s, p, s + 0.12, p),
      );
    }
    return out;
  },
  /** Leadership and craft: a small network. */
  net: () => {
    const out = [circle(0, 0, 0.07), circle(0, 0, 0.035)];
    const sat = [];
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * TAU) / 5;
      const p = [0.38 * Math.cos(a), 0.38 * Math.sin(a)];
      sat.push(p);
      out.push(circle(p[0], p[1], 0.06), circle(p[0], p[1], 0.03), line(0, 0, p[0], p[1]));
    }
    sat.forEach((a, i) => out.push(line(a[0], a[1], sat[(i + 1) % 5][0], sat[(i + 1) % 5][1])));
    return out;
  },
};

/**
 * Sample `n` points along a shape's outline, spread in proportion to path length.
 * @param {keyof typeof SHAPES} name
 * @param {number} n
 * @returns {{ x: number, y: number }[]} exactly n points
 */
export function sampleShape(name, n) {
  const make = SHAPES[name];
  if (!make) throw new Error(`Unknown shape: ${name}`);
  const paths = make();
  const total = paths.reduce((s, p) => s + p.len, 0);
  const out = [];
  for (const p of paths) {
    const count = Math.max(2, Math.round((p.len / total) * n));
    for (let i = 0; i < count; i++) {
      const [x, y] = p.at(i / count);
      out.push({ x, y });
    }
  }
  while (out.length > n) out.splice(Math.floor(Math.random() * out.length), 1);
  while (out.length < n) out.push({ ...out[Math.floor(Math.random() * out.length)] });
  return out;
}
