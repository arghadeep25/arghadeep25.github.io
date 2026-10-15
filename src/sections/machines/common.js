/**
 * Shared helpers for the three machine scenes (forklift, drone, delivery robot): small maths,
 * a simple 2D lidar, and the loop that runs a scene only while it is on screen.
 */

/** Move `v` towards `target` by at most `rate * dt`. */
export const approach = (v, target, rate, dt) =>
  v < target ? Math.min(target, v + rate * dt) : Math.max(target, v - rate * dt);

/** A smooth bell: 1 at `c`, falling to 0 at `w` away. */
export function bump(x, c, w) {
  const d = Math.abs(x - c) / w;
  return d >= 1 ? 0 : 0.5 * (1 + Math.cos(Math.PI * d));
}

/** Distance along a ray to an axis-aligned box {x0, y0, x1, y1}, or Infinity. */
export function rayBox(ox, oy, dx, dy, b) {
  let t0 = 0;
  let t1 = Infinity;
  for (const [o, d, lo, hi] of [
    [ox, dx, b.x0, b.x1],
    [oy, dy, b.y0, b.y1],
  ]) {
    if (Math.abs(d) < 1e-12) {
      if (o < lo || o > hi) return Infinity;
      continue;
    }
    let ta = (lo - o) / d;
    let tb = (hi - o) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return Infinity;
  }
  return t0;
}

/** Distance along a ray to a circle, or Infinity. */
export function rayCircle(ox, oy, dx, dy, c) {
  const fx = ox - c.x;
  const fy = oy - c.y;
  const b = fx * dx + fy * dy;
  const q = fx * fx + fy * fy - c.r * c.r;
  const disc = b * b - q;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : Infinity;
}

/**
 * A 2D lidar sweep: `n` rays around (ox, oy), up to `range`, against boxes and circles.
 * @returns {{ x: number, y: number, d: number, what: 'box' | 'circle' }[]} the returns that hit something
 */
export function lidarScan(ox, oy, n, range, boxes, circles, phase = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let best = range;
    let what = null;
    for (const b of boxes) {
      const t = rayBox(ox, oy, dx, dy, b);
      if (t < best) {
        best = t;
        what = 'box';
      }
    }
    for (const c of circles) {
      const t = rayCircle(ox, oy, dx, dy, c);
      if (t < best) {
        best = t;
        what = 'circle';
      }
    }
    if (what) out.push({ x: ox + dx * best, y: oy + dy * best, d: best, what });
  }
  return out;
}

/** Noisy detection of a point: position plus noise growing with range. */
export function noisy(p, range, rnd) {
  const sg = 0.1 + 0.012 * range;
  const g = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(Math.PI * 2 * rnd());
  return { x: p.x + sg * g(), y: p.y + sg * g() };
}

/**
 * Run a scene on a canvas, only while it is on screen.
 * A scene has: world {w, h} in metres, update(dt), draw(g, t) in world units, and chips.
 * With reduced motion the scene is advanced a few seconds and drawn once.
 */
export function runScene(canvas, scene, { reduced = false, onFrame } = {}) {
  const g = canvas.getContext('2d');
  let w = 0;
  let h = 0;
  let k = 1;
  let dpr = 1;
  let t = 0;
  let raf = 0;
  let last = 0;

  const fit = () => {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = Math.max(1, Math.round(r.width));
    h = Math.max(1, Math.round(r.height));
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    k = Math.min(w / scene.world.w, h / scene.world.h);
  };
  const draw = () => {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const ox = (w - scene.world.w * k) / 2;
    const oy = (h - scene.world.h * k) / 2;
    g.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy);
    scene.draw(g, t);
    if (onFrame) onFrame(scene);
  };
  const ro = new ResizeObserver(() => {
    fit();
    draw();
  });
  ro.observe(canvas);
  fit();

  if (reduced) {
    for (let i = 0; i < 360; i++) {
      scene.update(1 / 30);
      t += 1 / 30;
    }
    draw();
    return { stop() {} };
  }

  const frame = (now) => {
    if (now - last < 30) {
      raf = requestAnimationFrame(frame); // small scenes: 30 frames a second is plenty
      return;
    }
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    scene.update(dt);
    t += dt;
    draw();
    raf = requestAnimationFrame(frame);
  };
  const io = new IntersectionObserver(
    (entries) => {
      const on = entries[0].isIntersecting;
      if (on && !raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      } else if (!on && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
    { rootMargin: '80px' },
  );
  io.observe(canvas);
  draw();
  return {
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      io.disconnect();
      ro.disconnect();
    },
  };
}
