import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Language } from '@bilhanah/contracts';
import { ar, type Translation } from '../locales/ar/translation';
import { en } from '../locales/en/translation';

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: Translation };
  }
}

const STORAGE_KEY = 'bilhanah:language:v1';

function storedLanguage(): Language | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'ar' || value === 'en' ? value : null;
  } catch {
    return null;
  }
}

/** True once the person has chosen a language in this browser. */
export const hasLanguagePreference = () => storedLanguage() !== null;

function applyDocumentLanguage(language: Language) {
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  document.title = i18next.t('meta.title');
}

void i18next.use(initReactI18next).init({
  resources: { ar: { translation: ar }, en: { translation: en } },
  lng: storedLanguage() ?? 'ar',
  fallbackLng: 'ar',
  interpolation: { escapeValue: false },
  returnObjects: true,
});

applyDocumentLanguage(i18next.language as Language);
i18next.on('languageChanged', (language) => applyDocumentLanguage(language as Language));

export function setLanguage(language: Language, { remember = true } = {}) {
  if (remember) {
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // Storage is optional.
    }
  }
  void i18next.changeLanguage(language);
}

export function currentLanguage(): Language {
  return i18next.language === 'en' ? 'en' : 'ar';
}

export function formatNumber(value: number, language: Language): string {
  return new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en-EG').format(value);
}

export function formatDate(iso: string, language: Language): string {
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG' : 'en-EG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Cairo',
  }).format(new Date(iso));
}
