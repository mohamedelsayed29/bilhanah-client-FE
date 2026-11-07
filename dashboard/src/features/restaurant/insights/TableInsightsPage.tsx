import { useState } from 'react';
import type { ReactNode } from 'react';
import './table-insights.css';
import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  ArrowDownIcon, ArrowRightIcon, BroomIcon, CalendarCheckIcon, CheckCircleIcon, ClockIcon, CoinsIcon, ForkKnifeIcon, PowerIcon, QrCodeIcon, RepeatIcon, TableIcon, UsersThreeIcon,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { TABLE_ANALYTICS_LIMITS, type TableAnalytics, type TableAnalyticsRow } from '@bilhanah/contracts';
import { ErrorPanel } from '../../../components/ErrorBoundary';
import { PageHeader } from '../../../components/PageHeader';
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

  return <div className="page insights-page table-insights ti-page">
    <PageHeader title={text('إحصائيات الطاولات', 'Table insights')}
      description={text('مين أكتر طاولة شغالة، الزباين بيقعدوا قد إيه، والإيراد والسكانات لكل طاولة.', 'Which tables work hardest, how long parties stay, and each table’s revenue and scans.')}
      actions={<Link className="button button-secondary" to="/insights"><ArrowRightIcon size={18} className="directional" aria-hidden="true" />{text('كل الإحصائيات', 'All insights')}</Link>} />

    <section className="card ti-toolbar" aria-label={text('الفترة والفلاتر', 'Period and filters')}>
      <div className="ti-periods" role="radiogroup" aria-label={text('الفترة', 'Period')}>
        {PRESETS.map(count => <label key={count} className={preset === count ? 'active' : ''}>
          <input type="radio" name="table-period" checked={preset === count} onChange={() => setRange({ from: shift(today, -(count - 1)), to: today })} />
          {text(count === 7 ? 'آخر ٧ أيام' : `آخر ${number(count)} يوم`, `${count} days`)}
        </label>)}
        {!preset && <span className="ti-custom active">{text('فترة مخصصة', 'Custom')}</span>}
      </div>
      <div className="ti-fields">
        <label className="ti-field"><span>{text('من', 'From')}</span>
          <input className="input" type="date" dir="ltr" value={range.from} max={range.to} onChange={event => event.target.value && setRange(current => ({ ...current, from: event.target.value }))} />
        </label>
        <label className="ti-field"><span>{text('لحد', 'To')}</span>
          <input className="input" type="date" dir="ltr" value={range.to} min={range.from} max={today} onChange={event => event.target.value && setRange(current => ({ ...current, to: event.target.value }))} />
        </label>
        <label className="ti-field"><span>{text('المنطقة', 'Area')}</span>
          <select className="select" value={areaId} onChange={event => setAreaId(event.target.value)} disabled={!scope.branch}>
            <option value="ALL">{text('كل المناطق', 'All areas')}</option>
            {(areas.data ?? []).map(area => <option key={area.id} value={area.id}>{area.name}</option>)}
            <option value="NONE">{text('بدون منطقة', 'No area')}</option>
          </select>
        </label>
      </div>
      {!scope.branch && <p className="field-hint ti-hint">{text('اختار فرع من فوق عشان تفلتر بالمنطقة.', 'Pick a branch above to filter by area.')}</p>}
      {!valid && <p className="field-error ti-hint" role="alert">{text(`الفترة لازم تكون من ${number(1)} لـ${number(TABLE_ANALYTICS_LIMITS.rangeDays)} يوم.`, `The period must be 1 to ${TABLE_ANALYTICS_LIMITS.rangeDays} days.`)}</p>}
    </section>

    {stats.isError && !stats.data && <ErrorPanel error={stats.error} onRetry={() => void stats.refetch()} />}
    {stats.isPending && valid && <div className="ti-kpis" aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} height={128} radius={20} />)}</div>}
    {stats.data && <div className={`ti-body ${stats.isPlaceholderData ? 'is-refreshing' : ''}`} aria-busy={stats.isFetching}>
      <NowCard data={stats.data} />
      <PeriodKpis data={stats.data} financial={can('analytics.financial')} />
      <div className="ti-panels">
        <Panel id="most-used" tone="coral" title={text('الطاولات الأكتر استخدامًا', 'Most used tables')} note={text('عدد القعدات في الفترة.', 'Seatings in the period.')}>
          <Ranking rows={stats.data.tables} value={row => row.seatings} show={value => text(`${number(value)} قعدة`, `${value} seatings`)} empty={text('مفيش قعدات في الفترة دي.', 'No seatings in this period.')} />
        </Panel>
        {can('analytics.financial') && <Panel id="table-revenue" tone="green" title={text('الإيراد لكل طاولة', 'Revenue per table')} note={text('من الطلبات المدفوعة بس.', 'Paid orders only.')}>
          <Ranking rows={stats.data.tables} value={row => row.revenuePiastres ?? 0} show={value => formatPrice(value, language)} empty={text('مفيش طلبات مدفوعة في الفترة دي.', 'No paid orders in this period.')} />
        </Panel>}
        <Panel id="table-scans" tone="yellow" title={text('سكانات QR لكل طاولة', 'QR scans per table')}
          note={stats.data.summary.scanTrackingSince
            ? text(`من ${formatDate(stats.data.summary.scanTrackingSince, language, { dateStyle: 'medium' })}، موبايل واحد كل نص ساعة.`, `Since ${formatDate(stats.data.summary.scanTrackingSince, language, { dateStyle: 'medium' })}, once per phone per half hour.`)
            : text('بتبدأ تتعد مع أول سكان لكود طاولة.', 'Counting starts with the first table scan.')}>
          <Ranking rows={stats.data.tables} value={row => row.scans} show={value => text(`${number(value)} سكان`, `${value} scans`)} empty={text('مفيش سكانات في الفترة دي.', 'No scans in this period.')} />
        </Panel>
      </div>
      <AllTables rows={stats.data.tables} financial={can('analytics.financial')} days={stats.data.days} />
    </div>}
  </div>;
}

