import { photoUrl, widthFor } from './images.js';

/**
 * Photos in columns, each at its own shape. Opens the viewer on click.
 * @param {HTMLElement} grid
 * @param {string[]} photos
 * @param {{ open: Function }} lightbox
 */
export function renderMosaic(grid, photos, lightbox) {
  const width = widthFor(grid.clientWidth / 3 || 400, devicePixelRatio);
  grid.innerHTML = photos
    .map(
      (p, i) => `<button class="mosaic__item" data-i="${i}" aria-label="Open photo ${i + 1}">
        <img src="${photoUrl(p, width)}" alt="" loading="lazy" decoding="async" />
      </button>`,
    )
    .join('');
  grid.addEventListener('click', (e) => {
    const b = e.target.closest('.mosaic__item');
    if (b) lightbox.open(photos, Number(b.dataset.i), b);
  });
  grid.querySelectorAll('img').forEach((img) => {
    const done = () => img.classList.add('is-ready');
    if (img.complete) done();
    else img.addEventListener('load', done, { once: true });
  });
}
