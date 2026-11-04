import { ar, type Translation } from '../locales/ar/translation';
import { en } from '../locales/en/translation';
import { useLanguage } from './language';

/** The dashboard's copy (src/locales) in the interface language. */
export function useCopy(): Translation {
  const { language } = useLanguage();
  return language === 'ar' ? ar : en;
}

/** Fills `{{name}}` placeholders; unknown ones stay as they are. Format numbers before passing them. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}
