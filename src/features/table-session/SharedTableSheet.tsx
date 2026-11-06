import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRightIcon, CheckCircleIcon, ClockIcon, PencilSimpleIcon, UsersThreeIcon, WarningCircleIcon, XIcon } from '@phosphor-icons/react';
import { isExtraMenuLanguage, menuName, type MenuLanguage, type OrderStatus, type PublicMenuItem, type SubmitTableSessionResponse, type TableGuest, type TableSessionItem, type TableSessionView } from '@bilhanah/contracts';
import { ApiError } from '../../lib/api';
import { arabicCount, useLanguage, type Language } from '../../lib/language';
import { formatPrice, localized } from '../restaurant-menu/menu-format';
import { QuantityStepper } from '../restaurant-menu/ordering/QuantityStepper';
import { tableName } from '../restaurant-menu/ordering/use-table';
import type { SharedTable } from './use-shared-table';
import './table-session.css';

type Text = (ar: string, en: string) => string;
type MenuItems = ReadonlyMap<string, PublicMenuItem>;

/**
 * A line's dish and size names. The table's order keeps Arabic and English copies; in an extra
 * language they come from the menu, while the dish is still on it.
 */
function lineNames(item: TableSessionItem, menuItems: MenuItems | undefined, language: Language, menuLanguage: MenuLanguage) {
  const dish = isExtraMenuLanguage(menuLanguage) ? menuItems?.get(item.menuItemId) : undefined;
  const variant = dish?.variants.find(candidate => candidate.id === item.variantId);
  return {
    name: dish ? menuName(dish, menuLanguage) : localized(language, item.nameAr, item.nameEn),
    size: variant ? (dish!.variants.length > 1 ? menuName(variant, menuLanguage) : null) : localized(language, item.variantNameAr, item.variantNameEn),
  };
}

/** "أنت", the name a guest gave, or "ضيف ٢" / "Guest 2". */
export function useGuestName() {
  const { text, digits } = useLanguage();
  return (guest: Pick<TableGuest, 'number' | 'name'> & { me?: boolean }, mine = false) =>
    mine || guest.me ? text('أنت', 'You') : guest.name ?? text(`ضيف ${digits(guest.number)}`, `Guest ${guest.number}`);
}

const ORDER_STATUS_TEXT: Record<OrderStatus, [string, string]> = {
  PLACED: ['وصل للمطعم', 'Sent'],
  ACCEPTED: ['اتقبل', 'Accepted'],
  PREPARING: ['بيتحضّر', 'Preparing'],
  READY: ['جاهز', 'Ready'],
  COMPLETED: ['اتقدّم', 'Served'],
  REJECTED: ['اترفض', 'Rejected'],
  CANCELLED: ['اتلغى', 'Cancelled'],
};

