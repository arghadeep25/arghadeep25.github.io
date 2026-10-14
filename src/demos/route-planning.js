import { $, FONT, TAU, clamp, lerp } from './common.js';
import {
  DIRS,
  buildRoute,
  dirBetween,
  makeCity,
  planToPoint,
  snapToStreets,
} from '../algos/grid-route.js';
import {
  curveSpeed,
  followSpeed,
  laneIsFree,
  mustStopForLight,
  overtakePlan,
  stopSpeed,
} from '../algos/behavior.js';
import { mulberry32 } from '../core/random.js';
import {
  Series,
  buildRail,
  drawChart,
  drawDotGrid,
  setMetrics,
  setStatus,
  setTile,
  sizeCanvas,
  startLoop,
} from './kit.js';
import { drawCarSprite, drawPedSprite } from './sprites.js';

/*
 * Route planning. The visitor drops a pin on a city map. A global planner (A* over the street
 * network) finds the way, and the vehicle drives it. A local planner handles everything on the way:
 * it keeps a gap behind slower traffic, overtakes when the opposite lane is clear, stops for red
 * signals, brakes hard when the car ahead does, and gives way to people crossing.
 *
 * Everything on the road lives in route coordinates: s metres along the route and lat metres to the
 * left of the lane the vehicle drives in.
 */

const GREEN = '#30d158';
const RED = '#ff5d6c';
const HALF = 3.6; // half the road width
const LANE = 1.8; // the vehicle's lane sits this far right of the street centre line
const V_LIM = 11.1; // 40 km/h
const STOP_BACK = 8; // stop lines sit this far before the middle of a junction
const OPP = 3.6; // the opposite lane is this far left of ours
const CAR_COLORS = ['#c9d2e6', '#b6c4de', '#d6cdb8', '#c7b9d8'];

const city = makeCity({ cols: 6, rows: 5, spacing: 180 });
const rnd = mulberry32(41);
const between = (a, b) => a + (b - a) * rnd();

/* ---------- canvases ---------- */
const cv = $('scene');
const g = cv.getContext('2d');
const mini = $('mini');
const mg = mini.getContext('2d');
let W = 0;
let H = 0;
let DPR = 1;
let SC = 8;
const dockH = () => (W < 800 ? 200 : 206) + (W < 800 ? 12 : 18);
const originX = () => (W < 800 ? W * 0.45 : W * 0.4);
const originY = () => (W < 800 ? H * 0.42 : (H - dockH() - 20) / 2 + 14);
function resize() {
  const s = sizeCanvas(cv);
  W = s.w;
  H = s.h;
  DPR = s.dpr;
  SC = W < 800 ? clamp(W / 40, 6, 9) : clamp(Math.min(W / 135, H / 80), 6, 10.5);
}
addEventListener('resize', resize);

/* ---------- state ---------- */
let T = 0;
let route = null;
let legs = [];
let pin = null; // the snapped destination
let pending = null; // a route being "planned": swaps in when the animation ends
let arrivedAt = -1;
const START = { a: 0, b: 0, x: 0, y: 0 };
const egoEdge = { a: START.a, b: START.b };
const ego = {
  s: 0,
  lat: 0,
  latV: 0,
  v: 0,
  acc: 0,
  len: 4.4,
  x: 0,
  y: 0,
  th: 0,
  mode: 'drive', // drive | out | pass | merge
  followT: 0,
  target: null, // the vehicle being overtaken
};
let actors = [];
let nextActor = 1;
let crossings = [];
let override = null; // a signal forced to red: { node, t0 }
let nextOncoming = 4;
let noOncomingUntil = 0;
let lastEvent = 0;
let scriptIdx = 0;
let queued = [];
let focusOverride = null;
const brain = {
  reason: 'idle', // idle cruise follow wait-ovt overtake light brake ped turn arrive
  text: 'Pick a destination',
  gap: Infinity,
  lead: null,
  light: null,
  lightDist: Infinity,
  ped: false,
  pedDist: Infinity,
  stopS: null,
  ovt: 'Not needed',
  ovtBlock: null,
  ovtPlan: null,
  maxDecel: 0,
  waitT: 0,
  vt: 0,
  free: 80,
};
const stats = { overtakes: 0, hardBrakes: 0, redStops: 0, yields: 0, arrivals: 0, collisions: 0 };
const spdSeries = new Series(20);
const gapSeries = new Series(20);

/* ---------- signals ---------- */
function lightState(node, axis, t) {
  if (override && override.node === node && axis === override.axis) {
    const d = t - override.t0;
    if (d < 1.4) return 'yellow';
    if (d < override.hold) return 'red';
  }
  const tt = (t + node * 3.7) % 16;
  if (axis === 0) return tt < 6.5 ? 'green' : tt < 8 ? 'yellow' : 'red';
  return tt < 8 ? 'red' : tt < 14.5 ? 'green' : 'yellow';
}
const LC = { red: '#ff453a', yellow: '#ffd60a', green: '#30d158' };

/* ---------- planning ---------- */
function egoCentre() {
  const A = city.nodes[egoEdge.a];
  const B = city.nodes[egoEdge.b];
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const u = clamp(((ego.x - A.x) * dx + (ego.y - A.y) * dy) / (dx * dx + dy * dy), 0, 1);
  return { x: A.x + dx * u, y: A.y + dy * u };
}

function snapPin(x, y) {
  const s = snapToStreets(city, x, y);
  const u = clamp(s.u, 14 / s.len, 1 - 14 / s.len);
  const A = city.nodes[s.a];
  const B = city.nodes[s.b];
  return { ...s, u, x: A.x + (B.x - A.x) * u, y: A.y + (B.y - A.y) * u };
}

function makePlan(snap) {
  const c = egoCentre();
  const dirIdx = dirBetween(city, egoEdge.a, egoEdge.b);
  const sameStreet =
    (snap.a === egoEdge.a && snap.b === egoEdge.b) ||
    (snap.a === egoEdge.b && snap.b === egoEdge.a);
  const ahead = (snap.x - c.x) * DIRS[dirIdx][0] + (snap.y - c.y) * DIRS[dirIdx][1];
  let pts;
  let nlegs;
  let expanded = [];
  let nodes = [];
  if (sameStreet && ahead > 30) {
    pts = [c, { x: snap.x, y: snap.y }];
    nlegs = [{ a: egoEdge.a, b: egoEdge.b }];
  } else {
    const plan = planToPoint(city, egoEdge.b, dirIdx, snap, { turnCost: 45 });
    if (!plan) return null;
    nodes = plan.nodes;
    expanded = plan.expanded;
    pts = [
      c,
      ...nodes.map((n) => ({ x: city.nodes[n].x, y: city.nodes[n].y })),
      { x: snap.x, y: snap.y },
    ];
    nlegs = [{ a: egoEdge.a, b: egoEdge.b }];
    for (let k = 1; k < nodes.length; k++) nlegs.push({ a: nodes[k - 1], b: nodes[k] });
    const last = nodes[nodes.length - 1];
    nlegs.push({ a: last, b: last === snap.a ? snap.b : snap.a });
  }
  const r = buildRoute(pts, { offset: LANE, radius: 6.5 });
  let turns = 0;
  for (let k = 1; k < nlegs.length; k++)
    if (
      dirBetween(city, nlegs[k - 1].a, nlegs[k - 1].b) !== dirBetween(city, nlegs[k].a, nlegs[k].b)
    )
      turns++;
  return { route: r, legs: nlegs, expanded, turns, nodes: pts.map((p) => [p.x, p.y]) };
}

