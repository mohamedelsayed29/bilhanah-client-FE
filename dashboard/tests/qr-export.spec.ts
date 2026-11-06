import { readFile } from 'node:fs/promises';
import { expect, request as playwrightRequest, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import type { RestaurantTable } from '@bilhanah/contracts';
import { API_URL, DASHBOARD_ORIGIN, expectAccessible, registerOwner, uniqueSuffix } from './helpers';

test.describe.configure({ mode: 'serial' });

const suffix = uniqueSuffix();
const owner = { email: `qrx-${suffix}@e2e-bilhanah.test`, password: 'Molokhia-Tuesday-2026', fullName: 'هبة الاختبار', restaurant: 'كافيه هبة', subdomain: `e2e-qrx-${suffix}` };

let context: BrowserContext;
let page: Page;
let api: APIRequestContext;
let token = '';

async function ownerApi<T>(method: 'GET' | 'POST', path: string, data?: unknown): Promise<T> {
  const response = await api.fetch(`${API_URL}${path}`, { method, data, headers: { Authorization: `Bearer ${token}`, Origin: DASHBOARD_ORIGIN } });
  expect(response.ok(), `${method} ${path}: ${response.status()} ${await response.text()}`).toBe(true);
  return (await response.json().catch(() => null)) as T;
}

/** The file names and contents in a stored ZIP. */
function unzip(bytes: Buffer): { name: string; data: Buffer }[] {
  const end = bytes.length - 22;
  const count = bytes.readUInt16LE(end + 10);
  let at = bytes.readUInt32LE(end + 16);
  const files = [];
  for (let index = 0; index < count; index += 1) {
    const size = bytes.readUInt32LE(at + 20);
    const nameLength = bytes.readUInt16LE(at + 28);
    const local = bytes.readUInt32LE(at + 42);
    const name = bytes.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    const localName = bytes.readUInt16LE(local + 26);
    files.push({ name, data: bytes.subarray(local + 30 + localName, local + 30 + localName + size) });
    at += 46 + nameLength;
  }
  return files;
}

/** Width, height and dpi of a PNG. */
function png(data: Buffer) {
  expect(data.subarray(1, 4).toString()).toBe('PNG');
  const phys = data.indexOf('pHYs');
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20), dpi: phys > 0 ? Math.round(data.readUInt32BE(phys + 4) * 0.0254) : 0 };
}

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  page = await context.newPage();
  api = await playwrightRequest.newContext();
});
test.afterAll(async () => {
  await context.close();
  await api.dispose();
});

