import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ErrorPanel } from '../../../components/ErrorBoundary';
import { Section } from '../../../components/Section';
import { Skeleton } from '../../../components/Skeleton';
import { kitchenStationsApi } from '../../../lib/api/endpoints';
import { useLanguage } from '../../../lib/language';
import { queryKeys } from '../queries';

const PERIODS = [1, 7, 30] as const;

/**
 * How the kitchen is doing over a period: average preparation time, time from order to ready, how
 * many orders were late, and how many went out without a dish being sent back or cancelled.
 */
export function KitchenInsights({ branchId = null }: { branchId?: string | null }) {
  const { text, number } = useLanguage();
  const [days, setDays] = useState<(typeof PERIODS)[number]>(7);
  const stats = useQuery({ queryKey: queryKeys.kitchenStats(days, branchId), queryFn: () => kitchenStationsApi.stats(days, branchId) });
  const minutes = (value: number | null) => (value === null ? '—' : text(`${number(value)} د`, `${value} min`));
  const percent = (value: number | null) => (value === null ? '—' : `${number(Math.round(value * 100))}${text('٪', '%')}`);
  const data = stats.data;
  return <Section id="kitchen-insights-title" title={text('أداء المطبخ', 'Kitchen performance')}
    description={text('من الطلبات اللي جهزت في الفترة دي.', 'From orders that reached ready in this period.')}
    actions={<div className="segmented" role="radiogroup" aria-label={text('الفترة', 'Period')}>
      {PERIODS.map(value => <label key={value}>
        <input type="radio" name="kitchen-period" checked={days === value} onChange={() => setDays(value)} />
        {value === 1 ? text('النهارده', 'Today') : text(`${number(value)} يوم`, `${value} days`)}
      </label>)}
    </div>}>
    {stats.isPending && <Skeleton height={120} />}
    {stats.isError && <ErrorPanel error={stats.error} onRetry={() => void stats.refetch()} />}
    {data && <>
      <dl className="kitchen-metrics" data-testid="kitchen-metrics">
        <div><dt>{text('متوسط وقت التحضير', 'Average prep time')}</dt><dd>{minutes(data.averagePrepMinutes)}</dd></div>
        <div><dt>{text('من الطلب لحد ما يجهز', 'Order to ready')}</dt><dd>{minutes(data.averagePlacedToReadyMinutes)}</dd></div>
        <div className={data.delayRate && data.delayRate > 0.2 ? 'is-bad' : undefined}><dt>{text('نسبة التأخير', 'Delay rate')}</dt><dd>{percent(data.delayRate)}</dd>
          <small>{text(`${number(data.delayed)} من ${number(data.orders)} طلب`, `${data.delayed} of ${data.orders} orders`)}</small></div>
        <div><dt>{text('دقة التحضير', 'Preparation accuracy')}</dt><dd>{percent(data.accuracyRate)}</dd>
          <small>{text('من غير صنف رجع أو اتلغى', 'No dish sent back or cancelled')}</small></div>
      </dl>
      {data.stations.length > 0 && <table className="kitchen-stations-table">
        <thead><tr><th scope="col">{text('المحطة', 'Station')}</th><th scope="col">{text('أصناف', 'Dishes')}</th><th scope="col">{text('متوسط التحضير', 'Avg prep')}</th><th scope="col">{text('متأخرة', 'Late')}</th></tr></thead>
        <tbody>{data.stations.map(station => <tr key={station.id ?? 'none'}>
          <th scope="row"><bdi>{station.id ? station.name : text('طلبات قبل المحطات', 'Before stations')}</bdi></th><td>{number(station.items)}</td><td>{minutes(station.averagePrepMinutes)}</td><td>{number(station.delayed)}</td>
        </tr>)}</tbody>
      </table>}
    </>}
  </Section>;
}
