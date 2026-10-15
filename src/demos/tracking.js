import { $, FONT, TAU, clamp, lerp } from './common.js';
import { UkfTracker } from '../algos/ukf-tracker.js';
import { ctrv } from '../algos/ukf.js';
import { segmentHitsBox } from '../algos/geometry.js';
import { gaussian, mulberry32 } from '../core/random.js';
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
import { drawBikeSprite, drawCarSprite, drawPedSprite, drawTruckSprite } from './sprites.js';

/*
 * Object tracking, told as four short scenes: a car ahead, traffic coming the other way, people on
 * the pavement, and a slow car the vehicle overtakes. Every tenth of a second a simulated lidar
 * reports a noisy position for each road user it can see (anything behind another vehicle is
 * hidden), plus the odd false alarm. One UKF per object turns those into tracks with a stable id,
 * a speed and a heading. What is drawn is a lightly smoothed copy of each track, so the output holds
 * still, and the vehicle's own decisions (follow, wait, overtake) are made from the tracks alone.
 */

const TR = '#2dd4bf';
const SCAN = '#5ac8fa';
const CLS_COLOR = { car: '#8fb4ff', truck: '#c3a5ff', pedestrian: '#ffd6a5', cyclist: '#9be15d' };
const CLS_NAME = { car: 'Car', truck: 'Truck', pedestrian: 'Pedestrian', cyclist: 'Cyclist' };
const LANE = 1.8;
const TICK = 0.1;
const RANGE = 46;

const rnd = mulberry32(17);
const gauss = gaussian(rnd);
const between = (a, b) => a + (b - a) * rnd();
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/* ---------- canvas ---------- */
const cv = $('scene');
const g = cv.getContext('2d');
let W = 0;
let H = 0;
let SC = 12;
let DPR = 1;
const dockH = () => (W < 800 ? 200 : 206) + (W < 800 ? 12 : 18);
const originX = () => (W < 800 ? W * 0.3 : W * 0.22);
const originY = () => (W < 800 ? H * 0.38 : (H - dockH() - 20) / 2 + 6);
function resize() {
  const s = sizeCanvas(cv);
  W = s.w;
  H = s.h;
  DPR = s.dpr;
  SC = W < 800 ? clamp(W / 40, 6.5, 11) : clamp(Math.min(W / 78, H / 44), 8, 16);
}
addEventListener('resize', resize);

/* ---------- world ---------- */
const ego = { x: 0, y: -LANE, yaw: 0, v: 6, acc: 0, len: 4.4, wid: 1.9, cruise: 7.5 };
let actors = [];
let T = 0;
let nextActor = 1;
let nextClutter = 3;
const lidar = () => ({ x: ego.x + 1.4, y: ego.y });

function add(o) {
  const a = { id: nextActor++, born: T, yaw: 0, speed: 0, goal: null, ...o };
  a.goal = a.goal == null ? a.speed : a.goal;
  actors.push(a);
  return a;
}
const vehicle = (o) => add({ cls: 'car', len: 4.4, wid: 1.9, ...o, goal: o.speed });
const walker = (x, y, dir, speed) =>
  add({ cls: 'pedestrian', len: 0.7, wid: 0.7, x, y, yaw: dir > 0 ? 0 : Math.PI, speed });

function moveActor(a, dt) {
  a.speed = lerp(a.speed, a.goal, 1 - Math.exp(-dt * 1.4));
  a.x += a.speed * Math.cos(a.yaw) * dt;
  a.y += a.speed * Math.sin(a.yaw) * dt;
}

