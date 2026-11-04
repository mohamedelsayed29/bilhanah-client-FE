import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircleIcon, ClockIcon, KeyIcon, MapPinIcon, QrCodeIcon, SignInIcon, SignOutIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { ATTENDANCE_ERROR_CODES, type AttendanceRecord, type MyAttendance, type PunchResult } from '@bilhanah/contracts';
import { Alert } from '../../components/Alert';
import { CompactMeta } from '../../components/CompactMeta';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Field } from '../../components/Field';
import { PageHeader } from '../../components/PageHeader';
import { PageSkeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { isApiError } from '../../lib/api';
import { attendanceApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { formatDate } from '../../lib/format';
import { useLanguage, usePageTitle } from '../../lib/language';
import { useWorkspace } from '../branches/workspace';
import { attendanceKeys, StatusBadge, useClock, useDuration } from './shared';

type Location = { latitude: number; longitude: number; accuracy?: number } | null;

/** The device's position, when the branch checks it (null when refused or unavailable: the server decides). */
function currentLocation(): Promise<Location> {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      position => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: Math.round(position.coords.accuracy) }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  });
}

function notEmployee(error: unknown) {
  return isApiError(error, ATTENDANCE_ERROR_CODES.NOT_AN_EMPLOYEE);
}

