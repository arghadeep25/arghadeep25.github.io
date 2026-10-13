import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { globSync } from 'node:fs';

// Every top-level, blog, pixworm and project page is a build entry.
// google*.html is the Search Console verification file and is copied as-is.
const pages = globSync('{*,blogs/*,pixworm/*,projects/*}.html', {
  exclude: (f) => /^google/.test(f),
});

export default defineConfig({
  build: {
    rollupOptions: {
      input: Object.fromEntries(
        pages.map((p) => [p.replace(/\.html$/, ''), resolve(import.meta.dirname, p)]),
      ),
    },
  },
});
