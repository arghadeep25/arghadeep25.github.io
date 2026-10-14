import { expect, test } from '@playwright/test';

// Static pages only: the homepage and demos animate, so they are covered by home.spec.js.
// Every request to another host (web fonts, remote photos) is blocked so every machine renders
// the same fallback.
const STATIC = ['/blogs.html', '/blogs/pointers.html', '/blogs/slam.html'];

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.hostname !== '127.0.0.1',
    (route) => route.abort(),
  );
});

for (const path of STATIC) {
  test(`${path} looks the same`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'load' });
    await expect(page).toHaveScreenshot(`${path.replace(/\W+/g, '-').replace(/^-|-$/g, '')}.png`, {
      animations: 'disabled',
      maxDiffPixelRatio: 0.03,
      fullPage: false,
    });
  });
}
