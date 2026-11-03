import { cloneElement, useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, InputHTMLAttributes, ReactElement, ReactNode } from 'react';
import { ArrowRightIcon, ChairIcon, NotePencilIcon, ShoppingBagIcon, StorefrontIcon, WarningCircleIcon, XIcon } from '@phosphor-icons/react';
import type { PlaceOrderResponse } from '@bilhanah/contracts';
import { arabicCount, useLanguage } from '../../../lib/language';
import { branchOf } from '../branches';
import { formatPrice, localized, variantLabel } from '../menu-format';
import type { AvailableRestaurant } from '../MenuView';
import { ApiError, placeOrder, type PlaceOrderInput } from './order-api';
import { loadDiner, saveDiner, type TableContext } from './ordering-storage';
import { QuantityStepper } from './QuantityStepper';
import { tableName } from './use-table';
import { CART_LIMITS, type Cart, type ResolvedLine } from './use-cart';
import type { Suggestion } from '../../recommendations/recommend';
import { SuggestionStrip } from '../../recommendations/Suggestions';
import type { Tracker } from '../../recommendations/tracker';

type OrderType = PlaceOrderInput['type'];
type Step = 'cart' | 'checkout';
type FieldErrors = Partial<Record<'name' | 'phone' | 'tableLabel', string>>;

/** Arabic-Indic and Persian digits typed on Arabic keyboards, as ASCII. */
function asciiDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) & 0xf));
}

/** Arabic counts dishes as "صنف واحد", "صنفين", "٣ أصناف", "١١ صنف"; English as "1 item", "3 items". */
export function itemCount(count: number, language: 'ar' | 'en', number: (value: number) => string): string {
  if (language === 'en') return `${count} item${count === 1 ? '' : 's'}`;
  return arabicCount(count, ['صنف', 'صنفين', 'أصناف'], number);
}

/** The phone as the API accepts it (contracts customerPhoneSchema), or null. */
export function normalizePhone(value: string): string | null {
  const phone = asciiDigits(value.trim()).replace(/[\s().-]/g, '');
  return /^\+?\d{7,15}$/.test(phone) ? phone : null;
}

export type CartSheetProps = {
  restaurant: AvailableRestaurant;
  subdomain: string;
  cart: Cart;
  table: TableContext | null;
  setTable: (table: TableContext | null) => void;
  /** Set while the restaurant is closed: why checkout is disabled. */
  closedMessage: string | null;
  /** The branch the order goes to, as a sentence names it ("فرع مدينة نصر"); null with a single branch. */
  branchName: string | null;
  /** Opens the branch picker, when the diner may change branch (not at a table). */
  onChangeBranch: (() => void) | null;
  /** The Idempotency-Key for this checkout: the same one until an order goes through. */
  idempotencyKey: () => string;
  onPlaced: (response: PlaceOrderResponse) => void;
  onClose: () => void;
  /** Suggestions for the cart and checkout, and upgrades of its lines; none when the restaurant has no rules. */
  upsell?: Upsell;
};

/** What the menu offers on top of the cart, all resolved against this branch's menu. */
export type Upsell = {
  /** Dishes to add, for a placement, given what is in the cart. */
  suggestions: (placement: 'CART' | 'CHECKOUT') => Suggestion[];
  /** Upgrades of one cart line (shown in the cart). */
  upgrades: (line: ResolvedLine) => Suggestion[];
  tracker: Tracker;
  onAdd: (suggestion: Suggestion, variantId: string, placement: 'CART' | 'CHECKOUT') => boolean;
  onUpgrade: (line: ResolvedLine, suggestion: Suggestion) => void;
};

