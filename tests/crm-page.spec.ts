import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// /features/crm: the CRM & WhatsApp page (coming soon), reached from the Products menu.
test('the CRM page is linked from Products, offers early access, fits every width and is accessible', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  // The menu opens on hover (a click right after would close it again).
  await page.locator('.pm-trigger').first().hover();
  await page.locator('#products-menu').getByRole('link', { name: /CRM وواتساب/ }).first().click();
  await expect(page).toHaveURL(/\/features\/crm$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('اعرف كل زبون');
  await expect(page.locator('.crm-eyebrow')).toContainText('Bilhanah CRM');
  await expect(page.locator('.ea-form')).toHaveCount(2);

  for (const language of ['ar', 'en']) {
    if (language === 'en') await page.getByRole('button', { name: 'Switch to English', exact: true }).click();
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), { message: `${language} fits at ${width}` }).toBe(true);
    }
  }

  // A recipe tab switches the automation shown; the showcases play on their own (no pause buttons).
  await page.setViewportSize({ width: 1440, height: 900 });
  const automations = page.locator('[aria-labelledby="crm-auto-title"]');
  await automations.scrollIntoViewIfNeeded();
  await automations.getByRole('tab', { name: 'Birthday' }).click();
  await expect(automations.getByRole('tab', { name: 'Birthday' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Pause' })).toHaveCount(0);

  expect((await new AxeBuilder({ page }).include('.crm-page').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  expect(errors).toEqual([]);
});
