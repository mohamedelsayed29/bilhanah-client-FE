import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { ArrowDownIcon, ArrowLeftIcon, ArrowRightIcon, ArrowUpIcon, ArrowUpRightIcon, ForkKnifeIcon, ShoppingBagOpenIcon, ShoppingCartSimpleIcon } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { OVERVIEW_PERIODS, type OverviewDish, type OverviewFigure, type OverviewPeriod, type RestaurantOverview } from '@bilhanah/contracts';
import { ErrorPanel } from '../../../components/ErrorBoundary';
import { Skeleton } from '../../../components/Skeleton';
import { restaurantApi } from '../../../lib/api/endpoints';
import { formatCompactPrice, formatPrice } from '../../../lib/format';
import { useLanguage } from '../../../lib/language';
import { useBranchScope } from '../../branches/BranchScope';
import { useWorkspace } from '../../branches/workspace';
import { IncomeDonut, type DonutSlice } from './IncomeDonut';
import { SalesChart, type SalesPoint } from './SalesChart';

const PERIOD_LABELS: Record<OverviewPeriod, [string, string]> = { today: ['النهارده', 'Today'], week: ['٧ أيام', '7 days'], month: ['٣٠ يوم', '30 days'] };
const PREVIOUS_LABELS: Record<OverviewPeriod, [string, string]> = { today: ['عن امبارح لنفس الساعة', 'vs. yesterday at this time'], week: ['عن الـ٧ أيام اللي قبلها', 'vs. the 7 days before'], month: ['عن الـ٣٠ يوم اللي قبلها', 'vs. the 30 days before'] };
/** The ring's colours, in order: first, second, then everything else. */
const SLICE_COLORS = ['var(--ov-green)', 'var(--ov-red)', 'var(--ov-yellow)'];

export function useOverviewPeriod(): [OverviewPeriod, (period: OverviewPeriod) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('period');
  const period = (OVERVIEW_PERIODS as readonly string[]).includes(raw ?? '') ? raw as OverviewPeriod : 'today';
  return [period, next => setParams(current => { const copy = new URLSearchParams(current); if (next === 'today') copy.delete('period'); else copy.set('period', next); return copy; }, { replace: true })];
}

export function PeriodTabs({ value, onChange }: { value: OverviewPeriod; onChange: (period: OverviewPeriod) => void }) {
  const { text } = useLanguage();
  return <div className="ov-periods" role="group" aria-label={text('الفترة', 'Period')}>
    {OVERVIEW_PERIODS.map(period => <button key={period} type="button" className={value === period ? 'active' : ''} aria-pressed={value === period} onClick={() => onChange(period)} data-testid={`ov-period-${period}`}>
      {text(...PERIOD_LABELS[period])}
    </button>)}
  </div>;
}

/**
 * The home page's figures: four headline cards against the previous period, sales over time, income
 * by menu category, the dishes ordered most, and what is sold out now. Refreshes every minute.
 */
export function OverviewDashboard({ period }: { period: OverviewPeriod }) {
  const scope = useBranchScope();
  const branchId = scope.branch?.id ?? null;
  const overview = useQuery({
    queryKey: ['overview', period, branchId],
    queryFn: ({ signal }) => restaurantApi.overview(period, branchId, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  if (overview.isError && !overview.data) return <ErrorPanel error={overview.error} onRetry={() => void overview.refetch()} />;
  if (!overview.data) return <div className="ov-dashboard" aria-busy="true">
    <div className="ov-kpis">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} height={112} radius={24} />)}</div>
    <div className="ov-row"><Skeleton height={320} radius={24} /><Skeleton height={320} radius={24} /></div>
  </div>;
  const data = overview.data;
  return <div className={`ov-dashboard ${overview.isPlaceholderData ? 'is-refreshing' : ''}`} aria-busy={overview.isFetching} data-testid="ov-dashboard">
    <Kpis data={data} />
    <div className="ov-row">
      <Sales data={data} />
      <Income data={data} />
    </div>
    <div className="ov-row ov-row-even">
      <Trending data={data} />
      <SoldOut data={data} />
    </div>
  </div>;
}

