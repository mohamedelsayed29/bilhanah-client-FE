import { Link } from 'react-router';
import { BagIcon, ChartLineUpIcon, CoinsIcon, EyeIcon, LinkIcon, QrCodeIcon, ReceiptIcon, StorefrontIcon, TableIcon } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import type { RestaurantStats, StatsPeriod, VisitSource } from '@bilhanah/contracts';
import { Alert } from '../../../components/Alert';
import { BarList } from '../../../components/charts/BarList';
import { DailyChart, type ChartSeries } from '../../../components/charts/DailyChart';
import { PeriodSwitch, periodLabel, usePeriodParam } from '../../../components/charts/PeriodSwitch';
import { CompactMeta } from '../../../components/CompactMeta';
import { ErrorPanel } from '../../../components/ErrorBoundary';
import { PageHeader } from '../../../components/PageHeader';
import { Section } from '../../../components/Section';
import { Skeleton } from '../../../components/Skeleton';
import { fill, useCopy } from '../../../lib/copy';
import { formatCompact, formatCompactPrice, formatPrice } from '../../../lib/format';
import { useLanguage, usePageTitle } from '../../../lib/language';
import { useBranchScope } from '../../branches/BranchScope';
import { useWorkspace } from '../../branches/workspace';
import { useStatsQuery } from '../queries';
import { BranchComparison } from './BranchComparison';
import { TrackingInsights } from './TrackingInsights';
import { dishName, hasStats, SOURCE_ORDER, statsDays } from './insights';

const SOURCES: Record<VisitSource, { icon: Icon; ar: string; en: string; hintAr: string; hintEn: string }> = {
  qr: { icon: QrCodeIcon, ar: 'كود QR بتاع المطعم', en: 'Your restaurant QR code', hintAr: 'الكود اللي نزّلته من صفحة كود QR', hintEn: 'The code from the QR code page' },
  table: { icon: TableIcon, ar: 'QR الطاولات', en: 'Table QR codes', hintAr: 'كل طاولة بالكود بتاعها', hintEn: 'Each table’s own code' },
  link: { icon: LinkIcon, ar: 'لينك المنيو', en: 'Menu link', hintAr: 'سوشيال، واتساب، أو اللينك على طول', hintEn: 'Social media, WhatsApp or the link itself' },
};

/** Owner analytics: visits, orders, revenue, how diners arrived and the dishes they order most. */
export function InsightsPage() {
  const { text, number } = useLanguage();
  const t = useCopy();
  usePageTitle('الإحصائيات', 'Insights');
  const [days, setDays] = usePeriodParam(30);
  const scope = useBranchScope();
  const { role } = useWorkspace();
  // One branch's orders when one is chosen (managers: always theirs); the whole restaurant otherwise.
  const branchId = scope.branch && (scope.multi || scope.locked) ? scope.branch.id : null;
  const stats = useStatsQuery(days, branchId);
  const showing = stats.data && !stats.isPlaceholderData ? stats.data : null;
  const compare = role === 'OWNER' && scope.multi && scope.selected === 'all';
  return <div className="page insights-page">
    <PageHeader title={text('الإحصائيات', 'Insights')}
      description={<>{text('مين فتح المنيو، وجالك كام طلب، وأكتر الأصناف اللي بتتطلب. الأيام محسوبة بتوقيت مطعمك.',
        'Who opened your menu, how many orders came in and what diners order most. Days follow your restaurant’s time zone.')}
        {branchId && scope.branch && <> {fill(t.insightsBranch.forBranch, { name: scope.branch.name })}</>}</>}
      actions={<PeriodSwitch value={days} onChange={setDays} />} />
    <p className="visually-hidden" role="status" aria-live="polite">
      {stats.isFetching ? text('بنحمّل الإحصائيات…', 'Loading insights…') : showing ? text(`بنعرض ${periodLabel(days, text, number)}`, `Showing the ${periodLabel(days, text, number).toLowerCase()}`) : ''}
    </p>
    {stats.isError && !stats.data && <ErrorPanel error={stats.error} onRetry={() => void stats.refetch()} />}
    {stats.isPending && <InsightsSkeleton />}
    {stats.data && <div className={`insights-body ${stats.isPlaceholderData ? 'is-refreshing' : ''}`} aria-busy={stats.isFetching}>
      {stats.isError && <Alert kind="error" title={text('مقدرناش نحدّث الأرقام', 'We couldn’t refresh the figures')}>{text('بنعرض آخر أرقام وصلتنا. جرّب تاني بعد شوية.', 'Showing the last figures we received. Please try again shortly.')}</Alert>}
      <InsightsBody stats={stats.data} days={days} branchView={branchId !== null} />
      {stats.data.ordering && <TrackingInsights days={days} branchId={branchId} />}
      {compare && <BranchComparison days={days} />}
    </div>}
  </div>;
}

