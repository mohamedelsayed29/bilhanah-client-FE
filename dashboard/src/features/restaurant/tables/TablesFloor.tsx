import { useState } from 'react';
import type React from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon, CheckCircleIcon, ClockIcon, UserIcon } from '@phosphor-icons/react';
import type { TableOccupancy } from '@bilhanah/contracts';
import { Button } from '../../../components/Button';
import { Dialog } from '../../../components/Dialog';
import { ErrorPanel } from '../../../components/ErrorBoundary';
import { Skeleton } from '../../../components/Skeleton';
import { useToast } from '../../../components/Toast';
import { ordersApi } from '../../../lib/api/endpoints';
import { errorMessage } from '../../../lib/api/error-messages';
import { formatPrice } from '../../../lib/format';
import { useLanguage } from '../../../lib/language';
import { minutesSince } from '../orders/board';
import { elapsedLabel, OrderNo, OrderStatusBadge } from '../orders/labels';
import { useNow } from '../orders/OrderCard';
import { useWorkspace } from '../../branches/workspace';
import { queryKeys } from '../queries';
import { TableGraphic } from './TableGraphic';

/** Live events refresh the floor; this catches tables whose unpaid orders aged out. */
const REFRESH_MS = 60_000;

/** One branch's tables and who is sitting at them. */
export function useFloorQuery(branchId: string, enabled = true) {
  return useQuery({ queryKey: queryKeys.floor(branchId), queryFn: () => ordersApi.floor(branchId), enabled, refetchInterval: REFRESH_MS, staleTime: 10_000 });
}

/**
 * The dining room at a glance, drawn as a floor plan: each table in its shape with its chairs.
 * A table with an unpaid order has guests (blue), the rest are free (white). Opening an
 * occupied table shows its bill and frees it once paid.
 */
export function TablesFloor({ branchId, title, picker }: { branchId: string; title?: string; picker?: React.ReactNode }) {
  const { text, count, number, language } = useLanguage();
  const { to } = useWorkspace();
  const floor = useFloorQuery(branchId);
  const [openId, setOpenId] = useState<string | null>(null);
  const now = useNow();

  const tables = floor.data ?? [];
  const occupied = tables.filter(table => table.occupied).length;
  const seated = tables.reduce((sum, table) => sum + (table.occupied ? table.seats : 0), 0);
  const selected = tables.find(table => table.id === openId) ?? null;

  return <section className="card floor" aria-labelledby="floor-title" data-testid="tables-floor">
    <header className="floor-head">
      <div>
        <h2 id="floor-title">{title ?? text('حالة الترابيزات', 'Tables now')}</h2>
        <p>{text('الترابيزة اللي عليها طلب لسه مدفعش تبان مشغولة.', 'A table with an unpaid order shows as occupied.')}</p>
      </div>
      {tables.length > 0 && <ul className="floor-legend" aria-label={text('الملخص', 'Summary')}>
        <li className="is-busy"><span aria-hidden="true" />{count(occupied, [{ one: 'واحدة مشغولة', two: 'اتنين مشغولين', few: '{n} مشغولة', many: '{n} مشغولة', zero: 'مفيش مشغول' }, { one: '{n} occupied', other: '{n} occupied' }])}</li>
        <li className="is-free"><span aria-hidden="true" />{count(tables.length - occupied, [{ one: 'واحدة فاضية', two: 'اتنين فاضيين', few: '{n} فاضية', many: '{n} فاضية', zero: 'مفيش فاضي' }, { one: '{n} free', other: '{n} free' }])}</li>
        {occupied > 0 && <li className="is-seats"><UserIcon size={13} weight="bold" aria-hidden="true" />{text(`كراسي مشغولة: ${number(seated)}`, `${seated} seats taken`)}</li>}
      </ul>}
    </header>
    {picker}

    {floor.isPending && <div className="floor-plan" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} width={96} height={96} />)}</div>}
    {floor.isError && <ErrorPanel error={floor.error} onRetry={() => void floor.refetch()} />}
    {floor.data && tables.length === 0 && <div className="floor-empty">
      <p>{text('ضيف طاولاتك واطبع أكوادها، وهتشوف هنا مين عليها ناس.', 'Add your tables and print their codes to see which ones have guests.')}</p>
      <Link className="link-action" to={to('/tables')}>{text('ضيف طاولات', 'Add tables')}<ArrowLeftIcon size={14} className="directional" aria-hidden="true" /></Link>
    </div>}
    {tables.length > 0 && <ul className="floor-plan">
      {tables.map(table => <li key={table.id}>
        {table.occupied
          ? <button type="button" className="floor-table is-busy" onClick={() => setOpenId(table.id)} data-testid="floor-table" data-state="occupied">
            <TableGraphic shape={table.shape} seats={table.seats}>
              <bdi className="table-top-label">{table.label}</bdi>
              <span className="visually-hidden">{text(': عليها ناس، لسه مدفوعش', ': occupied, unpaid')}</span>
              <span className="table-top-price">{formatPrice(table.unpaidPiastres, language)}</span>
              {table.since && <span className="table-top-time"><ClockIcon size={11} weight="bold" aria-hidden="true" />{elapsedLabel(minutesSince(table.since, now), text, number)}</span>}
            </TableGraphic>
          </button>
          : <div className="floor-table is-free" data-testid="floor-table" data-state="free">
            <TableGraphic shape={table.shape} seats={table.seats}>
              <bdi className="table-top-label">{table.label}</bdi>
              <span className="visually-hidden">{text(`: فاضية، ${count(table.seats, 'seat')}`, `: free, ${count(table.seats, 'seat')}`)}</span>
              <span className="table-top-seats" aria-hidden="true"><UserIcon size={11} weight="bold" />{number(table.seats)}</span>
            </TableGraphic>
          </div>}
      </li>)}
    </ul>}

    <TableBillDialog branchId={branchId} table={selected} onClose={() => setOpenId(null)} />
  </section>;
}

