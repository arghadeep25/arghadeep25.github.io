import { buildKdTree, nearest } from '../algos/kdtree.js';
import { $, FONT, TAU, clamp, comp, gauss, hash, lerp, relp, wrapA } from './common.js';

/* ---------- canvases ---------- */
const cv = $('scene'),
  g = cv.getContext('2d'),
  mv = $('mini'),
  gm = mv.getContext('2d');
let W,
  H,
  DPR,
  mW,
  mH,
  K = 3,
  MX = [1, 0, 0, 1, 0, 0],
  ROT = false;
const dockH = () => (W < 800 ? 200 : 206) + (W < 800 ? 12 : 18);

/* ---------- route: one closed loop ---------- */
const DS = 0.5,
  RX = [],
  RY = [],
  RH = [];
let RN = 0,
  RL = 0,
  VPROF = null,
  BB;
(function () {
  const f = (t) => [
    100 * Math.cos(t) + 14 * Math.cos(3 * t),
    58 * Math.sin(t) + 10 * Math.sin(2 * t) + 8 * Math.sin(3 * t + 1),
  ];
  const M = 8000,
    p = [],
    cl = [0];
  for (let i = 0; i <= M; i++) p.push(f((i / M) * TAU));
  for (let i = 1; i <= M; i++)
    cl.push(cl[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  RL = cl[M];
  const N = Math.floor(RL / DS);
  let j = 0;
  const X = [],
    Y = [];
  for (let i = 0; i < N; i++) {
    const s = i * DS;
    while (cl[j + 1] < s) j++;
    const u = (s - cl[j]) / (cl[j + 1] - cl[j]);
    X.push(lerp(p[j][0], p[j + 1][0], u));
    Y.push(lerp(p[j][1], p[j + 1][1], u));
  }
  const Hd = X.map((_, i) =>
    Math.atan2(Y[(i + 1) % N] - Y[(i - 1 + N) % N], X[(i + 1) % N] - X[(i - 1 + N) % N]),
  );
  const Kp = Hd.map((_, i) => {
    let s = 0;
    for (let k = -6; k <= 6; k++)
      s += wrapA(Hd[(i + k + 1 + N) % N] - Hd[(i + k - 1 + N) % N]) / (2 * DS);
    return s / 13;
  });
  let best = 0,
    bs = 1e9;
  for (let i = 0; i < N; i += 4) {
    let s = 0;
    for (let k = -80; k <= 80; k += 4) s += Math.abs(Kp[(i + k + N) % N]);
    if (s < bs) {
      bs = s;
      best = i;
    }
  }
  for (let i = 0; i < N; i++) {
    const q = (i + best) % N;
    RX.push(X[q]);
    RY.push(Y[q]);
    RH.push(Hd[q]);
  }
  RN = N;
  RL = N * DS;
  let v = Kp.map((_, i) =>
    clamp(Math.sqrt(2.1 / Math.max(Math.abs(Kp[(i + best) % N]), 1e-3)), 4.2, 10.5),
  );
  for (let r = 0; r < 3; r++) {
    for (let i = 1; i < 2 * N; i++) {
      const a = i % N,
        b = (i - 1) % N;
      v[a] = Math.min(v[a], Math.sqrt(v[b] * v[b] + 2 * 1.3 * DS));
    }
    for (let i = 2 * N; i > 0; i--) {
      const a = (i - 1) % N,
        b = i % N;
      v[a] = Math.min(v[a], Math.sqrt(v[b] * v[b] + 2 * 1.9 * DS));
    }
  }
  VPROF = v;
  let x0 = 1e9,
    x1 = -1e9,
    y0 = 1e9,
    y1 = -1e9;
  for (let i = 0; i < N; i++) {
    x0 = Math.min(x0, RX[i]);
    x1 = Math.max(x1, RX[i]);
    y0 = Math.min(y0, RY[i]);
    y1 = Math.max(y1, RY[i]);
  }
  BB = [x0 - 30, y0 - 30, x1 + 30, y1 + 30];
})();
const truthAt = (s) => {
  const f = (((s / DS) % RN) + RN) % RN,
    i = Math.floor(f),
    u = f - i,
    j = (i + 1) % RN;
  return [lerp(RX[i], RX[j], u), lerp(RY[i], RY[j], u), RH[i] + wrapA(RH[j] - RH[i]) * u];
};
const speedAt = (s) => {
  const f = (((s / DS) % RN) + RN) % RN,
    i = Math.floor(f);
  return VPROF[i];
};

/* ---------- world ---------- */
const WORLD = [];
function rectShape(cx, cy, ang, len, dep, kind, h) {
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
  return { pts, kind, c: [cx, cy], h, r: Math.hypot(len, dep) / 2 };
}
function circShape(cx, cy, r, h) {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return { pts, kind: 1, c: [cx, cy], h, r };
}
function clearOf(cx, cy, r, own) {
  for (let i = 0; i < RN; i += 4) {
    if (Math.min(Math.abs(i - own), RN - Math.abs(i - own)) < 70) continue;
    if ((RX[i] - cx) ** 2 + (RY[i] - cy) ** 2 < (r + 5) ** 2) return false;
  }
  return true;
}
(function () {
  let k = 0;
  for (let i = 0; i < RN; i += 36)
    for (const side of [-1, 1]) {
      k++;
      const nx = -Math.sin(RH[i]),
        ny = Math.cos(RH[i]);
      if (hash(k + 1) < 0.72) {
        const dep = 8 + hash(k + 2) * 7,
          len = 10 + hash(k + 3) * 9,
          off = 11 + dep / 2 + hash(k + 5) * 4,
          jx = (hash(k + 4) - 0.5) * 8;
        const cx = RX[i] + nx * side * off + Math.cos(RH[i]) * jx,
          cy = RY[i] + ny * side * off + Math.sin(RH[i]) * jx;
        if (clearOf(cx, cy, Math.max(len, dep) / 2, i))
          WORLD.push(rectShape(cx, cy, RH[i], len, dep, 0, 9 + hash(k + 6) * 13));
      }
      for (let t = 0; t < 3; t++) {
        if (hash(k * 7 + t + 9) > 0.6) continue;
        const j = (i + t * 12 + Math.floor(hash(k + t) * 6)) % RN,
          off = 6.6 + hash(k + t + 3) * 1.6;
        const cx = RX[j] - Math.sin(RH[j]) * side * off,
          cy = RY[j] + Math.cos(RH[j]) * side * off;
        if (clearOf(cx, cy, 2, j))
          WORLD.push(circShape(cx, cy, 1.1 + hash(k + t + 5) * 0.7, 4 + hash(k + t + 8) * 4));
      }
      if (hash(k + 21) < 0.5) {
        const j = (i + 20) % RN,
          cx = RX[j] - Math.sin(RH[j]) * side * 5.6,
          cy = RY[j] + Math.cos(RH[j]) * side * 5.6;
        WORLD.push(rectShape(cx, cy, 0, 0.45, 0.45, 2, 5));
      }
      if (hash(k + 31) < 0.4) {
        const j = (i + 6) % RN,
          cx = RX[j] - Math.sin(RH[j]) * side * 4.8,
          cy = RY[j] + Math.cos(RH[j]) * side * 4.8;
        WORLD.push(rectShape(cx, cy, RH[j], 4.3, 1.8, 3, 1.6));
      }
    }
  for (const s of WORLD) {
    s.segs = [];
    for (let i = 0; i < s.pts.length; i++) {
      const a = s.pts[i],
        b = s.pts[(i + 1) % s.pts.length];
      s.segs.push([a[0], a[1], b[0], b[1], s.h]);
    }
  }
})();

/* ---------- LiDAR ---------- */
const RANGE = 30,
  NRAY = 360,
  NR = 20,
  NS = 60;
function castScan(pose) {
  const segs = [];
  for (const s of WORLD)
    if ((s.c[0] - pose[0]) ** 2 + (s.c[1] - pose[1]) ** 2 < (RANGE + s.r + 4) ** 2)
      for (const q of s.segs) segs.push(q);
  const hits = [];
  for (let i = 0; i < NRAY; i++) {
    const a = (i / NRAY) * TAU,
      wa = pose[2] + a,
      dx = Math.cos(wa),
      dy = Math.sin(wa);
    let best = RANGE,
      hh = 0;
    for (const s of segs) {
      const ex = s[2] - s[0],
        ey = s[3] - s[1],
        den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const qx = s[0] - pose[0],
        qy = s[1] - pose[1],
        t = (qx * ey - qy * ex) / den,
        u = (qx * dy - qy * dx) / den;
      if (t > 0.5 && t < best && u >= 0 && u <= 1) {
        best = t;
        hh = s[4];
      }
    }
    if (best < RANGE) {
      const r = best + (Math.random() - 0.5) * 0.05;
      hits.push({ x: r * Math.cos(a), y: r * Math.sin(a), h: hh, r, a });
    }
  }
  return hits;
}

/* ---------- feature descriptors + kd-tree ---------- */
function describe(hits) {
  const d = new Float32Array(NR * NS);
  for (const p of hits) {
    const r = Math.min(NR - 1, Math.floor((p.r / RANGE) * NR)),
      s = Math.min(NS - 1, Math.floor((p.a / TAU) * NS));
    d[r * NS + s] = Math.max(d[r * NS + s], p.h);
  }
  const key = new Float32Array(NR);
  for (let r = 0; r < NR; r++) {
    let s = 0;
    for (let c = 0; c < NS; c++) s += d[r * NS + c];
    key[r] = s / NS;
  }
  return { d, key };
}
function scDist(A, B) {
  let best = 9,
    bs = 0;
  for (let sh = 0; sh < NS; sh++) {
    let sum = 0,
      cnt = 0;
    for (let c = 0; c < NS; c++) {
      const c2 = (c + sh) % NS;
      let dot = 0,
        na = 0,
        nb = 0;
      for (let r = 0; r < NR; r++) {
        const a = A[r * NS + c],
          b = B[r * NS + c2];
        dot += a * b;
        na += a * a;
        nb += b * b;
      }
      if (na > 0 && nb > 0) {
        sum += 1 - dot / Math.sqrt(na * nb);
        cnt++;
      }
    }
    const d = cnt > 8 ? sum / cnt : 1;
    if (d < best) {
      best = d;
      bs = sh;
    }
  }
  return { d: best, shift: bs };
}
/* ---------- graph optimiser (planar poses, dense solver) ---------- */
function cholSolve(A, b, n) {
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j <= i; j++) {
      let s = A[i * n + j];
      for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
      if (i === j) L[i * n + i] = Math.sqrt(Math.max(s, 1e-12));
      else L[i * n + j] = s / L[j * n + j];
    }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k];
    y[i] = s / L[i * n + i];
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k];
    x[i] = s / L[i * n + i];
  }
  return x;
}
const SIG = { gps: 5, imu: 0.15, anchor: 0.02, loopXY: 0.1, loopTh: 0.005 };
function resEdge(pi, pj, z) {
  const r = relp(pi, pj);
  return [r[0] - z[0], r[1] - z[1], wrapA(r[2] - z[2])];
}
function solveGraph(nodes, edges, priors, iters) {
  const N = nodes.length,
    n3 = 3 * N;
  let X = nodes.map((n) => n.p.slice());
  const out = [],
    chi = [];
  const evalChi = (Xs) => {
    let c = 0;
    for (const e of edges) {
      const r = resEdge(Xs[e.i], Xs[e.j], e.z);
      for (let k = 0; k < 3; k++) c += e.w[k] * r[k] * r[k];
    }
    for (const p of priors) {
      const x = Xs[p.i];
      if (p.t === 'gps') c += p.w * ((x[0] - p.z[0]) ** 2 + (x[1] - p.z[1]) ** 2);
      else if (p.t === 'imu') c += p.w * wrapA(x[2] - p.z) ** 2;
      else c += p.w * ((x[0] - p.z[0]) ** 2 + (x[1] - p.z[1]) ** 2 + wrapA(x[2] - p.z[2]) ** 2);
    }
    return c;
  };
  chi.push(evalChi(X));
  let lam = 0.6;
  for (let it = 0; it < iters; it++) {
    const Hm = new Float64Array(n3 * n3),
      bv = new Float64Array(n3);
    for (const e of edges) {
      const pi = X[e.i],
        pj = X[e.j],
        r0 = resEdge(pi, pj, e.z),
        J = [[], [], []],
        eps = 1e-6;
      for (let a = 0; a < 6; a++) {
        const qi = pi.slice(),
          qj = pj.slice();
        if (a < 3) qi[a] += eps;
        else qj[a - 3] += eps;
        const r1 = resEdge(qi, qj, e.z);
        for (let k = 0; k < 3; k++) J[k][a] = (r1[k] - r0[k]) / eps;
      }
      const idx = (a) => (a < 3 ? 3 * e.i + a : 3 * e.j + a - 3);
      for (let a = 0; a < 6; a++) {
        let gb = 0;
        for (let k = 0; k < 3; k++) gb += e.w[k] * J[k][a] * r0[k];
        bv[idx(a)] += gb;
        for (let c = 0; c < 6; c++) {
          let s = 0;
          for (let k = 0; k < 3; k++) s += e.w[k] * J[k][a] * J[k][c];
          Hm[idx(a) * n3 + idx(c)] += s;
        }
      }
    }
    for (const p of priors) {
      const x = X[p.i],
        o = 3 * p.i;
      if (p.t === 'gps') {
        Hm[o * n3 + o] += p.w;
        Hm[(o + 1) * n3 + o + 1] += p.w;
        bv[o] += p.w * (x[0] - p.z[0]);
        bv[o + 1] += p.w * (x[1] - p.z[1]);
      } else if (p.t === 'imu') {
        Hm[(o + 2) * n3 + o + 2] += p.w;
        bv[o + 2] += p.w * wrapA(x[2] - p.z);
      } else {
        for (let k = 0; k < 3; k++) {
          Hm[(o + k) * n3 + o + k] += p.w;
          bv[o + k] += p.w * (k < 2 ? x[k] - p.z[k] : wrapA(x[2] - p.z[2]));
        }
      }
    }
    for (let i = 0; i < n3; i++) {
      Hm[i * n3 + i] += lam * (Hm[i * n3 + i] + 1e-6);
      bv[i] = -bv[i];
    }
    const d = cholSolve(Hm, bv, n3);
    let mx = 0;
    X = X.map((x, i) => {
      mx = Math.max(mx, Math.abs(d[3 * i]), Math.abs(d[3 * i + 1]));
      return [x[0] + d[3 * i], x[1] + d[3 * i + 1], x[2] + d[3 * i + 2]];
    });
    out.push(X.map((x) => x.slice()));
    chi.push(evalChi(X));
    lam *= 0.45;
    if (mx < 2e-3) break;
  }
  return { sols: out, chi };
}

