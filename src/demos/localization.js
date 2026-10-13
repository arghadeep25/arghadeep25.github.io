import { $, clamp, FONT, hash, lerp, TAU } from './common.js';

const sm = (t) => t * t * (3 - 2 * t);

/* ---------- canvases ---------- */
const cv = $('scene'),
  g = cv.getContext('2d');
const chCv = $('chart'),
  gc = chCv.getContext('2d');
let W, H, DPR, SC, chW, chH;
const dockH = () => (W < 800 ? 200 : 206) + (W < 800 ? 12 : 18);
const camX = () => (W < 800 ? W * 0.5 : W * 0.38);
const camY = () => (W < 800 ? H * 0.36 : (H - dockH() - 20) / 2 + 6);
function resize() {
  DPR = Math.min(devicePixelRatio || 1, 2);
  W = innerWidth;
  H = innerHeight;
  cv.width = W * DPR;
  cv.height = H * DPR;
  SC = W < 800 ? clamp(W / 46, 6.5, 11) : clamp(Math.min(W / 95, H / 52), 8, 15);
  const r = chCv.getBoundingClientRect();
  chW = r.width;
  chH = r.height;
  chCv.width = Math.max(1, chW * DPR);
  chCv.height = Math.max(1, chH * DPR);
}
addEventListener('resize', resize);

/* ---------- world: a street with a prior map ---------- */
const road = (x) => 16 * Math.sin(x / 70) + 6 * Math.sin(x / 29 + 1);
const rdx = (x) => (16 / 70) * Math.cos(x / 70) + (6 / 29) * Math.cos(x / 29 + 1);
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
  return Object.assign({ pts, kind, c: [cx, cy] }, extra);
}
function mkCirc(cx, cy, r, kind) {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return { pts, kind, c: [cx, cy], r };
}
const CH = 24,
  chunks = new Map();