/* ---------- the scenes ---------- */
const lead = { actor: null };
const SCENES = [
  {
    name: 'Car ahead',
    title: 'A car in front',
    desc: 'The car ahead gets an id and a speed. When it speeds up or slows down, the estimate follows, and the vehicle keeps its distance.',
    cruise: 7.8,
    min: 14,
    start() {
      lead.actor = vehicle({ x: ego.x + 48, y: -LANE, speed: 6 });
    },
    run(t) {
      const a = lead.actor;
      if (t > 4.5) a.goal = 7.2;
      if (t > 8) a.goal = 5.2;
      if (t > 12) a.goal = 15;
    },
  },
  {
    name: 'Oncoming',
    title: 'Traffic from the other way',
    desc: 'A car and then a truck come down the other lane. Each is picked up at long range with its own id, speed and path.',
    cruise: 7,
    min: 11,
    start() {
      vehicle({ x: ego.x + 62, y: LANE, yaw: Math.PI, speed: 9 });
      vehicle({
        cls: 'truck',
        len: 8.8,
        wid: 2.5,
        x: ego.x + 112,
        y: LANE,
        yaw: Math.PI,
        speed: 8,
      });
    },
    run() {},
  },
  {
    name: 'Pedestrians',
    title: 'People on the pavement',
    desc: 'Walkers on both pavements are tracked at walking pace, and the filter keeps a pair of people apart.',
    cruise: 5.5,
    min: 15,
    start() {
      walker(ego.x + 36, 6.8, -1, 1.3);
      walker(ego.x + 48, 8, -1, 1.1);
      walker(ego.x + 51.5, 7, -1, 1);
      walker(ego.x + 20, -7.2, 1, 1.4);
      walker(ego.x + 58, -7.7, -1, 1.2);
    },
    run() {},
  },
  {
    name: 'Overtake',
    title: 'The car ahead slows down',
    desc: 'Its tracked speed drops, so the vehicle waits for the left lane to be clear, then overtakes and moves back.',
    cruise: 7.8,
    min: 8,
    start() {
      lead.actor = vehicle({ x: ego.x + 48, y: -LANE, speed: 7 });
      this.oncoming = false;
    },
    run(t) {
      const a = lead.actor;
      if (t > 2.5) a.goal = 3;
      // a car comes the other way just as the vehicle catches up, so it has to wait
      if (!this.oncoming && ahead && ahead.d.x - (ego.x + 2.4) < 24) {
        this.oncoming = true;
        vehicle({ x: ego.x + 56, y: LANE, yaw: Math.PI, speed: 9 });
      }
    },
    done: () => lead.actor && lead.actor.x < ego.x - 14 && mode === 'follow',
  },
];
let scene = 0;
let sceneT = 0;
let locked = false;

function startScene(i) {
  scene = i;
  sceneT = 0;
  ego.cruise = SCENES[i].cruise;
  SCENES[i].start();
  renderCard();
}

/* ---------- the vehicle: follows, waits and overtakes from the tracks ---------- */
let mode = 'follow'; // follow | out | pass | in
let egoWhy = 'Cruising';
let ahead = null; // the tracked vehicle in our lane
let passing = 0; // id of the track being overtaken

const isVehicle = (t) => t.cls === 'car' || t.cls === 'truck';
// shown and acted on only once a track has settled
const settled = (t) => t.state !== 'tentative' && t.hits >= 6 && t.d;
const confirmed = () => tracker.tracks.filter(settled);

function leftFree() {
  return !confirmed().some(
    (t) => isVehicle(t) && t.d.y > 0.3 && t.d.x > ego.x - 10 && t.d.x < ego.x + RANGE,
  );
}

function egoTarget() {
  const front = ego.x + 2.4;
  ahead = null;
  for (const t of confirmed()) {
    const dx = t.d.x - front;
    if (isVehicle(t) && t.d.y < 0 && Math.abs(t.d.y + LANE) < 1.4 && dx > -2 && dx < 45)
      if (!ahead || dx < ahead.d.x - front) ahead = t;
  }
  if (mode === 'follow') {
    let vt = ego.cruise;
    let why = 'Cruising';
    if (ahead) {
      const dx = ahead.d.x - front;
      const v = Math.hypot(ahead.d.vx, ahead.d.vy);
      const want = Math.max(0, v + 0.5 * (dx - (5 + 0.9 * ego.v)));
      if (want < vt) {
        vt = want;
        why = 'Following';
      }
      if (v < ego.cruise - 2.2 && dx < 16 && sceneIsOvertake()) {
        if (leftFree()) {
          mode = 'out';
          passing = ahead.id;
        } else why = 'Waiting for a gap';
      }
    }
    if (mode === 'follow') return [vt, why, -LANE];
  }
  if (mode === 'out') {
    if (Math.abs(ego.y - LANE) < 0.08) mode = 'pass';
    return [9.5, 'Overtaking', LANE];
  }
  if (mode === 'pass') {
    const p = tracker.tracks.find((t) => t.id === passing);
    if (!p || !p.d || p.d.x < ego.x - 8) mode = 'in';
    return [9.5, 'Overtaking', LANE];
  }
  if (Math.abs(ego.y + LANE) < 0.08) mode = 'follow';
  return [8, 'Back in lane', -LANE];
}
const sceneIsOvertake = () => scene === 3;

