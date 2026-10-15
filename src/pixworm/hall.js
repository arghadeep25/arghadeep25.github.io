import { clamp } from '../core/math.js';
import { photoUrl, widthFor } from './images.js';
import { activeGroup, buildHall, cameraZ, depthAlpha } from './hall-layout.js';

const SCROLL_PER_DEPTH = 0.36; // px of page scroll for each unit of camera travel
const LOAD_AHEAD = 4200; // start fetching a photo when it is this far ahead

/**
 * The opening: the photographs hang in depth and scrolling flies the camera through them.
 * @param {HTMLElement} root `.hall`
 * @param {Parameters<typeof buildHall>[0]} collections
 * @param {{ open: Function }} lightbox
 */
export function initHall(root, collections, lightbox) {
  const world = root.querySelector('.hall__world');
  const hudName = root.querySelector('[data-group]');
  const hudFill = root.querySelector('.hall__line i');
  const { items, depth } = buildHall(collections);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const imgWidth = widthFor(Math.min(480, innerWidth * 0.3), devicePixelRatio);

  const nodes = items.map((it) => {
    const el = document.createElement(it.type === 'frame' ? 'button' : 'div');
    el.className = `hall__${it.type}`;
    if (it.type === 'mark') {
      el.innerHTML = `<h1>Pixworm</h1><p>Photographs by Arghadeep Mazumder</p>`;
    } else if (it.type === 'title') {
      const c = it.collection;
      el.innerHTML = `<h2>${c.title}</h2><a href="/pixworm/${c.slug}.html">${c.photos.length} photos, open the collection</a>`;
    } else {
      el.setAttribute('aria-label', `Open a photo from ${it.collection.title}`);
      const img = document.createElement('img');
      img.alt = '';
      img.decoding = 'async';
      img.addEventListener('load', () => {
        const ar = img.naturalWidth / img.naturalHeight;
        el.style.aspectRatio = String(ar);
        el.style.setProperty('--shape', ar >= 1 ? '1' : '0.72');
        el.classList.add('is-ready');
      });
      el.append(img);
      el.addEventListener('click', () => lightbox.open(it.collection.photos, it.index, el));
    }
    world.append(el);
    return { it, el, img: el.querySelector('img'), shown: null };
  });

  if (reduced) {
    // no depth, no motion: a plain list of frames with the same titles
    root.classList.add('hall--flat');
    nodes.forEach((n) => {
      if (n.img) n.img.src = photoUrl(n.it.entry, imgWidth);
      n.img?.setAttribute('loading', 'lazy');
    });
    return;
  }

  let vw = innerWidth;
  let vh = innerHeight;
  let target = 0; // scroll progress 0..1
  let cur = 0; // eased progress
  let mx = 0;
  let my = 0;
  let sx = 0;
  let sy = 0;
  let running = false;
  const born = performance.now();

  function size() {
    vw = innerWidth;
    vh = innerHeight;
    root.style.height = `${vh + depth * SCROLL_PER_DEPTH}px`;
    readScroll();
  }

  function readScroll() {
    const r = root.getBoundingClientRect();
    target = clamp(-r.top / (r.height - vh), 0, 1);
  }

  function frame(now) {
    if (!running) return;
    cur += (target - cur) * 0.085;
    sx += (mx - sx) * 0.06;
    sy += (my - sy) * 0.06;

    // the camera also arrives from further back when the page opens
    const intro = clamp((now - born) / 2600, 0, 1);
    const arrive = (1 - intro) ** 3 * -2600;
    const idle = Math.sin(now / 1900) * 16;
    const cam = cameraZ(cur, depth) + arrive + idle;

    world.style.transform = `rotateX(${(-sy * 2.2).toFixed(3)}deg) rotateY(${(sx * 3).toFixed(3)}deg)`;

    nodes.forEach((n) => {
      const zv = n.it.z + cam;
      const a = depthAlpha(zv, n.it.type === 'title' ? { far: 1800 } : undefined);
      if (a < 0.01) {
        if (n.shown !== false) {
          n.el.style.visibility = 'hidden';
          n.shown = false;
        }
        if (n.img && !n.img.src && zv > -LOAD_AHEAD) n.img.src = photoUrl(n.it.entry, imgWidth);
        return;
      }
      if (n.img && !n.img.src) n.img.src = photoUrl(n.it.entry, imgWidth);
      n.shown = true;
      const x = (n.it.x || 0) * vw;
      const y = (n.it.y || 0) * vh;
      const tilt = n.it.tilt || 0;
      n.el.style.visibility = 'visible';
      n.el.style.opacity = a.toFixed(3);
      // out of focus in the distance, sharp as it arrives
      n.el.style.filter =
        zv < -1300 ? `blur(${(Math.min(1, (-zv - 1300) / 1000) * 3).toFixed(2)}px)` : '';
      n.el.style.pointerEvents = a > 0.6 ? 'auto' : 'none';
      n.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,${zv.toFixed(1)}px) translate(-50%,-50%) rotateY(${tilt.toFixed(2)}deg)`;
    });

    const g = activeGroup(items, cam);
    const name = g < 0 ? 'Pixworm' : collections[g].title;
    if (hudName.textContent !== name) hudName.textContent = name;
    hudFill.style.transform = `scaleX(${cur.toFixed(4)})`;

    requestAnimationFrame(frame);
  }

  addEventListener('scroll', readScroll, { passive: true });
  addEventListener('resize', size);
  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    mx = (e.clientX / vw - 0.5) * 2;
    my = (e.clientY / vh - 0.5) * 2;
  });

  // only animate while the opening is on screen
  new IntersectionObserver(([e]) => {
    const was = running;
    running = e.isIntersecting;
    if (running && !was) requestAnimationFrame(frame);
  }).observe(root);

  size();
}
