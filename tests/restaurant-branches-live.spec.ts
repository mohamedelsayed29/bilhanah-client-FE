import { test, expect, request, type APIRequestContext, type Page } from '@playwright/test';

// Branches end to end against the running dev stack (API on 127.0.0.1:3000, seeded demo restaurant
// koshary-demo with two branches: main "وسط البلد" and "مدينة نصر", where the first dish's small size
// costs 40 EGP instead of 35). Skipped when the API is not running. Logs in once (owner login is
// limited to 5 per 15 minutes) and places one real pickup order per run.
const API = process.env['E2E_API_URL'] ?? 'http://127.0.0.1:3000';
const DASHBOARD_ORIGIN = 'http://127.0.0.1:5174';
const port = Number(process.env['WEB_E2E_PORT'] ?? 5173);
const menuUrl = (path = '/') => `http://koshary-demo.localhost:${port}${path}`;
const NASR = 'مدينة نصر';
const MAIN = 'وسط البلد';

let owner: APIRequestContext | null = null;
let nasrBranchId = '';
let nasrTableCode = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const probe = await request.newContext();
  const up = await probe.get(`${API}/v1/public/restaurants/koshary-demo/menu`).then(response => response.ok(), () => false);
  await probe.dispose();
  if (!up) return;
  const login = await request.newContext({ extraHTTPHeaders: { Origin: DASHBOARD_ORIGIN } });
  const session = await login.post(`${API}/v1/auth/login`, { data: { email: 'demo-owner@bilhanah.local', password: 'demo-password-1' } });
  expect(session.ok(), await session.text()).toBe(true);
  const { accessToken } = await session.json() as { accessToken: string };
  await login.dispose();
  owner = await request.newContext({ extraHTTPHeaders: { Origin: DASHBOARD_ORIGIN, Authorization: `Bearer ${accessToken}` } });

  const { branches } = await (await owner.get(`${API}/v1/branches`)).json() as { branches: { id: string; slug: string; isActive: boolean }[] };
  const nasr = branches.find(branch => branch.slug === 'nasr-city' && branch.isActive);
  expect(nasr, 'the demo restaurant needs its Nasr City branch').toBeTruthy();
  nasrBranchId = nasr!.id;
  const tables = await (await owner.get(`${API}/v1/tables?branchId=${nasrBranchId}`)).json() as { publicCode: string; isActive: boolean; branchId: string }[];
  const table = tables.find(candidate => candidate.isActive && candidate.branchId === nasrBranchId);
  expect(table, 'Nasr City needs an active table').toBeTruthy();
  nasrTableCode = table!.publicCode;
});

test.afterAll(async () => { await owner?.dispose(); });

test.beforeEach(async ({ page }) => {
  test.skip(!owner, 'The dev API is not running.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => { if (!localStorage.getItem('bilhanah:language:v1')) localStorage.setItem('bilhanah:language:v1', 'ar'); });
});

/** The signature koshary's card: "من ٣٥ – ٦٥" at the main branch, "من ٤٠ – ٦٥" at Nasr City. */
const koshary = (page: Page) => page.locator('.dish-card', { hasText: 'كشري أبو طارق' }).first();

/** Fails the test on uncaught errors and on console errors other than the demo's missing photos. */
function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    // The seeded demo's photos are not on disk (404 with a same-origin resource policy): not this page's doing.
    if (message.type() === 'error' && !/NotSameOrigin|status of 404/.test(message.text())) errors.push(message.text());
  });
  return errors;
}

test('the picker comes first; Nasr City has its own price; the choice is remembered', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto(menuUrl('/'));
  await expect(page.getByRole('heading', { name: 'اختار الفرع' })).toBeVisible();
  await expect(page.locator('.branch-name bdi')).toHaveText([MAIN, NASR]);

  await page.getByRole('button', { name: NASR, exact: true }).click();
  await expect(page).toHaveURL(menuUrl('/?b=nasr-city'));
  await expect(page.locator('.menu-branch')).toContainText(`فرع ${NASR}`);
  await expect(koshary(page)).toContainText('٤٠');
  await expect(page.getByRole('link', { name: 'اتصل' })).toHaveAttribute('href', 'tel:0222220000');

  await page.reload();
  await expect(page.locator('.menu-branch')).toContainText(NASR);
  await expect(page.locator('.branch-option')).toHaveCount(0);
  await page.goto(menuUrl('/'));
  await expect(page.locator('.menu-branch')).toContainText(NASR);
  await expect(page).toHaveURL(menuUrl('/?b=nasr-city'));

  await page.getByRole('button', { name: 'غيّر الفرع' }).click();
  await page.getByRole('button', { name: MAIN, exact: true }).click();
  await expect(page).toHaveURL(menuUrl('/?b=main'));
  await expect(koshary(page)).toContainText('٣٥');
  await expect(koshary(page)).not.toContainText('٤٠');
  expect(errors).toEqual([]);
});