/* ---------- lidar ---------- */
const sigmaAt = (r) => 0.07 + 0.005 * r;

function hidden(a, L) {
  for (const b of actors) {
    if (b === a || b.cls === 'pedestrian') continue;
    if (segmentHitsBox(L.x, L.y, a.x, a.y, b.x, b.y, b.yaw, b.len, b.wid)) return true;
  }
  return false;
}

/** Perimeter returns of a box, on the side facing the sensor. */
function returns(a, L) {
  const pts = [];
  const c = Math.cos(a.yaw);
  const s = Math.sin(a.yaw);
  const n = a.cls === 'pedestrian' ? 5 : a.cls === 'cyclist' ? 6 : 12;
  for (let i = 0; i < n; i++) {
    const u = rnd() * TAU;
    const hl = a.len / 2;
    const hw = a.wid / 2;
    const k = 1 / Math.max(Math.abs(Math.cos(u)) / hl, Math.abs(Math.sin(u)) / hw);
    const lx = Math.cos(u) * k;
    const ly = Math.sin(u) * k;
    const px = a.x + lx * c - ly * s;
    const py = a.y + lx * s + ly * c;
    // keep only the faces that look at the sensor
    const nx = Math.abs(lx / hl) > Math.abs(ly / hw) ? Math.sign(lx) * c : -Math.sign(ly) * s;
    const ny = Math.abs(lx / hl) > Math.abs(ly / hw) ? Math.sign(lx) * s : Math.sign(ly) * c;
    if (nx * (L.x - px) + ny * (L.y - py) > 0) pts.push([px, py]);
  }
  return pts;
}

/* ---------- tracking ---------- */
const tracker = new UkfTracker({
  maxCoast: 26,
  confirmHits: 3,
  noise: { accel: 2.2, yawAccel: 1, meas: 0.25 },
  rescue: 2.6,
});
const stat = {
  dets: [],
  points: [],
  pairs: [],
  born: 0,
  rejected: 0,
  recovered: 0,
  longestGap: 0,
  blind: [],
  rawErr: 0,
  trkErr: 0,
  tickT: 0,
  pick: null,
  sensed: 0,
};
const errSeries = new Series(20);
const spdSeries = new Series(20);
const flashes = []; // brief rings where a new detection started a track

