import { test, expect, request, type APIRequestContext } from '@playwright/test';
import type { PublicMenuItem, PublicMenuResponse } from '@bilhanah/contracts';

// Upselling end to end against the running dev stack (API on 127.0.0.1:3000, seeded demo restaurant
// koshary-demo). Sets up suggestions through the API, then a diner adds a dish with an add-on,
// takes a suggestion in the cart, upgrades a line, and places the order; the owner's report counts
// it. The rules are removed afterwards. Skipped when the API is not running.
const API = process.env['E2E_API_URL'] ?? 'http://127.0.0.1:3000';
const DASHBOARD_ORIGIN = 'http://127.0.0.1:5174';
const port = Number(process.env['WEB_E2E_PORT'] ?? 5173);
const menuUrl = (path = '/') => `http://koshary-demo.localhost:${port}${path}`;

let owner: APIRequestContext | null = null;
let dishes: { main: PublicMenuItem; sized: PublicMenuItem; addOn: PublicMenuItem; side: PublicMenuItem } | null = null;
const created: string[] = [];

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const probe = await request.newContext();
  const menu = await probe.get(`${API}/v1/public/restaurants/koshary-demo/menu`).then(async response => (response.ok() ? (await response.json()) as PublicMenuResponse : null), () => null);
  await probe.dispose();
  if (!menu || !menu.restaurant.availability || !('ordering' in menu.restaurant) || !menu.restaurant.ordering.accepting) return;
  const items = menu.categories.flatMap(category => category.items).filter(item => item.isAvailable);
  const sized = items.find(item => item.variants.length > 1);
  const single = items.filter(item => item.variants.length === 1);
  if (!sized || single.length < 3) return;
  dishes = { main: single[0]!, addOn: single[1]!, side: single[2]!, sized };
  const login = await request.newContext({ extraHTTPHeaders: { Origin: DASHBOARD_ORIGIN } });
  const session = await login.post(`${API}/v1/auth/login`, { data: { email: 'demo-owner@bilhanah.local', password: 'demo-password-1' } });
  expect(session.ok(), await session.text()).toBe(true);
  const { accessToken } = await session.json() as { accessToken: string };
  await login.dispose();
  owner = await request.newContext({ extraHTTPHeaders: { Origin: DASHBOARD_ORIGIN, Authorization: `Bearer ${accessToken}` } });
  const rule = async (body: Record<string, unknown>) => {
    const response = await owner!.post(`${API}/v1/recommendations`, { data: body });
    expect(response.ok(), await response.text()).toBe(true);
    created.push(((await response.json()) as { id: string }).id);
  };
  await rule({ sourceItemId: dishes.main.id, type: 'ADD_ON', placements: ['PRODUCT_DETAILS'], required: true, title: 'اختار إضافة', items: [{ itemId: dishes.addOn.id, maxQuantity: 3 }] });
  await rule({ sourceItemId: dishes.main.id, type: 'FREQUENTLY_BOUGHT_TOGETHER', placements: ['CART'], items: [{ itemId: dishes.side.id }] });
  await rule({ sourceItemId: dishes.sized.id, type: 'UPGRADE', placements: ['CART'], items: [{ itemId: dishes.sized.id, variantId: dishes.sized.variants.at(-1)!.id }] });
});

test.afterAll(async () => {
  for (const id of created) await owner?.delete(`${API}/v1/recommendations/${id}`);
  await owner?.dispose();
});

test.beforeEach(async ({ page }) => {
  test.skip(!owner || !dishes, 'The dev API is not running, or the demo menu has no dishes to pair.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => { localStorage.setItem('bilhanah:language:v1', 'ar'); localStorage.removeItem('bilhanah:cart:v1:koshary-demo'); });
});

test('a diner adds a required add-on, takes a suggestion, upgrades a dish, and the order counts them', async ({ page }) => {
  const d = dishes!;
  const price = (item: PublicMenuItem, index = 0) => item.variants[index]!.pricePiastres;
  const events: string[] = [];
  page.on('request', sent => { if (sent.url().includes('/recommendation-events')) events.push(sent.postData() ?? ''); });
  await page.goto(menuUrl('/'));

  // The dish page: a required add-on blocks adding until picked; the total includes it.
  await page.locator('.dish-card', { hasText: d.main.nameAr }).first().click();
  const sheet = page.getByRole('dialog');
  const extra = sheet.locator(`[data-testid="extra"][data-item="${d.addOn.nameAr}"]`);
  await expect(extra).toBeVisible();
  await sheet.getByRole('button', { name: /أضف للطلب/ }).click();
  await expect(sheet.getByText('اختار الإضافة المطلوبة الأول.')).toBeVisible();
  await extra.getByRole('checkbox').check();
  await extra.getByRole('button', { name: 'أكتر' }).click();
  const egp = (piastres: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(piastres / 100);
  await expect(sheet.getByRole('button', { name: /أضف للطلب/ })).toContainText(egp(price(d.main) + price(d.addOn) * 2));
  await sheet.getByRole('button', { name: /أضف للطلب/ }).click();
  await expect(sheet).toBeHidden();

  // A sized dish too, then the cart: the suggestion and the upgrade, without losing anything.
  await page.locator('.dish-card', { hasText: d.sized.nameAr }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: /أضف للطلب/ }).click();
  await page.locator('.cart-bar').click();
  const cartSheet = page.getByRole('dialog');
  await expect(cartSheet.locator('.cart-line')).toHaveCount(3);
  const before = price(d.main) + price(d.addOn) * 2 + price(d.sized);
  await expect(cartSheet.locator('.order-total')).toContainText(egp(before));
  await cartSheet.locator(`[data-testid="suggestion"][data-item="${d.side.nameAr}"]`).getByRole('button').click();
  await expect(cartSheet.locator('.cart-line')).toHaveCount(4);
  await cartSheet.getByTestId('upgrade-offer').getByRole('button', { name: 'رقّي' }).click();
  const after = before + price(d.side) + (price(d.sized, d.sized.variants.length - 1) - price(d.sized));
  await expect(cartSheet.locator('.order-total')).toContainText(egp(after));
  await page.screenshot({ path: 'test-results/screens/recommendations-cart-ar.png' });

  // Checkout goes through; the order carries the suggestions.
  await cartSheet.getByRole('button', { name: /كمّل الطلب/ }).click();
  const pickup = cartSheet.getByRole('radio', { name: 'تيك أواي' });
  if (await pickup.count()) await pickup.check();
  await cartSheet.getByLabel('اسمك').fill('منى');
  const phone = cartSheet.getByLabel('رقم موبايلك');
  if (await phone.count()) await phone.fill('01098765432');
  const placed = page.waitForResponse(response => response.url().includes('/orders') && response.request().method() === 'POST');
  await cartSheet.getByRole('button', { name: 'ابعت الطلب' }).click();
  const order = await placed;
  expect(order.status()).toBe(201);
  const sent = JSON.parse(order.request().postData()!) as { items: { recommendation?: { ruleId: string } }[] };
  expect(sent.items.filter(item => item.recommendation).length).toBe(3);

  await expect.poll(() => events.join(' ').includes('"IMPRESSION"')).toBe(true);
  const stats = (await (await owner!.get(`${API}/v1/recommendations/stats?days=1`)).json()) as { rules: { ruleId: string; purchases: number }[] };
  for (const id of created) expect(stats.rules.find(rule => rule.ruleId === id)?.purchases ?? 0).toBeGreaterThanOrEqual(1);
});
