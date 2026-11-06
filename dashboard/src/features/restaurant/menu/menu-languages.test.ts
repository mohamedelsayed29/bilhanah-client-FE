import { describe, expect, it } from 'vitest';
import type { MenuVariant, OwnerMenu, OwnerMenuItem } from '@bilhanah/contracts';
import {
  caloriesRange, filterUntranslated, itemFormPath, languageRows, missingLanguages, moveLanguage, nutritionDraft, nutritionIssues, nutritionPayload,
  parseWholeNumber, toggleLanguage, translationGaps, translationProgress, translationsDraft, translationsPayload,
} from './menu-languages';

const noNutrition = { calories: null, portionValue: null, portionUnit: null, serves: null };
const variant = (extra: Partial<MenuVariant> = {}): MenuVariant => ({ id: 'v', nameAr: null, nameEn: null, translations: {}, pricePiastres: 1000, ...noNutrition, ...extra });
const item = (id: string, extra: Partial<OwnerMenuItem> = {}): OwnerMenuItem => ({
  id, categoryId: 'c', nameAr: id, nameEn: null, descriptionAr: null, descriptionEn: null, translations: {}, image: null,
  isAvailable: true, isVisible: true, stationId: null, variants: [variant()], ...extra,
});

describe('translations payload', () => {
  it('fills a box per enabled language and field', () => {
    expect(translationsDraft({ fr: { name: 'Kochari' }, ru: { name: 'Кошари' } }, ['fr', 'de'], ['name', 'description'])).toEqual({
      fr: { name: 'Kochari', description: '' },
      de: { name: '', description: '' },
    });
  });

  it('takes enabled languages from the boxes, trimmed, and drops emptied text', () => {
    const saved = { fr: { name: 'Kochari', description: 'Riz' } };
    expect(translationsPayload(saved, { fr: { name: '  Kochari maison ', description: '' } }, ['fr'])).toEqual({ fr: { name: 'Kochari maison' } });
    expect(translationsPayload(saved, { fr: { name: ' ', description: '' } }, ['fr'])).toEqual({});
  });

  it('keeps what languages that are switched off already had (a PATCH replaces the whole object)', () => {
    const saved = { fr: { name: 'Kochari' }, ru: { name: 'Кошари' } };
    expect(translationsPayload(saved, { fr: { name: 'Kochari' }, de: { name: 'Koschari' } }, ['fr', 'de'])).toEqual({
      fr: { name: 'Kochari' }, de: { name: 'Koschari' }, ru: { name: 'Кошари' },
    });
    // A language that is on but missing from the draft (e.g. turned on mid-edit) keeps its saved text.
    expect(translationsPayload(saved, {}, ['fr'])).toEqual(saved);
    expect(translationsPayload(undefined, undefined, [])).toEqual({});
  });
});

describe('translation progress', () => {
  const sized = item('sized', {
    descriptionEn: 'Rice and lentils',
    translations: { fr: { name: 'Kochari', description: 'Riz et lentilles' } },
    variants: [variant({ nameAr: 'صغير', translations: { fr: { name: 'Petit' } } }), variant({ nameAr: 'كبير' })],
  });

  it('counts a dish as translated only with its name, its description (when it has one) and every named size', () => {
    expect(translationGaps(sized, 'fr')).toEqual({ name: false, description: false, sizes: 1 });
    expect(translationGaps(item('plain'), 'fr')).toEqual({ name: true, description: false, sizes: 0 });
    // A single unnamed price has no size name to translate.
    expect(translationGaps(item('one', { translations: { fr: { name: 'Un' } } }), 'fr')).toEqual({ name: false, description: false, sizes: 0 });
    expect(missingLanguages(item('one', { translations: { fr: { name: 'Un' } } }), ['fr', 'ru'])).toEqual(['ru']);
  });

  it('summarises dishes and categories per language and filters what is missing', () => {
    const done = item('done', { translations: { fr: { name: 'Fait' }, ru: { name: 'Готово' } } });
    const menu: OwnerMenu = {
      categories: [
        { id: 'a', nameAr: 'أ', nameEn: null, translations: { fr: { name: 'A' } }, isVisible: true, stationId: null, items: [sized, done] },
        { id: 'b', nameAr: 'ب', nameEn: null, translations: {}, isVisible: true, stationId: null, items: [done] },
      ],
    };
    expect(translationProgress(menu, ['fr', 'ru'])).toEqual([
      { language: 'fr', dishes: 3, translatedDishes: 2, categories: 2, translatedCategories: 1 },
      { language: 'ru', dishes: 3, translatedDishes: 2, categories: 2, translatedCategories: 0 },
    ]);
    expect(translationProgress(undefined, ['fr'])[0]).toMatchObject({ dishes: 0, translatedDishes: 0 });
    const missing = filterUntranslated(menu.categories, ['fr', 'ru']);
    expect(missing.map(category => [category.id, category.items.map(entry => entry.id)])).toEqual([['a', ['sized']]]);
    expect(filterUntranslated(menu.categories, ['fr', 'ru'], 'ru').flatMap(category => category.items.map(entry => entry.id))).toEqual(['sized']);
  });
});

