import { test, expect, type Page } from '@playwright/test';
import { json, menuFixture, restaurantUrl, serveMenu, TOKEN } from './ordering-fixtures';

// Menu visits: one POST per restaurant per browser session, with how the diner arrived.
const VISITS = '**/v1/public/restaurants/koshary/visits';
const NO_ORDERING = { ordering: { accepting: false, dineIn: false, pickup: false } };

async function countVisits(page: Page, status = 204) {
  const visits: { source: unknown; method: string }[] = [];
  await page.route(VISITS, route => {
    const request = route.request();
    visits.push({ source: (request.postDataJSON() as { source?: unknown }).source, method: request.method() });
    return route.fulfill(status === 204 ? { status, headers: { 'access-control-allow-origin': '*' } } : json({ error: { code: 'X', message: 'X' } }, status));
  });
  return visits;
}

test('a QR scan counts once per session as qr, and src leaves the address bar', async ({ page }) => {
  await serveMenu(page, menuFixture(NO_ORDERING));
  const visits = await countVisits(page);
  await page.goto(restaurantUrl('/?src=qr&utm=menu'));
  await expect(page.getByRole('heading', { level: 1, name: 'كشري أبو طارق' })).toBeVisible();
  await expect.poll(() => visits.length).toBe(1);
  expect(visits[0]!.source).toBe('qr');
  await expect(page).toHaveURL(restaurantUrl('/?utm=menu'));

  // Reloads and shared links in the same session are not new visits.
  await page.reload();
  await page.goto(restaurantUrl('/?src=qr'));
  await expect(page.getByRole('heading', { level: 1, name: 'كشري أبو طارق' })).toBeVisible();
  await expect(page).toHaveURL(restaurantUrl('/'));
  await page.waitForTimeout(500);
  expect(visits).toHaveLength(1);
});

test('a table QR counts as table and keeps its code; a plain link counts as link', async ({ page, context }) => {
  await serveMenu(page, menuFixture(NO_ORDERING));
  const visits = await countVisits(page);
  await page.goto(restaurantUrl('/?t=T5&src=qr'));
  await expect.poll(() => visits.length).toBe(1);
  expect(visits[0]!.source).toBe('table');
  await expect(page).toHaveURL(restaurantUrl('/?t=T5'));

  // A new browser session (another tab starts with empty sessionStorage).
  const other = await context.newPage();
  await serveMenu(other, menuFixture(NO_ORDERING));
  const otherVisits = await countVisits(other);
  await other.goto(restaurantUrl('/'));
  await expect.poll(() => otherVisits.length).toBe(1);
  expect(otherVisits[0]!.source).toBe('link');
});

test('a failing visit request never affects the menu', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await serveMenu(page, menuFixture());
  const visits = await countVisits(page, 500);
  await page.goto(restaurantUrl('/?src=qr'));
  await expect(page.getByRole('heading', { level: 1, name: 'كشري أبو طارق' })).toBeVisible();
  await expect.poll(() => visits.length).toBe(1);
  await expect(page.locator('.dish-card').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('order tracking pages and the marketing site do not count visits', async ({ page }) => {
  const visitRequests: string[] = [];
  page.on('request', request => { if (/\/visits(\?|$)/.test(request.url())) visitRequests.push(request.url()); });
  await page.route(`**/v1/public/orders/${TOKEN}**`, route => route.fulfill(json({ error: { code: 'ORDER_NOT_FOUND', message: 'x' } }, 404)));
  await page.routeWebSocket(/\/v1\/realtime\//, ws => { void ws.close({ code: 1011 }); });
  await serveMenu(page, menuFixture());
  await page.goto(restaurantUrl(`/order/${TOKEN}?src=qr`));
  await expect(page.getByRole('heading', { name: 'مش لاقيين الطلب ده' })).toBeVisible();
  await page.goto('/?src=qr');
  await page.goto('/products?item=stand&src=qr');
  await expect(page.getByRole('heading', { level: 1, name: 'حامل على ذوق براندك.' })).toBeVisible();
  await page.waitForTimeout(500);
  expect(visitRequests).toEqual([]);
});
