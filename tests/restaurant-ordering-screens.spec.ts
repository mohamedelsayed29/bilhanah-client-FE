import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { OrderStatus } from '@bilhanah/contracts';
import { json, mockRealtime, orderFixture, restaurantUrl, serveMenu, TOKEN } from './ordering-fixtures';

// Review screenshots of the ordering flow (mocked API): phone in Arabic and English, desktop in Arabic.
const review = fileURLToPath(new URL('../test-results/review/ordering/', import.meta.url));
test.beforeAll(async () => { await mkdir(review, { recursive: true }); });

const setups = [
  { name: '390-ar', viewport: { width: 390, height: 844 }, language: 'ar' },
  { name: '390-en', viewport: { width: 390, height: 844 }, language: 'en' },
  { name: 'desktop-ar', viewport: { width: 1280, height: 860 }, language: 'ar' },
  { name: '320-ar', viewport: { width: 320, height: 640 }, language: 'ar' },
] as const;

async function prepare(page: Page, language: 'ar' | 'en') {
  await page.addInitScript(lang => { if (!sessionStorage.getItem('screens')) { localStorage.setItem('bilhanah:language:v1', lang); sessionStorage.setItem('screens', '1'); } }, language);
  await serveMenu(page);
  await page.route('**/v1/public/restaurants/koshary/tables/**', route => route.fulfill(json({ label: '5' })));
}

for (const setup of setups) {
  test(`ordering screens ${setup.name}`, async ({ page }) => {
    const en = setup.language === 'en';
    await page.setViewportSize(setup.viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await prepare(page, setup.language);
    await page.goto(restaurantUrl('/?t=TBL5CODE'));
    await expect(page.locator('.table-badge')).toContainText(en ? 'Table 5' : 'طاولة ٥');

    await page.getByRole('button', { name: en ? 'Add Lemon mint to your order' : 'أضف ليمون نعناع للطلب' }).click();
    await page.getByRole('button', { name: en ? 'Add Koshary to your order' : 'أضف كشري للطلب' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByText(en ? 'Large' : 'كبير').click();
    await sheet.getByRole('button', { name: en ? 'Increase quantity' : 'زوّد الكمية' }).click();
    await sheet.getByRole('textbox').fill(en ? 'No onions please' : 'من غير بصل لو سمحت');
    await page.screenshot({ path: `${review}/${setup.name}-dish-sheet.png` });
    await sheet.getByRole('button', { name: en ? /Add to order/ : /أضف للطلب/ }).click();
    await expect(page.locator('.cart-bar')).toBeVisible();
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${review}/${setup.name}-menu-cart-bar.png` });

    await page.locator('.cart-bar').click();
    await expect(page.getByRole('dialog', { name: en ? 'Your order' : 'طلبك' })).toBeVisible();
    await page.screenshot({ path: `${review}/${setup.name}-cart.png` });
    await page.getByRole('button', { name: en ? /Continue/ : /كمّل الطلب/ }).click();
    await page.getByLabel(en ? 'Your name' : 'اسمك').fill(en ? 'Ahmed' : 'أحمد');
    await page.screenshot({ path: `${review}/${setup.name}-checkout.png` });
    await page.getByRole('radio', { name: en ? 'Pickup' : 'تيك أواي' }).check();
    await page.getByRole('button', { name: en ? /Place order/ : /ابعت الطلب/ }).click();
    await expect(page.getByText(en ? 'Pickup orders need a phone number.' : 'رقم الموبايل مطلوب للتيك أواي.')).toBeVisible();
    await page.screenshot({ path: `${review}/${setup.name}-checkout-pickup-error.png` });

    await mockRealtime(page, 'live');
    for (const status of ['PLACED', 'PREPARING', 'READY', 'REJECTED'] satisfies OrderStatus[]) {
      await page.unroute('**/v1/public/orders/**');
      await page.route('**/v1/public/orders/**', route => route.fulfill(json(orderFixture(status))));
      await page.goto(restaurantUrl(`/order/${TOKEN}`));
      await expect(page.locator('.track-hero')).toHaveClass(new RegExp(`status-${status.toLowerCase()}`));
      await page.screenshot({ path: `${review}/${setup.name}-tracking-${status.toLowerCase()}.png`, fullPage: true });
    }
  });
}
