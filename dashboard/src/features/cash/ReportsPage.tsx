import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChartBarIcon } from '@phosphor-icons/react';
import type { CashReportRow } from '@bilhanah/contracts';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Field } from '../../components/Field';
import { Skeleton } from '../../components/Skeleton';
import { cashApi } from '../../lib/api/endpoints';
import { useLanguage, usePageTitle } from '../../lib/language';
import { useBranchScope } from '../branches/BranchScope';
import { addDays, isoDay } from '../attendance/shared';
import { cashKeys, Discrepancy, useMoney, useSeconds } from './shared';

const monthStart = () => `${isoDay().slice(0, 8)}01`;

/** Reconciliation over a period: the success metrics, then by cashier and by branch. */
export function CashReportsPage() {
  const { text, number, language } = useLanguage();
  usePageTitle('تقارير الكاش', 'Cash reports');
  const money = useMoney();
  const seconds = useSeconds();
  const scope = useBranchScope();
  const branchId = scope.selected === 'all' ? null : scope.selected;
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(isoDay);
  const params = { from, to, branchId };
  const report = useQuery({ queryKey: cashKeys.report(params), queryFn: () => cashApi.report(params) });
  const percent = (value: number | null) => (value === null ? '—' : new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en-GB', { style: 'percent', maximumFractionDigits: 1 }).format(value));
  const presets: [string, string, string][] = [
    [text('الشهر ده', 'This month'), monthStart(), isoDay()],
    [text('آخر ٧ أيام', 'Last 7 days'), addDays(isoDay(), -6), isoDay()],
    [text('آخر ٣٠ يوم', 'Last 30 days'), addDays(isoDay(), -29), isoDay()],
  ];
  const totals = report.data?.totals;
  return <>
    <div className="att-filters" role="group" aria-label={text('الفترة', 'Period')}>
      <Field label={text('من', 'From')}><input className="input" type="date" value={from} max={to} onChange={event => event.target.value && setFrom(event.target.value)} /></Field>
      <Field label={text('لحد', 'To')}><input className="input" type="date" value={to} min={from} max={isoDay()} onChange={event => event.target.value && setTo(event.target.value)} /></Field>
      <div className="att-presets">{presets.map(([label, start, end]) => <button key={label} type="button" className={`filter-chip ${from === start && to === end ? 'active' : ''}`} onClick={() => { setFrom(start); setTo(end); }}>{label}</button>)}</div>
    </div>
    {report.isError && <ErrorPanel error={report.error} onRetry={() => void report.refetch()} />}
    {report.isPending && <div className="skeleton-stack"><Skeleton height={80} /><Skeleton height={200} /></div>}
    {totals && <div className="att-kpis is-compact" data-testid="cash-metrics">
      {([
        [text('نسبة الشيفتات اللي فيها فرق', 'Cash discrepancy rate'), percent(totals.discrepancyRate), totals.discrepancyRate ? 'warning' : 'success'],
        [text('نسبة الشيفتات اللي اتقفلت', 'Shift completion rate'), percent(totals.completionRate), 'all'],
        [text('تسويات مش متوافق عليها', 'Unapproved adjustments'), number(totals.unapprovedAdjustments), totals.unapprovedAdjustments ? 'guava' : 'muted'],
        [text('متوسط وقت القفل', 'Average closing time'), seconds(totals.averageClosingSeconds), 'info'],
        [text('صافي الفرق', 'Net discrepancy'), money(totals.netDiscrepancyPiastres), totals.netDiscrepancyPiastres < 0 ? 'danger' : 'muted'],
        [text('فروقات مستنية مراجعة', 'Pending reviews'), number(totals.pendingReviews), totals.pendingReviews ? 'guava' : 'muted'],
      ] as const).map(([label, value, tone]) => <div key={label} className={`att-kpi tone-${tone}`}><span className="att-kpi-text"><span>{label}</span><strong>{value}</strong></span></div>)}
    </div>}
    {report.data && totals?.shifts === 0 && <section className="card"><div className="empty-state">
      <span className="empty-state-icon" aria-hidden="true"><ChartBarIcon size={30} /></span>
      <h2>{text('مفيش شيفتات في الفترة دي', 'No shifts in this period')}</h2>
    </div></section>}
    {report.data && report.data.byCashier.length > 0 && <ReportTable title={text('حسب الكاشير', 'By cashier')} who={text('الكاشير', 'Cashier')} rows={report.data.byCashier} />}
    {report.data && report.data.byBranch.length > 1 && <ReportTable title={text('حسب الفرع', 'By branch')} who={text('الفرع', 'Branch')} rows={report.data.byBranch} />}
  </>;
}

function ReportTable({ title, who, rows }: { title: string; who: string; rows: CashReportRow[] }) {
  const { text, number } = useLanguage();
  const money = useMoney();
  const seconds = useSeconds();
  return <section className="card list-card" aria-label={title}>
    <h2 className="card-title">{title}</h2>
    <div className="table-scroll"><table className="data-table cash-table">
      <thead><tr>
        <th scope="col">{who}</th>
        <th scope="col">{text('شيفتات', 'Shifts')}</th>
        <th scope="col">{text('اتقفلت', 'Closed')}</th>
        <th scope="col">{text('فيها فرق', 'With difference')}</th>
        <th scope="col">{text('عجز', 'Shortage')}</th>
        <th scope="col">{text('زيادة', 'Overage')}</th>
        <th scope="col">{text('الصافي', 'Net')}</th>
        <th scope="col">{text('مبيعات كاش', 'Cash sales')}</th>
        <th scope="col">{text('مرتجعات', 'Refunds')}</th>
        <th scope="col">{text('متوسط القفل', 'Avg. closing')}</th>
      </tr></thead>
      <tbody>{rows.map(row => <tr key={row.id} data-testid="cash-report-row">
        <td className="cell-primary" data-label={who}><bdi>{row.name}</bdi>{(row.pendingReviews > 0 || row.unapprovedAdjustments > 0) && <small className="muted">
          {text(`${number(row.pendingReviews)} مراجعة · ${number(row.unapprovedAdjustments)} تسوية مستنية`, `${row.pendingReviews} to review · ${row.unapprovedAdjustments} pending adj.`)}</small>}</td>
        <td data-label={text('شيفتات', 'Shifts')}>{number(row.shifts)}</td>
        <td data-label={text('اتقفلت', 'Closed')}>{number(row.closedShifts)}</td>
        <td data-label={text('فيها فرق', 'With difference')}>{row.discrepancyShifts ? number(row.discrepancyShifts) : '—'}</td>
        <td data-label={text('عجز', 'Shortage')} className="cell-nowrap">{row.shortagePiastres ? money(row.shortagePiastres) : '—'}</td>
        <td data-label={text('زيادة', 'Overage')} className="cell-nowrap">{row.overagePiastres ? money(row.overagePiastres) : '—'}</td>
        <td data-label={text('الصافي', 'Net')} className="cell-nowrap"><Discrepancy piastres={row.closedShifts ? row.netDiscrepancyPiastres : null} /></td>
        <td data-label={text('مبيعات كاش', 'Cash sales')} className="cell-nowrap">{money(row.cashSalesPiastres)}</td>
        <td data-label={text('مرتجعات', 'Refunds')} className="cell-nowrap">{row.cashRefundsPiastres ? money(row.cashRefundsPiastres) : '—'}</td>
        <td data-label={text('متوسط القفل', 'Avg. closing')} className="cell-nowrap">{seconds(row.averageClosingSeconds)}</td>
      </tr>)}</tbody>
    </table></div>
  </section>;
}
