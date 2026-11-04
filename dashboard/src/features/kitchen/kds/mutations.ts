import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KITCHEN_DISPLAY_ERROR_CODES, ORDER_ERROR_CODES, type OrderItemStatus, type OrderPriority, type OwnerOrder } from '@bilhanah/contracts';
import { useToast } from '../../../components/Toast';
import { isApiError } from '../../../lib/api';
import { ordersApi } from '../../../lib/api/endpoints';
import { errorMessage } from '../../../lib/api/error-messages';
import { useLanguage } from '../../../lib/language';
import { queryKeys } from '../../restaurant/queries';
import { isActiveStatus, mergeIntoBoard } from '../../restaurant/orders/board';
import { updateBoards } from '../../restaurant/orders/board-cache';
import { withLines } from './model';

type LineChange = { order: OwnerOrder; lineIds: string[]; status: OrderItemStatus };

/** Puts the server's copy of an order on every board (and drops it once it leaves the kitchen). */
function useStoreOrder() {
  const queryClient = useQueryClient();
  return (saved: OwnerOrder) => {
    updateBoards(queryClient, (current, scope) => mergeIntoBoard(current, saved, scope));
    queryClient.setQueryData(queryKeys.order(saved.id), saved);
    if (!isActiveStatus(saved.status)) void queryClient.invalidateQueries({ queryKey: queryKeys.orderHistoryAll });
  };
}

/**
 * Moves dishes on the screen at once and sends the change. If the server refuses, the ticket goes
 * back; when another screen got there first (409), the board is refreshed instead of guessing.
 */
export function useLineStatus() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { text } = useLanguage();
  const store = useStoreOrder();
  return useMutation({
    mutationFn: ({ order, lineIds, status }: LineChange) => ordersApi.updateItems(order.id, lineIds, status),
    onMutate: async ({ order, lineIds, status }: LineChange) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.boards });
      const moved = { ...withLines(order, lineIds, status), updatedAt: new Date().toISOString() };
      updateBoards(queryClient, current => current.map(entry => (entry.id === order.id ? moved : entry)));
    },
    onError: (error, { order }) => {
      updateBoards(queryClient, (current, scope) => mergeIntoBoard(current, order, scope, true));
      if (isApiError(error, KITCHEN_DISPLAY_ERROR_CODES.INVALID_ITEM_STATUS_CHANGE) || isApiError(error, ORDER_ERROR_CODES.ORDER_NOT_FOUND)) {
        toast.error(text('الطلب ده اتحدّث من شاشة تانية، وحدّثنا الشاشة.', 'This order changed on another screen; the display has been refreshed.'));
        void queryClient.invalidateQueries({ queryKey: queryKeys.boards });
      } else {
        toast.error(errorMessage(error, text));
      }
    },
    onSuccess: store,
  });
}

/** Rush or normal: rush tickets go to the top of every screen. */
export function usePriority() {
  const toast = useToast();
  const { text } = useLanguage();
  const store = useStoreOrder();
  return useMutation({
    mutationFn: ({ order, priority }: { order: OwnerOrder; priority: OrderPriority }) => ordersApi.setPriority(order.id, priority),
    onSuccess: store,
    onError: error => toast.error(errorMessage(error, text)),
  });
}
