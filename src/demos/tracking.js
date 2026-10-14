import { $, FONT, TAU, clamp, lerp } from './common.js';
import { UkfTracker, predictPath } from '../algos/ukf-tracker.js';
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
 * Object tracking: a vehicle drives down a street. Every tenth of a second a simulated lidar
 * reports a noisy position for each road user it can see (anything behind another vehicle is
 * hidden), plus the odd false alarm. One UKF per object turns those into tracks with a stable id,
 * a speed, a heading and a prediction. The vehicle slows for what the tracks say will cross its path.
 */

const TR = '#2dd4bf';
const SCAN = '#5ac8fa';
const CLS_COLOR = { car: '#8fb4ff', truck: '#c3a5ff', pedestrian: '#ffd6a5', cyclist: '#9be15d' };
const CLS_NAME = { car: 'Car', truck: 'Truck', pedestrian: 'Pedestrian', cyclist: 'Cyclist' };
const LANE = 1.8;
const TICK = 0.1;
const CRUISE = 5.4;
const RANGE = 46;

const rnd = mulberry32(17);
const gauss = gaussian(rnd);
const between = (a, b) => a + (b - a) * rnd();

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
const ego = { x: 0, y: -LANE, v: CRUISE, acc: 0, len: 4.4, wid: 1.9 };
let actors = [];
let T = 0;
let nextActor = 1;
let nextSpawn = 0.5;
let spawnIdx = 0;
let nextClutter = 3;
const pending = []; // things that start when the vehicle gets close: { x, make }
const crosswalks = [];
let nextCross = 70;

const lidar = () => ({ x: ego.x + 1.4, y: ego.y });

function add(o) {
  const a = { id: nextActor++, born: T, yawRate: 0, base: null, ...o };
  actors.push(a);
  return a;
}
const car = (o) => add({ cls: 'car', len: 4.4, wid: 1.9, ...o });

const SPAWNS = [
  // oncoming car
  () => {
    if (actors.some((a) => a.y > 0 && a.y < 3.6 && Math.abs(a.x - (ego.x + 62)) < 26)) return;
    const big = rnd() < 0.3;
    add({
      cls: big ? 'truck' : 'car',
      len: big ? 8.8 : 4.4,
      wid: big ? 2.5 : 1.9,
      x: ego.x + 62,
      y: LANE,
      yaw: Math.PI,
      speed: between(8, 10),
    });
  },
  // pedestrian on the left pavement
  () => {
    const dir = rnd() < 0.5 ? 1 : -1;
    add({
      cls: 'pedestrian',
      len: 0.7,
      wid: 0.7,
      x: ego.x + between(26, 44),
      y: 6.8,
      yaw: dir > 0 ? 0 : Math.PI,
      speed: between(1.1, 1.5),
    });
  },
  // a car ahead in our lane, sometimes slower than us
  () => {
    if (actors.some((a) => a.y < 0 && a.y > -3.6 && a.x > ego.x - 6 && a.x < ego.x + 60)) return;
    const slow = spawnIdx % 6 === 2;
    car({ x: ego.x + 30, y: -LANE, yaw: 0, speed: slow ? between(3.4, 4) : between(7, 8.5) });
  },
  // cyclist on the left, riding towards us and weaving a little
  () => {
    const y0 = 4.7;
    car({
      cls: 'cyclist',
      len: 1.8,
      wid: 0.7,
      x: ego.x + 52,
      y: y0,
      yaw: Math.PI,
      speed: between(3.6, 4.4),
      weave: { y0, amp: 0.32, w: between(1.2, 1.8), ph: rnd() * TAU },
    });
  },
  // a pedestrian crossing at the next crosswalk
  () => {
    const cw = crosswalks.find((c) => c.x > ego.x + 30 && !c.used);
    if (!cw) return;
    cw.used = true;
    const side = rnd() < 0.5 ? 1 : -1;
    const n = rnd() < 0.5 ? 2 : 1;
    for (let i = 0; i < n; i++)
      add({
        cls: 'pedestrian',
        len: 0.7,
        wid: 0.7,
        x: cw.x + (rnd() - 0.5) * 1.6 + i * 0.9,
        y: side * (7.2 + i * 1.1),
        yaw: -side * (Math.PI / 2),
        speed: between(1.2, 1.4),
        goalY: -side * 7.6,
      });
  },
  // a car overtaking us in the left lane
  () => {
    if (actors.some((a) => a.y > 0 && a.y < 3.6 && Math.abs(a.x - ego.x) < 70)) return;
    car({ x: ego.x - 32, y: LANE, yaw: 0, speed: between(10, 11) });
  },
  // a pedestrian walking on the right pavement
  () => {
    const dir = rnd() < 0.5 ? 1 : -1;
    add({
      cls: 'pedestrian',
      len: 0.7,
      wid: 0.7,
      x: ego.x + between(26, 44),
      y: -7.2,
      yaw: dir > 0 ? 0 : Math.PI,
      speed: between(1.1, 1.5),
    });
  },
  // a parked truck on the right, and someone who steps out from behind it
  () => {
    if (actors.some((a) => a.cls === 'truck' && a.speed === 0 && a.x > ego.x - 20)) return;
    const x = ego.x + 78;
    add({ cls: 'truck', len: 8.8, wid: 2.5, x, y: -4.9, yaw: 0, speed: 0 });
    pending.push({
      x: x - 27,
      make: () =>
        add({
          cls: 'pedestrian',
          len: 0.7,
          wid: 0.7,
          x: x + 3,
          y: -8.4,
          yaw: Math.PI / 2,
          speed: 1.25,
          goalY: 6.8,
        }),
    });
  },
];

