import { clamp } from '../../core/math.js';
import { C, alpha } from '../palette.js';
import { label, makeView, spring, stretchColor } from '../draw.js';
import { mountFigure } from '../figure.js';

/**
 * Four pins in a ring and four strings. Each string says how far apart two pins should be. The
 * last one is a little off, so no placement pleases every string. Every string charges a price for
 * being stretched, and the total is what the optimiser tries to make small.
 */
const START = [
  [0, 0],
  [3, 0],
  [3, 3],
  [0, 3],
];
// string a -> b: pin b should sit at pin a plus z. The last one is the loop closure, 0.8 m too long.
const STRINGS = [
  { a: 0, b: 1, z: [3, 0] },
  { a: 1, b: 2, z: [0, 3] },
  { a: 2, b: 3, z: [-3, 0] },
  { a: 3, b: 0, z: [0, -3.8] },
];

const miss = (p, s) => [p[s.b][0] - p[s.a][0] - s.z[0], p[s.b][1] - p[s.a][1] - s.z[1]];
const price = (p, s) => {
  const e = miss(p, s);
  return e[0] * e[0] + e[1] * e[1];
};
const total = (p) => STRINGS.reduce((t, s) => t + price(p, s), 0);

/** Move each free pin to where its strings, taken together, would put it. */
function sweep(p, rate) {
  for (let k = 1; k < p.length; k++) {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const s of STRINGS) {
      if (s.b === k) {
        sx += p[s.a][0] + s.z[0];
        sy += p[s.a][1] + s.z[1];
        n++;
      } else if (s.a === k) {
        sx += p[s.b][0] - s.z[0];
        sy += p[s.b][1] - s.z[1];
        n++;
      }
    }
    p[k][0] += (sx / n - p[k][0]) * rate;
    p[k][1] += (sy / n - p[k][1]) * rate;
  }
}

const best = (() => {
  const p = START.map((q) => q.slice());
  for (let i = 0; i < 400; i++) sweep(p, 1);
  return total(p);
})();

export function sum(root) {
  // after the optimum is found, 0.80 m is spread over four strings
  const pins = START.map((q) => q.slice());
  let relaxing = false;
  let grab = -1;
  let view = null;

  const fig = mountFigure(root, {
    aspect: 2,
    tall: 1.1,
    controls: false,
    make() {
      return {
        draw(g, w, h) {
          if (relaxing) {
            for (let i = 0; i < 2; i++) sweep(pins, 0.09);
            if (total(pins) - best < 0.002) relaxing = false;
          }
          const v = (view = makeView(w, h, { cx: 1.5, cy: 1.5, hw: 3.7, hh: 2.7 }, 28));
          const X = (p) => v.x(p[0]);
          const Y = (p) => v.y(p[1]);
          const T = total(pins);

          STRINGS.forEach((s, i) => {
            const a = pins[s.a];
            const b = pins[s.b];
            const pr = price(pins, s);
            const stretched = clamp(Math.sqrt(pr) / 0.9, 0, 1);
            spring(g, X(a), Y(a), X(b), Y(b), {
              color: stretchColor(stretched),
              width: 2.2,
              amp: 7,
              coils: 9,
            });
            const mx = (X(a) + X(b)) / 2;
            const my = (Y(a) + Y(b)) / 2;
            // keep the price tag on the outside of the ring
            const dx = mx - v.x(1.5);
            const dy = my - v.y(1.5);
            const d = Math.hypot(dx, dy) || 1;
            label(
              g,
              pr.toFixed(2),
              mx + (dx / d) * 22,
              my + (dy / d) * 16,
              pr > 0.15 ? C.bad : C.mute,
              'center',
              "600 13px 'Montserrat', sans-serif",
            );
            void i;
          });

          pins.forEach((p, i) => {
            g.save();
            g.beginPath();
            g.arc(X(p), Y(p), i === 0 ? 9 : 10, 0, Math.PI * 2);
            g.fillStyle = i === 0 ? C.ok : C.accent;
            g.shadowColor = alpha(i === 0 ? C.ok : C.accent, 0.7);
            g.shadowBlur = 12;
            g.fill();
            g.restore();
            const ox = p[0] < 1.5 ? -1 : 1;
            const oy = p[1] < 1.5 ? 1 : -1;
            label(
              g,
              i === 0 ? 'pinned' : `pin ${i}`,
              X(p) + ox * 30,
              Y(p) + oy * 16,
              C.mute,
              'center',
            );
          });

          // the total price, against the lowest it can go
          const bw = Math.min(220, w * 0.34);
          label(g, 'total price', 22, 24, C.ink);
          label(
            g,
            T.toFixed(2),
            22 + 82,
            24,
            T - best < 0.01 ? C.ok : C.warn,
            'left',
            "600 16px 'Montserrat', sans-serif",
          );
          g.fillStyle = 'rgba(255,255,255,0.08)';
          g.fillRect(22, 38, bw, 8);
          g.fillStyle = T - best < 0.01 ? C.ok : C.warn;
          g.fillRect(22, 38, bw * clamp(T / 1.6, 0, 1), 8);
          const mark = 22 + bw * (best / 1.6);
          g.fillStyle = C.ok;
          g.fillRect(mark - 1, 33, 2, 18);
          label(g, `lowest possible ${best.toFixed(2)}`, mark + 8, 62, C.ok);
          if (grab < 0 && !relaxing && T - best < 0.01) {
            label(
              g,
              'nobody can do better. The error is shared out.',
              w / 2,
              h - 22,
              C.ok,
              'center',
            );
          } else if (grab < 0) {
            label(
              g,
              'drag a pin to lower the price, or let it relax',
              w / 2,
              h - 22,
              C.mute,
              'center',
            );
          }
          return relaxing;
        },
      };
    },
  });

  const bar = root.querySelector('.fig__bar');
  const mk = (text, fn) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fig__play';
    b.textContent = text;
    b.addEventListener('click', fn);
    bar.appendChild(b);
  };
  mk('Let it relax', () => {
    relaxing = true;
    fig.redraw();
  });
  mk('Reset', () => {
    relaxing = false;
    START.forEach((q, i) => (pins[i] = q.slice()));
    fig.redraw();
  });

  const cv = fig.canvas;
  cv.style.touchAction = 'none';
  const at = (e) => {
    const r = cv.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  cv.addEventListener('pointerdown', (e) => {
    const [px, py] = at(e);
    grab = -1;
    for (let i = 1; i < pins.length; i++) {
      if (Math.hypot(view.x(pins[i][0]) - px, view.y(pins[i][1]) - py) < 24) grab = i;
    }
    if (grab >= 0) {
      relaxing = false;
      cv.setPointerCapture(e.pointerId);
    }
  });
  cv.addEventListener('pointermove', (e) => {
    if (grab < 0) return;
    const [px, py] = at(e);
    pins[grab] = [clamp(view.wx(px), -2.5, 5.5), clamp(view.wy(py), -1.4, 4.6)];
    fig.redraw();
  });
  const drop = () => {
    grab = -1;
    fig.redraw();
  };
  cv.addEventListener('pointerup', drop);
  cv.addEventListener('pointercancel', drop);
  return fig;
}
