import { useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  ArrowRightIcon, BroomIcon, CalendarCheckIcon, CheckCircleIcon, ClockIcon, CoinsIcon, ForkKnifeIcon, PowerIcon, QrCodeIcon, RepeatIcon, TableIcon, UsersThreeIcon,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { TABLE_ANALYTICS_LIMITS, type TableAnalytics, type TableAnalyticsRow } from '@bilhanah/contracts';
import { BarList } from '../../../components/charts/BarList';
import { ErrorPanel } from '../../../components/ErrorBoundary';
import { PageHeader } from '../../../components/PageHeader';
import { Section } from '../../../components/Section';
import { Skeleton } from '../../../components/Skeleton';
import { restaurantApi } from '../../../lib/api/endpoints';
import { formatDate, formatPrice } from '../../../lib/format';
import { useLanguage, usePageTitle } from '../../../lib/language';
import { useBranchScope } from '../../branches/BranchScope';
import { useWorkspace } from '../../branches/workspace';
import { useTableAreasQuery } from '../queries';
import { localDay } from '../tables/ReservationDialog';

const PRESETS = [7, 30, 90] as const;
const TOP = 8;

const shift = (day: string, days: number) => {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDay(date);
};

/**
 * Table analytics: how the tables are used right now and over a period (seatings, how long a party stays,
 * turnover, paid revenue and QR scans per table), by date range and area. Revenue needs analytics.financial.
 */
export function TableInsightsPage() {
  const { text, number, language } = useLanguage();
  usePageTitle('إحصائيات الطاولات', 'Table insights');
  const today = localDay();
  const [range, setRange] = useState({ from: shift(today, -29), to: today });
  const [areaId, setAreaId] = useState('ALL');
  const scope = useBranchScope();
  const { can } = useWorkspace();
  const branchId = scope.branch && (scope.multi || scope.locked) ? scope.branch.id : null;
  const areas = useTableAreasQuery(scope.branch?.id ?? '');
  const days = Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86_400_000) + 1;
  const valid = range.from <= range.to && days <= TABLE_ANALYTICS_LIMITS.rangeDays;
  const stats = useQuery({
    queryKey: ['stats', 'tables', range.from, range.to, branchId ?? 'all', areaId],
    queryFn: ({ signal }) => restaurantApi.tableStats({ from: range.from, to: range.to, branchId, areaId: areaId === 'ALL' ? null : areaId }, signal),
    enabled: valid,
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  const preset = PRESETS.find(count => range.to === today && range.from === shift(today, -(count - 1)));

  return <div className="page insights-page table-insights">
    <PageHeader title={text('إحصائيات الطاولات', 'Table insights')}
      description={text('الطاولات الأكتر استخدامًا، الزباين بيقعدوا قد إيه، والإيراد والسكانات لكل طاولة. الأيام محسوبة بتوقيت مطعمك.',
        'Your most used tables, how long parties stay, and the revenue and scans of each table. Days follow your restaurant’s time zone.')}
      actions={<Link className="button button-secondary" to="/insights"><ArrowRightIcon size={18} className="directional" aria-hidden="true" />{text('كل الإحصائيات', 'All insights')}</Link>} />

    <section className="card table-insights-filters" aria-label={text('الفلاتر', 'Filters')}>
      <div className="segmented period-switch" role="radiogroup" aria-label={text('الفترة', 'Period')}>
        {PRESETS.map(count => <label key={count}>
          <input type="radio" name="table-period" checked={preset === count} onChange={() => setRange({ from: shift(today, -(count - 1)), to: today })} />
          {text(count === 7 ? 'آخر ٧ أيام' : `آخر ${number(count)} يوم`, `${count} days`)}
        </label>)}
      </div>
      <label className="table-insights-date"><span>{text('من', 'From')}</span>
        <input className="input" type="date" dir="ltr" value={range.from} max={range.to} onChange={event => event.target.value && setRange(current => ({ ...current, from: event.target.value }))} />
      </label>
      <label className="table-insights-date"><span>{text('لحد', 'To')}</span>
        <input className="input" type="date" dir="ltr" value={range.to} min={range.from} max={today} onChange={event => event.target.value && setRange(current => ({ ...current, to: event.target.value }))} />
      </label>
      <label className="table-insights-date"><span>{text('المنطقة', 'Area')}</span>
        <select className="select" value={areaId} onChange={event => setAreaId(event.target.value)} disabled={!scope.branch}>
          <option value="ALL">{text('كل المناطق', 'All areas')}</option>
          {(areas.data ?? []).map(area => <option key={area.id} value={area.id}>{area.name}</option>)}
          <option value="NONE">{text('بدون منطقة', 'No area')}</option>
        </select>
      </label>
      {!scope.branch && <p className="field-hint">{text('اختار فرع من فوق عشان تفلتر بالمنطقة.', 'Pick a branch above to filter by area.')}</p>}
      {!valid && <p className="field-error" role="alert">{text(`الفترة لازم تكون من ${number(1)} لـ${number(TABLE_ANALYTICS_LIMITS.rangeDays)} يوم.`, `The period must be 1 to ${TABLE_ANALYTICS_LIMITS.rangeDays} days.`)}</p>}
    </section>

    {stats.isError && !stats.data && <ErrorPanel error={stats.error} onRetry={() => void stats.refetch()} />}
    {stats.isPending && valid && <div className="insights-kpis" aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} height={120} />)}</div>}
    {stats.data && <div className={`insights-body ${stats.isPlaceholderData ? 'is-refreshing' : ''}`} aria-busy={stats.isFetching}>
      <NowCards data={stats.data} />
      <PeriodKpis data={stats.data} financial={can('analytics.financial')} />
      <div className="table-insights-charts">
        <Section id="most-used" title={text('الطاولات الأكتر استخدامًا', 'Most used tables')} description={text('عدد القعدات في الفترة دي.', 'Seatings in this period.')}>
          <TopBars rows={stats.data.tables} value={row => row.seatings} label={text('القعدات لكل طاولة', 'Seatings per table')} empty={text('مفيش قعدات في الفترة دي.', 'No seatings in this period.')} />
        </Section>
        {can('analytics.financial') && <Section id="table-revenue" title={text('الإيراد لكل طاولة', 'Revenue per table')} description={text('من الطلبات المدفوعة بس.', 'Paid orders only.')}>
          <TopBars rows={stats.data.tables} value={row => row.revenuePiastres ?? 0} format={value => formatPrice(value, language)} label={text('الإيراد لكل طاولة', 'Revenue per table')} empty={text('مفيش طلبات مدفوعة في الفترة دي.', 'No paid orders in this period.')} />
        </Section>}
        <Section id="table-scans" title={text('سكانات QR لكل طاولة', 'QR scans per table')}
          description={stats.data.summary.scanTrackingSince
            ? text(`بنعدّها من ${formatDate(stats.data.summary.scanTrackingSince, language, { dateStyle: 'medium' })}، موبايل واحد كل نص ساعة.`, `Counted since ${formatDate(stats.data.summary.scanTrackingSince, language, { dateStyle: 'medium' })}, once per phone per half hour.`)
            : text('هنبدأ نعدّها أول ما حد يعمل سكان لكود طاولة.', 'Counting starts with the first scan of a table code.')}>
          <TopBars rows={stats.data.tables} value={row => row.scans} label={text('السكانات لكل طاولة', 'Scans per table')} empty={text('مفيش سكانات في الفترة دي.', 'No scans in this period.')} />
        </Section>
      </div>
      <AllTables rows={stats.data.tables} financial={can('analytics.financial')} days={stats.data.days} />
    </div>}
  </div>;
}

