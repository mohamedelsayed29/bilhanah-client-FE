import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { StandOrderStatus } from '@bilhanah/contracts';
import { apiError, json, PAYMOB_URL, STAND_TOKEN, standOrder } from './shop-fixtures';

// The customer's stand order page, /products/orders/:token, against a mocked API.
const review = fileURLToPath(new URL('../test-results/review/stand-order/', import.meta.url));
const ORDER = `**/v1/public/shop/orders/${STAND_TOKEN}`;
const orderPath = (search = '') => `/products/orders/${STAND_TOKEN}${search}`;

test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); });

test('shows the reference, every status with its timeline, the stands and the totals', async ({ page }) => {
  test.slow(); // One reload per status.
  let status: StandOrderStatus = 'NEW';
  await page.route(ORDER, route => route.fulfill(json(standOrder(status))));
  await page.goto(orderPath());

  await expect(page.locator('.stand-order-reference strong')).toHaveText('S-1042');
  await expect(page.locator('.stand-order-reference')).toContainText('احتفظ برقم الطلب');
  await expect(page).toHaveTitle('طلب S-1042 | منتجات بالهنا');
  const lines = page.locator('.stand-order-line');
  await expect(lines).toHaveCount(2);
  await expect(lines.first()).toContainText('بيت الزيتون');
  await expect(lines.first()).toContainText('قوس');
  await expect(lines.first()).toContainText('أخضر عميق');
  await expect(lines.first()).toContainText('QR + NFC');
  await expect(lines.first()).toContainText('ترابيزة ٨–٩');
  await expect(lines.first()).toContainText('٩٠٠');
  await expect(lines.nth(1)).toContainText('ألوان مخصصة');
  await expect(lines.nth(1)).toContainText('#1C4D8D / #FFE6A7');
  const summary = page.locator('.shop-summary');
  await expect(summary.locator('.shop-summary-total')).toContainText('٢٬٠١٠');
  await expect(summary).toContainText('كاش عند الاستلام');
  await expect(summary).toContainText('هتدفع للمندوب');
  // Cash orders have no payment step.
  await expect(page.locator('.stand-order-timeline li')).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'كمّل الدفع' })).toHaveCount(0);

  const expected: [StandOrderStatus, string, string][] = [
    ['NEW', 'الطلب وصلنا', 'طلبك وصلنا'],
    ['CONFIRMED', 'أكّدناه معاك', 'أكّدنا طلبك'],
    ['IN_PRODUCTION', 'بيتصنع', 'حواملك بتتصنع'],
    ['SHIPPED', 'اتشحن', 'طلبك في الطريق'],
    ['DELIVERED', 'اتسلّم', 'حواملك وصلت. بالهنا!'],
    ['CANCELLED', 'اتلغى', 'الطلب اتلغى'],
  ];
  for (const [next, label, title] of expected) {
    status = next;
    await page.reload();
    await expect(page.locator('.stand-order-pill')).toHaveText(label);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    if (next === 'CANCELLED') await expect(page.locator('.stand-order-timeline')).toHaveCount(0);
    else if (next === 'DELIVERED') await expect(page.locator('.stand-order-timeline li.done')).toHaveCount(5);
    else await expect(page.locator('.stand-order-timeline li[aria-current="step"]')).toContainText(label);
  }

});

test('the order page reads in English and fits phones down to 320px', async ({ page }) => {
  await page.route(ORDER, route => route.fulfill(json(standOrder('IN_PRODUCTION'))));
  await page.goto(orderPath());
  await page.getByRole('button', { name: 'Switch to English', exact: true }).click();
  await expect(page.locator('.stand-order-pill')).toHaveText('In production');
  await expect(page.locator('.stand-order-timeline')).toContainText('Order received');
  await expect(page.locator('.stand-order-reference')).toContainText('Keep this number');
  await mkdir(review, { recursive: true });
  for (const language of ['en', 'ar']) {
    if (language === 'ar') await page.getByRole('button', { name: 'التبديل للعربية', exact: true }).click();
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), { message: `${language} at ${width}` }).toBe(true);
      await page.screenshot({ path: `${review}/order-${language}-${width}.png`, fullPage: true });
    }
  }
  expect((await new AxeBuilder({ page }).include('.stand-order').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
});

test('an online order awaiting payment can be paid from its page', async ({ page }) => {
  await page.route(ORDER, route => route.fulfill(json(standOrder('AWAITING_PAYMENT', { paymentMethod: 'PAYMOB' }))));
  let pays = 0;
  await page.route(`${ORDER}/pay`, route => { pays++; return route.fulfill(pays === 1 ? apiError(409, 'ONLINE_PAYMENT_UNAVAILABLE') : json({ checkoutUrl: PAYMOB_URL })); });
  await page.route('https://accept.paymob.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Paymob</title><h1>Paymob checkout</h1>' }));
  await page.goto(orderPath());

  await expect(page.locator('.stand-order-pill')).toHaveText('مستني الدفع');
  await expect(page.locator('.stand-order-timeline li')).toHaveCount(6);
  await expect(page.locator('.shop-summary')).toContainText('لسه ما اتدفعش');
  await mkdir(review, { recursive: true });
  await page.screenshot({ path: `${review}/awaiting-payment-ar.png`, fullPage: true });
  await page.getByRole('button', { name: 'كمّل الدفع', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('الدفع الأونلاين مش شغال');
  await page.getByRole('button', { name: 'كمّل الدفع', exact: true }).click();
  await expect(page).toHaveURL(PAYMOB_URL);
  expect(pays).toBe(2);
});

