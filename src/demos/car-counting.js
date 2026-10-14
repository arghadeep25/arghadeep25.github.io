import { $, clamp, FONT, lerp, TAU } from './common.js';

const eio = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};

/* ---------- canvases / layout ---------- */
const cv = $('scene'),
  g = cv.getContext('2d'),
  mv = $('mini'),
  gm = mv.getContext('2d');
let W,
  H,
  DPR,
  mW,
  mH,
  VX = 0,
  VY = 0,
  VW = 1,
  VH = 1,
  F = 1,
  HY = 0,
  CX = 0;
const dockH = () => (W < 800 ? 200 : 206) + (W < 800 ? 12 : 18);
function resize() {
  DPR = Math.min(devicePixelRatio || 1, 2);
  W = innerWidth;
  H = innerHeight;
  cv.width = W * DPR;
  cv.height = H * DPR;
  const r = mv.getBoundingClientRect();
  mW = r.width;
  mH = r.height;
  mv.width = Math.max(1, mW * DPR);
  mv.height = Math.max(1, mH * DPR);
  const wide = W > 1100,
    top = W < 800 ? 62 : 112,
    availH = H - dockH() - top - (W < 800 ? 90 : 24),
    availW = wide ? W - 560 : W - (W < 800 ? 24 : 60);
  const asp = 16 / 10;
  VW = Math.min(availW, availH * asp);
  VH = VW / asp;
  VX = wide ? 28 + (availW - VW) / 2 : (W - VW) / 2;
  VY = top + (availH - VH) / 2;
  F = VW * 1.02;
  HY = VY + VH * 0.36;
  CX = VX + VW / 2;
}
addEventListener('resize', resize);

/* ---------- the gate scene (a single camera looking down the lane) ---------- */
const CAMH = 3.2,
  ZN = 7.5,
  ZF = 80,
  XE = 1.9,
  XL = -1.9,
  CARW = 1.8,
  CARL = 4.3,
  CARH = 1.45,
  ZLINE = 17,
  ROAD = 4.4;
const P = (X, Y, z) => [CX + (X * F) / z, HY + ((CAMH - Y) * F) / z];
const zOfY = (y) => (CAMH * F) / (y - HY);
const PAL = [
  '#c9d6ee',
  '#8fa0bd',
  '#d8cfc0',
  '#5d7aa8',
  '#b04a4a',
  '#3b4a63',
  '#e3e6ec',
  '#7e8a6a',
  '#a98f6a',
];
let cars = [],
  tracks = [],
  nextTrack = 1,
  T = 0,
  nextCar = 1;
const CAP = 240;
let occ = 118,
  inN = 0,
  outN = 0,
  trueIn = 0,
  trueOut = 0,
  spawnIn = 1.5,
  spawnOut = 3,
  detT = 0,
  lastDir = null,
  lastDirT = -9,
  pops = [],
  syncT = 0,
  series = [],
  serT = 0,
  clock = 14 * 3600 + 32 * 60;
const DET_DT = 1 / 17;
function spawn(dir) {
  const z = dir > 0 ? ZN - 1.5 : ZF + 2;
  for (const c of cars) if (c.dir === dir && Math.abs(c.z - z) < 11) return false;
  cars.push({
    id: nextCar++,
    dir,
    z,
    X: dir > 0 ? XE : XL,
    v: 5 + Math.random() * 3.2,
    col: PAL[Math.floor(Math.random() * PAL.length)],
    w: CARW * (0.95 + Math.random() * 0.12),
    wob: Math.random() * 6,
  });
  return true;
}
function stepWorld(dt) {
  T += dt;
  clock += dt;
  spawnIn -= dt;
  spawnOut -= dt;
  if (spawnIn <= 0 && spawn(1)) spawnIn = 3.2 + Math.random() * 3.4;
  else if (spawnIn <= 0) spawnIn = 0.6;
  if (spawnOut <= 0 && spawn(-1)) spawnOut = 4.4 + Math.random() * 4.2;
  else if (spawnOut <= 0) spawnOut = 0.6;
  for (const c of cars) {
    const slow = Math.abs(c.z - ZLINE) < 6 ? 0.72 : 1;
    c.z += c.dir * c.v * slow * dt;
    c.cross = c.cross || false;
    if (!c.cross && ((c.dir > 0 && c.z > ZLINE) || (c.dir < 0 && c.z < ZLINE))) {
      c.cross = true;
      if (c.dir > 0) trueIn++;
      else trueOut++;
    }
  }
  cars = cars.filter((c) => c.z > ZN - 3 && c.z < ZF + 6);
  for (const p of pops) p.t += dt;
  pops = pops.filter((p) => p.t < 1.6);
  serT += dt;
  if (serT > 1) {
    serT = 0;
    series.push([inN, outN]);
    if (series.length > 60) series.shift();
  }
  syncT += dt;
}
function carBox(c, noise) {
  const z = c.z,
    zf = z + CARL,
    w = c.w,
    n = noise || [0, 0, 0, 0];
  const a = P(c.X - w / 2, 0, z),
    b = P(c.X + w / 2, CARH, z),
    r1 = P(c.X - (w / 2) * 0.94, CARH, zf),
    r2 = P(c.X + (w / 2) * 0.94, CARH, zf);
  return {
    x0: Math.min(a[0], b[0]) + n[0],
    x1: Math.max(a[0], b[0]) + n[1],
    y0: Math.min(r1[1], b[1]) + n[2],
    y1: a[1] + n[3],
  };
}

