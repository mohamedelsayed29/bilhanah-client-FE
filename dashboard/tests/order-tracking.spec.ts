import { expect, test } from '@playwright/test';
import type { OwnerRestaurant, PublicMenuResponse } from '@bilhanah/contracts';
import { API_URL, DASHBOARD_ORIGIN, expectAccessible, registerOwner, screenshot, uniqueSuffix } from './helpers';

const suffix = uniqueSuffix();
const owner = { email: `tracking-${suffix}@e2e-bilhanah.test`, password: 'Molokhia-Tuesday-2026', fullName: 'كريم الاختبار', restaurant: 'مطعم كريم', subdomain: `e2e-track-${suffix}` };

test.use({ viewport: { width: 1440, height: 900 } });

test('staff accept with a preparation time, the history records who moved the order, and insights count tracking', async ({ page }) => {
  await registerOwner(page, owner);
  const login = await page.request.post(`${API_URL}/v1/auth/login`, { data: { email: owner.email, password: owner.password }, headers: { Origin: DASHBOARD_ORIGIN } });
  const token = ((await login.json()) as { accessToken: string }).accessToken;
  const call = async <T>(method: 'GET' | 'POST' | 'PATCH', path: string, data?: unknown): Promise<T> => {
    const response = await page.request.fetch(`${API_URL}${path}`, { method, data, headers: { Authorization: `Bearer ${token}`, Origin: DASHBOARD_ORIGIN } });
    expect(response.ok(), `${method} ${path}: ${response.status()} ${await response.text()}`).toBe(true);
    return (await response.json()) as T;
  };
  const restaurant = await call<OwnerRestaurant>('GET', '/v1/restaurants/mine');
  test.skip(!restaurant.ordering.included, 'The trial plan of this environment has no ordering.');
  await call('PATCH', '/v1/restaurants/mine', { orderingEnabled: true, acceptsPickup: true });
  const category = await call<{ id: string }>('POST', '/v1/menu/categories', { nameAr: 'مشويات' });
  await call('POST', '/v1/menu/items', { categoryId: category.id, nameAr: 'كفتة', variants: [{ pricePiastres: 15_000 }] });
  const menu = (await (await page.request.get(`${API_URL}/v1/public/restaurants/${owner.subdomain}/menu`)).json()) as PublicMenuResponse;
  const kofta = menu.categories[0]!.items[0]!;
  const place = async (name: string) => {
    const response = await page.request.post(`${API_URL}/v1/public/restaurants/${owner.subdomain}/orders`, {
      headers: { 'Idempotency-Key': `track-${suffix}-${Date.now()}` },
      data: { type: 'PICKUP', customerName: name, customerPhone: '01098765432', items: [{ menuItemId: kofta.id, variantId: kofta.variants[0]!.id, quantity: 1 }] },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { trackingToken: string }).trackingToken;
  };

  // The usual preparation time, from the ordering settings.
  await page.goto('/settings/ordering');
  await page.getByTestId('prep-settings').getByLabel('الطلب بيجهز عادةً خلال').selectOption({ label: '٢٠ دقيقة' });
  await expect.poll(async () => (await call<OwnerRestaurant>('GET', '/v1/restaurants/mine')).orderPrepMinutes).toBe(20);

  const tracking = await place('منى');
  await page.goto('/orders');
  const card = page.getByTestId('order-1');
  const prep = card.getByLabel('يجهز خلال');
  await expect(prep.locator('option:checked')).toHaveText('٢٠ دقيقة (المعتاد)');
  await prep.selectOption({ label: '٣٠ دقيقة' });
  await expectAccessible(page, 'order board with preparation time');
  await card.getByRole('button', { name: 'اقبل الطلب' }).click();
  await expect(card.getByTestId('order-estimate')).toContainText('الزبون مستنيه');
  await expect(card.getByLabel('يجهز خلال')).toHaveCount(0);
  await screenshot(page, 'order-tracking-board-ar', false);
  const tracked = (await (await page.request.get(`${API_URL}/v1/public/orders/${tracking}`)).json()) as { estimatedReadyAt: string; placedAt: string };
  const minutes = (new Date(tracked.estimatedReadyAt).getTime() - Date.now()) / 60_000;
  expect(minutes).toBeGreaterThan(28);
  expect(minutes).toBeLessThanOrEqual(30);

  await card.getByRole('button', { name: 'ابدأ التحضير' }).click();
  await card.getByRole('button', { name: 'جاهز' }).click();
  await card.getByRole('button', { name: 'اتسلّم' }).click();
  await expect(card).toHaveCount(0);

  // The order's history: every step, when, and who.
  await page.goto('/orders/history');
  await page.getByRole('button', { name: /التفاصيل: طلب/ }).first().click();
  const details = page.getByRole('dialog');
  const steps = details.getByTestId('order-history-step');
  await expect(steps).toHaveCount(5);
  await expect(steps.first()).toContainText('الزبون');
  await expect(steps.nth(1)).toContainText(owner.fullName);
  await expect(steps.last()).toContainText('اتسلّم');
  await expect(details).toContainText('كان متوقع يجهز');
  await expectAccessible(page, 'order details history');
  await screenshot(page, 'order-tracking-history-ar', false);
  await details.getByRole('button', { name: 'إغلاق' }).first().click();

  // Insights: the tracking read above counts as the diner opening the page; it was ready on time.
  await page.goto('/insights');
  const insights = page.getByTestId('tracking-insights');
  await expect(insights).toBeVisible();
  await expect(insights.getByTestId('tracking-on-time')).toContainText('١٠٠');
  await expect(insights.getByTestId('tracking-tracking')).toContainText('١٠٠');
  await expectAccessible(page, 'insights tracking');
});
