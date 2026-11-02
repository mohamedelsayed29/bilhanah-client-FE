import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { OpeningHours, PublicBranch, PublicMenuResponse } from '@bilhanah/contracts';
import { allDays, apiError, json, menuFixture, orderFixture, restaurantUrl, TOKEN } from './ordering-fixtures';

// Restaurants with several branches, against a mocked API: the picker, the branch in the menu's
// header, per-branch carts, and orders sent to the chosen branch. restaurant-branches-live.spec.ts
// covers the same against the running API.

const closedAllWeek = { sat: [], sun: [], mon: [], tue: [], wed: [], thu: [], fri: [] };
const BRANCHES: PublicBranch[] = [
  { slug: 'main', name: 'وسط البلد', isMain: true, phone: '01012345678', whatsappNumber: '01012345678', city: 'القاهرة', address: '١٦ شارع معروف', mapUrl: null, openingHours: allDays([{ opens: '00:00', closes: '23:59' }]), acceptingOrders: true },
  // Opens in the evening only: closed at the test's fixed time (Monday 10:00 in Cairo).
  { slug: 'maadi', name: 'المعادي', isMain: false, phone: '0225250000', whatsappNumber: null, city: 'القاهرة', address: 'شارع ٩', mapUrl: 'https://maps.example.com/maadi', openingHours: { ...closedAllWeek, mon: [{ opens: '18:00', closes: '23:00' }] } as OpeningHours, acceptingOrders: true },
  { slug: 'zamalek', name: 'Zamalek', isMain: false, phone: '0227350000', whatsappNumber: null, city: 'Cairo', address: '26 July Street', mapUrl: null, openingHours: null, acceptingOrders: false },
];
/** Lemon mint costs 45 at the main branch and 50 at Maadi. */
const LEMON_PRICE: Record<string, number> = { main: 4500, maadi: 5000, zamalek: 4500 };
const ordersRoute = '**/v1/public/restaurants/koshary/orders';

function branchMenu(slug: string): PublicMenuResponse {
  const branch = BRANCHES.find(candidate => candidate.slug === slug)!;
  const base = menuFixture({ openingHours: branch.openingHours, ordering: { accepting: branch.acceptingOrders, dineIn: true, pickup: true } });
  if (base.restaurant.availability !== 'AVAILABLE') throw new Error('unreachable');
  return {
    restaurant: { ...base.restaurant, phone: branch.phone, whatsappNumber: branch.whatsappNumber, city: branch.city, address: branch.address, branch, branches: BRANCHES },
    categories: base.categories.map(category => ({ ...category, items: category.items.map(item => item.id === 'lemon'
      ? { ...item, variants: item.variants.map(variant => ({ ...variant, pricePiastres: LEMON_PRICE[slug]! })) }
      : item) })),
  };
}

/** Serves each branch's menu; returns the branches requested, in order ('' for none). */
async function serveBranches(page: Page) {
  const requested: string[] = [];
  await page.route(url => url.pathname === '/v1/public/restaurants/koshary/menu', route => {
    const slug = new URL(route.request().url()).searchParams.get('branch') ?? '';
    requested.push(slug);
    if (slug && !BRANCHES.some(branch => branch.slug === slug)) return route.fulfill(apiError(404, 'BRANCH_NOT_FOUND'));
    return route.fulfill(json(branchMenu(slug || 'main')));
  });
  return requested;
}

test.beforeEach(async ({ page }) => {
  // Monday 2 November 2026, 10:00 in Cairo.
  await page.clock.setFixedTime(new Date('2026-11-02T08:00:00Z'));
  await page.setViewportSize({ width: 390, height: 844 });
});

const option = (page: Page, name: string) => page.locator('.branch-option', { has: page.getByRole('button', { name, exact: true }) });

