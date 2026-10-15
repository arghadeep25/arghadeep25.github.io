import { graphCost } from '../../algos/pose-graph.js';
import { clamp } from '../../core/math.js';
import { C, alpha } from '../palette.js';
import { label, makeView, node, trail } from '../draw.js';
import { mountFigure } from '../figure.js';
import { sharedScene } from '../slam-scene.js';

const WOBBLE = 0.7;

/** Move and turn a whole set of poses as one rigid piece. */
export function moveAll(poses, dx, dy, turn) {
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  return poses.map((p) => [c * p[0] - s * p[1] + dx, s * p[0] + c * p[1] + dy, p[2] + turn]);
}

/**
 * Every string only knows about the gap between two pins, never where they are on the page. So the
 * whole map can slide or spin and no string notices. Pinning the first dot is what stops that.
 */
export function anchor(root) {
  const S = sharedScene();
  const fr = S.frames(WOBBLE);
  const done = fr.poses[fr.poses.length - 1];
  const edges = [...S.odometry(WOBBLE).edges, S.loop];
  const move = { dx: 0, dy: 0, turn: 0 };
  let pinned = false;
  let grab = null;
  let view = null;
  let last = 0;

  const fig = mountFigure(root, {
    aspect: 2,
    tall: 1.05,
    controls: false,
    make() {
      return {
        draw(g, w, h) {
          const now = performance.now();
          const dt = clamp((now - last) / 1000, 0, 0.05);
          last = now;
          let moving = false;
          if (pinned && !grab) {
            // the pin pulls the whole map back to where it belongs
            const k = 1 - Math.exp(-dt * 7);
            for (const key of ['dx', 'dy', 'turn']) {
              move[key] -= move[key] * k;
              if (Math.abs(move[key]) > 0.002) moving = true;
              else move[key] = 0;
            }
          }
          const v = (view = makeView(w, h, { hw: 15, hh: 8.6 }, 20));
          // dots on the page, so sliding can be seen
          g.fillStyle = 'rgba(255,255,255,0.1)';
          for (let x = -30; x <= 30; x += 3) {
            for (let y = -18; y <= 18; y += 3) g.fillRect(v.x(x) - 1, v.y(y) - 1, 2, 2);
          }
          const P = moveAll(done, move.dx, move.dy, move.turn);
          trail(g, v, P, P.length - 1, alpha(C.accent, 0.95), 2.4);
          P.forEach((p, i) =>
            node(g, v, p, { r: i === 0 ? 6 : 3.2, color: i === 0 ? C.ok : C.accent }),
          );
          const o = P[0];
          if (pinned) {
            g.save();
            g.strokeStyle = C.ok;
            g.lineWidth = 2;
            g.beginPath();
            g.arc(v.x(o[0]), v.y(o[1]), 13, 0, Math.PI * 2);
            g.stroke();
            g.restore();
            label(g, 'pinned', v.x(o[0]) + 20, v.y(o[1]) - 14, C.ok);
          } else {
            label(g, 'first pin', v.x(o[0]) + 14, v.y(o[1]) - 12, C.ok);
          }

          const price = graphCost(P, edges, []);
          label(g, `price of this map: ${price.toFixed(1)}`, 22, 24, C.ink);
          label(
            g,
            pinned ? 'the pin holds the map still' : 'drag the map. The price never changes.',
            22,
            44,
            pinned ? C.ok : C.mute,
          );
          return moving;
        },
      };
    },
  });

  const bar = root.querySelector('.fig__bar');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'fig__play';
  toggle.style.minWidth = '140px';
  const sync = () => {
    toggle.textContent = pinned ? 'Unpin the first dot' : 'Pin the first dot';
    toggle.setAttribute('aria-pressed', String(pinned));
  };
  sync();
  toggle.addEventListener('click', () => {
    pinned = !pinned;
    sync();
    fig.redraw();
  });
  const turn = document.createElement('label');
  turn.className = 'fig__knob';
  turn.innerHTML =
    '<span>Turn it</span><input type="range" min="-180" max="180" step="1" value="0" /><output>0°</output>';
  const input = turn.querySelector('input');
  const out = turn.querySelector('output');
  input.addEventListener('input', () => {
    if (pinned) {
      input.value = '0';
      return;
    }
    move.turn = (+input.value * Math.PI) / 180;
    out.textContent = `${input.value}°`;
    fig.redraw();
  });
  bar.append(toggle, turn);

  const cv = fig.canvas;
  cv.style.touchAction = 'none';
  const at = (e) => {
    const r = cv.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  cv.addEventListener('pointerdown', (e) => {
    if (pinned || !view) return;
    const [px, py] = at(e);
    grab = [view.wx(px) - move.dx, view.wy(py) - move.dy];
    cv.setPointerCapture(e.pointerId);
    cv.style.cursor = 'grabbing';
  });
  cv.addEventListener('pointermove', (e) => {
    if (!grab || !view) return;
    const [px, py] = at(e);
    move.dx = clamp(view.wx(px) - grab[0], -10, 10);
    move.dy = clamp(view.wy(py) - grab[1], -6, 6);
    fig.redraw();
  });
  const drop = () => {
    grab = null;
    cv.style.cursor = '';
  };
  cv.addEventListener('pointerup', drop);
  cv.addEventListener('pointercancel', drop);
  // keep the slider label honest when the pin snaps the map back
  const watch = setInterval(() => {
    if (pinned && input.value !== '0' && move.turn === 0) {
      input.value = '0';
      out.textContent = '0°';
    }
  }, 300);
  void watch;
  return fig;
}