/** The tables right now, as on the floor plan. */
function NowCards({ data }: { data: TableAnalytics }) {
  const { text, number } = useLanguage();
  const cards: { key: string; icon: Icon; value: number; label: string }[] = [
    { key: 'total', icon: TableIcon, value: data.now.total, label: text('كل الطاولات', 'Total tables') },
    { key: 'available', icon: CheckCircleIcon, value: data.now.available, label: text('متاحة', 'Available') },
    { key: 'occupied', icon: ForkKnifeIcon, value: data.now.occupied, label: text('مشغولة', 'Occupied') },
    { key: 'reserved', icon: CalendarCheckIcon, value: data.now.reserved, label: text('محجوزة', 'Reserved') },
    { key: 'cleaning', icon: BroomIcon, value: data.now.cleaning, label: text('بتتنضف', 'Cleaning') },
    { key: 'unavailable', icon: PowerIcon, value: data.now.unavailable, label: text('متوقفة', 'Unavailable') },
  ];
  return <section aria-labelledby="tables-now">
    <h2 id="tables-now" className="table-insights-title">{text('دلوقتي', 'Right now')}</h2>
    <ul className="tables-summary table-insights-now">
      {cards.map(card => <li key={card.key} className={`tables-summary-card is-${card.key}`} data-testid={`now-${card.key}`}>
        <span className="tables-summary-icon" aria-hidden="true"><card.icon size={22} weight="fill" /></span>
        <span className="tables-summary-body"><strong>{number(card.value)}</strong><span>{card.label}</span></span>
      </li>)}
    </ul>
  </section>;
}

