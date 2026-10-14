# Restructuring plan

Goal: turn the site into a small, well-structured static project (Vite, vanilla
JS and CSS, no framework) without a big-bang rewrite.

Legend: `[x]` done, `[-]` not done.

## Ground rules

- Small commits. One concern per commit. The site keeps working after every commit.
- Conventional commits, always with a body:
  `git commit -m "feat: short message" -m "what it does and why"`
- Allowed types: `feat`, `fix`, `refactor`, `style`, `test`, `docs`, `build`, `ci`, `chore`.
- Work happens on the `design_update` branch. Nothing is pushed, and `master` is untouched until the whole redesign is finished and reviewed.
- Public names only. No internal project or repository names anywhere in the code.

## Phase 0: baseline

- [x] 0.1 Add this plan on `design_update`
- [x] 0.2 Ignore `node_modules` and `dist`
- [x] 0.3 Add an inventory of pages, assets and libraries in use

## Phase 1: tooling

- [x] 1.1 Add `package.json` and Vite with `dev`, `build` and `preview` scripts
- [x] 1.2 Add `vite.config.js` with the existing pages as entries
- [x] 1.2a Copy legacy scripts into `dist` until they become modules (temporary)
- [x] 1.3 Add `.editorconfig` and Prettier config
- [x] 1.4 Add a GitHub Actions workflow that builds and deploys to Pages (needs Settings > Pages > Source: GitHub Actions before merging to master)

## Phase 2: design tokens and base styles

- [x] 2.1 Add `src/styles/tokens.css` (colours, type, spacing, radii, motion)
- [x] 2.2 Add `src/styles/base.css` (reset, body, links, focus ring)
- [x] 2.3 Add component styles: nav pill, button, glass panel, chip

## Phase 3: shared JS modules (`src/core`)

- [x] 3.1 `dots.js`, the dot engine used by landing, skills and Pixworm
- [x] 3.2 `nav.js`, the floating nav pill with active state
- [x] 3.3 `reveal.js`, one IntersectionObserver helper
- [x] 3.4 `stage-rail.js`, the spotlight rail used by the demos

## Phase 4: pure logic with unit tests (`src/algos`)

- [x] 4.1 Add Vitest
- [x] 4.2 `tracker.js` (IoU and centre-distance association) with tests
- [x] 4.3 `counting.js` (line-crossing and direction) with tests
- [x] 4.4 `kdtree.js` with tests
- [x] 4.5 `pose-graph.js` (Cholesky LM solver) with tests

## Phase 5: new one-page site

Built section by section as `index.html`, then made the homepage (`index.html`) once every
section except Projects was in. The old page is kept as `legacy.html` until phase 7.

- [x] 5.0 Add `index.html` shell, `src/main.js` and a scroll-spy for the nav
- [x] 5.1 Landing: styles, script, markup
- [x] 5.2 About: port the existing text and photo to the new style
- [x] 5.3 Skills: styles, script, markup
- [x] 5.4 Pixworm: photos, styles, script, markup
- [x] 5.5 Blogs: styles, tile animations, markup
- [x] 5.6 Footer and back-to-top
- [x] 5.7 Check `index.html` end to end (all sections, mobile widths, no console errors). Projects is still empty until 6.7

## Phase 6: projects (the autonomy stack, in this order)

Order of the stack: mapping, localization, detection, planning, tracking, watchdog.
Each demo is a page under `projects/` plus a module under `src/demos/`. They share
`src/styles/demo.css`; a demo adds its own stylesheet only for what differs.
A faithful port comes first, and swapping inline helpers for the tested modules in
`src/core` and `src/algos` follows as separate commits.

- [x] 6.0 Include `projects/*.html` in the build
- [x] 6.1 Shared demo styles (`demo.css`) and demo helpers (`src/demos/common.js`)
- [x] 6.2 Mapping: page and module, then use the tested k-d tree and pose-graph solver
- [x] 6.3 Localization
- [x] 6.4 Detection (obstacles)
- [x] 6.5 Planning and watchdog: stages of the stack overview (`projects/stack.html?stage=route` and `?stage=guardian`)
- [x] 6.6 Tracking (path tracking)
- [x] 6.7 Projects section in `index.html`: six chapters in the order above, each showing its demo
- [x] 6.8 Other projects: building footprints and car counting demos, in a "More work" grid

## Phase 7: cleanup

- [x] 7.0 Make `index.html` the new `index.html`; the old page becomes `legacy.html` until deleted
- [x] 7.1 Remove Bootstrap, AOS, Swiper, Typed.js and other unused libraries
- [x] 7.2 Delete old CSS and JS that nothing references (`test.css` first)
- [x] 7.3 Move the blog pages onto the shared styles
- [x] 7.4 Remove `underconstruction.html` and other dead pages

## Phase 8: tests and budgets

- [x] 8.1 Playwright smoke test: every page loads with no console errors
- [x] 8.2 Visual snapshots for the main pages
- [x] 8.3 Lighthouse CI with size and performance budgets

## Phase 9: docs (dropped)

A README and a CONTRIBUTING guide were planned. This is a personal portfolio with one maintainer, so they are not needed.

## Phase 10: Pixworm redesign

Photos stay on Google Drive and Google Photos. Every photo list lives in `src/pixworm/photos.js`.

- [x] 10.1 Photo data in one file, with the address helper and tests
- [x] 10.2 Lightbox: keyboard, swipe, preload, deep link
- [x] 10.3 Pixworm styles and the full screen opening
- [x] 10.4 Collections strip and the selected mosaic on `pixworm.html`
- [x] 10.5 One collection page template; the 9 collection pages use it
- [x] 10.6 Remove the old pixworm styles, scripts and gallery pages; extend the tests

## Phase 11: projects section rework

One stack, seven systems, each with its own demo. Wording says "I worked on", not "buy this".

- [x] 11.1 Wording: nav label and the stack page headline
- [x] 11.2 Stack demo: the vehicle drives in the right lane, not the middle
- [x] 11.3 `algos/ukf.js`, an unscented Kalman filter for object tracking, with tests
- [-] 11.4 Object tracking demo: detections, UKF tracks, IDs, velocity and uncertainty
- [-] 11.5 Route planning demo: user drops a pin, global route, local planning, slowing, overtaking, signals, hard braking, pedestrians
- [-] 11.6 Watchdog demo: the same style as mapping and localization
- [-] 11.7 Seven chapters on the home page and in the stack overview, named the same everywhere
- [-] 11.8 "One stack, three machines": forklift in a warehouse, drone, sidewalk delivery robot
- [-] 11.9 Smoke and e2e tests for the new pages and band

## Target structure

```
index.html  pixworm.html  blogs.html  projects/*.html
src/
  styles/   tokens.css  base.css  components/
  core/     dots.js  nav.js  reveal.js  stage-rail.js
  sections/ landing.js  skills.js  pixworm.js  blogs.js
  demos/    localization.js  tracker.js  mapping.js  counting.js ...
  algos/    tracker.js  counting.js  kdtree.js  pose-graph.js
public/     images, fonts
tests/      unit/  e2e/
docs/       PLAN.md
.github/workflows/deploy.yml
```
