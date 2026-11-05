import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, PencilSimpleLineIcon, XIcon } from '@phosphor-icons/react';
import type { CashShiftDetail, CashShiftEvent, CashTransaction } from '@bilhanah/contracts';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Field } from '../../components/Field';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { cashApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { useLanguage } from '../../lib/language';
import { useSession } from '../../lib/session';
import { useWorkspace } from '../branches/workspace';
import { cashKeys, Discrepancy, KindLabel, parseMoney, ReviewBadge, ShiftStatusBadge, useDateTime, useMoney } from './shared';

/** Approve or reject a pending adjustment. */
export function useAdjustmentReview() {
  const { text } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => cashApi.reviewAdjustment(id, approve, null),
    onSuccess: (detail, { approve }) => {
      queryClient.setQueryData(cashKeys.shift(detail.id), detail);
      void queryClient.invalidateQueries({ queryKey: cashKeys.all });
      toast.success(approve ? text('اتوافق على التسوية', 'Adjustment approved') : text('اترفضت التسوية', 'Adjustment rejected'));
    },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
}

/** Every movement of a drawer, newest first. */
export function TransactionsTable({ transactions }: { transactions: CashTransaction[] }) {
  const { text, number } = useLanguage();
  const money = useMoney();
  const when = useDateTime();
  const { can, role } = useWorkspace();
  const session = useSession();
  const me = session.status === 'authenticated' ? session.user.id : null;
  const review = useAdjustmentReview();
  if (!transactions.length) return <p className="muted cash-empty">{text('مفيش حركة لسه.', 'No activity yet.')}</p>;
  return <div className="table-scroll"><table className="data-table cash-table">
    <thead><tr>
      <th scope="col">{text('الوقت', 'Time')}</th>
      <th scope="col">{text('النوع', 'Type')}</th>
      <th scope="col">{text('التفاصيل', 'Details')}</th>
      <th scope="col">{text('بواسطة', 'By')}</th>
      <th scope="col">{text('الأثر على الدرج', 'Drawer effect')}</th>
    </tr></thead>
    <tbody>{transactions.map(row => <tr key={row.id} data-testid="cash-transaction" data-kind={row.kind}>
      <td data-label={text('الوقت', 'Time')} className="cell-nowrap">{when(row.createdAt)}</td>
      <td data-label={text('النوع', 'Type')}><KindLabel kind={row.kind} />
        {row.approvalStatus !== 'APPROVED' && <> <span className={`badge att-badge tone-${row.approvalStatus === 'PENDING' ? 'guava' : 'danger'}`}>
          {row.approvalStatus === 'PENDING' ? text('مستنية موافقة', 'Pending') : text('مرفوضة', 'Rejected')}</span></>}
      </td>
      <td data-label={text('التفاصيل', 'Details')}>
        {row.order ? text(`طلب #${number(row.order.number)}`, `Order #${row.order.number}`) : <bdi>{row.reason ?? '—'}</bdi>}
        {row.approvalStatus === 'PENDING' && can('cash.approve') && (role === 'OWNER' || row.createdById !== me) && <span className="cash-inline-actions">
          <Button small variant="danger-outline" loading={review.isPending && review.variables?.id === row.id && !review.variables.approve} onClick={() => review.mutate({ id: row.id, approve: false })} icon={<XIcon size={14} aria-hidden="true" />}>{text('ارفض', 'Reject')}</Button>
          <Button small loading={review.isPending && review.variables?.id === row.id && review.variables.approve} onClick={() => review.mutate({ id: row.id, approve: true })} icon={<CheckIcon size={14} aria-hidden="true" />}>{text('وافق', 'Approve')}</Button>
        </span>}
      </td>
      <td data-label={text('بواسطة', 'By')}><bdi>{row.createdBy ?? '—'}</bdi></td>
      <td data-label={text('الأثر على الدرج', 'Drawer effect')} className={`cell-nowrap ltr cash-effect ${row.effectPiastres < 0 ? 'is-out' : row.effectPiastres > 0 ? 'is-in' : ''}`}>
        {row.effectPiastres > 0 ? '+' : ''}{row.effectPiastres === 0 ? '—' : money(row.effectPiastres)}
      </td>
    </tr>)}</tbody>
  </table></div>;
}

const ACTION_TEXT: Record<string, [string, string]> = {
  'cash.shift_opened': ['فتح الشيفت', 'Opened the shift'],
  'cash.movement': ['سجّل حركة كاش', 'Recorded a cash movement'],
  'cash.adjustment': ['سجّل تسوية', 'Recorded an adjustment'],
  'cash.adjustment_reviewed': ['راجع تسوية', 'Reviewed an adjustment'],
  'cash.closing_started': ['بدأ القفل', 'Started closing'],
  'cash.closing_cancelled': ['رجّع الشيفت مفتوح', 'Reopened the shift'],
  'cash.shift_closed': ['قفل الشيفت', 'Closed the shift'],
  'cash.shift_reviewed': ['راجع الفرق', 'Reviewed the discrepancy'],
  'cash.correction': ['عمل تصحيح بعد القفل', 'Corrected the closed shift'],
};

function History({ events }: { events: CashShiftEvent[] }) {
  const { text } = useLanguage();
  const when = useDateTime();
  return <ol className="cash-history">
    {events.map((event, index) => {
      const meta = event.metadata ?? {};
      const detail = [meta['reason'], meta['note']].filter(value => typeof value === 'string' && value).join(' — ');
      return <li key={index}>
        <time>{when(event.at)}</time>
        <span><strong><bdi>{event.actorName ?? text('النظام', 'System')}</bdi></strong> {text(...(ACTION_TEXT[event.action] ?? [event.action, event.action]))}
          {typeof meta['approvalStatus'] === 'string' && meta['approvalStatus'] !== 'APPROVED' && event.action === 'cash.adjustment' && <> ({text('مستنية موافقة', 'pending')})</>}
          {typeof meta['reviewStatus'] === 'string' && event.action === 'cash.shift_reviewed' && <> — {meta['reviewStatus'] === 'APPROVED' ? text('موافقة', 'approved') : text('رفض', 'rejected')}</>}
          {detail && <small> · <bdi>{detail}</bdi></small>}
        </span>
      </li>;
    })}
  </ol>;
}

/** One shift in full: its reconciliation, every movement and its audit trail; managers review and correct it here. */
export function ShiftDetailDialog({ shiftId, onClose }: { shiftId: string | null; onClose: () => void }) {
  const { text } = useLanguage();
  const money = useMoney();
  const when = useDateTime();
  const { can, role } = useWorkspace();
  const session = useSession();
  const userId = session.status === 'authenticated' ? session.user.id : null;
  const detail = useQuery({ queryKey: cashKeys.shift(shiftId ?? ''), queryFn: () => cashApi.shift(shiftId!), enabled: Boolean(shiftId) });
  const data = detail.data;
  const own = data?.cashier.id === userId && role !== 'OWNER';
  return <Dialog open={Boolean(shiftId)} onClose={onClose} size="wide"
    title={data ? <>{text('شيفت ', 'Shift of ')}<bdi>{data.cashier.name}</bdi></> : text('الشيفت', 'Shift')}
    footer={<Button variant="secondary" onClick={onClose}>{text('إغلاق', 'Close')}</Button>}>
    {detail.isPending && <div className="skeleton-stack"><Skeleton height={80} /><Skeleton height={160} /></div>}
    {detail.isError && <ErrorPanel error={detail.error} onRetry={() => void detail.refetch()} />}
    {data && <div className="cash-detail" data-testid="shift-detail">
      <div className="cash-detail-meta">
        <ShiftStatusBadge status={data.status} /> <ReviewBadge status={data.reviewStatus} />
        <span className="muted"><bdi>{data.branchName}</bdi>{data.register && <> · <bdi>{data.register.name}</bdi></>} · {data.currency}</span>
      </div>
      <dl className="cash-summary">
        <div><dt>{text('اتفتح', 'Opened')}</dt><dd>{when(data.openedAt)}</dd></div>
        <div><dt>{text('اتقفل', 'Closed')}</dt><dd>{when(data.closedAt)}{data.closedBy && data.closedBy !== data.cashier.name && <small> · <bdi>{data.closedBy}</bdi></small>}</dd></div>
        <div><dt>{text('رصيد البداية', 'Opening balance')}</dt><dd>{money(data.openingPiastres)}</dd></div>
        <div className="tone-success"><dt>{text('مبيعات كاش', 'Cash sales')}</dt><dd>+{money(data.summary.cashSalesPiastres)}</dd></div>
        <div className="tone-danger"><dt>{text('مرتجعات كاش', 'Cash refunds')}</dt><dd>−{money(data.summary.cashRefundsPiastres)}</dd></div>
        <div><dt>{text('إيداع / سحب', 'Cash in / out')}</dt><dd>+{money(data.summary.cashInPiastres)} / −{money(data.summary.cashOutPiastres)}</dd></div>
        <div><dt>{text('تسويات وتصحيحات', 'Adjustments')}</dt><dd className="ltr">{money(data.summary.adjustmentsPiastres)}</dd></div>
        <div><dt>{text('المتوقع', 'Expected')}</dt><dd><strong>{money(data.expectedPiastres ?? data.summary.expectedPiastres)}</strong></dd></div>
        <div><dt>{text('المعدود', 'Counted')}</dt><dd><strong>{money(data.countedPiastres)}</strong></dd></div>
        <div><dt>{text('الفرق', 'Difference')}</dt><dd><Discrepancy piastres={data.discrepancyPiastres} /></dd></div>
      </dl>
      {data.openingNote && <p className="cash-note"><span>{text('ملاحظة الفتح:', 'Opening note:')}</span> <bdi>{data.openingNote}</bdi></p>}
      {data.closingNote && <p className="cash-note"><span>{text('ملاحظة القفل:', 'Closing note:')}</span> <bdi>{data.closingNote}</bdi></p>}
      {data.reviewedBy && <p className="cash-note"><span>{text('المراجعة:', 'Review:')}</span> <bdi>{data.reviewedBy}</bdi> · {when(data.reviewedAt)}{data.reviewNote && <> — <bdi>{data.reviewNote}</bdi></>}</p>}
      {data.reviewStatus === 'PENDING' && can('cash.approve') && !own && <ReviewForm shift={data} />}
      {data.status === 'CLOSED' && can('cash.approve') && <CorrectionForm shift={data} />}
      <h3 className="cash-subtitle">{text('حركة الدرج', 'Drawer activity')}</h3>
      <TransactionsTable transactions={data.transactions} />
      <h3 className="cash-subtitle">{text('سجل العمليات', 'Audit trail')}</h3>
      <History events={data.history} />
    </div>}
  </Dialog>;
}

function ReviewForm({ shift }: { shift: CashShiftDetail }) {
  const { text } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const review = useMutation({
    mutationFn: (approve: boolean) => cashApi.review(shift.id, approve, note.trim() || null),
    onSuccess: (_saved, approve) => {
      void queryClient.invalidateQueries({ queryKey: cashKeys.all });
      toast.success(approve ? text('اتوافق على الفرق', 'Discrepancy approved') : text('اترفض الفرق', 'Discrepancy rejected'));
    },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  return <div className="cash-review" data-testid="shift-review">
    <strong>{text('الفرق ده محتاج مراجعتك', 'This discrepancy needs your review')}</strong>
    <input className="input" maxLength={500} value={note} onChange={event => setNote(event.target.value)} placeholder={text('ملاحظة (اختياري)', 'Note (optional)')} aria-label={text('ملاحظة', 'Note')} />
    <Button small variant="danger-outline" loading={review.isPending && review.variables === false} onClick={() => review.mutate(false)} icon={<XIcon size={15} aria-hidden="true" />}>{text('ارفض', 'Reject')}</Button>
    <Button small loading={review.isPending && review.variables === true} onClick={() => review.mutate(true)} icon={<CheckIcon size={15} aria-hidden="true" />}>{text('وافق', 'Approve')}</Button>
  </div>;
}

/** The authorized way to change a closed shift: a recount and/or a missed movement, with a reason (audited). */
function CorrectionForm({ shift }: { shift: CashShiftDetail }) {
  const { text } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [counted, setCounted] = useState('');
  const [adjustment, setAdjustment] = useState('');
  const [reason, setReason] = useState('');
  const countedPiastres = counted.trim() ? parseMoney(counted) : undefined;
  const adjustmentPiastres = adjustment.trim() ? parseMoney(adjustment, true) : undefined;
  const valid = reason.trim().length >= 3 && countedPiastres !== null && adjustmentPiastres !== null && adjustmentPiastres !== 0
    && (countedPiastres !== undefined || adjustmentPiastres !== undefined);
  const correct = useMutation({
    mutationFn: () => cashApi.correct(shift.id, {
      reason: reason.trim(),
      ...(countedPiastres !== undefined && countedPiastres !== null && { countedPiastres }),
      ...(adjustmentPiastres !== undefined && adjustmentPiastres !== null && { adjustmentPiastres }),
    }),
    onSuccess: detail => {
      queryClient.setQueryData(cashKeys.shift(shift.id), detail);
      void queryClient.invalidateQueries({ queryKey: cashKeys.all });
      toast.success(text('اتسجل التصحيح', 'Correction recorded'));
      setOpen(false); setCounted(''); setAdjustment(''); setReason('');
    },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  if (!open) return <div className="cash-actions"><Button small variant="ghost" onClick={() => setOpen(true)} icon={<PencilSimpleLineIcon size={15} aria-hidden="true" />}>{text('تصحيح الشيفت المقفول', 'Correct this closed shift')}</Button></div>;
  return <form className="cash-correction" onSubmit={event => { event.preventDefault(); if (valid) correct.mutate(); }}>
    <p className="muted">{text('التصحيح بيتسجل في سجل العمليات بالقيم قبل وبعد. سيب الخانة فاضية لو مش هتغيرها.', 'Corrections are logged with the values before and after. Leave a field empty to keep it.')}</p>
    <div className="cash-correction-grid">
      <Field label={text('عدّ جديد (ج.م)', 'New count (EGP)')} optional><input className="input ltr" inputMode="decimal" value={counted} onChange={event => setCounted(event.target.value)} /></Field>
      <Field label={text('حركة ناقصة (ج.م، بالسالب للسحب)', 'Missed movement (EGP, minus for out)')} optional><input className="input ltr" value={adjustment} onChange={event => setAdjustment(event.target.value)} /></Field>
    </div>
    <Field label={text('السبب', 'Reason')} required><input className="input" maxLength={300} value={reason} onChange={event => setReason(event.target.value)} /></Field>
    <div className="cash-actions">
      <Button small variant="secondary" onClick={() => setOpen(false)}>{text('إلغاء', 'Cancel')}</Button>
      <Button small type="submit" loading={correct.isPending} disabled={!valid}>{text('سجّل التصحيح', 'Save correction')}</Button>
    </div>
  </form>;
}