function tick() {
  const L = lidar();
  const dets = [];
  const points = [];
  const blind = [];
  let rawSum = 0;
  let rawN = 0;
  for (const a of actors) {
    const r = Math.hypot(a.x - L.x, a.y - L.y);
    if (r > RANGE || a.x < L.x - 24) continue;
    if (hidden(a, L)) {
      blind.push(a);
      continue;
    }
    points.push(...returns(a, L));
    if (rnd() < 0.02) continue;
    const sg = sigmaAt(r);
    const d = { x: a.x + sg * gauss(), y: a.y + sg * gauss(), cls: a.cls, truth: a.id, range: r };
    rawSum += Math.hypot(d.x - a.x, d.y - a.y);
    rawN++;
    dets.push(d);
  }
  if (T > nextClutter) {
    nextClutter = T + between(3, 5);
    dets.push({
      x: L.x + between(12, 36),
      y: between(-8, 8),
      cls: rnd() < 0.5 ? 'car' : 'pedestrian',
      truth: -1,
      range: 20,
    });
  }

  const before = new Map(tracker.tracks.map((t) => [t.id, t.state]));
  const res = tracker.step(TICK, dets);
  for (const { track: t } of res.pairs) {
    if (before.get(t.id) === 'coasting') {
      if ((t.gapT || 0) >= 0.5) stat.recovered++;
      t.gapT = 0;
    }
  }
  for (const t of res.born) flashes.push({ x: t.filter.x[0], y: t.filter.x[1], t: 0 });
  for (const t of res.dropped) if (t.hits < 3) stat.rejected++;
  // a track that has left the sensor's field is forgotten, not coasted
  tracker.tracks = tracker.tracks.filter(
    (t) =>
      t.filter.x[0] > L.x - 26 && Math.hypot(t.filter.x[0] - L.x, t.filter.x[1] - L.y) < RANGE + 6,
  );
  for (const t of tracker.tracks) {
    if (t.state === 'coasting') {
      t.gapT = (t.gapT || 0) + TICK;
      stat.longestGap = Math.max(stat.longestGap, t.gapT);
    }
  }

  let trkSum = 0;
  let trkN = 0;
  for (const { track: t, det } of res.pairs) {
    const a = actors.find((q) => q.id === det.truth);
    if (!a || t.state === 'tentative') continue;
    trkSum += Math.hypot(t.filter.x[0] - a.x, t.filter.x[1] - a.y);
    trkN++;
  }
  stat.dets = dets;
  stat.points = points.map(([x, y]) => ({ x, y, t: 0 }));
  stat.pairs = res.pairs;
  stat.born = res.born.length;
  stat.blind = blind;
  stat.tickT = T;
  stat.sensed = points.length;
  if (rawN && trkN) {
    stat.rawErr = lerp(stat.rawErr || rawSum / rawN, rawSum / rawN, 0.25);
    stat.trkErr = lerp(stat.trkErr || trkSum / trkN, trkSum / trkN, 0.25);
  }
  errSeries.push(T, { raw: stat.rawErr, trk: stat.trkErr });

  // the object whose speed we chart: the nearest confirmed track ahead, kept while it lasts
  let pick = tracker.tracks.find(
    (t) => t.id === stat.pick && t.state !== 'tentative' && t.filter.x[0] > ego.x,
  );
  if (!pick) {
    let best = Infinity;
    for (const t of tracker.tracks) {
      if (t.state === 'tentative' || !t.lastDet) continue;
      const d = t.filter.x[0] - ego.x;
      if (d > 3 && d < best) {
        best = d;
        pick = t;
      }
    }
  }
  stat.pick = pick ? pick.id : null;
  if (pick && pick.d && pick.lastDet) {
    const truth = actors.find((q) => q.id === pick.lastDet.truth);
    if (truth)
      spdSeries.push(T, {
        est: Math.hypot(pick.d.vx, pick.d.vy) * 3.6,
        truth: truth.speed * 3.6,
      });
  }
}

/**
 * What gets drawn, and what the vehicle reacts to: a smoothed copy of each track. It moves on by its
 * own speed every frame and is nudged toward the filter's estimate, so it neither jumps at every
 * scan nor lags behind. Heading comes from the direction of travel, and stays put when still.
 */
function smoothTracks(dt) {
  const k = (tc) => 1 - Math.exp(-dt / tc);
  const since = Math.max(0, T - stat.tickT);
  for (const t of tracker.tracks) {
    if (t.state === 'tentative') continue;
    const f = t.filter;
    const [vx, vy] = f.velocity;
    const tx = f.x[0] + vx * since;
    const ty = f.x[1] + vy * since;
    const e = f.ellipse(2);
    let d = t.d;
    if (!d) {
      t.d = d = { x: tx, y: ty, vx, vy, yaw: Math.atan2(vy, vx), ea: e.a, eb: e.b };
      continue;
    }
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.x += (tx - d.x) * k(0.2);
    d.y += (ty - d.y) * k(0.2);
    d.vx += (vx - d.vx) * k(0.4);
    d.vy += (vy - d.vy) * k(0.4);
    if (Math.hypot(d.vx, d.vy) > 0.8) d.yaw -= angDiff(d.yaw, Math.atan2(d.vy, d.vx)) * k(0.5);
    d.ea += (e.a - d.ea) * k(0.6);
    d.eb += (e.b - d.eb) * k(0.6);
  }
}

