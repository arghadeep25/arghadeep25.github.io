import { TAU, clamp, mix, smoothstep } from '../core/math.js';
import { stepDot } from '../core/spring.js';
import { typewriter } from '../core/typewriter.js';

const VIOLET = [139, 124, 255];
const BLUE = [62, 155, 255];
const ROLES = ['Lead Software Developer', 'Photographer', 'Human'];

/** 16 hues from violet to blue, each in 9 levels of whiteness, as ready-made colour strings. */
const RAMP = Array.from({ length: 16 }, (_, i) =>
  Array.from({ length: 9 }, (_, w) => {
    const t = i / 15;
    const white = (w / 8) * 0.9;
    const c = VIOLET.map((v, k) => Math.round(mix(mix(v, BLUE[k], t), 255, white)));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }),
);

/**
 * Landing section: the name drawn as a dot matrix that assembles on load, parts around the
 * pointer, and bursts past the viewer as the page scrolls.
 * @param {HTMLElement} root the #home section
 */
export function initLanding(root) {
  const canvas = root.querySelector('canvas');
  const g = canvas.getContext('2d');
  const hero = root.querySelector('.landing__hero');
  const nameBox = root.querySelector('[data-name-box]');
  const cta = root.querySelector('.landing__cta');
  const hint = root.querySelector('.landing__scroll');
  const roles = root.querySelector('[data-roles]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0;
  let H = 0;
  let spacing = 7;
  let dots = [];
  let time = 0;
  let last = performance.now();
  let pointer = null;
  let target = 0; // scroll progress, 0..1
  let progress = 0; // eased
  let velocity = 0;
  let prevProgress = 0;
  let ready = false;
  let visible = true;

  /** Rasterise the name and turn the pixels into a lattice of dots plus a faint ambient field. */
  function setup(first) {
    const dpr = Math.min(2, devicePixelRatio || 1);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    const lines = W < 640 ? 2 : 1;
    const fs = Math.min(W < 640 ? W * 0.17 : W * 0.076, H * 0.2 * (lines === 2 ? 1.5 : 1), 150);
    const lh = fs * 1.08;
    nameBox.style.height = `${lines * lh}px`;
    const sr = nameBox.getBoundingClientRect();
    const pr = canvas.getBoundingClientRect();
    const cy = sr.top - pr.top + sr.height / 2;

    spacing = Math.max(4.2, fs / 24);
    const bh = Math.ceil(lines * lh + fs * 0.9);
    const top = cy - bh / 2;
    const off = document.createElement('canvas');
    off.width = Math.ceil(W);
    off.height = bh;
    const o = off.getContext('2d', { willReadFrequently: true });
    o.fillStyle = '#fff';
    o.textAlign = 'center';
    o.textBaseline = 'middle';
    o.font = `600 ${fs}px Montserrat, "Helvetica Neue", Arial, sans-serif`;
    try {
      o.letterSpacing = `${-0.03 * fs}px`;
    } catch {
      /* older browsers: default spacing */
    }
    const words = lines === 2 ? ['Arghadeep', 'Mazumder'] : ['Arghadeep Mazumder'];
    words.forEach((w, i) => o.fillText(w, W / 2, bh / 2 + (i - (lines - 1) / 2) * lh + fs * 0.04));
    const px = o.getImageData(0, 0, off.width, bh).data;

    const cols = Math.floor(W / spacing);
    const rows = Math.floor(bh / spacing);
    const x0 = (W - cols * spacing) / 2 + spacing / 2;
    const y0 = (bh - rows * spacing) / 2 + spacing / 2;
    const alpha = (x, y) =>
      px[(clamp(y | 0, 0, bh - 1) * off.width + clamp(x | 0, 0, off.width - 1)) * 4 + 3] / 255;
    const ink = new Float32Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = x0 + c * spacing;
        const y = y0 + r * spacing;
        const q = spacing * 0.28;
        ink[r * cols + c] =
          (alpha(x - q, y - q) + alpha(x + q, y - q) + alpha(x - q, y + q) + alpha(x + q, y + q)) /
          4;
      }
    }

    const next = [];
    const reach = 4;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = ink[r * cols + c];
        let near = 0;
        if (v < 0.03) {
          for (let dy = -reach; dy <= reach; dy++) {
            for (let dx = -reach; dx <= reach; dx++) {
              const rr = r + dy;
              const cc = c + dx;
              if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
              const w = ink[rr * cols + cc] * (1 - Math.hypot(dx, dy) / (reach + 1));
              if (w > near) near = w;
            }
          }
        }
        if (v < 0.03 && near < 0.05) continue;
        const bx = x0 + c * spacing;
        next.push(makeDot(bx, top + y0 + r * spacing, v, near, bx / W, false));
      }
    }
    const ambient = Math.round((W * H) / 2600);
    for (let i = 0; i < ambient; i++) {
      next.push(makeDot(Math.random() * W, Math.random() * H, 0, 0, Math.random(), true));
    }

    if (first && !reduced) {
      for (const d of next) {
        const a = Math.random() * TAU;
        const r = 160 + Math.random() * Math.max(W, H) * 0.7;
        d.x = d.tx + Math.cos(a) * r;
        d.y = d.ty + Math.sin(a) * r;
        d.delay = (d.amb ? Math.random() * 0.8 : (d.tx / W) * 0.9 + Math.random() * 0.5) + 0.15;
      }
    }
    dots = next;
  }

  function makeDot(x, y, ink, near, hx, amb) {
    return {
      x,
      y,
      tx: x,
      ty: y,
      vx: 0,
      vy: 0,
      ink,
      near,
      amb,
      h: Math.random(),
      hue: clamp(Math.round(hx * 15), 0, 15),
      angle: Math.random() * TAU,
      phase: Math.random() * TAU,
      delay: 0,
    };
  }

  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onLeave = () => {
    pointer = null;
  };
  const onScroll = () => {
    const span = root.offsetHeight - innerHeight;
    target = clamp(-root.getBoundingClientRect().top / Math.max(1, span), 0, 1);
  };

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (!ready || !visible) return;
    time += dt;
    progress += (target - progress) * Math.min(1, dt * 7);
    velocity +=
      ((Math.abs(progress - prevProgress) / Math.max(dt, 0.001)) * 0.02 - velocity) *
      Math.min(1, dt * 10);
    prevProgress = progress;

    const radius = Math.max(110, Math.min(W, H) * 0.14);
    const cx = W / 2;
    const cy = H * 0.47;
    const sweep = ((time * 0.16) % 1.7) - 0.35;
    const fade = 1 - smoothstep((progress - 0.5) / 0.38);
    const baseR = spacing * 0.43;
    const scrolled = progress > 0.001;
    const burst = (p, d) => Math.pow(Math.max(0, p), 1.6) * (0.25 + d.h) * Math.max(W, H) * 0.8;

    g.clearRect(0, 0, W, H);
    g.lineCap = 'round';

    for (const d of dots) {
      if (time < d.delay) continue;
      const glow = stepDot(d, dt, pointer, { stiffness: 55, damping: 10.5, radius, force: 3600 });
      const rate = 2 + 2.4 * d.h;
      let x = d.x;
      let y = d.y;
      let grow = 1;
      if (scrolled) {
        const s = Math.exp(progress * rate);
        const b = burst(progress, d);
        x = cx + (d.x - cx) * s + Math.cos(d.angle) * b;
        y = cy + (d.y - cy) * s + Math.sin(d.angle) * b;
        grow = 1 + progress * 1.2 * d.h;
      }
      if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;

      const appear = clamp((time - d.delay) / 0.5, 0, 1);
      let a;
      let r;
      let white;
      if (d.amb) {
        a = (0.16 + 0.14 * Math.sin(time * 1.2 + d.phase)) * appear;
        r = 0.9 + d.h * 0.5;
        white = 0;
      } else if (d.ink > 0.03) {
        a = (0.35 + 0.65 * Math.min(1, d.ink * 1.3)) * appear;
        r = baseR * (0.25 + 0.75 * Math.min(1, d.ink * 1.1));
        white = 0.35 + 0.4 * d.ink;
      } else {
        a = d.near * 0.55 * appear;
        r = spacing * 0.1 + 0.35;
        white = 0;
      }
      const band = ((d.tx + d.ty * 0.4) / (W * 1.2) - sweep) / 0.035;
      const shine = Math.exp(-(band * band));
      white = clamp(white + (d.amb ? 0 : shine * 0.7) + glow * 0.8, 0, 1);
      r += glow * 1.1;
      a = Math.min(1, a + glow * 0.3) * fade;

      g.globalAlpha = a;
      g.fillStyle = RAMP[d.hue][Math.round(white * 8)];
      if (scrolled && velocity > 0.02) {
        const q = progress - Math.min(0.06, velocity * 0.5);
        const s = Math.exp(q * rate);
        const b = burst(q, d);
        g.strokeStyle = g.fillStyle;
        g.lineWidth = Math.max(0.8, r * 1.5 * grow);
        g.beginPath();
        g.moveTo(
          cx + (d.x - cx) * s + Math.cos(d.angle) * b,
          cy + (d.y - cy) * s + Math.sin(d.angle) * b,
        );
        g.lineTo(x, y);
        g.stroke();
      } else {
        g.beginPath();
        g.arc(x, y, Math.max(0.5, r * grow), 0, TAU);
        g.fill();
      }
    }
    g.globalAlpha = 1;

    hero.style.opacity = String(1 - smoothstep(progress / 0.16));
    hint.style.opacity = String(clamp(time - 2.4, 0, 1) * clamp(1 - progress * 10, 0, 1));
    const show = smoothstep((progress - 0.72) / 0.2);
    cta.style.opacity = String(show);
    cta.classList.toggle('is-live', show > 0.6);
  }

  let resizeTimer;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => setup(false), 150);
  });
  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
  }).observe(root);
  addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerleave', onLeave);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  progress = prevProgress = target;

  typewriter(roles, ROLES, { start: 2300 });

  Promise.race([
    document.fonts.load('600 100px Montserrat'),
    new Promise((r) => setTimeout(r, 1800)),
  ]).then(() => {
    setup(true);
    ready = true;
  });
  requestAnimationFrame(frame);
}