test('asks for the branch first: main first, open or not, taking orders or not, and how to reach it', async ({ page }) => {
  await serveBranches(page);
  await page.goto(restaurantUrl());

  await expect(page.getByRole('heading', { name: 'اختار الفرع' })).toBeVisible();
  await expect(page.locator('.branch-name bdi')).toHaveText(['وسط البلد', 'المعادي', 'Zamalek']);
  await expect(page.locator('.dish-card')).toHaveCount(0);
  await expect(option(page, 'وسط البلد')).toContainText('مفتوح دلوقتي');
  await expect(option(page, 'المعادي')).toContainText('مقفول · بيفتح النهارده ٦:٠٠ م');
  await expect(option(page, 'Zamalek')).toContainText('مش بياخد طلبات دلوقتي');
  await expect(option(page, 'المعادي').getByRole('link', { name: 'الطريق إلى فرع المعادي' })).toHaveAttribute('href', 'https://maps.example.com/maadi');
  await expect(option(page, 'المعادي').getByRole('link', { name: 'اتصل بفرع المعادي' })).toHaveAttribute('href', 'tel:0225250000');
  await expect(option(page, 'وسط البلد').getByRole('link', { name: /الطريق/ })).toHaveCount(0);
  for (const target of await page.locator('.branch-choose, .branch-link').all()) {
    const box = (await target.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(result.violations.filter(violation => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([]);

  // The branch's own menu: its price, its contact details, its map.
  await page.getByRole('button', { name: 'المعادي', exact: true }).click();
  await expect(page).toHaveURL(restaurantUrl('/?b=maadi'));
  await expect(page.locator('.menu-branch')).toContainText('فرع المعادي');
  await expect(page.locator('.dish-card', { hasText: 'ليمون نعناع' })).toContainText('٥٠');
  await expect(page.getByRole('link', { name: 'اتصل' })).toHaveAttribute('href', 'tel:0225250000');
  await expect(page.getByRole('link', { name: 'الاتجاهات' })).toHaveAttribute('href', 'https://maps.example.com/maadi');

  // A branch not taking orders shows its menu without the cart.
  await page.getByRole('button', { name: 'غيّر الفرع' }).click();
  await expect(option(page, 'المعادي')).toContainText('الفرع الحالي');
  await page.getByRole('button', { name: 'Zamalek', exact: true }).click();
  await expect(page.locator('.menu-branch')).toContainText('فرع Zamalek');
  await expect(page.locator('.dish-card').first()).toBeVisible();
  await expect(page.locator('.dish-add')).toHaveCount(0);
});

test('keeps one cart per branch, priced by that branch', async ({ page }) => {
  await serveBranches(page);
  await page.goto(restaurantUrl('/?b=main'));
  await page.getByRole('button', { name: 'أضف ليمون نعناع للطلب' }).click();
  await expect(page.locator('.cart-bar')).toContainText('٤٥');

  await page.getByRole('button', { name: 'غيّر الفرع' }).click();
  await page.getByRole('button', { name: 'المعادي', exact: true }).click();
  await expect(page.locator('.menu-branch')).toContainText('فرع المعادي');
  await expect(page.locator('.cart-bar')).toHaveCount(0);
  await page.getByRole('button', { name: 'أضف ليمون نعناع للطلب' }).click();
  await page.getByRole('button', { name: /أضف ليمون نعناع تاني/ }).click();
  await expect(page.locator('.cart-bar')).toContainText('١٠٠');

  await page.getByRole('button', { name: 'غيّر الفرع' }).click();
  await page.getByRole('button', { name: 'وسط البلد', exact: true }).click();
  await expect(page.locator('.cart-bar')).toContainText('٤٥');
  const carts = await page.evaluate(() => [localStorage.getItem('bilhanah:cart:v1:koshary'), localStorage.getItem('bilhanah:cart:v1:koshary:maadi')].map(value => JSON.parse(value ?? 'null')?.lines?.[0]?.quantity));
  expect(carts).toEqual([1, 2]);
});

test('sends the order to the chosen branch, and offers another when that branch stops taking orders', async ({ page }) => {
  await serveBranches(page);
  const bodies: Record<string, unknown>[] = [];
  await page.route(ordersRoute, route => {
    bodies.push(route.request().postDataJSON());
    return route.fulfill(apiError(404, 'BRANCH_NOT_FOUND'));
  });
  // Maadi is closed at this hour; Zamalek takes no orders: order from the main branch.
  await page.goto(restaurantUrl('/?b=main'));
  await page.getByRole('button', { name: 'أضف ليمون نعناع للطلب' }).click();
  await page.locator('.cart-bar').click();
  await page.getByRole('button', { name: /كمّل الطلب/ }).click();
  const dialog = page.getByRole('dialog', { name: 'تأكيد الطلب' });
  await expect(dialog.locator('.checkout-branch')).toHaveText('طلبك رايح فرع وسط البلد');
  await dialog.getByRole('radio', { name: 'تيك أواي' }).check();
  await dialog.getByLabel('اسمك', { exact: true }).fill('أحمد');
  await dialog.getByLabel('رقم موبايلك').fill('01011112222');
  await dialog.getByRole('button', { name: /ابعت الطلب/ }).click();

  await expect(dialog.getByRole('alert')).toContainText('الفرع ده مبقاش بياخد طلبات. اختار فرع تاني.');
  expect(bodies[0]).toMatchObject({ type: 'PICKUP', branch: 'main', customerName: 'أحمد' });
  await dialog.getByRole('button', { name: 'اختار فرع تاني' }).click();
  await expect(page.getByRole('heading', { name: 'اختار الفرع' })).toBeVisible();
});

test('the menu of a closed branch says the branch is closed, not the restaurant', async ({ page }) => {
  await serveBranches(page);
  await page.goto(restaurantUrl('/?b=maadi'));
  await page.getByRole('button', { name: 'أضف ليمون نعناع للطلب' }).click();
  await page.locator('.cart-bar').click();
  await expect(page.getByRole('dialog', { name: 'طلبك' }).locator('.order-closed')).toHaveText('الفرع ده مقفول دلوقتي. بيفتح النهارده ٦:٠٠ م.');
});

test('a table QR decides the branch and pins the menu to it', async ({ page }) => {
  const requested = await serveBranches(page);
  await page.route('**/v1/public/restaurants/koshary/tables/MAADI005', route => route.fulfill(json({ label: '5', branch: 'maadi' })));
  // A branch chosen earlier on this phone does not override the table.
  await page.addInitScript(() => localStorage.setItem('bilhanah:branch:v1:koshary', 'main'));
  await page.goto(restaurantUrl('/?t=MAADI005'));

  await expect(page.locator('.table-badge')).toHaveText('طاولة ٥');
  await expect(page.locator('.menu-branch')).toContainText('فرع المعادي');
  await expect(page.getByRole('button', { name: 'غيّر الفرع' })).toHaveCount(0);
  await expect(page.locator('.dish-card', { hasText: 'ليمون نعناع' })).toContainText('٥٠');
  await expect(page).toHaveURL(restaurantUrl('/?b=maadi'));
  expect(requested.at(-1)).toBe('maadi');

  await page.reload();
  await expect(page.locator('.table-badge')).toHaveText('طاولة ٥');
  await expect(page.getByRole('button', { name: 'غيّر الفرع' })).toHaveCount(0);
});

test('an unknown branch link shows the picker with a notice, and the choice is remembered', async ({ page }) => {
  await serveBranches(page);
  await page.goto(restaurantUrl('/?b=gone&utm=story'));
  await expect(page.locator('.branch-notice')).toHaveText('الفرع اللي في اللينك مبقاش متاح. اختار فرع من دول.');
  await expect(page).toHaveURL(restaurantUrl('/?utm=story'));

  await page.getByRole('button', { name: 'المعادي', exact: true }).click();
  await expect(page).toHaveURL(restaurantUrl('/?utm=story&b=maadi'));
  await page.goto(restaurantUrl('/'));
  await expect(page.locator('.menu-branch')).toContainText('فرع المعادي');
  await expect(page).toHaveURL(restaurantUrl('/?b=maadi'));
});

test('the order page shows the branch that has the order, and leads back to its menu', async ({ page }) => {
  const requested = await serveBranches(page);
  const branch = { slug: 'maadi', name: 'المعادي', phone: '0225250000', city: 'القاهرة', address: 'شارع ٩', mapUrl: 'https://maps.example.com/maadi', isMain: false };
  await page.route('**/v1/public/orders/**', route => route.fulfill(json(orderFixture('READY', { type: 'PICKUP', tableLabel: null, branch, restaurant: { name: 'كشري أبو طارق', subdomain: 'koshary', phone: branch.phone, logo: null, brandColor: '#b4432f' } }))));
  await page.routeWebSocket(/\/v1\/realtime\//, ws => { void ws.close({ code: 1011 }); });
  await page.goto(restaurantUrl(`/order/${TOKEN}`));

  const card = page.getByRole('region', { name: 'هتستلم طلبك من' });
  await expect(card).toContainText('المعادي');
  await expect(card).toContainText('شارع ٩، القاهرة');
  await expect(card.getByRole('link', { name: /اتصل بفرع المعادي/ })).toHaveAttribute('href', 'tel:0225250000');
  await expect(card.getByRole('link', { name: 'الاتجاهات' })).toHaveAttribute('href', 'https://maps.example.com/maadi');
  await expect(page.getByRole('link', { name: 'كلّم المطعم' })).toHaveCount(0);

  // Opened from the order's link, without a branch chosen yet: back to the menu is the order's branch.
  await page.getByRole('link', { name: 'ارجع للمنيو' }).click();
  await expect(page.locator('.menu-branch')).toContainText('فرع المعادي');
  await expect(page).toHaveURL(restaurantUrl('/?b=maadi'));
  expect(requested.at(-1)).toBe('maadi');
});
