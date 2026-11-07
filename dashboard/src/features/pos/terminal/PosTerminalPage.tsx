import { useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  ArrowsInIcon, ArrowsOutIcon, ChairIcon, ForkKnifeIcon, MagnifyingGlassIcon, MinusIcon, NotePencilIcon, PercentIcon, PlusIcon, ReceiptIcon, ShoppingBagIcon, TrashIcon, WifiSlashIcon, XIcon,
} from '@phosphor-icons/react';
import type { BranchMenuItem, OrderType, PosOrderInput, PosTotals } from '@bilhanah/contracts';
import { Button } from '../../../components/Button';
import { Dialog } from '../../../components/Dialog';
import { ErrorPanel } from '../../../components/ErrorBoundary';
import { Skeleton } from '../../../components/Skeleton';
import { useToast } from '../../../components/Toast';
import { branchesApi, ordersApi, posApi } from '../../../lib/api/endpoints';
import { errorMessage } from '../../../lib/api/error-messages';
import { egpToPiastres, formatPrice } from '../../../lib/format';
import { useLanguage, usePageTitle } from '../../../lib/language';
import { BranchPicker, usePageBranch } from '../../branches/BranchScope';
import { useWorkspace } from '../../branches/workspace';
import { loadDevice, newKey } from '../device';
import { posKeys } from '../PosPage';
import { PaymentDialog } from './PaymentDialog';
import './terminal.css';

type Line = { key: string; item: BranchMenuItem; variantId: string; quantity: number; note: string };
type Discount = { kind: 'PERCENT' | 'AMOUNT'; value: number; reason: string } | null;

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

/**
 * The cashier terminal (docs/POS.md, task 4): the branch's menu as a touch grid, a cart priced by the
 * server, dine-in on a table or takeaway, orders straight to the kitchen, and payment. Online only:
 * while offline nothing can be sent (offline mode is a later phase).
 */