/* ---------- state ---------- */
const KF_D = 9,
  KF_A = 0.35,
  KF_T = 4,
  SCAN_DT = 0.2;
let S,
  T = 0;
const ST = { pin: -1, paused: false, mult: 1 };
function reset() {
  const tp = truthAt(0);
  S = {
    t: 0,
    s: 0,
    v: 0,
    tp,
    ph: 0,
    scanT: 0,
    gpsT: 0.5,
    nodes: [],
    edges: [],
    priors: [],
    raw: tp.slice(),
    rel: [0, 0, 0],
    sinceD: 0,
    sinceT: 0,
    od: {
      sc: (Math.random() - 0.5) * 0.004,
      b: (Math.random() < 0.5 ? -1 : 1) * (8e-5 + Math.random() * 4e-5),
    },
    gb: [0, 0],
    ib: 0,
    scan: null,
    prevScan: null,
    regPair: null,
    lastGps: null,
    gpsFix: [],
    loops: [],
    loopSeq: null,
    opt: null,
    lastOpt: null,
    peak: 0,
    lastQ: null,
    tree: null,
    rawPath: [[tp[0], tp[1]]],
    scanLog: [],
    gyro: [],
    lidarLog: [],
    gpsLog: [],
    doneT: 0,
    nPts: 0,
    lastLoopKf: -9,
    flash: 0,
    kfFlash: 0,
    regK: 0,
    scanCount: 0,
  };
  mapPts = 0;
  kdN = -1;
}
let mapPts = 0,
  kdN = -1;
const estPose = () => {
  const n = S.nodes[S.nodes.length - 1];
  return n ? comp(n.d, S.rel) : S.tp.slice();
};
const drift = () => {
  const e = estPose();
  return Math.hypot(e[0] - S.tp[0], e[1] - S.tp[1]);
};

function makeKF(hits) {
  const prev = S.nodes[S.nodes.length - 1],
    p = prev ? comp(prev.p, S.rel) : S.tp.slice(),
    id = S.nodes.length;
  const sc = describe(hits),
    step = 2,
    pts = [];
  for (let i = 0; i < hits.length; i += step) pts.push(hits[i]);
  const n = {
    id,
    p: p.slice(),
    d: p.slice(),
    raw: S.raw.slice(),
    tp: S.tp.slice(),
    pts,
    desc: sc.d,
    key: sc.key,
    t: S.t,
    img: null,
    gps: null,
  };
  S.nodes.push(n);
  mapPts += pts.length;
  if (prev) {
    const dd = Math.hypot(S.rel[0], S.rel[1]),
      sx = 0.05 + 0.003 * dd,
      sth = 0.002 + 0.0003 * dd;
    S.edges.push({
      t: 'odo',
      i: id - 1,
      j: id,
      z: S.rel.slice(),
      w: [1 / sx ** 2, 1 / sx ** 2, 1 / sth ** 2],
    });
  } else S.priors.push({ t: 'anchor', i: 0, z: p.slice(), w: 1 / SIG.anchor ** 2 });
  S.gb[0] = clamp(S.gb[0] + gauss() * 0.7, -4.5, 4.5);
  S.gb[1] = clamp(S.gb[1] + gauss() * 0.7, -4.5, 4.5);
  S.ib = clamp(S.ib + gauss() * 0.004, -0.04, 0.04);
  n.gps = [S.tp[0] + S.gb[0] + gauss() * 1.6, S.tp[1] + S.gb[1] + gauss() * 1.6];
  S.priors.push({ t: 'gps', i: id, z: n.gps, w: 1 / SIG.gps ** 2 });
  S.priors.push({ t: 'imu', i: id, z: S.tp[2] + S.ib + gauss() * 0.02, w: 1 / SIG.imu ** 2 });
  S.rel = [0, 0, 0];
  S.sinceD = 0;
  S.sinceT = 0;
  S.kfFlash = 1;
  detect(n);
  if (id > 2 && id % 6 === 0 && !S.opt) runOpt(3, true);
  return n;
}