/** A duration in minutes as "1 h 20 min". */
function useDuration() {
  const { text, number } = useLanguage();
  return (minutes: number | null) => {
    if (minutes === null) return '—';
    const hours = Math.floor(minutes / 60);
    const rest = Math.round(minutes % 60);
    if (!hours) return text(`${number(rest)} دقيقة`, `${rest} min`);
    return rest ? text(`${number(hours)} س ${number(rest)} د`, `${hours} h ${rest} min`) : text(`${number(hours)} ساعة`, `${hours} h`);
  };
}

function PeriodKpis({ data, financial }: { data: TableAnalytics; financial: boolean }) {
  const { text, number, language } = useLanguage();
  const duration = useDuration();
  const { summary } = data;
  const tiles: { key: string; icon: Icon; value: string; label: string; hint: string }[] = [
    { key: 'seatings', icon: UsersThreeIcon, value: number(summary.seatings), label: text('القعدات', 'Seatings'), hint: text(`${number(summary.orders)} طلب صالة`, `${summary.orders} dine-in orders`) },
    { key: 'duration', icon: ClockIcon, value: duration(summary.averageOccupancyMinutes), label: text('متوسط مدة القعدة', 'Average occupancy'), hint: text('من أول طلب أو جلسة لحد الحساب', 'From the first order or session to the bill') },
    { key: 'turnover', icon: RepeatIcon, value: summary.turnoverRate === null ? '—' : number(summary.turnoverRate, { maximumFractionDigits: 2 }), label: text('معدل الدوران', 'Turnover rate'), hint: text('قعدات لكل طاولة في اليوم', 'Seatings per table per day') },
    ...(financial ? [{ key: 'revenue', icon: CoinsIcon, value: formatPrice(summary.revenuePiastres ?? 0, language), label: text('إيراد الطاولات', 'Table revenue'), hint: text('الطلبات المدفوعة', 'Paid orders') }] : []),
    { key: 'scans', icon: QrCodeIcon, value: number(summary.scans), label: text('سكانات QR', 'QR scans'), hint: text('على أكواد الطاولات', 'On table codes') },
  ];
  return <section aria-labelledby="tables-period">
    <h2 id="tables-period" className="table-insights-title">{text(`آخر ${number(data.days)} يوم`, `${data.days} days`)}</h2>
    <div className="insights-kpis table-insights-kpis">
      {tiles.map(tile => <div key={tile.key} className={`card kpi-card ${tile.key === 'revenue' ? 'is-featured' : ''}`} data-testid={`kpi-${tile.key}`}>
        <span className="kpi-card-icon" aria-hidden="true"><tile.icon size={20} weight="bold" /></span>
        <span className="kpi-card-label">{tile.label}</span>
        <strong>{tile.value}</strong>
        <small>{tile.hint}</small>
      </div>)}
    </div>
  </section>;
}

