/**
 * "More work" tiles: each shows a live, non-interactive preview of a demo page.
 * The preview loads when the tile nears the viewport and is scaled from 1440x900.
 */
export function initMoreWork(root) {
  const shots = [...root.querySelectorAll('.more__shot')];

  const fit = (shot) => {
    const screen = shot.querySelector('.more__screen');
    screen.style.transform = `scale(${shot.clientWidth / 1440})`;
  };

  const ro = new ResizeObserver(() => shots.forEach(fit));
  shots.forEach((s) => {
    ro.observe(s);
    fit(s);
  });

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const screen = e.target.querySelector('.more__screen');
        io.unobserve(e.target);
        const frame = document.createElement('iframe');
        frame.title = '';
        frame.setAttribute('aria-hidden', 'true');
        frame.tabIndex = -1;
        frame.loading = 'lazy';
        frame.src = screen.dataset.src;
        frame.addEventListener('load', () => frame.classList.add('is-shown'), { once: true });
        screen.append(frame);
      });
    },
    { rootMargin: '300px 0px' },
  );
  shots.forEach((s) => io.observe(s));
}
