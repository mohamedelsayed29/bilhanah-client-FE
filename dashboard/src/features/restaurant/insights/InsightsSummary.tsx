import { Link } from 'react-router';
import { ArrowLeftIcon } from '@phosphor-icons/react';
import { formatPrice } from '../../../lib/format';
import { useLanguage } from '../../../lib/language';
import { Skeleton } from '../../../components/Skeleton';
import { useBranchScope } from '../../branches/BranchScope';
import { useStatsQuery } from '../queries';

/** The last 7 days on the overview as plain figures (visits, and orders and revenue with ordering); the charts live on the insights page. */
export function InsightsSummary() {
  const { text, number, language } = useLanguage();
  const scope = useBranchScope();
  // Orders of the branch being worked on (visits are always the whole restaurant's).
  const stats = useStatsQuery(7, scope.multi && scope.branch ? scope.branch.id : null);
  const data = stats.data;
  return <div className="figures-group" data-testid="insights-summary">
    <div className="figures-head">
      <h3 id="summary-title">{text('آخر ٧ أيام', 'Last 7 days')}</h3>
      <Link className="link-action summary-link" to="/insights">{text('كل الإحصائيات', 'All insights')}<ArrowLeftIcon size={14} className="directional" aria-hidden="true" /></Link>
    </div>
    {stats.isPending && <div className="figure-list" role="status" aria-label={text('جاري التحميل', 'Loading')}>
      {[0, 1, 2].map(index => <div key={index}><Skeleton width={80} height={13} /><Skeleton width={56} height={28} /></div>)}
    </div>}
    {stats.isError && !data && <p className="muted">{text('مقدرناش نجيب الأرقام دلوقتي.', 'We couldn’t load the figures right now.')}{' '}
      <button type="button" className="text-button" onClick={() => void stats.refetch()}>{text('حاول تاني', 'Try again')}</button></p>}
    {data && <dl className="figure-list" aria-labelledby="summary-title">
      <div data-testid="summary-visits"><dt>{text('الزيارات', 'Visits')}</dt><dd>{number(data.totals.visits)}</dd></div>
      {data.ordering && <>
        <div data-testid="summary-orders"><dt>{text('الطلبات', 'Orders')}</dt><dd>{number(data.totals.orders)}</dd></div>
        <div className="figure-wide"><dt>{text('الإيراد', 'Revenue')}</dt><dd>{formatPrice(data.totals.revenuePiastres, language)}</dd></div>
      </>}
    </dl>}
  </div>;
}