const SC_THR = 0.22,
  EXCL = 14;
function detect(n) {
  if (n.id < EXCL + 2) {
    S.lastQ = null;
    return;
  }
  const elig = S.nodes.slice(0, n.id - EXCL);
  if (kdN !== n.id) {
    S.tree = buildKdTree(elig, (it) => it.key);
    kdN = n.id;
  }
  const nn = [];
  nn.push(...nearest(S.tree, n.key, 6).map((h) => ({ it: h.item, d: h.distance })));
  const cands = nn.map((o) => {
    const r = scDist(n.desc, o.it.desc);
    return { id: o.it.id, rk: o.d, d: r.d, shift: r.shift };
  });
  cands.sort((a, b) => a.d - b.d);
  const best = cands[0],
    q = { id: n.id, cands, best, thr: SC_THR, matched: false, ok: null, t: S.t };
  if (best && best.d < SC_THR) {
    q.matched = true;
    const c = S.nodes[best.id],
      dist = Math.hypot(c.tp[0] - n.tp[0], c.tp[1] - n.tp[1]);
    q.ok = dist < 12;
    if (
      q.ok &&
      S.loops.length + (S.loopSeq ? 0 : 0) < 6 &&
      n.id - S.lastLoopKf >= 3 &&
      !(S.loopSeq && !S.loopSeq.applied)
    ) {
      const z = relp(c.tp, n.tp);
      z[0] += gauss() * 0.04;
      z[1] += gauss() * 0.04;
      z[2] += gauss() * 0.002;
      const cand = {
        q: n.id,
        c: best.id,
        z,
        fit: 0.08 + Math.random() * 0.05,
        est0: relp(c.p, n.p),
      };
      if (!S.loopSeq && S.loops.length === 0) {
        S.loopSeq = { t: 0, cand, applied: false };
        S.lastLoopKf = n.id;
      } else if (S.loopSeq && S.loopSeq.applied) {
        addLoop(cand);
        S.lastLoopKf = n.id;
      }
    }
  }
  S.lastQ = q;
}
function addLoop(cand) {
  S.edges.push({
    t: 'loop',
    i: cand.c,
    j: cand.q,
    z: cand.z,
    w: [1 / SIG.loopXY ** 2, 1 / SIG.loopXY ** 2, 1 / SIG.loopTh ** 2],
  });
  S.loops.push(cand);
  S.flash = 1;
  runOpt(9, false);
}
function runOpt(iters, quiet) {
  const r = solveGraph(S.nodes, S.edges, S.priors, iters);
  S.lastOpt = { chi: r.chi, k: 0, quiet };
  if (quiet) {
    applySol(r.sols[r.sols.length - 1]);
    S.lastOpt.k = r.chi.length - 1;
  } else S.opt = { sols: r.sols, k: 0, tn: S.t };
}
function applySol(sol) {
  const L = sol.length,
    old = S.nodes.map((n) => n.p.slice());
  for (let i = 0; i < L; i++) S.nodes[i].p = sol[i].slice();
  for (let j = L; j < S.nodes.length; j++)
    S.nodes[j].p = comp(S.nodes[L - 1].p, relp(old[L - 1], old[j]));
}

/* ---------- simulation step ---------- */
function step(dt) {
  S.t += dt;
  T += dt;
  // truth drive
  const vT = S.ph === 0 ? speedAt(S.s) : 0;
  if (S.ph === 1) {
    S.v = Math.max(0, S.v - 2.2 * dt);
  } else S.v += clamp(vT - S.v, -2 * dt, 1.6 * dt);
  const prevTp = S.tp;
  S.s += S.v * dt;
  S.tp = truthAt(S.s);
  // odometry (relative motion + bias)
  const d = relp(prevTp, S.tp),
    dist = Math.hypot(d[0], d[1]);
  const nr = [
    d[0] * (1 + S.od.sc) + gauss() * 0.002 * Math.sqrt(dt * 60),
    d[1] + gauss() * 0.002 * Math.sqrt(dt * 60),
    d[2] + S.od.b * dist + gauss() * 0.0002 * Math.sqrt(dt * 60),
  ];
  S.rel = comp(S.rel, nr);
  S.raw = comp(S.raw, nr);
  S.sinceD += dist;
  S.sinceT += dt;
  if (
    S.rawPath.length === 0 ||
    Math.hypot(
      S.raw[0] - S.rawPath[S.rawPath.length - 1][0],
      S.raw[1] - S.rawPath[S.rawPath.length - 1][1],
    ) > 1.5
  )
    S.rawPath.push([S.raw[0], S.raw[1]]);
  S.pend = S.pend || [0, 0, 0];
  S.pend = comp(S.pend, nr);
  // imu buffer
  S.gyroT = (S.gyroT || 0) + dt;
  if (S.gyroT > 0.04) {
    S.gyroT = 0;
    S.gyro.push([S.t, d[2] / Math.max(dt, 1e-3) + gauss() * 0.05]);
    if (S.gyro.length > 600) S.gyro.shift();
  }
  // gps fixes
  S.gpsT -= dt;
  if (S.gpsT <= 0) {
    S.gpsT += 1;
    const e = 1.4 + Math.random() * 1.6;
    const f = {
      x: S.tp[0] + S.gb[0] + gauss() * 1.4,
      y: S.tp[1] + S.gb[1] + gauss() * 1.4,
      t: S.t,
      e,
    };
    S.gpsFix.push(f);
    if (S.gpsFix.length > 6) S.gpsFix.shift();
    S.gpsLog.push({ t: S.t, e });
    S.lastGps = f;
  }
  // scans
  S.scanT -= dt;
  if (S.scanT <= 0) {
    S.scanT += SCAN_DT;
    const hits = castScan(S.tp);
    const first = S.nodes.length === 0,
      kfNow = first || S.sinceD >= KF_D || Math.abs(S.rel[2]) >= KF_A || S.sinceT >= KF_T;
    S.prevScan = S.scan;
    const pose0 = estPose();
    S.scanCount++;
    // registration pair: how far we moved between consecutive scans, as the matcher measured it
    S.regPair = { A: S.prevScan ? S.prevScan.hits : null, B: hits, d: S.pend.slice(), t: S.t };
    S.pend = [0, 0, 0];
    S.lidarLog.push({ t: S.t, n: hits.length });
    if (kfNow) {
      const n = makeKF(hits);
      S.scanLog.push({ t: S.t, kf: 1 });
    } else S.scanLog.push({ t: S.t, kf: 0 });
    S.scan = { hits, node: S.nodes[S.nodes.length - 1], rel: S.rel.slice() };
    for (const k of ['scanLog', 'lidarLog'])
      while (S[k].length && S[k][0].t < S.t - 14) S[k].shift();
    while (S.gpsLog.length && S.gpsLog[0].t < S.t - 14) S.gpsLog.shift();
    while (S.gyro.length && S.gyro[0][0] < S.t - 14) S.gyro.shift();
  }
  // optimisation animation
  if (S.opt && S.t >= S.opt.tn) {
    applySol(S.opt.sols[S.opt.k]);
    S.lastOpt.k = S.opt.k + 1;
    S.opt.k++;
    S.opt.tn = S.t + 0.3;
    if (S.opt.k >= S.opt.sols.length) S.opt = null;
  }
  // smooth displayed poses
  const k = 1 - Math.exp(-dt * 6);
  for (const n of S.nodes) {
    n.d[0] += (n.p[0] - n.d[0]) * k;
    n.d[1] += (n.p[1] - n.d[1]) * k;
    n.d[2] += wrapA(n.p[2] - n.d[2]) * k;
  }
  S.flash *= Math.exp(-dt / 0.6);
  S.kfFlash *= Math.exp(-dt / 0.35);
  // loop sequence
  if (S.loopSeq) {
    S.loopSeq.t += dt;
    if (!S.loopSeq.applied && S.loopSeq.t > 6.4) {
      S.loopSeq.applied = true;
      addLoop(S.loopSeq.cand);
    }
    if (S.loopSeq.t > 13.5 && S.ph === 0) S.ph = 1;
  }
  if (S.ph === 1 && S.v < 0.05 && !S.opt) {
    S.ph = 2;
    S.doneT = 0;
  }
  if (S.ph === 2) {
    S.doneT += dt;
    if (S.doneT > 14) reset();
  }
  S.peak = Math.max(S.peak, drift());
}