/* ---------- perception: detector (17 Hz) and tracker ---------- */
const iou = (a, b) => {
  const x0 = Math.max(a.x0, b.x0),
    y0 = Math.max(a.y0, b.y0),
    x1 = Math.min(a.x1, b.x1),
    y1 = Math.min(a.y1, b.y1),
    i = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return i / ((a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - i + 1e-6);
};
let dets = [],
  lastDetStamp = 0,
  frames = 0,
  lastMatch = [];
function detect() {
  frames++;
  const out = [],
    s = VW / 1000;
  for (const c of cars) {
    const bx = carBox(c);
    if (bx.y1 < VY + 6 || bx.y1 > VY + VH + 80) continue;
    if (Math.random() < 0.045) continue;
    const bw = bx.x1 - bx.x0,
      j = () => (Math.random() - 0.5) * (0.05 * bw + 0.6);
    out.push({
      x0: bx.x0 + j(),
      x1: bx.x1 + j(),
      y0: bx.y0 + j(),
      y1: bx.y1 + j(),
      conf: 0.8 + Math.random() * 0.17,
      car: c.id,
      c: c,
    });
  }
  dets = out;
  lastDetStamp = T;
  track(out);
}
function track(ds) {
  const dt = DET_DT,
    used = new Set(),
    pairs = [];
  for (const t of tracks) {
    t.pb = {
      x0: t.box.x0 + t.vx * dt,
      x1: t.box.x1 + t.vx * dt,
      y0: t.box.y0 + t.vy * dt,
      y1: t.box.y1 + t.vy * dt,
    };
  }
  for (const t of tracks)
    for (let i = 0; i < ds.length; i++) {
      const d = ds[i],
        q = iou(t.pb, d),
        cd = Math.hypot(
          (t.pb.x0 + t.pb.x1) / 2 - (d.x0 + d.x1) / 2,
          (t.pb.y0 + t.pb.y1) / 2 - (d.y0 + d.y1) / 2,
        ),
        sz = Math.max(t.pb.x1 - t.pb.x0, 6);
      if (q > 0.08 || cd < sz * 0.9) pairs.push([q + (1 - Math.min(1, cd / sz)) * 0.5, t, i]);
    }
  pairs.sort((a, b) => b[0] - a[0]);
  const mt = new Set();
  lastMatch = [];
  for (const [, t, i] of pairs) {
    if (mt.has(t) || used.has(i)) continue;
    mt.add(t);
    used.add(i);
    const d = ds[i],
      pb = t.box;
    const ny = d.y1,
      vy = (ny - pb.y1) / dt,
      vx = ((d.x0 + d.x1) / 2 - (pb.x0 + pb.x1) / 2) / dt;
    t.vy = t.vy * 0.6 + vy * 0.4;
    t.vx = t.vx * 0.6 + vx * 0.4;
    t.prev = pb;
    t.box = { x0: d.x0, x1: d.x1, y0: d.y0, y1: d.y1 };
    t.hits++;
    t.miss = 0;
    t.conf = d.conf;
    t.coast = false;
    lastMatch.push([t.id, pb, t.box]);
    t.hist.push([(d.x0 + d.x1) / 2, d.y1, T]);
    if (t.hist.length > 60) t.hist.shift();
    t.src = d.car;
  }
  for (const t of tracks)
    if (!mt.has(t)) {
      t.miss++;
      t.coast = true;
      t.prev = t.box;
      t.box = {
        x0: t.box.x0 + t.vx * dt,
        x1: t.box.x1 + t.vx * dt,
        y0: t.box.y0 + t.vy * dt,
        y1: t.box.y1 + t.vy * dt,
      };
    }
  for (let i = 0; i < ds.length; i++)
    if (!used.has(i)) {
      const d = ds[i];
      tracks.push({
        id: nextTrack++,
        box: { x0: d.x0, x1: d.x1, y0: d.y0, y1: d.y1 },
        prev: null,
        vx: 0,
        vy: 0,
        hits: 1,
        miss: 0,
        hist: [[(d.x0 + d.x1) / 2, d.y1, T]],
        dir: 0,
        counted: false,
        conf: d.conf,
        birth: T,
        src: d.car,
      });
    }
  // direction + counting
  const ly = P(0, 0, ZLINE)[1];
  for (const t of tracks) {
    if (t.hits >= 5 && !t.dir) {
      const h = t.hist,
        a = h[h.length - 5],
        b = h[h.length - 1],
        dy = b[1] - a[1],
        thr = VW * 0.004;
      if (Math.abs(dy) > thr) t.dir = dy < 0 ? 1 : -1;
    }
    if (!t.counted && t.dir && t.hist.length > 1) {
      const a = t.hist[t.hist.length - 2][1],
        b = t.hist[t.hist.length - 1][1];
      if ((t.dir > 0 && a >= ly && b < ly) || (t.dir < 0 && a <= ly && b > ly)) {
        t.counted = true;
        if (t.dir > 0) {
          inN++;
          occ = Math.min(CAP, occ + 1);
        } else {
          outN++;
          occ = Math.max(0, occ - 1);
        }
        lastDir = t.dir;
        lastDirT = T;
        syncT = 0;
        pops.push({ t: 0, dir: t.dir, x: (t.box.x0 + t.box.x1) / 2 });
      }
    }
  }
  tracks = tracks.filter((t) => t.miss < 10 && t.box.y1 < VY + VH + 140 && t.box.y1 > VY - 20);
}

/* ---------- copy ---------- */
const NAMES = ['Camera', 'Detection', 'Tracking', 'Direction', 'Counting', 'Live data'];
const TITLE = [
  'One camera at the gate',
  'Finding every car',
  'Following each car',
  'In or out?',
  'Counting',
  'Live availability',
];
const DESC = [
  'A single camera watches the entrance and exit lane of the car park. No second camera, and nobody counting by hand.',
  'A lightweight detection model finds every car in every frame. It runs on the CPU of a Raspberry Pi 3, with no GPU, at 17 frames per second.',
  'Each detection is linked to the same car in the next frame, so every car keeps one identity as it passes, even if a frame is missed.',
  'The way a car moves tells entering from leaving. Heading away from the camera is in. Coming toward it is out. One camera is enough.',
  'A car is counted once, the moment it crosses the line. Cars entering add to the total, cars leaving subtract.',
  'The count streams to a database that powers a website and an app, so drivers see free spaces before they arrive.',
];
const VLAB = [
  'Raspberry Pi 3 · CPU only',
  'Each frame, in about 59 ms',
  'Frame to frame · same car, same ID',
  'Position over time · direction of travel',
  'Counted in the last minute',
  'From the gate to the driver',
];
const DWELL = [6, 7, 7, 7, 8, 9];
const ST = { f: 0, ft: 0, pin: -1, paused: false },
  Lay = [0, 0, 0, 0, 0, 0];
const focus = () => (ST.pin >= 0 ? ST.pin : ST.f);

/* ---------- drawing: scene ---------- */
function pill(x, y, text, col, alpha) {
  g.save();
  g.globalAlpha = alpha == null ? 1 : alpha;
  g.font = '500 12px ' + FONT;
  const w = g.measureText(text).width + 28,
    h = 26;
  x = clamp(x, VX + 6, VX + VW - w - 6);
  y = clamp(y, VY + 6, VY + VH - h - 6);
  g.fillStyle = 'rgba(9,14,25,.9)';
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
function drawRoad() {
  const sky = g.createLinearGradient(0, VY, 0, HY);
  sky.addColorStop(0, '#0b1322');
  sky.addColorStop(1, '#16233a');
  g.fillStyle = sky;
  g.fillRect(VX, VY, VW, VH);
  const gl = g.createRadialGradient(CX, HY, 0, CX, HY, VW * 0.22);
  gl.addColorStop(0, 'rgba(210,230,255,.9)');
  gl.addColorStop(0.25, 'rgba(120,170,230,.35)');
  gl.addColorStop(1, 'rgba(60,100,160,0)');
  g.fillStyle = gl;
  g.fillRect(VX, VY, VW, VH);
  const gr = g.createLinearGradient(0, HY, 0, VY + VH);
  gr.addColorStop(0, '#1b2332');
  gr.addColorStop(1, '#0c1019');
  g.fillStyle = gr;
  g.fillRect(VX, HY, VW, VH - (HY - VY));
  // road
  const a = P(-ROAD, 0, ZN - 1),
    b = P(ROAD, 0, ZN - 1),
    c = P(ROAD, 0, ZF),
    d = P(-ROAD, 0, ZF);
  const rg = g.createLinearGradient(0, d[1], 0, a[1]);
  rg.addColorStop(0, '#2a3342');
  rg.addColorStop(1, '#161c28');
  g.fillStyle = rg;
  g.beginPath();
  g.moveTo(a[0], a[1]);
  g.lineTo(b[0], b[1]);
  g.lineTo(c[0], c[1]);
  g.lineTo(d[0], d[1]);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,.22)';
  for (const X of [-ROAD, ROAD]) {
    const p0 = P(X, 0, ZN - 1),
      p1 = P(X, 0, ZF);
    g.lineWidth = VW * 0.004;
    g.beginPath();
    g.moveTo(p0[0], p0[1]);
    g.lineTo(p1[0], p1[1]);
    g.stroke();
  }
  g.strokeStyle = 'rgba(255,255,255,.35)';
  for (let z = ZN; z < ZF; z += 3.2) {
    const p0 = P(0, 0, z),
      p1 = P(0, 0, z + 1.6);
    g.lineWidth = Math.max(1, (0.14 * F) / z);
    g.beginPath();
    g.moveTo(p0[0], p0[1]);
    g.lineTo(p1[0], p1[1]);
    g.stroke();
  }
  // side walls, pillars, ceiling lights
  for (const sd of [-1, 1]) {
    const w0 = P(sd * 6.4, 0, ZN - 1),
      w1 = P(sd * 6.4, 3.6, ZN - 1),
      w2 = P(sd * 6.4, 3.6, ZF),
      w3 = P(sd * 6.4, 0, ZF);
    const wg = g.createLinearGradient(w0[0], 0, w3[0], 0);
    wg.addColorStop(0, '#1d2433');
    wg.addColorStop(1, '#2a3446');
    g.fillStyle = wg;
    g.beginPath();
    g.moveTo(w0[0], w0[1]);
    g.lineTo(w1[0], w1[1]);
    g.lineTo(w2[0], w2[1]);
    g.lineTo(w3[0], w3[1]);
    g.closePath();
    g.fill();
    for (let z = ZN + 2; z < ZF; z += 9) {
      const p0 = P(sd * 5.6, 0, z),
        p1 = P(sd * 5.6, 3.6, z),
        pw = (0.55 * F) / z;
      g.fillStyle = '#323d52';
      g.fillRect(p0[0] - pw / 2, p1[1], pw, p0[1] - p1[1]);
      g.fillStyle = 'rgba(255,214,120,.55)';
      g.fillRect(p0[0] - pw / 2, p0[1] - (1.1 * F) / z, pw, Math.max(1.5, (0.08 * F) / z));
    }
  }
  for (let z = ZN + 4; z < ZF; z += 9) {
    const p0 = P(-3.2, 3.55, z),
      p1 = P(3.2, 3.55, z);
    g.strokeStyle = 'rgba(190,220,255,.8)';
    g.lineWidth = Math.max(1.2, (0.14 * F) / z);
    g.beginPath();
    g.moveTo(p0[0], p0[1]);
    g.lineTo(p1[0], p1[1]);
    g.stroke();
    const gg = g.createLinearGradient(0, p0[1], 0, p0[1] + 40);
  }
  // gate: island and barrier posts at the counting line
  const i0 = P(-0.5, 0, ZLINE - 1.2),
    i1 = P(0.5, 0, ZLINE - 1.2),
    i2 = P(0.5, 1.15, ZLINE - 1.2),
    i3 = P(-0.5, 1.15, ZLINE - 1.2),
    k0 = P(-0.5, 0, ZLINE + 1.2),
    k2 = P(0.5, 1.15, ZLINE + 1.2),
    k3 = P(-0.5, 1.15, ZLINE + 1.2);
  g.fillStyle = '#3a4559';
  g.beginPath();
  g.moveTo(i3[0], i3[1]);
  g.lineTo(i2[0], i2[1]);
  g.lineTo(k2[0], k2[1]);
  g.lineTo(k3[0], k3[1]);
  g.closePath();
  g.fill();
  g.fillStyle = '#566277';
  g.fillRect(i0[0], i2[1], i1[0] - i0[0], i0[1] - i2[1]);
}
function drawCar(c) {
  const z = c.z,
    zf = z + CARL,
    w = c.w,
    rear = c.dir > 0,
    col = c.col,
    s = F / z;
  const a = P(c.X - w / 2, 0, z),
    b = P(c.X + w / 2, CARH, z),
    r1 = P(c.X - (w / 2) * 0.92, CARH, zf),
    r2 = P(c.X + (w / 2) * 0.92, CARH, zf),
    t1 = P(c.X - w / 2, CARH, z),
    t2 = P(c.X + w / 2, CARH, z);
  g.fillStyle = 'rgba(0,0,0,.4)';
  g.beginPath();
  g.ellipse((a[0] + b[0]) / 2, a[1] + s * 0.1, s * w * 0.62, s * 0.32, 0, 0, TAU);
  g.fill();
  // roof
  g.fillStyle = shade(col, 0.82);
  g.beginPath();
  g.moveTo(t1[0], t1[1]);
  g.lineTo(t2[0], t2[1]);
  g.lineTo(r2[0], r2[1]);
  g.lineTo(r1[0], r1[1]);
  g.closePath();
  g.fill();
  const x0 = a[0],
    x1 = b[0],
    y1 = a[1],
    y0 = b[1],
    fw = x1 - x0,
    fh = y1 - y0;
  g.fillStyle = col;
  g.beginPath();
  g.roundRect(x0, y0 + fh * 0.16, fw, fh * 0.84, fw * 0.06);
  g.fill();
  g.fillStyle = 'rgba(8,14,26,.82)';
  g.beginPath();
  g.roundRect(x0 + fw * 0.1, y0 + fh * 0.02, fw * 0.8, fh * 0.4, fw * 0.05);
  g.fill();
  g.fillStyle = '#05080f';
  g.fillRect(x0 + fw * 0.04, y1 - fh * 0.12, fw * 0.16, fh * 0.12);
  g.fillRect(x1 - fw * 0.2, y1 - fh * 0.12, fw * 0.16, fh * 0.12);
  if (rear) {
    g.fillStyle = '#ff3b55';
    g.fillRect(x0 + fw * 0.04, y0 + fh * 0.52, fw * 0.2, fh * 0.1);
    g.fillRect(x1 - fw * 0.24, y0 + fh * 0.52, fw * 0.2, fh * 0.1);
    g.fillStyle = '#e8eefc';
    g.fillRect(x0 + fw * 0.38, y0 + fh * 0.66, fw * 0.24, fh * 0.09);
  } else {
    g.fillStyle = '#fff7da';
    g.fillRect(x0 + fw * 0.05, y0 + fh * 0.52, fw * 0.2, fh * 0.1);
    g.fillRect(x1 - fw * 0.25, y0 + fh * 0.52, fw * 0.2, fh * 0.1);
    g.fillStyle = 'rgba(0,0,0,.45)';
    g.fillRect(x0 + fw * 0.32, y0 + fh * 0.62, fw * 0.36, fh * 0.12);
  }
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16),
    r = (n >> 16) * f,
    gg = ((n >> 8) & 255) * f,
    b = (n & 255) * f;
  return `rgb(${r | 0},${gg | 0},${b | 0})`;
}
function updateLayers(dt) {
  const f = focus(),
    k = 1 - Math.exp(-dt * 5);
  for (let i = 0; i < 6; i++) Lay[i] += ((f >= i ? 1 : 0) - Lay[i]) * k;
}
function drawScene() {
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  const bg = g.createRadialGradient(W * 0.4, H * 0.4, 0, W * 0.4, H * 0.4, Math.max(W, H) * 0.9);
  bg.addColorStop(0, '#0e1a30');
  bg.addColorStop(1, '#04070d');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.save();
  g.shadowColor = 'rgba(0,0,0,.7)';
  g.shadowBlur = 40;
  g.fillStyle = '#000';
  g.beginPath();
  g.roundRect(VX, VY, VW, VH, 16);
  g.fill();
  g.restore();
  g.save();
  g.beginPath();
  g.roundRect(VX, VY, VW, VH, 16);
  g.clip();
  drawRoad();
  const f = focus(),
    ly = P(0, 0, ZLINE)[1];
  const far = [...cars].sort((a, b) => b.z - a.z);
  for (const c of far) drawCar(c);
  // count line
  const la = Lay[4],
    l0 = P(-ROAD, 0, ZLINE),
    l1 = P(ROAD, 0, ZLINE);
  g.strokeStyle = `rgba(52,211,153,${0.25 + 0.75 * la})`;
  g.lineWidth = 2 + 2 * la;
  g.setLineDash([10, 7]);
  g.beginPath();
  g.moveTo(l0[0], l0[1]);
  g.lineTo(l1[0], l1[1]);
  g.stroke();
  g.setLineDash([]);
  if (la > 0.1) {
    const gl = g.createLinearGradient(0, l0[1] - 24, 0, l0[1] + 24);
    gl.addColorStop(0, 'rgba(52,211,153,0)');
    gl.addColorStop(0.5, `rgba(52,211,153,${0.18 * la})`);
    gl.addColorStop(1, 'rgba(52,211,153,0)');
    g.fillStyle = gl;
    g.fillRect(l0[0], l0[1] - 24, l1[0] - l0[0], 48);
  }
  // detections
  const stale = T - lastDetStamp;
  if (Lay[1] > 0.02)
    for (const d of dets) {
      const x = d.x0,
        y = d.y0,
        w = d.x1 - d.x0,
        h = d.y1 - d.y0;
      g.globalAlpha = Lay[1] * (f >= 2 ? 0.45 : 1);
      g.strokeStyle = '#eaf1ff';
      g.lineWidth = 1.6;
      g.strokeRect(x, y, w, h);
      if (f === 1) {
        g.fillStyle = 'rgba(234,241,255,.95)';
        g.fillRect(x, y - 16, 52, 16);
        g.fillStyle = '#05080f';
        g.font = '600 10.5px ' + FONT;
        g.textBaseline = 'middle';
        g.fillText('car ' + d.conf.toFixed(2), x + 5, y - 7.5);
      }
      g.globalAlpha = 1;
    }
  // tracks
  if (Lay[2] > 0.02)
    for (const t of tracks) {
      if (t.hits < 3) continue;
      const x = t.box.x0,
        y = t.box.y0,
        w = t.box.x1 - t.box.x0,
        h = t.box.y1 - t.box.y0,
        col = t.dir > 0 ? '#3e9bff' : t.dir < 0 ? '#ffb547' : '#cfe0ff',
        dc = Lay[3] > 0.5 && t.dir ? col : '#cfe0ff';
      g.globalAlpha = Lay[2];
      g.strokeStyle = 'rgba(255,255,255,.5)';
      g.lineWidth = 2;
      g.beginPath();
      t.hist.forEach((p, i) => {
        const k = i / t.hist.length;
        i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]);
      });
      g.strokeStyle = Lay[3] > 0.5 && t.dir ? col : 'rgba(207,224,255,.6)';
      g.stroke();
      g.strokeStyle = dc;
      g.lineWidth = 2.4;
      if (t.coast) g.setLineDash([5, 4]);
      g.strokeRect(x, y, w, h);
      g.setLineDash([]);
      const label = '#' + t.id + (Lay[3] > 0.5 && t.dir ? (t.dir > 0 ? '  IN' : '  OUT') : '');
      g.font = '600 11px ' + FONT;
      const tw = g.measureText(label).width + 12;
      g.fillStyle = dc;
      g.fillRect(x, y - 18, tw, 18);
      g.fillStyle = '#05080f';
      g.textBaseline = 'middle';
      g.fillText(label, x + 6, y - 8.5);
      if (Lay[3] > 0.5 && t.dir) {
        const cx2 = x + w / 2,
          cy2 = y + h / 2,
          dy = t.dir > 0 ? -1 : 1,
          s = Math.max(8, w * 0.16);
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(cx2, cy2 + dy * s);
        g.lineTo(cx2 - s * 0.8, cy2 - dy * s * 0.2);
        g.lineTo(cx2 + s * 0.8, cy2 - dy * s * 0.2);
        g.closePath();
        g.globalAlpha = Lay[3] * 0.85;
        g.fill();
      }
      g.globalAlpha = 1;
    }
  // count pops
  for (const p of pops) {
    const a = 1 - p.t / 1.6,
      y = ly - 30 - p.t * 40;
    g.globalAlpha = clamp(a * 2, 0, 1) * Lay[4];
    g.fillStyle = p.dir > 0 ? '#3e9bff' : '#ffb547';
    g.font = '600 18px ' + FONT;
    g.textAlign = 'center';
    g.fillText(p.dir > 0 ? '+1 in' : '+1 out', clamp(p.x, VX + 40, VX + VW - 40), y);
    g.textAlign = 'left';
    g.globalAlpha = 1;
  }
  // hud
  const m = 14;
  g.strokeStyle = 'rgba(255,255,255,.55)';
  g.lineWidth = 2;
  for (const [x, y, dx, dy] of [
    [VX + m, VY + m, 1, 1],
    [VX + VW - m, VY + m, -1, 1],
    [VX + m, VY + VH - m, 1, -1],
    [VX + VW - m, VY + VH - m, -1, -1],
  ]) {
    g.beginPath();
    g.moveTo(x, y + dy * 16);
    g.lineTo(x, y);
    g.lineTo(x + dx * 16, y);
    g.stroke();
  }
  g.fillStyle = 'rgba(255,255,255,.85)';
  g.font = '500 11px ' + FONT;
  g.textBaseline = 'middle';
  g.fillText('CAM 01 · GATE', VX + m + 8, VY + m + 18);
  const hh = Math.floor(clock / 3600) % 24,
    mm = Math.floor(clock / 60) % 60,
    ss = Math.floor(clock) % 60;
  g.fillText(
    `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`,
    VX + m + 8,
    VY + VH - m - 14,
  );
  g.textAlign = 'right';
  g.fillText('17 FPS', VX + VW - m - 8, VY + m + 18);
  g.textAlign = 'left';
  g.fillStyle = Math.floor(T * 1.4) % 2 ? '#ff3b55' : 'rgba(255,59,85,.3)';
  g.beginPath();
  g.arc(VX + VW - m - 64, VY + m + 18, 3.5, 0, TAU);
  g.fill();
  // free spaces badge
  if (Lay[5] > 0.02) {
    g.globalAlpha = Lay[5];
    const bw = 230,
      bx = CX - bw / 2,
      by = VY + 16;
    g.fillStyle = 'rgba(9,14,25,.88)';
    g.strokeStyle = 'rgba(255,255,255,.14)';
    g.beginPath();
    g.roundRect(bx, by, bw, 52, 14);
    g.fill();
    g.stroke();
    g.fillStyle = '#8fa0bd';
    g.font = '500 11.5px ' + FONT;
    g.textAlign = 'center';
    g.fillText('Free spaces', CX, by + 16);
    g.fillStyle = CAP - occ < 20 ? '#ffcf85' : '#34d399';
    g.font = '600 24px ' + FONT;
    g.fillText(String(CAP - occ), CX, by + 37);
    g.textAlign = 'left';
    g.globalAlpha = 1;
  }
  g.restore();
  if (f === 0) pill(VX + 18, VY + VH - 50, '1 camera · entrance and exit', '#5ee0ff', 1);
  if (f === 1) pill(VX + 18, VY + VH - 50, `${dets.length} cars in this frame`, '#eaf1ff', 1);
  if (f === 5)
    pill(
      VX + 18,
      VY + VH - 50,
      syncT < 1.5 ? 'Count sent to the cloud' : 'Synced with the app',
      '#34d399',
      1,
    );
}