export function PosTerminalPage() {
  const { text, language, menuName } = useTerminalText();
  usePageTitle('شاشة الكاشير', 'POS terminal');
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useWorkspace();
  const page = usePageBranch();
  const branchId = page.branchId;
  const online = useOnline();
  const device = loadDevice();
  const pos = useQuery({ queryKey: posKeys.overview, queryFn: posApi.get });
  const menu = useQuery({ queryKey: ['pos', 'menu', branchId], queryFn: () => branchesApi.menu(branchId!), enabled: Boolean(branchId), refetchInterval: 60_000 });
  const floor = useQuery({ queryKey: ['pos', 'floor', branchId], queryFn: () => ordersApi.floor(branchId), enabled: Boolean(branchId), refetchInterval: 20_000 });
  const [category, setCategory] = useState<string | 'all'>('all');
  const [search, setSearch] = useState('');
  const [type, setType] = useState<OrderType>('DINE_IN');
  const [tableId, setTableId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [orderNote, setOrderNote] = useState('');
  const [customer, setCustomer] = useState('');
  const [discount, setDiscount] = useState<Discount>(null);
  const [picking, setPicking] = useState<BranchMenuItem | null>(null);
  const [tablesOpen, setTablesOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [noteFor, setNoteFor] = useState<Line | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // One key per order being built: retries never place it twice.
  const orderKey = useRef(newKey('pos'));

  const categories = useMemo(() => (menu.data?.categories ?? []).filter(entry => entry.isVisible && entry.items.some(item => item.effective.visible)), [menu.data]);
  const items = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return categories.filter(entry => category === 'all' || entry.id === category).flatMap(entry => entry.items.filter(item => item.effective.visible))
      .filter(item => !needle || `${item.nameAr} ${item.nameEn ?? ''}`.toLowerCase().includes(needle));
  }, [categories, category, search]);
  const table = floor.data?.find(entry => entry.id === tableId) ?? null;
  const input: PosOrderInput | null = lines.length && (type === 'PICKUP' || tableId) ? {
    type, ...(type === 'DINE_IN' && tableId ? { tableId } : {}), ...(branchId && type === 'PICKUP' ? { branchId } : {}),
    items: lines.map(line => ({ menuItemId: line.item.id, variantId: line.variantId, quantity: line.quantity, ...(line.note.trim() && { note: line.note.trim() }) })),
    ...(customer.trim() && { customerName: customer.trim() }), ...(orderNote.trim() && { note: orderNote.trim() }), ...(discount && { discount }),
  } : null;
  const quote = useQuery({
    queryKey: ['pos', 'quote', input], queryFn: () => posApi.quote(input!), enabled: Boolean(input) && online, placeholderData: keepPreviousData, retry: false,
  });
  const totals: PosTotals | null = input ? quote.data ?? null : null;
  const localSubtotal = lines.reduce((sum, line) => sum + priceOf(line) * line.quantity, 0);

  const place = useMutation<Awaited<ReturnType<typeof posApi.placeOrder>>, Error, boolean>({
    mutationFn: () => posApi.placeOrder(input!, orderKey.current, device?.key),
    onSuccess: (order, payNow) => {
      orderKey.current = newKey('pos');
      setLines([]); setOrderNote(''); setCustomer(''); setDiscount(null);
      if (type === 'PICKUP') setTableId(null);
      void queryClient.invalidateQueries({ queryKey: ['pos', 'floor'] });
      void queryClient.invalidateQueries({ queryKey: ['pos', 'orders'] });
      toast.success(text(`طلب #${order.number} راح للمطبخ`, `Order #${order.number} sent to the kitchen`));
      if (payNow) setPaying(order.id);
    },
    onError: failure => toast.error(errorMessage(failure, text)),
  });

  function add(item: BranchMenuItem, variantId: string) {
    setLines(current => {
      const existing = current.find(line => line.item.id === item.id && line.variantId === variantId && !line.note);
      if (existing) return current.map(line => (line === existing ? { ...line, quantity: Math.min(99, line.quantity + 1) } : line));
      return [...current, { key: `${item.id}:${variantId}:${Date.now()}`, item, variantId, quantity: 1, note: '' }];
    });
  }
  const tap = (item: BranchMenuItem) => {
    if (!item.effective.available) return;
    const variants = item.effective.variants;
    if (variants.length > 1) setPicking(item);
    else if (variants[0]) add(item, variants[0].id);
  };
  const setQuantity = (key: string, quantity: number) => setLines(current => (quantity <= 0 ? current.filter(line => line.key !== key) : current.map(line => (line.key === key ? { ...line, quantity: Math.min(99, quantity) } : line))));
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) { await document.exitFullscreen(); setFullscreen(false); }
      else { await rootRef.current?.requestFullscreen(); setFullscreen(true); }
    } catch { /* Not available: the page keeps working in the window. */ }
  };
  const money = (piastres: number) => formatPrice(piastres, language);

  if (pos.data && pos.data.status !== 'ACTIVE') {
    return <div className="page"><section className="card pos-state"><h2>{text('الكاشير مش مفعّل', 'The POS is not active')}</h2>
      {can('pos.settings') && <Link className="button button-primary" to="/pos">{text('فعّله', 'Set it up')}</Link>}</section></div>;
  }
  return <div className={`pt-root ${fullscreen ? 'is-fullscreen' : ''}`} ref={rootRef} data-testid="pos-terminal">
    <header className="pt-bar">
      <div className="pt-types" role="radiogroup" aria-label={text('نوع الطلب', 'Order type')}>
        <button type="button" role="radio" aria-checked={type === 'DINE_IN'} className={type === 'DINE_IN' ? 'active' : ''} onClick={() => setType('DINE_IN')}><ChairIcon size={20} aria-hidden="true" />{text('صالة', 'Dine-in')}</button>
        <button type="button" role="radio" aria-checked={type === 'PICKUP'} className={type === 'PICKUP' ? 'active' : ''} onClick={() => setType('PICKUP')}><ShoppingBagIcon size={20} aria-hidden="true" />{text('تيك أواي', 'Takeaway')}</button>
      </div>
      {type === 'DINE_IN' && <button type="button" className={`pt-table-button ${table ? 'is-set' : ''}`} onClick={() => setTablesOpen(true)} data-testid="pos-table">
        <ChairIcon size={18} aria-hidden="true" />{table ? <bdi>{table.label}</bdi> : text('اختار طاولة', 'Choose a table')}
      </button>}
      {page.needsPicker && branchId && <BranchPicker value={branchId} onChange={page.pick} />}
      <span className="pt-spacer" />
      {!online && <span className="pt-offline" role="status"><WifiSlashIcon size={18} aria-hidden="true" />{text('مفيش نت: مش هنقدر نبعت طلبات', 'Offline: orders cannot be sent')}</span>}
      {device && <span className="pt-device" title={text('الجهاز', 'Device')}>{device.name}</span>}
      <button type="button" className="pt-icon" onClick={() => setHistoryOpen(true)} aria-label={text('الطلبات المفتوحة', 'Open orders')}><ReceiptIcon size={20} aria-hidden="true" /></button>
      <button type="button" className="pt-icon" onClick={() => void toggleFullscreen()} aria-label={fullscreen ? text('خروج من ملء الشاشة', 'Exit full screen') : text('ملء الشاشة', 'Full screen')}>{fullscreen ? <ArrowsInIcon size={20} aria-hidden="true" /> : <ArrowsOutIcon size={20} aria-hidden="true" />}</button>
    </header>

    <div className="pt-body">
      <nav className="pt-categories" aria-label={text('الأقسام', 'Categories')}>
        <button type="button" className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}>{text('الكل', 'All')}</button>
        {categories.map(entry => <button key={entry.id} type="button" className={category === entry.id ? 'active' : ''} onClick={() => setCategory(entry.id)}>{language === 'en' ? entry.nameEn || entry.nameAr : entry.nameAr}</button>)}
      </nav>

      <section className="pt-menu" aria-label={text('الأصناف', 'Dishes')}>
        <label className="pt-search"><MagnifyingGlassIcon size={18} aria-hidden="true" /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={text('دوّر على صنف', 'Search dishes')} aria-label={text('بحث', 'Search')} /></label>
        {menu.isError && <ErrorPanel error={menu.error} onRetry={() => void menu.refetch()} />}
        {menu.isPending && <div className="pt-grid">{Array.from({ length: 8 }, (_, index) => <Skeleton key={index} height={150} radius={18} />)}</div>}
        {menu.data && <div className="pt-grid">{items.map(item => {
          const variants = item.effective.variants;
          const from = Math.min(...variants.map(variant => variant.pricePiastres));
          return <button key={item.id} type="button" className={`pt-item ${item.effective.available ? '' : 'is-out'}`} onClick={() => tap(item)} disabled={!item.effective.available} data-testid="pos-item">
            <span className="pt-item-image">{item.image ? <img src={item.image.sources[0]?.url ?? item.image.url} alt="" loading="lazy" /> : <ForkKnifeIcon size={28} aria-hidden="true" />}</span>
            <span className="pt-item-name">{menuName(item)}</span>
            <span className="pt-item-price">{variants.length > 1 && text('من ', 'from ')}{money(from)}</span>
            {!item.effective.available && <span className="pt-item-out">{text('خلصان', 'Sold out')}</span>}
          </button>;
        })}{items.length === 0 && <p className="pt-muted">{text('مفيش أصناف.', 'No dishes.')}</p>}</div>}
      </section>

      <aside className="pt-cart" aria-label={text('الطلب', 'Order')}>
        <header className="pt-cart-head"><h2>{text('الطلب', 'Order')}</h2>{lines.length > 0 && <button type="button" className="pt-link" onClick={() => { setLines([]); setDiscount(null); }}>{text('امسح', 'Clear')}</button>}</header>
        {lines.length === 0 ? <p className="pt-empty">{text('دوس على صنف عشان تضيفه.', 'Tap a dish to add it.')}</p> : <ul className="pt-lines">{lines.map(line => {
          const variant = line.item.effective.variants.find(entry => entry.id === line.variantId);
          return <li key={line.key} data-testid="pos-line">
            <div className="pt-line-main">
              <strong>{menuName(line.item)}{line.item.effective.variants.length > 1 && variant && <small> · {language === 'en' ? variant.nameEn || variant.nameAr : variant.nameAr}</small>}</strong>
              {line.note && <small className="pt-line-note">{line.note}</small>}
              <span className="pt-line-actions">
                <button type="button" onClick={() => setNoteFor(line)} aria-label={text('ملاحظة', 'Note')}><NotePencilIcon size={16} aria-hidden="true" /></button>
                <button type="button" onClick={() => setQuantity(line.key, 0)} aria-label={text('شيل', 'Remove')}><TrashIcon size={16} aria-hidden="true" /></button>
              </span>
            </div>
            <div className="pt-stepper">
              <button type="button" onClick={() => setQuantity(line.key, line.quantity - 1)} aria-label={text('أقل', 'Fewer')}><MinusIcon size={16} aria-hidden="true" /></button>
              <span>{line.quantity}</span>
              <button type="button" onClick={() => setQuantity(line.key, line.quantity + 1)} aria-label={text('أكتر', 'More')}><PlusIcon size={16} aria-hidden="true" /></button>
            </div>
            <span className="pt-line-total">{money(priceOf(line) * line.quantity)}</span>
          </li>;
        })}</ul>}
        <div className="pt-cart-extra">
          <input className="input" placeholder={text('اسم الزبون (اختياري)', 'Customer name (optional)')} value={customer} onChange={event => setCustomer(event.target.value)} maxLength={60} />
          <input className="input" placeholder={text('ملاحظة للمطبخ', 'Note for the kitchen')} value={orderNote} onChange={event => setOrderNote(event.target.value)} maxLength={300} />
        </div>
        <dl className="pt-totals" aria-live="polite">
          <div><dt>{text('الإجمالي', 'Subtotal')}</dt><dd>{money(totals?.subtotalPiastres ?? localSubtotal)}</dd></div>
          <div><dt><button type="button" className="pt-link" onClick={() => setDiscountOpen(true)} disabled={!lines.length}><PercentIcon size={14} aria-hidden="true" />{discount ? text('الخصم', 'Discount') : text('أضف خصم', 'Add discount')}</button></dt><dd>{totals?.discountPiastres ? `−${money(totals.discountPiastres)}` : '—'}</dd></div>
          {Boolean(totals?.serviceChargePiastres) && <div><dt>{text('خدمة', 'Service')}</dt><dd>{money(totals!.serviceChargePiastres)}</dd></div>}
          {Boolean(totals?.taxPiastres) && <div><dt>{totals!.taxInclusive ? text('ضريبة (شاملة)', 'Tax (included)') : text('ضريبة', 'Tax')}</dt><dd>{money(totals!.taxPiastres)}</dd></div>}
          <div className="pt-grand"><dt>{text('المطلوب', 'Total')}</dt><dd data-testid="pos-total">{totals ? money(totals.totalPiastres) : input ? '…' : money(localSubtotal)}</dd></div>
        </dl>
        {quote.isError && <p className="field-error">{errorMessage(quote.error, text)}</p>}
        {type === 'DINE_IN' && !tableId && lines.length > 0 && <p className="pt-hint">{text('اختار الطاولة الأول.', 'Choose the table first.')}</p>}
        <div className="pt-cart-actions">
          <Button variant="secondary" disabled={!input || !online || quote.isError} loading={place.isPending && !place.variables} onClick={() => place.mutate(false)} data-testid="pos-send">{text('ابعت للمطبخ', 'Send to kitchen')}</Button>
          <Button disabled={!input || !online || quote.isError || !can('payments.process')} loading={place.isPending && Boolean(place.variables)} onClick={() => place.mutate(true)} data-testid="pos-send-pay">{text('ابعت وادفع', 'Send & pay')}</Button>
        </div>
      </aside>
    </div>

    {picking && <Dialog open onClose={() => setPicking(null)} title={menuName(picking)} size="small">
      <div className="pt-variants">{picking.effective.variants.map(variant => <button key={variant.id} type="button" onClick={() => { add(picking, variant.id); setPicking(null); }}>
        <span>{language === 'en' ? variant.nameEn || variant.nameAr : variant.nameAr}</span><strong>{money(variant.pricePiastres)}</strong>
      </button>)}</div>
    </Dialog>}
    {tablesOpen && <Dialog open onClose={() => setTablesOpen(false)} title={text('اختار الطاولة', 'Choose the table')} size="wide">
      {floor.isPending ? <Skeleton height={200} /> : <div className="pt-tables">{(floor.data ?? []).map(entry => <button key={entry.id} type="button" className={`pt-table is-${entry.status.toLowerCase()} ${entry.id === tableId ? 'active' : ''}`} onClick={() => { setTableId(entry.id); setTablesOpen(false); }} data-testid="pos-table-option">
        <strong><bdi>{entry.label}</bdi></strong><small>{entry.occupied ? text(`مشغولة · ${money(entry.unpaidPiastres)}`, `Occupied · ${money(entry.unpaidPiastres)}`) : text(`${entry.seats} أفراد`, `${entry.seats} seats`)}</small>
      </button>)}</div>}
    </Dialog>}
    {discountOpen && <DiscountDialog current={discount} onSave={setDiscount} onClose={() => setDiscountOpen(false)} />}
    {noteFor && <NoteDialog line={noteFor} onSave={note => setLines(current => current.map(line => (line.key === noteFor.key ? { ...line, note } : line)))} onClose={() => setNoteFor(null)} />}
    {historyOpen && <OpenOrders branchId={branchId} onPay={orderId => { setHistoryOpen(false); setPaying(orderId); }} onClose={() => setHistoryOpen(false)} />}
    {paying && <PaymentDialog orderId={paying} methods={pos.data?.settings.paymentMethods ?? ['CASH']} onClose={() => { setPaying(null); void queryClient.invalidateQueries({ queryKey: ['pos', 'floor'] }); }} />}
  </div>;
}

