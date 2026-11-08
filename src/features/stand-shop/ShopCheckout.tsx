import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowClockwiseIcon, ArrowLeftIcon, CreditCardIcon, MoneyIcon, PackageIcon, WarningCircleIcon } from '@phosphor-icons/react';
import type { PlaceStandOrderResponse, StandPaymentMethod } from '@bilhanah/contracts';
import { ApiError } from '../../lib/api';
import { useLanguage } from '../../lib/language';
import { designLabel, linePiastres, MAX_DESIGNS, unitPiastres, type CartItem, type Delivery } from './catalog';
import { LineThumb } from './LineThumb';
import { dataUrlToBlob, placeStandOrder, uploadStandLogo, type PlaceStandOrderInput, type StandOrderLineInput } from './shop-api';
import type { ShopInfoState } from './use-shop-info';
import { StandColorSummary } from './StandColorPicker';
import { StandPriceBreakdown } from './StandPriceBreakdown';

type FieldKey = 'name' | 'phone' | 'email' | 'city' | 'address' | 'notes' | 'payment' | 'reviewed';
type FieldErrors = Partial<Record<FieldKey, string>>;
/** `focus: false` when a field error takes the focus instead. */
type Problem = { message: string; retry?: boolean; backToBag?: boolean; payByCash?: boolean; focus?: boolean };
type PriceChange = { totalPiastres: number; deliveryFeePiastres: number | null; previousPiastres: number };
type Phase = 'idle' | 'uploading' | 'placing' | 'redirecting';

const FIELD_ORDER: FieldKey[] = ['name', 'phone', 'email', 'city', 'address', 'notes', 'payment', 'reviewed'];
const methodOf = (payment: Delivery['payment']): StandPaymentMethod => payment === 'card' ? 'PAYMOB' : 'CASH_ON_DELIVERY';
const paymentOf = (method: StandPaymentMethod): Delivery['payment'] => method === 'PAYMOB' ? 'card' : 'cash';

/** Egyptian keyboards type Arabic-Indic digits; the API wants 0-9 without spaces or dashes. */
export function normalizePhone(value: string): string {
  return value.replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06f0)).replace(/[\s().-]/g, '');
}

/** Only web pages: the payment page comes from the API, but it still decides where the browser goes. */
function safeCheckoutUrl(value: string | null): string | null {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null; } catch { return null; }
}

type Props = {
  items: CartItem[];
  delivery: Delivery;
  onDelivery: (value: Delivery) => void;
  onBack: () => void;
  shop: { state: ShopInfoState; retry: () => void; refresh: () => void };
  /** The Idempotency-Key of this checkout attempt: the same one until the bag changes or an order goes through. */
  idempotencyKey: () => string;
  renewIdempotencyKey: () => void;
  /** Uploaded logos (data URL → logoId), so a retry does not upload them again. */
  logoIds: Map<string, string>;
  onPlaced: (response: PlaceStandOrderResponse) => void;
};

