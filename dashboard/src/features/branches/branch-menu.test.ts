import { describe, expect, it } from 'vitest';
import type { BranchMenuItem } from '@bilhanah/contracts';
import { availabilityChoice, availabilityValue, clearPrices, filterMenu, isOverridden, kitchenToggle, menuSummary, optimisticItem, priceDraft, pricesUpdate, withItem } from './branch-menu';

const item = (id: string, extra: Partial<BranchMenuItem> = {}): BranchMenuItem => {
  const variants = [{ id: `${id}-s`, nameAr: 'صغير', nameEn: 'Small', pricePiastres: 3500 }, { id: `${id}-l`, nameAr: 'كبير', nameEn: 'Large', pricePiastres: 6500 }];
  return {
    id, categoryId: 'c', nameAr: 'كشري', nameEn: 'Koshary', descriptionAr: null, descriptionEn: null, image: null, isAvailable: true, isVisible: true, variants, stationId: null,
    override: { available: null, hidden: false, prices: {} },
    effective: { available: true, visible: true, variants },
    ...extra,
  };
};

describe('branch menu overrides', () => {
  it('maps availability to the three choices and back', () => {
    expect(availabilityChoice({ available: null })).toBe('follow');
    expect(availabilityChoice({ available: true })).toBe('available');
    expect(availabilityChoice({ available: false })).toBe('soldOut');
    expect(availabilityValue('follow')).toBeNull();
    expect(availabilityValue('soldOut')).toBe(false);
  });

  it('notices any change a branch made', () => {
    expect(isOverridden(item('a'))).toBe(false);
    expect(isOverridden(item('a', { override: { available: false, hidden: false, prices: {} } }))).toBe(true);
    expect(isOverridden(item('a', { override: { available: null, hidden: true, prices: {} } }))).toBe(true);
    expect(isOverridden(item('a', { override: { available: null, hidden: false, prices: { 'a-s': 4000 } } }))).toBe(true);
  });

  it('builds a price change with only the sizes that differ', () => {
    const dish = item('a', { override: { available: null, hidden: false, prices: { 'a-s': 4000 } } });
    expect(priceDraft(dish)).toEqual({ 'a-s': '40', 'a-l': '' });
    // Unchanged boxes send nothing.
    expect(pricesUpdate(dish, { 'a-s': '40', 'a-l': '' })).toEqual({ prices: [], invalid: [] });
    // A new price, Arabic digits and comma decimals included; clearing one goes back to the shared price.
    expect(pricesUpdate(dish, { 'a-s': '', 'a-l': '٧٢٫٥' })).toEqual({
      prices: [{ variantId: 'a-s', pricePiastres: null }, { variantId: 'a-l', pricePiastres: 7250 }], invalid: [],
    });
    // Typing the shared price is the same as following it.
    expect(pricesUpdate(dish, { 'a-s': '35', 'a-l': '65' })).toEqual({ prices: [{ variantId: 'a-s', pricePiastres: null }], invalid: [] });
    expect(pricesUpdate(dish, { 'a-s': 'abc', 'a-l': '' })).toEqual({ prices: [], invalid: ['a-s'] });
    expect(clearPrices(dish)).toEqual([{ variantId: 'a-s', pricePiastres: null }]);
  });

  it('shows the change right away, as diners will see it', () => {
    const soldOut = optimisticItem(item('a'), { available: false });
    expect(soldOut.effective.available).toBe(false);
    expect(optimisticItem(soldOut, { available: null }).effective.available).toBe(true);
    const hidden = optimisticItem(item('a'), { hidden: true });
    expect(hidden.effective.visible).toBe(false);
    expect(optimisticItem(hidden, { hidden: false }).effective.visible).toBe(true);
    const priced = optimisticItem(item('a'), { prices: [{ variantId: 'a-l', pricePiastres: 7000 }] });
    expect(priced.effective.variants.map(variant => variant.pricePiastres)).toEqual([3500, 7000]);
    expect(priced.override.prices).toEqual({ 'a-l': 7000 });
  });

  it('lets the kitchen flip a dish between sold out and on sale', () => {
    expect(kitchenToggle(item('a'))).toBe(false);
    const soldOutHere = optimisticItem(item('a'), { available: false });
    expect(kitchenToggle(soldOutHere)).toBeNull();
    const soldOutEverywhere = item('a', { isAvailable: false, effective: { available: false, visible: true, variants: [] } });
    expect(kitchenToggle(soldOutEverywhere)).toBe(true);
  });

  it('filters by name (Arabic spelling variants too) and by changed dishes, and summarises', () => {
    const changed = item('b', { nameAr: 'فتة', nameEn: 'Fatta', override: { available: false, hidden: false, prices: {} }, effective: { available: false, visible: true, variants: [] } });
    const menu = { branchId: 'x', categories: [{ id: 'c', nameAr: 'أطباق', nameEn: null, isVisible: true, items: [item('a'), changed] }, { id: 'd', nameAr: 'حلو', nameEn: null, isVisible: true, items: [] }] };
    expect(filterMenu(menu.categories, { query: 'فته' }).flatMap(category => category.items.map(entry => entry.id))).toEqual(['b']);
    expect(filterMenu(menu.categories, { query: 'KOSH' }).flatMap(category => category.items.map(entry => entry.id))).toEqual(['a']);
    expect(filterMenu(menu.categories, { changedOnly: true }).flatMap(category => category.items.map(entry => entry.id))).toEqual(['b']);
    expect(filterMenu(menu.categories, {}).map(category => category.id)).toEqual(['c']);
    expect(menuSummary(menu)).toEqual({ items: 2, changed: 1, soldOut: 1, hidden: 0, ownPrices: 0 });
    expect(withItem(menu, { ...changed, nameAr: 'فتة لحمة' }).categories[0]!.items[1]!.nameAr).toBe('فتة لحمة');
  });
});
