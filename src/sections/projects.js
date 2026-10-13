import { clamp } from '../core/math.js';

/**
 * The autonomy stack, in order. Planning and watchdog are stages of the stack overview page.
 * Public names only.
 */
export const CHAPTERS = [
  {
    kicker: 'What does the world look like',
    title: 'It builds the map <b>as it drives.</b>',
    text: 'Scans become keyframes. Places are recognised from their features, and a graph optimiser pulls the whole map back into line.',
    chips: ['Registration', 'Feature-based loop closure', 'Graph optimisation'],
    src: '/projects/mapping.html',
  },
  {
    kicker: 'Where am I',
    title: 'It always knows <b>where it is.</b>',
    text: 'LiDAR, IMU and GPS blend into one position. If GPS drops, or LiDAR does, the others carry on, and it recovers without a jump.',
    chips: ['Sensor fusion', 'Dead reckoning', 'Smooth recovery'],
    src: '/projects/localization.html',
  },
  {
    kicker: 'What is around me',
    title: 'It sees what it <b>could hit.</b>',
    text: 'A corridor bends with the steering and stretches with speed. Only what stands in it is kept, grouped and ranked.',
    chips: ['Steering-aware zone', 'Ground removal', 'Clustering'],
    src: '/projects/obstacle-detection.html',
  },
  {
    kicker: 'Where do I go',
    title: 'It plans <b>around whatever is in the way.</b>',
    text: 'It follows the global route, plans a local path around obstacles, and decides when to stop for a red light or yield to pedestrians.',
    chips: ['Global route', 'Local trajectory', 'Traffic rules'],
    src: '/projects/stack.html?stage=route',
  },
  {
    kicker: 'How do I steer',
    title: 'It <b>holds the line.</b>',
    text: 'It slows for curves, keeps its speed over rough ground and hills, and steers back quickly when something pushes it off course.',
    chips: ['Steering geometry', 'Speed control', 'Error recovery'],
    src: '/projects/path-tracking.html',
  },
  {
    kicker: 'Is everything healthy',
    title: 'It <b>watches itself.</b>',
    text: 'A watchdog over the whole system continuously checks that every component is alive, on time and healthy.',
    chips: ['Liveness', 'Timing', 'Health monitoring'],
    src: '/projects/stack.html?stage=guardian',
  },
];

/** Which chapter is active at scroll progress p (0..1) through the chapter track. */
export function activeChapter(p, n) {
  return clamp(Math.floor(p * n), 0, n - 1);
}

/** How full the progress rail is at scroll progress p: 0 at the middle of chapter 1, 1 at the middle of the last. */
export function railFill(p, n) {
  return n > 1 ? clamp((p * n - 0.5) / (n - 1), 0, 1) : 0;
}

/** Page scroll position that centres chapter `i` of `n`, given the track's top and height. */
export function chapterScrollTop({ trackTop, trackHeight, scrollY, viewport, i, n }) {
  const span = trackHeight - viewport;
  return scrollY + trackTop + span * ((i + 0.5) / n);
}

/**
 * Projects section: a statement, the whole stack running, then one chapter per system. The page
 * scrolls, the simulation beside the text changes. Simulations load only near the viewport.
 * @param {HTMLElement} root the #projects section
 */