/* ---------- drawing: dock views ---------- */
function mt(t, x, y, col, size, align, wgt) {
  gm.fillStyle = col || 'rgba(143,160,189,.9)';
  gm.font = `${wgt || 500} ${size || 11.5}px ${FONT}`;
  gm.textAlign = align || 'left';
  gm.textBaseline = 'middle';
  gm.fillText(t, x, y);
  gm.textAlign = 'left';
}
function rr(x, y, w, h, r, fill, stroke) {
  gm.beginPath();
  gm.roundRect(x, y, w, h, r);
  if (fill) {
    gm.fillStyle = fill;
    gm.fill();
  }
  if (stroke) {
    gm.strokeStyle = stroke;
    gm.lineWidth = 1;
    gm.stroke();
  }
}
function drawMini(f, now) {
  if (!mW || !mH) return;
  gm.setTransform(DPR, 0, 0, DPR, 0, 0);
  gm.clearRect(0, 0, mW, mH);
  const tt = now / 1000;
  if (f === 0) {
    const r = Math.min(mH / 2 - 8, 56),
      cx = r + 16,
      cy = mH / 2;
    gm.lineWidth = 9;
    gm.lineCap = 'round';
    gm.strokeStyle = 'rgba(255,255,255,.08)';
    gm.beginPath();
    gm.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25);
    gm.stroke();
    gm.strokeStyle = '#5ee0ff';
    gm.beginPath();
    gm.arc(cx, cy, r, Math.PI * 0.75, Math.PI * (0.75 + (1.5 * 17) / 30));
    gm.stroke();
    mt('17', cx, cy - 4, '#eaf1ff', 30, 'center', 600);
    mt('frames per second', cx, cy + 22, '#8fa0bd', 11, 'center');
    const x = cx + r + 40;
    [
      ['Computer', 'Raspberry Pi 3'],
      ['Processor', 'CPU only, no GPU'],
      ['Camera', 'One, at the gate'],
    ].forEach(([a, b], i) => {
      mt(a, x, 20 + i * 34, '#8fa0bd', 11.5);
      mt(b, x, 38 + i * 34, '#eaf1ff', 14, 'left', 600);
    });
    const sx = x + 200;
    if (mW - sx > 150) {
      mt('Frames', sx, 20, '#8fa0bd', 11.5);
      for (let i = 0; i < 17; i++) {
        const on = Math.floor(tt * 17) % 17 === i;
        rr(sx + i * 11, 34, 7, on ? 46 : 30, 3, on ? '#5ee0ff' : 'rgba(94,224,255,.3)');
      }
      mt('one second', sx, 96, '#5b6b86', 10.5);
    }
    return;
  }
  if (f === 1) {
    const stages = [
        ['Camera frame', '3 ms', '#8fa0bd'],
        ['Resize', '4 ms', '#8fa0bd'],
        ['Detector (CPU)', '46 ms', '#5ee0ff'],
        ['Boxes', '6 ms', '#eaf1ff'],
      ],
      n = 4,
      bw = (mW - 40 - (n - 1) * 26) / n,
      y = 18,
      h = mH - 58,
      ph = (tt % 2.4) / 2.4;
    stages.forEach(([l, ms, col], i) => {
      const x = 6 + i * (bw + 26);
      rr(
        x,
        y,
        bw,
        h,
        12,
        i === 2 ? 'rgba(94,224,255,.12)' : 'rgba(255,255,255,.04)',
        i === 2 ? 'rgba(94,224,255,.5)' : 'rgba(255,255,255,.1)',
      );
      mt(l, x + bw / 2, y + h / 2 - 8, '#eaf1ff', 12.5, 'center', 600);
      mt(ms, x + bw / 2, y + h / 2 + 12, col, 12, 'center');
      if (i < n - 1) {
        gm.strokeStyle = 'rgba(255,255,255,.25)';
        gm.beginPath();
        gm.moveTo(x + bw + 4, y + h / 2);
        gm.lineTo(x + bw + 22, y + h / 2);
        gm.stroke();
      }
    });
    const tx = 6 + ph * (mW - 50);
    gm.fillStyle = '#fff';
    gm.beginPath();
    gm.arc(tx, y + h + 10, 4, 0, TAU);
    gm.fill();
    mt('about 59 ms per frame, 17 frames every second', 6, mH - 8, '#8fa0bd', 11.5);
    return;
  }
  if (f === 2) {
    const pw = (mW - 90) / 2,
      ph = mH - 30,
      ax = 6,
      bx = ax + pw + 60,
      sx = pw / VW,
      sy = ph / (VH * 1.05),
      px = (x, o) => o + (x - VX) * sx,
      py = (y) => 14 + (y - VY) * sy;
    for (const [x, t] of [
      [ax, 'Previous frame'],
      [bx, 'This frame'],
    ]) {
      rr(x, 14, pw, ph, 10, 'rgba(255,255,255,.03)', 'rgba(255,255,255,.08)');
      mt(t, x + pw / 2, mH - 6, '#8fa0bd', 11, 'center');
    }
    for (const [id, a, b] of lastMatch) {
      if (!a) continue;
      const ba = { x0: px(a.x0, ax), y0: py(a.y0), x1: px(a.x1, ax), y1: py(a.y1) },
        bb = { x0: px(b.x0, bx), y0: py(b.y0), x1: px(b.x1, bx), y1: py(b.y1) };
      if (bb.y1 < 14 || bb.y0 > 14 + ph) continue;
      gm.strokeStyle = 'rgba(94,224,255,.55)';
      gm.setLineDash([3, 3]);
      gm.beginPath();
      gm.moveTo(ba.x1, (ba.y0 + ba.y1) / 2);
      gm.lineTo(bb.x0, (bb.y0 + bb.y1) / 2);
      gm.stroke();
      gm.setLineDash([]);
      for (const [q, o] of [
        [ba, 0],
        [bb, 1],
      ]) {
        gm.strokeStyle = '#eaf1ff';
        gm.lineWidth = 1.4;
        gm.strokeRect(q.x0, q.y0, q.x1 - q.x0, q.y1 - q.y0);
        mt('#' + id, q.x0 + 2, q.y0 - 6, '#5ee0ff', 10.5, 'left', 600);
      }
    }
    mt('same car', ax + pw + 30, 14 + ph / 2, '#5ee0ff', 11, 'center');
    return;
  }
  if (f === 3) {
    const x0 = 8,
      w = mW - 150,
      y0 = 16,
      h = mH - 44,
      win = 3;
    rr(x0, y0, w, h, 10, 'rgba(255,255,255,.03)', 'rgba(255,255,255,.08)');
    mt('Away', x0 + 10, y0 + 12, '#3e9bff', 11, 'left', 600);
    mt('Toward', x0 + 10, y0 + h - 12, '#ffb547', 11, 'left', 600);
    mt('Last 3 seconds', x0 + w / 2, mH - 8, '#8fa0bd', 10.5, 'center');
    let k = 0;
    for (const t of tracks) {
      if (t.hits < 4) continue;
      const col = t.dir > 0 ? '#3e9bff' : t.dir < 0 ? '#ffb547' : '#cfe0ff';
      gm.strokeStyle = col;
      gm.lineWidth = 2;
      gm.beginPath();
      let st = false;
      for (const p of t.hist) {
        if (T - p[2] > win) continue;
        const X = x0 + 50 + (1 - (T - p[2]) / win) * (w - 66),
          Y = y0 + h - 10 - clamp((zOfY(p[1]) - ZN) / (ZF - ZN), 0, 1) * (h - 20);
        st ? gm.lineTo(X, Y) : gm.moveTo(X, Y);
        st = true;
      }
      gm.stroke();
      k++;
    }
    const rx = x0 + w + 16;
    mt('Moving away', rx, 26, '#3e9bff', 12, 'left', 600);
    mt('= entering', rx, 44, '#8fa0bd', 11.5);
    mt('Moving toward', rx, 78, '#ffb547', 12, 'left', 600);
    mt('= leaving', rx, 96, '#8fa0bd', 11.5);
    return;
  }
  if (f === 4) {
    const x0 = 6,
      w = mW * 0.56,
      y0 = 10,
      h = mH - 30;
    rr(x0, y0, w, h, 10, 'rgba(255,255,255,.03)', 'rgba(255,255,255,.08)');
    if (series.length > 1) {
      const mx = Math.max(4, ...series.map((s) => Math.max(s[0], s[1]))),
        X = (i) => x0 + 14 + (i / 59) * (w - 28),
        Y = (v) => y0 + h - 14 - (v / mx) * (h - 28);
      for (const [k, col] of [
        [0, '#3e9bff'],
        [1, '#ffb547'],
      ]) {
        gm.strokeStyle = col;
        gm.lineWidth = 2;
        gm.lineJoin = 'round';
        gm.beginPath();
        series.forEach((s, i) => {
          const x = X(i + 60 - series.length),
            y = Y(s[k]);
          i ? gm.lineTo(x, y) : gm.moveTo(x, y);
        });
        gm.stroke();
      }
    }
    mt('Total since start of this view', x0 + 12, y0 + 12, '#8fa0bd', 10.5);
    mt('Last minute', x0 + w / 2, mH - 8, '#8fa0bd', 10.5, 'center');
    const rx = x0 + w + 26;
    mt('Entered', rx, 22, '#8fa0bd', 11.5);
    mt(String(inN), rx, 52, '#3e9bff', 34, 'left', 600);
    mt('Left', rx + 110, 22, '#8fa0bd', 11.5);
    mt(String(outN), rx + 110, 52, '#ffb547', 34, 'left', 600);
    mt('In the car park', rx, 92, '#8fa0bd', 11.5);
    mt(`${occ} of ${CAP}`, rx, 114, '#eaf1ff', 17, 'left', 600);
    return;
  }
  if (f === 5) {
    const y = mH / 2,
      nodes = [
        ['Camera + Pi', 70],
        ['Database', 210],
        ['Website', 360],
        ['App', 360],
      ];
    rr(6, y - 36, 110, 72, 12, 'rgba(255,255,255,.04)', 'rgba(255,255,255,.12)');
    mt('Pi at the gate', 61, y - 6, '#eaf1ff', 12.5, 'center', 600);
    mt(
      'count: ' + (inN - outN >= 0 ? '+' : '') + (inN - outN),
      61,
      y + 14,
      '#5ee0ff',
      12,
      'center',
    );
    gm.fillStyle = 'rgba(62,155,255,.14)';
    gm.strokeStyle = 'rgba(62,155,255,.5)';
    gm.beginPath();
    gm.roundRect(170, y - 36, 100, 72, 12);
    gm.fill();
    gm.stroke();
    mt('Database', 220, y - 6, '#eaf1ff', 12.5, 'center', 600);
    mt('live count', 220, y + 14, '#8fa0bd', 11.5, 'center');
    rr(330, y - 62, 104, 52, 10, 'rgba(255,255,255,.04)', 'rgba(255,255,255,.12)');
    mt('Website', 382, y - 40, '#eaf1ff', 12, 'center', 600);
    mt('free: ' + (CAP - occ), 382, y - 22, '#34d399', 12, 'center');
    rr(330, y + 10, 104, 52, 10, 'rgba(255,255,255,.04)', 'rgba(255,255,255,.12)');
    mt('App', 382, y + 32, '#eaf1ff', 12, 'center', 600);
    mt('free: ' + (CAP - occ), 382, y + 50, '#34d399', 12, 'center');
    for (const [x1, y1, x2, y2] of [
      [116, y, 170, y],
      [270, y, 330, y - 36],
      [270, y, 330, y + 36],
    ]) {
      gm.strokeStyle = 'rgba(255,255,255,.25)';
      gm.beginPath();
      gm.moveTo(x1, y1);
      gm.lineTo(x2, y2);
      gm.stroke();
      const ph = (tt * 0.8) % 1;
      gm.fillStyle = '#34d399';
      gm.beginPath();
      gm.arc(lerp(x1, x2, ph), lerp(y1, y2, ph), 3.4, 0, TAU);
      gm.fill();
    }
    const bx = 470,
      levels = 5,
      lh = (mH - 30) / levels,
      per = CAP / levels;
    mt('Car park', bx, 10, '#8fa0bd', 11);
    for (let l = 0; l < levels; l++) {
      const yy = mH - 14 - (l + 1) * lh,
        fill = clamp((occ - l * per) / per, 0, 1);
      rr(bx, yy + 2, Math.min(220, mW - bx - 20), lh - 5, 5, 'rgba(255,255,255,.05)');
      rr(
        bx,
        yy + 2,
        Math.min(220, mW - bx - 20) * fill,
        lh - 5,
        5,
        fill > 0.9 ? 'rgba(255,181,71,.7)' : 'rgba(52,211,153,.6)',
      );
      mt('L' + (l + 1), bx + 6, yy + lh / 2, '#eaf1ff', 10.5);
    }
  }
}

