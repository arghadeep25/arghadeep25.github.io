/**
 * Add a class to elements the first time they scroll into view.
 * One shared observer, no animation library.
 *
 * @param {string | Element[]} targets selector or elements
 * @param {{ className?: string, threshold?: number, rootMargin?: string }} [options]
 * @returns {() => void} stop observing
 */
export function reveal(targets, options = {}) {
  const { className = 'in', threshold = 0.15, rootMargin = '0px' } = options;
  const els = typeof targets === 'string' ? [...document.querySelectorAll(targets)] : targets;

  if (
    !('IntersectionObserver' in window) ||
    matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    els.forEach((el) => el.classList.add(className));
    return () => {};
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add(className);
          io.unobserve(e.target);
        }
      }
    },
    { threshold, rootMargin },
  );
  els.forEach((el) => io.observe(el));
  return () => io.disconnect();
}
