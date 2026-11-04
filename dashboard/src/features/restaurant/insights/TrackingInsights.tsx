import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BellRingingIcon, ChatCircleDotsIcon, DeviceMobileIcon, TimerIcon } from '@phosphor-icons/react';
import type { StatsPeriod } from '@bilhanah/contracts';
import { ErrorPanel } from '../../../components/ErrorBoundary';
import { Section } from '../../../components/Section';
import { Skeleton } from '../../../components/Skeleton';
import { ordersApi } from '../../../lib/api/endpoints';
import { useLanguage } from '../../../lib/language';
import { queryKeys } from '../queries';

/**
 * How diners follow their orders: who opened the tracking page, how many "ready" notifications
 * reached them, whether orders were ready by the time given, and how often a table asked the staff
 * while its order was on the way.
 */
export function TrackingInsights({ days, branchId }: { days: StatsPeriod; branchId: string | null }) {
  const { text, number } = useLanguage();
  const stats = useQuery({
    queryKey: queryKeys.orderTrackingStats(branchId ?? 'all', days),
    queryFn: () => ordersApi.trackingStats(days, branchId),
    placeholderData: keepPreviousData,
  });
  const percent = (value: number | null) => (value === null ? '—' : number(value, { style: 'percent', maximumFractionDigits: 0 }));
  const s = stats.data;
  const tiles = s ? [
    { key: 'tracking', icon: DeviceMobileIcon, value: percent(s.trackingRate), label: text('تابعوا طلبهم', 'Followed their order'),
      hint: text(`${number(s.tracked)} من ${number(s.orders)} طلب فتحوا صفحة المتابعة`, `${s.tracked} of ${s.orders} orders opened the tracking page`) },
    { key: 'delivery', icon: BellRingingIcon, value: percent(s.readyDeliveryRate), label: text('إشعار «جاهز» وصل', 'Ready alerts delivered'),
      hint: text(`${number(s.readyNotified)} من ${number(s.readyAlertOrders)} طلب مشغّل التنبيه`, `${s.readyNotified} of ${s.readyAlertOrders} orders with alerts on`) },
    { key: 'on-time', icon: TimerIcon, value: percent(s.onTimeRate), label: text('جهز في الوقت المتوقع', 'Ready on time'),
      hint: text(`${number(s.readyOnTime)} من ${number(s.estimatedOrders)} طلب ليه وقت متوقع`, `${s.readyOnTime} of ${s.estimatedOrders} orders with an estimate`) },
    { key: 'enquiries', icon: ChatCircleDotsIcon, value: number(s.statusEnquiries), label: text('سألوا الويتر وهما مستنيين', 'Asked staff while waiting'),
      hint: text('طلبات خدمة من طاولة طلبها لسه ما جهزش', 'Service requests from a table whose order was not ready yet') },
  ] : [];
  return <Section id="tracking-insights-title" title={text('متابعة الطلبات', 'Order tracking')}
    description={text('الزباين بيتابعوا طلباتهم لوحدهم؟ كل ما النسب دي تعلى، كل ما الأسئلة للويتر تقل.', 'Do diners follow their orders by themselves? The higher these go, the fewer questions for your staff.')}
    data-testid="tracking-insights" className={stats.isPlaceholderData ? 'is-refreshing' : ''} aria-busy={stats.isFetching}>
    {stats.isPending && <div className="skeleton-stack"><Skeleton height={88} /></div>}
    {stats.isError && !s && <ErrorPanel error={stats.error} onRetry={() => void stats.refetch()} />}
    {s && <div className="insights-kpis">
      {tiles.map(tile => <div key={tile.key} className="card kpi-card" data-testid={`tracking-${tile.key}`}>
        <span className="kpi-card-icon" aria-hidden="true"><tile.icon size={20} weight="bold" /></span>
        <span className="kpi-card-label">{tile.label}</span>
        <strong>{tile.value}</strong>
        <small>{tile.hint}</small>
      </div>)}
    </div>}
  </Section>;
}
