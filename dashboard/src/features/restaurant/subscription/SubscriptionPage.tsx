import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarBlankIcon, ReceiptIcon, SparkleIcon, XCircleIcon } from '@phosphor-icons/react';
import { BILLING_ERROR_CODES, type BillingSummary, type OwnerPayment, type OwnerRestaurant, type RestaurantAccess } from '@bilhanah/contracts';
import { Alert } from '../../../components/Alert';
import { Button } from '../../../components/Button';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { ErrorPanel } from '../../../components/ErrorBoundary';
import { PageHeader } from '../../../components/PageHeader';
import { Section } from '../../../components/Section';
import { ReceiptDialog } from '../../../components/ProtectedImage';
import { PageSkeleton } from '../../../components/Skeleton';
import { useToast } from '../../../components/Toast';
import { isApiError } from '../../../lib/api';
import { billingApi } from '../../../lib/api/endpoints';
import { errorMessage } from '../../../lib/api/error-messages';
import { formatDate, formatPrice } from '../../../lib/format';
import { useLanguage, usePageTitle } from '../../../lib/language';
import { methodName, monthsLabel, PaymentStatusBadge, planName } from '../../billing/labels';
import { accessDaysLeft, accessStatusName } from '../access';
import { queryKeys, useBillingQuery, useRestaurant } from '../queries';
import { isPolling } from './online-return';
import { OnlineReturnStatus, useOnlineReturn } from './OnlineReturn';
import { PaymentForm, type PaymentFormHandle } from './PaymentForm';

export function SubscriptionPage() {
  const { text } = useLanguage();
  usePageTitle('الاشتراك', 'Subscription');
  const online = useOnlineReturn();
  const billing = useBillingQuery({ refetchInterval: online.refetchInterval });
  const restaurant = useRestaurant();
  const queryClient = useQueryClient();
  const [receipt, setReceipt] = useState<string | null>(null);
  const form = useRef<PaymentFormHandle>(null);
  const returnState = billing.data ? online.stateFor(billing.data) : online.paymentId ? { kind: 'checking' as const } : null;
  const settled = returnState !== null && !isPolling(returnState);

  // The answer is in: drop ?payment= and Paymob's parameters, so a reload does not check again.
  const { cleanAddress } = online;
  useEffect(() => { if (settled) cleanAddress(); }, [settled, cleanAddress]);

  // A review elsewhere (e.g. an approval) changes access; keep the shell's badge in step.
  const access = billing.data?.access;
  useEffect(() => {
    if (access && JSON.stringify(access) !== JSON.stringify(restaurant.access)) {
      queryClient.setQueryData<OwnerRestaurant>(queryKeys.restaurant, current => current && { ...current, access });
    }
  }, [access, restaurant.access, queryClient]);

  if (billing.isPending) {
    return online.paymentId
      ? <div className="page"><OnlineReturnStatus state={{ kind: 'checking' }} onCheckAgain={() => undefined} onPayAgain={() => undefined} onDismiss={online.dismiss} /><PageSkeleton blocks={2} /></div>
      : <PageSkeleton blocks={3} />;
  }
  if (billing.isError) return <div className="page"><ErrorPanel error={billing.error} onRetry={() => void billing.refetch()} /></div>;
  const summary = billing.data;
  return <div className="page subscription-page">
    <PageHeader title={text('الاشتراك', 'Subscription')}
      description={summary.onlinePayment
        ? text('ادفع أونلاين بالكارت أو المحفظة ويتفعّل اشتراكك على طول، أو حوّل بإنستاباي أو فودافون كاش أو تحويل بنكي وفريق بالهنا يراجع التحويل.',
          'Pay online by card or wallet and your plan is active right away, or pay by InstaPay, Vodafone Cash or bank transfer and the Bilhanah team reviews it.')
        : text('ادفع بإنستاباي أو فودافون كاش أو تحويل بنكي، وابعت لنا بيانات التحويل. فريق بالهنا بيراجعه ويفعّل اشتراكك.',
          'Pay by InstaPay, Vodafone Cash or bank transfer and send us the transfer details. The Bilhanah team reviews it and activates your plan.')} />
    {returnState && <OnlineReturnStatus state={returnState} onDismiss={online.dismiss}
      onCheckAgain={() => { online.checkAgain(); void billing.refetch(); }}
      onPayAgain={() => form.current?.focusOnline()} />}
    <StatusCard access={summary.access} />
    {summary.pendingPayment
      ? <PendingPayment payment={summary.pendingPayment} onViewReceipt={setReceipt} />
      : summary.access.status === 'SUSPENDED'
        ? <Alert kind="error" live={false} title={text('مينفعش تدفع والمطعم موقوف', 'Payments are paused while your restaurant is suspended')}>
            {text('تواصل مع دعم بالهنا عشان نحل المشكلة.', 'Please contact Bilhanah support to sort this out.')}
          </Alert>
        : <PaymentForm ref={form} summary={summary}
            initial={returnState && returnState.kind !== 'checking' && returnState.payment ? { planCode: returnState.payment.planCode, months: returnState.payment.months } : undefined} />}
    <History summary={summary} onViewReceipt={setReceipt} />
    <ReceiptDialog path={receipt} onClose={() => setReceipt(null)} />
  </div>;
}

