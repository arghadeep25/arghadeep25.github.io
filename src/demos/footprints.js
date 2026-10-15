import { $, clamp, FONT, lerp, TAU } from './common.js';

const eio = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/* ---------- study data (reported in the project, Austin) ---------- */
const NETS = ['FCN', 'SegNet', 'U-Net', 'Deep U-Net', 'PSPNet'];
const RES = { no: [0.43, 0.52, 0.55, 0.52, 0.53], aug: [0.54, 0.57, 0.69, 0.63, 0.6] };
const NET_KIND = [
  'Fully convolutional',
  'Encoder–decoder',
  'Encoder–decoder + skips',
  'Residual encoder–decoder',
  'Pyramid pooling',
];

/* ---------- synthetic suburban scene ---------- */
const IW = 1024,
  IH = 512,
  CELL = 4,
  GW = IW / CELL,
  GH = IH / CELL,
  PC = 4,
  PR = 2,
  PCELLS = 64,
  PW = PCELLS * CELL;
const imgC = document.createElement('canvas');
imgC.width = IW;
imgC.height = IH;
const ig = imgC.getContext('2d');
let CITY = null;
function rectPoly(cx, cy, ang, w, h) {
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([a, b]) => {
    const x = (a * w) / 2,
      y = (b * h) / 2;
    return [cx + x * Math.cos(ang) - y * Math.sin(ang), cy + x * Math.sin(ang) + y * Math.cos(ang)];
  });
}
function genCity(seed) {
  const R = rng(seed * 977 + 7),
    b = [],
    trees = [],
    roads = [];
  const add = (cx, cy, ang, w, h, roof) => {
    if (cx < 10 || cy < 10 || cx > IW - 10 || cy > IH - 10) return;
    b.push({ poly: rectPoly(cx, cy, ang, w, h), roof, c: [cx, cy] });
  };
  const roofs = ['#b9a58c', '#8b8f96', '#a67c64', '#c7c0b3', '#7a6e66'];
  for (let y = 70; y < IH; y += 120)
    roads.push([[0, y + (R() - 0.5) * 30], [IW, y + (R() - 0.5) * 30], 10]);
  for (let x = 90; x < IW; x += 170 + R() * 40) roads.push([[x, 0], [x + (R() - 0.5) * 20, IH], 9]);
  for (const [p, q] of roads) {
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]),
      ang = Math.atan2(q[1] - p[1], q[0] - p[0]);
    for (let d = 20; d < L - 20; d += 30 + R() * 14)
      for (const sd of [-1, 1]) {
        if (R() < 0.22) continue;
        const off = 22 + R() * 6,
          cx = p[0] + Math.cos(ang) * d - Math.sin(ang) * off * sd,
          cy = p[1] + Math.sin(ang) * d + Math.cos(ang) * off * sd;
        add(
          cx,
          cy,
          ang + (R() - 0.5) * 0.1,
          17 + R() * 8,
          12 + R() * 6,
          roofs[Math.floor(R() * roofs.length)],
        );
      }
  }
  for (let i = 0; i < 260; i++) trees.push([R() * IW, R() * IH, 4 + R() * 6]);
  ig.fillStyle = '#6f7c4c';
  ig.fillRect(0, 0, IW, IH);
  for (let i = 0; i < 9000; i++) {
    ig.fillStyle = R() < 0.5 ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.05)';
    ig.fillRect(R() * IW, R() * IH, 2 + R() * 3, 2 + R() * 3);
  }
  ig.lineCap = 'round';
  for (const [p, q, w] of roads) {
    ig.strokeStyle = '#8c8e8a';
    ig.lineWidth = w;
    ig.beginPath();
    ig.moveTo(p[0], p[1]);
    ig.lineTo(q[0], q[1]);
    ig.stroke();
    ig.strokeStyle = 'rgba(255,255,255,.08)';
    ig.lineWidth = 1;
    ig.stroke();
  }
  for (const t of trees) {
    ig.fillStyle = 'rgba(0,0,0,.28)';
    ig.beginPath();
    ig.arc(t[0] + 3, t[1] + 3, t[2], 0, TAU);
    ig.fill();
    ig.fillStyle = `hsl(${100 + R() * 30},${35 + R() * 15}%,${24 + R() * 10}%)`;
    ig.beginPath();
    ig.arc(t[0], t[1], t[2], 0, TAU);
    ig.fill();
  }
  for (const o of b) {
    ig.fillStyle = 'rgba(0,0,0,.4)';
    ig.beginPath();
    o.poly.forEach((p, i) => (i ? ig.lineTo(p[0] + 4, p[1] + 4) : ig.moveTo(p[0] + 4, p[1] + 4)));
    ig.fill();
    ig.fillStyle = o.roof;
    ig.beginPath();
    o.poly.forEach((p, i) => (i ? ig.lineTo(p[0], p[1]) : ig.moveTo(p[0], p[1])));
    ig.fill();
    ig.strokeStyle = 'rgba(255,255,255,.18)';
    ig.lineWidth = 1;
    ig.stroke();
  }
  const lc = document.createElement('canvas');
  lc.width = GW;
  lc.height = GH;
  const lg = lc.getContext('2d');
  lg.imageSmoothingEnabled = false;
  lg.fillStyle = '#000';
  lg.fillRect(0, 0, GW, GH);
  b.forEach((o, i) => {
    lg.fillStyle = `rgb(${(i + 1) & 255},${(i + 1) >> 8},0)`;
    lg.beginPath();
    o.poly.forEach((p, k) =>
      k ? lg.lineTo(p[0] / CELL, p[1] / CELL) : lg.moveTo(p[0] / CELL, p[1] / CELL),
    );
    lg.fill();
  });
  const d = lg.getImageData(0, 0, GW, GH).data,
    id = new Uint16Array(GW * GH),
    gt = new Uint8Array(GW * GH);
  for (let i = 0; i < GW * GH; i++) {
    const v = d[i * 4] + (d[i * 4 + 1] << 8);
    if (v > 0 && v <= b.length) {
      id[i] = v;
      gt[i] = 1;
    }
  }
  const cnt = new Array(PC * PR).fill(0);
  for (let y = 0; y < GH; y++)
    for (let x = 0; x < GW; x++)
      if (gt[y * GW + x]) cnt[Math.floor(y / PCELLS) * PC + Math.floor(x / PCELLS)]++;
  let best = 0;
  cnt.forEach((v, i) => {
    if (v > cnt[best]) best = i;
  });
  CITY = { b, id, gt, best, seed };
  // ground truth of the chosen patch, as a small image
  const gp = document.createElement('canvas');
  gp.width = gp.height = PCELLS;
  const gx = gp.getContext('2d'),
    gi = gx.createImageData(PCELLS, PCELLS),
    cx0 = (best % PC) * PCELLS,
    cy0 = Math.floor(best / PC) * PCELLS;
  for (let y = 0; y < PCELLS; y++)
    for (let x = 0; x < PCELLS; x++)
      if (gt[(cy0 + y) * GW + cx0 + x]) {
        const o = (y * PCELLS + x) * 4;
        gi.data[o] = gi.data[o + 1] = gi.data[o + 2] = 255;
        gi.data[o + 3] = 255;
      }
  gx.putImageData(gi, 0, 0);
  GTP = gp;
}
let GTP = null;

