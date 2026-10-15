import { describe, expect, it } from 'vitest';
import { lookAheadPoint, stepPurePursuit } from '../../src/algos/pure-pursuit.js';

const sine = (x) => 40 * Math.sin(x / 60);

function drive(pathY, car, { lookAhead = 30, v = 60, seconds = 12 } = {}) {
  const dt = 1 / 60;
  const errors = [];
  for (let i = 0; i < seconds * 60; i++) {
    const target = lookAheadPoint(pathY, car, lookAhead, 2000);
    stepPurePursuit(car, target, lookAhead, v, dt);
    errors.push(Math.abs(car.y - pathY(car.x)));
  }
  return errors;
}

describe('lookAheadPoint', () => {
  it('is on the path and at least lookAhead away', () => {
    const car = { x: 10, y: 0, heading: 0 };
    const p = lookAheadPoint(() => 0, car, 25, 500);
    expect(p.y).toBe(0);
    expect(Math.hypot(p.x - car.x, p.y - car.y)).toBeGreaterThanOrEqual(25);
    expect(Math.hypot(p.x - car.x, p.y - car.y)).toBeLessThan(25 + 3.1);
  });
  it('falls back to a point ahead when the path ends', () => {
    const p = lookAheadPoint(() => 0, { x: 0, y: 0, heading: 0 }, 50, 10);
    expect(p.x).toBe(50);
  });
});

describe('stepPurePursuit', () => {
  it('drives straight when already on a straight path', () => {
    const car = { x: 0, y: 0, heading: 0 };
    const errors = drive(() => 0, car);
    expect(Math.max(...errors)).toBeLessThan(1e-6);
    expect(car.x).toBeGreaterThan(600);
  });

  it('converges onto a straight path from an offset', () => {
    const car = { x: 0, y: 25, heading: 0 };
    const errors = drive(() => 0, car);
    expect(errors[errors.length - 1]).toBeLessThan(0.5);
    expect(errors[0]).toBeGreaterThan(20);
  });

  it('follows a curve with a small error once settled', () => {
    const car = { x: 0, y: 12, heading: 0.3 };
    const errors = drive(sine, car, { seconds: 15 });
    const tail = errors.slice(-300);
    expect(Math.max(...tail)).toBeLessThan(6);
  });

  it('turns toward a carrot on its left', () => {
    const car = { x: 0, y: 0, heading: 0 };
    stepPurePursuit(car, { x: 50, y: 30 }, 50, 50, 0.1);
    expect(car.heading).toBeGreaterThan(0);
  });
});