/** The tables right now: the total, a bar split by status, and a legend that counts each. */
function NowCard({ data }: { data: TableAnalytics }) {
  const { text, number } = useLanguage();
  const parts: { key: string; icon: Icon; value: number; label: string }[] = [
    { key: 'available', icon: CheckCircleIcon, value: data.now.available, label: text('متاحة', 'Available') },
    { key: 'occupied', icon: ForkKnifeIcon, value: data.now.occupied, label: text('مشغولة', 'Occupied') },
    { key: 'reserved', icon: CalendarCheckIcon, value: data.now.reserved, label: text('محجوزة', 'Reserved') },
    { key: 'cleaning', icon: BroomIcon, value: data.now.cleaning, label: text('بتتنضف', 'Cleaning') },
    { key: 'unavailable', icon: PowerIcon, value: data.now.unavailable, label: text('متوقفة', 'Off') },
  ];
  const total = Math.max(1, parts.reduce((sum, part) => sum + part.value, 0));
  const busy = data.now.occupied + data.now.reserved;
  return <section className="card ti-now" aria-labelledby="tables-now">
    <div className="ti-now-head">
      <div>
        <h2 id="tables-now"><span className="ti-live" aria-hidden="true" />{text('الطاولات دلوقتي', 'Tables right now')}</h2>
        <p className="ti-muted">{text(`${number(busy)} من ${number(data.now.total)} طاولة عليها زباين أو محجوزة`, `${busy} of ${data.now.total} tables seated or reserved`)}</p>
      </div>
      <p className="ti-now-total" data-testid="now-total"><TableIcon size={20} aria-hidden="true" /><strong>{number(data.now.total)}</strong><span>{text('طاولة', 'tables')}</span></p>
    </div>
    <div className="ti-stack" role="img" aria-label={parts.map(part => `${part.label} ${part.value}`).join('، ')}>
      {parts.filter(part => part.value > 0).map(part => <span key={part.key} className={`is-${part.key}`} style={{ flexGrow: part.value / total }} />)}
    </div>
    <ul className="ti-legend">{parts.map(part => <li key={part.key} className={`is-${part.key}`} data-testid={`now-${part.key}`}>
      <span className="ti-legend-icon" aria-hidden="true"><part.icon size={16} weight="fill" /></span>
      <strong>{number(part.value)}</strong><span>{part.label}</span>
    </li>)}</ul>
  </section>;
}

function Panel({ id, tone, title, note, children }: { id: string; tone: string; title: string; note: string; children: ReactNode }) {
  return <section className={`card ti-panel tone-${tone}`} aria-labelledby={id} role="region">
    <h2 id={id}>{title}</h2>
    <p className="ti-muted">{note}</p>
    {children}
  </section>;
}

