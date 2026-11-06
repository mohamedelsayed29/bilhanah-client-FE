import { PlusIcon, TrashIcon } from '@phosphor-icons/react';
import { INVENTORY_LIMITS, type Ingredient, type RecipeLine } from '@bilhanah/contracts';
import { Button } from '../../components/Button';
import { useLanguage } from '../../lib/language';
import { IngredientPicker, QuantityInput } from './controls';
import { previewRecipeCost, type DraftRecipeLine } from './costing';
import { useInventoryFormat } from './shared';
import { fromBaseInput, parseQuantity, roundTo, toBase, unitOptions, type UnitOption } from './units';

/** A recipe line as typed: the quantity in a chosen unit (grams or kilos…) and the waste % as text. */
export type RecipeDraft = { key: string; ingredientId: string | null; quantity: string; unitKey: string; waste: string };

let counter = 0;
export const draftKey = () => `line-${++counter}`;

/** The units a recipe quantity is typed in: the base unit and kilos or litres (purchase units are for buying). */
export function recipeUnits(ingredient: Pick<Ingredient, 'baseUnit'> | undefined): UnitOption[] {
  return ingredient ? unitOptions(ingredient.baseUnit, [], { purchaseUnits: false }) : unitOptions('g', [], { purchaseUnits: false });
}

export function toRecipeDrafts(lines: readonly Pick<RecipeLine, 'ingredientId' | 'quantity' | 'wastePercent' | 'baseUnit'>[]): RecipeDraft[] {
  return lines.map(line => {
    const options = unitOptions(line.baseUnit, [], { purchaseUnits: false });
    const large = options.find(option => option.key === 'large');
    const option = large && line.quantity >= large.factor ? large : options[0]!;
    return { key: draftKey(), ingredientId: line.ingredientId, quantity: fromBaseInput(line.quantity, option.factor), unitKey: option.key, waste: line.wastePercent ? String(line.wastePercent) : '' };
  });
}

export const emptyRecipeDraft = (): RecipeDraft => ({ key: draftKey(), ingredientId: null, quantity: '', unitKey: 'base', waste: '' });

/** A typed waste %: empty is 0; null when invalid. */
export function parseWaste(value: string): number | null {
  if (!value.trim()) return 0;
  const parsed = parseQuantity(value);
  return parsed === null || parsed > INVENTORY_LIMITS.maxWastePercent ? null : roundTo(parsed, 2);
}

/** The drafts as API lines (base units), with the rows that cannot be sent. Blank rows are left out. */
export function compileRecipe(drafts: readonly RecipeDraft[], ingredients: readonly Ingredient[]): { lines: DraftRecipeLine[]; invalid: Set<string>; duplicate: Set<string> } {
  const invalid = new Set<string>();
  const duplicate = new Set<string>();
  const seen = new Set<string>();
  const lines: DraftRecipeLine[] = [];
  for (const draft of drafts) {
    if (!draft.ingredientId && !draft.quantity.trim()) continue;
    const ingredient = ingredients.find(entry => entry.id === draft.ingredientId);
    const option = recipeUnits(ingredient).find(entry => entry.key === draft.unitKey) ?? recipeUnits(ingredient)[0]!;
    const quantity = parseQuantity(draft.quantity);
    const waste = parseWaste(draft.waste);
    const base = quantity === null ? null : toBase(quantity, option.factor);
    if (!ingredient || base === null || base <= 0 || waste === null) { invalid.add(draft.key); continue; }
    if (seen.has(ingredient.id)) { duplicate.add(draft.key); continue; }
    seen.add(ingredient.id);
    lines.push({ ingredientId: ingredient.id, quantity: base, wastePercent: waste });
  }
  return { lines, invalid, duplicate };
}

/**
 * The lines of a recipe (a dish size, or a prepared ingredient): ingredient, quantity as served in
 * grams or kilos (millilitres, litres, pieces), waste %, what it really uses, and its cost when allowed.
 */
