import { useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { MinusIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react';
import { createWasteSchema, INVENTORY_LIMITS, type WasteEntry } from '@bilhanah/contracts';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { CompactMeta } from '../../components/CompactMeta';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Field } from '../../components/Field';
import { Pagination } from '../../components/Pagination';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { inventoryApi, type WasteFilters } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { contractIssues } from '../../lib/forms';
import { useLanguage, usePageTitle } from '../../lib/language';
import { BranchPicker, useBranchScope } from '../branches/BranchScope';
import { IngredientPicker, QuantityInput } from './controls';
import { compileQty, defaultUnitKey, lineKey, lineUnits } from './doc-lines';
import { dishLabel, inventoryKeys, shiftDay, today, useDishSizes, useInventoryActions, useInventoryFormat, useInventorySettings, useListBranch } from './shared';
import { groupByCategory } from './costing';
import { formatNumber } from './units';

type WasteDraft = { key: string; kind: 'ingredient' | 'dish'; ingredientId: string | null; quantity: string; unitKey: string; variantId: string; dishes: number };
const emptyWaste = (kind: WasteDraft['kind'] = 'ingredient'): WasteDraft => ({ key: lineKey(), kind, ingredientId: null, quantity: '', unitKey: 'base', variantId: '', dishes: 1 });

/** Waste: several lines at once (ingredients in any unit, or whole dishes by their recipe) with one of the owner's reasons, and the history. */
export function InventoryWastePage() {
  usePageTitle('الهالك', 'Waste');
  const actions = useInventoryActions();
  return <>
    {actions.recordWaste && <WasteForm />}
    {actions.view && <WasteHistory />}
  </>;
}

function WasteForm() {
  const { text } = useLanguage();
  const format = useInventoryFormat();
  const toast = useToast();
  const queryClient = useQueryClient();
  const scope = useBranchScope();
  const actions = useInventoryActions();
  const settings = useInventorySettings();
  const [params, setParams] = useSearchParams();
  const card = useRef<HTMLElement>(null);
  const [branchId, setBranchId] = useState(() => (scope.selected !== 'all' ? scope.selected : null) ?? scope.choices.find(branch => branch.isMain)?.id ?? scope.branches[0]?.id ?? '');
  useEffect(() => { if (scope.selected !== 'all') setBranchId(scope.selected); }, [scope.selected]);
  const ingredients = useQuery({ queryKey: inventoryKeys.ingredients(branchId), queryFn: () => inventoryApi.ingredients({ branchId }), enabled: Boolean(branchId) });
  const dishes = useDishSizes(branchId);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<WasteDraft[]>(() => [emptyWaste()]);
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (params.get('new') !== '1') return;
    card.current?.scrollIntoView({ block: 'start' });
    card.current?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
    setParams(current => { const next = new URLSearchParams(current); next.delete('new'); return next; }, { replace: true });
  }, [params, setParams]);
  const list = ingredients.data ?? [];
  type WasteLine = { variantId: string; quantity: number } | { ingredientId: string; unitId: string | null; quantity: number };
  const compiled = lines.map((line): WasteLine | null => {
    if (line.kind === 'dish') return line.variantId ? { variantId: line.variantId, quantity: line.dishes } : null;
    const ingredient = list.find(entry => entry.id === line.ingredientId);
    const quantity = compileQty(line, ingredient);
    return ingredient && quantity ? { ingredientId: ingredient.id, unitId: quantity.unitId, quantity: quantity.quantity } : null;
  });
  const filled = lines.map((line, index) => ({ line, result: compiled[index] })).filter(({ line }) => (line.kind === 'dish' ? Boolean(line.variantId) : Boolean(line.ingredientId || line.quantity.trim())));
  const body = { branchId, reason, note: note.trim() || null, lines: filled.flatMap(entry => (entry.result ? [entry.result] : [])) };
  const valid = Boolean(reason) && filled.length > 0 && filled.every(entry => entry.result) && contractIssues(createWasteSchema, body).length === 0;
  const record = useMutation({
    mutationFn: () => inventoryApi.recordWaste(body),
    onSuccess: entry => {
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      toast.success(entry.total !== null ? text(`اتسجل الهالك (${format.money(entry.total)})`, `Waste recorded (${format.money(entry.total)})`) : text('اتسجل الهالك', 'Waste recorded'));
      setLines([emptyWaste()]); setNote(''); setTried(false);
    },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  const update = (key: string, change: Partial<WasteDraft>) => setLines(current => current.map(line => (line.key === key ? { ...line, ...change } : line)));
  const used = lines.map(line => line.ingredientId).filter((value): value is string => Boolean(value));
  // Only a size with a recipe can be wasted whole (the API refuses the others); they show, disabled.
  const categories = useMemo(() => groupByCategory(dishes.sizes ?? []), [dishes.sizes]);
  return <section ref={card} className="card inv-form-card" aria-labelledby="waste-form-title" data-testid="waste-form">
    <h2 id="waste-form-title" className="card-title">{text('سجّل هالك', 'Record waste')}</h2>
    <form className="inv-form" noValidate onSubmit={event => { event.preventDefault(); setTried(true); if (valid) record.mutate(); }}>
      {!scope.locked && scope.choices.length > 1 && scope.selected === 'all' && <BranchPicker value={branchId} onChange={setBranchId} label={text('الفرع', 'Branch')} />}
      <fieldset className="field">
        <legend className="field-label">{text('السبب', 'Reason')}</legend>
        {settings.isPending ? <Skeleton height={40} /> : <div className="inv-reasons" role="radiogroup" aria-label={text('السبب', 'Reason')}>
          {settings.data?.wasteReasons.map(option => <label key={option.code} className={`inv-reason ${reason === option.code ? 'is-checked' : ''}`}>
            <input type="radio" name="waste-reason" value={option.code} checked={reason === option.code} onChange={() => setReason(option.code)} />
            {format.name(option.nameAr, option.nameEn)}
          </label>)}
        </div>}
        {tried && !reason && <p className="field-error">{text('اختار السبب.', 'Choose a reason.')}</p>}
      </fieldset>
      <fieldset className="inv-doc-lines">
        <legend className="field-label">{text('اللي اتهدر', 'What was wasted')}</legend>
        {lines.map((line, index) => {
          const ingredient = list.find(entry => entry.id === line.ingredientId);
          const name = ingredient ? format.name(ingredient.nameAr, ingredient.nameEn) : text(`سطر ${index + 1}`, `Line ${index + 1}`);
          const invalid = tried && !compiled[index] && (line.kind === 'dish' ? !line.variantId : true) && (filled.length === 0 || filled.some(entry => entry.line.key === line.key));
          return <div key={line.key} className={`inv-doc-line is-waste ${invalid ? 'is-invalid' : ''}`} data-testid="waste-line">
            <div className="segmented inv-waste-kind" role="radiogroup" aria-label={text(`نوع السطر ${index + 1}`, `Line ${index + 1} type`)}>
              <label><input type="radio" name={`${line.key}-kind`} checked={line.kind === 'ingredient'} onChange={() => update(line.key, { kind: 'ingredient' })} />{text('خامة', 'Ingredient')}</label>
              <label><input type="radio" name={`${line.key}-kind`} checked={line.kind === 'dish'} onChange={() => update(line.key, { kind: 'dish' })} disabled={!dishes.allowed} />{text('طبق كامل', 'Whole dish')}</label>
            </div>
            {line.kind === 'ingredient' ? <>
              <IngredientPicker ingredients={list} value={line.ingredientId} exclude={used} label={text(`خامة السطر ${index + 1}`, `Ingredient, line ${index + 1}`)} invalid={invalid && !ingredient}
                onChange={picked => update(line.key, { ingredientId: picked?.id ?? null, unitKey: picked ? defaultUnitKey(picked) : 'base' })} testId="waste-ingredient" />
              <QuantityInput value={line.quantity} onValue={value => update(line.key, { quantity: value })} unitKey={line.unitKey} onUnit={key => update(line.key, { unitKey: key })}
                options={lineUnits(ingredient)} label={text(`كمية ${name}`, `Quantity of ${name}`)} invalid={invalid} testId="waste-qty" large />
            </> : <>
              <select className="select" aria-label={text(`الطبق في السطر ${index + 1}`, `Dish, line ${index + 1}`)} value={line.variantId} aria-invalid={invalid || undefined}
                onChange={event => update(line.key, { variantId: event.target.value })} data-testid="waste-dish">
                <option value="">{dishes.pending ? text('بنحمّل الأطباق…', 'Loading dishes…') : dishes.error ? text('الأطباق ما اتحمّلتش، جرّب تاني', 'Could not load the dishes, try again') : text('اختار الطبق', 'Choose the dish')}</option>
                {categories.map(category => <optgroup key={category.id} label={format.name(category.nameAr, category.nameEn)}>
                  {category.sizes.map(size => <option key={size.variantId} value={size.variantId} disabled={!size.hasRecipe}>
                    {size.hasRecipe ? dishLabel(size, format.language) : `${dishLabel(size, format.language)} (${text('من غير وصفة', 'no recipe')})`}
                  </option>)}
                </optgroup>)}
              </select>
              <div className="inv-stepper" role="group" aria-label={text('عدد الأطباق', 'Number of dishes')}>
                <button type="button" className="icon-button" aria-label={text('أقل', 'Fewer')} disabled={line.dishes <= 1} onClick={() => update(line.key, { dishes: Math.max(1, line.dishes - 1) })}><MinusIcon size={18} aria-hidden="true" /></button>
                <output aria-live="polite">{formatNumber(line.dishes, format.language)}</output>
                <button type="button" className="icon-button" aria-label={text('أكتر', 'More')} disabled={line.dishes >= 1000} onClick={() => update(line.key, { dishes: Math.min(1000, line.dishes + 1) })}><PlusIcon size={18} aria-hidden="true" /></button>
              </div>
            </>}
            <button type="button" className="icon-button" aria-label={text(`شيل السطر ${index + 1}`, `Remove line ${index + 1}`)} onClick={() => setLines(current => (current.length > 1 ? current.filter(entry => entry.key !== line.key) : [emptyWaste()]))}>
              <TrashIcon size={18} aria-hidden="true" />
            </button>
          </div>;
        })}
        <Button small variant="ghost" icon={<PlusIcon size={16} weight="bold" aria-hidden="true" />} onClick={() => setLines(current => [...current, emptyWaste()])}
          disabled={lines.length >= INVENTORY_LIMITS.documentLines} data-testid="waste-add-line">{text('ضيف سطر', 'Add a line')}</Button>
      </fieldset>
      <Field label={text('ملاحظة', 'Note')} optional>
        <input className="input" maxLength={INVENTORY_LIMITS.noteLength} value={note} onChange={event => setNote(event.target.value)} />
      </Field>
      {tried && !valid && reason && <Alert kind="error">{text('كل سطر محتاج خامة وكمية، أو طبق.', 'Each line needs an ingredient and a quantity, or a dish.')}</Alert>}
      <div className="cash-actions"><span className="att-actions-spacer" /><Button type="submit" loading={record.isPending} data-testid="waste-submit">{text('سجّل الهالك', 'Record waste')}</Button></div>
      {actions.costs && <p className="field-hint">{text('الهالك بيتحسب بمتوسط التكلفة في الفرع، والأطباق بتنزل بوصفتها.', 'Waste is valued at the branch’s average cost; whole dishes come off by their recipe.')}</p>}
    </form>
  </section>;
}

function WasteHistory() {
  const { text } = useLanguage();
  const format = useInventoryFormat();
  const actions = useInventoryActions();
  const settings = useInventorySettings();
  const branchId = useListBranch();
  const [reason, setReason] = useState('');
  const [from, setFrom] = useState(() => shiftDay(today(), -30));
  const [to, setTo] = useState(today);
  const [page, setPage] = useState(1);
  const filters: WasteFilters = { branchId, reason: reason || null, from, to, page, pageSize: 20 };
  const waste = useQuery({ queryKey: inventoryKeys.waste(filters), queryFn: () => inventoryApi.waste(filters), placeholderData: keepPreviousData });
  const reset = <T,>(set: (value: T) => void) => (value: T) => { set(value); setPage(1); };
  const lineText = (line: WasteEntry['lines'][number]) => `${format.name(line.nameAr, line.nameEn)} ${line.baseUnit ? format.qty(line.quantity, line.baseUnit) : `× ${formatNumber(line.quantity, format.language)}`}`;
  return <section className="card list-card" aria-labelledby="waste-history-title">
    <h2 id="waste-history-title" className="card-title inv-card-title">{text('سجل الهالك', 'Waste history')}</h2>
    <div className="att-filters inv-filters is-flat" role="group" aria-label={text('تصفية', 'Filters')}>
      <Field label={text('السبب', 'Reason')}>
        <select className="select" value={reason} onChange={event => reset(setReason)(event.target.value)}>
          <option value="">{text('كل الأسباب', 'All reasons')}</option>
          {settings.data?.wasteReasons.map(option => <option key={option.code} value={option.code}>{format.name(option.nameAr, option.nameEn)}</option>)}
        </select>
      </Field>
      <Field label={text('من', 'From')}><input className="input" type="date" value={from} max={to} onChange={event => event.target.value && reset(setFrom)(event.target.value)} /></Field>
      <Field label={text('لحد', 'To')}><input className="input" type="date" value={to} min={from} onChange={event => event.target.value && reset(setTo)(event.target.value)} /></Field>
    </div>
    {waste.isError && <ErrorPanel error={waste.error} onRetry={() => void waste.refetch()} />}
    {waste.isPending && <div className="table-skeleton">{[0, 1, 2].map(index => <Skeleton key={index} height={48} />)}</div>}
    {waste.data?.items.length === 0 && <p className="muted cash-empty">{text('مفيش هالك في الفترة دي.', 'No waste in this period.')}</p>}
    {waste.data && waste.data.items.length > 0 && <div className="table-scroll"><table className="data-table inv-table" data-testid="waste-table">
      <thead><tr>
        <th scope="col">{text('الوقت', 'Time')}</th><th scope="col">{text('السبب', 'Reason')}</th><th scope="col">{text('اللي اتهدر', 'Wasted')}</th>
        <th scope="col">{text('الفرع', 'Branch')}</th><th scope="col">{text('بواسطة', 'By')}</th>{actions.costs && <th scope="col">{text('القيمة', 'Value')}</th>}
      </tr></thead>
      <tbody>{waste.data.items.map(entry => <tr key={entry.id} data-testid="waste-row">
        <td className="cell-nowrap desktop-only">{format.dateTime(entry.createdAt)}</td>
        <td className="cell-primary"><bdi>{format.name(entry.reasonNameAr, entry.reasonNameEn)}</bdi>{entry.note && <small><bdi>{entry.note}</bdi></small>}</td>
        <td className="cell-wide"><ul className="inv-inline-list">{entry.lines.map((line, index) => <li key={index}><bdi>{lineText(line)}</bdi></li>)}</ul></td>
        <td><bdi>{entry.branchName}</bdi></td>
        <td><bdi>{entry.createdBy ?? '—'}</bdi></td>
        {actions.costs && <td className="cell-end cell-amount">{format.money(entry.total)}</td>}
        <CompactMeta parts={[format.dateTime(entry.createdAt), <bdi key="b">{entry.branchName}</bdi>, entry.createdBy ? <bdi key="u">{entry.createdBy}</bdi> : null]} />
      </tr>)}</tbody>
    </table></div>}
    {waste.data && <Pagination page={page} pageSize={waste.data.pageSize} total={waste.data.total} onChange={setPage} label={text('صفحات الهالك', 'Waste pages')} />}
  </section>;
}
