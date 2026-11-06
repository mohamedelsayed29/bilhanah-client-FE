import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { CookingPotIcon, PencilSimpleIcon, WarningIcon } from '@phosphor-icons/react';
import { variantRecipeSchema, type CostingRow, type Ingredient, type VariantRecipe } from '@bilhanah/contracts';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { CompactMeta } from '../../components/CompactMeta';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Dialog } from '../../components/Dialog';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { inventoryApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { contractIssues } from '../../lib/forms';
import { useLanguage, usePageTitle } from '../../lib/language';
import { PageBranchPicker } from '../branches/BranchScope';
import { Chips, Figure, ListPager, SearchBox, usePaged } from './controls';
import { arrangeCosting, costingFlag, foodCostPercent, foodCostTone, marginOf, previewRecipeCost, type CostingFilter, type CostingSort } from './costing';
import { compileRecipe, emptyRecipeDraft, RecipeLinesEditor, toRecipeDrafts, type RecipeDraft } from './RecipeLines';
import { dishLabel, inventoryKeys, useDishSizes, useInventoryActions, useInventoryFormat, useStockBranch, type DishSize } from './shared';
import { formatNumber } from './units';

/**
 * Recipes per dish size and what they cost: the whole menu's costing (food cost %, margin, dishes
 * without a recipe), and the recipe editor with a live cost against each branch's price.
 */
export function InventoryRecipesPage() {
  const { text } = useLanguage();
  usePageTitle('الوصفات والتكلفة', 'Recipes & costing');
  const actions = useInventoryActions();
  const page = useStockBranch();
  const branchId = page.branchId;
  const [params, setParams] = useSearchParams();
  const dishes = useDishSizes(branchId);
  const openItem = params.get('item');
  const openSize = params.get('size');
  const sizes = useMemo(() => (openItem && dishes.sizes ? dishes.sizes.filter(size => size.itemId === openItem) : []), [openItem, dishes.sizes]);
  const open = (itemId: string, variantId: string | null) => setParams(current => {
    const next = new URLSearchParams(current);
    next.set('item', itemId);
    if (variantId) next.set('size', variantId); else next.delete('size');
    return next;
  });
  const close = () => setParams(current => { const next = new URLSearchParams(current); next.delete('item'); next.delete('size'); return next; }, { replace: true });
  const variantId = sizes.find(size => size.variantId === openSize)?.variantId ?? sizes[0]?.variantId ?? null;
  return <>
    <PageBranchPicker page={page} />
    {actions.costs ? <CostingTable branchId={branchId} onOpen={open} /> : <DishList dishes={dishes} canEdit={actions.manage} onOpen={open} />}
    {variantId && branchId && <RecipeEditorDialog key={variantId} variantId={variantId} branchId={branchId} sizes={sizes} onSize={id => open(openItem!, id)} onClose={close} />}
  </>;
}

function CostingTable({ branchId, onOpen }: { branchId: string | null; onOpen: (itemId: string, variantId: string) => void }) {
  const { text } = useLanguage();
  const format = useInventoryFormat();
  const actions = useInventoryActions();
  const costing = useQuery({ queryKey: inventoryKeys.costing(branchId), queryFn: () => inventoryApi.costing(branchId), enabled: Boolean(branchId), placeholderData: keepPreviousData });
  const [filter, setFilter] = useState<CostingFilter>('all');
  const [sort, setSort] = useState<CostingSort>('menu');
  const [search, setSearch] = useState('');
  const rows = arrangeCosting(costing.data?.rows ?? [], filter, sort, search);
  const paged = usePaged(rows, `${filter}|${sort}|${search}`);
  if (costing.isError) return <ErrorPanel error={costing.error} onRetry={() => void costing.refetch()} />;
  if (!costing.data) return <div className="skeleton-stack"><Skeleton height={72} /><Skeleton height={320} /></div>;
  const data = costing.data;
  const missing = data.rows.filter(row => !row.hasRecipe).length;
  const incomplete = data.rows.filter(row => row.hasRecipe && row.incomplete).length;
  const high = data.rows.filter(row => foodCostTone(row.foodCostPercent) === 'high').length;
  const sortHeader = (label: string) => {
    const next: CostingSort = sort === 'foodCostDesc' ? 'foodCostAsc' : sort === 'foodCostAsc' ? 'menu' : 'foodCostDesc';
    return <button type="button" className="inv-sort" onClick={() => setSort(next)} data-testid="sort-food-cost"
      aria-label={text(`${label}: رتّب`, `${label}: sort`)}>{label} <span aria-hidden="true">{sort === 'foodCostDesc' ? '↓' : sort === 'foodCostAsc' ? '↑' : '↕'}</span></button>;
  };
  return <>
    <div className="att-kpis is-compact" data-testid="costing-summary">
      <Figure label={text('أحجام في المنيو', 'Dish sizes')} value={formatNumber(data.summary.sizes, format.language)} />
      <Figure label={text('ليها وصفة', 'With a recipe')} value={formatNumber(data.summary.withRecipe, format.language)} tone={data.summary.withRecipe === data.summary.sizes ? 'success' : 'guava'} />
      <Figure label={text('متوسط تكلفة الأكل', 'Average food cost')} value={format.percent(data.summary.averageFoodCostPercent)} tone="info"
        hint={text('الهدف عادةً حوالي ٣٠٪', 'A usual target is about 30%')} />
    </div>
    <div className="inv-toolbar">
      <SearchBox value={search} onChange={setSearch} label={text('دوّر على طبق', 'Search dishes')} />
      <Chips value={filter} onChange={setFilter} label={text('فلتر', 'Filter')} options={[
        { value: 'all', label: text('الكل', 'All') },
        { value: 'missing', label: text('من غير وصفة', 'No recipe'), count: missing },
        { value: 'incomplete', label: text('ناقصة تكلفة', 'Incomplete'), count: incomplete },
        { value: 'high', label: text('تكلفة عالية', 'High food cost'), count: high },
      ]} />
      <select className="select inv-sort-select" aria-label={text('الترتيب', 'Sort')} value={sort} onChange={event => setSort(event.target.value as CostingSort)}>
        <option value="menu">{text('ترتيب المنيو', 'Menu order')}</option>
        <option value="foodCostDesc">{text('تكلفة الأكل: الأعلى الأول', 'Food cost: highest first')}</option>
        <option value="foodCostAsc">{text('تكلفة الأكل: الأقل الأول', 'Food cost: lowest first')}</option>
        <option value="marginAsc">{text('المكسب: الأقل الأول', 'Margin: lowest first')}</option>
      </select>
    </div>
    <section className="card list-card" aria-labelledby="costing-title">
      <h2 id="costing-title" className="visually-hidden">{text('تكلفة المنيو', 'Menu costing')}</h2>
      {rows.length === 0 ? <div className="empty-state"><span className="empty-state-icon" aria-hidden="true"><CookingPotIcon size={30} /></span>
        <h2>{text('مفيش أطباق بالفلتر ده', 'No dishes match')}</h2></div>
        : <div className="table-scroll"><table className="data-table inv-table" data-testid="costing-table">
          <thead><tr>
            <th scope="col">{text('الطبق', 'Dish')}</th>
            <th scope="col">{text('السعر', 'Price')}</th>
            <th scope="col">{text('تكلفة الوصفة', 'Recipe cost')}</th>
            <th scope="col" aria-sort={sort === 'foodCostDesc' ? 'descending' : sort === 'foodCostAsc' ? 'ascending' : 'none'}>{sortHeader(text('تكلفة الأكل', 'Food cost'))}</th>
            <th scope="col">{text('المكسب', 'Margin')}</th>
            <th scope="col"><span className="visually-hidden">{text('الوصفة', 'Recipe')}</span></th>
          </tr></thead>
          <tbody>{paged.items.map(row => <CostingRowView key={row.variantId} row={row} canEdit={actions.manage} onOpen={() => onOpen(row.itemId, row.variantId)} />)}</tbody>
        </table></div>}
      <ListPager paged={paged} noun={['طبق', 'dishes']} label={text('صفحات الأطباق', 'Dish pages')} />
    </section>
  </>;
}

function CostingRowView({ row, canEdit, onOpen }: { row: CostingRow; canEdit: boolean; onOpen: () => void }) {
  const { text } = useLanguage();
  const format = useInventoryFormat();
  const flag = costingFlag(row);
  const tone = foodCostTone(row.foodCostPercent);
  const name = dishLabel(row, format.language);
  return <tr data-testid="costing-row" data-variant={row.variantId} data-name={row.itemNameEn ?? row.itemNameAr}>
    <td className="cell-primary"><bdi>{name}</bdi><small>{row.categoryNameAr}</small></td>
    <td className="cell-nowrap">{format.money(row.pricePiastres)}</td>
    <td className="cell-nowrap" data-testid="costing-cost">{row.recipeCost === null ? '—' : format.money(row.recipeCost)}</td>
    <td className="cell-end cell-nowrap">
      {flag === 'NO_RECIPE' ? <span className="badge badge-guava">{text('من غير وصفة', 'No recipe')}</span> : <span className={`inv-fc tone-${tone}`} data-testid="costing-percent">
        <span className="inv-fc-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, row.foodCostPercent ?? 0)}%` }} /></span>
        <strong>{format.percent(row.foodCostPercent)}</strong>
      </span>}
      {flag === 'INCOMPLETE' && <small className="inv-flag"><WarningIcon size={13} aria-hidden="true" /> {text('ناقصة تكلفة', 'Incomplete')}</small>}
    </td>
    <td className="cell-nowrap">{row.marginPiastres === null ? '—' : format.money(row.marginPiastres)}</td>
    <td className="cell-action">
      <Button small variant={flag === 'NO_RECIPE' ? 'secondary' : 'ghost'} onClick={onOpen} icon={<PencilSimpleIcon size={15} aria-hidden="true" />} aria-label={`${canEdit ? text('عدّل الوصفة', 'Edit recipe') : text('شوف الوصفة', 'View recipe')}: ${name}`}>
        {canEdit ? (flag === 'NO_RECIPE' ? text('اكتب الوصفة', 'Add recipe') : text('عدّل', 'Edit')) : text('شوف', 'View')}
      </Button>
    </td>
    <CompactMeta parts={[format.money(row.pricePiastres), row.recipeCost === null ? null : `${text('تكلفة', 'cost')} ${format.money(row.recipeCost)}`, row.marginPiastres === null ? null : `${text('مكسب', 'margin')} ${format.money(row.marginPiastres)}`]} />
  </tr>;
}

/**
 * Without inventory.costs: every dish size with its recipe's ingredients (GET /inventory/dishes, no
 * costs), to read the recipes (and write them, with inventory.manage).
 */
function DishList({ dishes, canEdit, onOpen }: { dishes: ReturnType<typeof useDishSizes>; canEdit: boolean; onOpen: (itemId: string, variantId: string) => void }) {
  const { text } = useLanguage();
  const format = useInventoryFormat();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'missing'>('all');
  const sizes = dishes.sizes ?? [];
  const needle = search.trim().toLowerCase();
  const shown = sizes.filter(size => (filter === 'all' || !size.hasRecipe)
    && (!needle || [size.itemNameAr, size.itemNameEn, size.variantNameAr, size.variantNameEn].some(value => value?.toLowerCase().includes(needle))));
  const paged = usePaged(shown, `${filter}|${needle}`);
  if (dishes.error) return <ErrorPanel error={dishes.error} onRetry={dishes.retry} />;
  if (dishes.pending || !dishes.sizes) return <Skeleton height={240} />;
  const missing = sizes.filter(size => !size.hasRecipe).length;
  return <>
    <div className="inv-toolbar">
      <SearchBox value={search} onChange={setSearch} label={text('دوّر على طبق', 'Search dishes')} />
      <Chips value={filter} onChange={setFilter} label={text('فلتر', 'Filter')} options={[
        { value: 'all', label: text('الكل', 'All') },
        { value: 'missing', label: text('من غير وصفة', 'No recipe'), count: missing },
      ]} />
    </div>
    <section className="card list-card" aria-label={text('الأطباق', 'Dishes')}>
      {shown.length === 0 ? <div className="empty-state"><span className="empty-state-icon" aria-hidden="true"><CookingPotIcon size={30} /></span>
        <h2>{sizes.length === 0 ? text('مفيش أطباق في المنيو لسه', 'No dishes on the menu yet') : text('مفيش أطباق بالفلتر ده', 'No dishes match')}</h2></div>
        : <ul className="inv-dish-list" data-testid="dish-list">{paged.items.map(size => {
          const name = dishLabel(size, format.language);
          return <li key={size.variantId} data-testid="dish-row" data-variant={size.variantId}>
            <span><bdi>{name}</bdi>
              <small className="muted">{format.name(size.categoryNameAr, size.categoryNameEn)}{size.hasRecipe
                ? ` · ${size.lines.map(line => format.name(line.nameAr, line.nameEn)).join(text('، ', ', '))}`
                : ''}</small>
            </span>
            <div className="inv-dish-end">
              {!size.hasRecipe && <span className="badge badge-guava">{text('من غير وصفة', 'No recipe')}</span>}
              {(size.hasRecipe || canEdit) && <Button small variant="ghost" onClick={() => onOpen(size.itemId, size.variantId)} aria-label={`${canEdit ? text('عدّل الوصفة', 'Edit recipe') : text('شوف الوصفة', 'View recipe')}: ${name}`}>
                {canEdit ? (size.hasRecipe ? text('عدّل', 'Edit') : text('اكتب الوصفة', 'Add recipe')) : text('شوف الوصفة', 'View recipe')}
              </Button>}
            </div>
          </li>;
        })}</ul>}
      <ListPager paged={paged} noun={['طبق', 'dishes']} label={text('صفحات الأطباق', 'Dish pages')} />
    </section>
  </>;
}

/** Unit costs (piastres per base unit) at a branch, from its ingredient list. */
const costMap = (ingredients: readonly Ingredient[] | undefined) => new Map((ingredients ?? []).map(ingredient => [ingredient.id, ingredient.currentCost]));

/** One dish size's recipe: its lines, and its cost at every branch against that branch's price, live while editing. */
function RecipeEditorDialog({ variantId, branchId, sizes, onSize, onClose }: { variantId: string; branchId: string; sizes: DishSize[]; onSize: (variantId: string) => void; onClose: () => void }) {
  const { text } = useLanguage();
  const format = useInventoryFormat();
  const actions = useInventoryActions();
  const toast = useToast();
  const queryClient = useQueryClient();
  const recipe = useQuery({ queryKey: inventoryKeys.recipe(variantId, branchId), queryFn: () => inventoryApi.variantRecipe(variantId, branchId) });
  const ingredients = useQuery({ queryKey: inventoryKeys.ingredients(branchId), queryFn: () => inventoryApi.ingredients({ branchId }) });
  const branchIds = recipe.data?.costs?.map(entry => entry.branchId) ?? [];
  const branchIngredients = useQueries({
    queries: branchIds.map(id => ({ queryKey: inventoryKeys.ingredients(id), queryFn: () => inventoryApi.ingredients({ branchId: id }), enabled: actions.costs })),
  });
  const [drafts, setDrafts] = useState<RecipeDraft[] | null>(null);
  const [initial, setInitial] = useState('');
  const [removing, setRemoving] = useState(false);
  const [pendingSize, setPendingSize] = useState<string | null>(null);
  useEffect(() => {
    if (!recipe.data || drafts) return;
    const lines = toRecipeDrafts(recipe.data.lines);
    setDrafts(lines.length ? lines : [emptyRecipeDraft()]);
    setInitial(JSON.stringify(recipe.data.lines.map(line => [line.ingredientId, line.quantity, line.wastePercent])));
  }, [recipe.data, drafts]);
  const list = ingredients.data ?? [];
  const compiled = drafts ? compileRecipe(drafts, list) : null;
  const dirty = compiled ? JSON.stringify(compiled.lines.map(line => [line.ingredientId, line.quantity, line.wastePercent])) !== initial : false;
  const here = costMap(ingredients.data);
  const save = useMutation({
    mutationFn: (lines: { ingredientId: string; quantity: number; wastePercent: number }[]) => inventoryApi.setVariantRecipe(variantId, { lines }),
    onSuccess: (saved: VariantRecipe) => {
      queryClient.setQueryData(inventoryKeys.recipe(variantId, branchId), saved);
      void queryClient.invalidateQueries({ queryKey: ['inventory', 'costing'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory', 'dishes'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory', 'recipe'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory', 'ingredients'] });
      const cost = saved.costs?.find(entry => entry.branchId === branchId);
      toast.success(saved.lines.length === 0 ? text('اتشالت الوصفة', 'Recipe removed')
        : cost ? text(`اتحفظت الوصفة · التكلفة ${format.money(cost.cost)} (${format.percent(cost.foodCostPercent)})`, `Recipe saved · cost ${format.money(cost.cost)} (${format.percent(cost.foodCostPercent)})`)
          : text('اتحفظت الوصفة', 'Recipe saved'));
      setRemoving(false);
      onClose();
    },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  const title = recipe.data ? dishLabel({ itemNameAr: recipe.data.itemNameAr, itemNameEn: recipe.data.itemNameEn, variantNameAr: recipe.data.variantNameAr, variantNameEn: recipe.data.variantNameEn }, format.language) : text('الوصفة', 'Recipe');
  const submit = () => {
    if (!compiled || compiled.invalid.size || compiled.duplicate.size) return;
    if (contractIssues(variantRecipeSchema, { lines: compiled.lines }).length) { toast.error(text('في سطر محتاج يتراجع.', 'A line needs your attention.')); return; }
    save.mutate(compiled.lines);
  };
  const switchSize = (id: string) => { if (dirty) setPendingSize(id); else onSize(id); };
  const readOnly = !actions.manage;
  return <Dialog open onClose={onClose} size="wide" busy={save.isPending} onSubmit={readOnly ? undefined : submit}
    title={<><span className="muted inv-dialog-kicker">{text('وصفة', 'Recipe')}</span> <bdi>{title}</bdi></>}
    footer={readOnly ? <Button variant="secondary" onClick={onClose}>{text('إغلاق', 'Close')}</Button> : <>
      {recipe.data && recipe.data.lines.length > 0 && <Button variant="danger-outline" className="spacer" onClick={() => setRemoving(true)} disabled={save.isPending}>{text('شيل الوصفة', 'Remove recipe')}</Button>}
      <Button variant="secondary" onClick={onClose} disabled={save.isPending}>{text('إلغاء', 'Cancel')}</Button>
      <Button type="submit" loading={save.isPending} disabled={!dirty || Boolean(compiled?.invalid.size || compiled?.duplicate.size)} data-testid="recipe-save">{text('احفظ الوصفة', 'Save recipe')}</Button>
    </>}>
    {sizes.length > 1 && <div className="segmented inv-size-switch" role="radiogroup" aria-label={text('الحجم', 'Size')}>
      {sizes.map(size => <label key={size.variantId}>
        <input type="radio" name="recipe-size" checked={size.variantId === variantId} onChange={() => switchSize(size.variantId)} />
        {format.name(size.variantNameAr, size.variantNameEn) || text('الحجم', 'Size')}
      </label>)}
    </div>}
    {(recipe.isError || ingredients.isError) && <ErrorPanel error={recipe.error ?? ingredients.error} onRetry={() => { void recipe.refetch(); void ingredients.refetch(); }} />}
    {(!drafts || !ingredients.data) && !recipe.isError && <div className="skeleton-stack"><Skeleton height={44} /><Skeleton height={44} /><Skeleton height={44} /></div>}
    {drafts && ingredients.data && <>
      {!readOnly && list.length === 0 && <Alert kind="info" live={false}>{text('ضيف خامات الأول من صفحة الخامات.', 'Add ingredients first on the ingredients page.')}</Alert>}
      <RecipeLinesEditor drafts={drafts} onChange={setDrafts} ingredients={list} unitCost={id => here.get(id) ?? null} showCosts={actions.costs} readOnly={readOnly} />
      {actions.costs && compiled && recipe.data?.costs && <BranchCosts recipe={recipe.data} lines={compiled.lines} branchMaps={branchIds.map((id, index) => [id, costMap(branchIngredients[index]?.data)] as const)} />}
      {!actions.costs && <p className="muted">{text('التكاليف ظاهرة بس لأصحاب صلاحية التكاليف.', 'Costs are shown only with the costs permission.')}</p>}
    </>}
    <ConfirmDialog open={removing} busy={save.isPending} onCancel={() => setRemoving(false)} onConfirm={() => save.mutate([])}
      title={text('تشيل الوصفة؟', 'Remove this recipe?')} confirmLabel={text('شيلها', 'Remove')}
      description={text('الطبق ده مش هيخصم من المخزون لما يتباع، ومش هيبان له تكلفة.', 'Sales of this dish will no longer take stock out, and it will have no cost.')} />
    <ConfirmDialog open={pendingSize !== null} tone="primary" onCancel={() => setPendingSize(null)} onConfirm={() => { const id = pendingSize!; setPendingSize(null); onSize(id); }}
      title={text('تسيب التعديلات؟', 'Discard your changes?')} confirmLabel={text('سيبها', 'Discard')}
      description={text('التعديلات على الحجم ده مش هتتحفظ.', 'Your changes to this size will not be saved.')} />
  </Dialog>;
}

/** The recipe's cost at each branch, with that branch's own price, recalculated as lines change. */
function BranchCosts({ recipe, lines, branchMaps }: { recipe: VariantRecipe; lines: { ingredientId: string; quantity: number; wastePercent: number }[]; branchMaps: (readonly [string, Map<string, number | null>])[] }) {
  const { text } = useLanguage();
  const format = useInventoryFormat();
  const maps = new Map(branchMaps);
  return <div className="inv-branch-costs" data-testid="recipe-costs" aria-live="polite">
    <h3>{text('التكلفة والمكسب في كل فرع', 'Cost and margin at each branch')}</h3>
    <div className="table-scroll"><table className="data-table inv-table is-plain">
      <thead><tr><th scope="col">{text('الفرع', 'Branch')}</th><th scope="col">{text('السعر', 'Price')}</th><th scope="col">{text('تكلفة الوصفة', 'Recipe cost')}</th><th scope="col">{text('تكلفة الأكل', 'Food cost')}</th><th scope="col">{text('المكسب', 'Margin')}</th></tr></thead>
      <tbody>{recipe.costs!.map(entry => {
        const map = maps.get(entry.branchId);
        const preview = map ? previewRecipeCost(lines, id => map.get(id) ?? null) : null;
        const cost = preview ? preview.cost : entry.cost;
        const percent = foodCostPercent(cost, entry.pricePiastres);
        return <tr key={entry.branchId} data-testid="recipe-branch-cost">
          <td className="cell-primary"><bdi>{entry.branchName}</bdi>{preview?.incomplete && <small className="inv-flag">{text('في خامة لسه من غير تكلفة', 'An ingredient has no cost yet')}</small>}</td>
          <td className="cell-nowrap">{format.money(entry.pricePiastres)}</td>
          <td className="cell-nowrap cell-amount" data-testid="recipe-branch-cost-value">{format.money(cost)}</td>
          <td className="cell-end cell-nowrap"><span className={`inv-fc tone-${foodCostTone(percent)}`}><strong>{format.percent(percent)}</strong></span></td>
          <td className="cell-nowrap">{format.money(marginOf(cost, entry.pricePiastres))}</td>
          <CompactMeta parts={[`${text('السعر', 'price')} ${format.money(entry.pricePiastres)}`, `${text('تكلفة', 'cost')} ${format.money(cost)}`, `${text('مكسب', 'margin')} ${format.money(marginOf(cost, entry.pricePiastres))}`]} />
        </tr>;
      })}</tbody>
    </table></div>
  </div>;
}
