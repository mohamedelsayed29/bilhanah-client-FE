import { GlobeHemisphereWestIcon } from '@phosphor-icons/react';
import { useLanguage } from '../lib/language';

/** Switches Arabic ↔ English. `round`: the sidebar's circle, showing only the other language's short name. */
export function LanguageToggle({ plain = false, round = false }: { plain?: boolean; round?: boolean }) {
  const { text, toggleLanguage } = useLanguage();
  if (round) {
    // The visible short name starts the accessible name, so speech users can say what they see.
    return <button type="button" className="sidebar-round sidebar-language" onClick={toggleLanguage} title={text('English', 'عربي')} lang={text('en', 'ar')}>
      {text('EN', 'ع')}<span className="visually-hidden">{text(' Switch to English', ' عربي، التبديل للعربية')}</span>
    </button>;
  }
  return <button type="button" className={`language-button ${plain ? 'language-button-plain' : ''}`} onClick={toggleLanguage}
    aria-label={text('Switch to English', 'عربي، التبديل للعربية')} lang={text('en', 'ar')}>
    <GlobeHemisphereWestIcon size={17} aria-hidden="true" /><span aria-hidden="true">{text('English', 'عربي')}</span>
  </button>;
}
