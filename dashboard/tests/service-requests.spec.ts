import { expect, test } from '@playwright/test';
import type { OwnerRestaurant, RestaurantTable } from '@bilhanah/contracts';
import { API_URL, DASHBOARD_ORIGIN, expectAccessible, expectNoOverflow, registerOwner, screenshot, uniqueSuffix } from './helpers';

const suffix = uniqueSuffix();
const owner = { email: `service-${suffix}@e2e-bilhanah.test`, password: 'Molokhia-Tuesday-2026', fullName: 'هبة الاختبار', restaurant: 'كافيه هبة', subdomain: `e2e-svc-${suffix}` };

test.use({ viewport: { width: 1440, height: 900 } });

test('staff see table requests arrive live, take them through each step, and keep them in the history', async ({ page }) => {
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
  const garden = await call<{ id: string }>('POST', '/v1/table-areas', { name: 'الجنينة', theme: 'GARDEN', location: 'OUTDOOR' });
  const hall = await call<RestaurantTable>('POST', '/v1/tables', { label: 'ص1' });
  const outside = await call<RestaurantTable>('POST', '/v1/tables', { label: 'ج1', areaId: garden.id });
  const sessionOf = async (table: RestaurantTable) =>
    ((await (await page.request.post(`${API_URL}/v1/public/restaurants/${owner.subdomain}/tables/${table.publicCode}/session`, { data: {} })).json()) as { sessionToken: string }).sessionToken;
  const ask = (sessionToken: string, type: string, note?: string) => page.request.post(`${API_URL}/v1/public/service-requests`, { data: { sessionToken, type, ...(note && { note }) } });

  await page.goto('/service');
  await expect(page.getByRole('heading', { level: 1, name: 'طلبات الخدمة' })).toBeVisible();
  await expect(page.getByTestId('service-empty')).toBeVisible();

  // Two tables ask: the requests appear without a reload, with the badge on the navigation.
  const inside = await sessionOf(hall);
  const garden1 = await sessionOf(outside);
  expect((await ask(inside, 'CALL_WAITER')).ok()).toBe(true);
  expect((await ask(garden1, 'CUSTOM', 'كرسي أطفال')).ok()).toBe(true);
  const card = (table: string) => page.locator(`[data-testid="service-request"][data-table="${table}"]`);
  await expect(card('ص1')).toContainText('نادى على الويتر');
  await expect(card('ج1')).toContainText('كرسي أطفال');
  await expect(card('ج1')).toContainText('الجنينة');
  await expect(card('ص1')).toContainText('دلوقتي');
  await expect(page.locator('.sidebar').getByTestId('service-open-count')).toHaveText(/٢/);

  // Filters: area and type.
  await page.getByLabel('المنطقة').selectOption({ label: 'الجنينة' });
  await expect(page.getByTestId('service-request')).toHaveCount(1);
  await page.getByLabel('المنطقة').selectOption({ label: 'كل المناطق' });
  await page.getByLabel('النوع').selectOption({ label: 'نادى على الويتر' });
  await expect(page.getByTestId('service-request')).toHaveCount(1);
  await page.getByLabel('النوع').selectOption({ label: 'كل الأنواع' });
  await expectAccessible(page, 'service requests');
  await screenshot(page, 'service-requests-ar', false);

  // Assign the waiter call, then complete it; withdraw-free cancel of the other.
  await card('ص1').getByLabel('مين ماسك طلب ص1').selectOption({ label: owner.fullName });
  await expect(card('ص1')).toHaveAttribute('data-status', 'acknowledged');
  await card('ص1').getByRole('button', { name: 'جاري: ص1' }).click();
  await expect(card('ص1')).toHaveAttribute('data-status', 'in_progress');
  await expect(card('ص1').getByRole('button', { name: 'شُفته: ص1' })).toHaveCount(0);
  await card('ص1').getByRole('button', { name: 'خلص: ص1' }).click();
  await expect(card('ص1')).toHaveCount(0);
  await card('ج1').getByRole('button', { name: 'الغي: ج1' }).click();
  await expect(page.getByTestId('service-empty')).toBeVisible();
  await expect(page.locator('.sidebar').getByTestId('service-open-count')).toHaveCount(0);

  // Both stay in the history, with who handled them; the metrics count them.
  await page.getByRole('tab', { name: 'السجل' }).click();
  await expect(page.getByTestId('service-history-row')).toHaveCount(2);
  await expect(page.locator('[data-testid="service-history-row"][data-table="ص1"]')).toContainText('خلص');
  await expect(page.locator('[data-testid="service-history-row"][data-table="ص1"]')).toContainText(owner.fullName);
  await page.reload();
  await expect(page.getByTestId('service-metric-done')).toContainText('١');
  await expect(page.getByTestId('service-metric-open')).toContainText('٠');
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoOverflow(page, 'service requests 390');
});

test('owners switch requests off and set the throttling from the ordering settings', async ({ page }) => {
  const other = { ...owner, email: `service2-${suffix}@e2e-bilhanah.test`, subdomain: `e2e-svc2-${suffix}` };
  await registerOwner(page, other);
  await page.goto('/settings/ordering');
  const section = page.getByTestId('service-settings');
  await section.getByLabel('الانتظار قبل تكرار نفس الطلب').selectOption({ label: '٥ دقيقة' });
  await expect(page.getByText('اتحفظت التغييرات').first()).toBeVisible();
  await section.getByLabel('أقصى عدد طلبات للترابيزة في الساعة').selectOption({ label: '١٠' });
  await section.getByRole('switch').click();
  await expect(section.getByLabel('أقصى عدد طلبات للترابيزة في الساعة')).toHaveCount(0);
  const login = await page.request.post(`${API_URL}/v1/auth/login`, { data: { email: other.email, password: other.password }, headers: { Origin: DASHBOARD_ORIGIN } });
  const token = ((await login.json()) as { accessToken: string }).accessToken;
  const mine = (await (await page.request.get(`${API_URL}/v1/restaurants/mine`, { headers: { Authorization: `Bearer ${token}`, Origin: DASHBOARD_ORIGIN } })).json()) as OwnerRestaurant;
  expect(mine.serviceRequests).toEqual({ enabled: false, cooldownSeconds: 300, hourlyLimit: 10 });
});
