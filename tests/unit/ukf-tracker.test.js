import { describe, expect, it } from 'vitest';
import { UkfTracker, predictPath } from '../../src/algos/ukf-tracker.js';
import { gaussian } from '../../src/core/random.js';
import { mulberry32 } from './helpers.js';

const DT = 0.1;

/** Run a tracker over scripted objects. objs: id -> (t) => [x, y]. miss(id, t) hides a detection. */
function run(
  tracker,
  objs,
  seconds,
  { miss = () => false, noise = 0.25, clutter = () => null, seed = 5 } = {},
) {
  const g = gaussian(mulberry32(seed));
  const log = [];
  for (let k = 1; k <= Math.round(seconds / DT); k++) {
    const t = k * DT;
    const dets = [];
    for (const [id, f] of Object.entries(objs)) {
      if (miss(id, t)) continue;
      const [x, y] = f(t);
      dets.push({ x: x + noise * g(), y: y + noise * g(), truth: id });
    }
    const extra = clutter(t);
    if (extra) dets.push(extra);
    const res = tracker.step(DT, dets);
    log.push({ t, res });
  }
  return log;
}

const car = (t) => [10 + 9 * t, 3];
const walker = (t) => [60, -8 + 1.4 * t];

describe('UkfTracker', () => {
  it('confirms a track after a few hits and keeps one id per object', () => {
    const tr = new UkfTracker();
    run(tr, { car, walker }, 6);
    const confirmed = tr.tracks.filter((t) => t.state === 'confirmed');
    expect(confirmed).toHaveLength(2);
    expect(new Set(confirmed.map((t) => t.id)).size).toBe(2);
    expect(tr.nextId).toBe(3);
  });

  it('estimates the speed of each object', () => {
    const tr = new UkfTracker();
    run(tr, { car, walker }, 8);
    const speeds = tr.tracks.map((t) => t.filter.x[2]).sort((a, b) => a - b);
    expect(speeds[0]).toBeGreaterThan(0.8);
    expect(speeds[0]).toBeLessThan(2.2);
    expect(speeds[1]).toBeGreaterThan(7.5);
    expect(speeds[1]).toBeLessThan(10.5);
  });

  it('never confirms a one-frame false detection', () => {
    const tr = new UkfTracker();
    const log = run(tr, { car }, 4, {
      clutter: (t) => (Math.abs(t - 2) < 1e-6 ? { x: 40, y: -10 } : null),
    });
    const ghost = log.flatMap((l) => l.res.born).find((b) => b.trail[0][0] === 40);
    expect(ghost).toBeDefined();
    expect(ghost.state).toBe('tentative');
    expect(tr.tracks).not.toContain(ghost);
    expect(tr.tracks.filter((t) => t.state === 'confirmed')).toHaveLength(1);
  });

  it('coasts through a gap and picks the object up again under the same id', () => {
    const tr = new UkfTracker();
    run(tr, { car }, 3);
    const id = tr.tracks[0].id;
    let sawCoast = false;
    const log = run(tr, { car: (t) => car(t + 3) }, 1.2, { miss: () => true });
    sawCoast = tr.tracks[0].state === 'coasting';
    expect(log.length).toBeGreaterThan(0);
    expect(sawCoast).toBe(true);
    run(tr, { car: (t) => car(t + 4.2) }, 1.5);
    const t = tr.tracks.find((x) => x.id === id);
    expect(t).toBeDefined();
    expect(t.state).toBe('confirmed');
    expect(tr.tracks).toHaveLength(1);
  });

  it('drops a track that stays unseen for too long', () => {
    const tr = new UkfTracker({ maxCoast: 8 });
    run(tr, { car }, 3);
    const log = run(tr, { car }, 2, { miss: () => true });
    expect(tr.tracks).toHaveLength(0);
    expect(log.some((l) => l.res.dropped.length > 0)).toBe(true);
  });

  it('keeps identities when two objects cross', () => {
    const tr = new UkfTracker();
    const a = (t) => [20 + 6 * t, -6 + 3 * t];
    const b = (t) => [20 + 6 * t, 6 - 3 * t];
    run(tr, { a, b }, 2);
    const before = tr.tracks.map((t) => ({ id: t.id, y: t.filter.x[1] })).sort((p, q) => p.y - q.y);
    run(tr, { a: (t) => a(t + 2), b: (t) => b(t + 2) }, 2);
    const after = tr.tracks.map((t) => ({ id: t.id, y: t.filter.x[1] })).sort((p, q) => p.y - q.y);
    expect(after).toHaveLength(2);
    expect(new Set([...before, ...after].map((x) => x.id)).size).toBe(2);
  });

  it('does not pair a detection with a track of another class', () => {
    const tr = new UkfTracker();
    tr.step(DT, [{ x: 0, y: 0, cls: 'car' }]);
    const res = tr.step(DT, [{ x: 0.1, y: 0, cls: 'pedestrian' }]);
    expect(res.pairs).toHaveLength(0);
    expect(res.born).toHaveLength(1);
  });

  it('predicts a path that follows the estimated motion', () => {
    const tr = new UkfTracker();
    run(tr, { car }, 4);
    const path = predictPath(tr.tracks[0], 2, 0.5);
    expect(path).toHaveLength(4);
    expect(path[3][0] - path[0][0]).toBeGreaterThan(10);
  });
});
