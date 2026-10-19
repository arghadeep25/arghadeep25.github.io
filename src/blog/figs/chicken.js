import { clamp } from '../../core/math.js';
import { C, alpha } from '../palette.js';
import { label, makeView, robot } from '../draw.js';
import { mountFigure } from '../figure.js';

const LENGTH = 12;
const ROOM = { hw: 7, hh: 4 };
const RAYS = 28;
const RANGE = 6.5;

/** Where a ray from (x, y) at angle a first hits the room's walls, or null if it is out of range. */
function castRay(x, y, a) {
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  let best = Infinity;
  for (const [wall, d, o, lim] of [
    [ROOM.hw, dx, x, ROOM.hh],
    [-ROOM.hw, dx, x, ROOM.hh],
    [ROOM.hh, dy, y, ROOM.hw],
    [-ROOM.hh, dy, y, ROOM.hw],
  ]) {
    if (Math.abs(d) < 1e-9) continue;
    const s = (wall - o) / d;
    if (s > 0 && s < best) {
      const px = x + dx * s;
      const py = y + dy * s;
      const other = d === dx ? py : px;
      if (Math.abs(other) <= lim + 1e-6) best = s;
    }
  }
  return best <= RANGE ? best : null;
}

/** A laser scan stamped onto a map from a believed pose. The better the pose, the crisper the map. */
export function chicken(root) {
  const lap = (u) => {
    const s = u * Math.PI * 2;
    return [
      4.2 * Math.cos(s),
      1.9 * Math.sin(s),
      Math.atan2(1.9 * Math.cos(s), -4.2 * Math.sin(s)),
    ];
  };
  const STEPS = 40;
  return mountFigure(root, {
    aspect: 2.2,
    tall: 1.1,
    length: LENGTH,
    rest: LENGTH,
    knobs: [{ id: 'err', label: 'Pose error', min: 0, max: 1, step: 0.01, value: 0.55 }],
    make() {
      return {
        draw(g, w, h, t, k) {
          const stacked = w < 560;
          const pw = stacked ? w : w / 2;
          const ph = stacked ? h / 2 : h;
          const f = clamp(t / (LENGTH - 1.5), 0, 1) * STEPS;
          const have = Math.floor(f);
          const wall = 'rgba(255,255,255,0.22)';

          const panel = (ox, oy, title, fn) => {
            g.save();
            g.translate(ox, oy);
            g.beginPath();
            g.rect(0, 0, pw, ph);
            g.clip();
            const v = makeView(pw, ph, { hw: ROOM.hw + 0.5, hh: ROOM.hh + 0.9 }, 16);
            label(g, title, 14, 16, C.mute, 'left');
            fn(v);
            g.restore();
          };

          const drawRoom = (v, color, dash) => {
            g.save();
            g.strokeStyle = color;
            g.lineWidth = 2;
            if (dash) g.setLineDash(dash);
            g.strokeRect(v.x(-ROOM.hw), v.y(ROOM.hh), 2 * ROOM.hw * v.s, 2 * ROOM.hh * v.s);
            g.restore();
          };

          // left: the real world, with the laser rays
          panel(0, 0, 'the real room', (v) => {
            drawRoom(v, wall);
            const p = lap(f / STEPS);
            g.save();
            g.strokeStyle = alpha(C.blue, 0.25);
            g.lineWidth = 1;
            for (let r = 0; r < RAYS; r++) {
              const a = p[2] + (r / RAYS) * Math.PI * 2;
              const s = castRay(p[0], p[1], a);
              if (s === null) continue;
              g.beginPath();
              g.moveTo(v.x(p[0]), v.y(p[1]));
              g.lineTo(v.x(p[0] + Math.cos(a) * s), v.y(p[1] + Math.sin(a) * s));
              g.stroke();
            }
            g.restore();
            robot(g, v, p, 'rgba(255,255,255,0.85)', 11);
          });

          // right: the map it draws, using where it *thinks* it is
          panel(stacked ? 0 : pw, stacked ? ph : 0, 'the map it draws', (v) => {
            if (!stacked) {
              g.strokeStyle = C.line;
              g.beginPath();
              g.moveTo(0.5, 0);
              g.lineTo(0.5, ph);
              g.stroke();
            }
            g.fillStyle = alpha(C.accent, 0.8);
            for (let i = 0; i <= have; i++) {
              const p = lap(i / STEPS);
              const grow = i / STEPS;
              // the believed pose slides away from the real one, a little more with every step
              const e = [
                p[0] + k.err * 1.1 * grow,
                p[1] - k.err * 0.5 * grow,
                p[2] + k.err * 0.22 * grow,
              ];
              for (let r = 0; r < RAYS; r++) {
                const rel = (r / RAYS) * Math.PI * 2;
                const s = castRay(p[0], p[1], p[2] + rel);
                if (s === null) continue;
                const a = e[2] + rel;
                g.fillRect(
                  v.x(e[0] + Math.cos(a) * s) - 1.2,
                  v.y(e[1] + Math.sin(a) * s) - 1.2,
                  2.4,
                  2.4,
                );
              }
            }
            drawRoom(v, 'rgba(255,255,255,0.1)', [4, 6]);
            const p = lap(f / STEPS);
            const grow = f / STEPS;
            robot(
              g,
              v,
              [p[0] + k.err * 1.1 * grow, p[1] - k.err * 0.5 * grow, p[2] + k.err * 0.22 * grow],
              C.accent,
              11,
            );
            label(
              g,
              k.err < 0.12 ? 'sharp: the pose was right' : 'smeared: the pose was wrong',
              pw / 2,
              ph - 14,
              k.err < 0.12 ? C.ok : C.bad,
              'center',
            );
          });
        },
      };
    },
  });
}
