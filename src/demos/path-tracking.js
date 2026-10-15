import { $, clamp, FONT, hash, lerp, TAU, wrapA } from './common.js';

const sstep = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};

/* ---------- canvases ---------- */
const cv = $('scene'),
  g = cv.getContext('2d'),
  c1 = $('chS'),
  g1 = c1.getContext('2d'),
  c2 = $('chE'),
  g2 = c2.getContext('2d');
let W, H, DPR, SC;
const CS = { s: [0, 0], e: [0, 0] };
const dockH = () => (W < 800 ? 200 : 206) + (W < 800 ? 12 : 18);
const camX = () => (W < 800 ? W * 0.42 : W * 0.3);
const camY = () => (W < 800 ? H * 0.4 : (H - dockH() - 20) / 2 + 6);
function resize() {
  DPR = Math.min(devicePixelRatio || 1, 2);
  W = innerWidth;
  H = innerHeight;
  cv.width = W * DPR;
  cv.height = H * DPR;
  SC = W < 800 ? clamp(W / 38, 6.5, 11) : clamp(Math.min(W / 84, H / 44), 8, 15);
  for (const [c, k] of [
    [c1, 's'],
    [c2, 'e'],
  ]) {
    const r = c.getBoundingClientRect();
    CS[k] = [r.width, r.height];
    c.width = Math.max(1, r.width * DPR);
    c.height = Math.max(1, r.height * DPR);
  }
}
addEventListener('resize', resize);

/* ---------- route: a repeating loop of scenarios ---------- */
const DS = 0.5,
  SEG = [],
  ZN = [];
let cum = 0;
const seg = (len, k0, k1) => {
  SEG.push({ s: cum, len, k0, k1 });
  cum += len;
};
const st = (len) => seg(len, 0, 0);
const arc = (ang, R, ramp) => {
  const k = Math.sign(ang) / R,
    h = (Math.abs(ang) - Math.abs(k) * ramp) / Math.abs(k);
  seg(ramp, 0, k);
  seg(h, k, k);
  seg(ramp, k, 0);
};
ZN.push(cum);
st(25);
arc(0.35, 70, 10);
st(10);
arc(-0.35, 70, 10);
st(15); // path
ZN.push(cum);
st(30);
arc(1.55, 9, 5);
st(18);
arc(-1.55, 9, 5);
st(22);
arc(1, 22, 8);
arc(-1, 22, 8);
st(20); // curves
ZN.push(cum);
st(15);
arc(0.3, 80, 8);
arc(-0.3, 80, 8);
st(15); // rough ground
ZN.push(cum);
st(30);
arc(0.4, 60, 8);
arc(-0.4, 60, 8);
st(26); // hills
ZN.push(cum);
st(30);
arc(0.9, 25, 8);
arc(-0.9, 25, 8);
st(15); // errors
ZN.push(cum);
st(55); // stop & go
const P = Math.ceil(cum),
  Pm = cum;
const mod = (s) => ((s % Pm) + Pm) % Pm;
function kap(s) {
  const m = mod(s);
  for (let i = SEG.length - 1; i >= 0; i--) {
    const q = SEG[i];
    if (m >= q.s) return q.len > 0 ? lerp(q.k0, q.k1, (m - q.s) / q.len) : q.k1;
  }
  return 0;
}
const PX = [0],
  PY = [0],
  PH = [0];
function ensure(n) {
  while (PX.length <= n) {
    const i = PX.length,
      h0 = PH[i - 1],
      h1 = h0 + kap((i - 0.5) * DS) * DS;
    PH.push(h1);
    PX.push(PX[i - 1] + Math.cos((h0 + h1) / 2) * DS);
    PY.push(PY[i - 1] + Math.sin((h0 + h1) / 2) * DS);
  }
}
ensure(2400);

/* terrain: where the ground changes */
const Z_R0 = ZN[2],
  Z_R1 = ZN[3],
  Z_H0 = ZN[3] + 12,
  Z_H1 = ZN[4] - 12,
  Z_S0 = ZN[4] + 28,
  Z_S1 = ZN[4] + 93,
  Z_STOP = ZN[5] + 35;
const edge = (m, a, b, r) => sstep(Math.min(m - a, b - m) / r);
const roughAt = (s) => edge(mod(s), Z_R0, Z_R1, 8);
const slipAt = (s) => edge(mod(s), Z_S0, Z_S1, 4);
const gradeAt = (s) => {
  const m = mod(s);
  return m > Z_H0 && m < Z_H1 ? 0.095 * Math.sin(((m - Z_H0) / (Z_H1 - Z_H0)) * TAU) : 0;
};
const POT = [];
for (let s = Z_R0 + 10, k = 0; s < Z_R1 - 6; k++) {
  POT.push({ s, lat: (hash(k + 4) - 0.5) * 3.6 });
  s += 6.5 + hash(k + 9) * 3;
}

/* speed plan along the route (m/s) */
const CRUISE = 10,
  AB = 1.7,
  ALAT = 2.0,
  ALAT_SLIP = 1.15,
  V_ROUGH = 6.5;
const VS = new Float32Array(P + 1);
for (let i = 0; i <= P; i++) {
  const km = Math.max(Math.abs(kap(i - 4)), Math.abs(kap(i)), Math.abs(kap(i + 4)), 1e-4);
  VS[i] = Math.min(
    CRUISE,
    Math.sqrt(lerp(ALAT, ALAT_SLIP, slipAt(i)) / km),
    lerp(CRUISE, V_ROUGH, roughAt(i)),
  );
}
const vStatic = (s) => VS[Math.floor(mod(s))];

/* ---------- scenery (clear of the route itself) ---------- */
const BL = 24,
  SCN = new Map();
