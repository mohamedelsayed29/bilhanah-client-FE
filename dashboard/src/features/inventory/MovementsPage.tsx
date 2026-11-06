import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { ListMagnifyingGlassIcon } from '@phosphor-icons/react';
import { STOCK_MOVEMENT_TYPE_LABELS, STOCK_MOVEMENT_TYPES } from '@bilhanah/contracts';
import { CompactMeta } from '../../components/CompactMeta';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Field } from '../../components/Field';
import { Pagination } from '../../components/Pagination';
import { Skeleton } from '../../components/Skeleton';
import { inventoryApi, type MovementFilters } from '../../lib/api/endpoints';
import { useLanguage, usePageTitle } from '../../lib/language';
import { useBranchScope } from '../branches/BranchScope';
import { IngredientPicker } from './controls';
import { inventoryKeys, MovementType, useSourceLabel, shiftDay, today, useInventoryActions, useInventoryFormat } from './shared';

/** The stock ledger: every movement, newest first, by branch, ingredient, type and dates. */
export function InventoryMovementsPage() {
  const { text } = useLanguage();
  usePageTitle('سجل الحركة', 'Movements');
  const format = useInventoryFormat();
  const actions = useInventoryActions();
  const sourceLabel = useSourceLabel();
  const scope = useBranchScope();
  const [params, setParams] = useSearchParams();
  const branchParam = params.get('branch');
  const branchId = scope.selected !== 'all' ? scope.selected : branchParam && scope.branches.some(branch => branch.id === branchParam) ? branchParam : null;
  const ingredientId = params.get('ingredient');
  const [type, setType] = useState('');
  const [from, setFrom] = useState(() => shiftDay(today(), -30));
  const [to, setTo] = useState(today);
  const [page, setPage] = useState(1);
  const ingredients = useQuery({ queryKey: inventoryKeys.ingredients(null, true), queryFn: () => inventoryApi.ingredients({ includeInactive: true }) });
  const filters: MovementFilters = { branchId, ingredientId, type: type || null, from, to, page, pageSize: 30 };
  const movements = useQuery({ queryKey: inventoryKeys.movements(filters), queryFn: () => inventoryApi.movements(filters), placeholderData: keepPreviousData });
  const reset = <T,>(set: (value: T) => void) => (value: T) => { set(value); setPage(1); };
  const setParam = (name: string, value: string | null) => setParams(current => { const next = new URLSearchParams(current); if (value) next.set(name, value); else next.delete(name); return next; }, { replace: true });
  return <>
    <div className="att-filters inv-filters" role="group" aria-label={text('تصفية', 'Filters')}>
      {!scope.locked && scope.choices.length > 1 && scope.selected === 'all' && <Field label={text('الفرع', 'Branch')}>
        <select className="select" value={branchId ?? ''} onChange={event => { setParam('branch', event.target.value || null); setPage(1); }}>
          <option value="">{text('كل الفروع', 'All branches')}</option>
          {scope.choices.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
      </Field>}
      <div className="field">
        <span className="field-label" id="movement-ingredient">{text('الخامة', 'Ingredient')}</span>
        <IngredientPicker ingredients={(ingredients.data ?? []).map(ingredient => ({ ...ingredient, isActive: true }))} value={ingredientId} label={text('الخامة', 'Ingredient')}
          placeholder={text('كل الخامات', 'All ingredients')} onChange={picked => { setParam('ingredient', picked?.id ?? null); setPage(1); }} />
      </div>
      <Field label={text('النوع', 'Type')}>
        <select className="select" value={type} onChange={event => reset(setType)(event.target.value)}>
          <option value="">{text('كل الأنواع', 'All types')}</option>
          {STOCK_MOVEMENT_TYPES.map(value => <option key={value} value={value}>{text(...STOCK_MOVEMENT_TYPE_LABELS[value])}</option>)}
        </select>
      </Field>
      <Field label={text('من', 'From')}><input className="input" type="date" value={from} max={to} onChange={event => event.target.value && reset(setFrom)(event.target.value)} /></Field>
      <Field label={text('لحد', 'To')}><input className="input" type="date" value={to} min={from} onChange={event => event.target.value && reset(setTo)(event.target.value)} /></Field>
    </div>
    <section className="card list-card" aria-labelledby="movements-title">
      <h2 id="movements-title" className="visually-hidden">{text('الحركة', 'Movements')}</h2>
      {movements.isError && <ErrorPanel error={movements.error} onRetry={() => void movements.refetch()} />}
      {movements.isPending && <div className="table-skeleton">{[0, 1, 2, 3].map(index => <Skeleton key={index} height={44} />)}</div>}
      {movements.data?.items.length === 0 && <div className="empty-state">
        <span className="empty-state-icon" aria-hidden="true"><ListMagnifyingGlassIcon size={30} /></span>
        <h2>{text('مفيش حركة بالفلتر ده', 'No movements match')}</h2>
      </div>}
      {movements.data && movements.data.items.length > 0 && <div className="table-scroll"><table className="data-table inv-table" data-testid="movements-table">
        <thead><tr>
          <th scope="col">{text('الوقت', 'Time')}</th><th scope="col">{text('الخامة', 'Ingredient')}</th><th scope="col">{text('النوع', 'Type')}</th>
          <th scope="col">{text('الكمية', 'Quantity')}</th><th scope="col">{text('بعدها', 'On hand after')}</th>
          {actions.costs && <th scope="col">{text('تكلفة الوحدة', 'Unit cost')}</th>}{actions.costs && <th scope="col">{text('القيمة', 'Value')}</th>}
          <th scope="col">{text('المصدر', 'Source')}</th><th scope="col">{text('الفرع', 'Branch')}</th>
        </tr></thead>
        <tbody>{movements.data.items.map(movement => <tr key={movement.id} data-testid="movement-row" data-type={movement.type}>
          <td className="cell-nowrap desktop-only">{format.dateTime(movement.createdAt)}</td>
          <td className="cell-primary"><bdi>{format.name(movement.ingredientNameAr, movement.ingredientNameEn)}</bdi><small><MovementType type={movement.type} /></small></td>
          <td className="desktop-only"><MovementType type={movement.type} /></td>
          <td className="cell-end cell-nowrap"><strong className={`inv-signed ${movement.quantity < 0 ? 'is-out' : 'is-in'}`}>{format.qty(movement.quantity, movement.baseUnit, { signed: true })}</strong></td>
          <td className="cell-nowrap">{format.qty(movement.onHandAfter, movement.baseUnit)}</td>
          {actions.costs && <td className="cell-nowrap">{format.unitCost(movement.unitCost, movement.baseUnit)}</td>}
          {actions.costs && <td className="cell-nowrap">{format.signedMoney(movement.value)}</td>}
          <td>{sourceLabel(movement.source) ? <bdi>{sourceLabel(movement.source)}</bdi> : '—'}{movement.note && <small><bdi>{movement.note}</bdi></small>}{movement.createdBy && <small><bdi>{movement.createdBy}</bdi></small>}</td>
          <td><bdi>{movement.branchName}</bdi></td>
          <CompactMeta parts={[format.dateTime(movement.createdAt), text(`بعدها ${format.qty(movement.onHandAfter, movement.baseUnit)}`, `${format.qty(movement.onHandAfter, movement.baseUnit)} after`),
            actions.costs ? format.signedMoney(movement.value) : null, sourceLabel(movement.source) ? <bdi key="s">{sourceLabel(movement.source)}</bdi> : null, <bdi key="b">{movement.branchName}</bdi>]} />
        </tr>)}</tbody>
      </table></div>}
    </section>
    {movements.data && <Pagination page={page} pageSize={movements.data.pageSize} total={movements.data.total} onChange={setPage} label={text('صفحات الحركة', 'Movement pages')} />}
  </>;
}
