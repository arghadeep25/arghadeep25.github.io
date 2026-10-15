/**
 * One step of the typing animation, as a pure state machine.
 * @param {{ word: number, len: number, deleting: boolean }} state
 * @param {string[]} words
 * @param {{ type?: number, erase?: number, hold?: number, holdLast?: number, gap?: number }} [timing] milliseconds
 * @returns {{ state: typeof state, text: string, delay: number }} text to show and ms until the next step
 */
export function nextStep(state, words, timing = {}) {
  const { type = 85, erase = 32, hold = 1500, holdLast = 3200, gap = 350 } = timing;
  const word = words[state.word];
  if (!state.deleting) {
    const len = state.len + 1;
    const done = len >= word.length;
    return {
      state: { ...state, len, deleting: done },
      text: word.slice(0, len),
      delay: done ? (state.word === words.length - 1 ? holdLast : hold) : type,
    };
  }
  const len = state.len - 1;
  if (len <= 0) {
    return {
      state: { word: (state.word + 1) % words.length, len: 0, deleting: false },
      text: '',
      delay: gap,
    };
  }
  return { state: { ...state, len }, text: word.slice(0, len), delay: erase };
}

/**
 * Type the words into an element, one after another, looping.
 * With reduced motion the full list is shown at once.
 * @param {HTMLElement} el
 * @param {string[]} words
 * @param {{ start?: number } & Parameters<typeof nextStep>[2]} [options] start: ms before typing begins
 * @returns {() => void} stop
 */
export function typewriter(el, words, { start = 0, ...timing } = {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = words.join(', ');
    return () => {};
  }
  let state = { word: 0, len: 0, deleting: false };
  let timer = setTimeout(tick, start);
  function tick() {
    const step = nextStep(state, words, timing);
    state = step.state;
    el.textContent = step.text;
    timer = setTimeout(tick, step.delay);
  }
  return () => clearTimeout(timer);
}
