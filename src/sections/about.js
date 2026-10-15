import { reveal } from '../core/reveal.js';

/** About section: fade the content in once it scrolls into view. */
export function initAbout(root) {
  reveal([...root.querySelectorAll('.reveal')], { threshold: 0.2 });
}