function InsightsSkeleton() {
  const { text } = useLanguage();
  return <div className="insights-body" role="status" aria-label={text('جاري التحميل', 'Loading')}>
    <div className="insights-kpis">{[0, 1, 2, 3].map(index => <div className="card kpi-card" key={index}><Skeleton width={40} height={40} radius={12} /><Skeleton width={110} height={14} /><Skeleton width={70} height={28} /></div>)}</div>
    <div className="skeleton-stack"><Skeleton width="30%" height={20} /><Skeleton height={220} /></div>
  </div>;
}

function InsightsBody({ stats, days, branchView }: { stats: RestaurantStats; days: StatsPeriod; branchView: boolean }) {
  const { text, number, language } = useLanguage();
  const t = useCopy();
  const { role } = useWorkspace();
  const chartDays = statsDays(stats);
  const series: ChartSeries<(typeof chartDays)[number]>[] = [
    { key: 'visits', label: branchView ? `${text('الزيارات', 'Visits')} (${t.insightsBranch.visitsTag})` : text('الزيارات', 'Visits'), format: value => number(value), axisFormat: value => formatCompact(value, language), total: number(stats.totals.visits) },
  ];
  if (stats.ordering) {
    series.push({ key: 'orders', label: text('الطلبات', 'Orders'), format: value => number(value), axisFormat: value => formatCompact(value, language), total: number(stats.totals.orders) });
    series.push({ key: 'revenuePiastres', label: text('إيراد الطلبات', 'Order revenue'), format: value => formatPrice(value, language), axisFormat: value => formatCompactPrice(value, language), total: formatPrice(stats.totals.revenuePiastres, language) });
  }
  const empty = !hasStats(stats);
  return <>
    <Kpis stats={stats} days={days} branchView={branchView} />
    {branchView && <p className="insights-branch-note" data-testid="insights-visits-note">{t.insightsBranch.visitsNote}</p>}
    {!stats.ordering && <Alert kind="info" live={false} title={text('الإحصائيات هنا للزيارات بس', 'These insights cover visits only')}
      actions={role === 'OWNER' ? <Link className="link-action" to="/subscription">{text('شوف الباقات', 'See the plans')}</Link> : undefined}>
      {text('الطلبات من المنيو وأرقامها (الطلبات، الإيراد، أكتر الأصناف) موجودة في باقة «منيو وطلبات» و«التجربة الكاملة».',
        'Ordering from the menu, with its figures (orders, revenue, top dishes), comes with the Menu & Orders and Full Experience plans.')}
    </Alert>}
    <Section id="daily-title" title={text('يوم بيوم', 'Day by day')} description={text('مرّر على أي يوم أو دوس عليه عشان تشوف أرقامه.', 'Hover over or tap a day to see its figures.')}>
      {empty
        ? <EmptyPeriod owner={role === 'OWNER'} />
        : <DailyChart days={chartDays} series={series} label={text(`${series.map(entry => entry.label).join(' و')} كل يوم، ${periodLabel(days, text, number)}`, `${series.map(entry => entry.label).join(', ')} per day, ${periodLabel(days, text, number).toLowerCase()}`)} />}
    </Section>
    <div className="insights-grid">
      <Sources stats={stats} branchView={branchView} />
      {stats.ordering && <OrderTypes stats={stats} />}
    </div>
    {stats.ordering && <TopDishes stats={stats} />}
  </>;
}