/** What went wrong, for the guest. */
export function sharedErrorText(error: unknown, text: Text): string {
  const code = error instanceof ApiError ? error.code : 'NETWORK_ERROR';
  switch (code) {
    case 'TABLE_SESSION_CLOSED': return text('طلب الطاولة اتقفل. امسح كود الطاولة تاني عشان تبدأ طلب جديد.', 'The table’s order is closed. Scan the table again to start a new one.');
    case 'TABLE_SESSION_CLOSING': return text('الطاولة طلبت الحساب، فمش هينفع تضيف أصناف. اطلب من الويتر لو عايز حاجة كمان.', 'The table asked for the bill, so no more dishes can be added. Ask the staff if you want more.');
    case 'TABLE_SESSION_ITEM_NOT_YOURS': return text('الصنف ده ضافه ضيف تاني، وهو بس اللي يقدر يغيّره.', 'Another guest added this dish; only they can change it.');
    case 'TABLE_SESSION_ITEM_SUBMITTED': return text('الصنف ده اتبعت للمطعم خلاص ومينفعش يتغيّر من هنا.', 'This dish was already sent to the restaurant and cannot change here.');
    case 'TABLE_SESSION_ITEM_STALE': return text('حد تاني غيّر في الطلب دلوقتي. راجعه وجرّب تاني.', 'Someone else just changed the order. Check it and try again.');
    case 'TABLE_SESSION_PRICES_CHANGED': return text('الأسعار أو الطلب اتغيّروا. راجع الإجمالي الجديد وابعت تاني.', 'Prices or the order changed. Check the new total and send again.');
    case 'TABLE_SESSION_NOTHING_TO_SUBMIT': return text('مفيش أصناف لسه ما اتبعتتش.', 'There are no unsent dishes.');
    case 'TABLE_SESSION_ITEMS_FULL': return text('الطلب وصل لأقصى عدد أصناف.', 'The order has reached the maximum number of dishes.');
    case 'ITEMS_UNAVAILABLE': return text('فيه أصناف مبقتش متاحة. شيلها وجرّب تاني.', 'Some dishes are no longer available. Remove them and try again.');
    case 'ORDERING_UNAVAILABLE': return text('المطعم وقّف الطلبات من الموبايل مؤقتًا. اطلب من الويتر.', 'The restaurant paused online orders. Please ask the staff.');
    case 'RESTAURANT_CLOSED': return text('المطعم مقفول دلوقتي.', 'The restaurant is closed now.');
    case 'RATE_LIMITED': return text('طلبات كتير من نفس الشبكة. استنى دقيقة وجرّب تاني.', 'Too many requests from this network. Wait a minute and try again.');
    default: return text('مقدرناش نوصل للمطعم. اتأكد من النت وجرّب تاني، الطلب مش هيتكرر.', 'We could not reach the restaurant. Check your connection and try again; nothing will be sent twice.');
  }
}

type Confirm = { scope: 'MINE' | 'TABLE'; items: TableSessionItem[]; total: number };

