import { $, FONT, TAU, clamp, lerp } from './common.js';
import { mulberry32 } from '../core/random.js';
import { drawCarSprite } from './sprites.js';
import {
  Series,
  buildRail,
  drawChart,
  setMetrics,
  setStatus,
  setTile,
  sizeCanvas,
  startLoop,
} from './kit.js';

/*
 * Watchdog. The driving software is a chain of components. Each one reports a heartbeat to the
 * watchdog, which also watches how late their messages are and how hard their processors work.
 * Five situations play out: all well, a late message, a component that stops, an overload, and a
 * fault that cannot be repaired. The watchdog decides what the vehicle does in each.
 */

const WD = '#ff375f';
const AMBER = '#ffb547';
const RED = '#ff5d6c';
const OK = '#30d158';
const BEAT = 0.5; // seconds between heartbeats
const LOST_AFTER = 1.5; // silence that counts as lost
const DEADLINE = 30; // ms a message may take

const rnd = mulberry32(5);

/** The components, in the order of the chapters. */
const NODES = [
  { id: 'sen', name: 'Sensors', color: '#8fa0bd', hz: 20 },
  { id: 'map', name: 'Mapping', color: '#3e9bff', hz: 2 },
  { id: 'loc', name: 'Localization', color: '#bf5af2', hz: 20 },
  { id: 'per', name: 'Perception', color: '#5ac8fa', hz: 10 },
  { id: 'trk', name: 'Tracking', color: '#2dd4bf', hz: 20 },
  { id: 'rte', name: 'Route Planning', color: '#30d158', hz: 5 },
  { id: 'pth', name: 'Path Tracking', color: '#ffd60a', hz: 50 },
  { id: 'veh', name: 'Vehicle Interface', color: '#ff9f0a', hz: 50 },
];
const SHORT = {
  sen: 'Sensors',
  map: 'Mapping',
  loc: 'Locali-sation',
  per: 'Percep-tion',
  trk: 'Tracking',
  rte: 'Route',
  pth: 'Path',
  veh: 'Vehicle',
};
const EDGES = [
  ['sen', 'loc'],
  ['map', 'loc'],
  ['sen', 'per'],
  ['loc', 'rte'],
  ['per', 'trk'],
  ['trk', 'rte'],
  ['rte', 'pth'],
  ['loc', 'pth'],
  ['pth', 'veh'],
];
const byId = {};
NODES.forEach((n, i) => {
  Object.assign(n, {
    i,
    st: 'ok', // what is really happening: ok late dead starting hot
    watch: 'ok', // what the watchdog believes: ok late lost restarting hot failed
    silent: false,
    next: rnd() * BEAT,
    seen: 0,
    lat: 12,
    latT: 12,
    cpu: 40,
    cpuT: 40,
    temp: 55,
    tempT: 55,
    rate: n.hz,
    restartAt: -1,
    backAt: -1,
    fails: 0,
    flag: 0,
  });
  byId[n.id] = n;
});

/* ---------- canvas ---------- */
const cv = $('scene');
const g = cv.getContext('2d');
let W = 0;
let H = 0;
let DPR = 1;
function resize() {
  const s = sizeCanvas(cv);
  W = s.w;
  H = s.h;
  DPR = s.dpr;
}
addEventListener('resize', resize);

/* ---------- state ---------- */
let T = 0; // seconds since the page opened
let sT = 0; // seconds since this situation began
let scen = 0;
let locked = false;
let endAt = 0;
const wd = { mode: 'Healthy', restarts: 0, faults: 0, safe: false, modeT: 0 };
const veh = { v: 40, target: 40, hazard: false };
const pulses = []; // heartbeats on their way to the watchdog
const packets = []; // data moving along the edges
const commands = []; // restart commands on their way to a component
const beats = {};
const misses = {};
NODES.forEach((n) => {
  beats[n.id] = [];
  misses[n.id] = [];
});
const latSeries = new Series(12);
const log = [];
let fired = new Set();

function pushLog(text, kind = '') {
  log.unshift({ t: sT, text, kind });
  if (log.length > 5) log.pop();
  const ol = $('logList');
  ol.innerHTML = log
    .map((l) => `<li class="${l.kind}"><time>${l.t.toFixed(1)}s</time><span>${l.text}</span></li>`)
    .join('');
}

