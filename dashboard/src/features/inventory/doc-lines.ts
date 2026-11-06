import type { Ingredient } from '@bilhanah/contracts';
import { parseQuantity, preferredUnitKey, roundTo, toBase, unitOptions, type UnitOption } from './units';

/** A document line as typed (deliveries, waste, transfers): an ingredient, a quantity and its unit. */
export type QtyDraft = { key: string; ingredientId: string | null; quantity: string; unitKey: string };

let counter = 0;
export const lineKey = () => `doc-${++counter}`;
export const emptyQtyDraft = (): QtyDraft => ({ key: lineKey(), ingredientId: null, quantity: '', unitKey: 'base' });

/** Units for a document line: the base unit, kilos or litres, and the ingredient's purchase units. */
export const lineUnits = (ingredient: Pick<Ingredient, 'baseUnit' | 'units'> | undefined): UnitOption[] => (ingredient ? unitOptions(ingredient.baseUnit, ingredient.units) : unitOptions('g'));

/** The unit a new line starts in: the first purchase unit for deliveries, else kilos/litres/pieces. */
export function defaultUnitKey(ingredient: Pick<Ingredient, 'baseUnit' | 'units'>, preferPurchaseUnit = false): string {
  const options = lineUnits(ingredient);
  if (preferPurchaseUnit && ingredient.units[0]) return ingredient.units[0].id;
  return preferredUnitKey(options, ingredient.baseUnit);
}

export type CompiledQty = {
  /** The ingredient's own unit, or null when the quantity is sent in base units. */
  unitId: string | null;
  /** As sent: in the own unit, or in base units. */
  quantity: number;
  /** Base units (for previews). */
  base: number;
  option: UnitOption;
};

/** A line's quantity as the API takes it; null when it is not a positive number. */
export function compileQty(draft: Pick<QtyDraft, 'quantity' | 'unitKey'>, ingredient: Pick<Ingredient, 'baseUnit' | 'units'> | undefined): CompiledQty | null {
  if (!ingredient) return null;
  const options = lineUnits(ingredient);
  const option = options.find(entry => entry.key === draft.unitKey) ?? options[0]!;
  const typed = parseQuantity(draft.quantity);
  if (typed === null || typed <= 0) return null;
  const base = toBase(typed, option.factor);
  if (base <= 0) return null;
  return option.unitId ? { unitId: option.unitId, quantity: roundTo(typed, 3), base, option } : { unitId: null, quantity: base, base, option };
}