function dropPin(x, y) {
  const snap = snapPin(x, y);
  const plan = makePlan(snap);
  if (!plan) return false;
  pin = { ...snap, t0: T };
  pending = { ...plan, t0: T, dur: 1.6 };
  arrivedAt = -1;
  return true;
}

function randomPin() {
  for (let i = 0; i < 40; i++) {
    const x = between(10, city.width - 10);
    const y = between(10, city.height - 10);
    const snap = snapPin(x, y);
    const d = Math.hypot(snap.x - ego.x, snap.y - ego.y);
    if (d > 260 && dropPin(snap.x, snap.y)) return;
  }
  dropPin(city.width * 0.8, city.height * 0.6);
}

function applyPlan() {
  route = pending.route;
  legs = pending.legs;
  brain.expanded = pending.expanded.length;
  brain.turns = pending.turns;
  brain.routeNodes = pending.nodes;
  brain.explored = pending.expanded;
  pending = null;
  arrivedAt = -1;
  const p = route.project(ego.x, ego.y);
  ego.s = p.s;
  ego.lat = p.lat;
  ego.mode = 'drive';
  ego.target = null;
  actors = [];
  crossings = [];
  override = null;
  queued = [];
  lastEvent = T;
}

/* ---------- actors ---------- */
function addActor(o) {
  const a = {
    id: nextActor++,
    born: T,
    v: 0,
    acc: 0,
    dir: 1,
    lat: 0,
    len: 4.4,
    color: CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)],
    ...o,
  };
  actors.push(a);
  return a;
}
const legAt = (s) => {
  let k = 0;
  for (let i = 0; i < route.nodeS.length - 1; i++) if (route.nodeS[i] <= s) k = i;
  return Math.min(k, legs.length - 1);
};
/**
 * A stretch of straight road ahead: [start, end] along the route with at least `need` metres in it,
 * starting no further than `within` metres ahead of the vehicle. Nothing is placed across a junction.
 */
function straightAhead(from, need, within) {
  for (let k = 0; k < legs.length; k++) {
    const s0 = Math.max(route.nodeS[k] + 14, from);
    const s1 = route.nodeS[k + 1] - 16;
    if (s0 - ego.s > within) return null;
    if (s1 - s0 >= need) return [s0, s1];
  }
  return null;
}

function spawnLead(kind, passable) {
  const room =
    kind === 'braker' ? straightAhead(ego.s + 22, 90, 30) : straightAhead(ego.s + 42, 120, 60);
  if (!room) return false;
  const s = room[0];
  if (kind === 'braker')
    addActor({ kind: 'braker', s, v: 8.5, cruise: 8.5, phase: 'run', t0: 0, noPass: true });
  else
    addActor({
      kind: 'lead',
      s,
      v: 5.8,
      cruise: 5.8,
      noPass: !passable,
      releaseAt: passable ? Infinity : T + 12,
    });
  if (passable) {
    noOncomingUntil = T + 14;
    for (const a of actors) if (a.dir < 0 && a.s > ego.s + 30) a.gone = true;
  }
  return true;
}

function spawnCrossing() {
  const room = straightAhead(ego.s + 80, 50, 110);
  if (!room) return false;
  const s = Math.min(room[0] + 10, room[1] - 14);
  const cw = { s, t0: T, peds: [] };
  const side = rnd() < 0.5 ? 1 : -1;
  const n = rnd() < 0.5 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const lat0 = side > 0 ? 6.9 + i * 1.1 : -3.1 - i * 1.1;
    const p = addActor({
      kind: 'ped',
      s: s + (rnd() - 0.5) * 1.4 + i * 0.8,
      lat: lat0,
      vlat: -side * between(1.2, 1.4),
      state: 'wait',
      goal: side > 0 ? -3.2 : 6.9,
      cw,
      len: 0.7,
    });
    cw.peds.push(p);
  }
  crossings.push(cw);
  return true;
}

function forceRed() {
  for (let k = 1; k < legs.length; k++) {
    const d = route.nodeS[k] - STOP_BACK - ego.s;
    if (d > 60 && d < 260) {
      const dirIdx = dirBetween(city, legs[k - 1].a, legs[k - 1].b);
      override = { node: legs[k].a, axis: dirIdx % 2, t0: T, hold: 11 };
      return true;
    }
  }
  return false;
}

function trigger(i, auto = false) {
  if (i === 0) {
    randomPin();
    return true;
  }
  if (!route || pending) return false;
  if (eventBusy() && !auto) return false;
  let ok = false;
  if (i === 1) ok = spawnLead('lead', false);
  else if (i === 2) ok = spawnLead('lead', true);
  else if (i === 3) ok = forceRed();
  else if (i === 4) ok = spawnLead('braker', false);
  else if (i === 5) ok = spawnCrossing();
  if (ok) lastEvent = T;
  return ok;
}

const eventBusy = () =>
  !!override ||
  actors.some(
    (a) => (a.kind === 'lead' || a.kind === 'braker' || a.kind === 'ped') && a.s > ego.s - 14,
  );

const SCRIPT = [2, 3, 5, 4, 1];

/* ---------- the drive ---------- */
function step(dt) {
  T += dt;
  if (pending && T >= pending.t0 + pending.dur) applyPlan();
  if (!route) {
    if (!pending && !pin) randomPin();
    return;
  }

  // keep track of which street the vehicle is on
  const leg = legs[legAt(ego.s)];
  egoEdge.a = leg.a;
  egoEdge.b = leg.b;

  // events: queued clicks first, then the script
  if (queued.length && !eventBusy() && trigger(queued[0], true)) queued.shift();
  if (
    !pending &&
    arrivedAt < 0 &&
    T - lastEvent > 7 &&
    !eventBusy() &&
    route.length - ego.s > 150
  ) {
    if (trigger(SCRIPT[scriptIdx % SCRIPT.length], true)) scriptIdx++;
    else lastEvent = T - 4;
  }
  if (override && T - override.t0 > override.hold + 1) override = null;

  // oncoming traffic in the opposite lane
  if (
    T > nextOncoming &&
    ego.mode === 'drive' &&
    T > noOncomingUntil &&
    ego.s < route.length - 170
  ) {
    nextOncoming = T + between(5, 9);
    const n = rnd() < 0.4 ? 2 : 1;
    for (let i = 0; i < n; i++)
      addActor({ kind: 'oncoming', dir: -1, lat: OPP, s: ego.s + 175 + i * 17, v: 9, cruise: 9 });
  }

  // other road users
  for (const a of actors) moveActor(a, dt);
  actors = actors.filter(
    (a) => (a.dir < 0 ? a.s > ego.s - 90 : a.s > ego.s - 80 && a.s < ego.s + 240) && !a.gone,
  );
  crossings = crossings.filter((c) => c.s > ego.s - 30);

  driveEgo(dt);
  collide();

  if (route && !pending && ego.s >= route.length - 6.5 && ego.v < 0.25) {
    if (arrivedAt < 0) {
      arrivedAt = T;
      stats.arrivals++;
    }
    if (T - arrivedAt > 3.4 && !pending) randomPin();
  }
}

