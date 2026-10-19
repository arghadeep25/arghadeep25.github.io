import { clamp, smoothstep } from '../../core/math.js';
import { C, alpha } from '../palette.js';
import { label, makeView, node, spring } from '../draw.js';
import { mountFigure } from '../figure.js';
import { sharedScene } from '../slam-scene.js';

const LENGTH = 16;
const STAGES = [
  { at: 0.5, name: 'Node', text: 'a pose: where the robot was', color: C.accent },
  { at: 4.2, name: 'Odometry edge', text: 'how far it moved between two poses', color: C.blue },
  { at: 7.4, name: 'Landmark edge', text: 'a thing it saw from a pose', color: C.warn },
  { at: 11, name: 'Loop closure edge', text: 'the same place, seen again', color: C.ok },
];
const LANDMARKS = [
  [-6, 5.4],
  [5, 6.3],
  [10.2, 0.2],
  [1, -6.6],
  [-8.2, -3.4],
];

/** The whole graph built up in four steps: nodes, odometry edges, landmark edges, a loop closure. */
export function overview(root) {
  const S = sharedScene();
  const keys = Array.from({ length: 12 }, (_, i) => i * 3);
  return mountFigure(root, {
    aspect: 2,
    tall: 1.05,
    length: LENGTH,
    rest: LENGTH,
    make() {
      return {
        draw(g, w, h, t) {
          const v = makeView(w, h, { hw: 12, hh: 8.2 }, 24);
          const P = keys.map((i) => S.truth[i]);
          const nodesIn = clamp((t - STAGES[0].at) / 3.2, 0, 1) * P.length;
          const odoIn = clamp((t - STAGES[1].at) / 2.6, 0, 1) * P.length;
          const lmIn = smoothstep((t - STAGES[2].at) / 1.6);
          const loopIn = smoothstep((t - STAGES[3].at) / 1.4);

          // odometry edges
          for (let i = 0; i < P.length - 1; i++) {
            const u = clamp(odoIn - i, 0, 1);
            if (u <= 0) continue;
            const a = P[i];
            const b = P[i + 1];
            spring(
              g,
              v.x(a[0]),
              v.y(a[1]),
              v.x(a[0] + (b[0] - a[0]) * u),
              v.y(a[1] + (b[1] - a[1]) * u),
              {
                color: alpha(C.blue, 0.95),
                amp: 3,
                coils: 3,
              },
            );
          }

          // landmark edges, from the nearest poses
          if (lmIn > 0) {
            LANDMARKS.forEach((m, mi) => {
              const near = P.map((p, i) => [Math.hypot(p[0] - m[0], p[1] - m[1]), i])
                .sort((a, b) => a[0] - b[0])
                .slice(0, 2);
              for (const [, i] of near) {
                g.save();
                g.strokeStyle = alpha(C.warn, 0.75 * lmIn);
                g.lineWidth = 1.3;
                g.setLineDash([4, 4]);
                g.beginPath();
                g.moveTo(v.x(P[i][0]), v.y(P[i][1]));
                g.lineTo(v.x(m[0]), v.y(m[1]));
                g.stroke();
                g.restore();
              }
              const x = v.x(m[0]);
              const y = v.y(m[1]);
              g.save();
              g.globalAlpha = lmIn;
              g.fillStyle = C.warn;
              g.shadowColor = alpha(C.warn, 0.6);
              g.shadowBlur = 10;
              g.beginPath();
              g.moveTo(x, y - 7);
              g.lineTo(x + 6, y);
              g.lineTo(x, y + 7);
              g.lineTo(x - 6, y);
              g.closePath();
              g.fill();
              g.restore();
              if (mi === 0) label(g, 'landmark', x + 11, y, C.warn, 'left');
            });
          }

          // the loop closure edge
          if (loopIn > 0) {
            const a = P[P.length - 1];
            const b = P[0];
            const sx = a[0] + (b[0] - a[0]) * loopIn;
            const sy = a[1] + (b[1] - a[1]) * loopIn;
            spring(g, v.x(a[0]), v.y(a[1]), v.x(sx), v.y(sy), {
              color: C.ok,
              width: 2.4,
              amp: 6,
              coils: 5,
            });
          }

          // the nodes
          P.forEach((p, i) => {
            const u = clamp(nodesIn - i, 0, 1);
            if (u > 0) node(g, v, p, { r: 4.4 * u, color: i === 0 ? C.ok : C.accent });
          });
          label(g, 'x₀', v.x(P[0][0]) + 12, v.y(P[0][1]) + 12, C.ok, 'left');

          // the legend, lit up one line at a time
          let active = -1;
          STAGES.forEach((s, i) => {
            if (t >= s.at) active = i;
          });
          const x0 = 14;
          STAGES.forEach((s, i) => {
            const on = i <= active;
            const y = 18 + i * 19;
            g.save();
            g.globalAlpha = on ? (i === active ? 1 : 0.7) : 0.2;
            g.fillStyle = s.color;
            g.beginPath();
            g.arc(x0 + 5, y, 4.5, 0, Math.PI * 2);
            g.fill();
            g.restore();
            label(g, s.name, x0 + 18, y, on ? C.ink : C.dim, 'left');
            if (i === active) label(g, s.text, w / 2, h - 16, C.mute, 'center');
          });
        },
      };
    },
  });
}
