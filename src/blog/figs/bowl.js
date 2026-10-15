import { clamp, mix, smoothstep } from '../../core/math.js';
import { C, alpha } from '../palette.js';
import { label } from '../draw.js';
import { mountFigure } from '../figure.js';

const STEP = 3.4;
const STEPS = 4;

/** The cost of one pin at x: the error is x squared minus 2, so the best x is the square root of 2. */
const err = (x) => x * x - 2;
const cost = (x) => err(x) ** 2;
/** The Gauss-Newton move: slope b and steepness H of the bowl where the pin stands now. */
function plan(x) {
  const J = 2 * x;
  const H = J * J;
  const b = J * err(x);
  return { J, H, b, dx: -b / H };
}

/** Where the pin is after each step, from a given start. */
export function stepsFrom(x0, n = STEPS) {
  const xs = [x0];
  for (let i = 0; i < n; i++) xs.push(xs[i] + plan(xs[i]).dx);
  return xs;
}

/**
 * Gauss-Newton on one pin. At each step, look at the slope where you stand, fit a parabola that
 * hugs the bowl there, slide to the bottom of the parabola, drop onto the real bowl, repeat.
 */
export function bowl(root) {
  return mountFigure(root, {
    aspect: 2,
    tall: 1.15,
    length: STEPS * STEP + 1.5,
    rest: STEPS * STEP + 1.5,
    knobs: [{ id: 'start', label: 'Start here', min: 1.9, max: 3, step: 0.05, value: 2.9 }],
    make() {
      return {
        draw(g, w, h, t, k) {
          const xs = stepsFrom(k.start);
          const X0 = 0.3;
          const X1 = 3.1;
          const Y1 = 46;
          const pad = { l: 28, r: 24, t: 84, b: 44 };
          const X = (x) => pad.l + ((x - X0) / (X1 - X0)) * (w - pad.l - pad.r);
          const Y = (y) => h - pad.b - (clamp(y, -4, Y1 + 4) / Y1) * (h - pad.t - pad.b);

          // the bowl
          g.save();
          g.beginPath();
          for (let i = 0; i <= 120; i++) {
            const x = mix(X0, X1, i / 120);
            i ? g.lineTo(X(x), Y(cost(x))) : g.moveTo(X(x), Y(cost(x)));
          }
          g.strokeStyle = C.accent;
          g.lineWidth = 3;
          g.shadowColor = alpha(C.accent, 0.6);
          g.shadowBlur = 12;
          g.stroke();
          g.restore();
          g.strokeStyle = C.line;
          g.beginPath();
          g.moveTo(pad.l, Y(0));
          g.lineTo(w - pad.r, Y(0));
          g.stroke();
          label(g, 'where the pin sits', w - pad.r, Y(0) + 24, C.mute, 'right');

          const s = Math.min(STEPS - 1, Math.floor(t / STEP));
          const u = t >= STEPS * STEP ? 1 : (t - s * STEP) / STEP; // progress inside this step
          const x = xs[s];
          const { H, b, dx } = plan(x);
          const par = (xx) => cost(x) + 2 * b * (xx - x) + H * (xx - x) ** 2;

          // the parabola that hugs the bowl here
          const grow = smoothstep(u / 0.3);
          g.save();
          g.beginPath();
          const lo = Math.max(X0, x - 1.2);
          const hi = Math.min(X1, x + 0.8);
          for (let i = 0; i <= 60; i++) {
            const xx = mix(lo, hi, i / 60);
            const yy = par(xx);
            i ? g.lineTo(X(xx), Y(yy)) : g.moveTo(X(xx), Y(yy));
          }
          g.strokeStyle = alpha(C.blue, 0.95 * grow);
          g.lineWidth = 2.4;
          g.setLineDash([7, 5]);
          g.stroke();
          g.restore();

          // the bottom of the parabola, where we are headed
          const goal = x + dx;
          if (grow > 0.5) {
            g.save();
            g.fillStyle = C.ok;
            g.beginPath();
            g.arc(X(goal), Y(par(goal)), 5, 0, Math.PI * 2);
            g.fill();
            g.restore();
            label(g, 'bottom of the parabola', X(goal), Y(par(goal)) + 22, C.ok, 'center');
          }

          // the marble: slides along the parabola, then drops onto the bowl
          const slide = smoothstep((u - 0.3) / 0.35);
          const drop = smoothstep((u - 0.68) / 0.22);
          const mx = x + dx * slide;
          const my = mix(par(mx), cost(mx), drop);
          g.save();
          g.beginPath();
          g.arc(X(mx), Y(my), 9, 0, Math.PI * 2);
          g.fillStyle = '#fff';
          g.shadowColor = alpha('#ffffff', 0.7);
          g.shadowBlur = 14;
          g.fill();
          g.restore();

          // the best place of all
          const best = Math.SQRT2;
          g.strokeStyle = alpha(C.ok, 0.6);
          g.setLineDash([3, 5]);
          g.beginPath();
          g.moveTo(X(best), Y(0));
          g.lineTo(X(best), Y(Y1));
          g.stroke();
          g.setLineDash([]);
          label(g, 'best', X(best), Y(Y1) - 12, C.ok, 'center');

          label(g, `step ${Math.min(STEPS, s + (u > 0.9 ? 1 : 0))} of ${STEPS}`, 22, 24, C.ink);
          label(g, `pin at ${mx.toFixed(2)}   price ${cost(mx).toFixed(2)}`, 22, 44, C.mute);
          label(g, `next jump: ${dx.toFixed(2)}`, 22, 64, C.blue);
        },
      };
    },
  });
}