/** The cart and checkout, as one sheet with two steps. */
export function CartSheet({ restaurant, subdomain, cart, table, setTable, closedMessage, branchName, onChangeBranch, idempotencyKey, onPlaced, onClose, upsell }: CartSheetProps) {
  const { language, text, number } = useLanguage();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState<Step>('cart');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState<{ code: string; retryAfterSeconds?: number } | null>(null);
  const [refusedTypes, setRefusedTypes] = useState<OrderType[]>([]);
  const types = (['DINE_IN', 'PICKUP'] as const).filter(type => (type === 'DINE_IN' ? restaurant.ordering.dineIn : restaurant.ordering.pickup) && !refusedTypes.includes(type));
  const [type, setType] = useState<OrderType>(() => table && restaurant.ordering.dineIn ? 'DINE_IN' : restaurant.ordering.pickup && !restaurant.ordering.dineIn ? 'PICKUP' : 'DINE_IN');
  const [diner] = useState(loadDiner);
  const [name, setName] = useState(diner.name);
  const [phone, setPhone] = useState(diner.phone);
  const [tableLabel, setTableLabel] = useState('');
  const [note, setNote] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const formId = useId();
  // Fields that appear after an answer (e.g. the table number) are focused once rendered.
  const [focusField, setFocusField] = useState<string | null>(null);
  useEffect(() => {
    if (!focusField) return;
    document.getElementById(`${formId}-${focusField}`)?.focus();
    setFocusField(null);
  }, [focusField, formId]);

  useEffect(() => {
    if (dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }, []);

  // Each step starts at its heading, for screen readers and keyboards alike.
  const firstStep = useRef(true);
  useEffect(() => {
    if (firstStep.current) { firstStep.current = false; return; }
    headingRef.current?.focus();
    dialogRef.current?.querySelector('.order-sheet-content')?.scrollTo({ top: 0 });
  }, [step]);

  useEffect(() => { if (!types.includes(type) && types[0]) setType(types[0]); }, [types, type]);

  const price = (piastres: number) => `${formatPrice(piastres, language)} ${text('ج.م', 'EGP')}`;
  const close = () => dialogRef.current?.close();
  const typeName = (value: OrderType) => value === 'DINE_IN' ? text('في المطعم', 'Dine in') : text('تيك أواي', 'Pickup');

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (name.trim().length < 2) errors.name = text('اكتب اسمك (حرفين على الأقل).', 'Enter your name (at least 2 letters).');
    if (type === 'PICKUP' && !phone.trim()) errors.phone = text('رقم الموبايل مطلوب للتيك أواي.', 'Pickup orders need a phone number.');
    else if (type === 'PICKUP' && !normalizePhone(phone)) errors.phone = text('اكتب رقم موبايل صحيح.', 'Enter a valid phone number.');
    if (type === 'DINE_IN' && !table && !tableLabel.trim()) errors.tableLabel = text('اكتب رقم طاولتك.', 'Enter your table number.');
    return errors;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submittingRef.current) return;
    const errors = validate();
    setFieldErrors(errors);
    const firstInvalid = (['tableLabel', 'name', 'phone'] as const).find(field => errors[field]);
    if (firstInvalid) { document.getElementById(`${formId}-${firstInvalid}`)?.focus(); return; }

    // The phone is asked for pickup only; dine-in orders do not send a remembered one.
    const customerPhone = type === 'PICKUP' ? normalizePhone(phone) ?? undefined : undefined;
    saveDiner({ name: name.trim(), phone: phone.trim() });
    const branch = branchOf(restaurant)?.slug;
    const input: PlaceOrderInput = {
      type,
      // Prices and availability are this branch's; a table code still decides the branch by itself.
      ...(branch && { branch }),
      customerName: name.trim(),
      ...(type === 'DINE_IN' && (table ? { tableCode: table.code } : { tableLabel: asciiDigits(tableLabel.trim()) })),
      ...(customerPhone && { customerPhone }),
      ...(note.trim() && { note: note.trim() }),
      items: cart.lines.map(line => ({ menuItemId: line.menuItemId, variantId: line.variantId, quantity: line.quantity, ...(line.note && { note: line.note }), ...(line.recommendation && { recommendation: line.recommendation }) })),
    };

    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      onPlaced(await placeOrder(subdomain, idempotencyKey(), input));
    } catch (caught) {
      const failure = caught instanceof ApiError ? caught : new ApiError(0, 'NETWORK_ERROR');
      const details = (failure.details ?? {}) as { menuItemIds?: unknown; retryAfterSeconds?: unknown };
      let code = failure.code;
      const refusedIds = Array.isArray(details.menuItemIds) ? details.menuItemIds.filter((id): id is string => cart.lines.some(line => line.menuItemId === id)) : [];
      if (code === 'ITEMS_UNAVAILABLE' && refusedIds.length) {
        cart.markUnavailable(refusedIds);
        setStep('cart');
      } else if (code === 'ITEMS_UNAVAILABLE') {
        code = 'MENU_CHANGED';
      } else if (failure.code === 'TABLE_NOT_FOUND') {
        setTable(null);
        setFocusField('tableLabel');
      } else if (failure.code === 'ORDER_TYPE_UNAVAILABLE') {
        setRefusedTypes(current => [...current, type]);
      }
      setError({ code, retryAfterSeconds: typeof details.retryAfterSeconds === 'number' ? details.retryAfterSeconds : undefined });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  // With several branches, these answers are about the branch being ordered from.
  const [who, whoEn] = branchName ? ['الفرع ده', 'This branch'] : ['المطعم', 'The restaurant'];
  const errorMessage = error && (() => {
    switch (error.code) {
      case 'ITEMS_UNAVAILABLE': return null; // Shown on the marked lines in the cart.
      case 'RESTAURANT_CLOSED': return text(`${who} قفل دلوقتي ومش بياخد طلبات. جرّب لما يفتح.`, `${whoEn} has just closed and is not taking orders. Try again when it opens.`);
      case 'ORDERING_UNAVAILABLE': return text(`${who} وقّف الطلبات من الموبايل مؤقتًا. اطلب من الويتر أو جرّب كمان شوية.`, `${whoEn} has paused online orders. Please ask the staff, or try again in a little while.`);
      case 'ORDER_TYPE_UNAVAILABLE': return types.length
        ? text(`${who} مش بياخد النوع ده من الطلبات دلوقتي. اختار نوع تاني.`, `${whoEn} is not taking this kind of order right now. Choose another option.`)
        : text(`${who} مش بياخد طلبات من الموبايل دلوقتي. اطلب من الويتر.`, `${whoEn} is not taking online orders right now. Please ask the staff.`);
      case 'BRANCH_NOT_FOUND': return text('الفرع ده مبقاش بياخد طلبات. اختار فرع تاني.', 'This branch is no longer taking orders. Choose another branch.');
      case 'TABLE_NOT_FOUND': return text('مش لاقيين الطاولة دي. اكتب رقم طاولتك.', 'We could not find this table. Please type your table number.');
      case 'RATE_LIMITED': {
        const minutes = Math.max(1, Math.ceil((error.retryAfterSeconds ?? 60) / 60));
        return text(`طلبات كتير من نفس الشبكة. جرّب تاني بعد ${arabicCount(minutes, ['دقيقة', 'دقيقتين', 'دقايق'], number, 'دقيقة')}.`, `Too many orders from this network. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
      }
      case 'MENU_CHANGED': return text('المنيو اتغيّر. حدّث الصفحة وراجع طلبك.', 'The menu has changed. Reload the page and check your order.');
      case 'VALIDATION_FAILED': return text('في بيانات مش مظبوطة. راجعها وجرّب تاني.', 'Some details are not right. Check them and try again.');
      default: return text('مقدرناش نبعت طلبك. اتأكد من النت وجرّب تاني، الطلب مش هيتكرر.', 'We could not send your order. Check your connection and try again; it will not be placed twice.');
    }
  })();
  const canRetry = !!error && !['ITEMS_UNAVAILABLE', 'MENU_CHANGED', 'TABLE_NOT_FOUND', 'ORDER_TYPE_UNAVAILABLE', 'VALIDATION_FAILED', 'BRANCH_NOT_FOUND'].includes(error.code);
  // Another branch may still take the order when this one cannot.
  const offerOtherBranch = !!error && !!onChangeBranch && ['BRANCH_NOT_FOUND', 'ORDERING_UNAVAILABLE', 'RESTAURANT_CLOSED'].includes(error.code);

  return <dialog
    ref={dialogRef}
    className="dish-sheet order-sheet"
    aria-labelledby={`${formId}-title`}
    onClose={onClose}
    // A sent order must not be abandoned halfway; Escape waits for the answer.
    onCancel={event => { if (submittingRef.current) event.preventDefault(); }}
    onClick={event => { if (event.target === event.currentTarget && !submittingRef.current) close(); }}
  >
    <div className="order-sheet-body">
      <header className="order-sheet-header">
        {step === 'checkout' && <button type="button" className="icon-button" onClick={() => { setStep('cart'); setError(null); }} disabled={submitting} aria-label={text('رجوع للطلب', 'Back to your order')}><ArrowRightIcon size={20} className="directional-arrow" /></button>}
        <h2 id={`${formId}-title`} ref={headingRef} tabIndex={-1}>{step === 'cart' ? text('طلبك', 'Your order') : text('تأكيد الطلب', 'Checkout')}</h2>
        <button type="button" className="icon-button" onClick={close} disabled={submitting} aria-label={text('إغلاق', 'Close')}><XIcon size={20} /></button>
      </header>

      {step === 'cart' ? <>
        <div className="order-sheet-content">
          {cart.lines.length === 0 ? <p className="order-empty"><ShoppingBagIcon size={32} />{text('طلبك فاضي. ضيف أكلات من المنيو.', 'Your order is empty. Add dishes from the menu.')}</p> : <>
            {cart.hasUnavailable && <div className="order-alert" role="alert">
              <WarningCircleIcon size={20} weight="fill" />
              <p>{text('الأصناف المعلّمة مبقتش متاحة. شيلها عشان تكمّل.', 'The marked dishes are no longer available. Remove them to continue.')}</p>
              <button type="button" className="order-alert-action" onClick={cart.removeUnavailable}>{text('شيل الأصناف دي', 'Remove them')}</button>
            </div>}
            <ul className="cart-lines">{cart.lines.map(line => <CartLineRow key={line.id} line={line} cart={cart} price={price} upsell={upsell} />)}</ul>
            <p className="order-total"><span>{text('الإجمالي', 'Total')}</span><strong>{price(cart.subtotal)}</strong></p>
            {/* Never in the way: with no eligible dishes the section simply is not there. */}
            {upsell && <SuggestionStrip suggestions={upsell.suggestions('CART')} placement="CART" tracker={upsell.tracker}
              heading={text('ممكن تضيف كمان', 'You might also add')} onAdd={(entry, variantId) => upsell.onAdd(entry, variantId, 'CART')} />}
            <p className="order-hint">{text('الدفع في المطعم.', 'You pay at the restaurant.')}</p>
          </>}
        </div>
        <footer className="order-sheet-footer">
          {closedMessage && cart.lines.length > 0 && <p className="order-closed" role="status">{closedMessage}</p>}
          {cart.lines.length === 0
            ? <button type="button" className="order-button secondary" onClick={close}>{text('تصفّح المنيو', 'Browse the menu')}</button>
            : <button type="button" className="order-button" disabled={!!closedMessage || cart.hasUnavailable || types.length === 0} onClick={() => { setStep('checkout'); setError(null); }}>
              <span>{text('كمّل الطلب', 'Continue')}</span><span className="order-button-price">{price(cart.subtotal)}</span>
            </button>}
        </footer>
      </> : <form className="order-sheet-form" onSubmit={submit} noValidate aria-busy={submitting}>
        <div className="order-sheet-content checkout">
          {types.length > 1 && <fieldset className="type-picker">
            <legend>{text('هتاكل فين؟', 'How would you like it?')}</legend>
            {types.map(option => <label key={option} className="type-option">
              <input type="radio" name={`${formId}-type`} value={option} checked={type === option} onChange={() => { setType(option); setFieldErrors({}); }} />
              {option === 'DINE_IN' ? <ChairIcon size={20} /> : <ShoppingBagIcon size={20} />}<span>{typeName(option)}</span>
            </label>)}
          </fieldset>}
          {types.length === 1 && <p className="type-only">{type === 'DINE_IN' ? <ChairIcon size={20} /> : <ShoppingBagIcon size={20} />}{type === 'DINE_IN' ? text('الطلب هيوصلك على الطاولة', 'Served at your table') : branchName ? text(`تيك أواي: هتستلم الطلب من ${branchName}`, `Pickup: collect your order at ${branchName}`) : text('تيك أواي: هتستلم الطلب من المطعم', 'Pickup: collect your order at the restaurant')}</p>}

          {type === 'DINE_IN' && (table
            ? <p className="table-confirm"><ChairIcon size={20} weight="fill" /><span>{table.label ? text(`هنجيبلك الطلب على ${tableName(table.label, language)}`, `We will bring it to ${tableName(table.label, language)}`) : text('هنجيبلك الطلب على طاولتك', 'We will bring it to your table')}</span></p>
            : <Field id={`${formId}-tableLabel`} label={text('رقم الطاولة', 'Table number')} hint={text('مكتوب على الطاولة أو جنب الـ QR.', 'It is on the table or next to its QR code.')} error={fieldErrors.tableLabel}>
              <input value={tableLabel} onChange={event => setTableLabel(event.target.value)} maxLength={40} inputMode="text" autoComplete="off" />
            </Field>)}

          <Field id={`${formId}-name`} label={text('اسمك', 'Your name')} hint={text('عشان نعرف الطلب ده بتاع مين.', 'So the staff know whose order it is.')} error={fieldErrors.name}>
            <input value={name} onChange={event => setName(event.target.value)} maxLength={60} autoComplete="name" enterKeyHint="next" />
          </Field>

          {type === 'PICKUP' && <Field id={`${formId}-phone`} label={text('رقم موبايلك', 'Mobile number')} hint={text('عشان المطعم يقدر يكلمك لو احتاج.', 'So the restaurant can reach you if needed.')} error={fieldErrors.phone}>
            <input type="tel" value={phone} onChange={event => setPhone(event.target.value)} maxLength={20} autoComplete="tel" inputMode="tel" dir="ltr" />
          </Field>}

          <Field id={`${formId}-note`} label={<>{text('ملاحظة على الطلب', 'Order note')} <small>{text('(اختياري)', '(optional)')}</small></>}>
            <textarea rows={2} value={note} onChange={event => setNote(event.target.value)} maxLength={300} placeholder={text('أي حاجة عايز المطعم يعرفها', 'Anything the restaurant should know')} />
          </Field>

          {upsell && <SuggestionStrip suggestions={upsell.suggestions('CHECKOUT')} placement="CHECKOUT" tracker={upsell.tracker}
            heading={text('قبل ما تبعت', 'Before you order')} onAdd={(entry, variantId) => upsell.onAdd(entry, variantId, 'CHECKOUT')} />}
          <div className="checkout-summary">
            {branchName && <p className="checkout-branch"><StorefrontIcon size={18} aria-hidden="true" /><span>{text(`طلبك رايح ${branchName}`, `Ordering from ${branchName}`)}</span></p>}
            <p>{itemCount(cart.count, language, number)} · <strong>{price(cart.subtotal)}</strong></p>
            <p className="order-hint">{text('الدفع في المطعم.', 'You pay at the restaurant.')}</p>
          </div>
        </div>
        <footer className="order-sheet-footer">
          {errorMessage && <div className="order-alert" role="alert"><WarningCircleIcon size={20} weight="fill" /><p>{errorMessage}</p>
            {offerOtherBranch && <button type="button" className="order-alert-action" onClick={onChangeBranch!}>{text('اختار فرع تاني', 'Choose another branch')}</button>}
          </div>}
          {closedMessage && <p className="order-closed" role="status">{closedMessage}</p>}
          <button type="submit" className="order-button" disabled={submitting || !!closedMessage || types.length === 0}>
            <span>{submitting ? text('بنبعت طلبك…', 'Sending your order…') : canRetry ? text('جرّب تاني', 'Try again') : text('ابعت الطلب', 'Place order')}</span>
            <span className="order-button-price">{price(cart.subtotal)}</span>
          </button>
        </footer>
      </form>}
    </div>
  </dialog>;
}

/** A labelled input with its hint, or its error in place of the hint. */
function Field({ id, label, hint, error, children }: { id: string; label: ReactNode; hint?: string; error?: string; children: ReactElement<InputHTMLAttributes<HTMLElement>> }) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return <div className={`order-field ${error ? 'invalid' : ''}`}>
    <label htmlFor={id}>{label}</label>
    {cloneElement(children, { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
    {error ? <p className="order-field-error" id={`${id}-error`}>{error}</p> : hint && <p className="order-field-hint" id={`${id}-hint`}>{hint}</p>}
  </div>;
}

/** One cart line: name, size, note, quantity and line total. */
function CartLineRow({ line, cart, price, upsell }: { line: ResolvedLine; cart: Cart; price: (piastres: number) => string ; upsell?: Upsell }) {
  const { language, text } = useLanguage();
  const [editingNote, setEditingNote] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const name = localized(language, line.item.nameAr, line.item.nameEn);
  const size = line.item.variants.length > 1 ? variantLabel(line.variant, language) : null;
  useEffect(() => { if (editingNote) noteRef.current?.focus(); }, [editingNote]);
  const upgrade = !line.unavailable ? upsell?.upgrades(line)[0] : undefined;

  return <li className={`cart-line ${line.unavailable ? 'unavailable' : ''}`}>
    <div className="cart-line-main">
      <p className="cart-line-name" id={`${id}-name`}>{name}{size && <span className="cart-line-size"> · {size}</span>}</p>
      {line.unavailable && <span className="sold-out-badge">{text('مش متاحة دلوقتي', 'Not available now')}</span>}
      {editingNote
        ? <label className="cart-note-edit">
          <span className="visually-hidden">{text(`ملاحظة على ${name}`, `Note for ${name}`)}</span>
          <textarea ref={noteRef} rows={2} maxLength={CART_LIMITS.note} value={line.note} onChange={event => cart.update(line.id, { note: event.target.value })}
            onBlur={() => { cart.update(line.id, { note: line.note.trim() }); setEditingNote(false); }} placeholder={text('مثلًا: من غير بصل', 'e.g. no onions')} />
        </label>
        : <button type="button" className="cart-note-button" onClick={() => setEditingNote(true)} aria-describedby={`${id}-name`}>
          <NotePencilIcon size={15} />{line.note ? <bdi className="cart-note-text" dir="auto">{line.note}</bdi> : <span>{text('أضف ملاحظة', 'Add a note')}</span>}
        </button>}
      {upgrade && <UpgradeOffer line={line} upgrade={upgrade} upsell={upsell!} />}
    </div>
    <div className="cart-line-side">
      <strong className="cart-line-total">{price(line.lineTotal)}</strong>
      <QuantityStepper value={line.quantity} onChange={quantity => cart.update(line.id, { quantity })} onRemove={() => cart.remove(line.id)} label={text(`كمية ${name}`, `${name} quantity`)} />
    </div>
  </li>;
}

/** "Make it a large for +15 EGP": swaps the line for the better dish, keeping its quantity and note. */
function UpgradeOffer({ line, upgrade, upsell }: { line: ResolvedLine; upgrade: Suggestion; upsell: Upsell }) {
  const { language, text } = useLanguage();
  useEffect(() => { upsell.tracker.impression(upgrade.rule.id, upgrade.item.id, 'CART'); }, [upsell.tracker, upgrade.rule.id, upgrade.item.id]);
  const target = upgrade.variant ?? upgrade.item.variants[0]!;
  const difference = (target.pricePiastres - line.variant.pricePiastres) * line.quantity;
  const name = localized(language, upgrade.item.nameAr, upgrade.item.nameEn);
  const size = upgrade.item.variants.length > 1 ? variantLabel(target, language) : null;
  const extra = `${difference >= 0 ? '+' : '−'}${formatPrice(Math.abs(difference), language)} ${text('ج.م', 'EGP')}`;
  return <p className="upgrade-offer" data-testid="upgrade-offer">
    <span>{text(`رقّيها لـ ${name}${size ? ` (${size})` : ''}`, `Upgrade to ${name}${size ? ` (${size})` : ''}`)} <strong>{extra}</strong></span>
    <button type="button" onClick={() => { upsell.tracker.click(upgrade.rule.id, upgrade.item.id, 'CART'); upsell.onUpgrade(line, upgrade); }}>{text('رقّي', 'Upgrade')}</button>
  </p>;
}
