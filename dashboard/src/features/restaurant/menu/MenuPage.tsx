import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowLeftIcon, ArrowSquareOutIcon, BowlFoodIcon, CheckCircleIcon, EyeSlashIcon, PlusIcon, TranslateIcon } from '@phosphor-icons/react';
import { type ExtraMenuLanguage, isExtraMenuLanguage, menuLanguageInfo, menuName, type OwnerMenuCategory, type OwnerMenuItem } from '@bilhanah/contracts';
import { ErrorPanel } from '../../../components/ErrorBoundary';
import { PageHeader } from '../../../components/PageHeader';
import { PageSkeleton } from '../../../components/Skeleton';
import { useCopy } from '../../../lib/copy';
import { useLanguage, usePageTitle } from '../../../lib/language';
import { useBranchList } from '../../branches/workspace';
import { AccessNoticeCompact } from './AccessNoticeCompact';
import { CategoryCard } from './CategoryCard';
import { CategoryDialog } from './CategoryDialog';
import { ItemEditor } from './ItemEditor';
import { filterUntranslated, missingLanguages } from './menu-languages';
import { useMenuMutations } from './menu-mutations';
import { SortableList } from './Sortable';
import { useMenuQuery, useRestaurant } from '../queries';

type Editing =
  | { kind: 'category'; category?: OwnerMenuCategory; initialName?: { ar: string; en: string } }
  | { kind: 'item'; item?: OwnerMenuItem; categoryId: string }
  | null;

const SUGGESTIONS = [
  { ar: 'فطار', en: 'Breakfast' },
  { ar: 'سندوتشات', en: 'Sandwiches' },
  { ar: 'مشويات', en: 'Grills' },
  { ar: 'مشروبات', en: 'Drinks' },
  { ar: 'حلويات', en: 'Desserts' },
];