/* ---------- step ---------- */
function update(dt) {
  T += dt;
  sceneT += dt;
  smoothTracks(dt);
  const sc = SCENES[scene];
  sc.run(sceneT);
  const [vt, why, laneY] = egoTarget();
  egoWhy = why;
  ego.acc = clamp(1.3 * (vt - ego.v), -4.5, 2);
  ego.v = Math.max(0, ego.v + ego.acc * dt);
  ego.x += ego.v * dt;
  const dy = clamp(laneY - ego.y, -1.5 * dt, 1.5 * dt);
  ego.y += dy;
  ego.yaw = lerp(ego.yaw, Math.atan2(dy / dt, Math.max(ego.v, 1)), 1 - Math.exp(-dt * 6));

  for (const a of actors) moveActor(a, dt);
  actors = actors.filter((a) => a.x > ego.x - 40 && a.x < ego.x + 130);
  for (const f of flashes) f.t += dt;
  while (flashes.length && flashes[0].t > 0.8) flashes.shift();
  for (const p of stat.points) p.t += dt;

  acc += dt;
  while (acc >= TICK) {
    acc -= TICK;
    tick();
  }

  // next scene: once this one has had its time and nothing is left in the way
  const clear = !actors.some(
    (a) => a.cls !== 'pedestrian' && a.x > ego.x - 6 && a.x < ego.x + RANGE + 4,
  );
  const finished = sc.done ? sc.done() : sceneT > sc.min;
  if (!locked && sceneT > sc.min && finished && clear && mode === 'follow')
    startScene((scene + 1) % SCENES.length);
  else if (locked && sceneT > sc.min && finished && clear && mode === 'follow') startScene(scene);
}
let acc = 0;

/* ---------- drawing ---------- */
const toX = (x) => originX() + (x - (ego.x + 12)) * SC;
const toY = (y) => originY() - y * SC;
const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

function drawRoad() {
  // surfaces
  g.fillStyle = 'rgba(255,255,255,.05)';
  g.fillRect(0, toY(3.6), W, 7.2 * SC);
  g.fillStyle = 'rgba(255,255,255,.025)';
  g.fillRect(0, toY(5.6), W, 2 * SC);
  g.fillRect(0, toY(-3.6), W, 2 * SC);
  g.fillStyle = 'rgba(255,255,255,.04)';
  g.fillRect(0, toY(9.5), W, 3.9 * SC);
  g.fillRect(0, toY(-5.6), W, 3.9 * SC);
  g.strokeStyle = 'rgba(255,255,255,.2)';
  g.lineWidth = 1.4;
  for (const y of [3.6, -3.6]) {
    g.beginPath();
    g.moveTo(0, toY(y));
    g.lineTo(W, toY(y));
    g.stroke();
  }
  g.setLineDash([14, 18]);
  g.beginPath();
  g.moveTo(0, toY(0));
  g.lineTo(W, toY(0));
  g.stroke();
  g.setLineDash([]);
}

function drawActor(a) {
  const sx = toX(a.x);
  const sy = toY(a.y);
  if (sx < -90 || sx > W + 90) return;
  g.save();
  g.globalAlpha = Math.min(1, (T - a.born) * 2);
  if (a.cls === 'pedestrian') drawPedSprite(g, sx, sy, a.yaw, SC);
  else if (a.cls === 'cyclist') drawBikeSprite(g, sx, sy, a.yaw, SC);
  else if (a.cls === 'truck') {
    const c = Math.cos(a.yaw);
    const s = Math.sin(a.yaw);
    drawTruckSprite(
      g,
      sx - c * 0.4 * SC,
      sy + s * 0.4 * SC,
      a.yaw,
      SC,
      a.speed ? '#4b5568' : '#3a4354',
    );
  } else {
    const off = a.len / 2 - 0.9;
    drawCarSprite(g, sx - Math.cos(a.yaw) * off * SC, sy + Math.sin(a.yaw) * off * SC, a.yaw, SC, {
      body: '#b9c2d6',
      shade: '#6f7a90',
      len: a.len,
      wid: a.wid,
    });
  }
  g.restore();
}

