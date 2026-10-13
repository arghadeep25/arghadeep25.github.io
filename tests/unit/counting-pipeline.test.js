import { describe, expect, it } from 'vitest';
import { LineCounter } from '../../src/algos/counting.js';
import { Tracker } from '../../src/algos/tracker.js';
import { mulberry32 } from './helpers.js';

/**
 * End to end: simulated cars drive past a fixed camera, a noisy detector sees them
 * (box jitter and missed frames), and the tracker plus counter must recover the true counts.
 */
function simulate(seed) {
  const rnd = mulberry32(seed);
  const dt = 1 / 17;
  const lineY = 300;
  const tracker = new Tracker({ dt, keep: (t) => t.box.y1 < 700 && t.box.y1 > 40 });
  const counter = new LineCounter({ lineY, threshold: 4 });

  // cars: dir +1 moves away (y decreases), -1 moves toward (y increases)
  const cars = [];
  let trueIn = 0;
  let trueOut = 0;
  let nextSpawn = 0;

  for (let f = 0; f < 17 * 240; f++) {
    const time = f * dt;
    if (time >= nextSpawn) {
      const dir = rnd() < 0.55 ? 1 : -1;
      const clear = cars.every((c) => c.dir !== dir || Math.abs(c.y - (dir > 0 ? 650 : 80)) > 90);
      if (clear)
        cars.push({
          dir,
          y: dir > 0 ? 650 : 80,
          x: dir > 0 ? 420 : 300,
          v: 90 + rnd() * 60,
          crossed: false,
        });
      nextSpawn = time + 2.5 + rnd() * 3;
    }
    for (const c of cars) {
      c.y -= c.dir * c.v * dt;
      if (!c.crossed && ((c.dir > 0 && c.y < lineY) || (c.dir < 0 && c.y > lineY))) {
        c.crossed = true;
        if (c.dir > 0) trueIn++;
        else trueOut++;
      }
    }
    for (let i = cars.length - 1; i >= 0; i--)
      if (cars[i].y < 30 || cars[i].y > 720) cars.splice(i, 1);

    const dets = [];
    for (const c of cars) {
      if (rnd() < 0.045) continue;
      const w = 60 + (c.y / 700) * 60;
      const j = () => (rnd() - 0.5) * (0.05 * w + 0.6);
      dets.push({
        x0: c.x - w / 2 + j(),
        x1: c.x + w / 2 + j(),
        y0: c.y - w * 0.6 + j(),
        y1: c.y + j(),
      });
    }
    tracker.update(dets, time);
    counter.update(tracker.tracks);
  }
  return { trueIn, trueOut, counter };
}

describe('tracker + counter pipeline', () => {
  it.each([1, 2, 3])('recovers the true counts with a noisy detector (seed %i)', (seed) => {
    const { trueIn, trueOut, counter } = simulate(seed);
    expect(trueIn).toBeGreaterThan(20);
    expect(Math.abs(counter.entered - trueIn)).toBeLessThanOrEqual(1);
    expect(Math.abs(counter.left - trueOut)).toBeLessThanOrEqual(1);
  });
});
