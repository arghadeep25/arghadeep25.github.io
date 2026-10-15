import { clamp } from '../../core/math.js';
import { C, alpha } from '../palette.js';
import { frameAt, label, makeView, node, trail } from '../draw.js';
import { mountFigure } from '../figure.js';
import { sharedScene } from '../slam-scene.js';

const ITER = 12;

/** The same lap, one solver step at a time, with the price falling beside it. */
export function steps(root) {
  const S = sharedScene();
  return mountFigure(root, {
    aspect: 2,
    tall: 1.05,
    length: ITER,
    rest: ITER,
    knobs: [{ id: 'wobble', label: 'Wobble', min: 0.1, max: 1, step: 0.01, value: 0.85 }],
    make() {
      return {
        draw(g, w, h, t, k) {
          const fr = S.frames(k.wobble);
          const last = fr.poses.length - 1;
          const q = clamp(t, 0, last);
          const narrow = w < 560;
          const mapW = narrow ? w : w * 0.62;
          const mapH = narrow ? h * 0.66 : h;
          const v = makeView(mapW, mapH, { hw: 12, hh: 7.4 }, 18);

          g.save();
          g.lineJoin = 'round';
          g.strokeStyle = 'rgba(255,255,255,0.045)';
          g.lineWidth = Math.max(14, v.s * 1.4);
          g.beginPath();
          S.truth.forEach((p, i) =>
            i ? g.lineTo(v.x(p[0]), v.y(p[1])) : g.moveTo(v.x(p[0]), v.y(p[1])),
          );
          g.closePath();
          g.stroke();
          g.restore();

          // the first guess, faint, and the current one
          trail(g, v, fr.poses[0], S.n - 1, 'rgba(255,255,255,0.18)', 1.4, [3, 5]);
          const P = frameAt(fr.poses, q);
          trail(g, v, P, S.n - 1, alpha(C.accent, 0.95), 2.4);
          P.forEach((p, i) =>
            node(g, v, p, { r: i === 0 ? 5 : 3, color: i === 0 ? C.ok : C.accent }),
          );
          label(g, `step ${Math.round(q)}`, 18, 22, C.ink);
          label(g, 'dotted: the first guess', 18, 42, C.dim);

          // the price after each step, on a log scale
          const cx = narrow ? 36 : mapW + 18;
          const cw = narrow ? w - 36 - 22 : w - cx - 22;
          const cy = narrow ? mapH + 14 : 64;
          const ch = narrow ? h - mapH - 44 : h - 64 - 44;
          const lg = fr.cost.map((c) => Math.log10(Math.max(c, 1e-3)));
          const hi = Math.max(...lg);
          const lo = Math.min(...lg) - 0.2;
          const px = (i) => cx + (i / Math.max(1, last)) * cw;
          const py = (l) => cy + ch - ((l - lo) / (hi - lo)) * ch;
          label(g, 'price after each step', cx, cy - 14, C.mute);
          g.strokeStyle = C.line;
          g.strokeRect(cx, cy, cw, ch);
          g.beginPath();
          lg.forEach((l, i) => (i ? g.lineTo(px(i), py(l)) : g.moveTo(px(i), py(l))));
          g.strokeStyle = alpha(C.blue, 0.9);
          g.lineWidth = 2;
          g.stroke();
          const i = Math.round(q);
          g.save();
          g.beginPath();
          g.arc(px(i), py(lg[i]), 5.5, 0, Math.PI * 2);
          g.fillStyle = '#fff';
          g.shadowColor = alpha('#fff', 0.7);
          g.shadowBlur = 10;
          g.fill();
          g.restore();
          label(
            g,
            `${Math.round(fr.cost[i])}`,
            Math.min(px(i) + 10, cx + cw - 30),
            py(lg[i]) - 12,
            C.ink,
            i > last * 0.7 ? 'right' : 'left',
          );
          label(g, 'step', cx + cw / 2, cy + ch + 18, C.dim, 'center');
        },
      };
    },
  });
}
