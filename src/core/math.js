export const TAU = Math.PI * 2;

/** Limit v to the range [lo, hi]. */
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Linear interpolation from a to b. */
export const mix = (a, b, t) => a + (b - a) * t;

/** Smooth 0..1 ease (smoothstep) of t, clamped. */
export const smoothstep = (t) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