/* ---------- prediction (simulated; quality follows the reported score) ---------- */
function boxBlur(src, r) {
  if (r < 0.3) return src.slice();
  const n = Math.max(1, Math.round(r)),
    out = new Float32Array(GW * GH),
    tmp = new Float32Array(GW * GH);
  for (let y = 0; y < GH; y++) {
    let s = 0;
    for (let x = -n; x <= n; x++) s += src[y * GW + clamp(x, 0, GW - 1)];
    for (let x = 0; x < GW; x++) {
      tmp[y * GW + x] = s / (2 * n + 1);
      s += src[y * GW + clamp(x + n + 1, 0, GW - 1)] - src[y * GW + clamp(x - n, 0, GW - 1)];
    }
  }
  for (let x = 0; x < GW; x++) {
    let s = 0;
    for (let y = -n; y <= n; y++) s += tmp[clamp(y, 0, GH - 1) * GW + x];
    for (let y = 0; y < GH; y++) {
      out[y * GW + x] = s / (2 * n + 1);
      s += tmp[clamp(y + n + 1, 0, GH - 1) * GW + x] - tmp[clamp(y - n, 0, GH - 1) * GW + x];
    }
  }
  return out;
}
const PRED = { P: null, M: null, cmp: null, iou: 0, ious: [], comps: [], area: 0 };
function simulate(d) {
  const R = rng(CITY.seed * 31 + SEL.net * 7 + (SEL.aug ? 3 : 0));
  const miss = lerp(0.02, 0.72, d),
    blurR = lerp(0.5, 3.2, d) * [1.4, 1.1, 0.9, 0.95, 1.2][SEL.net],
    noise = lerp(0.08, 0.6, d) * [1, 1.35, 0.9, 1, 1][SEL.net],
    fp = Math.round(lerp(1, 22, d));
  const nb = CITY.b.length,
    keep = new Uint8Array(nb + 1);
  for (let i = 1; i <= nb; i++) keep[i] = R() > miss ? 1 : 0;
  const base = new Float32Array(GW * GH);
  for (let i = 0; i < GW * GH; i++) base[i] = CITY.id[i] && keep[CITY.id[i]] ? 1 : 0;
  for (let k = 0; k < fp; k++) {
    const cx = R() * GW,
      cy = R() * GH,
      rr = 2 + R() * 5;
    for (let y = Math.max(0, Math.floor(cy - rr)); y < Math.min(GH, cy + rr); y++)
      for (let x = Math.max(0, Math.floor(cx - rr)); x < Math.min(GW, cx + rr); x++)
        if (Math.hypot(x - cx, y - cy) < rr) base[y * GW + x] = 1;
  }
  const nz = new Float32Array(GW * GH);
  for (let i = 0; i < GW * GH; i++) nz[i] = (R() - 0.5) * 2 * noise;
  const P = boxBlur(base, blurR),
    nzb = boxBlur(nz, 1.2);
  let I = 0,
    U = 0;
  for (let i = 0; i < GW * GH; i++) {
    P[i] = clamp(P[i] + nzb[i] * 1.4, 0, 1);
    const m = P[i] > 0.5,
      g = CITY.gt[i];
    if (m && g) I++;
    if (m || g) U++;
  }
  return { P, iou: U ? I / U : 0 };
}
function predict() {
  const Q = RES[SEL.aug ? 'aug' : 'no'][SEL.net];
  let lo = 0,
    hi = 1,
    best = simulate(0.5),
    bd = 0.5;
  for (let i = 0; i < 7; i++) {
    const m = (lo + hi) / 2,
      r = simulate(m);
    if (Math.abs(r.iou - Q) < Math.abs(best.iou - Q)) {
      best = r;
      bd = m;
    }
    if (r.iou > Q) lo = m;
    else hi = m;
  }
  const P = best.P,
    M = new Uint8Array(GW * GH),
    cmp = new Uint8Array(GW * GH);
  let I = 0,
    U = 0,
    area = 0;
  for (let i = 0; i < GW * GH; i++) {
    const m = P[i] > 0.5 ? 1 : 0,
      g = CITY.gt[i];
    M[i] = m;
    if (m && g) {
      I++;
      cmp[i] = 1;
    } else if (m) cmp[i] = 2;
    else if (g) cmp[i] = 3;
    if (m || g) U++;
    area += m;
  }
  PRED.P = P;
  PRED.M = M;
  PRED.cmp = cmp;
  PRED.iou = U ? I / U : 0;
  PRED.area = area / (GW * GH);
  PRED.ious = [];
  for (let p = 0; p < PC * PR; p++) {
    let i2 = 0,
      u2 = 0;
    const px = (p % PC) * PCELLS,
      py = Math.floor(p / PC) * PCELLS;
    for (let y = py; y < py + PCELLS; y++)
      for (let x = px; x < px + PCELLS; x++) {
        const k = y * GW + x;
        if (M[k] && CITY.gt[k]) i2++;
        if (M[k] || CITY.gt[k]) u2++;
      }
    PRED.ious.push(u2 ? i2 / u2 : 1);
  }
  const seen = new Uint8Array(GW * GH),
    comps = [];
  for (let s = 0; s < GW * GH; s++) {
    if (!M[s] || seen[s]) continue;
    const q2 = [s],
      cells = [];
    seen[s] = 1;
    for (let h = 0; h < q2.length; h++) {
      const c = q2[h],
        cx = c % GW,
        cy = (c / GW) | 0;
      cells.push(c);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = cx + dx,
          ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const k = ny * GW + nx;
        if (M[k] && !seen[k]) {
          seen[k] = 1;
          q2.push(k);
        }
      }
    }
    if (cells.length < 6) continue;
    let mx = 0,
      my = 0;
    for (const c of cells) {
      mx += c % GW;
      my += (c / GW) | 0;
    }
    mx /= cells.length;
    my /= cells.length;
    let sxx = 0,
      syy = 0,
      sxy = 0;
    for (const c of cells) {
      const x = (c % GW) - mx,
        y = ((c / GW) | 0) - my;
      sxx += x * x;
      syy += y * y;
      sxy += x * y;
    }
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy),
      ca = Math.cos(ang),
      sa = Math.sin(ang);
    let a0 = 1e9,
      a1 = -1e9,
      b0 = 1e9,
      b1 = -1e9;
    for (const c of cells) {
      const x = (c % GW) - mx,
        y = ((c / GW) | 0) - my,
        u = x * ca + y * sa,
        v = -x * sa + y * ca;
      a0 = Math.min(a0, u);
      a1 = Math.max(a1, u);
      b0 = Math.min(b0, v);
      b1 = Math.max(b1, v);
    }
    const corner = (u, v) => [
      (mx + u * ca - v * sa + 0.5) * CELL,
      (my + u * sa + v * ca + 0.5) * CELL,
    ];
    comps.push({
      poly: [
        corner(a0 - 0.5, b0 - 0.5),
        corner(a1 + 0.5, b0 - 0.5),
        corner(a1 + 0.5, b1 + 0.5),
        corner(a0 - 0.5, b1 + 0.5),
      ],
    });
  }
  PRED.comps = comps;
  CMPK = '';
  MASKK = '';
  // noise field for the "untrained" look
  if (!NZ) {
    const R = rng(99),
      n = new Float32Array(GW * GH);
    for (let i = 0; i < n.length; i++) n[i] = R();
    const b = boxBlur(n, 2);
    let mn = 9,
      mx2 = -9;
    for (const v of b) {
      mn = Math.min(mn, v);
      mx2 = Math.max(mx2, v);
    }
    NZ = b.map((v) => (v - mn) / (mx2 - mn));
  }
}
let NZ = null,
  CMPK = '',
  MASKK = '';

