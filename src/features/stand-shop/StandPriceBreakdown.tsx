import { STAND_PRICES } from '@bilhanah/contracts';
import { useLanguage } from '../../lib/language';
import type { StandPrices } from './catalog';

type Props = {
  quantity: number;
  nfcQuantity: number;
  /** The API's prices at checkout; the contracts' prices elsewhere (the same numbers). */
  prices?: StandPrices;
  /** At checkout: the delivery fee in piastres, or null when it is confirmed by phone. */
  deliveryFeePiastres?: number | null;
};

export function StandPriceBreakdown({ quantity, nfcQuantity, prices = STAND_PRICES, deliveryFeePiastres }: Props) {
  const { text, number } = useLanguage();
  const egp = (piastres: number) => `${number(piastres / 100)} ${text('ج.م', 'EGP')}`;
  const products = quantity * prices.unitPiastres + nfcQuantity * prices.nfcPiastres;
  const withDelivery = deliveryFeePiastres !== undefined;
  return <dl className="shop-price-breakdown">
    <div><dt>{text('الحوامل', 'Stands')} <small>{number(quantity)} × {number(prices.unitPiastres / 100)}</small></dt><dd>{egp(quantity * prices.unitPiastres)}</dd></div>
    <div><dt>{text('إضافة NFC', 'NFC add-on')} {nfcQuantity > 0 && <small>{number(nfcQuantity)} × {number(prices.nfcPiastres / 100)}</small>}</dt><dd>{nfcQuantity ? egp(nfcQuantity * prices.nfcPiastres) : text('بدون إضافة', 'Not selected')}</dd></div>
    {withDelivery && <div className="shop-summary-products"><dt>{text('إجمالي المنتجات', 'Product total')}</dt><dd>{egp(products)}</dd></div>}
    {withDelivery && <div className="shop-summary-delivery"><dt>{text('التوصيل', 'Delivery')}</dt><dd>{deliveryFeePiastres === null ? text('يتأكد بالتليفون', 'Confirmed by phone') : deliveryFeePiastres === 0 ? text('مجاني', 'Free') : egp(deliveryFeePiastres)}</dd></div>}
    <div className="shop-summary-total"><dt>{!withDelivery ? text('إجمالي المنتجات', 'Product total') : deliveryFeePiastres === null ? text('الإجمالي من غير التوصيل', 'Total before delivery') : text('الإجمالي', 'Total')}</dt><dd>{egp(products + (deliveryFeePiastres ?? 0))}</dd></div>
  </dl>;
}
