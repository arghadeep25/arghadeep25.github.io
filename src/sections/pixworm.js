import { TAU, clamp, smoothstep } from '../core/math.js';
import { stepDot } from '../core/spring.js';

const ASPECT = 0.8; // photo frame width / height
const ROWS = 60; // dot rows per photo

/**
 * Crop a source image to a frame of the given aspect ratio ("cover"), sliding vertically.
 * @param {number} iw image width
 * @param {number} ih image height
 * @param {number} aspect frame width / height
 * @param {number} focusY 0 = top, 1 = bottom: where to anchor when there is vertical slack
 * @returns {[number, number, number, number]} sx, sy, sw, sh in image pixels
 */
export function coverCrop(iw, ih, aspect, focusY) {
  if (iw / ih > aspect) {
    const sw = ih * aspect;
    return [(iw - sw) / 2, 0, sw, ih];
  }
  const sh = iw / aspect;
  return [0, (ih - sh) * focusY, iw, sh];
}

function roundedRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/**
 * Pixworm section: a strip of photos shown as dot grids. The photo in the middle "develops" from
 * dots into the real picture behind a scan line as you scroll; the others stay as dots.
 * @param {HTMLElement} root the #pixworm section
 * @param {{ src: string, caption: string, focusY: number }[]} photos
 */
