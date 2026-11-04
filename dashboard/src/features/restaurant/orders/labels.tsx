import type { OrderLine, OrderStatus, OrderType, OwnerOrder } from '@bilhanah/contracts';
import { useLanguage } from '../../../lib/language';

type Text = (ar: string, en: string) => string;

const STATUS: Record<OrderStatus, [ar: string, en: string, tone: string]> = {
  PLACED: ['جديد', 'New', 'guava'],
  ACCEPTED: ['اتقبل', 'Accepted', 'default'],
  PREPARING: ['بيتحضّر', 'Preparing', 'warning'],
  READY: ['جاهز', 'Ready', 'success'],
  COMPLETED: ['اتسلّم', 'Completed', 'success'],
  REJECTED: ['اترفض', 'Rejected', 'danger'],
  CANCELLED: ['اتلغى', 'Cancelled', 'muted'],
};

export const statusName = (status: OrderStatus, text: Text) => text(STATUS[status][0], STATUS[status][1]);

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { text } = useLanguage();
  const tone = STATUS[status][2];
  return <span className={`badge ${tone === 'default' ? '' : `badge-${tone}`}`}>{statusName(status, text)}</span>;
}

/** What the button that moves an order to `status` says. */
const ACTION: Record<OrderStatus, [ar: string, en: string]> = {
  PLACED: ['جديد', 'New'],
  ACCEPTED: ['اقبل الطلب', 'Accept'],
  PREPARING: ['ابدأ التحضير', 'Start preparing'],
  READY: ['جاهز', 'Mark ready'],
  COMPLETED: ['اتسلّم', 'Complete'],
  REJECTED: ['ارفض', 'Reject'],
  CANCELLED: ['إلغاء الطلب', 'Cancel order'],
};

export const actionName = (status: OrderStatus, text: Text) => text(...ACTION[status]);

/** "#12" kept left-to-right inside Arabic text (Unicode isolates), for plain-text messages. */
export const orderNo = (number: number, digits: (value: number) => string) => `\u2066#${digits(number)}\u2069`;

/** The order number in markup, kept left-to-right ("#٤", not "٤#") inside Arabic text. */
export function OrderNo({ number }: { number: number }) {
  const { number: digits } = useLanguage();
  return <span className="order-no">#{digits(number)}</span>;
}

/** Announcement after a successful change. */
export function actionDone(status: OrderStatus, number: number, text: Text, digits: (value: number) => string): string {
  const n = orderNo(number, digits);
  const e = `#${number}`;
  switch (status) {
    case 'ACCEPTED': return text(`قبلت طلب ${n}`, `Order ${e} accepted`);
    case 'PREPARING': return text(`طلب ${n} بيتحضّر`, `Order ${e} is being prepared`);
    case 'READY': return text(`طلب ${n} جاهز`, `Order ${e} is ready`);
    case 'COMPLETED': return text(`طلب ${n} اتسلّم`, `Order ${e} completed`);
    case 'REJECTED': return text(`رفضت طلب ${n}`, `Order ${e} rejected`);
    case 'CANCELLED': return text(`اتلغى طلب ${n}`, `Order ${e} cancelled`);
    default: return '';
  }
}

export const orderTypeName = (type: OrderType, text: Text) => (type === 'DINE_IN' ? text('صالة', 'Dine-in') : text('تيك أواي', 'Pickup'));

/** "Table 4" for dine-in, the customer's name for pickup. */
export function orderWhere(order: Pick<OwnerOrder, 'type' | 'tableLabel' | 'customerName'>, text: Text): string {
  if (order.type === 'DINE_IN') return order.tableLabel ?? text('طاولة غير محددة', 'Table not set');
  return order.customerName;
}

export function lineName(line: OrderLine, language: 'ar' | 'en'): { name: string; size: string | null } {
  const name = language === 'en' ? (line.nameEn ?? line.nameAr) : line.nameAr;
  const size = language === 'en' ? (line.variantNameEn ?? line.variantNameAr) : line.variantNameAr;
  return { name, size };
}

/** "Just now", "7 min", "1 h 05 min". */
export function elapsedLabel(minutes: number, text: Text, digits: (value: number) => string): string {
  if (minutes < 1) return text('دلوقتي', 'Just now');
  if (minutes < 60) return text(`من ${digits(minutes)} د`, `${minutes} min ago`);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return text(`من ${digits(hours)} س ${digits(rest)} د`, `${hours} h ${rest} min ago`);
}
