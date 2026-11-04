import type { OwnerMenu, OwnerMenuCategory, OwnerMenuItem } from '@bilhanah/contracts';

/** Pure updates of the cached owner menu, used for optimistic UI and to apply server responses. */

export function reorderBy<T extends { id: string }>(list: T[], ids: string[]): T[] {
  const byId = new Map(list.map(entry => [entry.id, entry]));
  const ordered = ids.map(id => byId.get(id)).filter((entry): entry is T => !!entry);
  // Anything the id list missed keeps its place at the end.
  return [...ordered, ...list.filter(entry => !ids.includes(entry.id))];
}

export function reorderCategories(menu: OwnerMenu, ids: string[]): OwnerMenu {
  return { categories: reorderBy(menu.categories, ids) };
}

export function reorderItems(menu: OwnerMenu, categoryId: string, ids: string[]): OwnerMenu {
  return mapCategory(menu, categoryId, category => ({ ...category, items: reorderBy(category.items, ids) }));
}

export function mapCategory(menu: OwnerMenu, id: string, update: (category: OwnerMenuCategory) => OwnerMenuCategory): OwnerMenu {
  return { categories: menu.categories.map(category => (category.id === id ? update(category) : category)) };
}

export function removeCategory(menu: OwnerMenu, id: string): OwnerMenu {
  return { categories: menu.categories.filter(category => category.id !== id) };
}

export function addCategory(menu: OwnerMenu, category: OwnerMenuCategory): OwnerMenu {
  return { categories: [...menu.categories.filter(entry => entry.id !== category.id), category] };
}

export function patchItem(menu: OwnerMenu, id: string, patch: Partial<OwnerMenuItem>): OwnerMenu {
  return { categories: menu.categories.map(category => ({ ...category, items: category.items.map(item => (item.id === id ? { ...item, ...patch } : item)) })) };
}

export function removeItem(menu: OwnerMenu, id: string): OwnerMenu {
  return { categories: menu.categories.map(category => ({ ...category, items: category.items.filter(item => item.id !== id) })) };
}

/** Inserts or replaces an item; an item that moved category goes to the end of its new one (as the API does). */
export function upsertItem(menu: OwnerMenu, item: OwnerMenuItem): OwnerMenu {
  const previous = menu.categories.find(category => category.items.some(entry => entry.id === item.id));
  return {
    categories: menu.categories.map(category => {
      if (previous && previous.id === item.categoryId && category.id === item.categoryId) {
        return { ...category, items: category.items.map(entry => (entry.id === item.id ? item : entry)) };
      }
      const items = category.items.filter(entry => entry.id !== item.id);
      return { ...category, items: category.id === item.categoryId ? [...items, item] : items };
    }),
  };
}

export function findItem(menu: OwnerMenu | undefined, id: string): OwnerMenuItem | undefined {
  return menu?.categories.flatMap(category => category.items).find(item => item.id === id);
}