function Kpis({ stats, days, branchView }: { stats: RestaurantStats; days: StatsPeriod; branchView: boolean }) {
  const { text, number, language } = useLanguage();
  const t = useCopy();
  const { totals } = stats;
  const tiles: { key: string; value: string; label: string; hint: string; icon: Icon }[] = [
    { key: 'visits', icon: EyeIcon, value: number(totals.visits), label: text('زيارات المنيو', 'Menu visits'),
      hint: branchView ? t.insightsBranch.visitsNote : totals.visits / days < 1
        ? text('أقل من زيارة في اليوم', 'Less than one a day')
        : text(`حوالي ${number(Math.round(totals.visits / days))} في اليوم`, `About ${Math.round(totals.visits / days)} a day`) },
  ];
  if (stats.ordering) {
    tiles.push(
      { key: 'orders', icon: ReceiptIcon, value: number(totals.orders), label: text('الطلبات', 'Orders'), hint: text('من غير المرفوض والملغي', 'Excluding rejected and cancelled') },
      { key: 'revenue', icon: CoinsIcon, value: formatPrice(totals.revenuePiastres, language), label: text('إيراد الطلبات', 'Order revenue'), hint: text('من الطلبات اللي اتعملت من المنيو', 'From orders placed on your menu') },
      { key: 'average', icon: ChartLineUpIcon, value: formatPrice(totals.averageOrderPiastres, language), label: text('متوسط الطلب', 'Average order'), hint: text('الإيراد ÷ عدد الطلبات', 'Revenue ÷ orders') },
    );
  }
  return <section aria-labelledby="insights-kpis">
    <h2 id="insights-kpis" className="visually-hidden">{text(`الأرقام، ${periodLabel(days, text, number)}`, `Key figures, ${periodLabel(days, text, number).toLowerCase()}`)}</h2>
    {/* One card per figure; revenue, the figure owners watch most, is the featured one. */}
    <div className={`insights-kpis ${tiles.length === 1 ? 'is-single' : ''}`}>
      {tiles.map(tile => <div key={tile.key} className={`card kpi-card ${tile.key === 'revenue' ? 'is-featured' : ''}`} data-testid={`kpi-${tile.key}`}>
        <span className="kpi-card-icon" aria-hidden="true"><tile.icon size={20} weight="bold" /></span>
        <span className="kpi-card-label">{tile.label}</span>
        <strong>{tile.value}</strong>
        <small>{tile.hint}</small>
      </div>)}
    </div>
  </section>;
}

function EmptyPeriod({ owner }: { owner: boolean }) {
  const { text } = useLanguage();
  return <div className="empty-state chart-empty" data-testid="insights-empty">
    <h3>{text('لسه مفيش زيارات في الفترة دي', 'No visits in this period yet')}</h3>
    <p>{text('اطبع كود QR وحطه على الترابيزات، أو شارك لينك المنيو على السوشيال، والأرقام هتبدأ تظهر هنا.',
      'Print your QR code for the tables or share your menu link on social media, and the figures will show up here.')}</p>
    {owner && <Link className="button button-secondary button-small" to="/qr-codes"><QrCodeIcon size={17} aria-hidden="true" />{text('كود QR', 'QR code')}</Link>}
  </div>;
}

