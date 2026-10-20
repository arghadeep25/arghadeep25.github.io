import { expect, test } from '@playwright/test';

const FIGURES = [
  'chicken',
  'overview',
  'pipeline',
  'landmark',
  'bell',
  'drift',
  'nodes',
  'edges',
  'tug',
  'loop',
  'sum',
  'bowl',
  'steps',
  'anchor',
  'fog',
  'outlier',
];

/** A fingerprint of what a figure's canvas shows now. */
const shot = (page, name) =>
  page.evaluate((n) => document.querySelector(`[data-fig="${n}"] canvas`).toDataURL(), name);

/** How many pixels of a figure's canvas are not blank. */
const inked = (page, name) =>
  page.evaluate((n) => {
    const cv = document.querySelector(`[data-fig="${n}"] canvas`);
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let c = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) c++;
    return c;
  }, name);

const bring = async (page, name) => {
  await page.locator(`[data-fig="${name}"]`).scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
};

test.describe('Graph SLAM post', () => {
  test('has every figure drawn on a canvas', async ({ page }) => {
    await page.goto('/blogs/graph_slam_basics.html');
    for (const name of FIGURES) {
      await expect(page.locator(`[data-fig="${name}"] canvas`)).toHaveCount(1);
      await bring(page, name);
      expect(await inked(page, name), `${name} is blank`).toBeGreaterThan(500);
    }
  });

  test('a worse pose makes a smeared map, and the trust slider reshapes the bell', async ({
    page,
  }) => {
    await page.goto('/blogs/graph_slam_basics.html');
    for (const [name, knob] of [
      ['chicken', '0'],
      ['bell', '1.6'],
    ]) {
      await bring(page, name);
      await page.locator(`[data-fig="${name}"] .fig__play`).click(); // pause
      const before = await shot(page, name);
      await page.locator(`[data-fig="${name}"] .fig__knob input`).first().fill(knob);
      await page.waitForTimeout(200);
      expect(await shot(page, name), `${name} ignores its slider`).not.toBe(before);
    }
  });

  test('every formula says why it is written that way and why it matters', async ({ page }) => {
    await page.goto('/blogs/graph_slam_basics.html');
    const missing = await page.evaluate(() =>
      [...document.querySelectorAll('.fm')]
        .filter((fm) => fm.querySelectorAll('.fm__why h4').length !== 2)
        .map((fm) => fm.closest('section').id),
    );
    expect(missing).toEqual([]);
  });

  test('lists its sections and each link goes somewhere', async ({ page }) => {
    await page.goto('/blogs/graph_slam_basics.html');
    const links = page.locator('.article__toc a');
    expect(await links.count()).toBeGreaterThanOrEqual(10);
    for (const href of await links.evaluateAll((a) => a.map((x) => x.getAttribute('href')))) {
      await expect(page.locator(href)).toHaveCount(1);
    }
  });

  test('a figure only moves while it is on screen', async ({ page }) => {
    await page.goto('/blogs/graph_slam_basics.html');
    await bring(page, 'drift');
    const read = () => page.locator('[data-fig="drift"] .fig__scrub').inputValue();
    const a = +(await read());
    await page.waitForTimeout(800);
    expect(+(await read())).toBeGreaterThan(a);
    // scroll far away: the clock stops
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(400);
    const b = +(await read());
    await page.waitForTimeout(800);
    expect(+(await read())).toBe(b);
  });

  test('sliding the wobble changes the picture', async ({ page }) => {
    await page.goto('/blogs/graph_slam_basics.html');
    await bring(page, 'drift');
    await page.locator('[data-fig="drift"] .fig__play').click(); // pause
    const before = await shot(page, 'drift');
    await page.locator('[data-fig="drift"] .fig__knob input').fill('0.1');
    await page.waitForTimeout(200);
    expect(await shot(page, 'drift')).not.toBe(before);
  });

  test('the formula circles a parameter and explains it', async ({ page }) => {
    await page.goto('/blogs/graph_slam_basics.html');
    const fm = page.locator('#edges .fm');
    await fm.scrollIntoViewIfNeeded();
    await fm.locator('[data-p="h"]').click();
    await expect(fm.locator('[data-p="h"]')).toHaveClass(/is-on/);
    const note = fm.locator('.fm__note[data-for="h"]');
    await expect(note).toHaveClass(/is-on/);
    await expect(note.locator('.more')).toBeVisible();
    await expect(note.locator('.less')).toBeVisible();
    await expect(fm.locator('.fm__ring')).toHaveAttribute('rx', /\d/);
    // only the chosen note shows
    await expect(fm.locator('.fm__note.is-on')).toHaveCount(1);
  });

  test('every formula parameter has a note with a bigger and a smaller line', async ({ page }) => {
    await page.goto('/blogs/graph_slam_basics.html');
    const bad = await page.evaluate(() =>
      [...document.querySelectorAll('.fm')].flatMap((fm) =>
        [...fm.querySelectorAll('.fm__p')]
          .map((p) => p.dataset.p)
          .filter((id) => {
            const n = fm.querySelector(`.fm__note[data-for="${id}"]`);
            return !n || !n.querySelector('.more') || !n.querySelector('.less');
          }),
      ),
    );
    expect(bad).toEqual([]);
  });

  test('pin j can be dragged away in the edge figure, and the string pulls it back', async ({
    page,
  }) => {
    await page.goto('/blogs/graph_slam_basics.html');
    await bring(page, 'edges');
    const fig = page.locator('[data-fig="edges"]');
    const box = await fig.locator('canvas').boundingBox();
    await page.waitForTimeout(2200); // the first spring-back settles
    const where = async () => {
      const [fx, fy] = (await fig.getAttribute('data-pin')).split(',').map(Number);
      return [box.x + box.width * fx, box.y + box.height * fy];
    };
    const [x, y] = await where();
    await page.mouse.move(x, y);
    await page.mouse.down();
    await expect(fig).toHaveAttribute('data-grab', 'move');
    await page.mouse.move(x - 140, y + 90, { steps: 6 });
    const [dx, dy] = await where();
    expect(Math.hypot(dx - x, dy - y)).toBeGreaterThan(100); // it followed the pointer
    await page.mouse.up();
    await expect(fig).not.toHaveAttribute('data-grab', /.+/);
    await page.waitForTimeout(2500);
    const [bx, by] = await where();
    expect(Math.hypot(bx - x, by - y)).toBeLessThan(25); // the string pulled it home
  });

  test('the cost figure lowers its price when it relaxes', async ({ page }) => {
    await page.goto('/blogs/graph_slam_basics.html');
    await bring(page, 'sum');
    const before = await shot(page, 'sum');
    await page.getByRole('button', { name: 'Let it relax' }).click();
    await page.waitForTimeout(2500);
    expect(await shot(page, 'sum')).not.toBe(before);
    await page.getByRole('button', { name: 'Reset' }).click();
    await page.waitForTimeout(300);
    expect(await shot(page, 'sum')).toBe(before);
  });

  test('the wrong string can be added and the robust price switched on', async ({ page }) => {
    await page.goto('/blogs/graph_slam_basics.html');
    await bring(page, 'outlier');
    const toggles = page.locator('#liar .fig__toggle');
    await expect(toggles).toHaveCount(2);
    await expect(toggles.nth(0)).toHaveAttribute('aria-pressed', 'true');
    await expect(toggles.nth(1)).toHaveAttribute('aria-pressed', 'false');
    await page.waitForTimeout(6500);
    const crushed = await shot(page, 'outlier');
    await toggles.nth(1).click();
    await expect(toggles.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(6500);
    expect(await shot(page, 'outlier')).not.toBe(crushed);
  });

  test('the pin-the-first-dot figure holds the map still once pinned', async ({ page }) => {
    await page.goto('/blogs/graph_slam_basics.html');
    await bring(page, 'anchor');
    const cv = page.locator('[data-fig="anchor"] canvas');
    const box = await cv.boundingBox();
    const drag = async () => {
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.5 + 80, box.y + box.height * 0.5 + 40, {
        steps: 5,
      });
      await page.mouse.up();
    };
    const rest = await shot(page, 'anchor');
    await drag();
    expect(await shot(page, 'anchor')).not.toBe(rest);
    await page.getByRole('button', { name: 'Pin the first dot' }).click();
    await page.waitForTimeout(1500);
    const pinned = await shot(page, 'anchor');
    await drag();
    expect(await shot(page, 'anchor')).toBe(pinned);
  });

  test('with reduced motion every figure starts on its finished frame', async ({ browser }) => {
    const ctx = await browser.newContext({
      reducedMotion: 'reduce',
      viewport: { width: 1440, height: 900 },
    });
    const page = await ctx.newPage();
    await page.goto('/blogs/graph_slam_basics.html');
    await bring(page, 'loop');
    const play = page.locator('[data-fig="loop"] .fig__play');
    await expect(play).toHaveText('Play');
    const scrub = page.locator('[data-fig="loop"] .fig__scrub');
    expect(+(await scrub.inputValue())).toBeGreaterThan(14);
    await ctx.close();
  });

  test('fits a phone without sideways scrolling', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto('/blogs/graph_slam_basics.html');
    for (const name of FIGURES) await bring(page, name);
    const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    expect(sw).toBeLessThanOrEqual(iw);
    await ctx.close();
  });
});
