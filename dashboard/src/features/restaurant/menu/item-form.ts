import { z } from 'zod';
import { type createItemSchema, type ExtraMenuLanguage, MAX_PRICE_PIASTRES, MENU_LIMITS, type OwnerMenuItem, PORTION_UNITS, type Translations } from '@bilhanah/contracts';
import { egpToPiastres, piastresToInput } from '../../../lib/format';
import { EMPTY_NUTRITION, type NutritionDraft, nutritionDraft, nutritionIssues, nutritionPayload, translationsDraft, translationsPayload } from './menu-languages';

/** The item editor's form: everything as typed, checked here, then turned into the API body by `itemBody`. */

const nutritionFields = {
  calories: z.string(),
  portionValue: z.string(),
  portionUnit: z.enum(['', ...PORTION_UNITS]),
  serves: z.string(),
};

const sizeSchema = z.object({
  nameAr: z.string().trim().max(40),
  nameEn: z.string().trim().max(40),
  price: z.string(),
  translations: z.record(z.string(), z.object({ name: z.string().trim().max(40) })),
  /** The size's saved translations, so languages that are switched off keep theirs. */
  saved: z.custom<Translations<'name'>>(),
  ...nutritionFields,
});

export const itemFormSchema = z.object({
  nameAr: z.string().trim().min(1).max(100),
  nameEn: z.string().trim().max(100),
  descriptionAr: z.string().trim().max(500),
  descriptionEn: z.string().trim().max(500),
  translations: z.record(z.string(), z.object({ name: z.string().trim().max(100), description: z.string().trim().max(500) })),
  categoryId: z.string().min(1),
  isAvailable: z.boolean(),
  isVisible: z.boolean(),
  pricing: z.enum(['single', 'sizes']),
  price: z.string(),
  single: z.object(nutritionFields),
  sizes: z.array(sizeSchema).max(MENU_LIMITS.variantsPerItem),
}).superRefine((values, context) => {
  const checkPrice = (value: string, path: (string | number)[]) => {
    const piastres = egpToPiastres(value);
    if (piastres === null) context.addIssue({ code: 'custom', path, message: '@@price' });
    else if (piastres > MAX_PRICE_PIASTRES) context.addIssue({ code: 'custom', path, message: '@@price-max' });
  };
  const checkNutrition = (draft: NutritionDraft, path: (string | number)[]) => {
    for (const issue of nutritionIssues(draft)) context.addIssue({ code: 'custom', path: [...path, issue.field], message: issue.message });
  };
  if (values.pricing === 'single') {
    checkPrice(values.price, ['price']);
    checkNutrition(values.single, ['single']);
    return;
  }
  if (values.sizes.length < 2) context.addIssue({ code: 'custom', path: ['sizes'], message: '@@sizes-min' });
  values.sizes.forEach((size, index) => {
    if (!size.nameAr) context.addIssue({ code: 'custom', path: ['sizes', index, 'nameAr'], message: '@@required' });
    checkPrice(size.price, ['sizes', index, 'price']);
    checkNutrition(size, ['sizes', index]);
  });
});
export type ItemForm = z.input<typeof itemFormSchema>;
export type SizeForm = ItemForm['sizes'][number];

export function emptySize(languages: readonly ExtraMenuLanguage[]): SizeForm {
  return { nameAr: '', nameEn: '', price: '', translations: translationsDraft(undefined, languages, ['name']), saved: {}, ...EMPTY_NUTRITION };
}

export function itemFormDefaults(item: OwnerMenuItem | undefined, categoryId: string, languages: readonly ExtraMenuLanguage[]): ItemForm {
  const variants = item?.variants ?? [];
  const sized = variants.length > 1;
  return {
    nameAr: item?.nameAr ?? '',
    nameEn: item?.nameEn ?? '',
    descriptionAr: item?.descriptionAr ?? '',
    descriptionEn: item?.descriptionEn ?? '',
    translations: translationsDraft(item?.translations, languages, ['name', 'description']),
    categoryId: item?.categoryId ?? categoryId,
    isAvailable: item?.isAvailable ?? true,
    isVisible: item?.isVisible ?? true,
    pricing: sized ? 'sizes' : 'single',
    price: !sized && variants[0] ? piastresToInput(variants[0].pricePiastres) : '',
    single: !sized ? nutritionDraft(variants[0]) : { ...EMPTY_NUTRITION },
    sizes: sized
      ? variants.map(variant => ({
          nameAr: variant.nameAr ?? '',
          nameEn: variant.nameEn ?? '',
          price: piastresToInput(variant.pricePiastres),
          translations: translationsDraft(variant.translations, languages, ['name']),
          saved: variant.translations,
          ...nutritionDraft(variant),
        }))
      : [emptySize(languages), emptySize(languages)],
  };
}

const orNull = (value: string) => value.trim() || null;

type ItemBody = z.input<typeof createItemSchema>;

/** The create/update body for a checked form. Translations in languages that are switched off are kept as saved. */
export function itemBody(values: ItemForm, item: OwnerMenuItem | undefined, languages: readonly ExtraMenuLanguage[], extra: { imageId: string | null; stationId: string | null }): ItemBody {
  const variants: ItemBody['variants'] = values.pricing === 'single'
    ? [{ nameAr: null, nameEn: null, translations: {}, pricePiastres: egpToPiastres(values.price)!, ...nutritionPayload(values.single) }]
    : values.sizes.map(size => ({
        nameAr: orNull(size.nameAr),
        nameEn: orNull(size.nameEn),
        translations: translationsPayload(size.saved, size.translations, languages),
        pricePiastres: egpToPiastres(size.price)!,
        ...nutritionPayload(size),
      }));
  return {
    categoryId: values.categoryId,
    nameAr: values.nameAr.trim(),
    nameEn: orNull(values.nameEn),
    descriptionAr: orNull(values.descriptionAr),
    descriptionEn: orNull(values.descriptionEn),
    translations: translationsPayload(item?.translations, values.translations, languages),
    imageId: extra.imageId,
    isAvailable: values.isAvailable,
    isVisible: values.isVisible,
    stationId: extra.stationId,
    variants,
  };
}

/** The extra language a form path belongs to (`translations.fr.name`, `sizes.1.translations.fr.name`), if any. */
export function languageOfPath(path: string): string | null {
  const match = /(?:^|\.)translations\.([a-z]{2})(?:\.|$)/.exec(path);
  return match ? match[1]! : null;
}
