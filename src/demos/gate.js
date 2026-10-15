/*
 * Keeps a demo from using the processor when nobody can see it.
 *
 * The demos run inside iframes on the home page. A frame that is loaded but not shown (the next
 * chapter, or one scrolled out of view) would otherwise keep drawing 60 times a second. This wraps
 * requestAnimationFrame: while the demo is hidden its callbacks wait, and they carry on the moment
 * it is shown again. A demo embedded in the page also runs at 30 frames a second, which is plenty at
 * that size; opened on its own it runs at the full rate.
 */
const raw = window.requestAnimationFrame.bind(window);
const frameEl = (() => {
  try {
    return window.frameElement;
  } catch {
    return null;
  }
})();
const embedded = !!frameEl;
const FRAME_MS = 31;

let inView = true;
const parked = [];

const shown = () =>
  !document.hidden && inView && (!frameEl || frameEl.classList.contains('is-shown'));

function go(cb) {
  return raw(function tick(t) {
    if (embedded && t - (cb.__t || 0) < FRAME_MS) {
      raw(tick);
      return;
    }
    cb.__t = t;
    cb(t);
  });
}

window.requestAnimationFrame = (cb) => {
  if (shown()) return go(cb);
  parked.push(cb);
  return 0;
};

function wake() {
  if (!shown()) return;
  for (const cb of parked.splice(0)) go(cb);
}

if (frameEl)
  new MutationObserver(wake).observe(frameEl, { attributes: true, attributeFilter: ['class'] });
document.addEventListener('visibilitychange', wake);
addEventListener('DOMContentLoaded', () => {
  new IntersectionObserver((entries) => {
    inView = entries[entries.length - 1].isIntersecting;
    wake();
  }).observe(document.documentElement);
});
