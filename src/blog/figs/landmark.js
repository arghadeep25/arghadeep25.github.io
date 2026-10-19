import { wrapAngle } from '../../algos/geometry.js';
import { clamp } from '../../core/math.js';
import { gaussian, mulberry32 } from '../../core/random.js';
import { C, alpha } from '../palette.js';
import { label, makeView, node, robot } from '../draw.js';
import { mountFigure } from '../figure.js';

const LENGTH = 12;
const TREE = [3.4, 2.2];
const SAMPLES = 14;

/** A robot sees a tree: how far (range r) and which way (bearing φ). Both readings are a bit off. */
export function landmark(root) {
  const gauss = gaussian(mulberry32(11));
  const noise = Array.from({ length: SAMPLES }, () => [gauss(), gauss()]);
  const path = (u) => {
    const a = u * Math.PI * 1.2 - 2.6;
    return [-3.2 + 5.2 * Math.cos(a) * 0.55 + u * 1.2, -3 + u * 2.4, a + Math.PI / 2];
  };
  return mountFigure(root, {
    aspect: 2,
    tall: 1.05,
    length: LENGTH,
    rest: 6,
    knobs: [
      { id: 'rn', label: 'Range noise', min: 0, max: 1, step: 0.01, value: 0.35 },
      { id: 'bn', label: 'Bearing noise', min: 0, max: 1, step: 0.01, value: 0.35 },
    ],
    make() {
      return {
        draw(g, w, h, t, k) {
          const v = makeView(w, h, { cx: 0.2, cy: 0.2, hw: 6.6, hh: 4.4 }, 22);
          const u = clamp(t / (LENGTH - 1), 0, 1);
          const p = path(u);
          const dx = TREE[0] - p[0];
          const dy = TREE[1] - p[1];
          const r = Math.hypot(dx, dy);
          const phi = wrapAngle(Math.atan2(dy, dx) - p[2]);

          // the walked path
          g.save();
          g.strokeStyle = 'rgba(255,255,255,0.18)';
          g.setLineDash([2, 6]);
          g.lineWidth = 1.5;
          g.beginPath();
          for (let i = 0; i <= 40; i++) {
            const q = path((i / 40) * u);
            i ? g.lineTo(v.x(q[0]), v.y(q[1])) : g.moveTo(v.x(q[0]), v.y(q[1]));
          }
          g.stroke();
          g.restore();

          // the noisy readings, each turned into a guess of where the tree is
          for (let i = 0; i < SAMPLES; i++) {
            const rr = r + noise[i][0] * 0.55 * k.rn;
            const aa = p[2] + phi + noise[i][1] * 0.16 * k.bn;
            g.fillStyle = alpha(C.blue, 0.55);
            g.beginPath();
            g.arc(v.x(p[0] + Math.cos(aa) * rr), v.y(p[1] + Math.sin(aa) * rr), 3, 0, Math.PI * 2);
            g.fill();
          }

          // range: the line of sight
          g.save();
          g.strokeStyle = alpha(C.warn, 0.9);
          g.lineWidth = 1.8;
          g.beginPath();
          g.moveTo(v.x(p[0]), v.y(p[1]));
          g.lineTo(v.x(TREE[0]), v.y(TREE[1]));
          g.stroke();
          // bearing: the angle between where the robot faces and the line of sight
          g.strokeStyle = 'rgba(255,255,255,0.35)';
          g.setLineDash([5, 4]);
          g.beginPath();
          g.moveTo(v.x(p[0]), v.y(p[1]));
          g.lineTo(v.x(p[0] + Math.cos(p[2]) * 2.6), v.y(p[1] + Math.sin(p[2]) * 2.6));
          g.stroke();
          g.setLineDash([]);
          g.strokeStyle = alpha(C.ok, 0.95);
          g.lineWidth = 2.4;
          g.beginPath();
          const arc = 1.3 * v.s;
          g.arc(v.x(p[0]), v.y(p[1]), arc, -p[2], -(p[2] + phi), phi > 0);
          g.stroke();
          g.restore();

          const tx = v.x(TREE[0]);
          const ty = v.y(TREE[1]);
          g.save();
          g.fillStyle = C.warn;
          g.shadowColor = alpha(C.warn, 0.6);
          g.shadowBlur = 10;
          g.beginPath();
          g.moveTo(tx, ty - 9);
          g.lineTo(tx + 8, ty);
          g.lineTo(tx, ty + 9);
          g.lineTo(tx - 8, ty);
          g.closePath();
          g.fill();
          g.restore();
          label(g, 'landmark m', tx + 14, ty - 2, C.warn, 'left');

          robot(g, v, p, C.accent, 11);
          label(g, 'blue dots: where the sensor says it is', 14, h - 14, C.blue, 'left');

          // the readout
          label(
            g,
            `r = ${r.toFixed(1)} m`,
            w - 16,
            20,
            C.warn,
            'right',
            "600 13px 'Montserrat', sans-serif",
          );
          label(
            g,
            `φ = ${((phi * 180) / Math.PI).toFixed(0)}°`,
            w - 16,
            40,
            C.ok,
            'right',
            "600 13px 'Montserrat', sans-serif",
          );
        },
      };
    },
  });
}
