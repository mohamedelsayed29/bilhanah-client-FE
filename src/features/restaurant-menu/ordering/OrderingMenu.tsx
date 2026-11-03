import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BellRingingIcon, CaretLeftIcon, ChairIcon, ReceiptIcon, ShoppingBagIcon, XIcon } from '@phosphor-icons/react';
import type { PlaceOrderResponse, PublicMenuCategory, PublicMenuItem, PublicRecommendation } from '@bilhanah/contracts';
import { useLanguage } from '../../../lib/language';
import { branchOf, branchTitle, openingPhrase } from '../branches';
import { formatPrice, hasAnyHours, localized } from '../menu-format';
import { MenuView, useIsOpen, type AvailableRestaurant, type BranchHeader, type MenuOrdering } from '../MenuView';
import { AddToOrderForm } from './AddToOrderForm';
import { CartSheet, itemCount, type Upsell } from './CartSheet';
import { suggestionsFor, type Suggestion } from '../../recommendations/recommend';
import { headingOf, SuggestionStrip } from '../../recommendations/Suggestions';
import { createTracker } from '../../recommendations/tracker';
import { nextOpening } from './next-opening';
import { newIdempotencyKey } from './order-api';
import { loadRecentOrders, rememberOrder } from './ordering-storage';
import { tableName, useTable, type CheckedScan } from './use-table';
import { useCart } from './use-cart';
import { ServiceSheet } from '../../table-service/ServiceSheet';
import { useTableService } from '../../table-service/use-table-service';
import './ordering.css';

export type Navigate = (path: string, state?: unknown) => void;

export type OrderingMenuProps = {
  restaurant: AvailableRestaurant;
  categories: PublicMenuCategory[];
  subdomain: string;
  navigate: Navigate;
  /** The branch line in the header, for restaurants with several branches. */
  branch?: BranchHeader | null;
  /** The table code, if the page already looked it up to choose the branch. */
  checkedScan?: CheckedScan | null;
  /** The restaurant's suggestions for this branch's menu (upselling and cross-selling). */
  recommendations?: PublicRecommendation[];
};

