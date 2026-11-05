import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckIcon, ClockCounterClockwiseIcon, SealCheckIcon, XIcon } from '@phosphor-icons/react';
import { CASH_REVIEW_STATUS_LABELS, CASH_REVIEW_STATUSES, CASH_SHIFT_STATUS_LABELS, CASH_SHIFT_STATUSES, type CashShift } from '@bilhanah/contracts';
import { Button } from '../../components/Button';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Field } from '../../components/Field';
import { Pagination } from '../../components/Pagination';
import { Skeleton } from '../../components/Skeleton';
import { cashApi, type CashShiftFilters } from '../../lib/api/endpoints';
import { useLanguage, usePageTitle } from '../../lib/language';
import { useSession } from '../../lib/session';
import { useBranchScope } from '../branches/BranchScope';
import { useWorkspace } from '../branches/workspace';
import { addDays, isoDay } from '../attendance/shared';
import { useAdjustmentReview, ShiftDetailDialog } from './ShiftDetailDialog';
import { cashKeys, Discrepancy, KindLabel, ReviewBadge, ShiftStatusBadge, useDateTime, useMoney } from './shared';

function ShiftsTable({ shifts, onOpen }: { shifts: CashShift[]; onOpen: (id: string) => void }) {
  const { text } = useLanguage();
  const money = useMoney();
  const when = useDateTime();
  return <div className="table-scroll"><table className="data-table cash-table">
    <thead><tr>
      <th scope="col">{text('اتفتح', 'Opened')}</th>
      <th scope="col">{text('الكاشير', 'Cashier')}</th>
      <th scope="col">{text('الفرع / الخزنة', 'Branch / register')}</th>
      <th scope="col">{text('الحالة', 'Status')}</th>
      <th scope="col">{text('المتوقع', 'Expected')}</th>
      <th scope="col">{text('المعدود', 'Counted')}</th>
      <th scope="col">{text('الفرق', 'Difference')}</th>
      <th scope="col">{text('المراجعة', 'Review')}</th>
    </tr></thead>
    <tbody>{shifts.map(shift => <tr key={shift.id} className="is-clickable" data-testid="cash-shift-row" onClick={() => onOpen(shift.id)}>
      <td className="cell-primary cell-nowrap" data-label={text('اتفتح', 'Opened')}>
        <button type="button" className="link-button" onClick={event => { event.stopPropagation(); onOpen(shift.id); }}>{when(shift.openedAt)}</button>
      </td>
      <td data-label={text('الكاشير', 'Cashier')}><bdi>{shift.cashier.name}</bdi></td>
      <td data-label={text('الفرع / الخزنة', 'Branch / register')}><bdi>{shift.branchName}</bdi>{shift.register && <small> · <bdi>{shift.register.name}</bdi></small>}</td>
      <td data-label={text('الحالة', 'Status')}><ShiftStatusBadge status={shift.status} /></td>
      <td data-label={text('المتوقع', 'Expected')} className="cell-nowrap">{money(shift.expectedPiastres ?? shift.summary.expectedPiastres)}</td>
      <td data-label={text('المعدود', 'Counted')} className="cell-nowrap">{money(shift.countedPiastres)}</td>
      <td data-label={text('الفرق', 'Difference')} className="cell-nowrap"><Discrepancy piastres={shift.discrepancyPiastres} /></td>
      <td data-label={text('المراجعة', 'Review')}><ReviewBadge status={shift.reviewStatus} /></td>
    </tr>)}</tbody>
  </table></div>;
}

/** Every shift the viewer may see (cashiers: their own), filterable, each with its reconciliation report. */
export function CashShiftsPage() {
  const { text } = useLanguage();
  usePageTitle('سجل الشيفتات', 'Shift history');
  const scope = useBranchScope();
  const branchId = scope.selected === 'all' ? null : scope.selected;
  const [from, setFrom] = useState(() => addDays(isoDay(), -29));
  const [to, setTo] = useState(isoDay);
  const [status, setStatus] = useState('');
  const [review, setReview] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const filters: CashShiftFilters = { branchId, from, to, status: status || null, review: review || null, page, pageSize: 25 };
  const shifts = useQuery({ queryKey: cashKeys.shifts(filters), queryFn: () => cashApi.shifts(filters) });
  const reset = <T,>(set: (value: T) => void) => (value: T) => { set(value); setPage(1); };
  return <>
    <div className="att-filters" role="group" aria-label={text('تصفية', 'Filters')}>
      <Field label={text('من', 'From')}><input className="input" type="date" value={from} max={to} onChange={event => event.target.value && reset(setFrom)(event.target.value)} /></Field>
      <Field label={text('لحد', 'To')}><input className="input" type="date" value={to} min={from} onChange={event => event.target.value && reset(setTo)(event.target.value)} /></Field>
      <Field label={text('الحالة', 'Status')}>
        <select className="select" value={status} onChange={event => reset(setStatus)(event.target.value)}>
          <option value="">{text('الكل', 'All')}</option>
          {CASH_SHIFT_STATUSES.map(value => <option key={value} value={value}>{text(...CASH_SHIFT_STATUS_LABELS[value])}</option>)}
        </select>
      </Field>
      <Field label={text('المراجعة', 'Review')}>
        <select className="select" value={review} onChange={event => reset(setReview)(event.target.value)}>
          <option value="">{text('الكل', 'All')}</option>
          {CASH_REVIEW_STATUSES.map(value => <option key={value} value={value}>{text(...CASH_REVIEW_STATUS_LABELS[value])}</option>)}
        </select>
      </Field>
    </div>
    <section className="card list-card" aria-labelledby="cash-shifts-title">
      <h2 id="cash-shifts-title" className="visually-hidden">{text('الشيفتات', 'Shifts')}</h2>
      {shifts.isError && <ErrorPanel error={shifts.error} onRetry={() => void shifts.refetch()} />}
      {shifts.isPending && <div className="table-skeleton">{[0, 1, 2].map(index => <Skeleton key={index} height={48} />)}</div>}
      {shifts.data?.items.length === 0 && <div className="empty-state">
        <span className="empty-state-icon" aria-hidden="true"><ClockCounterClockwiseIcon size={30} /></span>
        <h2>{text('مفيش شيفتات في الفترة دي', 'No shifts in this period')}</h2>
      </div>}
      {shifts.data && shifts.data.items.length > 0 && <ShiftsTable shifts={shifts.data.items} onOpen={setOpenId} />}
    </section>
    {shifts.data && <Pagination page={page} pageSize={shifts.data.pageSize} total={shifts.data.total} onChange={setPage} label={text('صفحات الشيفتات', 'Shift pages')} />}
    <ShiftDetailDialog shiftId={openId} onClose={() => setOpenId(null)} />
  </>;
}

