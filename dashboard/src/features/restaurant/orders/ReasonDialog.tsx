import { useEffect, useState } from 'react';
import type { OwnerOrder } from '@bilhanah/contracts';
import { Button } from '../../../components/Button';
import { Dialog } from '../../../components/Dialog';
import { Field } from '../../../components/Field';
import { useLanguage } from '../../../lib/language';
import { OrderNo } from './labels';

const MAX = 300;

const SUGGESTIONS = {
  REJECTED: [
    ['المطبخ زحمة جدًا دلوقتي', 'The kitchen is too busy right now'],
    ['صنف في الطلب خلص', 'An item in the order is sold out'],
    ['قربنا نقفل', 'We are about to close'],
  ],
  CANCELLED: [
    ['صنف في الطلب خلص', 'An item in the order is sold out'],
    ['الزبون طلب الإلغاء', 'The customer asked to cancel'],
    ['حصلت مشكلة في المطبخ', 'There was a problem in the kitchen'],
  ],
} as const;

type Props = {
  order: OwnerOrder | null;
  status: 'REJECTED' | 'CANCELLED';
  onClose: () => void;
  onConfirm: (reason: string) => void;
};

/** Rejecting or cancelling needs a reason; the diner sees it on their order page. */
export function ReasonDialog({ order, status, onClose, onConfirm }: Props) {
  const { text, number } = useLanguage();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setReason(''); setError(null); }, [order?.id, status]);
  if (!order) return null;
  const rejecting = status === 'REJECTED';
  const submit = () => {
    const value = reason.trim();
    if (value.length < 2) { setError(text('اكتب السبب عشان الزبون يعرف.', 'Add a reason so the customer knows why.')); return; }
    onConfirm(value);
  };
  return <Dialog open onClose={onClose} size="small" onSubmit={submit}
    title={<>{rejecting ? text('رفض طلب ', 'Reject order ') : text('إلغاء طلب ', 'Cancel order ')}<OrderNo number={order.number} /></>}
    footer={<>
      <Button variant="secondary" onClick={onClose}>{text('رجوع', 'Back')}</Button>
      <Button type="submit" variant="danger">{rejecting ? text('ارفض الطلب', 'Reject order') : text('ألغِ الطلب', 'Cancel order')}</Button>
    </>}>
    <div className="form">
      <p className="muted">{text('الزبون هيشوف السبب ده في صفحة متابعة الطلب.', 'The customer sees this reason on their order page.')}</p>
      <div className="chips reason-chips" role="group" aria-label={text('أسباب جاهزة', 'Quick reasons')}>
        {SUGGESTIONS[status].map(([ar, en]) => <button type="button" key={en} className="chip" aria-pressed={reason === text(ar, en)} onClick={() => { setReason(text(ar, en)); setError(null); }}>{text(ar, en)}</button>)}
      </div>
      <Field label={text('السبب', 'Reason')} error={error ? { message: error } : undefined} hint={text(`${number(reason.length)} من ${number(MAX)} حرف`, `${reason.length} of ${MAX} characters`)}>
        <textarea className="textarea" data-autofocus maxLength={MAX} rows={3} value={reason} onChange={event => { setReason(event.target.value); setError(null); }} />
      </Field>
    </div>
  </Dialog>;
}
