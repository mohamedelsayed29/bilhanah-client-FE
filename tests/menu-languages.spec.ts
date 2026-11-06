import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { PublicMenuResponse } from '@bilhanah/contracts';
import { json, menuFixture, mockRealtime, orderFixture, restaurantUrl, serveMenu, TOKEN } from './ordering-fixtures';

// Extra menu languages (the restaurant's translations) and calories / portions per size, against a
// mocked API. Arabic and English switch the whole page; extra languages translate the menu's own text
// while the interface stays in English.

type Mutable = { [key: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The ordering fixture with French and Russian offered, some text left untranslated, and nutrition on some sizes. */
function translatedMenu(languages: string[] = ['fr', 'ru']): PublicMenuResponse {
  const menu = menuFixture() as unknown as Mutable;
  menu.restaurant.menuLanguages = languages;
  const [mains, drinks] = menu.categories;
  mains.translations = { fr: { name: 'Plats' }, ru: { name: 'Основные блюда' } };
  drinks.translations = {}; // No translation: English.
  const [koshary, fatta] = mains.items;
  koshary.translations = { fr: { name: 'Kochari', description: 'Riz, lentilles et pâtes' }, ru: { name: 'Кошари', description: 'Рис, чечевица и паста' } };
  koshary.variants[0] = { ...koshary.variants[0], translations: { fr: { name: 'Petit' }, ru: { name: 'Маленький' } }, calories: 520, portionValue: 350, portionUnit: 'GRAM', serves: 1 };
  // Large: no French name (English), no portion.
  koshary.variants[1] = { ...koshary.variants[1], translations: { ru: { name: 'Большой' } }, calories: 840, portionValue: null, portionUnit: null, serves: 2 };
  fatta.translations = {};
  fatta.variants[0] = { ...fatta.variants[0], translations: {}, calories: null, portionValue: null, portionUnit: null, serves: null };
  const [lemon] = drinks.items;
  lemon.translations = { ru: { name: 'Лимонад с мятой' } }; // No French: English.
  lemon.variants[0] = { ...lemon.variants[0], translations: {}, calories: 120, portionValue: 330, portionUnit: 'ML', serves: null };
  return menu as unknown as PublicMenuResponse;
}

async function chooseLanguage(page: Page, nativeName: string) {
  await page.getByTestId('menu-language').click();
  const sheet = page.getByRole('dialog', { name: /لغة المنيو|Menu language/ });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: new RegExp(`^${nativeName}`) }).click();
  await expect(sheet).toBeHidden();
}

async function axe(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(result.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([]);
}

test('keeps the Arabic/English switch when the restaurant offers no extra languages', async ({ page }) => {
  await serveMenu(page);
  await page.goto(restaurantUrl());
  await expect(page.getByRole('heading', { level: 2, name: 'رئيسي' })).toBeVisible();
  await expect(page.getByTestId('menu-language')).toHaveCount(0);
  await page.getByRole('button', { name: 'Switch to English' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 2, name: 'Mains' })).toBeVisible();
});

test('reads the menu in French with English fallbacks, then back in Arabic, right to left', async ({ page }) => {
  await serveMenu(page, translatedMenu());
  await page.goto(restaurantUrl());
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByTestId('menu-language')).toHaveText(/العربية/);

  // The list: Arabic and English, then the restaurant's languages by their own names.
  await page.getByTestId('menu-language').click();
  const sheet = page.getByRole('dialog', { name: 'لغة المنيو' });
  await expect(sheet.locator('.language-option-native')).toHaveText(['العربية', 'English', 'Français', 'Русский']);
  await expect(sheet.getByRole('button', { name: /العربية/ })).toHaveAttribute('aria-pressed', 'true');
  for (const box of await sheet.locator('.language-option').evaluateAll(options => options.map(option => option.getBoundingClientRect().height))) expect(box).toBeGreaterThanOrEqual(44);
  await axe(page);
  await sheet.getByRole('button', { name: /^Français/ }).click();

  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByTestId('menu-language')).toHaveText(/Français/);
  // Menu text in French, English where the owner left French empty.
  await expect(page.getByRole('heading', { level: 2, name: 'Plats' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Drinks' })).toBeVisible();
  await expect(page.locator('.menu-tabs')).toContainText('Plats');
  const koshary = page.locator('.dish-card', { hasText: 'Kochari' });
  await expect(koshary).toContainText('Riz, lentilles et pâtes');
  await expect(koshary).toContainText('Petit · Large');
  await expect(page.locator('.dish-card', { hasText: 'Lemon mint' })).toBeVisible();
  // The interface is English.
  await expect(page.getByRole('searchbox')).toHaveAttribute('placeholder', 'What are you craving?');
  await expect(page.locator('.open-badge')).toHaveText('Open now');
  await expect(page.getByRole('button', { name: 'Add Lemon mint to your order' })).toBeVisible();

  await page.getByRole('button', { name: 'Add Kochari to your order' }).click();
  const dish = page.getByRole('dialog', { name: 'Kochari' });
  await expect(dish.locator('.size-name bdi')).toHaveText(['Petit', 'Large']);
  await dish.getByRole('button', { name: 'Close' }).click();

  await chooseLanguage(page, 'العربية');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 2, name: 'رئيسي' })).toBeVisible();
  await expect(page.locator('.dish-card', { hasText: 'كشري' })).toContainText('صغير · كبير');
  await expect(page.getByRole('searchbox')).toHaveAttribute('placeholder', 'بتدور على إيه؟');
});