/** The table's shared order: who added what, what is sent, and sending with a confirmation first. */
export function SharedTableSheet({ shared, view, menuItems, onSent, onClose }: { shared: SharedTable; view: TableSessionView; menuItems?: MenuItems; onSent: (sent: SubmitTableSessionResponse) => void; onClose: () => void }) {
  const { text, language, number } = useLanguage();
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const guestName = useGuestName();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState(view.me.name ?? '');
  useEffect(() => { dialogRef.current?.showModal(); }, []);
  const close = () => { if (!shared.busy) dialogRef.current?.close(); };
  const price = (piastres: number) => `${formatPrice(piastres, language)} ${text('ج.م', 'EGP')}`;
  const act = (change: () => Promise<unknown>) => { setError(null); change().catch(caught => setError(sharedErrorText(caught, text))); };

  const drafts = view.items.filter(item => item.status === 'DRAFT');
  const sent = view.items.filter(item => item.status === 'SUBMITTED');
  const mine = drafts.filter(item => item.mine);
  const active = view.status === 'ACTIVE';
  const table = tableName(view.table.label, language);

  // The confirmation shows the dishes as they are now: someone else may change theirs meanwhile.
  const liveConfirm = confirm && (() => {
    const items = confirm.scope === 'MINE' ? mine : drafts;
    return { ...confirm, items, total: items.reduce((sum, item) => sum + item.lineTotalPiastres, 0) };
  })();

  async function send() {
    if (!liveConfirm) return;
    setError(null);
    try {
      const response = await shared.submit(liveConfirm.scope, liveConfirm.total);
      setConfirm(null);
      onSent(response);
    } catch (caught) {
      setError(sharedErrorText(caught, text));
    }
  }

  return <dialog ref={dialogRef} className="dish-sheet order-sheet shared-sheet" aria-labelledby={`${id}-title`} onClose={onClose}
    onCancel={event => { if (shared.busy) event.preventDefault(); }}
    onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="order-sheet-body">
      <header className="order-sheet-header">
        {liveConfirm && <button type="button" className="icon-button" onClick={() => setConfirm(null)} disabled={shared.busy} aria-label={text('رجوع', 'Back')}><ArrowRightIcon size={20} className="directional-arrow" /></button>}
        <h2 id={`${id}-title`} tabIndex={-1}>{liveConfirm ? text('تأكيد الإرسال', 'Confirm and send') : text(`طلب ${table}`, `${table} order`)}</h2>
        <button type="button" className="icon-button" onClick={close} disabled={shared.busy} aria-label={text('إغلاق', 'Close')}><XIcon size={20} /></button>
      </header>

      {liveConfirm ? <>
        <div className="order-sheet-content">
          <p className="shared-confirm-lead">{liveConfirm.scope === 'MINE'
            ? text('الأصناف دي هتتبعت للمطبخ باسمك. بعد ما تتبعت مش هينفع تغيّرها من هنا.', 'These dishes go to the kitchen under your name. Once sent, they cannot be changed here.')
            : text('كل الأصناف اللي لسه ما اتبعتتش على الطاولة هتتبعت كطلب واحد، وكل صنف باسم اللي ضافه.', 'Every unsent dish at the table goes as one order, each under the name of who added it.')}</p>
          <ul className="cart-lines">{liveConfirm.items.map(item => <ItemRow key={item.id} item={item} price={price} guestName={guestName} menuItems={menuItems} />)}</ul>
          <p className="order-total"><span>{text('الإجمالي', 'Total')}</span><strong>{price(liveConfirm.total)}</strong></p>
          <p className="order-hint">{text('الدفع في المطعم.', 'You pay at the restaurant.')}</p>
          {error && <p className="order-alert" role="alert"><WarningCircleIcon size={20} weight="fill" /><span>{error}</span></p>}
        </div>
        <footer className="order-sheet-footer">
          <button type="button" className="order-button" disabled={shared.busy || liveConfirm.items.length === 0} onClick={() => void send()} data-testid="shared-confirm">
            <span>{shared.busy ? text('بيتبعت…', 'Sending…') : text('أكّد وابعت للمطبخ', 'Confirm and send')}</span><span className="order-button-price">{price(liveConfirm.total)}</span>
          </button>
        </footer>
      </> : <>
        <div className="order-sheet-content">
          <div className="shared-who">
            <UsersThreeIcon size={20} weight="fill" aria-hidden="true" />
            <p>
              {text(`انت منضم لطلب ${table}`, `You joined the ${table} order`)}
              <small>{view.guests.length > 1
                ? text(`معاك ${arabicCount(view.guests.length - 1, ['ضيف', 'ضيفين', 'ضيوف'], number)} على الطاولة`, `${view.guests.length - 1} other guest${view.guests.length === 2 ? '' : 's'} at the table`)
                : text('انت أول واحد على الطاولة. اللي هيمسح الكود هينضم معاك.', 'You are the first here. Whoever scans the code joins you.')}</small>
            </p>
            {!naming && <button type="button" className="shared-name-button" onClick={() => setNaming(true)}><PencilSimpleIcon size={15} aria-hidden="true" />{view.me.name ?? text('اكتب اسمك', 'Add your name')}</button>}
          </div>
          {naming && <form className="shared-name-form" onSubmit={event => { event.preventDefault(); if (name.trim()) act(async () => { await shared.rename(name.trim()); setNaming(false); }); }}>
            <label htmlFor={`${id}-name`} className="visually-hidden">{text('اسمك', 'Your name')}</label>
            <input id={`${id}-name`} value={name} onChange={event => setName(event.target.value)} maxLength={30} placeholder={text('اسمك يظهر جنب أصنافك', 'Shown next to your dishes')} autoComplete="given-name" />
            <button type="submit" className="order-button secondary" disabled={!name.trim() || shared.busy}>{text('حفظ', 'Save')}</button>
          </form>}

          {view.status === 'CLOSING' && <p className="order-alert" role="status"><ClockIcon size={20} weight="fill" /><span>{text('الطاولة طلبت الحساب. تقدروا تشوفوا الطلب، بس مفيش أصناف جديدة غير لما الويتر يفتحه تاني.', 'The table asked for the bill. You can still see the order, but no new dishes until the staff reopen it.')}</span></p>}
          {error && <p className="order-alert" role="alert"><WarningCircleIcon size={20} weight="fill" /><span>{error}</span></p>}

          <h3 className="shared-section">{text('لسه ما اتبعتش', 'Not sent yet')}</h3>
          {drafts.length === 0
            ? <p className="shared-empty">{text('مفيش أصناف مستنية. ضيف من المنيو وهتظهر هنا لكل اللي على الطاولة.', 'Nothing waiting. Add from the menu and it shows here for everyone at the table.')}</p>
            : <ul className="cart-lines">{drafts.map(item => <ItemRow key={item.id} item={item} price={price} guestName={guestName} menuItems={menuItems}
              onQuantity={item.editable ? quantity => act(() => shared.update(item.id, item.version, { quantity })) : undefined}
              onRemove={item.editable ? () => act(() => shared.remove(item.id, item.version)) : undefined} />)}</ul>}

          {sent.length > 0 && <>
            <h3 className="shared-section">{text('اتبعت للمطعم', 'Sent to the restaurant')}</h3>
            <ul className="cart-lines is-sent">{sent.map(item => <ItemRow key={item.id} item={item} price={price} guestName={guestName} menuItems={menuItems} />)}</ul>
          </>}
        </div>
        <footer className="order-sheet-footer shared-footer">
          {active && mine.length > 0 && <button type="button" className="order-button" disabled={shared.busy} onClick={() => { setError(null); setConfirm({ scope: 'MINE', items: mine, total: view.myDraftTotalPiastres }); }} data-testid="shared-send-mine">
            <span>{text('ابعت أصنافي', 'Send my dishes')}</span><span className="order-button-price">{price(view.myDraftTotalPiastres)}</span>
          </button>}
          {active && drafts.length > mine.length && <button type="button" className={`order-button ${mine.length ? 'secondary' : ''}`} disabled={shared.busy} onClick={() => { setError(null); setConfirm({ scope: 'TABLE', items: drafts, total: view.draftTotalPiastres }); }} data-testid="shared-send-table">
            <span>{text('ابعت طلب الطاولة كله', 'Send the whole table')}</span><span className="order-button-price">{price(view.draftTotalPiastres)}</span>
          </button>}
          {(!active || drafts.length === 0) && <button type="button" className="order-button secondary" onClick={close}>{text('تصفّح المنيو', 'Browse the menu')}</button>}
        </footer>
      </>}
    </div>
  </dialog>;
}

