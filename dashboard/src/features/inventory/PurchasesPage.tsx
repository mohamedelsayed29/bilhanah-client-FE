import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { CheckIcon, PlusIcon, ProhibitIcon, TrashIcon, TruckIcon } from '@phosphor-icons/react';
import { createPurchaseSchema, INVENTORY_LIMITS, PURCHASE_STATUS_LABELS, PURCHASE_STATUSES, type Ingredient, type PurchaseDetail } from '@bilhanah/contracts';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { CompactMeta } from '../../components/CompactMeta';
import { Dialog } from '../../components/Dialog';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Field } from '../../components/Field';
import { Pagination } from '../../components/Pagination';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { inventoryApi, type PurchaseFilters } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { contractIssues } from '../../lib/forms';
import { useLanguage, usePageTitle } from '../../lib/language';
import { BranchPicker, useBranchScope } from '../branches/BranchScope';
import { IngredientPicker, MoneyInput, QuantityInput } from './controls';
import { compileQty, defaultUnitKey, emptyQtyDraft, lineKey, lineUnits, type QtyDraft } from './doc-lines';
import { inventoryKeys, PurchaseStatusBadge, shiftDay, today, useInventoryActions, useInventoryFormat, useListBranch } from './shared';
import { egpInput, fromBaseInput, parseEgp, roundTo } from './units';

/** A delivery prefilled from the reorder report. */
export type PurchasePrefill = { supplierId: string | null; branchId: string | null; lines: { ingredientId: string; unitId: string | null; quantity: number }[] };

