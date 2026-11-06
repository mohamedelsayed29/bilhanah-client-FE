import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ClockCounterClockwiseIcon, WarehouseIcon } from '@phosphor-icons/react';
import type { BaseUnit, InventoryStock, StockRow } from '@bilhanah/contracts';
import { CompactMeta } from '../../components/CompactMeta';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { inventoryApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { useLanguage, usePageTitle } from '../../lib/language';
import { PageBranchPicker } from '../branches/BranchScope';
import { useWorkspace } from '../branches/workspace';
import { Chips, Figure, matchesIngredient, SearchBox } from './controls';
import { inventoryKeys, StockStatusBadge, useInventoryActions, useInventoryFormat, useStockBranch } from './shared';
import { formatNumber, fromBaseInput, LARGE_UNITS, parseQuantity, toBase } from './units';

type StatusFilter = 'all' | 'attention' | 'OUT';

/** The unit reorder levels are typed in: kilos, litres or pieces. */
export function levelUnit(unit: BaseUnit): { factor: number; label: [string, string] } {
  const large = LARGE_UNITS[unit];
  return large ?? { factor: 1, label: ['قطعة', 'pcs'] };
}

/** One branch's stock: on hand in everyday units, status, costs (with permission) and the reorder levels. */
export function InventoryStockPage() {
  const { text } = useLanguage();
  usePageTitle('المخزون', 'Stock');
  const format = useInventoryFormat();
  const actions = useInventoryActions();
  const page = useStockBranch();
  const branchId = page.branchId;
  const stock = useQuery({ queryKey: inventoryKeys.stock(branchId), queryFn: () => inventoryApi.stock(branchId), enabled: Boolean(branchId), placeholderData: keepPreviousData });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [category, setCategory] = useState('');
  const rows = stock.data?.rows ?? [];
  const categories = useMemo(() => [...new Set(rows.map(row => row.category).filter((value): value is string => Boolean(value)))], [rows]);
  const shown = rows.filter(row => matchesIngredient(row, search) && (!category || row.category === category)
    && (status === 'all' || (status === 'OUT' ? row.status === 'OUT' : row.status !== 'OK')));
  const low = rows.filter(row => row.status === 'LOW').length;
  const out = rows.filter(row => row.status === 'OUT').length;
  return <>
    <PageBranchPicker page={page} />
    {stock.isError && <ErrorPanel error={stock.error} onRetry={() => void stock.refetch()} />}
    {stock.isPending && <div className="skeleton-stack"><Skeleton height={72} /><Skeleton height={320} /></div>}
    {stock.data && <>
      <div className="att-kpis is-compact" data-testid="stock-figures">
        <Figure label={text('خامات في المخزون', 'Ingredients stocked')} value={formatNumber(rows.length, format.language)} />
        <Figure label={text('قربت تخلص', 'Running low')} value={formatNumber(low, format.language)} tone={low ? 'warning' : 'muted'} />
        <Figure label={text('خلصت', 'Out of stock')} value={formatNumber(out, format.language)} tone={out ? 'danger' : 'muted'}
          hint={stock.data.negativeItems > 0 ? text(`${formatNumber(stock.data.negativeItems, 'ar')} بالسالب`, `${stock.data.negativeItems} below zero`) : undefined} />
        {actions.costs && <Figure label={text('قيمة المخزون', 'Stock value')} value={format.money(stock.data.totalValue)} tone="info" testId="stock-value" />}
      </div>
      {stock.data.negativeItems > 0 && <p className="inv-note" role="note">{text('الخامات اللي بالسالب اتباع منها أو اتسجل هالك قبل ما تتسجل المشتريات بتاعتها. سجّل الاستلام أو اعمل جرد يظبطها.', 'Ingredients below zero were sold or wasted before their delivery was recorded. Record the delivery, or count them to correct it.')}</p>}
      <div className="inv-toolbar">
        <SearchBox value={search} onChange={setSearch} label={text('دوّر على خامة', 'Search ingredients')} />
        <Chips value={status} onChange={setStatus} label={text('الحالة', 'Status')} options={[
          { value: 'all', label: text('الكل', 'All') },
          { value: 'attention', label: text('محتاجة طلب', 'Needs ordering'), count: low + out },
          { value: 'OUT', label: text('خلصت', 'Out'), count: out },
        ]} />
        {categories.length > 1 && <select className="select inv-category" aria-label={text('القسم', 'Category')} value={category} onChange={event => setCategory(event.target.value)}>
          <option value="">{text('كل الأقسام', 'All categories')}</option>
          {categories.map(entry => <option key={entry} value={entry}>{entry}</option>)}
        </select>}
      </div>
      <section className="card list-card" aria-labelledby="stock-title">
        <h2 id="stock-title" className="visually-hidden">{text('مخزون الفرع', 'Branch stock')}</h2>
        {shown.length === 0 ? <div className="empty-state">
          <span className="empty-state-icon" aria-hidden="true"><WarehouseIcon size={30} /></span>
          <h2>{rows.length === 0 ? text('مفيش خامات لسه', 'No ingredients yet') : text('مفيش خامات بالفلتر ده', 'No ingredients match')}</h2>
          {rows.length === 0 && <p>{text('ضيف الخامات اللي بتشتريها من صفحة الخامات، وبعدين سجّل أول استلام.', 'Add the ingredients you buy on the ingredients page, then record a first delivery.')}</p>}
        </div> : <StockTable stock={stock.data} rows={shown} branchId={branchId!} />}
      </section>
    </>}
  </>;
}

function StockTable({ stock, rows, branchId }: { stock: InventoryStock; rows: StockRow[]; branchId: string }) {
  const { text } = useLanguage();
  const format = useInventoryFormat();
  const actions = useInventoryActions();
  const { to } = useWorkspace();
  return <div className="table-scroll"><table className="data-table inv-table" data-testid="stock-table">
    <thead><tr>
      <th scope="col">{text('الخامة', 'Ingredient')}</th>
      <th scope="col">{text('الموجود', 'On hand')}</th>
      <th scope="col">{text('الحالة', 'Status')}</th>
      {actions.costs && <th scope="col">{text('متوسط التكلفة', 'Average cost')}</th>}
      {actions.costs && <th scope="col">{text('القيمة', 'Value')}</th>}
      <th scope="col">{text('حد الطلب', 'Reorder at')}</th>
      <th scope="col">{text('المستوى المطلوب', 'Par level')}</th>
      <th scope="col"><span className="visually-hidden">{text('الحركة', 'History')}</span></th>
    </tr></thead>
    <tbody>{rows.map(row => {
      const negative = row.onHand < 0;
      return <tr key={row.ingredientId} data-testid="stock-row" data-name={row.nameEn ?? row.nameAr} className={negative ? 'is-negative' : ''}>
        <td className="cell-primary"><bdi>{format.name(row.nameAr, row.nameEn)}</bdi>{row.category && <small>{row.category}</small>}{!row.isActive && <small>{text('متأرشفة', 'Archived')}</small>}</td>
        <td className="cell-end cell-nowrap inv-onhand" data-testid="stock-onhand"><strong className={negative ? 'inv-negative' : ''}>{format.qty(row.onHand, row.baseUnit)}</strong></td>
        <td className="cell-end"><StockStatusBadge status={row.status} negative={negative} /></td>
        {actions.costs && <td className="cell-nowrap" data-testid="stock-avg">{row.avgCost === null ? <span className="muted">{text('لسه ما اتستلمتش', 'Not received yet')}</span> : format.unitCost(row.avgCost, row.baseUnit)}</td>}
        {actions.costs && <td className="cell-nowrap cell-amount">{format.money(row.value)}</td>}
        <td className="cell-wide inv-level-cell"><LevelCell row={row} field="reorderPoint" branchId={branchId} editable={actions.manage} /></td>
        <td className="cell-wide inv-level-cell"><LevelCell row={row} field="parLevel" branchId={branchId} editable={actions.manage} /></td>
        <td className="cell-action cell-action-inline">
          <Link className="icon-button" to={`${to('/inventory/movements')}?ingredient=${row.ingredientId}&branch=${stock.branchId}`}
            aria-label={text(`حركة ${row.nameAr}`, `History of ${row.nameEn ?? row.nameAr}`)} title={text('سجل الحركة', 'History')}>
            <ClockCounterClockwiseIcon size={18} aria-hidden="true" />
          </Link>
        </td>
        <CompactMeta parts={actions.costs ? [row.avgCost === null ? null : format.unitCost(row.avgCost, row.baseUnit), row.value === null ? null : format.money(row.value)] : []} />
      </tr>;
    })}</tbody>
  </table></div>;
}

/** A reorder point or par level, edited in place (kilos, litres or pieces); empty follows the ingredient's default. */
function LevelCell({ row, field, branchId, editable }: { row: StockRow; field: 'reorderPoint' | 'parLevel'; branchId: string; editable: boolean }) {
  const { text } = useLanguage();
  const format = useInventoryFormat();
  const toast = useToast();
  const queryClient = useQueryClient();
  const unit = levelUnit(row.baseUnit);
  const current = row[field];
  const isDefault = field === 'reorderPoint' && row.reorderPointIsDefault;
  const initial = isDefault ? '' : fromBaseInput(current, unit.factor);
  const [draft, setDraft] = useState(initial);
  useEffect(() => setDraft(initial), [initial]);
  const key = inventoryKeys.stock(branchId);
  const save = useMutation({
    mutationFn: (value: number | null) => inventoryApi.setStockLevels(row.ingredientId, branchId, { [field]: value }),
    onMutate: async value => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<InventoryStock>(key);
      queryClient.setQueryData<InventoryStock>(key, data => data && { ...data, rows: data.rows.map(entry => (entry.ingredientId === row.ingredientId
        ? { ...entry, [field]: value, ...(field === 'reorderPoint' && { reorderPointIsDefault: false }) } : entry)) });
      return { previous };
    },
    onError: (failure, _value, context) => { queryClient.setQueryData(key, context?.previous); setDraft(initial); toast.error(errorMessage(failure, text)); },
    onSuccess: saved => {
      queryClient.setQueryData<InventoryStock>(key, data => data && { ...data, rows: data.rows.map(entry => (entry.ingredientId === saved.ingredientId ? saved : entry)) });
      void queryClient.invalidateQueries({ queryKey: ['inventory', 'report'] });
    },
  });
  const label = field === 'reorderPoint' ? text('حد الطلب', 'Reorder at') : text('المستوى المطلوب', 'Par level');
  if (!editable) {
    return <span className="inv-level-read"><span className="inv-level-label">{label}: </span>{current === null ? '—' : format.qty(current, row.baseUnit)}{isDefault && <small> ({text('الافتراضي', 'default')})</small>}</span>;
  }
  const parsed = draft.trim() === '' ? null : parseQuantity(draft);
  const invalid = draft.trim() !== '' && parsed === null;
  const commit = () => {
    if (invalid) return;
    const value = parsed === null ? null : toBase(parsed, unit.factor);
    const same = value === null ? (current === null || isDefault) : !isDefault && current !== null && Math.abs(value - current) < 0.0005;
    if (!same) save.mutate(value);
  };
  return <label className="inv-level">
    <span className="inv-level-label">{label}</span>
    <span className="inv-qty is-compact">
      <input className="input ltr" inputMode="decimal" value={draft} aria-invalid={invalid || undefined}
        placeholder={isDefault && current !== null ? fromBaseInput(current, unit.factor) : '—'}
        aria-label={`${label}: ${format.name(row.nameAr, row.nameEn)} (${text(...unit.label)})`}
        onChange={event => setDraft(event.target.value)} onBlur={commit}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); (event.target as HTMLInputElement).blur(); } if (event.key === 'Escape') setDraft(initial); }} />
      <span className="inv-qty-unit">{text(...unit.label)}</span>
    </span>
    {isDefault && <small className="muted" title={text('من إعداد الخامة', 'From the ingredient')}>{text('الافتراضي', 'Default')}</small>}
    {save.isPending && <span className="visually-hidden" role="status">{text('بنحفظ', 'Saving')}</span>}
  </label>;
}