export function ShopCheckout({ items, delivery, onDelivery, onBack, shop, idempotencyKey, renewIdempotencyKey, logoIds, onPlaced }: Props) {
  const { text, language, number } = useLanguage();
  const [reviewed, setReviewed] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [problem, setProblem] = useState<Problem | null>(null);
  const [priceChange, setPriceChange] = useState<PriceChange | null>(null);
  /** A new total the customer accepted after PRICE_CHANGED; sent until the order goes through. */
  const [acceptedTotal, setAcceptedTotal] = useState<number | null>(null);
  const [methodsOverride, setMethodsOverride] = useState<StandPaymentMethod[] | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  /** A field (or the payment legend) to focus once the form is enabled again. */
  const [focusTarget, setFocusTarget] = useState<FieldKey | null>(null);
  const busy = useRef(false);
  const title = useRef<HTMLHeadingElement>(null);
  const problemRef = useRef<HTMLDivElement>(null);
  const priceRef = useRef<HTMLHeadingElement>(null);

  const info = shop.state.status === 'ready' ? shop.state.info : null;
  const offered = info ? (methodsOverride ?? info.paymentMethods) : [];
  const method = offered.includes(methodOf(delivery.payment)) ? methodOf(delivery.payment) : offered[0] ?? null;
  const prices = info ? { stand: info.prices, sticker: info.stickerPrices } : undefined;
  const subtotal = items.reduce((sum, item) => sum + linePiastres(item.config, prices), 0);
  const deliveryFee = priceChange ? priceChange.deliveryFeePiastres : info?.deliveryFeePiastres ?? null;
  const expectedTotal = subtotal + (deliveryFee ?? 0);
  const tooManyDesigns = items.length > MAX_DESIGNS;
  const egp = (piastres: number) => `${number(piastres / 100)} ${text('ج.م', 'EGP')}`;

  useEffect(() => { title.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); }, []);
  // The chosen way to pay must be one the shop offers today.
  useEffect(() => { if (method && methodOf(delivery.payment) !== method) onDelivery({ ...delivery, payment: paymentOf(method) }); }, [method, delivery, onDelivery]);
  useEffect(() => { if (problem && problem.focus !== false) problemRef.current?.focus(); }, [problem]);
  useEffect(() => { if (priceChange) priceRef.current?.focus(); }, [priceChange]);
  // After the render that re-enables the fieldsets: a disabled input cannot take focus.
  useEffect(() => {
    if (!focusTarget || phase !== 'idle') return;
    document.getElementById(`checkout-${focusTarget}`)?.focus();
    setFocusTarget(null);
  }, [focusTarget, phase]);

  const update = <K extends keyof Delivery>(key: K, value: Delivery[K]) => {
    onDelivery({ ...delivery, [key]: value });
    if (errors[key as FieldKey]) setErrors(current => ({ ...current, [key]: undefined }));
  };

  const messages: Record<FieldKey, string> = {
    name: text('اكتب اسمك بالكامل (حرفين على الأقل).', 'Enter your full name (at least 2 characters).'),
    phone: text('اكتب رقم موبايل صحيح، من ٧ لـ١٥ رقم.', 'Enter a valid phone number (7–15 digits).'),
    email: text('البريد الإلكتروني مش مظبوط. صحّحه أو سيبه فاضي.', 'This email address is not valid. Fix it or leave it empty.'),
    city: text('اكتب المحافظة أو المدينة.', 'Enter your governorate or city.'),
    address: text('اكتب العنوان بالتفصيل (٥ حروف على الأقل).', 'Enter the full address (at least 5 characters).'),
    notes: text('الملاحظات طويلة. خلّيها أقل من ٥٠٠ حرف.', 'Keep the notes under 500 characters.'),
    payment: text('اختار طريقة دفع متاحة.', 'Choose an available payment method.'),
    reviewed: text('أكّد إنك راجعت تفاصيل الحوامل.', 'Confirm you’ve reviewed your stands.'),
  };

  function validate(): FieldErrors {
    const found: FieldErrors = {};
    const name = delivery.name.trim(), email = delivery.email.trim(), city = delivery.city.trim(), address = delivery.address.trim();
    if (name.length < 2 || name.length > 80) found.name = messages.name;
    if (!/^\+?\d{7,15}$/.test(normalizePhone(delivery.phone.trim()))) found.phone = messages.phone;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) found.email = messages.email;
    if (city.length < 2 || city.length > 60) found.city = messages.city;
    if (address.length < 5 || address.length > 300) found.address = messages.address;
    if (delivery.notes.trim().length > 500) found.notes = messages.notes;
    if (!method) found.payment = messages.payment;
    if (!reviewed) found.reviewed = messages.reviewed;
    return found;
  }

  function showFieldErrors(found: FieldErrors) {
    setErrors(found);
    const first = FIELD_ORDER.find(key => found[key]);
    if (first) setFocusTarget(first);
  }

  /** Uploads each distinct logo once and reuses its id for every design that carries it. */
  async function orderLines(): Promise<StandOrderLineInput[]> {
    const logos = [...new Set(items.map(item => item.config.logo).filter(Boolean))].filter(logo => !logoIds.has(logo));
    if (logos.length) setPhase('uploading');
    for (const logo of logos) logoIds.set(logo, (await uploadStandLogo(dataUrlToBlob(logo))).logoId);
    return items.map(({ config }) => ({
      product: config.product, shape: config.shape, nfc: config.nfc, design: config.design, customColors: config.customColors, purpose: config.purpose,
      brand: config.brand.trim(), caption: config.caption.trim(), url: config.url.trim(), logoId: config.logo ? logoIds.get(config.logo) ?? null : null,
      numbered: config.numbered, startNumber: config.startNumber, quantity: config.quantity, notes: config.notes.trim(),
    }));
  }

  function lineProblem(details: { path?: unknown }[]): Problem | null {
    const line = details.map(detail => /^lines\.(\d+)/.exec(String(detail.path ?? ''))).find(Boolean);
    if (!line) return null;
    const item = items[Number(line[1])];
    return { message: item ? text(`في حاجة محتاجة تتعدّل في تصميم «${item.config.brand}». ارجع للسلة وراجع الرابط والبيانات.`, `Something in the “${item.config.brand}” design needs a fix. Go back to your bag and check its link and details.`) : text('في تصميم محتاج يتعدّل. ارجع للسلة وراجعه.', 'One of your designs needs a fix. Go back to your bag and check it.'), backToBag: true };
  }

  function handleError(error: unknown, expected: number) {
    const code = error instanceof ApiError ? error.code : 'UNKNOWN';
    const status = error instanceof ApiError ? error.status : -1;
    const details = error instanceof ApiError ? error.details : undefined;
    if (code === 'PRICE_CHANGED') {
      const next = details as { totalPiastres?: unknown; deliveryFeePiastres?: unknown } | undefined;
      if (typeof next?.totalPiastres === 'number') {
        setPriceChange({ totalPiastres: next.totalPiastres, deliveryFeePiastres: typeof next.deliveryFeePiastres === 'number' ? next.deliveryFeePiastres : null, previousPiastres: expected });
        shop.refresh();
        return;
      }
    }
    if (code === 'PAYMENT_METHOD_UNAVAILABLE') {
      const methods = (details as { methods?: unknown } | undefined)?.methods;
      const available = Array.isArray(methods) ? (['CASH_ON_DELIVERY', 'PAYMOB'] as const).filter(item => methods.includes(item)) : [];
      if (available.length) setMethodsOverride(available);
      setErrors({ payment: text('طريقة الدفع دي مش متاحة دلوقتي. اختار طريقة تانية وأكّد تاني.', 'That payment method isn’t available right now. Choose another one and confirm again.') });
      setFocusTarget('payment');
      shop.refresh();
      return;
    }
    if (code === 'ONLINE_PAYMENT_UNAVAILABLE') {
      // Paymob could not start a checkout. Start over with a new key, so paying in cash is a clean, new order.
      renewIdempotencyKey();
      setProblem({ message: text('الدفع الأونلاين مش شغال دلوقتي. تقدر تطلب وتدفع كاش عند الاستلام، أو تجرّب تاني بعد شوية.', 'Online payment isn’t working right now. You can order and pay cash on delivery, or try again shortly.'), retry: true, payByCash: offered.includes('CASH_ON_DELIVERY') });
      return;
    }
    if (code === 'LOGO_INVALID' || code === 'PAYLOAD_TOO_LARGE') {
      setProblem({ message: text('في لوجو مش مقبول. استخدم صورة PNG أو JPG أو WebP أصغر من ٣ ميجابايت. ارجع للسلة وغيّر اللوجو.', 'One of the logos was not accepted. Use a PNG, JPG or WebP image under 3 MB. Go back to your bag and replace it.'), backToBag: true });
      return;
    }
    if (code === 'VALIDATION_FAILED' && Array.isArray(details)) {
      const fields: FieldErrors = {};
      const map: Record<string, FieldKey> = { 'customer.name': 'name', 'customer.phone': 'phone', 'customer.email': 'email', 'customer.city': 'city', 'customer.address': 'address', 'customer.notes': 'notes', paymentMethod: 'payment' };
      for (const detail of details as { path?: unknown }[]) { const key = map[String(detail.path ?? '')]; if (key) fields[key] = messages[key]; }
      const lines = lineProblem(details as { path?: unknown }[]);
      if (Object.keys(fields).length) showFieldErrors(fields);
      if (lines) setProblem({ ...lines, focus: !Object.keys(fields).length });
      if (Object.keys(fields).length || lines) return;
    }
    if (status === 429) { setProblem({ message: text('محاولات كتير ورا بعض. استنى دقيقة وجرّب تاني.', 'Too many attempts in a row. Wait a minute and try again.'), retry: true }); return; }
    if (status === 0) { setProblem({ message: text('مفيش اتصال بالإنترنت أو السيرفر مش بيرد. طلبك لسه هنا، جرّب تاني.', 'We couldn’t reach the server. Your order is still here. Please try again.'), retry: true }); return; }
    setProblem({ message: text('حصلت مشكلة وإحنا بنبعت الطلب. جرّب تاني، ولو اتكررت كلّمنا.', 'Something went wrong while sending your order. Try again, and contact us if it keeps happening.'), retry: true });
  }

  async function submit(override?: number) {
    if (busy.current || !info) return;
    const found = validate();
    if (Object.keys(found).length) { showFieldErrors(found); return; }
    if (tooManyDesigns || !method) return;
    busy.current = true;
    setErrors({}); setProblem(null); setPriceChange(null);
    const expected = override ?? acceptedTotal ?? expectedTotal;
    if (override !== undefined) setAcceptedTotal(override);
    try {
      let lines = await orderLines();
      setPhase('placing');
      const email = delivery.email.trim();
      const input = (): PlaceStandOrderInput => ({
        lines,
        customer: { name: delivery.name.trim(), phone: normalizePhone(delivery.phone.trim()), email: email || null, city: delivery.city.trim(), address: delivery.address.trim(), notes: delivery.notes.trim() },
        paymentMethod: method, expectedTotalPiastres: expected, language,
      });
      let response: PlaceStandOrderResponse;
      try {
        response = await placeStandOrder(idempotencyKey(), input());
      } catch (error) {
        // An uploaded logo expired before the order: upload it again, once.
        if (!(error instanceof ApiError && error.code === 'LOGO_NOT_FOUND')) throw error;
        logoIds.clear();
        lines = await orderLines();
        setPhase('placing');
        response = await placeStandOrder(idempotencyKey(), input());
      }
      const checkoutUrl = safeCheckoutUrl(response.checkoutUrl);
      if (checkoutUrl) setPhase('redirecting');
      onPlaced(response);
      if (checkoutUrl) window.location.assign(checkoutUrl);
    } catch (error) {
      setPhase('idle');
      handleError(error, expected);
    } finally {
      busy.current = false;
    }
  }

  function confirm(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void submit(); }
  const describe = (key: FieldKey, help?: string) => ({ id: `checkout-${key}`, 'aria-invalid': errors[key] ? true : undefined, 'aria-describedby': errors[key] ? `checkout-${key}-error` : help });
  const fieldError = (key: FieldKey) => errors[key] ? <p className="shop-error" id={`checkout-${key}-error`}>{errors[key]}</p> : null;

  if (phase === 'redirecting') {
    return <section className="shop-checkout shop-redirecting page-container" aria-labelledby="shop-checkout-title">
      <span className="shop-spinner" aria-hidden="true" />
      <h1 id="shop-checkout-title" ref={title} tabIndex={-1}>{text('بنحوّلك لصفحة الدفع…', 'Taking you to payment…')}</h1>
      <p role="status">{text('طلبك اتسجّل. كمّل الدفع في صفحة Paymob الآمنة، وبعدها هترجع لصفحة طلبك.', 'Your order is saved. Finish paying on Paymob’s secure page, then you’ll come back to your order.')}</p>
    </section>;
  }

  const submitting = phase !== 'idle';
  const deliveryNote = !info ? null : deliveryFee === null
    ? text('سعر التوصيل بيتأكد معاك بالتليفون قبل الشحن، ومش محسوب في الإجمالي.', 'We’ll confirm the delivery fee with you by phone before shipping. It isn’t included in this total.')
    : deliveryFee === 0 ? text('التوصيل مجاني.', 'Delivery is free.') : text(`التوصيل بسعر ثابت ${egp(deliveryFee)} لأي مكان.`, `Flat delivery fee: ${egp(deliveryFee)}.`);

  return <section className="shop-checkout page-container" aria-labelledby="shop-checkout-title"><button type="button" className="shop-back" onClick={onBack} disabled={submitting}><ArrowLeftIcon size={16} className="directional-arrow" aria-hidden="true" />{text('ارجع للسلة', 'Back to your bag')}</button><header className="shop-checkout-heading"><h1 id="shop-checkout-title" ref={title} tabIndex={-1}>{text('فاضل تفاصيل الوصول.', 'Just the finishing details.')}</h1><p>{text('اكتب بياناتك، اختار طريقة الدفع، وراجع حواملك قبل ما تأكّد.', 'Add your details, choose how to pay and review your stands before you confirm.')}</p></header><div className="shop-checkout-layout">
    <form id="shop-checkout-form" className="shop-checkout-form" onSubmit={confirm} noValidate aria-busy={submitting}>
      <fieldset className="shop-fieldset" disabled={submitting}><legend>{text('بيانات التواصل', 'Contact details')}</legend><div className="shop-two-fields">
        <div><label className="shop-label" htmlFor="checkout-name">{text('الاسم بالكامل', 'Full name')}</label><input className="shop-input" {...describe('name')} name="fullName" autoComplete="name" required maxLength={80} value={delivery.name} onChange={event => update('name', event.target.value)} />{fieldError('name')}</div>
        <div><label className="shop-label" htmlFor="checkout-phone">{text('رقم الموبايل', 'Phone number')}</label><input className="shop-input" {...describe('phone', 'checkout-phone-help')} name="phone" type="tel" inputMode="tel" autoComplete="tel" required dir="ltr" maxLength={20} value={delivery.phone} onChange={event => update('phone', event.target.value)} />{fieldError('phone') ?? <p className="shop-field-help" id="checkout-phone-help">{text('هنكلمك عليه نأكد الطلب.', 'We’ll call this number to confirm your order.')}</p>}</div>
      </div><label className="shop-label" htmlFor="checkout-email">{text('البريد الإلكتروني', 'Email address')} <small>{text('(اختياري)', '(optional)')}</small></label><input className="shop-input" {...describe('email', 'checkout-email-help')} type="email" name="email" autoComplete="email" dir="ltr" maxLength={120} value={delivery.email} onChange={event => update('email', event.target.value)} />{fieldError('email') ?? <p className="shop-field-help" id="checkout-email-help">{text('هنبعتلك عليه تأكيد الطلب ورابط متابعته.', 'We’ll send your confirmation and tracking link here.')}</p>}</fieldset>
      <fieldset className="shop-fieldset" disabled={submitting}><legend>{text('عنوان الاستلام', 'Delivery address')}</legend>
        <label className="shop-label" htmlFor="checkout-city">{text('المحافظة / المدينة', 'Governorate / city')}</label><input className="shop-input" {...describe('city')} autoComplete="address-level1" name="city" required maxLength={60} value={delivery.city} onChange={event => update('city', event.target.value)} />{fieldError('city')}
        <label className="shop-label" htmlFor="checkout-address">{text('العنوان بالتفصيل', 'Full street address')}</label><textarea className="shop-input" {...describe('address')} autoComplete="street-address" name="address" required maxLength={300} rows={3} value={delivery.address} onChange={event => update('address', event.target.value)} />{fieldError('address')}
        <label className="shop-label" htmlFor="checkout-notes">{text('ملاحظات الاستلام', 'Delivery notes')} <small>{text('(اختياري)', '(optional)')}</small></label><textarea className="shop-input" {...describe('notes')} rows={2} maxLength={500} value={delivery.notes} onChange={event => update('notes', event.target.value)} />{fieldError('notes')}
      </fieldset>
      <fieldset className="shop-fieldset" disabled={submitting || !info} aria-describedby={errors.payment ? 'checkout-payment-error' : undefined}><legend id="checkout-payment" tabIndex={-1}>{text('طريقة الدفع', 'Payment method')}</legend>
        {info ? <div className="shop-payment-options">
          {offered.includes('CASH_ON_DELIVERY') && <label className={method === 'CASH_ON_DELIVERY' ? 'selected' : ''}><input type="radio" name="payment" checked={method === 'CASH_ON_DELIVERY'} onChange={() => { update('payment', 'cash'); setErrors(current => ({ ...current, payment: undefined })); }} /><MoneyIcon size={24} aria-hidden="true" /><span>{text('الدفع عند الاستلام', 'Cash on delivery')}<small>{text('كاش للمندوب لما الحوامل توصلك', 'Pay the courier when your stands arrive')}</small></span></label>}
          {offered.includes('PAYMOB') && <label className={method === 'PAYMOB' ? 'selected' : ''}><input type="radio" name="payment" checked={method === 'PAYMOB'} onChange={() => { update('payment', 'card'); setErrors(current => ({ ...current, payment: undefined })); }} /><CreditCardIcon size={24} aria-hidden="true" /><span>{text('ادفع أونلاين (كارت أو محفظة)', 'Pay online (card or wallet)')}<small>{text('دفع آمن عن طريق Paymob', 'Secure checkout with Paymob')}</small></span></label>}
        </div> : <p className="shop-field-help">{shop.state.status === 'loading' ? text('بنجيب طرق الدفع المتاحة…', 'Loading the payment methods…') : text('طرق الدفع هتظهر أول ما نقدر نوصل للسيرفر.', 'Payment methods appear once we can reach the server.')}</p>}
        {fieldError('payment')}
      </fieldset>
      <label className="shop-check shop-design-confirmation"><input type="checkbox" {...describe('reviewed')} checked={reviewed} disabled={submitting} onChange={event => { setReviewed(event.target.checked); setErrors(current => ({ ...current, reviewed: undefined })); }} /><span>{text('راجعت الشكل واختيار NFC والتصميم والرابط والكمية.', 'I’ve reviewed the shape, NFC option, design, link and quantity.')}</span></label>
      {fieldError('reviewed')}
    </form>
    <aside className="shop-summary" aria-labelledby="shop-summary-title"><h2 id="shop-summary-title">{text('طلبك، بكل تفاصيله', 'Your order, in detail')}</h2><div className="shop-checkout-lines">{items.map(item => <div key={item.id}><LineThumb config={item.config} width={44} /><span><strong>{item.config.brand}</strong><small>{designLabel(item.config, language)} · {item.config.nfc ? 'QR + NFC' : text('QR فقط', 'QR only')}<br />{number(unitPiastres(item.config, prices) / 100)} × {number(item.config.quantity)}<StandColorSummary config={item.config} /></small></span><b>{number(linePiastres(item.config, prices) / 100)}</b></div>)}</div>
      <StandPriceBreakdown items={items.map(item => item.config)} prices={prices} deliveryFeePiastres={info ? deliveryFee : undefined} />
      {deliveryNote && <p className="shop-delivery-note"><PackageIcon size={16} aria-hidden="true" />{deliveryNote}</p>}
      {shop.state.status === 'loading' && <p className="shop-info-loading" role="status">{text('بنجيب سعر التوصيل وطرق الدفع…', 'Loading delivery and payment options…')}</p>}
      {shop.state.status === 'error' && <div className="shop-alert" role="alert"><WarningCircleIcon size={20} aria-hidden="true" /><div><p>{text('مقدرناش نجيب سعر التوصيل وطرق الدفع دلوقتي. حواملك لسه في السلة.', 'We couldn’t load delivery and payment options right now. Your stands are still in your bag.')}</p><button type="button" className="shop-text-button" onClick={shop.retry}><ArrowClockwiseIcon size={15} aria-hidden="true" />{text('حاول تاني', 'Try again')}</button></div></div>}
      {tooManyDesigns && <div className="shop-alert" role="alert"><WarningCircleIcon size={20} aria-hidden="true" /><div><p>{text(`الطلب الواحد فيه لحد ${number(MAX_DESIGNS)} تصميم. احذف كام تصميم من السلة أو قسّمهم على طلبين.`, `One order can hold up to ${MAX_DESIGNS} designs. Remove some from your bag or split them into two orders.`)}</p></div></div>}
      {problem && <div className="shop-alert" role="alert" tabIndex={-1} ref={problemRef}><WarningCircleIcon size={20} aria-hidden="true" /><div><p>{problem.message}</p><div className="shop-alert-actions">
        {problem.retry && <button type="button" className="shop-text-button" onClick={() => void submit()}><ArrowClockwiseIcon size={15} aria-hidden="true" />{text('جرّب تاني', 'Try again')}</button>}
        {problem.payByCash && <button type="button" className="shop-text-button" onClick={() => { update('payment', 'cash'); setProblem(null); }}><MoneyIcon size={15} aria-hidden="true" />{text('ادفع كاش عند الاستلام', 'Pay cash on delivery')}</button>}
        {problem.backToBag && <button type="button" className="shop-text-button" onClick={onBack}><ArrowLeftIcon size={15} className="directional-arrow" aria-hidden="true" />{text('ارجع للسلة', 'Back to your bag')}</button>}
      </div></div></div>}
      {priceChange ? <div className="shop-price-change" role="alert">
        <h3 ref={priceRef} tabIndex={-1}>{text('الأسعار اتحدّثت', 'Prices have been updated')}</h3>
        <p>{text('إجمالي طلبك بقى', 'Your order total is now')} <strong>{egp(priceChange.totalPiastres)}</strong> {text('بدل', 'instead of')} <s>{egp(priceChange.previousPiastres)}</s>.{priceChange.deliveryFeePiastres === null ? ` ${text('سعر التوصيل هيتأكد بالتليفون.', 'The delivery fee will be confirmed by phone.')}` : ''}</p>
        <button type="button" className="button button-teal" onClick={() => void submit(priceChange.totalPiastres)}>{text(`أكّد الإجمالي الجديد (${egp(priceChange.totalPiastres)})`, `Confirm the new total (${egp(priceChange.totalPiastres)})`)}</button>
        <button type="button" className="shop-text-button" onClick={onBack}>{text('ارجع للسلة', 'Back to your bag')}</button>
      </div> : <button type="submit" form="shop-checkout-form" className="button button-teal" disabled={!info || tooManyDesigns || submitting}>
        {phase === 'uploading' ? text('بنرفع اللوجو…', 'Uploading your logo…') : phase === 'placing' ? text('بنبعت طلبك…', 'Sending your order…') : method === 'PAYMOB' ? text('كمّل للدفع', 'Continue to payment') : text('أكّد الطلب', 'Place order')}
        {!submitting && <ArrowLeftIcon size={18} className="directional-arrow" aria-hidden="true" />}
      </button>}
      <small>{method === 'PAYMOB' ? text('هتتحوّل لصفحة دفع Paymob الآمنة، وبعدها ترجع لصفحة طلبك.', 'You’ll go to Paymob’s secure page, then back to your order.') : text('هنكلمك نأكد التفاصيل قبل الطباعة. الدفع للمندوب عند الاستلام.', 'We’ll call to confirm the details before printing. Pay the courier on delivery.')}</small>
      <div className="shop-sr-only" role="status">{submitting ? text('بنبعت طلبك…', 'Sending your order…') : ''}</div>
    </aside>
  </div></section>;
}