function resetAll() {
  for (const n of NODES) {
    Object.assign(n, {
      st: 'ok',
      watch: 'ok',
      silent: false,
      seen: T,
      lat: 12,
      latT: 12,
      cpu: 40,
      cpuT: 40,
      temp: 55,
      tempT: 55,
      rate: n.hz,
      restartAt: -1,
      backAt: -1,
      fails: 0,
      flag: 0,
    });
  }
  wd.mode = 'Healthy';
  wd.safe = false;
  veh.target = 40;
  veh.hazard = false;
  fired = new Set();
  commands.length = 0;
}

/* ---------- the situations ---------- */
const SCEN = [
  {
    name: 'Heartbeats',
    title: 'Everyone reports in',
    desc: 'Each component sends a heartbeat to the watchdog several times a second, so it always knows who is alive.',
    dur: 11,
    script: [],
  },
  {
    name: 'Late messages',
    title: 'Catching what arrives late',
    desc: 'A message that comes after its deadline is as bad as a missing one. The watchdog times every message and slows the vehicle while one is late.',
    dur: 12,
    script: [
      [1.5, () => (byId.loc.latT = 66)],
      [6.8, () => (byId.loc.latT = 13)],
    ],
  },
  {
    name: 'A component stops',
    title: 'Noticing and restarting',
    desc: 'When a component goes silent the watchdog notices within a second and a half, slows the vehicle, restarts it and lets it carry on.',
    dur: 13,
    script: [[1.5, () => crash('per', 0)]],
  },
  {
    name: 'Overload',
    title: 'Keeping the load in check',
    desc: 'It watches processor load and temperature too. When one component works too hard it sheds work before anything fails.',
    dur: 12,
    script: [
      [1.0, () => (byId.trk.cpuT = 98) && (byId.trk.tempT = 87)],
      [7.5, () => relax()],
    ],
  },
  {
    name: 'Safe stop',
    title: 'Stopping safely when it must',
    desc: 'If a component cannot be repaired, the watchdog does not gamble. It brings the vehicle to a controlled stop and keeps it there.',
    dur: 15,
    script: [[1.2, () => crash('veh', 2)]],
  },
];
function crash(id, fails) {
  const n = byId[id];
  n.silent = true;
  n.st = 'dead';
  n.fails = fails;
}
function relax() {
  const n = byId.trk;
  n.cpuT = 44;
  n.tempT = 56;
  n.rate = n.hz;
  n.flag = 0;
}

const rail = buildRail(
  SCEN.map((s) => s.name),
  (i) => {
    locked = true;
    play(i);
  },
);
function play(i) {
  scen = i;
  sT = 0;
  endAt = SCEN[i].dur;
  resetAll();
  log.length = 0;
  pushLog(i === 0 ? 'All components reporting' : `Situation: ${SCEN[i].name.toLowerCase()}`, 'ok');
  $('dName').textContent = SCEN[i].title;
  $('dDesc').textContent = SCEN[i].desc;
}

