import { CoinsIcon, GiftIcon } from '@phosphor-icons/react';
import type { OwnerOrder } from '@bilhanah/contracts';
import { formatPrice } from '../../lib/format';
import { useLanguage } from '../../lib/language';

/** Under an order's subtotal: the loyalty reward's discount, what is left to pay, and the points it earns. */
export function OrderLoyaltyLines({ order }: { order: Pick<OwnerOrder, 'discountPiastres' | 'totalPiastres' | 'loyalty' | 'serviceChargePiastres' | 'taxPiastres' | 'subtotalPiastres' | 'discountReason' | 'channel'> }) {
  const { text, number, language } = useLanguage();
  if (!order.loyalty) {
    // POS bills: discount, service charge and tax, then what is due.
    if (order.channel !== 'POS' || order.totalPiastres === order.subtotalPiastres && !order.taxPiastres) return null;
    return <>
      {order.discountPiastres > 0 && <p className="ly-order-line"><span>{text('خصم', 'Discount')}{order.discountReason && <> · <bdi>{order.discountReason}</bdi></>}</span><strong>−{formatPrice(order.discountPiastres, language)}</strong></p>}
      {order.serviceChargePiastres > 0 && <p className="order-bill-line"><span>{text('خدمة', 'Service')}</span><span>{formatPrice(order.serviceChargePiastres, language)}</span></p>}
      {order.taxPiastres > 0 && <p className="order-bill-line"><span>{order.totalPiastres === order.subtotalPiastres - order.discountPiastres + order.serviceChargePiastres ? text('ضريبة (شاملة)', 'Tax (included)') : text('ضريبة', 'Tax')}</span><span>{formatPrice(order.taxPiastres, language)}</span></p>}
      <p className="order-total"><span>{text('المطلوب', 'To pay')}</span><strong>{formatPrice(order.totalPiastres, language)}</strong></p>
    </>;
  }
  const { loyalty } = order;
  return <>
    {order.discountPiastres > 0 && <>
      <p className="ly-order-line" data-testid="order-loyalty-discount"><span><GiftIcon size={14} aria-hidden="true" /> {loyalty.rewardName ?? text('مكافأة', 'Reward')} · {text(`${number(loyalty.pointsSpent)} نقطة`, `${loyalty.pointsSpent} pts`)}</span><strong>−{formatPrice(order.discountPiastres, language)}</strong></p>
      <p className="order-total"><span>{text('المطلوب', 'To pay')}</span><strong>{formatPrice(order.totalPiastres, language)}</strong></p>
    </>}
    {loyalty.pointsToEarn > 0 && <p className="ly-order-points" data-testid="order-loyalty-points"><CoinsIcon size={14} aria-hidden="true" />
      {loyalty.earned ? text(`الزبون كسب ${number(loyalty.pointsToEarn)} نقطة`, `The diner earned ${loyalty.pointsToEarn} points`) : text(`هيكسب ${number(loyalty.pointsToEarn)} نقطة لما الطلب يكمل`, `Earns ${loyalty.pointsToEarn} points once completed`)}</p>}
  </>;
}
