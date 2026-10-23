import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CaretLeftIcon, ChairIcon, ReceiptIcon, ShoppingBagIcon, XIcon } from '@phosphor-icons/react';
import type { PlaceOrderResponse, PublicMenuCategory, PublicMenuItem } from '@bilhanah/contracts';
import { useLanguage } from '../../../lib/language';
import { DAY_NAMES, formatPrice, formatTime, hasAnyHours, localized } from '../menu-format';
import { MenuView, useIsOpen, type AvailableRestaurant, type MenuOrdering } from '../MenuView';
import { AddToOrderForm } from './AddToOrderForm';
import { CartSheet, itemCount } from './CartSheet';
import { nextOpening } from './next-opening';
import { newIdempotencyKey } from './order-api';
import { loadRecentOrders, rememberOrder } from './ordering-storage';
import { tableName, useTable } from './use-table';
import { useCart } from './use-cart';
import './ordering.css';

export type Navigate = (path: string, state?: unknown) => void;

export type OrderingMenuProps = { restaurant: AvailableRestaurant; categories: PublicMenuCategory[]; subdomain: string; navigate: Navigate };

/** The menu while the restaurant takes orders: add buttons, the scanned table, the cart and checkout. */
export function OrderingMenu({ restaurant, categories, subdomain, navigate }: OrderingMenuProps) {
  const { language, text, number } = useLanguage();
  const cart = useCart(subdomain, categories);
  const { table, setTable, invalidScan, dismissInvalidScan } = useTable(subdomain);
  const [cartOpen, setCartOpen] = useState(false);
  const [recentOrders] = useState(() => loadRecentOrders(subdomain));
  const [notice, setNotice] = useState<{ id: number; message: string } | null>(null);
  const isOpen = useIsOpen(restaurant);
  // One key per checkout: retries and double taps reuse it, so the API never creates the order twice.
  const keyRef = useRef<string | null>(null);
  const idempotencyKey = useCallback(() => keyRef.current ??= newIdempotencyKey(), []);

  const notify = useCallback((message: string) => setNotice({ id: Date.now(), message }), []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // One-off notices, in the language of the moment they happen.
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (cart.droppedOnLoad) notify(text('شلنا من طلبك أصناف مبقتش متاحة.', 'We removed dishes from your order that are no longer available.'));
  }, []);
  useEffect(() => {
    if (!invalidScan) return;
    notify(text('مقدرناش نتعرف على كود الطاولة. تقدر تطلب وتكتب رقم طاولتك وانت بتأكد الطلب.', 'We could not recognise this table code. You can still order and type your table number at checkout.'));
    dismissInvalidScan();
  }, [invalidScan]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const closedMessage = useMemo(() => {
    if (isOpen !== false || !hasAnyHours(restaurant.openingHours)) return null;
    const next = nextOpening(restaurant.openingHours, new Date(), restaurant.timezone);
    if (!next) return text('المطعم مقفول دلوقتي.', 'The restaurant is closed now.');
    const when = `${next.inDays === 0 ? text('النهارده', 'today') : next.inDays === 1 ? text('بكرة', 'tomorrow') : DAY_NAMES[next.day][language]} ${formatTime(next.opens, language)}`;
    return text(`المطعم مقفول دلوقتي. بيفتح ${when}.`, `The restaurant is closed now. It opens ${when}.`);
  }, [isOpen, restaurant.openingHours, restaurant.timezone, language, text]);

  function onPlaced(response: PlaceOrderResponse) {
    keyRef.current = null;
    rememberOrder(subdomain, { trackingToken: response.trackingToken, number: response.order.number, placedAt: response.order.placedAt });
    cart.clear();
    navigate(`/order/${encodeURIComponent(response.trackingToken)}`, { order: response.order, token: response.trackingToken });
  }

  const quickAdd = (item: PublicMenuItem) => {
    if (item.variants.length > 1) return false;
    const name = localized(language, item.nameAr, item.nameEn);
    if (cart.add(item, item.variants[0]!.id, 1)) notify(text(`اتضاف ${name} لطلبك.`, `${name} added to your order.`));
    else notify(text('طلبك وصل لأقصى عدد أصناف.', 'Your order has reached the maximum number of dishes.'));
    return true;
  };

  const latest = recentOrders[0];
  const ordering: MenuOrdering = {
    hasCart: cart.count > 0,
    quantityOf: cart.quantityOf,
    quickAdd,
    addForm: (item, close) => <AddToOrderForm item={item} onAdd={(variantId, quantity, note) => {
      const name = localized(language, item.nameAr, item.nameEn);
      if (cart.add(item, variantId, quantity, note)) notify(text(`اتضاف ${name} لطلبك.`, `${name} added to your order.`));
      else notify(text('طلبك وصل لأقصى عدد أصناف.', 'Your order has reached the maximum number of dishes.'));
      close();
    }} />,
    meta: table && <span className="table-badge"><ChairIcon size={15} weight="bold" />{table.label ? <bdi>{tableName(table.label, language)}</bdi> : text('طاولتك', 'Your table')}</span>,
    banner: latest && <a className="recent-order-link" href={`/order/${encodeURIComponent(latest.trackingToken)}`} onClick={event => { event.preventDefault(); navigate(`/order/${encodeURIComponent(latest.trackingToken)}`); }}>
      <ReceiptIcon size={20} />
      <span>{recentOrders.length > 1
        ? text(`طلباتك (${number(recentOrders.length)}): تابع طلب رقم ${number(latest.number)}`, `Your orders (${recentOrders.length}): track order #${latest.number}`)
        : text(`تابع طلبك رقم ${number(latest.number)}`, `Track your order #${latest.number}`)}</span>
      <CaretLeftIcon size={16} className="directional-arrow" />
    </a>,
    overlay: <>
      <div className="order-notice-region" role="status" aria-live="polite">
        {notice && <p className="order-notice" key={notice.id}>
          <span>{notice.message}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label={text('إخفاء', 'Dismiss')}><XIcon size={16} /></button>
        </p>}
      </div>
      {cart.count > 0 && <div className="cart-bar-wrap">
        <button type="button" className="cart-bar" onClick={() => setCartOpen(true)} aria-haspopup="dialog">
          <span className="cart-bar-count"><ShoppingBagIcon size={20} weight="fill" /><span>{number(cart.count)}</span></span>
          <span className="cart-bar-label">{text('عرض الطلب', 'View order')}<span className="visually-hidden">{text('، ', ', ')}{itemCount(cart.count, language, number)}</span></span>
          <span className="cart-bar-total">{formatPrice(cart.subtotal, language)} <small>{text('ج.م', 'EGP')}</small></span>
        </button>
      </div>}
      {cartOpen && <CartSheet restaurant={restaurant} subdomain={subdomain} cart={cart} table={table} setTable={setTable} closedMessage={closedMessage}
        idempotencyKey={idempotencyKey} onPlaced={onPlaced} onClose={() => setCartOpen(false)} />}
    </>,
  };

  return <MenuView restaurant={restaurant} categories={categories} ordering={ordering} />;
}
