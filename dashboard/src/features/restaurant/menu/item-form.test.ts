import { describe, expect, it } from 'vitest';
import { createItemSchema, type MenuVariant, type OwnerMenuItem, updateItemSchema } from '@bilhanah/contracts';
import { contractIssues } from '../../../lib/forms';
import { itemBody, itemFormDefaults, itemFormSchema, languageOfPath } from './item-form';
import { itemFormPath } from './menu-languages';

const CATEGORY = '6b4512a7-62aa-4a4f-ae51-fffa699564db';
const size = (id: string, nameAr: string, extra: Partial<MenuVariant> = {}): MenuVariant => ({
  id, nameAr, nameEn: null, translations: {}, pricePiastres: 3500, calories: null, portionValue: null, portionUnit: null, serves: null, ...extra,
});
const koshary: OwnerMenuItem = {
  id: 'k', categoryId: CATEGORY, nameAr: 'كشري', nameEn: 'Koshary', descriptionAr: 'رز وعدس', descriptionEn: null,
  translations: { fr: { name: 'Kochari', description: 'Riz' }, ru: { name: 'Кошари' } },
  image: null, isAvailable: true, isVisible: true, stationId: null,
  variants: [
    size('s', 'صغير', { translations: { fr: { name: 'Petit' }, ru: { name: 'Маленький' } }, calories: 520, portionValue: 350, portionUnit: 'GRAM', serves: 1 }),
    size('l', 'كبير', { pricePiastres: 6500, translations: { ru: { name: 'Большой' } } }),
  ],
};
const extra = { imageId: null, stationId: null };

describe('item form', () => {
  it('saves an untouched dish exactly as it was', () => {
    const values = itemFormDefaults(koshary, 'c', ['fr', 'de']);
    expect(values.translations).toEqual({ fr: { name: 'Kochari', description: 'Riz' }, de: { name: '', description: '' } });
    expect(values.sizes[0]).toMatchObject({ calories: '520', portionValue: '350', portionUnit: 'GRAM', serves: '1', translations: { fr: { name: 'Petit' }, de: { name: '' } } });
    const body = itemBody(values, koshary, ['fr', 'de'], extra);
    // Russian is switched off here, so its text stays as saved.
    expect(body.translations).toEqual(koshary.translations);
    expect(body.variants).toEqual([
      { nameAr: 'صغير', nameEn: null, translations: koshary.variants[0]!.translations, pricePiastres: 3500, calories: 520, portionValue: 350, portionUnit: 'GRAM', serves: 1 },
      { nameAr: 'كبير', nameEn: null, translations: { ru: { name: 'Большой' } }, pricePiastres: 6500, calories: null, portionValue: null, portionUnit: null, serves: null },
    ]);
    expect(contractIssues(updateItemSchema, body)).toEqual([]);
  });

  it('adds a German name and a size’s nutrition, and clears a French size name', () => {
    const values = itemFormDefaults(koshary, 'c', ['fr', 'de']);
    values.translations['de'] = { name: 'Koschari', description: '' };
    values.sizes[0]!.translations['fr'] = { name: '' };
    Object.assign(values.sizes[1]!, { calories: '٩٨٠', portionValue: '700', portionUnit: 'GRAM', serves: '2' });
    const body = itemBody(values, koshary, ['fr', 'de'], extra);
    expect(body.translations).toEqual({ fr: { name: 'Kochari', description: 'Riz' }, de: { name: 'Koschari' }, ru: { name: 'Кошари' } });
    expect(body.variants[0]!.translations).toEqual({ ru: { name: 'Маленький' } });
    expect(body.variants[1]).toMatchObject({ calories: 980, portionValue: 700, portionUnit: 'GRAM', serves: 2 });
  });

  it('sends one unnamed price with its nutrition for a single-price dish', () => {
    const values = itemFormDefaults(undefined, CATEGORY, ['fr']);
    Object.assign(values, { nameAr: 'طحينة', pricing: 'single', price: '20', single: { calories: '120', portionValue: '60', portionUnit: 'GRAM', serves: '' } });
    const body = itemBody(values, undefined, ['fr'], extra);
    expect(body.variants).toEqual([{ nameAr: null, nameEn: null, translations: {}, pricePiastres: 2000, calories: 120, portionValue: 60, portionUnit: 'GRAM', serves: null }]);
    expect(body.translations).toEqual({});
    expect(contractIssues(createItemSchema, body)).toEqual([]);
  });

  it('flags a portion without its unit on the right field', () => {
    const values = itemFormDefaults(koshary, 'c', []);
    values.sizes[1]!.portionValue = '700';
    const result = itemFormSchema.safeParse(values);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map(issue => [issue.path.join('.'), issue.message])).toEqual([['sizes.1.portionUnit', '@@portion']]);
    // The contract's own check (also what the API answers) lands on the same field.
    const body = { ...itemBody(itemFormDefaults(koshary, 'c', []), koshary, [], extra) };
    body.variants = body.variants.map((entry, index) => (index === 1 ? { ...entry, portionValue: 700, portionUnit: null } : entry));
    const issues = contractIssues(updateItemSchema, body);
    expect(issues).toEqual([{ path: 'variants.1.portionUnit', message: 'Give the portion amount and its unit.' }]);
    expect(itemFormPath(issues[0]!.path, 'sizes')).toBe('sizes.1.portionUnit');
  });

  it('finds the language of a translation field', () => {
    expect(languageOfPath('translations.fr.name')).toBe('fr');
    expect(languageOfPath('sizes.1.translations.de.name')).toBe('de');
    expect(languageOfPath('sizes.1.nameAr')).toBeNull();
  });
});
