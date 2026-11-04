/**
 * Counted nouns in Egyptian Arabic and English. Arabic picks its noun form by number
 * (Intl.PluralRules 'ar': 1 · 2 · 3–10 · 11–99 · 0 and 100+), so a count is never shown as
 * "فاضل 1 خطوات". `{n}` in a form is replaced with the number in the interface's digits.
 *
 *   countText(3, { one: 'طلب واحد', two: 'طلبين', few: '{n} طلبات', many: '{n} طلب' }, …) → "٣ طلبات"
 */
export type ArabicForms = {
  /** 1, e.g. "طلب واحد" or "{n} طلب" when the number should stay visible. */
  one: string;
  /** 2, the dual: "طلبين". */
  two: string;
  /** 3–10: "{n} طلبات". */
  few: string;
  /** 11–99 and 100+: "{n} طلب". */
  many: string;
  /** 0, when it reads better than "٠ طلب": "مفيش طلبات". */
  zero?: string;
};
export type EnglishForms = { one: string; other: string; zero?: string };

const arabicRules = new Intl.PluralRules('ar');
const englishRules = new Intl.PluralRules('en');

export function arabicForm(count: number, forms: ArabicForms): string {
  switch (arabicRules.select(count)) {
    case 'zero': return forms.zero ?? forms.many;
    case 'one': return forms.one;
    case 'two': return forms.two;
    case 'few': return forms.few;
    default: return forms.many;
  }
}

export function englishForm(count: number, forms: EnglishForms): string {
  if (count === 0 && forms.zero) return forms.zero;
  return englishRules.select(count) === 'one' ? forms.one : forms.other;
}

/** The counted phrase in `language`, with `digits` formatting the number (Arabic-Indic in Arabic). */
export function countText(language: 'ar' | 'en', count: number, ar: ArabicForms, en: EnglishForms, digits: (value: number) => string): string {
  const form = language === 'ar' ? arabicForm(count, ar) : englishForm(count, en);
  // A no-break space keeps the number with its noun when the line wraps ("٣٠ يوم", never "٣٠ / يوم").
  return form.replaceAll('{n} ', `${digits(count)}\u00a0`).replaceAll('{n}', digits(count));
}

/** Nouns the dashboard counts often. */
export const NOUNS = {
  day: [{ one: 'يوم واحد', two: 'يومين', few: '{n} أيام', many: '{n} يوم' }, { one: '{n} day', other: '{n} days' }],
  order: [{ one: 'طلب واحد', two: 'طلبين', few: '{n} طلبات', many: '{n} طلب', zero: 'مفيش طلبات' }, { one: '{n} order', other: '{n} orders', zero: 'No orders' }],
  item: [{ one: 'صنف واحد', two: 'صنفين', few: '{n} أصناف', many: '{n} صنف' }, { one: '{n} item', other: '{n} items' }],
  category: [{ one: 'قسم واحد', two: 'قسمين', few: '{n} أقسام', many: '{n} قسم' }, { one: '{n} category', other: '{n} categories' }],
  table: [{ one: 'طاولة واحدة', two: 'طاولتين', few: '{n} طاولات', many: '{n} طاولة' }, { one: '{n} table', other: '{n} tables' }],
  seat: [{ one: 'فرد واحد', two: 'فردين', few: '{n} أفراد', many: '{n} فرد' }, { one: '{n} seat', other: '{n} seats' }],
  size: [{ one: 'حجم واحد', two: 'حجمين', few: '{n} أحجام', many: '{n} حجم' }, { one: '{n} size', other: '{n} sizes' }],
  step: [{ one: 'خطوة واحدة', two: 'خطوتين', few: '{n} خطوات', many: '{n} خطوة' }, { one: '{n} step', other: '{n} steps' }],
  result: [{ one: 'نتيجة واحدة', two: 'نتيجتين', few: '{n} نتايج', many: '{n} نتيجة' }, { one: '{n} result', other: '{n} results' }],
  design: [{ one: 'تصميم واحد', two: 'تصميمين', few: '{n} تصميمات', many: '{n} تصميم' }, { one: '{n} design', other: '{n} designs' }],
  stand: [{ one: 'ستاند واحد', two: 'ستاندين', few: '{n} ستاندات', many: '{n} ستاند' }, { one: '{n} stand', other: '{n} stands' }],
  card: [{ one: 'كارت واحد', two: 'كارتين', few: '{n} كروت', many: '{n} كارت' }, { one: '{n} card', other: '{n} cards' }],
  visit: [{ one: 'زيارة واحدة', two: 'زيارتين', few: '{n} زيارات', many: '{n} زيارة' }, { one: '{n} visit', other: '{n} visits' }],
  second: [{ one: 'ثانية واحدة', two: 'ثانيتين', few: '{n} ثواني', many: '{n} ثانية' }, { one: '{n} second', other: '{n} seconds' }],
  character: [{ one: 'حرف واحد', two: 'حرفين', few: '{n} حروف', many: '{n} حرف' }, { one: '{n} character', other: '{n} characters' }],
  branch: [{ one: 'فرع واحد', two: 'فرعين', few: '{n} فروع', many: '{n} فرع' }, { one: '{n} branch', other: '{n} branches' }],
  account: [{ one: 'حساب واحد', two: 'حسابين', few: '{n} حسابات', many: '{n} حساب' }, { one: '{n} account', other: '{n} accounts' }],
  minute: [{ one: 'دقيقة واحدة', two: 'دقيقتين', few: '{n} دقايق', many: '{n} دقيقة' }, { one: '{n} min', other: '{n} min' }],
} satisfies Record<string, [ArabicForms, EnglishForms]>;

export type Noun = keyof typeof NOUNS;
