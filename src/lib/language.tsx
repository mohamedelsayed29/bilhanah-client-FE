import { createContext, useContext, useEffect, useState } from 'react';
import { hasConsent } from './consent';
import type { ReactNode } from 'react';
import type { ExtraMenuLanguage, MenuLanguage } from '@bilhanah/contracts';

/** The website's interface language. Menus may also be read in extra languages (see `menuLanguage`). */
export type Language = 'ar' | 'en';
type LanguageValue = {
  /** The interface language: buttons, labels, messages. English while the menu is read in an extra language. */
  language: Language;
  /**
   * The language of the menu's own text (dish and category names, descriptions, sizes): the interface
   * language, or an extra language the restaurant offers. `<html lang>` follows it.
   */
  menuLanguage: MenuLanguage;
  hasPreference: boolean;
  setLanguage: (language: Language) => void;
  /** Applies a menu language without recording it as the visitor's choice (a default). */
  setMenuLanguage: (language: MenuLanguage) => void;
  /** The visitor picked a menu language: Arabic and English also switch the interface; extra languages keep it in English. */
  chooseMenuLanguage: (language: MenuLanguage) => void;
  toggleLanguage: () => void;
  text: (ar: string, en: string) => string;
  number: (value: number) => string;
  digits: (value: number) => string;
};
const LanguageContext = createContext<LanguageValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [hasPreference, setHasPreference] = useState(() => {
    try { return localStorage.getItem('bilhanah:language:v1') !== null; } catch { return false; }
  });
  const [language, setLanguage] = useState<Language>(() => {
    try { return localStorage.getItem('bilhanah:language:v1') === 'en' ? 'en' : 'ar'; } catch { return 'ar'; }
  });
  // An extra menu language replaces only the menu's text; the interface stays in English meanwhile.
  const [extra, setExtra] = useState<ExtraMenuLanguage | null>(null);
  const menuLanguage: MenuLanguage = extra ?? language;
  useEffect(() => {
    document.documentElement.lang = menuLanguage;
    document.documentElement.dir = menuLanguage === 'ar' ? 'rtl' : 'ltr';
  }, [menuLanguage]);
  useEffect(() => {
    if (hasPreference && hasConsent('preferences')) {
      try { localStorage.setItem('bilhanah:language:v1', language); } catch { /* Storage is optional. */ }
    }
  }, [language, hasPreference]);
  const applyMenuLanguage = (code: MenuLanguage) => {
    if (code === 'ar' || code === 'en') { setExtra(null); setLanguage(code); }
    else { setExtra(code); setLanguage('en'); }
  };
  const value: LanguageValue = {
    language,
    menuLanguage,
    hasPreference,
    // Applies a default (e.g. a restaurant's menu language) without recording it as the visitor's choice.
    setLanguage: code => { setExtra(null); setLanguage(code); },
    setMenuLanguage: applyMenuLanguage,
    chooseMenuLanguage: code => { setHasPreference(true); applyMenuLanguage(code); },
    toggleLanguage: () => { setHasPreference(true); setExtra(null); setLanguage(current => current === 'ar' ? 'en' : 'ar'); },
    text: (ar, en) => language === 'ar' ? ar : en,
    number: value => new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en-EG').format(value),
    /** Identifiers such as order numbers: localized digits, never thousands separators. */
    digits: value => new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en-EG', { useGrouping: false }).format(value),
  };
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('LanguageProvider is required');
  return context;
}

/**
 * An Arabic count with its real plural form: 1 "دقيقة واحدة", 2 "دقيقتين", 3–10 "٣ دقايق", 11+ "١١ دقيقة".
 * `forms` are [singular, dual, plural (3–10)]; 11+ uses the singular after the number.
 */
export function arabicCount(count: number, forms: [string, string, string], number: (value: number) => string, one = `${forms[0]} واحد`): string {
  const category = new Intl.PluralRules('ar').select(count);
  if (category === 'one') return one;
  if (category === 'two') return forms[1];
  if (category === 'few') return `${number(count)} ${forms[2]}`;
  return `${number(count)} ${forms[0]}`;
}

/** Sets the tab title for the current page in the visitor's language. */
export function usePageTitle(ar: string, en: string) {
  const { language } = useLanguage();
  useEffect(() => { document.title = language === 'ar' ? ar : en; }, [language, ar, en]);
}
