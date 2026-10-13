import { createDotField } from '../core/dots.js';
import { sampleShape } from './skills-shapes.js';

/**
 * Skills section: a dot icon beside a list of skill areas. The area crossing the middle of the
 * screen becomes active and the dots reshape into its icon.
 * @param {HTMLElement} root the #skills section
 */
export function initSkills(root) {
  const canvas = root.querySelector('canvas');
  const label = root.querySelector('[data-now]');
  const rows = [...root.querySelectorAll('.skill')];
  const COUNT = 760;
  const field = createDotField(canvas, { count: COUNT });
  let shape = rows[0].dataset.shape;

  function place(kick) {
    const size = Math.min(field.width, field.height) * 0.9;
    const cx = field.width / 2;
    const cy = field.height / 2;
    const pts = sampleShape(shape, COUNT).map((p) => ({ x: cx + p.x * size, y: cy + p.y * size }));
    field.setTargets(pts, { kick });
  }

  function activate(row) {
    if (!row || (row.classList.contains('is-active') && row.dataset.shape === shape)) return;
    rows.forEach((r) => r.classList.toggle('is-active', r === row));
    label.textContent = row.dataset.name;
    if (row.dataset.shape !== shape) {
      shape = row.dataset.shape;
      place(260);
    }
  }

  field.scatter();
  place(0);
  field.start();

  let timer;
  addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(() => place(0), 150);
  });

  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && activate(e.target)),
    { rootMargin: '-45% 0px -45% 0px' },
  );
  rows.forEach((r) => io.observe(r));
  rows.forEach((r) =>
    r.addEventListener('mouseenter', () => {
      if (matchMedia('(hover: hover)').matches) activate(r);
    }),
  );
}
