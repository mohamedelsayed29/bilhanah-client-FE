import { useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CaretLeftIcon, CaretRightIcon, MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react';
import type { Ingredient } from '@bilhanah/contracts';
import { useLanguage } from '../../lib/language';
import type { UnitOption } from './units';

/** Forgiving Arabic search: أ/إ/آ → ا, ة → ه, ى → ي, without diacritics; Latin lower-cased. */
export function searchKey(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .trim();
}

export function matchesIngredient(ingredient: Pick<Ingredient, 'nameAr' | 'nameEn' | 'category'>, query: string): boolean {
  const needle = searchKey(query);
  if (!needle) return true;
  return [ingredient.nameAr, ingredient.nameEn, ingredient.category].some(value => searchKey(value).includes(needle));
}

/**
 * An ingredient search box (ARIA combobox with a list of matches): type part of the Arabic or
 * English name or the category, pick with the arrows and Enter, or tap.
 */
export function IngredientPicker({ ingredients, value, onChange, label, exclude = [], placeholder, invalid, describedBy, testId }: {
  ingredients: readonly Ingredient[]; value: string | null; onChange: (ingredient: Ingredient | null) => void; label: string;
  /** Ingredients already on the document (each appears once). */
  exclude?: readonly string[]; placeholder?: string; invalid?: boolean; describedBy?: string; testId?: string;
}) {
  const { text, language } = useLanguage();
  const id = useId();
  const listId = `${id}-list`;
  const selected = ingredients.find(ingredient => ingredient.id === value) ?? null;
  const name = (ingredient: Ingredient) => (language === 'en' ? ingredient.nameEn || ingredient.nameAr : ingredient.nameAr);
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => {
    const blocked = new Set(exclude.filter(entry => entry !== value));
    return ingredients.filter(ingredient => ingredient.isActive && !blocked.has(ingredient.id) && matchesIngredient(ingredient, query ?? '')).slice(0, 60);
  }, [ingredients, exclude, value, query]);
  const choose = (ingredient: Ingredient) => { onChange(ingredient); setQuery(null); setOpen(false); };
  const shown = query ?? (selected ? name(selected) : '');
  return <div className="inv-picker" data-testid={testId}>
    <div className="inv-picker-box">
      <MagnifyingGlassIcon size={17} aria-hidden="true" className="inv-picker-icon" />
      <input ref={input} className="input" role="combobox" aria-label={label} aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${id}-${matches[active]!.id}` : undefined} aria-invalid={invalid || undefined} aria-describedby={describedBy}
        value={shown} placeholder={placeholder ?? text('دوّر على خامة…', 'Search ingredients…')} autoComplete="off" spellCheck={false}
        onFocus={() => { setOpen(true); setActive(0); }}
        onBlur={() => { setOpen(false); setQuery(null); }}
        onChange={event => { setQuery(event.target.value); setOpen(true); setActive(0); }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive(current => Math.min(current + 1, matches.length - 1)); }
          else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(current => Math.max(current - 1, 0)); }
          else if (event.key === 'Enter' && open && matches[active]) { event.preventDefault(); choose(matches[active]!); }
          else if (event.key === 'Escape') { setOpen(false); setQuery(null); }
        }} />
      {selected && <button type="button" className="inv-picker-clear" aria-label={text('امسح الاختيار', 'Clear')} onMouseDown={event => event.preventDefault()}
        onClick={() => { onChange(null); setQuery(''); input.current?.focus(); }}><XIcon size={15} aria-hidden="true" /></button>}
    </div>
    {open && <ul className="inv-picker-list" role="listbox" id={listId} aria-label={label}>
      {matches.length === 0 && <li className="inv-picker-empty" role="presentation">{text('مفيش خامة بالاسم ده', 'No ingredient matches')}</li>}
      {matches.map((ingredient, index) => <li key={ingredient.id} id={`${id}-${ingredient.id}`} role="option" aria-selected={ingredient.id === value}
        className={index === active ? 'is-active' : ''} onMouseDown={event => event.preventDefault()} onClick={() => choose(ingredient)} onMouseEnter={() => setActive(index)}>
        <bdi>{name(ingredient)}</bdi>
        <small>{[ingredient.category, ingredient.kind === 'PREPARED' ? text('تحضير', 'Prepared') : null].filter(Boolean).join(' · ')}</small>
      </li>)}
    </ul>}
  </div>;
}

/** A quantity box and the unit it is typed in, side by side. */
export function QuantityInput({ value, onValue, unitKey, onUnit, options, label, invalid, describedBy, testId, large = false, onCommit }: {
  value: string; onValue: (value: string) => void; unitKey: string; onUnit: (key: string) => void; options: readonly UnitOption[];
  label: string; invalid?: boolean; describedBy?: string; testId?: string; large?: boolean;
  /** Called when the box is left or Enter is pressed (to save a line as it is entered). */
  onCommit?: () => void;
}) {
  const { text } = useLanguage();
  return <div className={`inv-qty ${large ? 'is-large' : ''}`} data-testid={testId}>
    <input className="input ltr" inputMode="decimal" autoComplete="off" aria-label={label} aria-invalid={invalid || undefined} aria-describedby={describedBy}
      value={value} onChange={event => onValue(event.target.value)} onBlur={onCommit}
      onKeyDown={onCommit ? event => { if (event.key === 'Enter') { event.preventDefault(); onCommit(); } } : undefined} />
    {options.length > 1
      ? <select className="select" aria-label={text('الوحدة', 'Unit')} value={unitKey} onChange={event => onUnit(event.target.value)}>
        {options.map(option => <option key={option.key} value={option.key}>{text(...option.label)}</option>)}
      </select>
      : <span className="inv-qty-unit">{options[0] ? text(...options[0].label) : ''}</span>}
  </div>;
}

/** An amount in pounds. */
export function MoneyInput({ value, onChange, label, invalid, describedBy, testId }: { value: string; onChange: (value: string) => void; label: string; invalid?: boolean; describedBy?: string; testId?: string }) {
  const { text } = useLanguage();
  return <div className="input-group inv-money">
    <input className="input ltr" inputMode="decimal" autoComplete="off" aria-label={label} aria-invalid={invalid || undefined} aria-describedby={describedBy}
      value={value} onChange={event => onChange(event.target.value)} data-testid={testId} />
    <span className="input-affix">{text('ج.م', 'EGP')}</span>
  </div>;
}

/** A search box over a list. */
export function SearchBox({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const { text } = useLanguage();
  return <div className="search-box inv-search">
    <MagnifyingGlassIcon size={18} aria-hidden="true" />
    <input className="input" type="search" value={value} onChange={event => onChange(event.target.value)} placeholder={label} aria-label={label} />
    {value && <button type="button" className="icon-button search-clear" onClick={() => onChange('')} aria-label={text('امسح البحث', 'Clear search')}><XIcon size={16} aria-hidden="true" /></button>}
  </div>;
}

/** Filter chips (one choice). */
export function Chips<T extends string>({ value, onChange, options, label }: { value: T; onChange: (value: T) => void; options: { value: T; label: ReactNode; count?: number }[]; label: string }) {
  const { number } = useLanguage();
  return <div className="filter-chips" role="group" aria-label={label}>
    {options.map(option => <button key={option.value} type="button" className={`filter-chip ${value === option.value ? 'active' : ''}`} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
      {option.label}{option.count !== undefined && <span className="inv-chip-count">{number(option.count)}</span>}
    </button>)}
  </div>;
}

/** A small figure on a page: label over value. */
export function Figure({ label, value, tone = 'muted', hint, testId }: { label: string; value: ReactNode; tone?: 'muted' | 'success' | 'warning' | 'danger' | 'info' | 'guava'; hint?: ReactNode; testId?: string }) {
  return <div className={`att-kpi inv-figure tone-${tone}`} data-testid={testId}>
    <span className="att-kpi-text"><span>{label}</span><strong>{value}</strong>{hint && <small className="inv-figure-hint">{hint}</small>}</span>
  </div>;
}

export const PAGE_SIZES = [10, 25, 50] as const;

/** The page numbers to show: the first, the last, and the current one with its neighbours; gaps as null. */
export function pageWindow(page: number, pages: number): (number | null)[] {
  const wanted = new Set([1, pages, page - 1, page, page + 1].filter(value => value >= 1 && value <= pages));
  const sorted = [...wanted].sort((a, b) => a - b);
  return sorted.flatMap((value, index) => (index > 0 && value - sorted[index - 1]! > 1 ? [null, value] : [value]));
}

/** A list cut into pages on screen; back to page 1 whenever `resetKey` (the filters) changes. */
export function usePaged<T>(rows: readonly T[], resetKey: string) {
  const [state, setState] = useState({ page: 1, size: PAGE_SIZES[0] as number, key: resetKey });
  const current = state.key === resetKey ? state : { page: 1, size: state.size, key: resetKey };
  const pages = Math.max(1, Math.ceil(rows.length / current.size));
  const page = Math.min(current.page, pages);
  return {
    items: rows.slice((page - 1) * current.size, page * current.size),
    page, pages, size: current.size, total: rows.length,
    setPage: (next: number) => setState({ ...current, page: next }),
    setSize: (size: number) => setState({ page: 1, size, key: resetKey }),
  };
}

/** "Showing 11–20 of 46", page numbers with previous / next, and how many rows a page shows. */
export function ListPager({ paged, noun, label }: { paged: ReturnType<typeof usePaged<unknown>>; noun: [string, string]; label: string }) {
  const { text, number, language } = useLanguage();
  if (paged.total <= PAGE_SIZES[0]) return null;
  const from = (paged.page - 1) * paged.size + 1;
  const to = Math.min(paged.total, paged.page * paged.size);
  const Previous = language === 'ar' ? CaretRightIcon : CaretLeftIcon;
  const Next = language === 'ar' ? CaretLeftIcon : CaretRightIcon;
  return <nav className="inv-pager" aria-label={label} data-testid="list-pager">
    <p className="inv-pager-range" aria-live="polite">{text(`عرض ${number(from)}–${number(to)} من ${number(paged.total)} ${noun[0]}`, `Showing ${from}–${to} of ${paged.total} ${noun[1]}`)}</p>
    <div className="inv-pager-pages">
      <button type="button" className="inv-pager-step" disabled={paged.page <= 1} onClick={() => paged.setPage(paged.page - 1)} aria-label={text('الصفحة السابقة', 'Previous page')}><Previous size={16} aria-hidden="true" /></button>
      {pageWindow(paged.page, paged.pages).map((value, index) => value === null
        ? <span key={`gap-${index}`} className="inv-pager-gap" aria-hidden="true">…</span>
        : <button key={value} type="button" className="inv-pager-page" aria-current={value === paged.page ? 'page' : undefined} onClick={() => paged.setPage(value)}
          aria-label={text(`صفحة ${number(value)}`, `Page ${value}`)}>{number(value)}</button>)}
      <button type="button" className="inv-pager-step" disabled={paged.page >= paged.pages} onClick={() => paged.setPage(paged.page + 1)} aria-label={text('الصفحة التالية', 'Next page')}><Next size={16} aria-hidden="true" /></button>
    </div>
    <label className="inv-pager-size"><span>{text('في الصفحة', 'Per page')}</span>
      <select className="select" value={paged.size} onChange={event => paged.setSize(Number(event.target.value))}>
        {PAGE_SIZES.map(size => <option key={size} value={size}>{number(size)}</option>)}
      </select></label>
  </nav>;
}