test('a ?b= link opens its branch directly', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto(menuUrl('/?b=nasr-city&src=qr'));
  await expect(page.locator('.menu-branch')).toContainText(NASR);
  await expect(page.locator('.branch-option')).toHaveCount(0);
  await expect(koshary(page)).toContainText('٤٠');
  await expect(page).toHaveURL(menuUrl('/?b=nasr-city'));
  expect(errors).toEqual([]);
});

test('an unknown ?b= shows the picker with a notice', async ({ page }) => {
  await page.goto(menuUrl('/?b=no-such-branch'));
  await expect(page.locator('.branch-notice')).toContainText('الفرع اللي في اللينك مبقاش متاح');
  await expect(page.locator('.branch-option')).toHaveCount(2);
  await expect(page).toHaveURL(menuUrl('/'));
});

test('a Nasr City table QR opens Nasr City without the picker, pinned', async ({ page }) => {
  const errors = watchConsole(page);
  // Even when this phone chose the main branch before.
  await page.addInitScript(() => localStorage.setItem('bilhanah:branch:v1:koshary-demo', 'main'));
  await page.goto(menuUrl(`/?t=${nasrTableCode}`));
  await expect(page.locator('.table-badge')).toBeVisible();
  await expect(page.locator('.menu-branch')).toContainText(NASR);
  await expect(page.locator('.branch-option')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'غيّر الفرع' })).toHaveCount(0);
  await expect(koshary(page)).toContainText('٤٠');
  await expect(page).toHaveURL(menuUrl('/?b=nasr-city'));
  expect(errors).toEqual([]);
});

test('a pickup order at Nasr City reaches that branch, and its page shows the branch', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchConsole(page);
  const customerName = `E2E فرع ${Date.now().toString(36)}`;
  await page.goto(menuUrl('/?b=nasr-city'));
  await page.getByRole('button', { name: 'أضف ليمون نعناع للطلب' }).click();
  await page.locator('.cart-bar').click();
  await page.getByRole('button', { name: /كمّل الطلب/ }).click();
  const dialog = page.getByRole('dialog', { name: 'تأكيد الطلب' });
  await expect(dialog.locator('.checkout-branch')).toHaveText(`طلبك رايح فرع ${NASR}`);
  await dialog.getByRole('radio', { name: 'تيك أواي' }).check();
  await dialog.getByLabel('اسمك', { exact: true }).fill(customerName);
  await dialog.getByLabel('رقم موبايلك').fill('01011112222');
  const placed = page.waitForResponse(response => response.url().endsWith('/v1/public/restaurants/koshary-demo/orders') && response.request().method() === 'POST');
  await dialog.getByRole('button', { name: /ابعت الطلب/ }).click();
  expect((await placed).request().postDataJSON()).toMatchObject({ type: 'PICKUP', branch: 'nasr-city' });

  await expect(page).toHaveURL(/\/order\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('وصل طلبك للمطعم');
  const card = page.getByRole('region', { name: 'هتستلم طلبك من' });
  await expect(card).toContainText(NASR);
  await expect(card).toContainText('5 شارع عباس العقاد');
  await expect(card.getByRole('link', { name: /اتصل بفرع مدينة نصر/ })).toHaveAttribute('href', 'tel:0222220000');

  const board = await (await owner!.get(`${API}/v1/orders?view=active&pageSize=100&branchId=${nasrBranchId}`)).json() as { items: { customerName: string; branchName: string }[] };
  expect(board.items.find(order => order.customerName === customerName)?.branchName).toBe(NASR);

  await page.getByRole('link', { name: 'ارجع للمنيو' }).click();
  await expect(page.locator('.menu-branch')).toContainText(NASR);
  await expect(page).toHaveURL(menuUrl('/?b=nasr-city'));
  expect(errors).toEqual([]);
});
