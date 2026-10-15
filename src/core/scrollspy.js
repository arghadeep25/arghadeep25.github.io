/**
 * Which section is under the reading line?
 * @param {{ id: string, top: number, bottom: number }[]} sections positions in page coordinates
 * @param {number} line page y of the reading line (scrollY plus a fraction of the viewport)
 * @returns {string | null}
 */
export function activeSectionId(sections, line) {
  for (const s of sections) if (line >= s.top && line < s.bottom) return s.id;
  return null;
}

/**
 * Keep aria-current="location" on the nav link whose #hash matches the section in view.
 * @param {ParentNode} nav element that contains the links
 * @param {string[]} ids section ids, in page order
 * @param {{ lineAt?: number }} [options] lineAt: fraction of the viewport height used as the reading line
 * @returns {() => void} stop listening
 */
export function initScrollSpy(nav, ids, { lineAt = 0.4 } = {}) {
  const links = [...nav.querySelectorAll('a[href^="#"]')];
  let ticking = false;

  const measure = () => {
    ticking = false;
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter(Boolean)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { id: el.id, top: r.top + scrollY, bottom: r.bottom + scrollY };
      });
    const current = activeSectionId(sections, scrollY + innerHeight * lineAt);
    for (const a of links) {
      if (a.getAttribute('href') === `#${current}`) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
    }
  };
  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(measure);
    }
  };

  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  measure();
  return () => {
    removeEventListener('scroll', onScroll);
    removeEventListener('resize', onScroll);
  };
}