describe('language list', () => {
  it('switches languages on at the end, off anywhere, and moves them within bounds', () => {
    expect(toggleLanguage(['fr', 'ru'], 'de', true)).toEqual(['fr', 'ru', 'de']);
    expect(toggleLanguage(['fr', 'ru', 'de'], 'ru', false)).toEqual(['fr', 'de']);
    expect(toggleLanguage(['fr'], 'fr', true)).toEqual(['fr']);
    expect(moveLanguage(['fr', 'ru', 'de'], 'de', -1)).toEqual(['fr', 'de', 'ru']);
    expect(moveLanguage(['fr', 'ru'], 'fr', -1)).toEqual(['fr', 'ru']);
    expect(moveLanguage(['fr', 'ru'], 'ru', 1)).toEqual(['fr', 'ru']);
    expect(languageRows(['ru', 'fr'])).toEqual(['ru', 'fr', 'de', 'it', 'es', 'zh', 'tr']);
  });
});

describe('nutrition', () => {
  it('reads whole numbers in any digits', () => {
    expect(parseWholeNumber(' ٣٥٠ ')).toBe(350);
    expect(parseWholeNumber('')).toBeNull();
    expect(parseWholeNumber('12.5')).toBeNaN();
    expect(parseWholeNumber('abc')).toBeNaN();
  });

  it('checks the limits and that a portion has both its amount and unit', () => {
    expect(nutritionIssues({ calories: '520', portionValue: '350', portionUnit: 'GRAM', serves: '2' })).toEqual([]);
    expect(nutritionIssues({ calories: '10001', portionValue: '', portionUnit: '', serves: '0' })).toEqual([
      { field: 'calories', message: '@@max|number|10000' },
      { field: 'serves', message: '@@min|number|1' },
    ]);
    expect(nutritionIssues({ calories: '', portionValue: '350', portionUnit: '', serves: '' })).toEqual([{ field: 'portionUnit', message: '@@portion' }]);
    expect(nutritionIssues({ calories: '', portionValue: '', portionUnit: 'ML', serves: '' })).toEqual([{ field: 'portionValue', message: '@@portion' }]);
    expect(nutritionIssues({ calories: '1.5', portionValue: '', portionUnit: '', serves: '' })).toEqual([{ field: 'calories', message: '@@whole' }]);
  });

  it('round-trips a size between the API and the form', () => {
    const saved = { calories: 520, portionValue: 350, portionUnit: 'GRAM' as const, serves: null };
    expect(nutritionDraft(saved)).toEqual({ calories: '520', portionValue: '350', portionUnit: 'GRAM', serves: '' });
    expect(nutritionPayload(nutritionDraft(saved))).toEqual(saved);
    expect(nutritionPayload({ calories: '', portionValue: '', portionUnit: '', serves: '٤' })).toEqual({ calories: null, portionValue: null, portionUnit: null, serves: 4 });
  });

  it('finds the calorie range of a dish', () => {
    expect(caloriesRange(item('a'))).toBeNull();
    expect(caloriesRange(item('a', { variants: [variant({ calories: 520 }), variant(), variant({ calories: 980 })] }))).toEqual({ min: 520, max: 980 });
  });
});

describe('issue paths', () => {
  it('maps request paths onto the item form', () => {
    expect(itemFormPath('variants.0.portionUnit', 'single')).toBe('single.portionUnit');
    expect(itemFormPath('variants.0.pricePiastres', 'single')).toBe('price');
    expect(itemFormPath('variants.1.portionValue', 'sizes')).toBe('sizes.1.portionValue');
    expect(itemFormPath('variants.1.pricePiastres', 'sizes')).toBe('sizes.1.price');
    expect(itemFormPath('variants.2.translations.fr.name', 'sizes')).toBe('sizes.2.translations.fr.name');
    expect(itemFormPath('variants', 'sizes')).toBe('sizes');
    expect(itemFormPath('translations.de.name', 'sizes')).toBe('translations.de.name');
    expect(itemFormPath('', 'sizes')).toBeNull();
  });
});