export function RecipeLinesEditor({ drafts, onChange, ingredients, unitCost, showCosts, excludeId, readOnly = false }: {
  drafts: RecipeDraft[]; onChange: (drafts: RecipeDraft[]) => void; ingredients: readonly Ingredient[];
  /** Piastres per base unit at the branch shown. */
  unitCost: (ingredientId: string) => number | null;
  showCosts: boolean;
  /** A prepared ingredient cannot use itself. */
  excludeId?: string; readOnly?: boolean;
}) {
  const { text } = useLanguage();
  const format = useInventoryFormat();
  const compiled = compileRecipe(drafts, ingredients);
  const update = (key: string, change: Partial<RecipeDraft>) => onChange(drafts.map(draft => (draft.key === key ? { ...draft, ...change } : draft)));
  const used = drafts.map(draft => draft.ingredientId).filter((value): value is string => Boolean(value));
  const choices = ingredients.filter(ingredient => ingredient.id !== excludeId);
  return <div className="inv-lines" data-testid="recipe-lines">
    <div className="inv-lines-head" aria-hidden="true">
      <span>{text('الخامة', 'Ingredient')}</span><span>{text('الكمية في الطبق', 'Quantity served')}</span><span>{text('هالك ٪', 'Waste %')}</span>
      <span>{text('الاستهلاك', 'Uses')}</span>{showCosts && <span>{text('التكلفة', 'Cost')}</span>}<span />
    </div>
    <ol className="inv-line-list">
      {drafts.map((draft, index) => {
        const ingredient = ingredients.find(entry => entry.id === draft.ingredientId);
        const options = recipeUnits(ingredient);
        const option = options.find(entry => entry.key === draft.unitKey) ?? options[0]!;
        const quantity = parseQuantity(draft.quantity);
        const waste = parseWaste(draft.waste);
        const base = quantity === null ? null : toBase(quantity, option.factor);
        const preview = ingredient && base !== null && waste !== null ? previewRecipeCost([{ ingredientId: ingredient.id, quantity: base, wastePercent: waste }], unitCost).lines[0] : null;
        const bad = compiled.invalid.has(draft.key);
        const twice = compiled.duplicate.has(draft.key);
        const name = ingredient ? format.name(ingredient.nameAr, ingredient.nameEn) : text(`سطر ${index + 1}`, `Line ${index + 1}`);
        if (readOnly) {
          return <li key={draft.key} className="inv-line is-read" data-testid="recipe-line">
            <span className="inv-line-name"><bdi>{name}</bdi>{ingredient?.kind === 'PREPARED' && <small className="badge badge-muted">{text('تحضير', 'Prepared')}</small>}</span>
            <span>{base === null || !ingredient ? '—' : format.qty(base, ingredient.baseUnit)}</span>
            <span>{waste ? format.percent(waste) : '—'}</span>
            <span className="muted">{preview && ingredient ? format.qty(preview.usage, ingredient.baseUnit) : '—'}</span>
            {showCosts && <span className="cell-amount">{preview ? format.money(preview.cost) : '—'}</span>}
            <span />
          </li>;
        }
        return <li key={draft.key} className={`inv-line ${bad || twice ? 'is-invalid' : ''}`} data-testid="recipe-line">
          <IngredientPicker ingredients={choices} value={draft.ingredientId} exclude={used} label={text(`خامة السطر ${index + 1}`, `Ingredient, line ${index + 1}`)} invalid={twice || (bad && !ingredient)}
            onChange={picked => {
              const next = recipeUnits(picked ?? undefined);
              update(draft.key, { ingredientId: picked?.id ?? null, unitKey: next.some(entry => entry.key === draft.unitKey) ? draft.unitKey : next[0]!.key });
            }} />
          <QuantityInput value={draft.quantity} onValue={value => update(draft.key, { quantity: value })} unitKey={option.key} onUnit={key => update(draft.key, { unitKey: key })}
            options={options} label={text(`كمية ${name}`, `Quantity of ${name}`)} invalid={bad && (base === null || base <= 0)} testId="recipe-qty" />
          <div className="input-group inv-waste">
            <input className="input ltr" inputMode="decimal" value={draft.waste} placeholder="0" aria-label={text(`نسبة هالك ${name}`, `Waste % of ${name}`)}
              aria-invalid={waste === null || undefined} onChange={event => update(draft.key, { waste: event.target.value })} />
            <span className="input-affix">٪</span>
          </div>
          <span className="inv-line-usage muted" aria-label={text('الاستهلاك الفعلي', 'Actual use')}>{preview && ingredient ? format.qty(preview.usage, ingredient.baseUnit) : '—'}</span>
          {showCosts && <span className="inv-line-cost" data-testid="recipe-line-cost">{preview ? (preview.cost === null ? <span className="muted">{text('مفيش تكلفة', 'No cost yet')}</span> : format.money(preview.cost)) : '—'}</span>}
          <button type="button" className="icon-button inv-line-remove" aria-label={text(`شيل ${name}`, `Remove ${name}`)} onClick={() => onChange(drafts.filter(entry => entry.key !== draft.key))}>
            <TrashIcon size={18} aria-hidden="true" />
          </button>
          {twice && <p className="field-error inv-line-error">{text('الخامة دي موجودة في سطر تاني.', 'This ingredient is already on another line.')}</p>}
        </li>;
      })}
    </ol>
    {!readOnly && <Button small variant="ghost" icon={<PlusIcon size={16} weight="bold" aria-hidden="true" />} disabled={drafts.length >= INVENTORY_LIMITS.recipeLines}
      onClick={() => onChange([...drafts, emptyRecipeDraft()])} data-testid="recipe-add-line">{text('ضيف خامة', 'Add an ingredient')}</Button>}
    {!readOnly && <p className="field-hint">{text('الكمية زي ما بتتقدم في الطبق. الهالك ٪ للتنضيف والفاقد: ١٠٠ جرام بهالك ١٠٪ بتستهلك ١١١ جرام.', 'The quantity as served. Waste % covers trimming and loss: 100 g with 10% waste uses 111 g.')}</p>}
  </div>;
}
