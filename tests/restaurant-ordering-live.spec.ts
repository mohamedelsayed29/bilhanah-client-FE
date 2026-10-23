import { test, expect, request, type APIRequestContext } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// End to end against the running dev stack (API on 127.0.0.1:3000, seeded demo restaurant).
// Skipped when the API is not running. Places one real order per run: the public place-order
// limit is 20 per 10 minutes per IP, and owner login 5 per 15 minutes, so this logs in once.
const API = process.env['E2E_API_URL'] ?? 'http://127.0.0.1:3000';
const DASHBOARD_ORIGIN = 'http://127.0.0.1:5174';
const port = Number(process.env['WEB_E2E_PORT'] ?? 5173);
const review = fileURLToPath(new URL('../test-results/review/ordering/', import.meta.url));

let owner: APIRequestContext | null = null;
let tableCode = '';

test.beforeAll(async () => {
  const probe = await request.newContext();
  const up = await probe.get(`${API}/v1/public/restaurants/koshary-demo/menu`).then(response => response.ok(), () => false);
  await probe.dispose();
  if (!up) return;
  const login = await request.newContext({ extraHTTPHeaders: { Origin: DASHBOARD_ORIGIN } });
  const session = await login.post(`${API}/v1/auth/login`, { data: { email: 'demo-owner@bilhanah.local', password: 'demo-password-1' } });
  expect(session.ok(), await session.text()).toBe(true);
  const { accessToken } = await session.json() as { accessToken: string };
  await login.dispose();
  owner = await request.newContext({ extraHTTPHeaders: { Origin: DASHBOARD_ORIGIN, Authorization: `Bearer ${accessToken}` } });
  const tables = await (await owner.get(`${API}/v1/tables`)).json() as { publicCode: string; isActive: boolean }[] | { items: { publicCode: string; isActive: boolean }[] };
  const table = (Array.isArray(tables) ? tables : tables.items).find(candidate => candidate.isActive);
  expect(table, 'the demo restaurant needs an active table').toBeTruthy();
  tableCode = table!.publicCode;
});

test.afterAll(async () => { await owner?.dispose(); });

test('a diner orders at a table and watches the kitchen move it along live', async ({ page }) => {
  test.skip(!owner, 'The dev API is not running.');
  test.setTimeout(90_000);
  await mkdir(review, { recursive: true });
  const customerName = `E2E ${Date.now().toString(36)}`;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => { if (!localStorage.getItem('bilhanah:language:v1')) localStorage.setItem('bilhanah:language:v1', 'ar'); });

  await page.goto(`http://koshary-demo.localhost:${port}/?t=${tableCode}`);
  await expect(page.locator('.table-badge')).toBeVisible();
  await page.getByRole('button', { name: 'أضف ليمون نعناع للطلب' }).click();
  await page.getByRole('button', { name: 'أضف كشري أبو طارق للطلب' }).click();
  const sheet = page.getByRole('dialog', { name: 'كشري أبو طارق' });
  await sheet.getByRole('button', { name: 'زوّد الكمية' }).click();
  await sheet.getByRole('button', { name: /أضف للطلب/ }).click();
  await expect(page.locator('.cart-bar')).toContainText('٣');

  await page.locator('.cart-bar').click();
  await page.getByRole('button', { name: /كمّل الطلب/ }).click();
  await expect(page.getByRole('radio', { name: 'في المطعم' })).toBeChecked();
  await expect(page.locator('.table-confirm')).toBeVisible();
  await page.getByLabel('اسمك', { exact: true }).fill(customerName);
  await page.getByRole('button', { name: /ابعت الطلب/ }).click();

  await expect(page).toHaveURL(/\/order\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).toHaveText('وصل طلبك للمطعم');
  await expect(page.locator('.track-live')).toHaveText('تحديث مباشر');

  const board = await (await owner!.get(`${API}/v1/orders?view=active`)).json() as { items: { id: string; customerName: string; tableLabel: string | null }[] };
  const order = board.items.find(candidate => candidate.customerName === customerName);
  expect(order, 'the order is on the restaurant board').toBeTruthy();
  expect(order!.tableLabel).toBeTruthy();

  const advance = async (status: string) => {
    const response = await owner!.patch(`${API}/v1/orders/${order!.id}/status`, { data: { status } });
    expect(response.ok(), await response.text()).toBe(true);
  };
  await advance('ACCEPTED');
  await expect(heading).toHaveText('المطعم أكّد طلبك');
  await advance('PREPARING');
  await expect(heading).toHaveText('طلبك بيتحضّر');
  await advance('READY');
  await expect(heading).toHaveText('طلبك جاهز!');
  await expect(page.locator('.track-hero')).toHaveClass(/status-ready/);
  await page.screenshot({ path: `${review}/live-ready-390-ar.png`, fullPage: true });

  // Deep links survive a reload.
  await page.reload();
  await expect(heading).toHaveText('طلبك جاهز!');
  await advance('COMPLETED');
  await expect(heading).toHaveText('بالهنا والشفا!');
});