// how often each kind turns up: oncoming traffic is the most common
const ORDER = [0, 1, 2, 0, 3, 4, 5, 0, 6, 7, 0, 1, 4, 3];
function spawn() {
  SPAWNS[ORDER[spawnIdx % ORDER.length]]();
  spawnIdx++;
}

function moveActor(a, dt) {
  if (a.weave) {
    const w = a.weave;
    a.x += a.speed * Math.cos(a.yaw) * dt;
    const ny = w.y0 + w.amp * Math.sin(w.w * T + w.ph);
    const dy = ny - a.y;
    a.y = ny;
    a.yawTarget = Math.atan2(dy, a.speed * Math.cos(a.yaw) * dt);
    a.yaw = a.yawTarget;
    return;
  }
  if (a.goalY != null && (Math.sin(a.yaw) > 0 ? a.y >= a.goalY : a.y <= a.goalY)) {
    a.speed = 0;
    return;
  }
  if (a.cruise == null && (a.cls === 'car' || a.cls === 'truck') && a.speed > 0) a.cruise = a.speed;
  if (a.cruise != null) {
    // other drivers stop for someone on the road in front of them
    const dir = Math.cos(a.yaw) >= 0 ? 1 : -1;
    const blocked = actors.some(
      (p) =>
        p.cls === 'pedestrian' &&
        (p.x - a.x) * dir > 0 &&
        (p.x - a.x) * dir < 9 &&
        Math.abs(p.y - a.y) < 2.4,
    );
    a.speed = lerp(a.speed, blocked ? 0 : a.cruise, 1 - Math.exp(-dt * 3));
  }
  a.x += a.speed * Math.cos(a.yaw) * dt;
  a.y += a.speed * Math.sin(a.yaw) * dt;
}

/* ---------- the vehicle: slows for what the tracks say is in its way ---------- */
function egoTarget() {
  let vt = CRUISE;
  let why = 'Cruising';
  const front = ego.x + 2.4;
  for (const t of tracker.tracks) {
    if (t.state === 'tentative') continue;
    const [px, py] = t.filter.position;
    const [vx, vy] = t.filter.velocity;
    const dx = px - front;
    const vehicle = t.cls === 'car' || t.cls === 'truck';
    if (vehicle && Math.abs(py - ego.y) < 1.5 && dx > -1 && dx < 45) {
      const want = Math.max(0, vx + 0.45 * (dx - (5 + 0.9 * ego.v)));
      if (want < vt) {
        vt = want;
        why = 'Following';
      }
    }
    if (vehicle || Math.hypot(vx, vy) > 3) continue;
    const path = [[px, py], ...predictPath(t, 3, 0.25)];
    for (let k = 0; k < path.length; k++) {
      const [qx, qy] = path[k];
      if (Math.abs(qy - ego.y) < 1.6 && qx > front - 0.5 && qx - front < 9 + ego.v * 2) {
        const d = qx - front;
        const v = Math.sqrt(2 * 2.6 * Math.max(d - 3.5, 0));
        if (v < vt) {
          vt = v;
          why = 'Yielding';
        }
        break;
      }
    }
  }
  return [vt, why];
}
let egoWhy = 'Cruising';

