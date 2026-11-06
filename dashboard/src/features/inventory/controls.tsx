import { useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react';
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
