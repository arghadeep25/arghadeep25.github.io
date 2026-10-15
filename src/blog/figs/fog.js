import { poseCovariances } from '../../algos/pose-graph.js';
import { clamp, mix, smoothstep } from '../../core/math.js';
import { C, alpha } from '../palette.js';
import {
  blendPoses,
  ellipse,
  label,
  makeView,
  node,
  poseAt,
  robot,
  spring,
  trail,
} from '../draw.js';
import { mountFigure } from '../figure.js';
import { sharedScene } from '../slam-scene.js';

const WOBBLE = 0.5;
const DRIVE = 5;
const CLOSE = 6;
const RELAX = 7.2;
const LENGTH = 13;

/** Radii and tilt of the ellipse for a 2 x 2 covariance [xx, xy, yy]. */
export function ellipseOf([xx, xy, yy], sigmas = 2) {
  const m = (xx + yy) / 2;
  const d = Math.sqrt(((xx - yy) / 2) ** 2 + xy * xy);
  return {
    rx: sigmas * Math.sqrt(Math.max(m + d, 0)),
    ry: sigmas * Math.sqrt(Math.max(m - d, 0)),
    rot: 0.5 * Math.atan2(2 * xy, xx - yy),
  };
}

/**
 * Each pin carries a cloud: where it might really be. The cloud grows while the robot only counts
 * steps, and shrinks once a loop closure ties the end back to the start.
 */
export function fog(root) {
  const S = sharedScene();
  let data = null;
  const compute = () => {
    const o = S.odometry(WOBBLE);
    const anchor = [{ i: 0, t: 'anchor', z: S.truth[0], w: 1e6 }];
    const solved = S.frames(WOBBLE).poses.at(-1);
    return {
      open: o.poses,
      closed: solved,
      covOpen: poseCovariances(o.poses, o.edges, anchor),
      covClosed: poseCovariances(solved, [...o.edges, S.loop], anchor),
    };
  };

  return mountFigure(root, {
    aspect: 2,
    tall: 1.05,
    length: LENGTH,
    rest: LENGTH,
    make() {
      return {
        draw(g, w, h, t) {
          data ||= compute();
          const v = makeView(w, h, { hw: 12.5, hh: 8 }, 22);
          const f = clamp(t / DRIVE, 0, 1) * (S.n - 1);
          const have = Math.floor(f);
          const u = smoothstep((t - RELAX) / 4.5);
          const P = blendPoses(data.open, data.closed, u);
          const tie = smoothstep((t - CLOSE) / 0.8);

          trail(g, v, S.truth, S.n - 1, 'rgba(255,255,255,0.14)', 1.4, [2, 6]);

          // the clouds, drawn first so the path sits on top
          let worst = 0;
          for (let i = 1; i <= have && i < S.n; i++) {
            const c = data.covOpen[i].map((a, k) => mix(a, data.covClosed[i][k], u));
            const e = ellipseOf(c);
            worst = Math.max(worst, e.rx);
            ellipse(g, v, P[i][0], P[i][1], e.rx, e.ry, e.rot, {
              fill: alpha(C.blue, 0.1),
              stroke: alpha(C.blue, 0.55),
              width: 1,
            });
          }

          trail(g, v, P, have, alpha(C.accent, 0.95), 2.2);
          if (tie > 0.01 && have >= S.n - 1) {
            const a = P[S.n - 1];
            const b = P[0];
            const len = Math.hypot(v.x(b[0]) - v.x(a[0]), v.y(b[1]) - v.y(a[1]));
            if (len > 6) {
              spring(
                g,
                v.x(a[0]),
                v.y(a[1]),
                v.x(a[0]) + (v.x(b[0]) - v.x(a[0])) * tie,
                v.y(a[1]) + (v.y(b[1]) - v.y(a[1])) * tie,
                {
                  color: alpha(C.ok, 0.9),
                  width: 2.2,
                  amp: 6,
                  coils: Math.max(4, Math.round(len / 14)),
                },
              );
            }
          }
          for (let i = 0; i <= have && i < S.n; i++)
            node(g, v, P[i], { r: i === 0 ? 5 : 2.6, color: i === 0 ? C.ok : C.accent });
          const rob = f < S.n - 1 ? poseAt(P, f) : P[S.n - 1];
          robot(g, v, rob, C.accent, 10);

          label(g, 'each cloud: where that pin might really be', 18, 22, C.ink);
          label(g, `the widest cloud is ${(worst * 2).toFixed(1)} m across`, 18, 42, C.mute);
          if (t > CLOSE - 0.3 && t < RELAX + 0.6)
            label(
              g,
              'a loop closure ties the end back to the start',
              w / 2,
              h - 22,
              C.ok,
              'center',
            );
        },
      };
    },
  });
}
