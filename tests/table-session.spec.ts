import { test, expect, type Page } from '@playwright/test';
import type { PublicMenuResponse, TableSessionItem, TableSessionView } from '@bilhanah/contracts';
import { json, menuFixture, mockRealtime, orderFixture, restaurantUrl, TOKEN } from './ordering-fixtures';

// Shared table orders on a phone: several guests at table 7 build one order together.
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const GUEST_TOKEN = 'guest-token-mona.signature';

function sharedMenu(): PublicMenuResponse {
  const menu = menuFixture();
  menu.restaurant.ordering = { accepting: true, dineIn: true, pickup: true, serviceRequests: false, sharedTable: true };
  return menu;
}

const line = (overrides: Partial<TableSessionItem>): TableSessionItem => ({
  id: 'line', guest: { id: 'g-mona', number: 1, name: null }, mine: true, editable: true, menuItemId: 'lemon', variantId: 'v-lemon',
  nameAr: 'ليمون نعناع', nameEn: 'Lemon mint', variantNameAr: null, variantNameEn: null, unitPricePiastres: 4500, quantity: 1, note: null,
  lineTotalPiastres: 4500, status: 'DRAFT', order: null, version: 0, addedAt: '2026-11-05T12:00:00.000Z', ...overrides,
});

function session(items: TableSessionItem[], overrides: Partial<TableSessionView> = {}): TableSessionView {
  const drafts = items.filter(item => item.status === 'DRAFT');
  return {
    status: 'ACTIVE', closedReason: null, startedAt: '2026-11-05T11:50:00.000Z', table: { label: '7' }, branch: { slug: 'main', name: 'الرئيسي' },
    me: { id: 'g-mona', number: 1, name: null, me: true },
    guests: [{ id: 'g-mona', number: 1, name: null, me: true }, { id: 'g-sara', number: 2, name: 'سارة', me: false }],
    items,
    draftTotalPiastres: drafts.reduce((sum, item) => sum + item.lineTotalPiastres, 0),
    myDraftTotalPiastres: drafts.filter(item => item.mine).reduce((sum, item) => sum + item.lineTotalPiastres, 0),
    sharedEditing: false, guestToken: GUEST_TOKEN, sessionToken: 'session-token', ...overrides,
  };
}

/** The table's session as a tiny in-memory server: join, add, and submit. */
async function serveTable(page: Page, initial: TableSessionView) {
  let state = initial;
  const calls = { joins: [] as unknown[], adds: [] as unknown[], submits: [] as { body: unknown; key: string | null; guest: string | null }[] };
  await page.route('**/v1/public/restaurants/koshary/menu', route => route.fulfill(json(sharedMenu())));
  await page.route('**/v1/public/restaurants/koshary/tables/T7', route => route.fulfill(json({ label: '7' })));
  await page.route('**/v1/public/restaurants/koshary/tables/T7/join', route => {
    calls.joins.push(route.request().postDataJSON());
    return route.fulfill(json(state));
  });
  await page.route('**/v1/public/table-session', route => route.fulfill(json(state)));
  await page.route('**/v1/public/table-session/items', route => {
    const body = route.request().postDataJSON() as { menuItemId: string; quantity: number };
    calls.adds.push(body);
    state = session([...state.items, line({ id: `added-${calls.adds.length}`, quantity: body.quantity, lineTotalPiastres: 4500 * body.quantity })]);
    return route.fulfill(json(state));
  });
  await page.route('**/v1/public/table-session/submit', route => {
    const request = route.request();
    calls.submits.push({ body: request.postDataJSON(), key: request.headers()['idempotency-key'] ?? null, guest: request.headers()['x-table-guest'] ?? null });
    state = session(state.items.map(item => (item.mine && item.status === 'DRAFT' ? { ...item, status: 'SUBMITTED', editable: false, order: { number: 12, status: 'PLACED', trackingToken: TOKEN } } : item)));
    return route.fulfill(json({ trackingToken: TOKEN, order: orderFixture('PLACED'), session: state }, 201));
  });
  return calls;
}

