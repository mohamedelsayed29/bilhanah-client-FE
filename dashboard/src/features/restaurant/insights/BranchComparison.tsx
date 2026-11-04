import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { StorefrontIcon } from '@phosphor-icons/react';
import type { BranchComparison as Comparison, StatsPeriod } from '@bilhanah/contracts';
import { BarList } from '../../../components/charts/BarList';
import { CompactMeta } from '../../../components/CompactMeta';
import { ErrorPanel } from '../../../components/ErrorBoundary';
import { Section } from '../../../components/Section';
import { Skeleton } from '../../../components/Skeleton';
import { restaurantApi } from '../../../lib/api/endpoints';
import { fill, useCopy } from '../../../lib/copy';
import { formatPrice } from '../../../lib/format';
import { useLanguage } from '../../../lib/language';
import { queryKeys } from '../queries';

/** Branches by revenue, then orders; archived ones with nothing in the period are left out. */
export function comparisonRows(comparison: Comparison): Comparison['branches'] {
  return comparison.branches
    .filter(branch => branch.isActive || branch.orders > 0)
    .sort((a, b) => b.revenuePiastres - a.revenuePiastres || b.orders - a.orders);
}

/** Every branch side by side over the period: orders, revenue, average ticket, prep time, order types and revenue share. */
export function BranchComparison({ days }: { days: StatsPeriod }) {
  const t = useCopy();
  const { number, language } = useLanguage();
  const copy = t.insightsBranch;
  const comparison = useQuery({
    queryKey: queryKeys.branchStats(days),
    queryFn: ({ signal }) => restaurantApi.branchStats(days, signal),
    placeholderData: keepPreviousData,
  });
  const rows = comparison.data ? comparisonRows(comparison.data) : [];
  const total = rows.reduce((sum, row) => sum + row.orders, 0);
  const prep = (minutes: number | null) => (minutes === null ? copy.noPrep : minutes < 1 ? copy.underMinute : fill(copy.minutes, { n: number(Math.round(minutes)) }));
  // Small shares keep a decimal, so a branch with some revenue never reads 0%.
  const share = (value: number) => number(value, { style: 'percent', maximumFractionDigits: value > 0 && value < 0.1 ? 1 : 0 });
  return <Section id="compare-title" title={copy.compareTitle} description={copy.compareHint} data-testid="branch-comparison"
    className={comparison.isPlaceholderData ? 'is-refreshing' : ''} aria-busy={comparison.isFetching}>
    {comparison.isPending && <div className="skeleton-stack"><Skeleton height={44} /><Skeleton height={44} /></div>}
    {comparison.isError && !comparison.data && <ErrorPanel error={comparison.error} onRetry={() => void comparison.refetch()} />}
    {comparison.data && total === 0 && <p className="muted empty-line">{copy.empty}</p>}
    {comparison.data && total > 0 && <div className="branch-compare">
      <div className="table-scroll top-dishes-wrap"><table className="data-table branch-compare-table">
        <thead><tr>
          <th scope="col">{copy.branch}</th>
          <th scope="col">{copy.orders}</th>
          <th scope="col">{copy.revenue}</th>
          <th scope="col">{copy.average}</th>
          <th scope="col"><abbr title={copy.prepHint}>{copy.prep}</abbr></th>
          <th scope="col">{copy.dineIn}</th>
          <th scope="col">{copy.pickup}</th>
          <th scope="col">{copy.share}</th>
        </tr></thead>
        <tbody>{rows.map(row => <tr key={row.id} data-testid={`compare-${row.slug}`}>
          <td className="cell-primary"><bdi>{row.name}</bdi>{!row.isActive && <small>{copy.archived}</small>}</td>
          <td data-label={copy.orders} className="cell-nowrap tnum">{number(row.orders)}</td>
          <td data-label={copy.revenue} className="cell-amount cell-end">{formatPrice(row.revenuePiastres, language)}</td>
          <td data-label={copy.average} className="cell-nowrap">{formatPrice(row.averageOrderPiastres, language)}</td>
          <td data-label={copy.prep} className="cell-nowrap">{prep(row.medianPrepMinutes)}</td>
          <td data-label={copy.dineIn} className="cell-nowrap tnum">{number(row.dineIn)}</td>
          <td data-label={copy.pickup} className="cell-nowrap tnum">{number(row.pickup)}</td>
          <td data-label={copy.share} className="cell-nowrap tnum">{share(row.revenueShare)}</td>
          <CompactMeta parts={[
            `${copy.orders} ${number(row.orders)}`, `${copy.average} ${formatPrice(row.averageOrderPiastres, language)}`,
            `${copy.prep} ${prep(row.medianPrepMinutes)}`, `${copy.dineIn} ${number(row.dineIn)}`, `${copy.pickup} ${number(row.pickup)}`,
          ]} />
        </tr>)}</tbody>
      </table></div>
      <BarList label={copy.shareLabel} format={value => formatPrice(value, language)}
        items={rows.map(row => ({ key: row.id, icon: <StorefrontIcon size={18} />, label: <bdi>{row.name}</bdi>, value: row.revenuePiastres }))} />
    </div>}
  </Section>;
}
