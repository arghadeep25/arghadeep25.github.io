import { clamp, smoothstep } from '../core/math.js';
import { mulberry32 } from '../core/random.js';

/** Distance from the eye to the screen plane, in the same units as the frame depths. */
export const PERSPECTIVE = 900;

/**
 * Up to `k` photos of a collection: the cover first, then others spread evenly through the set.
 * @param {string[]} photos
 * @param {string} cover
 * @param {number} k
 * @returns {{ entry: string, index: number }[]} entry plus its index in `photos` (-1 when not in the list)
 */
export function pickPhotos(photos, cover, k) {
  const out = [{ entry: cover, index: photos.indexOf(cover) }];
  const others = photos.map((entry, index) => ({ entry, index })).filter((p) => p.entry !== cover);
  const want = Math.min(k - 1, others.length);
  for (let i = 0; i < want; i++) out.push(others[Math.floor(((i + 0.5) * others.length) / want)]);
  return out;
}

/**
 * Places every collection along the depth axis: a title, then its frames.
 * Frames alternate left and right of the centre so the middle stays open to fly through.
 * Positions are fractions of the viewport so they scale with the screen.
 * @param {{ slug: string, title: string, cover: string, photos: string[] }[]} collections
 * @param {{ perGroup?: number, spacing?: number, seed?: number }} [opts]
 */
export function buildHall(collections, { perGroup = 4, spacing = 560, seed = 7 } = {}) {
  const rnd = mulberry32(seed);
  const items = [{ type: 'mark', z: 0 }];
  let z = -1000;
  let side = 1;
  collections.forEach((c, g) => {
    items.push({ type: 'title', z, group: g, collection: c });
    z -= spacing * 0.9;
    pickPhotos(c.photos, c.cover, perGroup).forEach((p) => {
      side = -side;
      items.push({
        type: 'frame',
        z,
        group: g,
        collection: c,
        entry: p.entry,
        index: Math.max(0, p.index),
        x: side * (0.2 + 0.14 * rnd()),
        y: (rnd() - 0.5) * 0.3,
        tilt: -side * (3 + 5 * rnd()),
      });
      z -= spacing * (0.85 + 0.3 * rnd());
    });
    z -= spacing * 0.4;
  });
  return { items, depth: -z + 600 };
}

/** Camera travel for a scroll progress of 0..1. */
export const cameraZ = (progress, depth) => clamp(progress, 0, 1) * depth;

/**
 * Opacity of something `zView` in front of the eye (negative = ahead, positive = passing).
 * Fades in out of the distance and out again as it nears the screen plane.
 */
export function depthAlpha(zView, { far = 3600, near = PERSPECTIVE } = {}) {
  const farFade = smoothstep((zView + far) / (far * 0.45));
  const nearFade = 1 - smoothstep((zView - near * 0.35) / (near * 0.4));
  return farFade * nearFade;
}

/** Index of the collection being passed: the last title that is level with or behind the eye. */
export function activeGroup(items, camZ, lead = 600) {
  let g = -1;
  for (const it of items) if (it.type === 'title' && it.z + camZ >= -lead) g = it.group;
  return g;
}
