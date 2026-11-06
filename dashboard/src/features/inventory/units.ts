import type { BaseUnit, IngredientUnit } from '@bilhanah/contracts';
import { normalizeDigits } from '../../lib/format';
import type { Language } from '../../lib/language';

/**
 * Quantities travel in the ingredient's base unit (grams, millilitres or pieces) with up to three
 * decimals, unit costs in piastres per base unit. People think in kilos, litres, sacks and cartons:
 * these helpers convert both ways and format without floating-point artefacts.
 */

/** Rounds half away from zero to `places` decimals, absorbing binary noise (0.1 + 0.2 → 0.3). */
export function roundTo(value: number, places: number): number {
  if (!Number.isFinite(value)) return 0;
  const scale = 10 ** places;
  const scaled = Math.abs(value) * scale;
  const rounded = Math.round(Number(scaled.toPrecision(15))) / scale;
  const result = value < 0 ? -rounded : rounded;
  return result === 0 ? 0 : result;
}

type Label = [ar: string, en: string];

export const BASE_UNIT_LABELS: Record<BaseUnit, Label> = { g: ['جرام', 'g'], ml: ['مللي', 'ml'], pcs: ['قطعة', 'pcs'] };
/** The everyday larger unit: kilos and litres (pieces stay pieces). */
export const LARGE_UNITS: Record<BaseUnit, { factor: number; label: Label } | null> = {
  g: { factor: 1000, label: ['كيلو', 'kg'] },
  ml: { factor: 1000, label: ['لتر', 'l'] },
  pcs: null,
};

/**
 * A unit someone may type a quantity in: the base unit, kilos or litres, and the ingredient's own
 * purchase units (sacks, cartons…). `unitId` is set only for the ingredient's own units; the others
 * are sent to the API converted to base units.
 */
export type UnitOption = { key: string; unitId: string | null; factor: number; label: Label };

export function unitOptions(baseUnit: BaseUnit, units: readonly IngredientUnit[] = [], { purchaseUnits = true } = {}): UnitOption[] {
  const options: UnitOption[] = [{ key: 'base', unitId: null, factor: 1, label: BASE_UNIT_LABELS[baseUnit] }];
  const large = LARGE_UNITS[baseUnit];
  const own = purchaseUnits ? units.filter(unit => unit.factor > 0) : [];
  // An own "kilo" (factor 1000) already covers the everyday unit.
  if (large && !own.some(unit => unit.factor === large.factor)) options.push({ key: 'large', unitId: null, factor: large.factor, label: large.label });
  for (const unit of own) options.push({ key: unit.id, unitId: unit.id, factor: unit.factor, label: [unit.nameAr, unit.nameEn ?? unit.nameAr] });
  return options;
}

/** The unit a quantity is usually typed in: kilos or litres (or the own unit worth 1000), pieces otherwise. */
export function preferredUnitKey(options: readonly UnitOption[], baseUnit: BaseUnit): string {
  const large = LARGE_UNITS[baseUnit];
  if (!large) return 'base';
  return options.find(option => option.key !== 'base' && option.factor === large.factor)?.key ?? 'base';
}

