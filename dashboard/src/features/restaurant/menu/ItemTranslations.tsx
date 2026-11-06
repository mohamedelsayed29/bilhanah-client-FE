import { useId, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import { type ExtraMenuLanguage, menuLanguageInfo } from '@bilhanah/contracts';
import { Field } from '../../../components/Field';
import { useLanguage } from '../../../lib/language';
import { type ItemForm, languageOfPath } from './item-form';

type Props = {
  languages: readonly ExtraMenuLanguage[];
  values: ItemForm;
  register: UseFormRegister<ItemForm>;
  errors: FieldErrors<ItemForm>;
  active: ExtraMenuLanguage;
  onActiveChange: (language: ExtraMenuLanguage) => void;
};

/** Whether the typed text covers a language: the name, the description when there is one, and each named size. */
export function draftComplete(values: ItemForm, language: string): boolean {
  const texts = values.translations[language];
  if (!texts?.name.trim()) return false;
  if ((values.descriptionAr.trim() || values.descriptionEn.trim()) && !texts.description.trim()) return false;
  if (values.pricing === 'sizes') {
    return values.sizes.every(size => !(size.nameAr.trim() || size.nameEn.trim()) || Boolean(size.translations[language]?.name.trim()));
  }
  return true;
}

/** Collects the extra languages that have an error anywhere in the form. */
export function languagesWithErrors(errors: FieldErrors<ItemForm>): Set<string> {
  const found = new Set<string>();
  const walk = (node: unknown, path: string) => {
    if (!node || typeof node !== 'object') return;
    if ('message' in node && typeof (node as { message?: unknown }).message === 'string') {
      const language = languageOfPath(path);
      if (language) found.add(language);
    }
    for (const [key, child] of Object.entries(node)) if (key !== 'ref' && key !== 'message' && key !== 'type') walk(child, path ? `${path}.${key}` : key);
  };
  walk(errors, '');
  return found;
}

/**
 * The dish's name, description and size names in each extra language, one tab per language.
 * Every panel stays mounted (just hidden), so all languages are saved together.
 */
export function ItemTranslations({ languages, values, register, errors, active, onActiveChange }: Props) {
  const { text, language: uiLanguage, number } = useLanguage();
  const baseId = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const withErrors = languagesWithErrors(errors);
  const namedSizes = values.pricing === 'sizes' ? values.sizes.map((size, index) => ({ size, index })) : [];
  const fallbackName = values.nameEn.trim() || values.nameAr.trim();
  const fallbackDescription = values.descriptionEn.trim() || values.descriptionAr.trim();

  // Arrow keys move between tabs (reversed in Arabic, where the strip runs right to left).
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const forward = uiLanguage === 'ar' ? 'ArrowLeft' : 'ArrowRight';
    const backward = uiLanguage === 'ar' ? 'ArrowRight' : 'ArrowLeft';
    let next: number | null = null;
    if (event.key === forward) next = (index + 1) % languages.length;
    else if (event.key === backward) next = (index - 1 + languages.length) % languages.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = languages.length - 1;
    if (next === null) return;
    event.preventDefault();
    onActiveChange(languages[next]!);
    tabs.current[next]?.focus();
  };

  return <fieldset className="field item-languages">
    <legend className="field-label">{text('لغات تانية', 'Other languages')}<span className="optional">{text('(اختياري)', '(optional)')}</span></legend>
    <p className="field-hint">{text('اللي تسيبه فاضي بيظهر للزبون بالإنجليزي، ولو مفيش إنجليزي فبالعربي.', 'Anything left blank shows in English, or in Arabic when there is no English.')}</p>
    <div className="language-tabs" role="tablist" aria-label={text('اللغة', 'Language')}>
      {languages.map((code, index) => {
        const info = menuLanguageInfo(code);
        const complete = draftComplete(values, code);
        const hasError = withErrors.has(code);
        return <button key={code} type="button" role="tab" id={`${baseId}-tab-${code}`} aria-controls={`${baseId}-panel-${code}`}
          ref={element => { tabs.current[index] = element; }}
          aria-selected={active === code} tabIndex={active === code ? 0 : -1}
          className={`language-tab ${active === code ? 'is-active' : ''} ${hasError ? 'has-error' : ''}`}
          onClick={() => onActiveChange(code)} onKeyDown={event => onKeyDown(event, index)}>
          <span lang={code} dir={info.dir}>{info.nativeName}</span>
          <span className={`language-tab-status ${complete ? 'is-complete' : ''}`} aria-hidden="true" />
          <span className="visually-hidden">{hasError ? text('فيه خطأ', 'has an error') : complete ? text('مترجم', 'translated') : text('ناقص', 'incomplete')}</span>
        </button>;
      })}
    </div>
    {languages.map(code => {
      const info = menuLanguageInfo(code);
      const languageName = text(info.nameAr, info.nameEn);
      return <div key={code} role="tabpanel" id={`${baseId}-panel-${code}`} aria-labelledby={`${baseId}-tab-${code}`} hidden={active !== code} className="language-panel">
        <Field label={text(`الاسم بال${info.nameAr.replace(/^ال/, '')}`, `${info.nameEn} name`)} error={errors.translations?.[code]?.name}>
          <input className="input" dir={info.dir} lang={code} placeholder={fallbackName} {...register(`translations.${code}.name`)} />
        </Field>
        <Field label={text(`الوصف بال${info.nameAr.replace(/^ال/, '')}`, `${info.nameEn} description`)} error={errors.translations?.[code]?.description}>
          <textarea className="textarea" dir={info.dir} lang={code} rows={2} placeholder={fallbackDescription} {...register(`translations.${code}.description`)} />
        </Field>
        {namedSizes.length > 0 && <div className="language-sizes" role="group" aria-label={text(`أسماء الأحجام بال${info.nameAr.replace(/^ال/, '')}`, `Size names in ${info.nameEn}`)}>
          <span className="language-sizes-title">{text('أسماء الأحجام', 'Size names')}</span>
          {namedSizes.map(({ size, index }) => {
            const original = text(size.nameAr.trim(), size.nameEn.trim() || size.nameAr.trim()) || text(`حجم ${number(index + 1)}`, `Size ${index + 1}`);
            return <Field key={index} className="language-size" error={errors.sizes?.[index]?.translations?.[code]?.name}
              label={<><bdi>{original}</bdi><span className="visually-hidden"> · {languageName}</span></>}>
              <input className="input" dir={info.dir} lang={code} placeholder={size.nameEn.trim() || size.nameAr.trim()} {...register(`sizes.${index}.translations.${code}.name`)} />
            </Field>;
          })}
        </div>}
      </div>;
    })}
  </fieldset>;
}
