import {
  EXTRA_MENU_LANGUAGES,
  type ExtraMenuLanguage,
  hasTranslation,
  NUTRITION_LIMITS,
  type OwnerMenu,
  type OwnerMenuCategory,
  type OwnerMenuItem,
  type PortionUnit,
  type Translations,
  type VariantNutrition,
} from '@bilhanah/contracts';
import { normalizeDigits } from '../../../lib/format';

/**
 * Pure helpers for the menu's extra languages and per-size nutrition: the editor's
 * form drafts and the payloads built from them, and translation progress.
 */

// --- Translations ------------------------------------------------------------------

/** The editor's text boxes for each extra language: { fr: { name: '', description: '' } }. */
export type TranslationsDraft<Field extends string> = Record<string, Record<Field, string>>;

/** One text box per enabled language and field, filled from what is saved. */
export function translationsDraft<Field extends string>(saved: Translations<Field> | undefined, languages: readonly ExtraMenuLanguage[], fields: readonly Field[]): TranslationsDraft<Field> {
  const draft: TranslationsDraft<Field> = {};
  for (const language of languages) {
    draft[language] = Object.fromEntries(fields.map(field => [field, saved?.[language]?.[field] ?? ''])) as Record<Field, string>;
  }
  return draft;
}

/**
 * The `translations` to send. A PATCH replaces the whole object, so languages the restaurant
 * has switched off keep what they had (switching one back on brings its text back); the
 * enabled ones take the boxes as typed, and an emptied box drops that text.
 */
export function translationsPayload<Field extends string>(
  saved: Translations<Field> | undefined,
  draft: Partial<Record<string, Partial<Record<Field, string>>>> | undefined,
  languages: readonly ExtraMenuLanguage[],
): Translations<Field> {
  const result: Translations<Field> = {};
  for (const language of EXTRA_MENU_LANGUAGES) {
    const source = languages.includes(language) && draft?.[language] ? draft[language] : saved?.[language];
    if (!source) continue;
    const kept = Object.fromEntries(Object.entries<string | undefined>(source).map(([field, text]) => [field, text?.trim() ?? '']).filter(([, text]) => text));
    if (Object.keys(kept).length) result[language] = kept as Partial<Record<Field, string>>;
  }
  return result;
}

/** What a dish still lacks in one language: its name, its description (when it has one) and the names of its named sizes. */
export function translationGaps(item: OwnerMenuItem, language: ExtraMenuLanguage) {
  const described = Boolean(item.descriptionAr || item.descriptionEn);
  const namedSizes = item.variants.length > 1 ? item.variants.filter(variant => variant.nameAr || variant.nameEn) : [];
  return {
    name: !hasTranslation(item, language),
    description: described && !hasTranslation(item, language, 'description'),
    sizes: namedSizes.filter(variant => !hasTranslation(variant, language)).length,
  };
}

export function isTranslated(item: OwnerMenuItem, language: ExtraMenuLanguage): boolean {
  const gaps = translationGaps(item, language);
  return !gaps.name && !gaps.description && gaps.sizes === 0;
}

/** The enabled languages a dish is not fully translated into, in the restaurant's order. */
export function missingLanguages(item: OwnerMenuItem, languages: readonly ExtraMenuLanguage[]): ExtraMenuLanguage[] {
  return languages.filter(language => !isTranslated(item, language));
}

export type LanguageProgress = { language: ExtraMenuLanguage; dishes: number; translatedDishes: number; categories: number; translatedCategories: number };

/** How far the menu is translated into each language: fully translated dishes, and named categories. */
export function translationProgress(menu: OwnerMenu | undefined, languages: readonly ExtraMenuLanguage[]): LanguageProgress[] {
  const categories = menu?.categories ?? [];
  const items = categories.flatMap(category => category.items);
  return languages.map(language => ({
    language,
    dishes: items.length,
    translatedDishes: items.filter(item => isTranslated(item, language)).length,
    categories: categories.length,
    translatedCategories: categories.filter(category => hasTranslation(category, language)).length,
  }));
}

/** Keeps only the dishes missing a translation (in `language`, or in any enabled language); empty categories drop out. */
export function filterUntranslated(categories: OwnerMenuCategory[], languages: readonly ExtraMenuLanguage[], language?: ExtraMenuLanguage): OwnerMenuCategory[] {
  const wanted = language ? [language] : languages;
  return categories
    .map(category => ({ ...category, items: category.items.filter(item => missingLanguages(item, wanted).length > 0) }))
    .filter(category => category.items.length > 0);
}

// --- Language list (settings) ------------------------------------------------------

/** Switches a language on (added at the end) or off. */
export function toggleLanguage(list: readonly ExtraMenuLanguage[], language: ExtraMenuLanguage, on: boolean): ExtraMenuLanguage[] {
  const without = list.filter(entry => entry !== language);
  return on ? [...without, language] : without;
}

