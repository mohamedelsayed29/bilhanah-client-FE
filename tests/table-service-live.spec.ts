import { test, expect, request, type APIRequestContext } from '@playwright/test';

// Table service requests end to end against the running dev stack (API on 127.0.0.1:3000, seeded
// demo restaurant koshary-demo). A diner scans a table, calls a waiter and asks for water; the
// staff take the requests through the API and the diner sees each step without refreshing.
// Skipped when the API is not running.
const API = process.env['E2E_API_URL'] ?? 'http://127.0.0.1:3000';
const DASHBOARD_ORIGIN = 'http://127.0.0.1:5174';
const port = Number(process.env['WEB_E2E_PORT'] ?? 5173);
const menuUrl = (path = '/') => `http://koshary-demo.localhost:${port}${path}`;

let owner: APIRequestContext | null = null;
let table: { id: string; publicCode: string } | null = null;
let settings: { cooldownSeconds: number; hourlyLimit: number } | null = null;

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
  const mine = await (await owner.get(`${API}/v1/restaurants/mine`)).json() as { mainBranchId: string; serviceRequests: { cooldownSeconds: number; hourlyLimit: number } };
  settings = mine.serviceRequests;
  const tables = await (await owner.get(`${API}/v1/tables?branchId=${mine.mainBranchId}`)).json() as { id: string; publicCode: string; isActive: boolean }[];
  table = tables.find(candidate => candidate.isActive) ?? null;
  expect(table, 'the demo restaurant needs an active table').toBeTruthy();
  // A fresh table session, no leftovers from earlier runs, and room to ask again.
  await owner.post(`${API}/v1/orders/tables/${table!.id}/settle`);
  const open = await (await owner.get(`${API}/v1/service-requests?branchId=${mine.mainBranchId}`)).json() as { items: { id: string }[] };
  for (const item of open.items) await owner.patch(`${API}/v1/service-requests/${item.id}`, { data: { status: 'CANCELLED' } });
  await owner.patch(`${API}/v1/restaurants/mine`, { data: { serviceRequestsEnabled: true, serviceRequestCooldownSeconds: 120, serviceRequestHourlyLimit: 100 } });
});

test.afterAll(async () => {
  if (owner && settings) await owner.patch(`${API}/v1/restaurants/mine`, { data: { serviceRequestCooldownSeconds: settings.cooldownSeconds, serviceRequestHourlyLimit: settings.hourlyLimit } });
  await owner?.dispose();
});

test.beforeEach(async ({ page }) => {
  test.skip(!owner, 'The dev API is not running.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => { if (!localStorage.getItem('bilhanah:language:v1')) localStorage.setItem('bilhanah:language:v1', 'ar'); });
});

test('a seated diner calls the staff and follows each request live', async ({ page }) => {
  await page.goto(menuUrl(`/?t=${table!.publicCode}`));
  await page.getByTestId('service-button').click();
  const sheet = page.getByRole('dialog', { name: /خدمة الترابيزة/ });
  await expect(sheet.getByRole('button', { name: 'نادي الويتر' })).toBeEnabled();

  await sheet.getByRole('button', { name: 'نادي الويتر' }).click();
  await expect(sheet.getByText('وصل طلبك للمطعم.')).toBeVisible();
  const waiter = sheet.locator('[data-testid="my-service-request"][data-type="call_waiter"]');
  await expect(waiter).toContainText('اتبعت، مستني الويتر');
  await expect(page.getByTestId('service-button')).toContainText('١');

  // Asking again while it is open does not send a second one.
  await sheet.getByRole('button', { name: /نادي الويتر/ }).click();
  await expect(sheet.getByText('طلبك ده لسه مفتوح')).toBeVisible();
  await expect(sheet.locator('[data-testid="my-service-request"]')).toHaveCount(1);

  // The staff acknowledge, then complete it: the diner sees both without reloading.
  const { items } = await (await owner!.get(`${API}/v1/service-requests`)).json() as { items: { id: string; type: string; tableLabel: string }[] };
  const request = items.find(item => item.type === 'CALL_WAITER')!;
  await owner!.patch(`${API}/v1/service-requests/${request.id}`, { data: { status: 'ACKNOWLEDGED' } });
  await expect(waiter).toContainText('الويتر شاف طلبك');
  await owner!.patch(`${API}/v1/service-requests/${request.id}`, { data: { status: 'COMPLETED' } });
  await expect(waiter).toContainText('اتنفّذ');

  // Within the cooldown it cannot be repeated.
  await sheet.getByRole('button', { name: 'نادي الويتر' }).click();
  await expect(sheet.getByText(/لسه طالبه من شوية/)).toBeVisible();

  // A custom request, withdrawn before anyone takes it.
  await sheet.getByRole('button', { name: 'حاجة تانية' }).click();
  await sheet.getByLabel('اكتب طلبك').fill('كرسي أطفال');
  await sheet.getByRole('button', { name: 'ابعت' }).click();
  const custom = sheet.locator('[data-testid="my-service-request"][data-type="custom"]');
  await expect(custom).toContainText('كرسي أطفال');
  await custom.getByRole('button', { name: 'الغي' }).click();
  await expect(custom).toContainText('اتلغى');
  await page.screenshot({ path: 'test-results/screens/table-service-ar.png' });
});