/* ---------- what the watchdog does ---------- */
function watch(dt) {
  let worst = 'Healthy';
  for (const n of NODES) {
    // the heartbeat
    n.next -= dt;
    if (n.next <= 0) {
      n.next += BEAT;
      if (!n.silent && n.st !== 'starting') {
        n.seen = T;
        beats[n.id].push(T);
        pulses.push({ id: n.id, t: 0 });
        n.flash = 1;
      } else misses[n.id].push(T);
    }
    n.flash = Math.max(0, (n.flash || 0) - dt * 4);
    // measured values drift towards their targets
    n.lat = lerp(n.lat, n.latT + (n.st === 'dead' ? 0 : (rnd() - 0.5) * 3), 1 - Math.exp(-dt * 3));
    n.cpu = lerp(n.cpu, n.cpuT, 1 - Math.exp(-dt * 0.8));
    n.temp = lerp(n.temp, n.tempT, 1 - Math.exp(-dt * 0.35));

    const silentFor = T - n.seen;
    // silence
    if (n.watch === 'ok' || n.watch === 'late' || n.watch === 'hot') {
      if (silentFor > LOST_AFTER) {
        n.watch = 'lost';
        n.restartAt = T + 1.0;
        wd.faults++;
        pushLog(`${n.name} stopped reporting`, 'bad');
      }
    }
    // restart
    if (n.watch === 'lost' && T >= n.restartAt) {
      n.watch = 'restarting';
      n.st = 'starting';
      n.backAt = T + 1.5;
      wd.restarts++;
      commands.push({ id: n.id, t: 0 });
      pushLog(`Restarting ${n.name}`, 'warn');
    }
    if (n.watch === 'restarting' && T >= n.backAt) {
      if (n.fails > 0) {
        n.fails--;
        n.st = 'dead';
        pushLog(`${n.name} did not start`, 'bad');
        if (n.fails === 0 && n.id === 'veh') {
          n.watch = 'failed';
          wd.safe = true;
          pushLog('Cannot recover. Stopping safely', 'bad');
        } else {
          n.watch = 'lost';
          n.restartAt = T + 1.6;
        }
      } else {
        n.silent = false;
        n.st = 'ok';
        n.watch = 'ok';
        n.seen = T;
        pushLog(`${n.name} is back`, 'ok');
      }
    }
    // timing, for the component that reports it
    if (n.id === 'loc' && (n.watch === 'ok' || n.watch === 'late')) {
      if (n.lat > DEADLINE) {
        n.flag += dt;
        if (n.watch === 'ok' && n.flag > 0.35) {
          n.watch = 'late';
          n.st = 'late';
          wd.faults++;
          pushLog(`Localization late: ${Math.round(n.lat)} ms, limit ${DEADLINE}`, 'warn');
        }
      } else {
        n.flag = 0;
        if (n.watch === 'late') {
          n.watch = 'ok';
          n.st = 'ok';
          pushLog('Localization back on time', 'ok');
        }
      }
    }
    // health
    if (n.id === 'trk' && (n.watch === 'ok' || n.watch === 'hot')) {
      if (n.cpu > 90 && n.watch === 'ok') {
        n.flag += dt;
        n.st = 'hot';
        if (n.flag > 0.5) {
          n.watch = 'hot';
          wd.faults++;
          pushLog(`Tracking overloaded: ${Math.round(n.cpu)}% CPU`, 'warn');
          n.shedAt = T + 1.2;
        }
      }
      if (n.watch === 'hot' && n.shedAt && T >= n.shedAt) {
        n.shedAt = 0;
        n.rate = 10;
        n.cpuT = 66;
        n.tempT = 72;
        pushLog('Lowering tracking rate to 10 Hz', 'warn');
      }
      if (n.watch === 'hot' && n.cpu < 75) {
        n.watch = 'ok';
        n.st = 'ok';
        n.flag = 0;
        pushLog('Load back to normal', 'ok');
      }
      if (n.watch === 'ok' && n.cpu <= 90 && n.st === 'hot') n.st = 'ok';
    }
    const rank = { ok: 0, late: 1, hot: 1, restarting: 2, lost: 2, failed: 2 }[n.watch];
    if (rank === 1 && worst === 'Healthy') worst = 'Degraded';
    if (rank === 2) worst = 'Recovering';
  }
  if (wd.safe) worst = 'Safe stop';
  if (worst !== wd.mode) {
    wd.mode = worst;
    wd.modeT = T;
    if (worst === 'Healthy') pushLog('Back to normal driving', 'ok');
  }
  veh.target = { Healthy: 40, Degraded: 28, Recovering: 12, 'Safe stop': 0 }[wd.mode];
  veh.hazard = wd.mode === 'Safe stop' || wd.mode === 'Recovering';
  veh.v = lerp(veh.v, veh.target, 1 - Math.exp(-dt * (wd.mode === 'Safe stop' ? 0.7 : 1.1)));

  // data on the edges
  for (const [a, b] of EDGES) {
    const A = byId[a];
    if (A.silent || A.st === 'starting') continue;
    A.sendT = (A.sendT || rnd() * 0.3) - dt;
    if (A.sendT <= 0) {
      A.sendT = A.st === 'late' ? 0.55 : 0.32;
      packets.push({ a, b, t: 0, late: A.st === 'late' });
    }
  }
  for (const p of packets) p.t += dt * (p.late ? 0.35 : 0.7);
  while (packets.length && packets[0].t > 1) packets.shift();
  for (const p of pulses) p.t += dt * 1.6;
  while (pulses.length && pulses[0].t > 1) pulses.shift();
  for (const c of commands) c.t += dt * 1.4;
  while (commands.length && commands[0].t > 1) commands.shift();
  for (const n of NODES) {
    beats[n.id] = beats[n.id].filter((t) => t > T - 12.5);
    misses[n.id] = misses[n.id].filter((t) => t > T - 12.5);
  }
}

