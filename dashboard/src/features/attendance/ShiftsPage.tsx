import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CaretLeftIcon, CaretRightIcon, PlusIcon, XIcon } from '@phosphor-icons/react';
import type { Shift } from '@bilhanah/contracts';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Field } from '../../components/Field';
import { Skeleton } from '../../components/Skeleton';
import { Switch } from '../../components/Switch';
import { useToast } from '../../components/Toast';
import { attendanceApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { formatDate } from '../../lib/format';
import { useLanguage, usePageTitle } from '../../lib/language';
import { useBranchScope } from '../branches/BranchScope';
import { useWorkspace } from '../branches/workspace';
import { addDays, attendanceKeys, isoDay, useClock, useEmployeesQuery } from './shared';

/** The Saturday that starts the week of `day` (the Egyptian working week). */
const weekStart = (day: string) => {
  const date = new Date(`${day}T12:00:00`);
  return addDays(day, -((date.getDay() + 1) % 7));
};

/** A week of shifts, employee by employee: add them for several people and days at once, or remove one. */
export function AttendanceShiftsPage() {
  const { text, language } = useLanguage();
  usePageTitle('الشيفتات', 'Shifts');
  const { can } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const scope = useBranchScope();
  const branchId = scope.selected === 'all' ? null : scope.selected;
  const [start, setStart] = useState(() => weekStart(isoDay()));
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const shifts = useQuery({ queryKey: attendanceKeys.shifts(days[0]!, days[6]!, branchId), queryFn: () => attendanceApi.shifts({ from: days[0]!, to: days[6]!, branchId }) });
  const employees = useEmployeesQuery();
  const clock = useClock();
  const [adding, setAdding] = useState<{ employeeIds: string[]; days: string[] } | null>(null);
  const remove = useMutation({
    mutationFn: (shift: Shift) => attendanceApi.deleteShift(shift.id),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: attendanceKeys.all }); toast.success(text('اتشال الشيفت', 'Shift removed')); },
    onError: error => toast.error(errorMessage(error, text)),
  });
  const manage = can('attendance.manage');
  const people = (employees.data ?? []).filter(employee => employee.isActive && (!branchId || employee.branchId === branchId));
  const today = isoDay();

  return <>
    <div className="att-toolbar">
      <div className="att-day" role="group" aria-label={text('الأسبوع', 'Week')}>
        <button type="button" className="icon-button" onClick={() => setStart(addDays(start, -7))} aria-label={text('الأسبوع اللي فات', 'Previous week')}><CaretRightIcon size={18} className="directional" /></button>
        <strong>{formatDate(`${days[0]}T12:00:00`, language, { day: 'numeric', month: 'short' })} – {formatDate(`${days[6]}T12:00:00`, language, { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
        <button type="button" className="icon-button" onClick={() => setStart(addDays(start, 7))} aria-label={text('الأسبوع الجاي', 'Next week')}><CaretLeftIcon size={18} className="directional" /></button>
        {start !== weekStart(today) && <button type="button" className="link-action" onClick={() => setStart(weekStart(today))}>{text('الأسبوع ده', 'This week')}</button>}
      </div>
      {manage && <Button small onClick={() => setAdding({ employeeIds: [], days: [] })} disabled={!people.length} icon={<PlusIcon size={16} weight="bold" aria-hidden="true" />}>{text('ضيف شيفتات', 'Add shifts')}</Button>}
    </div>
    <section className="card list-card" aria-labelledby="att-shifts-title">
      <h2 id="att-shifts-title" className="visually-hidden">{text('جدول الشيفتات', 'Shift schedule')}</h2>
      {(shifts.isError || employees.isError) && <ErrorPanel error={shifts.error ?? employees.error} onRetry={() => { void shifts.refetch(); void employees.refetch(); }} />}
      {(shifts.isPending || employees.isPending) && <div className="table-skeleton">{[0, 1, 2].map(index => <Skeleton key={index} height={52} />)}</div>}
      {employees.data && !people.length && <div className="empty-state"><h2>{text('ضيف موظفين الأول', 'Add employees first')}</h2></div>}
      {shifts.data && people.length > 0 && <div className="table-scroll"><table className="shift-grid">
        <thead><tr>
          <th scope="col">{text('الموظف', 'Employee')}</th>
          {days.map(day => <th key={day} scope="col" className={day === today ? 'is-today' : undefined}>
            {formatDate(`${day}T12:00:00`, language, { weekday: 'short' })}<small>{formatDate(`${day}T12:00:00`, language, { day: 'numeric', month: 'numeric' })}</small>
          </th>)}
        </tr></thead>
        <tbody>{people.map(employee => <tr key={employee.id}>
          <th scope="row"><bdi>{employee.fullName}</bdi><small>{employee.jobTitle ?? `#${employee.employeeNumber}`}</small></th>
          {days.map(day => {
            const mine = shifts.data.filter(shift => shift.employeeId === employee.id && shift.day === day);
            return <td key={day} className={day === today ? 'is-today' : undefined}>
              <div className="shift-cell">
                {mine.map(shift => <span key={shift.id} className={`shift-chip ${shift.isLeave ? 'is-leave' : ''}`} data-testid="shift-chip">
                  {shift.isLeave ? text('إجازة', 'Leave') : `${clock(shift.startsAt)}–${clock(shift.endsAt)}`}
                  {manage && <button type="button" onClick={() => remove.mutate(shift)} aria-label={text('شيل الشيفت', 'Remove shift')}><XIcon size={11} weight="bold" /></button>}
                </span>)}
                {manage && !mine.length && <button type="button" className="shift-add" onClick={() => setAdding({ employeeIds: [employee.id], days: [day] })} aria-label={text(`ضيف شيفت لـ ${employee.fullName}`, `Add a shift for ${employee.fullName}`)}><PlusIcon size={14} /></button>}
              </div>
            </td>;
          })}
        </tr>)}</tbody>
      </table></div>}
    </section>
    <ShiftsDialog initial={adding} week={days} onClose={() => setAdding(null)} />
  </>;
}

function ShiftsDialog({ initial, week, onClose }: { initial: { employeeIds: string[]; days: string[] } | null; week: string[]; onClose: () => void }) {
  const { text, language } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const scope = useBranchScope();
  const employees = useEmployeesQuery(initial !== null);
  const [selected, setSelected] = useState<string[]>([]);
  const [days, setDays] = useState<string[]>([]);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [name, setName] = useState('');
  const [isLeave, setIsLeave] = useState(false);
  useEffect(() => { if (initial) { setSelected(initial.employeeIds); setDays(initial.days); setIsLeave(false); } }, [initial]);
  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter(entry => entry !== value) : [...list, value]);
  const save = useMutation({
    mutationFn: () => attendanceApi.createShifts({ employeeIds: selected, days, start: startTime, end: endTime, name: name.trim() || null, isLeave }),
    onSuccess: created => {
      void queryClient.invalidateQueries({ queryKey: attendanceKeys.all });
      toast.success(text(`اتضاف ${created.length} شيفت`, `${created.length} shifts added`));
      onClose();
    },
  });
  const people = (employees.data ?? []).filter(employee => employee.isActive && (scope.selected === 'all' || employee.branchId === scope.selected));
  const valid = selected.length > 0 && days.length > 0 && startTime && endTime;
  return <Dialog open={initial !== null} onClose={onClose} busy={save.isPending} onSubmit={() => { if (valid) save.mutate(); }} title={text('ضيف شيفتات', 'Add shifts')}
    footer={<>
      <Button variant="secondary" onClick={onClose} disabled={save.isPending}>{text('إلغاء', 'Cancel')}</Button>
      <Button type="submit" loading={save.isPending} disabled={!valid}>{text(`ضيف ${selected.length * days.length || ''} شيفت`, `Add ${selected.length * days.length || ''} shifts`)}</Button>
    </>}>
    <div className="form">
      {save.isError && <Alert kind="error">{errorMessage(save.error, text)}</Alert>}
      <fieldset className="field">
        <legend className="field-label">{text('الموظفين', 'Employees')}</legend>
        <div className="check-grid">{people.map(employee => <label key={employee.id} className="check-row">
          <input type="checkbox" checked={selected.includes(employee.id)} onChange={() => setSelected(toggle(selected, employee.id))} />
          <span><bdi>{employee.fullName}</bdi></span>
        </label>)}</div>
      </fieldset>
      <fieldset className="field">
        <legend className="field-label">{text('الأيام', 'Days')}</legend>
        <div className="day-chips">{week.map(day => <label key={day} className={`day-chip ${days.includes(day) ? 'is-on' : ''}`}>
          <input type="checkbox" checked={days.includes(day)} onChange={() => setDays(toggle(days, day))} />
          {formatDate(`${day}T12:00:00`, language, { weekday: 'short', day: 'numeric' })}
        </label>)}</div>
      </fieldset>
      <Switch checked={isLeave} onChange={setIsLeave} label={text('إجازة', 'Leave day')} description={text('يظهر «إجازة» بدل «غايب».', 'Shows “On leave” instead of “Absent”.')} />
      {!isLeave && <div className="form-grid">
        <Field label={text('البداية', 'Starts')}><input className="input" type="time" value={startTime} onChange={event => setStartTime(event.target.value)} /></Field>
        <Field label={text('النهاية', 'Ends')} hint={endTime <= startTime ? text('بيخلص تاني يوم.', 'Ends the next day.') : undefined}><input className="input" type="time" value={endTime} onChange={event => setEndTime(event.target.value)} /></Field>
        <Field label={text('اسم الشيفت', 'Shift name')}><input className="input" maxLength={40} value={name} onChange={event => setName(event.target.value)} placeholder={text('صباحي، مسائي…', 'Morning, evening…')} /></Field>
      </div>}
    </div>
  </Dialog>;
}