/** What waits for a manager: counts beyond the tolerance, and adjustments held for approval. */
export function CashReviewPage() {
  const { text } = useLanguage();
  usePageTitle('مراجعة الكاش', 'Cash review');
  const money = useMoney();
  const when = useDateTime();
  const { role } = useWorkspace();
  const session = useSession();
  const userId = session.status === 'authenticated' ? session.user.id : null;
  const scope = useBranchScope();
  const branchId = scope.selected === 'all' ? null : scope.selected;
  const [openId, setOpenId] = useState<string | null>(null);
  const filters: CashShiftFilters = { branchId, review: 'PENDING', page: 1, pageSize: 100 };
  const shifts = useQuery({ queryKey: cashKeys.shifts(filters), queryFn: () => cashApi.shifts(filters) });
  const adjustments = useQuery({ queryKey: cashKeys.pending(branchId), queryFn: () => cashApi.pendingAdjustments(branchId) });
  const review = useAdjustmentReview();
  const nothing = shifts.data?.items.length === 0 && adjustments.data?.length === 0;
  return <>
    {nothing && <section className="card"><div className="empty-state">
      <span className="empty-state-icon" aria-hidden="true"><SealCheckIcon size={30} /></span>
      <h2>{text('مفيش حاجة مستنية مراجعة', 'Nothing waiting for review')}</h2>
      <p>{text('الفروقات اللي أكبر من المسموح والتسويات اللي محتاجة موافقة بتظهر هنا.', 'Discrepancies beyond the tolerance and adjustments that need approval show up here.')}</p>
    </div></section>}
    {!nothing && <section className="card list-card" aria-labelledby="cash-review-shifts">
      <h2 id="cash-review-shifts" className="card-title">{text('فروقات مستنية موافقة', 'Discrepancies awaiting approval')}</h2>
      {shifts.isError && <ErrorPanel error={shifts.error} onRetry={() => void shifts.refetch()} />}
      {shifts.isPending && <Skeleton height={80} />}
      {shifts.data?.items.length === 0 && <p className="muted cash-empty">{text('مفيش.', 'None.')}</p>}
      {shifts.data && shifts.data.items.length > 0 && <ShiftsTable shifts={shifts.data.items} onOpen={setOpenId} />}
    </section>}
    {!nothing && <section className="card list-card" aria-labelledby="cash-review-adjustments">
      <h2 id="cash-review-adjustments" className="card-title">{text('تسويات مستنية موافقة', 'Adjustments awaiting approval')}</h2>
      {adjustments.isError && <ErrorPanel error={adjustments.error} onRetry={() => void adjustments.refetch()} />}
      {adjustments.isPending && <Skeleton height={80} />}
      {adjustments.data?.length === 0 && <p className="muted cash-empty">{text('مفيش.', 'None.')}</p>}
      {adjustments.data && adjustments.data.length > 0 && <ul className="corr-list">{adjustments.data.map(item => <li key={item.id} className="corr-item" data-testid="pending-adjustment">
        <div className="corr-head">
          <strong><bdi>{item.cashierName}</bdi></strong>
          <span className="muted"><bdi>{item.branchName}</bdi> · <KindLabel kind={item.kind} /></span>
          <strong className="ltr cash-effect">{item.amountPiastres > 0 ? '+' : ''}{money(item.amountPiastres)}</strong>
          <small className="corr-when">{when(item.createdAt)}</small>
        </div>
        <p className="corr-reason"><span>{text('السبب:', 'Reason:')}</span> <bdi>{item.reason}</bdi>{item.createdBy && <small className="muted"> · {text('سجّلها', 'by')} <bdi>{item.createdBy}</bdi></small>}</p>
        <div className="corr-actions">
          <Button small variant="ghost" onClick={() => setOpenId(item.shiftId)}>{text('افتح الشيفت', 'Open shift')}</Button>
          {(role === 'OWNER' || item.createdById !== userId) && <>
            <Button small variant="danger-outline" loading={review.isPending && review.variables?.id === item.id && !review.variables.approve} onClick={() => review.mutate({ id: item.id, approve: false })} icon={<XIcon size={15} aria-hidden="true" />}>{text('ارفض', 'Reject')}</Button>
            <Button small loading={review.isPending && review.variables?.id === item.id && review.variables.approve} onClick={() => review.mutate({ id: item.id, approve: true })} icon={<CheckIcon size={15} aria-hidden="true" />}>{text('وافق', 'Approve')}</Button>
          </>}
        </div>
      </li>)}</ul>}
    </section>}
    <ShiftDetailDialog shiftId={openId} onClose={() => setOpenId(null)} />
  </>;
}