/* ---------- state ---------- */
const SEL = { net: 2, aug: true };
const NAMES = ['Patches', 'Augmentation', 'Training', 'Prediction', 'Scoring', 'Footprints'];
const TITLE = [
  'Satellite imagery and patches',
  'Augmentation',
  'Training',
  'Prediction',
  'Scoring against the truth',
  'Footprints',
];
const DESC = [
  'A high-resolution image arrives with three colour bands. It is cut into small 256-pixel patches the network can digest. Here is one of them.',
  'Before training, each patch is flipped, rotated, re-toned and cropped. The building labels are transformed with it, so one patch becomes many examples.',
  'The network sees the augmented patches over and over. Each pass its guess gets closer to the labelled buildings, and the error falls.',
  'The trained network gives every pixel a likelihood of being a building. A threshold turns that likelihood into a mask.',
  'The mask is laid over the labelled ground truth. Green is right, red is a false alarm, amber is a missed building. Five networks are compared, with and without augmentation.',
  'Blobs of building pixels become clean outlines, ready for maps, planning and change detection.',
];
const VLAB = [
  'Three bands · current patch',
  'Augmentation · image and label move together',
  'Network and training loss',
  'Likelihood to mask · current patch',
  'Reported scores · Austin',
  'Mask to outline · current patch',
];
const DWELL = [8, 9, 10, 8, 8, 7];
const AUGS = ['Horizontal flip', 'Rotate 90°', 'Brightness and contrast', 'Random crop'];
const EPOCHS = 40;
const ST = { f: 0, ft: 0, pin: -1, paused: false };
const Lay = { grid: 0, cmp: 0, out: 0 };
let stageT = 0;
const focus = () => (ST.pin >= 0 ? ST.pin : ST.f);
const prog = () => {
  const D = DWELL[focus()];
  return clamp((stageT % D) / D, 0, 0.9999);
};
// loss curves for the training stage (illustrative)
const LOSS = Array.from({ length: EPOCHS + 1 }, (_, e) => ({
  tr: 0.07 + 0.74 * Math.exp(-e / 7.5) + 0.012 * Math.sin(e * 1.9),
  va:
    0.1 +
    0.72 * Math.exp(-e / 8.5) +
    0.03 * (1 - Math.exp(-e / 14)) +
    0.015 * Math.sin(e * 1.3 + 1),
}));
function rebuild() {
  if (!CITY) genCity(1);
  predict();
}

/* ---------- canvases / layout / camera ---------- */
const cv = $('scene'),
  g = cv.getContext('2d'),
  mv = $('mini'),
  gm = mv.getContext('2d');
let W,
  H,
  DPR,
  mW,
  mH,
  AREA = { x: 0, y: 0, w: 1, h: 1 },
  FULL = { s: 1, ox: 0, oy: 0 };
const VIEW = { s: 1, ox: 0, oy: 0, init: false };
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
  AREA = { x: wide ? 28 : (W - availW) / 2, y: top, w: availW, h: availH };
  const k = Math.min(availW / IW, availH / IH);
  FULL = { s: k, ox: AREA.x + (availW - IW * k) / 2, oy: top + (availH - IH * k) / 2 };
  VIEW.init = false;
}
addEventListener('resize', resize);
const pr = (p) => [(p % PC) * PW, Math.floor(p / PC) * PW];
function viewTarget(f) {
  if (f >= 1 && f <= 3) {
    const [x0, y0] = pr(CITY.best),
      ks = Math.min((AREA.h * 0.94) / PW, (AREA.w * 0.6) / PW),
      cx = AREA.x + AREA.w * (f === 1 ? 0.34 : 0.5),
      cy = AREA.y + AREA.h / 2;
    return { s: ks, ox: cx - (x0 + PW / 2) * ks, oy: cy - (y0 + PW / 2) * ks };
  }
  return FULL;
}
function updateView(dt) {
  const t = viewTarget(focus());
  if (!VIEW.init) {
    Object.assign(VIEW, FULL, { init: true });
  }
  const k = 1 - Math.exp(-dt * 3.2);
  VIEW.s += (t.s - VIEW.s) * k;
  VIEW.ox += (t.ox - VIEW.ox) * k;
  VIEW.oy += (t.oy - VIEW.oy) * k;
}
const toS = (x, y) => [VIEW.ox + x * VIEW.s, VIEW.oy + y * VIEW.s];
const zoomAmt = () => clamp((VIEW.s - FULL.s) / (viewTarget(2).s - FULL.s), 0, 1);

/* ---------- patch helpers ---------- */
const PCV = document.createElement('canvas');
PCV.width = PCV.height = PCELLS;
const pg = PCV.getContext('2d');
function paintPatch(fn) {
  const id = pg.createImageData(PCELLS, PCELLS),
    cx0 = (CITY.best % PC) * PCELLS,
    cy0 = Math.floor(CITY.best / PC) * PCELLS;
  for (let y = 0; y < PCELLS; y++)
    for (let x = 0; x < PCELLS; x++) {
      const c = fn((cy0 + y) * GW + cx0 + x, x, y);
      if (c) {
        const o = (y * PCELLS + x) * 4;
        id.data[o] = c[0];
        id.data[o + 1] = c[1];
        id.data[o + 2] = c[2];
        id.data[o + 3] = c[3];
      }
    }
  pg.putImageData(id, 0, 0);
  return PCV;
}
const heat = (v) => (v < 0.05 ? null : [255, 130 + 90 * (1 - v), 50, 235 * v]);
function drawVariant(c, v, x, y, s, t, mode) {
  const [sx, sy] = pr(CITY.best),
    e = eio(t);
  c.save();
  c.beginPath();
  c.roundRect(x, y, s, s, 8);
  c.clip();
  c.translate(x + s / 2, y + s / 2);
  if (v === 0) c.scale(Math.cos(Math.PI * e), 1);
  if (v === 1) c.rotate((Math.PI / 2) * e);
  if (v === 3) {
    const z = 1 + 0.5 * e;
    c.scale(z, z);
    c.translate(-0.1 * s * e, 0.08 * s * e);
  }
  c.imageSmoothingEnabled = true;
  if (mode === 'mask') {
    c.fillStyle = '#05080f';
    c.fillRect(-s, -s, 2 * s, 2 * s);
    c.imageSmoothingEnabled = false;
    c.drawImage(GTP, -s / 2, -s / 2, s, s);
  } else {
    c.drawImage(imgC, sx, sy, PW, PW, -s / 2, -s / 2, s, s);
    if (mode === 'both') {
      c.globalAlpha = 0.38;
      c.imageSmoothingEnabled = false;
      c.drawImage(GTP, -s / 2, -s / 2, s, s);
      c.globalAlpha = 1;
    }
  }
  if (v === 2 && mode !== 'mask') {
    c.fillStyle = `rgba(255,214,150,${0.3 * e})`;
    c.fillRect(-s, -s, 2 * s, 2 * s);
    c.globalCompositeOperation = 'overlay';
    c.fillStyle = `rgba(255,255,255,${0.35 * e})`;
    c.fillRect(-s, -s, 2 * s, 2 * s);
  }
  c.restore();
  c.strokeStyle = 'rgba(255,255,255,.14)';
  c.lineWidth = 1;
  c.beginPath();
  c.roundRect(x, y, s, s, 8);
  c.stroke();
}
function epochNow() {
  const f = focus();
  return f === 2 ? eio(prog() * 1.08) * EPOCHS : f > 2 ? EPOCHS : 0;
}

