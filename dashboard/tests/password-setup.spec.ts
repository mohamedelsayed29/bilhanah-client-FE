import { expect, test } from '@playwright/test';
import { emailLink, emailLinks, expectAccessible, uniqueSuffix } from './helpers';

// Registering an unconfirmed email twice removes its password; confirming then asks the owner to set one by email.
test('a repeated registration is confirmed, then the password is set from the emailed link', async ({ page }) => {
  const email = `setup-${uniqueSuffix()}@e2e-bilhanah.test`;
  const startedAt = Date.now() - 5_000;
  for (const password of ['First-password-1', 'Second-password-2']) {
    await page.goto('/register');
    await page.getByLabel('اسمك').fill('سارة الاختبار');
    await page.getByLabel('الإيميل').fill(email);
    await page.getByLabel('كلمة السر', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'إنشاء الحساب' }).click();
    await expect(page).toHaveURL(/\/check-email$/);
  }

  // Only the second registration's link still works, and the two emails may arrive in either order.
  const confirmed = page.getByRole('heading', { level: 1, name: 'إيميلك اتأكد. فاضل خطوة' });
  for (const link of await emailLinks(page.request, email, 'verify-email', startedAt, 2)) {
    await page.goto(link);
    await expect(confirmed.or(page.getByRole('heading', { level: 1, name: 'اللينك ده مش شغال' }))).toBeVisible();
    if (await confirmed.isVisible()) break;
  }
  await expect(confirmed).toBeVisible();
  await expect(page.getByText('بعتنا لك لينك تختار بيه كلمة السر')).toBeVisible();
  await expectAccessible(page, 'verify email: password setup');

  await page.goto(await emailLink(page.request, email, 'reset-password', startedAt));
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.getByLabel('كلمة السر الجديدة').fill('Chosen-password-3');
  await page.getByLabel('اكتبها تاني').fill('Chosen-password-4');
  await page.getByRole('button', { name: 'احفظ كلمة السر' }).click();
  await expect(page.getByText('كلمتين السر مش زي بعض.')).toBeVisible();
  await page.getByLabel('اكتبها تاني').fill('Chosen-password-3');
  await expectAccessible(page, 'reset password');
  await page.getByRole('button', { name: 'احفظ كلمة السر' }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('اتغيرت كلمة السر. سجّل دخولك بالكلمة الجديدة.')).toBeVisible();
  await page.getByLabel('الإيميل').fill(email);
  await page.getByLabel('كلمة السر', { exact: true }).fill('Chosen-password-3');
  await page.getByRole('button', { name: 'دخول' }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
});
