import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { OrderStatus } from '@bilhanah/contracts';
import { allDays, apiError, json, menuFixture, mockRealtime, orderFixture, restaurantUrl, serveMenu, TOKEN } from './ordering-fixtures';

// Ordering from the public menu, against a mocked API (see ordering-fixtures.ts).
const ordersRoute = '**/v1/public/restaurants/koshary/orders';
const trackRoute = '**/v1/public/orders/**';
const placed = (status: OrderStatus = 'PLACED') => json({ trackingToken: TOKEN, order: orderFixture(status) }, 201);

async function addLemon(page: Page) {
  await page.getByRole('button', { name: 'أضف ليمون نعناع للطلب' }).click();
  await expect(page.locator('.cart-bar')).toBeVisible();
}

async function openCheckout(page: Page) {
  await page.locator('.cart-bar').click();
  await page.getByRole('dialog', { name: 'طلبك' }).getByRole('button', { name: /كمّل الطلب/ }).click();
  await expect(page.getByRole('dialog', { name: 'تأكيد الطلب' })).toBeVisible();
}

const submit = (page: Page) => page.getByRole('dialog').getByRole('button', { name: /ابعت الطلب|جرّب تاني/ }).click();

async function axe(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(result.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([]);
}

test('adds dishes with sizes, quantities and notes, edits the cart, and keeps it on reload', async ({ page }) => {
  await serveMenu(page);
  await page.goto(restaurantUrl());

  await addLemon(page);
  await expect(page.locator('.order-notice')).toContainText('اتضاف ليمون نعناع لطلبك.');
  await expect(page.locator('.cart-bar')).toContainText('١');
  await expect(page.locator('.cart-bar')).toContainText('٤٥');

  // A dish with several sizes opens its sheet to choose one.
  await page.getByRole('button', { name: 'أضف كشري للطلب' }).click();
  const sheet = page.getByRole('dialog', { name: 'كشري' });
  await expect(sheet.getByRole('radio', { name: /صغير/ })).toBeChecked();
  await sheet.getByRole('radio', { name: /كبير/ }).check();
  await sheet.getByRole('button', { name: 'زوّد الكمية' }).click();
  await sheet.getByLabel(/ملاحظة للمطبخ/).fill('من غير بصل');
  await expect(sheet.getByRole('button', { name: /أضف للطلب/ })).toContainText('١١١');
  await sheet.getByRole('button', { name: /أضف للطلب/ }).click();
  await expect(sheet).toBeHidden();
  await expect(page.locator('.cart-bar')).toContainText('٣');
  await expect(page.locator('.cart-bar')).toContainText('١٥٦');
  await expect(page.getByRole('button', { name: 'أضف كشري تاني، في طلبك ٢' })).toBeVisible();

  await page.reload();
  await expect(page.locator('.cart-bar')).toContainText('١٥٦');
  await page.locator('.cart-bar').click();
  const cart = page.getByRole('dialog', { name: 'طلبك' });
  await axe(page);
  const koshary = cart.locator('.cart-line', { hasText: 'كشري' });
  await expect(koshary).toContainText('كبير');
  await koshary.getByRole('button', { name: 'زوّد الكمية' }).click();
  await expect(koshary).toContainText('١٦٦٫٥');
  await koshary.getByRole('button', { name: 'من غير بصل' }).click();
  await koshary.getByRole('textbox').fill('سبايسي');
  await cart.getByRole('heading', { name: 'طلبك' }).click();
  await expect(koshary.getByRole('button', { name: 'سبايسي' })).toBeVisible();
  await cart.locator('.cart-line', { hasText: 'ليمون نعناع' }).getByRole('button', { name: 'شيل من الطلب' }).click();
  await expect(cart.locator('.cart-line')).toHaveCount(1);
  await expect(cart.locator('.order-total')).toContainText('١٦٦٫٥');

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('bilhanah:cart:v1:koshary') ?? 'null'));
  expect(stored.lines).toEqual([{ menuItemId: 'koshary', variantId: 'v-large', quantity: 3, note: 'سبايسي' }]);

  await koshary.getByRole('button', { name: 'قلّل الكمية' }).click();
  await koshary.getByRole('button', { name: 'قلّل الكمية' }).click();
  await koshary.getByRole('button', { name: 'شيل من الطلب' }).click();
  await expect(cart).toContainText('طلبك فاضي');
  await cart.getByRole('button', { name: 'تصفّح المنيو' }).click();
  await expect(page.locator('.cart-bar')).toHaveCount(0);
});