export function MenuPage() {
  const { text, count, number, language } = useLanguage();
  usePageTitle('المنيو', 'Menu');
  const restaurant = useRestaurant();
  const menu = useMenuQuery();
  const { reorderCategories } = useMenuMutations();
  const [editing, setEditing] = useState<Editing>(null);
  const t = useCopy();
  const multi = useBranchList().branches.filter(branch => branch.isActive).length > 1;
  const languages: readonly ExtraMenuLanguage[] = restaurant.menuLanguages ?? [];
  // ?missing=any (or a language code) lists only dishes still missing a translation.
  const [params, setParams] = useSearchParams();
  const missingParam = params.get('missing');
  const missingFilter: ExtraMenuLanguage | 'any' | null = !languages.length ? null
    : missingParam === 'any' ? 'any'
    : isExtraMenuLanguage(missingParam) && languages.includes(missingParam) ? missingParam : null;
  const setMissingFilter = (value: ExtraMenuLanguage | 'any' | null) => setParams(current => {
    const next = new URLSearchParams(current);
    if (value) next.set('missing', value); else next.delete('missing');
    return next;
  }, { replace: true });

  if (menu.isPending) return <PageSkeleton blocks={3} />;
  if (menu.isError) return <ErrorPanel error={menu.error} onRetry={() => void menu.refetch()} />;
  const { categories } = menu.data;
  const itemCount = categories.reduce((sum, category) => sum + category.items.length, 0);
  const localName = (category: OwnerMenuCategory) => text(category.nameAr, category.nameEn ?? category.nameAr);
  const allItems = categories.flatMap(category => category.items);
  const soldOut = allItems.filter(item => !item.isAvailable).length;
  const hidden = allItems.filter(item => !item.isVisible).length + categories.filter(category => !category.isVisible).length;
  const shownName = (category: OwnerMenuCategory) => menuName(category, language);
  const untranslatedCount = (code?: ExtraMenuLanguage) => allItems.filter(item => missingLanguages(item, code ? [code] : languages).length > 0).length;
  const shown = missingFilter ? filterUntranslated(categories, languages, missingFilter === 'any' ? undefined : missingFilter) : categories;
  const filterChips: { value: ExtraMenuLanguage | 'any' | null; label: string; count?: number }[] = [
    { value: null, label: text('كل الأصناف', 'All dishes') },
    ...(languages.length > 1 ? [{ value: 'any' as const, label: text('ناقص ترجمة', 'Missing a translation'), count: untranslatedCount() }] : []),
    ...languages.map(code => ({ value: code, label: languages.length > 1 ? menuLanguageInfo(code).nativeName : text(`ناقص ${menuLanguageInfo(code).nativeName}`, `Missing ${menuLanguageInfo(code).nativeName}`), count: untranslatedCount(code) })),
  ];

  return <div className="page">
    <PageHeader title={text('المنيو', 'Menu')}
      description={categories.length
        ? text(`${count(categories.length, 'category')} و${count(itemCount, 'item')}. اسحب من المقبض عشان ترتّب، ودوس على أي صنف عشان تعدّله.`, `${count(categories.length, 'category')}, ${count(itemCount, 'item')}. Drag a handle to reorder; tap an item to edit it.`)
        : text('ابدأ بأقسام المنيو، وبعدين أضف الأصناف والأسعار.', 'Start with your menu sections, then add dishes and prices.')}
      actions={<>
        <a className="button button-secondary" href={restaurant.publicUrl} target="_blank" rel="noreferrer"><ArrowSquareOutIcon size={18} aria-hidden="true" />{text('معاينة', 'Preview')}</a>
        <button type="button" className="button button-primary" onClick={() => setEditing({ kind: 'category' })}><PlusIcon size={18} weight="bold" aria-hidden="true" />{text('قسم جديد', 'New category')}</button>
      </>} />
    <AccessNoticeCompact access={restaurant.access} />
    {multi && <p className="menu-branch-note" data-testid="menu-branch-note">
      <span>{t.branchMenu.sharedMenuHint}</span>
      <Link className="link-action" to="/branches/menu">{t.branchMenu.sharedMenuLink}<ArrowLeftIcon size={14} className="directional" aria-hidden="true" /></Link>
    </p>}
    {categories.length === 0
      ? <section className="card empty-state menu-empty">
          <span className="empty-state-icon" aria-hidden="true"><BowlFoodIcon size={32} /></span>
          <h2>{text('المنيو لسه فاضي', 'Your menu is empty')}</h2>
          <p>{text('أضف أول قسم، زي "مشويات" أو "مشروبات". تقدر تختار واحد من دول:', 'Add your first category, like “Grills” or “Drinks”. Pick one to start:')}</p>
          <div className="chips">
            {SUGGESTIONS.map(suggestion => <button type="button" className="chip" key={suggestion.ar} onClick={() => setEditing({ kind: 'category', initialName: suggestion })}>
              <PlusIcon size={14} weight="bold" aria-hidden="true" />{text(suggestion.ar, suggestion.en)}
            </button>)}
          </div>
          <button type="button" className="button button-primary" onClick={() => setEditing({ kind: 'category' })}><PlusIcon size={18} weight="bold" aria-hidden="true" />{text('أضف قسم', 'Add a category')}</button>
        </section>
      : <div className="menu-layout">
          {/* A sticky index: the menu at a glance, and a jump to each category. */}
          <aside className="menu-index card" aria-labelledby="menu-index-title">
            <h2 id="menu-index-title" className="visually-hidden">{text('فهرس المنيو', 'Menu index')}</h2>
            <dl className="menu-stats">
              <div><dt>{text('الأصناف', 'Items')}</dt><dd>{number(itemCount)}</dd></div>
              <div className={soldOut ? 'is-warn' : ''}><dt>{text('خلصان', 'Sold out')}</dt><dd>{number(soldOut)}</dd></div>
              <div><dt>{text('مخفي', 'Hidden')}</dt><dd>{number(hidden)}</dd></div>
            </dl>
            <nav aria-label={text('اقفز لقسم', 'Jump to a category')}>
              <ol className="menu-index-list">
                {categories.map((category, index) => <li key={category.id}>
                  <a href={`#category-${category.id}`} className={category.isVisible ? '' : 'is-hidden'}>
                    <span className="menu-index-number" aria-hidden="true">{number(index + 1)}</span>
                    <bdi className="menu-index-name">{shownName(category)}</bdi>
                    {!category.isVisible && <EyeSlashIcon size={14} aria-label={text('مخفي', 'Hidden')} />}
                    <span className="menu-index-count">{number(category.items.length)}</span>
                  </a>
                </li>)}
              </ol>
            </nav>
            <button type="button" className="menu-index-add" onClick={() => setEditing({ kind: 'category' })}><PlusIcon size={16} weight="bold" aria-hidden="true" />{text('أضف قسم', 'Add a category')}</button>
          </aside>
          <div className="menu-main">
            {languages.length > 0 && <div className="menu-filter" role="group" aria-label={text('فلتر الترجمة', 'Translation filter')}>
              <TranslateIcon size={18} className="menu-filter-icon" aria-hidden="true" />
              {filterChips.map(chip => <button key={chip.value ?? 'all'} type="button" className="chip" aria-pressed={missingFilter === chip.value}
                onClick={() => setMissingFilter(chip.value)}>
                <span lang={chip.value && chip.value !== 'any' && languages.length > 1 ? chip.value : undefined}>{chip.label}</span>
                {chip.count !== undefined && <span className="chip-count">{number(chip.count)}</span>}
              </button>)}
              <Link className="link-action menu-filter-settings" to="/settings/languages">{text('لغات المنيو', 'Menu languages')}<ArrowLeftIcon size={14} className="directional" aria-hidden="true" /></Link>
            </div>}
            {missingFilter && shown.length > 0 && <p className="menu-filter-note">
              {text('بتشوف الأصناف اللي ناقصها ترجمة بس. الترتيب بالسحب بيرجع لما تختار «كل الأصناف».', 'Showing only dishes missing a translation. Drag to reorder again under “All dishes”.')}
            </p>}
            {missingFilter && shown.length === 0
              ? <section className="card empty-state menu-filter-empty">
                  <span className="empty-state-icon" aria-hidden="true"><CheckCircleIcon size={32} /></span>
                  <h2>{text('كل الأصناف مترجمة', 'Every dish is translated')}</h2>
                  <p>{text('مفيش صنف ناقصه اسم أو وصف أو اسم حجم في اللغة دي.', 'No dish is missing a name, description or size name in this language.')}</p>
                  <button type="button" className="button button-secondary" onClick={() => setMissingFilter(null)}>{text('اعرض كل الأصناف', 'Show all dishes')}</button>
                </section>
              : missingFilter
                ? <ol className="category-list" aria-label={text('أقسام المنيو', 'Menu categories')}>
                    {shown.map(filtered => {
                      const index = categories.findIndex(entry => entry.id === filtered.id);
                      const category = categories[index]!;
                      return <CategoryCard key={category.id} category={category} position={index + 1} languages={languages} filteredItems={filtered.items}
                        onRename={() => setEditing({ kind: 'category', category })}
                        onAddItem={() => setEditing({ kind: 'item', categoryId: category.id })}
                        onEditItem={item => setEditing({ kind: 'item', item, categoryId: category.id })} />;
                    })}
                  </ol>
                : <SortableList items={categories} nameOf={localName} onReorder={ids => reorderCategories.mutate(ids)}>
                    <ol className="category-list" aria-label={text('أقسام المنيو', 'Menu categories')}>
                      {categories.map((category, index) => <CategoryCard key={category.id} category={category} position={index + 1} languages={languages}
                        onRename={() => setEditing({ kind: 'category', category })}
                        onAddItem={() => setEditing({ kind: 'item', categoryId: category.id })}
                        onEditItem={item => setEditing({ kind: 'item', item, categoryId: category.id })} />)}
                    </ol>
                  </SortableList>}
            <button type="button" className="add-category" onClick={() => setEditing({ kind: 'category' })}>
              <PlusIcon size={18} weight="bold" aria-hidden="true" />{text('أضف قسم تاني', 'Add another category')}
            </button>
          </div>
        </div>}
    {editing?.kind === 'category' && <CategoryDialog category={editing.category} initialName={editing.initialName} onClose={() => setEditing(null)} />}
    {editing?.kind === 'item' && <ItemEditor item={editing.item} categoryId={editing.categoryId} categories={categories} onClose={() => setEditing(null)} />}
  </div>;
}