/** An occupied table's open orders and the button that frees it once the guests paid. */
export function TableBillDialog({ branchId, table, onClose }: { branchId: string; table: TableOccupancy | null; onClose: () => void }) {
  const { text, language } = useLanguage();
  const queryClient = useQueryClient();
  const toast = useToast();
  const canSettle = useWorkspace().can('payments.process');
  const settle = useMutation({
    mutationFn: (tableId: string) => ordersApi.settleTable(tableId),
    onSuccess: floor => {
      queryClient.setQueryData(queryKeys.floor(branchId), floor);
      void queryClient.invalidateQueries({ queryKey: queryKeys.boards });
      void queryClient.invalidateQueries({ queryKey: queryKeys.orderHistoryAll });
      toast.success(text(`«${table?.label}» اتدفع حسابها وبقت فاضية`, `“${table?.label}” is paid and free`));
      onClose();
    },
    onError: error => toast.error(errorMessage(error, text)),
  });
  return <Dialog open={table !== null} onClose={onClose} busy={settle.isPending} size="small"
    title={table ? <bdi>{table.label}</bdi> : ''}
    footer={<>
      <Button variant="secondary" onClick={onClose} disabled={settle.isPending}>{text('إغلاق', 'Close')}</Button>
      {canSettle && <Button loading={settle.isPending} onClick={() => table && settle.mutate(table.id)} icon={<CheckCircleIcon size={18} weight="bold" aria-hidden="true" />}>
        {text('اتدفع الحساب، فضّي الترابيزة', 'Paid, free the table')}
      </Button>}
    </>}>
    {table && <div className="floor-bill">
      <p className="floor-bill-note">{text('الطلبات دي لسه مدفوعتش. لما الزباين يدفعوا، علّمها مدفوعة والترابيزة هترجع فاضية.', 'These orders are not paid yet. Once the guests pay, mark them paid and the table frees up.')}</p>
      <ul className="floor-bill-orders">
        {table.openOrders.map(order => <li key={order.id}>
          <strong><OrderNo number={order.number} /></strong>
          <OrderStatusBadge status={order.status} />
          <span className="floor-bill-price">{formatPrice(order.subtotalPiastres, language)}</span>
        </li>)}
      </ul>
      <p className="floor-bill-total"><span>{text('المطلوب', 'To pay')}</span><strong>{formatPrice(table.unpaidPiastres, language)}</strong></p>
    </div>}
  </Dialog>;
}
