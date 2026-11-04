import { randomUUID } from 'node:crypto';
import { expect, request as playwrightRequest, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import type { OwnerRestaurant, PublicMenuResponse, RestaurantTable } from '@bilhanah/contracts';
import { API_URL, DASHBOARD_ORIGIN, expectAccessible, expectNoOverflow, registerOwner, screenshot, uniqueSuffix } from './helpers';

// One owner per run (registrations are rate-limited per IP) and two public orders.
test.describe.configure({ mode: 'serial' });

const suffix = uniqueSuffix();
const owner = { email: `floor-${suffix}@e2e-bilhanah.test`, password: 'Molokhia-Tuesday-2026', fullName: 'هبة الاختبار', restaurant: 'كافيه هبة', subdomain: `e2e-flr-${suffix}` };

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
  context = await browser.newContext();
  page = await context.newPage();
  api = await playwrightRequest.newContext();
});
test.afterAll(async () => {
  await context.close();
  await api.dispose();
});

test('an owner with ordering switched on', async () => {
  await registerOwner(page, owner);
  const login = await api.post(`${API_URL}/v1/auth/login`, { data: { email: owner.email, password: owner.password }, headers: { Origin: DASHBOARD_ORIGIN } });
  expect(login.ok()).toBe(true);
  token = ((await login.json()) as { accessToken: string }).accessToken;
  const restaurant = await ownerApi<OwnerRestaurant>('GET', '/v1/restaurants/mine');
  test.skip(!restaurant.ordering.included, 'The trial plan of this environment has no ordering.');
  await ownerApi('PATCH', '/v1/restaurants/mine', { orderingEnabled: true, acceptsDineIn: true });
  const category = await ownerApi<{ id: string }>('POST', '/v1/menu/categories', { nameAr: 'مشروبات', nameEn: 'Drinks' });
  await ownerApi('POST', '/v1/menu/items', { categoryId: category.id, nameAr: 'لاتيه', nameEn: 'Latte', variants: [{ pricePiastres: 7_500 }] });
});