/** The menu while the restaurant takes orders: add buttons, the scanned table, the cart and checkout. */
export function OrderingMenu({ restaurant, categories, subdomain, navigate, branch = null, checkedScan = null, recommendations = [] }: OrderingMenuProps) {
  const { language, text, number, digits } = useLanguage();
  const branchSlug = branchOf(restaurant)?.slug ?? null;
  const cart = useCart(subdomain, branchSlug, categories);
  const menuItems = useMemo(() => new Map(categories.flatMap(category => category.items).map(item => [item.id, item])), [categories]);
  const [tracker] = useState(() => createTracker(subdomain, branchSlug));
  const { table, setTable, invalidScan, dismissInvalidScan } = useTable(subdomain, branchSlug, checkedScan);
  // A table stands in one branch: while the diner orders to it, the menu does not offer another branch.
  const header: BranchHeader | null = branch && { ...branch, onChange: table?.branch ? null : branch.onChange };
  const [cartOpen, setCartOpen] = useState(false);
  // Seated at a scanned table: the guests can call the staff from here.
  const service = useTableService(subdomain, table?.code ?? null, restaurant.ordering.serviceRequests);
  const [serviceOpen, setServiceOpen] = useState(false);
  const openRequests = service.requests.filter(request => request.status === 'PENDING' || request.status === 'ACKNOWLEDGED' || request.status === 'IN_PROGRESS').length;
  const offersService = !!table && restaurant.ordering.serviceRequests && service.available;
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
    // With several branches, the one being ordered from is closed, not the restaurant.
    const [ar, en] = branch ? ['الفرع ده', 'This branch'] : ['المطعم', 'The restaurant'];
    if (!next) return text(`${ar} مقفول دلوقتي.`, `${en} is closed now.`);
    const when = openingPhrase(next, language);
    return text(`${ar} مقفول دلوقتي. بيفتح ${when}.`, `${en} is closed now. It opens ${when}.`);
  }, [isOpen, restaurant.openingHours, restaurant.timezone, language, text, branch]);

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

  /** Adds a suggested dish, tagged with its rule so the order counts it. */
  const addSuggestion = (entry: Suggestion, variantId: string, quantity: number, placement: 'PRODUCT_DETAILS' | 'CART' | 'CHECKOUT') => {
    const added = cart.add(entry.item, variantId, Math.min(quantity, entry.maxQuantity), '', { ruleId: entry.rule.id, placement });
    if (!added) notify(text('طلبك وصل لأقصى عدد أصناف.', 'Your order has reached the maximum number of dishes.'));
    return added;
  };
  const inCart = new Set(cart.lines.map(line => line.menuItemId));
  const upsell: Upsell | undefined = recommendations.length === 0 ? undefined : {
    suggestions: placement => suggestionsFor(recommendations, menuItems, [...inCart], placement, ['FREQUENTLY_BOUGHT_TOGETHER', 'ADD_ON'], inCart),
    upgrades: line => suggestionsFor(recommendations, menuItems, [line.menuItemId], 'CART', ['UPGRADE'])
      .filter(entry => !(entry.item.id === line.menuItemId && (entry.variant ?? entry.item.variants[0]!).id === line.variantId)),
    tracker,
    onAdd: (entry, variantId, placement) => {
      const added = addSuggestion(entry, variantId, 1, placement);
      if (added) notify(text(`اتضاف ${localized(language, entry.item.nameAr, entry.item.nameEn)} لطلبك.`, `${localized(language, entry.item.nameAr, entry.item.nameEn)} added to your order.`));
      return added;
    },
    onUpgrade: (line, entry) => {
      cart.replace(line.id, entry.item, (entry.variant ?? entry.item.variants[0]!).id, { ruleId: entry.rule.id, placement: 'CART' });
      tracker.add(entry.rule.id, entry.item.id, 'CART');
      notify(text(`رقّينا طلبك لـ ${localized(language, entry.item.nameAr, entry.item.nameEn)}.`, `Upgraded to ${localized(language, entry.item.nameAr, entry.item.nameEn)}.`));
    },
  };

  const latest = recentOrders[0];
  const ordering: MenuOrdering = {
    hasCart: cart.count > 0,
    quantityOf: cart.quantityOf,
    quickAdd,
    addForm: (item, close) => <AddToOrderForm item={item} tracker={tracker}
      extras={suggestionsFor(recommendations, menuItems, [item.id], 'PRODUCT_DETAILS', ['ADD_ON', 'FREQUENTLY_BOUGHT_TOGETHER'])}
      onAdd={(variantId, quantity, note, extras) => {
        const name = localized(language, item.nameAr, item.nameEn);
        if (cart.add(item, variantId, quantity, note)) {
          // The picked extras join the cart as their own lines; the cart already there stays.
          for (const extra of extras) if (addSuggestion(extra.suggestion, extra.variantId, extra.quantity, 'PRODUCT_DETAILS')) tracker.add(extra.suggestion.rule.id, extra.suggestion.item.id, 'PRODUCT_DETAILS');
          notify(extras.length ? text(`اتضاف ${name} والإضافات لطلبك.`, `${name} and extras added to your order.`) : text(`اتضاف ${name} لطلبك.`, `${name} added to your order.`));
        } else notify(text('طلبك وصل لأقصى عدد أصناف.', 'Your order has reached the maximum number of dishes.'));
        close();
      }} />,
    dishExtras: item => {
      const alternatives = suggestionsFor(recommendations, menuItems, [item.id], 'PRODUCT_DETAILS', ['ALTERNATIVE']);
      if (alternatives.length === 0) return null;
      return <SuggestionStrip suggestions={alternatives} placement="PRODUCT_DETAILS" tracker={tracker} heading={headingOf(alternatives[0]!.rule, text)}
        onAdd={(entry, variantId) => {
          const added = addSuggestion(entry, variantId, 1, 'PRODUCT_DETAILS');
          if (added) notify(text(`اتضاف ${localized(language, entry.item.nameAr, entry.item.nameEn)} لطلبك.`, `${localized(language, entry.item.nameAr, entry.item.nameEn)} added to your order.`));
          return added;
        }} />;
    },
    meta: table && <span className="table-badge"><ChairIcon size={15} weight="bold" />{table.label ? <bdi>{tableName(table.label, language)}</bdi> : text('طاولتك', 'Your table')}</span>,
    banner: latest && <a className="recent-order-link" href={`/order/${encodeURIComponent(latest.trackingToken)}`} onClick={event => { event.preventDefault(); navigate(`/order/${encodeURIComponent(latest.trackingToken)}`); }}>
      <ReceiptIcon size={20} />
      <span>{recentOrders.length > 1
        ? text(`طلباتك (${number(recentOrders.length)}): تابع طلب رقم ${digits(latest.number)}`, `Your orders (${recentOrders.length}): track order #${latest.number}`)
        : text(`تابع طلبك رقم ${digits(latest.number)}`, `Track your order #${latest.number}`)}</span>
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
      {offersService && <button type="button" className={`service-fab ${cart.count > 0 ? 'with-cart' : ''}`} onClick={() => setServiceOpen(true)} aria-haspopup="dialog" data-testid="service-button">
        <BellRingingIcon size={20} weight="fill" aria-hidden="true" />{text('اطلب خدمة', 'Call the staff')}
        {openRequests > 0 && <span className="service-fab-count"><span aria-hidden="true">{number(openRequests)}</span><span className="visually-hidden">{text(`، ${number(openRequests)} مفتوح`, `, ${openRequests} open`)}</span></span>}
      </button>}
      {serviceOpen && <ServiceSheet service={service} tableName={table?.label ? tableName(table.label, language) : null} onClose={() => setServiceOpen(false)} />}
      {cartOpen && <CartSheet restaurant={restaurant} subdomain={subdomain} cart={cart} table={table} setTable={setTable} closedMessage={closedMessage}
        branchName={header && branchTitle(header.name, language)} onChangeBranch={header?.onChange ? () => { setCartOpen(false); header.onChange?.(); } : null}
        idempotencyKey={idempotencyKey} onPlaced={onPlaced} onClose={() => setCartOpen(false)} upsell={upsell} />}
    </>,
  };

  return <MenuView restaurant={restaurant} categories={categories} ordering={ordering} branch={header} />;
}