/* ---------- copy ---------- */
const NAMES = [
  'Sensors',
  'Registration',
  'Keyframes',
  'Feature match',
  'Loop closure',
  'Graph',
  'Map',
];
const TITLE = [
  'Sensor fusion',
  'Scan registration',
  'Keyframe extraction',
  'Feature-based place recognition',
  'Loop closure',
  'Graph optimization',
  'The map',
];
const DESC = [
  'LiDAR sees the surroundings, the IMU senses turning and tilt, and GPS gives a rough position once a second. None of them is good enough alone.',
  'Each new scan is slid onto the previous one until they overlap. How far it had to slide is how far the vehicle moved. Small errors pile up with distance.',
  'Keeping every scan would be wasteful. A scan becomes a keyframe once the vehicle has moved far enough, turned enough, or waited long enough.',
  'Each keyframe is squashed into a compact picture of what stands around it. A KD-tree finds earlier keyframes that look alike, so the vehicle can recognise a place it has been before.',
  'A candidate is checked by registering the two scans. If they line up, the vehicle knows it is back at a known place, and how far it has drifted since.',
  'Keyframes are the nodes. Motion, GPS, IMU and floor readings are links between them. The optimiser moves every node until the links agree as well as they can.',
  'The corrected keyframes are merged into one map. Walls line up and the drift is corrected.',
];
const VLAB = [
  'Sensors · last 12 s',
  'Scan registration · two scans being aligned',
  'Keyframe extraction',
  'Feature-based place recognition · KD-tree search',
  'Loop closure · verifying the candidate',
  'Graph optimization',
  'Odometry only vs. optimised map',
];

/* ---------- layout / camera ---------- */
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
  ROT = W < 800 && H > W * 1.1;
  const bw = BB[2] - BB[0],
    bh = BB[3] - BB[1],
    aw = ROT ? bh : bw,
    ah = ROT ? bw : bh;
  const topPad = W < 800 ? 56 : 90,
    availH = H - dockH() - topPad - 10,
    availW = W - 24;
  K = Math.min(availW / aw, availH / ah) * (W < 800 ? 1 : 0.96);
  const ox = W / 2 - (W < 800 ? 0 : W * 0.02),
    oy = topPad + availH / 2,
    cx0 = (BB[0] + BB[2]) / 2,
    cy0 = (BB[1] + BB[3]) / 2;
  MX = ROT ? [0, K, -K, 0, ox + K * cy0, oy - K * cx0] : [K, 0, 0, K, ox - K * cx0, oy - K * cy0];
}
addEventListener('resize', resize);
const toS = (x, y) => [MX[0] * x + MX[2] * y + MX[4], MX[1] * x + MX[3] * y + MX[5]];