/** "2,5", "٢٫٥" or "2.5" → 2.5; null when empty or not a non-negative number. */
export function parseQuantity(value: string): number | null {
  const text = normalizeDigits(value.trim());
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

/** A typed quantity in a unit → base units (three decimals, as the API keeps them). */
export const toBase = (quantity: number, factor: number) => roundTo(quantity * factor, 3);

/** Base units → the same quantity in a unit, for an input box (ASCII digits, no grouping). */
export function fromBaseInput(base: number | null | undefined, factor: number): string {
  if (base === null || base === undefined) return '';
  return String(roundTo(base / factor, factor >= 1000 ? 6 : 3));
}

/** Where a base quantity reads best: kilos/litres from 1000 up, else the base unit. */
export function displayUnit(base: number, baseUnit: BaseUnit): { factor: number; label: Label; digits: number } {
  const large = LARGE_UNITS[baseUnit];
  if (large && Math.abs(base) >= large.factor) return { factor: large.factor, label: large.label, digits: 3 };
  return { factor: 1, label: BASE_UNIT_LABELS[baseUnit], digits: baseUnit === 'pcs' ? 2 : 1 };
}

const locale = (language: Language) => (language === 'ar' ? 'ar-EG' : 'en-EG');

export function formatNumber(value: number, language: Language, digits = 2): string {
  return new Intl.NumberFormat(locale(language), { maximumFractionDigits: digits }).format(roundTo(value, digits));
}

/** 49274 g → "49.274 kg" / "٤٩٫٢٧٤ كيلو"; 8.889 g → "8.9 g"; 12 pcs → "12 pcs". */
export function formatQuantity(base: number, baseUnit: BaseUnit, language: Language, { signed = false } = {}): string {
  const unit = displayUnit(base, baseUnit);
  const value = roundTo(base / unit.factor, unit.digits);
  const number = formatNumber(value, language, unit.digits);
  const sign = signed && value > 0 ? '+' : '';
  return `${sign}${number} ${language === 'ar' ? unit.label[0] : unit.label[1]}`;
}

/**
 * A purchase unit's names as a label: the English one when there is one, else the Arabic one in
 * both languages (owners name custom units in Arabic and may leave the English blank).
 */
export function unitLabel(unit: { unitNameAr: string; unitNameEn: string | null }): Label {
  return [unit.unitNameAr, unit.unitNameEn?.trim() || unit.unitNameAr];
}

/** A quantity in a chosen unit: 2 sacks, 1.5 kg. */
export function formatInUnit(quantity: number, label: Label, language: Language): string {
  return `${formatNumber(quantity, language, 3)} ${language === 'ar' ? label[0] : label[1]}`;
}

/** Piastres per base unit → piastres per everyday unit (per kilo, litre or piece). */
export function costPerDisplayUnit(costPerBase: number, baseUnit: BaseUnit): { piastres: number; label: Label } {
  const large = LARGE_UNITS[baseUnit];
  if (large) return { piastres: roundTo(costPerBase * large.factor, 2), label: large.label };
  return { piastres: roundTo(costPerBase, 2), label: BASE_UNIT_LABELS[baseUnit] };
}

/** Piastres per kilo (litre, piece) typed by the owner → piastres per base unit (the API's four decimals). */
export function costPerBase(piastresPerDisplayUnit: number, baseUnit: BaseUnit): number {
  const large = LARGE_UNITS[baseUnit];
  return roundTo(large ? piastresPerDisplayUnit / large.factor : piastresPerDisplayUnit, 4);
}

/**
 * An amount in pounds as typed ("12.5", "١٢٫٥") → piastres, allowing `decimals` decimals of a
 * pound (2 for totals; 4 for unit prices, which the API keeps to 0.01 piastre).
 */
export function parseEgp(value: string, decimals = 2): number | null {
  const text = normalizeDigits(value.trim());
  const match = new RegExp(`^(\\d{1,9})(?:\\.(\\d{1,${decimals}}))?$`).exec(text);
  if (!match) return null;
  const fraction = (match[2] ?? '').padEnd(decimals, '0');
  const piastres = Number(match[1]) * 100 + Number(fraction) / 10 ** (decimals - 2);
  return roundTo(piastres, Math.max(0, decimals - 2));
}

/** Piastres → pounds for an input box ("12.5"). */
export function egpInput(piastres: number | null | undefined, decimals = 2): string {
  if (piastres === null || piastres === undefined) return '';
  return String(roundTo(piastres / 100, decimals));
}

/** 38.84 → "38.8%" / "٣٨٫٨٪". */
export function formatPercent(value: number | null | undefined, language: Language, digits = 1): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(locale(language), { style: 'percent', maximumFractionDigits: digits }).format(roundTo(value, digits + 2) / 100);
}
