import { GlobeHemisphereWestIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { currentLanguage, setLanguage } from '../lib/i18n';

export function LanguageSwitch({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className={`language-switch ${className}`}
      onClick={() => setLanguage(currentLanguage() === 'ar' ? 'en' : 'ar')}
      aria-label={t('common.switchLanguage')}
    >
      <GlobeHemisphereWestIcon size={18} aria-hidden />
      <span>{t('common.languageShort')}</span>
    </button>
  );
}
