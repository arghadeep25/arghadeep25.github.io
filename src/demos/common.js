import './gate.js';
import { TAU, clamp, mix } from '../core/math.js';
import { relativePose, wrapAngle } from '../algos/geometry.js';

/** Small helpers shared by the project demos. */
export { TAU, clamp };
export const lerp = mix;
export const wrapA = wrapAngle;
export const relp = relativePose;

export const FONT = 'Montserrat,-apple-system,"SF Pro Display",system-ui,sans-serif';

/** getElementById shorthand. */
export const $ = (id) => document.getElementById(id);

/** Deterministic pseudo-random number in [0, 1) from one number. */
export const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Standard-normal sample from Math.random (Box-Muller). */
export const gauss = () => {
  let u = 0;
  while (!u) u = Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
};

/** Compose pose `a` with the relative motion `b` expressed in a's frame. Poses are [x, y, heading]. */
export const comp = (a, b) => {
  const c = Math.cos(a[2]);
  const s = Math.sin(a[2]);
  return [a[0] + c * b[0] - s * b[1], a[1] + s * b[0] + c * b[1], a[2] + b[2]];
};
