import { randomUUID } from 'node:crypto';
import { expect, request as playwrightRequest, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import type { OwnerRestaurant, PublicMenuResponse, RestaurantTable, TableArea } from '@bilhanah/contracts';
import { API_URL, DASHBOARD_ORIGIN, expectAccessible, registerOwner, uniqueSuffix } from './helpers';

test.describe.configure({ mode: 'serial' });

const suffix = uniqueSuffix();
const owner = { email: `tstats-${suffix}@e2e-bilhanah.test`, password: 'Molokhia-Tuesday-2026', fullName: 'هبة الاختبار', restaurant: 'كافيه هبة', subdomain: `e2e-tst-${suffix}` };

let context: BrowserContext;
let page: Page;
let api: APIRequestContext;
let token = '';

async function ownerApi<T>(method: 'GET' | 'POST' | 'PATCH', path: string, data?: unknown): Promise<T> {
  const response = await api.fetch(`${API_URL}${path}`, { method, data, headers: { Authorization: `Bearer ${token}`, Origin: DASHBOARD_ORIGIN } });
  expect(response.ok(), `${method} ${path}: ${response.status()} ${await response.text()}`).toBe(true);
  return (await response.json().catch(() => null)) as T;
}

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();
  api = await playwrightRequest.newContext();
});
test.afterAll(async () => {
  await context.close();
  await api.dispose();
});

test('owners see each table’s use, revenue and scans, by period and area', async () => {
  await registerOwner(page, owner);
  const login = await api.post(`${API_URL}/v1/auth/login`, { data: { email: owner.email, password: owner.password }, headers: { Origin: DASHBOARD_ORIGIN } });
  token = ((await login.json()) as { accessToken: string }).accessToken;
  const restaurant = await ownerApi<OwnerRestaurant>('GET', '/v1/restaurants/mine');
  test.skip(!restaurant.ordering.included, 'The trial plan of this environment has no ordering.');
  await ownerApi('PATCH', '/v1/restaurants/mine', { orderingEnabled: true, acceptsDineIn: true });
  const category = await ownerApi<{ id: string }>('POST', '/v1/menu/categories', { nameAr: 'مشروبات' });
  await ownerApi('POST', '/v1/menu/items', { categoryId: category.id, nameAr: 'لاتيه', variants: [{ pricePiastres: 7_500 }] });
  const garden = await ownerApi<TableArea>('POST', '/v1/table-areas', { name: 'الجنينة', location: 'OUTDOOR' });
  await ownerApi('POST', '/v1/tables', { label: 'T1', areaId: garden.id });
  await ownerApi('POST', '/v1/tables', { label: 'T2' });
  const tables = await ownerApi<RestaurantTable[]>('GET', '/v1/tables');
  const t1 = tables.find(table => table.label === 'T1')!;
  const menu = (await (await api.get(`${API_URL}/v1/public/restaurants/${owner.subdomain}/menu`)).json()) as PublicMenuResponse;
  const latte = menu.categories[0]!.items[0]!;
  // A guest scans T1's code, orders two lattes, and pays.
  expect((await api.get(`${API_URL}/v1/public/restaurants/${owner.subdomain}/tables/${t1.publicCode}`)).ok()).toBe(true);
  const placed = await api.post(`${API_URL}/v1/public/restaurants/${owner.subdomain}/orders`, {
    headers: { 'Idempotency-Key': randomUUID() },
    data: { type: 'DINE_IN', tableCode: t1.publicCode, customerName: 'زبون', items: [{ menuItemId: latte.id, variantId: latte.variants[0]!.id, quantity: 2 }] },
  });
  expect(placed.status()).toBe(201);
  await ownerApi('POST', `/v1/orders/tables/${t1.id}/settle`, {});

  // From the insights page to the table insights.
  await page.goto('/insights');
  await page.getByTestId('table-insights-link').click();
  await expect(page).toHaveURL(/\/insights\/tables$/);
  await expect(page.getByTestId('now-total')).toContainText('٢');
  await expect(page.getByTestId('now-cleaning')).toContainText('١');
  await expect(page.getByTestId('kpi-seatings')).toContainText('١');
  await expect(page.getByTestId('kpi-revenue')).toContainText('١٥٠');
  await expect(page.getByTestId('kpi-scans')).toContainText('١');
  const row = page.locator('[data-testid="table-insights-row"][data-label="T1"]');
  await expect(row).toContainText('١٥٠');
  await expect(page.locator('[data-testid="table-insights-row"]').first()).toHaveAttribute('data-label', 'T1');
  await expect(page.getByRole('region', { name: 'الطاولات الأكتر استخدامًا' })).toContainText('T1');
  await expectAccessible(page, 'table insights');

  // By area: the garden has T1 only; tables in no area, T2 only.
  await page.getByLabel('المنطقة').selectOption({ label: 'الجنينة' });
  await expect(page.locator('[data-testid="table-insights-row"]')).toHaveCount(1);
  await page.getByLabel('المنطقة').selectOption({ label: 'بدون منطقة' });
  await expect(page.locator('[data-testid="table-insights-row"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="table-insights-row"]').first()).toHaveAttribute('data-label', 'T2');
  await page.getByLabel('المنطقة').selectOption({ label: 'كل المناطق' });
  // A period before anything happened has nothing.
  await page.getByRole('textbox', { name: 'من', exact: true }).fill('2025-01-01');
  await page.getByRole('textbox', { name: 'لحد', exact: true }).fill('2025-01-01');
  await expect(page.getByTestId('kpi-seatings')).toContainText('٠');
});