test('tables keep the shape and seats the owner picks, and the floor draws them', async () => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/tables');

  // A round table for two, from the add dialog.
  await page.getByRole('button', { name: 'ضيف طاولة' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('اسم الطاولة').fill('الشباك');
  await dialog.getByRole('radio', { name: 'مدورة' }).check();
  await dialog.getByRole('button', { name: 'فرد أقل' }).click();
  await dialog.getByRole('button', { name: 'فرد أقل' }).click();
  await expect(dialog.getByLabel('عدد الأفراد')).toHaveValue('2');
  await expect(dialog.locator('.table-chair')).toHaveCount(2);
  await expectAccessible(page, 'add table dialog');
  await screenshot(page, 'tables-add-shape-ar', false);
  await dialog.getByRole('button', { name: 'ضيف', exact: true }).click();
  await expect(page.locator('[data-testid="floor-spot"][data-label="الشباك"] .table-chair')).toHaveCount(2);

  // Four long family tables for eight at once.
  await page.getByRole('button', { name: 'ضيف كذا طاولة' }).first().click();
  await dialog.getByLabel('الاسم قبل الرقم').fill('عائلي');
  await dialog.getByLabel('لحد رقم').fill('4');
  await dialog.getByRole('radio', { name: 'مستطيلة' }).check();
  await dialog.getByLabel('عدد الأفراد').fill('8');
  await dialog.getByLabel('عدد الأفراد').blur();
  await expect(dialog.locator('.table-chair')).toHaveCount(8);
  await dialog.getByRole('button', { name: /ضيف/ }).last().click();
  await expect(page.getByTestId('table-item')).toHaveCount(5);

  // Pick one on the plan: its details show; edit it to a square VIP table for six with a minimum order.
  await page.locator('[data-testid="floor-spot"][data-label="عائلي 2"]').click();
  const details = page.getByTestId('table-details');
  await expect(details.getByRole('heading', { name: 'عائلي 2' })).toBeVisible();
  await expect(page.locator('[data-testid="table-item"][data-label="عائلي 2"] .tables-side-pick')).toHaveAttribute('aria-pressed', 'true');
  await details.getByRole('button', { name: 'تعديل الطاولة' }).click();
  await dialog.getByRole('radio', { name: 'مربعة' }).check();
  await dialog.getByRole('button', { name: 'فرد أقل' }).click();
  await dialog.getByRole('button', { name: 'فرد أقل' }).click();
  await dialog.getByLabel('أقل طلب (ج.م)').fill('500');
  await dialog.getByLabel('ملاحظات').fill('جنب الشباك');
  await dialog.getByRole('button', { name: 'VIP', exact: true }).click();
  await expectAccessible(page, 'edit table dialog');
  await dialog.getByRole('button', { name: 'احفظ' }).click();
  await expect(dialog).toBeHidden();
  await expect(details).toContainText('٥٠٠');
  await expect(details).toContainText('جنب الشباك');
  await expect(details).toContainText('VIP');
  await expect(details).toContainText('٦ أفراد');

  const saved = await ownerApi<RestaurantTable[]>('GET', '/v1/tables');
  expect(saved.map(table => [table.label, table.shape, table.seats])).toEqual([
    ['الشباك', 'ROUND', 2], ['عائلي 1', 'RECTANGLE', 8], ['عائلي 2', 'SQUARE', 6], ['عائلي 3', 'RECTANGLE', 8], ['عائلي 4', 'RECTANGLE', 8],
  ]);
  expect(saved[2]).toMatchObject({ minOrderPiastres: 50_000, notes: 'جنب الشباك', attributes: ['VIP'] });

  // Guests at two tables, and a booking on a third.
  const menu = (await (await api.get(`${API_URL}/v1/public/restaurants/${owner.subdomain}/menu`)).json()) as PublicMenuResponse;
  const latte = menu.categories[0]!.items[0]!;
  for (const table of [saved[0]!, saved[2]!]) {
    const response = await fetch(`${API_URL}/v1/public/restaurants/${owner.subdomain}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
      body: JSON.stringify({ type: 'DINE_IN', tableCode: table.publicCode, customerName: 'زبون', items: [{ menuItemId: latte.id, variantId: latte.variants[0]!.id, quantity: 2 }] }),
    });
    expect(response.status).toBe(201);
  }
  await ownerApi('POST', '/v1/reservations', { customerName: 'منى', guests: 6, tableId: saved[3]!.id, reservedAt: new Date(Date.now() + 40 * 60_000).toISOString() });
  await page.reload();
  const floor = page.getByTestId('floor-canvas');
  await expect(floor.locator('[data-status="occupied"]')).toHaveCount(2);
  await expect(floor.locator('[data-status="reserved"]')).toHaveCount(1);
  await expect(floor.locator('[data-status="available"]')).toHaveCount(2);
  await expect(page.getByTestId('summary-total')).toContainText('٥');
  await expect(page.getByTestId('summary-occupied')).toContainText('٢');
  await expect(page.getByTestId('summary-reserved')).toContainText('١');
  await expect(page.getByTestId('summary-available')).toContainText('٢');
  await expect(floor.locator('.table-graphic-round .table-chair')).toHaveCount(2);
  await expect(floor.locator('.table-graphic-rectangle')).toHaveCount(3);

  // Search and status filter in the side panel.
  const side = page.getByRole('complementary', { name: 'الطاولات والحجوزات' });
  await side.getByLabel('الحالة').selectOption({ label: 'مشغولة' });
  await expect(side.getByTestId('table-item')).toHaveCount(2);
  await side.getByLabel('الحالة').selectOption({ label: 'كل الحالات' });
  await side.getByRole('searchbox').fill('عائلي');
  await expect(side.getByTestId('table-item')).toHaveCount(4);
  await side.getByRole('searchbox').fill('');

  // The booking, from the Reservations tab.
  await side.getByRole('tab', { name: /الحجوزات/ }).click();
  await expect(side.locator('[data-testid="reservation-item"][data-name="منى"]')).toContainText('عائلي 3');
  await side.getByRole('tab', { name: /الطاولات/ }).click();

  // Drag a table to a new spot: it stays there after a reload.
  const spot = floor.locator('[data-testid="floor-spot"][data-label="عائلي 4"]');
  const box = (await spot.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2 - 40, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await ownerApi<RestaurantTable[]>('GET', '/v1/tables')).find(table => table.label === 'عائلي 4')?.floorX).not.toBeNull();
  // Turn it a quarter with the knob above it, and make it bigger from its corner.
  const tableNamed = (label: string) => ownerApi<RestaurantTable[]>('GET', '/v1/tables').then(rows => rows.find(table => table.label === label)!);
  await expect(page.getByTestId('rotate-handle')).toBeVisible();
  const centre = (await spot.boundingBox())!;
  const knob = (await page.getByTestId('rotate-handle').boundingBox())!;
  const cx = centre.x + centre.width / 2;
  const cy = centre.y + centre.height / 2;
  await page.mouse.move(knob.x + knob.width / 2, knob.y + knob.height / 2);
  await page.mouse.down();
  await page.mouse.move(cx + 140, cy, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await tableNamed('عائلي 4')).floorRotation).toBe(90);
  // Outward from the centre, through the (turned) corner, once the turn has finished animating.
  await expect(spot).toHaveAttribute('data-rotation', '90');
  await page.waitForTimeout(300);
  const corner = (await page.getByTestId('resize-handle').boundingBox())!;
  const hx = corner.x + corner.width / 2;
  const hy = corner.y + corner.height / 2;
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(hx + (hx - cx) * 0.4, hy + (hy - cy) * 0.4, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await tableNamed('عائلي 4')).floorScale).toBeGreaterThan(1);
  // The buttons and the keyboard do the same.
  await details.getByRole('button', { name: 'لفّها يمين' }).click();
  await expect.poll(async () => (await tableNamed('عائلي 4')).floorRotation).toBe(105);
  await spot.focus();
  await page.keyboard.press('r');
  await expect.poll(async () => (await tableNamed('عائلي 4')).floorRotation).toBe(120);
  // Reopening the plan restores the layout: place, turn and size.
  const scale = (await tableNamed('عائلي 4')).floorScale;
  await page.reload();
  await expect(spot).toHaveAttribute('data-rotation', '120');
  await expect(spot).toHaveAttribute('data-scale', String(scale));
  await expect(spot).toContainText('٨');
  await spot.click();
  await details.getByRole('button', { name: 'رجّعها زي ما كانت' }).click();
  await expect.poll(async () => (await tableNamed('عائلي 4')).floorRotation).toBe(0);

  // Zoom in and back.
  await page.getByRole('button', { name: 'كبّر', exact: true }).click();
  await page.getByRole('button', { name: 'رجّع العرض' }).click();

  await expectAccessible(page, 'floor plan');
  await screenshot(page, 'tables-floor-ar', false);
  await page.setViewportSize({ width: 1024, height: 900 });
  await expectNoOverflow(page, 'floor plan 1024');
  await screenshot(page, 'tables-floor-ar-1024', false);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoOverflow(page, 'floor plan 390');
  await screenshot(page, 'tables-floor-ar-390', false);
});

test('signing out asks first; cancelling keeps the session', async () => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  // Sign-out lives in the sidebar's "all options" panel.
  const signOut = {
    click: async () => {
      await page.locator('.sidebar').getByRole('button', { name: 'كل الاختيارات' }).click();
      await page.getByRole('dialog', { name: 'القائمة' }).getByRole('button', { name: 'تسجيل الخروج' }).click();
    },
  };
  await signOut.click();
  const dialog = page.getByRole('dialog', { name: 'تسجيل الخروج' });
  await expect(dialog).toContainText('متأكد إنك عايز تخرج؟');
  await expect(dialog.getByRole('button', { name: 'إلغاء' })).toBeFocused();
  await expectAccessible(page, 'sign-out dialog');
  await screenshot(page, 'sign-out-dialog-ar', false);
  await dialog.getByRole('button', { name: 'إلغاء' }).click();
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/\/login/);

  await signOut.click();
  await dialog.getByRole('button', { name: 'اخرج' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('خرجت من حسابك.')).toBeVisible();
});