function ItemRow({ item, price, guestName, menuItems, onQuantity, onRemove }: {
  item: TableSessionItem; price: (piastres: number) => string; guestName: ReturnType<typeof useGuestName>; menuItems?: MenuItems;
  onQuantity?: (quantity: number) => void; onRemove?: () => void;
}) {
  const { text, language, menuLanguage, digits } = useLanguage();
  const { name, size } = lineNames(item, menuItems, language, menuLanguage);
  return <li className={`shared-line ${item.mine ? 'is-mine' : ''}`} data-testid="shared-line" data-status={item.status}>
    <div className="cart-line-main">
      <strong><bdi>{name}</bdi></strong>
      {size && <span className="cart-line-size"><bdi>{size}</bdi></span>}
      {item.note && <span className="cart-note-text">{item.note}</span>}
      <span className={`shared-guest ${item.mine ? 'is-mine' : ''}`}>{guestName(item.guest, item.mine)}</span>
      {item.order && <span className={`shared-status status-${item.order.status.toLowerCase()}`}>
        <CheckCircleIcon size={14} weight="fill" aria-hidden="true" />
        {text(`طلب ${digits(item.order.number)} · ${ORDER_STATUS_TEXT[item.order.status][0]}`, `Order #${item.order.number} · ${ORDER_STATUS_TEXT[item.order.status][1]}`)}
      </span>}
    </div>
    <div className="cart-line-side">
      {onQuantity ? <QuantityStepper value={item.quantity} onChange={onQuantity} onRemove={onRemove} label={text('الكمية', 'Quantity')} />
        : <span className="shared-qty">× {digits(item.quantity)}</span>}
      <span className="cart-line-total">{price(item.lineTotalPiastres)}</span>
    </div>
  </li>;
}
