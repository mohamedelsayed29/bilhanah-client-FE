import { useLanguage } from '../../lib/language';
import { DEFAULT_PRICES, products, type ShopPrices, type StandConfig } from './catalog';

type Props = {
  items: Pick<StandConfig, 'product' | 'nfc' | 'quantity'>[];
  /** The API's prices at checkout; the contracts' prices elsewhere (the same numbers). */
  prices?: ShopPrices;
  /** At checkout: the delivery fee in piastres, or null when it is confirmed by phone. */
  deliveryFeePiastres?: number | null;
};

export function StandPriceBreakdown({ items, prices = DEFAULT_PRICES, deliveryFeePiastres }: Props) {
  const { text, number, language } = useLanguage();
  const egp = (piastres: number) => `${number(piastres / 100)} ${text('ج.م', 'EGP')}`;
  const rows = products.map(product => {
    const lines = items.filter(item => item.product === product.id);
    const quantity = lines.reduce((sum, item) => sum + item.quantity, 0);
    const nfcQuantity = lines.reduce((sum, item) => sum + (item.nfc ? item.quantity : 0), 0);
    return { product, quantity, nfcQuantity, price: prices[product.id] };
  }).filter(row => row.quantity > 0);
  const nfcRows = rows.filter(row => row.nfcQuantity > 0);
  const total = rows.reduce((sum, row) => sum + row.quantity * row.price.unitPiastres + row.nfcQuantity * row.price.nfcPiastres, 0);
  const withDelivery = deliveryFeePiastres !== undefined;
  const plural = (name: { ar: string; en: string }) => language === 'ar' ? `ال${name.ar}` : name.en.charAt(0).toUpperCase() + name.en.slice(1);
  return <dl className="shop-price-breakdown">
    {rows.map(row => <div key={row.product.id}><dt>{plural(row.product.plural)} <small>{number(row.quantity)} × {number(row.price.unitPiastres / 100)}</small></dt><dd>{egp(row.quantity * row.price.unitPiastres)}</dd></div>)}
    {nfcRows.length ? nfcRows.map(row => <div key={`${row.product.id}-nfc`}><dt>{text('إضافة NFC', 'NFC add-on')}{rows.length > 1 && <> · {row.product.plural[language]}</>} <small>{number(row.nfcQuantity)} × {number(row.price.nfcPiastres / 100)}</small></dt><dd>{egp(row.nfcQuantity * row.price.nfcPiastres)}</dd></div>)
      : <div><dt>{text('إضافة NFC', 'NFC add-on')}</dt><dd>{text('بدون إضافة', 'Not selected')}</dd></div>}
    {withDelivery && <div className="shop-summary-products"><dt>{text('إجمالي المنتجات', 'Product total')}</dt><dd>{egp(total)}</dd></div>}
    {withDelivery && <div className="shop-summary-delivery"><dt>{text('التوصيل', 'Delivery')}</dt><dd>{deliveryFeePiastres === null ? text('يتأكد بالتليفون', 'Confirmed by phone') : deliveryFeePiastres === 0 ? text('مجاني', 'Free') : egp(deliveryFeePiastres)}</dd></div>}
    <div className="shop-summary-total"><dt>{!withDelivery ? text('إجمالي المنتجات', 'Product total') : deliveryFeePiastres === null ? text('الإجمالي من غير التوصيل', 'Total before delivery') : text('الإجمالي', 'Total')}</dt><dd>{egp(total + (deliveryFeePiastres ?? 0))}</dd></div>
  </dl>;
}
