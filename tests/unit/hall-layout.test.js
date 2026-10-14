import { describe, expect, it } from 'vitest';
import {
  PERSPECTIVE,
  activeGroup,
  buildHall,
  cameraZ,
  depthAlpha,
  pickPhotos,
} from '../../src/pixworm/hall-layout.js';

const col = (slug, n) => ({
  slug,
  title: slug,
  cover: `${slug}-3`,
  photos: Array.from({ length: n }, (_, i) => `${slug}-${i}`),
});

describe('pickPhotos', () => {
  it('starts with the cover and never repeats a photo', () => {
    const c = col('a', 20);
    const p = pickPhotos(c.photos, c.cover, 4);
    expect(p).toHaveLength(4);
    expect(p[0]).toEqual({ entry: 'a-3', index: 3 });
    expect(new Set(p.map((x) => x.entry)).size).toBe(4);
  });

  it('spreads the others through the whole set', () => {
    const c = col('a', 31);
    const idx = pickPhotos(c.photos, c.cover, 4).map((x) => x.index);
    expect(idx[1]).toBeLessThan(10);
    expect(idx[3]).toBeGreaterThan(20);
  });

  it('returns what exists for a small set', () => {
    const c = { ...col('a', 2), cover: 'a-0' };
    expect(pickPhotos(c.photos, c.cover, 4)).toHaveLength(2);
  });

  it('marks a cover that is not in the list', () => {
    expect(pickPhotos(['x', 'y'], 'zzz', 2)[0].index).toBe(-1);
  });
});

describe('buildHall', () => {
  const cs = [col('a', 10), col('b', 10), col('c', 10)];
  const hall = buildHall(cs);

  it('puts the mark first then a title before each set of frames', () => {
    expect(hall.items[0].type).toBe('mark');
    const types = hall.items.map((i) => i.type);
    expect(types.filter((t) => t === 'title')).toHaveLength(3);
    expect(types.filter((t) => t === 'frame')).toHaveLength(12);
    expect(types[1]).toBe('title');
  });

  it('goes steadily deeper and ends inside the depth', () => {
    for (let i = 1; i < hall.items.length; i++)
      expect(hall.items[i].z).toBeLessThan(hall.items[i - 1].z);
    expect(hall.depth).toBeGreaterThan(-hall.items.at(-1).z);
  });

  it('alternates sides and keeps the centre lane open', () => {
    const frames = hall.items.filter((i) => i.type === 'frame');
    frames.forEach((f, i) => {
      if (i) expect(Math.sign(f.x)).toBe(-Math.sign(frames[i - 1].x));
      expect(Math.abs(f.x)).toBeGreaterThanOrEqual(0.2);
    });
  });

  it('is the same every time for one seed', () => {
    expect(buildHall(cs)).toEqual(hall);
    expect(buildHall(cs, { seed: 8 })).not.toEqual(hall);
  });
});

describe('cameraZ', () => {
  it('maps progress to travel and clamps', () => {
    expect(cameraZ(0, 1000)).toBe(0);
    expect(cameraZ(0.5, 1000)).toBe(500);
    expect(cameraZ(2, 1000)).toBe(1000);
    expect(cameraZ(-1, 1000)).toBe(0);
  });
});

describe('depthAlpha', () => {
  it('is hidden far away, solid mid range, gone once past the screen plane', () => {
    expect(depthAlpha(-5000)).toBe(0);
    expect(depthAlpha(-1000)).toBe(1);
    expect(depthAlpha(0)).toBe(1);
    expect(depthAlpha(PERSPECTIVE)).toBe(0);
  });

  it('fades smoothly on both ends', () => {
    const a = depthAlpha(-3000);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(1);
    const b = depthAlpha(PERSPECTIVE * 0.5);
    expect(b).toBeGreaterThan(0);
    expect(b).toBeLessThan(1);
  });
});

describe('activeGroup', () => {
  const hall = buildHall([col('a', 10), col('b', 10), col('c', 10)]);
  it('is -1 before the first title and follows the camera after', () => {
    expect(activeGroup(hall.items, 0)).toBe(-1);
    const t = hall.items.filter((i) => i.type === 'title');
    expect(activeGroup(hall.items, -t[0].z)).toBe(0);
    expect(activeGroup(hall.items, -t[1].z)).toBe(1);
    expect(activeGroup(hall.items, hall.depth)).toBe(2);
  });
});
