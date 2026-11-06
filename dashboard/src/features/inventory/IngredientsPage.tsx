import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ArchiveIcon, ArrowCounterClockwiseIcon, LockIcon, PackageIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react';
import {
  INGREDIENT_KINDS, INVENTORY_DIMENSIONS, INVENTORY_ERROR_CODES, INVENTORY_LIMITS,
  type Ingredient, type IngredientKind, type InventoryDimension, type BaseUnit,
} from '@bilhanah/contracts';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { CompactMeta } from '../../components/CompactMeta';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Dialog } from '../../components/Dialog';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Field } from '../../components/Field';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { isApiError } from '../../lib/api';
import { inventoryApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { applyServerIssues, schemaResolver } from '../../lib/forms';
import { useLanguage, usePageTitle } from '../../lib/language';
import { Chips, matchesIngredient, SearchBox } from './controls';
import { compileRecipe, emptyRecipeDraft, RecipeLinesEditor, toRecipeDrafts, type RecipeDraft } from './RecipeLines';
import { inventoryKeys, useInventoryActions, useInventoryFormat, useStockBranch } from './shared';
import { levelUnit } from './StockPage';
import { costPerBase, costPerDisplayUnit, egpInput, fromBaseInput, parseEgp, parseQuantity, toBase } from './units';

const BASE_OF: Record<InventoryDimension, BaseUnit> = { MASS: 'g', VOLUME: 'ml', COUNT: 'pcs' };
const DIMENSION_LABELS: Record<InventoryDimension, [string, string]> = { MASS: ['بالوزن (جرام / كيلو)', 'By weight (g / kg)'], VOLUME: ['بالحجم (مللي / لتر)', 'By volume (ml / l)'], COUNT: ['بالعدد (قطعة)', 'By count (pieces)'] };
const KIND_TEXT: Record<IngredientKind, { label: [string, string]; hint: [string, string] }> = {
  RAW: { label: ['خامة بتتشترى', 'Bought'], hint: ['بتتشترى وبتتخزن: رز، زيت، علب.', 'Bought and stocked: rice, oil, boxes.'] },
  PREPARED: { label: ['تحضير في المطبخ', 'Made in-house'], hint: ['بيتعمل من خامات تانية بوصفة: صلصة، دقة. مالوش مخزون لوحده.', 'Made from other ingredients by a recipe: sauce, dressing. Holds no stock itself.'] },
};

/** The ingredient catalogue: raw and prepared ingredients, units, standard cost, supplier and default reorder point. */
export function InventoryIngredientsPage() {
  const { text } = useLanguage();
  usePageTitle('الخامات', 'Ingredients');
  const format = useInventoryFormat();
  const actions = useInventoryActions();
  const toast = useToast();
  const queryClient = useQueryClient();
  const page = useStockBranch();
  const branchId = page.branchId;
  const [archived, setArchived] = useState(false);
  const ingredients = useQuery({ queryKey: inventoryKeys.ingredients(branchId, archived), queryFn: () => inventoryApi.ingredients({ branchId, includeInactive: archived }) });
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'all' | IngredientKind>('all');
  const [editing, setEditing] = useState<Ingredient | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Ingredient | null>(null);
  const list = ingredients.data ?? [];
  const shown = list.filter(ingredient => matchesIngredient(ingredient, search) && (kind === 'all' || ingredient.kind === kind));
  const archive = useMutation({
    mutationFn: (ingredient: Ingredient) => inventoryApi.updateIngredient(ingredient.id, { isActive: !ingredient.isActive }),
    onSuccess: saved => { void queryClient.invalidateQueries({ queryKey: inventoryKeys.all }); toast.success(saved.isActive ? text('الخامة رجعت', 'Ingredient restored') : text('الخامة اتأرشفت', 'Ingredient archived')); },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  const remove = useMutation({
    mutationFn: (ingredient: Ingredient) => inventoryApi.deleteIngredient(ingredient.id),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: inventoryKeys.all }); toast.success(text('الخامة اتمسحت', 'Ingredient deleted')); setDeleting(null); },
    onError: failure => { toast.error(errorMessage(failure, text)); setDeleting(null); },
  });
  return <>
    <div className="inv-toolbar">
      <SearchBox value={search} onChange={setSearch} label={text('دوّر على خامة', 'Search ingredients')} />
      <Chips value={kind} onChange={setKind} label={text('النوع', 'Kind')} options={[
        { value: 'all', label: text('الكل', 'All') }, { value: 'RAW', label: text('خامات', 'Raw') }, { value: 'PREPARED', label: text('تحضيرات', 'Prepared') },
      ]} />
      <label className="check-row inv-check"><input type="checkbox" checked={archived} onChange={event => setArchived(event.target.checked)} /><span>{text('اعرض المتأرشف', 'Show archived')}</span></label>
      {actions.manage && <Button onClick={() => setEditing('new')} icon={<PlusIcon size={17} weight="bold" aria-hidden="true" />} data-testid="new-ingredient">{text('خامة جديدة', 'New ingredient')}</Button>}
    </div>
    <section className="card list-card" aria-labelledby="ingredients-title">
      <h2 id="ingredients-title" className="visually-hidden">{text('الخامات', 'Ingredients')}</h2>
      {ingredients.isError && <ErrorPanel error={ingredients.error} onRetry={() => void ingredients.refetch()} />}
      {ingredients.isPending && <div className="table-skeleton">{[0, 1, 2].map(index => <Skeleton key={index} height={48} />)}</div>}
      {ingredients.data && shown.length === 0 && <div className="empty-state"><span className="empty-state-icon" aria-hidden="true"><PackageIcon size={30} /></span>
        <h2>{list.length === 0 ? text('مفيش خامات لسه', 'No ingredients yet') : text('مفيش خامات بالفلتر ده', 'No ingredients match')}</h2>
        {list.length === 0 && <p>{text('ابدأ بالحاجات اللي بتشتريها كل أسبوع، ووحداتها (كيلو، شوال، كرتونة).', 'Start with what you buy every week, and its units (kilo, sack, carton).')}</p>}
      </div>}
      {shown.length > 0 && <div className="table-scroll"><table className="data-table inv-table" data-testid="ingredients-table">
        <thead><tr>
          <th scope="col">{text('الخامة', 'Ingredient')}</th><th scope="col">{text('النوع', 'Kind')}</th><th scope="col">{text('وحدات الشراء', 'Purchase units')}</th>
          {actions.costs && <th scope="col">{text('التكلفة الحالية', 'Current cost')}</th>}<th scope="col">{text('المورد المفضل', 'Preferred supplier')}</th>
          <th scope="col">{text('مستخدمة في', 'Used in')}</th><th scope="col"><span className="visually-hidden">{text('إجراءات', 'Actions')}</span></th>
        </tr></thead>
        <tbody>{shown.map(ingredient => <tr key={ingredient.id} data-testid="ingredient-row" className={ingredient.isActive ? '' : 'is-archived'}>
          <td className="cell-primary"><bdi>{format.name(ingredient.nameAr, ingredient.nameEn)}</bdi>
            <small>{[ingredient.category, ingredient.nameEn && format.language === 'ar' ? ingredient.nameEn : null].filter(Boolean).join(' · ')}{!ingredient.isActive && ` · ${text('متأرشفة', 'Archived')}`}</small></td>
          <td className="cell-end"><span className={`badge ${ingredient.kind === 'PREPARED' ? 'badge-info' : 'badge-muted'}`}>{text(...KIND_TEXT[ingredient.kind].label)}</span></td>
          <td>{ingredient.units.length ? ingredient.units.map(unit => format.name(unit.nameAr, unit.nameEn)).join('، ') : <span className="muted">{text(...levelUnit(ingredient.baseUnit).label)}</span>}</td>
          {actions.costs && <td className="cell-nowrap">{format.unitCost(ingredient.currentCost, ingredient.baseUnit)}</td>}
          <td><bdi>{ingredient.preferredSupplier?.name ?? '—'}</bdi></td>
          <td>{ingredient.usedIn ? text(`${new Intl.NumberFormat('ar-EG').format(ingredient.usedIn)} وصفة`, `${ingredient.usedIn} recipe${ingredient.usedIn === 1 ? '' : 's'}`) : '—'}</td>
          <td className="cell-action">{actions.manage && <span className="inv-row-actions">
            <Button small variant="ghost" onClick={() => setEditing(ingredient)} icon={<PencilSimpleIcon size={15} aria-hidden="true" />} aria-label={`${text('عدّل', 'Edit')}: ${ingredient.nameAr}`}>{text('عدّل', 'Edit')}</Button>
            <Button small variant="ghost" onClick={() => archive.mutate(ingredient)} loading={archive.isPending && archive.variables?.id === ingredient.id}
              icon={ingredient.isActive ? <ArchiveIcon size={15} aria-hidden="true" /> : <ArrowCounterClockwiseIcon size={15} aria-hidden="true" />}
              aria-label={`${ingredient.isActive ? text('أرشف', 'Archive') : text('رجّع', 'Restore')}: ${ingredient.nameAr}`}>{ingredient.isActive ? text('أرشف', 'Archive') : text('رجّع', 'Restore')}</Button>
            {!ingredient.locked && <Button small variant="ghost" onClick={() => setDeleting(ingredient)} icon={<TrashIcon size={15} aria-hidden="true" />} aria-label={`${text('امسح', 'Delete')}: ${ingredient.nameAr}`} />}
          </span>}</td>
          <CompactMeta parts={[ingredient.units.map(unit => format.name(unit.nameAr, unit.nameEn)).join('، ') || null, actions.costs ? format.unitCost(ingredient.currentCost, ingredient.baseUnit) : null, ingredient.preferredSupplier ? <bdi key="s">{ingredient.preferredSupplier.name}</bdi> : null]} />
        </tr>)}</tbody>
      </table></div>}
    </section>
    {editing && <IngredientDialog ingredient={editing === 'new' ? null : editing} all={list} branchId={branchId} onClose={() => setEditing(null)} />}
    <ConfirmDialog open={Boolean(deleting)} busy={remove.isPending} onCancel={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting)}
      title={text('تمسح الخامة؟', 'Delete this ingredient?')} confirmLabel={text('امسح', 'Delete')}
      description={text('لو الخامة ليها حركة في المخزون مش هتتمسح، وتقدر تأرشفها بدل كده.', 'An ingredient with stock movements cannot be deleted; archive it instead.')} />
  </>;
}

