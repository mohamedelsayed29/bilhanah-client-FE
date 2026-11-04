import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ArrowClockwiseIcon, XIcon } from '@phosphor-icons/react';
import type { BillingSummary } from '@bilhanah/contracts';
import { Alert } from '../../../components/Alert';
import { Button } from '../../../components/Button';
import { formatDate, formatPrice } from '../../../lib/format';
import { useLanguage } from '../../../lib/language';
import { monthsLabel, planName } from '../../billing/labels';
import { isPolling, POLL_INTERVAL_MS, POLL_LIMIT_MS, returnedPaymentId, returnState, type ReturnState } from './online-return';

/**
 * Paymob sends the owner back to /subscription?payment=<id> (plus its own parameters) before it
 * confirms the payment to the API. This follows that payment: the billing summary is polled every
 * few seconds for up to a minute, and the address bar is cleaned once there is an answer.
 */
export function useOnlineReturn() {
  const [params, setParams] = useSearchParams();
  const [paymentId, setPaymentId] = useState(() => returnedPaymentId(params));
  const [timedOut, setTimedOut] = useState(false);
  const [round, setRound] = useState(0);
  const timedOutRef = useRef(timedOut);
  timedOutRef.current = timedOut;

  useEffect(() => {
    if (!paymentId) return;
    setTimedOut(false);
    const timer = window.setTimeout(() => setTimedOut(true), POLL_LIMIT_MS);
    return () => window.clearTimeout(timer);
  }, [paymentId, round]);

  const stateFor = (summary: BillingSummary | undefined): ReturnState | null => {
    if (!paymentId) return null;
    const payment = summary && [...summary.payments, summary.pendingPayment].find(entry => entry?.id === paymentId);
    return returnState(payment, timedOutRef.current);
  };

  return {
    paymentId,
    stateFor,
    /** For the billing query: poll while the answer is still coming. */
    refetchInterval: (summary: BillingSummary | undefined) => {
      const state = stateFor(summary);
      return state && isPolling(state) ? POLL_INTERVAL_MS : false;
    },
    /** Removes `payment` and Paymob's parameters once they are no longer needed. */
    cleanAddress: () => { if ([...params.keys()].length > 0) setParams(new URLSearchParams(), { replace: true }); },
    checkAgain: () => setRound(value => value + 1),
    dismiss: () => setPaymentId(null),
  };
}

type Props = { state: ReturnState; onCheckAgain: () => void; onPayAgain: () => void; onDismiss: () => void };

/** The outcome of a return from Paymob, in a polite live region so it is announced as it changes. */
export function OnlineReturnStatus({ state, onCheckAgain, onPayAgain, onDismiss }: Props) {
  const { text, number, language } = useLanguage();
  const dismiss = <button type="button" className="icon-button return-dismiss" onClick={onDismiss} aria-label={text('اقفل الرسالة', 'Dismiss')}><XIcon size={18} /></button>;
  let content;
  switch (state.kind) {
    case 'checking':
      content = <div className="return-checking" data-testid="online-return-checking">
        <span className="spinner" aria-hidden="true" />
        <div>
          <strong>{text('بنأكد الدفع…', 'Confirming your payment…')}</strong>
          <p className="muted">{text('Paymob بيبعتلنا التأكيد في ثواني. خليك في الصفحة دي، وهنحدّثها لوحدنا.', 'Paymob confirms it to us within seconds. Stay on this page; it updates by itself.')}</p>
        </div>
      </div>;
      break;
    case 'approved': {
      const { payment } = state;
      content = <Alert kind="success" live={false} title={text('تم الدفع، واشتراكك اتجدد', 'Payment received, your plan is renewed')}
        actions={dismiss}>
        <span data-testid="online-return-approved">
          {text(`دفعت ${formatPrice(payment.amountPiastres, language)} عن باقة ${planName(payment.planCode, text)} لمدة ${monthsLabel(payment.months, text, number)}.`,
            `You paid ${formatPrice(payment.amountPiastres, language)} for ${planName(payment.planCode, text)}, ${monthsLabel(payment.months, text, number)}.`)}
          {payment.period && <> {text('المدة الجديدة من', 'The new period runs from')} <strong>{formatDate(payment.period.startsAt, language, { dateStyle: 'long' })}</strong> {text('لحد', 'to')} <strong>{formatDate(payment.period.endsAt, language, { dateStyle: 'long' })}</strong>.</>}
        </span>
      </Alert>;
      break;
    }
    case 'failed':
      content = <Alert kind="error" live={false} title={text('الدفع ما تمّش', 'The payment didn’t go through')}
        actions={<><Button small onClick={onPayAgain}>{text('جرّب تاني', 'Try again')}</Button>{dismiss}</>}>
        <span data-testid="online-return-failed">{text('Paymob مقبلش العملية، ومفيش اشتراك اتعمل. اتأكد من بيانات الكارت أو رصيد المحفظة وجرّب تاني، أو ادفع بتحويل.',
          'Paymob declined it, so no plan was added. Check the card details or wallet balance and try again, or pay by transfer.')}</span>
      </Alert>;
      break;
    case 'replaced':
      content = <Alert kind="warning" live={false} title={text('العملية دي اتلغت', 'This payment was cancelled')} actions={dismiss}>
        <span data-testid="online-return-replaced">{text('بدأت دفع أونلاين جديد بعدها، فالقديمة اتلغت. شوف حالة آخر عملية في سجل المدفوعات تحت.',
          'You started a newer online payment, so this one was cancelled. See the latest one in your payment history below.')}</span>
      </Alert>;
      break;
    case 'slow':
      content = <Alert kind="warning" live={false} title={text('لسه مستنيين تأكيد Paymob', 'Still waiting for Paymob’s confirmation')}
        actions={<>
          <Button small variant="secondary" icon={<ArrowClockwiseIcon size={16} aria-hidden="true" />} onClick={onCheckAgain}>{text('اتأكد تاني', 'Check again')}</Button>
          <Button small variant="ghost" onClick={onPayAgain}>{text('ادفع من جديد', 'Pay again')}</Button>
          {dismiss}
        </>}>
        <span data-testid="online-return-slow">{text('التأكيد ممكن ياخد شوية. لو دفعت، اشتراكك هيتفعّل أول ما يوصل وهيظهر في سجل المدفوعات؛ حدّث الصفحة بعد دقيقة. لو ما كملتش الدفع، تقدر تدفع من جديد.',
          'Confirmation can take a little while. If you paid, your plan is activated as soon as it arrives and shows in your payment history; refresh in a minute. If you didn’t finish paying, you can pay again.')}</span>
      </Alert>;
      break;
  }
  return <div className="online-return" aria-live="polite" aria-atomic="true">{content}</div>;
}