function clearOf(cx, cy, r, i) {
  for (let j = Math.max(0, i - 200); j < i + 200; j += 3) {
    const dx = PX[j] - cx,
      dy = PY[j] - cy;
    if (dx * dx + dy * dy < r * r) return false;
  }
  return true;
}
function rect(cx, cy, ang, len, dep) {
  const pts = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([a, b]) => {
    const x = (a * len) / 2,
      y = (b * dep) / 2;
    return [cx + x * Math.cos(ang) - y * Math.sin(ang), cy + x * Math.sin(ang) + y * Math.cos(ang)];
  });
  return { pts, kind: 0 };
}
function scenery(b) {
  let o = SCN.get(b);
  if (o) return o;
  o = [];
  const i = Math.round((b * BL + BL / 2) / DS);
  ensure(i + 420);
  const nx = -Math.sin(PH[i]),
    ny = Math.cos(PH[i]);
  for (const side of [-1, 1]) {
    const k = b * 2 + (side > 0 ? 1 : 0);
    if (hash(k + 1) < 0.72) {
      const dep = 8 + hash(k + 2) * 7,
        len = 11 + hash(k + 3) * 7,
        off = 12 + dep / 2 + hash(k + 5) * 3,
        cx = PX[i] + nx * side * off,
        cy = PY[i] + ny * side * off;
      if (clearOf(cx, cy, Math.max(len, dep) / 2 + 4, i)) {
        const r = rect(cx, cy, PH[i], len, dep);
        r.h = hash(k + 6);
        o.push(r);
      }
    }
    for (let t = 0; t < 3; t++) {
      const kk = k * 5 + t;
      if (hash(kk + 9) > 0.7) continue;
      const j = i + Math.round(((t - 1) * 8) / DS + (hash(kk + 11) - 0.5) * 4),
        off = 8 + hash(kk + 12) * 1.6,
        cx = PX[j] + -Math.sin(PH[j]) * side * off,
        cy = PY[j] + Math.cos(PH[j]) * side * off,
        r = 1.1 + hash(kk + 13) * 0.7;
      if (clearOf(cx, cy, r + 4.5, j)) o.push({ kind: 1, c: [cx, cy], r });
    }
  }
  SCN.set(b, o);
  return o;
}

/* ---------- vehicle ---------- */
const WB = 2.3,
  TW = 2.04,
  MAXD = 0.6,
  KS = 3;
let KH = 0.5,
  KE = 1.0,
  LEAD = 0;
const car = {
  x: 0,
  y: 0,
  th: 0,
  v: 6,
  delta: 0,
  acc: 0,
  u: 0,
  I: 0,
  ePrev: 0,
  vcmd: 6,
  e: 0,
  he: 0,
  iF: 0,
  s: 0,
  bounce: 0,
  jolt: 0,
  kick: 0,
  yawr: 0,
  alat: 0,
  Ld: 4,
  vt: 6,
  grade: 0,
  rough: 0,
  slip: 0,
};
const POS = { nx: 0, ny: 0 };
function place(sIdx, lat, dth, v) {
  const i = Math.round(sIdx / DS);
  ensure(i + 200);
  const nx = -Math.sin(PH[i]),
    ny = Math.cos(PH[i]);
  car.x = PX[i] + nx * lat;
  car.y = PY[i] + ny * lat;
  car.th = PH[i] + dth;
  car.v = v;
  car.vcmd = v;
  car.delta = 0;
  car.acc = 0;
  car.I = 0;
  car.u = 0;
  car.iF = i + Math.round(WB / DS);
  car.e = lat;
  trail.length = 0;
}
const trail = [];
const fired = new Set(),
  potHit = new Set(),
  stopDone = new Set();
let holdT = 0,
  gustT = 0,
  gustDir = 1,
  shove = { rem: 0, rate: 0 },
  evLab = '',
  evT = 0,
  T = 0;
const EV = [
  { id: 0, s: ZN[0] + 22, amt: 2.0, dur: 0.45, lab: 'Pushed off the path', minLap: 1 },
  { id: 1, s: ZN[4] + 16, amt: -1.6, dur: 0.5, lab: 'Side gust', minLap: 0 },
];

/* ---------- simulation ---------- */
const BUF = { t: [], v: [], vt: [], e: [] };
const DBG = { z: [0, 1, 2, 3, 4, 5].map(() => ({ e: 0, vmin: 99, vmax: 0, vel: 0 })), crash: 0 };
let lastSample = 0,
  trailD = 0;