/** The signed-in employee: check in or out, today's and coming shifts, history, corrections and the kiosk PIN. */
export function MyAttendancePage() {
  const { text, language } = useLanguage();
  usePageTitle('حضوري', 'My attendance');
  const toast = useToast();
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: attendanceKeys.me, queryFn: attendanceApi.me, refetchInterval: 60_000 });
  const clock = useClock();
  const duration = useDuration();
  const [now, setNow] = useState(Date.now());
  const [correcting, setCorrecting] = useState<AttendanceRecord | 'new' | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  const punch = useMutation({
    mutationFn: async (action: 'CHECK_IN' | 'CHECK_OUT') => attendanceApi.punch({ action, idempotencyKey: crypto.randomUUID(), location: me.data?.locationRequired ? await currentLocation() : null }),
    onSuccess: result => {
      void queryClient.invalidateQueries({ queryKey: attendanceKeys.me });
      toast.success(result.action === 'CHECK_IN' ? text(`اتسجّل حضورك ${clock(result.at)}`, `Checked in at ${clock(result.at)}`) : text(`اتسجّل انصرافك ${clock(result.at)}`, `Checked out at ${clock(result.at)}`));
      if (result.flagged) toast.error(text('موقعك برّه الفرع، فالتسجيل اتعلّم للمراجعة.', 'You are away from the branch, so this was flagged for review.'));
    },
    onError: error => toast.error(errorMessage(error, text)),
  });

  if (me.isPending) return <PageSkeleton blocks={3} />;
  if (me.isError) {
    if (notEmployee(me.error)) return <div className="page"><PageHeader title={text('حضوري', 'My attendance')} />
      <div className="empty-state card"><span className="empty-state-icon" aria-hidden="true"><ClockIcon size={30} /></span>
        <h2>{text('حسابك مش متسجّل في الحضور', 'Your account is not set up for attendance')}</h2>
        <p>{text('اطلب من صاحب المطعم أو المدير يضيفك كموظف ويربطه بحسابك.', 'Ask the owner or a manager to add you as an employee linked to this account.')}</p></div></div>;
    return <div className="page"><ErrorPanel error={me.error} onRetry={() => void me.refetch()} /></div>;
  }
  const data: MyAttendance = me.data;
  const portal = data.methods.includes('PORTAL');
  const shift = data.todayShifts.find(entry => !entry.isLeave);
  const workingFor = data.open ? Math.max(0, Math.round((now - Date.parse(data.open.checkInAt)) / 60_000)) : 0;
  return <div className="page my-attendance">
    <PageHeader title={text('حضوري', 'My attendance')} description={<><bdi>{data.employee.fullName}</bdi> · <span className="ltr">#{data.employee.employeeNumber}</span> · <bdi>{data.employee.branchName}</bdi></>} />
    {data.employee.hasPin && data.employee.pinMustChange && <Alert kind="warning" actions={<Button small variant="secondary" onClick={() => setPinOpen(true)}>{text('غيّره', 'Change it')}</Button>}>
      {text('الـ PIN بتاعك اتعمله reset. غيّره قبل ما تستخدم الكشك.', 'Your PIN was reset. Change it before using the kiosk.')}</Alert>}

    <section className={`punch-card ${data.open ? 'is-in' : ''}`} aria-labelledby="punch-title" data-testid="punch-card">
      <div className="punch-state">
        <span className="punch-icon" aria-hidden="true">{data.open ? <CheckCircleIcon size={30} weight="fill" /> : <ClockIcon size={30} weight="bold" />}</span>
        <div>
          <h2 id="punch-title">{data.open ? text(`حاضر من ${clock(data.open.checkInAt)}`, `In since ${clock(data.open.checkInAt)}`) : text('مسجّلتش حضور لسه', 'Not checked in')}</h2>
          <p>{data.open ? text(`بقالك ${duration(workingFor)}`, `Working for ${duration(workingFor)}`)
            : shift ? text(`شيفتك النهارده ${clock(shift.startsAt)} – ${clock(shift.endsAt)}`, `Today’s shift: ${clock(shift.startsAt)} – ${clock(shift.endsAt)}`)
              : data.todayShifts.some(entry => entry.isLeave) ? text('النهارده إجازة', 'You are on leave today') : text('مفيش شيفت النهارده', 'No shift today')}</p>
        </div>
      </div>
      {portal
        ? <Button className="punch-button" loading={punch.isPending} onClick={() => punch.mutate(data.open ? 'CHECK_OUT' : 'CHECK_IN')}
          icon={data.open ? <SignOutIcon size={20} weight="bold" aria-hidden="true" /> : <SignInIcon size={20} weight="bold" aria-hidden="true" />} data-testid="punch-button">
          {data.open ? text('سجّل انصراف', 'Check out') : text('سجّل حضور', 'Check in')}</Button>
        : <p className="punch-hint">{data.methods.includes('QR') ? <><QrCodeIcon size={18} aria-hidden="true" />{text('امسح كود الحضور في الفرع بكاميرا موبايلك.', 'Scan the attendance code at the branch with your phone camera.')}</>
          : text('سجّل حضورك من الكشك في الفرع.', 'Check in at the branch kiosk.')}</p>}
      {data.locationRequired && portal && <p className="punch-hint"><MapPinIcon size={16} aria-hidden="true" />{text('هنطلب موقعك عشان نتأكد إنك في الفرع.', 'We will ask for your location to confirm you are at the branch.')}</p>}
    </section>

    {data.upcomingShifts.length > 0 && <section className="section" aria-labelledby="upcoming-title">
      <div className="section-head"><div><h2 id="upcoming-title">{text('شيفتاتك الجاية', 'Your coming shifts')}</h2></div></div>
      <ul className="shift-list">{data.upcomingShifts.map(entry => <li key={entry.id}>
        <strong>{formatDate(`${entry.day}T12:00:00`, language, { weekday: 'long', day: 'numeric', month: 'short' })}</strong>
        <span>{entry.isLeave ? text('إجازة', 'Leave') : `${clock(entry.startsAt)} – ${clock(entry.endsAt)}`}</span>
      </li>)}</ul>
    </section>}

    <section className="section" aria-labelledby="history-title">
      <div className="section-head"><div><h2 id="history-title">{text('سجل حضوري', 'My history')}</h2></div>
        <div className="page-actions">
          {data.correctionsEnabled && <Button small variant="secondary" onClick={() => setCorrecting('new')}>{text('اطلب تصحيح', 'Request a correction')}</Button>}
          {data.employee.hasPin && <Button small variant="ghost" onClick={() => setPinOpen(true)} icon={<KeyIcon size={15} aria-hidden="true" />}>{text('غيّر الـ PIN', 'Change PIN')}</Button>}
        </div>
      </div>
      {data.recent.length === 0 ? <p className="board-empty">{text('لسه مفيش سجلات.', 'No records yet.')}</p>
        : <div className="table-scroll"><table className="data-table att-table">
          <thead><tr><th scope="col">{text('اليوم', 'Day')}</th><th scope="col">{text('حضور', 'In')}</th><th scope="col">{text('انصراف', 'Out')}</th><th scope="col">{text('ساعات', 'Hours')}</th><th scope="col">{text('الحالة', 'Status')}</th>{data.correctionsEnabled && <th scope="col"><span className="visually-hidden">{text('تصحيح', 'Correct')}</span></th>}</tr></thead>
          <tbody>{data.recent.map(record => <tr key={record.id}>
            <td className="cell-primary" data-label={text('اليوم', 'Day')}>{formatDate(`${record.day}T12:00:00`, language, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
            <td data-label={text('حضور', 'In')}>{clock(record.checkInAt)}</td>
            <td data-label={text('انصراف', 'Out')}>{clock(record.checkOutAt)}</td>
            <td data-label={text('ساعات', 'Hours')}>{record.checkOutAt ? duration(record.workedMinutes) : '—'}</td>
            <td data-label={text('الحالة', 'Status')} className="cell-end"><StatusBadge status={record.status} /></td>
            <CompactMeta parts={[`${clock(record.checkInAt)} → ${clock(record.checkOutAt)}`, record.checkOutAt ? duration(record.workedMinutes) : null]} />
            {data.correctionsEnabled && <td className="cell-action-inline">{record.status !== 'PENDING_CORRECTION' && <Button small variant="ghost" onClick={() => setCorrecting(record)}>{text('صحّح', 'Correct')}</Button>}</td>}
          </tr>)}</tbody>
        </table></div>}
    </section>
    <MyCorrections />
    <CorrectionDialog record={correcting} onClose={() => setCorrecting(null)} />
    <PinDialog open={pinOpen} onClose={() => setPinOpen(false)} />
  </div>;
}

function MyCorrections() {
  const { text, language } = useLanguage();
  const corrections = useQuery({ queryKey: attendanceKeys.myCorrections, queryFn: attendanceApi.myCorrections });
  if (!corrections.data?.length) return null;
  const tone = { PENDING: 'guava', APPROVED: 'success', REJECTED: 'danger' } as const;
  const label = { PENDING: text('مستني', 'Pending'), APPROVED: text('اتوافق', 'Approved'), REJECTED: text('اترفض', 'Rejected') };
  return <section className="section" aria-labelledby="my-corr-title">
    <div className="section-head"><div><h2 id="my-corr-title">{text('طلبات التصحيح', 'My correction requests')}</h2></div></div>
    <ul className="shift-list">{corrections.data.map(item => <li key={item.id}>
      <strong>{formatDate(`${item.day}T12:00:00`, language, { weekday: 'short', day: 'numeric', month: 'short' })}</strong>
      <span><bdi>{item.reason}</bdi>{item.reviewNote ? ` — ${item.reviewNote}` : ''}</span>
      <span className={`badge att-badge tone-${tone[item.status]}`}>{label[item.status]}</span>
    </li>)}</ul>
  </section>;
}

const localInput = (iso: string | null) => {
  if (!iso) return '';
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

function CorrectionDialog({ record, onClose }: { record: AttendanceRecord | 'new' | null; onClose: () => void }) {
  const { text } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (!record) return;
    setCheckIn(record === 'new' ? '' : localInput(record.checkInAt));
    setCheckOut(record === 'new' ? '' : localInput(record.checkOutAt));
    setReason('');
  }, [record]);
  const send = useMutation({
    mutationFn: () => attendanceApi.requestCorrection({
      day: (checkIn || checkOut).slice(0, 10), recordId: record === 'new' ? null : record!.id,
      requestedCheckIn: checkIn ? new Date(checkIn).toISOString() : null, requestedCheckOut: checkOut ? new Date(checkOut).toISOString() : null, reason: reason.trim(),
    }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: attendanceKeys.me }); void queryClient.invalidateQueries({ queryKey: attendanceKeys.myCorrections }); toast.success(text('اتبعت الطلب للمدير', 'Request sent to your manager')); onClose(); },
  });
  const valid = (checkIn || checkOut) && reason.trim().length >= 3 && (!checkIn || !checkOut || checkOut > checkIn);
  return <Dialog open={record !== null} onClose={onClose} busy={send.isPending} onSubmit={() => { if (valid) send.mutate(); }} title={text('طلب تصحيح', 'Correction request')}
    footer={<><Button variant="secondary" onClick={onClose}>{text('إلغاء', 'Cancel')}</Button><Button type="submit" loading={send.isPending} disabled={!valid}>{text('ابعت الطلب', 'Send request')}</Button></>}>
    <div className="form">
      {send.isError && <Alert kind="error">{errorMessage(send.error, text)}</Alert>}
      <p className="field-hint">{record === 'new' ? text('نسيت تسجّل حضور خالص؟ اكتب الوقت الصح.', 'Forgot to check in at all? Give the right times.') : text('عدّل الوقت اللي غلط.', 'Fix the wrong time.')}</p>
      <div className="form-grid">
        <Field label={text('الحضور', 'Check-in')}><input className="input" type="datetime-local" value={checkIn} onChange={event => setCheckIn(event.target.value)} data-autofocus /></Field>
        <Field label={text('الانصراف', 'Check-out')}><input className="input" type="datetime-local" value={checkOut} min={checkIn} onChange={event => setCheckOut(event.target.value)} /></Field>
      </div>
      <Field label={text('السبب', 'Reason')} required><input className="input" maxLength={300} value={reason} onChange={event => setReason(event.target.value)} placeholder={text('مثلًا: الموبايل كان فاصل شحن', 'e.g. My phone was out of battery')} /></Field>
    </div>
  </Dialog>;
}

function PinDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { text } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  useEffect(() => { if (open) { setPin(''); setConfirm(''); } }, [open]);
  const save = useMutation({
    mutationFn: () => attendanceApi.changePin(pin),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: attendanceKeys.me }); toast.success(text('اتغيّر الـ PIN', 'PIN changed')); onClose(); },
  });
  const valid = /^\d{4,6}$/.test(pin) && pin === confirm;
  return <Dialog open={open} onClose={onClose} size="small" busy={save.isPending} onSubmit={() => { if (valid) save.mutate(); }} title={text('PIN جديد للكشك', 'New kiosk PIN')}
    footer={<><Button variant="secondary" onClick={onClose}>{text('إلغاء', 'Cancel')}</Button><Button type="submit" loading={save.isPending} disabled={!valid}>{text('احفظ', 'Save')}</Button></>}>
    <div className="form">
      {save.isError && <Alert kind="error">{errorMessage(save.error, text)}</Alert>}
      <Field label={text('الـ PIN (٤ لـ ٦ أرقام)', 'PIN (4 to 6 digits)')} required><input className="input ltr-input" dir="ltr" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, ''))} data-autofocus /></Field>
      <Field label={text('اكتبه تاني', 'Confirm')} required error={confirm && confirm !== pin ? { message: text('مش متطابقين.', 'They do not match.') } : undefined}><input className="input ltr-input" dir="ltr" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={confirm} onChange={event => setConfirm(event.target.value.replace(/\D/g, ''))} /></Field>
    </div>
  </Dialog>;
}