function priceOf(line: Line) {
  return line.item.effective.variants.find(variant => variant.id === line.variantId)?.pricePiastres ?? 0;
}

function useTerminalText() {
  const { text, language } = useLanguage();
  return { text, language, menuName: (item: { nameAr: string; nameEn: string | null }) => (language === 'en' ? item.nameEn || item.nameAr : item.nameAr) };
}

function DiscountDialog({ current, onSave, onClose }: { current: Discount; onSave: (discount: Discount) => void; onClose: () => void }) {
  const { text } = useLanguage();
  const [kind, setKind] = useState<'PERCENT' | 'AMOUNT'>(current?.kind ?? 'PERCENT');
  const [value, setValue] = useState(current ? (current.kind === 'AMOUNT' ? String(current.value / 100) : String(current.value)) : '');
  const [reason, setReason] = useState(current?.reason ?? '');
  const parsed = kind === 'PERCENT' ? Math.round(Number(value)) : (egpToPiastres(value) ?? 0);
  const valid = parsed > 0 && (kind === 'AMOUNT' || parsed <= 100) && reason.trim().length >= 2;
  return <Dialog open onClose={onClose} title={text('خصم على الطلب', 'Order discount')} size="small" onSubmit={() => { if (valid) { onSave({ kind, value: parsed, reason: reason.trim() }); onClose(); } }}
    footer={<>{current && <Button variant="secondary" onClick={() => { onSave(null); onClose(); }}>{text('شيل الخصم', 'Remove')}</Button>}<Button type="submit" disabled={!valid}>{text('طبّق', 'Apply')}</Button></>}>
    <div className="segmented"><label><input type="radio" checked={kind === 'PERCENT'} onChange={() => setKind('PERCENT')} />{text('نسبة ٪', 'Percent')}</label><label><input type="radio" checked={kind === 'AMOUNT'} onChange={() => setKind('AMOUNT')} />{text('مبلغ', 'Amount')}</label></div>
    <label className="field"><span className="field-label">{kind === 'PERCENT' ? text('النسبة', 'Percent') : text('المبلغ بالجنيه', 'Amount (EGP)')}</span><input className="input ltr" inputMode="decimal" value={value} onChange={event => setValue(event.target.value)} /></label>
    <label className="field"><span className="field-label">{text('السبب', 'Reason')}</span><input className="input" maxLength={200} value={reason} onChange={event => setReason(event.target.value)} /></label>
    <p className="field-hint">{text('الخصم الكبير محتاج صلاحية المدير، والسيرفر بيتأكد.', 'Large discounts need a manager; the server checks.')}</p>
  </Dialog>;
}

