import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ClockCounterClockwiseIcon } from '@phosphor-icons/react';
import { CompactMeta } from '../../../components/CompactMeta';
import { ErrorPanel } from '../../../components/ErrorBoundary';
import { PageHeader } from '../../../components/PageHeader';
import { Pagination } from '../../../components/Pagination';
import { Skeleton } from '../../../components/Skeleton';
import { ordersApi } from '../../../lib/api/endpoints';
import { formatDate, formatPrice } from '../../../lib/format';
import { useLanguage, usePageTitle } from '../../../lib/language';
import { queryKeys } from '../queries';
import { OrderNo, orderTypeName, OrderStatusBadge } from './labels';
import { OrderDetailDialog } from './OrderDetailDialog';
import { OrdersTabs, useBoardBranches } from './OrdersBoardPage';
import { useCopy } from '../../../lib/copy';

const PAGE_SIZE = 20;

/** Completed, rejected and cancelled orders, newest first. */
export function OrderHistoryPage() {
  const { text, number, language } = useLanguage();
  usePageTitle('الطلبات السابقة', 'Order history');
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const [viewing, setViewing] = useState<string | null>(null);
  const t = useCopy();
  const { scope, labelled } = useBoardBranches();
  const history = useQuery({
    queryKey: queryKeys.orderHistory(scope, page),
    queryFn: () => ordersApi.list({ view: 'history', page, pageSize: PAGE_SIZE, branchId: scope === 'all' ? null : scope }),
    placeholderData: previous => previous,
  });

  return <div className="page orders-page">
    <PageHeader title={text('الطلبات', 'Orders')} description={text('كل الطلبات اللي اتسلّمت أو اترفضت أو اتلغت، الأحدث الأول.', 'Every completed, rejected or cancelled order, newest first.')} />
    <OrdersTabs />
    <section className="card list-card" aria-labelledby="history-title" aria-busy={history.isFetching}>
      <h2 id="history-title" className="visually-hidden">{text('الطلبات السابقة', 'Order history')}</h2>
      {history.isError && <ErrorPanel error={history.error} onRetry={() => void history.refetch()} />}
      {history.isPending && <div className="table-skeleton" role="status" aria-label={text('جاري التحميل', 'Loading')}>{[0, 1, 2, 3].map(index => <Skeleton key={index} height={44} />)}</div>}
      {history.data && history.data.items.length === 0 && <div className="empty-state">
        <span className="empty-state-icon" aria-hidden="true"><ClockCounterClockwiseIcon size={30} /></span>
        <h2>{text('مفيش طلبات سابقة لسه', 'No past orders yet')}</h2>
        <p>{text('أول ما تسلّم أو ترفض طلب هيظهر هنا.', 'Orders appear here once they are completed, rejected or cancelled.')}</p>
      </div>}
      {history.data && history.data.items.length > 0 && <div className="table-scroll">
        <table className="data-table history-table">
          <thead><tr>
            <th scope="col">{text('رقم الطلب', 'Order')}</th>
            <th scope="col">{text('التاريخ', 'Date')}</th>
            {labelled && <th scope="col">{t.ordersBranch.branchLabel}</th>}
            <th scope="col">{text('النوع', 'Type')}</th>
            <th scope="col">{text('الزبون', 'Customer')}</th>
            <th scope="col">{text('الحالة', 'Status')}</th>
            <th scope="col">{text('الإجمالي', 'Total')}</th>
            <th scope="col"><span className="visually-hidden">{text('إجراءات', 'Actions')}</span></th>
          </tr></thead>
          <tbody>
            {history.data.items.map(order => <tr key={order.id} data-testid={`history-${order.number}`}>
              <td className="cell-primary"><span className="history-number"><OrderNo number={order.number} /></span></td>
              <td data-label={text('التاريخ', 'Date')} className="cell-nowrap">{formatDate(order.placedAt, language, { dateStyle: 'medium' })}<small>{formatDate(order.placedAt, language, { timeStyle: 'short' })}</small></td>
              {labelled && <td data-label={t.ordersBranch.branchLabel}><bdi>{order.branchName}</bdi></td>}
              <td data-label={text('النوع', 'Type')}>{orderTypeName(order.type, text)}{order.type === 'DINE_IN' && order.tableLabel && <small><bdi>{order.tableLabel}</bdi></small>}</td>
              <td data-label={text('الزبون', 'Customer')}><bdi>{order.customerName}</bdi></td>
              <td data-label={text('الحالة', 'Status')} className="cell-end"><OrderStatusBadge status={order.status} /></td>
              <td data-label={text('الإجمالي', 'Total')} className="cell-amount">{formatPrice(order.subtotalPiastres, language)}</td>
              <CompactMeta parts={[formatDate(order.placedAt, language, { dateStyle: 'medium', timeStyle: 'short' }), labelled && <bdi>{order.branchName}</bdi>,
                order.type === 'DINE_IN' && order.tableLabel ? <bdi>{order.tableLabel}</bdi> : orderTypeName(order.type, text),
                <bdi>{order.customerName}</bdi>, formatPrice(order.subtotalPiastres, language)]} />
              <td className="cell-action cell-action-inline">
                <button type="button" className="button button-secondary button-small row-link" onClick={() => setViewing(order.id)}
                  aria-label={text(`التفاصيل: طلب #${number(order.number)}`, `Details: order #${order.number}`)}>{text('التفاصيل', 'Details')}</button>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>}
    </section>
    {history.data && <Pagination page={page} pageSize={history.data.pageSize} total={history.data.total} label={text('صفحات الطلبات', 'Order pages')}
      onChange={next => setParams(next === 1 ? {} : { page: String(next) })} />}
    <OrderDetailDialog orderId={viewing} onClose={() => setViewing(null)} />
  </div>;
}