function update(dt) {
  T += dt;
  sT += dt;
  for (const [at, fn] of SCEN[scen].script) {
    const key = `${scen}:${at}`;
    if (sT >= at && !fired.has(key)) {
      fired.add(key);
      fn();
    }
  }
  watch(dt);
  if (sT > endAt) {
    if (!locked) play((scen + 1) % SCEN.length);
    else if (sT > endAt + 1.5) play(scen);
  }
  latSeries.push(T, { lat: byId.loc.lat, limit: DEADLINE });
}

/* ---------- layout ---------- */
function layout() {
  const compact = W < 800;
  const rects = {};
  let band;
  if (!compact) {
    const x0 = 40;
    const x1 = W >= 1100 ? Math.min(W - 40, 960) : W - 40;
    const gap = 16;
    const w = (x1 - x0 - gap * 7) / 8;
    const h = 74;
    const y = clamp(H * 0.43, 290, 410);
    NODES.forEach((n, i) => (rects[n.id] = { x: x0 + i * (w + gap), y, w, h }));
    band = { x: x0, y: y + h + 70, w: x1 - x0, h: 50 };
  } else {
    const x0 = 12;
    const gap = 8;
    const w = (W - 24 - gap * 3) / 4;
    const h = 50;
    const y0 = 132;
    NODES.forEach((n, i) => {
      const row = i < 4 ? 0 : 1;
      rects[n.id] = { x: x0 + (i % 4) * (w + gap), y: y0 + row * (h + 38), w, h };
    });
    band = { x: x0, y: y0 + 2 * (h + 38) + 6, w: W - 24, h: 38 };
  }
  return { rects, band, compact };
}

/* ---------- drawing ---------- */
const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};
const STATE_COLOR = { ok: null, late: AMBER, dead: RED, starting: AMBER, hot: '#ff8a3d' };

function bez(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}
function edgePts(L, a, b) {
  const A = L.rects[a];
  const B = L.rects[b];
  const ia = byId[a].i;
  const ib = byId[b].i;
  const span = Math.abs(ib - ia);
  const sameRow = Math.abs(A.y - B.y) < 2;
  if (span === 1 && sameRow) {
    const y = A.y + A.h / 2;
    const p0 = [A.x + A.w, y];
    const p3 = [B.x, y];
    return [p0, [lerp(p0[0], p3[0], 0.33), y], [lerp(p0[0], p3[0], 0.66), y], p3];
  }
  if (L.compact) {
    // the row change: from the end of one row to the start of the next
    const p0 = [A.x + A.w / 2, A.y + A.h];
    const p3 = [B.x + B.w / 2, B.y];
    return [p0, [p0[0], lerp(p0[1], p3[1], 0.5)], [p3[0], lerp(p0[1], p3[1], 0.5)], p3];
  }
  const lift = 26 + span * 17;
  const p0 = [A.x + A.w / 2, A.y];
  const p3 = [B.x + B.w / 2, B.y];
  return [p0, [p0[0], p0[1] - lift], [p3[0], p3[1] - lift], p3];
}

function drawEdges(L) {
  for (const [a, b] of EDGES) {
    const A = byId[a];
    if (L.compact && Math.abs(byId[b].i - A.i) !== 1) continue;
    const pts = edgePts(L, a, b);
    const dead = A.silent || A.st === 'starting';
    g.beginPath();
    g.moveTo(...pts[0]);
    g.bezierCurveTo(...pts[1], ...pts[2], ...pts[3]);
    g.strokeStyle = dead ? rgba(RED, 0.5) : rgba(A.color, 0.28);
    g.lineWidth = 1.3;
    g.setLineDash(dead ? [4, 5] : []);
    g.stroke();
    g.setLineDash([]);
  }
  for (const p of packets) {
    if (L.compact && Math.abs(byId[p.b].i - byId[p.a].i) !== 1) continue;
    const pts = edgePts(L, p.a, p.b);
    const [x, y] = bez(...pts, p.t);
    g.fillStyle = p.late ? AMBER : '#9bbcff';
    g.shadowColor = p.late ? AMBER : '#9bbcff';
    g.shadowBlur = 8;
    g.beginPath();
    g.arc(x, y, p.late ? 3.4 : 2.6, 0, TAU);
    g.fill();
    g.shadowBlur = 0;
  }
}

