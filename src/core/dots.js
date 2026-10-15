import { stepDot } from './spring.js';

const TAU = Math.PI * 2;
const VIOLET = [139, 124, 255];
const BLUE = [62, 155, 255];

/** Violet to blue gradient, t in 0..1, as an rgba() string. */
export function gradientColor(t, alpha = 1) {
  const k = Math.min(1, Math.max(0, t));
  const c = VIOLET.map((v, i) => Math.round(v + (BLUE[i] - v) * k));
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}

/**
 * A canvas full of dots that spring to target positions and shy away from the pointer.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object} [options]
 * @param {number} [options.count=700] number of dots
 * @param {number} [options.radius] pointer repulsion radius in CSS px
 * @param {import('./spring.js').SpringOptions} [options.spring] spring tuning
 * @param {(dot: object, t: number) => string} [options.color] colour per dot; t is x across the canvas
 * @param {boolean} [options.reducedMotion] snap to targets and skip the idle shimmer
 */
export function createDotField(canvas, options = {}) {
  const g = canvas.getContext('2d');
  const count = options.count ?? 700;
  const reduced = options.reducedMotion ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
  const color = options.color ?? ((dot, t) => gradientColor(t, 0.62 + 0.38 * dot.h));

  let width = 0;
  let height = 0;
  let pointer = null;
  let visible = true;
  let raf = 0;
  let time = 0;
  let last = 0;

  const dots = Array.from({ length: count }, () => ({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    tx: 0,
    ty: 0,
    h: Math.random(),
    phase: Math.random() * TAU,
  }));

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * Send the dots to a new set of points (CSS px, canvas space).
   * Points and dots are both ordered by angle so neighbours travel together.
   * @param {{ x: number, y: number }[]} points any length; extra dots reuse points
   * @param {{ kick?: number }} [opts] kick: random impulse so the move looks alive
   */
  function setTargets(points, { kick = 0 } = {}) {
    if (!points.length) return;
    const cx = width / 2;
    const cy = height / 2;
    const angle = (p) => Math.atan2(p.y - cy, p.x - cx);
    const sorted = [...points].sort((a, b) => angle(a) - angle(b));
    const order = dots.map((_, i) => i).sort((a, b) => angle2(dots[a]) - angle2(dots[b]));
    function angle2(d) {
      return Math.atan2(d.ty - cy, d.tx - cx);
    }
    order.forEach((di, i) => {
      const p = sorted[Math.floor((i / order.length) * sorted.length)];
      const d = dots[di];
      d.tx = p.x;
      d.ty = p.y;
      if (kick && !reduced) {
        d.vx += (Math.random() - 0.5) * kick;
        d.vy += (Math.random() - 0.5) * kick;
      }
      if (reduced) {
        d.x = d.tx;
        d.y = d.ty;
      }
    });
  }

  /** Scatter dots randomly over the canvas, e.g. before a first assemble. */
  function scatter() {
    for (const d of dots) {
      d.x = Math.random() * width;
      d.y = Math.random() * height;
      d.vx = d.vy = 0;
    }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!pointer && now - last < 30) return; // idle: 30 frames a second is enough
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (!visible || !width) return;
    time += dt;
    g.clearRect(0, 0, width, height);
    const radius = options.radius ?? Math.max(60, Math.min(width, height) * 0.14);
    for (const d of dots) {
      stepDot(d, dt, pointer, { ...options.spring, radius });
      const shimmer = reduced ? 0 : Math.sin(time * 1.3 + d.phase) * 0.9;
      g.fillStyle = color(d, d.tx / width);
      g.beginPath();
      g.arc(d.x + shimmer, d.y - shimmer, 1.5 + d.h * 0.9, 0, TAU);
      g.fill();
    }
  }

  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onLeave = () => {
    pointer = null;
  };
  const io = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
  });
  const onResize = () => resize();

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  window.addEventListener('resize', onResize);
  io.observe(canvas);
  resize();

  return {
    dots,
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    resize,
    setTargets,
    scatter,
    start() {
      cancelAnimationFrame(raf);
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      cancelAnimationFrame(raf);
    },
    destroy() {
      cancelAnimationFrame(raf);
      io.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('resize', onResize);
    },
  };
}
