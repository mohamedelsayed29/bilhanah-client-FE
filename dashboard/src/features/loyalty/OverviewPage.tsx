import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowsCounterClockwiseIcon, CoinsIcon, GiftIcon, HourglassLowIcon, SealPercentIcon, UserPlusIcon, UsersThreeIcon, WalletIcon } from '@phosphor-icons/react';
import type { LoyaltyAnalytics } from '@bilhanah/contracts';
import { Alert } from '../../components/Alert';
import { BarList } from '../../components/charts/BarList';
import { DailyChart, type ChartSeries } from '../../components/charts/DailyChart';
import { PeriodSwitch, periodLabel, usePeriodParam } from '../../components/charts/PeriodSwitch';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Section } from '../../components/Section';
import { Skeleton } from '../../components/Skeleton';
import { StatCard } from '../../components/StatCard';
import { loyaltyApi } from '../../lib/api/endpoints';
import { useLanguage, usePageTitle } from '../../lib/language';
import { useWorkspace } from '../branches/workspace';
import { loyaltyKeys, useLoyaltyFormat } from './shared';

/** How the program is doing: the three success measures first, then members, points and rewards. */
export function LoyaltyOverviewPage() {
  const { text, number } = useLanguage();
  usePageTitle('برنامج الولاء', 'Loyalty program');
  const [days, setDays] = usePeriodParam(30);
  const stats = useQuery({ queryKey: loyaltyKeys.analytics(days), queryFn: () => loyaltyApi.analytics(days), placeholderData: keepPreviousData });
  return <>
    <div className="rv-toolbar"><PeriodSwitch value={days} onChange={setDays} /></div>
    <p className="visually-hidden" role="status" aria-live="polite">{stats.isFetching ? text('بنحمّل الأرقام…', 'Loading figures…') : stats.data ? text(`بنعرض ${periodLabel(days, text, number)}`, `Showing the ${periodLabel(days, text, number).toLowerCase()}`) : ''}</p>
    {stats.isError && !stats.data && <ErrorPanel error={stats.error} onRetry={() => void stats.refetch()} />}
    {stats.isPending && <div className="rv-insights-skeleton"><Skeleton height={150} /><Skeleton height={240} /></div>}
    {stats.data && <div className={`insights-body ly-overview ${stats.isPlaceholderData ? 'is-refreshing' : ''}`} aria-busy={stats.isFetching} data-testid="ly-overview">
      {stats.isError && <Alert kind="error" title={text('مقدرناش نحدّث الأرقام', 'We couldn’t refresh the figures')}>{text('بنعرض آخر أرقام وصلتنا.', 'Showing the last figures we received.')}</Alert>}
      <Headline stats={stats.data} />
      <Figures stats={stats.data} />
      <Section id="ly-daily" title={text('النقاط يوم بيوم', 'Points day by day')} description={text('النقاط اللي الأعضاء كسبوها واللي استبدلوها كل يوم، بتوقيت مطعمك.', 'Points members earned and redeemed each day, in your restaurant’s time zone.')}>
        {stats.data.pointsIssued === 0 && stats.data.pointsRedeemed === 0
          ? <div className="empty-state chart-empty" data-testid="ly-daily-empty"><h3>{text('لسه مفيش نقاط في الفترة دي', 'No points in this period yet')}</h3>
            <p>{text('أول ما الزباين يطلبوا برقم موبايلهم والطلب يكمل، النقاط هتظهر هنا.', 'Once diners order with their phone number and the order completes, points show up here.')}</p></div>
          : <PointsChart stats={stats.data} />}
      </Section>
      <TopRewards stats={stats.data} />
    </div>}
  </>;
}

/** The program's success measures: do customers come back, do they use their points, and what returning customers spend. */
function Headline({ stats }: { stats: LoyaltyAnalytics }) {
  const { text, number } = useLanguage();
  const format = useLoyaltyFormat();
  const returningShare = stats.revenuePiastres ? stats.returningRevenuePiastres / stats.revenuePiastres : null;
  return <section className="card ly-headline" aria-labelledby="ly-headline-title" data-testid="ly-headline">
    <h2 id="ly-headline-title" className="visually-hidden">{text('مقاييس نجاح البرنامج', 'Program success measures')}</h2>
    <div className="ly-kpi" data-testid="ly-repeat-rate">
      <span className="ly-kpi-icon tone-success" aria-hidden="true"><ArrowsCounterClockwiseIcon size={20} weight="bold" /></span>
      <span className="ly-kpi-label">{text('الزباين اللي بيرجعوا', 'Repeat customer rate')}</span>
      <strong className="ly-kpi-value">{format.percent(stats.repeatCustomerRate)}</strong>
      <small>{text(`${number(stats.returningCustomers)} من ${number(stats.customers)} زبون طلبوا أكتر من مرة`, `${stats.returningCustomers} of ${stats.customers} customers ordered more than once`)}</small>
    </div>
    <div className="ly-kpi" data-testid="ly-redemption-rate">
      <span className="ly-kpi-icon tone-info" aria-hidden="true"><SealPercentIcon size={20} weight="bold" /></span>
      <span className="ly-kpi-label">{text('نسبة الاستبدال', 'Redemption rate')}</span>
      <strong className="ly-kpi-value">{format.percent(stats.redemptionRate)}</strong>
      <small>{text(`${format.points(stats.pointsRedeemed)} اتصرفوا من ${format.points(stats.pointsIssued)}`, `${format.points(stats.pointsRedeemed)} spent of ${format.points(stats.pointsIssued)} earned`)}</small>
    </div>
    <div className="ly-kpi" data-testid="ly-returning-revenue">
      <span className="ly-kpi-icon tone-guava" aria-hidden="true"><WalletIcon size={20} weight="bold" /></span>
      <span className="ly-kpi-label">{text('إيراد الزباين الراجعين', 'Revenue from returning customers')}</span>
      <strong className="ly-kpi-value">{format.money(stats.returningRevenuePiastres)}</strong>
      <small>{returningShare === null ? text('لسه مفيش طلبات مكتملة', 'No completed orders yet') : text(`${format.percent(returningShare)} من إيراد الفترة (${format.money(stats.revenuePiastres)})`, `${format.percent(returningShare)} of the period’s revenue (${format.money(stats.revenuePiastres)})`)}</small>
    </div>
  </section>;
}

