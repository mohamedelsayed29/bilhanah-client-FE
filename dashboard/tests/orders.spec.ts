import { randomUUID } from 'node:crypto';
import { expect, request as playwrightRequest, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import type { OwnerRestaurant, PublicMenuResponse, RestaurantTable } from '@bilhanah/contracts';
import { API_URL, DASHBOARD_ORIGIN, expectAccessible, expectNoOverflow, registerOwner, screenshot, uniqueSuffix } from './helpers';

// One owner per run (registrations are rate-limited per IP) and at most 6 public orders
// (the place-order limit is 20 per 10 minutes per IP, shared with other test suites).
test.describe.configure({ mode: 'serial' });

const suffix = uniqueSuffix();
const owner = { email: `orders-${suffix}@e2e-bilhanah.test`, password: 'Molokhia-Tuesday-2026', fullName: 'هبة الاختبار', restaurant: 'مطبخ هبة', subdomain: `e2e-ord-${suffix}` };

let context: BrowserContext;
let page: Page;
let api: APIRequestContext;
let token = '';
const pageErrors: string[] = [];
let ordersPlaced = 0;
const dish = { menuItemId: '', small: '', large: '' };
const drink = { menuItemId: '', variantId: '' };

/** Owner API calls with a separate session, so the browser's refresh cookie is left alone. */
async function ownerApi<T>(method: 'GET' | 'POST' | 'PATCH', path: string, data?: unknown): Promise<T> {
  const response = await api.fetch(`${API_URL}${path}`, { method, data, headers: { Authorization: `Bearer ${token}`, Origin: DASHBOARD_ORIGIN } });
  expect(response.ok(), `${method} ${path}: ${response.status()} ${await response.text()}`).toBe(true);
  return (await response.json().catch(() => null)) as T;
}

type PlaceResult = { status: number; body: { order?: { number: number }; error?: { code: string } } };

/** A diner's checkout through the public API (Node fetch, as a phone would). */
async function placeOrder(body: Record<string, unknown>): Promise<PlaceResult> {
  ordersPlaced += 1;
  expect(ordersPlaced, 'keep the shared place-order rate limit').toBeLessThanOrEqual(6);
  const response = await fetch(`${API_URL}/v1/public/restaurants/${owner.subdomain}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as PlaceResult['body'] };
}

async function tables(): Promise<RestaurantTable[]> {
  return ownerApi<RestaurantTable[]>('GET', '/v1/tables');
}

const card = (number: number) => page.getByTestId(`order-${number}`);

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext();
  page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  api = await playwrightRequest.newContext();
});
test.afterAll(async () => {
  await context.close();
  await api.dispose();
});

test('a new owner with a menu', async () => {
  await registerOwner(page, owner);
  const login = await api.post(`${API_URL}/v1/auth/login`, { data: { email: owner.email, password: owner.password }, headers: { Origin: DASHBOARD_ORIGIN } });
  expect(login.ok()).toBe(true);
  token = ((await login.json()) as { accessToken: string }).accessToken;

  const category = await ownerApi<{ id: string }>('POST', '/v1/menu/categories', { nameAr: 'مشويات', nameEn: 'Grills' });
  await ownerApi('POST', '/v1/menu/items', {
    categoryId: category.id, nameAr: 'كفتة مشوية', nameEn: 'Grilled kofta',
    variants: [{ nameAr: 'ربع كيلو', nameEn: 'Quarter kilo', pricePiastres: 12_500 }, { nameAr: 'نص كيلو', nameEn: 'Half kilo', pricePiastres: 23_000 }],
  });
  await ownerApi('POST', '/v1/menu/items', { categoryId: category.id, nameAr: 'ليمون بالنعناع', nameEn: 'Lemon mint', variants: [{ pricePiastres: 4_000 }] });
  const menu = (await (await api.get(`${API_URL}/v1/public/restaurants/${owner.subdomain}/menu`)).json()) as PublicMenuResponse;
  const [kofta, lemon] = menu.categories[0]!.items;
  dish.menuItemId = kofta!.id;
  dish.small = kofta!.variants[0]!.id;
  dish.large = kofta!.variants[1]!.id;
  drink.menuItemId = lemon!.id;
  drink.variantId = lemon!.variants[0]!.id;
});

test('ordering settings: switch ordering on with dine-in and pickup', async () => {
  const restaurant = await ownerApi<OwnerRestaurant>('GET', '/v1/restaurants/mine');
  test.skip(!restaurant.ordering.included, 'The trial plan of this environment has no ordering.');

  await page.getByRole('link', { name: 'الطلبات' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'الطلبات' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'شغّل الطلبات' })).toBeVisible();
  await page.getByRole('link', { name: 'إعدادات الطلبات' }).click();
  await expect(page).toHaveURL(/\/settings\/ordering$/);
  await expect(page.getByRole('link', { name: 'الطلبات', exact: true }).last()).toHaveAttribute('aria-current', 'page');
  const takeOrders = page.getByRole('switch', { name: 'استقبل طلبات' });
  await expect(takeOrders).toHaveAttribute('aria-checked', 'false');
  await takeOrders.click();
  await expect(takeOrders).toHaveAttribute('aria-checked', 'true');
  const dineIn = page.getByRole('checkbox', { name: /طلبات الصالة/ });
  const pickup = page.getByRole('checkbox', { name: /تيك أواي/ });
  if (!(await dineIn.isChecked())) { await dineIn.check(); await expect(dineIn).toBeChecked(); }
  if (!(await pickup.isChecked())) { await pickup.check(); await expect(pickup).toBeChecked(); }
  await expectAccessible(page, 'ordering settings');
  await screenshot(page, 'orders-settings-ar');
  const saved = await ownerApi<OwnerRestaurant>('GET', '/v1/restaurants/mine');
  expect(saved.ordering).toMatchObject({ included: true, enabled: true, acceptsDineIn: true, acceptsPickup: true, paused: false });
});

test('tables: add one, add a range, rename, switch off, new code, delete', async () => {
  await page.getByRole('link', { name: 'الطاولات' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'الطاولات' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'ضيف طاولاتك' })).toBeVisible();
  await expectAccessible(page, 'tables (empty)');

  // One table.
  await page.getByRole('button', { name: 'ضيف طاولة' }).first().click();
  const addDialog = page.getByRole('dialog', { name: 'ضيف طاولة' });
  await addDialog.getByLabel('اسم الطاولة').fill('التراس');
  await addDialog.getByRole('button', { name: 'ضيف' }).click();
  await expect(addDialog).toBeHidden();
  await expect(page.locator('[data-testid="table-item"][data-label="التراس"]')).toBeVisible();

  // The same name again: TABLE_LABEL_TAKEN on the field.
  await page.getByRole('button', { name: 'ضيف طاولة' }).first().click();
  await addDialog.getByLabel('اسم الطاولة').fill('التراس');
  await addDialog.getByRole('button', { name: 'ضيف' }).click();
  await expect(addDialog.getByText('في طاولة بنفس الاسم ده')).toBeVisible();
  await addDialog.getByRole('button', { name: 'إلغاء' }).click();

  // A range with a preview.
  await page.getByRole('button', { name: 'ضيف كذا طاولة' }).click();
  const rangeDialog = page.getByRole('dialog', { name: 'ضيف طاولات مرة واحدة' });
  await expect(rangeDialog.getByLabel('الاسم قبل الرقم')).toHaveValue('طاولة');
  await rangeDialog.getByLabel('من رقم').fill('1');
  await rangeDialog.getByLabel('لحد رقم').fill('6');
  await expect(rangeDialog.getByTestId('range-preview')).toContainText('طاولة 1، طاولة 2 … طاولة 6');
  await rangeDialog.getByLabel('لحد رقم').fill('200');
  await expect(rangeDialog.getByText('لحد ١٠٠ طاولة في المرة.')).toBeVisible();
  await rangeDialog.getByLabel('لحد رقم').fill('6');
  await rangeDialog.getByRole('button', { name: 'ضيف ٦ طاولات' }).click();
  await expect(rangeDialog).toBeHidden();
  await expect(page.getByTestId('table-item')).toHaveCount(7);
  await expect(page.getByTestId('summary-total')).toContainText('٧ شغالة');
  // Each table's actions sit in its "⋮" menu in the side list.
  const action = async (label: string, name: string) => {
    await page.getByRole('button', { name: `إجراءات ${label}`, exact: true }).click();
    await page.getByRole('menuitem', { name }).click();
  };

  // Rename from the edit dialog.
  await action('التراس', 'تعديل');
  const editDialog = page.getByRole('dialog', { name: 'تعديل «التراس»' });
  await editDialog.getByLabel('اسم الطاولة').fill('تراس ١');
  await editDialog.getByRole('button', { name: 'احفظ' }).click();
  await expect(editDialog).toBeHidden();
  const renamed = page.locator('[data-testid="table-item"][data-label="تراس ١"]');
  await expect(renamed).toBeVisible();

  // Switch one off; it is left out of the print sheet.
  await action('طاولة 6', 'وقّفها مؤقتًا');
  await expect(page.locator('[data-testid="table-item"][data-label="طاولة 6"]')).toContainText('متوقفة');
  await expect(page.getByTestId('summary-total')).toContainText('٦ شغالة');

  // New code: the old QR link stops working.
  const before = (await tables()).find(table => table.label === 'طاولة 5')!;
  await action('طاولة 5', 'كود جديد');
  const confirmCode = page.getByRole('dialog', { name: 'كود جديد لـ«طاولة 5»؟' });
  await expect(confirmCode).toContainText('هيبطل يشتغل');
  await confirmCode.getByRole('button', { name: 'اعمل كود جديد' }).click();
  await expect(confirmCode).toBeHidden();
  const after = (await tables()).find(table => table.label === 'طاولة 5')!;
  expect(after.publicCode).not.toBe(before.publicCode);
  expect((await api.get(`${API_URL}/v1/public/restaurants/${owner.subdomain}/tables/${before.publicCode}`)).status()).toBe(404);
  expect((await api.get(`${API_URL}/v1/public/restaurants/${owner.subdomain}/tables/${after.publicCode}`)).ok()).toBe(true);

  // Delete.
  await action('طاولة 4', 'امسح');
  await page.getByRole('dialog', { name: 'امسح «طاولة 4»؟' }).getByRole('button', { name: 'امسح' }).click();
  await expect(page.locator('[data-testid="table-item"][data-label="طاولة 4"]')).toHaveCount(0);
  await expect(page.getByTestId('table-item')).toHaveCount(6);

  // Single table QR download.
  const download = page.waitForEvent('download');
  await action('تراس ١', 'كود QR');
  await page.getByRole('dialog', { name: 'كود «تراس ١»' }).getByRole('button', { name: 'نزّل PNG لـتراس ١' }).click();
  expect((await download).suggestedFilename()).toBe(`bilhanah-${owner.subdomain}-تراس-١.png`);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'كود «تراس ١»' })).toBeHidden();

  await expectAccessible(page, 'tables');
  await screenshot(page, 'tables-ar');
});

test('print sheet of the active tables', async () => {
  await page.getByRole('link', { name: 'اطبع الأكواد' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'اطبع أكواد الطاولات' })).toBeVisible();
  await expect(page.getByTestId('print-card')).toHaveCount(5);
  await expect(page.getByTestId('print-card').first()).toContainText('امسح الكود واطلب من مكانك');
  await expect(page.getByTestId('print-card').first()).toContainText('Scan to order from your table');
  await expect(page.getByRole('button', { name: 'اطبع' })).toBeVisible();
  await expectAccessible(page, 'print view');
  await screenshot(page, 'tables-print-ar');
  // The printed page hides the dashboard around the cards.
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.sidebar-column')).toBeHidden();
  await expect(page.getByRole('button', { name: 'اطبع' })).toBeHidden();
  await expect(page.getByTestId('print-card').first()).toBeVisible();
  await page.pdf?.({ path: 'test-results/screens/tables-print.pdf', format: 'A4', printBackground: true }).catch(() => undefined);
  await page.emulateMedia({ media: 'screen' });
});

test('orders arrive on the board live and move through every step', async () => {
  await page.goto('/orders');
  await expect(page.getByRole('heading', { level: 1, name: 'الطلبات' })).toBeVisible();
  await expect(page.getByTestId('connection-state')).toHaveText('مباشر');
  await expect(page.getByTestId('column-new')).toContainText('مفيش طلبات جديدة');
  // Browsers block sound until the page is touched.
  await expect(page.getByText('الصوت مقفول لحد ما تلمس الصفحة')).toBeVisible();
  await page.getByRole('button', { name: 'شغّل الصوت' }).click();
  await expect(page.getByText('الصوت مقفول لحد ما تلمس الصفحة')).toBeHidden();
  await expectAccessible(page, 'empty board');

  const tableList = await tables();
  const table1 = tableList.find(table => table.label === 'طاولة 1')!;
  const table2 = tableList.find(table => table.label === 'طاولة 2')!;
  const table3 = tableList.find(table => table.label === 'طاولة 3')!;

  // #1, dine-in from the table's QR code.
  const first = await placeOrder({
    type: 'DINE_IN', tableCode: table1.publicCode, customerName: 'كريم',
    items: [{ menuItemId: dish.menuItemId, variantId: dish.large, quantity: 2, note: 'من غير بصل' }, { menuItemId: drink.menuItemId, variantId: drink.variantId, quantity: 1 }],
    note: 'بسرعة لو سمحت',
  });
  expect(first.status, JSON.stringify(first.body)).toBe(201);
  const one = card(1);
  await expect(one).toBeVisible();
  await expect(page.getByTestId('column-new')).toContainText('#١');
  await expect(one).toContainText('طاولة 1');
  await expect(one).toContainText('٢×');
  await expect(one).toContainText('كفتة مشوية — نص كيلو');
  await expect(one).toContainText('من غير بصل');
  await expect(one).toContainText('بسرعة لو سمحت');
  await expect(one).toContainText('٥٠٠ ج.م');
  await expect(one).toContainText('جديد');
  await expect(page).toHaveTitle(/^\(1\) الطلبات/);
  await expect(page.getByTestId('new-orders-count').first()).toHaveText(/١/);

  // #2, pickup with a phone number.
  const second = await placeOrder({ type: 'PICKUP', customerName: 'منى', customerPhone: '0100 123 4567', items: [{ menuItemId: drink.menuItemId, variantId: drink.variantId, quantity: 3 }] });
  expect(second.status).toBe(201);
  await expect(card(2)).toBeVisible();
  await expect(card(2)).toContainText('تيك أواي');
  await expect(card(2).getByRole('link', { name: /اتصل بـ منى/ })).toHaveAttribute('href', 'tel:01001234567');
  await expect(page).toHaveTitle(/^\(2\) الطلبات/);

  // Touching the board marks the new orders as seen.
  await page.getByRole('heading', { level: 1, name: 'الطلبات' }).click();
  await expect(page).toHaveTitle(/^الطلبات/);
  await expect(page.getByTestId('new-orders-count').first()).toHaveText(/٢/);

  // #1: accept → preparing → ready → complete.
  await one.getByRole('button', { name: 'اقبل الطلب' }).click();
  await expect(page.getByTestId('column-progress').getByTestId('order-1')).toBeVisible();
  await expect(card(1)).toContainText('اتقبل');
  await card(1).getByRole('button', { name: 'ابدأ التحضير' }).click();
  await expect(card(1)).toContainText('بيتحضّر');
  await expect(card(1).getByRole('button', { name: 'إلغاء الطلب' })).toBeVisible();
  await card(1).getByRole('button', { name: 'جاهز' }).click();
  await expect(page.getByTestId('column-ready').getByTestId('order-1')).toBeVisible();
  await card(1).getByRole('button', { name: 'اتسلّم' }).click();
  await expect(card(1)).toHaveCount(0);

  // #2: reject with a reason (required).
  await card(2).getByRole('button', { name: 'ارفض' }).click();
  const reject = page.getByRole('dialog', { name: 'رفض طلب #٢' });
  await reject.getByRole('button', { name: 'ارفض الطلب' }).click();
  await expect(reject.getByText('اكتب السبب عشان الزبون يعرف.')).toBeVisible();
  await reject.getByRole('button', { name: 'صنف في الطلب خلص' }).click();
  await expect(reject.getByLabel('السبب')).toHaveValue('صنف في الطلب خلص');
  await reject.getByRole('button', { name: 'ارفض الطلب' }).click();
  await expect(reject).toBeHidden();
  await expect(card(2)).toHaveCount(0);
  await expect(page.getByTestId('new-orders-count')).toHaveCount(0);

  // A change made on "another device" (the API) also shows up live; the stale card action refetches.
  const third = await placeOrder({ type: 'DINE_IN', tableCode: table2.publicCode, customerName: 'سارة', items: [{ menuItemId: dish.menuItemId, variantId: dish.small, quantity: 1, note: 'سبايسي' }] });
  const fourth = await placeOrder({ type: 'PICKUP', customerName: 'Omar', customerPhone: '+201112223334', items: [{ menuItemId: dish.menuItemId, variantId: dish.large, quantity: 1 }, { menuItemId: drink.menuItemId, variantId: drink.variantId, quantity: 2, note: 'سكر خفيف' }], note: 'هعدّي بعد ربع ساعة' });
  const fifth = await placeOrder({ type: 'DINE_IN', tableLabel: table3.label, customerName: 'ياسين', items: [{ menuItemId: drink.menuItemId, variantId: drink.variantId, quantity: 4 }] });
  expect([third.status, fourth.status, fifth.status]).toEqual([201, 201, 201]);
  await expect(card(3)).toBeVisible();
  await expect(card(4)).toBeVisible();
  await expect(card(5)).toBeVisible();
  await expect(page).toHaveTitle(/^\(3\) /);
  const orders = await ownerApi<{ items: { id: string; number: number }[] }>('GET', '/v1/orders?view=active');
  const id5 = orders.items.find(order => order.number === 5)!.id;
  await ownerApi('PATCH', `/v1/orders/${id5}/status`, { status: 'ACCEPTED' });
  await expect(page.getByTestId('column-progress').getByTestId('order-5')).toBeVisible();
  await ownerApi('PATCH', `/v1/orders/${id5}/status`, { status: 'READY' });
  await expect(page.getByTestId('column-ready').getByTestId('order-5')).toBeVisible();

  // #3 accepted here: one order in each column for the screenshots.
  await card(3).getByRole('button', { name: 'اقبل الطلب' }).click();
  await expect(page.getByTestId('column-progress').getByTestId('order-3')).toBeVisible();
  await card(3).getByRole('button', { name: 'ابدأ التحضير' }).click();
  await expect(card(3)).toContainText('بيتحضّر');
  await expect(page).toHaveTitle(/^الطلبات/);
  await expectAccessible(page, 'board with orders');
  await screenshot(page, 'orders-board-ar');
  await card(4).screenshot({ path: 'test-results/screens/orders-card-actions-ar.png' });
  expect(pageErrors).toEqual([]);
});

test('pausing orders makes new public orders fail, resuming accepts them again', async () => {
  const toggle = page.getByRole('switch', { name: 'بنستقبل طلبات' });
  await toggle.click();
  await expect(page.getByRole('switch', { name: 'الطلبات واقفة مؤقتًا' })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByText('استقبال الطلبات واقف مؤقتًا')).toBeVisible();
  const refused = await placeOrder({ type: 'PICKUP', customerName: 'Late', customerPhone: '01000000001', items: [{ menuItemId: drink.menuItemId, variantId: drink.variantId, quantity: 1 }] });
  expect(refused.status).toBe(409);
  expect(refused.body.error?.code).toBe('ORDERING_UNAVAILABLE');
  await screenshot(page, 'orders-board-paused-ar');
  await page.getByRole('button', { name: 'ارجع استقبل طلبات' }).click();
  await expect(page.getByRole('switch', { name: 'بنستقبل طلبات' })).toHaveAttribute('aria-checked', 'true');
  expect((await ownerApi<OwnerRestaurant>('GET', '/v1/restaurants/mine')).ordering.paused).toBe(false);
});

test('order history lists closed orders with details', async () => {
  await page.getByRole('link', { name: 'الطلبات السابقة' }).click();
  await expect(page).toHaveURL(/\/orders\/history$/);
  await expect(page.getByTestId('history-1')).toContainText('اتسلّم');
  await expect(page.getByTestId('history-1')).toContainText('طاولة 1');
  await expect(page.getByTestId('history-2')).toContainText('اترفض');
  await page.getByRole('button', { name: 'التفاصيل: طلب #٢' }).click();
  const detail = page.getByRole('dialog', { name: 'طلب #٢' });
  await expect(detail).toContainText('سبب الرفض: صنف في الطلب خلص');
  await expect(detail).toContainText('منى');
  await expect(detail).toContainText('١٢٠ ج.م');
  await expectAccessible(page, 'history detail');
  await screenshot(page, 'orders-history-detail-ar', false);
  await detail.getByRole('button', { name: 'إغلاق' }).first().click();
  await expectAccessible(page, 'history');
  await screenshot(page, 'orders-history-ar');
});

test('phone layout of the board (390 px)', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/orders');
  await expect(page.getByTestId('connection-state')).toHaveText('مباشر');
  const switcher = page.getByRole('group', { name: 'اختار العمود' });
  await expect(switcher).toBeVisible();
  await expect(card(4)).toBeVisible();
  await expect(card(3)).toBeHidden();
  await expectNoOverflow(page, 'board 390');
  await screenshot(page, 'orders-board-ar-390');
  await switcher.getByRole('button', { name: /بيتحضّر/ }).click();
  await expect(card(3)).toBeVisible();
  await expect(card(4)).toBeHidden();
  await screenshot(page, 'orders-board-ar-390-progress');
  await switcher.getByRole('button', { name: /جاهز/ }).click();
  await expect(card(5)).toBeVisible();
  await expectAccessible(page, 'board 390');
  await page.goto('/tables');
  await expect(page.getByTestId('table-item').first()).toBeVisible();
  await expectNoOverflow(page, 'tables 390');
  await screenshot(page, 'tables-ar-390');
  await page.goto('/tables/print');
  await expect(page.getByTestId('print-card').first()).toBeVisible();
  await expectNoOverflow(page, 'print 390');
  await page.goto('/orders/history');
  await expect(page.getByTestId('history-1')).toBeVisible();
  await expectNoOverflow(page, 'history 390');
  await screenshot(page, 'orders-history-ar-390');
  await page.setViewportSize({ width: 1440, height: 960 });
});

test('English', async () => {
  await page.goto('/orders');
  await page.getByRole('button', { name: 'Switch to English' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Orders' })).toBeVisible();
  await expect(page.getByTestId('connection-state')).toHaveText('Live');
  await expect(card(4)).toContainText('Pickup');
  await expect(card(4)).toContainText('Grilled kofta — Half kilo');
  await expect(card(3).getByRole('button', { name: 'Mark ready' })).toBeVisible();
  await expect(card(5).getByRole('button', { name: 'Complete' })).toBeVisible();
  await expectAccessible(page, 'board (English)');
  await screenshot(page, 'orders-board-en');
  await page.getByRole('link', { name: 'History' }).click();
  await expect(page.getByTestId('history-2')).toContainText('Rejected');
  await screenshot(page, 'orders-history-en');
  await page.getByRole('link', { name: 'Tables' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tables' })).toBeVisible();
  await screenshot(page, 'tables-en');
  await page.getByRole('link', { name: 'Print QR codes' }).click();
  await expect(page.getByTestId('print-card')).toHaveCount(5);
  await screenshot(page, 'tables-print-en');
  await page.goto('/settings/ordering');
  await expect(page.getByRole('switch', { name: 'Take orders' })).toHaveAttribute('aria-checked', 'true');
  await screenshot(page, 'orders-settings-en');
  // Back to Arabic for whoever uses this browser profile next.
  await page.getByRole('button', { name: 'عربي، التبديل للعربية' }).first().click();
  expect(pageErrors).toEqual([]);
});
