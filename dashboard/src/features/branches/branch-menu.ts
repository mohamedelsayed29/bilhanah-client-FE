import type { BranchItemOverride, BranchMenu, BranchMenuCategory, BranchMenuItem, setBranchItemSchema } from '@bilhanah/contracts';
import type { z } from 'zod';
import { egpToPiastres, piastresToInput } from '../../lib/format';

export type SetBranchItem = z.output<typeof setBranchItemSchema>;

/** The three availability choices a branch has for a dish. */
export type AvailabilityChoice = 'follow' | 'available' | 'soldOut';

export const availabilityChoice = (override: Pick<BranchItemOverride, 'available'>): AvailabilityChoice =>
  override.available === null ? 'follow' : override.available ? 'available' : 'soldOut';

export const availabilityValue = (choice: AvailabilityChoice): boolean | null => (choice === 'follow' ? null : choice === 'available');

/** The branch has changed something about this dish (availability, visibility or a price). */
export const isOverridden = (item: Pick<BranchMenuItem, 'override'>) =>
  item.override.available !== null || item.override.hidden || Object.keys(item.override.prices).length > 0;

/**
 * The kitchen's one-tap sold-out switch: a dish on sale becomes sold out at the branch; a sold-out
 * one comes back by following the shared menu again when it is on sale there, else by being marked
 * available at the branch.
 */
export function kitchenToggle(item: Pick<BranchMenuItem, 'isAvailable' | 'effective'>): boolean | null {
  if (item.effective.available) return false;
  return item.isAvailable ? null : true;
}

/** The price boxes of a dish: the branch's own price per size, empty where it follows the menu. */
export type PriceDraft = Record<string, string>;

export function priceDraft(item: Pick<BranchMenuItem, 'variants' | 'override'>): PriceDraft {
  return Object.fromEntries(item.variants.map(variant => {
    const own = item.override.prices[variant.id];
    return [variant.id, own === undefined ? '' : piastresToInput(own)];
  }));
}

/**
 * What to send for the typed prices: only the sizes that change. An empty box, or the shared price
 * itself, means "follow the menu" (null). Sizes whose box is not a valid price are returned in `invalid`.
 */
export function pricesUpdate(item: Pick<BranchMenuItem, 'variants' | 'override'>, draft: PriceDraft): {
  prices: { variantId: string; pricePiastres: number | null }[]; invalid: string[];
} {
  const prices: { variantId: string; pricePiastres: number | null }[] = [];
  const invalid: string[] = [];
  for (const variant of item.variants) {
    const raw = (draft[variant.id] ?? '').trim();
    let target: number | null = null;
    if (raw) {
      const parsed = egpToPiastres(raw);
      if (parsed === null) { invalid.push(variant.id); continue; }
      target = parsed === variant.pricePiastres ? null : parsed;
    }
    const current = item.override.prices[variant.id] ?? null;
    if (target !== current) prices.push({ variantId: variant.id, pricePiastres: target });
  }
  return { prices, invalid };
}

/** Sends every size back to the shared price. */
export function clearPrices(item: Pick<BranchMenuItem, 'override'>): { variantId: string; pricePiastres: null }[] {
  return Object.keys(item.override.prices).map(variantId => ({ variantId, pricePiastres: null }));
}

/** The dish as it will look once the change is saved (prices are left to the server's answer). */
export function optimisticItem(item: BranchMenuItem, change: SetBranchItem): BranchMenuItem {
  const available = change.available === undefined ? item.override.available : change.available;
  const hidden = change.hidden ?? item.override.hidden;
  const prices = { ...item.override.prices };
  for (const entry of change.prices ?? []) {
    if (entry.pricePiastres === null) delete prices[entry.variantId];
    else prices[entry.variantId] = entry.pricePiastres;
  }
  const sharedVisible = item.override.hidden ? item.isVisible : item.effective.visible;
  return {
    ...item,
    override: { available, hidden, prices },
    effective: {
      available: available ?? item.isAvailable,
      visible: sharedVisible && !hidden,
      variants: item.variants.map(variant => ({ ...variant, pricePiastres: prices[variant.id] ?? variant.pricePiastres })),
    },
  };
}

/** The menu with one dish replaced. */
export function withItem(menu: BranchMenu, item: BranchMenuItem): BranchMenu {
  return {
    ...menu,
    categories: menu.categories.map(category => (category.items.some(entry => entry.id === item.id)
      ? { ...category, items: category.items.map(entry => (entry.id === item.id ? item : entry)) }
      : category)),
  };
}

export function menuSummary(menu: BranchMenu) {
  const items = menu.categories.flatMap(category => category.items);
  return {
    items: items.length,
    changed: items.filter(isOverridden).length,
    soldOut: items.filter(item => item.effective.visible && !item.effective.available).length,
    hidden: items.filter(item => item.override.hidden).length,
    ownPrices: items.filter(item => Object.keys(item.override.prices).length > 0).length,
  };
}

/** Lowercased, without Arabic diacritics and with alef/yaa/taa marbuta forms unified, for search. */
export function searchable(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآا]/g, 'ا')
    .replace(/[ىي]/g, 'ي')
    .replace(/ة/g, 'ه')
    .trim();
}

/** Categories with only the dishes that match the search (Arabic or English name) and the filter; empty categories dropped. */
export function filterMenu(categories: readonly BranchMenuCategory[], { query = '', changedOnly = false }: { query?: string; changedOnly?: boolean }): BranchMenuCategory[] {
  const needle = searchable(query);
  return categories
    .map(category => ({
      ...category,
      items: category.items.filter(item => (!changedOnly || isOverridden(item))
        && (!needle || searchable(item.nameAr).includes(needle) || searchable(item.nameEn ?? '').includes(needle))),
    }))
    .filter(category => category.items.length > 0);
}
