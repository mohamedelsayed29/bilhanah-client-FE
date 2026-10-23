import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { apiError, fillCheckout, json, LOGO_A, LOGO_B, openCheckout, PAYMOB_URL, recorded, seedBag, serveShopInfo, shopInfo, STAND_TOKEN, standOrder } from './shop-fixtures';

// The stand shop's real checkout against a mocked API: GET /shop, logo uploads and POST /shop/orders.
const review = fileURLToPath(new URL('../test-results/review/stand-checkout/', import.meta.url));
const ORDERS = '**/v1/public/shop/orders';
const LOGOS = '**/v1/public/shop/logos';
const PRICE_KEYS = ['unitPrice', 'unitPricePiastres', 'lineTotal', 'lineTotalPiastres', 'price'];

test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); });

test('cash on delivery: logos upload once, the order carries no prices, and the order page opens', async ({ page }) => {
  await serveShopInfo(page);
  const uploads: string[] = [];
  await page.route(LOGOS, route => {
    uploads.push(route.request().headers()['content-type'] ?? '');
    return route.fulfill(json({ logoId: `logo-${uploads.length}` }, 201));
  });
  const orders: ReturnType<typeof recorded>[] = [];
  await page.route(ORDERS, route => { orders.push(recorded(route.request())); return route.fulfill(json({ trackingToken: STAND_TOKEN, order: standOrder('NEW'), checkoutUrl: null }, 201)); });
  await page.route(`**/v1/public/shop/orders/${STAND_TOKEN}`, route => route.fulfill(json(standOrder('NEW'))));

  await seedBag(page, [
    { brand: 'بيت الزيتون', logo: LOGO_A, quantity: 2, nfc: true, shape: 'arch', design: 'forest', purpose: 'reviews', url: 'https://g.page/r/olive/review', numbered: true, startNumber: 8, caption: ' رأيك يهمنا ' },
    { brand: 'كشري أبو طارق', logo: LOGO_A, quantity: 3, customColors: { background: '#1C4D8D', ink: '#FFE6A7' } },
    { brand: 'فرع المعادي', logo: LOGO_B, quantity: 1 },
  ]);
  await expect(page.locator('.shop-demo-notice')).toHaveCount(0);
  await openCheckout(page);

  // 6 stands × 350 + 2 NFC × 100 = 2,300 EGP; delivery 60 EGP.
  const summary = page.locator('.shop-summary');
  await expect(summary.locator('.shop-summary-products')).toContainText('٢٬٣٠٠');
  await expect(summary.locator('.shop-summary-delivery')).toContainText('٦٠');
  await expect(summary.locator('.shop-summary-total')).toContainText('٢٬٣٦٠');
  await expect(page.getByRole('radio', { name: /الدفع عند الاستلام/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: /ادفع أونلاين \(كارت أو محفظة\)/ })).toBeVisible();

  await fillCheckout(page, { email: 'ahmed@example.com', notes: 'بعد الساعة ٥' });
  await mkdir(review, { recursive: true });
  await page.screenshot({ path: `${review}/checkout-cash-ar.png`, fullPage: true });
  expect((await new AxeBuilder({ page }).include('.stand-shop').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'أكّد الطلب', exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/shop/orders/${STAND_TOKEN}$`));
  await expect(page.getByRole('heading', { level: 1, name: 'طلبك وصلنا' })).toBeVisible();
  await expect(page.locator('.stand-order-reference strong')).toHaveText('S-1042');

  expect(uploads).toHaveLength(2);
  expect(uploads.every(type => type.startsWith('multipart/form-data'))).toBe(true);
  expect(orders).toHaveLength(1);
  const [order] = orders;
  expect(order!.key).toMatch(/^[0-9a-f-]{32,36}$/);
  expect(order!.body).toEqual({
    lines: [
      { shape: 'arch', nfc: true, design: 'forest', customColors: null, purpose: 'reviews', brand: 'بيت الزيتون', caption: 'رأيك يهمنا', url: 'https://g.page/r/olive/review', logoId: 'logo-1', numbered: true, startNumber: 8, quantity: 2, notes: '' },
      { shape: 'classic', nfc: false, design: 'signature', customColors: { background: '#1C4D8D', ink: '#FFE6A7' }, purpose: 'menu', brand: 'كشري أبو طارق', caption: '', url: 'https://koshary.bilhanah.com/', logoId: 'logo-1', numbered: false, startNumber: 1, quantity: 3, notes: '' },
      { shape: 'classic', nfc: false, design: 'signature', customColors: null, purpose: 'menu', brand: 'فرع المعادي', caption: '', url: 'https://koshary.bilhanah.com/', logoId: 'logo-2', numbered: false, startNumber: 1, quantity: 1, notes: '' },
    ],
    customer: { name: 'أحمد سامي', phone: '01012345678', email: 'ahmed@example.com', city: 'القاهرة', address: '١٦ شارع معروف، وسط البلد', notes: 'بعد الساعة ٥' },
    paymentMethod: 'CASH_ON_DELIVERY',
    expectedTotalPiastres: 236_000,
    language: 'ar',
  });
  for (const line of order!.body['lines'] as Record<string, unknown>[]) for (const key of PRICE_KEYS) expect(line).not.toHaveProperty(key);

  // The bag is empty, the phone number is not stored, and the shop links to the order.
  const stored = await page.evaluate(() => ({ bag: localStorage.getItem('bilhanah:stand-bag:v1'), all: Object.values(localStorage).join(' ') }));
  expect(stored.bag).toBeNull();
  expect(stored.all).not.toContain('01012345678');
  await page.getByRole('link', { name: 'ارجع للمتجر' }).first().click();
  await expect(page.getByRole('button', { name: /^السلة/ })).toContainText('٠');
  await page.getByRole('link', { name: /S-1042/ }).click();
  await expect(page).toHaveURL(new RegExp(`/shop/orders/${STAND_TOKEN}$`));
});

test('a delivery fee confirmed by phone leaves it out of the total and offers only the methods returned', async ({ page }) => {
  await serveShopInfo(page, shopInfo({ deliveryFeePiastres: null, paymentMethods: ['CASH_ON_DELIVERY'] }));
  const orders: ReturnType<typeof recorded>[] = [];
  await page.route(ORDERS, route => { orders.push(recorded(route.request())); return route.fulfill(json({ trackingToken: STAND_TOKEN, order: standOrder('NEW', { deliveryFeePiastres: null, totalPiastres: 195_000 }), checkoutUrl: null }, 201)); });
  await page.route(`**/v1/public/shop/orders/${STAND_TOKEN}`, route => route.fulfill(json(standOrder('NEW', { deliveryFeePiastres: null, totalPiastres: 195_000 }))));
  await seedBag(page, [{ quantity: 2 }]);
  await page.getByRole('button', { name: /^السلة/ }).click();
  await expect(page.locator('.shop-summary')).toContainText('سعر التوصيل بيتأكد معاك بالتليفون');
  await page.getByRole('button', { name: 'كمّل بيانات الطلب', exact: true }).click();

  const summary = page.locator('.shop-summary');
  await expect(summary.locator('.shop-summary-delivery')).toContainText('يتأكد بالتليفون');
  await expect(summary.locator('.shop-summary-total')).toContainText('الإجمالي من غير التوصيل');
  await expect(summary.locator('.shop-summary-total')).toContainText('٧٠٠');
  await expect(page.getByRole('radio')).toHaveCount(1);
  await expect(page.getByRole('radio', { name: /الدفع عند الاستلام/ })).toBeChecked();
  await expect(page.getByText('ادفع أونلاين')).toHaveCount(0);

  await fillCheckout(page);
  await page.getByRole('button', { name: 'أكّد الطلب', exact: true }).click();
  await expect(page).toHaveURL(/\/shop\/orders\//);
  expect(orders[0]!.body).toMatchObject({ paymentMethod: 'CASH_ON_DELIVERY', expectedTotalPiastres: 70_000, customer: { email: null } });
  await expect(page.locator('.stand-order-facts')).toContainText('كاش عند الاستلام');
});

test('the shop stays browsable when its info fails; the checkout offers a retry', async ({ page }) => {
  let fail = true;
  const info = await serveShopInfo(page, () => fail ? apiError(503, 'SERVICE_UNAVAILABLE') : json(shopInfo()));
  await page.goto('/shop');
  await page.getByRole('textbox', { name: 'اسم البراند', exact: true }).fill('بيت الزيتون');
  await page.getByRole('button', { name: 'أضف تصميمك للسلة', exact: true }).click();
  await page.getByRole('button', { name: 'عرض السلة', exact: true }).click();
  await expect(page.locator('.shop-summary')).toContainText('التوصيل بيتحسب في الخطوة الجاية');
  await page.getByRole('button', { name: 'كمّل بيانات الطلب', exact: true }).click();

  await expect(page.getByRole('alert')).toContainText('مقدرناش نجيب سعر التوصيل وطرق الدفع');
  await expect(page.getByRole('button', { name: 'أكّد الطلب', exact: true })).toBeDisabled();
  await expect(page.getByRole('radio')).toHaveCount(0);
  fail = false;
  const before = info.calls; // Dev mode's StrictMode may load it twice on the way in.
  await page.getByRole('button', { name: 'حاول تاني', exact: true }).click();
  await expect(page.getByRole('radio', { name: /ادفع أونلاين/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'أكّد الطلب', exact: true })).toBeEnabled();
  await expect(page.locator('.shop-summary-total')).toContainText('٤١٠');
  expect(info.calls).toBe(before + 1);
});

test('online payment: a dropped request is retried with the same key, then the browser goes to Paymob', async ({ page }) => {
  await serveShopInfo(page);
  let uploads = 0;
  await page.route(LOGOS, route => { uploads++; return route.fulfill(json({ logoId: 'logo-1' }, 201)); });
  const orders: ReturnType<typeof recorded>[] = [];
  await page.route(ORDERS, route => {
    orders.push(recorded(route.request()));
    if (orders.length === 1) return route.abort('connectionreset');
    return route.fulfill(json({ trackingToken: STAND_TOKEN, order: standOrder('AWAITING_PAYMENT', { paymentMethod: 'PAYMOB' }), checkoutUrl: PAYMOB_URL }, 201));
  });
  await page.route('https://accept.paymob.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Paymob</title><h1>Paymob checkout</h1>' }));

  await seedBag(page, [{ logo: LOGO_A, quantity: 1, nfc: true }]);
  await openCheckout(page);
  await page.getByRole('radio', { name: /ادفع أونلاين/ }).check();
  await fillCheckout(page);
  await expect(page.locator('.shop-summary small').last()).toContainText('Paymob');
  await page.getByRole('button', { name: 'كمّل للدفع', exact: true }).click();

  const alert = page.locator('.shop-alert');
  await expect(alert).toContainText('طلبك لسه هنا');
  await expect(alert).toBeFocused();
  await page.getByRole('button', { name: 'جرّب تاني', exact: true }).click();
  await expect(page).toHaveURL(PAYMOB_URL);
  await expect(page.getByRole('heading', { name: 'Paymob checkout' })).toBeVisible();

  expect(orders).toHaveLength(2);
  expect(orders[1]!.key).toBe(orders[0]!.key);
  expect(orders[1]!.body).toEqual(orders[0]!.body);
  expect(orders[1]!.body).toMatchObject({ paymentMethod: 'PAYMOB', expectedTotalPiastres: 51_000 });
  expect(uploads).toBe(1);

  // Back from Paymob without paying: the bag was emptied and the shop remembers the order.
  await page.goto('/shop');
  await expect(page.getByRole('button', { name: /^السلة/ })).toContainText('٠');
  await expect(page.getByRole('link', { name: /S-1042/ })).toBeVisible();
});

test('a changed bag starts a new Idempotency-Key; an unavailable online payment suggests cash', async ({ page }) => {
  await serveShopInfo(page);
  const orders: ReturnType<typeof recorded>[] = [];
  await page.route(ORDERS, route => {
    orders.push(recorded(route.request()));
    if (orders.length === 1) return route.fulfill(apiError(429, 'RATE_LIMITED'));
    if (orders.length === 2) return route.fulfill(apiError(409, 'ONLINE_PAYMENT_UNAVAILABLE', { reason: 'PAYMOB_DOWN' }));
    return route.fulfill(json({ trackingToken: STAND_TOKEN, order: standOrder('NEW'), checkoutUrl: null }, 201));
  });
  await page.route(`**/v1/public/shop/orders/${STAND_TOKEN}`, route => route.fulfill(json(standOrder('NEW'))));
  await seedBag(page, [{ quantity: 1 }]);
  await openCheckout(page);
  await fillCheckout(page);
  await page.getByRole('radio', { name: /ادفع أونلاين/ }).check();
  await page.getByRole('button', { name: 'كمّل للدفع', exact: true }).click();
  await expect(page.locator('.shop-alert')).toContainText('استنى دقيقة');

  // Change the bag: the next attempt is a different order.
  await page.getByRole('button', { name: 'ارجع للسلة', exact: true }).first().click();
  await page.getByRole('spinbutton', { name: /كمية/ }).fill('2');
  await page.getByRole('button', { name: 'كمّل بيانات الطلب', exact: true }).click();
  await page.getByRole('checkbox', { name: /راجعت الشكل/ }).check();
  await expect(page.getByRole('radio', { name: /ادفع أونلاين/ })).toBeChecked();
  await page.getByRole('button', { name: 'كمّل للدفع', exact: true }).click();
  await expect(page.locator('.shop-alert')).toContainText('الدفع الأونلاين مش شغال');
  expect(orders[1]!.key).not.toBe(orders[0]!.key);
  expect(orders[1]!.body).toMatchObject({ expectedTotalPiastres: 76_000, paymentMethod: 'PAYMOB' });

  await page.getByRole('button', { name: 'ادفع كاش عند الاستلام', exact: true }).click();
  await expect(page.getByRole('radio', { name: /الدفع عند الاستلام/ })).toBeChecked();
  await page.getByRole('button', { name: 'أكّد الطلب', exact: true }).click();
  await expect(page).toHaveURL(/\/shop\/orders\//);
  expect(orders).toHaveLength(3);
  expect(orders[2]!.key).not.toBe(orders[1]!.key);
  expect(orders[2]!.body).toMatchObject({ paymentMethod: 'CASH_ON_DELIVERY', expectedTotalPiastres: 76_000 });
});

test('PRICE_CHANGED shows the new total and confirms the order with it', async ({ page }) => {
  const info = await serveShopInfo(page);
  const orders: ReturnType<typeof recorded>[] = [];
  await page.route(ORDERS, route => {
    orders.push(recorded(route.request()));
    if (orders.length === 1) return route.fulfill(apiError(409, 'PRICE_CHANGED', { totalPiastres: 79_000, deliveryFeePiastres: 9_000 }));
    return route.fulfill(json({ trackingToken: STAND_TOKEN, order: standOrder('NEW'), checkoutUrl: null }, 201));
  });
  await page.route(`**/v1/public/shop/orders/${STAND_TOKEN}`, route => route.fulfill(json(standOrder('NEW'))));
  await seedBag(page, [{ quantity: 2 }]);
  await openCheckout(page);
  await fillCheckout(page);
  await page.getByRole('button', { name: 'أكّد الطلب', exact: true }).click();

  const notice = page.locator('.shop-price-change');
  await expect(notice.getByRole('heading', { name: 'الأسعار اتحدّثت' })).toBeFocused();
  await expect(notice).toContainText('٧٩٠');
  await expect(notice).toContainText('٧٦٠');
  await expect(page.locator('.shop-summary-delivery')).toContainText('٩٠');
  await expect(page.getByRole('button', { name: 'أكّد الطلب', exact: true })).toHaveCount(0);
  await mkdir(review, { recursive: true });
  await page.screenshot({ path: `${review}/price-changed-ar.png`, fullPage: true });
  await notice.getByRole('button', { name: /أكّد الإجمالي الجديد/ }).click();

  await expect(page).toHaveURL(/\/shop\/orders\//);
  expect(orders).toHaveLength(2);
  expect(orders[0]!.body['expectedTotalPiastres']).toBe(76_000);
  expect(orders[1]!.body['expectedTotalPiastres']).toBe(79_000);
  expect(orders[1]!.key).toBe(orders[0]!.key);
  expect(info.calls).toBeGreaterThanOrEqual(2);
});

test('validation errors appear next to their fields, from the form and from the API', async ({ page }) => {
  await serveShopInfo(page);
  const orders: ReturnType<typeof recorded>[] = [];
  let reply = apiError(400, 'VALIDATION_FAILED', [{ path: 'customer.phone', code: 'invalid_format', message: 'Enter a valid phone number.' }, { path: 'lines.0.url', code: 'custom', message: 'Use your Google Maps or Google review link.' }]);
  await page.route(ORDERS, route => { orders.push(recorded(route.request())); return route.fulfill(reply); });
  await page.route(LOGOS, route => route.fulfill(apiError(400, 'LOGO_INVALID')));
  await seedBag(page, [{ brand: 'بيت الزيتون', quantity: 1 }]);
  await openCheckout(page);

  await page.getByRole('button', { name: 'أكّد الطلب', exact: true }).click();
  const name = page.getByRole('textbox', { name: 'الاسم بالكامل', exact: true });
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(name).toHaveAccessibleDescription('اكتب اسمك بالكامل (حرفين على الأقل).');
  await expect(page.getByRole('textbox', { name: 'رقم الموبايل', exact: true })).toHaveAccessibleDescription(/رقم موبايل صحيح/);
  await expect(page.getByRole('checkbox', { name: /راجعت الشكل/ })).toHaveAccessibleDescription(/راجعت تفاصيل الحوامل/);
  await page.getByRole('textbox', { name: /البريد الإلكتروني/ }).fill('not-an-email');
  await page.getByRole('button', { name: 'أكّد الطلب', exact: true }).click();
  await expect(page.getByRole('textbox', { name: /البريد الإلكتروني/ })).toHaveAccessibleDescription(/البريد الإلكتروني مش مظبوط/);
  expect(orders).toHaveLength(0);
  await mkdir(review, { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${review}/errors-ar-390.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.getByRole('textbox', { name: /البريد الإلكتروني/ }).fill('');
  await fillCheckout(page, { phone: '0101234' });
  await page.getByRole('button', { name: 'أكّد الطلب', exact: true }).click();
  const phone = page.getByRole('textbox', { name: 'رقم الموبايل', exact: true });
  await expect(phone).toBeFocused();
  await expect(phone).toHaveAccessibleDescription(/رقم موبايل صحيح/);
  await expect(page.locator('.shop-alert')).toContainText('تصميم «بيت الزيتون»');
  await expect(page.locator('.shop-alert').getByRole('button', { name: 'ارجع للسلة' })).toBeVisible();
  expect(orders).toHaveLength(1);

  // A logo the API refuses.
  reply = json({ trackingToken: STAND_TOKEN, order: standOrder('NEW'), checkoutUrl: null }, 201);
  await page.locator('.shop-alert').getByRole('button', { name: 'ارجع للسلة' }).click();
  await page.evaluate(logo => {
    const bag = JSON.parse(localStorage.getItem('bilhanah:stand-bag:v1')!);
    bag[0].config.logo = logo;
    localStorage.setItem('bilhanah:stand-bag:v1', JSON.stringify(bag));
  }, LOGO_A);
  await page.reload();
  await openCheckout(page);
  await fillCheckout(page);
  await page.getByRole('button', { name: 'أكّد الطلب', exact: true }).click();
  await expect(page.locator('.shop-alert')).toContainText('لوجو مش مقبول');
  expect(orders).toHaveLength(1);
});

test('checkout fits a 320px phone in Arabic and English', async ({ page }) => {
  await serveShopInfo(page);
  await seedBag(page, [{ brand: 'بيت الزيتون', quantity: 2, nfc: true, customColors: { background: '#1C4D8D', ink: '#FFE6A7' } }]);
  await openCheckout(page);
  await mkdir(review, { recursive: true });
  for (const language of ['ar', 'en']) {
    if (language === 'en') await page.getByRole('button', { name: 'Switch to English', exact: true }).click();
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), { message: `${language} at ${width}` }).toBe(true);
      if (width !== 1440) await page.screenshot({ path: `${review}/checkout-${language}-${width}.png`, fullPage: true });
    }
  }
  await expect(page.getByRole('radio', { name: /Pay online \(card or wallet\)/ })).toBeVisible();
  expect((await new AxeBuilder({ page }).include('.stand-shop').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
});
