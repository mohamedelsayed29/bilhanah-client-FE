import { CheckIcon, MinusIcon } from '@phosphor-icons/react';
import { PLAN_FEATURES, PLAN_NAMES, type PaymentMethod, type PaymentStatus, type PlanCode, type PlanFeatures } from '@bilhanah/contracts';
import { useLanguage } from '../../lib/language';
import { PAYMENT_STATUS_LABELS, paymentStatusLabel } from './payment-status';

export { isOnlinePayment, isReviewable, METHOD_NAMES, methodName, paymentStatusLabel } from './payment-status';

type Text = (ar: string, en: string) => string;

export function planName(code: PlanCode, text: Text): string {
  return text(PLAN_NAMES[code].ar, PLAN_NAMES[code].en);
}

const FEATURES: { key: keyof PlanFeatures; ar: string; en: string }[] = [
  { key: 'menu', ar: 'منيو عربي وإنجليزي مع كود QR', en: 'Arabic & English menu with QR' },
  { key: 'ordering', ar: 'طلبات الترابيزات والاستلام', en: 'Dine-in & pickup orders' },
  { key: 'readyAlerts', ar: 'تنبيه الزبون لما الطلب يجهز', en: 'Order-ready alerts for diners' },
];

/** What a plan includes, with the features it lacks shown as not included. */
export function PlanFeatureList({ code }: { code: PlanCode }) {
  const { text } = useLanguage();
  const features = PLAN_FEATURES[code];
  return <ul className="plan-features">
    {FEATURES.map(feature => <li key={feature.key} className={features[feature.key] ? '' : 'is-off'}>
      {features[feature.key] ? <CheckIcon size={16} weight="bold" aria-hidden="true" /> : <MinusIcon size={16} aria-hidden="true" />}
      <span>{text(feature.ar, feature.en)}{!features[feature.key] && <span className="visually-hidden"> ({text('مش متضمنة', 'not included')})</span>}</span>
    </li>)}
  </ul>;
}

export function PaymentStatusBadge({ status, method }: { status: PaymentStatus; method?: PaymentMethod }) {
  const { text } = useLanguage();
  return <span className={`badge badge-${PAYMENT_STATUS_LABELS[status].tone}`} data-status={status}>{paymentStatusLabel(status, text, method)}</span>;
}

/** "3 months" / "٣ شهور" (Arabic counts take different noun forms). */
export function monthsLabel(months: number, text: Text, number: (value: number) => string): string {
  const arabic = months === 1 ? 'شهر واحد' : months === 2 ? 'شهرين' : months <= 10 ? `${number(months)} شهور` : `${number(months)} شهر`;
  return text(arabic, `${months} month${months === 1 ? '' : 's'}`);
}