/* ---------- drawing: scene ---------- */
function pill(x, y, text, col, alpha) {
  g.save();
  g.globalAlpha = alpha == null ? 1 : alpha;
  g.font = '500 12px ' + FONT;
  const w = g.measureText(text).width + 28,
    h = 26;
  x = clamp(x, 8, W - w - 8);
  y = clamp(y, 8, H - h - 8);
  g.fillStyle = 'rgba(9,14,25,.88)';
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
const hcol = (h, a) =>
  `hsla(${lerp(215, 38, clamp(h / 18, 0, 1))},90%,${lerp(60, 66, clamp(h / 18, 0, 1))}%,${a})`;
const focus = () => (ST.pin >= 0 ? ST.pin : autoFocus());
function autoFocus() {
  if (S.ph === 2) return 6;
  if (S.loopSeq) {
    const t = S.loopSeq.t;
    return t < 3.2 ? 3 : t < 6.4 ? 4 : 5;
  }
  const t = S.t;
  if (t < 6) return 0;
  if (t < 13) return 1;
  if (t < 21) return 2;
  return Math.floor((t - 21) / 7) % 2 === 0 ? 5 : 3;
}
function drawCar(p, scale) {
  g.save();
  g.translate(p[0], p[1]);
  g.rotate(p[2]);
  g.scale(scale, scale);
  g.fillStyle = '#e8eefc';
  g.beginPath();
  g.roundRect(-2.2, -1, 4.4, 2, 0.5);
  g.fill();
  g.fillStyle = 'rgba(8,14,28,.55)';
  g.fillRect(0.2, -0.8, 0.9, 1.6);
  g.fillRect(-1.5, -0.8, 0.5, 1.6);
  g.restore();
}
let cycles = 0;
function drawScene() {
  const u = 1 / K,
    f = focus(),
    ep = estPose(),
    tp = S.tp;
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  const [sx, sy] = toS(tp[0], tp[1]),
    bg = g.createRadialGradient(sx, sy, 0, sx, sy, Math.max(W, H) * 0.9);
  bg.addColorStop(0, '#0f1b32');
  bg.addColorStop(1, '#04070d');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.setTransform(DPR * MX[0], DPR * MX[1], DPR * MX[2], DPR * MX[3], DPR * MX[4], DPR * MX[5]);
  // real environment
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.beginPath();
  for (let i = 0; i < RN; i += 4) i ? g.lineTo(RX[i], RY[i]) : g.moveTo(RX[i], RY[i]);
  g.closePath();
  g.lineWidth = 7;
  g.strokeStyle = 'rgba(160,185,230,.07)';
  g.stroke();
  g.lineWidth = 6.2;
  g.strokeStyle = 'rgba(15,23,38,.9)';
  g.stroke();
  const reA = f === 6 ? 0.5 : 0.32;
  for (const s of WORLD) {
    g.beginPath();
    if (s.kind === 1) g.arc(s.c[0], s.c[1], s.r, 0, TAU);
    else {
      s.pts.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])));
      g.closePath();
    }
    g.fillStyle = s.kind === 1 ? 'rgba(52,170,125,.10)' : 'rgba(110,140,200,.06)';
    g.fill();
    g.strokeStyle = `rgba(170,190,225,${reA})`;
    g.lineWidth = u * 1.1;
    g.stroke();
  }
  // odometry only
  if (S.rawPath.length > 2) {
    g.beginPath();
    S.rawPath.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.setLineDash([u * 5, u * 4]);
    g.strokeStyle = 'rgba(255,107,125,.75)';
    g.lineWidth = u * 1.6;
    g.stroke();
    g.setLineDash([]);
  }
  // map
  const sz = u * 2.2,
    final = f === 6;
  for (const n of S.nodes) {
    const c = Math.cos(n.d[2]),
      s = Math.sin(n.d[2]);
    if (final) {
      for (const p of n.pts) {
        g.fillStyle = hcol(p.h, 0.9);
        g.fillRect(
          n.d[0] + c * p.x - s * p.y - sz / 2,
          n.d[1] + s * p.x + c * p.y - sz / 2,
          sz,
          sz,
        );
      }
    } else {
      g.fillStyle = 'rgba(125,205,255,.82)';
      for (const p of n.pts)
        g.fillRect(
          n.d[0] + c * p.x - s * p.y - sz / 2,
          n.d[1] + s * p.x + c * p.y - sz / 2,
          sz,
          sz,
        );
    }
  }
  // graph overlay
  const nodes = S.nodes;
  if (f === 5 || f === 4 || f === 2) {
    const ga = f === 5 ? 1 : 0.55;
    g.globalAlpha = ga;
    if (f === 5) {
      for (const pr of S.priors)
        if (pr.t === 'gps') {
          const n = nodes[pr.i];
          if (!n) continue;
          g.strokeStyle = 'rgba(52,211,153,.4)';
          g.lineWidth = u * 1;
          g.beginPath();
          g.moveTo(n.d[0], n.d[1]);
          g.lineTo(pr.z[0], pr.z[1]);
          g.stroke();
          g.fillStyle = '#34d399';
          g.save();
          g.translate(pr.z[0], pr.z[1]);
          g.rotate(Math.PI / 4);
          g.fillRect(-u * 2, -u * 2, u * 4, u * 4);
          g.restore();
        }
    }
    g.strokeStyle = 'rgba(94,165,255,.9)';
    g.lineWidth = u * 1.6;
    g.beginPath();
    nodes.forEach((n, i) => (i ? g.lineTo(n.d[0], n.d[1]) : g.moveTo(n.d[0], n.d[1])));
    g.stroke();
    for (const e of S.edges)
      if (e.t === 'loop') {
        const a = nodes[e.i],
          b = nodes[e.j];
        g.strokeStyle = '#ffb547';
        g.lineWidth = u * (2 + S.flash * 2);
        g.beginPath();
        g.moveTo(a.d[0], a.d[1]);
        g.lineTo(b.d[0], b.d[1]);
        g.stroke();
      }
    for (const n of nodes) {
      g.beginPath();
      g.arc(n.d[0], n.d[1], u * (f === 5 ? 3.6 : 3), 0, TAU);
      g.fillStyle = '#0b1424';
      g.fill();
      g.strokeStyle = '#7fb8ff';
      g.lineWidth = u * 1.4;
      g.stroke();
      if (f === 5) {
        g.beginPath();
        g.arc(n.d[0], n.d[1], u * 6, 0, TAU);
        g.strokeStyle = 'rgba(167,139,250,.45)';
        g.lineWidth = u * 1;
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  } else if (nodes.length > 1) {
    g.strokeStyle = 'rgba(94,165,255,.85)';
    g.lineWidth = u * 1.5;
    g.beginPath();
    nodes.forEach((n, i) => (i ? g.lineTo(n.d[0], n.d[1]) : g.moveTo(n.d[0], n.d[1])));
    g.lineTo(ep[0], ep[1]);
    g.stroke();
  }
  if (f === 2 && nodes.length) {
    const n = nodes[nodes.length - 1];
    g.beginPath();
    g.arc(n.d[0], n.d[1], u * (6 + 14 * S.kfFlash), 0, TAU);
    g.strokeStyle = `rgba(255,181,71,${0.3 + 0.7 * S.kfFlash})`;
    g.lineWidth = u * 2;
    g.stroke();
  }
  // place recognition lines
  if (f === 3 && S.lastQ && nodes[S.lastQ.id]) {
    const q = nodes[S.lastQ.id];
    for (const c of S.lastQ.cands) {
      const n = nodes[c.id];
      const hit = S.lastQ.best === c && S.lastQ.matched;
      g.strokeStyle = hit ? 'rgba(52,211,153,.9)' : 'rgba(143,160,189,.35)';
      g.lineWidth = u * (hit ? 2 : 1);
      g.setLineDash([u * 5, u * 5]);
      g.beginPath();
      g.moveTo(q.d[0], q.d[1]);
      g.lineTo(n.d[0], n.d[1]);
      g.stroke();
      g.setLineDash([]);
      g.beginPath();
      g.arc(n.d[0], n.d[1], u * 4, 0, TAU);
      g.fillStyle = hit ? '#34d399' : 'rgba(143,160,189,.7)';
      g.fill();
    }
  }
  // loop closure highlight
  if (f === 4 && S.loopSeq) {
    const c = S.loopSeq.cand,
      a = nodes[c.c],
      b = nodes[c.q];
    if (a && b) {
      g.strokeStyle = '#ffb547';
      g.lineWidth = u * 2.2;
      g.setLineDash([u * 5, u * 4]);
      g.beginPath();
      g.moveTo(a.d[0], a.d[1]);
      g.lineTo(b.d[0], b.d[1]);
      g.stroke();
      g.setLineDash([]);
      for (const n of [a, b]) {
        g.beginPath();
        g.arc(n.d[0], n.d[1], u * 7, 0, TAU);
        g.strokeStyle = '#ffb547';
        g.lineWidth = u * 1.8;
        g.stroke();
      }
    }
  }
  // current scan
  if (S.scan && S.scan.node && f !== 6) {
    const bp = comp(S.scan.node.d, S.scan.rel),
      c = Math.cos(bp[2]),
      s = Math.sin(bp[2]),
      os = u * 2.8;
    if (f === 0) {
      g.strokeStyle = 'rgba(94,224,255,.2)';
      g.lineWidth = u * 1.2;
      g.beginPath();
      for (let i = 0; i < S.scan.hits.length; i += 2) {
        const p = S.scan.hits[i];
        g.moveTo(bp[0], bp[1]);
        g.lineTo(bp[0] + c * p.x - s * p.y, bp[1] + s * p.x + c * p.y);
      }
      g.stroke();
    }
    if (f === 1 && S.prevScan && S.prevScan.node) {
      const pp = comp(S.prevScan.node.d, S.prevScan.rel),
        c2 = Math.cos(pp[2]),
        s2 = Math.sin(pp[2]);
      g.fillStyle = 'rgba(255,181,71,.9)';
      for (const p of S.prevScan.hits)
        g.fillRect(
          pp[0] + c2 * p.x - s2 * p.y - os / 2,
          pp[1] + s2 * p.x + c2 * p.y - os / 2,
          os,
          os,
        );
    }
    g.fillStyle = f === 1 ? 'rgba(94,224,255,.95)' : 'rgba(150,235,255,.95)';
    for (const p of S.scan.hits)
      g.fillRect(bp[0] + c * p.x - s * p.y - os / 2, bp[1] + s * p.x + c * p.y - os / 2, os, os);
  }
  // gps fixes
  if (f === 0)
    for (const fx of S.gpsFix) {
      const a = clamp(1 - (S.t - fx.t) / 3, 0, 1);
      if (a <= 0) continue;
      g.strokeStyle = `rgba(52,211,153,${0.6 * a})`;
      g.lineWidth = u * 1.2;
      g.beginPath();
      g.arc(fx.x, fx.y, u * 4 + (S.t - fx.t) * u * 10 * 0 + fx.e * 1.0, 0, TAU);
      g.stroke();
      g.fillStyle = `rgba(52,211,153,${a})`;
      g.save();
      g.translate(fx.x, fx.y);
      g.rotate(Math.PI / 4);
      g.fillRect(-u * 3, -u * 3, u * 6, u * 6);
      g.restore();
    }
  // real position + drift line
  g.beginPath();
  g.arc(tp[0], tp[1], u * 6, 0, TAU);
  g.strokeStyle = '#fff';
  g.lineWidth = u * 1.5;
  g.stroke();
  const dr = drift();
  if (dr > 0.6) {
    g.strokeStyle = 'rgba(255,107,125,.8)';
    g.lineWidth = u * 1.5;
    g.setLineDash([u * 3, u * 3]);
    g.beginPath();
    g.moveTo(tp[0], tp[1]);
    g.lineTo(ep[0], ep[1]);
    g.stroke();
    g.setLineDash([]);
  }
  drawCar(ep, 1.7);
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  // labels
  const [ex, ey] = toS(ep[0], ep[1]);
  if (dr > 1.5 && S.ph < 2)
    pill(ex + 18, ey - 40, `Drift ${dr.toFixed(1)} m`, '#ff6b7d', clamp((dr - 1.5) / 1.5, 0, 1));
  if (f === 4 && S.loopSeq && S.loopSeq.t < 6.4) {
    const b = S.nodes[S.loopSeq.cand.c];
    if (b) {
      const [bx, by] = toS(b.d[0], b.d[1]);
      pill(bx + 14, by - 38, 'Known place', '#ffb547', 1);
    }
  }
  if (S.flash > 0.15 && f !== 6)
    pill(
      ex + 18,
      ey + 20,
      `Loop closed · ×${S.loops.length}`,
      '#34d399',
      clamp(S.flash * 1.6, 0, 1),
    );
  if (S.ph === 2 && f === 6) pill(ex + 18, ey - 40, 'Map complete', '#34d399', 1);
}

/* ---------- drawing: dock views ---------- */
const polarCache = new WeakMap();
function descImg(n) {
  if (n.img) return n.img;
  const sz = 120,
    c = document.createElement('canvas');
  c.width = c.height = sz * 2;
  const x = c.getContext('2d');
  x.scale(2, 2);
  const R = sz / 2 - 2,
    cx = sz / 2,
    cy = sz / 2;
  x.fillStyle = 'rgba(255,255,255,.03)';
  x.beginPath();
  x.arc(cx, cy, R, 0, TAU);
  x.fill();
  for (let r = 0; r < NR; r++)
    for (let s = 0; s < NS; s++) {
      const v = n.desc[r * NS + s];
      if (v <= 0) continue;
      const a0 = (s / NS) * TAU - Math.PI / 2,
        a1 = ((s + 1) / NS) * TAU - Math.PI / 2;
      x.beginPath();
      x.arc(cx, cy, ((r + 1) / NR) * R, a0, a1);
      x.arc(cx, cy, (r / NR) * R, a1, a0, true);
      x.closePath();
      x.fillStyle = hcol(v, 0.95);
      x.fill();
    }
  x.strokeStyle = 'rgba(255,255,255,.12)';
  x.lineWidth = 0.8;
  x.beginPath();
  x.arc(cx, cy, R, 0, TAU);
  x.stroke();
  n.img = c;
  return c;
}
function mtext(t, x, y, col, size, align, wgt) {
  gm.fillStyle = col || 'rgba(143,160,189,.9)';
  gm.font = `${wgt || 500} ${size || 11.5}px ${FONT}`;
  gm.textAlign = align || 'left';
  gm.textBaseline = 'middle';
  gm.fillText(t, x, y);
  gm.textAlign = 'left';
}
function drawAlign(A, B, t0, t1, tau, title, a, b) {
  const R = 26,
    k = (mH * 0.5 - 6) / R,
    cx = Math.min(mW * 0.3, mH * 0.5 + 14),
    cy = mH / 2;
  gm.save();
  gm.beginPath();
  gm.arc(cx, cy, mH / 2 - 2, 0, TAU);
  gm.fillStyle = 'rgba(255,255,255,.025)';
  gm.fill();
  gm.strokeStyle = 'rgba(255,255,255,.07)';
  gm.stroke();
  gm.clip();
  const th = lerp(t0[2], t1[2], tau),
    c = Math.cos(th),
    s = Math.sin(th),
    tx = lerp(t0[0], t1[0], tau),
    ty = lerp(t0[1], t1[1], tau);
  gm.fillStyle = 'rgba(255,181,71,.95)';
  for (const p of B) if (p.r < R + 3) gm.fillRect(cx + p.y * k - 1.7, cy - p.x * k - 1.7, 3.4, 3.4);
  const src = [];
  for (const p of A) {
    const X = tx + c * p.x - s * p.y,
      Y = ty + s * p.x + c * p.y;
    src.push([X, Y]);
    if (Math.hypot(X, Y) < R + 3) {
      gm.fillStyle = 'rgba(94,224,255,.95)';
      gm.fillRect(cx + Y * k - 1.7, cy - X * k - 1.7, 3.4, 3.4);
    }
  }
  gm.restore();
  gm.fillStyle = '#e8eefc';
  gm.beginPath();
  gm.roundRect(cx - 3, cy - 5, 6, 10, 2);
  gm.fill();
  // fitness: rms nearest distance
  let sum = 0,
    cnt = 0;
  for (let i = 0; i < src.length; i += 4) {
    let bd = 1e9;
    for (let j = 0; j < B.length; j += 1) {
      const d = (src[i][0] - B[j].x) ** 2 + (src[i][1] - B[j].y) ** 2;
      if (d < bd) bd = d;
    }
    if (bd < 36) {
      sum += bd;
      cnt++;
    }
  }
  const fit = cnt ? Math.sqrt(sum / cnt) : 0,
    x0 = cx + mH / 2 + 22;
  mtext(title, x0, 16, '#eaf1ff', 13, 'left', 600);
  gm.fillStyle = 'rgba(255,181,71,.95)';
  gm.fillRect(x0, 36, 8, 8);
  mtext(a, x0 + 14, 40);
  gm.fillStyle = 'rgba(94,224,255,.95)';
  gm.fillRect(x0, 54, 8, 8);
  mtext(b, x0 + 14, 58);
  return { fit, x0 };
}

let alignCyc = { pair: null, last: 9 };
function easeIt(t) {
  const n = 7,
    x = Math.min(n, t * n);
  return { it: Math.min(n, Math.floor(t * n) + 1), tau: 1 - Math.pow(1 - x / n, 2.2) };
}
function cycle(now, dur) {
  return (now / 1000) % dur;
}
function drawThumb(x0, y0, w, h, key, title, col) {
  const bw = BB[2] - BB[0],
    bh = BB[3] - BB[1],
    kk = Math.min(w / bw, (h - 18) / bh),
    ox = x0 + w / 2 - ((BB[0] + BB[2]) / 2) * kk,
    oy = y0 + 18 + (h - 18) / 2 - ((BB[1] + BB[3]) / 2) * kk;
  mtext(title, x0 + w / 2, y0 + 7, '#b4c2db', 12, 'center', 600);
  gm.strokeStyle = 'rgba(170,190,225,.25)';
  gm.lineWidth = 1;
  gm.beginPath();
  for (let i = 0; i < RN; i += 8) {
    const X = ox + RX[i] * kk,
      Y = oy + RY[i] * kk;
    i ? gm.lineTo(X, Y) : gm.moveTo(X, Y);
  }
  gm.closePath();
  gm.stroke();
  gm.fillStyle = col;
  let err = 0;
  for (const n of S.nodes) {
    const P = n[key],
      c = Math.cos(P[2]),
      sn = Math.sin(P[2]);
    err += Math.hypot(P[0] - n.tp[0], P[1] - n.tp[1]);
    for (let i = 0; i < n.pts.length; i += 1) {
      const p = n.pts[i];
      gm.fillRect(
        ox + (P[0] + c * p.x - sn * p.y) * kk - 0.6,
        oy + (P[1] + sn * p.x + c * p.y) * kk - 0.6,
        1.5,
        1.5,
      );
    }
  }
  return S.nodes.length ? err / S.nodes.length : 0;
}
function drawMini(f, now) {
  if (!mW || !mH) return;
  gm.setTransform(DPR, 0, 0, DPR, 0, 0);
  gm.clearRect(0, 0, mW, mH);
  if (f === 0) {
    const lanes = [
        ['LiDAR', '#5ee0ff'],
        ['IMU', '#a78bfa'],
        ['GPS', '#34d399'],
      ],
      lh = (mH - 6) / 3,
      x0 = 56,
      x1 = mW * 0.7,
      t1 = S.t,
      tw = 12;
    lanes.forEach(([n, col], i) => {
      const y = 3 + i * lh;
      gm.fillStyle = 'rgba(255,255,255,.03)';
      gm.beginPath();
      gm.roundRect(0, y + 2, x1 + 8, lh - 4, 10);
      gm.fill();
      mtext(n, 12, y + lh / 2, '#b4c2db', 12, 'left', 600);
      gm.save();
      gm.beginPath();
      gm.rect(x0, y, x1 - x0, lh);
      gm.clip();
      const X = (t) => x0 + ((t - (t1 - tw)) / tw) * (x1 - x0);
      if (i === 0) {
        gm.fillStyle = col;
        gm.globalAlpha = 0.85;
        for (const l of S.lidarLog) {
          const h = clamp(l.n / 360, 0.15, 1) * (lh - 14);
          gm.fillRect(X(l.t) - 1.5, y + lh / 2 - h / 2, 3, h);
        }
        gm.globalAlpha = 1;
      } else if (i === 1) {
        gm.strokeStyle = col;
        gm.lineWidth = 1.5;
        gm.beginPath();
        S.gyro.forEach((p, j) => {
          const yy = y + lh / 2 - (clamp(p[1], -0.6, 0.6) / 0.6) * (lh / 2 - 8);
          j ? gm.lineTo(X(p[0]), yy) : gm.moveTo(X(p[0]), yy);
        });
        gm.stroke();
      } else {
        for (const p of S.gpsLog) {
          gm.strokeStyle = 'rgba(52,211,153,.5)';
          gm.lineWidth = 1;
          gm.beginPath();
          gm.arc(X(p.t), y + lh / 2, 3 + p.e * 1.8, 0, TAU);
          gm.stroke();
          gm.fillStyle = col;
          gm.beginPath();
          gm.arc(X(p.t), y + lh / 2, 2.6, 0, TAU);
          gm.fill();
        }
      }
      gm.restore();
    });
    const bx = x1 + 26,
      bw = Math.max(70, mW - bx - 4);
    gm.strokeStyle = 'rgba(255,255,255,.18)';
    gm.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      gm.beginPath();
      gm.moveTo(x1 + 12, 3 + i * lh + lh / 2);
      gm.lineTo(bx, mH / 2 + (i - 1) * 14);
      gm.stroke();
    }
    gm.fillStyle = 'rgba(62,155,255,.14)';
    gm.strokeStyle = 'rgba(62,155,255,.5)';
    gm.beginPath();
    gm.roundRect(bx, mH / 2 - 34, bw, 68, 14);
    gm.fill();
    gm.stroke();
    mtext('Fusion', bx + bw / 2, mH / 2 - 8, '#eaf1ff', 13, 'center', 600);
    mtext('one pose estimate', bx + bw / 2, mH / 2 + 10, '#8fa0bd', 11, 'center');
    return;
  }
  if (f === 1) {
    const dur = 3.4,
      cyc = cycle(now, dur);
    if (cyc < alignCyc.last || !alignCyc.pair) {
      if (S.regPair && S.regPair.A) alignCyc.pair = S.regPair;
    }
    alignCyc.last = cyc;
    const pr = alignCyc.pair;
    if (!pr) {
      mtext('Waiting for two scans…', 12, mH / 2);
      return;
    }
    const tt = clamp((cyc - 0.5) / 2.1, 0, 1),
      e = easeIt(tt);
    const o = drawAlign(
      pr.B,
      pr.A,
      [0, 0, 0],
      pr.d,
      tt >= 1 ? 1 : e.tau,
      'Aligning the new scan',
      'Previous scan',
      'New scan',
    );
    S.fit = o.fit;
    mtext(`Iteration ${tt >= 1 ? 7 : e.it} of 7`, o.x0, 84, '#eaf1ff', 12.5, 'left', 550);
    mtext(
      `Mismatch ${(o.fit * 100).toFixed(0)} cm`,
      o.x0,
      104,
      o.fit < 0.35 ? '#34d399' : '#ffcf85',
      12.5,
      'left',
      550,
    );
    mtext(
      `Moved ${Math.hypot(pr.d[0], pr.d[1]).toFixed(1)} m since the last scan`,
      o.x0,
      124,
      '#8fa0bd',
      11.5,
    );
    return;
  }
  if (f === 2) {
    const sinceD = S.sinceD / KF_D,
      sinceA = Math.abs(S.rel[2]) / KF_A,
      sinceT = S.sinceT / KF_T,
      G = [
        ['Distance', sinceD, '#5ee0ff'],
        ['Turn', sinceA, '#a78bfa'],
        ['Time', sinceT, '#ffb547'],
      ];
    const gw = Math.min(130, (mW - 160) / 3.4);
    G.forEach(([n, v, col], i) => {
      const cx = gw / 2 + i * (gw + 6),
        cy = mH / 2 - 8,
        R = Math.min(gw / 2 - 8, mH / 2 - 22);
      const vv = clamp(v, 0, 1);
      gm.lineWidth = 7;
      gm.lineCap = 'round';
      gm.strokeStyle = 'rgba(255,255,255,.08)';
      gm.beginPath();
      gm.arc(cx, cy, R, Math.PI * 0.75, Math.PI * 2.25);
      gm.stroke();
      gm.strokeStyle = vv > 0.98 ? '#ffb547' : col;
      gm.beginPath();
      gm.arc(cx, cy, R, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * vv));
      gm.stroke();
      mtext(n, cx, cy + 2, '#eaf1ff', 12.5, 'center', 600);
      mtext(Math.round(vv * 100) + '%', cx, cy + 18, '#8fa0bd', 11, 'center');
    });
    const x0 = 3 * (gw + 6) + 14,
      w = mW - x0 - 6,
      y0 = 16;
    mtext('Last 12 s', x0, y0, '#8fa0bd', 11.5);
    gm.fillStyle = 'rgba(255,255,255,.03)';
    gm.beginPath();
    gm.roundRect(x0, y0 + 10, w, mH - 40, 10);
    gm.fill();
    const X = (t) => x0 + 10 + ((t - (S.t - 12)) / 12) * (w - 20),
      yb = y0 + 10 + (mH - 40) / 2 + 16;
    for (const q of S.scanLog) {
      gm.fillStyle = q.kf ? '#ffb547' : 'rgba(143,160,189,.55)';
      const h = q.kf ? 40 : 14;
      gm.fillRect(X(q.t) - 1.2, yb - h, 2.4, h);
    }
    mtext('Scan', x0 + 8, mH - 20, '#8fa0bd', 11);
    gm.fillStyle = '#ffb547';
    gm.fillRect(x0 + 52, mH - 25, 8, 8);
    mtext('Keyframe', x0 + 66, mH - 20, '#8fa0bd', 11);
    return;
  }
  if (f === 3) {
    const q = S.lastQ,
      w3 = (mW - 24) / 3,
      sz = Math.min(mH - 8, w3 - 20);
    if (!q) {
      mtext('Building the feature database…', 12, mH / 2 - 8, '#eaf1ff', 13, 'left', 600);
      mtext('Searching starts once enough keyframes exist', 12, mH / 2 + 12);
      const last = S.nodes[S.nodes.length - 1];
      if (last) gm.drawImage(descImg(last), mW - sz - 8, 4, sz, sz);
      return;
    }
    const n = S.nodes[q.id],
      best = q.best,
      bn = best ? S.nodes[best.id] : null;
    gm.drawImage(descImg(n), 0, 2, sz, sz);
    mtext('This place', sz / 2, mH - 6, '#8fa0bd', 11, 'center');
    // ring-key space
    const x0 = w3 + 6,
      ww = w3 - 14,
      hh = mH - 22,
      pr = (k) => [
        k.slice(0, 10).reduce((a, b) => a + b, 0) / 10,
        k.slice(10).reduce((a, b) => a + b, 0) / 10,
      ];
    gm.fillStyle = 'rgba(255,255,255,.03)';
    gm.beginPath();
    gm.roundRect(x0, 2, ww, hh, 10);
    gm.fill();
    const pts = S.nodes
      .slice(0, Math.max(0, q.id - EXCL))
      .map((m) => ({ m, p: pr(Array.from(m.key)) }));
    const qp = pr(Array.from(n.key));
    let mnx = 1e9,
      mxx = -1e9,
      mny = 1e9,
      mxy = -1e9;
    for (const o of pts.concat([{ p: qp }])) {
      mnx = Math.min(mnx, o.p[0]);
      mxx = Math.max(mxx, o.p[0]);
      mny = Math.min(mny, o.p[1]);
      mxy = Math.max(mxy, o.p[1]);
    }
    const PX = (v) => x0 + 12 + ((v - mnx) / Math.max(1e-3, mxx - mnx)) * (ww - 24),
      PY = (v) => 2 + hh - 12 - ((v - mny) / Math.max(1e-3, mxy - mny)) * (hh - 24);
    const near = new Set(q.cands.map((c) => c.id));
    for (const o of pts) {
      gm.fillStyle = near.has(o.m.id) ? 'rgba(255,255,255,.9)' : 'rgba(143,160,189,.45)';
      gm.beginPath();
      gm.arc(PX(o.p[0]), PY(o.p[1]), near.has(o.m.id) ? 3.2 : 2.2, 0, TAU);
      gm.fill();
    }
    for (const c of q.cands) {
      const m = pts.find((o) => o.m.id === c.id);
      if (!m) continue;
      gm.strokeStyle = c === best && q.matched ? 'rgba(52,211,153,.9)' : 'rgba(255,255,255,.3)';
      gm.setLineDash([3, 3]);
      gm.beginPath();
      gm.moveTo(PX(qp[0]), PY(qp[1]));
      gm.lineTo(PX(m.p[0]), PY(m.p[1]));
      gm.stroke();
      gm.setLineDash([]);
    }
    gm.fillStyle = '#ffb547';
    gm.beginPath();
    gm.arc(PX(qp[0]), PY(qp[1]), 4.5, 0, TAU);
    gm.fill();
    mtext('KD-tree: nearest keys', x0 + ww / 2, mH - 6, '#8fa0bd', 11, 'center');
    // candidate
    const x2 = 2 * w3 + 14;
    if (bn) {
      gm.drawImage(descImg(bn), x2, 2, sz, sz);
    }
    mtext('Best candidate', x2 + sz / 2, mH - 6, '#8fa0bd', 11, 'center');
    const bx = x2 + sz + 14,
      bw = mW - bx - 4;
    if (bw > 60 && best) {
      const d = best.d,
        ok = q.matched;
      mtext(ok ? 'Match' : 'No match', bx, 16, ok ? '#34d399' : '#ffcf85', 13.5, 'left', 600);
      mtext('Distance', bx, 40, '#8fa0bd', 11.5);
      gm.fillStyle = 'rgba(255,255,255,.08)';
      gm.beginPath();
      gm.roundRect(bx, 50, bw - 10, 8, 4);
      gm.fill();
      gm.fillStyle = ok ? '#34d399' : '#ffb547';
      gm.beginPath();
      gm.roundRect(bx, 50, (bw - 10) * clamp(d / 0.6, 0.02, 1), 8, 4);
      gm.fill();
      gm.fillStyle = '#fff';
      gm.fillRect(bx + (bw - 10) * (q.thr / 0.6) - 1, 44, 2, 20);
      mtext(d.toFixed(2), bx, 76, '#eaf1ff', 12.5, 'left', 550);
    }
    return;
  }
  if (f === 4) {
    const ls = S.loopSeq;
    if (!ls) {
      mtext('No candidate yet', 12, mH / 2 - 8, '#eaf1ff', 13, 'left', 600);
      mtext('Waiting for the vehicle to come back to a known place', 12, mH / 2 + 12);
      return;
    }
    const dur = 3.4,
      cyc = cycle(now, dur),
      c = ls.cand,
      A = S.nodes[c.q],
      B = S.nodes[c.c];
    if (!A || !B) return;
    const tt = clamp((cyc - 0.5) / 2.1, 0, 1),
      e = easeIt(tt);
    const o = drawAlign(
      A.pts,
      B.pts,
      c.est0,
      c.z,
      tt >= 1 ? 1 : e.tau,
      'Registering the two keyframes',
      'Earlier keyframe',
      'Current keyframe',
    );
    mtext(
      `Mismatch ${(o.fit * 100).toFixed(0)} cm`,
      o.x0,
      84,
      o.fit < 0.3 ? '#34d399' : '#ffcf85',
      12.5,
      'left',
      550,
    );
    mtext(
      `Drift found ${Math.hypot(c.z[0] - c.est0[0], c.z[1] - c.est0[1]).toFixed(1)} m`,
      o.x0,
      104,
      '#ffb547',
      12.5,
      'left',
      550,
    );
    mtext(
      ls.applied || tt >= 1 ? 'Accepted' : 'Verifying…',
      o.x0,
      124,
      ls.applied || tt >= 1 ? '#34d399' : '#8fa0bd',
      12.5,
      'left',
      600,
    );
    return;
  }
  if (f === 5) {
    const lo = S.lastOpt,
      w = mW * 0.52,
      h = mH - 24;
    gm.fillStyle = 'rgba(255,255,255,.03)';
    gm.beginPath();
    gm.roundRect(0, 2, w, mH - 8, 10);
    gm.fill();
    mtext('Error', 12, 16, '#8fa0bd', 11.5);
    if (lo && lo.chi.length > 1) {
      const ch = lo.chi.slice(0, Math.max(2, lo.k + 1)),
        mx = Math.max(lo.chi[0], 10),
        L = (v) => Math.log10(Math.max(v, 1)),
        X = (i) => 16 + (i / (lo.chi.length - 1)) * (w - 32),
        Y = (v) => 26 + (1 - L(v) / L(mx)) * (h - 34);
      gm.strokeStyle = '#3e9bff';
      gm.lineWidth = 2;
      gm.beginPath();
      ch.forEach((v, i) => (i ? gm.lineTo(X(i), Y(v)) : gm.moveTo(X(i), Y(v))));
      gm.stroke();
      const last = ch[ch.length - 1];
      mtext(
        `Step ${Math.min(lo.k, lo.chi.length - 1)} · error down ${Math.round((1 - last / lo.chi[0]) * 100)}%`,
        12,
        mH - 14,
        '#eaf1ff',
        12,
        'left',
        550,
      );
    } else mtext('Waiting for the first optimisation…', 12, mH / 2);
    const x0 = w + 22,
      rows = [
        ['Motion', S.edges.filter((e) => e.t === 'odo').length, '#5ea5ff'],
        ['GPS', S.priors.filter((p) => p.t === 'gps').length, '#34d399'],
        ['IMU', S.priors.filter((p) => p.t === 'imu').length, '#a78bfa'],
        ['Floor', S.nodes.length, '#8fa0bd'],
        ['Loop closure', S.loops.length, '#ffb547'],
      ];
    rows.forEach(([n, v, col], i) => {
      const y = 14 + i * ((mH - 20) / 5);
      gm.fillStyle = col;
      gm.beginPath();
      gm.arc(x0 + 4, y, 4, 0, TAU);
      gm.fill();
      mtext(n, x0 + 16, y, '#b4c2db', 12.5);
      mtext(String(v), mW - 8, y, '#eaf1ff', 12.5, 'right', 600);
    });
    return;
  }
  if (f === 6) {
    const w = (mW - 40) / 2,
      h = mH - 4;
    const e1 = drawThumb(0, 0, w, h, 'raw', 'Odometry only', 'rgba(255,107,125,.9)'),
      e2 = drawThumb(w + 40, 0, w, h, 'p', 'With loop closure', 'rgba(125,205,255,.95)');
    gm.strokeStyle = 'rgba(255,255,255,.2)';
    gm.lineWidth = 1.5;
    gm.beginPath();
    gm.moveTo(w + 12, mH / 2);
    gm.lineTo(w + 28, mH / 2);
    gm.moveTo(w + 23, mH / 2 - 5);
    gm.lineTo(w + 28, mH / 2);
    gm.lineTo(w + 23, mH / 2 + 5);
    gm.stroke();
    mtext(`${e1.toFixed(1)} m`, w - 6, mH - 8, '#ff9aa4', 12.5, 'right', 600);
    mtext(`${e2.toFixed(1)} m`, mW - 6, mH - 8, '#34d399', 12.5, 'right', 600);
  }
}