export function initPixworm(root, photos) {
  const N = photos.length;
  const canvas = root.querySelector('canvas');
  const g = canvas.getContext('2d');
  const stepsEl = root.querySelector('.pixworm__steps');
  const ticksEl = root.querySelector('.pixworm__ticks');
  const hint = root.querySelector('.pixworm__hint');
  const capTitle = root.querySelector('[data-caption]');
  const capCount = root.querySelector('[data-count]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  stepsEl.innerHTML = '<i></i>'.repeat(N);
  const ticks = photos.map((p, i) => {
    const b = document.createElement('button');
    b.setAttribute('aria-label', `Photo ${i + 1}: ${p.caption}`);
    b.addEventListener('click', () => goTo(i));
    ticksEl.appendChild(b);
    return b;
  });

  let W = 0;
  let H = 0;
  let pw = 0;
  let ph = 0;
  let pitch = 0;
  let top0 = 0;
  let spacing = 6;
  let cols = 0;
  let ready = false;
  let visible = false;
  let t = 0;
  let tTarget = 0;
  let time = 0;
  let shownAt = -1;
  let last = performance.now();
  let current = -1;
  let pointer = null;
  let settleTimer;

  const sectionTop = () => root.getBoundingClientRect().top + scrollY;
  function goTo(i) {
    scrollTo({ top: sectionTop() + i * innerHeight, behavior: reduced ? 'auto' : 'smooth' });
  }

  function loadImages() {
    return Promise.all(
      photos.map(
        (p) =>
          new Promise((resolve) => {
            const im = new Image();
            im.onload = () => {
              p.img = im;
              resolve();
            };
            im.onerror = resolve;
            im.src = p.src;
          }),
      ),
    );
  }

  /** Lay out the strip and sample every photo down to a coloured dot grid. */
  function setup() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    const mobile = W < 700;
    ph = mobile ? Math.min(H * 0.46, (W * 0.74) / ASPECT) : H * 0.5;
    pw = ph * ASPECT;
    pitch = pw * 1.2;
    top0 = H * (mobile ? 0.54 : 0.6) - ph / 2;
    spacing = ph / ROWS;
    cols = Math.round(pw / spacing);

    const sample = document.createElement('canvas');
    sample.width = cols;
    sample.height = ROWS;
    const sg = sample.getContext('2d', { willReadFrequently: true });

    for (const p of photos) {
      if (!p.img) {
        p.count = 0;
        continue;
      }
      p.crop = coverCrop(p.img.naturalWidth, p.img.naturalHeight, ASPECT, p.focusY);
      sg.clearRect(0, 0, cols, ROWS);
      sg.drawImage(p.img, ...p.crop, 0, 0, cols, ROWS);
      const px = sg.getImageData(0, 0, cols, ROWS).data;
      const n = cols * ROWS;
      p.count = n;
      p.bx = new Float32Array(n);
      p.by = new Float32Array(n);
      p.rad = new Float32Array(n);
      p.col = new Array(n);
      p.dots = Array.from({ length: n }, () => ({ x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 }));
      p.delay = new Float32Array(n);
      const lift = (v) => clamp((v - 128) * 1.12 + 134, 0, 255);
      for (let r = 0, k = 0; r < ROWS; r++) {
        for (let c = 0; c < cols; c++, k++) {
          const q = k * 4;
          const R = lift(px[q]);
          const G = lift(px[q + 1]);
          const B = lift(px[q + 2]);
          const lum = (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255;
          p.bx[k] = (c + 0.5) * spacing;
          p.by[k] = (r + 0.5) * spacing;
          p.rad[k] = spacing * 0.5 * (0.3 + 0.7 * Math.pow(lum, 0.6));
          p.col[k] = `rgb(${R | 0},${G | 0},${B | 0})`;
        }
      }
      p.seen = false;
    }
  }

  function onClick(e) {
    for (let i = 0; i < N; i++) {
      const x0 = W / 2 + (i - t) * pitch - pw / 2;
      const inside =
        e.clientX > x0 && e.clientX < x0 + pw && e.clientY > top0 && e.clientY < top0 + ph;
      if (inside) {
        if (Math.abs(i - t) > 0.4) goTo(i);
        return;
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!ready || !visible) {
      last = now;
      return;
    }
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    time += dt;
    if (shownAt < 0) shownAt = time;

    tTarget = clamp(-root.getBoundingClientRect().top / innerHeight, 0, N - 1);
    t += (tTarget - t) * Math.min(1, dt * 7);

    const radius = Math.max(80, ph * 0.2);
    const intro = reduced ? 1 : smoothstep((time - shownAt - 0.2) / 1.4);
    g.clearRect(0, 0, W, H);

    for (let i = 0; i < N; i++) {
      const p = photos[i];
      const dist = i - t;
      const x0 = W / 2 + dist * pitch - pw / 2;
      if (!p.count || x0 > W + 10 || x0 + pw < -10) continue;

      if (!p.seen) {
        p.seen = true;
        p.born = time;
        for (let k = 0; k < p.count; k++) {
          const d = p.dots[k];
          d.tx = p.bx[k];
          d.ty = p.by[k];
          d.x = d.tx;
          d.y = d.ty;
          if (!reduced) {
            const a = Math.random() * TAU;
            const r = 90 + Math.random() * 520;
            d.x += Math.cos(a) * r;
            d.y += Math.sin(a) * r;
            p.delay[k] = p.born + (p.bx[k] / pw) * 0.7 + Math.random() * 0.35;
          }
        }
      }

      const near = Math.abs(dist) < 1.7;
      const away = Math.abs(dist);
      const develop = clamp(1 - (away - 0.1) / 0.62, 0, 1) * intro;
      const reveal = smoothstep(clamp((develop - 0.18) / 0.72, 0, 1));
      const lineY = top0 + ph * reveal;
      const baseAlpha = 0.5 + 0.4 * develop;
      const local = pointer ? { x: pointer.x - x0, y: pointer.y - top0 } : null;

      for (let k = 0; k < p.count; k++) {
        if (time < p.delay[k]) continue;
        const d = p.dots[k];
        if (near) stepDot(d, dt, local, { stiffness: 55, damping: 10.5, radius, force: 2800 });
        const y = top0 + d.y;
        let a = baseAlpha * clamp((time - p.delay[k]) / 0.5, 0, 1);
        if (reveal > 0) {
          const behind = lineY - y;
          if (behind > 0) {
            a *= clamp(1 - behind / 22, 0, 1);
            if (a <= 0.01) continue;
          }
        }
        g.globalAlpha = a;
        g.fillStyle = p.col[k];
        g.beginPath();
        g.arc(x0 + d.x, y, p.rad[k] * (1 + 0.45 * develop) + 0.2, 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;

      if (reveal > 0.004) {
        g.save();
        roundedRect(g, x0, top0, pw, ph, 14);
        g.clip();
        g.beginPath();
        g.rect(x0, top0, pw, ph * reveal);
        g.clip();
        g.drawImage(p.img, ...p.crop, x0, top0, pw, ph);
        g.restore();
        if (reveal < 0.995) {
          const glow = g.createLinearGradient(0, lineY - 34, 0, lineY);
          glow.addColorStop(0, 'rgba(139,124,255,0)');
          glow.addColorStop(1, 'rgba(139,124,255,.22)');
          g.save();
          roundedRect(g, x0, top0, pw, ph, 14);
          g.clip();
          g.fillStyle = glow;
          g.fillRect(x0, lineY - 34, pw, 34);
          g.fillStyle = 'rgba(205,199,255,.95)';
          g.fillRect(x0, lineY - 1, pw, 2);
          g.restore();
        }
      }
      g.strokeStyle = `rgba(255,255,255,${0.05 + 0.1 * reveal})`;
      g.lineWidth = 1;
      roundedRect(g, x0 + 0.5, top0 + 0.5, pw - 1, ph - 1, 14);
      g.stroke();
    }

    const idx = clamp(Math.round(t), 0, N - 1);
    if (idx !== current) {
      current = idx;
      capTitle.textContent = photos[idx].caption;
      capTitle.style.animation = 'none';
      void capTitle.offsetWidth;
      capTitle.style.animation = '';
      capCount.textContent = `Flowers and nature · ${idx + 1} of ${N}`;
      ticks.forEach((b, i) => b.classList.toggle('is-active', i === idx));
    }
    hint.style.opacity = String(clamp(1 - t * 4, 0, 1) * clamp(time - 1.6, 0, 1));
  }

  new IntersectionObserver((e) => {
    visible = e[0].isIntersecting;
  }).observe(root.querySelector('.pixworm__pin'));
  addEventListener(
    'pointermove',
    (e) => {
      const r = canvas.getBoundingClientRect();
      pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
    },
    { passive: true },
  );
  document.addEventListener('pointerleave', () => {
    pointer = null;
  });
  canvas.addEventListener('click', onClick);
  addEventListener('resize', () => ready && setup());
  addEventListener(
    'scroll',
    () => {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        const y = (scrollY - sectionTop()) / innerHeight;
        if (y >= 0 && y <= N - 1 && Math.abs(y - Math.round(y)) > 0.02) goTo(Math.round(y));
      }, 160);
    },
    { passive: true },
  );

  loadImages().then(() => {
    setup();
    ready = true;
  });
  requestAnimationFrame(frame);
}
