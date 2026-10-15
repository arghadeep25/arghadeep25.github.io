import { distances2D } from '../algos/mahalanobis.js';
import { lookAheadPoint, stepPurePursuit } from '../algos/pure-pursuit.js';
import { TAU, clamp, mix, smoothstep } from '../core/math.js';
import { gaussian, mulberry32 } from '../core/random.js';

/**
 * Small looping canvas animations, one per blog tile.
 * Each factory returns draw(g, w, h, t, dt): g is a 2D context, w and h the tile size in CSS px,
 * t seconds of animation time (speeds up on hover) and dt the step since the last frame.
 */

const VIO = '139,124,255';
const BLU = '62,155,255';

/** Graph SLAM: a drifting trajectory snaps shut when a loop closure is found. */
function graphSlam() {
  const N = 30;
  const gauss = gaussian(mulberry32(7));
  const noise = Array.from({ length: N }, () => [gauss() * 0.006, gauss() * 0.006]);
  const truth = (i, w, h) => {
    const th = (i / N) * TAU - 1.2;
    return [
      w * 0.5 + w * 0.36 * Math.cos(th),
      h * 0.37 + h * 0.23 * Math.sin(th) * (1 + 0.18 * Math.cos(2 * th)),
    ];
  };
  return (g, w, h, t) => {
    const c = t % 14;
    const drift = [w * 0.17, -h * 0.1];
    const tp = [];
    const dp = [];
    for (let i = 0; i < N; i++) {
      const p = truth(i, w, h);
      const k = Math.pow(i / (N - 1), 1.5);
      tp.push(p);
      dp.push([p[0] + drift[0] * k + noise[i][0] * w, p[1] + drift[1] * k + noise[i][1] * h]);
    }
    const shown = Math.floor(smoothstep(c / 5) * N);
    const u = smoothstep((c - 6.4) / 2.4);
    const fade = c > 11.6 ? 1 - smoothstep((c - 11.6) / 1.3) : 1;
    const P = dp.map((p, i) => [mix(p[0], tp[i][0], u), mix(p[1], tp[i][1], u)]);

    g.globalAlpha = fade;
    g.strokeStyle = 'rgba(255,255,255,.07)';
    g.setLineDash([3, 6]);
    g.lineWidth = 1;
    g.beginPath();
    tp.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.closePath();
    g.stroke();
    g.setLineDash([]);

    g.lineWidth = 1.4;
    g.strokeStyle = `rgba(${VIO},${0.45 + 0.3 * u})`;
    g.beginPath();
    for (let i = 0; i < shown; i++) i ? g.lineTo(P[i][0], P[i][1]) : g.moveTo(P[i][0], P[i][1]);
    g.stroke();

    if (shown >= N - 1 && c > 5.2) {
      const a = P[0];
      const b = P[N - 1];
      const pulse = c < 6.4 ? 0.5 + 0.5 * Math.sin(c * 9) : 1;
      g.strokeStyle = `rgba(${BLU},${c < 6.4 ? 0.35 + 0.5 * pulse : 0.85})`;
      g.setLineDash(c < 8.8 ? [4, 4] : []);
      g.beginPath();
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
      g.stroke();
      g.setLineDash([]);
      if (c < 7) {
        g.strokeStyle = `rgba(${BLU},${0.6 * pulse})`;
        for (const q of [a, b]) {
          g.beginPath();
          g.arc(q[0], q[1], 10 + 3 * pulse, 0, TAU);
          g.stroke();
        }
      }
    }
    for (let i = 0; i < shown; i++) {
      const bright = i === 0 || (i === shown - 1 && shown < N);
      g.fillStyle = bright ? '#fff' : 'rgba(207,200,255,.9)';
      g.beginPath();
      g.arc(P[i][0], P[i][1], i === 0 ? 4 : 2.6, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
  };
}

/** Pointers in C++: an arrow hops between memory cells. */
function pointers() {
  const values = [12, 7, 42, 3, 99, 25];
  let current = 0;
  let from = 0;
  let last = -1;
  const hex = (i) => `0x${(16 + i * 4).toString(16)}`;
  return (g, w, h, t) => {
    const n = 6;
    const gap = 6;
    const cw = Math.min(46, (w - 52 - gap * (n - 1)) / n);
    const ch = 36;
    const x0 = (w - (n * cw + gap * (n - 1))) / 2;
    const y = h * 0.11 + 12;
    const idx = Math.floor(t / 2.4) % n;
    if (idx !== last) {
      from = last < 0 ? idx : current;
      current = idx;
      last = idx;
    }
    const pos = mix(from, current, smoothstep(((t % 2.4) - 0.1) / 0.7));
    const centre = (i) => x0 + i * (cw + gap) + cw / 2;

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const on = clamp(1 - Math.abs(i - pos) * 1.6, 0, 1);
      const x = x0 + i * (cw + gap);
      g.fillStyle = `rgba(${VIO},${0.04 + 0.2 * on})`;
      g.strokeStyle = `rgba(${on > 0.3 ? VIO : '255,255,255'},${0.14 + 0.6 * on})`;
      g.lineWidth = 1;
      g.beginPath();
      g.roundRect(x, y, cw, ch, 9);
      g.fill();
      g.stroke();
      g.fillStyle = `rgba(243,246,251,${0.55 + 0.45 * on})`;
      g.font = `500 ${14 + 3 * on}px Montserrat,sans-serif`;
      g.fillText(values[i], x + cw / 2, y + ch / 2 + 1);
      g.fillStyle = 'rgba(147,160,184,.7)';
      g.font = '400 9px Montserrat,sans-serif';
      g.fillText(hex(i), x + cw / 2, y - 9);
    }

    const px = w / 2;
    const py = y + ch + 40;
    const pw = 70;
    const ph = 30;
    g.fillStyle = 'rgba(255,255,255,.04)';
    g.strokeStyle = `rgba(${BLU},.7)`;
    g.beginPath();
    g.roundRect(px - pw / 2, py, pw, ph, 9);
    g.fill();
    g.stroke();
    g.fillStyle = '#fff';
    g.font = '500 12px Montserrat,sans-serif';
    g.fillText(hex(Math.round(pos)), px, py + ph / 2 + 1);

    const ex = centre(0) + ((centre(n - 1) - centre(0)) * pos) / (n - 1);
    const ey = y + ch + 4;
    const sy = py - 3;
    g.strokeStyle = `rgba(${BLU},.85)`;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(px, sy);
    g.quadraticCurveTo((px + ex) / 2, (sy + ey) / 2 - 8, ex, ey + 2);
    g.stroke();
    g.fillStyle = `rgb(${BLU})`;
    g.beginPath();
    g.moveTo(ex, ey - 1);
    g.lineTo(ex - 5, ey + 8);
    g.lineTo(ex + 5, ey + 8);
    g.closePath();
    g.fill();
  };
}

/** Mahalanobis distance: the ellipse and the circle that pass through the same point. */
function mahalanobis() {
  const gauss = gaussian(mulberry32(11));
  const cloud = Array.from({ length: 110 }, () => [gauss(), gauss()]);
  const phi = -0.5;
  return (g, w, h, t) => {
    g.save();
    g.beginPath();
    g.rect(0, 0, w, h * 0.58);
    g.clip();
    const cx = w * 0.5;
    const cy = h * 0.3;
    const s1 = w * 0.16;
    const s2 = w * 0.05;
    const co = Math.cos(phi);
    const si = Math.sin(phi);
    g.fillStyle = 'rgba(147,170,220,.55)';
    for (const [a, b] of cloud) {
      g.beginPath();
      g.arc(cx + a * s1 * co - b * s2 * si, cy + a * s1 * si + b * s2 * co, 1.6, 0, TAU);
      g.fill();
    }
    const qx = cx + Math.cos(t * 0.55) * w * 0.3;
    const qy = cy + Math.sin(t * 0.8) * h * 0.13;
    const { mahalanobis: dM, euclidean: dE } = distances2D(qx - cx, qy - cy, { s1, s2, phi });
    const inside = dM < 2.4;

    g.fillStyle = `rgba(${VIO},.07)`;
    g.beginPath();
    g.ellipse(cx, cy, s1 * 2.4, s2 * 2.4, phi, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(147,160,184,.45)';
    g.setLineDash([3, 5]);
    g.lineWidth = 1;
    g.beginPath();
    g.arc(cx, cy, dE, 0, TAU);
    g.stroke();
    g.setLineDash([]);
    g.strokeStyle = `rgba(${VIO},.95)`;
    g.lineWidth = 1.5;
    g.beginPath();
    g.ellipse(cx, cy, s1 * dM, s2 * dM, phi, 0, TAU);
    g.stroke();

    const col = inside ? '127,209,255' : '255,184,107';
    g.fillStyle = `rgba(${col},.25)`;
    g.beginPath();
    g.arc(qx, qy, 9, 0, TAU);
    g.fill();
    g.fillStyle = `rgb(${col})`;
    g.beginPath();
    g.arc(qx, qy, 3.6, 0, TAU);
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(cx, cy, 2.6, 0, TAU);
    g.fill();
    g.restore();
  };
}

/** Kalman filter: a smooth estimate threads through noisy readings. */
function kalman() {
  const gauss = gaussian(mulberry32(13));
  const noise = Array.from({ length: 140 }, () => gauss());
  return (g, w, h, t) => {
    const c = t % 9;
    const progress = clamp(c / 6, 0, 1);
    const fade = c > 7.3 ? 1 - smoothstep((c - 7.3) / 1.4) : 1;
    const amp = h * 0.1;
    const cy = h * 0.3;
    const truth = (x) => cy + Math.sin(x * 0.021 + 1) * amp;
    g.globalAlpha = fade * 0.9;
    g.strokeStyle = 'rgba(255,255,255,.12)';
    g.setLineDash([3, 6]);
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 0; x <= w; x += 6) x ? g.lineTo(x, truth(x)) : g.moveTo(x, truth(x));
    g.stroke();
    g.setLineDash([]);

    let estimate = truth(0);
    g.strokeStyle = `rgba(${VIO},.95)`;
    g.lineWidth = 1.8;
    g.beginPath();
    g.moveTo(0, estimate);
    g.fillStyle = 'rgba(147,170,220,.6)';
    for (let x = 0, k = 0; x <= progress * w; x += 7, k++) {
      const reading = truth(x) + noise[k % noise.length] * h * 0.05;
      g.beginPath();
      g.arc(x, reading, 1.7, 0, TAU);
      g.fill();
      estimate += (reading - estimate) * 0.22;
      g.lineTo(x, estimate);
    }
    g.stroke();
    g.globalAlpha = 1;
  };
}

/** Pure pursuit: a real follower chasing a look-ahead point along a curve. */
function purePursuit() {
  let car = null;
  let trail = [];
  return (g, w, h, t, dt) => {
    const pathY = (x) => h * 0.3 + Math.sin((x / w) * TAU * 1.3 + 0.6) * h * 0.1;
    const lookAhead = w * 0.16;
    if (!car || car.x > w * 0.96) {
      car = { x: w * 0.05, y: pathY(w * 0.05) + h * 0.08, heading: 0 };
      trail = [];
    }
    const target = lookAheadPoint(pathY, car, lookAhead, w + lookAhead);
    stepPurePursuit(car, target, lookAhead, w * 0.22, Math.min(dt, 0.05));
    trail.push([car.x, car.y]);
    if (trail.length > 70) trail.shift();

    g.strokeStyle = 'rgba(255,255,255,.14)';
    g.lineWidth = 1.2;
    g.beginPath();
    for (let x = 0; x <= w; x += 6) x ? g.lineTo(x, pathY(x)) : g.moveTo(x, pathY(x));
    g.stroke();
    g.strokeStyle = `rgba(${BLU},.55)`;
    g.lineWidth = 1.6;
    g.beginPath();
    trail.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.stroke();
    g.strokeStyle = `rgba(${VIO},.4)`;
    g.setLineDash([3, 5]);
    g.lineWidth = 1;
    g.beginPath();
    g.arc(car.x, car.y, lookAhead, 0, TAU);
    g.stroke();
    g.setLineDash([]);
    g.strokeStyle = `rgba(${VIO},.8)`;
    g.beginPath();
    g.moveTo(car.x, car.y);
    g.lineTo(target.x, target.y);
    g.stroke();
    g.fillStyle = `rgb(${VIO})`;
    g.beginPath();
    g.arc(target.x, target.y, 3.6, 0, TAU);
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(car.x, car.y, 4, 0, TAU);
    g.fill();
  };
}

export const VISUALS = {
  slam: graphSlam,
  ptr: pointers,
  mah: mahalanobis,
  kal: kalman,
  pp: purePursuit,
};

/** Create the draw function for a tile. Each call has its own state. */
export function createVisual(name) {
  const make = VISUALS[name];
  if (!make) throw new Error(`Unknown blog visual: ${name}`);
  return make();
}
