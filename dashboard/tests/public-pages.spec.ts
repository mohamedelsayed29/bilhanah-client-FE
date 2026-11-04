import { expect, test } from '@playwright/test';
import { expectAccessible, expectNoOverflow, screenshot } from './helpers';

test.describe('signed-out pages', () => {
  test('login, register and forgot-password are accessible in Arabic and English', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { level: 1, name: 'ادخل على مطعمك' })).toBeVisible();
    await expect(page).toHaveTitle(/تسجيل الدخول/);
    await expectAccessible(page, 'login (ar)');
    await screenshot(page, 'login-ar-desktop');

    await page.getByRole('button', { name: 'دخول' }).click();
    await expect(page.getByText('الحقل ده مطلوب.').first()).toBeVisible();
    await expect(page.getByLabel('الإيميل')).toHaveAttribute('aria-invalid', 'true');

    await page.getByRole('link', { name: 'ابدأ تجربتك المجانية' }).click();
    await expect(page).toHaveURL(/\/register$/);
    await expectAccessible(page, 'register (ar)');
    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoOverflow(page, 'register at 390px');
    await screenshot(page, 'register-ar-mobile');

    await page.getByRole('button', { name: 'Switch to English' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { level: 1, name: 'Start your free trial' })).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 960 });
    await expectAccessible(page, 'register (en)');
    await screenshot(page, 'register-en-desktop');

    await page.goto('/forgot-password');
    await expect(page.getByRole('heading', { level: 1, name: 'Forgot your password?' })).toBeVisible();
    await expectAccessible(page, 'forgot password (en)');
    await page.getByRole('button', { name: 'التبديل للعربية' }).click();
    expect(errors).toEqual([]);
  });

  test('wrong credentials and broken email links explain what happened', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('الإيميل').fill(`nobody-${Date.now()}@example.com`);
    await page.getByLabel('كلمة السر', { exact: true }).fill('not-the-password');
    await page.getByRole('button', { name: 'دخول' }).click();
    await expect(page.getByRole('alert')).toContainText('الإيميل أو كلمة السر مش صح.');

    await page.goto('/verify-email#token=not-a-real-token');
    await expect(page.getByRole('heading', { level: 1, name: 'اللينك ده مش شغال' })).toBeVisible();
    await expect(page).toHaveURL(/\/verify-email$/); // the token is removed from the address bar

    await page.goto('/reset-password');
    await expect(page.getByRole('link', { name: 'اطلب لينك جديد' })).toBeVisible();
  });

  test('unknown pages show a 404 and protected pages require sign-in', async ({ page }) => {
    await page.goto('/this-does-not-exist');
    await expect(page.getByRole('heading', { level: 1, name: 'الصفحة دي مش موجودة' })).toBeVisible();
    await expectAccessible(page, '404');
    await page.goto('/menu');
    await expect(page).toHaveURL(/\/login\?next=%2Fmenu$/);
  });
});
