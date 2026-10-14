import { UkfTracker, predictPath } from '../../algos/ukf-tracker.js';
import { buildRoute } from '../../algos/grid-route.js';
import { curveSpeed, stopSpeed } from '../../algos/behavior.js';
import { mulberry32 } from '../../core/random.js';
import { drawBrackets } from '../../demos/sprites.js';
import { approach, lidarScan, noisy, rayBox } from './common.js';

/*
 * A forklift in a warehouse. It drives a loop between a pick point and a drop point, carrying a
 * pallet. Now and then a person walks across the cross aisle; the lidar sees them, the tracker
 * gives them an id and a heading, and the forklift stops until they have passed.
 */

const CYAN = '#5ac8fa';
const YELLOW = '#ffd60a';
const WORLD = { w: 40, h: 26 };
const RACKS = [
  { x0: 5, y0: 1.5, x1: 30, y1: 4.2 },
  { x0: 5, y0: 8.8, x1: 30, y1: 13 },
  { x0: 5, y0: 17.8, x1: 30, y1: 22.2 },
];
const P = [
  [2.5, 6.5],
  [35, 6.5],
  [35, 15.4],
  [2.5, 15.4],
];
const V_CRUISE = 3.4;
const RANGE = 14;

export function createForklift(seed = 3) {
  const rnd = mulberry32(seed);
  const pts = [...P, P[0], P[1], P[2]].map(([x, y]) => ({ x, y }));
  const route = buildRoute(pts, { offset: 0, radius: 3, step: 0.5 });
  const s0 = route.nodeS[1];
  const loop = route.nodeS[5] - s0;
  const local = (s) => ((s % loop) + loop) % loop;
  const at = (s) => route.pointAt(s0 + local(s));
  // where the forklift stops so that its forks reach the pallet, measured along the loop
  const pickS = local(route.project(23.6, 6.5).s - s0);
  const dropS = local(route.project(11.4, 15.4).s - s0);
  const crossed = (a, b, target) => local(a) < target && local(b) >= target && b - a < 5;

  const tracker = new UkfTracker({ maxCoast: 10, noise: { accel: 1.2, yawAccel: 2, meas: 0.35 } });
  const fk = { s: 0, v: 0, x: 0, y: 0, th: 0, state: 'drive', wait: 0, carrying: false };
  let person = null;
  let spawned = false;
  let tick = 0;
  let sweep = 0;
  let hits = [];
  const pickPallet = { x: 26, y: 6.5, shown: true };
  const dropPallet = { x: 9, y: 15.4, shown: false };
  let note = 'Cruising';
  const chips = {
    map: true,
    locate: true,
    detect: false,
    track: false,
    plan: false,
    path: false,
    watch: true,
  };

  function corridorBlock() {
    if (!person) return null;
    const dx = person.x - fk.x;
    const dy = person.y - fk.y;
    const ahead = dx * Math.cos(fk.th) + dy * Math.sin(fk.th);
    const side = -dx * Math.sin(fk.th) + dy * Math.cos(fk.th);
    const len = 4 + fk.v * 1.6;
    return ahead > 0.5 && ahead < len && Math.abs(side) < 2 ? ahead : null;
  }

  function update(dt) {
    sweep += dt * 3.2;
    const p = at(fk.s);
    fk.x = p.x;
    fk.y = p.y;
    fk.th = p.th;

    // the person
    if (!person && !spawned && fk.x > 17 && fk.y < 8 && Math.cos(fk.th) > 0.5) {
      person = { x: 31.4, y: 0.6, vy: 1.3, id: -1 };
      spawned = true;
    }
    if (fk.x < 10) spawned = false;
    if (person) {
      person.y += person.vy * dt;
      if (person.y > 25.5) person = null;
    }

    // what to do
    let vt = V_CRUISE;
    note = fk.carrying ? 'Carrying a pallet' : 'Going to pick';
    chips.plan = false;
    for (let d = 0; d <= 12; d += 1.5) {
      const q = at(fk.s + d);
      const r = at(fk.s + d + 0.5);
      let dth = r.th - q.th;
      dth = Math.atan2(Math.sin(dth), Math.cos(dth));
      const vc = curveSpeed(dth / 0.5, 1.5, V_CRUISE);
      vt = Math.min(vt, Math.sqrt(vc * vc + 2 * 1.6 * d));
    }
    const block = corridorBlock();
    if (block != null) {
      vt = Math.min(vt, stopSpeed(block - 3.2, 1.8));
      note = 'Person ahead · waiting';
      chips.plan = true;
    }
    if (fk.state === 'pick' || fk.state === 'place') {
      fk.wait -= dt;
      vt = 0;
      note = fk.state === 'pick' ? 'Picking up' : 'Putting down';
      chips.plan = true;
      if (fk.wait <= 0) {
        if (fk.state === 'pick') {
          fk.carrying = true;
          pickPallet.shown = false;
        } else {
          fk.carrying = false;
          dropPallet.shown = true;
          pickPallet.shown = true;
        }
        fk.state = 'drive';
      }
    }
    fk.v = approach(fk.v, vt, vt < fk.v ? 4 : 1.4, dt);
    chips.path = fk.v > 0.1;
    const prev = fk.s;
    fk.s += fk.v * dt;
    if (fk.state === 'drive' && !fk.carrying && crossed(prev, fk.s, pickS) && block == null) {
      fk.state = 'pick';
      fk.wait = 1.4;
      fk.s = Math.floor(prev / loop) * loop + pickS;
    }
    if (fk.state === 'drive' && fk.carrying && crossed(prev, fk.s, dropS) && block == null) {
      fk.state = 'place';
      fk.wait = 1.4;
      fk.s = Math.floor(prev / loop) * loop + dropS;
    }

    // sensing, a few times a second
    tick += dt;
    if (tick >= 0.1) {
      tick -= 0.1;
      const dets = [];
      chips.detect = false;
      if (person) {
        const d = Math.hypot(person.x - fk.x, person.y - fk.y);
        const dir = [(person.x - fk.x) / d, (person.y - fk.y) / d];
        const hidden = RACKS.some((b) => rayBox(fk.x, fk.y, dir[0], dir[1], b) < d - 0.3);
        if (d < RANGE && !hidden) {
          dets.push({ ...noisy(person, d, rnd), cls: 'person' });
          chips.detect = true;
        }
      }
      tracker.step(0.1, dets);
      chips.track = tracker.tracks.some((t) => t.state !== 'tentative');
      hits = lidarScan(
        fk.x,
        fk.y,
        90,
        RANGE,
        RACKS,
        person ? [{ x: person.x, y: person.y, r: 0.38 }] : [],
        sweep,
      );
    }
  }

  function drawForklift(g) {
    g.save();
    g.translate(fk.x, fk.y);
    g.rotate(fk.th);
    g.shadowColor = 'rgba(0,0,0,.6)';
    g.shadowBlur = 0.8;
    // forks
    g.fillStyle = '#9aa3b5';
    g.fillRect(1.1, -0.55, 1.5, 0.14);
    g.fillRect(1.1, 0.41, 1.5, 0.14);
    if (fk.carrying) {
      g.fillStyle = '#8a6a3c';
      g.fillRect(1.2, -0.62, 1.4, 1.24);
      g.fillStyle = '#c29a55';
      g.beginPath();
      g.roundRect(1.35, -0.5, 1.1, 1, 0.1);
      g.fill();
    }
    g.fillStyle = YELLOW;
    g.beginPath();
    g.roundRect(-1.3, -0.72, 2.5, 1.44, 0.25);
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = '#2a3140';
    g.beginPath();
    g.roundRect(-0.7, -0.5, 1.2, 1, 0.15);
    g.fill();
    g.fillStyle = CYAN;
    g.beginPath();
    g.arc(0.55, 0, 0.18, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  function draw(g, t) {
    // floor
    g.fillStyle = '#080b12';
    g.fillRect(0, 0, WORLD.w, WORLD.h);
    g.strokeStyle = 'rgba(255,255,255,.035)';
    g.lineWidth = 0.05;
    g.beginPath();
    for (let x = 0; x <= WORLD.w; x += 2) {
      g.moveTo(x, 0);
      g.lineTo(x, WORLD.h);
    }
    for (let y = 0; y <= WORLD.h; y += 2) {
      g.moveTo(0, y);
      g.lineTo(WORLD.w, y);
    }
    g.stroke();
    // aisles
    g.strokeStyle = 'rgba(255,214,10,.22)';
    g.lineWidth = 0.09;
    g.setLineDash([0.6, 0.5]);
    for (const y of [6.5, 15.4]) {
      g.beginPath();
      g.moveTo(5, y);
      g.lineTo(30, y);
      g.stroke();
    }
    g.setLineDash([]);
    // dock bay at the left
    g.fillStyle = 'rgba(255,255,255,.04)';
    g.fillRect(0, 4.5, 3.6, 13.5);
    // racks with pallets
    for (const b of RACKS) {
      g.fillStyle = '#111826';
      g.strokeStyle = 'rgba(255,255,255,.12)';
      g.lineWidth = 0.07;
      g.beginPath();
      g.roundRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0, 0.2);
      g.fill();
      g.stroke();
      g.fillStyle = 'rgba(122,136,160,.3)';
      for (let x = b.x0 + 0.6; x < b.x1 - 1; x += 2.1)
        for (let y = b.y0 + 0.35; y < b.y1 - 1; y += 1.3) g.fillRect(x, y, 1.5, 0.9);
    }
    // the global route and the local path ahead
    g.strokeStyle = 'rgba(48,209,88,.4)';
    g.lineWidth = 0.1;
    g.setLineDash([0.3, 0.6]);
    g.beginPath();
    for (let s = 0; s <= loop; s += 1) {
      const p = at(s);
      s ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y);
    }
    g.stroke();
    g.setLineDash([]);
    // the pallet waiting at the pick point
    for (const pl of [pickPallet, dropPallet]) {
      if (!pl.shown) continue;
      g.fillStyle = '#8a6a3c';
      g.fillRect(pl.x - 0.6, pl.y - 0.55, 1.2, 1.1);
      g.fillStyle = '#c29a55';
      g.beginPath();
      g.roundRect(pl.x - 0.5, pl.y - 0.45, 1.0, 0.9, 0.1);
      g.fill();
    }
    // the safety corridor ahead
    const block = corridorBlock();
    const len = 4 + fk.v * 1.6;
    g.save();
    g.translate(fk.x, fk.y);
    g.rotate(fk.th);
    g.fillStyle = block != null ? 'rgba(255,69,58,.18)' : 'rgba(48,209,88,.10)';
    g.strokeStyle = block != null ? 'rgba(255,69,58,.7)' : 'rgba(48,209,88,.4)';
    g.lineWidth = 0.07;
    g.beginPath();
    g.roundRect(1, -1.7, len, 3.4, 0.5);
    g.fill();
    g.stroke();
    g.restore();
    // lidar returns
    for (const h of hits) {
      g.fillStyle = h.what === 'circle' ? '#ffffff' : 'rgba(143,227,255,.8)';
      g.beginPath();
      g.arc(h.x, h.y, h.what === 'circle' ? 0.13 : 0.1, 0, Math.PI * 2);
      g.fill();
    }
    // the person and their track
    if (person) {
      g.fillStyle = '#ffd6a5';
      g.beginPath();
      g.ellipse(person.x, person.y, 0.28, 0.5, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(person.x, person.y + 0.05, 0.2, 0, Math.PI * 2);
      g.fill();
    }
    for (const tr of tracker.tracks) {
      if (tr.state === 'tentative') continue;
      const [x, y] = tr.filter.position;
      const path = predictPath(tr, 2, 0.4);
      g.strokeStyle = 'rgba(45,212,191,.9)';
      g.lineWidth = 0.1;
      g.setLineDash([0.25, 0.3]);
      g.beginPath();
      g.moveTo(x, y);
      path.forEach(([qx, qy]) => g.lineTo(qx, qy));
      g.stroke();
      g.setLineDash([]);
      drawBrackets(g, x, y, 0.95, 0.95, '#2dd4bf', 0.09);
      g.fillStyle = '#2dd4bf';
      g.font = '600 0.85px Montserrat, system-ui, sans-serif';
      g.fillText(`#${tr.id} Person`, x + 1.2, y - 0.7);
    }
    drawForklift(g);
    // what it is doing
    g.font = '600 0.95px Montserrat, system-ui, sans-serif';
    const w = g.measureText(note).width + 1.4;
    g.fillStyle = 'rgba(14,20,33,.8)';
    g.strokeStyle = 'rgba(48,209,88,.7)';
    g.lineWidth = 0.06;
    g.beginPath();
    g.roundRect(fk.x - w / 2, fk.y - 3.1, w, 1.5, 0.75);
    g.fill();
    g.stroke();
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.fillText(note, fk.x, fk.y - 2.05);
    g.textAlign = 'left';
    void t;
  }

  return { world: WORLD, update, draw, chips, id: 'forklift' };
}