/** The current plan as a deep-teal banner: name and status, when it ends, and the days left in a ring. */
function StatusCard({ access }: { access: RestaurantAccess }) {
  const { text, number, language } = useLanguage();
  const days = accessDaysLeft(access);
  const end = access.status === 'TRIAL' ? access.trialEndsAt : access.status === 'PAID' ? access.currentPeriodEndsAt : null;
  return <>
    <section className={`plan-hero access-${access.status.toLowerCase()}`} aria-labelledby="status-title" data-testid="subscription-status">
      <div className="plan-hero-main">
        <div className="plan-hero-top">
          <h2 id="status-title"><SparkleIcon size={15} weight="fill" aria-hidden="true" />{text('اشتراكك الحالي', 'Your current plan')}</h2>
          <span className={`plan-status access-${access.status.toLowerCase()}`}>{accessStatusName(access.status, text)}</span>
        </div>
        <p className="status-plan">{access.planCode ? planName(access.planCode, text) : text('من غير باقة', 'No plan')}</p>
        {end && <p className="plan-hero-date"><CalendarBlankIcon size={16} aria-hidden="true" />{access.status === 'TRIAL' ? text('التجربة المجانية بتنتهي يوم', 'Your free trial ends on') : text('الاشتراك ساري لحد', 'Active until')} <strong className="status-date">{formatDate(end, language, { dateStyle: 'long' })}</strong></p>}
        {access.status === 'TRIAL' && <p className="plan-hero-note">{text('تقدر تدفع دلوقتي؛ المدة المدفوعة بتبدأ بعد ما التجربة تخلص، فمش هتخسر ولا يوم.', 'You can pay now: the paid period starts when your trial ends, so you keep every trial day.')}</p>}
      </div>
      {days !== null && <p className="plan-hero-days"><strong>{number(days)}</strong><span>{text(days >= 3 && days <= 10 ? 'أيام فاضلة' : 'يوم فاضل', days === 1 ? 'day left' : 'days left')}</span></p>}
    </section>
    {access.status === 'INACTIVE' && <Alert kind="warning" live={false} title={text('المنيو العام متوقف مؤقتًا', 'Your public menu is paused')}>
      {text('اشتراكك مش فعّال، فالزباين بيشوفوا إن المنيو "مش متاح مؤقتًا". كل بياناتك محفوظة وتقدر تكمّل تعديل المنيو، وأول ما الدفع يتراجع المنيو يرجع يظهر على طول.',
        'Your subscription isn’t active, so diners see the menu as “temporarily unavailable”. All your data is kept and you can keep editing; the menu goes live again as soon as your payment is approved.')}
    </Alert>}
    {access.status === 'SUSPENDED' && <Alert kind="error" live={false} title={text('المطعم موقوف', 'Your restaurant is suspended')}>
      {text('المنيو العام مش ظاهر والتعديل متوقف، وبياناتك محفوظة. تواصل مع دعم بالهنا.', 'The public menu is hidden and editing is paused; your data is kept. Please contact Bilhanah support.')}
    </Alert>}
  </>;
}

/** Facts of a payment as a description list. */
export function PaymentFacts({ payment }: { payment: OwnerPayment }) {
  const { text, number, language } = useLanguage();
  return <dl className="facts">
    <div><dt>{text('الباقة', 'Plan')}</dt><dd>{planName(payment.planCode, text)}</dd></div>
    <div><dt>{text('المدة', 'Length')}</dt><dd>{monthsLabel(payment.months, text, number)}</dd></div>
    <div><dt>{text('المبلغ', 'Amount')}</dt><dd>{formatPrice(payment.amountPiastres, language)}</dd></div>
    <div><dt>{text('طريقة الدفع', 'Method')}</dt><dd>{methodName(payment.method, text)}</dd></div>
    <div><dt>{text('رقم العملية', 'Reference')}</dt><dd className="ltr">{payment.reference}</dd></div>
    {payment.payerName && <div><dt>{text('اسم المحوّل', 'Paid by')}</dt><dd>{payment.payerName}</dd></div>}
    <div><dt>{text('اتبعت يوم', 'Submitted')}</dt><dd>{formatDate(payment.createdAt, language, { dateStyle: 'medium', timeStyle: 'short' })}</dd></div>
  </dl>;
}

