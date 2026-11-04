import { expect, test } from '@playwright/test';
import { expectAccessible, registerOwner, screenshot, uniqueSuffix } from './helpers';

const suffix = uniqueSuffix();
const owner = { email: `drawer-${suffix}@e2e-bilhanah.test`, password: 'Molokhia-Tuesday-2026', fullName: 'هبة الاختبار', restaurant: 'كافيه هبة', subdomain: `e2e-drw-${suffix}` };

test.use({ viewport: { width: 1440, height: 900 } });

test('the sidebar\'s three dots open every option by name, and picking one closes it', async ({ page }) => {
  await registerOwner(page, owner);
  await page.goto('/orders');
  const sidebar = page.locator('.sidebar');
  await expect(sidebar.getByRole('button', { name: 'تسجيل الخروج' })).toHaveCount(0);

  // The rail keeps the eight pages used most; the rest are in the ⋯ panel.
  await expect(sidebar.locator('nav a.sidebar-link')).toHaveCount(8);
  await expect(sidebar.getByRole('link', { name: 'الفروع' })).toHaveCount(0);
  await expect(sidebar.getByRole('link', { name: 'الاشتراك' })).toHaveCount(0);

  await sidebar.getByRole('button', { name: 'كل الاختيارات' }).click();
  const drawer = page.getByRole('dialog', { name: 'القائمة' });
  await expect(drawer).toBeVisible();
  for (const name of ['الرئيسية', 'الطلبات', 'الطاولات', 'الإحصائيات', 'المنيو', 'الفروع', 'كود QR', 'الاشتراك', 'الإعدادات']) {
    await expect(drawer.getByRole('link', { name, exact: false }).first()).toBeVisible();
  }
  await expect(drawer.getByRole('link', { name: /الطلبات/ })).toHaveClass(/active/);
  await expect(drawer.getByRole('button', { name: 'تسجيل الخروج' })).toBeVisible();
  await page.waitForTimeout(600);
  await expectAccessible(page, 'sidebar drawer');
  await screenshot(page, 'sidebar-drawer-ar', false);

  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();

  await sidebar.getByRole('button', { name: 'كل الاختيارات' }).click();
  await drawer.getByRole('link', { name: 'المنيو', exact: true }).click();
  await expect(page).toHaveURL(/\/menu$/);
  await expect(drawer).toBeHidden();

  // On a page only in the panel, the ⋯ button shows where you are.
  await sidebar.getByRole('button', { name: 'كل الاختيارات' }).click();
  await drawer.getByRole('link', { name: 'الاشتراك' }).click();
  await expect(page).toHaveURL(/\/subscription$/);
  await expect(sidebar.getByRole('button', { name: 'كل الاختيارات' })).toHaveClass(/active/);
});