/* ---------- drawing: scene ---------- */
function pill(x, y, text, col, alpha) {
  g.save();
  g.globalAlpha = alpha == null ? 1 : alpha;
  g.font = '500 12px ' + FONT;
  const w = g.measureText(text).width + 28,
    h = 26;
  x = clamp(x, 8, W - w - 8);
  y = clamp(y, 8, H - h - 8);
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
function updateLayers(dt) {
  const f = focus(),
    k = 1 - Math.exp(-dt * 5),
    u = prog(),
    t = { grid: f === 0 ? eio((u - 0.35) * 3) : 0, cmp: f === 4 ? 1 : 0, out: f === 5 ? 1 : 0 };
  for (const n in Lay) Lay[n] += (t[n] - Lay[n]) * k;
}
const CMPC = document.createElement('canvas');
CMPC.width = GW;
CMPC.height = GH;
const MASKC = document.createElement('canvas');
MASKC.width = GW;
MASKC.height = GH;
function cmpCanvas() {
  const key = SEL.net + '|' + SEL.aug;
  if (key !== CMPK) {
    CMPK = key;
    const m = CMPC.getContext('2d'),
      id = m.createImageData(GW, GH);
    for (let i = 0; i < GW * GH; i++) {
      const c = PRED.cmp[i];
      if (!c) continue;
      const col = c === 1 ? [52, 211, 153] : c === 2 ? [255, 93, 108] : [255, 181, 71];
      id.data[i * 4] = col[0];
      id.data[i * 4 + 1] = col[1];
      id.data[i * 4 + 2] = col[2];
      id.data[i * 4 + 3] = 190;
    }
    m.putImageData(id, 0, 0);
  }
  return CMPC;
}
function maskCanvas() {
  const key = SEL.net + '|' + SEL.aug;
  if (key !== MASKK) {
    MASKK = key;
    const m = MASKC.getContext('2d'),
      id = m.createImageData(GW, GH);
    for (let i = 0; i < GW * GH; i++)
      if (PRED.M[i]) {
        id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = 255;
        id.data[i * 4 + 3] = 90;
      }
    m.putImageData(id, 0, 0);
  }
  return MASKC;
}
function drawScene() {
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  const bg = g.createRadialGradient(W * 0.4, H * 0.4, 0, W * 0.4, H * 0.4, Math.max(W, H) * 0.9);
  bg.addColorStop(0, '#0e1a30');
  bg.addColorStop(1, '#04070d');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  const f = focus(),
    u = prog(),
    s = VIEW.s,
    z = zoomAmt(),
    [x0, y0] = pr(CITY.best);
  // clip to the image, but never under the panels
  const ix = Math.max(VIEW.ox, AREA.x),
    iy = Math.max(VIEW.oy, AREA.y),
    ix2 = Math.min(VIEW.ox + IW * s, AREA.x + AREA.w),
    iy2 = Math.min(VIEW.oy + IH * s, AREA.y + AREA.h);
  g.save();
  g.shadowColor = 'rgba(0,0,0,.7)';
  g.shadowBlur = 40;
  g.fillStyle = '#000';
  g.beginPath();
  g.roundRect(ix, iy, ix2 - ix, iy2 - iy, 14);
  g.fill();
  g.restore();
  g.save();
  g.beginPath();
  g.roundRect(ix, iy, ix2 - ix, iy2 - iy, 14);
  g.clip();
  g.translate(VIEW.ox, VIEW.oy);
  g.scale(s, s);
  g.drawImage(imgC, 0, 0);
  if (f === 0) {
    const sx = clamp(u / 0.45, 0, 1.3) * IW * 1.3 - IW * 0.15;
    if (u < 0.55) {
      const gr = g.createLinearGradient(sx - 120, 0, sx + 20, 0);
      gr.addColorStop(0, 'rgba(94,224,255,0)');
      gr.addColorStop(1, 'rgba(94,224,255,.28)');
      g.fillStyle = gr;
      g.fillRect(sx - 120, 0, 140, IH);
      g.fillStyle = 'rgba(160,235,255,.9)';
      g.fillRect(sx + 19, 0, 1.6 / s, IH);
    }
  }
  if (Lay.grid > 0.02) {
    g.strokeStyle = `rgba(255,255,255,${0.55 * Lay.grid})`;
    g.lineWidth = 1.2 / s;
    g.beginPath();
    for (let c = 0; c <= PC; c++) {
      g.moveTo(c * PW, 0);
      g.lineTo(c * PW, IH);
    }
    for (let r = 0; r <= PR; r++) {
      g.moveTo(0, r * PW);
      g.lineTo(IW, r * PW);
    }
    g.stroke();
    g.fillStyle = `rgba(62,155,255,${0.14 * Lay.grid})`;
    g.fillRect(x0, y0, PW, PW);
    g.strokeStyle = `rgba(94,170,255,${Lay.grid})`;
    g.lineWidth = 3 / s;
    g.strokeRect(x0, y0, PW, PW);
  }
  // focus on one patch
  if (z > 0.02) {
    g.fillStyle = `rgba(4,7,13,${0.74 * z})`;
    g.beginPath();
    g.rect(-IW, -IH, IW * 3, IH * 3);
    g.rect(x0, y0, PW, PW);
    g.fill('evenodd');
    g.strokeStyle = `rgba(94,170,255,${z})`;
    g.lineWidth = 2 / s;
    g.strokeRect(x0, y0, PW, PW);
  }
  // training: the guess improves with every epoch
  const ep = epochNow();
  if (f === 2) {
    const a = 1 - Math.exp((-3.4 * ep) / EPOCHS),
      wob = 0.5 + 0.5 * Math.sin(stageT * 3);
    const cv2 = paintPatch((k, x, y) => {
      const tgt = PRED.P[k],
        noise = clamp(NZ[k] * 0.55 + 0.1 + 0.06 * wob * Math.sin(k), 0, 1) * (1 - a * 0.6) * 0.55;
      return heat(clamp(a * tgt + (1 - a) * noise, 0, 1));
    });
    g.imageSmoothingEnabled = true;
    g.globalAlpha = 0.95;
    g.drawImage(cv2, x0, y0, PW, PW);
    g.globalAlpha = 1;
  }
  if (f === 3) {
    const reveal = clamp(u / 0.45, 0, 1),
      th = u > 0.5 ? 0.5 : 0.5;
    const hv = paintPatch((k, x, y) => (x / PCELLS <= reveal ? heat(PRED.P[k]) : null));
    g.imageSmoothingEnabled = true;
    g.globalAlpha = 1 - eio((u - 0.5) * 3) * 0.85;
    g.drawImage(hv, x0, y0, PW, PW);
    g.globalAlpha = 1;
    if (u > 0.5) {
      const mv2 = paintPatch((k) => (PRED.P[k] > th ? [255, 255, 255, 235] : null));
      g.imageSmoothingEnabled = false;
      g.globalAlpha = eio((u - 0.5) * 3);
      g.drawImage(mv2, x0, y0, PW, PW);
      g.globalAlpha = 1;
    }
  }
  if (Lay.cmp > 0.02) {
    g.globalAlpha = Lay.cmp;
    g.imageSmoothingEnabled = false;
    g.drawImage(cmpCanvas(), 0, 0, IW, IH);
    g.globalAlpha = 1;
  }
  if (Lay.out > 0.02) {
    g.fillStyle = `rgba(0,0,0,${0.35 * Lay.out})`;
    g.fillRect(0, 0, IW, IH);
    const t = clamp(u * 1.6, 0, 1),
      m2 = clamp(t * 2 - 1, 0, 1);
    g.globalAlpha = Lay.out * (1 - m2 * 0.6);
    g.imageSmoothingEnabled = false;
    g.drawImage(maskCanvas(), 0, 0, IW, IH);
    g.globalAlpha = Lay.out;
    g.lineJoin = 'round';
    for (const c of PRED.comps) {
      g.beginPath();
      c.poly.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      g.closePath();
      g.fillStyle = `rgba(255,77,90,${0.16 * m2})`;
      g.fill();
      g.strokeStyle = `rgba(255,120,128,${m2})`;
      g.lineWidth = 2.2 / s;
      g.stroke();
    }
    g.globalAlpha = 1;
  }
  g.restore();
  // screen-space: augmentation tween + filmstrips
  const [sx0, sy0] = toS(x0, y0),
    ps = PW * s;
  if (f === 1 && z > 0.5) {
    const n = AUGS.length,
      v = Math.min(n - 1, Math.floor(u * n)),
      local = u * n - v,
      tw = clamp(local / 0.55, 0, 1);
    g.save();
    g.globalAlpha = 1;
    drawVariant(g, v, sx0, sy0, ps, tw, 'both');
    g.restore();
    pill(sx0 + 12, sy0 + 12, AUGS[v], '#ffb547', 1);
    const th = Math.min(104, (AREA.h - 40) / n - 10),
      fx = sx0 + ps + 28;
    for (let i = 0; i < n; i++) {
      const done = i < v || (i === v && tw >= 1),
        cur = i === v;
      const y = AREA.y + 14 + i * (th + 10);
      g.save();
      g.globalAlpha = done ? 1 : cur ? 0.55 : 0.22;
      drawVariant(g, i, fx, y, th, done || cur ? (cur && !done ? tw : 1) : 0, 'both');
      g.restore();
      g.fillStyle = '#b4c2db';
      g.font = '500 12px ' + FONT;
      g.textBaseline = 'middle';
      g.fillText(AUGS[i], fx + th + 12, y + th / 2);
    }
  }
  if (f === 2 && z > 0.5) {
    const th = 78,
      fx = sx0 + ps + 24,
      n = 3;
    g.fillStyle = '#8fa0bd';
    g.font = '500 12px ' + FONT;
    g.textBaseline = 'middle';
    g.fillText('Next batch', fx, AREA.y + 22);
    for (let i = 0; i < n; i++) {
      const v = (Math.floor(stageT * 2.2) + i * 2) % 4;
      drawVariant(g, v, fx, AREA.y + 40 + i * (th + 10), th, 1, 'both');
    }
    pill(sx0 + 12, sy0 + 12, `Epoch ${Math.round(ep)} of ${EPOCHS}`, '#ffb547', 1);
    const [lx, ly] = [sx0 + 12, sy0 + ps - 38];
    pill(lx, ly, `Loss ${LOSS[Math.round(ep)].tr.toFixed(2)}`, '#ff8aa0', 1);
  }
  if (f === 3 && z > 0.5)
    pill(
      sx0 + 12,
      sy0 + 12,
      u < 0.5 ? 'Likelihood per pixel' : 'Threshold 0.50 → mask',
      '#ff8a3d',
      1,
    );
  if (f === 0) {
    if (u < 0.5) pill(AREA.x + 14, AREA.y + 14, '3 bands · red, green, blue', '#5ee0ff', 1);
    else {
      const [lx, ly] = toS(x0 + 8, y0 + 8);
      pill(lx, ly, `Patch ${CITY.best + 1} of ${PC * PR} · 256 × 256`, '#3e9bff', Lay.grid);
    }
  }
  if (f === 4 && Lay.cmp > 0.4)
    for (let p = 0; p < PC * PR; p++) {
      const [px0, py0] = pr(p),
        [lx, ly] = toS(px0 + 10, py0 + 10);
      pill(
        lx,
        ly,
        PRED.ious[p].toFixed(2),
        PRED.ious[p] > 0.6 ? '#34d399' : PRED.ious[p] > 0.35 ? '#ffb547' : '#ff5d6c',
        Lay.cmp,
      );
    }
  if (f === 5 && Lay.out > 0.4)
    pill(AREA.x + 14, AREA.y + 14, `${PRED.comps.length} buildings outlined`, '#ff7a86', Lay.out);
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
function thumb(x, y, s) {
  const [sx, sy] = pr(CITY.best);
  gm.save();
  gm.beginPath();
  gm.roundRect(x, y, s, s, 8);
  gm.clip();
  gm.drawImage(imgC, sx, sy, PW, PW, x, y, s, s);
  gm.restore();
  gm.strokeStyle = 'rgba(255,255,255,.12)';
  gm.beginPath();
  gm.roundRect(x, y, s, s, 8);
  gm.stroke();
}
const TG = document.createElement('canvas');
TG.width = TG.height = 64;
function gray(x, y, s, ch) {
  const [sx, sy] = pr(CITY.best),
    cg = TG.getContext('2d');
  cg.drawImage(imgC, sx, sy, PW, PW, 0, 0, 64, 64);
  const d = cg.getImageData(0, 0, 64, 64);
  for (let i = 0; i < 4096; i++) {
    const v = d.data[i * 4 + ch];
    d.data[i * 4] = ch === 0 ? v : v * 0.15;
    d.data[i * 4 + 1] = ch === 1 ? v : v * 0.15;
    d.data[i * 4 + 2] = ch === 2 ? v : v * 0.15;
  }
  cg.putImageData(d, 0, 0);
  gm.save();
  gm.beginPath();
  gm.roundRect(x, y, s, s, 8);
  gm.clip();
  gm.imageSmoothingEnabled = false;
  gm.drawImage(TG, x, y, s, s);
  gm.restore();
}
function drawArch(net, x0, y0, w, h, t) {
  const cols = { in: '#5ea5ff', enc: '#34d3c9', dec: '#a78bfa', out: '#ff7a86', neck: '#ffb547' };
  const blocks = [],
    skip = [],
    arcs = [];
  const mid = y0 + h / 2;
  const B = (u, hh, c) => blocks.push({ x: x0 + u * w, hh: hh * h, c });
  if (net === 2 || net === 3 || net === 1) {
    const E = [0.86, 0.66, 0.48, 0.34];
    B(0.02, 0.5, cols.in);
    E.forEach((e, i) => B(0.12 + i * 0.1, e, cols.enc));
    B(0.52, 0.22, cols.neck);
    [...E].reverse().forEach((e, i) => B(0.62 + i * 0.1, e, cols.dec));
    B(0.98, 0.5, cols.out);
    if (net === 2) for (let i = 0; i < 4; i++) skip.push([1 + i, 9 - i]);
    if (net === 1) for (let i = 0; i < 4; i++) arcs.push([1 + i, 9 - i, 'idx']);
    if (net === 3) {
      for (let i = 0; i < 4; i++) skip.push([1 + i, 9 - i]);
      for (let i = 1; i < 10; i++) if (i !== 5) arcs.push([i, i, 'res']);
    }
  } else if (net === 0) {
    B(0.02, 0.5, cols.in);
    [0.86, 0.7, 0.55, 0.42, 0.3].forEach((e, i) => B(0.1 + i * 0.1, e, cols.enc));
    B(0.62, 0.18, cols.neck);
    B(0.74, 0.4, cols.dec);
    B(0.86, 0.66, cols.dec);
    B(0.98, 0.5, cols.out);
    arcs.push([4, 8, 'fuse'], [3, 7, 'fuse']);
  } else {
    B(0.02, 0.5, cols.in);
    [0.84, 0.64, 0.48].forEach((e, i) => B(0.1 + i * 0.09, e, cols.enc));
    B(0.4, 0.4, cols.neck);
    [1, 2, 3, 6].forEach((b, i) =>
      blocks.push({
        x: x0 + 0.52 * w,
        hh: h * 0.15,
        c: cols.neck,
        bin: b,
        yy: y0 + h * (0.18 + i * 0.2),
        pyr: true,
      }),
    );
    B(0.78, 0.42, cols.dec);
    B(0.98, 0.5, cols.out);
  }
  const main = blocks.filter((b) => !b.pyr),
    n = main.length,
    active = t * (n + 2),
    bw = Math.max(10, w * 0.045);
  gm.lineWidth = 1.4;
  gm.strokeStyle = 'rgba(255,255,255,.2)';
  gm.beginPath();
  for (let i = 0; i < n - 1; i++) {
    gm.moveTo(main[i].x + bw / 2, mid);
    gm.lineTo(main[i + 1].x - bw / 2, mid);
  }
  gm.stroke();
  for (const [a, b] of skip) {
    gm.strokeStyle = 'rgba(255,181,71,.55)';
    gm.setLineDash([4, 4]);
    gm.beginPath();
    gm.moveTo(main[a].x, mid - main[a].hh / 2 - 3);
    gm.bezierCurveTo(
      main[a].x,
      mid - h * 0.5,
      main[b].x,
      mid - h * 0.5,
      main[b].x,
      mid - main[b].hh / 2 - 3,
    );
    gm.stroke();
    gm.setLineDash([]);
  }
  for (const [a, b, ty] of arcs) {
    if (ty === 'res') {
      gm.strokeStyle = 'rgba(167,139,250,.55)';
      gm.beginPath();
      gm.arc(main[a].x, mid - main[a].hh / 2 - 2, bw * 0.9, Math.PI, 0);
      gm.stroke();
    } else {
      gm.strokeStyle = ty === 'idx' ? 'rgba(94,224,255,.55)' : 'rgba(255,181,71,.6)';
      gm.setLineDash([3, 4]);
      gm.beginPath();
      gm.moveTo(main[a].x, mid + main[a].hh / 2 + 3);
      gm.bezierCurveTo(
        main[a].x,
        mid + h * 0.52,
        main[b].x,
        mid + h * 0.52,
        main[b].x,
        mid + main[b].hh / 2 + 3,
      );
      gm.stroke();
      gm.setLineDash([]);
    }
  }
  if (net === 4)
    for (const b of blocks.filter((b) => b.pyr)) {
      gm.strokeStyle = 'rgba(255,255,255,.18)';
      gm.beginPath();
      gm.moveTo(main[3].x + bw / 2, mid);
      gm.lineTo(b.x - bw * 0.6, b.yy + b.hh / 2);
      gm.lineTo(b.x + bw * 0.6, b.yy + b.hh / 2);
      gm.lineTo(main[4].x - bw / 2, mid);
      gm.stroke();
      const sz = Math.min(b.hh * 0.9, 18);
      gm.strokeStyle = 'rgba(255,181,71,.8)';
      gm.strokeRect(b.x - sz / 2, b.yy + b.hh / 2 - sz / 2, sz, sz);
    }
  main.forEach((b, i) => {
    const on = clamp(active - i, 0, 1),
      glow = Math.exp(-Math.abs(active - i - 0.3) * 1.2);
    gm.globalAlpha = 0.35 + 0.65 * on;
    gm.fillStyle = b.c;
    gm.beginPath();
    gm.roundRect(b.x - bw / 2, mid - b.hh / 2, bw, b.hh, 4);
    gm.fill();
    gm.globalAlpha = 1;
    if (glow > 0.3) {
      gm.strokeStyle = `rgba(255,255,255,${glow * 0.8})`;
      gm.lineWidth = 1.5;
      gm.beginPath();
      gm.roundRect(b.x - bw / 2 - 2, mid - b.hh / 2 - 2, bw + 4, b.hh + 4, 6);
      gm.stroke();
    }
  });
  const dot = clamp(active / (n + 1), 0, 1),
    idx = dot * (n - 1),
    i0 = Math.floor(idx),
    i1 = Math.min(n - 1, i0 + 1);
  gm.fillStyle = '#fff';
  gm.beginPath();
  gm.arc(lerp(main[i0].x, main[i1].x, idx - i0), mid, 3.6, 0, TAU);
  gm.fill();
  mt('Patch', main[0].x, y0 + h + 9, '#8fa0bd', 10.5, 'center');
  mt('Mask', main[n - 1].x, y0 + h + 9, '#8fa0bd', 10.5, 'center');
}
function drawMini(f, now) {
  if (!mW || !mH) return;
  gm.setTransform(DPR, 0, 0, DPR, 0, 0);
  gm.clearRect(0, 0, mW, mH);
  const s = Math.min(mH - 24, (mW - 40) / 3 - 10),
    tt = now / 1000,
    u = prog();
  if (f === 0) {
    const sz = Math.min(mH - 24, 120);
    [
      ['Red', 0, '#ff8a8a'],
      ['Green', 1, '#8aff9f'],
      ['Blue', 2, '#8ab4ff'],
    ].forEach(([n, ch, c], i) => {
      const x = 8 + i * (sz + 26);
      gray(x, 4, sz, ch);
      mt(n, x + sz / 2, sz + 14, c, 11.5, 'center', 600);
      if (i < 2) mt('+', x + sz + 13, sz / 2 + 4, '#5b6b86', 16, 'center');
    });
    const x = 8 + 3 * (sz + 26) - 8;
    mt('=', x, sz / 2 + 4, '#5b6b86', 16, 'center');
    thumb(x + 14, 4, sz);
    mt('Patch', x + 14 + sz / 2, sz + 14, '#eaf1ff', 11.5, 'center', 600);
    const x2 = x + sz + 40;
    if (mW - x2 > 120) {
      ['Inria', 'ISPRS', 'SpaceNet', 'CrowdAI', 'WHU'].forEach((d, i) =>
        mt(d, x2, 14 + i * 20, '#b4c2db', 12),
      );
      mt('Public datasets', x2, mH - 6, '#5b6b86', 10.5);
    }
    return;
  }
  if (f === 1) {
    const n = AUGS.length,
      v = Math.min(n - 1, Math.floor(u * n)),
      sz = Math.min(mH - 40, 84, (mW - 30) / n / 2 - 12),
      pw = 2 * sz + 34,
      SH = ['Flip', 'Rotate', 'Tone', 'Crop'];
    AUGS.forEach((l, i) => {
      const x = 6 + i * pw,
        on = i === v;
      gm.globalAlpha = on ? 1 : 0.55;
      drawVariant(gm, i, x, 6, sz, 1, 'img');
      drawVariant(gm, i, x + sz + 8, 6, sz, 1, 'mask');
      gm.globalAlpha = 1;
      if (on) {
        gm.strokeStyle = '#ffb547';
        gm.lineWidth = 1.6;
        gm.beginPath();
        gm.roundRect(x - 3, 3, sz * 2 + 14, sz + 6, 10);
        gm.stroke();
      }
      mt(SH[i], x + sz + 4, sz + 22, on ? '#eaf1ff' : '#8fa0bd', 11.5, 'center', on ? 600 : 500);
      mt('image', x + sz / 2, sz + 38, '#5b6b86', 10, 'center');
      mt('label', x + sz + 8 + sz / 2, sz + 38, '#5b6b86', 10, 'center');
    });
    return;
  }
  if (f === 2) {
    const aw = Math.min(mW * 0.46, 340),
      ep = epochNow(),
      e0 = Math.round(ep);
    drawArch(SEL.net, 4, 8, aw, mH - 40, (tt % 3.5) / 3.5);
    mt(NETS[SEL.net], 4 + aw / 2, mH - 6, '#eaf1ff', 12, 'center', 600);
    const cx = aw + 36,
      cw = mW - cx - 38,
      ch = mH - 34,
      base = mH - 22,
      hi = 1;
    gm.strokeStyle = 'rgba(255,255,255,.07)';
    gm.lineWidth = 1;
    for (const v of [0, 0.5, 1]) {
      const y = base - (v / hi) * ch;
      gm.beginPath();
      gm.moveTo(cx, y);
      gm.lineTo(cx + cw, y);
      gm.stroke();
      mt(v.toFixed(1), cx + cw + 6, y, '#5b6b86', 10.5);
    }
    const X = (e) => cx + (e / EPOCHS) * cw,
      Y = (v) => base - (v / hi) * ch;
    for (const [k, col] of [
      ['va', 'rgba(143,160,189,.9)'],
      ['tr', '#ff8aa0'],
    ]) {
      gm.strokeStyle = col;
      gm.lineWidth = 2;
      gm.lineJoin = 'round';
      gm.beginPath();
      for (let e = 0; e <= e0; e++) {
        const x = X(e),
          y = Y(LOSS[e][k]);
        e ? gm.lineTo(x, y) : gm.moveTo(x, y);
      }
      gm.stroke();
    }
    mt('Loss', cx, 10, '#8fa0bd', 11.5);
    mt('Epoch', cx + cw / 2, mH - 6, '#8fa0bd', 10.5, 'center');
    gm.fillStyle = '#ff8aa0';
    gm.fillRect(cx + 44, 6, 8, 8);
    mt('Training', cx + 58, 10, '#8fa0bd', 10.5);
    gm.fillStyle = 'rgba(143,160,189,.9)';
    gm.fillRect(cx + 112, 6, 8, 8);
    mt('Validation', cx + 126, 10, '#8fa0bd', 10.5);
    return;
  }
  if (f === 3) {
    const [sx, sy] = pr(CITY.best),
      x1 = 6,
      x2 = x1 + s + 22,
      x3 = x2 + s + 22,
      cs = s / PCELLS,
      cx0 = (CITY.best % PC) * PCELLS,
      cy0 = Math.floor(CITY.best / PC) * PCELLS,
      tcur = u > 0.5 ? 0.5 : 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(tt * 1.4));
    thumb(x1, 4, s);
    mt('Patch', x1 + s / 2, s + 16, '#b4c2db', 11.5, 'center');
    gm.save();
    gm.beginPath();
    gm.roundRect(x2, 4, s, s, 8);
    gm.clip();
    gm.fillStyle = '#05080f';
    gm.fillRect(x2, 4, s, s);
    for (let y = 0; y < PCELLS; y++)
      for (let x = 0; x < PCELLS; x++) {
        const v = PRED.P[(cy0 + y) * GW + cx0 + x];
        if (v < 0.05) continue;
        gm.fillStyle = `rgba(255,${130 + 90 * (1 - v)},50,${v})`;
        gm.fillRect(x2 + x * cs, 4 + y * cs, cs + 0.6, cs + 0.6);
      }
    gm.restore();
    gm.strokeStyle = 'rgba(255,255,255,.12)';
    gm.beginPath();
    gm.roundRect(x2, 4, s, s, 8);
    gm.stroke();
    mt('Likelihood', x2 + s / 2, s + 16, '#b4c2db', 11.5, 'center');
    gm.save();
    gm.beginPath();
    gm.roundRect(x3, 4, s, s, 8);
    gm.clip();
    gm.fillStyle = '#05080f';
    gm.fillRect(x3, 4, s, s);
    for (let y = 0; y < PCELLS; y++)
      for (let x = 0; x < PCELLS; x++)
        if (PRED.P[(cy0 + y) * GW + cx0 + x] > tcur) {
          gm.fillStyle = '#eaf1ff';
          gm.fillRect(x3 + x * cs, 4 + y * cs, cs + 0.6, cs + 0.6);
        }
    gm.restore();
    gm.strokeStyle = 'rgba(255,255,255,.12)';
    gm.beginPath();
    gm.roundRect(x3, 4, s, s, 8);
    gm.stroke();
    mt('Mask', x3 + s / 2, s + 16, '#b4c2db', 11.5, 'center');
    const x4 = x3 + s + 22;
    if (mW - x4 > 90) {
      mt('Threshold', x4, 20, '#8fa0bd', 11.5);
      mt(tcur.toFixed(2), x4, 44, '#ffb547', 22, 'left', 600);
    }
    return;
  }
  if (f === 4) {
    const A = RES.no,
      B = RES.aug,
      x0 = 8,
      bw = (mW - 150) / 5,
      base = mH - 24,
      hh = mH - 52;
    gm.strokeStyle = 'rgba(255,255,255,.07)';
    gm.lineWidth = 1;
    for (const v of [0, 0.5, 1]) {
      gm.beginPath();
      gm.moveTo(x0, base - v * hh);
      gm.lineTo(x0 + bw * 5, base - v * hh);
      gm.stroke();
      mt(v.toFixed(1), x0 + bw * 5 + 6, base - v * hh, '#5b6b86', 10.5);
    }
    NETS.forEach((n, i) => {
      const cx = x0 + i * bw + bw / 2,
        on = i === SEL.net;
      for (const [k, v, col] of [
        [0, A[i], 'rgba(143,160,189,.55)'],
        [1, B[i], on ? '#3e9bff' : 'rgba(62,155,255,.55)'],
      ]) {
        const hgt = v * hh * clamp(tt % 6 < 0.6 ? (tt % 6) / 0.6 : 1, 0, 1),
          bx = cx - bw * 0.3 + k * bw * 0.32;
        gm.fillStyle = col;
        gm.beginPath();
        gm.roundRect(bx, base - hgt, bw * 0.28, hgt, 3);
        gm.fill();
        if (on && k === (SEL.aug ? 1 : 0))
          mt(v.toFixed(2), bx + bw * 0.14, base - hgt - 9, '#eaf1ff', 11.5, 'center', 600);
      }
      mt(n, cx, base + 12, on ? '#eaf1ff' : '#8fa0bd', 10.5, 'center', on ? 600 : 500);
    });
    mt('Austin', mW - 8, 18, '#eaf1ff', 14, 'right', 600);
    gm.fillStyle = 'rgba(143,160,189,.7)';
    gm.fillRect(mW - 118, 34, 8, 8);
    mt('Without', mW - 104, 38, '#8fa0bd', 11);
    gm.fillStyle = '#3e9bff';
    gm.fillRect(mW - 118, 52, 8, 8);
    mt('With augmentation', mW - 104, 56, '#8fa0bd', 11);
    return;
  }
  if (f === 5) {
    const c = PRED.comps,
      [sx, sy] = pr(CITY.best),
      x1 = 6,
      x2 = x1 + s + 40,
      cs = s / PW;
    thumb(x1, 4, s);
    gm.save();
    gm.beginPath();
    gm.roundRect(x1, 4, s, s, 8);
    gm.clip();
    gm.fillStyle = 'rgba(255,255,255,.4)';
    const cx0 = (CITY.best % PC) * PCELLS,
      cy0 = Math.floor(CITY.best / PC) * PCELLS;
    for (let y = 0; y < PCELLS; y++)
      for (let x = 0; x < PCELLS; x++)
        if (PRED.M[(cy0 + y) * GW + cx0 + x])
          gm.fillRect(
            x1 + (x * s) / PCELLS,
            4 + (y * s) / PCELLS,
            s / PCELLS + 0.5,
            s / PCELLS + 0.5,
          );
    gm.restore();
    mt('Mask', x1 + s / 2, s + 16, '#b4c2db', 11.5, 'center');
    mt('→', x1 + s + 20, s / 2 + 4, '#5b6b86', 18, 'center');
    thumb(x2, 4, s);
    gm.save();
    gm.beginPath();
    gm.roundRect(x2, 4, s, s, 8);
    gm.clip();
    for (const q of c) {
      gm.beginPath();
      q.poly.forEach((pt, i) => {
        const X = x2 + (pt[0] - sx) * cs,
          Y = 4 + (pt[1] - sy) * cs;
        i ? gm.lineTo(X, Y) : gm.moveTo(X, Y);
      });
      gm.closePath();
      gm.fillStyle = 'rgba(255,77,90,.2)';
      gm.fill();
      gm.strokeStyle = '#ff7a86';
      gm.lineWidth = 1.6;
      gm.stroke();
    }
    gm.restore();
    mt('Outlines', x2 + s / 2, s + 16, '#b4c2db', 11.5, 'center');
    const x3 = x2 + s + 30;
    if (mW - x3 > 90) {
      mt(String(c.length), x3, 24, '#eaf1ff', 30, 'left', 600);
      mt('buildings in the image', x3, 50, '#8fa0bd', 11.5);
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
  stageT = 0;
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
const cycleNet = () => {
    SEL.net = (SEL.net + 1) % 5;
    predict();
  },
  cycleAug = () => {
    SEL.aug = !SEL.aug;
    predict();
  };
$('t-net').onclick = cycleNet;
$('t-aug').onclick = cycleAug;
addEventListener('keydown', (e) => {
  if (e.key >= '1' && e.key <= '6') pin(+e.key - 1);
  else if (e.key === 'Escape') {
    ST.pin = -1;
    shown = -1;
  } else if (e.key === ' ') {
    ST.paused = !ST.paused;
    e.preventDefault();
  } else if (e.key === 'n') cycleNet();
  else if (e.key === 'a') cycleAug();
});
const tile = (id, text, hot) => {
  const el = $(id);
  el.querySelector('.s').textContent = text;
  el.classList.toggle('hot', !!hot);
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
  const rep = RES[SEL.aug ? 'aug' : 'no'][SEL.net],
    area = PRED.area * 100,
    ep = Math.round(epochNow()),
    u = prog();
  const M = [
    [
      ['Bands', 'RGB'],
      ['Patch', '256 px'],
      ['Patches', PC * PR],
    ],
    [
      ['Augmentations', AUGS.length],
      ['Labels', 'move too'],
      ['Now', AUGS[Math.min(AUGS.length - 1, Math.floor(u * AUGS.length))].split(' ')[0]],
    ],
    [
      ['Epoch', ep + ' / ' + EPOCHS],
      ['Loss', LOSS[ep].tr.toFixed(2)],
      ['Network', NETS[SEL.net]],
    ],
    [
      ['Threshold', '0.50'],
      ['Predicted', PRED.comps.length],
      ['Area', area.toFixed(0) + '%'],
    ],
    [
      ['This image', PRED.iou.toFixed(2)],
      ['Reported', rep.toFixed(2)],
      ['Network', NETS[SEL.net]],
    ],
    [
      ['Buildings', PRED.comps.length],
      ['Area', area.toFixed(0) + '%'],
      ['Outlines', 'regularised'],
    ],
  ][f];
  $('dMetrics').innerHTML = M.map(([l, v]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
  const sc = $('dScore'),
    lab = $('mainLab');
  if (f === 2) {
    lab.textContent = 'Training loss';
    sc.textContent = LOSS[ep].tr.toFixed(2);
    sc.className = 'big ' + (LOSS[ep].tr < 0.25 ? 'ok' : LOSS[ep].tr < 0.5 ? 'warn' : 'bad');
  } else if (f < 2) {
    lab.textContent = 'Score on this image';
    sc.textContent = '—';
    sc.className = 'big';
  } else {
    lab.textContent = 'Score on this image';
    sc.textContent = PRED.iou.toFixed(2);
    sc.className = 'big ' + (PRED.iou > 0.65 ? 'ok' : PRED.iou > 0.4 ? 'warn' : 'bad');
  }
  $('dCnt').textContent = f >= 3 ? PRED.comps.length : '—';
  $('dArea').textContent = f >= 3 ? area.toFixed(0) + '%' : '—';
  $('dPatch').textContent = CITY.best + 1 + ' / ' + PC * PR;
  tile('t-net', NETS[SEL.net], f === 2 || f === 4);
  tile('t-aug', SEL.aug ? 'On' : 'Off', f === 1 || f === 4);
  tile('t-rep', rep.toFixed(2) + ' · ' + NETS[SEL.net], f === 4);
  tile('t-patch', '256 × 256 px', f === 0);
  tile('t-band', '3 bands · RGB', f === 0);
  tile('t-reg', 'Austin', false);
  const el = $('stat');
  el.className = f === 4 ? (PRED.iou > 0.6 ? 'ok' : 'warn') : '';
  el.textContent =
    f === 2
      ? `Training · epoch ${ep} of ${EPOCHS}`
      : f === 4
        ? `${NETS[SEL.net]} · ${PRED.iou.toFixed(2)}`
        : TITLE[f];
}

/* ---------- loop ---------- */
resize();
rebuild();

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!ST.paused) {
    stageT += dt;
    if (ST.pin < 0) {
      ST.ft += dt;
      if (ST.ft > DWELL[ST.f]) {
        ST.ft = 0;
        ST.f = (ST.f + 1) % 6;
        stageT = 0;
      }
    }
  }
  updateView(dt);
  updateLayers(dt);
  drawScene();
  drawMini(focus(), now);
  ui(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* Test hooks, only with ?debug in the address. */
if (new URLSearchParams(location.search).has('debug')) {
  window.__dbg = () => ({
    b: CITY.b.length,
    comps: PRED.comps.length,
    iou: PRED.iou,
    best: CITY.best,
    view: VIEW,
  });
}
