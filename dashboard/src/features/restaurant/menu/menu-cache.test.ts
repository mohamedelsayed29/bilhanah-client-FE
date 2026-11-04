import { describe, expect, it } from 'vitest';
import type { OwnerMenu, OwnerMenuItem } from '@bilhanah/contracts';
import { reorderCategories, reorderItems, upsertItem } from './menu-cache';

const item = (id: string, categoryId: string): OwnerMenuItem => ({
  id, categoryId, nameAr: id, nameEn: null, descriptionAr: null, descriptionEn: null, image: null, isAvailable: true, isVisible: true, stationId: null,
  variants: [{ id: `${id}-v`, nameAr: null, nameEn: null, pricePiastres: 1000 }],
});
const menu: OwnerMenu = {
  categories: [
    { id: 'a', nameAr: 'أ', nameEn: null, isVisible: true, stationId: null, items: [item('a1', 'a'), item('a2', 'a')] },
    { id: 'b', nameAr: 'ب', nameEn: null, isVisible: true, stationId: null, items: [item('b1', 'b')] },
  ],
};

describe('menu cache updates', () => {
  it('reorders categories and items by id list', () => {
    expect(reorderCategories(menu, ['b', 'a']).categories.map(c => c.id)).toEqual(['b', 'a']);
    expect(reorderItems(menu, 'a', ['a2', 'a1']).categories[0]!.items.map(i => i.id)).toEqual(['a2', 'a1']);
  });

  it('replaces an item in place, and moves it to the end of its new category', () => {
    const renamed = upsertItem(menu, { ...item('a1', 'a'), nameAr: 'جديد' });
    expect(renamed.categories[0]!.items.map(i => i.nameAr)).toEqual(['جديد', 'a2']);
    const moved = upsertItem(menu, item('a1', 'b'));
    expect(moved.categories[0]!.items.map(i => i.id)).toEqual(['a2']);
    expect(moved.categories[1]!.items.map(i => i.id)).toEqual(['b1', 'a1']);
  });
});