function drawNode(L, n) {
  const r = L.rects[n.id];
  const c = STATE_COLOR[n.st] || n.color;
  const pulse = n.st === 'starting' ? 0.5 + 0.5 * Math.sin(T * 8) : 0;
  g.save();
  g.beginPath();
  g.roundRect(r.x, r.y, r.w, r.h, 12);
  g.fillStyle = n.st === 'dead' ? 'rgba(255,93,108,.08)' : 'rgba(14,20,33,.78)';
  g.fill();
  g.lineWidth = 1.4;
  g.strokeStyle = rgba(c, n.st === 'starting' ? 0.5 + 0.5 * pulse : 0.85);
  g.setLineDash(n.st === 'dead' ? [5, 4] : []);
  if (n.st === 'hot') {
    g.shadowColor = c;
    g.shadowBlur = 14 + 6 * Math.sin(T * 6);
  } else if (n.flash > 0) {
    g.shadowColor = WD;
    g.shadowBlur = 16 * n.flash;
  }
  g.stroke();
  g.restore();
  g.setLineDash([]);

  // the accent
  g.fillStyle = rgba(c, 0.9);
  g.beginPath();
  g.roundRect(r.x + 8, r.y + 10, 3, r.h - 20, 2);
  g.fill();

  // names
  const compact = L.compact;
  g.fillStyle = n.st === 'dead' ? '#ffb3bb' : '#f3f6fb';
  g.font = `600 ${compact ? 10 : 13}px ${FONT}`;
  g.textBaseline = 'alphabetic';
  const label = compact ? SHORT[n.id].replace('-', '') : n.name;
  const words = label.split(' ');
  const maxW = r.w - 24;
  let fs = compact ? 10 : 13;
  let lines = [label];
  if (words.length > 1 && g.measureText(label).width > maxW)
    lines = [words[0], words.slice(1).join(' ')];
  // a long single word shrinks to fit rather than breaking in the middle
  while (fs > 8.5 && Math.max(...lines.map((ln) => g.measureText(ln).width)) > maxW) {
    fs -= 0.5;
    g.font = `600 ${fs}px ${FONT}`;
  }
  const ty = r.y + (compact ? (lines.length > 1 ? 21 : 26) : lines.length > 1 ? 26 : 32);
  lines.forEach((ln, k) => g.fillText(ln, r.x + 18, ty + k * (compact ? 11 : 15)));

  // the small line under the name
  g.font = `500 ${compact ? 9 : 11.5}px ${FONT}`;
  let sub = `${n.rate} Hz`;
  let subc = '#7a88a0';
  if (n.st === 'late') {
    sub = `Late ${Math.round(n.lat)} ms`;
    subc = AMBER;
  } else if (n.st === 'dead') {
    sub = 'No heartbeat';
    subc = RED;
  } else if (n.st === 'starting') {
    sub = 'Restarting…';
    subc = AMBER;
  } else if (n.st === 'hot') {
    sub = `CPU ${Math.round(n.cpu)}%`;
    subc = '#ff8a3d';
  }
  g.fillStyle = subc;
  g.fillText(sub, r.x + 18, r.y + r.h - 10);

  // a ring that shows processor load, for the one under watch
  if (n.id === 'trk' && !compact) {
    const cx = r.x + r.w - 17;
    const cy = r.y + 17;
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(255,255,255,.1)';
    g.beginPath();
    g.arc(cx, cy, 8, 0, TAU);
    g.stroke();
    g.strokeStyle = n.cpu > 90 ? '#ff8a3d' : n.color;
    g.beginPath();
    g.arc(cx, cy, 8, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(n.cpu / 100, 0, 1));
    g.stroke();
  }
}

