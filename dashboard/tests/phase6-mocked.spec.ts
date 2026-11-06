import { expect, test } from '@playwright/test';
import { PLAN_FEATURES, type BillingSummary, type OwnerPayment, type RestaurantStats } from '@bilhanah/contracts';
import { expectAccessible, expectNoOverflow } from './helpers';
import { MockApi, ownerApi, signedIn } from './mock-api';

// These specs answer every API request themselves (see mock-api.ts), so they run without bilhanah-BE.
// They cover Phase 6 for owners: insights, online subscription payment and the QR link (the admin specs live in bilhanah-dashboard-FE).

const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('pageerror', error => errors.push(error.message));
});
test.afterEach(() => expect(errors, 'page errors').toEqual([]));

const arPrice = (piastres: number) => `${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(piastres / 100)} ج.م`;
const ar = (value: number) => new Intl.NumberFormat('ar-EG').format(value);

function day(offset: number) {
  return new Date(Date.UTC(2026, 9, 23 - offset)).toISOString().slice(0, 10);
}

function restaurantStats(days: number, ordering = true): RestaurantStats {
  const series = Array.from({ length: days }, (_, index) => {
    const visits = index % 6 === 0 ? 0 : 20 + ((index * 7) % 30);
    const orders = ordering ? Math.floor(visits / 5) : 0;
    return { date: day(days - 1 - index), visits, orders, revenuePiastres: orders * 8_500 };
  });
  const visits = series.reduce((sum, entry) => sum + entry.visits, 0);
  const orders = series.reduce((sum, entry) => sum + entry.orders, 0);
  return {
    days: series,
    totals: { visits, orders, revenuePiastres: orders * 8_500, averageOrderPiastres: orders ? 8_500 : 0 },
    sources: { qr: Math.round(visits * 0.5), table: Math.round(visits * 0.3), link: visits - Math.round(visits * 0.5) - Math.round(visits * 0.3) },
    ordersByType: { DINE_IN: Math.round(orders * 0.75), PICKUP: orders - Math.round(orders * 0.75) },
    topItems: ordering ? [
      { nameAr: 'كشري كبير', nameEn: 'Large koshari', quantity: 120, revenuePiastres: 120 * 6_000 },
      { nameAr: 'كشري صغير', nameEn: null, quantity: 80, revenuePiastres: 80 * 4_000 },
      { nameAr: 'أرز بلبن', nameEn: 'Rice pudding', quantity: 41, revenuePiastres: 41 * 2_500 },
    ] : [],
    ordering,
    dataSource: { orders: 'BILHANAH', menuSource: 'BILHANAH', externalPosName: null },
    branchId: null,
    financial: true,
  };
}

