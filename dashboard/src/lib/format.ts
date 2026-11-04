import type { Language } from './language';

const locale = (language: Language) => (language === 'ar' ? 'ar-EG' : 'en-EG');

/** Converts Arabic-Indic and Persian digits (and the Arabic decimal separator) to ASCII. */
export function normalizeDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٫,]/g, '.');
}

/** "45.5" (EGP, as typed, any digits) → 4550 piastres; null when it is not a valid amount. */
export function egpToPiastres(value: string): number | null {
  const text = normalizeDigits(value.trim());
  const match = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

/** 4550 → "45.5" for an input field (ASCII digits, no grouping). */
export function piastresToInput(piastres: number): string {
  const pounds = Math.floor(piastres / 100);
  const rest = piastres % 100;
  return rest === 0 ? String(pounds) : `${pounds}.${String(rest).padStart(2, '0').replace(/0$/, '')}`;
}

/** 4550 → "٤٥٫٥ ج.م" / "EGP 45.5". */
export function formatPrice(piastres: number, language: Language): string {
  const amount = new Intl.NumberFormat(locale(language), { maximumFractionDigits: 2 }).format(piastres / 100);
  return language === 'ar' ? `${amount}\u00a0ج.م` : `EGP\u00a0${amount}`;
}

export function formatDate(iso: string, language: Language, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  return new Intl.DateTimeFormat(locale(language), options).format(new Date(iso));
}

/** "3 minutes ago" style text. */
export function formatRelative(iso: string, language: Language, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const format = new Intl.RelativeTimeFormat(locale(language), { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(0, 'minute');
}

/** Whole days from now until `iso`, never negative. */
export function daysUntil(iso: string, now = Date.now()): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 86_400_000));
}

/** 12500 → "12.5K" / "١٢٫٥ ألف", for chart axes. */
export function formatCompact(value: number, language: Language): string {
  return new Intl.NumberFormat(locale(language), { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

/** An amount in piastres, compact, for chart axes ("EGP 1.2K"). */
export function formatCompactPrice(piastres: number, language: Language): string {
  const amount = formatCompact(piastres / 100, language);
  return language === 'ar' ? `${amount}\u00a0ج.م` : `EGP\u00a0${amount}`;
}
