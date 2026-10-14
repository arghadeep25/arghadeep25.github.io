import { photoUrl, widthFor } from './images.js';

/** Next index, wrapping at both ends. */
export const wrap = (i, n) => ((i % n) + n) % n;

/** "#p12" (1 based) to a 0 based index, or -1 when absent or out of range. */
export function parseHash(hash, n) {
  const m = /^#p(\d+)$/.exec(hash);
  if (!m) return -1;
  const i = Number(m[1]) - 1;
  return i >= 0 && i < n ? i : -1;
}

/** -1 for a swipe to the right (previous), 1 for left (next), 0 when it was not a swipe. */
export function swipeDirection(dx, dy, min = 50) {
  if (Math.abs(dx) < min || Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx > 0 ? -1 : 1;
}

/**
 * Full screen viewer. One instance per page.
 * @param {{ thumb?: (entry: string) => string }} [opts]
 */
export function createLightbox(opts = {}) {
  const el = document.createElement('div');
  el.className = 'lb';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Photo viewer');
  el.innerHTML = `
    <img class="lb__img" alt="" />
    <button class="lb__btn lb__close" aria-label="Close">&times;</button>
    <button class="lb__btn lb__prev" aria-label="Previous photo">&#8249;</button>
    <button class="lb__btn lb__next" aria-label="Next photo">&#8250;</button>
    <p class="lb__count" aria-live="polite"></p>`;
  document.body.append(el);

  const img = el.querySelector('.lb__img');
  const count = el.querySelector('.lb__count');
  let photos = [];
  let index = 0;
  let opener = null;
  let startX = 0;
  let startY = 0;

  const big = (entry) => photoUrl(entry, Math.min(2400, widthFor(innerWidth, devicePixelRatio)));

  function show(i) {
    index = wrap(i, photos.length);
    const entry = photos[index];
    img.classList.remove('is-ready');
    img.src = big(entry);
    count.textContent = `${index + 1} / ${photos.length}`;
    history.replaceState(null, '', `#p${index + 1}`);
    [index + 1, index - 1].forEach((j) => {
      new Image().src = big(photos[wrap(j, photos.length)]);
    });
  }

  img.addEventListener('load', () => img.classList.add('is-ready'));

  function open(list, i, from) {
    photos = list;
    opener = from || null;
    el.hidden = false;
    document.body.classList.add('lb-open');
    show(i);
    el.querySelector('.lb__close').focus();
  }

  function close() {
    el.hidden = true;
    document.body.classList.remove('lb-open');
    img.removeAttribute('src');
    history.replaceState(null, '', location.pathname + location.search);
    if (opener) opener.focus();
  }

  el.addEventListener('click', (e) => {
    if (e.target.closest('.lb__close') || e.target === el) close();
    else if (e.target.closest('.lb__prev')) show(index - 1);
    else if (e.target.closest('.lb__next')) show(index + 1);
  });

  addEventListener('keydown', (e) => {
    if (el.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') show(index - 1);
    else if (e.key === 'ArrowRight') show(index + 1);
  });

  el.addEventListener('pointerdown', (e) => {
    startX = e.clientX;
    startY = e.clientY;
  });
  el.addEventListener('pointerup', (e) => {
    const d = swipeDirection(e.clientX - startX, e.clientY - startY);
    if (d) show(index + d);
  });

  return { open, close, isOpen: () => !el.hidden };
}
