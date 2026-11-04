import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, ClipboardTextIcon, XIcon } from '@phosphor-icons/react';
import type { AttendanceCorrection } from '@bilhanah/contracts';
import { Button } from '../../components/Button';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { attendanceApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { formatDate, formatRelative } from '../../lib/format';
import { useLanguage, usePageTitle } from '../../lib/language';
import { useBranchScope } from '../branches/BranchScope';
import { useWorkspace } from '../branches/workspace';
import { attendanceKeys, useClock } from './shared';

const STATUS_TEXT: Record<AttendanceCorrection['status'], [string, string, string]> = {
  PENDING: ['مستني', 'Pending', 'guava'], APPROVED: ['اتوافق عليه', 'Approved', 'success'], REJECTED: ['اترفض', 'Rejected', 'danger'],
};

/** Employees' requests to fix a forgotten check-in or check-out: the times asked for beside the recorded ones. */
export function AttendanceCorrectionsPage() {
  const { text } = useLanguage();
  usePageTitle('طلبات التصحيح', 'Correction requests');
  const scope = useBranchScope();
  const branchId = scope.selected === 'all' ? null : scope.selected;
  const [status, setStatus] = useState<'PENDING' | ''>('PENDING');
  const corrections = useQuery({ queryKey: attendanceKeys.corrections(status || null, branchId), queryFn: () => attendanceApi.corrections(status || null, branchId) });
  return <>
    <div className="att-toolbar">
      <div className="segmented" role="radiogroup" aria-label={text('الحالة', 'Status')}>
        <label><input type="radio" name="corr-status" checked={status === 'PENDING'} onChange={() => setStatus('PENDING')} />{text('مستنية', 'Pending')}</label>
        <label><input type="radio" name="corr-status" checked={status === ''} onChange={() => setStatus('')} />{text('الكل', 'All')}</label>
      </div>
    </div>
    <section className="card audit-card" aria-labelledby="att-corrections-title">
      <h2 id="att-corrections-title" className="visually-hidden">{text('الطلبات', 'Requests')}</h2>
      {corrections.isError && <ErrorPanel error={corrections.error} onRetry={() => void corrections.refetch()} />}
      {corrections.isPending && <div className="audit-skeleton">{[0, 1].map(index => <Skeleton key={index} height={80} />)}</div>}
      {corrections.data?.length === 0 && <div className="empty-state">
        <span className="empty-state-icon" aria-hidden="true"><ClipboardTextIcon size={30} /></span>
        <h2>{status ? text('مفيش طلبات مستنية', 'Nothing waiting') : text('مفيش طلبات', 'No requests')}</h2>
        <p>{text('لما موظف ينسى يسجّل، بيبعت طلب من صفحة حضوره ويظهر هنا.', 'When an employee forgets to check in or out, they ask from their attendance page and it shows here.')}</p>
      </div>}
      {corrections.data && corrections.data.length > 0 && <ul className="corr-list">{corrections.data.map(item => <CorrectionItem key={item.id} item={item} />)}</ul>}
    </section>
  </>;
}

function CorrectionItem({ item }: { item: AttendanceCorrection }) {
  const { text, language } = useLanguage();
  const { can } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const clock = useClock();
  const [note, setNote] = useState('');
  const review = useMutation({
    mutationFn: (approve: boolean) => (approve ? attendanceApi.approveCorrection(item.id, note.trim() || null) : attendanceApi.rejectCorrection(item.id, note.trim() || null)),
    onSuccess: (_saved, approve) => {
      void queryClient.invalidateQueries({ queryKey: attendanceKeys.all });
      toast.success(approve ? text('اتوافق والسجل اتعدّل', 'Approved; the record was updated') : text('اترفض الطلب', 'Request rejected'));
    },
    onError: error => toast.error(errorMessage(error, text)),
  });
  const [ar, en, tone] = STATUS_TEXT[item.status];
  return <li className="corr-item" data-testid="correction-row">
    <div className="corr-head">
      <strong><bdi>{item.employee.fullName}</bdi></strong>
      <span className="muted"><span className="ltr">#{item.employee.employeeNumber}</span> · <bdi>{item.employee.branchName}</bdi></span>
      <span className={`badge att-badge tone-${tone}`}>{text(ar, en)}</span>
      <small className="corr-when">{formatRelative(item.createdAt, language)}</small>
    </div>
    <p className="corr-day">{formatDate(`${item.day}T12:00:00`, language, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
    <div className="corr-compare">
      <div><span>{text('المسجّل', 'Recorded')}</span><strong>{item.current ? `${clock(item.current.checkInAt)} → ${clock(item.current.checkOutAt)}` : text('مفيش حضور', 'No attendance')}</strong></div>
      <div className="is-requested"><span>{text('المطلوب', 'Requested')}</span><strong>{clock(item.requestedCheckIn ?? item.current?.checkInAt ?? null)} → {clock(item.requestedCheckOut ?? item.current?.checkOutAt ?? null)}</strong></div>
    </div>
    <p className="corr-reason"><span>{text('السبب:', 'Reason:')}</span> <bdi>{item.reason}</bdi></p>
    {item.status !== 'PENDING' && <p className="muted small">{text(`راجعه ${item.reviewedBy ?? ''}`, `Reviewed by ${item.reviewedBy ?? ''}`)}{item.reviewNote ? ` — ${item.reviewNote}` : ''}</p>}
    {item.status === 'PENDING' && can('attendance.approve') && <div className="corr-actions">
      <input className="input" maxLength={300} value={note} onChange={event => setNote(event.target.value)} placeholder={text('ملاحظة (اختياري)', 'Note (optional)')} aria-label={text('ملاحظة', 'Note')} />
      <Button small variant="danger-outline" loading={review.isPending && review.variables === false} onClick={() => review.mutate(false)} icon={<XIcon size={15} aria-hidden="true" />}>{text('ارفض', 'Reject')}</Button>
      <Button small loading={review.isPending && review.variables === true} onClick={() => review.mutate(true)} icon={<CheckIcon size={15} aria-hidden="true" />}>{text('وافق', 'Approve')}</Button>
    </div>}
  </li>;
}
