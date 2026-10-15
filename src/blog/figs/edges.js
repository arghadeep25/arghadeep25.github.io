import { composePose, relativePose, wrapAngle } from '../../algos/geometry.js';
import { clamp } from '../../core/math.js';
import { C, alpha } from '../palette.js';
import { arrow, label, makeView, node, spring, stretchColor } from '../draw.js';
import { mountFigure } from '../figure.js';

/** Where pin i sits, and what the sensor says about pin j: 3 m on, 0.8 m left, turned a little. */
const XI = [-4.2, -1, 0.15];
const Z = [3.6, 0.8, 0.35];

/**
 * An edge is a string between two pins. The sensor says where pin j should be (blue); the pins say
 * where it is (green). The gap is the error (red), and the string pulls j back to where the sensor
 * says. Drag the pin, or turn it by its arrow tip, and let go.
 */
export function edges(root) {
  const goal = composePose(XI, Z);
  // pin j: position, heading and their speeds
  const j = { x: goal[0] + 1.7, y: goal[1] - 1.5, th: goal[2] - 0.7, vx: 0, vy: 0, vth: 0 };
  let grab = null;
  let view = null;
  let last = 0;
  let touched = false;
  let poke = 0;

  let fig;
  fig = mountFigure(root, {
    aspect: 2,
    tall: 1.15,
    controls: false,
    make() {
      return {
        draw(g, w, h) {
          const now = performance.now();
          const dt = clamp((now - last) / 1000, 0, 0.05);
          last = now;
          // the string pulls pin j to where the sensor says it should be
          if (!grab) {
            const kx = 38;
            const c = 5.5;
            j.vx += (-kx * (j.x - goal[0]) - c * j.vx) * dt;
            j.vy += (-kx * (j.y - goal[1]) - c * j.vy) * dt;
            j.vth += (-kx * 0.9 * wrapAngle(j.th - goal[2]) - c * j.vth) * dt;
            j.x += j.vx * dt;
            j.y += j.vy * dt;
            j.th += j.vth * dt;
          }
          view = makeView(w, h, { cx: -0.6, cy: -0.1, hw: 5, hh: 3 }, 24);
          const v = view;
          const X = (p) => v.x(p[0]);
          const Y = (p) => v.y(p[1]);
          const pj = [j.x, j.y, j.th];
          const h_ = relativePose(XI, pj);
          const e = [Z[0] - h_[0], Z[1] - h_[1], wrapAngle(Z[2] - h_[2])];
          const ex = Math.hypot(e[0], e[1]);
          const stretch = clamp(ex / 2 + Math.abs(e[2]) / 1.5, 0, 1);

          // the string between the pin and where it should be
          spring(g, X(pj), Y(pj), X(goal), Y(goal), {
            color: stretchColor(stretch),
            width: 2.2,
            amp: 7,
            coils: 8,
          });
          // the ghost: where the sensor says pin j should be
          node(g, v, goal, { r: 8, color: C.blue, heading: true, fill: false });
          label(g, 'where the sensor says it belongs', X(goal) + 16, Y(goal) - 24, C.blue);
          // the two arrows out of pin i
          arrow(g, X(XI), Y(XI), X(goal) - 9, Y(goal), { color: alpha(C.blue, 0.85), width: 2.4 });
          arrow(g, X(XI) + 2, Y(XI) + 7, X(pj) - 7, Y(pj) + 4, {
            color: alpha(C.ok, 0.9),
            width: 2.4,
          });
          label(
            g,
            'z',
            (X(XI) + X(goal)) / 2,
            (Y(XI) + Y(goal)) / 2 - 16,
            C.blue,
            'center',
            'italic 600 17px Georgia, serif',
          );
          label(
            g,
            'h',
            (X(XI) + X(pj)) / 2 + 2,
            (Y(XI) + Y(pj)) / 2 + 20,
            C.ok,
            'center',
            'italic 600 17px Georgia, serif',
          );

          node(g, v, XI, { r: 8, color: C.accent, heading: true });
          label(g, 'pin i', X(XI), Y(XI) + 26, C.mute, 'center');
          node(g, v, pj, { r: 8, color: C.ok, heading: true });
          label(g, 'pin j', X(pj), Y(pj) + 26, C.mute, 'center');
          // the handle on pin j's heading arrow
          const hx = X(pj) + Math.cos(pj[2]) * 21;
          const hy = Y(pj) - Math.sin(pj[2]) * 21;
          g.save();
          g.beginPath();
          g.arc(hx, hy, 5, 0, Math.PI * 2);
          g.strokeStyle = C.ok;
          g.lineWidth = 2;
          g.stroke();
          g.restore();

          label(g, 'e', 22, h - 52, C.bad, 'left', 'italic 600 17px Georgia, serif');
          label(
            g,
            `the error: ${ex.toFixed(1)} m out, ${Math.round((Math.abs(e[2]) * 180) / Math.PI)}° turned`,
            38,
            h - 52,
            C.bad,
          );
          if (!touched) label(g, 'drag pin j, or turn it by its arrow tip', 22, 24, C.ink);
          else label(g, 'let go and the string pulls it back', 22, 24, C.mute);

          const moving =
            !grab &&
            (Math.hypot(j.vx, j.vy) > 0.01 ||
              Math.abs(j.vth) > 0.01 ||
              Math.hypot(j.x - goal[0], j.y - goal[1]) > 0.005);
          // left alone, the pin gets knocked away every few seconds to show the string at work
          if (!moving && !grab && !touched && !poke) {
            poke = setTimeout(() => {
              poke = 0;
              if (touched) return;
              const a = Math.random() * Math.PI * 2;
              j.x = goal[0] + Math.cos(a) * 1.9;
              j.y = goal[1] + Math.sin(a) * 1.5;
              j.th = goal[2] + (Math.random() < 0.5 ? -0.8 : 0.8);
              fig.redraw();
            }, 3200);
          }
          return moving;
        },
      };
    },
  });

  const cv = fig.canvas;
  const at = (ev) => {
    const r = cv.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  };
  cv.style.touchAction = 'none';
  cv.addEventListener('pointerdown', (ev) => {
    if (!view) return;
    const [px, py] = at(ev);
    const hx = view.x(j.x) + Math.cos(j.th) * 21;
    const hy = view.y(j.y) - Math.sin(j.th) * 21;
    if (Math.hypot(px - hx, py - hy) < 16) grab = 'turn';
    else if (Math.hypot(px - view.x(j.x), py - view.y(j.y)) < 22) grab = 'move';
    if (grab) {
      touched = true;
      j.vx = j.vy = j.vth = 0;
      cv.setPointerCapture(ev.pointerId);
      cv.style.cursor = 'grabbing';
    }
  });
  cv.addEventListener('pointermove', (ev) => {
    if (!view) return;
    const [px, py] = at(ev);
    if (grab === 'move') {
      j.x = clamp(view.wx(px), -6.5, 5.2);
      j.y = clamp(view.wy(py), -3.4, 3.2);
      fig.redraw();
    } else if (grab === 'turn') {
      j.th = Math.atan2(-(py - view.y(j.y)), px - view.x(j.x));
      fig.redraw();
    }
  });
  const drop = () => {
    if (!grab) return;
    grab = null;
    cv.style.cursor = '';
    fig.redraw();
  };
  cv.addEventListener('pointerup', drop);
  cv.addEventListener('pointercancel', drop);
  return fig;
}