function nearest(px, py, hint) {
  let b = hint,
    bd = 1e18;
  ensure(hint + 80);
  for (let j = Math.max(0, hint - 30); j <= hint + 40; j++) {
    const dx = px - PX[j],
      dy = py - PY[j],
      d = dx * dx + dy * dy;
    if (d < bd) {
      bd = d;
      b = j;
    }
  }
  return b;
}
function plan() {
  const s0 = car.s;
  let vt = 1e9;
  for (let d = 0; d <= 90; d += 2) vt = Math.min(vt, Math.sqrt(vStatic(s0 + d) ** 2 + 2 * AB * d));
  const lap = Math.floor((s0 + 8) / Pm),
    sStop = lap * Pm + Z_STOP;
  if (!stopDone.has(lap) && s0 < sStop + 0.6) {
    const ds = Math.max(0, sStop - s0 - 0.4);
    vt = Math.min(vt, Math.sqrt(2 * 1.6 * ds));
    if (ds < 0.6 && car.v < 0.06) {
      holdT += dtNow;
      if (holdT > 3) {
        stopDone.add(lap);
        holdT = 0;
      }
    }
  } else holdT = 0;
  return vt;
}
let dtNow = 0.016;
function step(dt) {
  dtNow = dt;
  T += dt;
  const ph = (T * 7.3) % TAU;
  // where am I on the route
  car.iF = nearest(car.x + WB * Math.cos(car.th), car.y + WB * Math.sin(car.th), car.iF);
  const i = car.iF;
  car.s = i * DS - WB;
  const lap = Math.floor((car.s + 8) / Pm);
  const fx = car.x + WB * Math.cos(car.th),
    fy = car.y + WB * Math.sin(car.th);
  car.e = (fx - PX[i]) * -Math.sin(PH[i]) + (fy - PY[i]) * Math.cos(PH[i]);
  car.he = wrapA(car.th - PH[Math.max(0, i - Math.round(WB / DS))]);
  car.rough = roughAt(car.s);
  car.slip = slipAt(car.s);
  car.grade = gradeAt(car.s);

  // events: sudden pushes
  for (const ev of EV) {
    const key = lap * 8 + ev.id,
      base = lap * Pm + ev.s;
    if (!fired.has(key) && lap >= ev.minLap && car.s >= base && car.s < base + 25) {
      fired.add(key);
      const sg = (lap % 2 ? -1 : 1) * Math.sign(ev.amt);
      shove = { rem: Math.abs(ev.amt) * sg, rate: (Math.abs(ev.amt) / ev.dur) * sg };
      evLab = ev.lab;
      evT = 3.2;
      if (ev.id === 1) {
        gustT = 2.2;
        gustDir = sg;
      }
    }
  }
  if (shove.rem !== 0) {
    const d = Math.abs(shove.rate * dt) > Math.abs(shove.rem) ? shove.rem : shove.rate * dt;
    shove.rem -= d;
    if (Math.abs(shove.rem) < 1e-6) shove.rem = 0;
    car.x += -Math.sin(car.th) * d;
    car.y += Math.cos(car.th) * d;
  }
  if (gustT > 0) gustT -= dt;
  if (evT > 0) evT -= dt;

  // potholes
  for (let k = 0; k < POT.length; k++) {
    const key = lap * 100 + k,
      ss = lap * Pm + POT[k].s;
    if (!potHit.has(key) && car.s + WB > ss && car.s + WB < ss + 1.5) {
      potHit.add(key);
      if (Math.abs(POT[k].lat - car.e) < 0.95) {
        car.kick = -3.2;
        car.jolt = 1;
        car.th += (hash(key) - 0.5) * 0.05;
        evLab = 'Pothole';
        evT = 1.2;
      }
    }
  }
  car.jolt *= Math.exp(-dt / 0.35);
  car.kick *= Math.exp(-dt / 0.2);

  /* speed: plan, smooth, then PID */
  car.vt = plan();
  const vSet = car.vt,
    up = 1.5,
    dn = 3.2;
  car.vcmd += clamp(vSet - car.vcmd, -dn * dt, up * dt);
  const err = car.vcmd - car.v;
  let D = (err - car.ePrev) / dt;
  car.ePrev = err;
  const sat = Math.abs(car.u) >= 1 && Math.sign(err) === Math.sign(car.u);
  if (!sat) car.I = clamp(car.I + err * dt, -1.4, 1.4);
  let u = 0.9 * err + 0.55 * car.I + 0.03 * D;
  if (car.vcmd < 0.05 && car.v < 0.3) {
    u = -0.25;
    car.I = 0;
  }
  car.u = clamp(u, -1, 1);
  const aCmd = car.u >= 0 ? car.u * 2.2 : car.u * 4.5;
  car.acc += (aCmd - car.acc) * (1 - Math.exp(-dt / 0.18));
  const rn =
    (car.rough *
      1.1 *
      (Math.sin(1.3 * T + 1) + 0.7 * Math.sin(2.9 * T + 2.2) + 0.5 * Math.sin(6.1 * T + 0.4))) /
    2.2;
  const aTot = car.acc - 0.035 * car.v - 9.81 * car.grade + rn + car.kick;
  car.v = Math.max(0, car.v + aTot * dt);
  if (car.v < 0.02 && car.vcmd < 0.05) car.v = 0;
  car.bounce =
    car.rough * (Math.sin(ph) * 0.5 + Math.sin(ph * 2.3 + 1) * 0.35) * (car.v / 6) +
    car.jolt * Math.sin(T * 30) * 0.8;

  /* steering: feed-forward from the path ahead, feedback on position and heading */
  const Dp = 2.5 + 0.45 * car.v,
    n = 4,
    o = Math.round((LEAD * car.v - WB) / DS);
  ensure(i + n + 12);
  car.Ld = Dp;
  const kAvg = wrapA(PH[i + o + n] - PH[i + o]) / (n * DS),
    ff = Math.atan(WB * kAvg);
  const fb = -KH * car.he - Math.atan((KE * car.e) / (KS + car.v));
  const cmd = clamp(ff + fb, -MAXD, MAXD);
  car.delta += clamp((cmd - car.delta) * (1 - Math.exp(-dt / 0.07)), -1.5 * dt, 1.5 * dt);
  const dEff = car.delta * (1 - 0.42 * car.slip);
  car.yawr =
    (car.v / WB) * Math.tan(dEff) +
    car.rough * (Math.sin(3.7 * T) + 0.6 * Math.sin(8.3 * T + 1)) * 0.018;
  car.th += car.yawr * dt;
  car.x += car.v * Math.cos(car.th) * dt;
  car.y += car.v * Math.sin(car.th) * dt;
  car.alat = ((car.v * car.v) / WB) * Math.tan(dEff);

  trailD += car.v * dt;
  if (trailD > 0.5) {
    trailD = 0;
    trail.push(car.x + Math.cos(car.th) * 1.2, car.y + Math.sin(car.th) * 1.2);
    if (trail.length > 520) trail.splice(0, 2);
  }
  if (T - lastSample > 0.05) {
    lastSample = T;
    BUF.t.push(T);
    BUF.v.push(car.v);
    BUF.vt.push(car.vcmd);
    BUF.e.push(car.e);
    if (BUF.t.length > 420) for (const k in BUF) BUF[k].shift();
  }
  const z = zoneOf(car.s).idx,
    d = DBG.z[z];
  d.e = Math.max(d.e, Math.abs(car.e));
  d.vmin = Math.min(d.vmin, car.v);
  d.vmax = Math.max(d.vmax, car.v);
  d.vel = Math.max(d.vel, Math.abs(car.v - car.vcmd));
  if (Math.abs(car.e) > 6) DBG.crash++;
}
function zoneOf(s) {
  const m = mod(s);
  let idx = 0;
  for (let k = 0; k < ZN.length; k++) if (m >= ZN[k]) idx = k;
  const a = ZN[idx],
    b = idx + 1 < ZN.length ? ZN[idx + 1] : Pm;
  return { idx, p: clamp((m - a) / (b - a), 0, 1) };
}
function go(i) {
  const lap = Math.floor(car.s / Pm);
  let s = lap * Pm + ZN[i] - (i ? 14 : -2);
  if (s < car.s + 5) s += Pm;
  const L = Math.floor((s + 8) / Pm);
  shove = { rem: 0, rate: 0 };
  holdT = 0;
  place(s, i === 0 ? 2.2 : 0, i === 0 ? -0.3 : 0, i === 5 ? 9 : 8);
  if (i === 0) {
    fired.add(L * 8);
  }
  car.s = s;
  car.iF = Math.round(s / DS) + Math.round(WB / DS);
  BUF.t.length = BUF.v.length = BUF.vt.length = BUF.e.length = 0;
}

