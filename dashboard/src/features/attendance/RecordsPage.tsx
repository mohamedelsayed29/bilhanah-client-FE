import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DownloadSimpleIcon, FileXlsIcon, ListChecksIcon, PencilSimpleIcon, PlusIcon, PrinterIcon } from '@phosphor-icons/react';
import { ATTENDANCE_METHOD_LABELS, ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUSES, type AttendanceRecord, type ManualAttendanceResult } from '@bilhanah/contracts';
import { Alert } from '../../components/Alert';
import { CompactMeta } from '../../components/CompactMeta';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Field } from '../../components/Field';
import { Pagination } from '../../components/Pagination';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { attendanceApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { formatDate } from '../../lib/format';
import { useLanguage, usePageTitle } from '../../lib/language';
import { useBranchScope } from '../branches/BranchScope';
import { useWorkspace } from '../branches/workspace';
import { addDays, attendanceKeys, isoDay, MethodLabel, StatusBadge, useClock, useDuration, useEmployeesQuery } from './shared';

/** "2026-11-04T09:05" for a datetime-local input, in this device's time. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const date = new Date(iso);
  return `${isoDay(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);

/** Saves a CSV or Excel file the API built. */
export async function saveExport(params: Parameters<typeof attendanceApi.exportFile>[0]) {
  const blob = await attendanceApi.exportFile(params);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `attendance-${params.report}-${params.from}-${params.to}.${params.format}`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Every session in a range, filtered, with edits (always with a reason, kept in the audit log) and exports. */
export function AttendanceRecordsPage() {
  const { text, language } = useLanguage();
  usePageTitle('سجلات الحضور', 'Attendance records');
  const { can } = useWorkspace();
  const toast = useToast();
  const scope = useBranchScope();
  const branchId = scope.selected === 'all' ? null : scope.selected;
  const [from, setFrom] = useState(() => addDays(isoDay(), -6));
  const [to, setTo] = useState(isoDay);
  const [employeeId, setEmployeeId] = useState('');
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AttendanceRecord | 'new' | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  useEffect(() => setPage(1), [from, to, employeeId, status, method, branchId]);
  const filters = { from, to, branchId, employeeId: employeeId || null, status: status || null, method: method || null, page, pageSize: 50 };
  const records = useQuery({ queryKey: attendanceKeys.records(filters), queryFn: () => attendanceApi.records(filters) });
  const employees = useEmployeesQuery();
  const clock = useClock();
  const duration = useDuration();

  const download = async (format: 'csv' | 'xls') => {
    setExporting(format);
    try { await saveExport({ ...filters, format, report: 'records', lang: language === 'ar' ? 'ar' : 'en' }); }
    catch (error) { toast.error(errorMessage(error, text)); }
    finally { setExporting(null); }
  };

  return <>
    <div className="att-filters" role="group" aria-label={text('الفلترة', 'Filters')}>
      <Field label={text('من', 'From')}><input className="input" type="date" value={from} max={to} onChange={event => event.target.value && setFrom(event.target.value)} /></Field>
      <Field label={text('لحد', 'To')}><input className="input" type="date" value={to} min={from} max={isoDay()} onChange={event => event.target.value && setTo(event.target.value)} /></Field>
      <Field label={text('الموظف', 'Employee')}>
        <select className="select" value={employeeId} onChange={event => setEmployeeId(event.target.value)}>
          <option value="">{text('كل الموظفين', 'All employees')}</option>
          {employees.data?.map(employee => <option key={employee.id} value={employee.id}>{employee.fullName} · #{employee.employeeNumber}</option>)}
        </select>
      </Field>
      <Field label={text('الحالة', 'Status')}>
        <select className="select" value={status} onChange={event => setStatus(event.target.value)}>
          <option value="">{text('كل الحالات', 'Any status')}</option>
          {ATTENDANCE_STATUSES.filter(value => value !== 'ABSENT' && value !== 'ON_LEAVE').map(value => <option key={value} value={value}>{text(...ATTENDANCE_STATUS_LABELS[value])}</option>)}
        </select>
      </Field>
      <Field label={text('الطريقة', 'Method')}>
        <select className="select" value={method} onChange={event => setMethod(event.target.value)}>
          <option value="">{text('كل الطرق', 'Any method')}</option>
          {(['PORTAL', 'QR', 'KIOSK', 'MANUAL'] as const).map(value => <option key={value} value={value}>{text(...ATTENDANCE_METHOD_LABELS[value])}</option>)}
        </select>
      </Field>
    </div>
    <div className="att-actions">
      {can('attendance.manage') && <Button small onClick={() => setEditing('new')} icon={<PlusIcon size={16} weight="bold" aria-hidden="true" />}>{text('سجّل حضور يدوي', 'Add attendance')}</Button>}
      <span className="att-actions-spacer" />
      <Button small variant="secondary" loading={exporting === 'csv'} onClick={() => void download('csv')} icon={<DownloadSimpleIcon size={16} aria-hidden="true" />}>CSV</Button>
      <Button small variant="secondary" loading={exporting === 'xls'} onClick={() => void download('xls')} icon={<FileXlsIcon size={16} aria-hidden="true" />}>Excel</Button>
      <Button small variant="ghost" onClick={() => window.print()} icon={<PrinterIcon size={16} aria-hidden="true" />}>{text('اطبع / PDF', 'Print / PDF')}</Button>
    </div>

    <section className="card list-card att-print" aria-labelledby="att-records-title" aria-busy={records.isFetching}>
      <h2 id="att-records-title" className="visually-hidden">{text('السجلات', 'Records')}</h2>
      {records.isError && <ErrorPanel error={records.error} onRetry={() => void records.refetch()} />}
      {records.isPending && <div className="table-skeleton">{[0, 1, 2, 3].map(index => <Skeleton key={index} height={52} />)}</div>}
      {records.data?.items.length === 0 && <div className="empty-state">
        <span className="empty-state-icon" aria-hidden="true"><ListChecksIcon size={30} /></span>
        <h2>{text('مفيش سجلات في الفترة دي', 'No records in this period')}</h2>
        <p>{text('غيّر التواريخ أو الفلاتر.', 'Change the dates or filters.')}</p>
      </div>}
      {records.data && records.data.items.length > 0 && <div className="table-scroll"><table className="data-table att-table">
        <thead><tr>
          <th scope="col">{text('الموظف', 'Employee')}</th>
          <th scope="col">{text('اليوم', 'Day')}</th>
          <th scope="col">{text('الشيفت', 'Shift')}</th>
          <th scope="col">{text('حضور', 'In')}</th>
          <th scope="col">{text('انصراف', 'Out')}</th>
          <th scope="col">{text('ساعات', 'Hours')}</th>
          <th scope="col">{text('الطريقة', 'Method')}</th>
          <th scope="col">{text('الحالة', 'Status')}</th>
          {can('attendance.manage') && <th scope="col"><span className="visually-hidden">{text('إجراءات', 'Actions')}</span></th>}
        </tr></thead>
        <tbody>{records.data.items.map(record => <tr key={record.id} data-testid="record-row">
          <td className="cell-primary" data-label={text('الموظف', 'Employee')}><bdi>{record.employee.fullName}</bdi><small><span className="ltr">#{record.employee.employeeNumber}</span>{branchId ? '' : ` · ${record.branchName}`}</small></td>
          <td data-label={text('اليوم', 'Day')} className="cell-nowrap">{formatDate(`${record.day}T12:00:00`, language, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
          <td data-label={text('الشيفت', 'Shift')} className="cell-nowrap">{record.shift ? `${clock(record.shift.startsAt)} – ${clock(record.shift.endsAt)}` : '—'}</td>
          <td data-label={text('حضور', 'In')} className="cell-nowrap">{clock(record.checkInAt)}{record.lateMinutes > 0 && <small className="att-late">+{duration(record.lateMinutes)}</small>}</td>
          <td data-label={text('انصراف', 'Out')} className="cell-nowrap">{clock(record.checkOutAt)}{record.overtimeMinutes > 0 && <small className="att-extra">+{duration(record.overtimeMinutes)}</small>}</td>
          <td data-label={text('ساعات', 'Hours')} className="cell-nowrap">{record.checkOutAt ? duration(record.workedMinutes) : '—'}</td>
          <td data-label={text('الطريقة', 'Method')}><MethodLabel method={record.checkInMethod} />{record.kioskName && <small><bdi>{record.kioskName}</bdi></small>}{record.flagged && <small className="att-flag">{text('خارج الموقع', 'Away from branch')}</small>}{record.managerNote && <small><bdi>{record.managerNote}</bdi></small>}</td>
          <td data-label={text('الحالة', 'Status')} className="cell-end"><StatusBadge status={record.status} /></td>
          <CompactMeta parts={[formatDate(`${record.day}T12:00:00`, language, { weekday: 'short', day: 'numeric', month: 'short' }), `${clock(record.checkInAt)} → ${clock(record.checkOutAt)}`, record.checkOutAt ? duration(record.workedMinutes) : null]} />
          {can('attendance.manage') && <td className="cell-action-inline"><Button small variant="ghost" onClick={() => setEditing(record)} icon={<PencilSimpleIcon size={15} aria-hidden="true" />}>{text('تعديل', 'Edit')}</Button></td>}
        </tr>)}</tbody>
      </table></div>}
    </section>
    {records.data && <Pagination page={page} pageSize={records.data.pageSize} total={records.data.total} onChange={setPage} label={text('صفحات السجلات', 'Record pages')} />}
    <RecordDialog record={editing} onClose={() => setEditing(null)} />
  </>;
}

/** Add a session by hand, or change one's times or note; both need a reason. */
function RecordDialog({ record, onClose }: { record: AttendanceRecord | 'new' | null; onClose: () => void }) {
  const { text } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const employees = useEmployeesQuery(record !== null);
  const [employeeId, setEmployeeId] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (!record) return;
    setEmployeeId(record === 'new' ? '' : record.employee.id);
    setCheckIn(record === 'new' ? '' : toLocalInput(record.checkInAt));
    setCheckOut(record === 'new' ? '' : toLocalInput(record.checkOutAt));
    setNote(record === 'new' ? '' : record.managerNote ?? '');
    setReason('');
  }, [record]);
  const save = useMutation({
    mutationFn: (): Promise<ManualAttendanceResult> => (record === 'new'
      ? attendanceApi.manual({ employeeId, checkInAt: fromLocalInput(checkIn)!, checkOutAt: fromLocalInput(checkOut), reason })
      : attendanceApi.updateRecord(record!.id, { checkInAt: fromLocalInput(checkIn)!, checkOutAt: fromLocalInput(checkOut), managerNote: note.trim() || null, reason })),
    onSuccess: result => {
      void queryClient.invalidateQueries({ queryKey: attendanceKeys.all });
      toast.success(result.pendingCorrection ? text('اتبعت للموافقة', 'Sent for approval') : text('اتحفظ واتسجّل في سجل المراجعة', 'Saved and recorded in the audit log'));
      onClose();
    },
  });
  const valid = (record !== 'new' || employeeId) && checkIn && reason.trim().length >= 3 && (!checkOut || checkOut > checkIn);
  return <Dialog open={record !== null} onClose={onClose} busy={save.isPending} onSubmit={() => { if (valid) save.mutate(); }}
    title={record === 'new' ? text('تسجيل حضور يدوي', 'Add attendance') : text(`تعديل حضور ${record?.employee.fullName ?? ''}`, `Edit ${record?.employee.fullName ?? ''}'s attendance`)}
    footer={<>
      <Button variant="secondary" onClick={onClose} disabled={save.isPending}>{text('إلغاء', 'Cancel')}</Button>
      <Button type="submit" loading={save.isPending} disabled={!valid}>{text('احفظ', 'Save')}</Button>
    </>}>
    <div className="form">
      {save.isError && <Alert kind="error">{errorMessage(save.error, text)}</Alert>}
      {record === 'new' && <Field label={text('الموظف', 'Employee')} required>
        <select className="select" value={employeeId} onChange={event => setEmployeeId(event.target.value)} data-autofocus>
          <option value="">{text('اختار', 'Choose')}</option>
          {employees.data?.filter(employee => employee.isActive).map(employee => <option key={employee.id} value={employee.id}>{employee.fullName} · #{employee.employeeNumber}</option>)}
        </select>
      </Field>}
      <div className="form-grid">
        <Field label={text('الحضور', 'Check-in')} required><input className="input" type="datetime-local" value={checkIn} onChange={event => setCheckIn(event.target.value)} /></Field>
        <Field label={text('الانصراف', 'Check-out')} hint={text('سيبه فاضي لو لسه شغال.', 'Leave empty while still working.')}><input className="input" type="datetime-local" value={checkOut} min={checkIn} onChange={event => setCheckOut(event.target.value)} /></Field>
      </div>
      {record !== 'new' && <Field label={text('ملاحظة المدير', 'Manager note')}><input className="input" maxLength={300} value={note} onChange={event => setNote(event.target.value)} /></Field>}
      <Field label={text('السبب', 'Reason')} required hint={text('بيتسجّل في سجل المراجعة مع القيم القديمة والجديدة.', 'Recorded in the audit log with the old and new values.')}>
        <input className="input" maxLength={300} value={reason} onChange={event => setReason(event.target.value)} placeholder={text('مثلًا: نسي يسجّل انصراف', 'e.g. Forgot to check out')} />
      </Field>
    </div>
  </Dialog>;
}
