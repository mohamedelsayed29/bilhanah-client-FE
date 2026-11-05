import { useMemo, useState } from 'react';
import { Navigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowCircleDownIcon, ArrowCircleUpIcon, CalculatorIcon, LockKeyIcon, LockKeyOpenIcon, ScalesIcon, WalletIcon } from '@phosphor-icons/react';
import { closingNoteRequired, type CashShift, type ManualCashKind, type MyCashDrawer } from '@bilhanah/contracts';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Field } from '../../components/Field';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { cashApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { useLanguage, usePageTitle } from '../../lib/language';
import { useBranchScope } from '../branches/BranchScope';
import { useWorkspace } from '../branches/workspace';
import { cashKeys, Discrepancy, parseMoney, ReviewBadge, ShiftStatusBadge, useDateTime, useMoney } from './shared';
import { TransactionsTable } from './ShiftDetailDialog';

/** The signed-in cashier's drawer: open a shift, follow it live, record cash in and out, and close it. */
export function CashDrawerPage() {
  usePageTitle('درجي', 'My drawer');
  const { can, to } = useWorkspace();
  const drawer = useQuery({ queryKey: cashKeys.me, queryFn: cashApi.me, enabled: can('cash.operate'), refetchInterval: 30_000 });
  const [closed, setClosed] = useState<CashShift | null>(null);
  if (!can('cash.operate')) return <Navigate to={to('/cash/shifts')} replace />;
  if (drawer.isError) return <ErrorPanel error={drawer.error} onRetry={() => void drawer.refetch()} />;
  if (drawer.isPending) return <div className="skeleton-stack"><Skeleton height={120} /><Skeleton height={220} /></div>;
  return <>
    {closed && !drawer.data.shift && <ClosedSummary shift={closed} onDismiss={() => setClosed(null)} />}
    {drawer.data.shift ? <ActiveShift drawer={drawer.data} shift={drawer.data.shift} onClosed={setClosed} /> : <OpenShiftForm drawer={drawer.data} />}
  </>;
}

function OpenShiftForm({ drawer }: { drawer: MyCashDrawer }) {
  const { text } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const scope = useBranchScope();
  const branches = scope.choices;
  const [branchId, setBranchId] = useState(() => (scope.selected !== 'all' ? scope.selected : branches.find(branch => branch.isMain)?.id ?? branches[0]?.id ?? ''));
  const registers = useMemo(() => drawer.registers.filter(register => register.isActive && (!branchId || register.branchId === branchId)), [drawer.registers, branchId]);
  const [registerId, setRegisterId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const open = useMutation({
    mutationFn: () => {
      const openingPiastres = parseMoney(amount);
      if (openingPiastres === null) throw new Error('amount');
      return cashApi.open({ branchId: branchId || undefined, registerId: registerId || null, openingPiastres, note: note.trim() || null });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cashKeys.all });
      toast.success(text('الشيفت اتفتح', 'Shift opened'));
    },
    onError: failure => (failure.message === 'amount' ? setError(text('اكتب المبلغ بالجنيه، زي 500 أو 250.5', 'Enter the amount in pounds, e.g. 500 or 250.5')) : toast.error(errorMessage(failure, text))),
  });
  const chosen = registers.find(register => register.id === registerId);
  const busy = chosen && chosen.openShifts.length > 0 && !drawer.settings.allowSharedRegister;
  return <section className="card cash-open" aria-labelledby="cash-open-title">
    <div className="cash-open-head">
      <span className="empty-state-icon" aria-hidden="true"><WalletIcon size={30} /></span>
      <div>
        <h2 id="cash-open-title">{text('مفيش شيفت مفتوح', 'No open shift')}</h2>
        <p className="muted">{text('عدّ الفلوس اللي في الدرج واكتبها كرصيد بداية. كل حساب يتدفع كاش بعد كده هيتحسب على الشيفت ده.', 'Count the cash in the drawer and enter it as the opening balance. Every bill paid in cash from now on counts on this shift.')}</p>
      </div>
    </div>
    <form className="cash-open-form" onSubmit={event => { event.preventDefault(); setError(null); open.mutate(); }}>
      {branches.length > 1 && <Field label={text('الفرع', 'Branch')}>
        <select className="select" value={branchId} onChange={event => { setBranchId(event.target.value); setRegisterId(''); }}>
          {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
      </Field>}
      {registers.length > 0 && <Field label={text('الخزنة', 'Register')} required
        hint={busy ? text(`مفتوح عليها شيفت ${chosen!.openShifts[0]!.cashierName}`, `${chosen!.openShifts[0]!.cashierName} has a shift open on it`) : undefined}>
        <select className="select" value={registerId} required onChange={event => setRegisterId(event.target.value)}>
          <option value="">{text('اختار الخزنة', 'Choose a register')}</option>
          {registers.map(register => <option key={register.id} value={register.id}>
            {register.name}{register.openShifts.length ? ` · ${text('مشغولة', 'in use')}` : ''}
          </option>)}
        </select>
      </Field>}
      <Field label={text('رصيد البداية (ج.م)', 'Opening cash (EGP)')} required error={error ? { message: error } : undefined}>
        <input className="input ltr" inputMode="decimal" autoComplete="off" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0" data-testid="opening-amount" />
      </Field>
      <Field label={text('ملاحظة', 'Note')} optional>
        <input className="input" maxLength={500} value={note} onChange={event => setNote(event.target.value)} />
      </Field>
      <div className="cash-open-actions">
        <Button type="submit" loading={open.isPending} disabled={Boolean(busy)} icon={<LockKeyOpenIcon size={18} weight="bold" aria-hidden="true" />}>{text('افتح الشيفت', 'Open shift')}</Button>
      </div>
    </form>
  </section>;
}

function ActiveShift({ drawer, shift, onClosed }: { drawer: MyCashDrawer; shift: CashShift; onClosed: (shift: CashShift) => void }) {
  const { text, number } = useLanguage();
  const money = useMoney();
  const when = useDateTime();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useWorkspace();
  const [movement, setMovement] = useState<ManualCashKind | null>(null);
  const detail = useQuery({ queryKey: cashKeys.shift(shift.id), queryFn: () => cashApi.shift(shift.id) });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: cashKeys.all });
  const status = useMutation({
    mutationFn: (to: 'CLOSING' | 'OPEN') => (to === 'CLOSING' ? cashApi.startClosing(shift.id) : cashApi.reopen(shift.id)),
    onSuccess: refresh,
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  const { summary } = shift;
  const open = shift.status === 'OPEN';
  return <>
    <section className="card cash-shift" aria-labelledby="cash-shift-title" data-testid="active-shift">
      <div className="cash-shift-head">
        <div>
          <h2 id="cash-shift-title">{text('الشيفت الحالي', 'Current shift')} <ShiftStatusBadge status={shift.status} /></h2>
          <p className="muted"><bdi>{shift.branchName}</bdi>{shift.register && <> · <bdi>{shift.register.name}</bdi></>} · {text('اتفتح', 'Opened')} {when(shift.openedAt)}</p>
        </div>
        <div className="cash-expected">
          <span>{text('المفروض في الدرج', 'Expected in drawer')}</span>
          <strong data-testid="expected-cash">{money(summary.expectedPiastres)}</strong>
        </div>
      </div>
      <dl className="cash-summary">
        <div><dt>{text('رصيد البداية', 'Opening balance')}</dt><dd>{money(summary.openingPiastres)}</dd></div>
        <div className="tone-success"><dt>{text('مبيعات كاش', 'Cash sales')} <small>({number(summary.cashSalesCount)})</small></dt><dd>+{money(summary.cashSalesPiastres)}</dd></div>
        <div className="tone-danger"><dt>{text('مرتجعات كاش', 'Cash refunds')} <small>({number(summary.cashRefundsCount)})</small></dt><dd>−{money(summary.cashRefundsPiastres)}</dd></div>
        <div className="tone-success"><dt>{text('إيداع', 'Cash in')}</dt><dd>+{money(summary.cashInPiastres)}</dd></div>
        <div className="tone-danger"><dt>{text('سحب', 'Cash out')}</dt><dd>−{money(summary.cashOutPiastres)}</dd></div>
        <div><dt>{text('تسويات', 'Adjustments')}</dt><dd className="ltr">{summary.adjustmentsPiastres > 0 ? '+' : ''}{money(summary.adjustmentsPiastres)}</dd></div>
      </dl>
      {summary.pendingAdjustmentsCount > 0 && <Alert kind="warning">
        {text(`فيه ${number(summary.pendingAdjustmentsCount)} تسوية مستنية موافقة المدير (${money(summary.pendingAdjustmentsPiastres)}) ومش محسوبة في المتوقع. لازم تتراجع قبل القفل.`,
          `${summary.pendingAdjustmentsCount} adjustment(s) await a manager (${money(summary.pendingAdjustmentsPiastres)}) and are not in the expected cash. They must be reviewed before closing.`)}
      </Alert>}
      {open && <div className="cash-actions">
        <Button variant="secondary" onClick={() => setMovement('CASH_IN')} icon={<ArrowCircleDownIcon size={18} aria-hidden="true" />}>{text('إيداع في الدرج', 'Cash in')}</Button>
        <Button variant="secondary" onClick={() => setMovement('CASH_OUT')} icon={<ArrowCircleUpIcon size={18} aria-hidden="true" />}>{text('سحب من الدرج', 'Cash out')}</Button>
        {(can('cash.adjust') || can('cash.approve')) && <Button variant="ghost" onClick={() => setMovement('ADJUSTMENT')} icon={<ScalesIcon size={18} aria-hidden="true" />}>{text('تسوية', 'Adjustment')}</Button>}
        <span className="att-actions-spacer" />
        <Button loading={status.isPending} onClick={() => status.mutate('CLOSING')} icon={<CalculatorIcon size={18} weight="bold" aria-hidden="true" />}>{text('ابدأ قفل الشيفت', 'Start closing')}</Button>
      </div>}
    </section>
    {shift.status === 'CLOSING' && <CloseForm drawer={drawer} shift={shift} onReopen={() => status.mutate('OPEN')} reopening={status.isPending} onClosed={onClosed} />}
    <section className="card list-card" aria-labelledby="cash-moves-title">
      <h2 id="cash-moves-title" className="card-title">{text('حركة الدرج', 'Drawer activity')}</h2>
      {detail.isError && <ErrorPanel error={detail.error} onRetry={() => void detail.refetch()} />}
      {detail.isPending && <Skeleton height={120} />}
      {detail.data && <TransactionsTable transactions={detail.data.transactions} />}
    </section>
    <MovementDialog shiftId={shift.id} kind={movement} onClose={() => setMovement(null)} />
  </>;
}

function CloseForm({ drawer, shift, onReopen, reopening, onClosed }: { drawer: MyCashDrawer; shift: CashShift; onReopen: () => void; reopening: boolean; onClosed: (shift: CashShift) => void }) {
  const { text } = useLanguage();
  const money = useMoney();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const countedPiastres = parseMoney(counted);
  const difference = countedPiastres === null ? null : countedPiastres - shift.summary.expectedPiastres;
  const noteNeeded = difference !== null && closingNoteRequired(drawer.settings.closingNote, difference);
  const needsReview = difference !== null && Math.abs(difference) > drawer.settings.discrepancyTolerancePiastres;
  const close = useMutation({
    mutationFn: () => cashApi.close(shift.id, { countedPiastres: countedPiastres!, note: note.trim() || null, version: shift.version }),
    onSuccess: saved => {
      onClosed(saved);
      void queryClient.invalidateQueries({ queryKey: cashKeys.all });
      toast.success(text('الشيفت اتقفل', 'Shift closed'));
    },
    onError: failure => {
      void queryClient.invalidateQueries({ queryKey: cashKeys.me });
      toast.error(errorMessage(failure, text));
    },
  });
  const blocked = shift.summary.pendingAdjustmentsCount > 0;
  return <section className="card cash-close" aria-labelledby="cash-close-title">
    <h2 id="cash-close-title" className="card-title"><LockKeyIcon size={20} weight="bold" aria-hidden="true" /> {text('قفل الشيفت', 'Close the shift')}</h2>
    <p className="muted">{text('الدرج واقف دلوقتي: مفيش كاش جديد بيتسجّل عليه. عدّ الفلوس اللي فيه واكتب المبلغ.', 'The drawer is frozen: no new cash is recorded on it. Count the cash in it and enter the total.')}</p>
    <form className="cash-close-form" onSubmit={event => { event.preventDefault(); if (countedPiastres !== null && (!noteNeeded || note.trim())) close.mutate(); }}>
      <Field label={text('المبلغ اللي اتعدّ (ج.م)', 'Counted cash (EGP)')} required
        error={counted && countedPiastres === null ? { message: text('اكتب المبلغ بالجنيه', 'Enter the amount in pounds') } : undefined}>
        <input className="input ltr cash-count-input" inputMode="decimal" autoComplete="off" value={counted} onChange={event => setCounted(event.target.value)} data-testid="counted-amount" autoFocus />
      </Field>
      <div className="cash-compare" aria-live="polite">
        <div><span>{text('المتوقع', 'Expected')}</span><strong>{money(shift.summary.expectedPiastres)}</strong></div>
        <div><span>{text('المعدود', 'Counted')}</span><strong>{money(countedPiastres)}</strong></div>
        <div><span>{text('الفرق', 'Difference')}</span><Discrepancy piastres={difference} /></div>
      </div>
      {needsReview && <Alert kind="warning">{text('الفرق أكبر من المسموح، فالشيفت هيستنى مراجعة المدير بعد القفل.', 'The difference is beyond the tolerance, so a manager will review the shift after it closes.')}</Alert>}
      <Field label={text('ملاحظة القفل', 'Closing note')} optional={!noteNeeded} required={noteNeeded}
        hint={noteNeeded ? text('مطلوب توضيح للفرق.', 'Explain the difference.') : undefined}>
        <textarea className="textarea" rows={2} maxLength={500} value={note} onChange={event => setNote(event.target.value)} required={noteNeeded} />
      </Field>
      {blocked && <Alert kind="warning">{text('مينفعش تقفل والتسويات مستنية موافقة.', 'You cannot close while adjustments await approval.')}</Alert>}
      <div className="cash-actions">
        <Button variant="secondary" loading={reopening} onClick={onReopen}>{text('رجوع للشيفت', 'Back to the shift')}</Button>
        <span className="att-actions-spacer" />
        <Button type="submit" loading={close.isPending} disabled={countedPiastres === null || (noteNeeded && !note.trim()) || blocked} icon={<LockKeyIcon size={18} weight="bold" aria-hidden="true" />}>
          {text('اقفل الشيفت', 'Close shift')}
        </Button>
      </div>
    </form>
  </section>;
}

function ClosedSummary({ shift, onDismiss }: { shift: CashShift; onDismiss: () => void }) {
  const { text } = useLanguage();
  const money = useMoney();
  return <section className="card cash-closed" aria-labelledby="cash-closed-title" data-testid="closed-summary">
    <div className="cash-shift-head">
      <h2 id="cash-closed-title">{text('تقرير قفل الشيفت', 'Closing report')} <ReviewBadge status={shift.reviewStatus} /></h2>
      <Button small variant="ghost" onClick={onDismiss}>{text('تمام', 'Done')}</Button>
    </div>
    <div className="cash-compare">
      <div><span>{text('المتوقع', 'Expected')}</span><strong>{money(shift.expectedPiastres)}</strong></div>
      <div><span>{text('المعدود', 'Counted')}</span><strong>{money(shift.countedPiastres)}</strong></div>
      <div><span>{text('الفرق', 'Difference')}</span><Discrepancy piastres={shift.discrepancyPiastres} /></div>
    </div>
  </section>;
}

const MOVEMENT_TEXT: Record<ManualCashKind, { title: [string, string]; hint: [string, string]; reason: [string, string] }> = {
  CASH_IN: { title: ['إيداع في الدرج', 'Cash in'], hint: ['فلوس اتحطت في الدرج (فكة، تغذية).', 'Money put into the drawer (change, a float top-up).'], reason: ['السبب', 'Reason'] },
  CASH_OUT: { title: ['سحب من الدرج', 'Cash out'], hint: ['فلوس اتاخدت من الدرج (مورد، مصروف، توريد للخزنة).', 'Money taken out (a supplier, an expense, a safe drop).'], reason: ['السبب', 'Reason'] },
  ADJUSTMENT: {
    title: ['تسوية الدرج', 'Adjust the drawer'],
    hint: ['للتصحيح بس. اكتب المبلغ بالسالب لو هيقلّل الدرج (مثلاً ‎-20). ممكن تحتاج موافقة مدير.', 'For fixes only. Use a minus to reduce the drawer (e.g. -20). May need a manager’s approval.'],
    reason: ['السبب (إجباري)', 'Reason (required)'],
  },
};

function MovementDialog({ shiftId, kind, onClose }: { shiftId: string; kind: ManualCashKind | null; onClose: () => void }) {
  const { text } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const signed = kind === 'ADJUSTMENT';
  const parsed = parseMoney(amount, signed);
  const valid = parsed !== null && parsed !== 0 && (signed || parsed > 0) && reason.trim().length >= 3;
  const reset = () => { setAmount(''); setReason(''); onClose(); };
  const save = useMutation({
    mutationFn: () => cashApi.addTransaction(shiftId, { kind: kind!, amountPiastres: parsed!, reason: reason.trim() }),
    onSuccess: detail => {
      queryClient.setQueryData(cashKeys.shift(shiftId), detail);
      void queryClient.invalidateQueries({ queryKey: cashKeys.all });
      const pending = detail.transactions[0]?.approvalStatus === 'PENDING';
      toast.success(pending ? text('اتسجلت ومستنية موافقة المدير', 'Recorded; awaiting a manager’s approval') : text('اتسجلت', 'Recorded'));
      reset();
    },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  const copy = kind ? MOVEMENT_TEXT[kind] : null;
  return <Dialog open={kind !== null} onClose={reset} busy={save.isPending} size="small" title={copy ? text(...copy.title) : ''}
    onSubmit={() => valid && save.mutate()}
    footer={<>
      <Button variant="secondary" onClick={reset} disabled={save.isPending}>{text('إلغاء', 'Cancel')}</Button>
      <Button type="submit" loading={save.isPending} disabled={!valid}>{text('سجّل', 'Record')}</Button>
    </>}>
    {copy && <div className="form-stack">
      <p className="muted">{text(...copy.hint)}</p>
      <Field label={text('المبلغ (ج.م)', 'Amount (EGP)')} required>
        <input className="input ltr" inputMode={signed ? 'text' : 'decimal'} autoComplete="off" value={amount} onChange={event => setAmount(event.target.value)} data-autofocus data-testid="movement-amount" />
      </Field>
      <Field label={text(...copy.reason)} required hint={text('٣ حروف على الأقل', 'At least 3 characters')}>
        <input className="input" maxLength={300} value={reason} onChange={event => setReason(event.target.value)} data-testid="movement-reason" />
      </Field>
    </div>}
  </Dialog>;
}
