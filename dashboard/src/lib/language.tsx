import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { countText, NOUNS, type ArabicForms, type EnglishForms, type Noun } from './plural';

// Same provider as the marketing site (bilhanah-client-FE: src/lib/language.tsx) and the same storage key,
// so a visitor's language follows them from the website into the dashboard on the same origin family.
export type Language = 'ar' | 'en';
type LanguageValue = {
  language: Language;
  hasPreference: boolean;
  setLanguage: (language: Language) => void;
  /** Records an explicit choice (e.g. the language picked at registration). */
  chooseLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  text: (ar: string, en: string) => string;
  number: (value: number, options?: Intl.NumberFormatOptions) => string;
  /** A counted noun with the right Arabic form: count(3, 'order') → "٣ طلبات" / "3 orders". */
  count: (value: number, noun: Noun | readonly [ArabicForms, EnglishForms]) => string;
  locale: string;
};
const STORAGE_KEY = 'bilhanah:language:v1';
const LanguageContext = createContext<LanguageValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [hasPreference, setHasPreference] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) !== null; } catch { return false; }
  });
  const [language, setLanguage] = useState<Language>(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'ar'; } catch { return 'ar'; }
  });
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    if (hasPreference) {
      try { localStorage.setItem(STORAGE_KEY, language); } catch { /* Storage is optional. */ }
    }
  }, [language, hasPreference]);
  const value = useMemo<LanguageValue>(() => {
    const locale = language === 'ar' ? 'ar-EG' : 'en-EG';
    return {
      language,
      hasPreference,
      locale,
      // Applies a default (e.g. the account's preferred language) without recording it as the visitor's choice.
      setLanguage,
      chooseLanguage: next => { setHasPreference(true); setLanguage(next); },
      toggleLanguage: () => { setHasPreference(true); setLanguage(current => current === 'ar' ? 'en' : 'ar'); },
      text: (ar, en) => language === 'ar' ? ar : en,
      number: (value, options) => new Intl.NumberFormat(locale, options).format(value),
      count: (value, noun) => {
        const [ar, en] = typeof noun === 'string' ? NOUNS[noun] : noun;
        return countText(language, value, ar, en, digits => new Intl.NumberFormat(locale).format(digits));
      },
    };
  }, [language, hasPreference]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('LanguageProvider is required');
  return context;
}

/** Sets the tab title for the current page in the visitor's language. */
export function usePageTitle(ar: string, en: string) {
  const { language } = useLanguage();
  useEffect(() => {
    document.title = `${language === 'ar' ? ar : en} | ${language === 'ar' ? 'بالهنا' : 'Bilhanah'}`;
  }, [language, ar, en]);
}
