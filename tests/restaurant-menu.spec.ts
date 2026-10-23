import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { PublicMenuResponse } from '@bilhanah/contracts';

// The API is mocked, so these run without a backend. Restaurant pages live on {subdomain}.localhost.
const port = Number(process.env['WEB_E2E_PORT'] ?? 5173);
const restaurantUrl = (subdomain: string) => `http://${subdomain}.localhost:${port}/`;
const menuRoute = (subdomain: string) => `**/v1/public/restaurants/${subdomain}/menu`;

const pixel = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#c97b4a"/></svg>');
const image = (id: string) => ({ id, width: 640, height: 480, sources: [{ width: 640, url: pixel }], url: pixel });
const allDays = (ranges: { opens: string; closes: string }[]) => ({ sat: ranges, sun: ranges, mon: ranges, tue: ranges, wed: ranges, thu: ranges, fri: ranges });

const menu: PublicMenuResponse = {
  restaurant: {
    availability: 'AVAILABLE', subdomain: 'koshary', name: 'كشري أبو طارق', defaultLanguage: 'ar', phone: '01012345678', city: 'القاهرة', address: '١٦ شارع معروف',
    whatsappNumber: '01012345678', websiteUrl: null, facebookUrl: null, instagramUrl: 'https://instagram.com/koshary', timezone: 'Africa/Cairo',
    logo: image('logo'), cover: image('cover'), brandColor: '#b4432f', openingHours: allDays([{ opens: '00:00', closes: '23:59' }]),
  },
  categories: [
    { id: 'mains', nameAr: 'رئيسي', nameEn: 'Mains', items: [
      { id: 'koshary', nameAr: 'كشري', nameEn: 'Koshary', descriptionAr: 'رز وعدس ومكرونة', descriptionEn: 'Rice, lentils and pasta', image: image('k'), isAvailable: true, variants: [
        { id: 'v1', nameAr: 'صغير', nameEn: 'Small', pricePiastres: 3500 }, { id: 'v2', nameAr: 'كبير', nameEn: 'Large', pricePiastres: 5550 },
      ] },
      { id: 'fatta', nameAr: 'فتة', nameEn: null, descriptionAr: null, descriptionEn: null, image: null, isAvailable: false, variants: [{ id: 'v3', nameAr: null, nameEn: null, pricePiastres: 21000 }] },
    ] },
    { id: 'drinks', nameAr: 'مشروبات', nameEn: 'Drinks', items: [
      { id: 'lemon', nameAr: 'ليمون نعناع', nameEn: 'Lemon mint', descriptionAr: null, descriptionEn: null, image: null, isAvailable: true, variants: [{ id: 'v4', nameAr: null, nameEn: null, pricePiastres: 4500 }] },
    ] },
  ],
};

async function serveMenu(page: Page, body: unknown, status = 200) {
  await page.route(menuRoute('koshary'), route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }));
}

test('shows the menu in the restaurant language, with sizes, sold-out items and branding', async ({ page }) => {
  await serveMenu(page, menu);
  await page.goto(restaurantUrl('koshary'));

  await expect(page.getByRole('heading', { level: 1, name: 'كشري أبو طارق' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page).toHaveTitle('كشري أبو طارق | المنيو');
  await expect(page.locator('.open-badge')).toHaveText('مفتوح دلوقتي');
  await expect(page.getByRole('link', { name: 'واتساب' })).toHaveAttribute('href', 'https://wa.me/201012345678');
  await expect(page.locator('.menu-page')).toHaveAttribute('style', /--brand: #b4432f/);

  const koshary = page.locator('.dish-card', { hasText: 'كشري' });
  await expect(koshary).toContainText('٣٥');
  await expect(koshary).toContainText('٥٥٫٥');
  await expect(koshary).toContainText('صغير · كبير');
  await expect(page.locator('.dish-card.sold-out')).toContainText('خلصت النهارده');

  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(accessibility.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([]);
});

test('falls back to Arabic where English is missing, and keeps the visitor choice', async ({ page }) => {
  await serveMenu(page, menu);
  await page.goto(restaurantUrl('koshary'));
  await page.getByRole('button', { name: 'Switch to English' }).click();

  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('heading', { level: 2, name: 'Mains' })).toBeVisible();
  await expect(page.locator('.dish-card', { hasText: 'Koshary' })).toContainText('Small · Large');
  await expect(page.locator('.dish-card.sold-out')).toContainText('فتة');

  await page.reload();
  await expect(page.getByRole('heading', { level: 2, name: 'Mains' })).toBeVisible();
});

test('searches across languages, ignoring Arabic spelling variants', async ({ page }) => {
  await serveMenu(page, menu);
  await page.goto(restaurantUrl('koshary'));
  const search = page.getByRole('searchbox');

  await search.fill('كشرى');
  await expect(page.locator('.dish-card')).toHaveCount(1);
  await expect(page.locator('.menu-tabs')).toHaveCount(0);

  await search.fill('lemon');
  await expect(page.locator('.dish-card')).toHaveText([/ليمون نعناع/]);

  await search.fill('بيتزا');
  await expect(page.getByRole('status')).toContainText('مفيش أكلة');
  await page.getByRole('button', { name: 'مسح البحث' }).click();
  await expect(page.locator('.dish-card')).toHaveCount(3);
});

test('opens a dish with its sizes and closes it again', async ({ page }) => {
  await serveMenu(page, menu);
  await page.goto(restaurantUrl('koshary'));

  await page.locator('.dish-card', { hasText: 'كشري' }).click();
  const sheet = page.getByRole('dialog', { name: 'كشري' });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.dish-sheet-prices li')).toHaveText([/صغير\s*٣٥/, /كبير\s*٥٥٫٥/]);

  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await page.locator('.dish-card', { hasText: 'كشري' }).click();
  await page.getByRole('button', { name: 'إغلاق' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('jumps to a section from its tab', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await serveMenu(page, menu);
  await page.goto(restaurantUrl('koshary'));

  await page.getByRole('link', { name: 'مشروبات' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'مشروبات' })).toBeInViewport();
  await expect(page.getByRole('link', { name: 'مشروبات' })).toHaveAttribute('aria-current', 'true');
});

test('explains unavailable, unknown and failing restaurants', async ({ page }) => {
  await serveMenu(page, { restaurant: { availability: 'TEMPORARILY_UNAVAILABLE', subdomain: 'koshary', name: 'كشري أبو طارق', defaultLanguage: 'ar' }, categories: [] });
  await page.goto(restaurantUrl('koshary'));
  await expect(page.getByText('المنيو مش متاح مؤقتًا')).toBeVisible();

  await page.unroute(menuRoute('koshary'));
  await serveMenu(page, { error: { code: 'RESTAURANT_NOT_FOUND' } }, 404);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'المطعم ده مش موجود' })).toBeVisible();

  await page.unroute(menuRoute('koshary'));
  let failing = true;
  await page.route(menuRoute('koshary'), route => failing
    ? route.fulfill({ status: 503, body: '{}' })
    : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(menu) }));
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('حصلت مشكلة');
  failing = false;
  await page.getByRole('button', { name: 'حاول تاني' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'كشري أبو طارق' })).toBeVisible();
});

test('reserved platform hosts show the website, not a restaurant', async ({ page }) => {
  await page.goto(`http://api.localhost:${port}/`);
  await expect(page.locator('.menu-page, .restaurant-page')).toHaveCount(0);
  await expect(page.locator('#root')).not.toBeEmpty();
});
