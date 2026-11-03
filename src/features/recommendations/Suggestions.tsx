import { useEffect, useState } from 'react';
import { MinusIcon, PlusIcon, SparkleIcon } from '@phosphor-icons/react';
import type { PublicRecommendation, RecommendationPlacement, RecommendationType } from '@bilhanah/contracts';
import { useLanguage } from '../../lib/language';
import { formatPrice, localized, variantLabel } from '../restaurant-menu/menu-format';
import type { Suggestion } from './recommend';
import type { Tracker } from './tracker';
import './recommendations.css';

const HEADINGS: Record<RecommendationType, [string, string]> = {
  FREQUENTLY_BOUGHT_TOGETHER: ['بيتطلب معاه', 'Often ordered together'],
  ADD_ON: ['إضافات', 'Add-ons'],
  UPGRADE: ['رقّي طلبك', 'Upgrade'],
  ALTERNATIVE: ['ممكن يعجبك كمان', 'You may also like'],
};
export const headingOf = (rule: PublicRecommendation, text: (ar: string, en: string) => string) => rule.title ?? text(...HEADINGS[rule.type]);

/** Counts each shown suggestion once per place. */
function useImpressions(suggestions: Suggestion[], placement: RecommendationPlacement, tracker: Tracker) {
  const key = suggestions.map(entry => `${entry.rule.id}:${entry.item.id}`).join('|');
  useEffect(() => {
    for (const entry of suggestions) tracker.impression(entry.rule.id, entry.item.id, placement);
    // The list's identity is its keys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, placement, tracker]);
}

/**
 * Suggested dishes as a row of cards (cart, checkout, alternatives on a dish page): each with its
 * price shown before adding, a size picker when the rule leaves the size open, and one tap to add.
 */
export function SuggestionStrip({ suggestions, placement, tracker, heading, onAdd }: {
  suggestions: Suggestion[];
  placement: RecommendationPlacement;
  tracker: Tracker;
  heading: string;
  /** Adds one to the cart; returns false when it could not (a full cart). */
  onAdd: (suggestion: Suggestion, variantId: string) => boolean;
}) {
  const { text, language } = useLanguage();
  const [sizes, setSizes] = useState<Record<string, string>>({});
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());
  useImpressions(suggestions, placement, tracker);
  if (suggestions.length === 0) return null;
  return <section className="suggestions" aria-label={heading} data-testid={`suggestions-${placement.toLowerCase()}`}>
    <h3><SparkleIcon size={16} weight="fill" aria-hidden="true" />{heading}</h3>
    <ul>
      {suggestions.map(entry => {
        const name = localized(language, entry.item.nameAr, entry.item.nameEn);
        const variant = entry.variant ?? entry.item.variants.find(candidate => candidate.id === sizes[entry.item.id]) ?? entry.item.variants[0]!;
        const done = added.has(entry.item.id);
        return <li key={entry.item.id} className="suggestion-card" data-testid="suggestion" data-item={entry.item.nameAr}>
          <span className="suggestion-name"><bdi>{name}</bdi>{entry.variant && entry.item.variants.length > 1 && <small>{variantLabel(entry.variant, language)}</small>}</span>
          {!entry.variant && entry.item.variants.length > 1 && <select aria-label={text(`حجم ${name}`, `${name} size`)} value={variant.id}
            onChange={event => { tracker.click(entry.rule.id, entry.item.id, placement); setSizes(current => ({ ...current, [entry.item.id]: event.target.value })); }}>
            {entry.item.variants.map(option => <option key={option.id} value={option.id}>{variantLabel(option, language) ?? text('عادي', 'Regular')}</option>)}
          </select>}
          <button type="button" className="suggestion-add" disabled={done}
            aria-label={text(`أضف ${name} بـ ${formatPrice(variant.pricePiastres, language)} ج.م`, `Add ${name} for EGP ${formatPrice(variant.pricePiastres, language)}`)}
            onClick={() => {
              tracker.click(entry.rule.id, entry.item.id, placement);
              if (!onAdd(entry, variant.id)) return;
              tracker.add(entry.rule.id, entry.item.id, placement);
              setAdded(current => new Set([...current, entry.item.id]));
            }}>
            {done ? text('اتضاف', 'Added') : <><PlusIcon size={14} weight="bold" aria-hidden="true" />{formatPrice(variant.pricePiastres, language)} <small>{text('ج.م', 'EGP')}</small></>}
          </button>
        </li>;
      })}
    </ul>
  </section>;
}

/** An add-on or "with it" dish picked in the dish sheet. */
export type PickedExtra = { suggestion: Suggestion; variantId: string; quantity: number };
export type ExtrasSelection = Record<string, { variantId: string; quantity: number }>;
const keyOf = (entry: Suggestion) => `${entry.rule.id}:${entry.item.id}`;

/** The picked extras, with each one's suggestion. */
export function pickedExtras(suggestions: Suggestion[], selection: ExtrasSelection): PickedExtra[] {
  return suggestions.flatMap(entry => {
    const picked = selection[keyOf(entry)];
    return picked ? [{ suggestion: entry, variantId: picked.variantId, quantity: picked.quantity }] : [];
  });
}

/** Rules whose required pick is still missing (only while they have something to pick). */
export function missingRequired(suggestions: Suggestion[], selection: ExtrasSelection): PublicRecommendation[] {
  const rules = [...new Map(suggestions.filter(entry => entry.rule.required).map(entry => [entry.rule.id, entry.rule])).values()];
  return rules.filter(rule => !suggestions.some(entry => entry.rule.id === rule.id && selection[keyOf(entry)]));
}

/**
 * Add-ons and "often ordered with it" on the dish page: tick what to add with the dish, up to the
 * quantity the restaurant allows, each with its extra price. Required add-ons are marked.
 */
export function ExtrasPicker({ suggestions, selection, onChange, tracker, showMissing }: {
  suggestions: Suggestion[];
  selection: ExtrasSelection;
  onChange: (selection: ExtrasSelection) => void;
  tracker: Tracker;
  /** Highlights required groups still unpicked (after trying to add). */
  showMissing: boolean;
}) {
  const { text, language, number } = useLanguage();
  useImpressions(suggestions, 'PRODUCT_DETAILS', tracker);
  const rules = [...new Map(suggestions.map(entry => [entry.rule.id, entry.rule])).values()];
  const missing = new Set(missingRequired(suggestions, selection).map(rule => rule.id));
  const set = (entry: Suggestion, change: { variantId: string; quantity: number } | null) => {
    const next = { ...selection };
    if (change) next[keyOf(entry)] = change; else delete next[keyOf(entry)];
    onChange(next);
  };
  if (rules.length === 0) return null;
  return <div className="extras">
    {rules.map(rule => <fieldset key={rule.id} className={`extras-group ${showMissing && missing.has(rule.id) ? 'is-missing' : ''}`} data-testid="extras-group">
      <legend>{headingOf(rule, text)}{rule.required && <span className="extras-required">{text('اختار واحدة على الأقل', 'Pick at least one')}</span>}</legend>
      {suggestions.filter(entry => entry.rule.id === rule.id).map(entry => {
        const name = localized(language, entry.item.nameAr, entry.item.nameEn);
        const picked = selection[keyOf(entry)];
        const variant = entry.item.variants.find(candidate => candidate.id === picked?.variantId) ?? entry.variant ?? entry.item.variants[0]!;
        const quantity = picked?.quantity ?? 1;
        return <div key={entry.item.id} className={`extra-row ${picked ? 'is-picked' : ''}`} data-testid="extra" data-item={entry.item.nameAr}>
          <label className="extra-pick">
            <input type="checkbox" checked={!!picked} onChange={event => {
              tracker.click(entry.rule.id, entry.item.id, 'PRODUCT_DETAILS');
              set(entry, event.target.checked ? { variantId: variant.id, quantity: 1 } : null);
            }} />
            <span><bdi>{name}</bdi>{!entry.variant && entry.item.variants.length > 1 ? null : variantLabel(variant, language) && entry.item.variants.length > 1 && <small>{variantLabel(variant, language)}</small>}</span>
          </label>
          {!entry.variant && entry.item.variants.length > 1 && <select aria-label={text(`حجم ${name}`, `${name} size`)} value={variant.id}
            onChange={event => set(entry, { variantId: event.target.value, quantity })}>
            {entry.item.variants.map(option => <option key={option.id} value={option.id}>{variantLabel(option, language) ?? text('عادي', 'Regular')}</option>)}
          </select>}
          {picked && entry.maxQuantity > 1 && <span className="extra-quantity" role="group" aria-label={text(`كمية ${name}`, `${name} quantity`)}>
            <button type="button" onClick={() => set(entry, { variantId: variant.id, quantity: quantity - 1 })} disabled={quantity <= 1} aria-label={text('أقل', 'Fewer')}><MinusIcon size={14} /></button>
            <output>{number(quantity)}</output>
            <button type="button" onClick={() => set(entry, { variantId: variant.id, quantity: quantity + 1 })} disabled={quantity >= entry.maxQuantity} aria-label={text('أكتر', 'More')}><PlusIcon size={14} /></button>
          </span>}
          <span className="extra-price">+{formatPrice(variant.pricePiastres * quantity, language)} <small>{text('ج.م', 'EGP')}</small></span>
        </div>;
      })}
    </fieldset>)}
  </div>;
}
