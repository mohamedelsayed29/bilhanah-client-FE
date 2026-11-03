import type { MenuVariant, PublicMenuItem, PublicRecommendation, RecommendationPlacement, RecommendationType } from '@bilhanah/contracts';

/** One dish a rule suggests, resolved against the branch's menu: its item, the fixed size (if any), and how many may be added. */
export type Suggestion = {
  rule: PublicRecommendation;
  item: PublicMenuItem;
  /** The size the rule fixes; null lets the diner pick (the first size by default). */
  variant: MenuVariant | null;
  maxQuantity: number;
};

/**
 * The suggestions of `sourceIds` for one placement (and kinds), without dishes already in the
 * cart (`exclude`) and without repeating a dish. The API sends only orderable dishes; anything
 * missing from this menu is skipped too, so a stale rule never breaks the page.
 */
export function suggestionsFor(rules: PublicRecommendation[], items: Map<string, PublicMenuItem>, sourceIds: string[], placement: RecommendationPlacement,
  types: RecommendationType[], exclude: ReadonlySet<string> = new Set()): Suggestion[] {
  const seen = new Set<string>();
  return rules.filter(rule => sourceIds.includes(rule.sourceItemId) && rule.placements.includes(placement) && types.includes(rule.type)).flatMap(rule => rule.items.flatMap(entry => {
    const item = items.get(entry.itemId);
    if (!item || !item.isAvailable || exclude.has(item.id) || seen.has(item.id)) return [];
    const variant = entry.variantId ? item.variants.find(candidate => candidate.id === entry.variantId) ?? null : null;
    if (entry.variantId && !variant) return [];
    seen.add(item.id);
    return [{ rule, item, variant, maxQuantity: entry.maxQuantity }];
  }));
}
