import { relativePose, wrapAngle } from '../../algos/geometry.js';
import { clamp, smoothstep } from '../../core/math.js';
import { C, alpha } from '../palette.js';
import {
  frameAt,
  label,
  makeView,
  node,
  poseAt,
  robot,
  spring,
  stretchColor,
  trail,
} from '../draw.js';
import { mountFigure } from '../figure.js';
import { sharedScene } from '../slam-scene.js';

const DRIVE = 6;
const SEE = 6.6; // the robot spots a place it has seen
const PULL = 8.4; // the graph starts to relax
const LENGTH = 16;

/** The whole lap: drive and drift, spot the start again, add one string, and the map snaps shut. */
export function loop(root) {
  const S = sharedScene();
  return mountFigure(root, {
    aspect: 2,
    tall: 1.05,
    length: LENGTH,
    rest: LENGTH,
    knobs: [{ id: 'wobble', label: 'Wobble', min: 0.1, max: 1, step: 0.01, value: 0.85 }],
    make() {
      return {
        draw(g, w, h, t, k) {
          const v = makeView(w, h, { hw: 12, hh: 7.4 }, 22);
          const fr = S.frames(k.wobble);
          const odo = fr.poses[0];
          const f = clamp(t / DRIVE, 0, 1) * (S.n - 1);
          const have = Math.floor(f);
          const closing = smoothstep((t - SEE) / 0.9);
          const q = smoothstep((t - PULL) / 5.5) * (fr.poses.length - 1);
          const P = frameAt(fr.poses, q);

          // the road, so the finished map can be checked against it
          g.save();
          g.lineJoin = 'round';
          g.strokeStyle = 'rgba(255,255,255,0.045)';
          g.lineWidth = Math.max(16, v.s * 1.5);
          g.beginPath();
          S.truth.forEach((p, i) =>
            i ? g.lineTo(v.x(p[0]), v.y(p[1])) : g.moveTo(v.x(p[0]), v.y(p[1])),
          );
          g.closePath();
          g.stroke();
          g.restore();

          // strings between neighbours, coloured by how stretched they are
          const shown = Math.min(have, S.n - 2);
          for (let i = 0; i <= shown; i++) {
            const e = S.odometry(k.wobble).edges[i];
            const r = relativePose(P[e.i], P[e.j]);
            const miss =
              Math.hypot(r[0] - e.z[0], r[1] - e.z[1]) + Math.abs(wrapAngle(r[2] - e.z[2])) * 1.5;
            spring(g, v.x(P[i][0]), v.y(P[i][1]), v.x(P[i + 1][0]), v.y(P[i + 1][1]), {
              color: i <= have ? stretchColor(miss / 0.55) : 'transparent',
              width: 1.6,
              amp: 3,
              coils: 3,
            });
          }

          // the one new string
          if (closing > 0.01 && have >= S.n - 1) {
            const a = P[S.n - 1];
            const b = P[0];
            const ax = v.x(a[0]);
            const ay = v.y(a[1]);
            const bx = v.x(b[0]);
            const by = v.y(b[1]);
            const len = Math.hypot(bx - ax, by - ay);
            const sx = ax + (bx - ax) * closing;
            const sy = ay + (by - ay) * closing;
            if (len > 6) {
              spring(g, ax, ay, sx, sy, {
                color: len > 40 ? C.bad : alpha(C.ok, 0.9),
                width: 2.6,
                amp: Math.min(9, 3 + len * 0.03),
                coils: Math.max(4, Math.round(len / 14)),
              });
            }
          }

          for (let i = 0; i <= have && i < S.n; i++) {
            node(g, v, P[i], { r: i === 0 ? 5.5 : 3.6, color: i === 0 ? C.ok : C.accent });
          }
          const rob = f < S.n - 1 ? poseAt(P, f) : P[S.n - 1];
          robot(g, v, rob, C.accent, 11);

          if (t > SEE - 0.5 && t < PULL + 1) {
            const bx = v.x(rob[0]);
            const by = v.y(rob[1]);
            label(
              g,
              'I have seen this place before!',
              bx,
              by - 34,
              C.ok,
              'center',
              "600 13px 'Montserrat', sans-serif",
            );
          }
          label(g, 'start', v.x(P[0][0]) + 30, v.y(P[0][1]), C.ok, 'left');

          // how unhappy the whole graph is
          const c0 = fr.cost[0];
          const c = fr.cost[Math.min(fr.cost.length - 1, Math.round(q))];
          const un = t < SEE ? 0 : (c / c0) * closing;
          const bw = Math.min(190, w * 0.32);
          const bx = w - 18 - bw;
          label(g, 'how unhappy the strings are', w - 18, 20, C.mute, 'right');
          g.fillStyle = 'rgba(255,255,255,0.08)';
          g.fillRect(bx, 32, bw, 8);
          g.fillStyle = stretchColor(un * 1.4);
          g.fillRect(bx, 32, bw * clamp(un, 0, 1), 8);
          label(
            g,
            t < SEE
              ? 'all relaxed, yet the map is wrong'
              : `${Math.max(0.1, un * 100).toFixed(un < 0.1 ? 1 : 0)}%`,
            w - 18,
            54,
            C.ink,
            'right',
          );
        },
      };
    },
  });
}
