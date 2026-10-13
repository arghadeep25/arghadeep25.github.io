/**
 * Spotlight controller for the demos: cycles through stages on a timer,
 * lets the viewer pin one, and pauses on request. No DOM; the demo renders
 * the rail chips and reads `index`, `pinned` and `progress`.
 *
 * Keys handled by handleKey: 1-9 pin that stage, Escape unpins, Space pauses.
 *
 * @param {object} options
 * @param {number[]} options.dwell seconds to stay on each stage
 * @param {(index: number, info: { pinned: boolean }) => void} [options.onChange]
 */
export function createStageController({ dwell, onChange = () => {} }) {
  let index = 0;
  let elapsed = 0;
  let pinned = false;
  let paused = false;

  const go = (i) => {
    index = ((i % dwell.length) + dwell.length) % dwell.length;
    elapsed = 0;
    onChange(index, { pinned });
  };

  return {
    get index() {
      return index;
    },
    get pinned() {
      return pinned;
    },
    get paused() {
      return paused;
    },
    /** 0..1 through the current stage; a pinned stage reads as full. */
    get progress() {
      return pinned ? 1 : Math.min(1, elapsed / dwell[index]);
    },
    /** Advance the clock. Call once per frame with dt in seconds. */
    tick(dt) {
      if (pinned || paused) return;
      elapsed += dt;
      if (elapsed >= dwell[index]) go(index + 1);
    },
    pin(i) {
      pinned = true;
      go(i);
    },
    unpin() {
      if (!pinned) return;
      pinned = false;
      elapsed = 0;
      onChange(index, { pinned });
    },
    togglePause() {
      paused = !paused;
      return paused;
    },
    /** @param {{ key: string }} e */
    handleKey(e) {
      if (e.key === 'Escape') this.unpin();
      else if (e.key === ' ') this.togglePause();
      else if (/^[1-9]$/.test(e.key) && +e.key <= dwell.length) this.pin(+e.key - 1);
      else return false;
      return true;
    },
  };
}
