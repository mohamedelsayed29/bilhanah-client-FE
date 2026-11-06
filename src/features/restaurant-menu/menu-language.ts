import { isExtraMenuLanguage, type ExtraMenuLanguage, type MenuLanguage } from '@bilhanah/contracts';
import type { Language } from '../../lib/language';

// The language diners read the menu in. Arabic and English are always there and also switch the
// interface; a restaurant may offer extra languages (French, Russian…), which translate the menu's
// own text while the interface stays in English. Which one a visit opens in, first match wins:
// 1. The language this browser chose last time for the restaurant, if it is still offered.
// 2. The visitor's earlier Arabic/English choice (the interface's own preference).
// 3. The browser's preferred language, when it is an extra language the restaurant offers and no
//    Arabic or English comes before it in the browser's list.
// 4. The restaurant's default language.

/** The extra languages a restaurant offers, in its order (none from an API that predates them). */
export function menuLanguagesOf(restaurant: object): ExtraMenuLanguage[] {
  const value = (restaurant as { menuLanguages?: unknown }).menuLanguages;
  return Array.isArray(value) ? [...new Set(value.filter(isExtraMenuLanguage))] : [];
}

const storageKey = (subdomain: string) => `bilhanah:menu-language:v1:${subdomain}`;
const isMenuLanguage = (value: unknown): value is MenuLanguage => value === 'ar' || value === 'en' || isExtraMenuLanguage(value);

export function storedMenuLanguage(subdomain: string): MenuLanguage | null {
  try {
    const value = localStorage.getItem(storageKey(subdomain));
    return isMenuLanguage(value) ? value : null;
  } catch { return null; }
}

export function rememberMenuLanguage(subdomain: string, language: MenuLanguage) {
  try { localStorage.setItem(storageKey(subdomain), language); } catch { /* Storage is optional: the default applies next time. */ }
}

/** The first offered extra language in the browser's list, unless Arabic or English comes first. */
export function browserMenuLanguage(offered: readonly ExtraMenuLanguage[], preferred: readonly string[]): ExtraMenuLanguage | null {
  for (const tag of preferred) {
    const base = tag.trim().toLowerCase().split(/[-_]/)[0];
    if (base === 'ar' || base === 'en') return null;
    if (isExtraMenuLanguage(base) && offered.includes(base)) return base;
  }
  return null;
}

function browserLanguages(): readonly string[] {
  try { return navigator.languages?.length ? navigator.languages : navigator.language ? [navigator.language] : []; } catch { return []; }
}

/** The menu language a visit opens in, or null to keep the visitor's current Arabic/English choice. */
export function initialMenuLanguage({ stored, offered, hasPreference, defaultLanguage, preferred = browserLanguages() }: {
  stored: MenuLanguage | null;
  offered: readonly ExtraMenuLanguage[];
  /** The visitor chose Arabic or English before (on this restaurant's site). */
  hasPreference: boolean;
  defaultLanguage: Language;
  preferred?: readonly string[];
}): MenuLanguage | null {
  if (stored && (stored === 'ar' || stored === 'en' || offered.includes(stored))) return stored;
  if (hasPreference) return null;
  return browserMenuLanguage(offered, preferred) ?? defaultLanguage;
}
