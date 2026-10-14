import { expect, test } from '@playwright/test';

// The scenario demos expose a small test hook with ?debug: __sim(seconds) steps the simulation and
// __dbg() reports its state. Everything is seeded, so these runs are repeatable.
const watchErrors = (page) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
};

test.describe('object tracking demo', () => {
  test('follows several objects, rejects false alarms and keeps the vehicle moving', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.goto('/projects/tracking.html?debug');
    await page.evaluate(() => window.__sim(40));
    const d = await page.evaluate(() => window.__dbg());
    expect(d.tracks.filter((t) => t.state !== 'tentative').length).toBeGreaterThanOrEqual(2);
    expect(d.rejected).toBeGreaterThan(0);
    expect(d.egoV).toBeGreaterThanOrEqual(0);
    expect(errors).toEqual([]);
  });

  test('has four stages, and clicking one holds it', async ({ page }) => {
    await page.goto('/projects/tracking.html');
    const chips = page.locator('.rail .chip');
    await expect(chips).toHaveText(['Detect', 'Associate', 'Predict', 'Blind spots']);
    await chips.nth(2).click();
    await expect(page.locator('#dName')).toHaveText('Following and predicting');
  });
});

test.describe('route planning demo', () => {
  test('plans, overtakes, stops, yields and brakes hard without a collision', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/projects/route-planning.html?debug');
    for (let i = 0; i < 10; i++) await page.evaluate(() => window.__sim(60));
    const { stats } = await page.evaluate(() => window.__dbg());
    expect(stats.arrivals).toBeGreaterThanOrEqual(1);
    expect(stats.overtakes).toBeGreaterThanOrEqual(1);
    expect(stats.yields).toBeGreaterThanOrEqual(1);
    expect(stats.hardBrakes).toBeGreaterThanOrEqual(1);
    expect(stats.collisions).toBe(0);
    expect(errors).toEqual([]);
  });

  test('a click on the map drops a pin and plans a new route', async ({ page }) => {
    await page.goto('/projects/route-planning.html?debug');
    await page.evaluate(() => window.__sim(4));
    const before = await page.evaluate(() => window.__dbg().len);
    const box = await page.locator('#mini').boundingBox();
    await page.mouse.click(box.x + box.width * 0.82, box.y + box.height * 0.2);
    await expect(page.locator('#stat')).toContainText('Planning');
    await page.evaluate(() => window.__sim(3));
    const after = await page.evaluate(() => window.__dbg().len);
    expect(after).not.toBe(before);
    expect(after).toBeGreaterThan(0);
  });

  test('has one stage for each behaviour', async ({ page }) => {
    await page.goto('/projects/route-planning.html');
    await expect(page.locator('.rail .chip')).toHaveText([
      'Destination',
      'Slow traffic',
      'Overtaking',
      'Signals',
      'Sudden braking',
      'Pedestrians',
    ]);
  });
});

test.describe('watchdog demo', () => {
  test('restarts a component that stops and carries on', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/projects/watchdog.html?debug');
    await page.evaluate(() => window.__go(2));
    await page.evaluate(() => window.__sim(4));
    const mid = await page.evaluate(() => window.__dbg());
    expect(mid.mode).toBe('Recovering');
    await page.evaluate(() => window.__sim(6));
    const end = await page.evaluate(() => window.__dbg());
    expect(end.restarts).toBe(1);
    expect(end.alive).toBe(8);
    expect(end.mode).toBe('Healthy');
    expect(errors).toEqual([]);
  });

  test('stops the vehicle safely when a component cannot be repaired', async ({ page }) => {
    await page.goto('/projects/watchdog.html?debug');
    await page.evaluate(() => window.__go(4));
    await page.evaluate(() => window.__sim(14));
    const d = await page.evaluate(() => window.__dbg());
    expect(d.mode).toBe('Safe stop');
    expect(d.v).toBeLessThan(5);
    expect(d.alive).toBe(7);
  });

  test('flags a late message and an overload', async ({ page }) => {
    await page.goto('/projects/watchdog.html?debug');
    await page.evaluate(() => window.__go(1));
    await page.evaluate(() => window.__sim(4.5));
    expect((await page.evaluate(() => window.__dbg())).states.loc).toBe('late/late');
    await page.evaluate(() => window.__go(3));
    await page.evaluate(() => window.__sim(4.5));
    expect((await page.evaluate(() => window.__dbg())).states.trk).toBe('hot/hot');
  });
});

test.describe('stack overview and machines', () => {
  test('the overview names the same seven systems plus the vehicle interface', async ({ page }) => {
    await page.goto('/projects/stack.html');
    await expect(page.locator('.rail .chip')).toHaveText([
      'Mapping service',
      'Localization',
      'Obstacle Detection',
      'Object Tracking',
      'Route Planning',
      'Path Tracking',
      'Vehicle Interface',
      'Watchdog',
    ]);
  });

  test('three machines run on the home page and light their systems', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    await page.locator('#machines').scrollIntoViewIfNeeded();
    await expect(page.locator('.machine')).toHaveCount(3);
    await expect(page.locator('.machine canvas')).toHaveCount(3);
    for (const card of await page.locator('.machine').all()) {
      await expect(card.locator('.machine__chips li')).toHaveCount(7);
    }
    await page.waitForTimeout(1500);
    for (const card of await page.locator('.machine').all()) {
      expect(await card.locator('.machine__chips li.is-on').count()).toBeGreaterThanOrEqual(3);
    }
    expect(errors).toEqual([]);
  });

  test('with reduced motion the machines draw one frame and stay still', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.locator('#machines').scrollIntoViewIfNeeded();
    const first = await page
      .locator('.machine canvas')
      .first()
      .evaluate((c) => c.toDataURL().length);
    await page.waitForTimeout(800);
    const later = await page
      .locator('.machine canvas')
      .first()
      .evaluate((c) => c.toDataURL().length);
    expect(first).toBeGreaterThan(1000);
    expect(later).toBe(first);
  });
});