test('remembers the chosen language for the restaurant on reload', async ({ page }) => {
  await serveMenu(page, translatedMenu());
  await page.goto(restaurantUrl());
  await chooseLanguage(page, 'Русский');
  await expect(page.getByRole('heading', { level: 2, name: 'Основные блюда' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('bilhanah:menu-language:v1:koshary'))).toBe('ru');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page.getByRole('heading', { level: 2, name: 'Основные блюда' })).toBeVisible();
  await expect(page.locator('.dish-card', { hasText: 'Кошари' })).toContainText('Маленький · Большой');
  await expect(page.locator('.dish-card', { hasText: 'Лимонад с мятой' })).toBeVisible();
});

test('a language the restaurant stopped offering falls back to the default', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bilhanah:menu-language:v1:koshary', 'de'));
  await serveMenu(page, translatedMenu());
  await page.goto(restaurantUrl());
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.getByRole('heading', { level: 2, name: 'رئيسي' })).toBeVisible();
});

test('shows calories, portion and servings per size, and nothing where they are not set', async ({ page }) => {
  await serveMenu(page, translatedMenu());
  await page.goto(restaurantUrl());

  // Arabic: a range on the card, each size's facts in the sheet.
  await expect(page.locator('.dish-card', { hasText: 'كشري' }).getByTestId('dish-calories')).toHaveText('٥٢٠–٨٤٠ سعر حراري');
  await expect(page.locator('.dish-card', { hasText: 'فتة' }).getByTestId('dish-calories')).toHaveCount(0);
  await page.getByRole('button', { name: 'أضف كشري للطلب' }).click();
  let dish = page.getByRole('dialog', { name: 'كشري' });
  await expect(dish.getByTestId('size-facts')).toHaveText(['٥٢٠ سعر حراري · ٣٥٠ جم · يكفي شخص واحد', '٨٤٠ سعر حراري · يكفي شخصين']);
  await expect(dish.locator('.calories-note')).toHaveText('السعرات الحرارية تقريبية.');
  await dish.getByRole('button', { name: 'إغلاق' }).click();

  await chooseLanguage(page, 'Français');
  await expect(page.locator('.dish-card', { hasText: 'Kochari' }).getByTestId('dish-calories')).toHaveText('520–840 kcal');
  await expect(page.locator('.dish-card', { hasText: 'Lemon mint' }).getByTestId('dish-calories')).toHaveText('120 kcal');
  await page.getByRole('button', { name: 'Add Kochari to your order' }).click();
  dish = page.getByRole('dialog', { name: 'Kochari' });
  await expect(dish.getByTestId('size-facts')).toHaveText(['520 kcal · 350 g · Serves 1', '840 kcal · Serves 2']);
  await expect(dish.locator('.calories-note')).toHaveText('Calories are approximate.');
  await axe(page);
  await dish.getByRole('button', { name: 'Close' }).click();

  // One size: its facts sit under the description.
  await page.locator('.dish-card', { hasText: 'Lemon mint' }).click();
  dish = page.getByRole('dialog', { name: 'Lemon mint' });
  await expect(dish.getByTestId('size-facts')).toHaveText('120 kcal · 330 ml');
  await dish.getByRole('button', { name: 'Close' }).click();

  // Nothing set: no facts and no note.
  await page.locator('.dish-card', { hasText: 'Fatta' }).click();
  dish = page.getByRole('dialog', { name: 'Fatta' });
  await expect(dish.getByTestId('size-facts')).toHaveCount(0);
  await expect(dish.locator('.calories-note')).toHaveCount(0);
});