function drawWatchdog(L) {
  const b = L.band;
  const c = wd.mode === 'Safe stop' ? RED : wd.mode === 'Healthy' ? WD : AMBER;
  g.save();
  g.beginPath();
  g.roundRect(b.x, b.y, b.w, b.h, 16);
  const gr = g.createLinearGradient(b.x, 0, b.x + b.w, 0);
  gr.addColorStop(0, rgba(c, 0.18));
  gr.addColorStop(1, rgba(c, 0.05));
  g.fillStyle = gr;
  g.fill();
  g.strokeStyle = rgba(c, 0.7);
  g.lineWidth = 1.5;
  g.shadowColor = c;
  g.shadowBlur = 14;
  g.stroke();
  g.restore();
  // a slow scan along the band
  const sx = b.x + ((T * 90) % (b.w + 80)) - 40;
  const sg = g.createLinearGradient(sx - 40, 0, sx + 40, 0);
  sg.addColorStop(0, rgba(c, 0));
  sg.addColorStop(0.5, rgba(c, 0.22));
  sg.addColorStop(1, rgba(c, 0));
  g.save();
  g.beginPath();
  g.roundRect(b.x, b.y, b.w, b.h, 16);
  g.clip();
  g.fillStyle = sg;
  g.fillRect(sx - 40, b.y, 80, b.h);
  g.restore();
  g.fillStyle = '#fff';
  g.font = `600 ${L.compact ? 12 : 14}px ${FONT}`;
  g.textBaseline = 'middle';
  g.fillText('Watchdog', b.x + 18, b.y + b.h / 2 - (L.compact ? 0 : 0));
  g.font = `500 ${L.compact ? 10.5 : 12}px ${FONT}`;
  g.fillStyle = rgba(c, 1);
  g.textAlign = 'right';
  g.fillText(wd.mode, b.x + b.w - 16, b.y + b.h / 2);
  g.textAlign = 'left';
}

function drawSpokes(L) {
  const b = L.band;
  for (const n of NODES) {
    const r = L.rects[n.id];
    const x = r.x + r.w / 2;
    const y0 = r.y + r.h;
    const col =
      n.watch === 'ok' || n.watch === 'late' || n.watch === 'hot'
        ? WD
        : n.watch === 'restarting'
          ? AMBER
          : RED;
    if (!L.compact) {
      g.beginPath();
      g.moveTo(x, y0);
      g.lineTo(x, b.y);
      g.strokeStyle = rgba(col, n.watch === 'ok' ? 0.22 : 0.5);
      g.setLineDash(n.watch === 'lost' || n.watch === 'failed' ? [3, 4] : []);
      g.lineWidth = 1.2;
      g.stroke();
      g.setLineDash([]);
    }
    // a missed beat shows as a small cross
    const recent = misses[n.id].filter((t) => T - t < 0.7);
    if (recent.length) {
      const my = L.compact ? y0 + 10 : (y0 + b.y) / 2;
      g.strokeStyle = RED;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x - 4, my - 4);
      g.lineTo(x + 4, my + 4);
      g.moveTo(x + 4, my - 4);
      g.lineTo(x - 4, my + 4);
      g.stroke();
    }
  }
  for (const p of pulses) {
    const r = L.rects[p.id];
    const x0 = r.x + r.w / 2;
    const y0 = r.y + r.h;
    const x = lerp(x0, x0, p.t);
    const y = lerp(y0, b.y + 2, p.t);
    g.fillStyle = WD;
    g.shadowColor = WD;
    g.shadowBlur = 10;
    g.globalAlpha = 1 - p.t * 0.4;
    g.beginPath();
    g.arc(x, y, 3, 0, TAU);
    g.fill();
    g.globalAlpha = 1;
    g.shadowBlur = 0;
  }
  for (const c of commands) {
    const r = L.rects[c.id];
    const x = r.x + r.w / 2;
    const y = lerp(b.y, r.y + r.h, c.t);
    g.fillStyle = '#5ee0ff';
    g.shadowColor = '#5ee0ff';
    g.shadowBlur = 12;
    g.beginPath();
    g.arc(x, y, 4, 0, TAU);
    g.fill();
    g.shadowBlur = 0;
  }
}

