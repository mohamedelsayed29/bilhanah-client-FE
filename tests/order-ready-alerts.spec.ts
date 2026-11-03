import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { OrderAlerts, OrderPushPayload, OrderStatus } from '@bilhanah/contracts';
import { apiError, json, mockRealtime, orderFixture, port, restaurantUrl, serveMenu, TOKEN } from './ordering-fixtures';

// Order-ready alerts (the Full Experience plan) on the tracking page, the Home Screen metadata on
// restaurant pages, and /sw.js, against a mocked API (see ordering-fixtures.ts).
const trackRoute = '**/v1/public/orders/**';
const alertsRoute = '**/v1/public/orders/*/alerts';
const pushRoute = '**/v1/public/orders/*/push';
// A P-256 public key: 65 bytes, uncompressed.
const PUBLIC_KEY = Buffer.from([4, ...Array.from({ length: 64 }, (_, index) => (index * 37 + 11) % 256)]).toString('base64url');
const SUBSCRIPTION = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
  expirationTime: null,
  keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) },
};
const withPush: OrderAlerts = { readyAlerts: true, push: { publicKey: PUBLIC_KEY } };
const notifyMe = 'نبّهني لما طلبي يجهز';

type Recorded = { vibrations: unknown[]; oscillators: number; subscribeOptions?: { userVisibleOnly: boolean; key: number[] } };
const recorded = (page: Page) => page.evaluate(() => (window as unknown as { recorded: Recorded }).recorded);

/** Counts vibrations and chime notes, so tests can tell whether the page rang. */
async function recordAlerts(page: Page) {
  await page.addInitScript(() => {
    const recorded: Recorded = { vibrations: [], oscillators: 0 };
    (window as unknown as { recorded: Recorded }).recorded = recorded;
    navigator.vibrate = pattern => { recorded.vibrations.push(pattern); return true; };
    const createOscillator = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function (this: AudioContext) { recorded.oscillators++; return createOscillator.call(this); };
  });
}

/**
 * Headless Chrome has no push service, so subscribe() and getSubscription() are stubbed; the
 * subscription survives reloads in localStorage, as a real one would. /sw.js still registers for real.
 */
async function stubPushManager(page: Page) {
  await page.addInitScript(subscription => {
    const recorded = () => (window as unknown as { recorded?: Recorded }).recorded;
    const fake = (key: number[]) => ({
      ...subscription,
      options: { userVisibleOnly: true, applicationServerKey: new Uint8Array(key).buffer },
      toJSON: () => subscription,
      unsubscribe: async () => { localStorage.removeItem('test:push-key'); localStorage.setItem('test:unsubscribed', '1'); return true; },
    });
    PushManager.prototype.subscribe = async function (options?: PushSubscriptionOptionsInit) {
      const key = Array.from(new Uint8Array(options!.applicationServerKey as Uint8Array));
      const record = recorded();
      if (record) record.subscribeOptions = { userVisibleOnly: !!options!.userVisibleOnly, key };
      localStorage.setItem('test:push-key', JSON.stringify(key));
      return fake(key) as unknown as PushSubscription;
    };
    PushManager.prototype.getSubscription = async function () {
      const key = localStorage.getItem('test:push-key');
      return key ? fake(JSON.parse(key) as number[]) as unknown as PushSubscription : null;
    };
  }, SUBSCRIPTION);
}

async function trackOrder(page: Page, status: OrderStatus, alerts: OrderAlerts | null) {
  const realtime = await mockRealtime(page, 'live');
  await page.route(trackRoute, route => route.fulfill(json(orderFixture(status))));
  if (alerts) await page.route(alertsRoute, route => route.fulfill(json(alerts)));
  return realtime;
}