test('sold-out dishes cannot be added, and a stored cart drops dishes that are gone', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bilhanah:cart:v1:koshary', JSON.stringify({ savedAt: Date.now(), lines: [
    { menuItemId: 'lemon', variantId: 'v-lemon', quantity: 2, note: '' },
    { menuItemId: 'fatta', variantId: 'v-fatta', quantity: 1, note: '' },
    { menuItemId: 'deleted', variantId: 'v-deleted', quantity: 1, note: '' },
    { menuItemId: 'lemon', variantId: 'v-lemon', quantity: 'lots', note: '' },
  ] })));
  await serveMenu(page);
  await page.goto(restaurantUrl());

  await expect(page.locator('.order-notice')).toContainText('شلنا من طلبك أصناف مبقتش متاحة.');
  await expect(page.locator('.cart-bar')).toContainText('٩٠');
  const fatta = page.locator('.dish-item', { hasText: 'فتة' });
  await expect(fatta.locator('.dish-add')).toHaveCount(0);
  await fatta.locator('.dish-card').click();
  const sheet = page.getByRole('dialog', { name: 'فتة' });
  await expect(sheet).toContainText('خلصت النهارده');
  await expect(sheet.getByRole('button', { name: /أضف للطلب/ })).toHaveCount(0);
});

test('without ordering the menu stays as it was', async ({ page }) => {
  await serveMenu(page, menuFixture({ ordering: { accepting: false, dineIn: true, pickup: true } }));
  let tableLookups = 0;
  await page.route('**/tables/**', route => { tableLookups++; return route.fulfill(json({ label: '5' })); });
  await page.goto(restaurantUrl('/?t=GOOD1234'));
  await expect(page.getByRole('heading', { level: 1, name: 'كشري أبو طارق' })).toBeVisible();
  await expect(page.locator('.dish-add, .table-badge, .cart-bar, .recent-order-link')).toHaveCount(0);
  await page.locator('.dish-card', { hasText: 'كشري' }).click();
  await expect(page.getByRole('dialog').locator('.dish-sheet-prices li')).toHaveCount(2);
  expect(tableLookups).toBe(0);
});

test('shows the scanned table, remembers it for the visit, and notes an unknown code', async ({ page }) => {
  await serveMenu(page);
  await page.route('**/v1/public/restaurants/koshary/tables/GOOD1234', route => route.fulfill(json({ label: '5' })));
  await page.route('**/v1/public/restaurants/koshary/tables/BAD12345', route => route.fulfill(apiError(404, 'TABLE_NOT_FOUND')));

  await page.goto(restaurantUrl('/?t=GOOD1234'));
  await expect(page.locator('.table-badge')).toHaveText('طاولة ٥');
  await expect(page).toHaveURL(restaurantUrl('/'));
  await page.reload();
  await expect(page.locator('.table-badge')).toHaveText('طاولة ٥');

  await page.goto(restaurantUrl('/?t=BAD12345'));
  await expect(page.locator('.order-notice')).toContainText('مقدرناش نتعرف على كود الطاولة');
  await expect(page.locator('.table-badge')).toHaveCount(0);
});

test('checkout asks for a table for dine-in, a name, and a phone for pickup', async ({ page }) => {
  await serveMenu(page);
  let posted = 0;
  await page.route(ordersRoute, route => { posted++; return route.fulfill(placed()); });
  await page.goto(restaurantUrl());
  await addLemon(page);
  await openCheckout(page);
  const dialog = page.getByRole('dialog');

  await submit(page);
  await expect(page.getByLabel('رقم الطاولة')).toBeFocused();
  await expect(page.getByLabel('رقم الطاولة')).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog).toContainText('اكتب رقم طاولتك.');
  await expect(dialog).toContainText('اكتب اسمك (حرفين على الأقل).');

  await page.getByRole('radio', { name: 'تيك أواي' }).check();
  await expect(page.getByLabel('رقم الطاولة')).toHaveCount(0);
  await page.getByLabel('اسمك', { exact: true }).fill('أحمد');
  await submit(page);
  await expect(page.getByLabel('رقم موبايلك')).toBeFocused();
  await expect(dialog).toContainText('رقم الموبايل مطلوب للتيك أواي.');
  await page.getByLabel('رقم موبايلك').fill('١٢');
  await submit(page);
  await expect(dialog).toContainText('اكتب رقم موبايل صحيح.');
  await axe(page);
  expect(posted).toBe(0);
});

