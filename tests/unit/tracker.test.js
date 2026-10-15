import { describe, expect, it } from 'vitest';
import { Tracker } from '../../src/algos/tracker.js';

const det = (cx, cy, w = 40, h = 30) => ({
  x0: cx - w / 2,
  x1: cx + w / 2,
  y0: cy - h / 2,
  y1: cy + h / 2,
});

describe('Tracker', () => {
  it('keeps one id for a car moving across frames', () => {
    const tr = new Tracker();
    for (let f = 0; f < 60; f++) tr.update([det(100 + f * 2, 200 - f)], f / 17);
    expect(tr.tracks).toHaveLength(1);
    expect(tr.tracks[0].id).toBe(1);
    expect(tr.tracks[0].hits).toBe(60);
  });

  it('keeps two nearby cars apart', () => {
    const tr = new Tracker();
    for (let f = 0; f < 40; f++) tr.update([det(100 + f, 200), det(300 - f, 220)], f / 17);
    expect(tr.tracks.map((t) => t.id).sort()).toEqual([1, 2]);
  });

  it('coasts through a missed detection without changing the id', () => {
    const tr = new Tracker();
    for (let f = 0; f < 10; f++) tr.update([det(100 + f * 3, 200 - f * 2)], f / 17);
    tr.update([], 10 / 17);
    expect(tr.tracks[0].coast).toBe(true);
    tr.update([det(100 + 11 * 3, 200 - 11 * 2)], 11 / 17);
    expect(tr.tracks).toHaveLength(1);
    expect(tr.tracks[0].id).toBe(1);
    expect(tr.tracks[0].coast).toBe(false);
  });

  it('drops a track after maxMiss empty frames', () => {
    const tr = new Tracker({ maxMiss: 3 });
    tr.update([det(100, 100)], 0);
    for (let f = 1; f <= 3; f++) tr.update([], f / 17);
    expect(tr.tracks).toHaveLength(0);
  });

  it('starts a new track for a detection nothing matches', () => {
    const tr = new Tracker();
    tr.update([det(50, 50)], 0);
    tr.update([det(52, 50), det(400, 300)], 1 / 17);
    expect(tr.tracks).toHaveLength(2);
  });

  it('honours the keep rule', () => {
    const tr = new Tracker({ keep: (t) => t.box.y1 > 0 });
    tr.update([det(50, -50)], 0);
    expect(tr.tracks).toHaveLength(0);
  });

  it('reports matched pairs', () => {
    const tr = new Tracker();
    tr.update([det(50, 50)], 0);
    const { matched } = tr.update([det(54, 50)], 1 / 17);
    expect(matched).toHaveLength(1);
    expect(matched[0][0]).toBe(1);
  });
});
