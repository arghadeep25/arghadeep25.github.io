import { globSync } from 'node:fs';

// Same page list the build uses. The Search Console file and the menu fragment that the
// gallery pages fetch are not pages.
export const PAGES = globSync('{*,blogs/*,pixworm/*,projects/*}.html')
  .filter((f) => !/^google|menu_header/.test(f))
  .sort()
  .map((f) => (f === 'index.html' ? '/' : `/${f}`));
