import { smoothstep } from '../../core/math.js';
import { C, alpha } from '../palette.js';
import { label } from '../draw.js';
import { mountFigure } from '../figure.js';

const LENGTH = 10;
const CMAX = 4.5;

/** A bell of "how likely" turns upside down into a bowl of "how costly". Same curve, new view. */
export function bell(root) {
  return mountFigure(root, {
    aspect: 2.1,
    tall: 1.15,
    length: LENGTH,
    rest: LENGTH,
    knobs: [
      { id: 'sig', label: 'Trust (σ)', min: 0.5, max: 1.8, step: 0.01, value: 1 },
      { id: 'e', label: 'Error e', min: -3, max: 3, step: 0.01, value: 1.4 },
    ],
    make() {
      return {
        draw(g, w, h, t, k) {
          const u = smoothstep((t - 2.5) / 4);
          const padX = 36;
          const top = 44;
          const bot = h - 52;
          const X = (e) => w / 2 + (e / 3.4) * (w / 2 - padX);
          const like = (e) => Math.exp((-e * e) / (2 * k.sig * k.sig));
          const price = (e) => (e * e) / (2 * k.sig * k.sig);
          // one number that slides from "likelihood" (0) to "price" (1) so the curve turns over
          const val = (e) => like(e) * (1 - u) + (price(e) / CMAX) * u;
          const Y = (n) => bot - n * (bot - top);

          // axis
          g.strokeStyle = C.line;
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(padX, bot);
          g.lineTo(w - padX, bot);
          g.stroke();
          label(g, 'error e', w - padX, bot + 16, C.dim, 'right');
          label(g, '0', X(0), bot + 16, C.dim, 'center');

          // the curve, cut off where it leaves the frame
          const color = u < 0.5 ? C.blue : C.warn;
          g.save();
          g.beginPath();
          g.rect(0, top - 10, w, bot - top + 14);
          g.clip();
          g.beginPath();
          for (let i = 0; i <= 120; i++) {
            const e = -3.4 + (i / 120) * 6.8;
            const x = X(e);
            const y = Y(val(e));
            i ? g.lineTo(x, y) : g.moveTo(x, y);
          }
          g.strokeStyle = color;
          g.lineWidth = 3;
          g.shadowColor = alpha(color, 0.5);
          g.shadowBlur = 12;
          g.stroke();
          g.restore();

          // the marked error
          const ex = X(k.e);
          const ey = Y(val(k.e));
          g.save();
          g.strokeStyle = alpha(C.bad, 0.7);
          g.setLineDash([4, 4]);
          g.beginPath();
          g.moveTo(ex, bot);
          g.lineTo(ex, ey);
          g.stroke();
          g.restore();
          g.fillStyle = C.bad;
          g.beginPath();
          g.arc(ex, ey, 5.5, 0, Math.PI * 2);
          g.fill();

          label(
            g,
            u < 0.5 ? 'how likely is this error?' : 'how much does this error cost?',
            14,
            18,
            C.mute,
            'left',
          );
          label(
            g,
            u < 0.5 ? `likelihood ${like(k.e).toFixed(2)}` : `price ${price(k.e).toFixed(2)}`,
            w - 16,
            18,
            u < 0.5 ? C.blue : C.warn,
            'right',
            "600 13px 'Montserrat', sans-serif",
          );
          label(
            g,
            u < 0.5
              ? 'small errors are common, big ones are rare'
              : 'rare errors are expensive. The best map is the cheapest.',
            w / 2,
            h - 14,
            C.ink,
            'center',
          );
        },
      };
    },
  });
}
