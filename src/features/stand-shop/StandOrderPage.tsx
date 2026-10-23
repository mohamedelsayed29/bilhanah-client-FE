import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowClockwiseIcon, ArrowLeftIcon, CheckIcon, CopyIcon, CreditCardIcon, EnvelopeSimpleIcon, MoneyIcon, ReceiptIcon, WarningCircleIcon, WhatsappLogoIcon, XIcon } from '@phosphor-icons/react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import type { PublicStandOrder, StandOrderLine, StandOrderStatus } from '@bilhanah/contracts';
import { ApiError } from '../../lib/api';
import { CONTACT_EMAIL, CONTACT_WHATSAPP } from '../../lib/config';
import { useLanguage, usePageTitle } from '../../lib/language';
import { designs, purposes, shapes } from './catalog';
import { fetchStandOrder, payStandOrder, rememberStandOrder } from './shop-api';
import './shop.css';
import './stand-order.css';

/** How often, and how long, to check an order after Paymob sends the customer back. */
export const PAYMENT_POLL_INTERVAL = 3_000;
export const PAYMENT_POLL_LIMIT = 60_000;

type Problem = 'not-found' | 'error' | null;
/** After Paymob: checking → paid (the order moved on), failed (Paymob said no) or timeout (still waiting). */
type PaymentCheck = 'idle' | 'checking' | 'paid' | 'failed' | 'timeout';

