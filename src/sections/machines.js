import { runScene } from './machines/common.js';
import { createForklift } from './machines/forklift.js';
import { createDrone } from './machines/drone.js';
import { createRobot } from './machines/robot.js';

/** The systems every machine runs, in the order of the chapters below. */
export const SYSTEMS = [
  ['map', 'Mapping'],
  ['locate', 'Localization'],
  ['detect', 'Detection'],
  ['track', 'Tracking'],
  ['plan', 'Planning'],
  ['path', 'Path tracking'],
  ['watch', 'Watchdog'],
];

const SCENES = { forklift: createForklift, drone: createDrone, robot: createRobot };

/**
 * "Same stack, other machines": three live scenes. Each has the stack's systems along the top,
 * lit while that system is doing something in the scene. Scenes run only while on screen.
 * @param {HTMLElement} root
 */
export function initMachines(root) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (const card of root.querySelectorAll('.machine')) {
    const make = SCENES[card.dataset.scene];
    if (!make) continue;
    const scene = make();
    const list = card.querySelector('.machine__chips');
    const items = SYSTEMS.map(([key, label]) => {
      const li = document.createElement('li');
      li.dataset.k = key;
      li.textContent = label;
      list.append(li);
      return li;
    });
    let frames = 0;
    const sync = () =>
      items.forEach((li) => li.classList.toggle('is-on', !!scene.chips[li.dataset.k]));
    runScene(card.querySelector('canvas'), scene, {
      reduced,
      onFrame: () => {
        if (frames++ % 6 === 0) sync();
      },
    });
    sync();
  }
}
