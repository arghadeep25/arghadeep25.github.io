import { expect, test } from '@playwright/test';
import { PAGES } from './pages.js';

// Photos and logos are hotlinked from other hosts and the test machine may be offline,
// so a failed load of something that is not ours is not a site error.
const isOurs = (url, base) => !url || url.startsWith(base) || url.startsWith('data:');

for (const path of PAGES) {
  test(`${path} loads without errors`, async ({ page, baseURL }) => {
    const problems = [];
    page.on('pageerror', (e) => problems.push(`exception: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error' && isOurs(m.location().url, baseURL)) {
        problems.push(`console: ${m.text()}`);
      }
    });
    page.on('response', (r) => {
      if (r.url().startsWith(baseURL) && r.status() >= 400) {
        problems.push(`${r.status()}: ${r.url()}`);
      }
    });

    const res = await page.goto(path, { waitUntil: 'load' });
    expect(res.status()).toBe(200);
    await page.waitForTimeout(1500);
    await expect(page).toHaveTitle(/.+/);
    expect(problems).toEqual([]);
  });
}
