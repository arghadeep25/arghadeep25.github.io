import { createVisual } from './blog-visuals.js';

/**
 * Blogs section: each tile gets its own canvas animation that runs only while on screen and
 * speeds up while the tile is hovered or focused.
 * @param {HTMLElement} root the #blogs section
 */
export function initBlogs(root) {
  const grid = root.querySelector('.blogs__grid');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const tiles = [...grid.querySelectorAll('.post')].map((el) => {
    const canvas = el.querySelector('canvas');
    return {
      el,
      canvas,
      g: canvas.getContext('2d'),
      draw: createVisual(el.dataset.visual),
      hover: 0,
      active: false,
      visible: false,
      t: Math.random() * 2,
      w: 0,
      h: 0,
    };
  });
  const byEl = new Map(tiles.map((t) => [t.el, t]));

  function resize(tile) {
    const r = tile.el.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    tile.w = r.width;
    tile.h = r.height;
    tile.canvas.width = r.width * dpr;
    tile.canvas.height = r.height * dpr;
    tile.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const sizeObserver = new ResizeObserver((entries) =>
    entries.forEach((e) => resize(byEl.get(e.target))),
  );
  const viewObserver = new IntersectionObserver(
    (entries) => entries.forEach((e) => (byEl.get(e.target).visible = e.isIntersecting)),
    { rootMargin: '80px' },
  );
  tiles.forEach((tile) => {
    sizeObserver.observe(tile.el);
    viewObserver.observe(tile.el);
  });

  new IntersectionObserver(
    (entries, observer) => {
      if (entries[0].isIntersecting) {
        grid.classList.add('in');
        observer.disconnect();
      }
    },
    { threshold: 0.15 },
  ).observe(grid);

  const setActive = (el) => tiles.forEach((tile) => (tile.active = tile.el === el));
  grid.addEventListener('pointerover', (e) => setActive(e.target.closest('.post')));
  grid.addEventListener('pointerleave', () => setActive(null));
  grid.addEventListener('focusin', (e) => setActive(e.target.closest('.post')));
  grid.addEventListener('focusout', () => setActive(null));

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const tile of tiles) {
      if (!tile.visible || !tile.w) continue;
      tile.hover += ((tile.active ? 1 : 0) - tile.hover) * Math.min(1, dt * 6);
      const step = dt * (1 + tile.hover * 1.3);
      tile.t = reduced ? (tile.el.dataset.visual === 'slam' ? 10 : 3) : tile.t + step;
      tile.g.clearRect(0, 0, tile.w, tile.h);
      tile.draw(tile.g, tile.w, tile.h, tile.t, step);
    }
  }
  requestAnimationFrame(frame);
}