function genChunk(c) {
  const o = { shapes: [], segs: [], map: [] },
    x0 = c * CH;
  for (const side of [-1, 1]) {
    const k = c * 2 + (side > 0 ? 1 : 0);
    if (hash(k + 1) < 0.82) {
      const dep = 9 + hash(k + 2) * 8,
        len = 12 + hash(k + 3) * 8,
        xb = x0 + CH / 2 + (hash(k + 4) - 0.5) * 5;
      const [bx, by] = pt(xb, side * (11.5 + dep / 2 + hash(k + 5) * 3));
      o.shapes.push(mkRect(bx, by, tang(xb), len, dep, 0, { h: hash(k + 6) }));
    }
    for (let i = 0; i < 3; i++) {
      const kk = k * 5 + i;
      if (hash(kk + 9) < 0.7) {
        const [tx, ty] = pt(x0 + 3 + i * 8 + hash(kk + 11) * 3, side * (8.6 + hash(kk + 12) * 1.2));
        o.shapes.push(mkCirc(tx, ty, 1.1 + hash(kk + 13) * 0.7, 1));
      }
    }
    if (hash(k + 21) < 0.6) {
      const [px, py] = pt(x0 + 20, side * 6.8);
      o.shapes.push(mkRect(px, py, 0, 0.45, 0.45, 2));
    }
    if (hash(k + 31) < 0.45) {
      const xc = x0 + 6 + hash(k + 32) * 10,
        [cx, cy] = pt(xc, side * 4.9);
      o.shapes.push(mkRect(cx, cy, tang(xc), 4.3, 1.8, 3, { h: hash(k + 33) }));
    }
  }
  for (const s of o.shapes) {
    const p = s.pts;
    for (let i = 0; i < p.length; i++) {
      const a = p[i],
        b = p[(i + 1) % p.length];
      o.segs.push([a[0], a[1], b[0], b[1], 0]);
      const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.7));
      for (let j = 0; j < n; j++)
        o.map.push([a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n]);
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

/* ---------- vehicle + moving traffic ---------- */
const LANE = 1.9;
const car = { x: 40, y: 0, yaw: 0, v: 5.5 };
function placeCar() {
  const [x, y] = pt(car.x, LANE);
  car.y = y;
  car.yaw = tang(car.x);
}
placeCar();
let T = 0; // world clock
const dyn = [{ k: 0 }, { k: 1 }];
function dynPose(d) {
  const rel = 70 - ((T * 12 + d.k * 75) % 150),
    x = car.x + rel,
    [px, py] = pt(x, -LANE);
  return { x: px, y: py, yaw: tang(x) + Math.PI, rel };
}

/* ---------- lidar ---------- */
const RANGE = 30,
  CROP = 24,
  VOX = 0.6,
  NRAY = 720;
function castScan(px, py, yaw) {
  const segs = [];
  for (let c = Math.floor((px - RANGE - 25) / CH); c <= Math.floor((px + RANGE + 25) / CH); c++)
    for (const s of chunk(c).segs) {
      const mx = (s[0] + s[2]) / 2 - px,
        my = (s[1] + s[3]) / 2 - py;
      if (mx * mx + my * my < 55 * 55) segs.push(s);
    }
  for (const d of dyn) {
    const q = dynPose(d);
    if (Math.abs(q.rel) > RANGE + 6) continue;
    const r = mkRect(q.x, q.y, q.yaw, 4.4, 1.9, 9).pts;
    for (let i = 0; i < 4; i++) {
      const a = r[i],
        b = r[(i + 1) % 4];
      segs.push([a[0], a[1], b[0], b[1], 1]);
    }
  }
  const hits = [];
  for (let i = 0; i < NRAY; i++) {
    const a = (i / NRAY) * TAU,
      dx = Math.cos(yaw + a),
      dy = Math.sin(yaw + a);
    let best = RANGE,
      dflag = 0;
    for (const s of segs) {
      const ex = s[2] - s[0],
        ey = s[3] - s[1],
        den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const qx = s[0] - px,
        qy = s[1] - py,
        t = (qx * ey - qy * ex) / den,
        u = (qx * dy - qy * dx) / den;
      if (t > 0.6 && t < best && u >= 0 && u <= 1) {
        best = t;
        dflag = s[4];
      }
    }
    if (best >= RANGE) continue;
    const r = best + (Math.random() - 0.5) * 0.06;
    hits.push({
      a,
      r,
      lx: r * Math.cos(a),
      ly: r * Math.sin(a),
      dyn: !!dflag,
      col: `hsl(${195 + r * 1.5},95%,${72 - r * 0.7}%)`,
    });
  }
  return hits;
}

/* ---------- scenario script + LiDAR pipeline ---------- */
const SC_NAMES = ['Positioning', 'All sensors', 'GNSS lost', 'LiDAR lost', 'Dead reckoning'];
const SC_TITLE = [
  'Initial positioning',
  'All sensors',
  'GNSS lost',
  'LiDAR lost',
  'Dead reckoning',
];
const SC_DESC = [
  'Standing still, the filter takes a coarse GNSS fix and inertial prior. LiDAR registration against the prior map then refines it to centimetres.',
  'Moving. LiDAR registration keeps the pose centimetre-accurate, inertial data bridges the gaps, and GNSS is held back while LiDAR is trusted.',
  'Tall buildings block the satellites. LiDAR and inertial data keep the estimate accurate on their own.',
  'LiDAR drops out. GNSS and inertial data keep the vehicle located, to about a metre.',
  'No GNSS and no LiDAR. Only inertial data remains: the estimate drifts and the filter reports growing uncertainty.',
];
const SC_SRC = ['GNSS + IMU + LiDAR', 'IMU + LiDAR', 'IMU + LiDAR', 'IMU + GNSS', 'IMU only'];
const SC_DUR = [6.5, 10, 9, 10, 12],
  SC_NEXT = [1, 2, 3, 4, 1];
const SC_FLAGS = [
  { lid: 1, gnss: 1 },
  { lid: 1, gnss: 1 },
  { lid: 1, gnss: 0 },
  { lid: 0, gnss: 1 },
  { lid: 0, gnss: 0 },
];
const ST = [0, 0, 0.8, 1.3, 2.4],
  EN = [0, 0.8, 1.3, 2.4, 3.0],
  JEND = 3.0,
  SIGR = 0.55,
  ITER = 8;
const S = {
  sc: 0,
  t: 0,
  paused: false,
  ph: 0,
  p: 0,
  job: null,
  gap: 0.5,
  tDR: 0,
  ang: 0,
  ys: 1,
  pend: [0, 0],
  sigGoal: null,
};
let cd = null,
  markTag = null;
let E = [5.5, -4, 0.2],
  sig = 6,
  gerr = [0, 0],
  gtick = 0;
const fl = () => SC_FLAGS[S.sc];
const errMag = () => Math.hypot(E[0], E[1]);
const trusted = () => fl().lid && errMag() < 2.5;
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
const blankCd = () => ({
  stage: 0,
  eScan: null,
  eRes: null,
  sigPost: 0.09,
  hits: [],
  vox: [],
  nRaw: 0,
  nKept: 0,
  tr: null,
});
cd = blankCd();

function setScenario(n) {
  S.sc = n;
  S.t = 0;
  markTag = SC_NAMES[n];
  S.ang = (Math.random() - 0.5) * 1.2;
  S.ys = Math.random() < 0.5 ? -1 : 1;
  S.tDR = 0;
  if (n === 0) {
    E = [5.5, -4, 0.2];
    sig = 6;
    S.pend = [0, 0];
    S.sigGoal = null;
    S.job = null;
    S.gap = 0.5;
    car.v = 0;
  }
}
function newJob() {
  cd = blankCd();
  S.job = 0;
}
function enter(i) {
  if (i === 1) {
    cd.eScan = E.slice();
    cd.eRes = [
      (Math.random() - 0.5) * 0.09,
      (Math.random() - 0.5) * 0.09,
      (Math.random() - 0.5) * 0.0025,
    ];
    cd.tr = { x: car.x, y: car.y, yaw: car.yaw };
    cd.hits = castScan(car.x, car.y, car.yaw);
    cd.nRaw = cd.hits.length;
  }
  if (i === 2) {
    const m = new Map();
    for (const h of cd.hits) {
      if (h.r > CROP) continue;
      const k = Math.floor(h.lx / VOX) + ',' + Math.floor(h.ly / VOX);
      let v = m.get(k);
      if (!v) {
        v = { sx: 0, sy: 0, n: 0, d: 0 };
        m.set(k, v);
      }
      v.sx += h.lx;
      v.sy += h.ly;
      v.n++;
      if (h.dyn) v.d++;
    }
    cd.vox = [...m.values()].map((v) => ({ lx: v.sx / v.n, ly: v.sy / v.n, dyn: v.d > v.n / 2 }));
    cd.nKept = cd.vox.length;
  }
}
function ensure(i) {
  while (cd.stage < i) {
    cd.stage++;
    enter(cd.stage);
  }
}
function setPhase() {
  if (S.job == null) {
    S.ph = 0;
    S.p = 0;
    return;
  }
  let i = 1;
  while (i < 4 && S.job >= ST[i + 1]) i++;
  S.ph = i;
  S.p = clamp((S.job - ST[i]) / (EN[i] - ST[i]), 0, 1);
  ensure(i);
}
function update(dt) {
  if (S.paused) return;
  T += dt;
  S.t += dt;
  if (S.t >= SC_DUR[S.sc]) setScenario(SC_NEXT[S.sc]);
  const f = fl(),
    tr = trusted();
  car.v += clamp((S.sc === 0 ? 0 : 5.5) - car.v, -3 * dt, 2.5 * dt);
  car.x += (car.v * dt) / Math.hypot(1, rdx(car.x));
  placeCar();
  // inertial drift
  let rate, yr;
  if (!f.lid && !f.gnss) {
    S.tDR += dt;
    rate = 0.05 + 0.012 * S.tDR;
    yr = 0.003 + 0.0006 * S.tDR;
  } else {
    S.tDR = 0;
    rate = tr ? 0.05 : 0.08;
    yr = 0.003;
  }
  if (S.job != null) rate *= 0.3;
  S.ang += (Math.random() - 0.5) * dt * 0.6;
  S.ang = clamp(S.ang, -0.9, 0.9);
  // drift is mostly along the road, only slightly sideways
  const al = Math.cos(S.ang) * rate,
    la = Math.sin(S.ang) * rate * 0.3,
    cy = Math.cos(car.yaw),
    sy = Math.sin(car.yaw);
  E[0] += (al * cy - la * sy) * dt;
  E[1] += (al * sy + la * cy) * dt;
  E[2] += S.ys * yr * dt;
  if (!f.lid && f.gnss) E[2] *= Math.exp(-0.4 * dt);
  sig += rate * dt;
  // pending corrections are blended in, never snapped
  {
    const k = 1 - Math.exp(-dt * 3),
      dx = S.pend[0] * k,
      dy = S.pend[1] * k;
    E[0] += dx;
    E[1] += dy;
    S.pend[0] -= dx;
    S.pend[1] -= dy;
    if (S.sigGoal != null) {
      sig += (S.sigGoal - sig) * k;
      if (Math.abs(sig - S.sigGoal) < 0.02) S.sigGoal = null;
    }
  }
  // GNSS: one fix per second, used only when LiDAR is not trusted
  gtick += dt;
  if (gtick >= 1) {
    gtick -= 1;
    gerr = [gerr[0] * 0.8 + gauss() * 0.5, gerr[1] * 0.8 + gauss() * 0.5];
    if (f.gnss && !tr) {
      const K = errMag() > 2.5 ? 0.5 : 0.3;
      S.pend[0] += K * (gerr[0] - E[0] - S.pend[0]);
      S.pend[1] += K * (gerr[1] - E[1] - S.pend[1]);
      S.sigGoal = lerp(sig, 1.3, K);
    }
  }
  // LiDAR pipeline
  if (!f.lid) S.job = null;
  else if (S.job == null) {
    S.gap -= dt;
    if (S.gap <= 0 && errMag() < 2.5) newJob();
  } else {
    S.job += dt;
    if (S.job >= JEND) {
      ensure(4);
      E = E.map((v, k) => v + cd.eRes[k] - cd.eScan[k]);
      sig = cd.sigPost;
      S.job = null;
      S.gap = 0.5;
    }
  }
  setPhase();
}
const lerpE = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);
const iterF = (p) =>
  p < 0.12 ? 0 : (1 - Math.pow(0.42, ((p - 0.12) / 0.88) * ITER)) / (1 - Math.pow(0.42, ITER));
