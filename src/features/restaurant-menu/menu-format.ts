import { menuName, portionLabel, type ImageSet, type MenuLanguage, type MenuVariant, type OpeningHours, type PublicMenuItem, type Weekday } from '@bilhanah/contracts';
import { arabicCount, type Language } from '../../lib/language';

/** The text in the visitor's language, falling back to Arabic when the owner left English empty. */
export function localized(language: Language, ar: string, en: string | null | undefined): string;
export function localized(language: Language, ar: string | null, en: string | null | undefined): string | null;
export function localized(language: Language, ar: string | null, en: string | null | undefined) {
  return language === 'en' && en ? en : ar;
}

/** Piastres as a localized EGP amount without trailing zeros: 4550 → "45.5". */
export function formatPrice(piastres: number, language: Language): string {
  return new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en-EG', { maximumFractionDigits: 2 }).format(piastres / 100);
}

/** A size's name in the menu language (its own translation, else English, else Arabic). */
export function variantLabel(variant: MenuVariant, language: MenuLanguage): string | null {
  return menuName(variant, language);
}

// --- Nutrition, per size (each value is optional and shown only when the owner set it) --------

const numberIn = (language: Language) => (value: number) => new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en-EG').format(value);

/** "520 kcal" / "٥٢٠ سعر حراري"; with `upTo`, a range: "450–720 kcal". */
export function caloriesLabel(calories: number, language: Language, upTo?: number): string {
  const number = numberIn(language);
  if (upTo !== undefined && upTo !== calories) return language === 'ar' ? `${number(calories)}–${number(upTo)} سعر حراري` : `${number(calories)}–${number(upTo)} kcal`;
  return language === 'ar' ? arabicCount(calories, ['سعر حراري', 'سعرين حراريين', 'سعرات حرارية'], number, 'سعر حراري واحد') : `${number(calories)} kcal`;
}

/** "Serves 2" / "يكفي شخصين". */
export function servesLabel(serves: number, language: Language): string {
  return language === 'ar' ? `يكفي ${arabicCount(serves, ['شخص', 'شخصين', 'أشخاص'], numberIn(language))}` : `Serves ${numberIn(language)(serves)}`;
}

/** A size's calories, portion and servings, as short phrases (none when the owner set nothing). */
export function variantFacts(variant: MenuVariant, language: Language): string[] {
  // Older APIs send sizes without these fields.
  const { calories = null, serves = null } = variant;
  return [
    calories !== null ? caloriesLabel(calories, language) : null,
    portionLabel({ portionValue: variant.portionValue ?? null, portionUnit: variant.portionUnit ?? null }, language),
    serves !== null ? servesLabel(serves, language) : null,
  ].filter((fact): fact is string => !!fact);
}

/** The dish's calories for its card: one size's, or the range across the sizes that have them. */
export function dishCalories(item: PublicMenuItem, language: Language): string | null {
  const values = item.variants.map(variant => variant.calories ?? null).filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return caloriesLabel(Math.min(...values), language, Math.max(...values));
}

/** Whether any size states its calories (the sheet then notes they are approximate). */
export const hasCalories = (item: PublicMenuItem) => item.variants.some(variant => (variant.calories ?? null) !== null);

/** `srcset` for an image rendered at most `displayWidth` CSS pixels wide. */
export function imageAttributes(image: ImageSet, displayWidth: string) {
  return {
    src: image.url,
    srcSet: image.sources.map(source => `${source.url} ${source.width}w`).join(', '),
    sizes: displayWidth,
    width: image.width,
    height: image.height,
  };
}

/** WCAG relative luminance of a #rrggbb colour. */
function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(index => {
    const channel = parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG contrast ratio of two #rrggbb colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

/** Black or white, whichever reads better on `hex`. */
export function readableTextOn(hex: string): '#ffffff' | '#35172f' {
  const luminance = relativeLuminance(hex);
  // Contrast against white vs. against #35172f (relative luminance 0.0092); pick the larger.
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.0592 ? '#ffffff' : '#35172f';
}

export const DAY_NAMES: Record<Weekday, { ar: string; en: string }> = {
  sat: { ar: 'السبت', en: 'Saturday' },
  sun: { ar: 'الأحد', en: 'Sunday' },
  mon: { ar: 'الاثنين', en: 'Monday' },
  tue: { ar: 'الثلاثاء', en: 'Tuesday' },
  wed: { ar: 'الأربعاء', en: 'Wednesday' },
  thu: { ar: 'الخميس', en: 'Thursday' },
  fri: { ar: 'الجمعة', en: 'Friday' },
};

/** "09:00" → "9:00 AM" / "٩:٠٠ ص". */
export function formatTime(time: string, language: Language): string {
  const [hours, minutes] = time.split(':').map(Number);
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG' : 'en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
    .format(new Date(Date.UTC(2000, 0, 1, hours, minutes)));
}

export function hasAnyHours(hours: OpeningHours | null): hours is OpeningHours {
  return !!hours && Object.values(hours).some(ranges => ranges.length > 0);
}

/** "12 Tahrir Street" + "Cairo" → "12 Tahrir Street, Cairo"; Arabic text joins with an Arabic comma. */
export function joinAddress(address: string, city: string): string {
  const parts = [address.trim(), city.trim()].filter(Boolean);
  const arabic = /[\u0600-\u06ff]/.test(parts[0] ?? '');
  return parts.join(arabic ? '، ' : ', ');
}

/** wa.me needs an international number; Egyptian mobiles are stored as 01xxxxxxxxx. */
export function whatsappLink(number: string): string {
  const digits = number.replace(/\D/g, '');
  return `https://wa.me/${/^01\d{9}$/.test(digits) ? `2${digits}` : digits}`;
}