function Figures({ stats }: { stats: LoyaltyAnalytics }) {
  const { text, number } = useLanguage();
  const { to } = useWorkspace();
  const format = useLoyaltyFormat();
  return <section aria-labelledby="ly-figures-title">
    <h2 id="ly-figures-title" className="visually-hidden">{text('الأعضاء والنقاط', 'Members and points')}</h2>
    <div className="inv-stats ly-figures">
      <StatCard to={to('/loyalty/members')} icon={UsersThreeIcon} tone="info" testId="ly-members" label={text('الأعضاء', 'Members')} value={number(stats.members)}
        note={text(`${number(stats.activeMembers)} نشيطين في الفترة`, `${stats.activeMembers} active in the period`)} />
      <StatCard icon={UserPlusIcon} tone="success" testId="ly-new-members" label={text('أعضاء جداد', 'New members')} value={number(stats.newMembers)}
        note={text('انضموا في الفترة دي', 'Joined in this period')} />
      <StatCard icon={CoinsIcon} tone="guava" testId="ly-outstanding" label={text('نقاط مع الأعضاء', 'Points held by members')} value={number(stats.outstandingPoints)}
        note={text('رصيد لسه ممكن يتصرف', 'Balance that can still be redeemed')} />
      <StatCard icon={GiftIcon} tone={stats.rewardsRedeemed ? 'success' : 'muted'} testId="ly-rewards-redeemed" label={text('مكافآت اتصرفت', 'Rewards redeemed')} value={number(stats.rewardsRedeemed)}
        note={text(`خصم ${format.money(stats.discountPiastres)} على الطلبات`, `${format.money(stats.discountPiastres)} off orders`)} />
      <StatCard icon={HourglassLowIcon} tone={stats.pointsExpired ? 'warning' : 'muted'} testId="ly-expired" label={text('نقاط انتهت', 'Points expired')} value={number(stats.pointsExpired)}
        note={text('من غير نشاط في المدة المحددة', 'After the inactivity period')} />
    </div>
  </section>;
}

function PointsChart({ stats }: { stats: LoyaltyAnalytics }) {
  const { text, number } = useLanguage();
  const days = stats.daily.map(day => ({ date: day.day, issued: day.issued, redeemed: day.redeemed }));
  const series: ChartSeries<(typeof days)[number]>[] = [
    { key: 'issued', label: text('نقاط اتكسبت', 'Points earned'), format: value => number(value), total: number(stats.pointsIssued) },
    { key: 'redeemed', label: text('نقاط اتصرفت', 'Points redeemed'), format: value => number(value), total: number(stats.pointsRedeemed) },
  ];
  return <DailyChart days={days} series={series} label={text('النقاط يوم بيوم', 'Points day by day')} />;
}

function TopRewards({ stats }: { stats: LoyaltyAnalytics }) {
  const { text, count } = useLanguage();
  const format = useLoyaltyFormat();
  return <Section id="ly-top-rewards" title={text('أكتر مكافآت اتطلبت', 'Most redeemed rewards')} description={text('المكافآت اللي الأعضاء صرفوا نقاطهم عليها في الفترة دي، والخصم اللي اتعمل.', 'Rewards members spent their points on in this period, and the discount given.')}>
    {stats.topRewards.length === 0
      ? <p className="muted empty-line">{text('لسه محدش استبدل مكافأة في الفترة دي.', 'Nobody redeemed a reward in this period yet.')}</p>
      : <BarList label={text('المكافآت حسب مرات الاستبدال', 'Rewards by redemptions')}
        items={stats.topRewards.map(reward => ({ key: reward.id ?? reward.name, label: <bdi>{reward.name}</bdi>, hint: text(`خصم ${format.money(reward.discountPiastres)}`, `${format.money(reward.discountPiastres)} off`), value: reward.redemptions }))}
        format={value => count(value, [{ one: 'مرة', two: 'مرتين', few: '{n} مرات', many: '{n} مرة', zero: 'ولا مرة' }, { one: '{n} time', other: '{n} times', zero: 'never' }])} />}
  </Section>;
}
