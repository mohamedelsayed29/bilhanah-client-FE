import { test, expect, type Page } from '@playwright/test';
import type { PublicMenuResponse } from '@bilhanah/contracts';

// Regressions for layout bugs that only show at phone widths or with mixed-direction text.
const port = Number(process.env['WEB_E2E_PORT'] ?? 5173);
const pixel = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#c97b4a"/></svg>');
const image = (id: string) => ({ id, width: 640, height: 480, sources: [{ width: 640, url: pixel }], url: pixel });

const longDescription = 'رز وعدس ومكرونة وصلصة طماطم حارة وبصل مقرمش وحمص ودقة بالخل والتوم على الوش';
const menu: PublicMenuResponse = {
  restaurant: {
    availability: 'AVAILABLE', subdomain: 'koshary', name: 'كشري أبو طارق', defaultLanguage: 'ar', phone: '01012345678', city: 'Cairo', address: '12 Tahrir Street',
    whatsappNumber: null, websiteUrl: null, facebookUrl: null, instagramUrl: null, timezone: 'Africa/Cairo',
    logo: image('logo'), cover: image('cover'), brandColor: '#b4432f', openingHours: null,
    ordering: { accepting: true, dineIn: true, pickup: true },
  },
  categories: [{ id: 'mains', nameAr: 'رئيسي', nameEn: 'Mains', items: [
    { id: 'koshary', nameAr: 'كشري', nameEn: 'Koshary', descriptionAr: longDescription, descriptionEn: null, image: image('k'), isAvailable: true, variants: [
      { id: 'v1', nameAr: 'صغير', nameEn: 'Small', pricePiastres: 3500 }, { id: 'v2', nameAr: 'كبير', nameEn: 'Large', pricePiastres: 6500 },
    ] },
    { id: 'tahini', nameAr: 'طحينة', nameEn: 'Tahini', descriptionAr: longDescription, descriptionEn: null, image: null, isAvailable: true, variants: [{ id: 'v3', nameAr: null, nameEn: null, pricePiastres: 2000 }] },
  ] }],
};

async function openMenu(page: Page) {
  await page.route('**/v1/public/restaurants/koshary/menu', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(menu) }));
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`http://koshary.localhost:${port}/`);
  await expect(page.locator('.dish-card')).toHaveCount(2);
}

test('dish descriptions are shown in full at 320px, never clipped or under the price', async ({ page }) => {
  await openMenu(page);
  for (const card of await page.locator('.dish-card').all()) {
    const layout = await card.evaluate(element => {
      const description = element.querySelector('.dish-description')!;
      const price = element.querySelector('.dish-price-line')!.getBoundingClientRect();
      const style = getComputedStyle(description);
      // Nothing may cut the text off: no hidden overflow, line clamp or ellipsis.
      return { clipped: style.overflowY !== 'visible' || style.webkitLineClamp !== 'none' || style.textOverflow === 'ellipsis', descriptionBottom: description.getBoundingClientRect().bottom, priceTop: price.top };
    });
    expect(layout.clipped).toBe(false);
    expect(layout.descriptionBottom).toBeLessThanOrEqual(layout.priceTop + 1);
  }
  // The add button never covers the dish text, with or without a photo.
  await expect(page.locator('.dish-add')).toHaveCount(2);
  for (const item of await page.locator('.dish-item').all()) {
    const overlap = await item.evaluate(element => {
      const button = element.querySelector('.dish-add')!.getBoundingClientRect();
      return [...element.querySelectorAll('.dish-name, .dish-description, .dish-price-line')].some(text => {
        const box = text.getBoundingClientRect();
        return box.left < button.right && box.right > button.left && box.top < button.bottom && box.bottom > button.top;
      });
    });
    expect(overlap).toBe(false);
  }
});

test('an English address inside the Arabic page keeps its own word order', async ({ page }) => {
  await openMenu(page);
  const address = page.locator('.menu-address bdi');
  await expect(address).toHaveText('12 Tahrir Street, Cairo');
  await expect(address).toHaveAttribute('dir', 'auto');
});

test('closed FAQ answers take no space, so they never sit under the next question', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/faq');
  const answers = page.locator('.faq-list details > p');
  for (const answer of await answers.all()) await expect(answer).toBeHidden();
  const first = page.locator('.faq-list details').first();
  await first.locator('summary').click();
  await expect(first.locator('p')).toBeVisible();
  const gap = await page.locator('.faq-list details').evaluateAll(items => items[1]!.getBoundingClientRect().top - items[0]!.querySelector('p')!.getBoundingClientRect().bottom);
  expect(gap).toBeGreaterThanOrEqual(0);
});