test('places a pickup order, then follows it and finds it again from the menu', async ({ page }) => {
  await serveMenu(page);
  await mockRealtime(page, 'live');
  const requests: { body: unknown; key?: string }[] = [];
  await page.route(ordersRoute, route => {
    requests.push({ body: route.request().postDataJSON(), key: route.request().headers()['idempotency-key'] });
    return route.fulfill(json({ trackingToken: TOKEN, order: orderFixture('PLACED', { type: 'PICKUP', tableLabel: null }) }, 201));
  });
  await page.route(trackRoute, route => route.fulfill(json(orderFixture('PLACED', { type: 'PICKUP', tableLabel: null }))));
  await page.goto(restaurantUrl());
  await addLemon(page);
  await openCheckout(page);

  await page.getByRole('radio', { name: 'تيك أواي' }).check();
  await page.getByLabel('اسمك', { exact: true }).fill(' أحمد ');
  await page.getByLabel('رقم موبايلك').fill('٠١٠ ١٢٣٤ ٥٦٧٨');
  await page.getByLabel(/ملاحظة على الطلب/).fill('هعدّي بعد ربع ساعة');
  await submit(page);

  await expect(page).toHaveURL(restaurantUrl(`/order/${TOKEN}`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('وصل طلبك للمطعم');
  await expect(page.locator('.track-where')).toContainText('تيك أواي');
  expect(requests).toHaveLength(1);
  expect(requests[0]!.key).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  expect(requests[0]!.body).toEqual({ type: 'PICKUP', customerName: 'أحمد', customerPhone: '01012345678', note: 'هعدّي بعد ربع ساعة', items: [{ menuItemId: 'lemon', variantId: 'v-lemon', quantity: 1 }] });
  await axe(page);

  await page.getByRole('link', { name: 'ارجع للمنيو' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'كشري أبو طارق' })).toBeVisible();
  await expect(page.locator('.cart-bar')).toHaveCount(0);
  await page.getByRole('link', { name: 'تابع طلبك رقم ١٢' }).click();
  await expect(page).toHaveURL(restaurantUrl(`/order/${TOKEN}`));
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'كشري أبو طارق' })).toBeVisible();

  // The name and phone are remembered for next time.
  await addLemon(page);
  await openCheckout(page);
  await expect(page.getByLabel('اسمك', { exact: true })).toHaveValue('أحمد');
});

test('dine-in sends the scanned table; an unknown table asks for its number instead', async ({ page }) => {
  await serveMenu(page);
  await page.route('**/v1/public/restaurants/koshary/tables/GOOD1234', route => route.fulfill(json({ label: '5' })));
  const bodies: Record<string, unknown>[] = [];
  await page.route(ordersRoute, route => {
    bodies.push(route.request().postDataJSON());
    return route.fulfill(bodies.length === 1 ? apiError(404, 'TABLE_NOT_FOUND') : placed());
  });
  await page.route(trackRoute, route => route.fulfill(json(orderFixture('PLACED'))));
  await mockRealtime(page, 'live');
  await page.goto(restaurantUrl('/?t=GOOD1234'));
  await expect(page.locator('.table-badge')).toHaveText('طاولة ٥');
  await addLemon(page);
  await openCheckout(page);
  await expect(page.getByRole('dialog')).toContainText('هنجيبلك الطلب على طاولة ٥');
  await page.getByLabel('اسمك', { exact: true }).fill('أحمد');
  await submit(page);

  await expect(page.getByRole('alert')).toContainText('مش لاقيين الطاولة دي');
  await expect(page.getByLabel('رقم الطاولة')).toBeFocused();
  await expect(page.locator('.table-badge')).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('bilhanah:table:v1:koshary'))).toBeNull();
  await page.getByLabel('رقم الطاولة').fill('٥');
  await submit(page);
  await expect(page).toHaveURL(restaurantUrl(`/order/${TOKEN}`));
  expect(bodies[0]).toMatchObject({ type: 'DINE_IN', tableCode: 'GOOD1234' });
  expect(bodies[1]).toMatchObject({ type: 'DINE_IN', tableLabel: '5' });
  expect(bodies[1]).not.toHaveProperty('tableCode');
});

