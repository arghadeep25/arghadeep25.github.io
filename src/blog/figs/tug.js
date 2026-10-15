import { clamp } from '../../core/math.js';
import { C, alpha } from '../palette.js';
import { label, spring } from '../draw.js';
import { mountFigure } from '../figure.js';

const A = 0;
const END = 6;
const SAY1 = 3; // string 1: "pin B is 3 m from pin A"
const SAY2 = 4; // string 2: "pin C is 4 m from pin B"

/**
 * A tug of war. Two strings disagree about where the middle pin belongs. The pin settles nearer
 * the string we trust more, because trusting more means pulling harder.
 */
export function tug(root) {
  let x = 3; // where the pin is drawn
  let v = 0;
  let last = 0;

  return mountFigure(root, {
    aspect: 2.9,
    tall: 1.45,
    controls: false,
    knobs: [
      { id: 'w1', label: 'Trust in string 1', min: 0.2, max: 5, step: 0.1, value: 1 },
      { id: 'w2', label: 'Trust in string 2', min: 0.2, max: 5, step: 0.1, value: 1 },
    ],
    make() {
      return {
        draw(g, w, h, _t, k) {
          const now = performance.now();
          const dt = clamp((now - last) / 1000, 0, 0.05);
          last = now;
          const w1 = k.w1;
          const w2 = k.w2;
          // the pin where the total pull is smallest
          const best = (w1 * (A + SAY1) + w2 * (END - SAY2)) / (w1 + w2);
          v += (-60 * (x - best) - 9 * v) * dt;
          x += v * dt;

          const pad = 46;
          const X = (p) => pad + (p / END) * (w - 2 * pad);
          const ay = h * 0.42;
          const e1 = x - (A + SAY1);
          const e2 = END - x - SAY2;
          const pull1 = w1 * e1 * e1;
          const pull2 = w2 * e2 * e2;

          // where each string wants the pin
          for (const [p, col, name] of [
            [A + SAY1, C.blue, 'string 1 says here'],
            [END - SAY2, C.warn, 'string 2 says here'],
          ]) {
            g.save();
            g.strokeStyle = alpha(col, 0.8);
            g.setLineDash([4, 4]);
            g.lineWidth = 1.6;
            g.beginPath();
            g.arc(X(p), ay, 11, 0, Math.PI * 2);
            g.stroke();
            g.restore();
            label(g, name, X(p), col === C.warn ? ay + 52 : ay - 34, col, 'center');
          }

          // the strings: thicker and tighter when we trust them more
          const coil = (wt) => ({
            width: 1.2 + wt * 0.7,
            amp: 4 + wt * 1.6,
            coils: 7 + Math.round(wt * 2),
          });
          spring(g, X(A), ay, X(x), ay, { color: C.blue, ...coil(w1) });
          spring(g, X(x), ay, X(END), ay, { color: C.warn, ...coil(w2) });

          // how far each string is stretched
          label(
            g,
            `stretched ${Math.abs(e1).toFixed(1)} m`,
            (X(A) + X(x)) / 2,
            ay - 22,
            C.blue,
            'center',
          );
          label(
            g,
            `stretched ${Math.abs(e2).toFixed(1)} m`,
            (X(x) + X(END)) / 2,
            ay - 22,
            C.warn,
            'center',
          );

          // the three pins
          for (const [p, col, r, name] of [
            [A, C.accent, 9, 'A'],
            [x, C.ok, 11, 'B'],
            [END, C.accent, 9, 'C'],
          ]) {
            g.save();
            g.beginPath();
            g.arc(X(p), ay, r, 0, Math.PI * 2);
            g.fillStyle = col;
            g.shadowColor = alpha(col, 0.7);
            g.shadowBlur = 12;
            g.fill();
            g.restore();
            label(g, name, X(p), ay + 28, C.mute, 'center');
          }

          // how much each string is paying for the disagreement
          const total = pull1 + pull2 || 1;
          const bx = 26;
          const bw = w - 2 * bx;
          const by = h - 38;
          label(
            g,
            'cost: how much each string is stretched, times how much we trust it',
            bx,
            by - 20,
            C.mute,
          );
          const a = (pull1 / total) * bw;
          g.fillStyle = alpha(C.blue, 0.85);
          g.fillRect(bx, by, a, 14);
          g.fillStyle = alpha(C.warn, 0.85);
          g.fillRect(bx + a, by, bw - a, 14);
          g.strokeStyle = C.line;
          g.strokeRect(bx, by, bw, 14);
          return Math.abs(x - best) > 0.002 || Math.abs(v) > 0.01;
        },
      };
    },
  });
}
