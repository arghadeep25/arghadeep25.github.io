import { UkfTracker, predictPath } from '../../algos/ukf-tracker.js';
import { mulberry32 } from '../../core/random.js';
import { drawBrackets } from '../../demos/sprites.js';
import { approach, bump, noisy } from './common.js';

/*
 * A drone flying a delivery route over a town. It lifts off, cruises, goes around a tall tower
 * that is in the way, waits for a flock of birds to cross, and lands. Its depth sensor sees the
 * tower and the birds, and the tracker follows each bird.
 */

const WORLD = { w: 120, h: 78 };
const A = { x: 12, y: 62 };
const B = { x: 108, y: 15 };
const TOWER = { x: 60, y: 39, r: 5, keepOut: 12 };
const CRUISE = 9;
const ALT = 40;
const SENSE = 34;

export function createDrone(seed = 9) {
  const rnd = mulberry32(seed);
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const L = Math.hypot(dx, dy);
  const u = [dx / L, dy / L];
  const nrm = [-u[1], u[0]];
  // where the tower sits along the straight line, and which way round to go
  const sTower = (TOWER.x - A.x) * u[0] + (TOWER.y - A.y) * u[1];
  const sideSign = (TOWER.x - A.x) * nrm[0] + (TOWER.y - A.y) * nrm[1] > 0 ? -1 : 1;
  const off = (s) => sideSign * bump(s, sTower, 30) * 17;
  const pathAt = (s) => {
    const o = off(s);
    return { x: A.x + u[0] * s + nrm[0] * o, y: A.y + u[1] * s + nrm[1] * o };
  };
  const heading = (s) => {
    const a = pathAt(s - 0.5);
    const b = pathAt(s + 0.5);
    return Math.atan2(b.y - a.y, b.x - a.x);
  };

  // town blocks, fixed for the scene
  const town = [];
  const r2 = mulberry32(21);
  for (let bx = 0; bx < 6; bx++)
    for (let by = 0; by < 4; by++) {
      const x0 = 4 + bx * 19.5;
      const y0 = 3 + by * 19;
      const n = 1 + Math.floor(r2() * 3);
      for (let i = 0; i < n; i++)
        town.push({
          x: x0 + r2() * 7,
          y: y0 + r2() * 7,
          w: 5 + r2() * 6,
          h: 5 + r2() * 6,
          t: 0.4 + r2() * 0.6,
        });
    }
  const near = (b, p, r) =>
    p.x > b.x - r && p.x < b.x + b.w + r && p.y > b.y - r && p.y < b.y + b.h + r;
  const buildings = town.filter(
    (b) =>
      !near(b, TOWER, TOWER.keepOut) &&
      !near(b, A, 6) &&
      !near(b, B, 6) &&
      [0, 20, 40, 60, 80, 100, 120, 140]
        .map((s) => pathAt(Math.min(s, L)))
        .every((p) => !near(b, p, 1)),
  );

  const tracker = new UkfTracker({ maxCoast: 8, noise: { accel: 4, yawAccel: 2.5, meas: 0.5 } });
  const d = { s: 0, dir: 1, v: 0, z: 0, state: 'takeoff', wait: 0 };
  let birds = null;
  let flockDone = false;
  let note = 'Taking off';
  let clock = 0;
  let tick = 0;
  let dets = [];
  const chips = {
    map: true,
    locate: true,
    detect: false,
    track: false,
    plan: false,
    path: true,
    watch: true,
  };

  const sAt = (s) => (d.dir > 0 ? s : L - s); // distance along the path for the current leg
  const pos = () => {
    const p = pathAt(sAt(d.s));
    return { x: p.x, y: p.y, th: heading(sAt(d.s)) + (d.dir > 0 ? 0 : Math.PI) };
  };

  function update(dt) {
    clock += dt;
    const here = pos();
    d.x = here.x;
    d.y = here.y;
    d.th = here.th;

    let vt = CRUISE;
    chips.plan = false;
    const remaining = L - d.s;
    if (d.state === 'takeoff') {
      note = 'Taking off';
      vt = 2 + d.s * 0.6;
      d.z = approach(d.z, ALT, 9, dt);
      if (d.s > 10) d.state = 'cruise';
    } else if (d.state === 'cruise') {
      note = Math.abs(off(sAt(d.s))) > 3 ? 'Going round the tower' : 'Cruising';
      if (Math.abs(off(sAt(d.s))) > 3) chips.plan = true;
      d.z = approach(d.z, ALT, 8, dt);
      if (remaining < 16) {
        d.state = 'land';
      }
    }
    if (d.state === 'land') {
      note = 'Landing';
      vt = Math.max(0.8, Math.sqrt(2 * 1.2 * Math.max(0, remaining - 0.5)));
      d.z = approach(d.z, 0, 8, dt);
      if (remaining < 0.8 && d.v < 0.6) {
        d.state = 'hover';
        d.wait = 2.2;
      }
    }
    if (d.state === 'hover') {
      vt = 0;
      d.v = 0;
      d.wait -= dt;
      note = 'Delivered';
      if (d.wait <= 0) {
        d.dir *= -1;
        d.s = 0;
        d.state = 'takeoff';
        flockDone = false;
        birds = null;
      }
    }

    // birds crossing the route
    if (!birds && !flockDone && d.state === 'cruise' && d.s > 0.2 * L && d.s < 0.3 * L) {
      const sb = d.s + 46;
      const c = pathAt(sAt(sb));
      const side = rnd() < 0.5 ? 1 : -1;
      birds = {
        list: Array.from({ length: 6 }, (_, i) => ({
          x: c.x + nrm[0] * side * (20 + i * 1.4) + (rnd() - 0.5) * 3,
          y: c.y + nrm[1] * side * (20 + i * 1.4) + (rnd() - 0.5) * 3,
          ph: rnd() * 6,
        })),
        vx: -nrm[0] * side * 7,
        vy: -nrm[1] * side * 7,
        center: c,
      };
      flockDone = true;
    }
    if (birds) {
      for (const b of birds.list) {
        b.x += birds.vx * dt;
        b.y += birds.vy * dt;
      }
      // the drone gives way while they are close to its path ahead
      const mid = birds.list[Math.floor(birds.list.length / 2)];
      const ahead = (mid.x - d.x) * Math.cos(d.th) + (mid.y - d.y) * Math.sin(d.th);
      const side = -(mid.x - d.x) * Math.sin(d.th) + (mid.y - d.y) * Math.cos(d.th);
      if (ahead > -4 && ahead < 34 && Math.abs(side) < 22) {
        vt = Math.min(vt, 3.2);
        note = 'Letting birds cross';
        chips.plan = true;
      }
      const far = Math.hypot(mid.x - d.x, mid.y - d.y);
      if (ahead < -10 || far > 90) birds = null;
    }

    d.v = approach(d.v, vt, vt < d.v ? 3 : 2, dt);
    chips.path = d.v > 0.3 || d.z > 1;
    if (d.state !== 'hover') d.s = Math.min(L, d.s + d.v * dt);

    // sensing
    tick += dt;
    if (tick >= 0.1) {
      tick -= 0.1;
      dets = [];
      const cone = (p) => {
        const r = Math.hypot(p.x - d.x, p.y - d.y);
        let a = Math.atan2(p.y - d.y, p.x - d.x) - d.th;
        a = Math.atan2(Math.sin(a), Math.cos(a));
        return r < SENSE && Math.abs(a) < 0.62 ? r : null;
      };
      if (birds)
        for (const b of birds.list) {
          const r = cone(b);
          if (r != null) dets.push({ ...noisy(b, r, rnd), cls: 'bird' });
        }
      const rt = cone(TOWER);
      chips.detect = dets.length > 0 || rt != null;
      d.tower = rt != null;
      tracker.step(0.1, dets);
      chips.track = tracker.tracks.some((t) => t.state !== 'tentative');
    }
  }

  function rotor(g, x, y, r, spin) {
    g.fillStyle = 'rgba(200,215,240,.14)';
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(230,238,255,.7)';
    g.lineWidth = 0.18;
    for (let i = 0; i < 2; i++) {
      const a = spin + i * Math.PI;
      g.beginPath();
      g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      g.lineTo(x - Math.cos(a) * r, y - Math.sin(a) * r);
      g.stroke();
    }
  }

  function draw(g) {
    g.fillStyle = '#080b12';
    g.fillRect(0, 0, WORLD.w, WORLD.h);
    // streets
    g.fillStyle = 'rgba(255,255,255,.04)';
    for (let i = 0; i <= 6; i++) g.fillRect(1 + i * 19.5 - 1, 0, 2.2, WORLD.h);
    for (let j = 0; j <= 4; j++) g.fillRect(0, 0.5 + j * 19, WORLD.w, 2.2);
    for (const b of buildings) {
      g.fillStyle = `rgba(255,255,255,${0.035 + b.t * 0.03})`;
      g.strokeStyle = 'rgba(255,255,255,.1)';
      g.lineWidth = 0.12;
      g.beginPath();
      g.roundRect(b.x, b.y, b.w, b.h, 0.5);
      g.fill();
      g.stroke();
    }
    // the tower and its keep-out ring
    g.strokeStyle = 'rgba(255,93,108,.55)';
    g.lineWidth = 0.2;
    g.setLineDash([1, 1]);
    g.beginPath();
    g.arc(TOWER.x, TOWER.y, TOWER.keepOut, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#1b2231';
    g.strokeStyle = 'rgba(255,255,255,.25)';
    g.beginPath();
    g.arc(TOWER.x, TOWER.y, TOWER.r, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = `rgba(255,69,58,${0.5 + 0.5 * Math.sin(clock * 5)})`;
    g.beginPath();
    g.arc(TOWER.x, TOWER.y, 0.9, 0, Math.PI * 2);
    g.fill();
    // pads
    for (const p of [A, B]) {
      g.strokeStyle = 'rgba(255,255,255,.35)';
      g.lineWidth = 0.2;
      g.beginPath();
      g.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,.5)';
      g.font = '700 3px Montserrat, system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('H', p.x, p.y + 0.2);
    }
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    // the global route
    g.strokeStyle = 'rgba(48,209,88,.6)';
    g.lineWidth = 0.28;
    g.setLineDash([1.2, 1.6]);
    g.beginPath();
    for (let s = 0; s <= L; s += 2) {
      const p = pathAt(s);
      s ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y);
    }
    g.stroke();
    g.setLineDash([]);

    // depth sensor cone
    g.save();
    g.translate(d.x, d.y);
    g.rotate(d.th);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, SENSE);
    gr.addColorStop(0, 'rgba(90,200,250,.25)');
    gr.addColorStop(1, 'rgba(90,200,250,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, SENSE, -0.62, 0.62);
    g.closePath();
    g.fill();
    g.restore();

    // birds and their tracks
    if (birds)
      for (const b of birds.list) {
        const a = Math.atan2(birds.vy, birds.vx);
        g.save();
        g.translate(b.x, b.y);
        g.rotate(a);
        g.strokeStyle = '#ffd6a5';
        g.lineWidth = 0.35;
        const flap = 0.5 + 0.5 * Math.sin(clock * 14 + b.ph);
        g.beginPath();
        g.moveTo(-1.3, -1.4 * flap - 0.3);
        g.lineTo(0, 0);
        g.lineTo(-1.3, 1.4 * flap + 0.3);
        g.stroke();
        g.restore();
      }
    for (const tr of tracker.tracks) {
      if (tr.state === 'tentative') continue;
      const [x, y] = tr.filter.position;
      const path = predictPath(tr, 2, 0.5);
      g.strokeStyle = 'rgba(45,212,191,.8)';
      g.lineWidth = 0.18;
      g.setLineDash([0.6, 0.7]);
      g.beginPath();
      g.moveTo(x, y);
      path.forEach(([qx, qy]) => g.lineTo(qx, qy));
      g.stroke();
      g.setLineDash([]);
      drawBrackets(g, x, y, 2, 2, '#2dd4bf', 0.2);
    }
    if (birds && tracker.tracks.some((t) => t.state !== 'tentative')) {
      const t0 = tracker.tracks.find((t) => t.state !== 'tentative');
      g.fillStyle = '#2dd4bf';
      g.font = '600 2.3px Montserrat, system-ui, sans-serif';
      g.fillText('Birds · tracked', t0.filter.x[0] + 3, t0.filter.x[1] - 3);
    }
    if (d.tower) drawBrackets(g, TOWER.x, TOWER.y, TOWER.r + 2, TOWER.r + 2, '#5ac8fa', 0.2);

    // the drone: its shadow on the ground, then the machine itself
    const sc = 1 + d.z / 140;
    const sh = d.z * 0.16;
    g.save();
    g.translate(d.x + sh, d.y + sh);
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.beginPath();
    g.ellipse(0, 0, 2.6 * sc, 1.6 * sc, d.th, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.save();
    g.translate(d.x, d.y);
    g.rotate(d.th);
    g.scale(sc, sc);
    const spin = clock * (d.z > 1 || d.v > 0.5 ? 40 : 4);
    g.strokeStyle = '#9aa3b5';
    g.lineWidth = 0.5;
    for (const [rx, ry] of [
      [2.3, 2.3],
      [2.3, -2.3],
      [-2.3, 2.3],
      [-2.3, -2.3],
    ]) {
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(rx, ry);
      g.stroke();
      rotor(g, rx, ry, 1.7, spin + rx);
    }
    g.fillStyle = '#e8edf8';
    g.beginPath();
    g.roundRect(-1.5, -0.95, 3, 1.9, 0.6);
    g.fill();
    g.fillStyle = '#5ac8fa';
    g.beginPath();
    g.arc(1.2, 0, 0.45, 0, Math.PI * 2);
    g.fill();
    g.restore();

    // altitude and speed beside it
    g.font = '600 2.3px Montserrat, system-ui, sans-serif';
    const text = `${note} · ${Math.round(d.z)} m · ${d.v.toFixed(0)} m/s`;
    const w = g.measureText(text).width + 4;
    const tx = Math.min(Math.max(d.x - w / 2, 2), WORLD.w - w - 2);
    const ty = Math.max(d.y - 9, 5);
    g.fillStyle = 'rgba(14,20,33,.82)';
    g.strokeStyle = 'rgba(48,209,88,.7)';
    g.lineWidth = 0.18;
    g.beginPath();
    g.roundRect(tx, ty - 2.6, w, 4.2, 2.1);
    g.fill();
    g.stroke();
    g.fillStyle = '#fff';
    g.fillText(text, tx + 2, ty + 0.5);
  }

  Object.assign(d, pos());

  return { world: WORLD, update, draw, chips, id: 'drone' };
}