test('table codes download one by one or together, as PNG or SVG, at print sizes, and print in ready layouts', async () => {
  await registerOwner(page, owner);
  const login = await api.post(`${API_URL}/v1/auth/login`, { data: { email: owner.email, password: owner.password }, headers: { Origin: DASHBOARD_ORIGIN } });
  token = ((await login.json()) as { accessToken: string }).accessToken;
  for (const label of ['T1', 'T2', 'T3', 'طاولة ٤', 'T5']) await ownerApi('POST', '/v1/tables', { label });
  const tables = await ownerApi<RestaurantTable[]>('GET', '/v1/tables');
  expect(tables).toHaveLength(5);

  // One table, from its QR dialog: a poster-size PNG and a sticker-size SVG.
  await page.goto('/tables');
  const side = page.getByRole('complementary', { name: 'الطاولات والحجوزات' });
  await side.getByRole('button', { name: 'إجراءات T1', exact: true }).click();
  await page.getByRole('menuitem', { name: 'كود QR' }).click();
  const dialog = page.getByRole('dialog', { name: 'كود «T1»' });
  await expect(dialog.getByRole('radio', { name: /كارت طاولة/ })).toBeChecked();
  await dialog.getByRole('radio', { name: /بوستر/ }).check({ force: true });
  const [posterPng] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'نزّل PNG لـT1' }).click()]);
  expect(posterPng.suggestedFilename()).toBe(`bilhanah-${owner.subdomain}-t1-15cm.png`);
  const poster = png(await readFile((await posterPng.path())!));
  expect(poster.width).toBe(poster.height);
  expect(Math.abs(poster.dpi - 300)).toBeLessThan(25);
  expect((poster.width / poster.dpi) * 2.54).toBeCloseTo(15, 1);
  await dialog.getByRole('radio', { name: /ستيكر/ }).check({ force: true });
  const [stickerSvg] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'نزّل SVG لـT1' }).click()]);
  expect(stickerSvg.suggestedFilename()).toBe(`bilhanah-${owner.subdomain}-t1-3cm.svg`);
  const svg = await readFile((await stickerSvg.path())!, 'utf8');
  expect(svg).toContain('width="30mm"');
  expect(svg).toContain('shape-rendering="crispEdges"');
  await page.keyboard.press('Escape');

  // The print page: every active table, six per sheet by default.
  await page.getByRole('link', { name: 'اطبع الأكواد' }).click();
  await expect(page.getByTestId('print-card')).toHaveCount(5);
  await expect(page.locator('.print-sheet')).toHaveCount(1);
  await expect(page.getByTestId('print-card').first()).toContainText(owner.restaurant);
  await expect(page.getByTestId('print-card').first()).toContainText('T1');
  await expectAccessible(page, 'print and export');

  // Other layouts: stickers fit all on one sheet, four large cards need two, one tent or poster per sheet.
  const layout = (name: RegExp) => page.getByRole('group', { name: 'شكل الطباعة' }).getByRole('radio', { name }).check({ force: true });
  await layout(/ستيكرات/);
  await expect(page.locator('.print-sheet.layout-stickers')).toHaveCount(1);
  await layout(/كروت كبيرة/);
  await expect(page.locator('.print-sheet.layout-cards4')).toHaveCount(2);
  await layout(/ستاند بيتطبق/);
  await expect(page.locator('.print-sheet.layout-tent')).toHaveCount(5);
  await expect(page.locator('.print-sheet.layout-tent').first().locator('.print-card')).toHaveCount(2);
  await layout(/بوستر/);
  await expect(page.locator('.print-sheet.layout-poster')).toHaveCount(5);

  // Pick tables: leave T2 out of both the print and the download.
  await page.getByTestId('print-table-toggle').nth(1).uncheck();
  await expect(page.getByTestId('print-card')).toHaveCount(4);
  await expect(page.locator('[data-testid="print-card"]', { hasText: 'T2' })).toHaveCount(0);

  // All chosen codes in one ZIP, as PNG and as SVG.
  const [pngZip] = await Promise.all([page.waitForEvent('download'), page.getByTestId('qr-zip').click()]);
  expect(pngZip.suggestedFilename()).toBe(`bilhanah-${owner.subdomain}-qr-png-5cm.zip`);
  const pngs = unzip(await readFile((await pngZip.path())!));
  expect(pngs.map(file => file.name).sort()).toEqual([`bilhanah-${owner.subdomain}-t1-5cm.png`, `bilhanah-${owner.subdomain}-t3-5cm.png`, `bilhanah-${owner.subdomain}-t5-5cm.png`, `bilhanah-${owner.subdomain}-طاولة-٤-5cm.png`].sort());
  for (const file of pngs) {
    const image = png(file.data);
    expect(image.width).toBe(image.height);
    expect((image.width / image.dpi) * 2.54).toBeCloseTo(5, 1);
  }
  await page.getByRole('radio', { name: 'SVG' }).check({ force: true });
  await page.getByRole('group', { name: 'مقاس الطباعة' }).getByRole('radio', { name: /ستاند/ }).check({ force: true });
  const [svgZip] = await Promise.all([page.waitForEvent('download'), page.getByTestId('qr-zip').click()]);
  const svgs = unzip(await readFile((await svgZip.path())!));
  expect(svgs).toHaveLength(4);
  for (const file of svgs) expect(file.data.toString('utf8')).toContain('width="80mm"');

  // The printed page hides everything around the sheets.
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.qr-export')).toBeHidden();
  await expect(page.getByTestId('print-card').first()).toBeVisible();
  await page.emulateMedia({ media: 'screen' });
});