function Trend({ figure, period }: { figure: OverviewFigure; period: OverviewPeriod }) {
  const { text, number } = useLanguage();
  if (figure.previous === 0) return figure.value > 0 ? <span className="ov-trend is-new" title={text(...PREVIOUS_LABELS[period])}>{text('جديد', 'New')}</span> : null;
  const change = (figure.value - figure.previous) / figure.previous;
  const up = change >= 0;
  const Arrow = up ? ArrowUpIcon : ArrowDownIcon;
  return <span className={`ov-trend ${up ? 'is-up' : 'is-down'}`} title={text(...PREVIOUS_LABELS[period])}
    aria-label={text(`${up ? 'زيادة' : 'نقص'} ${number(Math.round(Math.abs(change) * 100))}٪ ${PREVIOUS_LABELS[period][0]}`, `${up ? 'Up' : 'Down'} ${Math.round(Math.abs(change) * 100)}% ${PREVIOUS_LABELS[period][1]}`)}>
    <Arrow size={13} weight="bold" aria-hidden="true" />{number(Math.min(999, Math.round(Math.abs(change) * 100)))}%
  </span>;
}

function Kpis({ data }: { data: RestaurantOverview }) {
  const { text, number, language } = useLanguage();
  const cards: { key: string; icon: Icon; tone: string; label: string; value: string; figure: OverviewFigure }[] = [
    ...(data.financial ? [{ key: 'revenue', icon: ArrowUpRightIcon, tone: 'orange', label: text('الإيراد', 'Revenue'), value: formatPrice(data.kpis.revenuePiastres.value, language), figure: data.kpis.revenuePiastres }] : []),
    { key: 'orders', icon: ShoppingCartSimpleIcon, tone: 'green', label: text('الطلبات', 'Orders'), value: number(data.kpis.orders.value), figure: data.kpis.orders },
    { key: 'dine-in', icon: ForkKnifeIcon, tone: 'red', label: text('في المطعم', 'Dine in'), value: number(data.kpis.dineIn.value), figure: data.kpis.dineIn },
    { key: 'pickup', icon: ShoppingBagOpenIcon, tone: 'yellow', label: text('تيك أواي', 'Take away'), value: number(data.kpis.pickup.value), figure: data.kpis.pickup },
  ];
  return <section className="ov-kpis" aria-label={text('أرقام الفترة', 'Headline figures')}>
    {cards.map(card => <div key={card.key} className="ov-card ov-kpi" data-testid={`ov-kpi-${card.key}`}>
      <div className="ov-kpi-head"><h3>{card.label}</h3><Trend figure={card.figure} period={data.period} /></div>
      <div className="ov-kpi-body">
        <span className={`ov-icon tone-${card.tone}`} aria-hidden="true"><card.icon size={20} weight="bold" /></span>
        <strong className="ov-kpi-value">{card.value}</strong>
      </div>
    </div>)}
  </section>;
}

