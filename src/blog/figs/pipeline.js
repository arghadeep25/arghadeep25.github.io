import { clamp } from '../../core/math.js';
import { C, alpha } from '../palette.js';
import { label } from '../draw.js';
import { mountFigure } from '../figure.js';

const BLOCKS = [
  { name: 'Sensors', text: 'Camera and lidar send raw readings.', side: 'front' },
  { name: 'Features', text: 'Pick out corners, edges and landmarks.', side: 'front' },
  { name: 'Loop finder', text: 'Ask: have I seen this place before?', side: 'front' },
  { name: 'Graph', text: 'Pins and strings, handed over as they are.', side: 'back' },
  { name: 'Optimiser', text: 'Move every pin to make the total price small.', side: 'back' },
  { name: 'Map', text: 'One clean map and one clean path.', side: 'back' },
];
const EACH = 2.4;

/** Frontend (quick, local, noisy) hands a graph to the backend (careful, global, tidy). */
export function pipeline(root) {
  return mountFigure(root, {
    aspect: 2.1,
    tall: 1.15,
    length: EACH * BLOCKS.length,
    rest: 0,
    make() {
      return {
        draw(g, w, h, t) {
          const pad = 16;
          const gap = Math.max(14, w * 0.04);
          const bw = (w - 2 * pad - 2 * gap) / 3;
          const bh = Math.min(70, h * 0.22);
          const rowY = [h * 0.2, h * 0.58];
          // blocks are laid out as a snake: the top row runs right, the bottom row runs left
          const pos = BLOCKS.map((_, i) => {
            const row = i < 3 ? 0 : 1;
            const col = row === 0 ? i : 5 - i;
            return { x: pad + col * (bw + gap), y: rowY[row] };
          });
          const active = clamp(Math.floor(t / EACH), 0, BLOCKS.length - 1);
          const prog = clamp((t - active * EACH) / EACH, 0, 1);

          // the two group frames
          const frame = (y, title, sub, color) => {
            g.save();
            g.strokeStyle = alpha(color, 0.35);
            g.fillStyle = alpha(color, 0.05);
            g.lineWidth = 1;
            g.setLineDash([5, 5]);
            g.beginPath();
            g.roundRect(pad - 8, y - 26, w - 2 * pad + 16, bh + 38, 14);
            g.fill();
            g.stroke();
            g.restore();
            label(g, title, pad, y - 13, color, 'left', "600 12px 'Montserrat', sans-serif");
            label(g, sub, w - pad, y - 13, C.dim, 'right');
          };
          frame(rowY[0], 'FRONTEND', 'quick · local · noisy', C.blue);
          frame(rowY[1], 'BACKEND', 'careful · global · tidy', C.ok);

          // links
          g.save();
          g.lineWidth = 2;
          for (let i = 0; i < BLOCKS.length - 1; i++) {
            const a = pos[i];
            const b = pos[i + 1];
            const done = i < active;
            g.strokeStyle = done ? alpha(C.accent, 0.8) : C.line;
            g.beginPath();
            if (i === 2) {
              // down from the right end of the top row to the right end of the bottom row
              g.moveTo(a.x + bw / 2, a.y + bh);
              g.lineTo(b.x + bw / 2, b.y);
            } else if (i < 2) {
              g.moveTo(a.x + bw, a.y + bh / 2);
              g.lineTo(b.x, b.y + bh / 2);
            } else {
              g.moveTo(a.x, a.y + bh / 2);
              g.lineTo(b.x + bw, b.y + bh / 2);
            }
            g.stroke();
          }
          g.restore();

          // the blocks
          BLOCKS.forEach((b, i) => {
            const p = pos[i];
            const on = i === active;
            const color = b.side === 'front' ? C.blue : C.ok;
            g.save();
            g.fillStyle = on ? alpha(color, 0.22) : 'rgba(255,255,255,0.04)';
            g.strokeStyle = on ? color : i < active ? alpha(color, 0.5) : C.line;
            g.lineWidth = on ? 2 : 1.2;
            if (on) {
              g.shadowColor = alpha(color, 0.5);
              g.shadowBlur = 16;
            }
            g.beginPath();
            g.roundRect(p.x, p.y, bw, bh, 10);
            g.fill();
            g.stroke();
            g.restore();
            label(
              g,
              b.name,
              p.x + bw / 2,
              p.y + bh / 2,
              on ? C.ink : C.mute,
              'center',
              "600 13px 'Montserrat', sans-serif",
            );
            label(g, String(i + 1), p.x + 10, p.y + 12, on ? color : C.dim, 'left');
          });

          // the data packet riding along the link into the active block
          if (active > 0) {
            const a = pos[active - 1];
            const b = pos[active];
            const u = clamp(prog * 2.2, 0, 1);
            const from =
              active === 3
                ? [a.x + bw / 2, a.y + bh]
                : active < 3
                  ? [a.x + bw, a.y + bh / 2]
                  : [a.x, a.y + bh / 2];
            const to =
              active === 3
                ? [b.x + bw / 2, b.y]
                : active < 3
                  ? [b.x, b.y + bh / 2]
                  : [b.x + bw, b.y + bh / 2];
            if (u < 1) {
              g.fillStyle = C.accent;
              g.shadowColor = C.accent;
              g.shadowBlur = 12;
              g.beginPath();
              g.arc(
                from[0] + (to[0] - from[0]) * u,
                from[1] + (to[1] - from[1]) * u,
                5,
                0,
                Math.PI * 2,
              );
              g.fill();
              g.shadowBlur = 0;
            }
          }

          label(
            g,
            BLOCKS[active].text,
            w / 2,
            h - 16,
            C.ink,
            'center',
            "500 13px 'Montserrat', sans-serif",
          );
        },
      };
    },
  });
}