/* ---------- copy ---------- */
const NAMES = ['Path', 'Curves', 'Rough ground', 'Hills', 'Errors', 'Stop & go'];
const TITLE = [
  'Following the path',
  'Slowing for curves',
  'Rough ground',
  'Hills',
  'Pushed off course',
  'Stop and go',
];
const DESC = [
  'The vehicle steers along a planned path. If it starts off the line, it turns gently back and settles. No snapping, no overshoot.',
  'Speed is planned along the whole path. The vehicle eases off before each bend and picks up speed on the way out. The front wheels turn by different amounts, so all four wheels follow circles around one centre.',
  'Bumps and potholes knock the speed around. A speed controller reacts to every change and keeps the vehicle steady.',
  'Climbing takes more throttle and descending takes the brakes. The speed controller adjusts, so the vehicle holds its target speed on any slope.',
  'A gust of wind shoves the vehicle sideways, and on a slippery bend the wheels respond less. Steering keeps correcting until the vehicle is back on the line, and it slows down when grip is low.',
  'At a waypoint the vehicle brakes smoothly to a stop, waits, then pulls away along the same path.',
];

/* ---------- drawing ---------- */
const toW = (lx, ly) => [
  car.x + lx * Math.cos(car.th) - ly * Math.sin(car.th),
  car.y + lx * Math.sin(car.th) + ly * Math.cos(car.th),
];
const toS = (x, y) => [camX() + (x - car.x) * SC, camY() + (y - car.y) * SC];
const pathPt = (s, lat) => {
  const i = Math.round(s / DS);
  ensure(i + 2);
  return [PX[i] - Math.sin(PH[i]) * lat, PY[i] + Math.cos(PH[i]) * lat];
};
function poly(i0, i1, lat) {
  g.beginPath();
  for (let i = i0; i <= i1; i += 2) {
    const x = PX[i] - Math.sin(PH[i]) * (lat || 0),
      y = PY[i] + Math.cos(PH[i]) * (lat || 0);
    i === i0 ? g.moveTo(x, y) : g.lineTo(x, y);
  }
}
function pill(x, y, text, col, alpha) {
  g.save();
  g.globalAlpha = alpha == null ? 1 : alpha;
  g.font = '500 12px ' + FONT;
  const w = g.measureText(text).width + 28,
    h = 26;
  x = clamp(x, 8, W - w - 8);
  y = clamp(y, 8, H - h - 8);
  g.fillStyle = 'rgba(9,14,25,.86)';
  g.strokeStyle = 'rgba(255,255,255,.12)';
  g.lineWidth = 1;
  g.beginPath();
  g.roundRect(x, y, w, h, 13);
  g.fill();
  g.stroke();
  g.fillStyle = col;
  g.beginPath();
  g.arc(x + 13, y + h / 2, 3.5, 0, TAU);
  g.fill();
  g.fillStyle = '#eaf1ff';
  g.textBaseline = 'middle';
  g.fillText(text, x + 23, y + h / 2 + 0.5);
  g.restore();
}
function wheelAngles() {
  if (Math.abs(car.delta) < 1e-4) return [car.delta, car.delta, 1e9];
  const R = WB / Math.tan(car.delta);
  return [Math.atan(WB / (R + TW / 2)), Math.atan(WB / (R - TW / 2)), R];
}
function drawCar() {
  const [dl, dr] = wheelAngles(),
    b = car.bounce,
    braking = car.acc < -0.7 || (car.v < 0.05 && car.vcmd < 0.05);
  g.save();
  g.translate(car.x, car.y);
  g.rotate(car.th);
  g.fillStyle = 'rgba(0,0,0,.4)';
  g.beginPath();
  g.roundRect(-0.9 + 0.12, -1 + 0.2, 4.5, 2, 0.55);
  g.fill();
  g.translate(1.25, 0);
  g.scale(1 + b * 0.012, 1 + b * 0.012);
  g.translate(-1.25, 0);
  g.fillStyle = '#10182a';
  for (const [wx, wy, a] of [
    [0, -1.02, 0],
    [0, 1.02, 0],
    [WB, -1.02, dl],
    [WB, 1.02, dr],
  ]) {
    g.save();
    g.translate(wx, wy);
    g.rotate(a);
    g.fillRect(-0.42, -0.15, 0.84, 0.3);
    g.restore();
  }
  g.fillStyle = '#e8eefc';
  g.beginPath();
  g.roundRect(-1, -1, 4.5, 2, 0.55);
  g.fill();
  g.fillStyle = 'rgba(8,14,28,.55)';
  g.fillRect(0.7, -0.82, 1.05, 1.64);
  g.fillRect(-0.35, -0.82, 0.45, 1.64);
  g.fillStyle = braking ? '#ff3b55' : 'rgba(255,90,110,.5)';
  g.fillRect(-1.02, -0.9, 0.22, 0.55);
  g.fillRect(-1.02, 0.35, 0.22, 0.55);
  g.fillStyle = 'rgba(255,244,214,.9)';
  g.fillRect(3.32, -0.9, 0.18, 0.4);
  g.fillRect(3.32, 0.5, 0.18, 0.4);
  g.restore();
}
function drawEnv(i0, i1, s0, s1) {
  const u = 1 / SC;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  poly(i0, i1);
  g.lineWidth = 7.4;
  g.strokeStyle = 'rgba(160,185,230,.10)';
  g.stroke();
  poly(i0, i1);
  g.lineWidth = 6.6;
  g.strokeStyle = '#0f1726';
  g.stroke();
  g.lineCap = 'butt';
  poly(i0, i1);
  g.lineWidth = u * 1.2;
  g.setLineDash([3, 4]);
  g.strokeStyle = 'rgba(255,255,255,.13)';
  g.stroke();
  g.setLineDash([]);
  for (let b = Math.floor(s0 / BL) - 1; b <= Math.floor(s1 / BL) + 1; b++) {
    if (b < 0) continue;
    for (const s of scenery(b)) {
      if (s.kind === 0) {
        g.beginPath();
        s.pts.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])));
        g.closePath();
        g.fillStyle = `rgba(${60 + s.h * 20},${84 + s.h * 18},${124 + s.h * 22},.28)`;
        g.fill();
        g.strokeStyle = 'rgba(150,180,235,.26)';
        g.lineWidth = u * 1.4;
        g.stroke();
      } else {
        g.beginPath();
        g.arc(s.c[0], s.c[1], s.r, 0, TAU);
        g.fillStyle = 'rgba(52,170,125,.30)';
        g.fill();
        g.beginPath();
        g.arc(s.c[0], s.c[1], s.r * 0.55, 0, TAU);
        g.fillStyle = 'rgba(70,200,150,.22)';
        g.fill();
      }
    }
  }
}
function drawTerrain(s0, s1) {
  const u = 1 / SC;
  for (let L = Math.floor(s0 / Pm); L <= Math.floor(s1 / Pm); L++) {
    const o = L * Pm;
    // rough: gravel and potholes
    if (o + Z_R1 > s0 && o + Z_R0 < s1) {
      g.fillStyle = 'rgba(190,170,130,.34)';
      for (let s = Math.max(o + Z_R0, s0); s < Math.min(o + Z_R1, s1); s += 1.1) {
        const a = roughAt(s);
        if (a < 0.05) continue;
        for (let k = 0; k < 4; k++) {
          const h1 = hash(s * 3.1 + k),
            h2 = hash(s * 1.7 + k * 9),
            p = pathPt(s + h1 * 1.1, (h2 - 0.5) * 5.8);
          g.fillRect(p[0], p[1], u * 2, u * 2);
        }
      }
      POT.forEach((q) => {
        const s = o + q.s;
        if (s < s0 || s > s1) return;
        const i = Math.round(s / DS),
          nx = -Math.sin(PH[i]),
          ny = Math.cos(PH[i]),
          hit = potHit.has(L * 100 + POT.indexOf(q));
        g.save();
        g.translate(PX[i] + nx * q.lat, PY[i] + ny * q.lat);
        g.rotate(PH[i]);
        g.fillStyle = 'rgba(2,4,9,.85)';
        g.beginPath();
        g.ellipse(0, 0, 0.75, 0.5, 0, 0, TAU);
        g.fill();
        g.strokeStyle = hit ? 'rgba(255,181,71,.7)' : 'rgba(190,170,130,.4)';
        g.lineWidth = u * 1.5;
        g.stroke();
        g.restore();
      });
    }
    // hills: chevrons
    if (o + Z_H1 > s0 && o + Z_H0 < s1) {
      for (let s = Math.max(o + Z_H0, s0); s < Math.min(o + Z_H1, s1); s += 5) {
        const gr = gradeAt(s);
        if (Math.abs(gr) < 0.01) continue;
        const i = Math.round(s / DS),
          up = gr > 0;
        g.save();
        g.translate(PX[i], PY[i]);
        g.rotate(PH[i]);
        g.strokeStyle = up
          ? `rgba(255,181,71,${Math.min(0.5, Math.abs(gr) * 6)})`
          : `rgba(94,224,255,${Math.min(0.5, Math.abs(gr) * 6)})`;
        g.lineWidth = u * 2;
        g.beginPath();
        for (const dy of [-1.6, 1.6]) {
          g.moveTo(-0.5, dy - 0.8);
          g.lineTo(0.5, dy);
          g.lineTo(-0.5, dy + 0.8);
        }
        g.stroke();
        g.restore();
      }
    }
    // low grip: ice
    if (o + Z_S1 > s0 && o + Z_S0 < s1) {
      const a = Math.max(0, Math.floor((o + Z_S0 - s0 > 0 ? o + Z_S0 : s0) / DS)),
        b = Math.floor(Math.min(o + Z_S1, s1) / DS);
      poly(a, b);
      g.lineCap = 'butt';
      g.lineWidth = 6.4;
      g.strokeStyle = 'rgba(160,220,255,.11)';
      g.stroke();
      for (let s = Math.max(o + Z_S0, s0); s < Math.min(o + Z_S1, s1); s += 1.6) {
        const tw = 0.5 + 0.5 * Math.sin(T * 2.4 + s * 3.7);
        if (tw < 0.4) continue;
        const p = pathPt(s, (hash(s * 5.3) - 0.5) * 5.8);
        g.fillStyle = `rgba(220,240,255,${0.45 * tw})`;
        g.fillRect(p[0], p[1], u * 2.2, u * 2.2);
      }
    }
    // stop line
    if (o + Z_STOP > s0 && o + Z_STOP < s1) {
      const i = Math.round((o + Z_STOP) / DS);
      g.save();
      g.translate(PX[i], PY[i]);
      g.rotate(PH[i]);
      g.fillStyle = 'rgba(255,255,255,.75)';
      g.fillRect(-0.2, -3.2, 0.4, 6.4);
      g.restore();
    }
  }
}
function drawPlan(iR) {
  const u = 1 / SC,
    n = 300;
  g.lineCap = 'round';
  for (let k = -80; k < n; k += 2) {
    const i = iR + k;
    if (i < 0) continue;
    ensure(i + 4);
    const r = clamp(vStatic(i * DS) / CRUISE, 0, 1),
      hue = 40 + 150 * clamp((r - 0.3) / 0.7, 0, 1),
      fade = k < 0 ? 0.25 : lerp(1, 0.35, k / n);
    g.beginPath();
    g.moveTo(PX[i], PY[i]);
    g.lineTo(PX[i + 2], PY[i + 2]);
    g.strokeStyle = `hsla(${hue},95%,62%,${0.14 * fade})`;
    g.lineWidth = 0.95;
    g.stroke();
    g.strokeStyle = `hsla(${hue},95%,66%,${0.95 * fade})`;
    g.lineWidth = u * 2.6;
    g.stroke();
  }
}
let ackA = 0;
function drawAckermann(f) {
  const [dl, dr, R] = wheelAngles(),
    u = 1 / SC;
  const a =
    clamp(Math.abs(car.delta) / 0.09, 0, 1) * (0.3 + 0.7 * ackA) * (Math.abs(R) < 45 ? 1 : 0);
  if (a < 0.03) return;
  const rear = toW(0, 0),
    fL = toW(WB, -TW / 2),
    fR = toW(WB, TW / 2),
    c = toW(0, R),
    len = Math.min(Math.abs(R), 60);
  g.save();
  g.globalAlpha = a;
  g.setLineDash([u * 6, u * 5]);
  g.lineWidth = u * 1.4;
  g.strokeStyle = 'rgba(105,175,255,.95)';
  const toward = (p) => {
    const dx = c[0] - p[0],
      dy = c[1] - p[1],
      d = Math.hypot(dx, dy) || 1,
      l = Math.min(d, 14);
    return [p[0] + (dx / d) * l, p[1] + (dy / d) * l];
  };
  g.beginPath();
  for (const p of [rear, fL, fR]) {
    const q = toward(p);
    g.moveTo(p[0], p[1]);
    g.lineTo(q[0], q[1]);
  }
  g.stroke();
  g.setLineDash([]);
  if (Math.abs(R) < 80) {
    const a0 = Math.atan2(rear[1] - c[1], rear[0] - c[0]),
      sw = Math.sign(R) * Math.min(1.6, 16 / Math.abs(R));
    g.strokeStyle = 'rgba(105,175,255,.55)';
    g.lineWidth = u * 1.6;
    g.beginPath();
    g.arc(c[0], c[1], Math.abs(R), a0, a0 + sw, sw < 0);
    g.stroke();
    g.fillStyle = 'rgba(105,175,255,.95)';
    g.beginPath();
    g.arc(c[0], c[1], u * 4, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(105,175,255,.5)';
    g.lineWidth = u * 1.2;
    g.beginPath();
    g.arc(c[0], c[1], u * 9, 0, TAU);
    g.stroke();
  }
  g.restore();
}
function drawScene() {
  const u = 1 / SC;
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  const [sx, sy] = toS(car.x, car.y),
    bg = g.createRadialGradient(sx, sy, 0, sx, sy, Math.max(W, H) * 0.85);
  bg.addColorStop(0, '#101c34');
  bg.addColorStop(1, '#04070d');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  const z = zoneOf(car.s).idx,
    shk = ((car.rough * 1.1 + car.jolt * 3.5) / SC) * 0.6;
  g.save();
  g.translate(camX(), camY());
  g.scale(SC, SC);
  g.translate(-car.x + Math.sin(T * 41) * shk, -car.y + Math.cos(T * 37) * shk);
  const span = (Math.max(W, H) / SC) * 0.8,
    iC = car.iF,
    i0 = Math.max(0, iC - Math.round(span / DS)),
    i1 = iC + Math.round((span * 1.15) / DS);
  ensure(i1 + 4);
  const s0 = car.s - span,
    s1 = car.s + span * 1.15;
  drawEnv(i0, i1, s0, s1);
  drawTerrain(s0, s1);
  drawPlan(iC - Math.round(WB / DS));

  // driven track
  if (trail.length > 4) {
    g.beginPath();
    g.moveTo(trail[0], trail[1]);
    for (let k = 2; k < trail.length; k += 2) g.lineTo(trail[k], trail[k + 1]);
    g.strokeStyle = 'rgba(255,255,255,.55)';
    g.lineWidth = u * 1.7;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.stroke();
  }
  ackA += ((z === 1 ? 1 : 0) - ackA) * 0.06;
  drawAckermann(z);

  // look-ahead point and offset
  const iP = car.iF + Math.round(car.Ld / DS);
  ensure(iP + 2);
  const fx = car.x + WB * Math.cos(car.th),
    fy = car.y + WB * Math.sin(car.th),
    showErr = Math.abs(car.e) > 0.12;
  if (showErr) {
    g.strokeStyle = '#ff8aa0';
    g.lineWidth = u * 2;
    g.beginPath();
    g.moveTo(fx, fy);
    g.lineTo(PX[car.iF], PY[car.iF]);
    g.stroke();
    g.fillStyle = '#ff8aa0';
    g.beginPath();
    g.arc(PX[car.iF], PY[car.iF], u * 3.4, 0, TAU);
    g.fill();
  }
  g.strokeStyle = 'rgba(255,181,71,.45)';
  g.lineWidth = u * 1.2;
  g.setLineDash([u * 4, u * 4]);
  g.beginPath();
  g.moveTo(fx, fy);
  g.lineTo(PX[iP], PY[iP]);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = '#ffb547';
  g.beginPath();
  g.arc(PX[iP], PY[iP], u * 4.5, 0, TAU);
  g.fill();
  g.strokeStyle = 'rgba(255,181,71,.4)';
  g.lineWidth = u * 1.3;
  g.beginPath();
  g.arc(PX[iP], PY[iP], u * 10, 0, TAU);
  g.stroke();
  drawCar();

  // side gust
  if (gustT > 0) {
    const a = Math.min(1, gustT / 0.6) * Math.min(1, (2.2 - gustT) / 0.2 + 0.2);
    g.strokeStyle = `rgba(200,225,255,${0.5 * a})`;
    g.lineWidth = u * 1.6;
    g.lineCap = 'round';
    for (let k = 0; k < 16; k++) {
      const ph = (T * 1.8 + hash(k) * 3) % 1,
        off = (hash(k + 20) - 0.5) * 24,
        lat = gustDir * (-12 + ph * 24);
      const [ax, ay] = toW(off, lat),
        [bx, by] = toW(off, lat + gustDir * 3.2);
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.stroke();
    }
  }
  g.restore();

  // labels
  if (showErr && (Math.abs(car.e) > 0.25 || z === 0 || z === 4)) {
    const [ex, ey] = toS(PX[car.iF], PY[car.iF]);
    pill(
      ex + 14,
      ey - 38,
      `${Math.round(Math.abs(car.e) * 100)} cm off the path`,
      '#ff8aa0',
      clamp(Math.abs(car.e) / 0.3, 0, 1),
    );
  }
  const [px, py] = toS(PX[iP], PY[iP]);
  if (z === 0) pill(px + 12, py - 36, 'Look-ahead point', '#ffb547', 0.9);
  // slowest point ahead
  let mn = 1e9,
    ms = 0;
  for (let d = 6; d <= 70; d += 2) {
    const v = vStatic(car.s + d);
    if (v < mn) {
      mn = v;
      ms = d;
    }
  }
  if (mn < CRUISE * 0.8 && car.v > mn + 0.8) {
    const p = pathPt(car.s + ms, 0),
      [qx, qy] = toS(p[0], p[1]);
    pill(qx + 12, qy - 34, `Speed limit ${Math.round(mn * 3.6)} km/h`, '#ffb547', 0.95);
  }
  if (car.v < 0.05 && holdT > 0) {
    const [cx, cy] = toS(car.x, car.y);
    pill(cx + 24, cy - 48, `Waiting ${Math.max(0, 3 - holdT).toFixed(1)} s`, '#5ee0ff', 1);
  }
  if (z === 1 && ackA > 0.5 && Math.abs(car.delta) > 0.07) {
    const c = toW(0, wheelAngles()[2]),
      [qx, qy] = toS(c[0], c[1]);
    pill(qx + 14, qy - 14, 'Turn centre', '#69afff', ackA);
  }
}

/* ---------- charts ---------- */
function chart(gc, w, h, f) {
  gc.setTransform(DPR, 0, 0, DPR, 0, 0);
  gc.clearRect(0, 0, w, h);
  if (w > 4 && h > 4) f(gc, w, h);
}
function drawCharts() {
  const n = BUF.t.length,
    t1 = T,
    t0 = t1 - 20;
  chart(g1, CS.s[0], CS.s[1], (c, w, h) => {
    const X = (t) => ((t - t0) / 20) * (w - 28),
      Y = (v) => h - 12 - (v / 45) * (h - 20);
    c.font = '10.5px ' + FONT;
    c.textBaseline = 'middle';
    c.fillStyle = 'rgba(143,160,189,.55)';
    c.strokeStyle = 'rgba(255,255,255,.06)';
    c.lineWidth = 1;
    for (const v of [0, 20, 40]) {
      c.beginPath();
      c.moveTo(0, Y(v));
      c.lineTo(w - 26, Y(v));
      c.stroke();
      c.fillText(v, w - 22, Y(v));
    }
    if (n < 2) return;
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const x = X(BUF.t[i]),
        y = Y(BUF.v[i] * 3.6);
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.lineTo(X(BUF.t[n - 1]), h - 12);
    c.lineTo(X(BUF.t[0]), h - 12);
    c.closePath();
    const gr = c.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(62,155,255,.28)');
    gr.addColorStop(1, 'rgba(62,155,255,0)');
    c.fillStyle = gr;
    c.fill();
    c.setLineDash([4, 4]);
    c.strokeStyle = 'rgba(180,195,220,.55)';
    c.lineWidth = 1.3;
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const x = X(BUF.t[i]),
        y = Y(BUF.vt[i] * 3.6);
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.stroke();
    c.setLineDash([]);
    c.strokeStyle = '#3e9bff';
    c.lineWidth = 2;
    c.lineJoin = 'round';
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const x = X(BUF.t[i]),
        y = Y(BUF.v[i] * 3.6);
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.stroke();
  });
  chart(g2, CS.e[0], CS.e[1], (c, w, h) => {
    let mx = 0.6;
    for (let i = 0; i < n; i++) mx = Math.max(mx, Math.abs(BUF.e[i]));
    mx = Math.ceil(mx * 5) / 5;
    chart.mx = (chart.mx || mx) + (mx - (chart.mx || mx)) * 0.1;
    mx = chart.mx;
    const X = (t) => ((t - t0) / 20) * (w - 40),
      Y = (e) => h / 2 - (e / mx) * (h / 2 - 10);
    c.font = '10.5px ' + FONT;
    c.textBaseline = 'middle';
    c.fillStyle = 'rgba(143,160,189,.55)';
    c.strokeStyle = 'rgba(255,255,255,.06)';
    c.lineWidth = 1;
    for (const f of [-1, 0, 1]) {
      const y = Y(f * mx);
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w - 38, y);
      c.stroke();
      c.fillText(f === 0 ? '0' : (f > 0 ? '+' : '−') + Math.round(mx * 100) + ' cm', w - 36, y);
    }
    if (n < 2) return;
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const x = X(BUF.t[i]),
        y = Y(BUF.e[i]);
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.strokeStyle = '#ff8aa0';
    c.lineWidth = 2;
    c.lineJoin = 'round';
    c.stroke();
    c.lineTo(X(BUF.t[n - 1]), Y(0));
    c.lineTo(X(BUF.t[0]), Y(0));
    c.closePath();
    c.fillStyle = 'rgba(255,138,160,.10)';
    c.fill();
  });
}