function moveActor(a, dt) {
  if (a.kind === 'ped') {
    const near = a.cw.s - ego.s;
    if (a.state === 'wait' && near < 46 && near > -4) a.state = 'cross';
    if (a.state === 'cross') {
      a.lat += a.vlat * dt;
      if ((a.vlat > 0 && a.lat >= a.goal) || (a.vlat < 0 && a.lat <= a.goal)) {
        a.lat = a.goal;
        a.state = 'done';
        a.doneAt = T;
      }
    }
    if (a.state === 'done' && T - a.doneAt > 6) a.gone = true;
    return;
  }
  let vt = a.cruise;
  if (a.kind === 'lead' && T > a.releaseAt) vt = 13;
  if (a.kind === 'braker') {
    const gap = a.s - a.len / 2 - (ego.s + 2.2);
    if (a.phase === 'run' && gap < 22 && gap > 3 && ego.followT > 1.8) {
      a.phase = 'brake';
      a.t0 = T;
      stats.hardBrakes++;
    }
    if (a.phase === 'brake') {
      vt = 0;
      if (a.v < 0.05 && T - a.t0 > 1) {
        a.phase = 'hold';
        a.t1 = T;
      }
    }
    if (a.phase === 'hold') {
      vt = 0;
      if (T - a.t1 > 3) a.phase = 'go';
    }
    if (a.phase === 'go') vt = 13;
  }
  if (a.kind === 'oncoming' || a.kind === 'lead') {
    // other drivers stop for people on the road in front of them
    const blocked = actors.some(
      (p) =>
        p.kind === 'ped' &&
        p.state === 'cross' &&
        (p.s - a.s) * a.dir > -1 &&
        (p.s - a.s) * a.dir < 16 &&
        (a.dir < 0 ? p.lat > 2.2 : p.lat < 2.2),
    );
    if (blocked) vt = 0;
  }
  if (a.dir > 0 && a.kind !== 'ped' && Math.abs(ego.lat - a.lat) < 1.7 && ego.s > a.s) {
    // never drive into the vehicle in front, even when it has stopped
    const gap = ego.s - ego.len / 2 - (a.s + a.len / 2);
    if (gap < 6 + a.v * 1.5) vt = Math.max(0, Math.min(vt, ego.v + (gap - 6) * 0.5));
  }
  const accel = a.phase === 'brake' ? 8 : 2.4;
  const before = a.v;
  a.v = a.v < vt ? Math.min(vt, a.v + 2.4 * dt) : Math.max(vt, a.v - accel * dt);
  a.acc = (a.v - before) / dt;
  a.s += a.v * a.dir * dt;
}

function driveEgo(dt) {
  const front = ego.s + 2.2;
  let vt = V_LIM;
  let reason = 'cruise';
  let text = 'On the way';
  let stopS = null;
  brain.light = null;
  brain.lightDist = Infinity;
  brain.ped = false;
  brain.pedDist = Infinity;
  brain.lead = null;
  brain.gap = Infinity;
  brain.free = 80;
  const lower = (v, why, txt, stop) => {
    if (v < vt - 0.05) {
      vt = v;
      reason = why;
      text = txt;
      stopS = stop ?? null;
    }
  };

  // bends
  for (let d = 0; d <= 70; d += 3) {
    const vc = curveSpeed(route.curvatureAt(ego.s + d), 2.6, V_LIM);
    const allowed = Math.sqrt(vc * vc + 2 * 2.2 * d);
    if (allowed < vt - 0.3) lower(allowed, 'turn', 'Slowing for the turn');
  }

  // the end of the route
  const endDist = route.length - 2.5 - front;
  if (endDist < 90) lower(stopSpeed(endDist, 2.2), 'arrive', 'Arriving', route.length - 2.5);

  // the next signal
  for (let k = 1; k < legs.length; k++) {
    const sStop = route.nodeS[k] - STOP_BACK;
    const dist = sStop - front;
    if (dist < -2.5) continue;
    const dirIdx = dirBetween(city, legs[k - 1].a, legs[k - 1].b);
    const st = lightState(legs[k].a, dirIdx % 2, T);
    brain.light = st;
    brain.lightDist = dist;
    brain.lightS = sStop;
    if (dist < 110 && mustStopForLight({ state: st, dist, v: ego.v })) {
      lower(stopSpeed(dist - 0.4, 2.8), 'light', `Stopping at the ${st} light`, sStop);
    }
    break;
  }

  // people on a crossing
  for (const cw of crossings) {
    const dist = cw.s - 3.6 - front;
    if (dist < -3 || dist > 70) continue;
    const onRoad = cw.peds.some((p) => p.state === 'cross' && p.lat > -2.6 && p.lat < 6.3);
    const aboutTo = cw.peds.some((p) => p.state === 'wait' && cw.s - ego.s < 48);
    brain.pedDist = Math.min(brain.pedDist, dist);
    brain.ped = true;
    if (onRoad) lower(stopSpeed(dist - 0.5, 2.6), 'ped', 'Giving way to pedestrians', cw.s - 3.6);
    else if (aboutTo || cw.peds.some((p) => p.state === 'cross'))
      lower(Math.max(stopSpeed(dist, 2.6), 5.5), 'ped', 'Slowing for the crossing');
  }

  // the vehicle ahead
  let lead = null;
  for (const a of actors) {
    if (a.dir < 0 || a.kind === 'ped' || (a === ego.target && ego.mode !== 'drive')) continue;
    if (Math.abs(a.lat - ego.lat) > 1.7) continue;
    const gap = a.s - a.len / 2 - front;
    if (gap > -3 && (!lead || gap < lead.gap)) lead = { a, gap };
  }
  if (lead && lead.gap < 85) {
    brain.lead = lead.a;
    brain.gap = lead.gap;
    brain.free = Math.min(brain.free, lead.gap);
    const vf = followSpeed({ gap: lead.gap, v: ego.v, vLead: lead.a.v });
    if (vf < vt - 0.1) {
      const hard = ego.acc < -4 || lead.a.phase === 'brake';
      lower(vf, hard ? 'brake' : 'follow', hard ? 'Braking hard' : 'Following the car ahead');
    }
  }
  if (isFinite(brain.lightDist) && brain.light !== 'green' && brain.lightDist < 90)
    brain.free = Math.min(brain.free, Math.max(0, brain.lightDist));
  if (brain.ped && brain.pedDist < 80)
    brain.free = Math.min(brain.free, Math.max(0, brain.pedDist));

  // overtaking
  decideOvertake(lead);
  if (ego.mode !== 'drive') {
    if (reason === 'cruise' || reason === 'turn') {
      reason = 'overtake';
      text = 'Overtaking';
    }
  } else if (brain.ovt.startsWith('Waiting') && reason === 'follow') {
    reason = 'wait-ovt';
    text = 'Waiting to overtake';
  }

  // the speed controller
  const accCmd = clamp(1.7 * (vt - ego.v), -8, 2.0);
  ego.acc = lerp(ego.acc, accCmd, 1 - Math.exp(-dt * 10));
  ego.v = Math.max(0, ego.v + ego.acc * dt);
  if (ego.v < 0.02 && vt < 0.05) ego.v = 0;
  ego.s += ego.v * dt;
  const following =
    brain.lead && (reason === 'follow' || reason === 'wait-ovt' || reason === 'brake');
  ego.followT = following ? ego.followT + dt : 0;
  brain.maxDecel = Math.max(brain.maxDecel * (1 - dt * 0.5), -ego.acc);
  if (ego.acc < -5.2 && !brain.hardLogged) {
    brain.hardLogged = true;
  }
  if (ego.acc > -2) brain.hardLogged = false;
  brain.vt = vt;
  brain.stopS = stopS;
  brain.reason = reason;
  brain.waitT =
    reason === 'light' && ego.v < 0.3 ? brain.waitT + dt : reason === 'light' ? brain.waitT : 0;
  brain.text = text;
  if (reason === 'light' && ego.v < 0.4 && !brain.redCounted) {
    stats.redStops++;
    brain.redCounted = true;
  }
  if (reason !== 'light') brain.redCounted = false;
  if (reason === 'ped' && ego.v < 0.4 && !brain.yieldCounted) {
    stats.yields++;
    brain.yieldCounted = true;
  }
  if (reason !== 'ped') brain.yieldCounted = false;

  // sideways: a smooth move into the other lane and back
  const latTarget = ego.mode === 'out' || ego.mode === 'pass' ? OPP : 0;
  const want = clamp((latTarget - ego.lat) * 1.1, -1.5, 1.5);
  ego.latV = lerp(ego.latV, want, 1 - Math.exp(-dt * 4));
  ego.lat += ego.latV * dt;

  const p = route.pointAt(ego.s, ego.lat);
  ego.x = p.x;
  ego.y = p.y;
  ego.th = p.th + Math.atan2(ego.latV, Math.max(ego.v, 2));
}

