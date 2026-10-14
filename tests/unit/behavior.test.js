import { describe, expect, it } from 'vitest';
import {
  curveSpeed,
  followSpeed,
  laneIsFree,
  mustStopForLight,
  overtakePlan,
  stopSpeed,
} from '../../src/algos/behavior.js';

describe('stopSpeed', () => {
  it('lets the vehicle stop in the distance available', () => {
    const v = stopSpeed(20, 2.5);
    expect((v * v) / (2 * 2.5)).toBeCloseTo(20, 6);
  });
  it('is zero at the line and never negative', () => {
    expect(stopSpeed(0)).toBe(0);
    expect(stopSpeed(-4)).toBe(0);
  });
});

describe('followSpeed', () => {
  it('matches the vehicle ahead at the wanted gap', () => {
    const v = 8;
    expect(followSpeed({ gap: 4 + 1.5 * v, v, vLead: v })).toBeCloseTo(v, 6);
  });
  it('speeds up a little when the gap is large and slows when it is small', () => {
    expect(followSpeed({ gap: 40, v: 8, vLead: 8 })).toBeGreaterThan(8);
    expect(followSpeed({ gap: 8, v: 8, vLead: 8 })).toBeLessThan(8);
  });
  it('stops when the vehicle ahead is stopped close by', () => {
    expect(followSpeed({ gap: 4, v: 5, vLead: 0 })).toBe(0);
  });
  it('never exceeds the speed that would let it stop behind a vehicle that brakes to a halt', () => {
    const v = followSpeed({ gap: 15, v: 10, vLead: 9 });
    const safe = Math.sqrt(81 + 2 * 7 * 11);
    expect(v).toBeLessThanOrEqual(safe + 1e-9);
  });
});

describe('curveSpeed', () => {
  it('is the cap on a straight', () => {
    expect(curveSpeed(0)).toBe(15);
  });
  it('is slower for tighter bends', () => {
    expect(curveSpeed(1 / 8)).toBeLessThan(curveSpeed(1 / 30));
    expect(curveSpeed(-1 / 8)).toBeCloseTo(curveSpeed(1 / 8), 9);
  });
});

describe('mustStopForLight', () => {
  it('goes on green and stops on red', () => {
    expect(mustStopForLight({ state: 'green', dist: 5, v: 10 })).toBe(false);
    expect(mustStopForLight({ state: 'red', dist: 5, v: 10 })).toBe(true);
  });
  it('stops on yellow only when it can stop comfortably', () => {
    expect(mustStopForLight({ state: 'yellow', dist: 60, v: 10 })).toBe(true);
    expect(mustStopForLight({ state: 'yellow', dist: 8, v: 10 })).toBe(false);
  });
  it('does not stop once it is past the line', () => {
    expect(mustStopForLight({ state: 'red', dist: -3, v: 6 })).toBe(false);
  });
});

describe('overtaking', () => {
  it('is not worth it behind a vehicle that is almost as fast', () => {
    expect(overtakePlan({ gap: 15, vLead: 9.5 })).toBeNull();
  });
  it('takes less time the slower the lead is, and covers a sensible distance', () => {
    const slow = overtakePlan({ gap: 15, vLead: 5 });
    const quick = overtakePlan({ gap: 15, vLead: 8 });
    expect(slow.time).toBeLessThan(quick.time);
    expect(slow.distance).toBeGreaterThan(40);
  });
  it('is allowed when nothing is coming', () => {
    const plan = overtakePlan({ gap: 15, vLead: 5 });
    expect(laneIsFree(plan, []).ok).toBe(true);
  });
  it('is refused when an oncoming vehicle is close', () => {
    const plan = overtakePlan({ gap: 15, vLead: 5 });
    const r = laneIsFree(plan, [{ gap: 80, v: 9 }]);
    expect(r.ok).toBe(false);
    expect(r.blocker.gap).toBe(80);
  });
  it('is allowed when the oncoming vehicle is far enough away', () => {
    const plan = overtakePlan({ gap: 15, vLead: 5 });
    expect(laneIsFree(plan, [{ gap: 260, v: 9 }]).ok).toBe(true);
  });
  it('waits for a vehicle that has only just gone past', () => {
    const plan = overtakePlan({ gap: 15, vLead: 5 });
    expect(laneIsFree(plan, [{ gap: -4, v: 9 }]).ok).toBe(false);
    expect(laneIsFree(plan, [{ gap: -14, v: 9 }]).ok).toBe(true);
  });
});
