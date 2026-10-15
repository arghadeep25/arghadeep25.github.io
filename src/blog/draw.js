import { clamp } from '../core/math.js';
import { C, FONT, alpha } from './palette.js';

/**
 * Drawing helpers shared by the Graph SLAM figures. World units are metres with y up; a view maps
 * them onto the canvas.
 */

/**
 * Fit a world box into a canvas, keeping the shape.
 * @param {number} w canvas width
 * @param {number} h canvas height
 * @param {{ cx?: number, cy?: number, hw: number, hh: number }} box half sizes of the world box
 * @param {number} [pad] border in px
 */
export function makeView(w, h, box, pad = 18) {
  const s = Math.min((w - 2 * pad) / (2 * box.hw), (h - 2 * pad) / (2 * box.hh));
  const cx = box.cx ?? 0;
  const cy = box.cy ?? 0;
  return {
    s,
    x: (px) => w / 2 + (px - cx) * s,
    y: (py) => h / 2 - (py - cy) * s,
    // inverse, for dragging
    wx: (sx) => (sx - w / 2) / s + cx,
    wy: (sy) => -(sy - h / 2) / s + cy,
  };
}

/** The pose that is a fraction `f` of the way along a list of poses (f = 2.5 is halfway from #2 to #3). */
export function poseAt(poses, f) {
  const k = clamp(Math.floor(f), 0, poses.length - 1);
  const k2 = Math.min(k + 1, poses.length - 1);
  const u = clamp(f - k, 0, 1);
  const a = poses[k];
  const b = poses[k2];
  let dth = b[2] - a[2];
  dth = Math.atan2(Math.sin(dth), Math.cos(dth));
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + dth * u];
}

/** Stroke a polyline through the first `count` poses (a fraction is fine: the last piece is partial). */
export function trail(g, v, poses, count, color, width = 2, dash = null) {
  if (count <= 0) return;
  g.save();
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  if (dash) g.setLineDash(dash);
  g.beginPath();
  const whole = Math.floor(count);
  for (let i = 0; i <= whole && i < poses.length; i++) {
    const p = poses[i];
    i ? g.lineTo(v.x(p[0]), v.y(p[1])) : g.moveTo(v.x(p[0]), v.y(p[1]));
  }
  if (count > whole && whole < poses.length - 1) {
    const p = poseAt(poses, count);
    g.lineTo(v.x(p[0]), v.y(p[1]));
  }
  g.stroke();
  g.restore();
}

/** A small robot: a rounded arrowhead that points along the heading. */
export function robot(g, v, pose, color, size = 11, ghost = false) {
  g.save();
  g.translate(v.x(pose[0]), v.y(pose[1]));
  g.rotate(-pose[2]);
  g.beginPath();
  g.moveTo(size * 1.15, 0);
  g.lineTo(-size * 0.8, size * 0.72);
  g.quadraticCurveTo(-size * 0.45, 0, -size * 0.8, -size * 0.72);
  g.closePath();
  if (ghost) {
    g.strokeStyle = color;
    g.lineWidth = 1.4;
    g.setLineDash([3, 3]);
    g.stroke();
  } else {
    g.fillStyle = color;
    g.shadowColor = alpha(color, 0.7);
    g.shadowBlur = 14;
    g.fill();
  }
  g.restore();
}

/** A node: a dot with a thin ring, and an optional heading tick. */
export function node(g, v, pose, { r = 5, color = C.accent, heading = false, fill = true } = {}) {
  const x = v.x(pose[0]);
  const y = v.y(pose[1]);
  g.save();
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  if (fill) {
    g.fillStyle = color;
    g.shadowColor = alpha(color, 0.65);
    g.shadowBlur = 10;
    g.fill();
  } else {
    g.strokeStyle = color;
    g.lineWidth = 1.5;
    g.stroke();
  }
  if (heading) {
    g.shadowBlur = 0;
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(pose[2]) * r * 2.6, y - Math.sin(pose[2]) * r * 2.6);
    g.stroke();
  }
  g.restore();
}

/** A coiled spring between two screen points. `amp` is the coil width in px. */
export function spring(
  g,
  ax,
  ay,
  bx,
  by,
  { color = C.mute, width = 1.6, coils = 9, amp = 5 } = {},
) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 4) return;
  const ux = dx / len;
  const uy = dy / len;
  const lead = Math.min(10, len * 0.2);
  g.save();
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(ax, ay);
  g.lineTo(ax + ux * lead, ay + uy * lead);
  const body = len - 2 * lead;
  const steps = coils * 2;
  for (let i = 1; i < steps; i++) {
    const along = lead + (body * i) / steps;
    const side = (i % 2 ? 1 : -1) * amp;
    g.lineTo(ax + ux * along - uy * side, ay + uy * along + ux * side);
  }
  g.lineTo(bx - ux * lead, by - uy * lead);
  g.lineTo(bx, by);
  g.stroke();
  g.restore();
}

/** An arrow from a to b (screen px) with a filled head. */
export function arrow(g, ax, ay, bx, by, { color = C.ink, width = 2, head = 9 } = {}) {
  const a = Math.atan2(by - ay, bx - ax);
  g.save();
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(ax, ay);
  g.lineTo(bx - Math.cos(a) * head * 0.6, by - Math.sin(a) * head * 0.6);
  g.stroke();
  g.beginPath();
  g.moveTo(bx, by);
  g.lineTo(bx - Math.cos(a - 0.45) * head, by - Math.sin(a - 0.45) * head);
  g.lineTo(bx - Math.cos(a + 0.45) * head, by - Math.sin(a + 0.45) * head);
  g.closePath();
  g.fill();
  g.restore();
}

/** Text at a screen position. */
export function label(g, text, x, y, color = C.mute, align = 'left', font = FONT) {
  g.save();
  g.font = font;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillText(text, x, y);
  g.restore();
}

/** A rotated ellipse (an uncertainty region) around a world position. */
export function ellipse(g, v, x, y, rx, ry, rot, { fill, stroke, width = 1.2 } = {}) {
  g.save();
  g.translate(v.x(x), v.y(y));
  g.rotate(-rot);
  g.beginPath();
  g.ellipse(0, 0, Math.max(0.5, rx * v.s), Math.max(0.5, ry * v.s), 0, 0, Math.PI * 2);
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = width;
    g.stroke();
  }
  g.restore();
}

/** Colour of a spring by how stretched it is (0 relaxed .. 1 very stretched). */
export function stretchColor(s) {
  if (s < 0.08) return alpha(C.mute, 0.7);
  return s < 0.5 ? C.warn : C.bad;
}