async function axe(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(result.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([]);
}

test('a plan without ready alerts tracks the order without a panel, a chime or a buzz', async ({ page }) => {
  await recordAlerts(page);
  const realtime = await trackOrder(page, 'PREPARING', { readyAlerts: false, push: null });
  await page.goto(restaurantUrl(`/order/${TOKEN}`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('طلبك بيتحضّر');
  await expect(page.locator('.track-live')).toHaveText('تحديث مباشر');
  await expect(page.locator('.track-alerts')).toHaveCount(0);

  realtime.push(orderFixture('READY'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('طلبك جاهز!');
  await page.waitForTimeout(300);
  expect(await recorded(page)).toMatchObject({ vibrations: [], oscillators: 0 });
});

test('a failed alerts request counts as a plan without alerts', async ({ page }) => {
  await recordAlerts(page);
  const realtime = await trackOrder(page, 'PREPARING', null);
  await page.route(alertsRoute, route => route.fulfill(apiError(500, 'INTERNAL')));
  await page.goto(restaurantUrl(`/order/${TOKEN}`));
  await expect(page.locator('.track-live')).toHaveText('تحديث مباشر');
  realtime.push(orderFixture('READY'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('طلبك جاهز!');
  await page.waitForTimeout(300);
  await expect(page.locator('.track-alerts')).toHaveCount(0);
  expect(await recorded(page)).toMatchObject({ vibrations: [], oscillators: 0 });
});

test('turns on push alerts, keeps them on after a reload, and turns them off', async ({ page, context }) => {
  // Three page loads and two accessibility scans.
  test.setTimeout(90_000);
  await context.grantPermissions(['notifications']);
  await recordAlerts(page);
  await stubPushManager(page);
  await trackOrder(page, 'ACCEPTED', withPush);
  const calls: { method: string; body: unknown }[] = [];
  await page.route(pushRoute, route => {
    calls.push({ method: route.request().method(), body: route.request().postDataJSON() });
    return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
  });
  await page.goto(restaurantUrl(`/order/${TOKEN}`));

  const panel = page.getByRole('region', { name: 'تنبيه لما طلبك يجهز' });
  await expect(panel).toContainText('حتى لو قفلت الصفحة');
  await axe(page);
  await panel.getByRole('button', { name: notifyMe }).click();
  await expect(panel).toContainText('هنبعتلك إشعار أول ما يجهز.');
  await expect(panel.getByRole('button', { name: notifyMe })).toHaveCount(0);

  expect(calls).toEqual([{ method: 'POST', body: { ...SUBSCRIPTION, language: 'ar', updates: 'READY' } }]);
  expect((await recorded(page)).subscribeOptions).toEqual({ userVisibleOnly: true, key: [...Buffer.from(PUBLIC_KEY, 'base64url')] });
  // The page's own worker took the subscription.
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration('/'))?.active?.scriptURL)).toBe(restaurantUrl('/sw.js'));
  await axe(page);

  await page.reload();
  await expect(panel).toContainText('هنبعتلك إشعار أول ما يجهز.');
  expect(calls).toHaveLength(1);

  await panel.getByRole('button', { name: 'اقفل التنبيه' }).click();
  await expect(panel.getByRole('button', { name: notifyMe })).toBeVisible();
  expect(calls[1]).toEqual({ method: 'DELETE', body: { endpoint: SUBSCRIPTION.endpoint } });
  // No other order used the subscription, so the browser lets it go too.
  expect(await page.evaluate(() => localStorage.getItem('test:unsubscribed'))).toBe('1');
  await page.reload();
  await expect(panel.getByRole('button', { name: notifyMe })).toBeVisible();
});

test('a failed subscription can be retried, and English pages ask for English notifications', async ({ page, context }) => {
  await page.addInitScript(() => localStorage.setItem('bilhanah:language:v1', 'en'));
  await context.grantPermissions(['notifications']);
  await stubPushManager(page);
  await trackOrder(page, 'PLACED', withPush);
  const bodies: unknown[] = [];
  await page.route(pushRoute, route => {
    bodies.push(route.request().postDataJSON());
    return bodies.length === 1 ? route.fulfill(apiError(503, 'SERVICE_UNAVAILABLE')) : route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
  });
  await page.goto(restaurantUrl(`/order/${TOKEN}`));
  const panel = page.getByRole('region', { name: 'Ready alert' });
  await panel.getByRole('button', { name: 'Notify me when it’s ready' }).click();
  await expect(panel).toContainText('We could not turn on alerts.');
  await panel.getByRole('button', { name: 'Try again' }).click();
  await expect(panel).toContainText('We will notify you the moment it is ready.');
  expect(bodies).toEqual([{ ...SUBSCRIPTION, language: 'en', updates: 'READY' }, { ...SUBSCRIPTION, language: 'en', updates: 'READY' }]);
});

test('a refused push falls back to ringing the open page', async ({ page, context }) => {
  await context.grantPermissions(['notifications']);
  await stubPushManager(page);
  await trackOrder(page, 'PLACED', withPush);
  await page.route(pushRoute, route => route.fulfill(apiError(409, 'PUSH_UNAVAILABLE', { reason: 'NOT_CONFIGURED' })));
  await page.goto(restaurantUrl(`/order/${TOKEN}`));
  const panel = page.getByRole('region', { name: 'تنبيه لما طلبك يجهز' });
  await panel.getByRole('button', { name: notifyMe }).click();
  await expect(panel).toContainText('سيب الصفحة دي مفتوحة');
  await expect(panel.getByRole('button', { name: 'شغّل الصوت' })).toBeVisible();
});

test('blocked notifications explain where to allow them', async ({ page }) => {
  await stubPushManager(page);
  await page.addInitScript(() => {
    let permission: NotificationPermission = localStorage.getItem('test:denied') ? 'denied' : 'default';
    Object.defineProperty(Notification, 'permission', { get: () => permission });
    Notification.requestPermission = async () => { permission = 'denied'; localStorage.setItem('test:denied', '1'); return permission; };
  });
  await trackOrder(page, 'PREPARING', withPush);
  let posts = 0;
  await page.route(pushRoute, route => { posts++; return route.fulfill({ status: 204 }); });
  await page.goto(restaurantUrl(`/order/${TOKEN}`));
  const panel = page.getByRole('region', { name: 'تنبيه لما طلبك يجهز' });
  await panel.getByRole('button', { name: notifyMe }).click();
  await expect(panel).toContainText('الإشعارات مقفولة للموقع ده من إعدادات المتصفح');
  expect(posts).toBe(0);
  // Still blocked on the next visit: no button that cannot work.
  await page.reload();
  await expect(panel).toContainText('الإشعارات مقفولة للموقع ده من إعدادات المتصفح');
  await expect(panel.getByRole('button')).toHaveCount(0);
});

test.describe('on an iPhone browser tab', () => {
  test.use({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
    viewport: { width: 320, height: 640 },
    hasTouch: true,
  });

  test('shows how to add the page to the Home Screen instead of the button', async ({ page }) => {
    // Safari only has Web Push in Home Screen apps.
    await page.addInitScript(() => { delete (window as { PushManager?: unknown }).PushManager; });
    await trackOrder(page, 'ACCEPTED', withPush);
    await page.goto(restaurantUrl(`/order/${TOKEN}`));
    const panel = page.getByRole('region', { name: 'تنبيه لما طلبك يجهز' });
    await expect(panel).toContainText('ضيفها للشاشة الرئيسية');
    await expect(panel.getByRole('listitem')).toHaveText(['١دوس على زرار المشاركة', '٢اختار «إضافة إلى الشاشة الرئيسية»', '٣افتحها من الأيقونة الجديدة، وشغّل التنبيه من هناك']);
    await expect(panel.getByRole('button', { name: notifyMe })).toHaveCount(0);
    await panel.getByRole('button', { name: 'أو شغّل الصوت وسيب الصفحة مفتوحة' }).click();
    await expect(panel).toContainText('الصفحة دي هترن أول ما طلبك يجهز');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await axe(page);
  });

  test('also spots an iPad, which says it is a Mac', async ({ page }) => {
    await page.addInitScript(() => {
      delete (window as { PushManager?: unknown }).PushManager;
      Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15' });
      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 });
    });
    await trackOrder(page, 'ACCEPTED', withPush);
    await page.goto(restaurantUrl(`/order/${TOKEN}`));
    await expect(page.locator('.track-alerts-steps li')).toHaveCount(3);
  });
});

test('browsers without push ring the open page, after a tap that turns the sound on', async ({ page }) => {
  await recordAlerts(page);
  await page.addInitScript(() => { delete (window as { PushManager?: unknown }).PushManager; });
  const realtime = await trackOrder(page, 'PREPARING', withPush);
  await page.goto(restaurantUrl(`/order/${TOKEN}`));
  const panel = page.getByRole('region', { name: 'تنبيه لما طلبك يجهز' });
  await expect(panel).toContainText('سيب الصفحة دي مفتوحة، وهترن وتهتز');
  await expect(panel.getByRole('button', { name: notifyMe })).toHaveCount(0);
  await expect(panel.locator('.track-alerts-steps')).toHaveCount(0);
  await panel.getByRole('button', { name: 'شغّل الصوت' }).click();
  await expect(panel).toContainText('الصفحة دي هترن أول ما طلبك يجهز');

  // Ready: the panel's job is done, and the page rings.
  realtime.push(orderFixture('READY'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('طلبك جاهز!');
  await expect(page.locator('.track-alerts')).toHaveCount(0);
  await expect.poll(async () => (await recorded(page)).vibrations).toEqual([[180, 90, 180]]);
  expect((await recorded(page)).oscillators).toBe(2);
});

test('a server without push keys rings the open page instead', async ({ page }) => {
  await trackOrder(page, 'PLACED', { readyAlerts: true, push: null });
  await page.goto(restaurantUrl(`/order/${TOKEN}`));
  const panel = page.getByRole('region', { name: 'تنبيه لما طلبك يجهز' });
  await expect(panel.getByRole('button', { name: 'شغّل الصوت' })).toBeVisible();
  await expect(panel.getByRole('button', { name: notifyMe })).toHaveCount(0);
});

test('no panel once the order is ready or closed', async ({ page }) => {
  for (const status of ['READY', 'COMPLETED', 'CANCELLED'] satisfies OrderStatus[]) {
    await page.unroute(trackRoute);
    await page.unroute(alertsRoute);
    await trackOrder(page, status, withPush);
    await page.goto(restaurantUrl(`/order/${TOKEN}`));
    await expect(page.locator('.track-hero')).toHaveClass(new RegExp(`status-${status.toLowerCase()}`));
    await page.waitForTimeout(300);
    await expect(page.locator('.track-alerts')).toHaveCount(0);
  }
});

test('restaurant pages carry Home Screen metadata; the marketing site does not', async ({ page }) => {
  await serveMenu(page);
  await trackOrder(page, 'PLACED', withPush);
  const manifest = () => page.locator('link[rel="manifest"]').getAttribute('href').then(href => new URL(href!));

  await page.goto(restaurantUrl('/'));
  await expect(page.getByRole('heading', { level: 1, name: 'كشري أبو طارق' })).toBeVisible();
  expect((await manifest()).pathname).toBe('/v1/public/restaurants/koshary/manifest.webmanifest');
  expect((await manifest()).search).toBe('');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', /\/v1\/public\/restaurants\/koshary\/icon-180\.png$/);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#b4432f');
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
  await expect(page.locator('meta[name="mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'كشري أبو طارق');

  // The tracking page's manifest starts at the order, so a Home Screen app opens straight into it.
  await page.goto(restaurantUrl(`/order/${TOKEN}`));
  await expect(page.locator('.track-hero')).toBeVisible();
  expect((await manifest()).searchParams.get('start')).toBe(`/order/${TOKEN}`);
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1);
  await page.getByRole('link', { name: 'ارجع للمنيو' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'كشري أبو طارق' })).toBeVisible();
  expect((await manifest()).search).toBe('');

  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(0);
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveCount(0);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#FFF8EF');
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
});

test('the service worker shows pushed updates as notifications', async ({ page, context }) => {
  await context.grantPermissions(['notifications']);
  await serveMenu(page);
  const cdp = await context.newCDPSession(page);
  const registrations = new Map<string, string>();
  cdp.on('ServiceWorker.workerRegistrationUpdated', event => { for (const registration of event.registrations) registrations.set(registration.scopeURL, registration.registrationId); });
  await cdp.send('ServiceWorker.enable');
  await page.goto(restaurantUrl('/'));
  await page.evaluate(async () => { await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready; });
  await expect.poll(() => registrations.get(restaurantUrl('/'))).toBeTruthy();
  const registrationId = registrations.get(restaurantUrl('/'))!;
  const origin = `http://koshary.localhost:${port}`;
  const notifications = () => page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications())
    .map(({ title, body, tag, dir, lang, data, icon, badge }) => ({ title, body, tag, dir, lang, url: (data as { url: string }).url, icon, badge })));

  // A local icon: the browser loads it before showing the notification.
  const payload: OrderPushPayload = {
    title: 'طلبك جاهز!', body: 'طلب رقم ١٢ من كشري أبو طارق جاهز.', url: restaurantUrl(`/order/${TOKEN}`), tag: `order-${TOKEN}`, status: 'READY', icon: `${origin}/favicon.svg`,
  };
  await cdp.send('ServiceWorker.deliverPushMessage', { origin, registrationId, data: JSON.stringify(payload) });
  await expect.poll(notifications).toEqual([{ title: payload.title, body: payload.body, tag: payload.tag, dir: 'rtl', lang: 'ar', url: payload.url, icon: payload.icon, badge: `${origin}/brand/notification-badge.png` }]);

  // A newer status replaces the older one under the same tag.
  await cdp.send('ServiceWorker.deliverPushMessage', { origin, registrationId, data: JSON.stringify({ ...payload, title: 'Enjoy your meal!', body: 'Thank you.', status: 'COMPLETED', icon: null }) });
  await expect.poll(notifications).toEqual([expect.objectContaining({ title: 'Enjoy your meal!', tag: payload.tag, dir: 'ltr', lang: 'en', icon: `${origin}/brand/bilhanah-icon-192.png` })]);

  // A push without a readable payload still shows something: browsers require it.
  await cdp.send('ServiceWorker.deliverPushMessage', { origin, registrationId, data: 'not json' });
  await expect.poll(async () => (await notifications()).map(notification => notification.tag)).toContain('bilhanah-order');
  expect((await notifications()).find(notification => notification.tag === 'bilhanah-order')).toMatchObject({ title: 'بالهنا · Bilhanah', url: `${origin}/` });
});
