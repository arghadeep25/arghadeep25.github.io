import { UkfTracker, predictPath } from '../../algos/ukf-tracker.js';
import { buildRoute } from '../../algos/grid-route.js';
import { stopSpeed } from '../../algos/behavior.js';
import { mulberry32 } from '../../core/random.js';
import { drawBrackets, drawCarSprite, drawPedSprite } from '../../demos/sprites.js';
import { approach, noisy } from './common.js';

/*
 * A food delivery robot on the pavement. It follows the pavement to a crossing, waits for the
 * walking signal and for the cars to stop, crosses, carries on to a door and delivers. People on
 * the pavement are detected and tracked; it slows for them and steps aside from anyone coming
 * the other way.
 */

const WORLD = { w: 40, h: 26 };
const ROAD = { y0: 7, y1: 17 };
const CROSS = { x0: 22, x1: 26 };
const LANES = { west: 10, east: 14 };
const V_WALK = 1.7;
const RANGE = 11;
const CYCLE = 18;
// phases of the signal, in seconds
const T_CAR_GREEN = 9;
const T_CAR_YELLOW = 10.5;
const T_WALK = 15.5;

export function createRobot(seed = 5) {
  const rnd = mulberry32(seed);
  const between = (a, b) => a + (b - a) * rnd();
  const pts = [
    [2, 21.5],
    [24, 21.5],
    [24, 3.6],
    [36.5, 3.6],
  ].map(([x, y]) => ({ x, y }));
  const route = buildRoute(pts, { offset: 0, radius: 1.8, step: 0.25 });
  const crossStart = route.project(24, 18.2).s;
  const crossEnd = route.project(24, 6).s;
  const L = route.length;

  const tracker = new UkfTracker({ maxCoast: 8, noise: { accel: 1.4, yawAccel: 2.2, meas: 0.35 } });
  const bot = { s: 0, lat: 0, v: 0, state: 'go', wait: 0, x: 2, y: 21.5, th: 0 };
  let walkers = [];
  let cars = [];
  let clock = 0;
  let nextWalker = 0.5;
  let nextCar = 1;
  let tick = 0;
  let note = 'On the way';
  let delivered = 0;
  const chips = {
    map: true,
    locate: true,
    detect: false,
    track: false,
    plan: false,
    path: false,
    watch: true,
  };

  const phase = () => clock % CYCLE;
  const carsGo = () => phase() < T_CAR_YELLOW;
  const walk = () => phase() >= T_CAR_YELLOW + 0.6 && phase() < T_WALK;

  function spawnWalker(initial) {
    const rows = [
      { y: 2.9, dir: 1 },
      { y: 5.3, dir: -1 },
      { y: 19.4, dir: 1 },
      { y: 23, dir: -1 },
    ];
    const r = rows[Math.floor(rnd() * rows.length)];
    walkers.push({
      x: initial ? between(2, 38) : r.dir > 0 ? -1 : 41,
      y: r.y + (rnd() - 0.5) * 0.5,
      vx: r.dir * between(1.1, 1.5),
      vy: 0,
      cross: false,
    });
    return walkers[walkers.length - 1];
  }

  function update(dt) {
    clock += dt;

    // people on the pavement, and now and then someone crossing with the signal
    nextWalker -= dt;
    if (nextWalker <= 0 && walkers.length < 7) {
      spawnWalker(false);
      nextWalker = between(2.4, 4.2);
    }
    if (walk() && !walkers.some((w) => w.cross) && rnd() < 0.02) {
      const up = rnd() < 0.5;
      walkers.push({
        x: between(22.6, 25.4),
        y: up ? 19.5 : 4.5,
        vx: 0,
        vy: up ? -1.4 : 1.4,
        cross: true,
      });
    }
    for (const w of walkers) {
      w.x += w.vx * dt;
      w.y += w.vy * dt;
    }
    walkers = walkers.filter((w) => w.x > -3 && w.x < 43 && w.y > 1 && w.y < 25);

    // cars: they go while the signal lets them and stop short of the crossing otherwise
    nextCar -= dt;
    if (nextCar <= 0 && carsGo() && phase() < T_CAR_GREEN - 1.5) {
      const east = rnd() < 0.5;
      cars.push({
        x: east ? -5 : 45,
        y: east ? LANES.east : LANES.west,
        th: east ? 0 : Math.PI,
        dir: east ? 1 : -1,
        v: 7,
        color: ['#c9d2e6', '#b6c4de', '#d6cdb8'][Math.floor(rnd() * 3)],
      });
      nextCar = between(2, 4.5);
    }
    for (const c of cars) {
      const line = c.dir > 0 ? CROSS.x0 - 3 : CROSS.x1 + 3;
      const before = (line - c.x) * c.dir; // metres left to the stop line
      let vt = 7;
      if (!carsGo() && before > -0.2 && before < 40) vt = Math.min(vt, stopSpeed(before, 3));
      const front = cars.find(
        (o) => o !== c && o.dir === c.dir && (o.x - c.x) * c.dir > 0 && (o.x - c.x) * c.dir < 8,
      );
      if (front) vt = Math.min(vt, front.v * 0.9, Math.max(0, ((front.x - c.x) * c.dir - 6) * 0.9));
      c.v = approach(c.v, Math.max(0, vt), vt < c.v ? 5 : 2.5, dt);
      c.x += c.v * c.dir * dt;
    }
    cars = cars.filter((c) => c.x > -8 && c.x < 48);

    // the robot
    const p = route.pointAt(bot.s, bot.lat);
    bot.x = p.x;
    bot.y = p.y;
    bot.th = p.th;
    let vt = V_WALK;
    note = 'On the way';
    chips.plan = false;
    let dodge = 0;
    // someone ahead on the pavement
    let blocker = null;
    for (const w of walkers) {
      const dx = w.x - bot.x;
      const dy = w.y - bot.y;
      const ahead = dx * Math.cos(bot.th) + dy * Math.sin(bot.th);
      const side = -dx * Math.sin(bot.th) + dy * Math.cos(bot.th);
      const wv = w.vx * Math.cos(bot.th) + w.vy * Math.sin(bot.th);
      if (ahead > 0 && ahead < 5.5 + bot.v) {
        if (Math.abs(side) < 1.6 && wv < -0.3) dodge = side > 0 ? -0.9 : 0.9; // coming towards us: step aside
        if (Math.abs(side) < 0.95 && wv > -0.3 && (!blocker || ahead < blocker.ahead))
          blocker = { ahead, v: Math.max(0, wv) };
      }
    }
    if (blocker) {
      vt = Math.min(vt, Math.max(0.2, blocker.v + (blocker.ahead - 2.6) * 0.5));
      note = 'Keeping behind a person';
      chips.plan = true;
    }
    if (dodge) {
      note = 'Stepping aside';
      chips.plan = true;
    }
    bot.lat = approach(bot.lat, dodge, 1.6, dt);

    // at the kerb
    const toKerb = crossStart - 1.2 - bot.s;
    if (bot.state === 'go' && toKerb < 9 && toKerb > -0.5) {
      const carsNear = cars.some(
        (c) => Math.abs(c.x - 24) < 9 && c.v > 1.5 && (c.dir > 0 ? c.x > 11 : c.x < 37),
      );
      const ok = walk() && !carsNear && T_WALK - phase() > 4;
      if (!ok) {
        vt = Math.min(vt, stopSpeed(toKerb, 1.2));
        note = walk() ? 'Waiting for the cars' : 'Waiting for the signal';
        chips.plan = true;
        if (toKerb < 0.3) bot.v = 0;
      } else {
        bot.state = 'cross';
        vt = 1.9;
      }
    }
    if (bot.state === 'cross') {
      vt = Math.min(2.0, Math.max(vt, 1.8));
      note = 'Crossing';
      chips.plan = true;
      if (bot.s > crossEnd + 1) bot.state = 'go2';
    }
    // someone on the crossing
    for (const w of walkers) {
      if (!w.cross) continue;
      const dx = w.x - bot.x;
      const dy = w.y - bot.y;
      const ahead = dx * Math.cos(bot.th) + dy * Math.sin(bot.th);
      if (ahead > 0 && ahead < 4 && Math.abs(-dx * Math.sin(bot.th) + dy * Math.cos(bot.th)) < 1.4)
        vt = Math.min(vt, 0.5);
    }
    if (bot.s > L - 2.4 && bot.state !== 'deliver') {
      vt = Math.min(vt, stopSpeed(L - 1.4 - bot.s, 1));
      if (bot.v < 0.15) {
        bot.state = 'deliver';
        bot.wait = 2.6;
        delivered++;
      }
    }
    if (bot.state === 'deliver') {
      bot.wait -= dt;
      vt = 0;
      note = 'Delivered';
      if (bot.wait <= 0) {
        bot.state = 'go';
        bot.s = 0;
        bot.lat = 0;
      }
    }
    bot.v = approach(bot.v, vt, vt < bot.v ? 2.4 : 1, dt);
    chips.path = bot.v > 0.1;
    bot.s = Math.min(L, bot.s + bot.v * dt);

    // sensing
    tick += dt;
    if (tick >= 0.1) {
      tick -= 0.1;
      const dets = [];
      for (const w of walkers) {
        const r = Math.hypot(w.x - bot.x, w.y - bot.y);
        if (r < RANGE) dets.push({ ...noisy(w, r, rnd), cls: 'person' });
      }
      for (const c of cars) {
        const r = Math.hypot(c.x - bot.x, c.y - bot.y);
        if (r < RANGE + 6) dets.push({ ...noisy(c, r, rnd), cls: 'car' });
      }
      chips.detect = dets.length > 0;
      tracker.step(0.1, dets);
      tracker.tracks = tracker.tracks.filter(
        (t) => Math.hypot(t.filter.x[0] - bot.x, t.filter.x[1] - bot.y) < RANGE + 8,
      );
      chips.track = tracker.tracks.some((t) => t.state !== 'tentative');
    }
  }

  function drawSignal(g) {
    const lamp = (x, y, col) => {
      g.fillStyle = '#0c0e13';
      g.beginPath();
      g.arc(x, y, 0.8, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = col;
      g.shadowColor = col;
      g.shadowBlur = 8;
      g.beginPath();
      g.arc(x, y, 0.5, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
    };
    const ph = phase();
    const carCol = ph < T_CAR_GREEN ? '#30d158' : ph < T_CAR_YELLOW ? '#ffd60a' : '#ff453a';
    const walkCol = walk()
      ? '#30d158'
      : ph >= T_WALK
        ? Math.floor(clock * 3) % 2
          ? '#ff453a'
          : '#3a2024'
        : '#ff453a';
    lamp(CROSS.x0 - 2.2, ROAD.y0 - 0.9, carCol);
    lamp(CROSS.x1 + 2.2, ROAD.y1 + 0.9, carCol);
    lamp(CROSS.x0 - 0.8, ROAD.y1 + 1, walkCol);
    lamp(CROSS.x1 + 0.8, ROAD.y0 - 1, walkCol);
  }

  function draw(g) {
    g.fillStyle = '#080b12';
    g.fillRect(0, 0, WORLD.w, WORLD.h);
    // pavements and buildings
    g.fillStyle = 'rgba(255,255,255,.035)';
    g.fillRect(0, 1.4, WORLD.w, ROAD.y0 - 1.4);
    g.fillRect(0, ROAD.y1, WORLD.w, WORLD.h - ROAD.y1 - 1.4);
    g.fillStyle = 'rgba(255,255,255,.07)';
    g.fillRect(0, 0, WORLD.w, 1.4);
    g.fillRect(0, WORLD.h - 1.4, WORLD.w, 1.4);
    g.fillStyle = '#3c465c';
    g.fillRect(35.4, 0.2, 2.2, 1.2); // the door
    // road
    g.fillStyle = 'rgba(255,255,255,.055)';
    g.fillRect(0, ROAD.y0, WORLD.w, ROAD.y1 - ROAD.y0);
    g.strokeStyle = 'rgba(255,255,255,.22)';
    g.lineWidth = 0.1;
    g.setLineDash([1.2, 1.4]);
    g.beginPath();
    g.moveTo(0, 12);
    g.lineTo(WORLD.w, 12);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = 'rgba(255,255,255,.32)';
    for (let k = 0; k < 9; k++)
      g.fillRect(CROSS.x0, ROAD.y0 + 0.5 + k * 1.05, CROSS.x1 - CROSS.x0, 0.62);
    drawSignal(g);

    // the global route and the local path
    g.strokeStyle = 'rgba(48,209,88,.45)';
    g.lineWidth = 0.14;
    g.setLineDash([0.4, 0.55]);
    g.beginPath();
    for (let s = 0; s <= L; s += 0.5) {
      const p = route.pointAt(s);
      s ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y);
    }
    g.stroke();
    g.setLineDash([]);
    // the destination
    g.fillStyle = '#ff5d6c';
    g.shadowColor = '#ff5d6c';
    g.shadowBlur = 8;
    g.beginPath();
    g.arc(36.5, 3.6, 0.55, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = `rgba(255,93,108,${0.6 - 0.6 * ((clock * 0.9) % 1)})`;
    g.lineWidth = 0.12;
    g.beginPath();
    g.arc(36.5, 3.6, 0.6 + ((clock * 0.9) % 1) * 2.4, 0, Math.PI * 2);
    g.stroke();

    for (const c of cars)
      drawCarSprite(g, c.x - Math.cos(c.th) * 1.3, c.y + 0, c.th, 1, {
        body: c.color,
        shade: '#6f7a90',
        brake: c.v < 3 && !carsGo(),
      });
    for (const w of walkers)
      drawPedSprite(g, w.x, w.y, Math.atan2(w.vy, w.vx || 0.001), 1.25, '#ffd6a5');

    // lidar ring
    g.strokeStyle = 'rgba(90,200,250,.18)';
    g.lineWidth = 0.08;
    g.beginPath();
    g.arc(bot.x, bot.y, RANGE, 0, Math.PI * 2);
    g.stroke();

    // tracks
    g.font = '600 0.85px Montserrat, system-ui, sans-serif';
    for (const tr of tracker.tracks) {
      if (tr.state === 'tentative') continue;
      const [x, y] = tr.filter.position;
      const sp = Math.hypot(...tr.filter.velocity);
      if (sp > 0.4) {
        const path = predictPath(tr, 1.6, 0.4);
        g.strokeStyle = 'rgba(45,212,191,.85)';
        g.lineWidth = 0.09;
        g.setLineDash([0.2, 0.25]);
        g.beginPath();
        g.moveTo(x, y);
        path.forEach(([qx, qy]) => g.lineTo(qx, qy));
        g.stroke();
        g.setLineDash([]);
      }
      const big = tr.cls === 'car';
      drawBrackets(g, x, y, big ? 1.9 : 0.85, big ? 1.1 : 0.85, '#2dd4bf', 0.08);
      g.fillStyle = '#2dd4bf';
      g.fillText(`#${tr.id} ${big ? 'Car' : 'Person'}`, x + (big ? 2.1 : 1.1), y - 0.7);
    }

    // the robot
    g.save();
    g.translate(bot.x, bot.y);
    g.rotate(bot.th);
    g.shadowColor = 'rgba(0,0,0,.6)';
    g.shadowBlur = 6;
    g.fillStyle = '#e8edf8';
    g.beginPath();
    g.roundRect(-0.85, -0.55, 1.7, 1.1, 0.25);
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = '#2a3140';
    for (const x of [-0.55, 0, 0.55])
      for (const y of [-0.62, 0.62]) {
        g.beginPath();
        g.roundRect(x - 0.17, y - 0.1, 0.34, 0.2, 0.05);
        g.fill();
      }
    g.fillStyle = bot.state === 'deliver' ? '#30d158' : '#7fd6ff';
    g.beginPath();
    g.roundRect(-0.55, -0.35, 0.7, 0.7, 0.15);
    g.fill();
    g.fillStyle = '#5ac8fa';
    g.shadowColor = '#5ac8fa';
    g.shadowBlur = 6;
    g.beginPath();
    g.arc(0.5, 0, 0.2, 0, Math.PI * 2);
    g.fill();
    g.restore();

    // what it is doing
    g.font = '600 0.95px Montserrat, system-ui, sans-serif';
    const w = g.measureText(note).width + 1.4;
    const nx = Math.min(Math.max(bot.x - w / 2, 0.5), WORLD.w - w - 0.5);
    const ny = bot.y > 12 ? bot.y - 2.3 : bot.y + 3.2;
    g.fillStyle = 'rgba(14,20,33,.82)';
    g.strokeStyle = 'rgba(48,209,88,.7)';
    g.lineWidth = 0.06;
    g.beginPath();
    g.roundRect(nx, ny - 1.15, w, 1.5, 0.75);
    g.fill();
    g.stroke();
    g.fillStyle = '#fff';
    g.fillText(note, nx + 0.7, ny - 0.1);
    void delivered;
  }

  // a few people already about when the scene opens
  for (let i = 0; i < 4; i++) spawnWalker(true);

  return { world: WORLD, update, draw, chips, id: 'robot' };
}