test('back from Paymob, the page confirms the payment by polling the order', async ({ page }) => {
  let reads = 0;
  await page.route(ORDER, route => {
    reads++;
    return route.fulfill(json(reads < 3 ? standOrder('AWAITING_PAYMENT', { paymentMethod: 'PAYMOB' }) : standOrder('NEW', { paymentMethod: 'PAYMOB', paymentStatus: 'PAID' })));
  });
  await page.goto(orderPath('?id=123&success=true&pending=false&hmac=abc'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('بنأكد الدفع…');
  await expect(page.getByRole('button', { name: 'كمّل الدفع' })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('طلبك وصلنا', { timeout: 15_000 });
  await expect(page.locator('.stand-order-result')).toContainText('الدفع اتأكد');
  await expect(page.locator('.stand-order-timeline li').first()).toContainText('اتدفع');
  await expect(page.locator('.shop-summary')).toContainText('اتدفع');
  // Dev mode's StrictMode may start (and abort) one extra read.
  expect(reads).toBeGreaterThanOrEqual(3);
  // Paymob's parameters leave the address bar.
  await expect(page).toHaveURL(new RegExp(`/products/orders/${STAND_TOKEN}$`));
});

test('a payment still unconfirmed after a minute explains what to do; a failed one offers to pay again', async ({ page }) => {
  await page.clock.install();
  let reads = 0;
  await page.route(ORDER, route => { reads++; return route.fulfill(json(standOrder('AWAITING_PAYMENT', { paymentMethod: 'PAYMOB' }))); });
  await page.goto(orderPath('?success=true&hmac=abc'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('بنأكد الدفع…');
  const result = page.locator('.stand-order-result');
  for (let step = 0; step < 40 && !await result.count(); step++) await page.clock.runFor(3_000);
  await expect(result).toContainText('لسه موصلناش تأكيد الدفع');
  await expect(page.getByRole('button', { name: 'ادفع تاني', exact: true })).toBeVisible();
  await expect(page.locator('.stand-order-status')).toContainText('ابعتلنا إيميل');
  expect(reads).toBeGreaterThanOrEqual(15);
  expect(reads).toBeLessThanOrEqual(23);
  const settled = reads;
  await page.clock.runFor(30_000);
  expect(reads).toBe(settled);

  await page.goto(orderPath('?success=false&hmac=abc'));
  await expect(page.locator('.stand-order-result')).toContainText('الدفع ما كملش');
  await expect(page.getByRole('button', { name: 'ادفع تاني', exact: true })).toBeVisible();
});

test('an unknown order shows a friendly page with a way back to the shop', async ({ page }) => {
  await page.route('**/v1/public/shop/orders/missing-token', route => route.fulfill(apiError(404, 'STAND_ORDER_NOT_FOUND')));
  await page.goto('/products/orders/missing-token');
  await expect(page.getByRole('heading', { level: 1, name: 'مش لاقيين الطلب ده' })).toBeVisible();
  await page.getByRole('link', { name: 'ارجع للمنتجات' }).click();
  await expect(page).toHaveURL(/\/products$/);
  await expect(page.getByRole('heading', { level: 1, name: 'أدوات ذكية لمطعمك وكافيهك.' })).toBeVisible();
});

test('a failed load offers a retry', async ({ page }) => {
  let fail = true;
  await page.route(ORDER, route => route.fulfill(fail ? apiError(500, 'INTERNAL_SERVER_ERROR') : json(standOrder('NEW'))));
  await page.goto(orderPath());
  await expect(page.getByRole('alert')).toContainText('اتأكد من الاتصال');
  fail = false;
  await page.getByRole('button', { name: 'حاول تاني', exact: true }).click();
  await expect(page.locator('.stand-order-reference strong')).toHaveText('S-1042');
});

test('old /shop links (emailed orders, Paymob returns) land on /products', async ({ page }) => {
  await page.goto('/shop?category=stickers');
  await expect(page).toHaveURL(/\/products\?category=stickers$/);
  await page.route(`**/v1/public/shop/orders/${STAND_TOKEN}`, route => route.fulfill(json(standOrder('NEW'))));
  await page.goto(`/shop/orders/${STAND_TOKEN}?success=true`);
  await expect(page).toHaveURL(new RegExp(`/products/orders/${STAND_TOKEN}`));
});