test('dishes that sold out meanwhile are marked in the cart and can be removed', async ({ page }) => {
  await serveMenu(page);
  await page.route(ordersRoute, route => route.fulfill(apiError(409, 'ITEMS_UNAVAILABLE', { menuItemIds: ['lemon'] })));
  await page.goto(restaurantUrl());
  await addLemon(page);
  await page.getByRole('button', { name: 'أضف كشري للطلب' }).click();
  await page.getByRole('dialog', { name: 'كشري' }).getByRole('button', { name: /أضف للطلب/ }).click();
  await openCheckout(page);
  await page.getByLabel('رقم الطاولة').fill('3');
  await page.getByLabel('اسمك', { exact: true }).fill('أحمد');
  await submit(page);

  const cart = page.getByRole('dialog', { name: 'طلبك' });
  await expect(cart.getByRole('alert')).toContainText('الأصناف المعلّمة مبقتش متاحة');
  await expect(cart.locator('.cart-line.unavailable')).toContainText('ليمون نعناع');
  await expect(cart.getByRole('button', { name: /كمّل الطلب/ })).toBeDisabled();
  await cart.getByRole('button', { name: 'شيل الأصناف دي' }).click();
  await expect(cart.locator('.cart-line')).toHaveCount(1);
  await expect(cart.getByRole('button', { name: /كمّل الطلب/ })).toBeEnabled();
});

test('an order type the restaurant stopped taking is removed from the choices', async ({ page }) => {
  await serveMenu(page);
  await page.route(ordersRoute, route => route.fulfill(apiError(400, 'ORDER_TYPE_UNAVAILABLE')));
  await page.goto(restaurantUrl());
  await addLemon(page);
  await openCheckout(page);
  await page.getByRole('radio', { name: 'تيك أواي' }).check();
  await page.getByLabel('اسمك', { exact: true }).fill('أحمد');
  await page.getByLabel('رقم موبايلك').fill('01012345678');
  await submit(page);
  await expect(page.getByRole('alert')).toContainText('المطعم مش بياخد النوع ده من الطلبات');
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.locator('.type-only')).toContainText('الطلب هيوصلك على الطاولة');
  await expect(page.getByLabel('رقم الطاولة')).toBeVisible();
});

for (const [code, status, details, message] of [
  ['RESTAURANT_CLOSED', 409, undefined, 'المطعم قفل دلوقتي ومش بياخد طلبات'],
  ['ORDERING_UNAVAILABLE', 409, undefined, 'المطعم وقّف الطلبات من الموبايل مؤقتًا'],
  ['RATE_LIMITED', 429, { retryAfterSeconds: 290 }, 'جرّب تاني بعد ٥ دقيقة'],
] as const) {
  test(`explains ${code} and lets the diner try again`, async ({ page }) => {
    await serveMenu(page);
    await page.route(ordersRoute, route => route.fulfill(apiError(status, code, details)));
    await page.goto(restaurantUrl());
    await addLemon(page);
    await openCheckout(page);
    await page.getByLabel('رقم الطاولة').fill('3');
    await page.getByLabel('اسمك', { exact: true }).fill('أحمد');
    await submit(page);
    await expect(page.getByRole('alert')).toContainText(message);
    await expect(page.getByRole('button', { name: /جرّب تاني/ })).toBeEnabled();
  });
}

