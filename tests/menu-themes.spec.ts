import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { json, menuFixture, mockRealtime, orderFixture, restaurantUrl, serveMenu, TOKEN } from './ordering-fixtures';

// Menu themes on restaurant pages: the restaurant's theme from the API, the dashboard's
// ?preview-theme=<id> override, and Arabesque's accessibility on every screen a diner sees.
const VISITS = '**/v1/public/restaurants/koshary/visits';
const GREEN = 'rgb(14, 59, 46)';

const theme = (page: Page) => page.locator('html');
const headingFont = (page: Page) => page.getByRole('heading', { level: 1 }).evaluate(element => getComputedStyle(element).fontFamily);

/** Requests for the Arabesque display face (Amiri), which only that theme may load. */
function watchDisplayFont(page: Page) {
  const requests: string[] = [];
  page.on('request', request => { if (/amiri/i.test(request.url())) requests.push(request.url()); });
  return requests;
}

function countVisits(page: Page) {
  const visits: string[] = [];
  void page.route(VISITS, route => { visits.push(route.request().url()); return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } }); });
  return visits;
}

async function axe(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([]);
}

test('Classic is the default, also for an API that sends no theme, and loads no theme font', async ({ page }) => {
  const fonts = watchDisplayFont(page);
  const { restaurant, categories } = menuFixture();
  const { menuTheme: _omitted, ...withoutTheme } = restaurant as typeof restaurant & { menuTheme?: string };
  await serveMenu(page, { restaurant: withoutTheme as typeof restaurant, categories });
  await page.goto(restaurantUrl());

  await expect(page.getByRole('heading', { level: 1, name: 'كشري أبو طارق' })).toBeVisible();
  await expect(theme(page)).toHaveAttribute('data-menu-theme', 'classic');
  await expect(page.locator('.menu-page')).toHaveAttribute('style', /--brand: #b4432f/);
  expect(await headingFont(page)).not.toMatch(/Amiri/);
  await expect(page.locator('.menu-header')).not.toHaveCSS('background-color', GREEN);
  expect(fonts).toEqual([]);
});

test('applies the restaurant theme from the API to the menu and remembers it', async ({ page }) => {
  const fonts = watchDisplayFont(page);
  await serveMenu(page, menuFixture({ menuTheme: 'arabesque' }));
  await page.goto(restaurantUrl());

  await expect(theme(page)).toHaveAttribute('data-menu-theme', 'arabesque');
  await expect(page.locator('.menu-header')).toHaveCSS('background-color', GREEN);
  expect(await headingFont(page)).toMatch(/^"?Amiri/);
  await expect.poll(() => fonts.length).toBeGreaterThan(0);
  // The brand colour (#b4432f, 4.9:1 on the ivory page) still marks the actions.
  await expect(page.locator('.menu-page')).toHaveAttribute('style', /--brand: #b4432f/);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0e3b2e');

  // A later visit starts in the same look, even when the menu cannot load.
  await page.unroute('**/v1/public/restaurants/koshary/menu');
  await page.route('**/v1/public/restaurants/koshary/menu', route => route.fulfill(json({ error: { code: 'X', message: 'X' } }, 500)));
  await page.reload();
  await expect(page.getByRole('alert')).toHaveText('حصلت مشكلة في تحميل المنيو.');
  await expect(theme(page)).toHaveAttribute('data-menu-theme', 'arabesque');
  await expect(page.locator('.restaurant-page')).toHaveCSS('background-color', 'rgb(248, 241, 223)');
});

test('a brand colour without AA contrast on the ivory page gives way to the theme green', async ({ page }) => {
  await serveMenu(page, menuFixture({ menuTheme: 'arabesque', brandColor: '#f2c14e' }));
  await page.goto(restaurantUrl());
  await expect(page.locator('.menu-page')).toHaveAttribute('style', /--brand: #0e3b2e/);
  await expect(page.locator('.menu-page')).toHaveAttribute('style', /--on-brand: #ffffff/);
});

test('?preview-theme overrides the restaurant theme for that load only, and is not counted as a visit', async ({ page }) => {
  await serveMenu(page, menuFixture({ menuTheme: 'classic' }));
  const visits = countVisits(page);
  await page.goto(restaurantUrl('/?preview-theme=arabesque'));

  await expect(theme(page)).toHaveAttribute('data-menu-theme', 'arabesque');
  await expect(page.locator('.menu-header')).toHaveCSS('background-color', GREEN);
  await expect(page).toHaveURL(restaurantUrl('/?preview-theme=arabesque'));
  await page.waitForTimeout(500);
  expect(visits).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('bilhanah:menu-theme:v1:koshary'))).toBeNull();

  // Without the parameter the restaurant's own theme is back, and the visit counts.
  await page.goto(restaurantUrl('/'));
  await expect(page.getByRole('heading', { level: 1, name: 'كشري أبو طارق' })).toBeVisible();
  await expect(theme(page)).toHaveAttribute('data-menu-theme', 'classic');
  await expect.poll(() => visits.length).toBe(1);
});

test('a preview can show Classic for an Arabesque restaurant; unknown theme ids are ignored', async ({ page }) => {
  await serveMenu(page, menuFixture({ menuTheme: 'arabesque' }));
  const visits = countVisits(page);
  await page.goto(restaurantUrl('/?preview-theme=classic'));
  await expect(page.getByRole('heading', { level: 1, name: 'كشري أبو طارق' })).toBeVisible();
  await expect(theme(page)).toHaveAttribute('data-menu-theme', 'classic');
  await expect(page.locator('.menu-header')).not.toHaveCSS('background-color', GREEN);

  for (const id of ['neon', 'ARABESQUE', '']) {
    await page.goto(restaurantUrl(`/?preview-theme=${id}`));
    await expect(page.getByRole('heading', { level: 1, name: 'كشري أبو طارق' })).toBeVisible();
    await expect(theme(page)).toHaveAttribute('data-menu-theme', 'arabesque');
  }
  await page.waitForTimeout(500);
  expect(visits).toEqual([]);
});

test.describe('Arabesque passes axe on every screen a diner sees', () => {
  for (const language of ['ar', 'en'] as const) {
    test(`menu, dish sheet, cart and checkout (${language})`, async ({ page }) => {
      await page.addInitScript(([lang]) => localStorage.setItem('bilhanah:language:v1', lang!), [language]);
      await serveMenu(page, menuFixture({ menuTheme: 'arabesque' }));
      await page.goto(restaurantUrl('/?t=T5'));
      await expect(theme(page)).toHaveAttribute('data-menu-theme', 'arabesque');
      await expect(page.locator('.dish-card').first()).toBeVisible();
      await axe(page);

      await page.locator('.dish-card').first().click();
      const sheet = page.locator('dialog.dish-sheet[open]');
      await expect(sheet).toBeVisible();
      await expect(sheet.locator('h2')).toHaveCSS('font-family', /Amiri/);
      await axe(page);
      await sheet.locator('.add-form button[type="submit"]').click();

      await page.locator('.cart-bar').click();
      await expect(page.locator('.order-sheet')).toBeVisible();
      await axe(page);
      await page.locator('.order-sheet-footer .order-button').click();
      await expect(page.locator('.order-sheet-form')).toBeVisible();
      await axe(page);
    });
  }

  for (const status of ['PLACED', 'PREPARING', 'READY', 'COMPLETED', 'REJECTED'] as const) {
    test(`order page: ${status}`, async ({ page }) => {
      await mockRealtime(page, 'live');
      // The order carries no theme: the page takes it from the restaurant's menu.
      await serveMenu(page, menuFixture({ menuTheme: 'arabesque' }));
      await page.route('**/v1/public/orders/**', route => route.fulfill(json(orderFixture(status))));
      // A plan with ready alerts, so the alerts panel shows while the order is on its way.
      await page.route('**/v1/public/orders/*/alerts', route => route.fulfill(json({ readyAlerts: true, push: null })));
      await page.goto(restaurantUrl(`/order/${TOKEN}`));

      await expect(theme(page)).toHaveAttribute('data-menu-theme', 'arabesque');
      await expect(page.locator('.track-hero')).toHaveClass(new RegExp(`status-${status.toLowerCase()}`));
      if (status === 'PLACED' || status === 'PREPARING') await expect(page.locator('.track-alerts')).toBeVisible();
      if (status === 'READY') {
        await expect(page.locator('.track-hero')).toHaveCSS('background-color', GREEN);
        await expect(page.locator('.track-ready-icon')).toBeVisible();
      }
      await expect(page.locator('.track-header-band')).toHaveCSS('background-color', GREEN);
      await axe(page);
    });
  }
});
