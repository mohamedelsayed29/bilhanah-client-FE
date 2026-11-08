import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const review = fileURLToPath(new URL('../test-results/review/order-flow/', import.meta.url));
test.beforeEach(async () => { await mkdir(review, { recursive: true }); });

/** The page smooth-scrolls to #features by itself; scrolling while that runs adds to its remaining distance. */
async function openFeatures(page: Page) {
  await page.goto('/#features');
  let last = -1;
  await expect.poll(async () => {
    const y = await page.evaluate(() => scrollY);
    const settled = y > 0 && y === last;
    last = y;
    return settled;
  }, { intervals: [250] }).toBe(true);
  const flow = page.locator('.order-flow');
  await flow.scrollIntoViewIfNeeded();
  return flow;
}

test('automatic tour reaches the ready notification, pauses, loops, and stops offscreen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install();
  const flow = await openFeatures(page);
  await expect(flow).toHaveAttribute('data-running', 'true');
  await page.clock.runFor(2400);
  await expect(flow).toHaveAttribute('data-beat', '1');
  await expect(flow.getByRole('button', { name: 'رئيسي', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.clock.runFor(1800);
  await expect(flow).toHaveAttribute('data-beat', '2');
  await expect(flow.locator('.order-bag')).toContainText('١٨٥');
  // The tour has no pause: it keeps going on its own.
  await expect(flow.getByRole('button', { name: 'إيقاف العرض', exact: true })).toHaveCount(0);
  for (const [duration, beat] of [[2000, 3], [3000, 4], [1200, 5], [2400, 6], [3800, 7]]) {
    await page.clock.runFor(duration);
    await expect(flow).toHaveAttribute('data-beat', `${beat}`);
  }
  await expect(flow.locator('.order-notification')).toHaveClass(/visible/);
  await expect(flow.locator('.order-phone')).toHaveClass(/order-phone-ready/);
  await expect(flow.locator('.order-tracking h3')).toHaveText('طلبك جاهز. بالهنا!');
  await flow.screenshot({ path: `${review}/ready-ar.png` });
  await page.locator('#features').screenshot({ path: `${review}/features-ready-ar.png` });
  await page.clock.runFor(6000);
  await expect(flow).toHaveAttribute('data-beat', '0');
  await page.locator('footer').scrollIntoViewIfNeeded();
  await expect(flow).toHaveAttribute('data-running', 'false');
  await page.clock.runFor(8000);
  await expect(flow).toHaveAttribute('data-beat', '0');
  expect(errors).toEqual([]);
});

test('manual order handles empty bags and quantities, and reaches ready without resetting', async ({ page }) => {
  await page.clock.install();
  const flow = await openFeatures(page);
  await flow.getByRole('button', { name: 'جرّب بنفسك', exact: true }).click();
  await flow.locator('.order-bag').click();
  await expect(flow.getByRole('button', { name: 'تأكيد الطلب', exact: true })).toBeDisabled();
  await flow.getByRole('button', { name: 'رجوع للمنيو', exact: true }).click();
  await flow.getByRole('button', { name: 'أضف برجر البيت', exact: true }).click();
  await flow.getByRole('button', { name: 'أضف باستا بيستو', exact: true }).click();
  await flow.locator('.order-bag').click();
  await expect(flow.locator('.order-total')).toContainText('٣٤٠');
  await flow.getByRole('button', { name: 'زيادة برجر البيت', exact: true }).click();
  await expect(flow.locator('.order-total')).toContainText('٥٢٥');
  await flow.getByRole('button', { name: 'تقليل برجر البيت', exact: true }).click();
  await flow.getByRole('button', { name: 'تأكيد الطلب', exact: true }).click();
  for (const duration of [1200, 2400, 3800]) await page.clock.runFor(duration);
  await expect(flow).toHaveAttribute('data-beat', '7');
  await expect(flow.locator('.order-ticket')).toContainText('٣٤٠');
  await page.clock.runFor(10000);
  await expect(flow).toHaveAttribute('data-beat', '7');
});

test('reduced motion, Arabic and English layouts, and ready screen accessibility', async ({ page }) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const flow = await openFeatures(page);
  await expect(flow).toHaveAttribute('data-running', 'false');
  for (const language of ['ar', 'en']) {
    if (language === 'en') await page.getByRole('button', { name: 'Switch to English', exact: true }).click();
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await flow.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${language} at ${width}`).toBe(true);
      const bounds = await flow.locator('.order-phone-screen').evaluate(element => ({ width: element.clientWidth, content: element.scrollWidth, height: element.clientHeight, contentHeight: element.scrollHeight }));
      expect(bounds.content).toBeLessThanOrEqual(bounds.width);
      expect(bounds.contentHeight).toBeLessThanOrEqual(bounds.height);
      const story = await flow.locator('.order-story-steps').evaluate(element => ({ width: element.clientWidth, content: element.scrollWidth }));
      expect(story.content).toBeLessThanOrEqual(story.width);
      await flow.screenshot({ path: `${review}/${language}-${width}.png` });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await flow.scrollIntoViewIfNeeded();
  await flow.getByRole('button', { name: 'Play tour', exact: true }).click();
  await expect(flow).toHaveAttribute('data-running', 'true');
  for (const [index, duration] of [2400, 1800, 2000, 3000, 1200, 2400, 3800].entries()) {
    await page.clock.runFor(duration);
    await expect(flow).toHaveAttribute('data-beat', `${index + 1}`);
  }
  await expect(flow).toHaveAttribute('data-beat', '7');
  await expect(flow.locator('.order-phone')).toHaveCSS('animation-name', 'none');
  await flow.screenshot({ path: `${review}/ready-en.png` });
  const result = await new AxeBuilder({ page }).include('.order-flow').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
});
