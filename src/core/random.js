/**
 * Small seeded random generator (mulberry32): same seed, same sequence.
 * @param {number} seed
 * @returns {() => number} function returning numbers in [0, 1)
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Standard-normal samples (Box-Muller) from a uniform generator.
 * @param {() => number} rnd uniform generator
 * @returns {() => number}
 */
export function gaussian(rnd) {
  return () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(Math.PI * 2 * rnd());
}
