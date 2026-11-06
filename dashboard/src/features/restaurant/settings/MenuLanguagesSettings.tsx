import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowDownIcon, ArrowLeftIcon, ArrowUpIcon, LockSimpleIcon } from '@phosphor-icons/react';
import { type ExtraMenuLanguage, menuLanguageInfo, type MenuLanguage, updateRestaurantSchema } from '@bilhanah/contracts';
import { Alert } from '../../../components/Alert';
import { Button } from '../../../components/Button';
import { Section } from '../../../components/Section';
import { errorMessage } from '../../../lib/api/error-messages';
import { contractIssues, fieldErrorText } from '../../../lib/forms';
import { useLanguage, usePageTitle } from '../../../lib/language';
import { type LanguageProgress, languageRows, moveLanguage, toggleLanguage, translationProgress } from '../menu/menu-languages';
import { useMenuQuery, useRestaurant } from '../queries';
import { useSaveRestaurant } from './useSaveRestaurant';

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((entry, index) => entry === b[index]);

/**
 * The extra languages diners can read the menu in, and their order. Arabic and English are always
 * there; each extra language shows how much of the menu is translated into it.
 */
export function MenuLanguagesSettings() {
  const { text, number } = useLanguage();
  usePageTitle('لغات المنيو', 'Menu languages');
  const restaurant = useRestaurant();
  const saved: readonly ExtraMenuLanguage[] = restaurant.menuLanguages ?? [];
  const menu = useMenuQuery();
  const save = useSaveRestaurant();
  const [draft, setDraft] = useState<ExtraMenuLanguage[]>([...saved]);
  const dirty = !sameList(draft, saved);
  const issues = contractIssues(updateRestaurantSchema, { menuLanguages: draft });
  const progress = new Map(translationProgress(menu.data, languageRows([])).map(entry => [entry.language, entry]));
  const rows = languageRows(draft);
  const nameIn = (code: MenuLanguage) => text(menuLanguageInfo(code).nameAr, menuLanguageInfo(code).nameEn);

  const submit = () => {
    if (!dirty || issues.length) return;
    save.mutate({ menuLanguages: draft });
  };

  return <div className="settings-grid menu-languages-settings">
    <form className="settings-main" noValidate onSubmit={event => { event.preventDefault(); submit(); }}>
      {save.isError && <Alert kind="error">{errorMessage(save.error, text)}</Alert>}
      {issues[0] && <Alert kind="error">{fieldErrorText(issues[0], text)}</Alert>}

      <Section id="menu-languages-title" title={text('اللغات اللي الزبون يختار منها', 'Languages diners can choose')}
        description={text('بتظهر في قايمة اللغة فوق المنيو بالترتيب ده، بعد العربي والإنجليزي.', 'They appear in the language menu above your menu in this order, after Arabic and English.')}>
        <ul className="language-list" aria-label={text('اللغات الأساسية', 'Built-in languages')}>
          {(['ar', 'en'] as const).map(code => <li key={code} className="language-row is-builtin">
            <span className="language-row-text">
              <strong lang={code}>{menuLanguageInfo(code).nativeName}</strong>
              <small>{code === 'ar'
                ? text('من خانات «بالعربي» في كل صنف. مطلوبة.', 'From the Arabic fields of each dish. Required.')
                : text('من خانات «بالإنجليزي» في كل صنف.', 'From the English fields of each dish.')}</small>
            </span>
            <span className="language-row-lock"><LockSimpleIcon size={15} aria-hidden="true" />{text('شغالة دايمًا', 'Always on')}</span>
          </li>)}
        </ul>

        <ol className="language-list" aria-label={text('لغات إضافية', 'Extra languages')}>
          {rows.map(code => {
            const info = menuLanguageInfo(code);
            const on = draft.includes(code);
            const position = draft.indexOf(code);
            const entry = progress.get(code);
            return <li key={code} className={`language-row ${on ? 'is-on' : ''}`}>
              <span className="language-row-position" aria-hidden="true">{on ? number(position + 1) : ''}</span>
              <span className="language-row-text">
                <strong><bdi lang={code}>{info.nativeName}</bdi></strong>
                <small>{nameIn(code)}</small>
              </span>
              <span className="language-row-actions">
                {on && <>
                  <button type="button" className="icon-button" disabled={position === 0} onClick={() => setDraft(list => moveLanguage(list, code, -1))}
                    aria-label={text(`طلّع ${nameIn(code)} لفوق`, `Move ${nameIn(code)} up`)}><ArrowUpIcon size={18} /></button>
                  <button type="button" className="icon-button" disabled={position === draft.length - 1} onClick={() => setDraft(list => moveLanguage(list, code, 1))}
                    aria-label={text(`نزّل ${nameIn(code)} لتحت`, `Move ${nameIn(code)} down`)}><ArrowDownIcon size={18} /></button>
                </>}
                <button type="button" role="switch" className="switch" aria-checked={on} onClick={() => setDraft(list => toggleLanguage(list, code, !on))}
                  aria-label={text(`المنيو بال${info.nameAr.replace(/^ال/, '')}`, `Menu in ${info.nameEn}`)} />
              </span>
              {entry && <ProgressLine entry={entry} on={on} linkable={saved.includes(code)} loading={menu.isPending} />}
            </li>;
          })}
        </ol>
      </Section>

      <div className={`save-bar ${dirty ? 'is-dirty' : ''}`} role="region" aria-label={text('حفظ التغييرات', 'Save changes')}>
        <span className="save-bar-status">{dirty ? text('في تغييرات مش محفوظة', 'You have unsaved changes') : text('كل التغييرات محفوظة', 'All changes saved')}</span>
        <Button variant="secondary" disabled={!dirty || save.isPending} onClick={() => setDraft([...saved])}>{text('تراجع', 'Discard')}</Button>
        <Button type="submit" loading={save.isPending} disabled={!dirty || issues.length > 0}>{text('احفظ', 'Save')}</Button>
      </div>
    </form>

    <aside className="settings-aside" aria-labelledby="languages-help-title">
      <h2 id="languages-help-title">{text('إزاي بتشتغل؟', 'How it works')}</h2>
      <ul className="tips">
        <li>{text('العربي والإنجليزي موجودين دايمًا، وكل لغة بتشغّلها بتظهر للزبون في اختيار اللغة.', 'Arabic and English are always there; each language you switch on is added to the diner’s language choice.')}</li>
        <li>{text('أي نص مش مترجم بيظهر بالإنجليزي، ولو مفيش إنجليزي فبالعربي. يعني المنيو عمره ما يبان فاضي.', 'Text that is not translated shows in English, or in Arabic when there is no English, so the menu never looks empty.')}</li>
        <li>{text('الترجمة بتتكتب من المنيو: في كل صنف وقسم فيه خانة لكل لغة شغالة.', 'Translations are written on the menu: every dish and category gets a box for each language that is on.')}</li>
        <li>{text('لو قفلت لغة، ترجمتها بتفضل محفوظة وبترجع لو شغلتها تاني.', 'Switching a language off keeps its translations; they come back when you switch it on again.')}</li>
      </ul>
      {saved.length > 0 && <Link className="link-action" to="/menu?missing=any">{text('الأصناف اللي ناقصها ترجمة', 'Dishes missing a translation')}<ArrowLeftIcon size={14} className="directional" aria-hidden="true" /></Link>}
    </aside>
  </div>;
}

