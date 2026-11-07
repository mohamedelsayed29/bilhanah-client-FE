import { createPortal } from 'react-dom';
import type { PosReceipt } from '@bilhanah/contracts';
import { formatPrice } from '../../../lib/format';
import { useLanguage } from '../../../lib/language';

const METHODS: Record<string, [string, string]> = { CASH: ['كاش', 'Cash'], CARD: ['كارت', 'Card'], WALLET: ['محفظة', 'Wallet'], OTHER: ['أخرى', 'Other'] };

/**
 * A receipt laid out for 80 mm paper, printed with the browser (window.print). Everything on it comes
 * from the server; while printing, only it is shown (see terminal.css, @media print).
 */
export function Receipt({ receipt }: { receipt: PosReceipt }) {
  const { text, language } = useLanguage();
  const money = (piastres: number) => formatPrice(piastres, language);
  const { order } = receipt;
  const when = new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(order.placedAt));
  return createPortal(<div className="pos-receipt" aria-hidden="true" data-testid="pos-receipt">
    {receipt.showLogo && receipt.restaurant.logoUrl && <img src={receipt.restaurant.logoUrl} alt="" className="pos-receipt-logo" />}
    <h1>{receipt.restaurant.name}</h1>
    <p>{receipt.branch.name} · {receipt.branch.address}، {receipt.branch.city}</p>
    <p dir="ltr">{receipt.branch.phone}</p>
    {receipt.header && <p className="pos-receipt-note">{receipt.header}</p>}
    <hr />
    <p className="pos-receipt-row"><span>{text('طلب', 'Order')} #{order.number}</span><span>{when}</span></p>
    <p className="pos-receipt-row"><span>{order.tableLabel ? text(`طاولة ${order.tableLabel}`, `Table ${order.tableLabel}`) : text('تيك أواي', 'Takeaway')}</span><span>{order.cashierName ?? ''}</span></p>
    <hr />
    <table>
      <tbody>{order.items.map((item, index) => <tr key={index}>
        <td>{item.quantity}×</td>
        <td>{language === 'en' ? item.nameEn || item.name : item.name}{item.variant && ` (${item.variant})`}{item.note && <small><br />{item.note}</small>}</td>
        <td className="num">{money(item.lineTotalPiastres)}</td>
      </tr>)}</tbody>
    </table>
    <hr />
    <p className="pos-receipt-row"><span>{text('الإجمالي', 'Subtotal')}</span><span>{money(order.subtotalPiastres)}</span></p>
    {order.discountPiastres > 0 && <p className="pos-receipt-row"><span>{text('خصم', 'Discount')}{order.discountReason && ` (${order.discountReason})`}</span><span>−{money(order.discountPiastres)}</span></p>}
    {order.serviceChargePiastres > 0 && <p className="pos-receipt-row"><span>{text('خدمة', 'Service')}</span><span>{money(order.serviceChargePiastres)}</span></p>}
    {order.taxPiastres > 0 && <p className="pos-receipt-row"><span>{order.taxInclusive ? text('ضريبة (شاملة)', 'Tax (included)') : text('ضريبة', 'Tax')}</span><span>{money(order.taxPiastres)}</span></p>}
    <p className="pos-receipt-row pos-receipt-total"><span>{text('المطلوب', 'Total')}</span><span>{money(order.totalPiastres)} {text('ج.م', 'EGP')}</span></p>
    {receipt.payments.length > 0 && <hr />}
    {receipt.payments.map((payment, index) => <p key={index} className="pos-receipt-row"><span>{text(...(METHODS[payment.method] ?? METHODS.OTHER!))}{payment.tenderedPiastres ? ` · ${text('مدفوع', 'Tendered')} ${money(payment.tenderedPiastres)}` : ''}</span><span>{money(payment.amountPiastres - payment.refundedPiastres)}</span></p>)}
    {receipt.payments.some(payment => payment.changePiastres) && <p className="pos-receipt-row"><span>{text('الباقي للزبون', 'Change')}</span><span>{money(receipt.payments.reduce((sum, payment) => sum + (payment.changePiastres ?? 0), 0))}</span></p>}
    <p className="pos-receipt-row"><strong>{receipt.duePiastres > 0 ? text('متبقي', 'Due') : text('مدفوع بالكامل', 'Paid in full')}</strong><strong>{receipt.duePiastres > 0 ? money(receipt.duePiastres) : ''}</strong></p>
    {receipt.footer && <><hr /><p className="pos-receipt-note">{receipt.footer}</p></>}
  </div>, document.body);
}
