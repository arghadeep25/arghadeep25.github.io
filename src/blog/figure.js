/**
 * Animated figures for blog posts: a canvas with a timeline, a play button and a few sliders.
 *
 * A figure only draws while it is on screen, so a page with many of them costs little. With reduced
 * motion it starts paused on its finished frame and everything still works by hand (scrub, slide).
 * The pure time logic is exported for tests; the DOM part is mountFigure.
 */

/** Move the clock on by dt. Looping wraps; otherwise it stops at the end and reports `done`. */
export function advance(t, dt, length, loop) {
  const n = t + dt;
  if (n < length) return { t: n, done: false };
  return loop ? { t: n % length, done: false } : { t: length, done: true };
}

/** Format a slider value for its label. */
export const fmtKnob = (v, step) =>
  step >= 1 ? String(Math.round(v)) : v.toFixed(step < 0.1 ? 2 : 1);

const FRAME_MS = 33;

/**
 * @typedef {{ id: string, label: string, min: number, max: number, step: number, value: number }} Knob
 * @typedef {{ draw(g: CanvasRenderingContext2D, w: number, h: number, t: number, k: Record<string, number>): boolean | void }} Scene
 * @param {HTMLElement} root the `<figure>`; it must contain a `.fig__stage` element
 * @param {{
 *   aspect?: number, tall?: number, length?: number, loop?: boolean, rest?: number,

 *   knobs?: Knob[], timeline?: boolean, controls?: boolean, make(api: { redraw(): void, knobs: Record<string, number> }): Scene
 * }} spec
 *   aspect: width / height on wide screens, tall: the same on narrow screens;
 *   length: seconds of animation, loop: wrap or stop and offer replay,
 *   rest: the time to show first when motion is reduced
 */
export function mountFigure(root, spec) {
  const length = spec.length ?? 10;
  const loop = spec.loop ?? true;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stage = root.querySelector('.fig__stage');
  const cv = document.createElement('canvas');
  cv.setAttribute('role', 'img');
  cv.setAttribute(
    'aria-label',
    root.querySelector('figcaption')?.textContent?.trim() || 'Animation',
  );
  stage.appendChild(cv);
  const g = cv.getContext('2d');

  const k = {};
  (spec.knobs ?? []).forEach((n) => (k[n.id] = n.value));
  let t = reduced ? (spec.rest ?? length) : 0;
  let playing = !reduced;
  let visible = false;
  let size = { w: 0, h: 0 };
  let last = 0;
  let raf = 0;
  let dirty = true;

  const api = {
    redraw: () => {
      dirty = true;
      kick();
    },
    knobs: k,
  };
  const scene = spec.make(api);

  // controls
  const bar = document.createElement('div');
  bar.className = 'fig__bar';
  const play = document.createElement('button');
  play.type = 'button';
  play.className = 'fig__play';
  const setPlayLabel = () => {
    play.textContent = playing ? 'Pause' : t >= length && !loop ? 'Replay' : 'Play';
    play.setAttribute('aria-pressed', String(playing));
  };
  if (spec.controls !== false) bar.appendChild(play);
  let scrub = null;
  if (spec.timeline !== false && spec.controls !== false) {
    scrub = document.createElement('input');
    scrub.type = 'range';
    scrub.className = 'fig__scrub';
    scrub.min = '0';
    scrub.max = String(length);
    scrub.step = '0.01';
    scrub.value = String(t);
    scrub.setAttribute('aria-label', 'Time');
    scrub.addEventListener('input', () => {
      t = +scrub.value;
      playing = false;
      setPlayLabel();
      dirty = true;
      kick();
    });
    bar.appendChild(scrub);
  }
  for (const n of spec.knobs ?? []) {
    const wrap = document.createElement('label');
    wrap.className = 'fig__knob';
    const name = document.createElement('span');
    name.textContent = n.label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(n.min);
    input.max = String(n.max);
    input.step = String(n.step);
    input.value = String(n.value);
    const out = document.createElement('output');
    out.textContent = fmtKnob(n.value, n.step);
    input.addEventListener('input', () => {
      k[n.id] = +input.value;
      out.textContent = fmtKnob(k[n.id], n.step);
      dirty = true;
      kick();
    });
    wrap.append(name, input, out);
    bar.appendChild(wrap);
  }
  root.appendChild(bar);
  setPlayLabel();
  play.addEventListener('click', () => {
    if (!playing && t >= length && !loop) t = 0;
    playing = !playing;
    setPlayLabel();
    dirty = true;
    kick();
  });

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const r = stage.getBoundingClientRect();
    const narrow = r.width < 560;
    const ratio = narrow ? (spec.tall ?? spec.aspect ?? 1.6) : (spec.aspect ?? 1.9);
    const h = Math.round(r.width / ratio);
    stage.style.height = `${h}px`;
    const w = Math.max(1, Math.round(r.width * dpr));
    const hh = Math.max(1, Math.round(h * dpr));
    if (cv.width !== w || cv.height !== hh) {
      cv.width = w;
      cv.height = hh;
    }
    size = { w: r.width, h, dpr };
    dirty = true;
  }

  /** Draw one frame. A scene that returns true is still moving and wants the next frame. */
  function paint() {
    g.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    g.clearRect(0, 0, size.w, size.h);
    const again = scene.draw(g, size.w, size.h, t, k);
    if (scrub) scrub.value = String(t);
    return !!again;
  }

  function frame(now) {
    raf = 0;
    if (!visible || document.hidden) return;
    if (playing) {
      const dt = Math.min(0.1, (now - last) / 1000);
      const s = advance(t, dt, length, loop);
      t = s.t;
      if (s.done) {
        playing = false;
        setPlayLabel();
      }
      dirty = true;
    }
    last = now;
    let again = false;
    if (dirty) {
      dirty = false;
      again = paint();
    }
    if (again) dirty = true;
    if (playing || again) raf = requestAnimationFrame(next);
  }
  // keep to roughly 30 frames a second
  function next(now) {
    if (now - last < FRAME_MS) {
      raf = requestAnimationFrame(next);
      return;
    }
    frame(now);
  }
  function kick() {
    if (raf || !visible) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  new ResizeObserver(() => {
    resize();
    kick();
  }).observe(stage);
  new IntersectionObserver(
    ([e]) => {
      visible = e.isIntersecting;
      if (visible) kick();
    },
    { rootMargin: '80px' },
  ).observe(root);
  document.addEventListener('visibilitychange', kick);
  resize();

  return {
    redraw: api.redraw,
    get time() {
      return t;
    },
    set time(v) {
      t = v;
      dirty = true;
      kick();
    },
    get canvas() {
      return cv;
    },
  };
}
