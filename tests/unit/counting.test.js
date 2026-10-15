import { describe, expect, it } from 'vitest';
import { LineCounter, crossedLine, directionFromHistory } from '../../src/algos/counting.js';

const path = (ys) => ys.map((y, i) => [100, y, i / 17]);

describe('directionFromHistory', () => {
  it('is +1 when y decreases (moving away)', () => {
    expect(directionFromHistory(path([300, 290, 280, 270, 260]), { threshold: 5 })).toBe(1);
  });
  it('is -1 when y increases (moving toward)', () => {
    expect(directionFromHistory(path([200, 210, 220, 230, 240]), { threshold: 5 })).toBe(-1);
  });
  it('is 0 for a parked car or too little history', () => {
    expect(directionFromHistory(path([200, 201, 200, 201, 200]), { threshold: 5 })).toBe(0);
    expect(directionFromHistory(path([300, 290]), { threshold: 5 })).toBe(0);
  });
});

describe('crossedLine', () => {
  it('detects crossings in the right direction only', () => {
    expect(crossedLine(105, 95, 1, 100)).toBe(true);
    expect(crossedLine(95, 105, 1, 100)).toBe(false);
    expect(crossedLine(95, 105, -1, 100)).toBe(true);
    expect(crossedLine(105, 95, -1, 100)).toBe(false);
    expect(crossedLine(105, 95, 0, 100)).toBe(false);
  });
});

function trackAlong(ys) {
  const t = { hits: 0, hist: [], dir: 0, counted: false };
  return {
    t,
    step: (y, i) => {
      t.hits += 1;
      t.hist.push([100, y, i / 17]);
    },
  };
}

describe('LineCounter', () => {
  it('counts a car entering once, at the crossing', () => {
    const c = new LineCounter({ lineY: 200, threshold: 4 });
    const { t, step } = trackAlong();
    const events = [];
    for (let i = 0; i < 30; i++) {
      step(300 - i * 6, i);
      events.push(...c.update([t]));
    }
    expect(events).toHaveLength(1);
    expect(c.entered).toBe(1);
    expect(c.left).toBe(0);
  });

  it('counts a car leaving once', () => {
    const c = new LineCounter({ lineY: 200, threshold: 4 });
    const { t, step } = trackAlong();
    for (let i = 0; i < 30; i++) {
      step(100 + i * 6, i);
      c.update([t]);
    }
    expect(c.left).toBe(1);
    expect(c.entered).toBe(0);
  });

  it('does not count twice when a car jitters around the line', () => {
    const c = new LineCounter({ lineY: 200, threshold: 4 });
    const { t, step } = trackAlong();
    [260, 245, 230, 215, 205, 198, 203, 197, 202, 190, 180].forEach((y, i) => {
      step(y, i);
      c.update([t]);
    });
    expect(c.entered).toBe(1);
  });

  it('ignores a stationary car near the line', () => {
    const c = new LineCounter({ lineY: 200, threshold: 4 });
    const { t, step } = trackAlong();
    for (let i = 0; i < 20; i++) {
      step(200 + (i % 2), i);
      c.update([t]);
    }
    expect(c.entered + c.left).toBe(0);
  });

  it('tracks occupancy and never goes below zero', () => {
    const c = new LineCounter({ lineY: 200, threshold: 4 });
    c.left = 5;
    expect(c.occupancy(2)).toBe(0);
    c.entered = 10;
    expect(c.occupancy(2)).toBe(7);
  });
});