function drawEgo() {
  const sx = toX(ego.x);
  const sy = toY(ego.y);
  drawCarSprite(g, sx, sy, ego.yaw, SC, { brake: ego.acc < -0.8 });
  const L = lidar();
  g.fillStyle = SCAN;
  g.shadowColor = SCAN;
  g.shadowBlur = 10;
  g.beginPath();
  g.arc(toX(L.x), toY(L.y), 0.22 * SC, 0, TAU);
  g.fill();
  g.shadowBlur = 0;
}

function drawDetections() {
  const L = lidar();
  g.save();
  g.strokeStyle = rgba(SCAN, 0.1);
  g.lineWidth = 1;
  for (const r of [15, 30, 45]) {
    g.beginPath();
    g.arc(toX(L.x), toY(L.y), r * SC, 0, TAU);
    g.stroke();
  }
  const fade = clamp(1 - (T - stat.tickT) / 0.2, 0.2, 1);
  g.fillStyle = rgba('#8fe3ff', 0.55 * fade);
  for (const p of stat.points) {
    g.beginPath();
    g.arc(toX(p.x), toY(p.y), 1.7, 0, TAU);
    g.fill();
  }
  g.lineWidth = 1.2;
  for (const d of stat.dets) {
    g.strokeStyle = d.truth === -1 ? 'rgba(255,138,160,.8)' : rgba(SCAN, 0.5);
    g.beginPath();
    g.arc(toX(d.x), toY(d.y), 0.5 * SC + 2, 0, TAU);
    g.stroke();
  }
  for (const f of flashes) {
    const k = f.t / 0.8;
    g.strokeStyle = `rgba(255,214,10,${0.8 * (1 - k)})`;
    g.lineWidth = 1.6;
    g.beginPath();
    g.arc(toX(f.x), toY(f.y), (0.8 + k * 2) * SC, 0, TAU);
    g.stroke();
  }
  g.restore();
}

const SIZE = {
  pedestrian: [0.9, 0.9],
  cyclist: [1.9, 0.9],
  truck: [8.8, 2.5],
  car: [4.4, 1.9],
};

function drawTracks() {
  g.save();
  g.font = `600 11px ${FONT}`;
  for (const t of tracker.tracks) {
    if (!settled(t)) {
      g.globalAlpha = 0.45;
      g.strokeStyle = 'rgba(255,214,10,.8)';
      g.setLineDash([3, 3]);
      g.lineWidth = 1.2;
      g.beginPath();
      g.arc(toX(t.filter.x[0]), toY(t.filter.x[1]), 0.7 * SC, 0, TAU);
      g.stroke();
      g.setLineDash([]);
      continue;
    }
    const d = t.d;
    if (!d) continue;
    const coasting = t.state === 'coasting';
    const x = toX(d.x);
    const y = toY(d.y);
    const sp = Math.hypot(d.vx, d.vy);
    const col = coasting ? '#ff8a99' : CLS_COLOR[t.cls] || TR;
    const sz = SIZE[t.cls] || SIZE.car;

    // where it is heading over the next three seconds
    if (sp > 0.5) {
      let s = [d.x, d.y, sp, d.yaw, 0, 0, 0];
      const pts = [];
      for (let k = 0; k < 12; k++) {
        s = [...ctrv(s, 0.25).slice(0, 5), 0, 0];
        pts.push([toX(s[0]), toY(s[1])]);
      }
      g.strokeStyle = rgba(col, 0.75);
      g.lineWidth = 1.6;
      g.setLineDash([4, 5]);
      g.beginPath();
      g.moveTo(x, y);
      pts.forEach(([qx, qy]) => g.lineTo(qx, qy));
      g.stroke();
      g.setLineDash([]);
      const [ex, ey] = pts[pts.length - 1];
      const r = (0.5 + 0.2 * (d.ea + d.eb) + 0.06 * sp) * SC;
      g.fillStyle = rgba(col, 0.14);
      g.strokeStyle = rgba(col, 0.5);
      g.lineWidth = 1;
      g.beginPath();
      g.arc(ex, ey, r, 0, TAU);
      g.fill();
      g.stroke();
    }

    // the object's box, aligned with its direction of travel
    g.save();
    g.translate(x, y);
    g.rotate(-d.yaw);
    g.strokeStyle = col;
    g.lineWidth = 1.8;
    if (coasting) g.setLineDash([5, 4]);
    g.shadowColor = col;
    g.shadowBlur = 8;
    g.beginPath();
    g.roundRect((-sz[0] / 2) * SC - 3, (-sz[1] / 2) * SC - 3, sz[0] * SC + 6, sz[1] * SC + 6, 6);
    g.stroke();
    g.shadowBlur = 0;
    g.setLineDash([]);
    // how sure the filter is of the position
    g.strokeStyle = rgba(col, 0.7);
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(0, 0, Math.max(d.ea, 0.2) * SC, Math.max(d.eb, 0.2) * SC, 0, 0, TAU);
    g.stroke();
    g.restore();

    g.fillStyle = col;
    const name = `#${t.id} ${CLS_NAME[t.cls] || 'Object'}`;
    const lab = coasting
      ? `${name} · not seen ${(t.gapT || 0).toFixed(1)} s`
      : sp > 0.3 && t.hits >= 12
        ? `${name} · ${Math.round(sp * 3.6)} km/h`
        : name;
    g.fillText(lab, x - sz[0] * 0.5 * SC, y - (Math.max(sz[1], 0.9) / 2) * SC - 10);
  }
  g.restore();
}