/* ---------- ui ---------- */
const rail = $('rail'),
  chips = [];
NAMES.forEach((n, i) => {
  const b = document.createElement('button');
  b.className = 'chip';
  b.innerHTML = n + '<span class="bar"></span>';
  b.onclick = () => go(i);
  rail.appendChild(b);
  chips.push(b);
});
let paused = false;
addEventListener('keydown', (e) => {
  if (e.key >= '1' && e.key <= '6') go(+e.key - 1);
  else if (e.key === ' ') {
    paused = !paused;
    e.preventDefault();
  }
});
const tile = (id, text, hot, stt) => {
  const el = $(id);
  el.querySelector('.s').textContent = text;
  el.classList.toggle('hot', !!hot);
  el.querySelector('i').className = stt || '';
};
const kmh = (v) => (v * 3.6).toFixed(0);
let lastUi = 0,
  shown = -1;
function ui(now) {
  const zo = zoneOf(car.s),
    f = zo.idx;
  chips.forEach((c, k) => {
    c.classList.toggle('on', k === f);
    c.querySelector('.bar').style.transform = `scaleX(${k === f ? zo.p : 0})`;
  });
  if (now - lastUi < 90) return;
  lastUi = now;
  if (shown !== f) {
    shown = f;
    $('dName').textContent = TITLE[f];
    $('dDesc').textContent = DESC[f];
  }
  const deg = (car.delta * 180) / Math.PI,
    R = Math.abs(car.delta) < 0.004 ? null : Math.abs(WB / Math.tan(car.delta));
  const upc = (() => {
    let mn = 1e9;
    for (let d = 0; d <= 40; d += 2) mn = Math.min(mn, vStatic(car.s + d));
    return mn;
  })();
  const side = Math.abs(car.alat) / 9.81,
    speedErr = Math.abs(car.vcmd - car.v) * 3.6;
  const ter =
    car.slip > 0.5
      ? 'Low grip'
      : car.rough > 0.5
        ? 'Rough'
        : car.grade > 0.02
          ? `Uphill ${(car.grade * 100).toFixed(0)}%`
          : car.grade < -0.02
            ? `Downhill ${(-car.grade * 100).toFixed(0)}%`
            : 'Smooth';
  let pk = 0;
  for (let i = Math.max(0, BUF.e.length - 120); i < BUF.e.length; i++)
    pk = Math.max(pk, Math.abs(BUF.e[i]));
  const sStop = Math.floor((car.s + 8) / Pm) * Pm + Z_STOP,
    dStop = sStop - car.s;
  const M = [
    [
      ['Off the path', Math.round(Math.abs(car.e) * 100) + ' cm'],
      ['Heading error', Math.abs((car.he * 180) / Math.PI).toFixed(1) + '°'],
      ['Look-ahead', car.Ld.toFixed(1) + ' m'],
    ],
    [
      ['Turn radius', R ? R.toFixed(0) + ' m' : 'Straight'],
      ['Speed limit', upc < CRUISE - 0.3 ? kmh(upc) + ' km/h' : 'None'],
      ['Side force', side.toFixed(2) + ' g'],
    ],
    [
      ['Roughness', Math.round(car.rough * 100) + '%'],
      ['Speed error', speedErr.toFixed(1) + ' km/h'],
      [car.u >= 0 ? 'Throttle' : 'Brake', Math.round(Math.abs(car.u) * 100) + '%'],
    ],
    [
      ['Slope', (car.grade >= 0 ? '+' : '−') + Math.abs(car.grade * 100).toFixed(0) + '%'],
      [car.u >= 0 ? 'Throttle' : 'Brake', Math.round(Math.abs(car.u) * 100) + '%'],
      ['Speed error', speedErr.toFixed(1) + ' km/h'],
    ],
    [
      ['Off the path', Math.round(Math.abs(car.e) * 100) + ' cm'],
      ['Grip', Math.round((1 - car.slip * 0.5) * 100) + '%'],
      ['Largest recent', Math.round(pk * 100) + ' cm'],
    ],
    [
      ['To stop line', dStop > 0 && dStop < 80 ? dStop.toFixed(0) + ' m' : '—'],
      ['Deceleration', Math.max(0, -car.acc).toFixed(1) + ' m/s²'],
      ['Wait', car.v < 0.05 && holdT > 0 ? holdT.toFixed(1) + ' s' : '—'],
    ],
  ][f];
  $('dMetrics').innerHTML = M.map(([l, v]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
  $('dSp').innerHTML = kmh(car.v) + '<small>km/h</small>';
  $('dTg').textContent = kmh(car.vcmd) + ' km/h';
  $('dEr').textContent = Math.round(Math.abs(car.e) * 100) + ' cm';
  $('dTh').textContent =
    (car.u >= 0 ? 'Throttle ' : 'Brake ') + Math.round(Math.abs(car.u) * 100) + '%';
  tile(
    't-str',
    Math.abs(deg) < 0.1
      ? 'Straight'
      : (deg < 0 ? 'Left ' : 'Right ') + Math.abs(deg).toFixed(1) + '°',
    f === 1 || f === 4,
  );
  tile('t-rad', R ? R.toFixed(0) + ' m' : 'Straight', f === 1);
  tile(
    't-lim',
    upc < CRUISE - 0.3 ? kmh(upc) + ' km/h' : 'Open road',
    f === 1,
    upc < CRUISE - 0.3 ? 'a' : '',
  );
  tile('t-ter', ter, f >= 2 && f <= 4, ter === 'Smooth' ? '' : 'a');
  tile(
    't-pid',
    car.u >= 0
      ? 'Throttle ' + Math.round(car.u * 100) + '%'
      : 'Brake ' + Math.round(-car.u * 100) + '%',
    f === 2 || f === 3 || f === 5,
  );
  tile('t-lat', side.toFixed(2) + ' g', f === 1, side > 0.22 ? 'a' : '');
  const el = $('stat'),
    e = Math.abs(car.e) * 100;
  let cls = 'info',
    tx = 'Tracking · ' + kmh(car.v) + ' km/h';
  if (car.v < 0.05 && car.vcmd < 0.05) {
    cls = 'bad';
    tx = holdT > 0 ? 'Stopped · waiting at waypoint' : 'Stopped · at waypoint';
  } else if (e > 30) {
    cls = 'warn';
    tx = `${evLab && evT > 0 ? evLab : 'Off the path'} · correcting · ${Math.round(e)} cm`;
  } else if (evT > 0 && evLab === 'Pothole') {
    cls = 'warn';
    tx = 'Pothole · holding speed';
  } else if (car.slip > 0.5) {
    cls = 'warn';
    tx = 'Low grip · slowing · ' + kmh(car.v) + ' km/h';
  } else if (car.rough > 0.5) {
    cls = 'warn';
    tx = 'Rough ground · holding ' + kmh(car.vcmd) + ' km/h';
  } else if (Math.abs(car.grade) > 0.02) {
    cls = 'info';
    tx =
      (car.grade > 0 ? 'Climbing ' : 'Descending ') +
      Math.abs(car.grade * 100).toFixed(0) +
      '% · holding ' +
      kmh(car.vcmd) +
      ' km/h';
  } else if (car.vt < car.v - 0.6 && car.acc < -0.5) {
    cls = 'warn';
    tx = 'Slowing · ' + kmh(car.v) + ' → ' + kmh(car.vt) + ' km/h';
  } else if (car.acc > 0.8 && car.v < CRUISE - 1) {
    cls = 'info';
    tx = 'Speeding up · ' + kmh(car.v) + ' km/h';
  }
  el.className = cls;
  el.textContent = tx;
}

/* ---------- loop ---------- */
resize();
place(4, 2.2, -0.3, 6);

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!paused) {
    let r = dt;
    while (r > 1e-6) {
      const d = Math.min(r, 1 / 60);
      step(d);
      r -= d;
    }
  }
  drawScene();
  drawCharts();
  ui(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* Test hooks, only with ?debug in the address. */
if (new URLSearchParams(location.search).has('debug')) {
  window.__sim = (sec) => {
    for (let t = 0; t < sec; t += 1 / 60) step(1 / 60);
  };
  window.__dbg = () => ({
    z: DBG.z,
    crash: DBG.crash,
    s: car.s,
    lap: Math.floor(car.s / Pm),
    v: car.v,
    e: car.e,
    T,
    P: Pm,
    ZN,
  });
}
