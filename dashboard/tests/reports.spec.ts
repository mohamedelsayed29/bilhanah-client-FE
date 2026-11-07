import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { expectAccessible } from './helpers';

// Live smoke test. Run after `npm run seed:demo` in the backend.
async function signIn(page: Page) {
  await page.addInitScript(() => localStorage.setItem('bilhanah:language:v1', 'ar'));
  await page.goto('/login');
  await page.locator('input[type=email]').fill('demo-owner@bilhanah.local');
  await page.locator('input[autocomplete=current-password]').fill('demo-password-1');
  await page.locator('button[type=submit]').click();
  await expect(page).not.toHaveURL(/login/);
  await page.goto('/reports');
}

test('reports: one period for the page, filters, exports, RTL/LTR and mobile', async ({ page }) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(15000);
  await signIn(page);
  await expect(page.locator('.rp-kpi')).toHaveCount(4);
  await expect(page.locator('.rp-strip > div')).toHaveCount(4);
  const line = page.getByTestId('overview-line'), bar = page.getByTestId('overview-bar');
  await expect(line).toBeVisible(); await expect(bar).toBeVisible();
  const lineBox = await line.boundingBox(), barBox = await bar.boundingBox();
  expect(Math.abs(lineBox!.y - barBox!.y)).toBeLessThan(3);
  await line.locator('svg').hover({ position: { x: 100, y: 100 } });
  await expect(page.getByTestId('overview-line-tooltip')).toContainText('صافي المبيعات');

  const periods = page.getByRole('group', { name: 'الفترة' });
  // One day: the trend goes hour by hour.
  const hourly = page.waitForResponse(r => r.url().includes('/reports/overview?') && r.url().includes('period=day') && r.status() === 200);
  await periods.getByRole('button', { name: 'النهارده', exact: true }).click();
  expect((await (await hourly).json()).days[0].date).toContain('T');
  // A year: month by month, each month keeping its days.
  const yearly = page.waitForResponse(r => /\/v1\/reports\?/.test(r.url()) && r.status() === 200);
  await periods.getByRole('button', { name: 'السنة دي', exact: true }).click();
  const yearDays = (await (await yearly).json()).days as { date: string }[];
  await expect(periods.getByRole('button', { name: 'السنة دي', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await line.locator('.overview-plot').focus(); await line.locator('.overview-plot').press('Home');
  await expect(line.locator('.overview-daily-breakdown p')).toHaveCount(yearDays.filter(d => d.date.slice(0, 7) === yearDays[0]!.date.slice(0, 7)).length);
  await periods.getByRole('button', { name: 'الشهر ده', exact: true }).click();
  await expect(line).toBeVisible();

  // Filters live behind one button; an active one shows as a removable chip.
  await page.getByRole('button', { name: /فلاتر/ }).click();
  await page.locator('#rp-filters select').last().selectOption('CARD');
  await expect(page.locator('.rp-chip')).toHaveCount(1);
  await page.locator('.rp-chip').click();
  await expect(page.locator('.rp-chip')).toHaveCount(0);

  await expectAccessible(page, 'reports Arabic');
  await mkdir('test-results/screens/reports', { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/screens/reports/ar-desktop.png', fullPage: true });
  const csvEvent = page.waitForEvent('download'); await page.getByRole('button', { name: 'CSV', exact: true }).click();
  expect((await csvEvent).suggestedFilename()).toMatch(/\.csv$/);
  const pdfEvent = page.waitForEvent('download'); await page.getByRole('button', { name: 'تنزيل PDF' }).first().click();
  const report = await pdfEvent; expect(report.suggestedFilename()).toMatch(/\.pdf$/);
  await report.saveAs('test-results/screens/reports/ar-report.pdf');
  await page.getByRole('button', { name: 'معاينة', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.frameLocator('.reports-preview').locator('h1')).toContainText('تقرير');
  await page.keyboard.press('Escape');

  // The detailed report switches by tab.
  await page.getByRole('tab', { name: 'الأصناف' }).click();
  await expect(page.getByRole('tab', { name: 'الأصناف' })).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('button', { name: /Switch to English/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible();
  await expectAccessible(page, 'reports English');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/screens/reports/en-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.rp-kpi')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.reports-table tbody td').first()).toBeVisible();
  const mobileLine = await line.boundingBox(), mobileBar = await bar.boundingBox();
  expect(mobileBar!.y).toBeGreaterThan(mobileLine!.y + mobileLine!.height);
  await page.screenshot({ path: 'test-results/screens/reports/en-mobile.png', fullPage: true });
});

test('trend charts expose the daily values via keyboard and synchronised bars', async ({ page }) => {
  // Deterministic chart fixture, isolated to this browser; no development data is modified.
  await page.route(/\/v1\/reports\?/, async route => {
    const response = await route.fetch(); const data = await response.json();
    const from = data.filters.from as string;
    data.days = [{ date: from, net: 10000, orders: 2 }, { date: from.slice(0, 8) + '02', net: 25000, orders: 7 }, { date: from.slice(0, 8) + '03', net: 0, orders: 0 }];
    await route.fulfill({ response, json: data });
  });
  await signIn(page);
  const plot = page.getByTestId('overview-line').locator('.overview-plot');
  await expect(plot).toBeVisible(); await plot.focus(); await plot.press('Home');
  const money = (v: number) => new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 2 }).format(v);
  await expect(page.getByTestId('overview-line-tooltip')).toContainText(money(100));
  await plot.press('ArrowLeft');
  await expect(page.getByTestId('overview-line-tooltip')).toContainText(money(250));
  await expect(page.getByTestId('overview-bar-tooltip')).toContainText('٧');
  await expect(page.locator('.overview-column.is-active')).toHaveCount(1);
  await plot.press('Escape'); await expect(page.getByTestId('overview-line-tooltip')).toHaveCount(0);
});
