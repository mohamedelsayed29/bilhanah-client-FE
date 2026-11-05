import { randomUUID } from 'node:crypto';
import { expect, request as playwrightRequest, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import type { OwnerOrder, OwnerRestaurant, PublicMenuResponse, RestaurantTable, TableOccupancy } from '@bilhanah/contracts';
import { API_URL, DASHBOARD_ORIGIN, expectAccessible, registerOwner, uniqueSuffix } from './helpers';

test.describe.configure({ mode: 'serial' });

const suffix = uniqueSuffix();
const owner = { email: `move-${suffix}@e2e-bilhanah.test`, password: 'Molokhia-Tuesday-2026', fullName: 'هبة الاختبار', restaurant: 'كافيه هبة', subdomain: `e2e-mov-${suffix}` };

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

test('staff move an order to another table from the board and from the bill, and both tables follow', async () => {
  await registerOwner(page, owner);
  const login = await api.post(`${API_URL}/v1/auth/login`, { data: { email: owner.email, password: owner.password }, headers: { Origin: DASHBOARD_ORIGIN } });
  token = ((await login.json()) as { accessToken: string }).accessToken;
  const restaurant = await ownerApi<OwnerRestaurant>('GET', '/v1/restaurants/mine');
  test.skip(!restaurant.ordering.included, 'The trial plan of this environment has no ordering.');
  await ownerApi('PATCH', '/v1/restaurants/mine', { orderingEnabled: true, acceptsDineIn: true });
  const category = await ownerApi<{ id: string }>('POST', '/v1/menu/categories', { nameAr: 'مشروبات' });
  await ownerApi('POST', '/v1/menu/items', { categoryId: category.id, nameAr: 'لاتيه', variants: [{ pricePiastres: 7_500 }] });
  for (const label of ['T1', 'T2', 'T3']) await ownerApi('POST', '/v1/tables', { label });
  const tables = await ownerApi<RestaurantTable[]>('GET', '/v1/tables');
  const named = (label: string) => tables.find(table => table.label === label)!;
  const menu = (await (await api.get(`${API_URL}/v1/public/restaurants/${owner.subdomain}/menu`)).json()) as PublicMenuResponse;
  const latte = menu.categories[0]!.items[0]!;
  const placed = await api.post(`${API_URL}/v1/public/restaurants/${owner.subdomain}/orders`, {
    headers: { 'Idempotency-Key': randomUUID() },
    data: { type: 'DINE_IN', tableCode: named('T1').publicCode, customerName: 'زبون', items: [{ menuItemId: latte.id, variantId: latte.variants[0]!.id, quantity: 2, note: 'من غير سكر' }] },
  });
  expect(placed.status()).toBe(201);

  // From the board: the card offers to change the table; only free tables are listed.
  await page.goto('/orders');
  await page.getByTestId('order-move').first().click();
  const dialog = page.getByRole('dialog', { name: /انقل الطلب/ });
  const select = dialog.getByTestId('transfer-table');
  await expect(select.locator('option')).toHaveCount(3);
  await expect(select.locator(`option[value="${named('T1').id}"]`)).toHaveCount(0);
  await select.selectOption(named('T2').id);
  await dialog.getByLabel('السبب').fill('عايزين جنب الشباك');
  await expectAccessible(page, 'move order dialog');
  await dialog.getByTestId('transfer-submit').click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('الطلب اتنقل من T1 لـT2')).toBeVisible();

  const floor = () => ownerApi<TableOccupancy[]>('GET', '/v1/orders/floor');
  await expect.poll(async () => (await floor()).find(row => row.id === named('T2').id)?.status).toBe('OCCUPIED');
  expect((await floor()).find(row => row.id === named('T1').id)?.status).toBe('CLEANING');

  // From the table's bill: move it again; the table being cleaned is not offered.
  await page.goto('/tables');
  const side = page.getByRole('complementary', { name: 'الطاولات والحجوزات' });
  await side.getByRole('button', { name: 'إجراءات T2', exact: true }).click();
  await page.getByRole('menuitem', { name: 'الحساب وفضّي الترابيزة' }).click();
  await page.getByRole('button', { name: /^انقل الطلب/ }).click();
  await expect(select.locator('option')).toHaveCount(2);
  await select.selectOption(named('T3').id);
  await dialog.getByTestId('transfer-submit').click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('floor-canvas').locator(`[data-testid="floor-spot"][data-label="T3"]`)).toHaveAttribute('data-status', 'occupied');
  await expect(page.getByTestId('floor-canvas').locator(`[data-testid="floor-spot"][data-label="T2"]`)).toHaveAttribute('data-status', 'cleaning');

  // The order kept everything, and its history has both moves with who made them.
  const [order] = (await ownerApi<{ items: OwnerOrder[] }>('GET', '/v1/orders?view=active')).items;
  expect(order).toMatchObject({ tableLabel: 'T3', subtotalPiastres: 15_000, items: [expect.objectContaining({ quantity: 2, note: 'من غير سكر' })] });
  expect(order!.transfers.map(move => [move.fromTableLabel, move.toTableLabel, move.actorName])).toEqual([['T1', 'T2', owner.fullName], ['T2', 'T3', owner.fullName]]);
  expect(order!.transfers[0]!.reason).toBe('عايزين جنب الشباك');
});