const FLOW: StandOrderStatus[] = ['AWAITING_PAYMENT', 'NEW', 'CONFIRMED', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED'];

/** Paymob returns to /shop/orders/<token> with its own query parameters (success, txn_response_code, hmac…). */
function paymobReturn(search: string): { returned: boolean; success: boolean | null } {
  const params = new URLSearchParams(search);
  const returned = ['success', 'txn_response_code', 'hmac', 'pending'].some(name => params.has(name));
  const success = params.get('success');
  return { returned, success: success === 'true' ? true : success === 'false' ? false : null };
}

/** The order the checkout just placed, handed over in navigation state so the page shows it at once. */
function placedOrder(state: unknown, token: string): PublicStandOrder | null {
  const value = state as { token?: unknown; order?: PublicStandOrder } | null;
  return value?.token === token && value.order ? value.order : null;
}

function whatsappHref(message: string) {
  return CONTACT_WHATSAPP ? `https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent(message)}` : null;
}

/** `/shop/orders/:token`: a stand order as its customer sees it. */
export function StandOrderPage() {
  const { token = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { text, language, number } = useLanguage();
  const [order, setOrder] = useState<PublicStandOrder | null>(() => placedOrder(location.state, token));
  const [problem, setProblem] = useState<Problem>(null);
  const [attempt, setAttempt] = useState(0);
  const [returned] = useState(() => paymobReturn(location.search));
  const [check, setCheck] = useState<PaymentCheck>(() => returned.returned ? 'checking' : 'idle');
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [copied, setCopied] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  usePageTitle(order ? `طلب ${order.reference} | متجر بالهنا` : 'طلبك | متجر بالهنا', order ? `Order ${order.reference} | Bilhanah shop` : 'Your order | Bilhanah shop');

  const load = useCallback((signal?: AbortSignal) => fetchStandOrder(token, signal).then(next => {
    setOrder(next); setProblem(null);
    rememberStandOrder({ trackingToken: token, reference: next.reference, placedAt: next.createdAt });
    return next;
  }), [token]);

  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;
    const started = Date.now();
    const finishCheck = (result: PaymentCheck) => {
      setCheck(result);
      // Paymob's parameters (and its signature) should not stay in the address bar or in shared links.
      navigate({ pathname: location.pathname, search: '' }, { replace: true, state: null });
    };
    const timeLeft = () => Date.now() - started + PAYMENT_POLL_INTERVAL <= PAYMENT_POLL_LIMIT;
    const poll = () => load(controller.signal).then(next => {
      if (!returned.returned) return;
      if (next.status !== 'AWAITING_PAYMENT') { finishCheck(next.status === 'CANCELLED' ? 'idle' : 'paid'); return; }
      if (returned.success === false) { finishCheck('failed'); return; }
      if (!timeLeft()) { finishCheck('timeout'); return; }
      timer = window.setTimeout(poll, PAYMENT_POLL_INTERVAL);
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      const missing = error instanceof ApiError && (error.status === 404 || error.status === 400);
      // A dropped request while confirming a payment is worth another try.
      if (returned.returned && !missing && timeLeft()) { timer = window.setTimeout(poll, PAYMENT_POLL_INTERVAL); return; }
      if (returned.returned) finishCheck(missing ? 'idle' : 'timeout');
      setProblem(missing ? 'not-found' : 'error');
    });
    void poll();
    return () => { controller.abort(); window.clearTimeout(timer); };
    // Runs once per token (and per retry); the Paymob parameters are read when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, attempt]);

  // Coming back to the tab is a good moment to show the latest status.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible' && check !== 'checking') void load().catch(() => undefined); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load, check]);

  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [!!order, problem]);

  async function pay() {
    if (paying) return;
    setPaying(true); setPayError('');
    try {
      const { checkoutUrl } = await payStandOrder(token);
      const url = new URL(checkoutUrl);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new ApiError(500, 'BAD_CHECKOUT_URL');
      window.location.assign(url.href);
    } catch (error) {
      setPaying(false);
      const code = error instanceof ApiError ? error.code : '';
      if (code === 'NOT_AWAITING_PAYMENT') { setPayError(text('الطلب ده مش مستني دفع دلوقتي. حدّثنا الصفحة بآخر حالة.', 'This order isn’t waiting for payment anymore. We’ve refreshed its status.')); void load().catch(() => undefined); }
      else if (code === 'ONLINE_PAYMENT_UNAVAILABLE') setPayError(text('الدفع الأونلاين مش شغال دلوقتي. جرّب تاني بعد شوية أو كلّمنا نكمّل الطلب كاش.', 'Online payment isn’t working right now. Try again shortly, or contact us to switch to cash on delivery.'));
      else if (error instanceof ApiError && error.status === 429) setPayError(text('محاولات كتير ورا بعض. استنى دقيقة وجرّب تاني.', 'Too many attempts. Wait a minute and try again.'));
      else setPayError(text('مقدرناش نفتح صفحة الدفع. اتأكد من الاتصال وجرّب تاني.', 'We couldn’t open the payment page. Check your connection and try again.'));
    }
  }

  async function copyReference() {
    if (!order) return;
    try { await navigator.clipboard.writeText(order.reference); setCopied(true); window.setTimeout(() => setCopied(false), 2500); } catch { /* The reference stays visible to copy by hand. */ }
  }

  const breadcrumb = <nav className="shop-topbar page-container" aria-label={text('مسار الصفحة', 'Breadcrumb')}><div className="shop-breadcrumb"><Link to="/">{text('الرئيسية', 'Home')}</Link><span>/</span><Link to="/shop">{text('متجر الحوامل', 'Stand shop')}</Link><span>/</span><span>{order ? <bdi dir="ltr">{order.reference}</bdi> : text('طلبك', 'Your order')}</span></div></nav>;
  const contact = (reference?: string) => {
    const whatsapp = whatsappHref(text(`أهلًا، بسأل عن طلب الحوامل ${reference ?? ''}`.trim(), `Hi, I’m asking about stand order ${reference ?? ''}`.trim()));
    return <div className="stand-order-contact">
      {whatsapp && <a className="button button-outline" href={whatsapp} target="_blank" rel="noreferrer"><WhatsappLogoIcon size={18} aria-hidden="true" />{text('كلّمنا واتساب', 'WhatsApp us')}</a>}
      <a className="button button-outline" href={`mailto:${CONTACT_EMAIL}${reference ? `?subject=${encodeURIComponent(reference)}` : ''}`}><EnvelopeSimpleIcon size={18} aria-hidden="true" />{text('ابعتلنا إيميل', 'Email us')}</a>
      <Link className="shop-text-button" to="/contact">{text('كل طرق التواصل', 'All contact options')}</Link>
    </div>;
  };

  if (!order) {
    return <div className="stand-shop stand-order">
      {breadcrumb}
      <section className="stand-order-message page-container" aria-busy={!problem}>
        {!problem && <><p className="shop-sr-only" role="status">{text('بنجيب طلبك…', 'Loading your order…')}</p><div className="stand-order-skeleton" aria-hidden="true"><span /><span /><span /></div></>}
        {problem === 'not-found' && <><span className="shop-complete-icon" aria-hidden="true"><ReceiptIcon size={34} /></span><h1 ref={heading} tabIndex={-1}>{text('مش لاقيين الطلب ده', 'We can’t find this order')}</h1><p>{text('اتأكد إن الرابط كامل زي ما وصلك. لو لسه مش لاقيه، كلّمنا برقم الطلب.', 'Check that the link is complete. If you still can’t find it, contact us with your order number.')}</p><div className="stand-order-contact"><Link className="button button-teal" to="/shop">{text('ارجع للمتجر', 'Back to the shop')}<ArrowLeftIcon size={18} className="directional-arrow" aria-hidden="true" /></Link><Link className="shop-text-button" to="/contact">{text('تواصل معانا', 'Contact us')}</Link></div></>}
        {problem === 'error' && <><span className="shop-complete-icon" aria-hidden="true"><WarningCircleIcon size={34} /></span><h1 ref={heading} tabIndex={-1}>{text('مقدرناش نجيب طلبك دلوقتي', 'We couldn’t load your order')}</h1><p role="alert">{text('اتأكد من الاتصال وجرّب تاني. طلبك محفوظ عندنا.', 'Check your connection and try again. Your order is safe with us.')}</p><button type="button" className="button button-teal" onClick={() => { setProblem(null); setAttempt(value => value + 1); }}><ArrowClockwiseIcon size={18} aria-hidden="true" />{text('حاول تاني', 'Try again')}</button></>}
      </section>
    </div>;
  }

  const status = order.status;
  const online = order.paymentMethod === 'PAYMOB';
  const steps = FLOW.filter(step => online || step !== 'AWAITING_PAYMENT');
  const reached = steps.indexOf(status);
  const egp = (piastres: number) => `${number(piastres / 100)} ${text('ج.م', 'EGP')}`;
  const date = (iso: string) => new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

  const labels: Record<StandOrderStatus, string> = {
    AWAITING_PAYMENT: text('مستني الدفع', 'Awaiting payment'),
    NEW: text('الطلب وصلنا', 'Order received'),
    CONFIRMED: text('أكّدناه معاك', 'Confirmed'),
    IN_PRODUCTION: text('بيتصنع', 'In production'),
    SHIPPED: text('اتشحن', 'Shipped'),
    DELIVERED: text('اتسلّم', 'Delivered'),
    CANCELLED: text('اتلغى', 'Cancelled'),
  };
  const headline: Record<StandOrderStatus, [string, string]> = {
    AWAITING_PAYMENT: [text('فاضل الدفع عشان نبدأ', 'One step left: payment'), text('كمّل الدفع أونلاين عشان طلبك يوصلنا. لو ما اتدفعش خلال يومين بيتلغي لوحده.', 'Finish paying online so we can start. Unpaid orders are cancelled automatically after two days.')],
    NEW: [text('طلبك وصلنا', 'We’ve got your order'), text('هنكلمك قريب على رقمك نأكد التصميم والعنوان قبل ما نبدأ الطباعة.', 'We’ll call you soon to confirm the design and address before printing.')],
    CONFIRMED: [text('أكّدنا طلبك', 'Your order is confirmed'), text('هنبدأ تصنيع حواملك قريب، والصفحة دي هتوريك كل خطوة.', 'We’ll start making your stands soon. This page shows every step.')],
    IN_PRODUCTION: [text('حواملك بتتصنع', 'Your stands are being made'), text('بنطبع ونجهّز حواملك. هنبلغك أول ما تتشحن.', 'We’re printing and finishing your stands. We’ll let you know when they ship.')],
    SHIPPED: [text('طلبك في الطريق', 'Your order is on its way'), online ? text('المندوب هيكلمك قبل ما يوصل.', 'The courier will call before arriving.') : text('المندوب هيكلمك قبل ما يوصل. جهّز المبلغ كاش.', 'The courier will call before arriving. Please have the cash ready.')],
    DELIVERED: [text('حواملك وصلت. بالهنا!', 'Delivered. Enjoy!'), text('نتمنى الحوامل تعجبك وتعجب ضيوفك.', 'We hope you and your guests love them.')],
    CANCELLED: [text('الطلب اتلغى', 'This order was cancelled'), text('لو ده مش متوقع أو عايز تطلب تاني، كلّمنا برقم الطلب.', 'If that’s unexpected or you’d like to order again, contact us with your order number.')],
  };
  const paymentLabel = online ? text('أونلاين (كارت أو محفظة)', 'Online (card or wallet)') : text('كاش عند الاستلام', 'Cash on delivery');
  const paymentState = order.paymentStatus === 'PAID' ? text('اتدفع', 'Paid') : online ? text('لسه ما اتدفعش', 'Not paid yet') : text('هتدفع للمندوب', 'Pay the courier');
  const canPay = status === 'AWAITING_PAYMENT' && check !== 'checking';

  return <div className="stand-shop stand-order">
    {breadcrumb}
    <section className={`stand-order-hero page-container status-${status.toLowerCase()}`} aria-labelledby="stand-order-title">
      <div className="stand-order-reference">
        <span>{text('رقم الطلب', 'Order number')}</span>
        <strong dir="ltr">{order.reference}</strong>
        <button type="button" className="shop-text-button" onClick={copyReference}>{copied ? <CheckIcon size={15} aria-hidden="true" /> : <CopyIcon size={15} aria-hidden="true" />}{copied ? text('اتنسخ', 'Copied') : text('انسخ الرقم', 'Copy number')}</button>
        <small>{text('احتفظ برقم الطلب. هتحتاجه لو كلّمتنا.', 'Keep this number. You’ll need it if you contact us.')}</small>
      </div>
      <div className="stand-order-status">
        <span className="stand-order-pill">{labels[status]}</span>
        <h1 id="stand-order-title" ref={heading} tabIndex={-1}>{check === 'checking' ? text('بنأكد الدفع…', 'Confirming your payment…') : headline[status][0]}</h1>
        <div role="status" aria-live="polite">
          {check === 'checking' && <p className="stand-order-checking"><span className="shop-spinner" aria-hidden="true" />{text('بنستنى تأكيد Paymob. ده بياخد ثواني، متقفلش الصفحة.', 'Waiting for Paymob to confirm. This takes a few seconds; please keep this page open.')}</p>}
          {check === 'paid' && <p className="stand-order-result is-good"><CheckIcon size={18} weight="bold" aria-hidden="true" />{text('الدفع اتأكد. شكرًا!', 'Payment confirmed. Thank you!')}</p>}
          {check === 'failed' && status === 'AWAITING_PAYMENT' && <p className="stand-order-result is-bad"><XIcon size={18} weight="bold" aria-hidden="true" />{text('الدفع ما كملش. مفيش فلوس اتخصمت، وتقدر تجرّب تاني.', 'The payment didn’t go through. Nothing was charged, and you can try again.')}</p>}
          {check === 'timeout' && status === 'AWAITING_PAYMENT' && <p className="stand-order-result is-wait"><WarningCircleIcon size={18} weight="bold" aria-hidden="true" />{text('لسه موصلناش تأكيد الدفع. لو اتخصم منك مبلغ، هيتأكد خلال دقايق والصفحة دي هتتحدّث. لو لأ، جرّب تدفع تاني أو كلّمنا.', 'We haven’t received the payment confirmation yet. If you were charged, it will be confirmed within minutes and this page will update. If not, try paying again or contact us.')}</p>}
        </div>
        {check !== 'checking' && <p className="stand-order-next">{headline[status][1]}</p>}
        {canPay && <div className="stand-order-pay">
          <button type="button" className="button button-teal" onClick={() => void pay()} disabled={paying}><CreditCardIcon size={19} aria-hidden="true" />{paying ? text('بنفتح صفحة الدفع…', 'Opening payment…') : check === 'failed' || check === 'timeout' ? text('ادفع تاني', 'Pay again') : text('كمّل الدفع', 'Complete payment')}</button>
          {payError && <p className="shop-error" role="alert">{payError}</p>}
        </div>}
        {check === 'timeout' && status === 'AWAITING_PAYMENT' && contact(order.reference)}
      </div>
    </section>

    <div className="stand-order-layout page-container">
      <div>
        {status !== 'CANCELLED' ? <ol className="stand-order-timeline" aria-label={text('مراحل الطلب', 'Order progress')}>
          {steps.map((step, index) => {
            const state = index < reached || status === 'DELIVERED' ? 'done' : index === reached ? 'current' : 'todo';
            return <li key={step} className={state} aria-current={state === 'current' ? 'step' : undefined}>
              <span className="stand-order-dot" aria-hidden="true">{state === 'done' ? <CheckIcon size={13} weight="bold" /> : null}</span>
              <span>{step === 'AWAITING_PAYMENT' && state === 'done' ? text('اتدفع', 'Paid') : labels[step]}</span>
              <span className="shop-sr-only">{state === 'done' ? text('، خلصت', ', done') : state === 'current' ? text('، دلوقتي', ', current') : ''}</span>
            </li>;
          })}
        </ol> : <p className="stand-order-cancelled"><XIcon size={18} weight="bold" aria-hidden="true" />{labels.CANCELLED}</p>}

        <section className="stand-order-lines" aria-labelledby="stand-order-lines-title">
          <h2 id="stand-order-lines-title">{text('حواملك', 'Your stands')}</h2>
          <ul>{order.lines.map(line => <OrderLine key={line.id} line={line} />)}</ul>
        </section>
      </div>

      <aside className="shop-summary" aria-labelledby="stand-order-summary">
        <h2 id="stand-order-summary">{text('الحساب', 'Summary')}</h2>
        <dl className="shop-price-breakdown">
          <div><dt>{text('إجمالي المنتجات', 'Product total')}</dt><dd>{egp(order.subtotalPiastres)}</dd></div>
          <div><dt>{text('التوصيل', 'Delivery')}</dt><dd>{order.deliveryFeePiastres === null ? text('يتأكد بالتليفون', 'Confirmed by phone') : order.deliveryFeePiastres === 0 ? text('مجاني', 'Free') : egp(order.deliveryFeePiastres)}</dd></div>
          <div className="shop-summary-total"><dt>{order.deliveryFeePiastres === null ? text('الإجمالي من غير التوصيل', 'Total before delivery') : text('الإجمالي', 'Total')}</dt><dd>{egp(order.totalPiastres)}</dd></div>
        </dl>
        <dl className="stand-order-facts">
          <div><dt>{text('طريقة الدفع', 'Payment method')}</dt><dd>{online ? <CreditCardIcon size={16} aria-hidden="true" /> : <MoneyIcon size={16} aria-hidden="true" />}{paymentLabel}</dd></div>
          <div><dt>{text('حالة الدفع', 'Payment status')}</dt><dd className={order.paymentStatus === 'PAID' ? 'is-paid' : ''}>{paymentState}</dd></div>
          <div><dt>{text('باسم', 'Name')}</dt><dd><bdi>{order.customerName}</bdi></dd></div>
          <div><dt>{text('التوصيل لـ', 'Delivering to')}</dt><dd><bdi>{order.city}</bdi></dd></div>
          <div><dt>{text('تاريخ الطلب', 'Ordered')}</dt><dd><time dateTime={order.createdAt}>{date(order.createdAt)}</time></dd></div>
        </dl>
        <p className="stand-order-help">{text('عندك سؤال عن طلبك؟', 'Questions about your order?')}</p>
        {contact(order.reference)}
        <Link className="shop-back" to="/shop"><ArrowLeftIcon size={16} className="directional-arrow" aria-hidden="true" />{text('ارجع للمتجر', 'Back to the shop')}</Link>
      </aside>
    </div>
  </div>;
}

function OrderLine({ line }: { line: StandOrderLine }) {
  const { text, language, number } = useLanguage();
  const shape = shapes.find(item => item.id === line.shape);
  const preset = designs.find(item => item.id === line.design);
  const background = line.customColors?.background ?? preset?.background ?? '#ffffff';
  const ink = line.customColors?.ink ?? preset?.ink ?? '#000000';
  const egp = (piastres: number) => `${number(piastres / 100)} ${text('ج.م', 'EGP')}`;
  return <li className="stand-order-line">
    {shape && <img src={shape.image} alt="" width="64" height="80" />}
    <div>
      <h3><bdi>{line.brand || text('بدون اسم', 'No name')}</bdi></h3>
      <p>{shape?.name[language] ?? line.shape} · {line.customColors ? text('ألوان مخصصة', 'Custom colors') : preset?.name[language] ?? line.design} · {purposes.find(item => item.id === line.purpose)?.name[language] ?? line.purpose}</p>
      <p className="stand-order-swatches"><span style={{ background }} aria-hidden="true" /><span style={{ background: ink }} aria-hidden="true" /><span className="shop-sr-only">{text('ألوان الطباعة:', 'Print colors:')}</span><bdi dir="ltr">{background.toUpperCase()} / {ink.toUpperCase()}</bdi></p>
      <p><span className="shop-tech-label">{line.nfc ? 'QR + NFC' : text('QR فقط', 'QR only')}</span>{line.hasLogo && <> · {text('باللوجو', 'With logo')}</>}{line.numbered && <> · {text('ترابيزة', 'Table')} {number(line.startNumber)}–{number(line.startNumber + line.quantity - 1)}</>}</p>
      {line.caption && <p>{text('العبارة:', 'Message:')} <bdi>{line.caption}</bdi></p>}
      <p className="stand-order-url"><bdi dir="ltr">{line.url}</bdi></p>
    </div>
    <div className="stand-order-line-price"><span>{number(line.quantity)} × {number(line.unitPricePiastres / 100)}</span><strong>{egp(line.lineTotalPiastres)}</strong></div>
  </li>;
}
