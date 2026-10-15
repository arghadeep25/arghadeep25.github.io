import { expect, test } from '@playwright/test';

const SECTIONS = ['home', 'about', 'projects', 'skills', 'pixworm', 'blogs'];

test.describe('homepage', () => {
  test('has every section and a nav link for each', async ({ page }) => {
    await page.goto('/');
    for (const id of SECTIONS) {
      await expect(page.locator(`section#${id}`)).toHaveCount(1);
      await expect(page.locator(`.nav-pill a[href="#${id}"]`)).toHaveCount(1);
    }
  });

  test('nav link scrolls to its section and marks it current', async ({ page }) => {
    await page.goto('/');
    await page.locator('.nav-pill a[href="#blogs"]').click();
    await expect(page.locator('.nav-pill a[aria-current="location"]')).toHaveText('Blogs');
    await expect(page.locator('section#blogs')).toBeInViewport();
  });

  test('work section names seven systems and loads a demo', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.projects__slides > *')).toHaveCount(7);
    await expect(page.locator('.projects__slides .slide__kicker')).toHaveText([
      'Mapping service',
      'Localization',
      'Obstacle detection',
      'Object tracking',
      'Route planning',
      'Path tracking',
      'Watchdog',
    ]);
    await page.evaluate(() => {
      const el = document.querySelector('.projects__chapters');
      scrollTo(0, el.getBoundingClientRect().top + scrollY + 200);
    });
    await expect(page.locator('.projects__chapters iframe[src]').first()).toHaveAttribute(
      'src',
      /\/projects\//,
    );
  });

  test('more work links to the two extra demos', async ({ page }) => {
    await page.goto('/');
    const hrefs = await page
      .locator('.more__tile')
      .evaluateAll((a) => a.map((x) => x.getAttribute('href')));
    expect(hrefs).toEqual(['/projects/footprints.html', '/projects/car-counting.html']);
  });

  test('nav and blog links on inner pages go home and across', async ({ page }) => {
    await page.goto('/blogs/pointers.html');
    await expect(page.locator('.nav-pill a[aria-current="page"]')).toHaveText('Blogs');
    await page.locator('.nav-pill a[href="/"]').click();
    await expect(page).toHaveURL('/');
  });
});

test.describe('demos', () => {
  for (const [path, stage] of [
    ['/projects/stack.html?stage=route', 'route'],
    ['/projects/stack.html?stage=guardian', 'guardian'],
  ]) {
    test(`${stage} stage opens straight from the address`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(path);
      await page.waitForTimeout(1200);
      expect(errors).toEqual([]);
    });
  }
});