function NoteDialog({ line, onSave, onClose }: { line: Line; onSave: (note: string) => void; onClose: () => void }) {
  const { text } = useLanguage();
  const [note, setNote] = useState(line.note);
  return <Dialog open onClose={onClose} title={text('ملاحظة على الصنف', 'Dish note')} size="small" onSubmit={() => { onSave(note.trim()); onClose(); }} footer={<Button type="submit">{text('حفظ', 'Save')}</Button>}>
    <input className="input" autoFocus maxLength={200} value={note} onChange={event => setNote(event.target.value)} placeholder={text('مثلًا: من غير بصل', 'e.g. no onions')} />
  </Dialog>;
}

/** The branch's open orders (unpaid or in the kitchen), to take payment later or print again. */
function OpenOrders({ branchId, onPay, onClose }: { branchId: string | null; onPay: (orderId: string) => void; onClose: () => void }) {
  const { text, language } = useLanguage();
  const orders = useQuery({ queryKey: ['pos', 'orders', branchId], queryFn: () => ordersApi.list({ view: 'active', pageSize: 100, branchId }) });
  const recent = useQuery({ queryKey: ['pos', 'orders', 'history', branchId], queryFn: () => ordersApi.list({ view: 'history', pageSize: 30, branchId }) });
  const rows = [...(orders.data?.items ?? []), ...(recent.data?.items ?? []).filter(order => !order.paidAt && order.status === 'COMPLETED')];
  return <Dialog open onClose={onClose} size="wide" title={text('الطلبات المفتوحة', 'Open orders')}>
    {orders.isPending ? <Skeleton height={200} /> : rows.length === 0 ? <p className="pt-muted">{text('مفيش طلبات مفتوحة.', 'No open orders.')}</p>
      : <ul className="pt-history">{rows.map(order => <li key={order.id}>
        <span><strong>#{order.number}</strong> · {order.tableLabel ? <bdi>{order.tableLabel}</bdi> : text('تيك أواي', 'Takeaway')} · {order.channel === 'POS' ? text('كاشير', 'POS') : text('منيو QR', 'QR menu')}<small>{order.paidAt ? text('مدفوع', 'Paid') : text('مش مدفوع', 'Unpaid')}</small></span>
        <strong>{formatPrice(order.totalPiastres, language)}</strong>
        <Button small variant={order.paidAt ? 'secondary' : 'primary'} onClick={() => onPay(order.id)}>{order.paidAt ? text('الإيصال', 'Receipt') : text('ادفع', 'Pay')}</Button>
      </li>)}</ul>}
  </Dialog>;
}
