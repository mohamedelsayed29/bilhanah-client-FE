import { useQuery } from '@tanstack/react-query';
import { Button } from '../../../components/Button';
import { Dialog } from '../../../components/Dialog';
import { ErrorPanel } from '../../../components/ErrorBoundary';
import { Skeleton } from '../../../components/Skeleton';
import { ordersApi } from '../../../lib/api/endpoints';
import { formatDate, formatPrice } from '../../../lib/format';
import { useLanguage } from '../../../lib/language';
import { useCopy } from '../../../lib/copy';
import { queryKeys } from '../queries';
import { OrderNo, OrderStatusBadge, statusName } from './labels';
import { useOrderPayment } from './mutations';
import { OrderLines, OrderWhere, PaymentBadge } from './OrderCard';
import { useWorkspace } from '../../branches/workspace';

/** One order in full (GET /v1/orders/:id): when each step happened, the dishes and the reason if it was closed early. */
export function OrderDetailDialog({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const { text, number, language } = useLanguage();
  const t = useCopy();
  const order = useQuery({ queryKey: queryKeys.order(orderId ?? ''), queryFn: () => ordersApi.get(orderId!), enabled: Boolean(orderId) });
  const data = order.data;
  const payment = useOrderPayment();
  const { can } = useWorkspace();
  // Marking paid takes payments.process; marking a paid bill unpaid again is a refund.
  const payable = data && data.type === 'DINE_IN' && data.status !== 'REJECTED' && data.status !== 'CANCELLED' && can(data.paidAt ? 'payments.refund' : 'payments.process');
  const when = (iso: string | null) => (iso ? formatDate(iso, language, { dateStyle: 'medium', timeStyle: 'short' }) : null);
  return <Dialog open={Boolean(orderId)} onClose={onClose}
    title={data ? <>{text('طلب ', 'Order ')}<OrderNo number={data.number} /></> : text('تفاصيل الطلب', 'Order details')}
    footer={<>
      <Button variant="secondary" onClick={onClose}>{text('إغلاق', 'Close')}</Button>
      {payable && <Button variant={data.paidAt ? 'secondary' : 'primary'} loading={payment.isPending} onClick={() => payment.mutate({ order: data, paid: !data.paidAt })}>
        {data.paidAt ? text('رجّعه مش مدفوع', 'Mark unpaid') : text('الحساب اتدفع', 'Mark paid')}
      </Button>}
    </>}>
    {order.isPending && <div className="skeleton-stack" role="status" aria-label={text('جاري التحميل', 'Loading')}><Skeleton height={20} width="40%" /><Skeleton height={60} /><Skeleton height={90} /></div>}
    {order.isError && <ErrorPanel error={order.error} onRetry={() => void order.refetch()} />}
    {data && <div className="order-detail">
      <div className="order-detail-status"><OrderStatusBadge status={data.status} /><PaymentBadge order={data} /></div>
      {data.rejectionReason && <p className="order-reason"><strong>{data.status === 'REJECTED' ? text('سبب الرفض: ', 'Rejection reason: ') : text('سبب الإلغاء: ', 'Cancellation reason: ')}</strong>{data.rejectionReason}</p>}
      <OrderWhere order={data} />
      <dl className="facts facts-compact">
        <div><dt>{t.ordersBranch.branchLabel}</dt><dd><bdi>{data.branchName}</bdi></dd></div>
        <div><dt>{text('اتطلب', 'Placed')}</dt><dd>{when(data.placedAt)}</dd></div>
        {data.acceptedAt && <div><dt>{text('اتقبل', 'Accepted')}</dt><dd>{when(data.acceptedAt)}</dd></div>}
        {data.readyAt && <div><dt>{text('جهز', 'Ready')}</dt><dd>{when(data.readyAt)}</dd></div>}
        {data.completedAt && <div><dt>{text('اتسلّم', 'Completed')}</dt><dd>{when(data.completedAt)}</dd></div>}
        {data.paidAt && <div><dt>{text('اتدفع', 'Paid')}</dt><dd>{when(data.paidAt)}</dd></div>}
        {data.closedAt && !data.completedAt && <div><dt>{text('اتقفل', 'Closed')}</dt><dd>{when(data.closedAt)}</dd></div>}
        {data.estimatedReadyAt && <div><dt>{text('كان متوقع يجهز', 'Expected ready')}</dt><dd>{when(data.estimatedReadyAt)}</dd></div>}
      </dl>
      {data.history.length > 0 && <section aria-labelledby="detail-history" className="order-history">
        <h3 id="detail-history">{text('سجل الطلب', 'Order history')}</h3>
        <ol>
          {data.history.map((step, index) => <li key={`${step.status}-${index}`} className={`order-history-step is-${step.status.toLowerCase()}`} data-testid="order-history-step">
            <span className="order-history-dot" aria-hidden="true" />
            <strong>{statusName(step.status, text)}</strong>
            <time dateTime={step.at}>{formatDate(step.at, language, { timeStyle: 'short' })}</time>
            <span className="muted"><bdi>{step.actorName ?? (step.status === 'PLACED' ? text('الزبون', 'The diner') : text('المطعم', 'The restaurant'))}</bdi></span>
            {step.reason && <span className="order-history-reason"><bdi>{step.reason}</bdi></span>}
          </li>)}
        </ol>
      </section>}
      <section aria-labelledby="detail-items" className="order-detail-items">
        <h3 id="detail-items">{text('الأصناف', 'Items')}</h3>
        <OrderLines order={data} prices />
        <p className="order-total"><span>{text('الإجمالي', 'Subtotal')}</span><strong>{formatPrice(data.subtotalPiastres, language)}</strong></p>
      </section>
    </div>}
  </Dialog>;
}
