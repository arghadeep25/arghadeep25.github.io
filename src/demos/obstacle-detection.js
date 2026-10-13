import { $, clamp, FONT, hash, lerp, TAU } from './common.js';

/* ---------- canvases ---------- */
const cv = $('scene'),
  g = cv.getContext('2d'),
  mv = $('mini'),
  gm = mv.getContext('2d');
let W, H, DPR, SC, mW, mH;
const dockH = () => (W < 800 ? 200 : 206) + (W < 800 ? 12 : 18);
const camX = () => (W < 800 ? W * 0.42 : W * 0.3);
const camY = () => (W < 800 ? H * 0.4 : (H - dockH() - 20) / 2 + 6);
function resize() {
  DPR = Math.min(devicePixelRatio || 1, 2);
  W = innerWidth;
  H = innerHeight;
  cv.width = W * DPR;
  cv.height = H * DPR;
  SC = W < 800 ? clamp(W / 40, 6.5, 11) : clamp(Math.min(W / 92, H / 48), 8, 14);
  const r = mv.getBoundingClientRect();
  mW = r.width;
  mH = r.height;
  mv.width = Math.max(1, mW * DPR);
  mv.height = Math.max(1, mH * DPR);
}
addEventListener('resize', resize);

/* ---------- world ---------- */
const road = (x) => 20 * Math.sin(x / 45) + 7 * Math.sin(x / 19 + 1);
const rdx = (x) => (20 / 45) * Math.cos(x / 45) + (7 / 19) * Math.cos(x / 19 + 1);
const tang = (x) => Math.atan2(rdx(x), 1);
function pt(x, lat) {
  const s = rdx(x),
    L = Math.hypot(s, 1);
  return [x - (lat * s) / L, road(x) + lat / L];
}
function rot(a, x, y) {
  const c = Math.cos(a),
    s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
}
function mkRect(cx, cy, ang, len, dep, kind, extra) {
  const pts = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([a, b]) => {
    const [rx, ry] = rot(ang, (a * len) / 2, (b * dep) / 2);
    return [cx + rx, cy + ry];
  });
  return Object.assign({ pts, kind, c: [cx, cy], ang }, extra);
}
function mkCirc(cx, cy, r, kind, n) {
  const pts = [];
  for (let i = 0; i < (n || 8); i++) {
    const a = (i / (n || 8)) * TAU + 0.2;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return { pts, kind, c: [cx, cy], r };
}
const CH = 24,
  chunks = new Map();
function genChunk(c) {
  const o = { shapes: [], segs: [] },
    x0 = c * CH;
  for (const side of [-1, 1]) {
    const k = c * 2 + (side > 0 ? 1 : 0);
    if (hash(k + 1) < 0.82) {
      const dep = 9 + hash(k + 2) * 8,
        len = 12 + hash(k + 3) * 8,
        xb = x0 + CH / 2 + (hash(k + 4) - 0.5) * 5;
      const [bx, by] = pt(xb, side * (13 + dep / 2 + hash(k + 5) * 3));
      o.shapes.push(mkRect(bx, by, tang(xb), len, dep, 0, { h: hash(k + 6) }));
    }
    for (let i = 0; i < 3; i++) {
      const kk = k * 5 + i;
      if (hash(kk + 9) < 0.7) {
        const [tx, ty] = pt(x0 + 3 + i * 8 + hash(kk + 11) * 3, side * (9.4 + hash(kk + 12) * 1.4));
        o.shapes.push(mkCirc(tx, ty, 1.1 + hash(kk + 13) * 0.7, 1));
      }
    }
    if (hash(k + 21) < 0.6) {
      const [px, py] = pt(x0 + 20, side * 7.6);
      o.shapes.push(mkRect(px, py, 0, 0.45, 0.45, 2));
    }
    if (hash(k + 31) < 0.45) {
      const xc = x0 + 6 + hash(k + 32) * 10,
        [cx, cy] = pt(xc, side * 6.2);
      o.shapes.push(mkRect(cx, cy, tang(xc), 4.3, 1.8, 3, { h: hash(k + 33) }));
    }
  }
  for (const s of o.shapes) {
    const p = s.pts;
    for (let i = 0; i < p.length; i++) {
      const a = p[i],
        b = p[(i + 1) % p.length];
      o.segs.push([a[0], a[1], b[0], b[1]]);
    }
  }
  return o;
}
const chunk = (c) => {
  let v = chunks.get(c);
  if (!v) {
    v = genChunk(c);
    chunks.set(c, v);
  }
  return v;
};

/* ---------- vehicle ---------- */
const WB = 2.3,
  VW = 2.0,
  FRONT = 2.2,
  LANE = 1.9;
const car = { x: 40, y: 0, th: 0, v: 0, delta: 0 };
{
  const [, y] = pt(car.x, LANE);
  car.y = y;
  car.th = tang(car.x);
}
let T = 0;

/* ---------- actors: pedestrian, parked van, oncoming traffic ---------- */
const actors = new Map();
function block(b) {
  let a = actors.get(b);
  if (!a) {
    a = {
      ped: {
        x: b * 220 + 85 + hash(b) * 20,
        t: -1,
        dir: hash(b + 3) < 0.5 ? 1 : -1,
        lat: 0,
        done: false,
      },
      van: { x: b * 220 + 165 + hash(b + 5) * 15, wait: 0, state: 0, off: 0, vv: 0, gone: false },
    };
    actors.set(b, a);
  }
  return a;
}
const onc = [{ rel: 90 }, { rel: 215 }];
function updateActors(dt) {
  const b0 = Math.floor(car.x / 220);
  for (let b = b0 - 1; b <= b0 + 1; b++) {
    const a = block(b),
      p = a.ped,
      v = a.van;
    if (!p.done) {
      if (p.t < 0 && car.x > p.x - 30 && car.x < p.x + 5) {
        p.t = 0;
      }
      if (p.t >= 0) {
        p.t += dt;
        p.lat = -3.4 * p.dir + p.dir * 1.3 * p.t;
        if (Math.abs(p.lat) > 8.2) p.done = true;
      }
    }
    if (!v.gone) {
      const vx = v.x + v.off;
      if (v.state === 0 && vx - car.x < 12 && vx - car.x > 0 && car.v < 0.3) {
        v.wait += dt;
        if (v.wait > 2.5) v.state = 1;
      }
      if (v.state === 1) {
        v.vv = Math.min(11, v.vv + 2 * dt);
        v.off += v.vv * dt;
        if (vx - car.x > 80) v.gone = true;
      }
    }
  }
  for (const k of [...actors.keys()]) if (k < b0 - 2) actors.delete(k);
  for (const o of onc) {
    o.rel -= (car.v + 8) * dt;
    if (o.rel < -70) o.rel += 260;
  }
}
function actorShapes() {
  const out = [],
    b0 = Math.floor(car.x / 220);
  for (let b = b0 - 1; b <= b0 + 1; b++) {
    const a = block(b),
      p = a.ped,
      v = a.van;
    if (p.t >= 0 && !p.done && Math.abs(p.x - car.x) < 70) {
      const [x, y] = pt(p.x, p.lat);
      out.push(Object.assign(mkCirc(x, y, 0.32, 5, 8), { type: 'ped' }));
    }
    if (!v.gone) {
      const vx = v.x + v.off;
      if (Math.abs(vx - car.x) < 70) {
        const [x, y] = pt(vx, LANE);
        out.push(Object.assign(mkRect(x, y, tang(vx), 5.2, 2.1, 6), { type: 'van' }));
      }
    }
  }
  for (const o of onc)
    if (Math.abs(o.rel) < 70) {
      const x = car.x + o.rel,
        [px, py] = pt(x, -2.2);
      out.push(
        Object.assign(mkRect(px, py, tang(x) + Math.PI, 4.4, 1.9, 7), { type: 'onc', rel: o.rel }),
      );
    }
  return out;
}

/* ---------- LiDAR ---------- */
const RANGE = 30,
  NRAY = 720;
const COS = new Float32Array(NRAY),
  SIN = new Float32Array(NRAY);
for (let i = 0; i < NRAY; i++) {
  COS[i] = Math.cos((i / NRAY) * TAU);
  SIN[i] = Math.sin((i / NRAY) * TAU);
}
function castScan(dyn) {
  const segs = [];
  for (
    let c = Math.floor((car.x - RANGE - 25) / CH);
    c <= Math.floor((car.x + RANGE + 25) / CH);
    c++
  )
    for (const s of chunk(c).segs) {
      const mx = (s[0] + s[2]) / 2 - car.x,
        my = (s[1] + s[3]) / 2 - car.y;
      if (mx * mx + my * my < 55 * 55) segs.push(s);
    }
  for (const d of dyn) {
    const p = d.pts;
    for (let i = 0; i < p.length; i++) {
      const a = p[i],
        b = p[(i + 1) % p.length];
      segs.push([a[0], a[1], b[0], b[1]]);
    }
  }
  const ct = Math.cos(car.th),
    st = Math.sin(car.th),
    hits = [],
    rr = new Float32Array(NRAY);
  for (let i = 0; i < NRAY; i++) {
    const lx0 = COS[i],
      ly0 = SIN[i],
      dx = lx0 * ct - ly0 * st,
      dy = lx0 * st + ly0 * ct;
    let best = RANGE;
    for (const s of segs) {
      const ex = s[2] - s[0],
        ey = s[3] - s[1],
        den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const qx = s[0] - car.x,
        qy = s[1] - car.y,
        t = (qx * ey - qy * ex) / den,
        u = (qx * dy - qy * dx) / den;
      if (t > 0.6 && t < best && u >= 0 && u <= 1) best = t;
    }
    rr[i] = best;
    if (best < RANGE) {
      const r = best + (Math.random() - 0.5) * 0.04;
      hits.push({ i, r, lx: r * lx0, ly: r * ly0, x: car.x + r * dx, y: car.y + r * dy });
    }
  }
  return { hits, rr };
}

/* ---------- Ackermann ROI ---------- */
const RP = {
  tr: 0.5,
  ab: 3,
  gain: 1,
  min: 8,
  max: 30,
  m0: 0.3,
  kv: 0.1,
  ku: 0.02,
  ds: 0.5,
  pad: 4,
};
const ROI = { k: 0, la: 10, hw0: 0 };
const LK = { locked: false, la: 0, hold: 0 };
const hwAt = (s) => VW / 2 + RP.m0 + RP.kv * Math.abs(car.v) + RP.ku * s;
function roiUpdate(dt, sObs) {
  const v = Math.abs(car.v);
  const base = clamp(v * RP.tr + (v * v) / (2 * RP.ab) + v * RP.gain, RP.min, RP.max);
  let target = base;
  if (sObs != null) {
    target = Math.max(base, sObs + RP.pad);
    LK.locked = true;
    LK.la = target;
    LK.hold = 1.2;
  } else if (LK.locked) {
    LK.hold -= dt;
    if (LK.hold <= 0) LK.locked = false;
    else target = Math.max(base, LK.la);
  }
  const k = target > ROI.la ? 1 - Math.exp(-dt * 9) : 1 - Math.exp(-dt * 1.4);
  ROI.la = clamp(ROI.la + (target - ROI.la) * k, RP.min, RP.max);
  ROI.k = Math.tan(car.delta) / WB;
  ROI.base = base;
}
// arc length s of a vehicle-frame point along the corridor centreline, or -1 if outside the corridor
function roiS(lx, ly) {
  const k = ROI.k;
  let s, d;
  if (Math.abs(k) < 1e-4) {
    s = lx;
    d = Math.abs(ly);
  } else {
    const vy = ly - 1 / k;
    s = Math.atan2(k * lx, -k * vy) / k;
    d = Math.abs(Math.hypot(lx, vy) - 1 / Math.abs(k));
  }
  if (s < 0 || s > ROI.la) return -1;
  return d <= hwAt(s) ? s : -1;
}
function roiPoly() {
  const k = ROI.k,
    L = [],
    R = [],
    C = [];
  for (let s = 0; s <= ROI.la + 1e-6; s += RP.ds) {
    const ph = k * s,
      st = Math.sin(ph),
      ct = Math.cos(ph),
      cx = Math.abs(k) < 1e-4 ? s : st / k,
      cy = Math.abs(k) < 1e-4 ? 0 : (1 - ct) / k,
      w = hwAt(s);
    C.push([cx, cy]);
    L.push([cx - st * -w, cy + ct * -w]);
    R.push([cx - st * w, cy + ct * w]);
  }
  return { C, L, R };
}
const toW = (lx, ly) => [
  car.x + lx * Math.cos(car.th) - ly * Math.sin(car.th),
  car.y + lx * Math.sin(car.th) + ly * Math.cos(car.th),
];

/* ---------- clustering ---------- */
const PAL = ['#ff6b8b', '#ffb547', '#a78bfa', '#34d399', '#7dd3fc'];
let prevCl = [],
  nextId = 0;
function cluster(pts) {
  const n = pts.length,
    par = Array.from({ length: n }, (_, i) => i);
  const f = (i) => {
    while (par[i] !== i) {
      par[i] = par[par[i]];
      i = par[i];
    }
    return i;
  };
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const dx = pts[i].lx - pts[j].lx,
        dy = pts[i].ly - pts[j].ly;
      if (dx * dx + dy * dy < 0.25) par[f(i)] = f(j);
    }
  const m = new Map();
  pts.forEach((p, i) => {
    const r = f(i);
    if (!m.has(r)) m.set(r, []);
    m.get(r).push(p);
  });
  const out = [];
  for (const arr of m.values()) {
    if (arr.length < 5) continue;
    let x0 = 1e9,
      x1 = -1e9,
      y0 = 1e9,
      y1 = -1e9,
      sx = 0,
      sy = 0,
      near = arr[0],
      wx = 0,
      wy = 0,
      laneMin = 1e9;
    for (const p of arr) {
      x0 = Math.min(x0, p.lx);
      x1 = Math.max(x1, p.lx);
      y0 = Math.min(y0, p.ly);
      y1 = Math.max(y1, p.ly);
      sx += p.lx;
      sy += p.ly;
      wx += p.x;
      wy += p.y;
      if (p.s < near.s) near = p;
      const lat = (p.y - road(p.x)) / Math.hypot(1, rdx(p.x));
      laneMin = Math.min(laneMin, Math.abs(lat - LANE));
    }
    out.push({
      pts: arr,
      x0,
      x1,
      y0,
      y1,
      cx: sx / arr.length,
      cy: sy / arr.length,
      wx: wx / arr.length,
      wy: wy / arr.length,
      s: near.s,
      near,
      d: Math.max(0, near.s - FRONT),
      onPath: laneMin < 1.6,
      size: [x1 - x0, y1 - y0],
    });
  }
  out.sort((a, b) => a.d - b.d);
  const used = new Set();
  for (const c of out) {
    let best = null,
      bd = 2.5;
    for (const p of prevCl) {
      if (used.has(p.id)) continue;
      const d = Math.hypot(p.wx - c.wx, p.wy - c.wy);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    c.id = best ? best.id : nextId++;
    used.add(c.id);
    c.col = PAL[c.id % PAL.length];
  }
  prevCl = out;
  return out;
}

/* ---------- per-frame perception + control ---------- */
const P = {
  hits: [],
  rr: null,
  cl: [],
  gX: new Float32Array(NRAY * 12),
  gY: new Float32Array(NRAY * 12),
  gIn: new Uint8Array(NRAY * 12),
  gN: 0,
  gRemoved: 0,
  inPts: 0,
  sObs: null,
  dPath: null,
  vt: 0,
  state: 'Cruising',
};
function perceive(dt, dyn) {
  const sc = castScan(dyn);
  P.hits = sc.hits;
  P.rr = sc.rr;
  roiUpdate(dt, P.sObs);
  let inCount = 0;
  const inPts = [];
  for (const h of P.hits) {
    h.s = roiS(h.lx, h.ly);
    h.in = h.s >= 0;
    if (h.in) {
      inCount++;
      inPts.push(h);
    }
  }
  P.inPts = inCount;
  // ground returns (rings), occluded behind anything that stands up
  let n = 0,
    removed = 0;
  for (let r = 4; r <= 28; r += 2.4)
    for (let i = 0; i < NRAY; i += 2) {
      if (P.rr[i] <= r) continue;
      const lx = r * COS[i],
        ly = r * SIN[i],
        w = toW(lx, ly),
        inside = roiS(lx, ly) >= 0;
      P.gX[n] = w[0];
      P.gY[n] = w[1];
      P.gIn[n] = inside ? 1 : 0;
      if (inside) removed++;
      n++;
    }
  P.gN = n;
  P.gRemoved = removed;
  P.cl = cluster(inPts);
  P.sObs = P.cl.length ? P.cl[0].s : null;
  const onPath = P.cl.filter((c) => c.onPath);
  P.dPath = onPath.length ? onPath[0].d : null;
}
function control(dt) {
  const vc = 5 + 4 * (0.5 + 0.5 * Math.sin(car.x / 140)),
    vcurve = Math.sqrt(2.2 / Math.max(Math.abs(Math.tan(car.delta) / WB), 1e-3));
  let vt = Math.min(vc, vcurve);
  if (P.dPath != null) vt = Math.min(vt, Math.sqrt(Math.max(0, 5 * (P.dPath - 3.5))));
  P.vt = vt;
  car.v += clamp(vt - car.v, -4 * dt, 1.6 * dt);
  car.v = Math.max(0, car.v);
  P.state =
    P.dPath != null && car.v < 0.25
      ? 'Stopped'
      : P.dPath != null && car.v > vt + 0.3
        ? 'Braking'
        : 'Cruising';
  // pure-pursuit steering along the lane, rate limited
  const Ld = 3 + 0.6 * car.v,
    tx = car.x + Ld * Math.cos(car.th),
    [px, py] = pt(tx, LANE);
  let al = Math.atan2(py - car.y, px - car.x) - car.th;
  al = Math.atan2(Math.sin(al), Math.cos(al));
  const tgt = clamp(Math.atan2(2 * WB * Math.sin(al), Ld), -0.5, 0.5);
  car.delta += clamp(tgt - car.delta, -0.8 * dt, 0.8 * dt);
  car.th += (car.v / WB) * Math.tan(car.delta) * dt;
  car.x += car.v * Math.cos(car.th) * dt;
  car.y += car.v * Math.sin(car.th) * dt;
}

/* ---------- pipeline spotlight ---------- */
const NAMES = ['Scan', 'ROI', 'Ground', 'Cluster', 'Output'];
const TITLE = ['LiDAR scan', 'Ackermann ROI', 'Ground removal', 'Clustering', 'Obstacle list'];
const DESC = [
  'A 360° scan returns thousands of points: the ground around the vehicle, and everything standing on it.',
  'A corridor is cut along the path the wheels will take. It bends with the steering angle and stretches with speed, so only what the vehicle can actually hit is kept.',
  'Ground returns inside the corridor are removed, leaving only things that stand up from the road.',
  'Nearby points are grouped into objects, and tiny clusters are dropped as noise.',
  'Objects are ranked nearest-first by distance along the path. The nearest one on the path decides how much the vehicle slows.',
];
const DWELL = [4, 4.5, 4, 4, 9];
const S = { f: 0, ft: 0, pin: -1, paused: false };
const Lay = { roi: 0, ground: 0, cluster: 0, out: 0 };
function updateFocus(dt) {
  if (S.pin < 0) {
    S.ft += dt;
    if (S.ft > DWELL[S.f]) {
      S.ft = 0;
      S.f = (S.f + 1) % 5;
    }
  }
  const f = S.pin >= 0 ? S.pin : S.f,
    k = 1 - Math.exp(-dt * 5);
  Lay.roi += ((f >= 1 ? 1 : 0) - Lay.roi) * k;
  Lay.ground += ((f >= 2 ? 1 : 0) - Lay.ground) * k;
  Lay.cluster += ((f >= 3 ? 1 : 0) - Lay.cluster) * k;
  Lay.out += ((f >= 4 ? 1 : 0) - Lay.out) * k;
}
const focus = () => (S.pin >= 0 ? S.pin : S.f);

/* ---------- drawing ---------- */
function drawCarBody(x, y, th, delta, braking) {
  const u = 1 / SC;
  g.save();
  g.translate(x, y);
  g.rotate(th);
  g.fillStyle = '#e8eefc';
  g.beginPath();
  g.roundRect(-2.2, -1, 4.4, 2, 0.5);
  g.fill();
  g.fillStyle = 'rgba(8,14,28,.55)';
  g.fillRect(0.2, -0.8, 0.9, 1.6);
  g.fillRect(-1.5, -0.8, 0.5, 1.6);
  g.fillStyle = braking ? '#ff3b55' : 'rgba(255,90,110,.45)';
  g.fillRect(-2.22, -0.9, 0.22, 0.55);
  g.fillRect(-2.22, 0.35, 0.22, 0.55);
  g.fillStyle = '#10182a';
  for (const [wx, wy, a] of [
    [-1.15, -1.02, 0],
    [-1.15, 1.02, 0],
    [1.15, -1.02, delta],
    [1.15, 1.02, delta],
  ]) {
    g.save();
    g.translate(wx, wy);
    g.rotate(a);
    g.fillRect(-0.42, -0.14, 0.84, 0.28);
    g.restore();
  }
  g.restore();
}
function drawEnv(bx0, bx1) {
  const u = 1 / SC,
    pts = [];
  for (let x = bx0 - 10; x < bx1 + 10; x += 3) pts.push([x, road(x)]);
  const path = () => {
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
  };
  g.lineJoin = 'round';
  path();
  g.lineWidth = 9.2;
  g.strokeStyle = 'rgba(160,185,230,.10)';
  g.stroke();
  path();
  g.lineWidth = 8.4;
  g.strokeStyle = '#0f1726';
  g.stroke();
  path();
  g.lineWidth = u * 1.4;
  g.setLineDash([3, 4]);
  g.strokeStyle = 'rgba(255,255,255,.2)';
  g.stroke();
  g.setLineDash([]);
  for (let c = Math.floor((bx0 - 30) / CH); c <= Math.floor((bx1 + 30) / CH); c++)
    for (const s of chunk(c).shapes) {
      const p = s.pts;
      g.beginPath();
      p.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])));
      g.closePath();
      if (s.kind === 0) {
        g.fillStyle = `rgba(${60 + s.h * 20},${84 + s.h * 18},${124 + s.h * 22},.30)`;
        g.fill();
        g.strokeStyle = 'rgba(150,180,235,.28)';
        g.lineWidth = u * 1.4;
        g.stroke();
      } else if (s.kind === 1) {
        g.beginPath();
        g.arc(s.c[0], s.c[1], s.r, 0, TAU);
        g.fillStyle = 'rgba(52,170,125,.30)';
        g.fill();
        g.beginPath();
        g.arc(s.c[0], s.c[1], s.r * 0.55, 0, TAU);
        g.fillStyle = 'rgba(70,200,150,.22)';
        g.fill();
      } else if (s.kind === 2) {
        g.fillStyle = 'rgba(200,215,240,.55)';
        g.fill();
      } else {
        g.fillStyle = `hsla(${200 + s.h * 60},35%,55%,.5)`;
        g.fill();
      }
    }
}
function drawActors(dyn) {
  for (const d of dyn) {
    if (d.type === 'ped') {
      g.beginPath();
      g.arc(d.c[0], d.c[1], 0.42, 0, TAU);
      g.fillStyle = '#ffd9a0';
      g.fill();
      g.beginPath();
      g.arc(d.c[0], d.c[1], 0.2, 0, TAU);
      g.fillStyle = '#7a5a2a';
      g.fill();
    } else {
      const a = d.type === 'onc' ? clamp((62 - Math.abs(d.rel)) / 12, 0, 1) : 1;
      g.save();
      g.translate(d.c[0], d.c[1]);
      g.rotate(d.ang);
      g.globalAlpha = 0.75 * a;
      const L = d.type === 'van' ? 5.2 : 4.4,
        Wd = d.type === 'van' ? 2.1 : 1.9;
      g.fillStyle = d.type === 'van' ? '#c9a46a' : '#9db0cf';
      g.beginPath();
      g.roundRect(-L / 2, -Wd / 2, L, Wd, 0.45);
      g.fill();
      g.fillStyle = 'rgba(5,10,20,.4)';
      g.fillRect(L * 0.12, -Wd * 0.36, L * 0.2, Wd * 0.72);
      g.restore();
    }
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
const toS = (x, y) => [camX() + (x - car.x) * SC, camY() + (y - car.y) * SC];
function drawScene(dyn) {
  const u = 1 / SC,
    f = focus();
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  const [sx, sy] = toS(car.x, car.y),
    bg = g.createRadialGradient(sx, sy, 0, sx, sy, Math.max(W, H) * 0.85);
  bg.addColorStop(0, '#101c34');
  bg.addColorStop(1, '#04070d');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.save();
  g.translate(camX(), camY());
  g.scale(SC, SC);
  g.translate(-car.x, -car.y);
  const bx0 = car.x - camX() / SC - 4,
    bx1 = bx0 + W / SC + 8;
  drawEnv(bx0, bx1);
  drawActors(dyn);

  // ROI corridor
  const roiA = 0.35 + 0.65 * Lay.roi,
    poly = roiPoly();
  const path = () => {
    g.beginPath();
    poly.L.forEach((p, i) => {
      const w = toW(p[0], p[1]);
      i ? g.lineTo(w[0], w[1]) : g.moveTo(w[0], w[1]);
    });
    for (let i = poly.R.length - 1; i >= 0; i--) {
      const w = toW(poly.R[i][0], poly.R[i][1]);
      g.lineTo(w[0], w[1]);
    }
    g.closePath();
  };
  path();
  g.fillStyle = `rgba(62,155,255,${0.05 + 0.13 * Lay.roi})`;
  g.fill();
  g.globalAlpha = roiA;
  g.strokeStyle = 'rgba(120,185,255,.9)';
  g.lineWidth = u * (1.4 + Lay.roi * 0.8);
  g.stroke();
  g.setLineDash([u * 7, u * 6]);
  g.lineWidth = u * 1.2;
  g.strokeStyle = 'rgba(160,205,255,.7)';
  g.beginPath();
  poly.C.forEach((p, i) => {
    const w = toW(p[0], p[1]);
    i ? g.lineTo(w[0], w[1]) : g.moveTo(w[0], w[1]);
  });
  g.stroke();
  g.setLineDash([]);
  g.globalAlpha = 1;

  // ground returns
  const gA = Lay.ground,
    rA = Lay.roi,
    gs = u * 2.2;
  for (let i = 0; i < P.gN; i++) {
    if (P.gIn[i]) {
      const a = (1 - gA) * (0.28 + 0.4 * rA);
      if (a < 0.02) continue;
      g.fillStyle = rA > 0.3 ? `rgba(255,181,71,${a})` : `rgba(141,160,189,${a})`;
    } else g.fillStyle = `rgba(141,160,189,${lerp(0.26, 0.11, rA)})`;
    g.fillRect(P.gX[i] - gs / 2, P.gY[i] - gs / 2, gs, gs);
  }
  // obstacle returns
  const cl = new Map();
  for (const c of P.cl) for (const p of c.pts) cl.set(p, c);
  const os = u * 4.6;
  for (const h of P.hits) {
    let col,
      a = 1;
    const c = cl.get(h);
    if (h.in) {
      if (c && Lay.cluster > 0.02) {
        col = c.col;
        a = lerp(1, 1, Lay.cluster);
      } else col = '#5ee0ff';
    } else {
      col = rA > 0.3 ? '#7f90ad' : '#5ee0ff';
      a = lerp(0.95, 0.6, rA);
    }
    g.globalAlpha = a;
    g.fillStyle = col;
    g.fillRect(h.x - os / 2, h.y - os / 2, os, os);
  }
  g.globalAlpha = 1;

  // cluster boxes
  if (Lay.cluster > 0.02)
    for (const c of P.cl) {
      g.save();
      g.translate(car.x, car.y);
      g.rotate(car.th);
      g.globalAlpha = Lay.cluster;
      g.fillStyle = c.col + '22';
      g.strokeStyle = c.col;
      g.lineWidth = u * 1.8;
      g.beginPath();
      g.roundRect(c.x0 - 0.3, c.y0 - 0.3, c.x1 - c.x0 + 0.6, c.y1 - c.y0 + 0.6, 0.35);
      g.fill();
      g.stroke();
      g.restore();
    }
  // nearest line
  if (Lay.out > 0.02 && P.cl.length) {
    const n = P.cl.find((c) => c.onPath) || P.cl[0],
      a = toW(FRONT, 0);
    g.globalAlpha = Lay.out * 0.8;
    g.strokeStyle = n.col;
    g.lineWidth = u * 1.4;
    g.setLineDash([u * 5, u * 4]);
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(n.near.x, n.near.y);
    g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 1;
  }
  drawCarBody(car.x, car.y, car.th, car.delta, P.state !== 'Cruising');
  g.restore();

  // labels
  if (Lay.out > 0.05)
    P.cl.slice(0, 4).forEach((c, k) => {
      const [x, y] = toS(c.wx, c.wy);
      pill(
        x + 14,
        y - 34,
        `${c.d.toFixed(1)} m · ${c.onPath ? 'in path' : 'beside path'}`,
        c.col,
        Lay.out,
      );
    });
  else if (Lay.cluster > 0.05)
    P.cl.slice(0, 4).forEach((c) => {
      const [x, y] = toS(c.wx, c.wy);
      pill(x + 14, y - 34, 'Object ' + ((c.id % 99) + 1), c.col, Lay.cluster);
    });
  if (f === 1 || (f > 1 && Lay.roi > 0.5 && P.cl.length === 0)) {
    const e = poly.C[poly.C.length - 1],
      [ex, ey] = toS(...toW(e[0], e[1]));
    pill(
      ex + 16,
      ey - 14,
      `Reach ${ROI.la.toFixed(0)} m · steering ${((car.delta * 180) / Math.PI).toFixed(1)}°`,
      '#3e9bff',
      Math.max(Lay.roi, 0.0) * (f === 1 ? 1 : 0.0) + (f === 1 ? 0 : 0),
    );
  }
  if (LK.locked && Lay.roi > 0.5) {
    const [px, py] = toS(car.x, car.y);
    pill(px - 20, py + 50, 'ROI extended to obstacle', '#ffb547', Lay.roi);
  }
}

/* ---------- mini vehicle-frame view ---------- */
function drawMini() {
  if (!mW || !mH) return;
  gm.setTransform(DPR, 0, 0, DPR, 0, 0);
  gm.clearRect(0, 0, mW, mH);
  const k = (mH - 14) / 38,
    cx = mW / 2,
    X = (ly) => cx + ly * k,
    Y = (lx) => mH - 8 - (lx + 3) * k;
  gm.strokeStyle = 'rgba(255,255,255,.06)';
  gm.lineWidth = 1;
  gm.fillStyle = 'rgba(143,160,189,.6)';
  gm.font = '10.5px ' + FONT;
  gm.textBaseline = 'middle';
  for (const r of [10, 20, 30]) {
    gm.beginPath();
    gm.arc(cx, Y(0), r * k, -Math.PI * 0.98, -Math.PI * 0.02);
    gm.stroke();
    gm.fillText(r + ' m', cx + 4, Y(r) - 5);
  }
  const poly = roiPoly();
  gm.beginPath();
  poly.L.forEach((p, i) => (i ? gm.lineTo(X(p[1]), Y(p[0])) : gm.moveTo(X(p[1]), Y(p[0]))));
  for (let i = poly.R.length - 1; i >= 0; i--) gm.lineTo(X(poly.R[i][1]), Y(poly.R[i][0]));
  gm.closePath();
  gm.fillStyle = 'rgba(62,155,255,.16)';
  gm.fill();
  gm.strokeStyle = 'rgba(120,185,255,.85)';
  gm.lineWidth = 1.5;
  gm.stroke();
  gm.setLineDash([4, 4]);
  gm.strokeStyle = 'rgba(170,210,255,.55)';
  gm.beginPath();
  poly.C.forEach((p, i) => (i ? gm.lineTo(X(p[1]), Y(p[0])) : gm.moveTo(X(p[1]), Y(p[0]))));
  gm.stroke();
  gm.setLineDash([]);
  const cm = new Map();
  for (const c of P.cl) for (const p of c.pts) cm.set(p, c);
  for (const h of P.hits) {
    if (h.lx < -3 || h.lx > 35) continue;
    const c = cm.get(h);
    gm.fillStyle = c ? c.col : h.in ? '#5ee0ff' : '#5b6b86';
    gm.fillRect(X(h.ly) - 1.3, Y(h.lx) - 1.3, 2.6, 2.6);
  }
  for (const c of P.cl) {
    gm.strokeStyle = c.col;
    gm.lineWidth = 1.5;
    gm.beginPath();
    gm.roundRect(X(c.y0) - 3, Y(c.x1) - 3, (c.y1 - c.y0) * k + 6, (c.x1 - c.x0) * k + 6, 4);
    gm.stroke();
  }
  gm.fillStyle = '#e8eefc';
  gm.beginPath();
  gm.roundRect(X(-1), Y(2.2), 2 * k, 4.4 * k, 3);
  gm.fill();
}

/* ---------- ui ---------- */
const rail = $('rail'),
  chips = [];
NAMES.forEach((n, i) => {
  const b = document.createElement('button');
  b.className = 'chip';
  b.innerHTML = n + '<span class="bar"></span>';
  b.onclick = () => {
    S.pin = S.pin === i ? -1 : i;
    S.f = i;
    S.ft = 0;
    shown = -1;
  };
  rail.appendChild(b);
  chips.push(b);
});
addEventListener('keydown', (e) => {
  if (e.key >= '1' && e.key <= '5') {
    const i = +e.key - 1;
    S.pin = S.pin === i ? -1 : i;
    S.f = i;
    S.ft = 0;
    shown = -1;
  } else if (e.key === 'Escape') {
    S.pin = -1;
    shown = -1;
  } else if (e.key === ' ') {
    S.paused = !S.paused;
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
    c.classList.toggle('lock', k === S.pin);
    c.querySelector('.bar').style.transform =
      `scaleX(${k === f && S.pin < 0 ? S.ft / DWELL[k] : 0})`;
  });
  if (now - lastUi < 90) return;
  lastUi = now;
  if (shown !== f) {
    shown = f;
    $('dName').textContent = TITLE[f];
    $('dDesc').textContent = DESC[f];
  }
  const ground = P.gN,
    total = P.hits.length + ground,
    near = P.cl.find((c) => c.onPath) || P.cl[0],
    kmh = car.v * 3.6,
    st = (car.delta * 180) / Math.PI;
  const R = Math.abs(ROI.k) < 1e-3 ? '∞' : (1 / Math.abs(ROI.k)).toFixed(0) + ' m';
  const M = [
    [
      ['Points', total],
      ['Range', RANGE + ' m'],
      ['Ground', ground],
    ],
    [
      ['Reach', ROI.la.toFixed(1) + ' m'],
      ['Width at end', (2 * hwAt(ROI.la)).toFixed(1) + ' m'],
      ['Turn radius', R],
    ],
    [
      ['In corridor', ground ? P.gRemoved : 0],
      ['Removed', P.gRemoved],
      ['Kept', P.inPts],
    ],
    [
      ['Clusters', P.cl.length],
      ['Min size', '5 pts'],
      ['Tolerance', '0.5 m'],
    ],
    [
      ['Nearest', near ? near.d.toFixed(1) + ' m' : 'Clear'],
      ['Objects', P.cl.length],
      ['On path', P.cl.filter((c) => c.onPath).length],
    ],
  ][f];
  M[0] = f === 2 ? ['Ground in corridor', P.gRemoved] : M[0];
  $('dMetrics').innerHTML = M.map(([l, v]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
  const nb = $('dNear');
  if (near) {
    nb.className = 'big';
    nb.innerHTML = near.d.toFixed(1) + '<small>m</small>';
  } else {
    nb.className = 'big clear';
    nb.textContent = 'Clear';
  }
  $('dCnt').textContent = P.cl.length;
  $('dPts').textContent = P.inPts + ' / ' + P.hits.length;
  $('dSp').textContent = kmh.toFixed(0) + ' km/h';
  tile('t-str', (st >= 0 ? '+' : '') + st.toFixed(1) + '°', f === 1);
  tile('t-la', ROI.la.toFixed(1) + ' m', f === 1);
  tile('t-hw', (2 * hwAt(ROI.la)).toFixed(1) + ' m', f === 1);
  tile('t-spd', kmh.toFixed(0) + ' km/h', false);
  tile('t-brk', P.state, f === 4, P.state === 'Stopped' ? 'r' : P.state === 'Braking' ? 'a' : '');
  tile('t-lock', LK.locked ? 'On obstacle' : 'Free', LK.locked, LK.locked ? 'a' : 'w');
  const el = $('stat');
  if (P.state === 'Stopped') {
    el.className = 'bad';
    el.textContent = 'Stopped · obstacle in path';
  } else if (P.state === 'Braking') {
    el.className = 'warn';
    el.textContent = 'Braking · obstacle in path';
  } else if (LK.locked) {
    el.className = 'warn';
    el.textContent = 'Obstacle ahead · ROI extended';
  } else {
    el.className = '';
    el.textContent = 'Clear · ' + kmh.toFixed(0) + ' km/h · reach ' + ROI.la.toFixed(0) + ' m';
  }
}

/* ---------- loop ---------- */
resize();
{
  const d = actorShapes();
  perceive(0.016, d);
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!S.paused) {
    T += dt;
    updateActors(dt);
    const dyn = actorShapes();
    perceive(dt, dyn);
    control(dt);
    updateFocus(dt);
  }
  drawScene(actorShapes());
  drawMini();
  ui(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
