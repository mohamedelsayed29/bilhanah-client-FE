import { useEffect, useId, useRef, useState } from 'react';
import { CaretDownIcon, CheckIcon, GlobeHemisphereWestIcon, XIcon } from '@phosphor-icons/react';
import { menuLanguageInfo, type ExtraMenuLanguage, type MenuLanguage } from '@bilhanah/contracts';
import { useLanguage } from '../../lib/language';

/**
 * The menu's language button when the restaurant offers extra languages (otherwise the menu keeps
 * its Arabic/English switch). Arabic and English switch the whole page; the restaurant's other
 * languages translate the menu itself, with buttons and checkout in English.
 */
export function MenuLanguagePicker({ offered }: { offered: readonly ExtraMenuLanguage[] }) {
  const { menuLanguage, text } = useLanguage();
  const [open, setOpen] = useState(false);
  const current = menuLanguageInfo(menuLanguage);
  return <>
    <button type="button" className="menu-language" onClick={() => setOpen(true)} aria-haspopup="dialog" data-testid="menu-language"
      aria-label={`${text('لغة المنيو', 'Menu language')}: ${current.nativeName}`}>
      <GlobeHemisphereWestIcon size={18} aria-hidden="true" />
      <span lang={menuLanguage}>{current.nativeName}</span>
      <CaretDownIcon size={13} weight="bold" aria-hidden="true" />
    </button>
    {open && <LanguageSheet offered={offered} onClose={() => setOpen(false)} />}
  </>;
}

function LanguageSheet({ offered, onClose }: { offered: readonly ExtraMenuLanguage[]; onClose: () => void }) {
  const { menuLanguage, chooseMenuLanguage, text } = useLanguage();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    // No cleanup, as in the dish sheet: unmounting removes the dialog.
    if (dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }, []);
  const close = () => dialogRef.current?.close();

  const option = (code: MenuLanguage) => {
    const info = menuLanguageInfo(code);
    const selected = code === menuLanguage;
    // Each language by its own name, and by name in the page's language when that differs.
    const caption = text(info.nameAr, info.nameEn);
    return <li key={code}>
      <button type="button" className="language-option" aria-pressed={selected} data-language={code}
        onClick={() => { if (!selected) chooseMenuLanguage(code); close(); }}>
        <span className="language-option-names">
          <span className="language-option-native" lang={code} dir={info.dir}>{info.nativeName}</span>
          {caption !== info.nativeName && <small>{caption}</small>}
        </span>
        {selected && <CheckIcon size={20} weight="bold" aria-hidden="true" />}
      </button>
    </li>;
  };

  return <dialog ref={dialogRef} className="dish-sheet language-sheet" aria-labelledby={`${id}-title`} onClose={onClose}
    onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="language-sheet-body">
      <header className="language-sheet-header">
        <h2 id={`${id}-title`}>{text('لغة المنيو', 'Menu language')}</h2>
        <button type="button" className="language-sheet-close" onClick={close} aria-label={text('إغلاق', 'Close')}><XIcon size={20} /></button>
      </header>
      <ul className="language-options">{(['ar', 'en'] as const).map(option)}</ul>
      <h3 className="language-group" id={`${id}-translations`}>{text('ترجمة المنيو', 'Menu translations')}</h3>
      <ul className="language-options" aria-labelledby={`${id}-translations`}>{offered.map(option)}</ul>
      {/* For the visitors who pick a translation, so in English whatever the page's language. */}
      <p className="language-sheet-note" lang="en" dir="ltr">Translations cover the dishes, their descriptions and sizes. Buttons, checkout and order updates stay in English.</p>
    </div>
  </dialog>;
}