test('searches the language being read, and Arabic and English too', async ({ page }) => {
  await serveMenu(page, translatedMenu());
  await page.goto(restaurantUrl());
  await chooseLanguage(page, 'Français');
  const search = page.getByRole('searchbox');
  for (const query of ['kochari', 'lentilles', 'Koshary', 'كشري']) {
    await search.fill(query);
    await expect(page.locator('.dish-card')).toHaveCount(1);
    await expect(page.locator('.dish-card')).toContainText('Kochari');
  }
  await search.fill('Кошари'); // Russian is not the language being read.
  await expect(page.locator('.dish-card')).toHaveCount(0);
});

test('the cart survives a language switch and follows it', async ({ page }) => {
  await serveMenu(page, translatedMenu());
  await page.goto(restaurantUrl());
  await page.getByRole('button', { name: 'أضف ليمون نعناع للطلب' }).click();
  await expect(page.locator('.cart-bar')).toContainText('٤٥');

  await chooseLanguage(page, 'Français');
  await expect(page.locator('.cart-bar')).toContainText('View order');
  await expect(page.locator('.cart-bar')).toContainText('45');
  await page.getByRole('button', { name: 'Add Kochari to your order' }).click();
  await page.getByRole('dialog', { name: 'Kochari' }).getByRole('button', { name: /Add to order/ }).click();

  await page.locator('.cart-bar').click();
  const cart = page.getByRole('dialog', { name: 'Your order' });
  await expect(cart.locator('.cart-line-name')).toHaveText(['Lemon mint', 'Kochari · Petit']);
  await cart.getByRole('button', { name: 'Close' }).click();

  await chooseLanguage(page, 'Русский');
  await page.locator('.cart-bar').click();
  await expect(page.getByRole('dialog', { name: 'Your order' }).locator('.cart-line-name')).toHaveText(['Лимонад с мятой', 'Кошари · Маленький']);
});

test('order tracking reads in English after an extra language (orders keep Arabic and English only)', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('bilhanah:menu-language:v1:koshary', 'fr'); localStorage.setItem('bilhanah:language:v1', 'en'); });
  await serveMenu(page, translatedMenu());
  await mockRealtime(page, 'fail');
  await page.route('**/v1/public/orders/**', route => route.fulfill(json(orderFixture('PREPARING'))));
  await page.goto(restaurantUrl(`/order/${TOKEN}`));
  await expect(page.locator('.track-item-name').first()).toContainText('Koshary');
  await expect(page.locator('.track-item-name').first()).toContainText('Large');
  await expect(page.locator('.track-page')).toHaveAttribute('lang', 'en');
});

test.describe('a browser that prefers French', () => {
  test.use({ locale: 'fr-FR' });

  test('opens in French when the restaurant offers it, without recording a choice', async ({ page }) => {
    await serveMenu(page, translatedMenu());
    await page.goto(restaurantUrl());
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.getByRole('heading', { level: 2, name: 'Plats' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('bilhanah:menu-language:v1:koshary'))).toBeNull();
  });

  test('keeps the restaurant default when French is not offered, and a stored choice wins', async ({ page }) => {
    await serveMenu(page, translatedMenu(['ru']));
    await page.goto(restaurantUrl());
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');

    await serveMenu(page, translatedMenu());
    await page.evaluate(() => localStorage.setItem('bilhanah:menu-language:v1:koshary', 'ar'));
    await page.reload();
    await expect(page.getByRole('heading', { level: 2, name: 'رئيسي' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  });
});

for (const width of [320, 390, 768]) {
  test(`no horizontal scroll at ${width}px in French and Russian, with the language sheet open`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await serveMenu(page, translatedMenu());
    await page.goto(restaurantUrl());
    for (const language of ['Français', 'Русский']) {
      await chooseLanguage(page, language);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
    await page.getByTestId('menu-language').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const box = await page.getByTestId('menu-language').boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });
}

test('a menu without ordering lists each size with its facts', async ({ page }) => {
  const menu = translatedMenu() as unknown as Mutable;
  menu.restaurant.ordering = { accepting: false, dineIn: true, pickup: true };
  await serveMenu(page, menu as unknown as PublicMenuResponse);
  await page.goto(restaurantUrl());
  await chooseLanguage(page, 'Français');
  await page.locator('.dish-card', { hasText: 'Kochari' }).click();
  const dish = page.getByRole('dialog', { name: 'Kochari' });
  await expect(dish.locator('.dish-sheet-prices li')).toHaveCount(2);
  await expect(dish.locator('.dish-sheet-prices li').first()).toContainText('Petit');
  await expect(dish.getByTestId('size-facts')).toHaveText(['520 kcal · 350 g · Serves 1', '840 kcal · Serves 2']);
  await expect(dish.locator('.calories-note')).toHaveText('Calories are approximate.');
});