/** The page a branch QR code opens: checks the employee in or out at once, then says so. */
export function AttendanceScanPage() {
  const { text } = useLanguage();
  usePageTitle('تسجيل الحضور', 'Check in');
  const { to } = useWorkspace();
  const [params] = useSearchParams();
  const code = params.get('c') ?? '';
  const [result, setResult] = useState<PunchResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const started = useRef(false);
  const clock = useClock();
  useEffect(() => {
    if (started.current || !code) return;
    started.current = true;
    void (async () => {
      try {
        const me = await attendanceApi.me();
        const location = me.locationRequired ? await currentLocation() : null;
        setResult(await attendanceApi.scan({ code, idempotencyKey: crypto.randomUUID(), location }));
      } catch (caught) { setError(caught); }
    })();
  }, [code]);
  return <div className="page scan-page">
    <div className={`scan-result ${result ? 'is-ok' : error ? 'is-error' : ''}`} role="status" data-testid="scan-result">
      {!code ? <><WarningCircleIcon size={48} weight="fill" aria-hidden="true" /><h1>{text('الكود ناقص', 'The code is missing')}</h1></>
        : result ? <>
          <CheckCircleIcon size={56} weight="fill" aria-hidden="true" />
          <h1>{result.action === 'CHECK_IN' ? text('اتسجّل حضورك', 'You are checked in') : text('اتسجّل انصرافك', 'You are checked out')}</h1>
          <p className="scan-time">{clock(result.at)}</p>
          {result.flagged && <Alert kind="warning" live={false}>{text('موقعك برّه الفرع، فالتسجيل اتعلّم للمراجعة.', 'You are away from the branch, so this was flagged for review.')}</Alert>}
        </>
          : error ? <>
            <WarningCircleIcon size={56} weight="fill" aria-hidden="true" />
            <h1>{text('ما اتسجّلش', 'Not recorded')}</h1>
            <p>{errorMessage(error, text)}</p>
          </> : <><span className="spinner" aria-hidden="true" /><h1>{text('بنسجّل…', 'Recording…')}</h1></>}
      <Link className="button button-secondary" to={to('/my-attendance')}>{text('صفحة حضوري', 'My attendance')}</Link>
    </div>
  </div>;
}