function decideOvertake(lead) {
  brain.ovt = 'Not needed';
  brain.ovtBlock = null;
  brain.ovtPlan = null;
  if (ego.mode === 'drive') {
    if (!lead || lead.a.noPass || lead.a.v > 7.5 || lead.gap > 24 || ego.followT < 1.4) return;
    const plan = overtakePlan({
      gap: lead.gap,
      vLead: lead.a.v,
      leadLen: lead.a.len,
      vPass: V_LIM,
      margin: 7,
    });
    if (!plan) return;
    brain.ovtPlan = plan;
    brain.ovt = 'Checking the road';
    // somewhere it is not allowed: a junction, a crossing, a signal, a bend or the end of the route
    const from = ego.s;
    const to = ego.s + plan.distance + 16;
    const blockedBy =
      route.nodeS.some((s, k) => k > 0 && k < legs.length && s - 12 < to && s + 12 > from) ||
      crossings.some((c) => c.s > from - 6 && c.s < to) ||
      route.length - ego.s < plan.distance + 40;
    if (blockedBy) {
      brain.ovt = 'Not here: junction ahead';
      return;
    }
    const oncoming = actors.filter((a) => a.dir < 0).map((a) => ({ gap: a.s - ego.s, v: a.v, a }));
    const free = laneIsFree(plan, oncoming);
    if (!free.ok) {
      brain.ovt = `Waiting: oncoming ${Math.max(0, Math.round(free.blocker.gap))} m`;
      brain.ovtBlock = free.blocker;
      return;
    }
    ego.mode = 'out';
    ego.target = lead.a;
    ego.passLen = plan.distance;
    brain.ovt = 'Passing';
    return;
  }
  const t = ego.target;
  if (!t || t.gone || !actors.includes(t)) {
    ego.mode = 'merge';
    ego.target = null;
  }
  brain.ovt = ego.mode === 'merge' ? 'Returning to the lane' : 'Passing';
  if (ego.mode === 'out' && ego.lat > 2.6) ego.mode = 'pass';
  if (ego.mode === 'pass' && t && ego.s - 2.2 > t.s + t.len / 2 + 6) ego.mode = 'merge';
  if (ego.mode === 'merge' && ego.lat < 0.3) {
    if (ego.target) stats.overtakes++;
    ego.mode = 'drive';
    ego.target = null;
    ego.followT = 0;
  }
}

function collide() {
  for (const a of actors) {
    const world = actorPose(a);
    const d = Math.hypot(world.x - ego.x, world.y - ego.y);
    const lim = a.kind === 'ped' ? 1.5 : 3.2;
    if (d < lim && !a.hit) {
      a.hit = true;
      stats.collisions++;
      brain.lastHit = {
        kind: a.kind,
        d,
        mode: ego.mode,
        reason: brain.reason,
        v: ego.v,
        aS: a.s,
        aV: a.v,
        lat: a.lat,
        egoLat: ego.lat,
        phase: a.phase,
      };
    }
  }
}

/* ---------- drawing helpers ---------- */
const cam = { x: 0, y: 0 };
const toX = (x) => originX() + (x - cam.x) * SC;
const toY = (y) => originY() - (y - cam.y) * SC;
const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

function actorPose(a) {
  if (!route) return { x: 0, y: 0, th: 0 };
  const p = route.pointAt(a.s, a.lat);
  return { x: p.x, y: p.y, th: a.dir < 0 ? p.th + Math.PI : p.th };
}

function pathLine(pts) {
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(toX(p[0]), toY(p[1])) : g.moveTo(toX(p[0]), toY(p[1]))));
}