/** Moves a language one place earlier (-1) or later (+1); out-of-range moves change nothing. */
export function moveLanguage(list: readonly ExtraMenuLanguage[], language: ExtraMenuLanguage, step: -1 | 1): ExtraMenuLanguage[] {
  const from = list.indexOf(language);
  const to = from + step;
  if (from < 0 || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

/** The enabled languages first, in their order, then the rest in the catalogue's order. */
export function languageRows(enabled: readonly ExtraMenuLanguage[]): ExtraMenuLanguage[] {
  return [...enabled, ...EXTRA_MENU_LANGUAGES.filter(language => !enabled.includes(language))];
}

// --- Nutrition ---------------------------------------------------------------------

/** A size's nutrition as typed: whole numbers as text (any digits) and a unit or ''. */
export type NutritionDraft = { calories: string; portionValue: string; portionUnit: PortionUnit | ''; serves: string };

export const EMPTY_NUTRITION: NutritionDraft = { calories: '', portionValue: '', portionUnit: '', serves: '' };

export function nutritionDraft(variant: Partial<VariantNutrition> | undefined): NutritionDraft {
  return {
    calories: variant?.calories != null ? String(variant.calories) : '',
    portionValue: variant?.portionValue != null ? String(variant.portionValue) : '',
    portionUnit: variant?.portionUnit ?? '',
    serves: variant?.serves != null ? String(variant.serves) : '',
  };
}

/** "350", "٣٥٠" → 350; '' → null; anything else (decimals, letters) → NaN. */
export function parseWholeNumber(value: string): number | null {
  const text = normalizeDigits(value.trim());
  if (!text) return null;
  return /^\d{1,7}$/.test(text) ? Number(text) : Number.NaN;
}

export type NutritionIssue = { field: keyof NutritionDraft; message: string };

/**
 * Checks a draft against the contract's limits. Messages are the form's translatable keys
 * (`@@whole`, `@@min|number|n`, `@@max|number|n`, `@@portion`).
 */
export function nutritionIssues(draft: NutritionDraft): NutritionIssue[] {
  const issues: NutritionIssue[] = [];
  const check = (field: 'calories' | 'portionValue' | 'serves', limits: { min: number; max: number }) => {
    const value = parseWholeNumber(draft[field]);
    if (value === null) return;
    if (Number.isNaN(value)) issues.push({ field, message: '@@whole' });
    else if (value < limits.min) issues.push({ field, message: `@@min|number|${limits.min}` });
    else if (value > limits.max) issues.push({ field, message: `@@max|number|${limits.max}` });
  };
  check('calories', NUTRITION_LIMITS.calories);
  check('portionValue', NUTRITION_LIMITS.portion);
  check('serves', NUTRITION_LIMITS.serves);
  const hasAmount = draft.portionValue.trim() !== '';
  if (hasAmount && !draft.portionUnit) issues.push({ field: 'portionUnit', message: '@@portion' });
  if (!hasAmount && draft.portionUnit) issues.push({ field: 'portionValue', message: '@@portion' });
  return issues;
}

/** The variant fields to send; call after `nutritionIssues` found nothing. */
export function nutritionPayload(draft: NutritionDraft): VariantNutrition {
  const number = (value: string) => {
    const parsed = parseWholeNumber(value);
    return parsed === null || Number.isNaN(parsed) ? null : parsed;
  };
  const portionValue = number(draft.portionValue);
  return {
    calories: number(draft.calories),
    portionValue: draft.portionUnit ? portionValue : null,
    portionUnit: portionValue !== null && draft.portionUnit ? draft.portionUnit : null,
    serves: number(draft.serves),
  };
}

export function hasNutritionDraft(draft: NutritionDraft): boolean {
  return Boolean(draft.calories.trim() || draft.portionValue.trim() || draft.portionUnit || draft.serves.trim());
}

/** The lowest and highest calories set on a dish's sizes, or null when none has any. */
export function caloriesRange(item: Pick<OwnerMenuItem, 'variants'>): { min: number; max: number } | null {
  const values = item.variants.map(variant => variant.calories).filter((value): value is number => value !== null);
  return values.length ? { min: Math.min(...values), max: Math.max(...values) } : null;
}

// --- Errors ------------------------------------------------------------------------

/**
 * Where an issue on the request body (from the contract schema or the API, e.g.
 * `variants.1.portionUnit`) shows in the item form. Single-price dishes keep their one
 * size's fields at the top level (`price`, `single.*`); sized dishes under `sizes.N.*`.
 */
export function itemFormPath(path: string, pricing: 'single' | 'sizes'): string | null {
  const parts = path.split('.');
  if (parts[0] !== 'variants') return parts[0] ? path : null;
  if (parts.length === 1) return pricing === 'sizes' ? 'sizes' : 'price';
  const [, index, field, ...rest] = parts;
  if (!field) return pricing === 'sizes' ? `sizes.${index}.price` : 'price';
  if (pricing === 'single') {
    if (field === 'pricePiastres') return 'price';
    if (field === 'calories' || field === 'portionValue' || field === 'portionUnit' || field === 'serves') return `single.${field}`;
    return 'price';
  }
  if (field === 'pricePiastres') return `sizes.${index}.price`;
  return [`sizes.${index}.${field}`, ...rest].join('.');
}
