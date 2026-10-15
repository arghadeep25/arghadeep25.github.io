import { describe, expect, it } from 'vitest';
import {
  DIRS,
  astar,
  buildRoute,
  dirBetween,
  makeCity,
  planToPoint,
  snapToStreets,
} from '../../src/algos/grid-route.js';

const city = makeCity({ cols: 5, rows: 4, spacing: 100 });

describe('makeCity', () => {
  it('lays nodes on a grid and finds neighbours by id', () => {
    expect(city.nodes).toHaveLength(20);
    expect(city.nodes[6]).toMatchObject({ i: 1, j: 1, x: 100, y: 100 });
    expect(city.id(1, 1)).toBe(6);
    expect(city.id(-1, 0)).toBe(-1);
    expect(city.id(5, 0)).toBe(-1);
    expect(city.width).toBe(400);
    expect(city.height).toBe(300);
  });

  it('reports the direction between neighbours', () => {
    expect(dirBetween(city, 0, 1)).toBe(0);
    expect(dirBetween(city, 0, 5)).toBe(1);
    expect(dirBetween(city, 1, 0)).toBe(2);
    expect(dirBetween(city, 0, 6)).toBe(-1);
    expect(DIRS).toHaveLength(4);
  });
});

describe('astar', () => {
  it('finds a shortest route over the streets', () => {
    const r = astar(city, 0, 19);
    expect(r.path[0]).toBe(0);
    expect(r.path[r.path.length - 1]).toBe(19);
    expect(r.path).toHaveLength(8); // 4 + 3 blocks, 8 nodes
  });

  it('prefers fewer turns when turning costs extra', () => {
    const r = astar(city, 0, 19, { turnCost: 80 });
    let turns = 0;
    for (let k = 2; k < r.path.length; k++)
      if (
        dirBetween(city, r.path[k - 2], r.path[k - 1]) !==
        dirBetween(city, r.path[k - 1], r.path[k])
      )
        turns++;
    expect(turns).toBe(1);
  });

  it('never turns straight back', () => {
    // start at node 1 facing west (towards node 0): the goal at node 2 behind us needs a loop
    const r = astar(city, 1, 2, { heading: 2 });
    expect(r.path.length).toBeGreaterThan(2);
    for (let k = 2; k < r.path.length; k++) expect(r.path[k]).not.toBe(r.path[k - 2]);
  });

  it('records the nodes it explored, starting from the start', () => {
    const r = astar(city, 0, 19);
    expect(r.expanded[0]).toEqual({ node: 0, from: -1 });
    expect(r.expanded.length).toBeGreaterThanOrEqual(r.path.length);
  });

  it('returns the start alone when already there', () => {
    expect(astar(city, 7, 7).path).toEqual([7]);
  });
});

describe('snapToStreets and planToPoint', () => {
  it('snaps a point to the nearest street', () => {
    const s = snapToStreets(city, 130, 12);
    expect(s.y).toBeCloseTo(0, 9);
    expect(s.x).toBeCloseTo(130, 9);
    expect([s.a, s.b].sort()).toEqual([1, 2]);
    expect(s.u).toBeCloseTo(0.3, 6);
  });

  it('plans to the end of the street that is cheaper to reach', () => {
    const snap = snapToStreets(city, 130, 0);
    const plan = planToPoint(city, 0, 0, snap);
    expect(plan.nodes[plan.nodes.length - 1]).toBe(1);
    expect(plan.end.x).toBeCloseTo(130, 9);
  });

  it('comes from the far end when the near end would need a U-turn', () => {
    const snap = snapToStreets(city, 130, 0); // on the street between nodes 1 and 2
    const plan = planToPoint(city, 2, 0, snap); // at node 2 heading east, the point is behind us
    expect(plan).not.toBeNull();
    expect(plan.nodes[plan.nodes.length - 1]).toBe(1);
    expect(plan.nodes.length).toBeGreaterThan(2);
  });
});

describe('buildRoute', () => {
  const pts = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 200, y: 100 },
  ];
  const r = buildRoute(pts, { offset: 1.8, radius: 8 });

  it('keeps to the right of the centre line', () => {
    const p = r.pointAt(10, 0);
    expect(p.x).toBeCloseTo(10, 6);
    expect(p.y).toBeCloseTo(-1.8, 6);
    expect(p.th).toBeCloseTo(0, 6);
  });

  it('moves left for positive lateral offsets', () => {
    const p = r.pointAt(10, 3.6);
    expect(p.y).toBeCloseTo(1.8, 6);
  });

  it('is about as long as the waypoints, a little shorter at rounded corners', () => {
    expect(r.length).toBeLessThan(300);
    expect(r.length).toBeGreaterThan(285);
  });

  it('turns smoothly through corners', () => {
    let worst = 0;
    for (let s = 1; s < r.length - 1; s += 1) {
      let d = r.pointAt(s + 1).th - r.pointAt(s).th;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      worst = Math.max(worst, Math.abs(d));
    }
    expect(worst).toBeLessThan(0.25);
  });

  it('ends heading east after a left then a right turn', () => {
    expect(r.pointAt(r.length).th).toBeCloseTo(0, 2);
    expect(r.pointAt(r.nodeS[1] + 40).th).toBeCloseTo(Math.PI / 2, 1);
  });

  it('records where each waypoint falls along the route', () => {
    expect(r.nodeS).toHaveLength(4);
    expect(r.nodeS[0]).toBe(0);
    expect(r.nodeS[1]).toBeGreaterThan(90);
    expect(r.nodeS[1]).toBeLessThan(105);
    expect(r.nodeS[3]).toBeCloseTo(r.length, 6);
  });

  it('has a curvature that peaks at a corner and is zero on straights', () => {
    expect(Math.abs(r.curvatureAt(30))).toBeLessThan(1e-6);
    expect(Math.abs(r.curvatureAt(r.nodeS[1]))).toBeGreaterThan(0.05);
  });

  it('projects a world point back to route coordinates', () => {
    const q = r.pointAt(42, 1.1);
    const p = r.project(q.x, q.y);
    expect(p.s).toBeCloseTo(42, 0);
    expect(p.lat).toBeCloseTo(1.1, 1);
  });

  it('extends straight beyond its end', () => {
    const e = r.pointAt(r.length + 10);
    const end = r.pointAt(r.length);
    expect(e.x).toBeCloseTo(end.x + 10 * Math.cos(end.th), 3);
  });

  it('copes with a straight two-point route', () => {
    const s = buildRoute([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
    ]);
    expect(s.length).toBeCloseTo(50, 6);
    expect(s.line(0, 50, 0, 10)).toHaveLength(6);
  });
});