function Sales({ data }: { data: RestaurantOverview }) {
  const { text, number, language } = useLanguage();
  const locale = language === 'ar' ? 'ar-EG' : 'en-US';
  const hourly = data.bucket === 'hour';
  let rows = data.sales;
  if (hourly) {
    // The day starts at the first hour with orders (one hour before it), and at least the last 8 hours show.
    const first = rows.findIndex(row => row.orders > 0);
    const from = Math.max(0, Math.min(first < 0 ? rows.length : first - 1, rows.length - 8));
    rows = rows.slice(from);
  }
  const money = data.financial;
  const hourLabel = (at: string) => new Intl.DateTimeFormat(locale, { hour: 'numeric', timeZone: 'UTC' }).format(new Date(`${at}:00Z`));
  const dayLabel = (at: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${at}T00:00:00Z`));
  const points: SalesPoint[] = rows.map(row => ({
    key: row.at,
    label: hourly ? hourLabel(row.at) : dayLabel(row.at),
    value: money ? row.revenuePiastres / 100 : row.orders,
    tooltip: money ? formatPrice(row.revenuePiastres, language) : text(`${number(row.orders)} طلب`, `${row.orders} orders`),
  }));
  const empty = rows.every(row => row.orders === 0);
  return <section className="ov-card ov-sales" aria-labelledby="ov-sales-title">
    <header className="ov-card-head">
      <h2 id="ov-sales-title">{hourly ? text('مبيعات النهارده', 'Daily sales') : text('المبيعات يوم بيوم', 'Sales by day')}</h2>
      <span className="ov-card-note">{money ? text('بالجنيه', 'In EGP') : text('عدد الطلبات', 'Orders')}</span>
    </header>
    {empty
      ? <div className="ov-empty"><ForkKnifeIcon size={28} aria-hidden="true" /><p>{hourly ? text('لسه مفيش طلبات النهارده. أول طلب هيظهر هنا.', 'No orders yet today. The first one will show here.') : text('مفيش طلبات في الفترة دي.', 'No orders in this period.')}</p></div>
      : <SalesChart points={points} label={hourly ? text('المبيعات بالساعة', 'Sales by hour') : text('المبيعات بالأيام', 'Sales by day')}
        axisFormat={value => (money ? formatCompactPrice(value * 100, language).replace(/\s*(ج\.م|EGP)\s*/g, '') : number(value))} />}
  </section>;
}

function Income({ data }: { data: RestaurantOverview }) {
  const { text, number, language } = useLanguage();
  const name = (row: { nameAr: string; nameEn: string | null }) => (language === 'en' ? row.nameEn || row.nameAr : row.nameAr);
  let slices: DonutSlice[];
  let total: string;
  if (data.financial) {
    const [first, second, ...rest] = data.income.categories;
    const share = (value: number) => (data.income.totalPiastres ? number(value / data.income.totalPiastres, { style: 'percent', maximumFractionDigits: 0 }) : '—');
    const others = rest.reduce((sum, row) => sum + row.revenuePiastres, 0);
    slices = [
      ...(first ? [{ key: first.id ?? 'none-1', label: name(first), value: first.revenuePiastres, color: SLICE_COLORS[0]!, detail: share(first.revenuePiastres) }] : []),
      ...(second ? [{ key: second.id ?? 'none-2', label: name(second), value: second.revenuePiastres, color: SLICE_COLORS[1]!, detail: share(second.revenuePiastres) }] : []),
      ...(rest.length ? [{ key: 'others', label: text('أخرى', 'Others'), value: others, color: SLICE_COLORS[2]!, detail: share(others) }] : []),
    ];
    total = formatCompactPrice(data.income.totalPiastres, language);
  } else {
    // Without access to revenue: the orders by type.
    slices = [
      { key: 'dine-in', label: text('في المطعم', 'Dine in'), value: data.kpis.dineIn.value, color: SLICE_COLORS[0]!, detail: number(data.kpis.dineIn.value) },
      { key: 'pickup', label: text('تيك أواي', 'Take away'), value: data.kpis.pickup.value, color: SLICE_COLORS[2]!, detail: number(data.kpis.pickup.value) },
    ];
    total = number(data.kpis.orders.value);
  }
  return <section className="ov-card ov-income" aria-labelledby="ov-income-title">
    <header className="ov-card-head"><h2 id="ov-income-title">{data.financial ? text('إجمالي الدخل', 'Total income') : text('الطلبات حسب النوع', 'Orders by type')}</h2></header>
    {slices.length === 0
      ? <div className="ov-empty"><p>{text('لسه مفيش دخل في الفترة دي.', 'No income in this period yet.')}</p></div>
      : <IncomeDonut slices={slices} total={total} label={data.financial ? text('الدخل حسب القسم', 'Income by category') : text('الطلبات حسب النوع', 'Orders by type')} />}
  </section>;
}

function DishThumb({ dish }: { dish: OverviewDish }) {
  const image = dish.image;
  return <span className="ov-dish-thumb" aria-hidden="true">
    {image ? <img src={image.sources[0]?.url ?? image.url} srcSet={image.sources.map(source => `${source.url} ${source.width}w`).join(', ')} sizes="48px" alt="" loading="lazy" /> : <ForkKnifeIcon size={20} />}
  </span>;
}

function ViewAll({ to, label }: { to: string; label: string }) {
  const { language } = useLanguage();
  const Arrow = language === 'ar' ? ArrowLeftIcon : ArrowRightIcon;
  return <Link className="ov-view-all" to={to}>{label}<Arrow size={14} weight="bold" aria-hidden="true" /></Link>;
}

function Trending({ data }: { data: RestaurantOverview }) {
  const { text, number, language } = useLanguage();
  const { can } = useWorkspace();
  const name = (dish: OverviewDish) => (language === 'en' ? dish.nameEn || dish.nameAr : dish.nameAr);
  return <section className="ov-card ov-dishes" aria-labelledby="ov-trending-title" data-testid="ov-trending">
    <header className="ov-card-head">
      <h2 id="ov-trending-title">{text('الأكتر طلبًا', 'Trending dishes')}</h2>
      {can('analytics.view') && <ViewAll to="/insights" label={text('شوف الكل', 'View all')} />}
    </header>
    <p className="ov-subhead">{text('الأصناف', 'Dishes')}</p>
    {data.trending.length === 0
      ? <p className="ov-muted">{text('أول ما الطلبات توصل، أكتر الأصناف طلبًا هتظهر هنا.', 'Once orders come in, the most ordered dishes show here.')}</p>
      : <ul className="ov-dish-grid">{data.trending.map(dish => <li key={dish.menuItemId ?? dish.nameAr} className="ov-dish">
        <DishThumb dish={dish} />
        <span><strong><bdi>{name(dish)}</bdi></strong><small>{text('طلبات', 'Orders')}: <em>{number(dish.quantity)}</em></small></span>
      </li>)}</ul>}
  </section>;
}

function SoldOut({ data }: { data: RestaurantOverview }) {
  const { text, number, language } = useLanguage();
  const { can } = useWorkspace();
  const name = (dish: OverviewDish) => (language === 'en' ? dish.nameEn || dish.nameAr : dish.nameAr);
  const to = can('menu.manage') ? '/menu' : '/branches/menu';
  return <section className="ov-card ov-dishes" aria-labelledby="ov-soldout-title" data-testid="ov-sold-out">
    <header className="ov-card-head">
      <h2 id="ov-soldout-title">{text('خلصان', 'Out of stock')}{data.soldOutTotal > 0 && <span className="ov-count">{number(data.soldOutTotal)}</span>}</h2>
      {(can('menu.manage') || can('menu.branch')) && <ViewAll to={to} label={text('شوف الكل', 'View all')} />}
    </header>
    <p className="ov-subhead">{text('الأصناف', 'Dishes')}</p>
    {data.soldOut.length === 0
      ? <p className="ov-muted">{text('كل الأصناف متاحة دلوقتي.', 'Every dish is available right now.')}</p>
      : <ul className="ov-dish-grid">{data.soldOut.map(dish => <li key={`${dish.menuItemId}-${dish.branchName ?? ''}`} className="ov-dish">
        <DishThumb dish={dish} />
        <span><strong><bdi>{name(dish)}</bdi></strong>
          <small>{dish.branchName ? <>{text('خلصان في', 'Sold out at')}: <em><bdi>{dish.branchName}</bdi></em></> : <em>{text('خلصان في كل الفروع', 'Sold out everywhere')}</em>}{dish.byInventory && text(' (المخزون)', ' (stock)')}</small>
        </span>
      </li>)}</ul>}
  </section>;
}
