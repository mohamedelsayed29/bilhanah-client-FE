import { expect, request as playwrightRequest, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import type { RestaurantTable, TableOccupancy } from '@bilhanah/contracts';
import { API_URL, DASHBOARD_ORIGIN, expectAccessible, registerOwner, uniqueSuffix } from './helpers';

test.describe.configure({ mode: 'serial' });

const suffix = uniqueSuffix();
const owner = { email: `merge-${suffix}@e2e-bilhanah.test`, password: 'Molokhia-Tuesday-2026', fullName: 'هبة الاختبار', restaurant: 'كافيه هبة', subdomain: `e2e-mrg-${suffix}` };

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

test('staff merge tables for a large party, see one group with its seats, and separate them', async () => {
  await registerOwner(page, owner);
  const login = await api.post(`${API_URL}/v1/auth/login`, { data: { email: owner.email, password: owner.password }, headers: { Origin: DASHBOARD_ORIGIN } });
  token = ((await login.json()) as { accessToken: string }).accessToken;
  for (const label of ['طاولة 1', 'طاولة 2', 'طاولة 3']) await ownerApi('POST', '/v1/tables', { label, seats: 4 });
  await page.goto('/tables');

  // Pick two tables in the merge dialog: their seats add up.
  await page.getByRole('button', { name: 'ادمج طاولات' }).click();
  const dialog = page.getByRole('dialog', { name: 'ادمج طاولات' });
  await expect(dialog.getByTestId('merge-submit')).toBeDisabled();
  await dialog.locator('[data-testid="merge-option"][data-label="طاولة 1"]').click();
  await dialog.locator('[data-testid="merge-option"][data-label="طاولة 2"]').click();
  await expect(dialog.getByTestId('merge-total')).toContainText('٨ كرسي');
  await dialog.getByLabel('اسم المجموعة').fill('عيلة منى');
  await expectAccessible(page, 'merge tables dialog');
  await dialog.getByTestId('merge-submit').click();
  await expect(dialog).toBeHidden();

  // One row for the group in the list, with both names and eight seats; a badge on both tables on the plan.
  const side = page.getByRole('complementary', { name: 'الطاولات والحجوزات' });
  const row = side.locator('[data-testid="table-item"].is-group');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('عيلة منى');
  await expect(row).toContainText('طاولة 1 + طاولة 2');
  await expect(row).toContainText('٨');
  await expect(side.getByTestId('table-item')).toHaveCount(2);
  const floor = page.getByTestId('floor-canvas');
  await expect(floor.locator('[data-testid="floor-spot"].is-grouped')).toHaveCount(2);
  await expect(floor.locator('.floor-spot-group').first()).toContainText('عيلة منى');
  const tables = await ownerApi<RestaurantTable[]>('GET', '/v1/tables');
  const [one, two] = [tables.find(table => table.label === 'طاولة 1')!, tables.find(table => table.label === 'طاولة 2')!];
  expect(one.groupId).not.toBeNull();
  expect(two.groupId).toBe(one.groupId);
  const rows = await ownerApi<TableOccupancy[]>('GET', '/v1/orders/floor');
  expect(rows.find(entry => entry.id === two.id)?.group).toMatchObject({ seats: 8, tableIds: expect.arrayContaining([one.id, two.id]) });

  // The details of a member say it is merged; the menu can only merge tables that are not merged yet.
  await row.locator('.tables-side-pick').click();
  await expect(page.getByTestId('table-group-note')).toContainText('طاولة 1 + طاولة 2');
  // Only one table is left unmerged: nothing to merge it with, so the button is gone.
  await expect(page.getByRole('button', { name: 'ادمج طاولات' })).toHaveCount(0);

  // Separate: two tables again, each with its four seats.
  await side.getByRole('button', { name: 'إجراءات عيلة منى' }).click();
  await page.getByRole('menuitem', { name: 'افصل الطاولات' }).click();
  await page.getByRole('dialog', { name: /تفصل عيلة منى/ }).getByRole('button', { name: 'افصلها' }).click();
  await expect(side.locator('[data-testid="table-item"].is-group')).toHaveCount(0);
  await expect(side.getByTestId('table-item')).toHaveCount(3);
  await expect(floor.locator('[data-testid="floor-spot"].is-grouped')).toHaveCount(0);
  expect((await ownerApi<RestaurantTable[]>('GET', '/v1/tables')).every(table => table.groupId === null && table.seats === 4)).toBe(true);
});