/* ---------- ui ---------- */
const rail = $('rail'),
  chips = [];
const pin = (i) => {
  ST.pin = ST.pin === i ? -1 : i;
  ST.f = i;
  ST.ft = 0;
  shown = -1;
};
NAMES.forEach((n, i) => {
  const b = document.createElement('button');
  b.className = 'chip';
  b.innerHTML = n + '<span class="bar"></span>';
  b.onclick = () => pin(i);
  rail.appendChild(b);
  chips.push(b);
});
addEventListener('keydown', (e) => {
  if (e.key >= '1' && e.key <= '6') pin(+e.key - 1);
  else if (e.key === 'Escape') {
    ST.pin = -1;
    shown = -1;
  } else if (e.key === ' ') {
    ST.paused = !ST.paused;
    e.preventDefault();
  }
});
const tile = (id, text, hot, st) => {
  const el = $(id);
  el.querySelector('.s').textContent = text;
  el.classList.toggle('hot', !!hot);
  el.querySelector('i').className = st || '';
};
let lastUi = 0,
  shown = -1;
function ui(now) {
  const f = focus();
  chips.forEach((c, k) => {
    c.classList.toggle('on', k === f);
    c.classList.toggle('lock', k === ST.pin);
    c.querySelector('.bar').style.transform =
      `scaleX(${k === f && ST.pin < 0 ? ST.ft / DWELL[k] : 0})`;
  });
  if (now - lastUi < 100) return;
  lastUi = now;
  if (shown !== f) {
    shown = f;
    $('dName').textContent = TITLE[f];
    $('dDesc').textContent = DESC[f];
    $('vLab').textContent = VLAB[f];
  }
  const act = tracks.filter((t) => t.hits >= 3).length,
    inV = tracks.filter((t) => t.dir > 0 && t.hits >= 3).length,
    outV = tracks.filter((t) => t.dir < 0 && t.hits >= 3).length;
  const M = [
    [
      ['Cameras', 1],
      ['Frame rate', '17 FPS'],
      ['Hardware', 'Pi 3'],
    ],
    [
      ['Cars in view', dets.length],
      [
        'Confidence',
        dets.length
          ? Math.round((dets.reduce((a, d) => a + d.conf, 0) / dets.length) * 100) + '%'
          : '—',
      ],
      ['Per frame', '≈ 59 ms'],
    ],
    [
      ['Tracks', act],
      ['Longest', tracks.length ? Math.max(...tracks.map((t) => t.hits)) + ' frames' : '—'],
      ['Lost frames', tracks.filter((t) => t.coast).length],
    ],
    [
      ['Entering', inV],
      ['Leaving', outV],
      ['Rule', 'away = in'],
    ],
    [
      ['Entered', inN],
      ['Left', outN],
      ['Net', (inN - outN >= 0 ? '+' : '') + (inN - outN)],
    ],
    [
      ['Free spaces', CAP - occ],
      ['Capacity', CAP],
      ['Last update', syncT.toFixed(1) + ' s'],
    ],
  ][f];
  $('dMetrics').innerHTML = M.map(([l, v]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
  const fr = CAP - occ;
  $('dFree').textContent = fr;
  $('dFree').style.color = fr < 20 ? '#ffcf85' : '#34d399';
  $('dOcc').textContent = occ;
  $('dIn').textContent = inN;
  $('dOut').textContent = outN;
  tile('t-cam', '1 · gate lane', f === 0);
  tile('t-cpu', 'Raspberry Pi 3', f === 0 || f === 1);
  tile('t-fps', '17 FPS · CPU only', f === 1);
  tile('t-trk', act + (act === 1 ? ' car tracked' : ' cars tracked'), f === 2);
  tile(
    't-dir',
    lastDir
      ? (lastDir > 0 ? 'Entering' : 'Leaving') +
          ' · ' +
          Math.max(0, T - lastDirT).toFixed(0) +
          ' s ago'
      : '—',
    f === 3 || f === 4,
    lastDir > 0 ? '' : 'a',
  );
  tile('t-dat', syncT < 2 ? 'Syncing…' : 'Live · ' + syncT.toFixed(0) + ' s ago', f === 5);
  const el = $('stat');
  el.className = f === 5 ? 'ok' : '';
  el.textContent = f === 4 ? `In ${inN} · Out ${outN}` : f === 5 ? `${fr} free spaces` : TITLE[f];
}

/* ---------- loop ---------- */
resize();
for (let i = 0; i < 20 * 60; i++) {
  stepWorld(1 / 60);
  detT += 1 / 60;
  if (detT >= DET_DT) {
    detT -= DET_DT;
    detect();
  }
}
inN = 0;
outN = 0;
trueIn = 0;
trueOut = 0;
series = [];
occ = 118;

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!ST.paused) {
    let r = dt;
    while (r > 1e-6) {
      const d = Math.min(r, 1 / 60);
      stepWorld(d);
      detT += d;
      if (detT >= DET_DT) {
        detT -= DET_DT;
        detect();
      }
      r -= d;
    }
    if (ST.pin < 0) {
      ST.ft += dt;
      if (ST.ft > DWELL[ST.f]) {
        ST.ft = 0;
        ST.f = (ST.f + 1) % 6;
      }
    }
  }
  updateLayers(dt);
  drawScene();
  drawMini(focus(), now);
  ui(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* Test hooks, only with ?debug in the address. */
if (new URLSearchParams(location.search).has('debug')) {
  window.__dbg = () => ({ inN, outN, trueIn, trueOut, tracks: tracks.length, cars: cars.length });
  window.__sim = (sec) => {
    for (let t = 0; t < sec * 60; t++) {
      stepWorld(1 / 60);
      detT += 1 / 60;
      if (detT >= DET_DT) {
        detT -= DET_DT;
        detect();
      }
    }
  };
}
