import { expect, test } from '@playwright/test';
import { registerOwner, uniqueSuffix } from './helpers';

/**
 * Roles and permissions, end to end: the owner adds a cashier from the team page (the change is
 * logged), and the cashier's dashboard shows only what a cashier may do, refusing other pages.
 */
test('an owner adds a cashier, who sees only a cashier\'s pages and actions', async ({ page, browser }) => {
  const suffix = uniqueSuffix();
  await registerOwner(page, { email: `owner-${suffix}@example.test`, password: 'correct-horse-battery', fullName: 'منى', restaurant: 'مطعم الأدوار', subdomain: `roles-${suffix}` });

  await page.goto('/tables');
  await page.getByRole('button', { name: 'ضيف طاولة' }).first().click();
  await page.getByRole('dialog').getByLabel('اسم الطاولة').fill('١');
  await page.getByRole('dialog').getByRole('button', { name: 'ضيف', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  await page.goto('/settings/kitchen');
  await page.getByRole('button', { name: 'حساب جديد' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('الاسم').fill('كريم الكاشير');
  await dialog.getByRole('radio', { name: /كاشير/ }).check();
  await expect(dialog.getByTestId('staff-grants')).toContainText('يرجّع الحساب مش مدفوع');
  const cashierEmail = `cashier-${suffix}@example.test`;
  await dialog.getByLabel('الإيميل').fill(cashierEmail);
  await dialog.getByLabel('كلمة السر', { exact: true }).fill('staff-password');
  await dialog.getByRole('button', { name: 'اعمل الحساب' }).click();
  await expect(page.getByTestId('kitchen-account-row')).toContainText('كاشير');
  await expect(page.getByTestId('staff-activity')).toContainText('كريم الكاشير');

  // The cashier, on another device.
  const context = await browser.newContext();
  const staff = await context.newPage();
  await staff.goto('/login');
  await staff.getByLabel('الإيميل').fill(cashierEmail);
  await staff.getByLabel('كلمة السر', { exact: true }).fill('staff-password');
  await staff.getByRole('button', { name: 'دخول' }).click();
  await expect(staff).toHaveURL(/\/manager$/);
  await expect(staff.getByTestId('staff-role')).toHaveText('كاشير');

  const nav = staff.getByRole('navigation', { name: 'القائمة الرئيسية' });
  await expect(nav.getByRole('link', { name: 'الطلبات' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'الطاولات' })).toBeVisible();
  for (const hidden of ['الموظفين', 'إعدادات الفرع', 'الإحصائيات', 'طلبات الخدمة']) await expect(nav.getByRole('link', { name: hidden })).toHaveCount(0);

  // A page outside the role: sent back with a notice.
  await staff.goto('/manager/staff');
  await expect(staff).toHaveURL(/\/manager$/);
  await expect(staff.getByTestId('access-denied')).toContainText('مش مسموح لك تفتح الصفحة دي');

  // Tables: seen, not arranged or booked.
  await staff.goto('/manager/tables');
  await expect(staff.getByRole('heading', { level: 1, name: 'إدارة الطاولات' })).toBeVisible();
  await expect(staff.getByRole('button', { name: 'ضيف طاولة' })).toHaveCount(0);
  await expect(staff.getByRole('tab', { name: /الحجوزات/ })).toHaveCount(0);
  await context.close();
});