/* ---------- ui ---------- */
const spd = $('speed'),
  spBtns = [];
[1, 2, 4].forEach((m) => {
  const b = document.createElement('button');
  b.textContent = m + '×';
  b.onclick = () => setMult(m);
  spd.appendChild(b);
  spBtns.push([m, b]);
});
function setMult(m) {
  ST.mult = m;
  spBtns.forEach(([k, b]) => b.classList.toggle('on', k === m));
}
setMult(1);
const rail = $('rail'),
  chips = [];
NAMES.forEach((n, i) => {
  const b = document.createElement('button');
  b.className = 'chip';
  b.innerHTML = n + '<span class="bar"></span>';
  b.onclick = () => {
    ST.pin = ST.pin === i ? -1 : i;
    shown = -1;
  };
  rail.appendChild(b);
  chips.push(b);
});
addEventListener('keydown', (e) => {
  if (e.key >= '1' && e.key <= '7') {
    const i = +e.key - 1;
    ST.pin = ST.pin === i ? -1 : i;
    shown = -1;
  } else if (e.key === 'Escape') {
    ST.pin = -1;
    shown = -1;
  } else if (e.key === '+' || e.key === '=') setMult(Math.min(4, ST.mult * 2));
  else if (e.key === '-') setMult(Math.max(1, ST.mult / 2));
  else if (e.key === ' ') {
    ST.paused = !ST.paused;
    e.preventDefault();
  }
});
const tile = (id, text, hot, stt) => {
  const el = $(id);
  el.querySelector('.s').textContent = text;
  el.classList.toggle('hot', !!hot);
  el.querySelector('i').className = stt || '';
};
let lastUi = 0,
  shown = -1;
