import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import { ArrowClockwiseIcon, BellRingingIcon, ChairIcon, CheckIcon, ForkKnifeIcon, GlobeHemisphereWestIcon, PhoneIcon, ReceiptIcon, ShoppingBagIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { io } from 'socket.io-client';
import type { OrderStatus, PublicOrder, TrackedOrderEvent } from '@bilhanah/contracts';
import { API_URL } from '../../../lib/config';
import { useLanguage } from '../../../lib/language';
import { formatPrice, imageAttributes, localized, readableTextOn } from '../menu-format';
import { DEFAULT_BRAND } from '../MenuView';
import { ApiError, CLOSED_STATUSES, fetchTrackedOrder, ORDER_PATH, ORDER_PROGRESS } from './order-api';
import { announceOrderReady } from './order-alerts';
import { loadRecentOrders } from './ordering-storage';
import type { Navigate } from './OrderingMenu';
import { tableName } from './use-table';
import './ordering.css';

/** How often to check the order when live updates cannot connect. */
export const POLL_INTERVAL = 15_000;
/** Poll if the socket has not connected by then (a proxy may stall WebSockets without an error). */
const CONNECT_GRACE = 5_000;

type Problem = 'not-found' | 'error' | null;

/** Statuses only move forward, so a late response must not undo a newer push. */
const progress = (status: OrderStatus) => CLOSED_STATUSES.includes(status) ? ORDER_PROGRESS.length : ORDER_PROGRESS.indexOf(status as (typeof ORDER_PROGRESS)[number]);

/** The order the checkout just placed, handed over in history state so the page shows it at once. */
function placedOrder(token: string): PublicOrder | null {
  const state = history.state as { token?: unknown; order?: PublicOrder } | null;
  return state?.token === token && state.order ? state.order : null;
}

/**
 * Keeps the order current: Socket.IO pushes changes, every (re)connect refetches what may have been
 * missed, and while the socket is down the page polls instead. Closed orders stop listening.
 */
function useTrackedOrder(token: string) {
  const [order, setOrder] = useState<PublicOrder | null>(() => placedOrder(token));
  const [problem, setProblem] = useState<Problem>(null);
  const [connection, setConnection] = useState<'connecting' | 'live' | 'polling'>('connecting');
  const [attempt, setAttempt] = useState(0);
  const finished = !!order && CLOSED_STATUSES.includes(order.status);

  useEffect(() => {
    if (finished) return;
    let active = true;
    let poll: number | undefined;
    const update = (next: PublicOrder) => setOrder(current => !current || progress(next.status) >= progress(current.status) ? next : current);
    const refresh = () => fetchTrackedOrder(token).then(next => {
      if (active) { update(next); setProblem(null); }
    }).catch((error: unknown) => {
      if (!active) return;
      setProblem(error instanceof ApiError && (error.status === 404 || error.status === 400) ? 'not-found' : 'error');
    });
    const startPolling = () => {
      if (!active || poll !== undefined) return;
      setConnection('polling');
      poll = window.setInterval(refresh, POLL_INTERVAL);
    };
    const stopPolling = () => { window.clearInterval(poll); poll = undefined; };

    // Also when the checkout handed the order over: history state outlives a reload.
    void refresh();
    const socket = io(`${API_URL}/track`, { path: ORDER_PATH.realtime, transports: ['websocket'], auth: { token } });
    const grace = window.setTimeout(() => { if (!socket.connected) startPolling(); }, CONNECT_GRACE);
    socket.on('connect', () => { setConnection('live'); stopPolling(); void refresh(); });
    socket.on('connect_error', startPolling);
    socket.on('disconnect', startPolling);
    socket.on(ORDER_PATH.updated, (event: TrackedOrderEvent) => { if (active) update(event.order); });
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.clearTimeout(grace);
      stopPolling();
      socket.removeAllListeners();
      socket.disconnect();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [token, finished, attempt]);

  return { order, problem, connection, finished, retry: () => { setProblem(null); setAttempt(value => value + 1); } };
}

/** `/order/<trackingToken>` on the restaurant's subdomain: the diner's order, live. */
export default function TrackingPage({ subdomain, token, navigate }: { subdomain: string; token: string; navigate: Navigate }) {
  const { language, text, number, toggleLanguage } = useLanguage();
  const { order, problem, connection, finished, retry } = useTrackedOrder(token);
  const brand = order?.restaurant.brandColor ?? DEFAULT_BRAND;
  const style = { '--brand': brand, '--on-brand': readableTextOn(brand) } as CSSProperties;
  const backToMenu = (event: MouseEvent) => { event.preventDefault(); navigate('/'); };

  // Celebrate the moment the order turns ready, not every time a ready order is opened.
  const previousStatus = useRef<OrderStatus | undefined>(order?.status);
  useEffect(() => {
    if (!order) return;
    const previous = previousStatus.current;
    previousStatus.current = order.status;
    if (previous && previous !== 'READY' && order.status === 'READY') announceOrderReady(order);
  }, [order]);

  useEffect(() => {
    if (!order) return;
    document.title = text(`طلب رقم ${number(order.number)} | ${order.restaurant.name}`, `Order #${order.number} | ${order.restaurant.name}`);
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.append(meta); }
    meta.content = brand;
  }, [order, brand, text, number]);

  const languageButton = <button className="menu-language" onClick={toggleLanguage} aria-label={text('Switch to English', 'التبديل للعربية')}><GlobeHemisphereWestIcon size={18} /><span>{text('EN', 'عربي')}</span></button>;

  if (!order) {
    return <main className="track-page track-message" style={style} aria-busy={!problem}>
      {languageButton}
      {!problem && <><p className="visually-hidden" role="status">{text('جاري تحميل طلبك…', 'Loading your order…')}</p><div className="track-skeleton" aria-hidden="true"><span /><span /><span /></div></>}
      {problem === 'not-found' && <div className="restaurant-card"><span className="restaurant-mark"><ReceiptIcon size={26} /></span><h1>{text('مش لاقيين الطلب ده', 'Order not found')}</h1><p>{text('اتأكد من اللينك، أو ارجع للمنيو.', 'Check the link, or go back to the menu.')}</p><a className="order-button secondary" href="/" onClick={backToMenu}>{text('ارجع للمنيو', 'Back to the menu')}</a></div>}
      {problem === 'error' && <div className="restaurant-card"><span className="restaurant-mark"><ReceiptIcon size={26} /></span><p role="alert">{text('مقدرناش نجيب طلبك دلوقتي.', 'We could not load your order right now.')}</p><button className="button button-teal" onClick={retry}><ArrowClockwiseIcon size={18} />{text('حاول تاني', 'Try again')}</button></div>}
    </main>;
  }

  const status = order.status;
  const stopped = status === 'REJECTED' || status === 'CANCELLED';
  const reached = ORDER_PROGRESS.indexOf(status as (typeof ORDER_PROGRESS)[number]);
  const time = (iso: string | null) => iso && new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG' : 'en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  const price = (piastres: number) => `${formatPrice(piastres, language)} ${text('ج.م', 'EGP')}`;
  const where = order.type === 'DINE_IN'
    ? order.tableLabel ? tableName(order.tableLabel, language) : text('في المطعم', 'Dine in')
    : text('تيك أواي', 'Pickup');

  const headline: Record<OrderStatus, [string, string]> = {
    PLACED: [text('وصل طلبك للمطعم', 'Your order was sent'), text('مستنيين المطعم يأكّده. الصفحة دي بتتحدّث لوحدها.', 'Waiting for the restaurant to confirm it. This page updates by itself.')],
    ACCEPTED: [text('المطعم أكّد طلبك', 'Your order is confirmed'), text('المطبخ هيبدأ فيه قريب. هنحدّث الصفحة دي أول بأول.', 'The kitchen will start on it soon. We will keep this page updated.')],
    PREPARING: [text('طلبك بيتحضّر', 'Your order is being prepared'), text('هنقولك هنا أول ما يجهز.', 'We will show it here the moment it is ready.')],
    READY: [text('طلبك جاهز!', 'Your order is ready!'), order.type === 'DINE_IN' ? text('هيوصلك على الطاولة حالًا.', 'It is on its way to your table.') : text('اتفضّل استلمه من المطعم.', 'Please collect it at the counter.')],
    COMPLETED: [text('بالهنا والشفا!', 'Enjoy your meal!'), text(`شكرًا إنك طلبت من ${order.restaurant.name}.`, `Thank you for ordering from ${order.restaurant.name}.`)],
    REJECTED: [text('المطعم اعتذر عن الطلب', 'The restaurant could not take your order'), text('تقدر تكلّم المطعم أو تطلب تاني من المنيو.', 'You can call the restaurant or order again from the menu.')],
    CANCELLED: [text('الطلب اتلغى', 'Your order was cancelled'), text('تقدر تكلّم المطعم أو تطلب تاني من المنيو.', 'You can call the restaurant or order again from the menu.')],
  };
  const steps: Record<(typeof ORDER_PROGRESS)[number], { label: string; at: string | null }> = {
    PLACED: { label: text('اتبعت', 'Placed'), at: order.placedAt },
    ACCEPTED: { label: text('اتأكّد', 'Accepted'), at: order.acceptedAt },
    PREPARING: { label: text('بيتحضّر', 'Preparing'), at: null },
    READY: { label: text('جاهز', 'Ready'), at: order.readyAt },
    COMPLETED: { label: text('اتسلّم', 'Completed'), at: order.completedAt },
  };
  const otherOrders = loadRecentOrders(subdomain).filter(recent => recent.trackingToken !== token);

  return <div className="track-page" style={style}>
    <header className="track-header">
      <a className="track-restaurant" href="/" onClick={backToMenu}>
        {order.restaurant.logo
          ? <img className="track-logo" {...imageAttributes(order.restaurant.logo, '44px')} alt="" />
          : <span className="track-logo track-logo-initial" aria-hidden="true">{order.restaurant.name.trim().charAt(0)}</span>}
        <span>{order.restaurant.name}</span>
      </a>
      {languageButton}
    </header>

    <main className="track-container">
      <section className={`track-hero status-${status.toLowerCase()}`} aria-labelledby="track-status">
        {status === 'READY' && <span className="track-ready-icon" aria-hidden="true"><BellRingingIcon size={34} weight="fill" /></span>}
        <p className="track-number"><span>{text('طلب رقم', 'Order')}</span><strong>{language === 'ar' ? number(order.number) : `#${order.number}`}</strong></p>
        <p className="track-where">{order.type === 'DINE_IN' ? <ChairIcon size={17} /> : <ShoppingBagIcon size={17} />}<bdi>{where}</bdi><span aria-hidden="true">·</span><bdi>{order.customerName}</bdi></p>
        <div role="status" aria-live="polite" aria-atomic="true">
          <h1 id="track-status">{headline[status][0]}</h1>
          <p className="track-next">{headline[status][1]}</p>
        </div>
        {stopped && order.rejectionReason && <p className="track-reason"><WarningCircleIcon size={18} weight="fill" /><span><strong>{text('السبب', 'Reason')}</strong><bdi>{order.rejectionReason}</bdi></span></p>}
        {!finished && <p className={`track-live is-${connection}`}><span className="track-live-dot" aria-hidden="true" />{{
          connecting: text('بنوصّل التحديث المباشر…', 'Connecting live updates…'),
          live: text('تحديث مباشر', 'Live updates'),
          polling: text(`بنحدّث كل ${number(POLL_INTERVAL / 1000)} ثانية`, `Updating every ${POLL_INTERVAL / 1000} seconds`),
        }[connection]}</p>}
      </section>

      {!stopped && <ol className="track-timeline" aria-label={text('مراحل الطلب', 'Order progress')}>
        {ORDER_PROGRESS.map((step, index) => {
          const state = index < reached || status === 'COMPLETED' ? 'done' : index === reached ? 'current' : 'todo';
          return <li key={step} className={`track-step ${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="track-step-dot" aria-hidden="true">{state === 'done' ? <CheckIcon size={14} weight="bold" /> : state === 'current' && step === 'PREPARING' ? <ForkKnifeIcon size={14} weight="bold" /> : null}</span>
            <span className="track-step-label">{steps[step].label}</span>
            {steps[step].at && state !== 'todo' && <time className="track-step-time" dateTime={steps[step].at}>{time(steps[step].at)}</time>}
            <span className="visually-hidden">{state === 'done' ? text('، خلصت', ', done') : state === 'current' ? text('، دلوقتي', ', current') : ''}</span>
          </li>;
        })}
      </ol>}

      <section className="track-card" aria-labelledby="track-items">
        <h2 id="track-items">{text('تفاصيل الطلب', 'Order details')}</h2>
        <ul className="track-items">
          {order.items.map(line => {
            const size = localized(language, line.variantNameAr, line.variantNameEn);
            return <li key={line.id}>
              <span className="track-qty">{number(line.quantity)}×</span>
              <span className="track-item-name">{localized(language, line.nameAr, line.nameEn)}{size && <small> · {size}</small>}{line.note && <em>{line.note}</em>}</span>
              <span className="track-item-total">{price(line.lineTotalPiastres)}</span>
            </li>;
          })}
        </ul>
        {order.note && <p className="track-note"><strong>{text('ملاحظة: ', 'Note: ')}</strong><bdi>{order.note}</bdi></p>}
        <p className="order-total"><span>{text('الإجمالي', 'Total')}</span><strong>{price(order.subtotalPiastres)}</strong></p>
        <p className="order-hint">{text(`اتطلب ${time(order.placedAt)} · الدفع في المطعم`, `Placed at ${time(order.placedAt)} · Pay at the restaurant`)}</p>
      </section>

      <div className="track-actions">
        <a className="order-button secondary" href={`tel:${order.restaurant.phone}`}><PhoneIcon size={20} /><span>{text('كلّم المطعم', 'Call the restaurant')}</span></a>
        <a className="order-button ghost" href="/" onClick={backToMenu}><span>{text('ارجع للمنيو', 'Back to the menu')}</span></a>
      </div>

      {otherOrders.length > 0 && <nav className="track-card track-others" aria-labelledby="track-others">
        <h2 id="track-others">{text('طلباتك التانية', 'Your other orders')}</h2>
        <ul>{otherOrders.map(recent => <li key={recent.trackingToken}>
          <a href={`/order/${encodeURIComponent(recent.trackingToken)}`} onClick={event => { event.preventDefault(); navigate(`/order/${encodeURIComponent(recent.trackingToken)}`); }}>
            <ReceiptIcon size={18} />{text(`طلب رقم ${number(recent.number)}`, `Order #${recent.number}`)}<span>{time(recent.placedAt)}</span>
          </a>
        </li>)}</ul>
      </nav>}
    </main>
  </div>;
}
