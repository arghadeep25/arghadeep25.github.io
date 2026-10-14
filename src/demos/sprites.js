import { TAU } from './common.js';

/**
 * Top-down sprites shared by the scenario demos. Every sprite is drawn at a screen position
 * `(x, y)`, rotated by the world heading `th`, at `sc` pixels per metre.
 */

/** A car seen from above. opts: body, glass, brake (bool), lights (bool), len, wid. */
export function drawCarSprite(c, x, y, th, sc, opts = {}) {
  const {
    body = '#f4f5f8',
    shade = '#a7acb8',
    brake = false,
    lights = true,
    len = 4.4,
    wid = 1.9,
  } = opts;
  const rear = -0.9;
  const front = rear + len;
  const hw = wid / 2;
  c.save();
  c.translate(x, y);
  c.rotate(-th);
  c.shadowColor = 'rgba(0,0,0,.55)';
  c.shadowBlur = 16;
  c.shadowOffsetY = 4;
  c.beginPath();
  c.roundRect(rear * sc, -hw * sc, (front - rear) * sc, wid * sc, 0.5 * sc);
  const g = c.createLinearGradient(0, -hw * sc, 0, hw * sc);
  g.addColorStop(0, body);
  g.addColorStop(1, shade);
  c.fillStyle = g;
  c.fill();
  c.shadowColor = 'transparent';
  c.fillStyle = 'rgba(12,16,26,.88)';
  c.beginPath();
  c.roundRect(
    (rear + len * 0.28) * sc,
    -(hw - 0.17) * sc,
    len * 0.38 * sc,
    (wid - 0.34) * sc,
    0.3 * sc,
  );
  c.fill();
  if (lights) {
    c.fillStyle = 'rgba(255,246,214,.9)';
    for (const s of [-1, 1])
      c.fillRect((front - 0.18) * sc, (s * (hw - 0.3) - 0.12) * sc, 0.16 * sc, 0.24 * sc);
    c.fillStyle = brake ? '#ff3b30' : 'rgba(255,59,48,.45)';
    if (brake) {
      c.shadowColor = '#ff3b30';
      c.shadowBlur = 12;
    }
    for (const s of [-1, 1])
      c.fillRect((rear + 0.02) * sc, (s * (hw - 0.3) - 0.12) * sc, 0.16 * sc, 0.24 * sc);
  }
  c.restore();
}

/** A pedestrian seen from above: shoulders and a head. */
export function drawPedSprite(c, x, y, th, sc, color = '#ffd6a5') {
  c.save();
  c.translate(x, y);
  c.rotate(-th);
  c.fillStyle = color;
  c.beginPath();
  c.ellipse(0, 0, 0.26 * sc, 0.5 * sc, 0, 0, TAU);
  c.fill();
  c.fillStyle = '#fff';
  c.beginPath();
  c.arc(0.04 * sc, 0, 0.2 * sc, 0, TAU);
  c.fill();
  c.restore();
}

/** A cyclist: a thin body with a round rider. */
export function drawBikeSprite(c, x, y, th, sc, color = '#9be15d') {
  c.save();
  c.translate(x, y);
  c.rotate(-th);
  c.strokeStyle = color;
  c.lineWidth = Math.max(1.5, 0.12 * sc);
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(-0.9 * sc, 0);
  c.lineTo(0.9 * sc, 0);
  c.stroke();
  c.fillStyle = color;
  c.beginPath();
  c.ellipse(0, 0, 0.32 * sc, 0.45 * sc, 0, 0, TAU);
  c.fill();
  c.fillStyle = '#fff';
  c.beginPath();
  c.arc(0.1 * sc, 0, 0.17 * sc, 0, TAU);
  c.fill();
  c.restore();
}

/** A box truck: long, with a cab. */
export function drawTruckSprite(c, x, y, th, sc, color = '#4b5568') {
  c.save();
  c.translate(x, y);
  c.rotate(-th);
  c.shadowColor = 'rgba(0,0,0,.55)';
  c.shadowBlur = 16;
  c.fillStyle = color;
  c.beginPath();
  c.roundRect(-4 * sc, -1.25 * sc, 7 * sc, 2.5 * sc, 0.35 * sc);
  c.fill();
  c.shadowColor = 'transparent';
  c.fillStyle = '#2a3140';
  c.beginPath();
  c.roundRect(3.1 * sc, -1.1 * sc, 1.7 * sc, 2.2 * sc, 0.4 * sc);
  c.fill();
  c.fillStyle = 'rgba(12,16,26,.88)';
  c.fillRect(4.2 * sc, -0.9 * sc, 0.5 * sc, 1.8 * sc);
  c.restore();
}

/** Corner brackets around a box centred on (x, y), half sizes hx and hy in pixels. */
export function drawBrackets(c, x, y, hx, hy, color, lw = 1.6) {
  c.save();
  c.strokeStyle = color;
  c.lineWidth = lw;
  c.lineCap = 'round';
  const kx = hx * 0.45;
  const ky = hy * 0.45;
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    c.beginPath();
    c.moveTo(x + dx * hx, y + dy * (hy - ky));
    c.lineTo(x + dx * hx, y + dy * hy);
    c.lineTo(x + dx * (hx - kx), y + dy * hy);
    c.stroke();
  }
  c.restore();
}