test('guests join the table’s order, add their dishes, see who added what, and send after confirming', async ({ page }) => {
  await mockRealtime(page, 'fail');
  const calls = await serveTable(page, session([
    line({ id: 'sara-koshary', guest: { id: 'g-sara', number: 2, name: 'سارة' }, mine: false, editable: false, menuItemId: 'koshary', variantId: 'v-large', nameAr: 'كشري', variantNameAr: 'كبير', unitPricePiastres: 5550, lineTotalPiastres: 5550 }),
  ]));

  await page.goto(restaurantUrl('/?t=T7'));
  const banner = page.getByTestId('shared-banner');
  await expect(banner).toContainText('انضميت لطلب طاولة ٧');
  // React's development double-run may start (and abort) a first join; every join is a fresh one.
  expect(calls.joins.length).toBeGreaterThan(0);
  for (const body of calls.joins) expect(body).toEqual({});

  await page.getByRole('button', { name: 'أضف ليمون نعناع للطلب' }).tap();
  await expect(page.locator('.order-notice')).toContainText('اتضاف ليمون نعناع لطلب الطاولة');
  expect(calls.adds).toEqual([{ menuItemId: 'lemon', variantId: 'v-lemon', quantity: 1, note: null }]);
  // The personal cart stays empty: the dish went to the table.
  await expect(page.getByTestId('shared-bar')).toContainText('طلب الطاولة');

  await page.getByTestId('shared-bar').tap();
  const sheet = page.getByRole('dialog', { name: 'طلب طاولة ٧' });
  await expect(sheet.getByTestId('shared-line')).toHaveCount(2);
  const mine = sheet.getByTestId('shared-line').filter({ hasText: 'ليمون نعناع' });
  await expect(mine).toContainText('أنت');
  await expect(mine.getByRole('group')).toBeVisible();
  const saras = sheet.getByTestId('shared-line').filter({ hasText: 'كشري' });
  await expect(saras).toContainText('سارة');
  // Another guest's dish cannot be changed from this phone.
  await expect(saras.getByRole('group')).toHaveCount(0);

  await sheet.getByTestId('shared-send-mine').tap();
  const confirm = page.getByRole('dialog', { name: 'تأكيد الإرسال' });
  await expect(confirm.getByTestId('shared-line')).toHaveCount(1);
  expect(calls.submits).toHaveLength(0);
  await confirm.getByTestId('shared-confirm').tap();
  await expect(page.locator('.order-notice')).toContainText('اتبعت للمطبخ');
  expect(calls.submits).toHaveLength(1);
  expect(calls.submits[0]).toMatchObject({ body: { scope: 'MINE', expectedTotalPiastres: 4500 }, guest: GUEST_TOKEN });
  expect(calls.submits[0]!.key).toMatch(/^[A-Za-z0-9_-]{8,64}$/);

  // Reopening the menu rejoins as the same guest.
  const before = calls.joins.length;
  await page.reload();
  await expect(page.getByTestId('shared-banner')).toBeVisible();
  expect(calls.joins.slice(before).length).toBeGreaterThan(0);
  for (const body of calls.joins.slice(before)) expect(body).toEqual({ guestToken: GUEST_TOKEN });
});

test('a closed table order says so, and the menu still takes a personal order', async ({ page }) => {
  await mockRealtime(page, 'fail');
  await serveTable(page, session([], { status: 'CLOSED', closedReason: 'SETTLED' }));
  await page.goto(restaurantUrl('/?t=T7'));
  await expect(page.getByTestId('shared-closed')).toContainText('طلب الطاولة اتقفل');
  await page.getByRole('button', { name: 'أضف ليمون نعناع للطلب' }).tap();
  await expect(page.locator('.cart-bar')).toContainText('عرض الطلب');
  await expect(page.getByTestId('shared-bar')).toHaveCount(0);
});
