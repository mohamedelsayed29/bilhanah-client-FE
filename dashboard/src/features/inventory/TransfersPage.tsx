import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowsLeftRightIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react';
import { createTransferSchema, INVENTORY_LIMITS } from '@bilhanah/contracts';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { CompactMeta } from '../../components/CompactMeta';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Field } from '../../components/Field';
import { Pagination } from '../../components/Pagination';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { inventoryApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { contractIssues } from '../../lib/forms';
import { useLanguage, usePageTitle } from '../../lib/language';
import { useBranchScope } from '../branches/BranchScope';
import { IngredientPicker, QuantityInput } from './controls';
import { compileQty, defaultUnitKey, emptyQtyDraft, lineUnits, type QtyDraft } from './doc-lines';
import { inventoryKeys, useInventoryActions, useInventoryFormat, useListBranch } from './shared';

/**
 * Moving stock between branches (at the sender's average cost), and the history. Staff tied to a
 * branch send from it, to any other active branch (GET /inventory/transfer-destinations).
 */
export function InventoryTransfersPage() {
  usePageTitle('التحويلات', 'Transfers');
  return <>
    <TransferForm />
    <TransferHistory />
  </>;
}

function TransferForm() {
  const { text } = useLanguage();
  const format = useInventoryFormat();
  const toast = useToast();
  const queryClient = useQueryClient();
  const scope = useBranchScope();
  const [fromId, setFromId] = useState(() => (scope.selected !== 'all' ? scope.selected : scope.choices.find(branch => branch.isMain)?.id ?? scope.choices[0]?.id ?? ''));
  const [toId, setToId] = useState('');
  // Where the sender may send: the restaurant's other active branches, from the API (a branch-tied
  // account sees only its own branch everywhere else).
  const destinations = useQuery({ queryKey: inventoryKeys.destinations(fromId), queryFn: () => inventoryApi.transferDestinations(fromId), enabled: Boolean(fromId) });
  const others = useMemo(() => destinations.data ?? [], [destinations.data]);
  useEffect(() => { if (!others.some(branch => branch.id === toId)) setToId(others[0]?.id ?? ''); }, [toId, others]);
  const ingredients = useQuery({ queryKey: inventoryKeys.ingredients(fromId), queryFn: () => inventoryApi.ingredients({ branchId: fromId }), enabled: Boolean(fromId) });
  const stock = useQuery({ queryKey: inventoryKeys.stock(fromId), queryFn: () => inventoryApi.stock(fromId), enabled: Boolean(fromId) });
  const raw = useMemo(() => (ingredients.data ?? []).filter(ingredient => ingredient.kind === 'RAW'), [ingredients.data]);
  const onHand = new Map((stock.data?.rows ?? []).map(row => [row.ingredientId, row.onHand]));
  const [lines, setLines] = useState<QtyDraft[]>(() => [emptyQtyDraft()]);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const compiled = lines.map(line => ({ line, ingredient: raw.find(entry => entry.id === line.ingredientId) })).map(entry => ({ ...entry, quantity: compileQty(entry.line, entry.ingredient) }));
  const filled = compiled.filter(entry => entry.line.ingredientId || entry.line.quantity.trim());
  const body = { fromBranchId: fromId, toBranchId: toId, note: note.trim() || null, lines: filled.flatMap(entry => (entry.ingredient && entry.quantity ? [{ ingredientId: entry.ingredient.id, unitId: entry.quantity.unitId, quantity: entry.quantity.quantity }] : [])) };
  const valid = filled.length > 0 && filled.every(entry => entry.quantity) && contractIssues(createTransferSchema, body).length === 0;
  const send = useMutation({
    mutationFn: () => inventoryApi.createTransfer(body),
    onSuccess: transfer => {
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      toast.success(text(`اتحولت لـ ${transfer.toBranch.name}`, `Sent to ${transfer.toBranch.name}`));
      setLines([emptyQtyDraft()]); setNote(''); setTried(false);
    },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  const update = (key: string, change: Partial<QtyDraft>) => setLines(current => current.map(line => (line.key === key ? { ...line, ...change } : line)));
  if (destinations.isError) return <ErrorPanel error={destinations.error} onRetry={() => void destinations.refetch()} />;
  if (destinations.isPending) return <Skeleton height={120} />;
  if (others.length === 0) return <Alert kind="info" live={false}>
    {text('مفيش فرع تاني شغال تحوّل له. التحويلات اللي وصلت الفرع ظاهرة هنا وفي سجل الحركة.', 'There is no other active branch to send to. Transfers that reached this branch show here and in the movements ledger.')}
  </Alert>;
  return <section className="card inv-form-card" aria-labelledby="transfer-title">
    <h2 id="transfer-title" className="card-title">{text('حوّل مخزون لفرع تاني', 'Move stock to another branch')}</h2>
    <form className="inv-form" noValidate onSubmit={event => { event.preventDefault(); setTried(true); if (valid) send.mutate(); }}>
      <div className="form-grid">
        <Field label={text('من فرع', 'From')}>
          <select className="select" value={fromId} onChange={event => { setFromId(event.target.value); setLines([emptyQtyDraft()]); }} disabled={scope.locked || scope.choices.length < 2} data-testid="transfer-from">
            {(scope.choices.length ? scope.choices : scope.branches).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </Field>
        <Field label={text('لفرع', 'To')}>
          <select className="select" value={toId} onChange={event => setToId(event.target.value)} data-testid="transfer-to">
            {others.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </Field>
      </div>
      <fieldset className="inv-doc-lines">
        <legend className="field-label">{text('الخامات', 'Ingredients')}</legend>
        {lines.map((line, index) => {
          const entry = compiled[index]!;
          const name = entry.ingredient ? format.name(entry.ingredient.nameAr, entry.ingredient.nameEn) : text(`سطر ${index + 1}`, `Line ${index + 1}`);
          const available = entry.ingredient ? onHand.get(entry.ingredient.id) ?? 0 : null;
          const invalid = tried && !entry.quantity && (filled.length === 0 || filled.includes(entry));
          return <div key={line.key} className={`inv-doc-line is-transfer ${invalid ? 'is-invalid' : ''}`} data-testid="transfer-line">
            <IngredientPicker ingredients={raw} value={line.ingredientId} exclude={lines.map(entry => entry.ingredientId).filter((value): value is string => Boolean(value))}
              label={text(`خامة السطر ${index + 1}`, `Ingredient, line ${index + 1}`)} onChange={picked => update(line.key, { ingredientId: picked?.id ?? null, unitKey: picked ? defaultUnitKey(picked) : 'base' })} />
            <QuantityInput value={line.quantity} onValue={value => update(line.key, { quantity: value })} unitKey={line.unitKey} onUnit={key => update(line.key, { unitKey: key })}
              options={lineUnits(entry.ingredient)} label={text(`كمية ${name}`, `Quantity of ${name}`)} invalid={invalid} />
            <span className="muted inv-doc-line-total">{available !== null && entry.ingredient ? text(`الموجود ${format.qty(available, entry.ingredient.baseUnit)}`, `${format.qty(available, entry.ingredient.baseUnit)} on hand`) : ''}</span>
            <button type="button" className="icon-button" aria-label={text(`شيل ${name}`, `Remove ${name}`)} onClick={() => setLines(current => (current.length > 1 ? current.filter(item => item.key !== line.key) : [emptyQtyDraft()]))}>
              <TrashIcon size={18} aria-hidden="true" />
            </button>
          </div>;
        })}
        <Button small variant="ghost" icon={<PlusIcon size={16} weight="bold" aria-hidden="true" />} onClick={() => setLines(current => [...current, emptyQtyDraft()])} disabled={lines.length >= INVENTORY_LIMITS.documentLines}>{text('ضيف خامة', 'Add an ingredient')}</Button>
      </fieldset>
      <Field label={text('ملاحظة', 'Note')} optional><input className="input" maxLength={INVENTORY_LIMITS.noteLength} value={note} onChange={event => setNote(event.target.value)} /></Field>
      {tried && !valid && <Alert kind="error">{text('اختار الفرع اللي رايح له وكمية لكل خامة.', 'Choose the receiving branch and a quantity for each ingredient.')}</Alert>}
      <div className="cash-actions"><span className="att-actions-spacer" /><Button type="submit" loading={send.isPending} disabled={!toId} icon={<ArrowsLeftRightIcon size={17} aria-hidden="true" />}>{text('حوّل', 'Transfer')}</Button></div>
    </form>
  </section>;
}

function TransferHistory() {
  const { text } = useLanguage();
  const format = useInventoryFormat();
  const actions = useInventoryActions();
  const branchId = useListBranch();
  const [page, setPage] = useState(1);
  const filters = { branchId, page, pageSize: 20 };
  const transfers = useQuery({ queryKey: inventoryKeys.transfers(filters), queryFn: () => inventoryApi.transfers(filters), placeholderData: keepPreviousData });
  return <section className="card list-card" aria-labelledby="transfer-history">
    <h2 id="transfer-history" className="card-title inv-card-title">{text('سجل التحويلات', 'Transfer history')}</h2>
    {transfers.isError && <ErrorPanel error={transfers.error} onRetry={() => void transfers.refetch()} />}
    {transfers.isPending && <Skeleton height={80} />}
    {transfers.data?.items.length === 0 && <p className="muted cash-empty">{text('مفيش تحويلات لسه.', 'No transfers yet.')}</p>}
    {transfers.data && transfers.data.items.length > 0 && <div className="table-scroll"><table className="data-table inv-table">
      <thead><tr><th scope="col">{text('الوقت', 'Time')}</th><th scope="col">{text('من ← لـ', 'From → to')}</th><th scope="col">{text('الخامات', 'Ingredients')}</th><th scope="col">{text('بواسطة', 'By')}</th>{actions.costs && <th scope="col">{text('القيمة', 'Value')}</th>}</tr></thead>
      <tbody>{transfers.data.items.map(transfer => <tr key={transfer.id}>
        <td className="cell-nowrap desktop-only">{format.dateTime(transfer.createdAt)}</td>
        <td className="cell-primary"><bdi>{transfer.fromBranch.name}</bdi> {text('←', '→')} <bdi>{transfer.toBranch.name}</bdi>{transfer.note && <small><bdi>{transfer.note}</bdi></small>}</td>
        <td className="cell-wide"><ul className="inv-inline-list">{transfer.lines.map(line => <li key={line.ingredientId}><bdi>{format.name(line.nameAr, line.nameEn)}</bdi> {format.qty(line.quantity, line.baseUnit)}</li>)}</ul></td>
        <td><bdi>{transfer.createdBy ?? '—'}</bdi></td>
        {actions.costs && <td className="cell-end cell-amount">{format.money(transfer.total)}</td>}
        <CompactMeta parts={[format.dateTime(transfer.createdAt), transfer.createdBy ? <bdi key="u">{transfer.createdBy}</bdi> : null]} />
      </tr>)}</tbody>
    </table></div>}
    {transfers.data && <Pagination page={page} pageSize={transfers.data.pageSize} total={transfers.data.total} onChange={setPage} label={text('صفحات التحويلات', 'Transfer pages')} />}
  </section>;
}
