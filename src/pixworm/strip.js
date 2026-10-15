import { clamp } from '../core/math.js';
import { photoUrl, widthFor } from './images.js';

/** How far the track slides for a scroll progress of 0..1. */
export const trackOffset = (progress, trackWidth, viewWidth) =>
  -clamp(progress, 0, 1) * Math.max(0, trackWidth - viewWidth);

/** Scroll progress of a tall section whose child is pinned: 0 at its top, 1 at its end. */
export const pinProgress = (top, height, viewport) => clamp(-top / (height - viewport), 0, 1);

/**
 * The collections strip. Wide screens: the section is pinned and vertical scroll slides the
 * strip sideways. Narrow screens: it is a normal swipeable row.
 * @param {HTMLElement} root `.pxc`
 * @param {{ slug: string, title: string, group: string, cover: string, photos: string[] }[]} collections
 */
export function initStrip(root, collections) {
  const track = root.querySelector('.pxc__track');
  const pin = root.querySelector('.pxc__pin');
  const width = widthFor(600, devicePixelRatio);

  track.innerHTML = collections
    .map(
      (c) => `<a class="pxc__card" href="/pixworm/${c.slug}.html">
        <img src="${photoUrl(c.cover, width)}" alt="" loading="lazy" decoding="async" />
        <span class="pxc__meta"><strong>${c.title}</strong><span>${c.photos.length} photos</span></span>
      </a>`,
    )
    .join('');

  const wide = matchMedia('(min-width: 901px) and (prefers-reduced-motion: no-preference)');
  let raf = 0;

  function size() {
    // one extra viewport of scroll per strip width keeps the sideways speed comfortable
    root.style.height = wide.matches
      ? `${innerHeight + Math.max(0, track.scrollWidth - innerWidth)}px`
      : '';
  }

  function update() {
    raf = 0;
    if (!wide.matches) {
      track.style.transform = '';
      return;
    }
    const r = root.getBoundingClientRect();
    const p = pinProgress(r.top, r.height, innerHeight);
    track.style.transform = `translate3d(${trackOffset(p, track.scrollWidth, innerWidth)}px,0,0)`;
  }

  const queue = () => {
    if (!raf) raf = requestAnimationFrame(update);
  };

  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', () => {
    size();
    queue();
  });
  wide.addEventListener('change', () => {
    size();
    queue();
  });
  track.querySelectorAll('img').forEach((i) => i.addEventListener('load', size, { once: true }));
  pin.classList.add('is-ready');
  size();
  update();
}