/** "Français · 12 of 20 dishes" as a thin bar and a line of text; languages that are off only show it once something is translated. */
function ProgressLine({ entry, on, linkable, loading }: { entry: LanguageProgress; on: boolean; linkable: boolean; loading: boolean }) {
  const { text, number, count } = useLanguage();
  if (loading || entry.dishes === 0) return null;
  if (!on && entry.translatedDishes === 0 && entry.translatedCategories === 0) return null;
  const share = entry.translatedDishes / entry.dishes;
  const done = entry.translatedDishes === entry.dishes && entry.translatedCategories === entry.categories;
  const dishes = text(`${number(entry.translatedDishes)} من ${count(entry.dishes, 'item')}`, `${number(entry.translatedDishes)} of ${count(entry.dishes, 'item')}`);
  const categories = text(`${number(entry.translatedCategories)} من ${count(entry.categories, 'category')}`, `${number(entry.translatedCategories)} of ${count(entry.categories, 'category')}`);
  return <span className={`language-progress ${done ? 'is-done' : ''}`}>
    <span className="language-progress-bar" aria-hidden="true"><span style={{ inlineSize: `${Math.round(share * 100)}%` }} /></span>
    <span className="language-progress-text">
      {on ? '' : text('محفوظ: ', 'Saved: ')}{dishes} · {categories}
      {on && linkable && !done && <> · <Link className="language-progress-link" to={`/menu?missing=${entry.language}`}>{text('كمّل الترجمة', 'Translate the rest')}</Link></>}
    </span>
  </span>;
}
