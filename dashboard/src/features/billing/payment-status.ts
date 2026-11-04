import type { OwnerPayment, PaymentMethod, PaymentStatus } from '@bilhanah/contracts';

type Text = (ar: string, en: string) => string;

export const METHOD_NAMES: Record<PaymentMethod, [ar: string, en: string]> = {
  INSTAPAY: ['إنستاباي', 'InstaPay'],
  VODAFONE_CASH: ['فودافون كاش', 'Vodafone Cash'],
  BANK_TRANSFER: ['تحويل بنكي', 'Bank transfer'],
  PAYMOB: ['أونلاين (كارت أو محفظة)', 'Online (card or wallet)'],
};

export function methodName(method: PaymentMethod, text: Text): string {
  return text(...METHOD_NAMES[method]);
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, { ar: string; en: string; tone: 'warning' | 'muted' | 'success' | 'danger' }> = {
  PENDING: { ar: 'بيتراجع', en: 'Under review', tone: 'warning' },
  AWAITING_PAYMENT: { ar: 'مستني الدفع', en: 'Awaiting payment', tone: 'muted' },
  APPROVED: { ar: 'اتقبل', en: 'Approved', tone: 'success' },
  REJECTED: { ar: 'اترفض', en: 'Rejected', tone: 'danger' },
  FAILED: { ar: 'الدفع ما تمّش', en: 'Payment failed', tone: 'danger' },
  CANCELLED: { ar: 'اتلغى', en: 'Cancelled', tone: 'muted' },
};

/** Paid online through Paymob: confirmed by Paymob, never reviewed by hand. */
export const isOnlinePayment = (payment: Pick<OwnerPayment, 'method'>) => payment.method === 'PAYMOB';

/** Only transfers waiting for review can be approved or rejected by an administrator. */
export const isReviewable = (payment: Pick<OwnerPayment, 'method' | 'status'>) => payment.status === 'PENDING' && !isOnlinePayment(payment);

/** A transfer the owner took back reads "Withdrawn"; an online payment replaced by a newer one reads "Cancelled". */
export function paymentStatusLabel(status: PaymentStatus, text: Text, method?: PaymentMethod): string {
  if (status === 'CANCELLED' && method !== 'PAYMOB') return text('اتسحب', 'Withdrawn');
  return text(PAYMENT_STATUS_LABELS[status].ar, PAYMENT_STATUS_LABELS[status].en);
}