/* ---------- the city ---------- */
function drawCity() {
  const vx0 = cam.x - originX() / SC - 10;
  const vx1 = cam.x + (W - originX()) / SC + 10;
  const vy0 = cam.y - (H - originY()) / SC - 10;
  const vy1 = cam.y + originY() / SC + 10;
  const sp = city.spacing;
  const edge = HALF + 2.6;
  // blocks, and a ring of streets beyond the map so the edge is never bare
  g.fillStyle = 'rgba(255,255,255,.028)';
  g.strokeStyle = 'rgba(255,255,255,.07)';
  g.lineWidth = 1;
  for (let j = -1; j < city.rows; j++)
    for (let i = -1; i < city.cols; i++) {
      const x0 = i * sp + edge;
      const y0 = j * sp + edge;
      const w = sp - 2 * edge;
      if (x0 > vx1 || x0 + w < vx0 || y0 > vy1 || y0 + w < vy0) continue;
      g.beginPath();
      g.roundRect(toX(x0), toY(y0 + w), w * SC, w * SC, 10);
      g.fill();
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,.035)';
      const cols = 3;
      for (let b = 0; b < cols; b++) {
        const bw = (w - 8) / cols - 3;
        for (const [oy, hh] of [
          [4, (w - 8) * 0.38],
          [4 + (w - 8) * 0.5, (w - 8) * 0.5],
        ]) {
          g.beginPath();
          g.roundRect(toX(x0 + 4 + b * (bw + 3)), toY(y0 + oy + hh), bw * SC, hh * SC, 4);
          g.fill();
        }
      }
      g.fillStyle = 'rgba(255,255,255,.028)';
    }
  // roads
  g.lineCap = 'butt';
  g.strokeStyle = 'rgba(255,255,255,.075)';
  g.lineWidth = 2 * HALF * SC;
  g.beginPath();
  for (let i = -1; i <= city.cols; i++) {
    g.moveTo(toX(i * sp), toY(-sp - HALF));
    g.lineTo(toX(i * sp), toY(city.height + sp + HALF));
  }
  for (let j = -1; j <= city.rows; j++) {
    g.moveTo(toX(-sp - HALF), toY(j * sp));
    g.lineTo(toX(city.width + sp + HALF), toY(j * sp));
  }
  g.stroke();
  // centre lines
  g.strokeStyle = 'rgba(255,255,255,.22)';
  g.lineWidth = 1.2;
  g.setLineDash([10, 12]);
  g.beginPath();
  for (let i = -1; i <= city.cols; i++)
    for (let j = -2; j <= city.rows; j++) {
      g.moveTo(toX(i * sp), toY(j * sp + 6));
      g.lineTo(toX(i * sp), toY((j + 1) * sp - 6));
    }
  for (let j = -1; j <= city.rows; j++)
    for (let i = -2; i <= city.cols; i++) {
      g.moveTo(toX(i * sp + 6), toY(j * sp));
      g.lineTo(toX((i + 1) * sp - 6), toY(j * sp));
    }
  g.stroke();
  g.setLineDash([]);
  // stop lines and signals
  for (const n of city.nodes) {
    if (n.x < vx0 - 20 || n.x > vx1 + 20 || n.y < vy0 - 20 || n.y > vy1 + 20) continue;
    for (let d = 0; d < 4; d++) {
      const nb = city.id(n.i - DIRS[d][0], n.j - DIRS[d][1]);
      if (nb < 0) continue; // nothing comes from there
      const [dx, dy] = DIRS[d];
      const rx = dy;
      const ry = -dx;
      const sx = n.x - dx * STOP_BACK;
      const sy = n.y - dy * STOP_BACK;
      const st = lightState(city.id(n.i, n.j), d % 2, T);
      const col = LC[st];
      g.save();
      g.strokeStyle = rgba(col, 0.7);
      g.shadowColor = col;
      g.shadowBlur = 8;
      g.lineWidth = 0.55 * SC;
      g.beginPath();
      g.moveTo(toX(sx), toY(sy));
      g.lineTo(toX(sx + rx * HALF), toY(sy + ry * HALF));
      g.stroke();
      g.restore();
      // the signal head, on the right of the road
      const hx = sx + rx * (HALF + 1.2);
      const hy = sy + ry * (HALF + 1.2);
      g.fillStyle = '#0c0e13';
      g.beginPath();
      g.arc(toX(hx), toY(hy), 1.0 * SC, 0, TAU);
      g.fill();
      g.fillStyle = col;
      g.shadowColor = col;
      g.shadowBlur = 10;
      g.beginPath();
      g.arc(toX(hx), toY(hy), 0.62 * SC, 0, TAU);
      g.fill();
      g.shadowBlur = 0;
    }
  }
}

/* ---------- route layers ---------- */
function drawRoute() {
  if (!route) return;
  // the global route: what is behind is dim, what is ahead is bright
  g.save();
  g.lineJoin = 'round';
  g.lineCap = 'round';
  pathLine(route.line(0, ego.s, 0, 3));
  g.strokeStyle = rgba(GREEN, 0.18);
  g.lineWidth = 3;
  g.stroke();
  const ahead = route.line(ego.s, route.length, 0, 2);
  pathLine(ahead);
  g.strokeStyle = rgba(GREEN, 0.16);
  g.lineWidth = 12;
  g.stroke();
  g.setLineDash([2, 10]);
  g.lineDashOffset = -T * 30;
  pathLine(ahead);
  g.strokeStyle = rgba(GREEN, 0.95);
  g.lineWidth = 3.2;
  g.stroke();
  g.restore();
}

function drawLocal(a) {
  if (!route || a < 0.02) return;
  const latTarget = ego.mode === 'out' || ego.mode === 'pass' ? OPP : 0;
  const pts = [];
  for (let d = 0; d <= 40; d += 2) {
    const lat = latTarget + (ego.lat - latTarget) * Math.exp(-d / 9);
    const p = route.pointAt(ego.s + d, lat);
    pts.push([p.x, p.y]);
  }
  g.save();
  g.globalAlpha = a;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  pathLine(pts);
  g.strokeStyle = rgba(GREEN, 0.2);
  g.lineWidth = 14;
  g.stroke();
  pathLine(pts);
  g.strokeStyle = '#fff';
  g.shadowColor = GREEN;
  g.shadowBlur = 16;
  g.lineWidth = 3;
  g.stroke();
  g.shadowBlur = 0;
  // the stopping point
  if (brain.stopS != null && brain.stopS > ego.s) {
    const q = route.pointAt(brain.stopS, 0);
    const nx = -Math.sin(q.th);
    const ny = Math.cos(q.th);
    g.strokeStyle = RED;
    g.lineWidth = 3;
    g.shadowColor = RED;
    g.shadowBlur = 10;
    g.beginPath();
    g.moveTo(toX(q.x + nx * -1.8), toY(q.y + ny * -1.8));
    g.lineTo(toX(q.x + nx * 1.8), toY(q.y + ny * 1.8));
    g.stroke();
    g.shadowBlur = 0;
  }
  g.restore();
}