test('retries and double taps reuse one Idempotency-Key until the order goes through', async ({ page }) => {
  await serveMenu(page);
  await mockRealtime(page, 'live');
  await page.route(trackRoute, route => route.fulfill(json(orderFixture('PLACED'))));
  const keys: string[] = [];
  let release!: () => void;
  const slow = new Promise<void>(resolve => { release = resolve; });
  await page.route(ordersRoute, async route => {
    keys.push(route.request().headers()['idempotency-key']!);
    if (keys.length === 1) return route.abort('internetdisconnected');
    if (keys.length === 2) return route.fulfill(apiError(503, 'SERVICE_UNAVAILABLE'));
    await slow;
    return route.fulfill(placed());
  });
  await page.goto(restaurantUrl());
  await addLemon(page);
  await openCheckout(page);
  await page.getByLabel('رقم الطاولة').fill('3');
  await page.getByLabel('اسمك', { exact: true }).fill('أحمد');

  await submit(page);
  await expect(page.getByRole('alert')).toContainText('مقدرناش نبعت طلبك');
  await expect(page.getByRole('alert')).toContainText('الطلب مش هيتكرر');
  await submit(page);
  await expect.poll(() => keys.length).toBe(2);
  await expect(page.getByRole('button', { name: /جرّب تاني/ })).toBeEnabled();
  // Double tap while the third attempt is in flight.
  await page.getByRole('button', { name: /جرّب تاني/ }).dblclick();
  await expect(page.getByRole('button', { name: /بنبعت طلبك/ })).toBeDisabled();
  release();
  await expect(page).toHaveURL(restaurantUrl(`/order/${TOKEN}`));
  expect(keys).toHaveLength(3);
  expect(new Set(keys).size).toBe(1);

  // The next checkout gets a fresh key.
  await page.route(ordersRoute, async route => { keys.push(route.request().headers()['idempotency-key']!); return route.fulfill(placed()); });
  await page.getByRole('link', { name: 'ارجع للمنيو' }).click();
  await addLemon(page);
  await openCheckout(page);
  await page.getByLabel('رقم الطاولة').fill('3');
  await submit(page);
  await expect.poll(() => keys.length).toBe(4);
  expect(keys[3]).not.toBe(keys[0]);
});

test('closed restaurants keep the cart but disable checkout until they open', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-23T10:00:00Z')); // 13:00 in Cairo
  await serveMenu(page, menuFixture({ openingHours: allDays([{ opens: '18:00', closes: '23:00' }]) }));
  await page.goto(restaurantUrl());
  await addLemon(page);
  await page.locator('.cart-bar').click();
  const cart = page.getByRole('dialog', { name: 'طلبك' });
  await expect(cart.locator('.order-closed')).toHaveText('المطعم مقفول دلوقتي. بيفتح النهارده ٦:٠٠ م.');
  await expect(cart.getByRole('button', { name: /كمّل الطلب/ })).toBeDisabled();
});

const headlines: Record<OrderStatus, string> = {
  PLACED: 'وصل طلبك للمطعم', ACCEPTED: 'المطعم أكّد طلبك', PREPARING: 'طلبك بيتحضّر', READY: 'طلبك جاهز!',
  COMPLETED: 'بالهنا والشفا!', REJECTED: 'المطعم اعتذر عن الطلب', CANCELLED: 'الطلب اتلغى',
};
const currentStep: Partial<Record<OrderStatus, string>> = { PLACED: 'اتبعت', ACCEPTED: 'اتأكّد', PREPARING: 'بيتحضّر', READY: 'جاهز' };

