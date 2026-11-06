import type { CostingRow, InventoryDish } from '@bilhanah/contracts';
import { roundTo } from './units';

/**
 * The recipe cost the editor shows while lines are typed, before the API recalculates it. It follows
 * the server's arithmetic (docs/INVENTORY.md): usage = quantity / (1 − waste% / 100), three decimals;
 * each line costs usage × the branch's unit cost, to 0.01 piastre.
 */
export type DraftRecipeLine = { ingredientId: string; quantity: number; wastePercent: number };

export function lineUsage(quantity: number, wastePercent: number): number {
  const waste = Math.min(Math.max(wastePercent, 0), 90);
  return roundTo(quantity / (1 - waste / 100), 3);
}

export type RecipePreview = {
  /** Piastres. */
  cost: number;
  /** A line has no known unit cost (never received, no standard cost). */
  incomplete: boolean;
  lines: { usage: number; cost: number | null }[];
};

/** `unitCost`: piastres per base unit at the branch, or null when unknown. */
export function previewRecipeCost(lines: readonly DraftRecipeLine[], unitCost: (ingredientId: string) => number | null | undefined): RecipePreview {
  let cost = 0;
  let incomplete = false;
  const costed = lines.map(line => {
    const usage = lineUsage(line.quantity, line.wastePercent);
    const unit = unitCost(line.ingredientId);
    if (unit === null || unit === undefined) {
      incomplete = true;
      return { usage, cost: null };
    }
    const value = roundTo(usage * unit, 2);
    cost += value;
    return { usage, cost: value };
  });
  return { cost: roundTo(cost, 2), incomplete, lines: costed };
}

/** Recipe cost as a share of the price, two decimals (null without a price). */
export function foodCostPercent(cost: number, pricePiastres: number): number | null {
  if (pricePiastres <= 0) return null;
  return roundTo((cost / pricePiastres) * 100, 2);
}

export const marginOf = (cost: number, pricePiastres: number) => roundTo(pricePiastres - cost, 2);

/**
 * How a food cost reads: most restaurants aim for about 30%; above 40% the dish barely pays for
 * itself. Presentation only (the owner sets prices).
 */
export type FoodCostTone = 'good' | 'watch' | 'high' | 'none';
export function foodCostTone(percent: number | null | undefined): FoodCostTone {
  if (percent === null || percent === undefined) return 'none';
  if (percent <= 32) return 'good';
  if (percent <= 40) return 'watch';
  return 'high';
}

export type CostingFlag = 'NO_RECIPE' | 'INCOMPLETE' | null;
export const costingFlag = (row: Pick<CostingRow, 'hasRecipe' | 'incomplete'>): CostingFlag => (!row.hasRecipe ? 'NO_RECIPE' : row.incomplete ? 'INCOMPLETE' : null);

export type CostingFilter = 'all' | 'missing' | 'incomplete' | 'high';
export type CostingSort = 'menu' | 'foodCostDesc' | 'foodCostAsc' | 'marginAsc';

/** The costing table as filtered and sorted on screen; dishes without a figure go last. */
export function arrangeCosting(rows: readonly CostingRow[], filter: CostingFilter, sort: CostingSort, search = ''): CostingRow[] {
  const needle = search.trim().toLowerCase();
  const matches = (row: CostingRow) => !needle || [row.itemNameAr, row.itemNameEn, row.variantNameAr, row.variantNameEn, row.categoryNameAr]
    .some(value => value?.toLowerCase().includes(needle));
  const kept = rows.filter(row => matches(row) && (filter === 'all'
    || (filter === 'missing' && !row.hasRecipe)
    || (filter === 'incomplete' && row.hasRecipe && row.incomplete)
    || (filter === 'high' && foodCostTone(row.foodCostPercent) === 'high')));
  if (sort === 'menu') return kept;
  const value = (row: CostingRow) => (sort === 'marginAsc' ? row.marginPiastres : row.foodCostPercent);
  const direction = sort === 'foodCostDesc' ? -1 : 1;
  return [...kept].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return (left - right) * direction;
  });
}

/** The dish sizes of the costing table that share a dish, in menu order. */
export function sizesOf(rows: readonly CostingRow[], itemId: string): CostingRow[] {
  return rows.filter(row => row.itemId === itemId);
}

/** Dish sizes grouped by their menu category, in menu order. */
export function groupByCategory(sizes: readonly InventoryDish[]): { id: string; nameAr: string; nameEn: string | null; sizes: InventoryDish[] }[] {
  const groups = new Map<string, { id: string; nameAr: string; nameEn: string | null; sizes: InventoryDish[] }>();
  for (const size of sizes) {
    const group = groups.get(size.categoryId) ?? { id: size.categoryId, nameAr: size.categoryNameAr, nameEn: size.categoryNameEn, sizes: [] };
    group.sizes.push(size);
    groups.set(size.categoryId, group);
  }
  return [...groups.values()];
}