/** The vehicle the watchdog is looking after: what it is doing and how fast. */
function drawVehicle(L) {
  if (L.compact) return;
  const x = 40;
  const y = 150;
  const w = 268;
  const h = 70;
  const c = wd.mode === 'Healthy' ? OK : wd.mode === 'Safe stop' ? RED : AMBER;
  g.save();
  g.beginPath();
  g.roundRect(x, y, w, h, 16);
  g.fillStyle = 'rgba(14,20,33,.6)';
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,.1)';
  g.lineWidth = 1;
  g.stroke();
  g.restore();
  drawCarSprite(g, x + 22, y + h / 2, 0, 8, { brake: veh.v > veh.target + 1 });
  if (veh.hazard && (T * 2.4) % 1 < 0.5) {
    g.fillStyle = AMBER;
    g.shadowColor = AMBER;
    g.shadowBlur = 10;
    for (const [dx, dy] of [
      [-8, -9],
      [-8, 9],
      [30, -9],
      [30, 9],
    ]) {
      g.beginPath();
      g.arc(x + 22 + dx, y + h / 2 + dy, 2.4, 0, TAU);
      g.fill();
    }
    g.shadowBlur = 0;
  }
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#fff';
  g.font = `600 14px ${FONT}`;
  g.fillText(wd.mode === 'Healthy' ? 'Autonomous' : wd.mode, x + 74, y + 28);
  g.fillStyle = '#93a0b8';
  g.font = `500 12px ${FONT}`;
  g.fillText(`${Math.round(veh.v)} km/h`, x + 74, y + 46);
  g.fillStyle = 'rgba(255,255,255,.1)';
  g.beginPath();
  g.roundRect(x + 74, y + 54, w - 92, 4, 2);
  g.fill();
  g.fillStyle = c;
  g.beginPath();
  g.roundRect(x + 74, y + 54, (w - 92) * clamp(veh.v / 40, 0, 1), 4, 2);
  g.fill();
}

function draw() {
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.fillStyle = '#05060a';
  g.fillRect(0, 0, W, H);
  const bg = g.createRadialGradient(
    W * 0.35,
    H * 0.45,
    0,
    W * 0.35,
    H * 0.45,
    Math.max(W, H) * 0.7,
  );
  bg.addColorStop(0, '#0d1118');
  bg.addColorStop(1, '#05060a');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  const L = layout();
  drawEdges(L);
  drawSpokes(L);
  drawWatchdog(L);
  for (const n of NODES) drawNode(L, n);
  drawVehicle(L);
  drawBeats();
  ui();
}

/* ---------- the heartbeat timeline ---------- */
function drawBeats() {
  const cvb = $('chB');
  const { w, h, dpr } = sizeCanvas(cvb);
  const c = cvb.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  const labelW = w < 360 ? 34 : 70;
  const rowH = (h - 4) / NODES.length;
  const X = (t) => labelW + ((t - (T - 12)) / 12) * (w - labelW - 4);
  c.font = `10px ${FONT}`;
  c.textBaseline = 'middle';
  NODES.forEach((n, i) => {
    const y = 2 + i * rowH + rowH / 2;
    c.fillStyle = 'rgba(143,160,189,.7)';
    c.fillText(
      w < 360 ? n.id.toUpperCase() : n.name.length > 12 ? n.name.slice(0, 11) + '…' : n.name,
      0,
      y,
    );
    c.strokeStyle = 'rgba(255,255,255,.05)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(labelW, y);
    c.lineTo(w - 4, y);
    c.stroke();
    c.strokeStyle = WD;
    c.lineWidth = 2;
    c.beginPath();
    for (const t of beats[n.id]) {
      const x = X(t);
      if (x < labelW) continue;
      c.moveTo(x, y - rowH * 0.3);
      c.lineTo(x, y + rowH * 0.3);
    }
    c.stroke();
    c.strokeStyle = RED;
    c.beginPath();
    for (const t of misses[n.id]) {
      const x = X(t);
      if (x < labelW) continue;
      c.moveTo(x - 2.5, y - 2.5);
      c.lineTo(x + 2.5, y + 2.5);
      c.moveTo(x + 2.5, y - 2.5);
      c.lineTo(x - 2.5, y + 2.5);
    }
    c.stroke();
  });
}