test.describe('owner insights', () => {
  test('shows KPIs, the daily chart with its data table, sources, order types and top dishes; switches period', async ({ page }) => {
    const api = ownerApi().on('GET', '/v1/restaurants/mine/stats', (_request, url) => ({ json: restaurantStats(Number(url.searchParams.get('days'))) }));
    await api.install(page);
    await page.goto('/insights');
    await expect(page.getByRole('heading', { level: 1, name: 'الإحصائيات' })).toBeVisible();
    const stats = restaurantStats(30);
    await expect(page.getByTestId('kpi-visits')).toContainText(ar(stats.totals.visits));
    await expect(page.getByTestId('kpi-orders')).toContainText(ar(stats.totals.orders));
    await expect(page.getByTestId('kpi-revenue')).toContainText(arPrice(stats.totals.revenuePiastres));
    await expect(page.getByTestId('kpi-average')).toContainText(arPrice(8_500));
    // Screen readers get every day in a table.
    const chart = page.getByRole('img', { name: /الزيارات و?الطلبات/ });
    await expect(chart).toBeVisible();
    await expect(page.locator('figure table tbody tr')).toHaveCount(30);
    // Hover shows a day's values.
    const box = (await chart.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 80);
    await expect(page.getByTestId('chart-tooltip')).toContainText('الزيارات');
    // Keyboard too.
    await chart.focus();
    await page.keyboard.press('End');
    await expect(page.getByTestId('chart-tooltip')).toContainText('٢٣ أكتوبر');
    await expect(page.getByTestId('bar-qr')).toContainText('٥٠٪');
    await expect(page.getByTestId('bar-DINE_IN')).toBeVisible();
    await expect(page.getByTestId('top-dishes').locator('tbody tr')).toHaveCount(3);
    await expectAccessible(page, 'insights (ar)');

    await page.getByRole('radio', { name: 'آخر ٧ أيام' }).click();
    await expect(page).toHaveURL(/\/insights\?days=7$/);
    await expect(page.getByRole('radio', { name: 'آخر ٧ أيام' })).toBeChecked();
    await expect(page.locator('figure table tbody tr')).toHaveCount(7);
    // (In development StrictMode may cancel and repeat the first request.)
    expect(new Set(api.callsTo('GET', '/v1/restaurants/mine/stats').map(call => call.search))).toEqual(new Set(['?days=30', '?days=7']));

    await page.setViewportSize({ width: 320, height: 700 });
    await expectNoOverflow(page, 'insights at 320px');
    await page.evaluate(() => localStorage.setItem('bilhanah:language:v1', 'en'));
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Insights' })).toBeVisible();
    await expect(page.getByRole('img', { name: /Visits, Orders, Order revenue per day/ })).toBeVisible();
    await expectNoOverflow(page, 'insights at 320px (en)');
    await expectAccessible(page, 'insights (en, 320px)');
    expect(api.unhandled).toEqual([]);
  });

  test('plans without ordering show visits only, and an empty period says so', async ({ page }) => {
    const empty: RestaurantStats = { ...restaurantStats(30, false), days: [], totals: { visits: 0, orders: 0, revenuePiastres: 0, averageOrderPiastres: 0 }, sources: { qr: 0, table: 0, link: 0 } };
    await ownerApi().on('GET', '/v1/restaurants/mine/stats', { json: empty }).install(page);
    await page.goto('/insights');
    await expect(page.getByText('الإحصائيات هنا للزيارات بس')).toBeVisible();
    await expect(page.getByTestId('kpi-visits')).toBeVisible();
    await expect(page.getByTestId('kpi-orders')).toHaveCount(0);
    await expect(page.getByTestId('insights-empty')).toBeVisible();
    await expect(page.getByTestId('top-dishes')).toHaveCount(0);
    await expectAccessible(page, 'insights without ordering');
  });

  test('an API error offers a retry', async ({ page }) => {
    let fail = true;
    await ownerApi().on('GET', '/v1/restaurants/mine/stats', () => fail
      ? { status: 500, json: { error: { code: 'INTERNAL_SERVER_ERROR', message: 'boom' } } }
      : { json: restaurantStats(30) }).install(page);
    await page.goto('/insights');
    await expect(page.getByRole('alert')).toContainText('حصلت مشكلة', { timeout: 20_000 });
    fail = false;
    await page.getByRole('button', { name: 'حاول تاني' }).click();
    await expect(page.getByTestId('kpi-visits')).toBeVisible();
  });

  test('the overview summarises the last 7 days and links to insights; the QR code counts scans', async ({ page }) => {
    const api = ownerApi().on('GET', '/v1/restaurants/mine/stats', (_request, url) => ({ json: restaurantStats(Number(url.searchParams.get('days'))) }));
    await api.install(page);
    await page.goto('/');
    await expect(page.getByTestId('summary-visits')).toContainText(ar(restaurantStats(7).totals.visits));
    await page.getByTestId('insights-summary').getByRole('link', { name: 'كل الإحصائيات' }).click();
    await expect(page).toHaveURL(/\/insights$/);
    await page.goto('/qr-codes');
    await expect(page.getByTestId('qr-url')).toHaveText('https://tahrir.bilhanah.com/?src=qr');
  });
});

const PAYMENT_ID = 'b7a3c1d2-0000-4000-8000-000000000001';

function onlinePayment(status: OwnerPayment['status']): OwnerPayment {
  return {
    id: PAYMENT_ID, planCode: 'ADVANCED', months: 3, amountPiastres: 3 * 70_000, method: 'PAYMOB', reference: 'PMB-778899', payerName: null, status, hasProof: false,
    rejectionReason: null, createdAt: '2026-10-23T08:00:00.000Z', reviewedAt: status === 'APPROVED' ? '2026-10-23T08:01:00.000Z' : null,
    period: status === 'APPROVED' ? { startsAt: '2026-12-01T00:00:00.000Z', endsAt: '2027-03-01T00:00:00.000Z' } : null,
  };
}

function billing(changes: Partial<BillingSummary> = {}): BillingSummary {
  return {
    access: { status: 'PAID', planCode: 'ORDERS', features: { menu: true, ordering: true, readyAlerts: false, inventory: true, reviews: true, branches: 3 }, planFeatures: PLAN_FEATURES.ORDERS, currentPeriodEndsAt: '2026-12-01T00:00:00.000Z', trialEndsAt: null },
    plans: [
      { code: 'MENU', priceMonthlyPiastres: 25_000, features: { menu: true, ordering: false, readyAlerts: false, inventory: false, reviews: false, branches: 1 } },
      { code: 'ORDERS', priceMonthlyPiastres: 50_000, features: { menu: true, ordering: true, readyAlerts: false, inventory: true, reviews: true, branches: 3 } },
      { code: 'ADVANCED', priceMonthlyPiastres: 70_000, features: { menu: true, ordering: true, readyAlerts: true, inventory: true, reviews: true, branches: 10 } },
    ],
    months: [1, 3, 6, 12],
    instructions: { instapayAddress: 'bilhanah@instapay', vodafoneCashNumber: null, bankName: null, bankAccountName: null, bankAccountNumber: null, notesAr: null, notesEn: null },
    availableMethods: ['INSTAPAY'],
    onlinePayment: true,
    nextPeriodStartsAt: '2026-12-01T00:00:00.000Z',
    pendingPayment: null,
    payments: [],
    ...changes,
  };
}

