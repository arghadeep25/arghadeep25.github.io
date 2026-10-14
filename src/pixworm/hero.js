import { photoUrl, widthFor } from './images.js';

/** Index after `i` in a loop of `n`. */
export const nextIndex = (i, n) => (i + 1) % n;

/**
 * Full screen opening: photos crossfade, a thin line shows time left on the current one.
 * Only the current and the next photo are requested.
 * @param {HTMLElement} root
 * @param {string[]} photos
 * @param {number} [ms] time per photo
 */
export function initHero(root, photos, ms = 6000) {
  const stage = root.querySelector('.pxh__slides');
  const bar = root.querySelector('.pxh__bar');
  const width = Math.min(2400, widthFor(innerWidth, devicePixelRatio));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const slides = photos.map(() => {
    const img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    stage.append(img);
    return img;
  });

  const load = (i) => {
    if (!slides[i].src) slides[i].src = photoUrl(photos[i], width);
  };

  let current = 0;
  let timer = 0;

  function show(i) {
    current = i;
    load(i);
    load(nextIndex(i, photos.length));
    slides.forEach((s, k) => s.classList.toggle('is-active', k === i));
    bar.style.animation = 'none';
    void bar.offsetWidth; // restart the line
    bar.style.animation = reduced ? 'none' : `pxh-line ${ms}ms linear forwards`;
  }

  function loop() {
    timer = setTimeout(() => {
      show(nextIndex(current, photos.length));
      loop();
    }, ms);
  }

  show(0);
  if (photos.length > 1 && !reduced) loop();

  // stop the work while the opening is off screen
  new IntersectionObserver(([e]) => {
    clearTimeout(timer);
    if (e.isIntersecting && photos.length > 1 && !reduced) loop();
  }).observe(root);
}
