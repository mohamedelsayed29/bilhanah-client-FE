import { test, expect } from '@playwright/test';

test('the contact form sends the message to the API, and says so when it cannot', async ({ page }) => {
  let sent: Record<string, unknown> | null = null;
  let status = 202;
  await page.route('**/v1/public/contact', async route => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status, body: '' });
  });
  await page.goto('/contact?topic=nfc');

  await page.getByLabel('اسمك').fill('منى');
  await page.getByLabel('الإيميل').fill('mona@example.test');
  await page.getByLabel('اسم المطعم').fill('كشري التحرير');
  await page.getByRole('button', { name: 'ابعت الرسالة' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'وصلتنا رسالتك' })).toBeVisible();
  expect(sent).toMatchObject({ name: 'منى', email: 'mona@example.test', restaurant: 'كشري التحرير', topic: 'nfc' });
  expect(sent).not.toHaveProperty('website');

  status = 503;
  await page.getByLabel('اسمك').fill('منى');
  await page.getByLabel('الإيميل').fill('mona@example.test');
  await page.getByLabel('رسالتك').fill('عايز أعرف تفاصيل الاشتراك.');
  await page.getByRole('button', { name: 'ابعت الرسالة' }).click();
  await expect(page.getByRole('alert')).toContainText('ماقدرناش نبعت الرسالة');
});
