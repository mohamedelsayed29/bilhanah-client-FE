import { expect, test } from '@playwright/test';
import { expectAccessible, registerOwner, uniqueSuffix } from './helpers';

const suffix = uniqueSuffix();
const owner = { email: `loc-${suffix}@e2e-bilhanah.test`, password: 'Molokhia-Tuesday-2026', fullName: 'هبة الاختبار', restaurant: 'كافيه هبة', subdomain: `e2e-loc-${suffix}` };

test.use({ viewport: { width: 1440, height: 900 } });

test('tables are indoor or outdoor: picked when adding, changed later, shown in the list and on the plan, and filtered', async ({ page }) => {
  await registerOwner(page, owner);
  await page.goto('/tables');
  const dialog = page.getByRole('dialog');
  const row = (label: string) => page.locator(`[data-testid="table-item"][data-label="${label}"]`);

  // Indoor unless the owner says otherwise.
  await page.getByRole('button', { name: 'ضيف طاولة' }).first().click();
  await expect(dialog.getByRole('radio', { name: 'داخلي' })).toBeChecked();
  await dialog.getByLabel('اسم الطاولة').fill('الصالة 1');
  await dialog.getByRole('button', { name: 'ضيف', exact: true }).click();
  await expect(row('الصالة 1')).toContainText('داخلي');

  // Three terrace tables at once, outdoors: the plan gains an outdoor area.
  await page.getByRole('button', { name: 'ضيف كذا طاولة' }).first().click();
  await dialog.getByLabel('الاسم قبل الرقم').fill('تراس');
  await dialog.getByLabel('لحد رقم').fill('3');
  await dialog.getByRole('radio', { name: 'خارجي' }).check();
  await expectAccessible(page, 'add tables with a location');
  await dialog.getByRole('button', { name: /ضيف/ }).last().click();
  await expect(page.getByTestId('table-item')).toHaveCount(4);
  await expect(row('تراس 2')).toContainText('خارجي');
  await expect(page.getByTestId('floor-canvas').getByText('المنطقة الخارجية')).toBeVisible();

  // Move the hall table outside from its edit dialog.
  await page.getByRole('button', { name: 'إجراءات الصالة 1', exact: true }).click();
  await page.getByRole('menuitem', { name: 'تعديل' }).click();
  await expect(dialog.getByRole('radio', { name: 'داخلي' })).toBeChecked();
  await dialog.getByRole('radio', { name: 'خارجي' }).check();
  await dialog.getByRole('button', { name: 'احفظ' }).click();
  await expect(row('الصالة 1')).toContainText('خارجي');

  // Filter the plan and the list by location.
  await page.getByLabel('المكان', { exact: true }).selectOption({ label: 'خارجي' });
  await expect(page.getByTestId('table-item')).toHaveCount(4);
  await expect(page.getByTestId('floor-spot')).toHaveCount(4);
  await page.getByLabel('المكان', { exact: true }).selectOption({ label: 'داخلي' });
  await expect(page.getByTestId('table-item')).toHaveCount(0);
  await expect(page.getByTestId('floor-spot')).toHaveCount(0);
  await page.getByLabel('المكان', { exact: true }).selectOption({ label: 'كل الأماكن' });
  await expect(page.getByTestId('table-item')).toHaveCount(4);
  await expectAccessible(page, 'tables with locations');

  // Saved: still outdoor after a reload.
  await page.reload();
  await expect(row('الصالة 1')).toContainText('خارجي');
});