/* ---------- dock ---------- */
let lastUi = 0;
function ui() {
  const now = performance.now();
  if (now - lastUi < 100) return;
  lastUi = now;
  const alive = NODES.filter((n) => !n.silent && n.st !== 'starting').length;
  $('dAlive').innerHTML = `${alive}<small>/ 8</small>`;
  $('dVeh').textContent = wd.mode === 'Healthy' ? 'Autonomous' : wd.mode;
  $('dSpd').textContent = `${Math.round(veh.v)} km/h`;
  $('dRst').textContent = wd.restarts;
  $('logMode').textContent = wd.mode === 'Healthy' ? 'Autonomous' : wd.mode;
  const lost = NODES.find((n) => n.watch === 'lost' || n.watch === 'restarting');
  const late = byId.loc.watch === 'late';
  const hot = byId.trk.watch === 'hot';
  const rows = [
    [
      ['Heartbeat', `${BEAT * 1000} ms`],
      ['Alive', `${alive} of 8`],
      ['Timeout', `${LOST_AFTER} s`],
    ],
    [
      ['Localization', `${Math.round(byId.loc.lat)} ms`],
      ['Limit', `${DEADLINE} ms`],
      ['Vehicle speed', `${Math.round(veh.v)} km/h`],
    ],
    [
      ['Component', lost ? lost.name : 'None'],
      ['State', lost ? (lost.watch === 'lost' ? 'Lost' : 'Restarting') : 'Fine'],
      ['Restarts', wd.restarts],
    ],
    [
      ['Tracking load', `${Math.round(byId.trk.cpu)}%`],
      ['Temperature', `${Math.round(byId.trk.temp)}°C`],
      ['Tracking rate', `${byId.trk.rate} Hz`],
    ],
    [
      ['Vehicle', wd.mode === 'Safe stop' ? 'Stopping' : 'Driving'],
      ['Speed', `${Math.round(veh.v)} km/h`],
      ['Hazard lights', veh.hazard ? 'On' : 'Off'],
    ],
  ][scen];
  setMetrics(rows);
  setTile(
    't-live',
    alive === 8 ? 'All 8 alive' : `${alive} of 8 alive`,
    scen === 0 || scen === 2 || scen === 4,
    alive === 8 ? '' : 'r',
  );
  setTile(
    't-time',
    late ? `Late ${Math.round(byId.loc.lat)} ms` : 'On time',
    scen === 1,
    late ? 'a' : '',
  );
  setTile('t-hlth', `CPU ${Math.round(byId.trk.cpu)}%`, scen === 3, hot ? 'a' : '');
  setTile(
    't-rec',
    lost ? (lost.watch === 'lost' ? 'Waiting' : 'Restarting') : 'Idle',
    scen === 2,
    lost ? 'a' : '',
  );
  setTile(
    't-fall',
    wd.mode === 'Healthy'
      ? 'None'
      : wd.mode === 'Safe stop'
        ? 'Safe stop'
        : wd.mode === 'Recovering'
          ? 'Slow'
          : 'Reduced',
    scen === 4,
    wd.mode === 'Healthy' ? '' : wd.mode === 'Safe stop' ? 'r' : 'a',
  );
  setTile('t-flt', String(wd.faults), false, wd.faults ? 'a' : '');
  const cls = wd.mode === 'Healthy' ? 'info' : wd.mode === 'Safe stop' ? 'bad' : 'warn';
  const msg =
    wd.mode === 'Healthy'
      ? 'All systems healthy'
      : wd.mode === 'Safe stop'
        ? 'Safe stop · braking'
        : wd.mode === 'Recovering'
          ? `${lost ? lost.name : 'A component'} is down · slowing`
          : late
            ? 'Message late · slowing'
            : 'Overloaded · easing off';
  setStatus(cls, `${msg} · ${Math.round(veh.v)} km/h`);
  rail.set(scen, locked ? 0 : clamp(sT / SCEN[scen].dur, 0, 1));
  drawChart(
    $('chL'),
    latSeries,
    [
      { key: 'limit', color: '#8fa0bd', dash: [4, 4], width: 1.3 },
      { key: 'lat', color: '#3e9bff', fill: ['rgba(62,155,255,.26)', 'rgba(62,155,255,0)'] },
    ],
    { min: 0, max: 80, ticks: [0, 30, 60] },
  );
}

/* ---------- start ---------- */
resize();
play(0);
startLoop(update, draw);

/* Test hooks, only with ?debug in the address. */
if (new URLSearchParams(location.search).has('debug')) {
  window.__sim = (sec) => {
    for (let t = 0; t < sec; t += 1 / 60) update(1 / 60);
  };
  window.__go = (i) => {
    locked = true;
    play(i);
  };
  window.__dbg = () => ({
    scen,
    sT,
    mode: wd.mode,
    restarts: wd.restarts,
    faults: wd.faults,
    alive: NODES.filter((n) => !n.silent && n.st !== 'starting').length,
    v: veh.v,
    states: Object.fromEntries(NODES.map((n) => [n.id, `${n.st}/${n.watch}`])),
  });
}