test('the tracking page shows every status', async ({ page }) => {
  await mockRealtime(page, 'live');
  for (const status of Object.keys(headlines) as OrderStatus[]) {
    await page.unroute(trackRoute);
    await page.route(trackRoute, route => route.fulfill(json(orderFixture(status))));
    await page.goto(restaurantUrl(`/order/${TOKEN}`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(headlines[status]);
    await expect(page.locator('.track-number')).toContainText('١٢');
    await expect(page.locator('.track-where')).toContainText('طاولة ٥');
    await expect(page.locator('.track-items')).toContainText('من غير بصل');
    await expect(page.locator('.order-total')).toContainText('١٥٦');
    await expect(page.getByRole('link', { name: 'كلّم المطعم' })).toHaveAttribute('href', 'tel:01012345678');
    if (status === 'REJECTED' || status === 'CANCELLED') {
      await expect(page.locator('.track-timeline')).toHaveCount(0);
      await expect(page.locator('.track-reason')).toContainText(status === 'REJECTED' ? 'الكشري خلص النهارده' : 'المطبخ قفل');
    } else if (status === 'COMPLETED') {
      await expect(page.locator('.track-step.done')).toHaveCount(5);
      await expect(page.locator('.track-live')).toHaveCount(0);
    } else {
      await expect(page.locator('[aria-current="step"]')).toContainText(currentStep[status]!);
    }
  }
});

test('the tracking page updates live, and celebrates when the order is ready', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { vibrations: unknown[] }).vibrations = [];
    navigator.vibrate = pattern => { (window as unknown as { vibrations: unknown[] }).vibrations.push(pattern); return true; };
  });
  const realtime = await mockRealtime(page, 'live');
  let gets = 0;
  await page.route(trackRoute, route => { gets++; return route.fulfill(json(orderFixture('PLACED'))); });
  await page.goto(restaurantUrl(`/order/${TOKEN}`));
  await expect(page.locator('.track-live')).toHaveText('تحديث مباشر');
  // Connecting refetches whatever happened before the socket was up.
  await expect.poll(() => gets).toBeGreaterThanOrEqual(2);

  realtime.push(orderFixture('PREPARING'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('طلبك بيتحضّر');
  expect(await page.evaluate(() => (window as unknown as { vibrations: unknown[] }).vibrations.length)).toBe(0);
  realtime.push(orderFixture('READY'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('طلبك جاهز!');
  await expect(page.locator('.track-hero')).toHaveClass(/status-ready/);
  await expect.poll(() => page.evaluate(() => (window as unknown as { vibrations: unknown[] }).vibrations.length)).toBe(1);
  realtime.push(orderFixture('COMPLETED'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('بالهنا والشفا!');
});

test('the tracking page polls every 15 seconds when live updates cannot connect', async ({ page }) => {
  await page.clock.install();
  await mockRealtime(page, 'fail');
  let status: OrderStatus = 'ACCEPTED';
  await page.route(trackRoute, route => route.fulfill(json(orderFixture(status))));
  await page.goto(restaurantUrl(`/order/${TOKEN}`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('المطعم أكّد طلبك');
  await expect(page.locator('.track-live')).toHaveText('بنوصّل التحديث المباشر…');
  // The socket never connects; after a grace period the page polls instead.
  await page.clock.runFor(5_000);
  await expect(page.locator('.track-live')).toHaveText('بنحدّث كل ١٥ ثانية');

  status = 'READY';
  await page.clock.runFor(14_000);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('المطعم أكّد طلبك');
  await page.clock.runFor(1_000);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('طلبك جاهز!');
});

test('an unknown tracking link explains itself and leads back to the menu', async ({ page }) => {
  await serveMenu(page);
  await mockRealtime(page, 'fail');
  await page.route(trackRoute, route => route.fulfill(apiError(404, 'ORDER_NOT_FOUND')));
  await page.goto(restaurantUrl('/order/not-a-real-token'));
  await expect(page.getByRole('heading', { name: 'مش لاقيين الطلب ده' })).toBeVisible();
  await page.getByRole('link', { name: 'ارجع للمنيو' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'كشري أبو طارق' })).toBeVisible();
});

test('works in English too', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bilhanah:language:v1', 'en'));
  await serveMenu(page);
  await page.goto(restaurantUrl());
  await page.getByRole('button', { name: 'Add Koshary to your order' }).click();
  await page.getByRole('dialog', { name: 'Koshary' }).getByRole('radio', { name: /Large/ }).check();
  await page.getByRole('dialog', { name: 'Koshary' }).getByRole('button', { name: /Add to order/ }).click();
  await expect(page.locator('.cart-bar')).toContainText('55.5');
  await page.locator('.cart-bar').click();
  await page.getByRole('button', { name: /Continue/ }).click();
  await expect(page.getByRole('radio', { name: 'Dine in' })).toBeChecked();
  await expect(page.getByLabel('Table number')).toBeVisible();
});
