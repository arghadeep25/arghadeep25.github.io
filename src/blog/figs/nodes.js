import { relativePose } from '../../algos/geometry.js';
import { clamp, smoothstep } from '../../core/math.js';
import { C, alpha } from '../palette.js';
import { arrow, label, makeView, node, poseAt, robot, trail } from '../draw.js';
import { mountFigure } from '../figure.js';
import { sharedScene } from '../slam-scene.js';

const K = 9;
const STEP = 1; // seconds between pins

/** Pins on the path: each node is where the robot thinks it was, written as three numbers. */
export function nodes(root) {
  const S = sharedScene();
  // the start is the origin and faces right, like the first node of a real graph
  const local = S.truth.slice(0, K).map((p) => relativePose(S.truth[0], p));
  let picked = null;
  let view = null;
  let near = () => null;

  const fig = mountFigure(root, {
    aspect: 2,
    tall: 1.15,
    length: K * STEP + 4,
    rest: K * STEP + 4,
    timeline: true,
    make(api) {
      let prevT = 0;
      near = (px, py) => {
        if (!view) return null;
        let best = null;
        let bd = 26;
        local.forEach((p, i) => {
          const d = Math.hypot(view.x(p[0]) - px, view.y(p[1]) - py);
          if (d < bd) {
            bd = d;
            best = i;
          }
        });
        return best;
      };
      return {
        draw(g, w, h, t) {
          if (t < prevT) picked = null;
          prevT = t;
          const xs = local.map((p) => p[0]);
          const ys = local.map((p) => p[1]);
          const x0 = Math.min(0, ...xs) - 0.6;
          const x1 = Math.max(...xs) + 0.8;
          const y0 = Math.min(0, ...ys) - 0.9;
          const y1 = Math.max(...ys) + 0.9;
          view = makeView(
            w,
            h,
            { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, hw: (x1 - x0) / 2, hh: (y1 - y0) / 2 },
            34,
          );
          const v = view;
          const f = clamp(t / STEP, 0, K - 1);
          const dropped = Math.floor(f);
          const sel = picked ?? dropped;

          // the map's x and y axes, from the first pin
          const ox = v.x(0);
          const oy = v.y(0);
          arrow(g, ox, oy, v.x(x1 - 0.2), oy, {
            color: 'rgba(255,255,255,0.22)',
            width: 1.4,
            head: 7,
          });
          arrow(g, ox, oy, ox, v.y(y1 - 0.1), {
            color: 'rgba(255,255,255,0.22)',
            width: 1.4,
            head: 7,
          });
          label(g, 'x', v.x(x1 - 0.2), oy + 14, C.dim, 'center');
          label(g, 'y', ox - 12, v.y(y1 - 0.1), C.dim, 'center');

          trail(g, v, local, f, alpha(C.accent, 0.5), 2, [3, 5]);

          // what the picked pin says
          const p = local[sel];
          const px = v.x(p[0]);
          const py = v.y(p[1]);
          if (sel > 0) {
            g.save();
            g.setLineDash([5, 5]);
            g.lineWidth = 1.6;
            g.strokeStyle = alpha(C.blue, 0.9);
            g.beginPath();
            g.moveTo(ox, oy);
            g.lineTo(px, oy);
            g.stroke();
            g.strokeStyle = alpha(C.ok, 0.9);
            g.beginPath();
            g.moveTo(px, oy);
            g.lineTo(px, py);
            g.stroke();
            g.restore();
            label(g, `x = ${p[0].toFixed(1)}`, (ox + px) / 2, oy + 16, C.blue, 'center');
            label(g, `y = ${p[1].toFixed(1)}`, px + 10, (oy + py) / 2, C.ok, 'left');
          }
          // the way it faces
          const arc = 30;
          g.save();
          g.strokeStyle = C.warn;
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(px + arc, py);
          g.lineTo(px + arc + 14, py);
          g.stroke();
          g.setLineDash([]);
          g.beginPath();
          g.arc(px, py, arc, 0, -p[2], p[2] > 0);
          g.stroke();
          g.restore();
          arrow(g, px, py, px + Math.cos(p[2]) * 46, py - Math.sin(p[2]) * 46, {
            color: C.warn,
            width: 2.4,
            head: 9,
          });
          const mid = -p[2] / 2;
          label(
            g,
            `θ = ${Math.round((p[2] * 180) / Math.PI)}°`,
            px + Math.cos(mid) * (arc + 22),
            py + Math.sin(mid) * (arc + 22) - 6,
            C.warn,
            'left',
          );

          // the pins
          for (let i = 0; i <= dropped; i++) {
            const age = clamp(f - i, 0, 1);
            const pop = 1 + 0.9 * (1 - smoothstep(age * 2));
            node(g, v, local[i], {
              r: (i === sel ? 7.5 : 5.5) * pop,
              color: i === sel ? '#fff' : C.accent,
            });
            label(
              g,
              String(i),
              v.x(local[i][0]) - 3,
              v.y(local[i][1]) + 20,
              i === sel ? C.ink : C.dim,
              'center',
            );
          }
          if (f < K - 1) robot(g, v, poseAt(local, f), alpha(C.accent, 0.9), 11);

          label(g, `pin ${sel}: one node, three numbers`, 18, 22, C.ink);
          label(g, 'tap a pin to read it', 18, 42, C.dim);
        },
      };
    },
  });

  const cv = fig.canvas;
  const pos = (e) => {
    const r = cv.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const pick = (e) => {
    const i = near(...pos(e));
    if (i !== null && i !== picked) {
      picked = i;
      fig.redraw();
    }
  };
  cv.addEventListener('pointermove', (e) => e.pointerType === 'mouse' && pick(e));
  cv.addEventListener('pointerdown', pick);
  return fig;
}
