import { test, expect, request, type APIRequestContext } from '@playwright/test';
import type { PublicMenuItem, PublicMenuResponse } from '@bilhanah/contracts';

// Order tracking end to end against the running dev stack (API on 127.0.0.1:3000, seeded demo
// restaurant koshary-demo): a diner places an order and follows it while the restaurant accepts it
// with a preparation time, prepares it and marks it ready, and a reload restores the latest state;
// a second order is cancelled and shows its final state. Skipped when the API is not running.
const API = process.env['E2E_API_URL'] ?? 'http://127.0.0.1:3000';
const DASHBOARD_ORIGIN = 'http://127.0.0.1:5174';
const port = Number(process.env['WEB_E2E_PORT'] ?? 5173);
const menuUrl = (path = '/') => `http://koshary-demo.localhost:${port}${path}`;

let owner: APIRequestContext | null = null;
let dish: PublicMenuItem | null = null;

test.beforeAll(async () => {
  const probe = await request.newContext();
  const menu = await probe.get(`${API}/v1/public/restaurants/koshary-demo/menu`).then(async response => (response.ok() ? (await response.json()) as PublicMenuResponse : null), () => null);
  await probe.dispose();
  if (!menu || !('ordering' in menu.restaurant) || !menu.restaurant.ordering.accepting || !menu.restaurant.ordering.pickup) return;
  dish = menu.categories.flatMap(category => category.items).find(item => item.isAvailable) ?? null;
  const login = await request.newContext({ extraHTTPHeaders: { Origin: DASHBOARD_ORIGIN } });
  const session = await login.post(`${API}/v1/auth/login`, { data: { email: 'demo-owner@bilhanah.local', password: 'demo-password-1' } });
  expect(session.ok(), await session.text()).toBe(true);
  const { accessToken } = await session.json() as { accessToken: string };
  await login.dispose();
  owner = await request.newContext({ extraHTTPHeaders: { Origin: DASHBOARD_ORIGIN, Authorization: `Bearer ${accessToken}` } });
});

test.afterAll(async () => { await owner?.dispose(); });

test.beforeEach(async ({ page }) => {
  test.skip(!owner || !dish, 'The dev API is not running, or the demo restaurant takes no pickup orders.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('bilhanah:language:v1', 'ar'));
});

/** Places a pickup order as a diner; returns its tracking token and id (from the owner's board). */
async function placeOrder(name: string) {
  const diner = await request.newContext();
  const response = await diner.post(`${API}/v1/public/restaurants/koshary-demo/orders`, {
    headers: { 'Idempotency-Key': `e2e-track-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
    data: { type: 'PICKUP', customerName: name, customerPhone: '01098765432', items: [{ menuItemId: dish!.id, variantId: dish!.variants[0]!.id, quantity: 1 }] },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const { trackingToken, order } = await response.json() as { trackingToken: string; order: { number: number } };
  await diner.dispose();
  const board = await (await owner!.get(`${API}/v1/orders?view=active&pageSize=100`)).json() as { items: { id: string; number: number; customerName: string }[] };
  const id = board.items.find(entry => entry.number === order.number && entry.customerName === name)!.id;
  return { trackingToken, id };
}

const move = async (id: string, data: Record<string, unknown>) => {
  const response = await owner!.patch(`${API}/v1/orders/${id}/status`, { data });
  expect(response.ok(), await response.text()).toBe(true);
};

test('a diner follows the order live, sees when to expect it, and a reload keeps the latest state', async ({ page }) => {
  const placed = await placeOrder('متابعة الطلب');
  await page.goto(menuUrl(`/order/${encodeURIComponent(placed.trackingToken)}`));
  const status = page.locator('#track-status');
  await expect(status).toHaveText('وصل طلبك للمطعم');
  await expect(page.locator('.track-live')).toHaveClass(/is-live/);
  await expect(page.getByTestId('track-estimate')).toHaveCount(0);

  // Accepted with 20 minutes: the estimate appears without a reload.
  await move(placed.id, { status: 'ACCEPTED', prepMinutes: 20 });
  await expect(status).toHaveText('المطعم أكّد طلبك');
  await expect(page.getByTestId('track-estimate')).toContainText('متوقع يجهز حوالي');
  await expect(page.getByTestId('track-estimate')).toContainText(/خلال (١٩|٢٠) دقيقة/);

  await move(placed.id, { status: 'PREPARING' });
  await expect(status).toHaveText('طلبك بيتحضّر');
  // The preparing step now has its time, from the order's history.
  await expect(page.locator('.track-step.current time')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/screens/order-tracking-preparing-ar.png', fullPage: true });

  await move(placed.id, { status: 'READY' });
  await expect(status).toHaveText('طلبك جاهز!');
  await expect(page.getByTestId('track-estimate')).toHaveCount(0);
  await page.reload();
  await expect(status).toHaveText('طلبك جاهز!');
  await expect(page.locator('.track-step.done')).toHaveCount(3);
  await move(placed.id, { status: 'COMPLETED' });
  await expect(status).toHaveText('بالهنا والشفا!');
});

test('a cancelled order shows a clear final state with the reason', async ({ page }) => {
  const placed = await placeOrder('طلب اتلغى');
  await page.goto(menuUrl(`/order/${encodeURIComponent(placed.trackingToken)}`));
  await expect(page.locator('#track-status')).toHaveText('وصل طلبك للمطعم');
  await move(placed.id, { status: 'ACCEPTED' });
  await move(placed.id, { status: 'CANCELLED', reason: 'الصنف خلص' });
  await expect(page.locator('#track-status')).toHaveText('الطلب اتلغى');
  await expect(page.locator('.track-reason')).toContainText('الصنف خلص');
  await expect(page.locator('.track-timeline')).toHaveCount(0);
  await expect(page.locator('.track-live')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#track-status')).toHaveText('الطلب اتلغى');
});

test('a forged tracking link finds no order', async ({ page }) => {
  await page.goto(menuUrl('/order/AAAAAAAAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBB'));
  await expect(page.getByRole('heading', { name: 'مش لاقيين الطلب ده' })).toBeVisible();
});