function Sources({ stats, branchView }: { stats: RestaurantStats; branchView: boolean }) {
  const { text } = useLanguage();
  const t = useCopy();
  const total = SOURCE_ORDER.reduce((sum, source) => sum + stats.sources[source], 0);
  return <Section id="sources-title" title={text('الزباين وصلوا للمنيو إزاي', 'How diners found your menu')}
    description={branchView ? t.insightsBranch.visitsNote : text('من كل الزيارات في الفترة دي.', 'Out of all visits in this period.')}>
    {total === 0
      ? <p className="muted empty-line">{text('مفيش زيارات لسه.', 'No visits yet.')}</p>
      : <BarList label={text('مصادر الزيارات', 'Visit sources')} items={SOURCE_ORDER.map(source => {
          const entry = SOURCES[source];
          return { key: source, icon: <entry.icon size={18} />, label: text(entry.ar, entry.en), hint: text(entry.hintAr, entry.hintEn), value: stats.sources[source] };
        })} />}
    <p className="field-hint insights-note">{text('كود QR اللي اتطبع قبل تحديث الإحصائيات مسحه بيتحسب «لينك». نزّل الكود من جديد من صفحة كود QR عشان يتحسب صح.',
      'QR codes printed before insights launched count as “link”. Download your code again from the QR code page to count scans correctly.')}</p>
  </Section>;
}

function OrderTypes({ stats }: { stats: RestaurantStats }) {
  const { text } = useLanguage();
  const total = stats.ordersByType.DINE_IN + stats.ordersByType.PICKUP;
  return <Section id="types-title" title={text('صالة ولا تيك أواي', 'Dine-in or pickup')} description={text('الطلبات حسب نوعها.', 'Orders by type.')}>
    {total === 0
      ? <p className="muted empty-line">{text('مفيش طلبات في الفترة دي.', 'No orders in this period.')}</p>
      : <BarList label={text('الطلبات حسب النوع', 'Orders by type')} items={[
          { key: 'DINE_IN', icon: <StorefrontIcon size={18} />, label: text('صالة (على الترابيزة)', 'Dine-in (at the table)'), value: stats.ordersByType.DINE_IN },
          { key: 'PICKUP', icon: <BagIcon size={18} />, label: text('تيك أواي (استلام)', 'Pickup'), value: stats.ordersByType.PICKUP },
        ]} />}
  </Section>;
}

function TopDishes({ stats }: { stats: RestaurantStats }) {
  const { text, number, language } = useLanguage();
  const max = Math.max(1, ...stats.topItems.map(item => item.quantity));
  return <Section id="dishes-title" title={text('أكتر الأصناف اللي اتطلبت', 'Top dishes')} description={text('أعلى ٥ أصناف بالكمية في الفترة دي.', 'The five dishes ordered most in this period, by quantity.')}>
    {stats.topItems.length === 0
      ? <div className="empty-state chart-empty">
          <h3>{text('لسه مفيش أصناف اتطلبت', 'No dishes ordered yet')}</h3>
          <p>{text('أول ما الطلبات توصل من المنيو، هتشوف هنا الأصناف اللي الزباين بيحبوها.', 'Once orders arrive from your menu, the dishes diners love show up here.')}</p>
        </div>
      : <div className="table-scroll top-dishes-wrap"><table className="data-table top-dishes" data-testid="top-dishes">
          <thead><tr>
            <th scope="col">#</th>
            <th scope="col">{text('الصنف', 'Dish')}</th>
            <th scope="col">{text('الكمية', 'Quantity')}</th>
            <th scope="col">{text('الإيراد', 'Revenue')}</th>
          </tr></thead>
          <tbody>{stats.topItems.map((item, index) => <tr key={`${item.nameAr}-${index}`}>
            <td className="cell-rank" data-label="#"><span className={`dish-rank ${index === 0 ? 'is-first' : ''}`}>{number(index + 1)}</span></td>
            <td className="cell-primary" data-label={text('الصنف', 'Dish')}>{dishName(item, language)}
              <span className="bar-track dish-bar" aria-hidden="true"><span className="bar-fill" style={{ width: `${(item.quantity / max) * 100}%` }} /></span></td>
            <td data-label={text('الكمية', 'Quantity')} className="cell-nowrap">{number(item.quantity)}</td>
            <td data-label={text('الإيراد', 'Revenue')} className="cell-amount">{formatPrice(item.revenuePiastres, language)}</td>
            <CompactMeta parts={[text(`الكمية ${number(item.quantity)}`, `Quantity ${item.quantity}`), formatPrice(item.revenuePiastres, language)]} />
          </tr>)}</tbody>
        </table></div>}
  </Section>;
}