test.describe('online subscription payment', () => {
  test('pays the chosen plan online: POST then the browser goes to Paymob', async ({ page }) => {
    const api = ownerApi().on('GET', '/v1/billing', { json: billing() })
      .on('POST', '/v1/billing/online', { status: 201, json: { paymentId: PAYMENT_ID, checkoutUrl: 'https://accept.paymob.com/unifiedcheckout/?publicKey=pk&clientSecret=cs' } });
    await api.install(page);
    await page.route('https://accept.paymob.com/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Paymob</title><h1>Paymob checkout</h1>' }));
    await page.goto('/subscription');
    await page.getByRole('radio', { name: /^التجربة الكاملة،/ }).check({ force: true });
    await page.getByRole('radio', { name: '٣ شهور' }).check();
    await expect(page.getByTestId('online-total')).toHaveText(arPrice(210_000));
    await expect(page.getByRole('heading', { name: 'أو حوّل المبلغ بنفسك' })).toBeVisible();
    await expectAccessible(page, 'subscription with online payment');
    await page.getByRole('button', { name: /^ادفع .+ أونلاين$/ }).click();
    await expect(page).toHaveURL(/accept\.paymob\.com\/unifiedcheckout/);
    expect(api.callsTo('POST', '/v1/billing/online')[0]!.body).toEqual({ planCode: 'ADVANCED', months: 3 });
  });

  test('explains when online payment is unavailable', async ({ page }) => {
    await ownerApi().on('GET', '/v1/billing', { json: billing() })
      .on('POST', '/v1/billing/online', { status: 409, json: { error: { code: 'ONLINE_PAYMENT_UNAVAILABLE', message: 'x', details: { reason: 'PAYMOB_ERROR' } } } }).install(page);
    await page.goto('/subscription');
    await page.getByTestId('pay-online').click();
    await expect(page.getByTestId('online-payment').getByRole('alert')).toContainText('الدفع الأونلاين مش متاح دلوقتي');
  });

  test('on return, confirms the payment by polling until it is approved, then cleans the address', async ({ page }) => {
    let calls = 0;
    const api = ownerApi().on('GET', '/v1/billing', () => {
      calls += 1;
      const payment = onlinePayment(calls >= 2 ? 'APPROVED' : 'AWAITING_PAYMENT');
      return { json: billing({ payments: [payment] }) };
    });
    await api.install(page);
    await page.goto(`/subscription?payment=${PAYMENT_ID}&success=true&id=991&hmac=abc`);
    await expect(page.getByTestId('online-return-checking')).toContainText('بنأكد الدفع');
    await expect(page.getByTestId('online-return-approved')).toContainText('١ مارس ٢٠٢٧', { timeout: 10_000 });
    await expect(page).toHaveURL(/\/subscription$/);
    await expect(page.locator('[data-testid="payment-row"][data-status="APPROVED"]')).toContainText('أونلاين (كارت أو محفظة)');
    await expectAccessible(page, 'online payment approved');
  });

  test('a declined payment explains it and focuses the online button to try again', async ({ page }) => {
    await ownerApi().on('GET', '/v1/billing', { json: billing({ payments: [onlinePayment('FAILED')] }) }).install(page);
    await page.goto(`/subscription?payment=${PAYMENT_ID}`);
    await expect(page.getByTestId('online-return-failed')).toBeVisible();
    await expect(page).toHaveURL(/\/subscription$/);
    // The failed plan and length are preselected.
    await expect(page.getByTestId('online-total')).toHaveText(arPrice(210_000));
    await page.getByRole('button', { name: 'جرّب تاني' }).click();
    await expect(page.getByTestId('pay-online')).toBeFocused();
    await expect(page.locator('[data-testid="payment-row"][data-status="FAILED"]')).toContainText('الدفع ما تمّش');
  });

  test('still awaiting payment after a minute: says it may take a moment and offers to check again', async ({ page }) => {
    await page.clock.install();
    let calls = 0;
    await ownerApi().on('GET', '/v1/billing', () => { calls += 1; return { json: billing({ payments: [onlinePayment('AWAITING_PAYMENT')] }) }; }).install(page);
    await page.goto(`/subscription?payment=${PAYMENT_ID}`);
    await expect(page.getByTestId('online-return-checking')).toBeVisible();
    await page.clock.runFor(61_000);
    await expect(page.getByTestId('online-return-slow')).toBeVisible();
    await expect(page).toHaveURL(/\/subscription$/);
    const polled = calls;
    // Fast-forwarded timers skip ticks while a request is in flight, so only "more than once" is certain.
    expect(polled).toBeGreaterThanOrEqual(2);
    await page.clock.runFor(10_000);
    expect(calls, 'polling stops after the wait').toBe(polled);
    await page.getByRole('button', { name: 'اتأكد تاني' }).click();
    await expect(page.getByTestId('online-return-checking')).toBeVisible();
  });
});