/** Deliveries: the list, receiving a new one (stock and average cost are posted), and each one's detail. */
export function InventoryPurchasesPage() {
  const { text } = useLanguage();
  usePageTitle('المشتريات', 'Purchases');
  const format = useInventoryFormat();
  const actions = useInventoryActions();
  const branchId = useListBranch();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [from, setFrom] = useState(() => shiftDay(today(), -30));
  const [to, setTo] = useState(today);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<PurchaseDetail | null>(null);
  const creating = params.get('new') === '1' && actions.operate;
  const prefill = (location.state as { prefill?: PurchasePrefill } | null)?.prefill ?? null;
  const filters: PurchaseFilters = { branchId, status: status || null, supplierId: supplierId || null, from, to, page, pageSize: 25 };
  const purchases = useQuery({ queryKey: inventoryKeys.purchases(filters), queryFn: () => inventoryApi.purchases(filters), placeholderData: keepPreviousData });
  const suppliers = useQuery({ queryKey: inventoryKeys.suppliers, queryFn: inventoryApi.suppliers });
  const reset = <T,>(set: (value: T) => void) => (value: T) => { set(value); setPage(1); };
  const closeNew = () => { setParams(current => { const next = new URLSearchParams(current); next.delete('new'); return next; }, { replace: true }); if (prefill) void navigate(location.pathname, { replace: true, state: null }); };
  return <>
    <div className="inv-toolbar is-split">
      <div className="att-filters inv-filters" role="group" aria-label={text('تصفية', 'Filters')}>
        <Field label={text('الحالة', 'Status')}>
          <select className="select" value={status} onChange={event => reset(setStatus)(event.target.value)}>
            <option value="">{text('الكل', 'All')}</option>
            {PURCHASE_STATUSES.map(value => <option key={value} value={value}>{text(...PURCHASE_STATUS_LABELS[value])}</option>)}
          </select>
        </Field>
        <Field label={text('المورد', 'Supplier')}>
          <select className="select" value={supplierId} onChange={event => reset(setSupplierId)(event.target.value)}>
            <option value="">{text('كل الموردين', 'All suppliers')}</option>
            {suppliers.data?.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
          </select>
        </Field>
        <Field label={text('من', 'From')}><input className="input" type="date" value={from} max={to} onChange={event => event.target.value && reset(setFrom)(event.target.value)} /></Field>
        <Field label={text('لحد', 'To')}><input className="input" type="date" value={to} min={from} onChange={event => event.target.value && reset(setTo)(event.target.value)} /></Field>
      </div>
      {actions.operate && <Button onClick={() => setParams(current => { const next = new URLSearchParams(current); next.set('new', '1'); return next; })} icon={<PlusIcon size={17} weight="bold" aria-hidden="true" />} data-testid="new-purchase">
        {text('استلام جديد', 'New delivery')}</Button>}
    </div>
    <section className="card list-card" aria-labelledby="purchases-title">
      <h2 id="purchases-title" className="visually-hidden">{text('المشتريات', 'Purchases')}</h2>
      {purchases.isError && <ErrorPanel error={purchases.error} onRetry={() => void purchases.refetch()} />}
      {purchases.isPending && <div className="table-skeleton">{[0, 1, 2].map(index => <Skeleton key={index} height={48} />)}</div>}
      {purchases.data?.items.length === 0 && <div className="empty-state">
        <span className="empty-state-icon" aria-hidden="true"><TruckIcon size={30} /></span>
        <h2>{text('مفيش مشتريات في الفترة دي', 'No deliveries in this period')}</h2>
        <p>{text('كل استلام بيدخل المخزون ويحدّث متوسط التكلفة في الفرع.', 'Each delivery adds to stock and updates the branch’s average cost.')}</p>
      </div>}
      {purchases.data && purchases.data.items.length > 0 && <div className="table-scroll"><table className="data-table inv-table" data-testid="purchases-table">
        <thead><tr>
          <th scope="col">{text('التاريخ', 'Date')}</th>
          <th scope="col">{text('المورد', 'Supplier')}</th>
          <th scope="col">{text('الفاتورة', 'Invoice')}</th>
          <th scope="col">{text('الفرع', 'Branch')}</th>
          <th scope="col">{text('الحالة', 'Status')}</th>
          <th scope="col">{text('الأصناف', 'Lines')}</th>
          {actions.costs && <th scope="col">{text('الإجمالي', 'Total')}</th>}
        </tr></thead>
        <tbody>{purchases.data.items.map(purchase => <tr key={purchase.id} data-testid="purchase-row" data-status={purchase.status}>
          <td className="cell-primary cell-nowrap"><button type="button" className="table-link link-button row-link" onClick={() => setOpenId(purchase.id)}>{format.date(purchase.invoiceDate ?? purchase.createdAt)}</button></td>
          <td><bdi>{purchase.supplier?.name ?? '—'}</bdi></td>
          <td className="ltr">{purchase.invoiceNumber ?? '—'}</td>
          <td><bdi>{purchase.branchName}</bdi></td>
          <td className="cell-end"><PurchaseStatusBadge status={purchase.status} /></td>
          <td>{format.language === 'ar' ? new Intl.NumberFormat('ar-EG').format(purchase.lineCount) : purchase.lineCount}</td>
          {actions.costs && <td className="cell-amount">{format.money(purchase.total)}</td>}
          <CompactMeta parts={[<bdi key="s">{purchase.supplier?.name ?? text('من غير مورد', 'No supplier')}</bdi>, purchase.invoiceNumber, <bdi key="b">{purchase.branchName}</bdi>, actions.costs ? format.money(purchase.total) : null]} />
        </tr>)}</tbody>
      </table></div>}
    </section>
    {purchases.data && <Pagination page={page} pageSize={purchases.data.pageSize} total={purchases.data.total} onChange={setPage} label={text('صفحات المشتريات', 'Purchase pages')} />}
    <PurchaseDetailDialog purchaseId={openId} onClose={() => setOpenId(null)} onEdit={detail => { setOpenId(null); setEditing(detail); }} />
    {(creating || editing) && <PurchaseFormDialog draft={editing} prefill={creating ? prefill : null} onClose={() => { if (editing) setEditing(null); else closeNew(); }}
      onSaved={detail => { if (editing) setEditing(null); else closeNew(); setOpenId(detail.id); }} />}
  </>;
}

type PriceMode = 'unit' | 'total';
type PurchaseDraft = QtyDraft & { mode: PriceMode; price: string };

const emptyLine = (): PurchaseDraft => ({ ...emptyQtyDraft(), mode: 'unit', price: '' });

/** A typed line as the API takes it, with its total for the preview. Derived units (kilos where none is defined) send a line total. */
function compileLine(draft: PurchaseDraft, ingredient: Ingredient | undefined) {
  const quantity = compileQty(draft, ingredient);
  const price = parseEgp(draft.price, draft.mode === 'unit' ? 4 : 2);
  if (!quantity || price === null || !ingredient) return null;
  const typed = roundTo(quantity.base / quantity.option.factor, 6);
  const total = draft.mode === 'total' ? price : roundTo(typed * price, 2);
  const line = draft.mode === 'unit' && quantity.unitId
    ? { ingredientId: ingredient.id, unitId: quantity.unitId, quantity: quantity.quantity, unitPrice: price }
    : { ingredientId: ingredient.id, unitId: quantity.unitId, quantity: quantity.quantity, lineTotal: total };
  return { line, total, base: quantity.base };
}

/** A new delivery (or a draft being edited): supplier, branch, invoice, and lines in any of the ingredient's units. */
function PurchaseFormDialog({ draft, prefill, onClose, onSaved }: { draft: PurchaseDetail | null; prefill: PurchasePrefill | null; onClose: () => void; onSaved: (detail: PurchaseDetail) => void }) {
  const { text } = useLanguage();
  const format = useInventoryFormat();
  const toast = useToast();
  const queryClient = useQueryClient();
  const scope = useBranchScope();
  const actions = useInventoryActions();
  const [branchId, setBranchId] = useState<string>(() => draft?.branchId ?? prefill?.branchId ?? (scope.selected !== 'all' ? scope.selected : null) ?? scope.choices.find(branch => branch.isMain)?.id ?? scope.branches[0]?.id ?? '');
  const ingredients = useQuery({ queryKey: inventoryKeys.ingredients(branchId), queryFn: () => inventoryApi.ingredients({ branchId }), enabled: Boolean(branchId) });
  const suppliers = useQuery({ queryKey: inventoryKeys.suppliers, queryFn: inventoryApi.suppliers });
  const raw = useMemo(() => (ingredients.data ?? []).filter(ingredient => ingredient.kind === 'RAW'), [ingredients.data]);
  const [supplierId, setSupplierId] = useState(draft?.supplier?.id ?? prefill?.supplierId ?? '');
  const [invoiceNumber, setInvoiceNumber] = useState(draft?.invoiceNumber ?? '');
  const [invoiceDate, setInvoiceDate] = useState(draft?.invoiceDate ?? today());
  const [note, setNote] = useState(draft?.note ?? '');
  const [lines, setLines] = useState<PurchaseDraft[] | null>(null);
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (lines || !ingredients.data) return;
    if (draft) {
      setLines(draft.lines.map(line => ({
        key: lineKey(), ingredientId: line.ingredientId, unitKey: line.unitId ?? 'base', quantity: line.unitId ? String(line.quantity) : fromBaseInput(line.baseQuantity, 1),
        mode: line.unitPrice !== null && line.unitId ? 'unit' : 'total', price: line.unitPrice !== null && line.unitId ? egpInput(line.unitPrice, 4) : egpInput(line.lineTotal, 2),
      })));
    } else if (prefill?.lines.length) {
      setLines(prefill.lines.map(line => ({ key: lineKey(), ingredientId: line.ingredientId, unitKey: line.unitId ?? 'base', quantity: String(line.quantity), mode: 'unit', price: '' })));
    } else setLines([emptyLine()]);
  }, [lines, ingredients.data, draft, prefill]);
  const compiled = (lines ?? []).map(line => ({ draft: line, result: compileLine(line, raw.find(entry => entry.id === line.ingredientId)) }));
  const filled = compiled.filter(entry => entry.draft.ingredientId || entry.draft.quantity.trim() || entry.draft.price.trim());
  const bad = filled.filter(entry => !entry.result);
  const ids = filled.map(entry => entry.draft.ingredientId).filter(Boolean);
  const duplicate = new Set(ids.filter((value, index) => ids.indexOf(value) !== index));
  const total = filled.reduce((sum, entry) => sum + (entry.result?.total ?? 0), 0);
  const body = { branchId, supplierId: supplierId || null, invoiceNumber: invoiceNumber.trim() || null, invoiceDate: invoiceDate || null, note: note.trim() || null, lines: filled.map(entry => entry.result?.line).filter(line => line !== undefined) };
  const valid = filled.length > 0 && bad.length === 0 && duplicate.size === 0 && contractIssues(createPurchaseSchema, body).length === 0;
  const refresh = (detail: PurchaseDetail) => {
    queryClient.setQueryData(inventoryKeys.purchase(detail.id), detail);
    void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
  };
  const save = useMutation({
    mutationFn: async (receive: boolean) => {
      if (draft) {
        const updated = await inventoryApi.updatePurchase(draft.id, { supplierId: body.supplierId, invoiceNumber: body.invoiceNumber, invoiceDate: body.invoiceDate, note: body.note, lines: body.lines });
        return receive ? inventoryApi.receivePurchase(updated.id) : updated;
      }
      return inventoryApi.createPurchase({ ...body, receive });
    },
    onSuccess: (detail, receive) => {
      refresh(detail);
      toast.success(receive ? text('اتستلمت البضاعة ودخلت المخزون', 'Delivery received into stock') : text('اتحفظت كمسودة', 'Saved as a draft'));
      onSaved(detail);
    },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  const submit = (receive: boolean) => { setTried(true); if (valid) save.mutate(receive); };
  const update = (key: string, change: Partial<PurchaseDraft>) => setLines(current => current?.map(line => (line.key === key ? { ...line, ...change } : line)) ?? current);
  const used = (lines ?? []).map(line => line.ingredientId).filter((value): value is string => Boolean(value));
  return <Dialog open onClose={onClose} size="wide" busy={save.isPending} onSubmit={() => submit(true)}
    title={draft ? text('تعديل مسودة الاستلام', 'Edit delivery draft') : text('استلام مشتريات', 'Receive a delivery')}
    footer={<>
      <Button variant="secondary" onClick={onClose} disabled={save.isPending}>{text('إلغاء', 'Cancel')}</Button>
      <Button variant="ghost" onClick={() => submit(false)} loading={save.isPending && save.variables === false} disabled={save.isPending} data-testid="purchase-save-draft">{text('احفظ مسودة', 'Save draft')}</Button>
      <Button type="submit" loading={save.isPending && save.variables === true} disabled={save.isPending} icon={<CheckIcon size={17} weight="bold" aria-hidden="true" />} data-testid="purchase-receive">
        {text('استلم ودخّل المخزون', 'Receive into stock')}</Button>
    </>}>
    <div className="inv-form">
      {!scope.locked && scope.choices.length > 1 && !draft && <BranchPicker value={branchId} onChange={id => { setBranchId(id); }} label={text('الفرع اللي استلم', 'Receiving branch')} />}
      <div className="form-grid">
        <Field label={text('المورد', 'Supplier')} optional>
          <select className="select" value={supplierId} onChange={event => setSupplierId(event.target.value)} data-testid="purchase-supplier">
            <option value="">{text('من غير مورد', 'No supplier')}</option>
            {suppliers.data?.filter(supplier => supplier.isActive || supplier.id === supplierId).map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
          </select>
        </Field>
        <Field label={text('رقم الفاتورة', 'Invoice number')} optional>
          <input className="input ltr" maxLength={60} value={invoiceNumber} onChange={event => setInvoiceNumber(event.target.value)} data-testid="purchase-invoice" />
        </Field>
        <Field label={text('تاريخ الفاتورة', 'Invoice date')} optional>
          <input className="input" type="date" value={invoiceDate} max={today()} onChange={event => setInvoiceDate(event.target.value)} />
        </Field>
        <Field label={text('ملاحظة', 'Note')} optional>
          <input className="input" maxLength={INVENTORY_LIMITS.noteLength} value={note} onChange={event => setNote(event.target.value)} />
        </Field>
      </div>
      {ingredients.isError && <ErrorPanel error={ingredients.error} onRetry={() => void ingredients.refetch()} />}
      {!lines ? <Skeleton height={120} /> : <fieldset className="inv-doc-lines" data-testid="purchase-lines">
        <legend className="field-label">{text('الأصناف', 'Lines')}</legend>
        {lines.map((line, index) => {
          const ingredient = raw.find(entry => entry.id === line.ingredientId);
          const options = lineUnits(ingredient);
          const result = compiled[index]?.result;
          const invalid = tried && !result && (Boolean(line.ingredientId) || Boolean(line.quantity.trim()) || Boolean(line.price.trim()) || filled.length === 0);
          const name = ingredient ? format.name(ingredient.nameAr, ingredient.nameEn) : text(`سطر ${index + 1}`, `Line ${index + 1}`);
          return <div key={line.key} className={`inv-doc-line ${invalid || duplicate.has(line.ingredientId) ? 'is-invalid' : ''}`} data-testid="purchase-line">
            <IngredientPicker ingredients={raw} value={line.ingredientId} exclude={used} label={text(`خامة السطر ${index + 1}`, `Ingredient, line ${index + 1}`)} invalid={invalid && !ingredient}
              onChange={picked => update(line.key, { ingredientId: picked?.id ?? null, unitKey: picked ? defaultUnitKey(picked, true) : 'base' })} />
            <QuantityInput value={line.quantity} onValue={value => update(line.key, { quantity: value })} unitKey={line.unitKey} onUnit={key => update(line.key, { unitKey: key })}
              options={options} label={text(`كمية ${name}`, `Quantity of ${name}`)} invalid={invalid && !compileQty(line, ingredient)} testId="purchase-qty" />
            <div className="inv-price">
              <div className="segmented inv-price-mode" role="radiogroup" aria-label={text(`طريقة السعر لـ ${name}`, `Price of ${name}`)}>
                <label><input type="radio" name={`${line.key}-mode`} checked={line.mode === 'unit'} onChange={() => update(line.key, { mode: 'unit' })} />{text('سعر الوحدة', 'Unit price')}</label>
                <label><input type="radio" name={`${line.key}-mode`} checked={line.mode === 'total'} onChange={() => update(line.key, { mode: 'total' })} />{text('إجمالي السطر', 'Line total')}</label>
              </div>
              <MoneyInput value={line.price} onChange={value => update(line.key, { price: value })} label={line.mode === 'unit' ? text(`سعر ${name} للوحدة`, `Unit price of ${name}`) : text(`إجمالي ${name}`, `Total for ${name}`)}
                invalid={invalid && parseEgp(line.price, line.mode === 'unit' ? 4 : 2) === null} testId="purchase-price" />
            </div>
            <span className="inv-doc-line-total">{result ? <>{format.money(result.total)}<small className="muted">{format.qty(result.base, ingredient!.baseUnit)}</small></> : '—'}</span>
            <button type="button" className="icon-button" aria-label={text(`شيل ${name}`, `Remove ${name}`)} onClick={() => setLines(current => current && current.length > 1 ? current.filter(entry => entry.key !== line.key) : [emptyLine()])}>
              <TrashIcon size={18} aria-hidden="true" />
            </button>
            {duplicate.has(line.ingredientId) && <p className="field-error inv-line-error">{text('الخامة دي في سطر تاني. اجمعهم في سطر واحد.', 'This ingredient is on another line. Combine them.')}</p>}
          </div>;
        })}
        <Button small variant="ghost" icon={<PlusIcon size={16} weight="bold" aria-hidden="true" />} onClick={() => setLines(current => [...(current ?? []), emptyLine()])}
          disabled={(lines.length ?? 0) >= INVENTORY_LIMITS.documentLines} data-testid="purchase-add-line">{text('ضيف صنف', 'Add a line')}</Button>
      </fieldset>}
      <div className="inv-doc-total" aria-live="polite"><span>{text('إجمالي الفاتورة', 'Invoice total')}</span><strong data-testid="purchase-total">{format.money(total)}</strong></div>
      {tried && !valid && <Alert kind="error">{filled.length === 0 ? text('ضيف صنف واحد على الأقل بكميته وسعره.', 'Add at least one line with its quantity and price.') : text('في سطور محتاجة خامة وكمية وسعر صح.', 'Some lines need an ingredient, a quantity and a valid price.')}</Alert>}
      {!actions.costs && <p className="muted">{text('الأسعار بتتسجل في الفاتورة بس مش هتظهر لك بعد الحفظ (محتاجة صلاحية التكاليف).', 'Prices are recorded with the invoice but are not shown to you afterwards (they need the costs permission).')}</p>}
    </div>
  </Dialog>;
}

/** One delivery: lines, totals and cost per unit, its history, and receive / void. */
function PurchaseDetailDialog({ purchaseId, onClose, onEdit }: { purchaseId: string | null; onClose: () => void; onEdit: (detail: PurchaseDetail) => void }) {
  const { text } = useLanguage();
  const format = useInventoryFormat();
  const actions = useInventoryActions();
  const toast = useToast();
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: inventoryKeys.purchase(purchaseId ?? ''), queryFn: () => inventoryApi.purchase(purchaseId!), enabled: Boolean(purchaseId) });
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  useEffect(() => { setVoiding(false); setReason(''); }, [purchaseId]);
  const done = (saved: PurchaseDetail, message: string) => {
    queryClient.setQueryData(inventoryKeys.purchase(saved.id), saved);
    void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    toast.success(message);
  };
  const receive = useMutation({ mutationFn: (id: string) => inventoryApi.receivePurchase(id), onSuccess: saved => done(saved, text('اتستلمت ودخلت المخزون', 'Received into stock')), onError: failure => toast.error(errorMessage(failure, text)) });
  const voidIt = useMutation({
    mutationFn: (id: string) => inventoryApi.voidPurchase(id, reason.trim()),
    onSuccess: saved => { done(saved, saved.receivedAt ? text('اتلغت والمخزون رجع زي ما كان', 'Voided and taken back out of stock') : text('اتلغت المسودة', 'Draft voided')); setVoiding(false); },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  const data = detail.data;
  return <Dialog open={Boolean(purchaseId)} onClose={onClose} size="wide" busy={receive.isPending || voidIt.isPending}
    title={data ? <>{text('استلام من ', 'Delivery from ')}<bdi>{data.supplier?.name ?? text('من غير مورد', 'no supplier')}</bdi></> : text('الاستلام', 'Delivery')}
    footer={<>
      {data && actions.operate && data.status !== 'VOID' && !voiding && <Button variant="danger-outline" className="spacer" onClick={() => setVoiding(true)} icon={<ProhibitIcon size={16} aria-hidden="true" />}>{text('إلغاء الاستلام', 'Void')}</Button>}
      {data?.status === 'DRAFT' && actions.operate && <Button variant="ghost" onClick={() => onEdit(data)}>{text('عدّل', 'Edit')}</Button>}
      <Button variant="secondary" onClick={onClose}>{text('إغلاق', 'Close')}</Button>
      {data?.status === 'DRAFT' && actions.operate && <Button loading={receive.isPending} onClick={() => receive.mutate(data.id)} data-testid="purchase-detail-receive">{text('استلم دلوقتي', 'Receive now')}</Button>}
    </>}>
    {detail.isPending && <div className="skeleton-stack"><Skeleton height={60} /><Skeleton height={160} /></div>}
    {detail.isError && <ErrorPanel error={detail.error} onRetry={() => void detail.refetch()} />}
    {data && <div className="inv-detail" data-testid="purchase-detail">
      <div className="inv-detail-meta"><PurchaseStatusBadge status={data.status} /><span className="muted"><bdi>{data.branchName}</bdi>{data.invoiceNumber && <> · <span className="ltr">{data.invoiceNumber}</span></>} · {format.date(data.invoiceDate ?? data.createdAt)}</span></div>
      <div className="table-scroll"><table className="data-table inv-table is-plain">
        <thead><tr>
          <th scope="col">{text('الخامة', 'Ingredient')}</th><th scope="col">{text('الكمية', 'Quantity')}</th>
          {actions.costs && <th scope="col">{text('سعر الوحدة', 'Unit price')}</th>}{actions.costs && <th scope="col">{text('الإجمالي', 'Total')}</th>}{actions.costs && <th scope="col">{text('التكلفة', 'Cost')}</th>}
        </tr></thead>
        <tbody>{data.lines.map(line => <tr key={line.id} data-testid="purchase-detail-line">
          <td className="cell-primary"><bdi>{format.name(line.nameAr, line.nameEn)}</bdi></td>
          <td className="cell-end cell-nowrap">{line.unitNameAr ? <>{format.language === 'ar' ? new Intl.NumberFormat('ar-EG').format(line.quantity) : line.quantity} <bdi>{format.name(line.unitNameAr, line.unitNameEn)}</bdi><small>{format.qty(line.baseQuantity, line.baseUnit)}</small></> : format.qty(line.baseQuantity, line.baseUnit)}</td>
          {actions.costs && <td className="cell-nowrap">{format.money(line.unitPrice)}</td>}
          {actions.costs && <td className="cell-nowrap cell-amount">{format.money(line.lineTotal)}</td>}
          {actions.costs && <td className="cell-nowrap">{format.unitCost(line.unitCost, line.baseUnit)}</td>}
          <CompactMeta parts={actions.costs ? [format.money(line.lineTotal), format.unitCost(line.unitCost, line.baseUnit)] : []} />
        </tr>)}</tbody>
      </table></div>
      {actions.costs && <div className="inv-doc-total"><span>{text('الإجمالي', 'Total')}</span><strong>{format.money(data.total)}</strong></div>}
      <ol className="cash-history inv-history">
        <li><time>{format.dateTime(data.createdAt)}</time><span>{text('اتسجلت', 'Recorded')}{data.createdBy && <> · <bdi>{data.createdBy}</bdi></>}</span></li>
        {data.receivedAt && <li><time>{format.dateTime(data.receivedAt)}</time><span>{text('اتستلمت ودخلت المخزون', 'Received into stock')}{data.receivedBy && <> · <bdi>{data.receivedBy}</bdi></>}</span></li>}
        {data.voidedAt && <li><time>{format.dateTime(data.voidedAt)}</time><span>{text('اتلغت', 'Voided')}{data.voidedBy && <> · <bdi>{data.voidedBy}</bdi></>}{data.voidReason && <> — <bdi>{data.voidReason}</bdi></>}</span></li>}
      </ol>
      {data.note && <p className="cash-note"><span>{text('ملاحظة:', 'Note:')}</span> <bdi>{data.note}</bdi></p>}
      {voiding && <form className="cash-correction" onSubmit={event => { event.preventDefault(); if (reason.trim().length >= 3) voidIt.mutate(data.id); }}>
        <p>{data.status === 'RECEIVED' ? text('الإلغاء بيطلّع الكميات دي من المخزون تاني بنفس التكلفة.', 'Voiding takes these quantities back out of stock at the same cost.') : text('المسودة هتتلغي من غير ما تأثر على المخزون.', 'The draft is voided without touching stock.')}</p>
        <Field label={text('السبب', 'Reason')} required hint={text('٣ حروف على الأقل', 'At least 3 characters')}>
          <input className="input" maxLength={INVENTORY_LIMITS.noteLength} value={reason} onChange={event => setReason(event.target.value)} data-autofocus />
        </Field>
        <div className="cash-actions">
          <Button small variant="secondary" onClick={() => setVoiding(false)}>{text('رجوع', 'Back')}</Button>
          <Button small type="submit" variant="danger" loading={voidIt.isPending} disabled={reason.trim().length < 3}>{text('ألغِ الاستلام', 'Void delivery')}</Button>
        </div>
      </form>}
    </div>}
  </Dialog>;
}
