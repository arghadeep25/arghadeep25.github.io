import { clamp, smoothstep } from '../../core/math.js';
import { C, alpha } from '../palette.js';
import { frameAt, label, makeView, node, spring } from '../draw.js';
import { mountFigure } from '../figure.js';
import { meanError, sharedScene } from '../slam-scene.js';

const WOBBLE = 0.5;
const LENGTH = 6;

/**
 * Two corridors look the same, so the robot ties a string between places that are far apart. One
 * wrong string can crush the map. A robust price listens less and less to a string that is
 * stretched far too much.
 */
export function outlier(root) {
  const S = sharedScene();
  const mode = { wrong: true, robust: false };

  const fig = mountFigure(root, {
    aspect: 2,
    tall: 1.05,
    length: LENGTH,
    loop: false,
    rest: LENGTH,
    make() {
      return {
        draw(g, w, h, t) {
          const run = mode.wrong
            ? S.withWrong(WOBBLE, mode.robust)
            : { ...S.frames(WOBBLE), trust: null };
          const frames = run.frames ?? run.poses;
          const u = smoothstep((t - 0.4) / 4.4);
          const P = frameAt(frames, u * (frames.length - 1));
          const v = makeView(w, h, { cx: 0, cy: 0, hw: 15, hh: 9.2 }, 18);

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

          // the lap
          g.save();
          g.strokeStyle = alpha(C.accent, 0.95);
          g.lineWidth = 2.4;
          g.lineJoin = 'round';
          g.beginPath();
          P.forEach((p, i) =>
            i ? g.lineTo(v.x(p[0]), v.y(p[1])) : g.moveTo(v.x(p[0]), v.y(p[1])),
          );
          g.stroke();
          g.restore();

          // the real closure, and the wrong one
          const tie = (a, b, color, amp) => {
            const ax = v.x(P[a][0]);
            const ay = v.y(P[a][1]);
            const bx = v.x(P[b][0]);
            const by = v.y(P[b][1]);
            const len = Math.hypot(bx - ax, by - ay);
            if (len > 6)
              spring(g, ax, ay, bx, by, {
                color,
                width: 2.4,
                amp,
                coils: Math.max(4, Math.round(len / 14)),
              });
          };
          tie(S.loop.i, S.loop.j, alpha(C.ok, 0.9), 6);
          let trust = 1;
          if (mode.wrong) {
            const final = run.trust[run.trust.length - 1];
            trust = 1 + (final - 1) * u;
            tie(S.wrong.i, S.wrong.j, alpha(C.bad, clamp(0.12 + trust, 0.12, 1)), 7);
            label(g, 'the wrong string', 18, h - 40, C.bad);
            label(
              g,
              `we listen to it ${Math.max(0, trust * 100).toFixed(trust < 0.1 ? 1 : 0)}%`,
              18,
              h - 20,
              C.mute,
            );
          }

          P.forEach((p, i) =>
            node(g, v, p, { r: i === 0 ? 5 : 2.8, color: i === 0 ? C.ok : C.accent }),
          );
          if (mode.wrong) {
            for (const i of [S.wrong.i, S.wrong.j]) node(g, v, P[i], { r: 6, color: C.bad });
          }
          label(
            g,
            `map error: ${meanError(P, S.truth).toFixed(1)} m`,
            18,
            22,
            meanError(P, S.truth) > 1 ? C.bad : C.ok,
          );
          label(
            g,
            mode.wrong ? 'two corridors that look the same' : 'every string tells the truth',
            18,
            42,
            C.mute,
          );
        },
      };
    },
  });

  const bar = root.querySelector('.fig__bar');
  const mk = (on, off, key) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fig__play fig__toggle';
    const sync = () => {
      b.textContent = mode[key] ? on : off;
      b.setAttribute('aria-pressed', String(mode[key]));
    };
    sync();
    b.addEventListener('click', () => {
      mode[key] = !mode[key];
      sync();
      fig.restart();
    });
    bar.appendChild(b);
  };
  mk('A wrong string is added', 'Add a wrong string', 'wrong');
  mk('Robust price: on', 'Robust price: off', 'robust');
  return fig;
}