function Ranking({ rows, value, show, empty }: { rows: TableAnalyticsRow[]; value: (row: TableAnalyticsRow) => number; show: (value: number) => string; empty: string }) {
  const { number } = useLanguage();
  const top = [...rows].filter(row => value(row) > 0).sort((a, b) => value(b) - value(a)).slice(0, TOP);
  if (!top.length) return <p className="ti-empty">{empty}</p>;
  const max = value(top[0]!);
  return <ol className="ti-ranking">{top.map((row, index) => <li key={row.id}>
    <span className="ti-rank">{number(index + 1)}</span>
    <span className="ti-rank-body">
      <span className="ti-rank-line"><bdi className="ti-rank-name">{row.label}{row.areaName && <small> · {row.areaName}</small>}</bdi><strong>{show(value(row))}</strong></span>
      <span className="ti-track" aria-hidden="true"><span style={{ width: `${Math.max(3, (value(row) / max) * 100)}%` }} /></span>
    </span>
  </li>)}</ol>;
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
  const tiles: { key: string; icon: Icon; value: string; label: string; hint: string; tone?: string }[] = [
    { key: 'seatings', tone: 'coral', icon: UsersThreeIcon, value: number(summary.seatings), label: text('القعدات', 'Seatings'), hint: text(`${number(summary.orders)} طلب صالة`, `${summary.orders} dine-in orders`) },
    { key: 'duration', tone: 'teal', icon: ClockIcon, value: duration(summary.averageOccupancyMinutes), label: text('متوسط مدة القعدة', 'Average occupancy'), hint: text('من أول طلب أو جلسة لحد الحساب', 'From the first order or session to the bill') },
    { key: 'turnover', tone: 'yellow', icon: RepeatIcon, value: summary.turnoverRate === null ? '—' : number(summary.turnoverRate, { maximumFractionDigits: 2 }), label: text('معدل الدوران', 'Turnover rate'), hint: text('قعدات لكل طاولة في اليوم', 'Seatings per table per day') },
    ...(financial ? [{ key: 'revenue', icon: CoinsIcon, value: formatPrice(summary.revenuePiastres ?? 0, language), label: text('إيراد الطاولات', 'Table revenue'), hint: text('الطلبات المدفوعة', 'Paid orders') }] : []),
    { key: 'scans', tone: 'green', icon: QrCodeIcon, value: number(summary.scans), label: text('سكانات QR', 'QR scans'), hint: text('على أكواد الطاولات', 'On table codes') },
  ];
  return <section aria-labelledby="tables-period">
    <h2 id="tables-period" className="ti-section-title">{text(`على مدار ${number(data.days)} يوم`, `Over ${data.days} days`)}</h2>
    <div className="ti-kpis">
      {tiles.map(tile => <div key={tile.key} className={`card ti-kpi ${tile.key === 'revenue' ? 'is-featured' : ''}`} data-testid={`kpi-${tile.key}`}>
        <span className={`ti-kpi-icon tone-${tile.tone ?? 'coral'}`} aria-hidden="true"><tile.icon size={20} weight="bold" /></span>
        <span className="ti-kpi-label">{tile.label}</span>
        <strong className="ti-kpi-value">{tile.value}</strong>
        <small>{tile.hint}</small>
      </div>)}
    </div>
  </section>;
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
  return <section className="card ti-table-card" aria-labelledby="all-tables">
    <header className="ti-table-head">
      <div><h2 id="all-tables">{text('كل الطاولات', 'Every table')}</h2>
        <p className="ti-muted">{text(`على مدار ${number(days)} يوم. دوس على أي عمود عشان ترتّب بيه.`, `Over ${days} days. Pick a column to sort by it.`)}</p></div>
      <span className="ti-count">{text(`${number(rows.length)} طاولة`, `${rows.length} tables`)}</span>
    </header>
    {rows.length === 0
      ? <p className="ti-empty">{text('مفيش طاولات في المنطقة دي.', 'No tables in this area.')}</p>
      : <div className="table-scroll"><table className="data-table ti-table table-insights-table" data-testid="table-insights-table">
        <thead><tr>
          <th scope="col">{text('الطاولة', 'Table')}</th>
          {columns.map(column => <th key={column.key} scope="col" className="num" aria-sort={sort === column.key ? 'descending' : 'none'}>
            <button type="button" className={`ti-sort ${sort === column.key ? 'is-active' : ''}`} onClick={() => setSort(column.key)}>{column.label}{sort === column.key && <ArrowDownIcon size={12} weight="bold" aria-hidden="true" />}</button>
          </th>)}
        </tr></thead>
        <tbody>{sorted.map(row => <tr key={row.id} data-testid="table-insights-row" data-label={row.label} className={row.isActive ? '' : 'is-off'}>
          <td><span className="ti-table-name"><span className="ti-table-badge" aria-hidden="true">{row.label.trim().slice(0, 3)}</span>
            <span><bdi>{row.label}</bdi><small>{row.areaName ? <bdi>{row.areaName}</bdi> : text('بدون منطقة', 'No area')} · {text(`${number(row.seats)} أفراد`, `${row.seats} seats`)}{row.isActive ? '' : text(' · متوقفة', ' · off')}</small></span></span></td>
          {columns.map(column => <td key={column.key} data-label={column.label} className={`num ${sort === column.key ? 'is-sorted' : ''}`}>{column.show(row)}</td>)}
        </tr>)}</tbody>
      </table></div>}
  </section>;
}