function drawActors(aLocal) {
  if (!route) return;
  for (const a of actors) {
    const p = actorPose(a);
    const sx = toX(p.x);
    const sy = toY(p.y);
    if (sx < -80 || sx > W + 80 || sy < -80 || sy > H + 80) continue;
    g.save();
    g.globalAlpha = clamp((T - a.born) * 2, 0, 1);
    if (a.kind === 'ped') {
      const th = p.th + (a.vlat > 0 ? Math.PI / 2 : -Math.PI / 2);
      if (a.state === 'cross' && aLocal > 0.05) {
        const gr = g.createRadialGradient(sx, sy, 0, sx, sy, 3 * SC);
        gr.addColorStop(0, 'rgba(255,214,10,.28)');
        gr.addColorStop(1, 'rgba(255,214,10,0)');
        g.fillStyle = gr;
        g.globalAlpha *= aLocal;
        g.beginPath();
        g.arc(sx, sy, 3 * SC, 0, TAU);
        g.fill();
        g.globalAlpha = clamp((T - a.born) * 2, 0, 1);
      }
      drawPedSprite(g, sx, sy, th, SC * 1.15);
    } else {
      if (aLocal > 0.05 && a.dir > 0 && a.s > ego.s) {
        const gr = g.createRadialGradient(sx, sy, 0, sx, sy, 5 * SC);
        gr.addColorStop(0, 'rgba(255,69,58,.22)');
        gr.addColorStop(1, 'rgba(255,69,58,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.arc(sx, sy, 5 * SC, 0, TAU);
        g.fill();
      }
      const off = a.len / 2 - 0.9;
      drawCarSprite(g, sx - Math.cos(p.th) * off * SC, sy + Math.sin(p.th) * off * SC, p.th, SC, {
        body: a.color,
        shade: '#6f7a90',
        brake: a.acc < -1.2,
      });
    }
    g.restore();
  }
}

function drawEgo() {
  if (!route) {
    drawCarSprite(g, toX(ego.x), toY(ego.y), ego.th, SC, {});
    return;
  }
  const off = ego.len / 2 - 0.9;
  drawCarSprite(
    g,
    toX(ego.x) - Math.cos(ego.th) * off * SC,
    toY(ego.y) + Math.sin(ego.th) * off * SC,
    ego.th,
    SC,
    {
      brake: ego.acc < -0.8,
    },
  );
  // gap to the vehicle ahead
  if (brain.lead && brain.gap < 60 && ego.mode === 'drive') {
    const a = brain.lead;
    const p = actorPose(a);
    g.save();
    g.strokeStyle = 'rgba(255,255,255,.55)';
    g.fillStyle = '#fff';
    g.font = `600 11px ${FONT}`;
    g.setLineDash([3, 4]);
    g.beginPath();
    g.moveTo(toX(ego.x + Math.cos(ego.th) * 2.4), toY(ego.y + Math.sin(ego.th) * 2.4));
    g.lineTo(toX(p.x - Math.cos(p.th) * (a.len / 2)), toY(p.y - Math.sin(p.th) * (a.len / 2)));
    g.stroke();
    g.setLineDash([]);
    g.fillText(
      `${Math.max(0, brain.gap).toFixed(0)} m`,
      (toX(ego.x) + toX(p.x)) / 2 - 8,
      (toY(ego.y) + toY(p.y)) / 2 - 8,
    );
    g.restore();
  }
}

function drawCrossings() {
  g.fillStyle = 'rgba(255,255,255,.34)';
  for (const cw of crossings) {
    for (let k = 0; k < 7; k++) {
      const p = route.pointAt(cw.s, -1.2 + k * 1.05);
      g.save();
      g.translate(toX(p.x), toY(p.y));
      g.rotate(-p.th);
      g.fillRect(-1.5 * SC, -0.36 * SC, 3 * SC, 0.72 * SC);
      g.restore();
    }
  }
}

function drawPin() {
  if (!pin) return;
  const t = clamp((T - pin.t0) / 0.7, 0, 1);
  const drop = (1 - t) * (1 - t) * 40 * (Math.abs(Math.sin(t * 5)) * 0.4 + 0.6);
  const p = route && !pending ? route.pointAt(route.length, 0) : { x: pin.x, y: pin.y };
  const x = toX(p.x);
  const y = toY(p.y);
  const inView = x > 30 && x < W - 30 && y > 30 && y < H - 30;
  if (!inView) {
    // an arrow at the edge of the screen pointing at it
    const dx = x - originX();
    const dy = y - originY();
    const k = Math.min((W / 2 - 40) / Math.abs(dx || 1), (H / 2 - 40) / Math.abs(dy || 1));
    const ex = originX() + dx * Math.min(k, 0.99);
    const ey = originY() + dy * Math.min(k, 0.99);
    const dist = Math.hypot(pin.x - ego.x, pin.y - ego.y);
    g.save();
    g.translate(clamp(ex, 30, W - 30), clamp(ey, 120, H - dockH() - 40));
    g.rotate(Math.atan2(dy, dx));
    g.fillStyle = RED;
    g.shadowColor = RED;
    g.shadowBlur = 12;
    g.beginPath();
    g.moveTo(14, 0);
    g.lineTo(-8, -8);
    g.lineTo(-8, 8);
    g.closePath();
    g.fill();
    g.restore();
    g.fillStyle = '#ffb3bb';
    g.font = `600 11px ${FONT}`;
    g.textAlign = 'center';
    g.fillText(
      `${Math.round(dist)} m`,
      clamp(ex, 30, W - 30),
      clamp(ey, 120, H - dockH() - 40) + 24,
    );
    g.textAlign = 'left';
    return;
  }
  g.save();
  // pulse
  const pulse = (T * 0.9) % 1;
  g.strokeStyle = `rgba(255,93,108,${0.5 * (1 - pulse)})`;
  g.lineWidth = 2;
  g.beginPath();
  g.arc(x, y, (1 + pulse * 5) * SC, 0, TAU);
  g.stroke();
  g.translate(x, y - drop * SC * 0.3);
  g.fillStyle = RED;
  g.shadowColor = RED;
  g.shadowBlur = 16;
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(-1.9 * SC, -2.4 * SC, -1.9 * SC, -5 * SC, 0, -5 * SC);
  g.bezierCurveTo(1.9 * SC, -5 * SC, 1.9 * SC, -2.4 * SC, 0, 0);
  g.fill();
  g.shadowBlur = 0;
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(0, -3.3 * SC, 0.7 * SC, 0, TAU);
  g.fill();
  g.font = `600 11px ${FONT}`;
  g.fillStyle = '#ffd0d5';
  g.textAlign = 'center';
  g.fillText('Destination', 0, -5.7 * SC);
  g.restore();
}

/* ---------- the map ---------- */
const MINI = { x: 0, y: 0, k: 1, w: 0, h: 0 };
function drawMini() {
  const s = sizeCanvas(mini);
  mg.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
  mg.clearRect(0, 0, s.w, s.h);
  const pad = 14;
  const k = Math.min((s.w - 2 * pad) / city.width, (s.h - 2 * pad) / city.height);
  MINI.k = k;
  MINI.x = (s.w - city.width * k) / 2;
  MINI.y = (s.h + city.height * k) / 2;
  MINI.w = s.w;
  MINI.h = s.h;
  const mx = (x) => MINI.x + x * k;
  const my = (y) => MINI.y - y * k;
  mg.strokeStyle = 'rgba(255,255,255,.2)';
  mg.lineWidth = 3;
  mg.lineCap = 'round';
  mg.beginPath();
  for (let i = 0; i < city.cols; i++) {
    mg.moveTo(mx(i * city.spacing), my(0));
    mg.lineTo(mx(i * city.spacing), my(city.height));
  }
  for (let j = 0; j < city.rows; j++) {
    mg.moveTo(mx(0), my(j * city.spacing));
    mg.lineTo(mx(city.width), my(j * city.spacing));
  }
  mg.stroke();
  // the planner searching
  const plan = pending || null;
  const expl = plan ? plan.expanded : route ? brain.explored : null;
  if (plan && expl) {
    const upto = Math.floor(expl.length * clamp((T - plan.t0) / (plan.dur * 0.85), 0, 1));
    mg.strokeStyle = 'rgba(94,224,255,.7)';
    mg.lineWidth = 2.2;
    mg.beginPath();
    for (let i = 0; i < upto; i++) {
      const e = expl[i];
      if (e.from < 0) continue;
      const A = city.nodes[e.from];
      const B = city.nodes[e.node];
      mg.moveTo(mx(A.x), my(A.y));
      mg.lineTo(mx(B.x), my(B.y));
    }
    mg.stroke();
    mg.fillStyle = '#5ee0ff';
    for (let i = 0; i < upto; i++) {
      const N = city.nodes[expl[i].node];
      mg.beginPath();
      mg.arc(mx(N.x), my(N.y), 2.6, 0, TAU);
      mg.fill();
    }
  }
  // the route
  const nodes =
    plan && T - plan.t0 > plan.dur * 0.85 ? plan.nodes : route && !plan ? brain.routeNodes : null;
  if (nodes) {
    mg.strokeStyle = GREEN;
    mg.lineWidth = 3;
    mg.shadowColor = GREEN;
    mg.shadowBlur = 8;
    mg.beginPath();
    nodes.forEach((p, i) => (i ? mg.lineTo(mx(p[0]), my(p[1])) : mg.moveTo(mx(p[0]), my(p[1]))));
    mg.stroke();
    mg.shadowBlur = 0;
  }
  // the pin
  if (pin) {
    const x = mx(pin.x);
    const y = my(pin.y);
    mg.fillStyle = RED;
    mg.shadowColor = RED;
    mg.shadowBlur = 10;
    mg.beginPath();
    mg.arc(x, y - 5, 4.5, Math.PI, 0);
    mg.lineTo(x, y);
    mg.closePath();
    mg.fill();
    mg.shadowBlur = 0;
    mg.fillStyle = '#fff';
    mg.beginPath();
    mg.arc(x, y - 6, 1.6, 0, TAU);
    mg.fill();
  }
  // the vehicle
  mg.save();
  mg.translate(mx(ego.x), my(ego.y));
  mg.rotate(-ego.th);
  mg.fillStyle = '#fff';
  mg.beginPath();
  mg.moveTo(6, 0);
  mg.lineTo(-4, -3.6);
  mg.lineTo(-4, 3.6);
  mg.closePath();
  mg.fill();
  mg.restore();
}

mini.addEventListener('pointerdown', (e) => {
  const r = mini.getBoundingClientRect();
  const x = (e.clientX - r.left - MINI.x) / MINI.k;
  const y = (MINI.y - (e.clientY - r.top)) / MINI.k;
  const hint = $('miniHint');
  hint.textContent = 'Planning…';
  setTimeout(() => (hint.textContent = 'Click to drop a pin'), 1800);
  if (dropPin(x, y)) {
    focus = 0;
    focusOverride = { i: 0, until: T + 4 };
    renderCard();
  }
});

/* ---------- scenarios ---------- */
const NAMES = [
  'Destination',
  'Slow traffic',
  'Overtaking',
  'Signals',
  'Sudden braking',
  'Pedestrians',
];
const TITLE = [
  'Plan the way there',
  'Slow down behind traffic',
  'Overtake when it is safe',
  'Stop at the light',
  'Brake hard when it must',
  'Give way to people',
];
const DESC = [
  'Drop a pin on the map. A global planner finds the route over the street network, then a local planner keeps the vehicle on it.',
  'It keeps a safe time gap to the vehicle ahead and matches its speed, never going faster than it could stop in.',
  'If the vehicle ahead stays slow, it checks the opposite lane for oncoming traffic, junctions and crossings, then swings out, passes and returns.',
  'It reads the signal ahead and stops at the line on red, or on yellow when it cannot clear the junction.',
  'When the vehicle ahead stops suddenly, it brakes at once, as hard as needed, and keeps its distance.',
  'It slows for a crossing, stops short of the stripes while anyone is on the road, and moves off once it is clear.',
];
let focus = 0;
const REASON_CHIP = {
  idle: 0,
  cruise: 0,
  turn: 0,
  arrive: 0,
  follow: 1,
  'wait-ovt': 2,
  overtake: 2,
  light: 3,
  brake: 4,
  ped: 5,
};
const rail = buildRail(NAMES, (i) => {
  focusOverride = { i, until: T + 9 };
  focus = i;
  renderCard();
  if (i === 0 || !queued.includes(i)) {
    if (!trigger(i)) queued.push(i);
  }
});
function renderCard() {
  $('dName').textContent = TITLE[focus];
  $('dDesc').textContent = DESC[focus];
}
renderCard();

/* ---------- frame ---------- */
const layer = { local: 0.0 };
function draw(now) {
  const dt = Math.min(0.05, (now - (draw.last || now)) / 1000);
  draw.last = now;
  // what the card shows: the behaviour in effect, unless the visitor picked one
  let want = REASON_CHIP[brain.reason] ?? 0;
  if (pending) want = 0;
  if (focusOverride && T < focusOverride.until) want = focusOverride.i;
  else focusOverride = null;
  if (want !== focus) {
    focus = want;
    renderCard();
  }
  rail.set(focus, 0);
  layer.local = lerp(layer.local, 1, 1 - Math.exp(-dt * 3));

  // camera
  const lead = W < 800 ? 12 : 16;
  const tx = ego.x + Math.cos(ego.th) * lead;
  const ty = ego.y + Math.sin(ego.th) * lead;
  if (Math.hypot(cam.x - tx, cam.y - ty) > 80) {
    cam.x = tx;
    cam.y = ty;
  }
  cam.x = lerp(cam.x, tx, 1 - Math.exp(-dt * 3));
  cam.y = lerp(cam.y, ty, 1 - Math.exp(-dt * 3));

  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawDotGrid(g, W, H, cam.x + (W / 2 - originX()) / SC, cam.y - (H / 2 - originY()) / SC, SC, 10);
  drawCity();
  if (route) drawCrossings();
  drawRoute();
  drawLocal(layer.local);
  drawActors(layer.local);
  drawEgo();
  drawPin();
  drawMini();
  ui(now);
}

/* ---------- dock ---------- */
let lastUi = 0;
const kmh = (v) => Math.round(v * 3.6);
function turnAhead() {
  if (!route) return '—';
  for (let k = 1; k < legs.length; k++) {
    const d = route.nodeS[k] - ego.s;
    if (d < -4) continue;
    const a = dirBetween(city, legs[k - 1].a, legs[k - 1].b);
    const b = dirBetween(city, legs[k].a, legs[k].b);
    const diff = (b - a + 4) % 4;
    if (diff === 0) continue;
    return `${diff === 1 ? 'Left' : 'Right'} in ${Math.max(0, Math.round(d))} m`;
  }
  return 'None';
}
function ui(now) {
  if (now - lastUi < 100) return;
  lastUi = now;
  const left = route ? Math.max(0, route.length - ego.s) : 0;
  const avg = Math.max(5.5, ego.v);
  spdSeries.push(T, { act: kmh(ego.v), plan: kmh(brain.vt) });
  gapSeries.push(T, { gap: brain.free });
  const mins = Math.floor(left / avg / 60);
  const secs = Math.round(left / avg) % 60;
  $('dSp').innerHTML = `${kmh(ego.v)}<small>km/h</small>`;
  $('dLeft').textContent = route ? `${Math.round(left)} m` : '—';
  $('dNext').textContent = turnAhead();
  $('dEta').textContent = route ? `${mins}:${String(secs).padStart(2, '0')}` : '—';

  const rLen = route ? route.length : 0;
  const lead = brain.lead;
  const nearOnc = actors.filter((a) => a.dir < 0 && a.s > ego.s - 10).sort((p, q) => p.s - q.s)[0];
  const rows = [
    [
      ['Route', route ? `${rLen.toFixed(0)} m` : '—'],
      ['Turns', route ? brain.turns : '—'],
      ['Nodes searched', route ? brain.expanded : '—'],
    ],
    [
      ['Gap', lead ? `${Math.max(0, brain.gap).toFixed(0)} m` : '—'],
      ['Time gap', lead && ego.v > 0.5 ? `${(Math.max(0, brain.gap) / ego.v).toFixed(1)} s` : '—'],
      ['Car ahead', lead ? `${kmh(lead.v)} km/h` : '—'],
    ],
    [
      [
        'Decision',
        ego.mode !== 'drive'
          ? 'Passing'
          : brain.ovt.startsWith('Waiting')
            ? 'Waiting'
            : lead && !lead.noPass
              ? 'Checking'
              : '—',
      ],
      ['Oncoming', nearOnc ? `${Math.max(0, Math.round(nearOnc.s - ego.s))} m` : 'None'],
      [
        'Pass length',
        ego.mode !== 'drive'
          ? `${Math.round(ego.passLen)} m`
          : brain.ovtPlan
            ? `${Math.round(brain.ovtPlan.distance)} m`
            : '—',
      ],
    ],
    [
      ['Signal', brain.light ?? '—'],
      [
        'To the line',
        isFinite(brain.lightDist) ? `${Math.max(0, Math.round(brain.lightDist))} m` : '—',
      ],
      ['Waiting', brain.reason === 'light' && ego.v < 0.4 ? `${brain.waitT.toFixed(0)} s` : '—'],
    ],
    [
      ['Braking', `${Math.max(0, -ego.acc).toFixed(1)} m/s²`],
      ['Gap', lead ? `${Math.max(0, brain.gap).toFixed(0)} m` : '—'],
      ['Hard brakes', stats.hardBrakes],
    ],
    [
      ['People on road', actors.filter((a) => a.kind === 'ped' && a.state === 'cross').length],
      [
        'To crossing',
        isFinite(brain.pedDist) ? `${Math.max(0, Math.round(brain.pedDist))} m` : '—',
      ],
      ['Gave way', stats.yields],
    ],
  ][focus];
  setMetrics(rows);

  setTile('t-glob', route ? `${brain.turns} turns` : 'Planning…', focus === 0, pending ? 'a' : '');
  setTile(
    't-loc',
    ego.mode !== 'drive' ? 'Passing' : 'On the route',
    ego.mode !== 'drive' || focus === 0,
    ego.mode !== 'drive' ? 'a' : '',
  );
  setTile(
    't-veh',
    lead
      ? brain.reason === 'brake'
        ? 'Hard brake'
        : `${Math.max(0, brain.gap).toFixed(0)} m ahead`
      : 'Clear',
    focus === 1 || focus === 4,
    brain.reason === 'brake' ? 'r' : lead && brain.gap < 25 ? 'a' : '',
  );
  setTile(
    't-sig',
    brain.light
      ? `${brain.light[0].toUpperCase()}${brain.light.slice(1)} ${Math.max(0, Math.round(brain.lightDist))}m`
      : 'None ahead',
    focus === 3,
    brain.light === 'red' ? 'r' : brain.light === 'yellow' ? 'a' : '',
  );
  setTile(
    't-ped',
    brain.reason === 'ped' ? 'Giving way' : brain.ped ? 'Crossing ahead' : 'None',
    focus === 5,
    brain.reason === 'ped' ? 'a' : '',
  );
  setTile(
    't-ovt',
    brain.ovt.length > 13 ? brain.ovt.split(':')[0] : brain.ovt,
    focus === 2,
    ego.mode !== 'drive' ? 'a' : '',
  );

  let cls = 'info';
  let txt = pending ? 'Planning the route…' : brain.text;
  if (brain.reason === 'brake') cls = 'bad';
  else if (['follow', 'wait-ovt', 'light', 'ped', 'overtake', 'turn'].includes(brain.reason))
    cls = 'warn';
  if (arrivedAt >= 0) {
    txt = 'Arrived';
    cls = '';
  }
  if (!route && !pending) txt = 'Pick a destination';
  setStatus(cls, `${txt} · ${kmh(ego.v)} km/h`);

  drawChart(
    $('chS'),
    spdSeries,
    [
      { key: 'plan', color: '#8fa0bd', dash: [4, 4], width: 1.4 },
      { key: 'act', color: '#3e9bff', fill: ['rgba(62,155,255,.26)', 'rgba(62,155,255,0)'] },
    ],
    { min: 0, max: 50, ticks: [0, 20, 40] },
  );
  drawChart(
    $('chG'),
    gapSeries,
    [{ key: 'gap', color: GREEN, fill: ['rgba(48,209,88,.24)', 'rgba(48,209,88,0)'] }],
    { min: 0, max: 80, ticks: [0, 40, 80] },
  );
}

/* ---------- start ---------- */
START.a = city.id(1, 2);
START.b = city.id(2, 2);
egoEdge.a = START.a;
egoEdge.b = START.b;
ego.x = city.nodes[START.a].x + 55;
ego.y = city.nodes[START.a].y - LANE;
cam.x = ego.x;
cam.y = ego.y;
resize();
randomPin();
startLoop(step, draw);

/* Test hooks, only with ?debug in the address. */
if (new URLSearchParams(location.search).has('debug')) {
  window.__sim = (sec) => {
    for (let t = 0; t < sec; t += 1 / 60) step(1 / 60);
    cam.x = ego.x + Math.cos(ego.th) * 16;
    cam.y = ego.y + Math.sin(ego.th) * 16;
  };
  window.__dbg = () => ({
    t: T,
    reason: brain.reason,
    v: ego.v,
    mode: ego.mode,
    s: ego.s,
    len: route ? route.length : 0,
    stats: { ...stats },
    pin: !!pin,
    actors: actors.length,
    ovt: brain.ovt,
    busy: eventBusy(),
    script: scriptIdx,
    since: T - lastEvent,
    override: !!override,
    queued: queued.length,
    arrivedAt,
    pending: !!pending,
    hit: brain.lastHit || null,
    list: actors.map((a) => ({ k: a.kind, s: Math.round(a.s), v: +a.v.toFixed(1), ph: a.phase })),
    followT: ego.followT,
    gap: brain.gap,
  });
  window.__trigger = (i) => trigger(i);
}
