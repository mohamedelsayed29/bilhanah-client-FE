import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { API_URL, emailLink, login, onboard, PASSWORD, registerAndVerify, uniqueEmail, WEB_PORT } from './helpers';

test('an owner signs up, onboards and edits their restaurant (Arabic)', async ({ page }) => {
  const email = uniqueEmail('journey');
  const name = `Abou Tarek ${Date.now().toString().slice(-6)}`;

  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  await registerAndVerify(page, email);
  await expect(page.locator('.stepper [aria-current="step"]')).toContainText('بيانات المطعم');

  // Unknown session: sign in, then go to onboarding because there is no restaurant yet.
  await login(page, email);
  await expect(page.locator('.stepper [aria-current="step"]')).toContainText('بيانات المطعم');
  await onboard(page, name);

  const slug = name.toLowerCase().replace(/ /g, '-');
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(page.getByText('تجربة مجانية').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /فاضل ٣٠|فاضل 30/ })).toBeVisible();
  await expect(page.getByText(`${slug}.localhost:${WEB_PORT}`)).toBeVisible();

  // "Open page" leads to the restaurant's own public page on its subdomain.
  const [publicPage] = await Promise.all([
    page.context().waitForEvent('page'),
    page.getByRole('link', { name: 'افتح الصفحة' }).click(),
  ]);
  await expect(publicPage).toHaveURL(new RegExp(`^http://${slug}\\.localhost:${WEB_PORT}/`));
  await expect(publicPage.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(publicPage.getByRole('link', { name: '01012345678' })).toHaveAttribute('href', 'tel:01012345678');
  await publicPage.goto(`http://no-such-restaurant-${Date.now()}.localhost:${WEB_PORT}/`);
  await expect(publicPage.getByRole('heading', { name: 'المطعم ده مش موجود' })).toBeVisible();
  await publicPage.close();

  // The session survives a reload via the refresh cookie.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();

  await page.getByRole('link', { name: 'بيانات المطعم' }).first().click();
  await expect(page.getByText(`${slug}.bilhanah.com`)).toBeVisible();
  const city = page.getByLabel('المدينة');
  await city.fill('الجيزة');
  await page.getByRole('button', { name: 'حفظ التغييرات' }).click();
  await expect(page.getByText('اتحفظت التغييرات.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('المدينة')).toHaveValue('الجيزة');

  // The public endpoint reflects the restaurant immediately.
  const publicView = await (await fetch(`${API_URL}/v1/public/restaurants/${slug}`)).json();
  expect(publicView).toMatchObject({ availability: 'AVAILABLE', name, city: 'الجيزة' });

  await page.getByRole('button', { name: 'تسجيل الخروج' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/login$/);
});

test('subdomain feedback: reserved, invalid and taken names', async ({ page, browser }) => {
  const first = uniqueEmail('taken-a');
  const takenName = `taken-${Date.now().toString().slice(-7)}`;
  await registerAndVerify(page, first);
  await login(page, first);
  await onboard(page, takenName);

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  const second = uniqueEmail('taken-b');
  await registerAndVerify(otherPage, second);
  await login(otherPage, second);
  await expect(otherPage).toHaveURL(/\/onboarding$/);

  const subdomain = otherPage.getByLabel('عنوان المنيو');
  await subdomain.fill('admin');
  await expect(otherPage.getByText('الاسم ده محجوز للمنصة. اختار اسم تاني.')).toBeVisible();
  await subdomain.fill('abou--tarek');
  await expect(otherPage.getByText(/من ٣ لـ ٤٠ حرف/)).toBeVisible();
  await subdomain.fill(takenName);
  await expect(otherPage.getByText('العنوان ده متاخد. جرب اسم تاني.')).toBeVisible();
  await expect(otherPage.getByRole('button', { name: 'إنشاء المطعم' })).toBeDisabled();
  await other.close();
});

test('password reset signs in with the new password only (English)', async ({ page }) => {
  const email = uniqueEmail('reset');
  await registerAndVerify(page, email);

  await page.getByRole('button', { name: 'Switch to English' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

  await page.goto('/forgot-password');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Send link' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();

  await page.goto(await emailLink(email, /إعادة تعيين|Reset your/));
  await page.getByLabel('Password', { exact: true }).fill('a-brand-new-password');
  await page.getByLabel('Confirm password').fill('a-brand-new-password');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByRole('heading', { name: 'Your password was changed' })).toBeVisible();

  await login(page, email, PASSWORD);
  await expect(page.getByRole('alert')).toContainText('The email or password is incorrect.');
  await login(page, email, 'a-brand-new-password');
  await expect(page).toHaveURL(/\/onboarding$/);
});

test('sign-up is a three-step journey and checks the password confirmation', async ({ page }) => {
  await page.goto('/register');
  const current = page.locator('.stepper [aria-current="step"]');
  await expect(current).toContainText('بيانات الحساب');

  await page.getByLabel('اسمك').fill('Om Hassan');
  await page.getByLabel('الإيميل', { exact: true }).fill(uniqueEmail('confirm'));
  await page.getByLabel('كلمة المرور', { exact: true }).fill(PASSWORD);
  await expect(page.locator('.password-rules .is-met')).toHaveText(['١٠ حروف على الأقل']);
  await page.getByLabel('تأكيد كلمة المرور').fill('something-else-123');
  await page.getByRole('button', { name: 'إنشاء الحساب' }).click();
  await expect(page.getByText('كلمتين المرور مش زي بعض.')).toBeVisible();
  await expect(page).toHaveURL(/\/register$/);

  await page.getByLabel('تأكيد كلمة المرور').fill(PASSWORD);
  await expect(page.locator('.password-rules .is-met')).toHaveCount(2);
  await page.getByRole('button', { name: 'إنشاء الحساب' }).click();
  await expect(page).toHaveURL(/\/check-email$/);
  await expect(current).toContainText('تأكيد الإيميل');
});

test('an unverified owner is told to confirm their email', async ({ page }) => {
  const email = uniqueEmail('unverified');
  await page.goto('/register');
  await page.getByLabel('اسمك').fill('Om Hassan');
  await page.getByLabel('الإيميل', { exact: true }).fill(email);
  await page.getByLabel('كلمة المرور', { exact: true }).fill(PASSWORD);
  await page.getByLabel('تأكيد كلمة المرور').fill(PASSWORD);
  await page.getByRole('button', { name: 'إنشاء الحساب' }).click();
  await expect(page.getByText(email)).toBeVisible();

  await login(page, email);
  await expect(page.getByRole('alert')).toContainText('لازم تأكد إيميلك الأول');
  await page.getByRole('link', { name: 'ابعتلي إيميل التفعيل تاني' }).click();
  await page.getByRole('button', { name: 'ابعت لينك التفعيل تاني' }).click();
  await expect(page.getByText('لو الحساب محتاج تفعيل، بعتنا لينك جديد.')).toBeVisible();
});

test('two tabs restore the same session without signing each other out', async ({ page, context }) => {
  const email = uniqueEmail('tabs');
  await registerAndVerify(page, email);
  await login(page, email);
  await expect(page).toHaveURL(/\/onboarding$/);

  // Both tabs refresh at once; the refresh token rotates, so they must take turns.
  const second = await context.newPage();
  await Promise.all([page.reload(), second.goto('/onboarding')]);
  await expect(page.getByRole('heading', { name: 'عرّفنا على مطعمك' })).toBeVisible();
  await expect(second.getByRole('heading', { name: 'عرّفنا على مطعمك' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'عرّفنا على مطعمك' })).toBeVisible();
});

test('pages have no automatically detectable accessibility violations', async ({ page }) => {
  for (const path of ['/login', '/register', '/forgot-password']) {
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations, path).toEqual([]);
  }

  const email = uniqueEmail('a11y');
  await registerAndVerify(page, email);
  await login(page, email);
  await expect(page).toHaveURL(/\/onboarding$/);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
  await onboard(page, `A11y ${Date.now().toString().slice(-6)}`);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
});

test('@mobile the dashboard fits a phone screen', async ({ page }) => {
  const email = uniqueEmail('mobile');
  await registerAndVerify(page, email);
  await login(page, email);
  await onboard(page, `Mobile ${Date.now().toString().slice(-6)}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
