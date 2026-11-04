import { expect, test } from '@playwright/test';
import { API_URL, DASHBOARD_ORIGIN, expectAccessible, registerOwner, screenshot, uniqueSuffix } from './helpers';

const suffix = uniqueSuffix();
const owner = { email: `areas-${suffix}@e2e-bilhanah.test`, password: 'Molokhia-Tuesday-2026', fullName: 'هبة الاختبار', restaurant: 'كافيه هبة', subdomain: `e2e-area-${suffix}` };

test.use({ viewport: { width: 1440, height: 900 } });

test('owners divide the restaurant into areas, put tables in them, move and filter them, and delete areas safely', async ({ page }) => {
  await registerOwner(page, owner);
  await page.goto('/tables');
  const dialog = page.getByRole('dialog');
  const row = (label: string) => page.locator(`[data-testid="table-item"][data-label="${label}"]`);
  const group = (name: string) => page.locator(`[data-testid="table-group"][data-area="${name}"]`);
  const openAreas = () => page.getByRole('button', { name: 'المناطق', exact: true }).click();

  // Two areas: the garden from a suggestion (outdoor), the main hall typed in (indoor).
  await openAreas();
  await dialog.getByRole('button', { name: 'ضيف منطقة' }).click();
  await dialog.getByRole('button', { name: 'الجنينة' }).click();
  await expect(dialog.getByRole('radio', { name: 'خارجي' })).toBeChecked();
  await expect(dialog.getByRole('radio', { name: 'جنينة' })).toBeChecked();
  await expectAccessible(page, 'add area dialog');
  await dialog.getByRole('button', { name: 'ضيف', exact: true }).click();
  await openAreas();
  await dialog.getByRole('button', { name: 'ضيف منطقة' }).click();
  await dialog.getByLabel('اسم المنطقة').fill('الصالة');
  await dialog.getByRole('button', { name: 'ضيف', exact: true }).click();
  await openAreas();
  await expect(page.getByTestId('area-card')).toHaveCount(2);
  await expectAccessible(page, 'areas dialog');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // A table in each area, and one in none.
  await page.getByRole('button', { name: 'ضيف طاولة' }).first().click();
  await dialog.getByLabel('اسم الطاولة').fill('ج1');
  await dialog.getByLabel('المنطقة').selectOption({ label: 'الجنينة' });
  await expect(dialog.getByRole('radio', { name: 'خارجي' })).toBeChecked();
  await expect(dialog.getByRole('radio', { name: 'داخلي' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'ضيف', exact: true }).click();
  await page.getByRole('button', { name: 'ضيف كذا طاولة' }).first().click();
  await dialog.getByLabel('الاسم قبل الرقم').fill('ص');
  await dialog.getByLabel('لحد رقم').fill('2');
  await dialog.getByLabel('المنطقة').selectOption({ label: 'الصالة' });
  await dialog.getByRole('button', { name: /ضيف/ }).last().click();
  await page.getByRole('button', { name: 'ضيف طاولة' }).first().click();
  await dialog.getByLabel('اسم الطاولة').fill('البار');
  await dialog.getByRole('button', { name: 'ضيف', exact: true }).click();

  // Grouped by area in the list, each row naming its area.
  await expect(group('الجنينة').getByTestId('table-item')).toHaveCount(1);
  await expect(group('الصالة').getByTestId('table-item')).toHaveCount(2);
  await expect(group('').getByTestId('table-item')).toHaveCount(1);
  await expect(row('ج1')).toContainText('الجنينة');

  // Each area is a region of the plan drawn in its look: a lawn for the garden, stone for the hall.
  const zone = (name: string) => page.locator(`[data-testid="floor-zone"][data-zone="${name}"]`);
  await expect(zone('الجنينة')).toHaveAttribute('data-theme', 'garden');
  await expect(zone('الصالة')).toHaveAttribute('data-theme', 'hall');

  // Dragging "ص 2" from the hall onto the garden moves it there.
  const from = (await page.locator('[data-testid="floor-spot"][data-label="ص 2"]').boundingBox())!;
  const to = (await zone('الجنينة').boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height * 0.75, { steps: 8 });
  await page.mouse.up();
  await expect(group('الجنينة').getByTestId('table-item')).toHaveCount(2);
  await expect(row('ص 2')).toContainText('الجنينة');
  await screenshot(page, 'tables-area-zones-ar', false);

  // Move "ص 2" back to the hall from its edit dialog.
  await page.getByRole('button', { name: 'إجراءات ص 2', exact: true }).click();
  await page.getByRole('menuitem', { name: 'تعديل' }).click();
  await dialog.getByLabel('المنطقة').selectOption({ label: 'الصالة' });
  await dialog.getByRole('button', { name: 'احفظ' }).click();
  await expect(group('الصالة').getByTestId('table-item')).toHaveCount(2);

  // Filter the plan and the list by area.
  const areaFilter = page.getByRole('group', { name: 'فلتر المناطق' });
  await areaFilter.getByRole('button', { name: /الصالة/ }).click();
  await expect(page.getByTestId('table-item')).toHaveCount(2);
  await expect(page.getByTestId('floor-spot')).toHaveCount(2);
  await expect(page.getByTestId('floor-zone')).toHaveCount(1);
  await areaFilter.getByRole('button', { name: 'كل المناطق' }).click();
  await expect(page.getByTestId('table-item')).toHaveCount(4);
  await screenshot(page, 'tables-areas-ar');

  // The garden has tables: deleting it asks where they go first.
  await openAreas();
  await dialog.getByRole('button', { name: 'امسح الجنينة' }).click();
  await expect(dialog).toContainText('فيها طاولة واحدة');
  await expect(dialog.getByRole('button', { name: 'امسح المنطقة' })).toBeDisabled();
  await dialog.getByTestId('area-move-to').selectOption({ label: 'الصالة' });
  await expectAccessible(page, 'delete area dialog');
  await dialog.getByRole('button', { name: 'امسح المنطقة' }).click();
  await expect(group('الصالة').getByTestId('table-item')).toHaveCount(3);
  await expect(row('ج1')).toContainText('الصالة');

  // Saved on the server.
  const login = await page.request.post(`${API_URL}/v1/auth/login`, { data: { email: owner.email, password: owner.password }, headers: { Origin: DASHBOARD_ORIGIN } });
  const token = ((await login.json()) as { accessToken: string }).accessToken;
  const areas = await (await page.request.get(`${API_URL}/v1/table-areas`, { headers: { Authorization: `Bearer ${token}`, Origin: DASHBOARD_ORIGIN } })).json();
  expect(areas).toEqual([expect.objectContaining({ name: 'الصالة', location: 'INDOOR', tableCount: 3 })]);
});