function PendingPayment({ payment, onViewReceipt }: { payment: OwnerPayment; onViewReceipt: (path: string) => void }) {
  const { text } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const withdraw = useMutation({
    mutationFn: () => billingApi.withdraw(payment.id),
    onSuccess: () => toast.success(text('سحبنا التحويل. تقدر تبعت بيانات جديدة.', 'Payment withdrawn. You can send new details.')),
    onError: error => {
      // Reviewed in the meantime: show the result instead.
      if (isApiError(error, BILLING_ERROR_CODES.PAYMENT_NOT_PENDING)) toast.error(text('التحويل ده اتراجع خلاص، حدّثنا الصفحة.', 'This payment was already reviewed; the page has been updated.'));
      else toast.error(errorMessage(error, text));
    },
    onSettled: () => {
      setConfirming(false);
      return queryClient.invalidateQueries({ queryKey: queryKeys.billing });
    },
  });
  return <section className="pending-card" aria-labelledby="pending-title" data-testid="pending-payment">
    <div className="pending-head">
      <div>
        <h2 id="pending-title">{text('تحويلك بيتراجع', 'Your payment is under review')}</h2>
        <p>{text('فريق بالهنا بيراجع التحويل، وهيوصلك إيميل أول ما يتقبل أو لو في مشكلة. لو عايز تغيّر حاجة، اسحبه وابعت تاني.',
          'The Bilhanah team is checking your transfer; you will get an email once it is approved or if something is wrong. To change anything, withdraw it and send it again.')}</p>
      </div>
      <PaymentStatusBadge status="PENDING" />
    </div>
    <PaymentFacts payment={payment} />
    <div className="form-actions">
      {payment.hasProof && <Button variant="secondary" small icon={<ReceiptIcon size={17} aria-hidden="true" />} onClick={() => onViewReceipt(billingApi.proofPath(payment.id))}>{text('شوف الإيصال', 'View receipt')}</Button>}
      <Button variant="danger-outline" small icon={<XCircleIcon size={17} aria-hidden="true" />} onClick={() => setConfirming(true)}>{text('اسحب التحويل', 'Withdraw')}</Button>
    </div>
    <ConfirmDialog open={confirming} busy={withdraw.isPending} onCancel={() => setConfirming(false)} onConfirm={() => withdraw.mutate()}
      title={text('تسحب التحويل ده؟', 'Withdraw this payment?')} confirmLabel={text('اسحبه', 'Withdraw')}
      description={text('مش هنراجعه. لو الفلوس اتحولت فعلًا، ابعت البيانات تاني بعد السحب.', 'We will not review it. If the money was already sent, submit the details again afterwards.')} />
  </section>;
}

function History({ summary, onViewReceipt }: { summary: BillingSummary; onViewReceipt: (path: string) => void }) {
  const { text, number, language } = useLanguage();
  return <Section id="history-title" title={text('سجل المدفوعات', 'Payment history')}>
    {summary.payments.length === 0
      ? <p className="muted empty-line">{text('لسه مدفعتش أي حاجة.', 'You haven’t made any payments yet.')}</p>
      : <ul className="history-list">
          {summary.payments.map(payment => <li key={payment.id} className="history-row" data-testid="payment-row" data-status={payment.status}>
            <div className="history-main">
              <strong>{planName(payment.planCode, text)} · {monthsLabel(payment.months, text, number)}</strong>
              <small>{formatDate(payment.createdAt, language)} · {methodName(payment.method, text)} · <span className="ltr">{payment.reference}</span></small>
              {payment.status === 'APPROVED' && payment.period && <small className="history-period">
                {text('المدة:', 'Period:')} {formatDate(payment.period.startsAt, language)} – {formatDate(payment.period.endsAt, language)}
              </small>}
              {payment.status === 'REJECTED' && payment.rejectionReason && <p className="history-reason"><strong>{text('سبب الرفض:', 'Reason:')}</strong> {payment.rejectionReason}</p>}
              {payment.status === 'FAILED' && <p className="history-reason">{text('Paymob مقبلش العملية، ومفيش اشتراك اتعمل.', 'Paymob declined it; no plan was added.')}</p>}
              {payment.status === 'AWAITING_PAYMENT' && <small>{text('الدفع الأونلاين ده ما خلصش، أو لسه مستنيين تأكيد Paymob.', 'This online payment wasn’t finished, or Paymob hasn’t confirmed it yet.')}</small>}
            </div>
            <div className="history-side">
              <span className="history-amount">{formatPrice(payment.amountPiastres, language)}</span>
              <PaymentStatusBadge status={payment.status} method={payment.method} />
              {payment.hasProof && <button type="button" className="text-button small" onClick={() => onViewReceipt(billingApi.proofPath(payment.id))}
                aria-label={text(`الإيصال، تحويل ${formatDate(payment.createdAt, language)}`, `Receipt, ${formatDate(payment.createdAt, language)} payment`)}>
                <ReceiptIcon size={16} aria-hidden="true" />{text('الإيصال', 'Receipt')}
              </button>}
            </div>
          </li>)}
        </ul>}
  </Section>;
}