export function initProjects(root) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const track = root.querySelector('.projects__chapters');
  const slidesEl = root.querySelector('.projects__slides');
  const rail = root.querySelector('.projects__rail');
  const screen = root.querySelector('.projects__stage .display__screen');
  const fullLink = root.querySelector('[data-full]');
  const hero = root.querySelector('.projects__hero');
  const heroFrame = hero.querySelector('iframe');
  const n = CHAPTERS.length;
  track.style.setProperty('--n', n);

  const frames = [];
  const dots = [];
  const slides = CHAPTERS.map((c, i) => {
    const slide = document.createElement('div');
    slide.className = 'slide';
    slide.setAttribute('aria-hidden', 'true');
    slide.innerHTML = `<div class="slide__kicker">${c.kicker}</div><h3>${c.title}</h3><p>${c.text}</p><ul class="slide__chips">${c.chips.map((x) => `<li class="chip">${x}</li>`).join('')}</ul><a class="slide__open" href="${c.src}">Open the full demo</a>`;
    slidesEl.appendChild(slide);

    const dot = document.createElement('button');
    dot.setAttribute('aria-label', `Chapter ${i + 1}: ${c.kicker}`);
    dot.addEventListener('click', () => jump(i));
    rail.appendChild(dot);
    dots.push(dot);

    const frame = document.createElement('iframe');
    frame.title = `${c.kicker}: simulation`;
    frame.dataset.src = c.src;
    screen.appendChild(frame);
    frames.push(frame);
    return slide;
  });

  let active = -1;
  let stageVisible = false;

  function syncFrames() {
    frames.forEach((f, k) => {
      const wanted = stageVisible && Math.abs(k - active) <= 1;
      const loaded = !!f.getAttribute('src');
      if (wanted && !loaded) f.src = f.dataset.src;
      else if (!wanted && loaded) f.removeAttribute('src');
      f.classList.toggle('is-shown', stageVisible && k === active);
    });
  }

  function setActive(i) {
    if (i === active) return;
    active = i;
    slides.forEach((s, k) => {
      s.classList.toggle('is-active', k === i);
      s.setAttribute('aria-hidden', k === i ? 'false' : 'true');
    });
    dots.forEach((d, k) => {
      d.classList.toggle('is-active', k === i);
      d.classList.toggle('is-done', k < i);
    });
    fullLink.href = CHAPTERS[i].src;
    syncFrames();
  }

  function jump(i) {
    const r = track.getBoundingClientRect();
    const top = chapterScrollTop({
      trackTop: r.top,
      trackHeight: r.height,
      scrollY,
      viewport: innerHeight,
      i,
      n,
    });
    scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
  }

  /* screens: render at 1440x900 and scale to the width available */
  const displays = [...root.querySelectorAll('.display')];
  const fit = (d) => {
    const s = d.querySelector('.display__screen');
    const k = d.clientWidth / 1440;
    s.style.transform = `scale(${k})`;
    s.style.height = `${d.clientHeight / k}px`;
  };
  const ro = new ResizeObserver(() => displays.forEach(fit));
  displays.forEach((d) => {
    ro.observe(d);
    fit(d);
    const catcher = d.querySelector('.display__catch');
    const go = () => d.classList.add('is-live');
    catcher.addEventListener('click', go);
    catcher.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        go();
      }
    });
  });
  addEventListener('pointerdown', (e) => {
    displays.forEach((d) => {
      if (d.classList.contains('is-live') && !d.contains(e.target)) d.classList.remove('is-live');
    });
  });

  /* the whole stack: load when near, unload when far above */
  new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting && !heroFrame.getAttribute('src'))
          heroFrame.src = heroFrame.dataset.src;
        heroFrame.classList.toggle('is-shown', e.isIntersecting);
        if (!e.isIntersecting && e.boundingClientRect.top < -200) heroFrame.removeAttribute('src');
      }
    },
    { rootMargin: '200px 0px' },
  ).observe(hero);
  new IntersectionObserver(
    (entries) => {
      stageVisible = entries[0].isIntersecting;
      syncFrames();
    },
    { rootMargin: '200px 0px' },
  ).observe(track);

  let ticking = false;
  function onScroll() {
    ticking = false;
    const hr = hero.getBoundingClientRect();
    const t = clamp(1 - hr.top / innerHeight, 0, 1);
    hero.style.setProperty('--hs', (0.9 + 0.1 * clamp(t * 1.6, 0, 1)).toFixed(3));
    const r = track.getBoundingClientRect();
    const p = clamp(-r.top / (r.height - innerHeight), 0, 1);
    rail.style.setProperty('--p', railFill(p, n).toFixed(3));
    setActive(activeChapter(p, n));
  }
  addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(onScroll);
      }
    },
    { passive: true },
  );
  addEventListener('resize', onScroll);
  onScroll();
}
