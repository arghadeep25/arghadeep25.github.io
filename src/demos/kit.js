import { $, FONT, TAU, clamp } from './common.js';

/**
 * Shared plumbing for the scenario demos (object tracking, route planning, watchdog):
 * a full-window scene canvas, the scenario rail, tiles, metric rows, the status pill,
 * small line charts, and a frame loop. The page markup follows `demo.css`.
 */

/** Size a canvas to its box at the device pixel ratio. Returns the CSS size. */
export function sizeCanvas(cv) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const r = cv.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width * dpr));
  const h = Math.max(1, Math.round(r.height * dpr));
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
  return { w: r.width, h: r.height, dpr };
}

/**
 * Build the scenario rail.
 * @param {string[]} names chip labels
 * @param {(i: number) => void} onPick called when a chip is clicked or a number key is pressed
 * @returns {{ set(active: number, progress?: number): void }}
 */
export function buildRail(names, onPick) {
  const rail = $('rail');
  const chips = names.map((n, i) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.innerHTML = `${n}<span class="bar"></span>`;
    b.addEventListener('click', () => onPick(i));
    rail.appendChild(b);
    return b;
  });
  addEventListener('keydown', (e) => {
    const k = +e.key;
    if (k >= 1 && k <= names.length) onPick(k - 1);
  });
  return {
    set(active, progress = 0) {
      chips.forEach((c, k) => {
        c.classList.toggle('on', k === active);
        c.querySelector('.bar').style.transform = `scaleX(${k === active ? progress : 0})`;
      });
    },
  };
}

/** Fill one tile: text, whether it is highlighted, and a state class ('', 'w', 'a', 'r'). */
export function setTile(id, text, hot, state) {
  const el = $(id);
  el.querySelector('.s').textContent = text;
  el.classList.toggle('hot', !!hot);
  el.querySelector('i').className = state || '';
}

/** Fill the three metric cells under the scenario title. rows: [[label, value], ...] */
export function setMetrics(rows) {
  $('dMetrics').innerHTML = rows
    .map(([l, v]) => `<div><b>${v}</b><span>${l}</span></div>`)
    .join('');
}

/** Set the status pill. cls is '', 'info', 'warn' or 'bad'. */
export function setStatus(cls, text) {
  const el = $('stat');
  el.className = cls;
  el.textContent = text;
}

/**
 * Run `update(dt)` in fixed substeps and `draw(now)` every frame.
 * dt is capped so a background tab does not jump the simulation.
 */
export function startLoop(update, draw, { maxStep = 1 / 60, maxDt = 0.05 } = {}) {
  let last = performance.now();
  let paused = false;
  addEventListener('keydown', (e) => {
    if (e.key === ' ') {
      paused = !paused;
      e.preventDefault();
    }
  });
  function frame(now) {
    const dt = Math.min(maxDt, (now - last) / 1000);
    last = now;
    if (!paused) {
      let r = dt;
      while (r > 1e-6) {
        const d = Math.min(r, maxStep);
        update(d);
        r -= d;
      }
    }
    draw(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return {
    get paused() {
      return paused;
    },
  };
}

/** A rolling buffer of time-stamped samples for the dock charts. */
export class Series {
  constructor(span = 20) {
    this.span = span;
    this.t = [];
    this.v = {};
  }

  push(t, values) {
    this.t.push(t);
    for (const k of Object.keys(values)) (this.v[k] ||= []).push(values[k]);
    while (this.t.length && this.t[0] < t - this.span) {
      this.t.shift();
      for (const k of Object.keys(this.v)) this.v[k].shift();
    }
  }
}

/**
 * Draw a small time chart into a canvas.
 * @param {HTMLCanvasElement} cv
 * @param {Series} series
 * @param {{ key: string, color: string, dash?: number[], fill?: [string, string], width?: number }[]} lines
 * @param {{ min: number, max: number, ticks: number[], unit?: string }} axis
 */
export function drawChart(cv, series, lines, axis) {
  const { w, h, dpr } = sizeCanvas(cv);
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  const right = 30;
  const X = (t) => w - right - ((series.t[series.t.length - 1] - t) / series.span) * (w - right);
  const Y = (v) => h - 10 - ((v - axis.min) / (axis.max - axis.min)) * (h - 18);
  c.font = `10.5px ${FONT}`;
  c.textBaseline = 'middle';
  c.fillStyle = 'rgba(143,160,189,.55)';
  c.strokeStyle = 'rgba(255,255,255,.06)';
  c.lineWidth = 1;
  for (const v of axis.ticks) {
    c.beginPath();
    c.moveTo(0, Y(v));
    c.lineTo(w - right + 2, Y(v));
    c.stroke();
    c.fillText(String(v), w - right + 6, Y(v));
  }
  const n = series.t.length;
  if (n < 2) return;
  for (const ln of lines) {
    const data = series.v[ln.key];
    if (!data) continue;
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const x = X(series.t[i]);
      const y = Y(clamp(data[i], axis.min, axis.max));
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    if (ln.fill) {
      c.save();
      c.lineTo(X(series.t[n - 1]), Y(axis.min));
      c.lineTo(X(series.t[0]), Y(axis.min));
      c.closePath();
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, ln.fill[0]);
      g.addColorStop(1, ln.fill[1]);
      c.fillStyle = g;
      c.fill();
      c.restore();
      c.beginPath();
      for (let i = 0; i < n; i++) {
        const x = X(series.t[i]);
        const y = Y(clamp(data[i], axis.min, axis.max));
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      }
    }
    c.setLineDash(ln.dash || []);
    c.strokeStyle = ln.stroke || ln.color;
    c.lineWidth = ln.width || 2;
    c.lineJoin = 'round';
    c.stroke();
  }
  c.setLineDash([]);
}

/** Dim dot grid behind the world, scrolled with the camera. */
export function drawDotGrid(c, w, h, camX, camY, scale, step = 8) {
  c.fillStyle = '#05060a';
  c.fillRect(0, 0, w, h);
  const g = c.createRadialGradient(w * 0.4, h * 0.5, 0, w * 0.4, h * 0.5, Math.max(w, h) * 0.7);
  g.addColorStop(0, '#0d1118');
  g.addColorStop(1, '#05060a');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgba(255,255,255,.07)';
  const px = step * scale;
  if (px < 4) return;
  const ox = ((-camX * scale) % px) + ((w / 2) % px);
  const oy = ((camY * scale) % px) + ((h / 2) % px);
  for (let x = ox - px; x < w + px; x += px)
    for (let y = oy - px; y < h + px; y += px) c.fillRect(x - 0.5, y - 0.5, 1.4, 1.4);
}

export { TAU };
