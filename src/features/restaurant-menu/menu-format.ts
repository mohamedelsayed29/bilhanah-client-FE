import type { ImageSet, MenuVariant, OpeningHours, Weekday } from '@bilhanah/contracts';
import type { Language } from '../../lib/language';

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

export function variantLabel(variant: MenuVariant, language: Language): string | null {
  return localized(language, variant.nameAr, variant.nameEn);
}

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

/** Black or white, whichever reads better on `hex`. */
export function readableTextOn(hex: string): '#ffffff' | '#1c2420' {
  const [r, g, b] = [1, 3, 5].map(index => {
    const channel = parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  // Contrast against white vs. against #1c2420 (relative luminance 0.0161); pick the larger.
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.0661 ? '#ffffff' : '#1c2420';
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
