import { expect, test } from '@playwright/test';
import { COLLECTIONS, SELECTED } from '../../src/pixworm/photos.js';

// Photos come from Google, so every other host is blocked: these tests check the page, not the pictures.
test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.hostname !== '127.0.0.1',
    (route) => route.abort(),
  );
});

test.describe('pixworm page', () => {
  test('lists every collection and the selected photos', async ({ page }) => {
    await page.goto('/pixworm.html');
    await expect(page.locator('.pxc__card')).toHaveCount(COLLECTIONS.length);
    await expect(page.locator('.mosaic__item')).toHaveCount(SELECTED.length);
    const hrefs = await page
      .locator('.pxc__card')
      .evaluateAll((a) => a.map((x) => x.getAttribute('href')));
    expect(hrefs).toEqual(COLLECTIONS.map((c) => `/pixworm/${c.slug}.html`));
  });

  test('a photo opens the viewer, arrows move, Esc closes', async ({ page }) => {
    await page.goto('/pixworm.html');
    await page.locator('.mosaic__item').first().click();
    await expect(page.locator('.lb')).toBeVisible();
    await expect(page.locator('.lb__count')).toHaveText(`1 / ${SELECTED.length}`);
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.lb__count')).toHaveText(`2 / ${SELECTED.length}`);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.lb__count')).toHaveText(`${SELECTED.length} / ${SELECTED.length}`);
    await page.keyboard.press('Escape');
    await expect(page.locator('.lb')).toBeHidden();
  });
});

test.describe('collection pages', () => {
  for (const c of COLLECTIONS) {
    test(`${c.slug} shows all ${c.photos.length} photos`, async ({ page }) => {
      await page.goto(`/pixworm/${c.slug}.html`);
      await expect(page.locator('h1')).toHaveText(c.title);
      await expect(page.locator('.mosaic__item')).toHaveCount(c.photos.length);
      await expect(page.locator('[data-count]')).toHaveText(`${c.photos.length} photos`);
    });
  }

  test('a #p link opens that photo and closing clears it', async ({ page }) => {
    const c = COLLECTIONS[0];
    await page.goto(`/pixworm/${c.slug}.html#p3`);
    await expect(page.locator('.lb')).toBeVisible();
    await expect(page.locator('.lb__count')).toHaveText(`3 / ${c.photos.length}`);
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => location.hash)).toBe('');
  });

  test('the next link goes to the following collection', async ({ page }) => {
    await page.goto(`/pixworm/${COLLECTIONS[0].slug}.html`);
    await expect(page.locator('[data-next]')).toHaveAttribute(
      'href',
      `/pixworm/${COLLECTIONS[1].slug}.html`,
    );
  });

  test('old gallery address redirects to the collections', async ({ page }) => {
    await page.goto('/pixworm/gallery.html');
    await page.waitForURL(/\/pixworm\.html#collections/);
  });
});
