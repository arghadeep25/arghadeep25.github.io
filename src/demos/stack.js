import { $, gauss, lerp, TAU } from './common.js';
import { UkfTracker, predictPath } from '../algos/ukf-tracker.js';

(() => {
  'use strict';

  // ---------- stages ----------
  const STAGES = [
    {
      id: 'map',
      name: 'Mapping service',
      color: '#3e9bff',
      desc: 'Builds the map everything else relies on. Scans become keyframes, places are recognised when seen again, and the whole map is pulled back into line.',
    },
    {
      id: 'ego',
      name: 'Localization',
      color: '#bf5af2',
      desc: 'Knows exactly where the vehicle is. Matches each scan against the prebuilt map to produce a precise, continuous pose.',
    },
    {
      id: 'sense',
      name: 'Obstacle Detection',
      color: '#5ac8fa',
      desc: 'Finds obstacles and pedestrians, reads traffic lights and speed-limit signs, and watches a speed-aware safety corridor ahead of the vehicle.',
    },
    {
      id: 'objects',
      name: 'Object Tracking',
      color: '#2dd4bf',
      desc: 'Follows every detected object from scan to scan with a filter of its own, so each keeps its ID, a speed and a heading, and a prediction of where it will be in two seconds.',
    },
    {
      id: 'route',
      name: 'Route Planning',
      color: '#30d158',
      desc: 'Plans the way to the destination, then drives it: a local path around anything in the way, a safe gap to traffic, and a stop for red lights and people crossing.',
    },
    {
      id: 'track',
      name: 'Path Tracking',
      color: '#ffd60a',
      desc: 'Turns the planned trajectory into smooth steering and speed commands, looking further ahead as speed rises.',
    },
    {
      id: 'bridge',
      name: 'Vehicle Interface',
      color: '#ff9f0a',
      desc: 'Carries steering and pedal commands down to the vehicle, and brings gear and state feedback back up.',
    },
    {
      id: 'guardian',
      name: 'Watchdog',
      color: '#ff375f',
      desc: 'Watches every component: that it is alive, on time and healthy. If one fails, it slows the vehicle or brings it to a safe stop.',
    },
  ];
  const COL = (id) => STAGES.find((s) => s.id === id).color;

  // ---------- helpers ----------
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (t) => {
    t = clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  };
  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  };
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const hash = (a, b) => {
    const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  // ---------- world ----------
  const road = (x) => 9 * Math.sin(x / 60) + 3.5 * Math.sin(x / 24 + 1);
  const WB = 2.3,
    LIDAR_FROM_REAR = 1.5,
    VEH_W = 2.0,
    LANE_W = 7.5;
  const BRAKE = 3.0,
    REACT = 0.5;
  // The vehicle keeps to the right-hand lane: half a lane right of the road centre line.
  const LANE_OFF = -LANE_W / 4;

  const car = { x: 0, y: road(0) + LANE_OFF, th: 0.2, v: 7, steer: 0, pedal: 0 };
  let obstacles = [];
  let nextId = 1,
    nextSpawn = 55,
    spawnCount = 0;
  const addObstacle = (x, y, r, manual) =>
    obstacles.push({ id: nextId++, x, y, r, w: 0, manual: !!manual, born: performance.now() });

  function spawnAuto() {
    while (nextSpawn < car.x + 130) {
      let x = nextSpawn;
      while (feats.some((f) => f.type !== 'sign' && Math.abs(f.x - x) < 24)) x += 20;
      // every third thing on the road is a cyclist riding the same way, slower than the vehicle
      if (spawnCount++ % 3 === 2) {
        const off = LANE_OFF + (rnd() - 0.5) * 0.8;
        const c = addObstacle(x, road(x) + off, 0.8, false);
        Object.assign(c, { mover: true, vx: 2.6 + rnd() * 1.2, off });
      } else addObstacle(x, road(x) + LANE_OFF + (rnd() - 0.5) * 1.8, 1 + rnd() * 0.5, false);
      nextSpawn = x + 55 + rnd() * 35;
    }
  }

  // ---------- local planner ----------
  // Lateral offset from the road centre (metres, left positive) at path parameter x.
  const latOf = (x, y) => {
    let xa = x,
      sl = 0;
    for (let k = 0; k < 3; k++) {
      const ph = Math.atan(rdx(xa));
      sl = (y - road(xa)) / Math.cos(ph);
      xa = x + sl * Math.sin(ph);
    }
    return [xa, sl];
  };
  const clearance = (o) => o.r + VEH_W / 2 + 0.9;
  const commit = new Map(); // committed lateral profile, keyed by whole metre of path
  // Group obstacles that sit beside each other, pick one side per group by clearance, keep that
  // side while the detour is active, chain groups without returning to the lane, and ease out afterwards.
  // Offsets here are measured from the middle of the right-hand lane, not from the road centre.
  const rl = (o) => o.l - LANE_OFF;
  function planLateral(lat0) {
    const obs = obstacles
      .filter((o) => !o.ped && o.seen && o.xa > car.x - 4)
      .sort((p, q) => p.xa - q.xa);
    const groups = [];
    for (const o of obs) {
      const g = groups[groups.length - 1];
      if (g && o.xa - g.x1 < 9) {
        g.items.push(o);
        g.x1 = o.xa;
      } else groups.push({ items: [o], x0: o.xa, x1: o.xa });
    }
    for (const g of groups) {
      const cands = [0];
      for (const o of g.items) {
        const c = clearance(o);
        if (o.side !== -1) cands.push(rl(o) + c);
        if (o.side !== 1) cands.push(rl(o) - c);
      }
      let best = 0,
        bestScore = Infinity;
      for (const pv of cands) {
        let viol = 0;
        for (const o of g.items)
          viol = Math.max(viol, clearance(o) - (o.side ? (pv - rl(o)) * o.side : Math.abs(pv - rl(o))));
        const score =
          (viol > 1e-6 ? 100 + viol * 10 : 0) + Math.abs(pv) + (Math.abs(pv + LANE_OFF) > 3.3 ? 4 : 0);
        if (score < bestScore) {
          bestScore = score;
          best = pv;
        }
      }
      for (const o of g.items) o.side = best > rl(o) ? 1 : -1;
      g.p = best;
      g.xs = g.x0 - 3.5;
      g.xe = g.x1 + 4.5;
    }
    const knots = [[car.x, lat0]];
    const push = (x, v) => knots.push([Math.max(x, knots[knots.length - 1][0] + 0.05), v]);
    let lastX = car.x,
      have = false;
    for (const g of groups) {
      const xs = Math.max(g.xs, car.x + 3),
        xe = Math.max(g.xe, xs + 1);
      if (have && xs - lastX < 28) push(xs, g.p);
      else {
        if (have) push(lastX + 12, 0);
        else if (xs - 18 > car.x + 6) push(Math.min(car.x + 12, xs - 18), 0);
        if (have || xs - 18 > car.x + 6) push(xs - 18, 0);
        push(xs, g.p);
      }
      push(xe, g.p);
      lastX = xe;
      have = true;
    }
    push(have ? lastX + 14 : car.x + 16, 0);
    return (x) => {
      if (x <= knots[0][0]) return knots[0][1];
      for (let i = 0; i < knots.length - 1; i++) {
        const k0 = knots[i],
          k1 = knots[i + 1];
        if (x < k1[0]) return lerp(k0[1], k1[1], smooth((x - k0[0]) / (k1[0] - k0[0])));
      }
      return knots[knots.length - 1][1];
    };
  }

  // ---------- road features: signs, lights, crosswalks, pedestrians ----------
  const rdx = (x) => 0.15 * Math.cos(x / 60) + 0.14583 * Math.cos(x / 24 + 1);
  const at = (x, s) => {
    const ph = Math.atan(rdx(x));
    return [x - s * Math.sin(ph), road(x) + s * Math.cos(ph)];
  };
  const feats = [];
  const LIMITS = [40, 30, 50, 35];
  let featN = 0;
  const lightState = (f) => {
    const p = (perfT + f.phase) % 16;
    return p < 7 ? 'green' : p < 9 ? 'yellow' : 'red';
  };
  function spawnFeatures() {
    while (featN * 170 + 60 < car.x + 220) {
      const X = featN * 170 + 60;
      feats.push({ type: 'sign', x: X, limit: LIMITS[featN % 4] });
      if (featN % 2) feats.push({ type: 'cross', x: X + 50, spawned: false });
      else feats.push({ type: 'light', x: X + 105, phase: (featN * 5) % 16 });
      featN++;
    }
    while (feats.length && feats[0].x < car.x - 60) feats.shift();
  }
  const blocks = (o) => (o.vs > 0 ? o.s < LANE_W / 2 + 0.6 : o.s > -(LANE_W / 2 + 0.6));
  function updatePeds(dt) {
    for (const f of feats)
      if (f.type === 'cross' && !f.spawned && car.x > f.x - 46) {
        f.spawned = true;
        const n = rnd() < 0.5 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const side = i ? -1 : rnd() < 0.5 ? 1 : -1;
          obstacles.push({
            id: nextId++,
            x: f.x,
            y: road(f.x),
            r: 0.4,
            w: 0,
            ped: true,
            cw: f,
            jx: (rnd() - 0.5) * 2,
            s: -side * (LANE_W / 2 + 2.8 + i * 1.4),
            vs: side * (1.0 + rnd() * 0.2),
            born: performance.now(),
          });
        }
      }
    for (const o of obstacles)
      if (o.ped) {
        o.s += o.vs * dt;
        const [x, y] = at(o.cw.x + o.jx, o.s);
        o.x = x;
        o.y = y;
        if (o.vs > 0 ? o.s > LANE_W / 2 + 3.2 : o.s < -(LANE_W / 2 + 3.2)) o.done = true;
      }
  }

  // ---------- state shared with HUD ----------
  const S = {
    limit: 40,
    lightState: null,
    yielding: false,
    stopFor: null,
    nearest: Infinity,
    roi: 0,
    clusters: 0,
    detour: 0,
    replans: 0,
    Lf: 0,
    alpha: 0,
    steerCmd: 0,
    pedalCmd: 0,
    score: 0.97,
    sigma: 12,
    matched: 0,
    keyframes: 0,
    tracked: 0,
    fastest: 0,
    traj: [],
    lastDetected: new Set(),
  };

  // one unscented Kalman filter per detected object, run ten times a second
  const tracker = new UkfTracker({
    maxCoast: 12,
    confirmHits: 3,
    noise: { accel: 1.6, yawAccel: 2.2, meas: 0.35 },
  });
  let trackClock = 0,
    trackStamp = 0;
  function trackTick() {
    const dets = [];
    for (const o of obstacles) {
      if (!o.seen) continue;
      const sg = 0.12 + 0.012 * o.dist;
      dets.push({
        x: o.x + sg * gauss(),
        y: o.y + sg * gauss(),
        cls: o.ped ? 'pedestrian' : o.mover ? 'cyclist' : 'obstacle',
      });
    }
    tracker.step(0.1, dets);
    tracker.tracks = tracker.tracks.filter((t) => t.filter.x[0] > car.x - 24 && t.filter.x[0] < car.x + 60);
    const live = tracker.tracks.filter((t) => t.state !== 'tentative');
    S.tracked = live.length;
    S.fastest = live.reduce((m, t) => Math.max(m, Math.abs(t.filter.x[2])), 0);
    trackStamp = perfT;
  }

  // ---------- canvas ----------
  const cv = document.getElementById('scene');
  const ctx = cv.getContext('2d');
  let W = 0,
    H = 0,
    DPR = 1,
    SC = 14;
  const cam = { x: 0, y: 0 };
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth;
    H = cv.clientHeight;
    cv.width = W * DPR;
    cv.height = H * DPR;
    SC = W < 800 ? clamp(W / 34, 9, 16) : clamp(W / 80, 8, 18);
  }
  window.addEventListener('resize', resize);
  const CY = () => (W < 800 ? H * 0.44 : (H - 246) / 2 + 28);
  const toX = (x) => W * (W < 800 ? 0.3 : 0.2) + 14 * SC + (x - cam.x) * SC;
  const toY = (y) => CY() - (y - cam.y) * SC;
  const fromX = (sx) => (sx - (W * (W < 800 ? 0.3 : 0.2) + 14 * SC)) / SC + cam.x;
  const fromY = (sy) => cam.y - (sy - CY()) / SC;

  // ---------- focus / ui ----------
  let focus = null; // null = overview
  let locked = false;
  let autoIdx = 0,
    autoT = 0;
  const AUTO_DUR = 5.5;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let paused = false;

  const detailEl = document.getElementById('detail');
  const dMetrics = document.getElementById('dMetrics');
  dMetrics.innerHTML = '<div class="m"><b></b><span></span></div>'.repeat(3);
  const chips = STAGES.map((s, i) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.style.setProperty('--c', s.color);
    b.innerHTML = `${s.name}<span class="bar"></span>`;
    b.addEventListener('click', () => {
      if (locked && focus === i) {
        locked = false;
        autoT = 0;
      } else {
        locked = true;
        focus = i;
      }
      renderCard();
    });
    document.getElementById('rail').appendChild(b);
    return b;
  });
  function syncChips() {
    chips.forEach((c, i) => c.classList.toggle('on', i === focus));
  }
  function renderCard() {
    syncChips();
    const st = STAGES[focus ?? 0];
    detailEl.style.setProperty('--c', st.color);
    document.getElementById('dName').textContent = st.name;
    document.getElementById('dDesc').textContent = st.desc;
    detailEl.classList.remove('fade');
    void detailEl.offsetWidth;
    detailEl.classList.add('fade');
    updateMetrics();
  }
  function metricsFor(i) {
    const f = (n, d = 1) => n.toFixed(d);
    switch (STAGES[i].id) {
      case 'map':
        return [
          [S.keyframes, 'Keyframes'],
          [f(S.odo / 1000, 2) + ' km', 'Mapped'],
          [f(1.6 + 0.8 * Math.sin(perfT * 0.6), 1) + ' cm', 'Graph error'],
        ];
      case 'sense':
        return [
          [isFinite(S.nearest) ? f(S.nearest) + ' m' : '—', 'Nearest'],
          [f(S.roi) + ' m', 'Safety zone'],
          [S.clusters, 'In path'],
        ];
      case 'objects':
        return [
          [S.tracked, 'Tracked'],
          [f(S.fastest * 3.6, 0) + ' km/h', 'Fastest'],
          ['2 s', 'Prediction'],
        ];
      case 'ego':
        return [
          [f(S.score, 3), 'Match score'],
          [f(S.sigma, 0) + ' cm', 'Pose error'],
          [S.matched, 'Map matches'],
        ];
      case 'route':
        return [
          [f(Math.abs(S.detour)) + ' m', 'Detour'],
          ['40 m', 'Horizon'],
          [S.replans, 'Replans'],
        ];
      case 'track':
        return [
          [f(S.Lf) + ' m', 'Lookahead'],
          [f(S.alpha * 57.2958, 0) + '°', 'Heading error'],
          [f(car.v * 3.6, 0) + ' km/h', 'Speed'],
        ];
      case 'bridge':
        return [
          [f(S.steerCmd, 2), 'Steering'],
          [f(S.pedalCmd, 2), 'Pedals'],
          ['D', 'Gear'],
        ];
      default:
        return [
          ['All OK', 'Components'],
          ['Live', 'Heartbeat'],
          [f(18 + 6 * Math.sin(perfT * 0.7) + car.v * 0.4, 0) + '%', 'Load'],
        ];
    }
  }
  function updateMetrics() {
    if (focus === null) return;
    const m = metricsFor(focus),
      cells = dMetrics.children;
    for (let i = 0; i < 3; i++) {
      cells[i].children[0].textContent = m[i][0];
      cells[i].children[1].textContent = m[i][1];
    }
  }

  // ---------- input ----------
  let drag = null;
  const hint = document.getElementById('hint');
  const pt = (e) => {
    const r = cv.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const hitObs = (sx, sy) => {
    const wx = fromX(sx),
      wy = fromY(sy);
    let best = null,
      bd = 1e9;
    for (const o of obstacles) {
      if (o.ped) continue;
      const d = Math.hypot(o.x - wx, o.y - wy);
      if (d < o.r + 1.2 && d < bd) {
        best = o;
        bd = d;
      }
    }
    return best;
  };
  cv.addEventListener('pointerdown', (e) => {
    const [sx, sy] = pt(e);
    const o = hitObs(sx, sy);
    hint.classList.add('gone');
    if (o) {
      drag = { o, moved: false };
      o.manual = true;
      cv.classList.add('dragging');
      cv.setPointerCapture(e.pointerId);
    } else {
      drag = { add: [fromX(sx), fromY(sy)] };
    }
  });
  cv.addEventListener('pointermove', (e) => {
    const [sx, sy] = pt(e);
    if (drag && drag.o) {
      drag.moved = true;
      drag.o.x = fromX(sx);
      drag.o.y = fromY(sy);
      drag.o.side = 0;
    } else if (!drag) cv.style.cursor = hitObs(sx, sy) ? 'grab' : 'crosshair';
  });
  const end = (e) => {
    if (drag && drag.add) {
      const [x, y] = drag.add;
      if (x > car.x + 10) {
        if (obstacles.filter((o) => o.manual).length >= 6) {
          const i = obstacles.findIndex((o) => o.manual);
          obstacles.splice(i, 1);
        }
        addObstacle(x, y, 1.1, true);
      }
    }
    drag = null;
    cv.classList.remove('dragging');
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  cv.addEventListener('dblclick', (e) => {
    const o = hitObs(...pt(e));
    if (o) obstacles.splice(obstacles.indexOf(o), 1);
  });
  addEventListener('keydown', (e) => {
    if (e.key >= '1' && e.key <= String(STAGES.length)) {
      focus = +e.key - 1;
      locked = true;
      renderCard();
    } else if (e.key === 'Escape') {
      locked = false;
      autoT = 0;
      syncChips();
    } else if (e.key === ' ') {
      paused = !paused;
      e.preventDefault();
    }
  });

  // ---------- simulation ----------
  let perfT = 0,
    hbT = 0,
    trailT = 0;
  const trail = [];
  const pulses = []; // bridge packets
  const rings = []; // guardian rings
  let ringClock = 0,
    packetClock = 0;
  const lidarHits = new Float32Array(360 * 3); // x,y,valid per ray

  function step(dt) {
    perfT += dt;
    spawnFeatures();
    spawnAuto();
    updatePeds(dt);
    for (const o of obstacles)
      if (o.mover && !o.manual) {
        o.x += o.vx * dt;
        o.y = road(o.x) + o.off;
      }
    obstacles = obstacles.filter((o) => !o.done && o.x > car.x - 40);

    const rearX = car.x,
      rearY = car.y;
    const lidX = rearX + Math.cos(car.th) * LIDAR_FROM_REAR;
    const lidY = rearY + Math.sin(car.th) * LIDAR_FROM_REAR;

    // --- sense: detection
    const lookahead = car.v * REACT + (car.v * car.v) / (2 * BRAKE);
    S.roi = lookahead + 6;
    let nearest = Infinity,
      clusters = 0;
    const detectedNow = new Set();
    for (const o of obstacles) {
      const d = Math.hypot(o.x - lidX, o.y - lidY);
      const ahead = o.x > car.x - 12;
      const det = d < 34 && ahead && (o.w > 0.01 || o.x > car.x - 1);
      if (d < 34 && o.x > car.x - 12) detectedNow.add(o.id);
      o.w = lerp(o.w, d < 34 && ahead ? 1 : 0, 1 - Math.exp(-dt * 2.2));
      // in-RoI test (car frame)
      const dx = o.x - lidX,
        dy = o.y - lidY;
      const lx = dx * Math.cos(car.th) + dy * Math.sin(car.th);
      const ly = -dx * Math.sin(car.th) + dy * Math.cos(car.th);
      o.inRoi = lx > -1 && lx < S.roi && Math.abs(ly) < VEH_W / 2 + o.r + 0.6;
      o.dist = d;
      if (!o.ped) [o.xa, o.l] = latOf(o.x, o.y);
      if (o.inRoi) {
        clusters++;
        nearest = Math.min(nearest, lx - o.r);
      }
      o.seen = d < 34 && ahead;
    }
    trackClock += dt;
    while (trackClock >= 0.1) {
      trackClock -= 0.1;
      trackTick();
    }
    for (const id of detectedNow) if (!S.lastDetected.has(id)) S.replans++;
    S.lastDetected = detectedNow;
    S.nearest = nearest;
    S.clusters = clusters;

    // --- route: local trajectory
    const lat0 = latOf(rearX, rearY)[1];
    const lat = planLateral(lat0 - LANE_OFF);
    const ck = 1 - Math.exp(-dt * 5);
    const traj = [];
    for (let i = 0; i <= 44; i++) {
      const x = rearX + i,
        key = Math.round(x),
        tgt = lat(x);
      const cv = commit.has(key) ? lerp(commit.get(key), tgt, ck) : tgt;
      commit.set(key, cv);
      traj.push(at(x, cv + LANE_OFF));
    }
    for (const key of commit.keys()) if (key < rearX - 6) commit.delete(key);
    S.traj = traj;
    S.detour = commit.get(Math.round(rearX + 8)) || 0;

    // --- track: pure pursuit + speed
    let maxOff = 0;
    for (let i = 0; i < 18; i++) maxOff = Math.max(maxOff, Math.abs(traj[i][1] - road(traj[i][0]) - LANE_OFF));
    S.lightState = null;
    S.yielding = false;
    S.stopFor = null;
    for (const f of feats) if (f.type === 'sign' && car.x + 3.5 > f.x) S.limit = f.limit;
    let vt = Math.max(2.5, (S.limit / 3.6) * 0.97 - 3.5 * smooth(maxOff / 3));
    S.limitNext = null;
    for (const f of feats) {
      if (f.type !== 'sign' || f.x <= car.x + 3.5 || f.x - car.x > 170) continue;
      const dS = f.x - car.x - 3.5,
        vL = (f.limit / 3.6) * 0.97;
      if (!S.limitNext) S.limitNext = { limit: f.limit, dist: dS };
      vt = Math.min(vt, Math.sqrt(vL * vL + 2 * 1.6 * dS));
    }
    let stopD = Infinity;
    for (const f of feats) {
      const d = f.x - 6.5 - car.x;
      if (f.type === 'light' && d > -2 && d < 90 && S.lightState === null) {
        const st = lightState(f);
        S.lightState = st;
        if (st === 'red' || (st === 'yellow' && d > car.v * 1.3)) {
          stopD = Math.min(stopD, d);
          S.stopFor = 'light';
        }
      } else if (
        f.type === 'cross' &&
        d > -2 &&
        d < 90 &&
        obstacles.some((o) => o.ped && o.cw === f && blocks(o))
      ) {
        stopD = Math.min(stopD, d);
        S.yielding = true;
        S.stopFor = 'ped';
      }
    }
    if (stopD < Infinity) vt = Math.min(vt, stopD <= 0.3 ? 0 : Math.sqrt(4 * stopD));
    const Lf = 3 + 0.55 * car.v;
    S.Lf = Lf;
    let tgt = traj[traj.length - 1];
    for (const p of traj) {
      if (Math.hypot(p[0] - rearX, p[1] - rearY) >= Lf) {
        tgt = p;
        break;
      }
    }
    S.tgt = tgt;
    const alpha = Math.atan2(tgt[1] - rearY, tgt[0] - rearX) - car.th;
    const a = Math.atan2(Math.sin(alpha), Math.cos(alpha));
    S.alpha = a;
    const delta = clamp(Math.atan2(2 * WB * Math.sin(a), Lf), -0.5, 0.5);
    car.steer = lerp(car.steer, delta, 1 - Math.exp(-dt * 12));
    S.lat = lat0 - LANE_OFF;
    S.ttc = isFinite(nearest) ? Math.max(0, nearest) / Math.max(car.v, 0.1) : Infinity;
    S.aeb = isFinite(nearest) && nearest < Math.max(2.5, car.v * 0.9);
    S.vt = vt;
    let u = clamp(1.1 * (vt - car.v), -1, 1);
    if (S.aeb) u = -1;
    car.pedal = u;
    S.steerCmd = car.steer / 0.5;
    S.pedalCmd = u;

    // --- plant (kinematic bicycle at rear axle)
    car.v = Math.max(0, car.v + (u > 0 ? u * 2.4 : u * 4) * dt - 0.02 * car.v * dt);
    S.odo = (S.odo || 0) + car.v * dt;
    S.keyframes = Math.floor(S.odo / 8);
    car.x += car.v * Math.cos(car.th) * dt;
    car.y += car.v * Math.sin(car.th) * dt;
    car.th += (car.v / WB) * Math.tan(car.steer) * dt;

    // --- ego telemetry (simulated, calm with small noise)
    S.score = 0.965 + 0.02 * Math.sin(perfT * 0.9) + 0.006 * Math.sin(perfT * 5.3);
    S.sigma = 9 + 4 * Math.abs(Math.sin(perfT * 0.6)) + car.v * 0.4;
    // --- lidar rays
    const R = 30,
      N = 360;
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * TAU;
      const dxr = Math.cos(ang),
        dyr = Math.sin(ang);
      let tmin = R + 1;
      for (const o of obstacles) {
        const ox = o.x - lidX,
          oy = o.y - lidY;
        const b = ox * dxr + oy * dyr;
        if (b < 0) continue;
        const c = ox * ox + oy * oy - o.r * o.r;
        const disc = b * b - c;
        if (disc < 0) continue;
        const t = b - Math.sqrt(disc);
        if (t > 0 && t < tmin) tmin = t;
      }
      if (tmin <= R) {
        lidarHits[i * 3] = lidX + dxr * tmin;
        lidarHits[i * 3 + 1] = lidY + dyr * tmin;
        lidarHits[i * 3 + 2] = 1;
      } else lidarHits[i * 3 + 2] = 0;
    }

    // --- bridge packets & guardian rings
    packetClock += dt;
    ringClock += dt;
    if (packetClock > 0.09) {
      packetClock = 0;
      pulses.push({ t: 0, kind: pulses.length % 2 });
    }
    if (ringClock > 1) {
      ringClock = 0;
      rings.push({ t: 0 });
    }
    for (const p of pulses) p.t += dt * 1.8;
    for (const r of rings) r.t += dt * 0.55;
    while (pulses.length && pulses[0].t > 1) pulses.shift();
    while (rings.length && rings[0].t > 1) rings.shift();

    {
      const lt = trail[trail.length - 1];
      if (!lt || Math.hypot(car.x - lt[0], car.y - lt[1]) > 1) {
        trail.push([car.x, car.y]);
        if (trail.length > 320) trail.shift();
      }
    }
    // camera
    cam.x = lerp(cam.x, car.x + 14, 1 - Math.exp(-dt * 4));
    cam.y = lerp(cam.y, car.y, 1 - Math.exp(-dt * 3));
  }

  // ---------- drawing ----------
  const layerAlpha = (id) => (focus === null ? 1 : STAGES[focus].id === id ? 1 : 0.2);
  const smoothA = {}; // eased layer alpha
  function easeLayers(dt) {
    for (const s of STAGES) {
      const t = layerAlpha(s.id);
      smoothA[s.id] = lerp(smoothA[s.id] ?? t, t, 1 - Math.exp(-dt * 5));
    }
  }

  function strokePath(pts, width, style, blur, dash) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = width;
    ctx.strokeStyle = style;
    if (blur) {
      ctx.shadowBlur = blur;
      ctx.shadowColor = style;
    }
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    pts.forEach((p, i) =>
      i ? ctx.lineTo(toX(p[0]), toY(p[1])) : ctx.moveTo(toX(p[0]), toY(p[1])),
    );
    ctx.stroke();
    ctx.restore();
  }

  function drawBackground() {
    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W * 0.4, H * 0.5, 0, W * 0.4, H * 0.5, Math.max(W, H) * 0.7);
    g.addColorStop(0, '#0d1118');
    g.addColorStop(1, '#05060a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // dot grid
    const step = 8;
    const x0 = Math.floor(fromX(0) / step) * step,
      x1 = fromX(W);
    const y1 = Math.floor(fromY(0) / step) * step,
      y0 = fromY(H);
    ctx.fillStyle = 'rgba(255,255,255,.07)';
    for (let x = x0; x < x1; x += step)
      for (let y = y0 - step; y < y1 + step; y += step) {
        const yy = Math.round(y / step) * step;
        ctx.fillRect(toX(x) - 0.5, toY(yy) - 0.5, 1.4, 1.4);
      }
  }

  function roadPts(off) {
    const pts = [];
    for (let x = fromX(-40); x < fromX(W + 40); x += 3) pts.push([x, road(x) + off]);
    return pts;
  }
  function drawRoad() {
    const c = roadPts(0);
    strokePath(c, LANE_W * SC + 14, 'rgba(255,255,255,.035)');
    strokePath(c, LANE_W * SC, 'rgba(255,255,255,.055)');
    strokePath(roadPts(LANE_W / 2), 1.5, 'rgba(255,255,255,.22)');
    strokePath(roadPts(-LANE_W / 2), 1.5, 'rgba(255,255,255,.22)');
    strokePath(c, 1.5, 'rgba(255,255,255,.2)', 0, [14, 18]);
  }

  function carPoly(ctx2) {
    // rounded body in screen px, car frame (rear axle origin)
    const rear = -0.9,
      front = 3.5,
      hw = 1;
    ctx2.beginPath();
    ctx2.roundRect(rear * SC, -hw * SC, (front - rear) * SC, 2 * hw * SC, 0.55 * SC);
  }
  function drawCar() {
    ctx.save();
    ctx.translate(toX(car.x), toY(car.y));
    ctx.rotate(-car.th);
    // shadow
    ctx.shadowColor = 'rgba(0,0,0,.6)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 6;
    carPoly(ctx);
    const g = ctx.createLinearGradient(0, -SC, 0, SC);
    g.addColorStop(0, '#f4f5f8');
    g.addColorStop(1, '#a7acb8');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    // glass
    ctx.fillStyle = 'rgba(12,16,26,.88)';
    ctx.beginPath();
    ctx.roundRect(0.55 * SC, -0.78 * SC, 1.7 * SC, 1.56 * SC, 0.35 * SC);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    ctx.beginPath();
    ctx.roundRect(0.7 * SC, -0.7 * SC, 0.5 * SC, 1.4 * SC, 0.2 * SC);
    ctx.fill();
    // lidar puck
    ctx.fillStyle = '#5ac8fa';
    ctx.shadowColor = '#5ac8fa';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(LIDAR_FROM_REAR * SC, 0, 0.22 * SC, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    // headlights
    const hl = ctx.createLinearGradient(3.4 * SC, 0, 9 * SC, 0);
    hl.addColorStop(0, 'rgba(255,248,220,.28)');
    hl.addColorStop(1, 'rgba(255,248,220,0)');
    ctx.fillStyle = hl;
    ctx.beginPath();
    ctx.moveTo(3.4 * SC, -0.7 * SC);
    ctx.lineTo(10 * SC, -2.6 * SC);
    ctx.lineTo(10 * SC, 2.6 * SC);
    ctx.lineTo(3.4 * SC, 0.7 * SC);
    ctx.fill();
    // front wheels steering hint
    ctx.fillStyle = '#16181f';
    for (const sy of [-1, 1]) {
      ctx.save();
      ctx.translate(WB * SC, sy * 1.02 * SC);
      ctx.rotate(-car.steer);
      ctx.beginPath();
      ctx.roundRect(-0.38 * SC, -0.14 * SC, 0.76 * SC, 0.28 * SC, 3);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  const LC = { red: '#ff453a', yellow: '#ffd60a', green: '#30d158' };
  function drawFeatures() {
    for (const f of feats) {
      const sx = toX(f.x);
      if (sx < -90 || sx > W + 90) continue;
      const ph = Math.atan(rdx(f.x));
      if (f.type === 'cross') {
        ctx.save();
        ctx.translate(sx, toY(road(f.x)));
        ctx.rotate(-ph);
        ctx.fillStyle = 'rgba(255,255,255,.34)';
        for (let k = -3; k <= 3; k++)
          ctx.fillRect(-1.5 * SC, -(k * 1.05 + 0.36) * SC, 3 * SC, 0.72 * SC);
        ctx.fillStyle = 'rgba(255,255,255,.5)';
        ctx.fillRect(-2.5 * SC, -(LANE_W / 2) * SC, 2.5, LANE_W * SC);
        ctx.restore();
      } else if (f.type === 'light') {
        const st = lightState(f),
          col = LC[st];
        ctx.save();
        ctx.translate(sx, toY(road(f.x)));
        ctx.rotate(-ph);
        ctx.shadowColor = col;
        ctx.shadowBlur = 14;
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.9;
        ctx.fillRect(-2.5 * SC, -(LANE_W / 2) * SC, 3, LANE_W * SC);
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        const hy = -(LANE_W / 2 + 1.5) * SC;
        ctx.fillStyle = '#0c0e13';
        ctx.strokeStyle = 'rgba(255,255,255,.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(-1.8 * SC, hy - 0.65 * SC, 3.6 * SC, 1.3 * SC, 0.65 * SC);
        ctx.fill();
        ctx.stroke();
        [
          ['red', -1],
          ['yellow', 0],
          ['green', 1],
        ].forEach(([n, i]) => {
          const on = n === st;
          ctx.fillStyle = on ? LC[n] : 'rgba(255,255,255,.1)';
          if (on) {
            ctx.shadowColor = LC[n];
            ctx.shadowBlur = 16;
          }
          ctx.beginPath();
          ctx.arc(i * 1.1 * SC, hy, 0.4 * SC, 0, TAU);
          ctx.fill();
          ctx.shadowBlur = 0;
        });
        ctx.restore();
      } else {
        const [wx, wy] = at(f.x, -(LANE_W / 2 + 1.8)),
          x = toX(wx),
          y = toY(wy),
          r = 1.1 * SC;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,.6)';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#f5f5f7';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#e5322d';
        ctx.lineWidth = r * 0.24;
        ctx.beginPath();
        ctx.arc(x, y, r * 0.86, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = '#111';
        ctx.font = `700 ${Math.round(r * 0.9)}px -apple-system, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(f.limit, x, y + 1);
        ctx.restore();
      }
    }
  }
  function drawPed(o, sx, sy, appear, a) {
    const ph = Math.atan(rdx(o.cw.x)),
      col = o.inRoi ? '#ff453a' : '#ffd6a5';
    ctx.save();
    ctx.translate(sx, sy);
    ctx.globalAlpha = (0.85 + 0.15 * a) * appear;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 2.4 * SC);
    g.addColorStop(0, rgba(col, 0.3));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 2.4 * SC, 0, TAU);
    ctx.fill();
    ctx.rotate(-ph);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.52 * SC, 0.26 * SC, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, 0, 0.2 * SC, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawObstacles(a) {
    const t = performance.now();
    for (const o of obstacles) {
      const sx = toX(o.x),
        sy = toY(o.y),
        r = o.r * SC;
      if (sx < -60 || sx > W + 60) continue;
      const appear = smooth((t - o.born) / 600);
      if (o.ped) {
        drawPed(o, sx, sy, appear, a);
        continue;
      }
      const danger = o.inRoi;
      const col = danger ? '#ff453a' : '#9aa3b5';
      ctx.save();
      ctx.globalAlpha = (0.35 + 0.65 * a) * appear;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 3);
      g.addColorStop(0, rgba(danger ? '#ff453a' : '#9aa3b5', 0.22));
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, r * 3, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#1b1e27';
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx, sy, r * 0.45, 0, TAU);
      ctx.fillStyle = col;
      ctx.globalAlpha *= 0.55;
      ctx.fill();
      ctx.restore();
    }
  }

  function drawSense(a) {
    if (a < 0.02) return;
    const col = COL('sense');
    const lidX = car.x + Math.cos(car.th) * LIDAR_FROM_REAR,
      lidY = car.y + Math.sin(car.th) * LIDAR_FROM_REAR;
    ctx.save();
    ctx.globalAlpha = a;
    const cx = toX(lidX),
      cy = toY(lidY);
    // range rings
    ctx.strokeStyle = rgba(col, 0.1);
    ctx.lineWidth = 1;
    for (const r of [10, 20, 30]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * SC, 0, TAU);
      ctx.stroke();
    }
    // RoI (car frame)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-car.th);
    const L = S.roi * SC,
      hw = (VEH_W / 2 + 0.3) * SC;
    const g = ctx.createLinearGradient(0, 0, L, 0);
    g.addColorStop(0, rgba(col, 0.2));
    g.addColorStop(1, rgba(col, 0.02));
    ctx.fillStyle = g;
    ctx.strokeStyle = rgba(col, 0.5);
    ctx.lineWidth = 1.2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.roundRect(0, -hw, L, hw * 2, 8);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // sweep
    const sweep = (perfT * 2.4) % TAU;
    const sg = ctx.createConicGradient ? ctx.createConicGradient(-sweep + 0, cx, cy) : null;
    if (sg) {
      sg.addColorStop(0, rgba(col, 0));
      sg.addColorStop(0.0, rgba(col, 0));
      sg.addColorStop(0.92, rgba(col, 0));
      sg.addColorStop(1, rgba(col, 0.1));
      ctx.save();
      ctx.translate(0, 0);
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(cx, cy, 30 * SC, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    // returns with sweep persistence
    for (let i = 0; i < 360; i++) {
      if (!lidarHits[i * 3 + 2]) continue;
      const ang = (i / 360) * TAU;
      let behind = (-ang + sweep) % TAU; // wrapped sweep trail (screen y flipped)
      behind = (((sweep - (TAU - ang)) % TAU) + TAU) % TAU;
      const br = Math.pow(1 - behind / TAU, 2.2);
      ctx.fillStyle = rgba('#8fe3ff', 0.15 + 0.85 * br);
      ctx.beginPath();
      ctx.arc(toX(lidarHits[i * 3]), toY(lidarHits[i * 3 + 1]), 2.1, 0, TAU);
      ctx.fill();
    }
    // detection brackets
    ctx.font = '600 11px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const brk = (sx, sy, r, c, txt) => {
      ctx.strokeStyle = c;
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      const k = r * 0.5;
      for (const [dx, dy] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        ctx.beginPath();
        ctx.moveTo(sx + dx * r, sy + dy * (r - k));
        ctx.lineTo(sx + dx * r, sy + dy * r);
        ctx.lineTo(sx + dx * (r - k), sy + dy * r);
        ctx.stroke();
      }
      ctx.fillStyle = c;
      ctx.fillText(txt, sx + r + 6, sy - r + 10);
    };
    for (const o of obstacles) {
      if (!o.seen) continue;
      brk(
        toX(o.x),
        toY(o.y),
        o.r * SC + 8,
        o.inRoi ? '#ff453a' : col,
        `${o.ped ? 'Pedestrian ' : ''}${o.dist.toFixed(1)} m`,
      );
    }
    for (const f of feats) {
      let pos, txt;
      if (f.type === 'sign') {
        pos = at(f.x, -(LANE_W / 2 + 1.8));
        txt = `Speed limit ${f.limit}`;
      } else if (f.type === 'light') {
        pos = at(f.x, LANE_W / 2 + 1.5);
        txt = `Traffic light, ${lightState(f)}`;
      } else continue;
      if (pos[0] < car.x - 2 || Math.hypot(pos[0] - lidX, pos[1] - lidY) > 40) continue;
      brk(toX(pos[0]), toY(pos[1]), 1.9 * SC, col, txt);
    }
    ctx.restore();
  }

  // The map being built: tiles along the road, filled once scanned, with a keyframe every few metres
  // and the links of the graph that holds them together.
  function drawMap(a) {
    if (a < 0.02) return;
    const col = COL('map');
    const TILE = 18;
    const quad = (k, w) => {
      const x0 = k * TILE,
        x1 = x0 + TILE;
      return [
        [x0, road(x0) + w],
        [x1, road(x1) + w],
        [x1, road(x1) - w],
        [x0, road(x0) - w],
      ];
    };
    ctx.save();
    ctx.globalAlpha = a;
    const k0 = Math.floor((car.x - 50) / TILE),
      k1 = Math.floor((car.x + 90) / TILE);
    for (let k = k0; k <= k1; k++) {
      const q = quad(k, 9);
      const done = (k + 1) * TILE < car.x + 6,
        here = k * TILE <= car.x + 6 && (k + 1) * TILE >= car.x + 6;
      ctx.beginPath();
      q.forEach(([x, y], i) => (i ? ctx.lineTo(toX(x), toY(y)) : ctx.moveTo(toX(x), toY(y))));
      ctx.closePath();
      if (done) {
        ctx.fillStyle = rgba(col, 0.06);
        ctx.fill();
        ctx.strokeStyle = rgba(col, 0.26);
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = here ? rgba(col, 0.11 + 0.05 * Math.sin(perfT * 5)) : 'transparent';
        ctx.fill();
        ctx.strokeStyle = rgba(col, here ? 0.7 : 0.22);
        ctx.setLineDash([4, 6]);
      }
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
      // the landmarks that tile holds
      for (let m = 0; m < 7; m++) {
        const x = k * TILE + hash(k, m) * TILE;
        const side = hash(k + 5, m) > 0.5 ? 1 : -1;
        const y = road(x) + side * (LANE_W / 2 + 1 + hash(k, m + 9) * 4.5);
        ctx.fillStyle = rgba(col, done ? 0.8 : 0.28);
        ctx.beginPath();
        ctx.arc(toX(x), toY(y), done ? 2.4 : 1.6, 0, TAU);
        ctx.fill();
      }
    }
    // keyframes along the driven path and the graph between them
    const kfs = [];
    let dist = 0;
    for (let i = trail.length - 1; i > 0; i--) {
      dist += Math.hypot(trail[i][0] - trail[i - 1][0], trail[i][1] - trail[i - 1][1]);
      if (dist >= kfs.length * 8) kfs.push(trail[i]);
    }
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = rgba(col, 0.55);
    ctx.beginPath();
    kfs.forEach(([x, y], i) => (i ? ctx.lineTo(toX(x), toY(y)) : ctx.moveTo(toX(x), toY(y))));
    ctx.stroke();
    ctx.strokeStyle = rgba(col, 0.28);
    for (let i = 0; i + 2 < kfs.length; i++) {
      ctx.beginPath();
      ctx.moveTo(toX(kfs[i][0]), toY(kfs[i][1]));
      ctx.quadraticCurveTo(toX(kfs[i + 1][0]), toY(kfs[i + 1][1]) + 14, toX(kfs[i + 2][0]), toY(kfs[i + 2][1]));
      ctx.stroke();
    }
    kfs.forEach(([x, y], i) => {
      ctx.fillStyle = i === 0 ? '#fff' : col;
      ctx.shadowColor = col;
      ctx.shadowBlur = i === 0 ? 12 : 6;
      ctx.fillRect(toX(x) - 3.5, toY(y) - 3.5, 7, 7);
    });
    ctx.restore();
  }

  // Tracked objects: an id, a speed, an arrow, the uncertainty of the estimate and where it goes next.
  function drawObjects(a) {
    if (a < 0.02) return;
    const col = COL('objects');
    const tau = clamp(perfT - trackStamp, 0, 0.15);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = '600 11px -apple-system, system-ui, sans-serif';
    for (const t of tracker.tracks) {
      if (t.state === 'tentative') continue;
      const [vx, vy] = t.filter.velocity;
      const sp = Math.hypot(vx, vy);
      const px = t.filter.x[0] + vx * tau,
        py = t.filter.x[1] + vy * tau;
      const x = toX(px),
        y = toY(py);
      if (x < -60 || x > W + 60) continue;
      const moving = sp > 0.5;
      const r = (t.cls === 'pedestrian' ? 0.9 : 1.5) * SC + 6;
      // predicted path
      if (moving) {
        const path = predictPath(t, 2, 0.25);
        ctx.strokeStyle = rgba(col, 0.85);
        ctx.lineWidth = 1.6;
        ctx.setLineDash([4, 5]);
        ctx.beginPath();
        ctx.moveTo(x, y);
        path.forEach(([qx, qy]) => ctx.lineTo(toX(qx), toY(qy)));
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // uncertainty
      const e = t.filter.ellipse(2);
      ctx.strokeStyle = rgba(col, 0.8);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(x, y, Math.max(e.a, 0.2) * SC, Math.max(e.b, 0.15) * SC, -e.angle, 0, TAU);
      ctx.stroke();
      // box
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.8;
      ctx.shadowColor = col;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.roundRect(x - r, y - r, r * 2, r * 2, 6);
      ctx.stroke();
      ctx.shadowBlur = 0;
      if (moving) {
        const ex = x + vx * 0.9 * SC,
          ey = y - vy * 0.9 * SC,
          ang = Math.atan2(-vy, vx);
        ctx.fillStyle = col;
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - 7 * Math.cos(ang - 0.45), ey - 7 * Math.sin(ang - 0.45));
        ctx.lineTo(ex - 7 * Math.cos(ang + 0.45), ey - 7 * Math.sin(ang + 0.45));
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = col;
      ctx.textAlign = 'left';
      ctx.fillText(
        `#${t.id} ${{ pedestrian: 'Pedestrian', cyclist: 'Cyclist' }[t.cls] || 'Object'} · ${moving ? (sp * 3.6).toFixed(0) + ' km/h' : 'static'}`,
        x + r + 5,
        y - r + 10,
      );
    }
    ctx.restore();
  }

  function drawEgo(a) {
    if (a < 0.02) return;
    const col = COL('ego');
    ctx.save();
    ctx.globalAlpha = a;
    // landmarks from global map
    const lm = [];
    const gx0 = Math.floor((car.x - 30) / 6),
      gx1 = Math.floor((car.x + 45) / 6);
    for (let gx = gx0; gx <= gx1; gx++)
      for (let k = 0; k < 3; k++) {
        const x = gx * 6 + hash(gx, k) * 6;
        const side = hash(gx, k + 9) > 0.5 ? 1 : -1;
        const y = road(x) + side * (LANE_W / 2 + 2 + hash(gx + 3, k) * 9);
        lm.push([x, y]);
      }
    lm.sort(
      (p, q) => Math.hypot(p[0] - car.x, p[1] - car.y) - Math.hypot(q[0] - car.x, q[1] - car.y),
    );
    S.matched = Math.min(lm.length, 24);
    lm.forEach((p, i) => {
      const d = Math.hypot(p[0] - car.x, p[1] - car.y);
      const near = i < 7;
      ctx.fillStyle = rgba(col, near ? 0.9 : 0.35);
      ctx.beginPath();
      ctx.arc(toX(p[0]), toY(p[1]), near ? 3 : 2, 0, TAU);
      ctx.fill();
      if (near) {
        ctx.strokeStyle = rgba(col, 0.28);
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(toX(car.x), toY(car.y));
        ctx.lineTo(toX(p[0]), toY(p[1]));
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });
    // pose uncertainty ellipse
    const rx = ((S.sigma / 100) * 6 + 0.6) * SC,
      ry = rx * 0.6;
    ctx.translate(toX(car.x + Math.cos(car.th) * 1.2), toY(car.y + Math.sin(car.th) * 1.2));
    ctx.rotate(-car.th);
    ctx.strokeStyle = rgba(col, 0.9);
    ctx.lineWidth = 1.6;
    ctx.shadowColor = col;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.ellipse(
      0,
      0,
      rx * (1 + 0.08 * Math.sin(perfT * 3)),
      ry * (1 + 0.08 * Math.sin(perfT * 3 + 1)),
      0,
      0,
      TAU,
    );
    ctx.stroke();
    ctx.restore();
  }

  function drawRoute(a) {
    const col = COL('route');
    // global route: always faint, brighter when focused
    const g = [];
    for (let x = fromX(-60); x < car.x + 130; x += 3) g.push(at(x, LANE_OFF));
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.65 * a;
    strokePath(g, 1.4, rgba(col, 0.45), 0, [3, 7]);
    ctx.restore();
    // driven path: where the vehicle has actually been
    if (trail.length > 1) {
      ctx.save();
      ctx.globalAlpha = 0.4 + 0.6 * a;
      ctx.lineCap = 'round';
      const pts = trail.concat([[car.x, car.y]]);
      for (let i = 1; i < pts.length; i++) {
        const t = i / pts.length;
        ctx.strokeStyle = rgba(col, 0.06 + 0.6 * t * t);
        ctx.lineWidth = 1.5 + 2.5 * t;
        ctx.beginPath();
        ctx.moveTo(toX(pts[i - 1][0]), toY(pts[i - 1][1]));
        ctx.lineTo(toX(pts[i][0]), toY(pts[i][1]));
        ctx.stroke();
      }
      ctx.restore();
    }
    if (a < 0.02) return;
    ctx.save();
    ctx.globalAlpha = a;
    // costmap inflation halos
    for (const o of obstacles) {
      if (!o.seen) continue;
      const sx = toX(o.x),
        sy = toY(o.y),
        r = (o.r + VEH_W / 2 + 0.9) * SC;
      const gr = ctx.createRadialGradient(sx, sy, o.r * SC, sx, sy, r);
      gr.addColorStop(0, 'rgba(255,69,58,.28)');
      gr.addColorStop(1, 'rgba(255,69,58,0)');
      ctx.fillStyle = gr;
      ctx.globalAlpha = a * o.w;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = a;
    // committed trajectory
    strokePath(S.traj, 10, rgba(col, 0.1));
    strokePath(S.traj, 3, col, 16);
    // flow dashes
    ctx.lineDashOffset = -perfT * 40;
    strokePath(S.traj, 1.5, 'rgba(255,255,255,.85)', 0, [4, 22]);
    ctx.restore();
  }

  function drawTrack(a) {
    if (a < 0.02 || !S.tgt) return;
    const col = COL('track');
    ctx.save();
    ctx.globalAlpha = a;
    const cx = toX(car.x),
      cy = toY(car.y);
    // lookahead circle
    ctx.strokeStyle = rgba(col, 0.35);
    ctx.lineWidth = 1.2;
    ctx.setLineDash([2, 6]);
    ctx.beginPath();
    ctx.arc(cx, cy, S.Lf * SC, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    // pure pursuit arc to target
    const tx = toX(S.tgt[0]),
      ty = toY(S.tgt[1]);
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.shadowColor = col;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    const k = (2 * Math.sin(S.alpha)) / S.Lf; // curvature
    for (let i = 1; i <= 20; i++) {
      const s = (i / 20) * S.Lf;
      const th = car.th + (Math.abs(k) < 1e-5 ? 0 : 0);
      const ang = car.th + ((k * s) / 2) * 1; // approx arc heading
      const px =
        car.x +
        (Math.abs(k) < 1e-5
          ? Math.cos(car.th) * s
          : (Math.sin(car.th + k * s) - Math.sin(car.th)) / k);
      const py =
        car.y +
        (Math.abs(k) < 1e-5
          ? Math.sin(car.th) * s
          : (-Math.cos(car.th + k * s) + Math.cos(car.th)) / k);
      ctx.lineTo(toX(px), toY(py));
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    // target point
    const pulse = 1 + 0.25 * Math.sin(perfT * 6);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(tx, ty, 5 * pulse, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba(col, 0.5);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(tx, ty, 11 * pulse, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function drawBridge(a) {
    if (a < 0.02 || !S.tgt) return;
    const col = COL('bridge');
    ctx.save();
    ctx.globalAlpha = a;
    const fx = car.x + Math.cos(car.th) * WB,
      fy = car.y + Math.sin(car.th) * WB;
    const sx = toX(S.tgt[0]),
      sy = toY(S.tgt[1]);
    // command link
    ctx.strokeStyle = rgba(col, 0.25);
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 5]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(toX(fx), toY(fy));
    ctx.stroke();
    ctx.setLineDash([]);
    for (const p of pulses) {
      const t = smooth(p.t);
      const x = lerp(sx, toX(fx), t),
        y = lerp(sy, toY(fy), t) + (p.kind ? 4 : -4) * Math.sin(t * Math.PI);
      ctx.fillStyle = p.kind ? col : '#fff';
      ctx.globalAlpha = a * (1 - p.t * 0.4);
      ctx.shadowColor = col;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(x, y, p.kind ? 3.2 : 2.2, 0, TAU);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = a;
    // steering arc gauge on front axle
    ctx.save();
    ctx.translate(toX(fx), toY(fy));
    ctx.rotate(-car.th);
    ctx.strokeStyle = rgba(col, 0.8);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, 2.2 * SC, -0.5 * Math.PI - 0.0, -0.5 * Math.PI + 0, false);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(
      0,
      0,
      2.2 * SC,
      -Math.PI / 2 - car.steer * 2,
      -Math.PI / 2 + car.steer * 2,
      car.steer < 0,
    );
    ctx.stroke();
    ctx.restore();
    // pedal bar
    ctx.restore();
  }

  function drawGuardian(a) {
    if (a < 0.02) return;
    const col = COL('guardian');
    ctx.save();
    ctx.globalAlpha = a;
    const cx = toX(car.x + Math.cos(car.th) * 1.3),
      cy = toY(car.y + Math.sin(car.th) * 1.3);
    for (const r of rings) {
      ctx.strokeStyle = rgba(col, 0.6 * (1 - r.t));
      ctx.lineWidth = 2 * (1 - r.t) + 0.5;
      ctx.beginPath();
      ctx.arc(cx, cy, (1.5 + r.t * 18) * SC, 0, TAU);
      ctx.stroke();
    }
    // six tentacle nodes orbiting
    for (let i = 0; i < 6; i++) {
      const ang = perfT * 0.5 + i * (TAU / 6);
      const rad = 4.2 * SC;
      const nx = cx + Math.cos(ang) * rad,
        ny = cy + Math.sin(ang) * rad;
      ctx.strokeStyle = rgba(col, 0.25);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      const beat = 0.5 + 0.5 * Math.sin(perfT * 4 + i * 1.7);
      ctx.fillStyle = rgba(STAGES[i].color, 0.55 + 0.45 * beat);
      ctx.shadowColor = STAGES[i].color;
      ctx.shadowBlur = 8 * beat;
      ctx.beginPath();
      ctx.arc(nx, ny, 3.6 + beat * 1.4, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - (frame.last || now)) / 1000);
    frame.last = now;
    if (!paused) step(dt);
    easeLayers(dt);

    // auto focus cycle
    if (!locked && !reduce) {
      autoT += dt;
      if (focus === null || autoT > AUTO_DUR) {
        autoT = 0;
        autoIdx = focus === null ? 0 : (autoIdx + 1) % STAGES.length;
        focus = autoIdx;
        renderCard();
      }
      chips.forEach(
        (c, i) =>
          c.firstElementChild &&
          (c.querySelector('.bar').style.transform =
            `scaleX(${i === focus ? autoT / AUTO_DUR : 0})`),
      );
    } else {
      if (focus === null) {
        focus = 0;
        renderCard();
      }
      chips.forEach((c) => (c.querySelector('.bar').style.transform = 'scaleX(0)'));
    }

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawBackground();
    drawRoad();
    drawFeatures();
    drawMap(smoothA.map);
    drawEgo(smoothA.ego);
    drawRoute(smoothA.route);
    drawObstacles(smoothA.sense);
    drawSense(smoothA.sense);
    drawObjects(smoothA.objects);
    drawTrack(smoothA.track);
    drawBridge(smoothA.bridge);
    drawCar();
    drawGuardian(smoothA.guardian);

    drawView();
    hbT += dt;
    if (hbT > 0.12) {
      hbT = 0;
      updateMetrics();
      updateDash();
    }
  }

  // ---------- dashboard ----------
  const NS = 'http://www.w3.org/2000/svg';
  // speed gauge: 240deg sweep, 0..60 km/h
  const GC = [120, 118],
    GR = 100,
    A0 = 150,
    SWEEP = 240,
    VMAX = 60;
  const pol = (deg, r) => [
    GC[0] + r * Math.cos((deg * Math.PI) / 180),
    GC[1] + r * Math.sin((deg * Math.PI) / 180),
  ];
  const arc = (d0, d1, r) => {
    const [x0, y0] = pol(d0, r),
      [x1, y1] = pol(d1, r);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${d1 - d0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };
  $('gTrack').setAttribute('d', arc(A0, A0 + SWEEP, GR));
  $('gVal').setAttribute('d', arc(A0, A0 + SWEEP, GR));
  for (let v = 0; v <= VMAX; v += 10) {
    const d = A0 + (SWEEP * v) / VMAX,
      [x0, y0] = pol(d, GR + 13),
      [x1, y1] = pol(d, GR + 19);
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('class', 'tick');
    l.setAttribute('x1', x0);
    l.setAttribute('y1', y0);
    l.setAttribute('x2', x1);
    l.setAttribute('y2', y1);
    $('gTicks').appendChild(l);
  }
  const ADAS = [
    'Collision warning',
    'Emergency braking',
    'Lane keeping',
    'Cruise control',
    'Obstacle avoidance',
    'Localization',
    'Traffic light',
    'Speed limit',
    'Pedestrians',
  ];
  $('adas').innerHTML = ADAS.map(
    (n, i) => `<div class="tile" id="a${i}"><span>${n}</span><b></b></div>`,
  ).join('');
  const setTile = (i, txt, cls) => {
    const e = $('a' + i);
    const b = e.lastChild;
    if (b.textContent !== txt) b.textContent = txt;
    e.className = 'tile ' + cls;
  };

  // heading-up vehicle view
  const view = $('view'),
    vctx = view.getContext('2d');
  function drawView() {
    const r = view.getBoundingClientRect();
    if (!r.width) return;
    if (view.width !== Math.round(r.width * DPR) || view.height !== Math.round(r.height * DPR)) {
      view.width = Math.round(r.width * DPR);
      view.height = Math.round(r.height * DPR);
    }
    const w = r.width,
      h = r.height,
      k = h / 40,
      cx = w / 2,
      cy = h * 0.82;
    const sn = Math.sin(car.th),
      cs = Math.cos(car.th);
    const P = (x, y) => {
      const dx = x - car.x,
        dy = y - car.y;
      return [cx + (dx * sn - dy * cs) * k, cy - (dx * cs + dy * sn) * k];
    };
    vctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    vctx.clearRect(0, 0, w, h);
    const bg = vctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0a0c10');
    bg.addColorStop(1, '#050608');
    vctx.fillStyle = bg;
    vctx.fillRect(0, 0, w, h);
    vctx.lineCap = 'round';
    vctx.lineJoin = 'round';
    // range rings
    vctx.strokeStyle = 'rgba(62,155,255,.10)';
    vctx.lineWidth = 1;
    for (const rr of [10, 20, 30]) {
      vctx.beginPath();
      vctx.arc(cx, cy, rr * k, 0, TAU);
      vctx.stroke();
    }
    const road2 = (off) => {
      vctx.beginPath();
      for (let x = car.x - 14, f = 1; x < car.x + 70; x += 2.5, f = 0) {
        const [px, py] = P(x, road(x) + off);
        f ? vctx.moveTo(px, py) : vctx.lineTo(px, py);
      }
      vctx.stroke();
    };
    vctx.strokeStyle = 'rgba(255,255,255,.07)';
    vctx.lineWidth = LANE_W * k;
    road2(0);
    vctx.strokeStyle = 'rgba(255,255,255,.35)';
    vctx.lineWidth = 1.2;
    road2(LANE_W / 2);
    road2(-LANE_W / 2);
    for (const f of feats) {
      if (f.x < car.x - 15 || f.x > car.x + 75) continue;
      if (f.type === 'cross') {
        vctx.strokeStyle = 'rgba(255,255,255,.38)';
        vctx.lineWidth = 0.7 * k;
        for (let q = -3; q <= 3; q++) {
          const [ax, ay] = P(...at(f.x - 1.4, q * 1.05)),
            [bx, by] = P(...at(f.x + 1.4, q * 1.05));
          vctx.beginPath();
          vctx.moveTo(ax, ay);
          vctx.lineTo(bx, by);
          vctx.stroke();
        }
      } else if (f.type === 'light') {
        const st = lightState(f),
          [ax, ay] = P(...at(f.x - 2.5, -LANE_W / 2)),
          [bx, by] = P(...at(f.x - 2.5, LANE_W / 2));
        vctx.strokeStyle = LC[st];
        vctx.lineWidth = 3;
        vctx.shadowColor = LC[st];
        vctx.shadowBlur = 10;
        vctx.beginPath();
        vctx.moveTo(ax, ay);
        vctx.lineTo(bx, by);
        vctx.stroke();
        vctx.shadowBlur = 0;
      } else {
        const [px, py] = P(...at(f.x, -(LANE_W / 2 + 1.8)));
        vctx.fillStyle = '#f5f5f7';
        vctx.beginPath();
        vctx.arc(px, py, 5, 0, TAU);
        vctx.fill();
        vctx.strokeStyle = '#e5322d';
        vctx.lineWidth = 1.5;
        vctx.beginPath();
        vctx.arc(px, py, 4, 0, TAU);
        vctx.stroke();
      }
    }
    // planned path
    vctx.strokeStyle = '#3e9bff';
    vctx.lineWidth = 3;
    vctx.shadowColor = '#3e9bff';
    vctx.shadowBlur = 10;
    vctx.beginPath();
    S.traj.forEach((p, i) => {
      const [px, py] = P(p[0], p[1]);
      i ? vctx.lineTo(px, py) : vctx.moveTo(px, py);
    });
    vctx.stroke();
    vctx.shadowBlur = 0;
    // obstacles
    for (const o of obstacles) {
      if (!o.seen) continue;
      const [px, py] = P(o.x, o.y),
        col = o.inRoi ? '#ff453a' : o.ped ? '#ffd6a5' : '#c9ced8';
      vctx.fillStyle = col;
      vctx.globalAlpha = 0.18;
      vctx.beginPath();
      vctx.arc(px, py, o.r * k * 2.2, 0, TAU);
      vctx.fill();
      vctx.globalAlpha = 1;
      vctx.beginPath();
      vctx.arc(px, py, Math.max(o.ped ? 2.5 : 3, o.r * k), 0, TAU);
      vctx.fill();
    }
    // ego vehicle
    vctx.save();
    vctx.translate(cx, cy);
    vctx.shadowColor = 'rgba(255,255,255,.35)';
    vctx.shadowBlur = 14;
    const L = 4.4 * k,
      Wd = 2 * k;
    const g = vctx.createLinearGradient(-Wd / 2, 0, Wd / 2, 0);
    g.addColorStop(0, '#9aa0ad');
    g.addColorStop(0.5, '#fff');
    g.addColorStop(1, '#9aa0ad');
    vctx.fillStyle = g;
    vctx.beginPath();
    vctx.roundRect(-Wd / 2, -L * 0.72, Wd, L, Wd * 0.35);
    vctx.fill();
    vctx.shadowBlur = 0;
    vctx.fillStyle = 'rgba(10,12,18,.85)';
    vctx.beginPath();
    vctx.roundRect(-Wd * 0.36, -L * 0.42, Wd * 0.72, L * 0.36, Wd * 0.18);
    vctx.fill();
    vctx.restore();
  }

  function updateDash() {
    const kmh = car.v * 3.6;
    $('dSpeed').textContent = kmh.toFixed(0);
    $('mSpeed').textContent = kmh.toFixed(0);
    $('mLim').textContent = S.limit;
    $('mStat').textContent = S.yielding
      ? 'Yielding'
      : S.stopFor === 'light'
        ? 'Red light'
        : 'Autonomous';
    $('gVal').setAttribute('stroke-dasharray', `${clamp(kmh / VMAX, 0, 1) * 100} 100`);
    const sd = A0 + SWEEP * clamp(S.limit / VMAX, 0, 1);
    $('gSet').setAttribute('d', arc(sd - 1.2, sd + 1.2, GR + 12));
    const st = car.steer / 0.5;
    const bs = $('bSteer');
    bs.style.left = (st < 0 ? 50 + st * 50 : 50) + '%';
    bs.style.width = Math.abs(st) * 50 + '%';
    $('tSteer').textContent = (-car.steer * 57.2958).toFixed(0) + '°';
    $('bPedal').style.width = Math.max(0, car.pedal) * 100 + '%';
    $('tPedal').textContent = Math.round(Math.max(0, car.pedal) * 100) + '%';
    $('pX').textContent = car.x.toFixed(0);
    $('pY').textContent = car.y.toFixed(1);
    $('pH').textContent = ((((car.th * 57.2958) % 360) + 360) % 360).toFixed(0) + '°';
    const seen = obstacles.filter((o) => o.seen);
    $('oN').textContent = seen.length;
    const near = seen.reduce((m, o) => Math.min(m, o.dist), Infinity);
    const od = $('oD');
    od.textContent = isFinite(near) ? near.toFixed(1) + ' m' : '—';
    od.classList.toggle(
      'hot',
      seen.some((o) => o.inRoi),
    );
    $('lN').textContent = Math.abs((S.lat || 0) * 100).toFixed(0);
    const lane = Math.abs(S.lat || 0);
    setTile(0, S.ttc < 3 ? 'Warning' : 'Clear', S.ttc < 3 ? 'warn' : '');
    setTile(1, S.aeb ? 'Braking' : 'Armed', S.aeb ? 'crit' : 'idle');
    setTile(2, lane < 1.2 ? 'Centered' : 'Avoiding', lane < 1.2 ? '' : 'warn');
    setTile(3, S.stopFor ? 'Stopping' : 'Active', S.stopFor ? 'warn' : '');
    setTile(4, seen.length ? 'Engaged' : 'Ready', seen.length ? 'warn' : '');
    setTile(5, S.score > 0.95 ? 'Good' : 'Fair', S.score > 0.95 ? '' : 'warn');
    const ls = S.lightState;
    setTile(
      6,
      ls ? ls[0].toUpperCase() + ls.slice(1) : 'None ahead',
      ls === 'red' ? 'crit' : ls === 'yellow' ? 'warn' : ls ? '' : 'idle',
    );
    const ln = S.limitNext;
    if (ln && ln.limit !== S.limit && ln.dist < 70)
      setTile(7, ln.limit + ' ahead', ln.limit < S.limit ? 'warn' : '');
    else setTile(7, S.limit + ' km/h', kmh > S.limit + 3 ? 'warn' : '');
    const pedNear = obstacles.some((o) => o.ped && o.seen);
    setTile(
      8,
      S.yielding ? 'Yielding' : pedNear ? 'Detected' : 'None ahead',
      S.yielding ? 'warn' : pedNear ? '' : 'idle',
    );
    const lim = $('lim');
    if (lim.textContent != S.limit) {
      lim.textContent = S.limit;
      lim.classList.add('pop');
      setTimeout(() => lim.classList.remove('pop'), 400);
    }
  }

  // ---------- boot ----------
  resize();
  cam.x = car.x + 14;
  cam.y = car.y;
  spawnFeatures();
  spawnAuto();
  for (let i = 0; i < 20; i++) step(0.05); // settle
  // ?stage=route opens the page with that stage held, used by the project chapters
  const wanted = STAGES.findIndex(
    (st) => st.id === new URLSearchParams(location.search).get('stage'),
  );
  if (wanted >= 0) {
    focus = wanted;
    locked = true;
  }
  renderCard();
  requestAnimationFrame(frame);
  setTimeout(() => hint.classList.add('gone'), 12000);
})();