function ui(now) {
  const f = focus();
  chips.forEach((c, k) => {
    c.classList.toggle('on', k === f);
    c.classList.toggle('lock', k === ST.pin);
    c.querySelector('.bar').style.transform = 'scaleX(0)';
  });
  if (now - lastUi < 90) return;
  lastUi = now;
  if (shown !== f) {
    shown = f;
    $('dName').textContent = TITLE[f];
    $('dDesc').textContent = DESC[f];
    $('vLab').textContent = VLAB[f];
  }
  const dr = drift(),
    nodes = S.nodes,
    last = nodes[nodes.length - 1],
    q = S.lastQ,
    rp = S.regPair,
    step = rp ? Math.hypot(rp.d[0], rp.d[1]) : 0;
  const gy = S.gyro.length ? (S.gyro[S.gyro.length - 1][1] * 180) / Math.PI : 0,
    ge = S.gpsFix.length ? S.gpsFix[S.gpsFix.length - 1].e : 0;
  const lo = S.lastOpt,
    lastChi = lo ? lo.chi[Math.min(lo.k, lo.chi.length - 1)] : 0;
  const M = [
    [
      ['LiDAR points', S.scan ? S.scan.hits.length : 0],
      ['Turn rate', gy.toFixed(0) + '°/s'],
      ['GPS accuracy', '±' + ge.toFixed(1) + ' m'],
    ],
    [
      ['Step', step.toFixed(1) + ' m'],
      ['Mismatch', ((S.fit || 0.08) * 100).toFixed(0) + ' cm'],
      ['Scans', S.scanCount],
    ],
    [
      ['Keyframes', nodes.length],
      ['Since last', S.sinceD.toFixed(1) + ' m'],
      [
        'Next',
        Math.round(
          clamp(Math.max(S.sinceD / KF_D, Math.abs(S.rel[2]) / KF_A, S.sinceT / KF_T), 0, 1) * 100,
        ) + '%',
      ],
    ],
    [
      ['Searched', Math.max(0, nodes.length - EXCL)],
      ['Best distance', q && q.best ? q.best.d.toFixed(2) : '—'],
      ['Result', q ? (q.matched ? 'Match' : 'No match') : '—'],
    ],
    [
      ['Candidates', S.loopSeq ? 1 : 0],
      [
        'Drift found',
        S.loopSeq
          ? Math.hypot(
              S.loopSeq.cand.z[0] - S.loopSeq.cand.est0[0],
              S.loopSeq.cand.z[1] - S.loopSeq.cand.est0[1],
            ).toFixed(1) + ' m'
          : '—',
      ],
      ['Closures', S.loops.length],
    ],
    [
      ['Nodes', nodes.length],
      ['Links', S.edges.length + S.priors.length],
      [
        'Error',
        lo && lo.chi[0] && lastChi < lo.chi[0] * 0.99
          ? '−' + Math.round((1 - lastChi / lo.chi[0]) * 100) + '%'
          : '—',
      ],
    ],
    [
      ['Keyframes', nodes.length],
      ['Map points', mapPts],
      ['Peak drift', S.peak.toFixed(1) + ' m'],
    ],
  ][f];
  $('dMetrics').innerHTML = M.map(([l, v]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
  const bd = $('dDrift');
  bd.className = 'big ' + (dr > 1.5 ? 'warn' : 'ok');
  bd.innerHTML = dr.toFixed(1) + '<small>m</small>';
  $('dSp').textContent = (S.v * 3.6).toFixed(0) + ' km/h';
  $('dKf').textContent = nodes.length;
  $('dLc').textContent = S.loops.length;
  $('dPts').textContent = mapPts >= 1000 ? (mapPts / 1000).toFixed(1) + 'k' : mapPts;
  tile('t-lid', `10 Hz · ${S.scan ? S.scan.hits.length : 0} pts`, f === 0);
  tile('t-imu', `200 Hz · ${gy.toFixed(0)}°/s`, f === 0);
  tile('t-gps', `1 Hz · ±${ge.toFixed(1)} m`, f === 0 || f === 5, 'a');
  tile('t-reg', `${step.toFixed(1)} m / scan`, f === 1);
  tile(
    't-gra',
    `${nodes.length} nodes · ${S.edges.length + S.priors.length} links`,
    f === 5 || f === 2,
  );
  tile(
    't-loo',
    S.loops.length
      ? `Closed ×${S.loops.length}`
      : q && q.matched
        ? 'Match found'
        : q && q.best
          ? 'Best ' + q.best.d.toFixed(2)
          : 'Searching',
    f === 3 || f === 4,
    S.loops.length ? '' : 'w',
  );
  const el = $('stat');
  let cls = 'info',
    tx = `Mapping · ${(S.v * 3.6).toFixed(0)} km/h · ${nodes.length} keyframes`;
  if (S.ph === 2) {
    cls = '';
    tx = 'Map complete · drift corrected';
  } else if (S.opt) {
    cls = 'info';
    tx = `Optimising the graph · step ${S.opt.k}`;
  } else if (S.loopSeq && !S.loopSeq.applied) {
    cls = 'warn';
    tx = S.loopSeq.t < 3.2 ? 'Place recognised' : 'Verifying the loop';
  } else if (dr > 2) {
    cls = 'warn';
    tx = `Drift growing · ${dr.toFixed(1)} m`;
  }
  el.className = cls;
  el.textContent = tx;
}

/* ---------- loop ---------- */
reset();
resize();
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!ST.paused) {
    let r = dt * ST.mult * 2.5;
    while (r > 1e-6) {
      const d = Math.min(r, 1 / 50);
      step(d);
      r -= d;
    }
  }
  drawScene();
  drawMini(focus(), now);
  ui(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* Test hooks, only with ?debug in the address: fast-forward the simulation and read its state. */
if (new URLSearchParams(location.search).has('debug')) {
  window.__sim = (sec) => {
    for (let t = 0; t < sec; t += 1 / 50) step(1 / 50);
  };
  window.__dbg = () => ({
    t: S.t,
    ph: S.ph,
    nodes: S.nodes.length,
    loops: S.loops.length,
    drift: drift(),
    peak: S.peak,
    s: S.s,
    RL,
  });
}
