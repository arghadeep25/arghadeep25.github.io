# Restructuring plan

Goal: turn the site into a small, well-structured static project (Vite, vanilla
JS and CSS, no framework) without a big-bang rewrite.

Legend: `[x]` done, `[-]` not done.

## Ground rules

- Small commits. One concern per commit. The site keeps working after every commit.
- Conventional commits, always with a body:
  `git commit -m "feat: short message" -m "what it does and why"`
- Allowed types: `feat`, `fix`, `refactor`, `style`, `test`, `docs`, `build`, `ci`, `chore`.
- Work happens on the `restructure` branch. Nothing is pushed or merged without review.
- Public names only. No internal project or repository names anywhere in the code.

## Phase 0: baseline

- [x] 0.1 Create the `restructure` branch and add this plan
- [x] 0.2 Ignore `node_modules` and `dist`
- [x] 0.3 Add an inventory of pages, assets and libraries in use

## Phase 1: tooling

- [x] 1.1 Add `package.json` and Vite with `dev`, `build` and `preview` scripts
- [x] 1.2 Add `vite.config.js` with the existing pages as entries
- [x] 1.2a Copy legacy scripts into `dist` until they become modules (temporary)
- [-] 1.3 Add `.editorconfig` and Prettier config
- [-] 1.4 Add a GitHub Actions workflow that builds and deploys to Pages

## Phase 2: design tokens and base styles

- [-] 2.1 Add `src/styles/tokens.css` (colours, type, spacing, radii, motion)
- [-] 2.2 Add `src/styles/base.css` (reset, body, links, focus ring)
- [-] 2.3 Add component styles: nav pill, button, glass panel, chip

## Phase 3: shared JS modules (`src/core`)

- [-] 3.1 `dots.js`, the dot engine used by landing, skills and Pixworm
- [-] 3.2 `nav.js`, the floating nav pill with active state
- [-] 3.3 `reveal.js`, one IntersectionObserver helper
- [-] 3.4 `stage-rail.js`, the spotlight rail used by the demos

## Phase 4: pure logic with unit tests (`src/algos`)

- [-] 4.1 Add Vitest
- [-] 4.2 `tracker.js` (IoU and centre-distance association) with tests
- [-] 4.3 `counting.js` (line-crossing and direction) with tests
- [-] 4.4 `kdtree.js` with tests
- [-] 4.5 `pose-graph.js` (Cholesky LM solver) with tests

## Phase 5: page sections

- [-] 5.1 Landing: markup, then `sections/landing.js`
- [-] 5.2 Skills: markup, then `sections/skills.js`
- [-] 5.3 Pixworm section and photo assets
- [-] 5.4 Blogs section and tile animations
- [-] 5.5 Projects page and chapters

## Phase 6: demos (`src/demos`, each exports `mount` and `destroy`)

- [-] 6.1 Localization
- [-] 6.2 Obstacle detection
- [-] 6.3 Path tracking
- [-] 6.4 Mapping service
- [-] 6.5 Building footprints
- [-] 6.6 Car counting

## Phase 7: cleanup

- [-] 7.1 Remove Bootstrap, AOS, Swiper, Typed.js and other unused libraries
- [-] 7.2 Delete old CSS and JS that nothing references (`test.css` first)
- [-] 7.3 Move the blog pages onto the shared styles
- [-] 7.4 Remove `underconstruction.html` and other dead pages

## Phase 8: tests and budgets

- [-] 8.1 Playwright smoke test: every page loads with no console errors
- [-] 8.2 Visual snapshots for the main pages
- [-] 8.3 Lighthouse CI with size and performance budgets

## Phase 9: docs

- [-] 9.1 README: structure, scripts, how to add a demo
- [-] 9.2 CONTRIBUTING: commit convention and branch flow

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