const formSchema = z.object({
  nameAr: z.string().trim().min(1).max(INVENTORY_LIMITS.nameLength),
  nameEn: z.string().trim().max(INVENTORY_LIMITS.nameLength),
  category: z.string().trim().max(40),
  kind: z.enum(INGREDIENT_KINDS),
  dimension: z.enum(INVENTORY_DIMENSIONS),
  standardCost: z.string().refine(value => !value.trim() || parseEgp(value, 2) !== null, '@@price'),
  preferredSupplierId: z.string(),
  defaultReorderPoint: z.string().refine(value => !value.trim() || parseQuantity(value) !== null, '@@invalid'),
});
type FormValues = z.infer<typeof formSchema>;
const FIELDS = ['nameAr', 'nameEn', 'category', 'kind', 'dimension', 'standardCost', 'preferredSupplierId', 'defaultReorderPoint'] as const;

type UnitDraft = { key: string; id?: string; nameAr: string; nameEn: string; amount: string };
let unitCounter = 0;
const unitKey = () => `unit-${++unitCounter}`;

/** Adding or editing an ingredient: its names, how it is measured, purchase units, standard cost, supplier, default reorder point, and (prepared) its recipe and yield. */
function IngredientDialog({ ingredient, all, branchId, onClose }: { ingredient: Ingredient | null; all: Ingredient[]; branchId: string | null; onClose: () => void }) {
  const { text } = useLanguage();
  const format = useInventoryFormat();
  const actions = useInventoryActions();
  const toast = useToast();
  const queryClient = useQueryClient();
  const suppliers = useQuery({ queryKey: inventoryKeys.suppliers, queryFn: inventoryApi.suppliers });
  const catalogue = useQuery({ queryKey: inventoryKeys.ingredients(branchId), queryFn: () => inventoryApi.ingredients({ branchId }) });
  const categories = useMemo(() => [...new Set(all.map(entry => entry.category).filter((value): value is string => Boolean(value)))], [all]);
  const startUnit = levelUnit(ingredient?.baseUnit ?? 'g');
  const { register, handleSubmit, watch, setError, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: schemaResolver(formSchema),
    defaultValues: {
      nameAr: ingredient?.nameAr ?? '', nameEn: ingredient?.nameEn ?? '', category: ingredient?.category ?? '', kind: ingredient?.kind ?? 'RAW', dimension: ingredient?.dimension ?? 'MASS',
      standardCost: ingredient?.standardCost === null || !ingredient ? '' : egpInput(costPerDisplayUnit(ingredient.standardCost, ingredient.baseUnit).piastres),
      preferredSupplierId: ingredient?.preferredSupplier?.id ?? '', defaultReorderPoint: fromBaseInput(ingredient?.defaultReorderPoint, startUnit.factor),
    },
  });
  const kind = watch('kind');
  const dimension = watch('dimension');
  const baseUnit = BASE_OF[dimension];
  const unit = levelUnit(baseUnit);
  const [units, setUnits] = useState<UnitDraft[]>(() => (ingredient?.units ?? []).map(entry => ({ key: unitKey(), id: entry.id, nameAr: entry.nameAr, nameEn: entry.nameEn ?? '', amount: fromBaseInput(entry.factor, levelUnit(ingredient!.baseUnit).factor) })));
  const [recipe, setRecipe] = useState<RecipeDraft[]>(() => (ingredient?.recipe.length ? toRecipeDrafts(ingredient.recipe) : [emptyRecipeDraft()]));
  const [yieldText, setYieldText] = useState(() => fromBaseInput(ingredient?.yieldQuantity, startUnit.factor));
  const [problem, setProblem] = useState<string | null>(null);
  // The API's own rule (history or recipes), so the form never offers a change it would refuse.
  const locked = Boolean(ingredient?.locked);
  const lockHint = ingredient?.lockReason === 'HISTORY'
    ? text('مقفولة لأن الخامة ليها حركة في المخزون (مشتريات، هالك، جرد أو تحويل).', 'Locked: the ingredient has stock history (deliveries, waste, counts or transfers).')
    : ingredient?.lockReason === 'RECIPES'
      ? text('مقفولة لأن الخامة مستخدمة في وصفة. شيلها من الوصفات الأول عشان تغيّرها.', 'Locked: the ingredient is used in a recipe. Remove it from its recipes to change this.')
      : undefined;
  const unitBodies = units.filter(entry => entry.nameAr.trim() || entry.amount.trim()).map(entry => {
    const amount = parseQuantity(entry.amount);
    return { draft: entry, body: entry.nameAr.trim() && amount ? { nameAr: entry.nameAr.trim(), nameEn: entry.nameEn.trim() || null, factor: toBase(amount, unit.factor) } : null };
  });
  const list = catalogue.data ?? all;
  const compiled = compileRecipe(recipe, list);
  const yieldBase = yieldText.trim() ? (parseQuantity(yieldText) === null ? null : toBase(parseQuantity(yieldText)!, unit.factor)) : null;
  const costMap = new Map(list.map(entry => [entry.id, entry.currentCost]));
  const submit = handleSubmit(async values => {
    setProblem(null);
    if (unitBodies.some(entry => !entry.body)) { setProblem(text('كل وحدة محتاجة اسم وكمية.', 'Each unit needs a name and an amount.')); return; }
    if (values.kind === 'PREPARED' && (compiled.invalid.size || compiled.duplicate.size)) { setProblem(text('في سطر في الوصفة محتاج يتراجع.', 'A recipe line needs your attention.')); return; }
    if (values.kind === 'PREPARED' && compiled.lines.length && (!yieldBase || yieldBase <= 0)) { setProblem(text('اكتب الوصفة بتطلّع قد إيه.', 'Give how much the recipe makes.')); return; }
    const cost = values.standardCost.trim() ? costPerBase(parseEgp(values.standardCost, 2)!, BASE_OF[values.dimension]) : null;
    const reorder = values.defaultReorderPoint.trim() ? toBase(parseQuantity(values.defaultReorderPoint)!, levelUnit(BASE_OF[values.dimension]).factor) : null;
    const basics = {
      nameAr: values.nameAr.trim(), nameEn: values.nameEn.trim() || null, category: values.category.trim() || null,
      standardCost: cost, preferredSupplierId: values.preferredSupplierId || null, defaultReorderPoint: reorder,
    };
    const unitList = unitBodies.map(entry => entry.body!);
    try {
      let saved: Ingredient;
      if (!ingredient) {
        saved = await inventoryApi.createIngredient({ ...basics, kind: values.kind, dimension: values.dimension, units: unitList });
      } else {
        saved = await inventoryApi.updateIngredient(ingredient.id, {
          ...basics, ...(values.kind !== ingredient.kind && { kind: values.kind }), ...(values.dimension !== ingredient.dimension && { dimension: values.dimension }),
        });
        const before = JSON.stringify(ingredient.units.map(entry => [entry.nameAr, entry.nameEn, entry.factor]));
        if (JSON.stringify(unitList.map(entry => [entry.nameAr, entry.nameEn, entry.factor])) !== before) saved = await inventoryApi.setUnits(ingredient.id, { units: unitList });
      }
      if (values.kind === 'PREPARED') {
        const before = JSON.stringify([ingredient?.yieldQuantity ?? null, (ingredient?.recipe ?? []).map(line => [line.ingredientId, line.quantity, line.wastePercent])]);
        const after = JSON.stringify([compiled.lines.length ? yieldBase : null, compiled.lines.map(line => [line.ingredientId, line.quantity, line.wastePercent])]);
        if (before !== after) saved = await inventoryApi.setPreparedRecipe(saved.id, { yieldQuantity: compiled.lines.length ? yieldBase : null, lines: compiled.lines });
      }
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      toast.success(ingredient ? text('اتحفظت الخامة', 'Ingredient saved') : text('الخامة اتضافت', 'Ingredient added'));
      onClose();
      return saved;
    } catch (failure) {
      if (isApiError(failure, INVENTORY_ERROR_CODES.INGREDIENT_NAME_TAKEN)) setError('nameAr', { type: 'server', message: text('في خامة تانية بنفس الاسم.', 'Another ingredient has this name.') });
      else if (!applyServerIssues<FormValues>(failure, setError as never, FIELDS)) setProblem(errorMessage(failure, text));
      return undefined;
    }
  });
  const updateUnit = (key: string, change: Partial<UnitDraft>) => setUnits(current => current.map(entry => (entry.key === key ? { ...entry, ...change } : entry)));
  return <Dialog open onClose={onClose} size="wide" busy={isSubmitting} onSubmit={() => void submit()} title={ingredient ? <>{text('تعديل ', 'Edit ')}<bdi>{ingredient.nameAr}</bdi></> : text('خامة جديدة', 'New ingredient')}
    footer={<><Button variant="secondary" onClick={onClose} disabled={isSubmitting}>{text('إلغاء', 'Cancel')}</Button><Button type="submit" loading={isSubmitting} data-testid="ingredient-save">{text('احفظ', 'Save')}</Button></>}>
    <div className="inv-form">
      <div className="form-grid">
        <Field label={text('الاسم بالعربي', 'Arabic name')} error={errors.nameAr} required><input className="input" maxLength={INVENTORY_LIMITS.nameLength} data-autofocus {...register('nameAr')} /></Field>
        <Field label={text('الاسم بالإنجليزي', 'English name')} error={errors.nameEn} optional><input className="input" dir="auto" maxLength={INVENTORY_LIMITS.nameLength} {...register('nameEn')} /></Field>
        <Field label={text('القسم', 'Category')} error={errors.category} optional hint={text('زي خضار، ألبان، تغليف. بيجمّع المخزون والتقييم.', 'Such as vegetables, dairy, packaging. Groups stock and valuation.')}>
          <input className="input" list="ingredient-categories" maxLength={40} {...register('category')} />
        </Field>
        <datalist id="ingredient-categories">{categories.map(entry => <option key={entry} value={entry} />)}</datalist>
        <Field label={text('بتتقاس إزاي', 'Measured')} error={errors.dimension} hint={lockHint}>
          {locked ? <output className="input inv-static" data-testid="ingredient-dimension-locked"><LockIcon size={14} aria-hidden="true" /> {text(...DIMENSION_LABELS[dimension])}</output>
            : <select className="select" {...register('dimension')}>{INVENTORY_DIMENSIONS.map(value => <option key={value} value={value}>{text(...DIMENSION_LABELS[value])}</option>)}</select>}
        </Field>
      </div>
      <fieldset className="field">
        <legend className="field-label">{text('النوع', 'Kind')}{locked && <LockIcon size={14} aria-hidden="true" />}</legend>
        <div className="order-types inv-choice-cards">
          {INGREDIENT_KINDS.filter(value => !locked || value === kind).map(value => <label key={value} className={`order-type ${kind === value ? 'is-checked' : ''}`}>
            {!locked && <input type="radio" value={value} {...register('kind')} />}
            <span><strong>{text(...KIND_TEXT[value].label)}</strong><small>{text(...KIND_TEXT[value].hint)}</small></span>
          </label>)}
        </div>
      </fieldset>
      <div className="form-grid">
        {actions.costs && <Field label={text(`التكلفة القياسية (ج.م لكل ${text(...unit.label)})`, `Standard cost (EGP per ${unit.label[1]})`)} error={errors.standardCost} optional
          hint={text('بتستخدم لحد ما الفرع يستلم الخامة، أو دايمًا لو التقييم بالتكلفة القياسية.', 'Used until a branch has received it, or always with standard-cost valuation.')}>
          <input className="input ltr" inputMode="decimal" {...register('standardCost')} />
        </Field>}
        <Field label={text('المورد المفضل', 'Preferred supplier')} error={errors.preferredSupplierId} optional hint={text('تقرير الطلب بيجمّع الخامات حسب المورد ده.', 'The reorder report groups ingredients by this supplier.')}>
          <select className="select" {...register('preferredSupplierId')}>
            <option value="">{text('من غير', 'None')}</option>
            {suppliers.data?.filter(supplier => supplier.isActive || supplier.id === ingredient?.preferredSupplier?.id).map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
          </select>
        </Field>
        {kind === 'RAW' && <Field label={text(`حد الطلب الافتراضي (${text(...unit.label)})`, `Default reorder point (${unit.label[1]})`)} error={errors.defaultReorderPoint} optional
          hint={text('للفروع اللي ما حددتش حد طلب خاص بيها.', 'For branches that have not set their own.')}>
          <input className="input ltr" inputMode="decimal" {...register('defaultReorderPoint')} />
        </Field>}
      </div>
      {kind === 'RAW' && <fieldset className="inv-units" data-testid="ingredient-units">
        <legend className="field-label">{text('وحدات الشراء', 'Purchase units')}</legend>
        <p className="field-hint">{text(`زي «شوال ٢٥ كيلو» أو «كرتونة ٢٤». الكمية بالـ${text(...unit.label)}.`, `Such as “25 kg sack” or “carton of 24”. The amount is in ${unit.label[1]}.`)}</p>
        {units.map((entry, index) => <div key={entry.key} className="inv-unit-row">
          <input className="input" aria-label={text(`اسم الوحدة ${index + 1}`, `Unit ${index + 1} name`)} placeholder={text('الاسم', 'Name')} maxLength={40} value={entry.nameAr} onChange={event => updateUnit(entry.key, { nameAr: event.target.value })} />
          <input className="input" dir="auto" aria-label={text(`الاسم بالإنجليزي للوحدة ${index + 1}`, `Unit ${index + 1} English name`)} placeholder={text('بالإنجليزي', 'English')} maxLength={40} value={entry.nameEn} onChange={event => updateUnit(entry.key, { nameEn: event.target.value })} />
          <span className="inv-qty is-compact"><input className="input ltr" inputMode="decimal" aria-label={text(`فيها كام ${text(...unit.label)}`, `How many ${unit.label[1]}`)} value={entry.amount} onChange={event => updateUnit(entry.key, { amount: event.target.value })} />
            <span className="inv-qty-unit">{text(...unit.label)}</span></span>
          <button type="button" className="icon-button" aria-label={text(`شيل الوحدة ${index + 1}`, `Remove unit ${index + 1}`)} onClick={() => setUnits(current => current.filter(item => item.key !== entry.key))}><TrashIcon size={18} aria-hidden="true" /></button>
        </div>)}
        <Button small variant="ghost" icon={<PlusIcon size={16} weight="bold" aria-hidden="true" />} disabled={units.length >= INVENTORY_LIMITS.unitsPerIngredient}
          onClick={() => setUnits(current => [...current, { key: unitKey(), nameAr: '', nameEn: '', amount: '' }])}>{text('ضيف وحدة', 'Add a unit')}</Button>
      </fieldset>}
      {kind === 'PREPARED' && <fieldset className="inv-units" data-testid="prepared-recipe">
        <legend className="field-label">{text('الوصفة', 'Recipe')}</legend>
        <Field label={text(`الوصفة بتطلّع (${text(...unit.label)})`, `The recipe makes (${unit.label[1]})`)} hint={text('الكمية الجاهزة بعد التحضير، عشان نحسب تكلفة الكيلو منها.', 'The finished amount, so its cost per unit can be worked out.')}>
          <input className="input ltr inv-yield" inputMode="decimal" value={yieldText} onChange={event => setYieldText(event.target.value)} aria-invalid={(yieldText.trim() !== '' && yieldBase === null) || undefined} />
        </Field>
        <RecipeLinesEditor drafts={recipe} onChange={setRecipe} ingredients={list} unitCost={id => costMap.get(id) ?? null} showCosts={actions.costs} excludeId={ingredient?.id} />
        {actions.costs && yieldBase && compiled.lines.length > 0 && <PreparedCost lines={compiled.lines} yieldBase={yieldBase} baseUnit={baseUnit} costOf={id => costMap.get(id) ?? null} format={format} />}
      </fieldset>}
      {problem && <Alert kind="error">{problem}</Alert>}
    </div>
  </Dialog>;
}

function PreparedCost({ lines, yieldBase, baseUnit, costOf, format }: {
  lines: { ingredientId: string; quantity: number; wastePercent: number }[]; yieldBase: number; baseUnit: BaseUnit; costOf: (id: string) => number | null; format: ReturnType<typeof useInventoryFormat>;
}) {
  const { text } = useLanguage();
  let total = 0;
  for (const line of lines) total += (line.quantity / (1 - line.wastePercent / 100)) * (costOf(line.ingredientId) ?? 0);
  return <p className="inv-prepared-cost" aria-live="polite">{text('تكلفة الوصفة', 'Batch cost')} <strong>{format.money(total)}</strong> · {text('يعني', 'that is')} <strong>{format.unitCost(total / yieldBase, baseUnit)}</strong></p>;
}
