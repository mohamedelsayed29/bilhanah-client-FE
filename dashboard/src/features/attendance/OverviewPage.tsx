import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CaretLeftIcon, CaretRightIcon, ClockIcon, HourglassIcon, MoonIcon, UserCheckIcon, UserMinusIcon, UsersIcon, WarningIcon, LightningIcon } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { Alert } from '../../components/Alert';
import { CompactMeta } from '../../components/CompactMeta';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Skeleton } from '../../components/Skeleton';
import { attendanceApi } from '../../lib/api/endpoints';
import { formatDate } from '../../lib/format';
import { useLanguage, usePageTitle } from '../../lib/language';
import { useBranchScope } from '../branches/BranchScope';
import { useWorkspace } from '../branches/workspace';
import { addDays, attendanceKeys, isoDay, MethodLabel, StatusBadge, useClock, useDuration } from './shared';

/** Today (or any day) at a glance: who is scheduled, in, late, absent, still working, on leave. */
export function AttendanceOverviewPage() {
  const { text, number, language } = useLanguage();
  usePageTitle('الحضور النهارده', 'Attendance today');
  const { to } = useWorkspace();
  const scope = useBranchScope();
  const branchId = scope.selected === 'all' ? null : scope.selected;
  const [day, setDay] = useState(isoDay);
  const overview = useQuery({ queryKey: attendanceKeys.overview(day, branchId), queryFn: () => attendanceApi.overview(day, branchId), refetchInterval: 60_000 });
  const clock = useClock();
  const duration = useDuration();
  const today = isoDay();
  const totals = overview.data?.totals;
  const cards: { key: string; icon: Icon; label: string; value: number | undefined; tone: string }[] = [
    { key: 'scheduled', icon: UsersIcon, label: text('عليهم شيفت', 'Scheduled'), value: totals?.scheduled, tone: 'all' },
    { key: 'present', icon: UserCheckIcon, label: text('حضروا', 'Present'), value: totals?.present, tone: 'success' },
    { key: 'working', icon: ClockIcon, label: text('شغالين دلوقتي', 'Working now'), value: totals?.working, tone: 'info' },
    { key: 'late', icon: HourglassIcon, label: text('متأخرين', 'Late'), value: totals?.late, tone: 'warning' },
    { key: 'absent', icon: UserMinusIcon, label: text('غايبين', 'Absent'), value: totals?.absent, tone: 'danger' },
    { key: 'incomplete', icon: WarningIcon, label: text('ناقصين انصراف', 'Incomplete'), value: totals?.incomplete, tone: 'danger' },
    { key: 'onLeave', icon: MoonIcon, label: text('إجازة', 'On leave'), value: totals?.onLeave, tone: 'muted' },
    { key: 'overtime', icon: LightningIcon, label: text('وقت إضافي', 'Overtime'), value: totals?.overtime, tone: 'guava' },
  ];
  return <>
    <div className="att-toolbar">
      <div className="att-day" role="group" aria-label={text('اليوم', 'Day')}>
        <button type="button" className="icon-button" onClick={() => setDay(addDays(day, -1))} aria-label={text('اليوم اللي قبله', 'Previous day')}><CaretRightIcon size={18} className="directional" /></button>
        <input type="date" className="input att-date" value={day} max={today} onChange={event => event.target.value && setDay(event.target.value)} aria-label={text('اختار اليوم', 'Choose the day')} />
        <button type="button" className="icon-button" onClick={() => setDay(addDays(day, 1))} disabled={day >= today} aria-label={text('اليوم اللي بعده', 'Next day')}><CaretLeftIcon size={18} className="directional" /></button>
        {day !== today && <button type="button" className="link-action" onClick={() => setDay(today)}>{text('النهارده', 'Today')}</button>}
      </div>
      <strong className="att-day-label">{day === today ? text('النهارده', 'Today') : formatDate(`${day}T12:00:00`, language, { weekday: 'long', day: 'numeric', month: 'long' })}</strong>
    </div>

    {overview.data && overview.data.pendingCorrections > 0 && <Alert kind="info" live={false}
      actions={<Link className="button button-secondary button-small" to={to('/attendance/corrections')}>{text('راجعها', 'Review')}</Link>}>
      {text(`${number(overview.data.pendingCorrections)} طلب تصحيح مستني موافقتك.`, `${overview.data.pendingCorrections} correction requests are waiting for review.`)}
    </Alert>}

    <div className="att-kpis" data-testid="attendance-kpis">
      {cards.map(card => <div key={card.key} className={`att-kpi tone-${card.tone}`} data-testid={`kpi-${card.key}`}>
        <span className="att-kpi-icon" aria-hidden="true"><card.icon size={19} weight="bold" /></span>
        <span className="att-kpi-text"><span>{card.label}</span><strong>{card.value === undefined ? <Skeleton width={28} height={20} /> : number(card.value)}</strong></span>
      </div>)}
    </div>

    <section className="card list-card" aria-labelledby="att-day-title" aria-busy={overview.isFetching}>
      <h2 id="att-day-title" className="visually-hidden">{text('الموظفين', 'Employees')}</h2>
      {overview.isError && <ErrorPanel error={overview.error} onRetry={() => void overview.refetch()} />}
      {overview.isPending && <div className="table-skeleton">{[0, 1, 2, 3].map(index => <Skeleton key={index} height={52} />)}</div>}
      {overview.data && overview.data.rows.length === 0 && <div className="empty-state">
        <span className="empty-state-icon" aria-hidden="true"><UsersIcon size={30} /></span>
        <h2>{text('مفيش حد عليه شيفت اليوم ده', 'Nobody is scheduled this day')}</h2>
        <p>{text('ضيف الموظفين ووزّع الشيفتات، والحضور هيظهر هنا أول بأول.', 'Add employees and their shifts; attendance shows here as it happens.')}</p>
        <Link className="button button-primary" to={to('/attendance/shifts')}>{text('وزّع الشيفتات', 'Plan shifts')}</Link>
      </div>}
      {overview.data && overview.data.rows.length > 0 && <div className="table-scroll"><table className="data-table att-table">
        <thead><tr>
          <th scope="col">{text('الموظف', 'Employee')}</th>
          <th scope="col">{text('الشيفت', 'Shift')}</th>
          <th scope="col">{text('حضور', 'In')}</th>
          <th scope="col">{text('انصراف', 'Out')}</th>
          <th scope="col">{text('ساعات', 'Hours')}</th>
          <th scope="col">{text('الطريقة', 'Method')}</th>
          <th scope="col">{text('الحالة', 'Status')}</th>
        </tr></thead>
        <tbody>{overview.data.rows.map(row => {
          const first = row.records[0];
          const last = row.records.at(-1);
          const worked = row.records.reduce((sum, record) => sum + record.workedMinutes, 0);
          const shift = row.shifts.find(entry => !entry.isLeave);
          return <tr key={row.employee.id} data-testid="attendance-row">
            <td className="cell-primary" data-label={text('الموظف', 'Employee')}>
              <bdi>{row.employee.fullName}</bdi>
              <small><span className="ltr">#{row.employee.employeeNumber}</span>{row.employee.jobTitle ? ` · ${row.employee.jobTitle}` : ''}{branchId ? '' : ` · ${row.employee.branchName}`}</small>
            </td>
            <td data-label={text('الشيفت', 'Shift')} className="cell-nowrap">{shift ? `${clock(shift.startsAt)} – ${clock(shift.endsAt)}` : row.shifts.length ? text('إجازة', 'Leave') : '—'}</td>
            <td data-label={text('حضور', 'In')} className="cell-nowrap">{clock(first?.checkInAt ?? null)}{first && first.lateMinutes > 0 && <small className="att-late">{text(`متأخر ${duration(first.lateMinutes)}`, `${duration(first.lateMinutes)} late`)}</small>}</td>
            <td data-label={text('انصراف', 'Out')} className="cell-nowrap">{clock(last?.checkOutAt ?? null)}</td>
            <td data-label={text('ساعات', 'Hours')} className="cell-nowrap">{worked ? duration(worked) : '—'}</td>
            <td data-label={text('الطريقة', 'Method')}><MethodLabel method={first?.checkInMethod ?? null} />{first?.kioskName && <small><bdi>{first.kioskName}</bdi></small>}{row.records.some(record => record.flagged) && <small className="att-flag">{text('خارج الموقع', 'Away from branch')}</small>}</td>
            <td data-label={text('الحالة', 'Status')} className="cell-end"><StatusBadge status={row.state} /></td>
            <CompactMeta parts={[shift ? `${clock(shift.startsAt)}–${clock(shift.endsAt)}` : null, first ? `${clock(first.checkInAt)} → ${clock(last?.checkOutAt ?? null)}` : null, worked ? duration(worked) : null]} />
          </tr>;
        })}</tbody>
      </table></div>}
    </section>
  </>;
}
