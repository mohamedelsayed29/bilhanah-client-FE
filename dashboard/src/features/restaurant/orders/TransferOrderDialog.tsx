import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OwnerOrder } from '@bilhanah/contracts';
import { Alert } from '../../../components/Alert';
import { Button } from '../../../components/Button';
import { Dialog } from '../../../components/Dialog';
import { Field } from '../../../components/Field';
import { useToast } from '../../../components/Toast';
import { ordersApi } from '../../../lib/api/endpoints';
import { errorMessage } from '../../../lib/api/error-messages';
import { useLanguage } from '../../../lib/language';
import { useWorkspace } from '../../branches/workspace';
import { queryKeys } from '../queries';
import { useFloorQuery } from '../tables/TablesFloor';
import { OrderNo } from './labels';

/** A dine-in order still open on its table, and someone who may move it (tables.status or orders.update). */
export function useCanTransfer() {
  const { can } = useWorkspace();
  const allowed = can('tables.status') || can('orders.update');
  return (order: Pick<OwnerOrder, 'type' | 'status' | 'paidAt'>) => allowed && order.type === 'DINE_IN'
    && order.status !== 'REJECTED' && order.status !== 'CANCELLED' && !(order.status === 'COMPLETED' && order.paidAt);
}

/**
 * Moves an order to another table of its branch (the guests changed tables). Only free tables are offered:
 * available, not held by a booking, not being cleaned and with no other guests; the API checks again.
 */
export function TransferOrderDialog({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const { text, number } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const order = useQuery({ queryKey: queryKeys.order(orderId ?? ''), queryFn: () => ordersApi.get(orderId!), enabled: Boolean(orderId) });
  const floor = useFloorQuery(order.data?.branchId ?? '', Boolean(order.data));
  const [tableId, setTableId] = useState('');
  const [reason, setReason] = useState('');
  useEffect(() => { if (orderId) { setTableId(''); setReason(''); } }, [orderId]);
  const current = floor.data?.find(row => row.openOrders.some(entry => entry.id === orderId));
  const free = (floor.data ?? []).filter(row => row.status === 'AVAILABLE' && row.id !== current?.id && !(current?.group?.tableIds.includes(row.id)));

  const move = useMutation({
    mutationFn: () => ordersApi.transfer(orderId!, { tableId, reason: reason.trim() || null }),
    onSuccess: saved => {
      queryClient.setQueryData(queryKeys.order(saved.id), saved);
      void queryClient.invalidateQueries({ queryKey: queryKeys.floors });
      void queryClient.invalidateQueries({ queryKey: queryKeys.boards });
      const last = saved.transfers.at(-1);
      toast.success(text(`الطلب اتنقل من ${last?.fromTableLabel ?? ''} لـ${last?.toTableLabel ?? ''}`, `Order moved from ${last?.fromTableLabel ?? ''} to ${last?.toTableLabel ?? ''}`));
      onClose();
    },
  });

  return <Dialog open={Boolean(orderId)} onClose={onClose} size="small" busy={move.isPending} onSubmit={() => { if (tableId) move.mutate(); }}
    title={order.data ? <>{text('انقل الطلب ', 'Move order ')}<OrderNo number={order.data.number} /></> : text('انقل الطلب', 'Move order')}
    footer={<>
      <Button variant="secondary" onClick={onClose} disabled={move.isPending}>{text('إلغاء', 'Cancel')}</Button>
      <Button type="submit" loading={move.isPending} disabled={!tableId} data-testid="transfer-submit">{text('انقله', 'Move it')}</Button>
    </>}>
    <div className="form">
      <p className="field-hint">{text('الطلب بيتنقل زي ما هو بأصنافه وأسعاره وملاحظاته وحالة الدفع. لو مفيش طلبات تانية على الطاولة القديمة، الزباين بيتنقلوا معاه وهي بتتعلّم بتتنضف.', 'The order moves as it is, with its items, prices, notes and payment. With no other orders left on the old table, the guests move with it and it is marked for cleaning.')}</p>
      {move.isError && <Alert kind="error">{errorMessage(move.error, text)}</Alert>}
      {current && <p className="muted">{text(`دلوقتي على: ${current.group ? current.group.tableIds.length + ' طاولات مدموجة' : current.label}`, `Now at: ${current.group ? `${current.group.tableIds.length} merged tables` : current.label}`)}</p>}
      <Field label={text('الطاولة الجديدة', 'New table')} hint={free.length ? text(`${number(free.length)} طاولة فاضية`, `${free.length} free tables`) : undefined}>
        {control => <select {...control} className="select" value={tableId} onChange={event => setTableId(event.target.value)} data-testid="transfer-table">
          <option value="">{free.length ? text('اختار طاولة', 'Pick a table') : text('مفيش طاولات فاضية دلوقتي', 'No free tables right now')}</option>
          {free.map(row => <option key={row.id} value={row.id}>{text(`${row.label} (${row.seats} أفراد)`, `${row.label} (${row.seats} seats)`)}</option>)}
        </select>}
      </Field>
      <Field label={text('السبب', 'Reason')} optional>
        <input className="input" maxLength={200} value={reason} onChange={event => setReason(event.target.value)} placeholder={text('مثلًا: عايزين جنب الشباك', 'For example: they wanted the window')} />
      </Field>
    </div>
  </Dialog>;
}
