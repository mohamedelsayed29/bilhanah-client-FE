import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChartBarIcon, DownloadSimpleIcon, FileXlsIcon, PrinterIcon } from '@phosphor-icons/react';
import { Button } from '../../components/Button';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Field } from '../../components/Field';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { attendanceApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { useLanguage, usePageTitle } from '../../lib/language';
import { useBranchScope } from '../branches/BranchScope';
import { saveExport } from './RecordsPage';
import { addDays, attendanceKeys, isoDay, useDuration } from './shared';

/** The first day of this month. */
const monthStart = () => `${isoDay().slice(0, 8)}01`;

/** Per employee over a period: the monthly, late, absence and overtime reports in one table, exportable. */
export function AttendanceReportsPage() {
  const { text, number, language } = useLanguage();
  usePageTitle('تقارير الحضور', 'Attendance reports');
  const toast = useToast();
  const scope = useBranchScope();
  const branchId = scope.selected === 'all' ? null : scope.selected;
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(isoDay);
  const [exporting, setExporting] = useState<string | null>(null);
  const summary = useQuery({ queryKey: attendanceKeys.summary(from, to, branchId), queryFn: () => attendanceApi.summary({ from, to, branchId }) });
  const duration = useDuration();
  const rows = summary.data ?? [];
  const total = (pick: (row: (typeof rows)[number]) => number) => rows.reduce((sum, row) => sum + pick(row), 0);
  const download = async (format: 'csv' | 'xls') => {
    setExporting(format);
    try { await saveExport({ from, to, branchId, format, report: 'summary', lang: language === 'ar' ? 'ar' : 'en' }); }
    catch (error) { toast.error(errorMessage(error, text)); }
    finally { setExporting(null); }
  };
  const presets: [string, string, string, string][] = [
    [text('الشهر ده', 'This month'), '', monthStart(), isoDay()],
    [text('آخر ٧ أيام', 'Last 7 days'), '', addDays(isoDay(), -6), isoDay()],
    [text('آخر ٣٠ يوم', 'Last 30 days'), '', addDays(isoDay(), -29), isoDay()],
  ];
  return <>
    <div className="att-filters" role="group" aria-label={text('الفترة', 'Period')}>
      <Field label={text('من', 'From')}><input className="input" type="date" value={from} max={to} onChange={event => event.target.value && setFrom(event.target.value)} /></Field>
      <Field label={text('لحد', 'To')}><input className="input" type="date" value={to} min={from} max={isoDay()} onChange={event => event.target.value && setTo(event.target.value)} /></Field>
      <div className="att-presets">{presets.map(([label, , start, end]) => <button key={label} type="button" className={`filter-chip ${from === start && to === end ? 'active' : ''}`} onClick={() => { setFrom(start); setTo(end); }}>{label}</button>)}</div>
    </div>
    <div className="att-actions">
      <span className="att-actions-spacer" />
      <Button small variant="secondary" loading={exporting === 'csv'} onClick={() => void download('csv')} icon={<DownloadSimpleIcon size={16} aria-hidden="true" />}>CSV</Button>
      <Button small variant="secondary" loading={exporting === 'xls'} onClick={() => void download('xls')} icon={<FileXlsIcon size={16} aria-hidden="true" />}>Excel</Button>
      <Button small variant="ghost" onClick={() => window.print()} icon={<PrinterIcon size={16} aria-hidden="true" />}>{text('اطبع / PDF', 'Print / PDF')}</Button>
    </div>
    {rows.length > 0 && <div className="att-kpis is-compact">
      {[
        [text('ساعات العمل', 'Hours worked'), duration(total(row => row.workedMinutes)), 'all'],
        [text('مرات التأخير', 'Late arrivals'), number(total(row => row.lateCount)), 'warning'],
        [text('أيام الغياب', 'Absences'), number(total(row => row.absences)), 'danger'],
        [text('الوقت الإضافي', 'Overtime'), duration(total(row => row.overtimeMinutes)), 'guava'],
      ].map(([label, value, tone]) => <div key={label} className={`att-kpi tone-${tone}`}><span className="att-kpi-text"><span>{label}</span><strong>{value}</strong></span></div>)}
    </div>}
    <section className="card list-card att-print" aria-labelledby="att-report-title">
      <h2 id="att-report-title" className="visually-hidden">{text('التقرير', 'Report')}</h2>
      {summary.isError && <ErrorPanel error={summary.error} onRetry={() => void summary.refetch()} />}
      {summary.isPending && <div className="table-skeleton">{[0, 1, 2].map(index => <Skeleton key={index} height={48} />)}</div>}
      {summary.data?.length === 0 && <div className="empty-state"><span className="empty-state-icon" aria-hidden="true"><ChartBarIcon size={30} /></span><h2>{text('مفيش بيانات في الفترة دي', 'No data in this period')}</h2></div>}
      {rows.length > 0 && <div className="table-scroll"><table className="data-table att-table">
        <thead><tr>
          <th scope="col">{text('الموظف', 'Employee')}</th>
          <th scope="col">{text('شيفتات', 'Shifts')}</th>
          <th scope="col">{text('أيام حضور', 'Days present')}</th>
          <th scope="col">{text('تأخير', 'Late')}</th>
          <th scope="col">{text('غياب', 'Absent')}</th>
          <th scope="col">{text('ناقص', 'Incomplete')}</th>
          <th scope="col">{text('إجازات', 'Leave')}</th>
          <th scope="col">{text('ساعات العمل', 'Hours')}</th>
          <th scope="col">{text('إضافي', 'Overtime')}</th>
        </tr></thead>
        <tbody>{rows.map(row => <tr key={row.employee.id} data-testid="summary-row">
          <td className="cell-primary" data-label={text('الموظف', 'Employee')}><bdi>{row.employee.fullName}</bdi><small><span className="ltr">#{row.employee.employeeNumber}</span> · <bdi>{row.employee.branchName}</bdi></small></td>
          <td data-label={text('شيفتات', 'Shifts')}>{number(row.scheduledShifts)}</td>
          <td data-label={text('أيام حضور', 'Days present')}>{number(row.daysPresent)}</td>
          <td data-label={text('تأخير', 'Late')}>{row.lateCount ? <span className="att-late">{number(row.lateCount)} · {duration(row.lateMinutes)}</span> : '—'}</td>
          <td data-label={text('غياب', 'Absent')}>{row.absences ? <span className="att-danger">{number(row.absences)}</span> : '—'}</td>
          <td data-label={text('ناقص', 'Incomplete')}>{row.incomplete ? number(row.incomplete) : '—'}</td>
          <td data-label={text('إجازات', 'Leave')}>{row.leaveDays ? number(row.leaveDays) : '—'}</td>
          <td data-label={text('ساعات العمل', 'Hours')} className="cell-nowrap">{duration(row.workedMinutes)}</td>
          <td data-label={text('إضافي', 'Overtime')} className="cell-nowrap">{row.overtimeMinutes ? duration(row.overtimeMinutes) : '—'}</td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </>;
}
