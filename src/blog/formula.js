/**
 * Annotated formulas. Each parameter in the equation is a button. The chosen one gets a circle
 * drawn round it and an arrow to a note under the equation saying what it is, and what happens
 * when it gets bigger or smaller. With nobody touching it, the circle walks through the
 * parameters one by one while the formula is on screen.
 *
 * Markup:
 *   <div class="fm">
 *     <div class="fm__eq"> ... <button class="fm__p" data-p="e">e</button> ... </div>
 *     <div class="fm__notes"><div class="fm__note" data-for="e"> ... </div> ...</div>
 *   </div>
 */

const SVG = 'http://www.w3.org/2000/svg';
export const TOUR_MS = 5200;

/** The index after `i`, wrapping round `n` items. */
export const nextIndex = (i, n) => (i + 1) % n;

/** An ellipse that goes round a box, with some room to spare. */
export function ringFor(box, pad = 5) {
  return {
    cx: box.x + box.w / 2,
    cy: box.y + box.h / 2,
    rx: box.w / 2 + pad + 3,
    ry: box.h / 2 + pad,
  };
}

/**
 * A curved arrow from the bottom of a ring to a point on the note.
 * Returns the path, and the angle the head should point at the end.
 */
export function arrowFrom(ring, to) {
  const x0 = ring.cx;
  const y0 = ring.cy + ring.ry;
  const bow = Math.max(-60, Math.min(60, (to.x - x0) * 0.35));
  const c1 = { x: x0 + bow * 0.2, y: y0 + (to.y - y0) * 0.55 };
  const c2 = { x: to.x - bow, y: to.y - (to.y - y0) * 0.35 };
  const d = `M${x0.toFixed(1)} ${y0.toFixed(1)} C${c1.x.toFixed(1)} ${c1.y.toFixed(1)} ${c2.x.toFixed(1)} ${c2.y.toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
  const angle = Math.atan2(to.y - c2.y, to.x - c2.x);
  return { d, angle, x: to.x, y: to.y };
}

function el(name, attrs) {
  const n = document.createElementNS(SVG, name);
  for (const k of Object.keys(attrs)) n.setAttribute(k, attrs[k]);
  return n;
}

/** @param {HTMLElement} root a `.fm` block */
export function initFormula(root) {
  const params = [...root.querySelectorAll('.fm__p')];
  const notes = new Map([...root.querySelectorAll('.fm__note')].map((n) => [n.dataset.for, n]));
  const eq = root.querySelector('.fm__eq');
  const noteBox = root.querySelector('.fm__notes');
  if (!params.length) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const svg = el('svg', { class: 'fm__svg', 'aria-hidden': 'true' });
  const ring = el('ellipse', { class: 'fm__ring', pathLength: 1 });
  const arrow = el('path', { class: 'fm__arrow', pathLength: 1 });
  const head = el('path', { class: 'fm__head', d: 'M0 0 L-9 -4.5 L-9 4.5 Z' });
  svg.append(arrow, ring, head);
  root.prepend(svg);

  let active = 0;
  let touched = false;
  let visible = false;
  let timer = 0;

  function place() {
    const base = root.getBoundingClientRect();
    const b = params[active].getBoundingClientRect();
    const box = { x: b.left - base.left, y: b.top - base.top, w: b.width, h: b.height };
    const r = ringFor(box);
    ring.setAttribute('cx', r.cx);
    ring.setAttribute('cy', r.cy);
    ring.setAttribute('rx', r.rx);
    ring.setAttribute('ry', r.ry);
    const nb = noteBox.getBoundingClientRect();
    const nx = Math.max(
      nb.left - base.left + 28,
      Math.min(nb.right - base.left - 28, box.x + box.w / 2),
    );
    const a = arrowFrom(r, { x: nx, y: nb.top - base.top - 3 });
    arrow.setAttribute('d', a.d);
    head.setAttribute(
      'transform',
      `translate(${a.x.toFixed(1)} ${a.y.toFixed(1)}) rotate(${((a.angle * 180) / Math.PI).toFixed(1)})`,
    );
  }

  function show(i, replay = true) {
    active = i;
    params.forEach((p, k) => p.classList.toggle('is-on', k === i));
    notes.forEach((n, id) => n.classList.toggle('is-on', id === params[i].dataset.p));
    // restart the draw-in animation of the ring and the arrow
    if (replay && !reduced) {
      svg.classList.remove('is-drawing');
      void svg.getBoundingClientRect();
      svg.classList.add('is-drawing');
    }
    place();
  }

  function schedule() {
    clearTimeout(timer);
    if (reduced || touched || !visible) return;
    timer = setTimeout(() => {
      show(nextIndex(active, params.length));
      schedule();
    }, TOUR_MS);
  }

  params.forEach((p, i) => {
    const pick = () => {
      touched = true;
      clearTimeout(timer);
      show(i);
    };
    p.addEventListener('click', pick);
    p.addEventListener('focus', pick);
    p.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse') pick();
    });
  });

  new ResizeObserver(place).observe(root);
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) {
      show(active);
      schedule();
    } else {
      clearTimeout(timer);
    }
  }).observe(root);
  show(0, false);
}
