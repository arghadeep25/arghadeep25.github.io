import { clamp } from '../../core/math.js';
import { C, alpha } from '../palette.js';
import { label, makeView, node, poseAt, robot, trail } from '../draw.js';
import { mountFigure } from '../figure.js';
import { meanError, sharedScene } from '../slam-scene.js';

const DRIVE = 10;

/** A robot counts its steps. Each count is a little wrong, so where it thinks it is drifts away. */
export function drift(root) {
  const S = sharedScene();
  return mountFigure(root, {
    aspect: 2,
    tall: 1.05,
    length: 14,
    rest: 14,
    knobs: [{ id: 'wobble', label: 'Wobble', min: 0, max: 1, step: 0.01, value: 0.5 }],
    make() {
      return {
        draw(g, w, h, t, k) {
          const v = makeView(w, h, { hw: 12, hh: 7.4 }, 22);
          const odo = S.odometry(k.wobble).poses;
          const f = clamp(t / DRIVE, 0, 1) * (S.n - 1);

          // the road
          g.save();
          g.lineJoin = 'round';
          g.strokeStyle = 'rgba(255,255,255,0.05)';
          g.lineWidth = Math.max(16, v.s * 1.5);
          g.beginPath();
          S.truth.forEach((p, i) =>
            i ? g.lineTo(v.x(p[0]), v.y(p[1])) : g.moveTo(v.x(p[0]), v.y(p[1])),
          );
          g.closePath();
          g.stroke();
          g.restore();

          // the start line
          node(g, v, S.truth[0], { r: 8, color: C.ok, fill: false });
          label(g, 'start', v.x(S.truth[0][0]), v.y(S.truth[0][1]) + 20, C.ok, 'center');

          // where it really is
          trail(g, v, S.truth, f, 'rgba(255,255,255,0.32)', 1.6, [2, 6]);
          // where it thinks it is
          trail(g, v, odo, f, alpha(C.accent, 0.95), 2.6);
          for (let i = 0; i <= f && i < S.n; i++) node(g, v, odo[i], { r: 2.4, color: C.accent });

          const real = poseAt(S.truth, f);
          const think = poseAt(odo, f);
          robot(g, v, real, 'rgba(255,255,255,0.7)', 11, true);
          robot(g, v, think, C.accent, 11);

          // the gap between the two
          const gap = Math.hypot(real[0] - think[0], real[1] - think[1]);
          if (gap > 0.25) {
            g.save();
            g.strokeStyle = alpha(C.bad, 0.9);
            g.lineWidth = 1.6;
            g.setLineDash([4, 4]);
            g.beginPath();
            g.moveTo(v.x(real[0]), v.y(real[1]));
            g.lineTo(v.x(think[0]), v.y(think[1]));
            g.stroke();
            g.restore();
            label(
              g,
              `off by ${gap.toFixed(1)} m`,
              (v.x(real[0]) + v.x(think[0])) / 2 + 10,
              (v.y(real[1]) + v.y(think[1])) / 2,
              C.bad,
              'left',
            );
          }

          // a little legend
          const lx = 18;
          const ly = h - 18;
          label(g, 'where it really is', lx + 26, ly - 20, C.mute);
          label(g, 'where it thinks it is', lx + 26, ly, C.mute);
          g.save();
          g.strokeStyle = 'rgba(255,255,255,0.5)';
          g.setLineDash([2, 5]);
          g.lineWidth = 1.6;
          g.beginPath();
          g.moveTo(lx, ly - 20);
          g.lineTo(lx + 18, ly - 20);
          g.stroke();
          g.setLineDash([]);
          g.strokeStyle = C.accent;
          g.lineWidth = 2.6;
          g.beginPath();
          g.moveTo(lx, ly);
          g.lineTo(lx + 18, ly);
          g.stroke();
          g.restore();

          const steps = Math.min(S.n - 1, Math.floor(f));
          label(g, `steps counted: ${steps}`, w - 18, 20, C.ink, 'right');
          label(
            g,
            `average error: ${meanError(odo.slice(0, steps + 1), S.truth).toFixed(1)} m`,
            w - 18,
            40,
            C.mute,
            'right',
          );
        },
      };
    },
  });
}