/* ---------- lidar ---------- */
const sigmaAt = (r) => 0.12 + 0.012 * r;

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
  noise: { accel: 2.6, yawAccel: 2.2, meas: 0.42 },
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
let lastTick = 0;
let acc = 0;

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
    if (rnd() < 0.03) continue;
    const sg = sigmaAt(r);
    const d = { x: a.x + sg * gauss(), y: a.y + sg * gauss(), cls: a.cls, truth: a.id, range: r };
    rawSum += Math.hypot(d.x - a.x, d.y - a.y);
    rawN++;
    dets.push(d);
  }
  if (T > nextClutter) {
    nextClutter = T + between(2.2, 3.6);
    dets.push({
      x: L.x + between(10, 36),
      y: between(-8, 8),
      cls: ['car', 'pedestrian'][rnd() < 0.5 ? 0 : 1],
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
  let pick = tracker.tracks.find((t) => t.id === stat.pick && t.state !== 'tentative');
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
  if (pick) {
    const truth = actors.find((q) => pick.lastDet && q.id === pick.lastDet.truth);
    if (truth)
      spdSeries.push(T, { est: Math.abs(pick.filter.x[2]) * 3.6, truth: truth.speed * 3.6 });
  }
}

/* ---------- step ---------- */
function update(dt) {
  T += dt;
  const [vt, why] = egoTarget();
  egoWhy = why;
  ego.acc = clamp(1.3 * (vt - ego.v), -4.5, 2);
  ego.v = Math.max(0, ego.v + ego.acc * dt);
  ego.x += ego.v * dt;

  if (T > nextSpawn && actors.length < 15) {
    spawn();
    nextSpawn = T + between(0.9, 1.7);
  }
  while (ego.x + 70 > nextCross) {
    crosswalks.push({ x: nextCross, used: false });
    nextCross += 120;
  }
  for (let i = pending.length - 1; i >= 0; i--)
    if (ego.x > pending[i].x) {
      pending[i].make();
      pending.splice(i, 1);
    }
  for (const a of actors) moveActor(a, dt);
  actors = actors.filter((a) => a.x > ego.x - 40 && a.x < ego.x + 130);
  while (crosswalks.length && crosswalks[0].x < ego.x - 40) crosswalks.shift();
  for (const f of flashes) f.t += dt;
  while (flashes.length && flashes[0].t > 0.8) flashes.shift();
  for (const p of stat.points) p.t += dt;

  acc += dt;
  while (acc >= TICK) {
    acc -= TICK;
    tick();
    lastTick = T;
  }
}

/* ---------- drawing ---------- */
const toX = (x) => originX() + (x - (ego.x + 12)) * SC;
const toY = (y) => originY() - y * SC;
const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

function drawRoad() {
  const x0 = ego.x + 12 - originX() / SC - 4;
  const x1 = x0 + W / SC + 8;
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
  for (const c of crosswalks) {
    if (c.x < x0 - 3 || c.x > x1 + 3) continue;
    g.fillStyle = 'rgba(255,255,255,.3)';
    for (let k = -3; k <= 3; k++)
      g.fillRect(toX(c.x - 1.4), toY(k * 1.05 + 0.4), 2.8 * SC, 0.8 * SC);
  }
}

function polyBox(cx, cy, yaw, len, wid) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [
    [-len / 2, -wid / 2],
    [len / 2, -wid / 2],
    [len / 2, wid / 2],
    [-len / 2, wid / 2],
  ].map(([lx, ly]) => [cx + lx * c - ly * s, cy + lx * s + ly * c]);
}

function drawShadows(a) {
  if (a < 0.02) return;
  const L = lidar();
  g.save();
  g.globalAlpha = a;
  for (const b of actors) {
    if (b.cls === 'pedestrian' || Math.hypot(b.x - L.x, b.y - L.y) > 38) continue;
    const corners = polyBox(b.x, b.y, b.yaw, b.len, b.wid);
    let lo = null;
    let hi = null;
    let loA = Infinity;
    let hiA = -Infinity;
    const ref = Math.atan2(b.y - L.y, b.x - L.x);
    for (const [px, py] of corners) {
      let ang = Math.atan2(py - L.y, px - L.x) - ref;
      ang = Math.atan2(Math.sin(ang), Math.cos(ang));
      if (ang < loA) {
        loA = ang;
        lo = [px, py];
      }
      if (ang > hiA) {
        hiA = ang;
        hi = [px, py];
      }
    }
    const far = (p) => {
      const d = Math.hypot(p[0] - L.x, p[1] - L.y) || 1;
      return [L.x + ((p[0] - L.x) / d) * RANGE, L.y + ((p[1] - L.y) / d) * RANGE];
    };
    const f1 = far(lo);
    const f2 = far(hi);
    const gr = g.createLinearGradient(toX(b.x), toY(b.y), toX(f1[0]), toY(f1[1]));
    gr.addColorStop(0, 'rgba(255,93,108,.20)');
    gr.addColorStop(1, 'rgba(255,93,108,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(toX(lo[0]), toY(lo[1]));
    g.lineTo(toX(f1[0]), toY(f1[1]));
    g.lineTo(toX(f2[0]), toY(f2[1]));
    g.lineTo(toX(hi[0]), toY(hi[1]));
    g.closePath();
    g.fill();
  }
  g.restore();
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
  drawCarSprite(g, sx, sy, 0, SC, { brake: ego.acc < -0.8 });
  const L = lidar();
  g.fillStyle = SCAN;
  g.shadowColor = SCAN;
  g.shadowBlur = 10;
  g.beginPath();
  g.arc(toX(L.x), toY(L.y), 0.22 * SC, 0, TAU);
  g.fill();
  g.shadowBlur = 0;
}

function drawDetectLayer(a) {
  if (a < 0.02) return;
  const L = lidar();
  g.save();
  g.globalAlpha = a;
  g.strokeStyle = rgba(SCAN, 0.1);
  g.lineWidth = 1;
  for (const r of [15, 30, 45]) {
    g.beginPath();
    g.arc(toX(L.x), toY(L.y), r * SC, 0, TAU);
    g.stroke();
  }
  const fade = clamp(1 - (T - stat.tickT) / 0.2, 0.25, 1);
  g.fillStyle = rgba('#8fe3ff', 0.85 * fade);
  for (const p of stat.points) {
    g.beginPath();
    g.arc(toX(p.x), toY(p.y), 1.9, 0, TAU);
    g.fill();
  }
  g.lineWidth = 1.6;
  for (const d of stat.dets) {
    const clutter = d.truth === -1;
    g.strokeStyle = clutter ? 'rgba(255,138,160,.95)' : rgba(SCAN, 0.95);
    g.beginPath();
    g.arc(toX(d.x), toY(d.y), 0.55 * SC + 3, 0, TAU);
    g.stroke();
  }
  g.restore();
}

function drawAssocLayer(a) {
  if (a < 0.02) return;
  g.save();
  g.globalAlpha = a;
  const gate = Math.sqrt(9.21);
  for (const t of tracker.tracks) {
    if (t.state === 'tentative' && t.hits < 2) continue;
    const e = t.filter.ellipse(gate);
    const m = 0.34 * gate;
    g.strokeStyle = rgba(TR, 0.35);
    g.lineWidth = 1;
    g.setLineDash([4, 5]);
    g.beginPath();
    g.ellipse(
      toX(t.filter.x[0]),
      toY(t.filter.x[1]),
      (e.a + m) * SC,
      (e.b + m) * SC,
      -e.angle,
      0,
      TAU,
    );
    g.stroke();
  }
  g.setLineDash([]);
  g.strokeStyle = rgba(TR, 0.9);
  g.lineWidth = 1.6;
  for (const { track: t, det } of stat.pairs) {
    g.beginPath();
    g.moveTo(toX(det.x), toY(det.y));
    g.lineTo(toX(t.filter.x[0]), toY(t.filter.x[1]));
    g.stroke();
  }
  for (const f of flashes) {
    const k = f.t / 0.8;
    g.strokeStyle = `rgba(255,214,10,${0.9 * (1 - k)})`;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(toX(f.x), toY(f.y), (0.8 + k * 2.4) * SC, 0, TAU);
    g.stroke();
  }
  g.restore();
}

function tagText(t, extra) {
  return `#${t.id} ${CLS_NAME[t.cls] || 'Object'}${extra || ''}`;
}

function drawTrackLayer(aTrack, aPred, aOcc) {
  const tau = clamp(T - stat.tickT, 0, TICK * 1.5);
  g.save();
  g.font = `600 11px ${FONT}`;
  g.textBaseline = 'alphabetic';
  for (const t of tracker.tracks) {
    if (t.state === 'tentative') {
      const x = toX(t.filter.x[0]);
      const y = toY(t.filter.x[1]);
      g.globalAlpha = 0.5 * Math.max(aTrack, aOcc * 0.2);
      g.strokeStyle = 'rgba(255,214,10,.8)';
      g.setLineDash([3, 3]);
      g.lineWidth = 1.2;
      g.beginPath();
      g.arc(x, y, 0.7 * SC, 0, TAU);
      g.stroke();
      g.setLineDash([]);
      continue;
    }
    const coasting = t.state === 'coasting';
    const [vx, vy] = t.filter.velocity;
    const px = t.filter.x[0] + vx * tau;
    const py = t.filter.x[1] + vy * tau;
    const x = toX(px);
    const y = toY(py);
    const col = coasting ? '#ff8a99' : CLS_COLOR[t.cls] || TR;
    const sz =
      t.cls === 'pedestrian'
        ? [0.9, 0.9]
        : t.cls === 'cyclist'
          ? [1.9, 0.9]
          : t.cls === 'truck'
            ? [8.8, 2.5]
            : [4.4, 1.9];
    const al = coasting ? Math.max(aTrack, aOcc) : aTrack;

    // trail
    g.globalAlpha = 0.5 * al;
    g.strokeStyle = rgba(col, 0.55);
    g.lineWidth = 2;
    g.beginPath();
    t.trail.forEach(([qx, qy], i) => (i ? g.lineTo(toX(qx), toY(qy)) : g.moveTo(toX(qx), toY(qy))));
    g.stroke();

    // predicted path with a widening cone
    const emphasis = coasting ? Math.max(aPred, aOcc) : aPred;
    if (emphasis > 0.02) {
      const path = predictPath(t, 2, 0.25);
      g.globalAlpha = emphasis;
      g.strokeStyle = rgba(col, 0.9);
      g.lineWidth = 1.6;
      g.setLineDash([4, 5]);
      g.beginPath();
      g.moveTo(x, y);
      path.forEach(([qx, qy]) => g.lineTo(toX(qx), toY(qy)));
      g.stroke();
      g.setLineDash([]);
      const e = t.filter.ellipse(2);
      const end = path[path.length - 1];
      const spread = (e.a + 0.35 * Math.hypot(vx, vy)) * SC;
      g.fillStyle = rgba(col, 0.1);
      g.beginPath();
      g.ellipse(toX(end[0]), toY(end[1]), spread, spread * 0.6, -Math.atan2(vy, vx), 0, TAU);
      g.fill();
    }

    // box
    g.globalAlpha = al;
    g.save();
    g.translate(x, y);
    g.rotate(-t.filter.x[3]);
    g.strokeStyle = col;
    g.lineWidth = 1.8;
    if (coasting) g.setLineDash([5, 4]);
    g.shadowColor = col;
    g.shadowBlur = 8;
    g.beginPath();
    g.roundRect((-sz[0] / 2) * SC - 3, (-sz[1] / 2) * SC - 3, sz[0] * SC + 6, sz[1] * SC + 6, 6);
    g.stroke();
    g.restore();
    g.setLineDash([]);

    // uncertainty ellipse
    const e = t.filter.ellipse(2);
    g.globalAlpha = (coasting ? 1 : 0.55 + 0.45 * aPred) * Math.max(al, aPred * 0.7);
    g.strokeStyle = rgba(col, 0.85);
    g.lineWidth = 1.2;
    g.beginPath();
    g.ellipse(x, y, Math.max(e.a, 0.15) * SC, Math.max(e.b, 0.1) * SC, -e.angle, 0, TAU);
    g.stroke();

    // velocity arrow
    const sp = Math.hypot(vx, vy);
    if (sp > 0.4) {
      g.globalAlpha = Math.max(al, aPred) * 0.95;
      g.strokeStyle = col;
      g.fillStyle = col;
      g.lineWidth = 2;
      const ex = x + vx * 0.9 * SC;
      const ey = y - vy * 0.9 * SC;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(ex, ey);
      g.stroke();
      const ang = Math.atan2(-vy, vx);
      g.beginPath();
      g.moveTo(ex, ey);
      g.lineTo(ex - 7 * Math.cos(ang - 0.45), ey - 7 * Math.sin(ang - 0.45));
      g.lineTo(ex - 7 * Math.cos(ang + 0.45), ey - 7 * Math.sin(ang + 0.45));
      g.closePath();
      g.fill();
    }

    // label
    g.globalAlpha = Math.max(al, aPred, aOcc * (coasting ? 1 : 0.4));
    g.fillStyle = col;
    const lab = coasting
      ? tagText(t, ` · no detections ${(t.gapT || 0).toFixed(1)} s`)
      : aPred > 0.5
        ? tagText(t, ` · ${(sp * 3.6).toFixed(0)} km/h`)
        : tagText(t);
    g.fillText(lab, x + 8, y - (Math.max(sz[1], 0.9) / 2) * SC - 8);
  }
  g.restore();
}

function drawBlind(a) {
  if (a < 0.02) return;
  g.save();
  g.globalAlpha = a;
  g.font = `600 11px ${FONT}`;
  for (const b of stat.blind) {
    if (b.cls === 'truck' && b.speed === 0) continue;
    const x = toX(b.x);
    const y = toY(b.y);
    g.setLineDash([2, 4]);
    g.strokeStyle = 'rgba(255,138,153,.8)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(x, y, Math.max(b.len, 1) * 0.5 * SC + 6, 0, TAU);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = 'rgba(255,138,153,.95)';
    g.fillText('Hidden from the sensor', x + 10, y + 16);
  }
  g.restore();
}

/* ---------- stages ---------- */
const NAMES = ['Detect', 'Associate', 'Predict', 'Blind spots'];
const TITLE = [
  'Finding objects',
  'Matching to known objects',
  'Following and predicting',
  'Surviving blind spots',
];
const DESC = [
  'Each scan returns points. Points that belong together become one detection: a position and a type.',
  'Every detection is paired with the track it most likely belongs to, by statistical distance. Leftovers start new tracks, and one-off false alarms never become objects.',
  'One filter per object estimates its position, speed, heading and turn rate, then predicts where it will be in two seconds.',
  'When a vehicle hides someone, the track keeps predicting from its last motion and picks the object up again under the same id.',
];
let focus = 0;
let locked = false;
let autoT = 0;
const AUTO = 7;
const alphaNow = { det: 1, assoc: 0, track: 0.5, pred: 0, occ: 0 };
const TARGET = [
  { det: 1, assoc: 0, track: 0.45, pred: 0, occ: 0 },
  { det: 0.55, assoc: 1, track: 0.85, pred: 0, occ: 0 },
  { det: 0.2, assoc: 0, track: 1, pred: 1, occ: 0 },
  { det: 0.25, assoc: 0, track: 0.8, pred: 0.4, occ: 1 },
];
const rail = buildRail(NAMES, (i) => {
  if (locked && focus === i) locked = false;
  else {
    locked = true;
    focus = i;
  }
  autoT = 0;
  renderCard();
});
function renderCard() {
  $('dName').textContent = TITLE[focus];
  $('dDesc').textContent = DESC[focus];
}
renderCard();

function ease(dt) {
  const tgt = TARGET[focus];
  for (const k of Object.keys(alphaNow))
    alphaNow[k] = lerp(alphaNow[k], tgt[k], 1 - Math.exp(-dt * 4));
}

function draw(now) {
  const dt = Math.min(0.05, (now - (draw.last || now)) / 1000);
  draw.last = now;
  ease(dt);
  if (!locked && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    autoT += dt;
    if (autoT > AUTO) {
      autoT = 0;
      focus = (focus + 1) % NAMES.length;
      renderCard();
    }
  }
  rail.set(focus, locked ? 0 : autoT / AUTO);

  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawDotGrid(g, W, H, ego.x + 12 - originX() / SC + W / 2 / SC, originY() / SC - H / 2 / SC, SC);
  drawRoad();
  drawShadows(alphaNow.occ);
  for (const a of actors) drawActor(a);
  drawEgo();
  drawDetectLayer(alphaNow.det);
  drawAssocLayer(alphaNow.assoc);
  drawTrackLayer(alphaNow.track, alphaNow.pred, alphaNow.occ);
  drawBlind(alphaNow.occ);
  ui(now);
}

/* ---------- dock ---------- */
let lastUi = 0;
function ui(now) {
  if (now - lastUi < 100) return;
  lastUi = now;
  const confirmed = tracker.tracks.filter((t) => t.state !== 'tentative');
  const coasting = confirmed.filter((t) => t.state === 'coasting');
  const fastest = confirmed.reduce((m, t) => Math.max(m, Math.abs(t.filter.x[2])), 0);
  const nDet = stat.dets.length;
  const paired = stat.pairs.length;
  $('dN').textContent = confirmed.length;
  $('dDet').textContent = nDet;
  $('dGh').textContent = stat.rejected;
  $('dRec').textContent = stat.recovered;
  setMetrics(
    [
      [
        ['Lidar returns', stat.sensed],
        ['Detections', nDet],
        ['Range', `${RANGE} m`],
      ],
      [
        ['Paired', paired],
        ['New tracks', stat.born],
        ['Rejected so far', stat.rejected],
      ],
      [
        ['Tracks', confirmed.length],
        ['Fastest', `${(fastest * 3.6).toFixed(0)} km/h`],
        ['Error vs raw', stat.rawErr ? `${Math.round((stat.trkErr / stat.rawErr) * 100)}%` : '—'],
      ],
      [
        ['Coasting now', coasting.length],
        ['Recovered', stat.recovered],
        ['Longest gap', `${stat.longestGap.toFixed(1)} s`],
      ],
    ][focus],
  );
  const kmh = Math.round(ego.v * 3.6);
  setTile('t-det', `${nDet} found`, focus === 0, '');
  setTile('t-asc', `${paired} paired`, focus === 1, '');
  setTile('t-mod', 'UKF', focus === 2, '');
  setTile('t-prd', confirmed.length ? '2 s ahead' : 'Waiting', focus === 2, '');
  setTile(
    't-occ',
    coasting.length
      ? `${coasting.length} coasting`
      : stat.blind.length
        ? `${stat.blind.length} hidden`
        : 'None',
    focus === 3,
    coasting.length ? 'a' : '',
  );
  setTile('t-ego', egoWhy, false, egoWhy === 'Cruising' ? '' : 'a');
  setStatus(
    egoWhy === 'Cruising' ? 'info' : 'warn',
    egoWhy === 'Cruising'
      ? `Tracking ${confirmed.length} objects · ${kmh} km/h`
      : `${egoWhy} · ${kmh} km/h`,
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
for (let i = 0; i < 160; i++) update(0.05); // let the street fill and the tracks settle
startLoop(update, draw);

/* Test hooks, only with ?debug in the address. */
if (new URLSearchParams(location.search).has('debug')) {
  window.__sim = (sec) => {
    for (let t = 0; t < sec; t += 1 / 60) update(1 / 60);
  };
  window.__dbg = () => ({
    t: T,
    tracks: tracker.tracks.map((t) => ({ id: t.id, state: t.state, cls: t.cls, hits: t.hits })),
    rejected: stat.rejected,
    recovered: stat.recovered,
    egoV: ego.v,
    actors: actors.length,
  });
}