function view() {
  const i = S.ph,
    p = S.p;
  let e = E.slice(),
    s = sig,
    ek = null;
  if (i === 3) ek = lerpE(cd.eScan, cd.eRes, iterF(p));
  if (i === 4) {
    const t = sm(p);
    e = E.map((v, k) => v + (cd.eRes[k] - cd.eScan[k]) * t);
    s = lerp(sig, cd.sigPost, t);
    ek = cd.eRes;
  }
  return { e, sig: s, ek };
}

/* ---------- trails ---------- */
const trTruth = [],
  trEst = [];
let lastTr = null;
function pushTrail(v) {
  if (lastTr && Math.hypot(car.x - lastTr[0], car.y - lastTr[1]) < 0.8) return;
  lastTr = [car.x, car.y];
  trTruth.push([car.x, car.y]);
  trEst.push([car.x + v.e[0], car.y + v.e[1]]);
  if (trTruth.length > 140) {
    trTruth.shift();
    trEst.shift();
  }
}

/* ---------- drawing helpers ---------- */
function drawCarShape(x, y, yaw, L, Wd, fill, stroke, lw, alpha, dash) {
  g.save();
  g.translate(x, y);
  g.rotate(yaw);
  g.globalAlpha = alpha;
  g.beginPath();
  g.roundRect(-L / 2, -Wd / 2, L, Wd, 0.45);
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = lw;
    if (dash) g.setLineDash(dash);
    g.stroke();
  }
  if (fill) {
    g.fillStyle = 'rgba(5,10,20,.45)';
    g.fillRect(L * 0.1, -Wd * 0.36, L * 0.2, Wd * 0.72);
  }
  g.restore();
}
function drawEnv(bx0, bx1) {
  const u = 1 / SC;
  // road
  const pts = [];
  for (let x = bx0 - 10; x < bx1 + 10; x += 4) pts.push([x, road(x)]);
  const path = () => {
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
  };
  g.lineJoin = 'round';
  g.lineCap = 'butt';
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
  for (let c = Math.floor((bx0 - 30) / CH); c <= Math.floor((bx1 + 30) / CH); c++) {
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
        g.save();
        g.translate(s.c[0], s.c[1]);
        g.scale(0.78, 0.78);
        g.translate(-s.c[0], -s.c[1]);
        g.beginPath();
        p.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])));
        g.closePath();
        g.fillStyle = 'rgba(255,255,255,.035)';
        g.fill();
        g.restore();
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
        g.fillStyle = `hsla(${200 + s.h * 60},35%,55%,.45)`;
        g.fill();
      }
    }
  }
}
function drawMap(bx0, bx1, hot) {
  const u = 1 / SC,
    sz = u * (hot ? 2.6 : 2);
  g.fillStyle = hot ? 'rgba(160,185,225,.8)' : 'rgba(141,160,189,.42)';
  for (let c = Math.floor((bx0 - 30) / CH); c <= Math.floor((bx1 + 30) / CH); c++)
    for (const m of chunk(c).map) g.fillRect(m[0] - sz / 2, m[1] - sz / 2, sz, sz);
}
function drawTraffic() {
  for (const d of dyn) {
    const q = dynPose(d),
      a = clamp((62 - Math.abs(q.rel)) / 12, 0, 1);
    if (a <= 0) continue;
    drawCarShape(q.x, q.y, q.yaw, 4.4, 1.9, '#9db0cf', null, 0, 0.55 * a);
  }
}
function drawTrails() {
  const u = 1 / SC;
  const line = (arr, col, w) => {
    for (let i = 1; i < arr.length; i++) {
      g.strokeStyle = col;
      g.globalAlpha = (0.75 * i) / arr.length;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(arr[i - 1][0], arr[i - 1][1]);
      g.lineTo(arr[i][0], arr[i][1]);
      g.stroke();
    }
    g.globalAlpha = 1;
  };
  line(trTruth, 'rgba(255,255,255,.7)', u * 1.2);
  line(trEst, '#3e9bff', u * 2.4);
}
function drawScan(i, p, v) {
  const u = 1 / SC,
    eo = i === 3 ? v.ek : i === 4 ? cd.eRes : cd.eScan;
  const ox = cd.tr.x + eo[0],
    oy = cd.tr.y + eo[1],
    yw = cd.tr.yaw + eo[2],
    c = Math.cos(yw),
    s = Math.sin(yw);
  const w = (lx, ly) => [ox + lx * c - ly * s, oy + lx * s + ly * c];
  const pxl = (x, y, sz) => g.fillRect(x - sz / 2, y - sz / 2, sz, sz);
  if (i === 1) {
    const ba = p * TAU;
    for (let k = 0; k < 26; k++) {
      g.fillStyle = `rgba(94,224,255,${0.14 * (1 - k / 26)})`;
      g.beginPath();
      g.moveTo(ox, oy);
      g.arc(ox, oy, RANGE, yw + ba - (k + 1) * 0.04, yw + ba - k * 0.04);
      g.closePath();
      g.fill();
    }
    const rr = RANGE * ((p * 2.2) % 1);
    g.strokeStyle = `rgba(94,224,255,${0.35 * (1 - rr / RANGE)})`;
    g.lineWidth = u * 1.5;
    g.beginPath();
    g.arc(ox, oy, rr, 0, TAU);
    g.stroke();
    for (const h of cd.hits) {
      if (h.a > ba) break;
      const hot = ba - h.a < 0.35,
        [x, y] = w(h.lx, h.ly);
      g.fillStyle = h.col;
      g.globalAlpha = hot ? 1 : 0.8;
      pxl(x, y, u * (hot ? 3.4 : 2.3));
    }
    g.globalAlpha = 1;
  } else if (i === 2) {
    const Rc = lerp(RANGE, CROP, sm(clamp(p / 0.4, 0, 1))),
      t = sm(clamp((p - 0.4) / 0.5, 0, 1));
    g.setLineDash([u * 6, u * 6]);
    g.strokeStyle = 'rgba(62,155,255,.8)';
    g.lineWidth = u * 1.5;
    g.beginPath();
    g.arc(ox, oy, Rc, 0, TAU);
    g.stroke();
    g.setLineDash([]);
    for (const h of cd.hits) {
      const a = (1 - t) * (h.r > Rc ? 0.12 : 1);
      if (a < 0.01) continue;
      const [x, y] = w(h.lx, h.ly);
      g.fillStyle = h.col;
      g.globalAlpha = a;
      pxl(x, y, u * 2.3);
    }
    g.globalAlpha = t;
    for (const q of cd.vox) {
      const [x, y] = w(q.lx, q.ly);
      g.fillStyle = q.dyn ? '#ffb547' : '#5ee0ff';
      pxl(x, y, VOX * 0.86);
    }
    g.globalAlpha = 1;
  } else {
    const d0 = Math.hypot(cd.eScan[0] - cd.eRes[0], cd.eScan[1] - cd.eRes[1]) + 1e-6;
    const dk = Math.hypot(eo[0] - cd.eRes[0], eo[1] - cd.eRes[1]),
      f = i === 4 ? 1 : 1 - clamp(dk / d0, 0, 1);
    const a0 = i === 4 ? lerp(0.85, 0.18, sm(p)) : 1,
      cl = `rgb(${Math.round(94 - 42 * f)},${Math.round(224 - 13 * f)},${Math.round(255 - 102 * f)})`;
    const dynA = i === 3 ? lerp(1, 0.12, clamp((p - 0.12) / 0.2, 0, 1)) : 0.1;
    if (i === 3) {
      // correspondences
      const ct = Math.cos(cd.tr.yaw),
        st = Math.sin(cd.tr.yaw),
        la = clamp(dk * 0.35, 0, 0.38);
      if (la > 0.01) {
        g.strokeStyle = `rgba(94,224,255,${la})`;
        g.lineWidth = u * 1;
        g.beginPath();
        cd.vox.forEach((q, n) => {
          if (q.dyn || n % 4) return;
          const [x, y] = w(q.lx, q.ly);
          g.moveTo(x, y);
          g.lineTo(cd.tr.x + q.lx * ct - q.ly * st, cd.tr.y + q.lx * st + q.ly * ct);
        });
        g.stroke();
      }
    }
    for (const q of cd.vox) {
      const [x, y] = w(q.lx, q.ly);
      g.fillStyle = q.dyn ? '#ffb547' : cl;
      g.globalAlpha = (q.dyn ? dynA : 1) * a0;
      pxl(x, y, VOX * 0.86);
      if (i === 3 && q.dyn && p < 0.5) {
        g.globalAlpha = (1 - p / 0.5) * 0.8;
        g.strokeStyle = '#ffb547';
        g.lineWidth = u * 1.4;
        g.beginPath();
        g.arc(x, y, u * (7 + 10 * p), 0, TAU);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  }
  // scan origin marker
  if (i >= 1) {
    g.strokeStyle = 'rgba(94,224,255,.6)';
    g.lineWidth = u * 1.4;
    g.beginPath();
    g.arc(ox, oy, u * 5, 0, TAU);
    g.stroke();
  }
}
function drawPose(v, i, p) {
  const u = 1 / SC,
    ex = car.x + v.e[0],
    ey = car.y + v.e[1],
    eyaw = car.yaw + v.e[2];
  drawCarShape(car.x, car.y, car.yaw, 4.4, 1.9, null, 'rgba(255,255,255,.75)', u * 1.5, 1, [
    u * 5,
    u * 4,
  ]);
  drawCarShape(ex, ey, eyaw, 4.4, 1.9, '#3e9bff', 'rgba(190,220,255,.9)', u * 1.4, 1);
  g.save();
  g.translate(ex, ey);
  g.rotate(eyaw);
  const rx = v.sig * 2 * 1.15,
    ry = v.sig * 2 * 0.85;
  g.beginPath();
  g.ellipse(0, 0, rx, ry, 0, 0, TAU);
  g.fillStyle = 'rgba(62,155,255,.12)';
  g.fill();
  g.strokeStyle = 'rgba(120,185,255,.85)';
  g.lineWidth = u * 1.6;
  g.stroke();
  if (i === 0 || i === 4) {
    g.fillStyle = '#fff';
    g.globalAlpha = 0.9;
    for (let k = 0; k < 9; k++) {
      const a = (k / 8) * TAU,
        x = k === 8 ? 0 : Math.cos(a) * rx,
        y = k === 8 ? 0 : Math.sin(a) * ry,
        r = u * 3.4;
      g.beginPath();
      g.moveTo(x, y - r);
      g.lineTo(x + r, y);
      g.lineTo(x, y + r);
      g.lineTo(x - r, y);
      g.closePath();
      g.fill();
    }
  }
  g.restore();
  if (i === 4) {
    // registration measurement
    const mx = car.x + E[0] + cd.eRes[0] - cd.eScan[0],
      my = car.y + E[1] + cd.eRes[1] - cd.eScan[1],
      a = 1 - sm(clamp((p - 0.6) / 0.4, 0, 1)) * 0.4;
    g.globalAlpha = a;
    g.strokeStyle = '#34d399';
    g.lineWidth = u * 1.8;
    g.beginPath();
    g.arc(mx, my, u * 7, 0, TAU);
    g.moveTo(mx - u * 12, my);
    g.lineTo(mx + u * 12, my);
    g.moveTo(mx, my - u * 12);
    g.lineTo(mx, my + u * 12);
    g.stroke();
    g.setLineDash([u * 4, u * 4]);
    g.beginPath();
    g.moveTo(car.x + E[0], car.y + E[1]);
    g.lineTo(mx, my);
    g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 1;
  }
}
function drawGnss() {
  if (!fl().gnss) return null;
  const u = 1 / SC,
    q = { x: car.x + gerr[0], y: car.y + gerr[1], f: gtick },
    a = (trusted() ? 0.28 : 0.85) * (1 - q.f * 0.5);
  g.globalAlpha = a;
  g.strokeStyle = '#c3cde0';
  g.lineWidth = u * 1.4;
  g.setLineDash([u * 3, u * 3]);
  g.beginPath();
  g.arc(q.x, q.y, 2.2 + q.f * 0.8, 0, TAU);
  g.stroke();
  g.setLineDash([]);
  g.beginPath();
  g.arc(q.x, q.y, u * 3, 0, TAU);
  g.fillStyle = '#c3cde0';
  g.fill();
  g.globalAlpha = 1;
  return q;
}
const toS = (x, y) => [camX() + (x - car.x) * SC, camY() + (y - car.y) * SC];
function pill(x, y, text, col) {
  g.font = '500 12px ' + FONT;
  const w = g.measureText(text).width + 28,
    h = 26;
  x = clamp(x, 8, W - w - 8);
  y = clamp(y, 8, H - h - 8);
  g.fillStyle = 'rgba(9,14,25,.84)';
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
}
function callout(v, gq) {
  const i = S.ph,
    p = S.p,
    f = fl(),
    [sx, sy] = toS(car.x + v.e[0], car.y + v.e[1]),
    err = Math.hypot(v.e[0], v.e[1]);
  let t,
    col = '#3e9bff';
  if (i === 1) {
    t = 'LiDAR sweep · ' + cd.nRaw + ' points';
    col = '#5ee0ff';
  } else if (i === 2) {
    t = 'Voxel filter · ' + cd.nRaw + ' → ' + cd.nKept;
    col = '#5ee0ff';
  } else if (i === 3) {
    t =
      'Scan-to-map · iteration ' +
      Math.max(1, Math.ceil(clamp((p - 0.12) / 0.88, 0, 1) * ITER)) +
      ' / ' +
      ITER;
    col = '#5ee0ff';
  } else if (i === 4) {
    t = 'UKF update · error ' + err.toFixed(2) + ' m';
    col = '#34d399';
  } else if (!f.lid && !f.gnss) {
    t = 'Dead reckoning · drift ' + err.toFixed(1) + ' m';
    col = '#ff5d6c';
  } else if (!f.lid) {
    t = 'GNSS + IMU · ±' + v.sig.toFixed(1) + ' m';
    col = '#ffb547';
  } else if (errMag() > 2.5) t = 'GNSS fix guides the match';
  else t = 'Inertial prediction';
  pill(sx + 34, sy - 66, t, col);
  let off = 30;
  if (!f.lid) {
    pill(sx + 34, sy - 66 + off, 'LiDAR · offline', '#ff5d6c');
    off += 30;
  }
  if (!f.gnss) pill(sx + 34, sy - 66 + off, 'GNSS · lost', '#ff5d6c');
  else if (gq) {
    const [x, y] = toS(gq.x, gq.y);
    pill(x + 12, y + 14, trusted() ? 'GNSS · held back' : 'GNSS · fix used', '#9aa8c2');
  }
  if (i === 3 && p < 0.5) {
    const q = cd.vox.find((z) => z.dyn);
    if (q) {
      const c = Math.cos(cd.tr.yaw + cd.eScan[2]),
        s = Math.sin(cd.tr.yaw + cd.eScan[2]);
      const [x, y] = toS(
        cd.tr.x + cd.eScan[0] + q.lx * c - q.ly * s,
        cd.tr.y + cd.eScan[1] + q.lx * s + q.ly * c,
      );
      pill(x + 14, y - 38, 'Moving object · rejected', '#ffb547');
    }
  }
}

/* ---------- frame ---------- */
function draw() {
  const v = view(),
    i = S.ph,
    p = S.p;
  pushTrail(v);
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  const [sx, sy] = toS(car.x, car.y);
  const bg = g.createRadialGradient(sx, sy, 0, sx, sy, Math.max(W, H) * 0.85);
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
  drawMap(bx0, bx1, i === 3);
  drawTraffic();
  drawTrails();
  if (fl().lid && i !== 1) {
    const ba = T * 12.5,
      ex = car.x + v.e[0],
      ey = car.y + v.e[1],
      yw = car.yaw + v.e[2];
    for (let k = 0; k < 14; k++) {
      g.fillStyle = `rgba(94,224,255,${0.07 * (1 - k / 14)})`;
      g.beginPath();
      g.moveTo(ex, ey);
      g.arc(ex, ey, RANGE, yw + ba - (k + 1) * 0.05, yw + ba - k * 0.05);
      g.closePath();
      g.fill();
    }
  }
  if (i >= 1) drawScan(i, p, v);
  const gq = drawGnss();
  drawPose(v, i, p);
  g.restore();
  callout(v, gq);
}

/* ---------- chart ---------- */
const hist = [];
let clk = 0,
  lastSamp = 0,
  ym = 2;
function sample(v) {
  clk += 1 / 60;
  if (clk - lastSamp >= 0.1) {
    lastSamp = clk;
    hist.push({ t: clk, err: Math.hypot(v.e[0], v.e[1]), sig: v.sig, tag: markTag });
    markTag = null;
    while (hist.length && hist[0].t < clk - 42) hist.shift();
  }
}
function drawChart() {
  const w = chW,
    h = chH;
  if (!w || !h) return;
  gc.setTransform(DPR, 0, 0, DPR, 0, 0);
  gc.clearRect(0, 0, w, h);
  const padR = 36,
    padT = 14,
    padB = 6,
    iw = w - padR,
    ih = h - padT - padB,
    WIN = 40;
  let mx = 1.2;
  for (const s of hist) mx = Math.max(mx, s.err, s.sig);
  ym += (mx * 1.12 - ym) * 0.06;
  const X = (t) => ((t - (clk - WIN)) / WIN) * iw,
    Y = (val) => padT + ih - (clamp(val, 0, ym) / ym) * ih;
  const step = ym > 8 ? 5 : ym > 4 ? 2 : ym > 2 ? 1 : 0.5;
  gc.font = '11px ' + FONT;
  gc.textBaseline = 'middle';
  for (let gv = 0; gv <= ym; gv += step) {
    const y = Math.round(Y(gv)) + 0.5;
    gc.strokeStyle = 'rgba(255,255,255,.07)';
    gc.lineWidth = 1;
    gc.beginPath();
    gc.moveTo(0, y);
    gc.lineTo(iw, y);
    gc.stroke();
    gc.fillStyle = 'rgba(143,160,189,.75)';
    gc.fillText(gv + ' m', iw + 7, y);
  }
  if (hist.length < 2) return;
  gc.beginPath();
  gc.moveTo(X(hist[0].t), Y(0));
  hist.forEach((s) => gc.lineTo(X(s.t), Y(s.sig)));
  gc.lineTo(X(hist[hist.length - 1].t), Y(0));
  gc.closePath();
  gc.fillStyle = 'rgba(62,155,255,.16)';
  gc.fill();
  gc.beginPath();
  hist.forEach((s, k) => (k ? gc.lineTo(X(s.t), Y(s.sig)) : gc.moveTo(X(s.t), Y(s.sig))));
  gc.strokeStyle = 'rgba(62,155,255,.9)';
  gc.lineWidth = 1.5;
  gc.stroke();
  gc.font = '500 10.5px ' + FONT;
  gc.textBaseline = 'top';
  for (const s of hist)
    if (s.tag) {
      const x = X(s.t);
      gc.strokeStyle = 'rgba(255,255,255,.18)';
      gc.setLineDash([3, 4]);
      gc.beginPath();
      gc.moveTo(x, padT);
      gc.lineTo(x, padT + ih);
      gc.stroke();
      gc.setLineDash([]);
      gc.fillStyle = 'rgba(190,205,230,.85)';
      gc.fillText(s.tag, x + 5, 1);
    }
  gc.beginPath();
  hist.forEach((s, k) => (k ? gc.lineTo(X(s.t), Y(s.err)) : gc.moveTo(X(s.t), Y(s.err))));
  gc.strokeStyle = '#34d399';
  gc.lineWidth = 2;
  gc.lineJoin = 'round';
  gc.stroke();
  const l = hist[hist.length - 1];
  gc.fillStyle = '#34d399';
  gc.beginPath();
  gc.arc(X(l.t), Y(l.err), 3.5, 0, TAU);
  gc.fill();
}

/* ---------- ui ---------- */
const rail = $('rail'),
  chips = [];
SC_NAMES.forEach((n, i) => {
  const b = document.createElement('button');
  b.className = 'chip';
  b.innerHTML = n + '<span class="bar"></span>';
  b.onclick = () => setScenario(i);
  rail.appendChild(b);
  chips.push(b);
});
addEventListener('keydown', (e) => {
  if (e.key >= '1' && e.key <= '5') setScenario(+e.key - 1);
  else if (e.key === ' ') {
    S.paused = !S.paused;
    e.preventDefault();
  }
});
const tile = (id, text, hot, st) => {
  const el = $(id);
  el.querySelector('.s').textContent = text;
  el.classList.toggle('hot', !!hot);
  const d = el.querySelector('i');
  d.className = st || '';
};
let lastUi = 0,
  shownSc = -1;
function ui(now) {
  const sc = S.sc,
    f = fl(),
    i = S.ph;
  chips.forEach((c, k) => {
    c.classList.toggle('on', k === sc);
    c.querySelector('.bar').style.transform = `scaleX(${k === sc ? S.t / SC_DUR[sc] : 0})`;
  });
  if (now - lastUi < 90) return;
  lastUi = now;
  const v = view(),
    err = Math.hypot(v.e[0], v.e[1]);
  if (shownSc !== sc) {
    shownSc = sc;
    $('dName').textContent = SC_TITLE[sc];
    $('dDesc').textContent = SC_DESC[sc];
  }
  const m = [
    ['Sources', SC_SRC[sc]],
    ['Position error', err.toFixed(2) + ' m'],
    ['Uncertainty σ', v.sig.toFixed(2) + ' m'],
  ];
  $('dMetrics').innerHTML = m
    .map(([l, val]) => `<div><b>${val}</b><span>${l}</span></div>`)
    .join('');
  $('dErr').textContent = err.toFixed(2);
  $('dXY').textContent = (car.x + v.e[0]).toFixed(1) + ', ' + (car.y + v.e[1]).toFixed(1) + ' m';
  $('dHd').textContent = ((Math.abs(v.e[2]) * 180) / Math.PI).toFixed(1) + '°';
  $('dSig').textContent = v.sig.toFixed(2) + ' m';
  $('mErr').textContent = err.toFixed(2) + ' m';
  $('mSig').textContent = v.sig.toFixed(2) + ' m';
  const dr = !f.lid && !f.gnss;
  tile('t-imu', dr ? 'Dead reckoning' : 'Streaming', dr);
  tile(
    't-lid',
    !f.lid ? 'Offline' : i === 1 ? 'Scanning' : i === 2 ? 'Filtering' : '10 Hz',
    i === 1 || i === 2,
    !f.lid ? 'r' : '',
  );
  tile(
    't-gnss',
    !f.gnss ? 'Lost' : trusted() ? 'Held back' : 'Fix · 1 Hz',
    f.gnss && !trusted(),
    !f.gnss ? 'r' : trusted() ? 'w' : '',
  );
  tile('t-map', f.lid ? 'Loaded' : 'Unused', i === 3, f.lid ? '' : 'w');
  tile(
    't-reg',
    !f.lid ? 'Unavailable' : i === 3 ? 'Aligning' : i === 4 ? 'Converged' : 'Idle',
    i === 3,
    !f.lid ? 'r' : i < 3 ? 'w' : '',
  );
  tile(
    't-flt',
    sc === 0 && err > 2.5
      ? 'Positioning'
      : dr
        ? 'Uncertain'
        : !f.lid
          ? 'Degraded'
          : i === 4
            ? 'Updating'
            : 'Nominal',
    i === 4,
    dr ? 'r' : !f.lid ? 'w' : '',
  );
  [
    ['s-imu', 1],
    ['s-lid', f.lid],
    ['s-gnss', f.gnss],
  ].forEach(([id, ok]) => $(id).classList.toggle('x', !ok));
}

/* ---------- boot ---------- */
resize();
setScenario(0);
setPhase();
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  if (!S.paused) sample(view());
  drawChart();
  ui(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