/* ---------- scene card and rail ---------- */
const rail = buildRail(
  SCENES.map((s) => s.name),
  (i) => {
    if (locked && scene === i) locked = false;
    else {
      locked = true;
      resetWorld();
      startScene(i);
    }
  },
);
function renderCard() {
  $('dName').textContent = SCENES[scene].title;
  $('dDesc').textContent = SCENES[scene].desc;
}

/** Drop everything on the road so a scene can start from a clean state. */
function resetWorld() {
  actors = [];
  tracker.tracks = [];
  stat.points = [];
  stat.dets = [];
  stat.pairs = [];
  mode = 'follow';
  ego.y = -LANE;
  ego.yaw = 0;
}

function draw(now) {
  rail.set(scene, locked ? 0 : Math.min(1, sceneT / SCENES[scene].min));
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawDotGrid(g, W, H, ego.x + 12 - originX() / SC + W / 2 / SC, originY() / SC - H / 2 / SC, SC);
  drawRoad();
  for (const a of actors) drawActor(a);
  drawEgo();
  drawDetections();
  drawTracks();
  ui(now);
}

/* ---------- dock ---------- */
let lastUi = 0;
function ui(now) {
  if (now - lastUi < 100) return;
  lastUi = now;
  const conf = confirmed();
  const coasting = conf.filter((t) => t.state === 'coasting');
  const nDet = stat.dets.length;
  const paired = stat.pairs.length;
  const kmh = (v) => `${Math.round(v * 3.6)} km/h`;
  const nearest = (pred) => {
    let best = null;
    for (const t of conf) if (pred(t) && (!best || t.d.x < best.d.x)) best = t;
    return best;
  };
  const front = ego.x + 2.4;
  const car = ahead;
  const walkers = conf.filter((t) => t.cls === 'pedestrian');
  const onc = conf.filter((t) => isVehicle(t) && t.d.vx < -1);
  const near = nearest((t) => t.d.x > front);
  const metrics = [
    [
      ['Gap to the car', car ? `${Math.max(0, car.d.x - front).toFixed(0)} m` : '—'],
      ['Its speed', car ? kmh(Math.hypot(car.d.vx, car.d.vy)) : '—'],
      ['Own speed', kmh(ego.v)],
    ],
    [
      ['Coming towards us', onc.length],
      ['Fastest', onc.length ? kmh(Math.max(...onc.map((t) => Math.hypot(t.d.vx, t.d.vy)))) : '—'],
      ['Nearest', near ? `${Math.max(0, near.d.x - front).toFixed(0)} m` : '—'],
    ],
    [
      ['People tracked', walkers.length],
      [
        'Walking speed',
        walkers.length
          ? kmh(walkers.reduce((s, t) => s + Math.hypot(t.d.vx, t.d.vy), 0) / walkers.length)
          : '—',
      ],
      ['Rejected false alarms', stat.rejected],
    ],
    [
      ['Car ahead', car ? kmh(Math.hypot(car.d.vx, car.d.vy)) : 'passed'],
      ['Own vehicle', egoWhy],
      ['Left lane', leftFree() ? 'Clear' : 'Busy'],
    ],
  ][scene];
  setMetrics(metrics);
  $('dN').textContent = conf.length;
  $('dDet').textContent = nDet;
  $('dGh').textContent = stat.rejected;
  $('dRec').textContent = stat.recovered;
  setTile('t-det', `${nDet} found`, false, '');
  setTile('t-asc', `${paired} paired`, false, '');
  setTile('t-mod', 'UKF', false, '');
  setTile('t-prd', conf.length ? '3 s ahead' : 'Waiting', false, '');
  setTile(
    't-occ',
    coasting.length
      ? `${coasting.length} not seen`
      : stat.blind.length
        ? `${stat.blind.length} hidden`
        : 'None',
    false,
    coasting.length ? 'a' : '',
  );
  setTile('t-ego', egoWhy, false, egoWhy === 'Cruising' ? '' : 'a');
  setStatus(
    egoWhy === 'Cruising' ? 'info' : 'warn',
    egoWhy === 'Cruising'
      ? `Tracking ${conf.length} ${conf.length === 1 ? 'object' : 'objects'} · ${Math.round(ego.v * 3.6)} km/h`
      : `${egoWhy} · ${Math.round(ego.v * 3.6)} km/h`,
  );
  const pick = tracker.tracks.find((t) => t.id === stat.pick);
  $('chSName').textContent = pick
    ? `Speed of #${pick.id} ${CLS_NAME[pick.cls] || ''}`
    : 'Speed of the nearest object';
  drawChart(
    $('chE'),
    errSeries,
    [
      { key: 'raw', color: '#8fa0bd', dash: [4, 4], width: 1.4 },
      { key: 'trk', color: TR, fill: ['rgba(45,212,191,.26)', 'rgba(45,212,191,0)'] },
    ],
    { min: 0, max: 1, ticks: [0, 0.5, 1] },
  );
  drawChart(
    $('chS'),
    spdSeries,
    [
      { key: 'truth', color: '#8fa0bd', dash: [4, 4], width: 1.4 },
      { key: 'est', color: TR },
    ],
    { min: 0, max: 40, ticks: [0, 20, 40] },
  );
}

/* ---------- start ---------- */
resize();
startScene(0);
startLoop(update, draw);

/* Test hooks, only with ?debug in the address. */
if (new URLSearchParams(location.search).has('debug')) {
  window.__sim = (sec) => {
    for (let t = 0; t < sec; t += 1 / 60) update(1 / 60);
  };
  window.__go = (i) => {
    locked = true;
    resetWorld();
    startScene(i);
  };
  window.__dbg = () => ({
    t: T,
    scene,
    mode,
    egoY: ego.y,
    egoX: ego.x,
    egoV: ego.v,
    why: egoWhy,
    rejected: stat.rejected,
    recovered: stat.recovered,
    actors: actors.map((a) => ({ id: a.id, cls: a.cls, x: a.x, y: a.y, v: a.speed })),
    tracks: tracker.tracks.map((t) => ({
      id: t.id,
      state: t.state,
      cls: t.cls,
      hits: t.hits,
      truth: t.lastDet ? t.lastDet.truth : null,
      x: t.d && t.d.x,
      y: t.d && t.d.y,
      v: t.d && Math.hypot(t.d.vx, t.d.vy),
      yaw: t.d && t.d.yaw,
    })),
  });
}