function TopBars({ rows, value, format, label, empty }: { rows: TableAnalyticsRow[]; value: (row: TableAnalyticsRow) => number; format?: (value: number) => string; label: string; empty: string }) {
  const top = [...rows].filter(row => value(row) > 0).sort((a, b) => value(b) - value(a)).slice(0, TOP);
  if (!top.length) return <p className="muted empty-line">{empty}</p>;
  return <BarList label={label} format={format} items={top.map(row => ({ key: row.id, label: <bdi>{row.label}</bdi>, hint: row.areaName ? <bdi>{row.areaName}</bdi> : undefined, value: value(row) }))} />;
}

type SortKey = 'seatings' | 'averageOccupancyMinutes' | 'turnoverRate' | 'orders' | 'revenuePiastres' | 'scans';

/** Every table, sortable by any figure. */
function AllTables({ rows, financial, days }: { rows: TableAnalyticsRow[]; financial: boolean; days: number }) {
  const { text, number, language } = useLanguage();
  const duration = useDuration();
  const [sort, setSort] = useState<SortKey>('seatings');
  const sorted = [...rows].sort((a, b) => (b[sort] ?? -1) - (a[sort] ?? -1) || a.label.localeCompare(b.label));
  const columns: { key: SortKey; label: string; show: (row: TableAnalyticsRow) => string }[] = [
    { key: 'seatings', label: text('القعدات', 'Seatings'), show: row => number(row.seatings) },
    { key: 'averageOccupancyMinutes', label: text('متوسط المدة', 'Avg. stay'), show: row => duration(row.averageOccupancyMinutes) },
    { key: 'turnoverRate', label: text('الدوران/يوم', 'Turnover/day'), show: row => number(row.turnoverRate, { maximumFractionDigits: 2 }) },
    { key: 'orders', label: text('الطلبات', 'Orders'), show: row => number(row.orders) },
    ...(financial ? [{ key: 'revenuePiastres' as const, label: text('الإيراد', 'Revenue'), show: (row: TableAnalyticsRow) => formatPrice(row.revenuePiastres ?? 0, language) }] : []),
    { key: 'scans', label: text('السكانات', 'Scans'), show: row => number(row.scans) },
  ];
  return <Section id="all-tables" title={text('كل الطاولات', 'Every table')} description={text(`على مدار ${number(days)} يوم. دوس على أي عمود عشان ترتّب بيه.`, `Over ${days} days. Pick a column to sort by it.`)}>
    {rows.length === 0
      ? <p className="muted empty-line">{text('مفيش طاولات في المنطقة دي.', 'No tables in this area.')}</p>
      : <div className="table-scroll"><table className="data-table table-insights-table" data-testid="table-insights-table">
        <thead><tr>
          <th scope="col">{text('الطاولة', 'Table')}</th>
          {columns.map(column => <th key={column.key} scope="col" aria-sort={sort === column.key ? 'descending' : 'none'}>
            <button type="button" className={`sort-button ${sort === column.key ? 'is-active' : ''}`} onClick={() => setSort(column.key)}>{column.label}</button>
          </th>)}
        </tr></thead>
        <tbody>{sorted.map(row => <tr key={row.id} data-testid="table-insights-row" data-label={row.label}>
          <td className="cell-primary"><bdi>{row.label}</bdi><small className="muted">{row.areaName ? <bdi>{row.areaName}</bdi> : text('بدون منطقة', 'No area')} · {text(`${number(row.seats)} أفراد`, `${row.seats} seats`)}{row.isActive ? '' : text(' · متوقفة', ' · off')}</small></td>
          {columns.map(column => <td key={column.key} data-label={column.label} className="cell-nowrap">{column.show(row)}</td>)}
        </tr>)}</tbody>
      </table></div>}
  </Section>;
}
