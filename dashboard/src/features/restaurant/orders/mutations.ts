import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type BranchList, ORDER_ERROR_CODES, type OrderStatus, type OwnerBranch, type OwnerOrder, type OwnerRestaurant } from '@bilhanah/contracts';
import { useToast } from '../../../components/Toast';
import { isApiError } from '../../../lib/api';
import { branchesApi, ordersApi } from '../../../lib/api/endpoints';
import { errorMessage } from '../../../lib/api/error-messages';
import { fill, useCopy } from '../../../lib/copy';
import { useLanguage } from '../../../lib/language';
import { queryKeys } from '../queries';
import { isActiveStatus, mergeIntoBoard, withStatus } from './board';
import { updateBoards } from './board-cache';
import { actionDone, orderNo } from './labels';

/** Orders never move back to PLACED. */
export type NextStatus = Exclude<OrderStatus, 'PLACED'>;
type Change = { order: OwnerOrder; status: NextStatus; reason?: string | null; prepMinutes?: number };

/**
 * Moves an order on the board right away and sends the change; rolls the card back when the
 * API refuses. 409 INVALID_STATUS_CHANGE means another device got there first: refetch.
 */
export function useOrderStatus({ announce }: { announce?: (message: string) => void } = {}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { text, number } = useLanguage();
  return useMutation({
    mutationFn: ({ order, status, reason, prepMinutes }: Change) => ordersApi.updateStatus(order.id, { status, reason: reason ?? null, ...(prepMinutes && { prepMinutes }) }),
    onMutate: async ({ order, status, reason }: Change) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.boards });
      updateBoards(queryClient, current => withStatus(current, order.id, status, reason ?? null));
    },
    onError: (error, { order }) => {
      // Only this card goes back; other live changes on the board stay.
      updateBoards(queryClient, (current, scope) => mergeIntoBoard(current, order, scope, true));
      if (isApiError(error, ORDER_ERROR_CODES.INVALID_STATUS_CHANGE) || isApiError(error, ORDER_ERROR_CODES.ORDER_NOT_FOUND)) {
        toast.error(text('الطلب ده اتحدّث من جهاز تاني، وحدّثنا اللوحة.', 'This order was updated on another device; the board has been refreshed.'));
        void queryClient.invalidateQueries({ queryKey: queryKeys.boards });
      } else {
        toast.error(errorMessage(error, text));
      }
    },
    onSuccess: (saved, { status }) => {
      updateBoards(queryClient, (current, scope) => mergeIntoBoard(current, saved, scope));
      queryClient.setQueryData(queryKeys.order(saved.id), saved);
      if (!isActiveStatus(saved.status)) void queryClient.invalidateQueries({ queryKey: queryKeys.orderHistoryAll });
      // The card moving is the visible confirmation; screen readers hear it (no toast pile-up on a busy board).
      const message = actionDone(status, saved.number, text, number);
      if (announce) announce(message);
      else toast.success(message);
    },
  });
}

/** Keeps the cached branch list, the owner's restaurant (main branch mirror) and the kitchen context in step with a saved branch. */
export function storeBranch(queryClient: ReturnType<typeof useQueryClient>, branch: OwnerBranch) {
  queryClient.setQueryData<BranchList>(queryKeys.branches, list => (list ? { ...list, branches: list.branches.map(entry => (entry.id === branch.id ? branch : entry)) } : list));
  queryClient.setQueryData<OwnerRestaurant>(queryKeys.restaurant, current => (current && current.mainBranchId === branch.id
    ? { ...current, ordering: branch.ordering, openingHours: branch.openingHours } : current));
}

/** Pause or resume taking orders at a branch (diners see "not taking orders right now"). */
export function useOrdersPause() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { text } = useLanguage();
  const t = useCopy();
  return useMutation({
    mutationFn: ({ branchId, paused }: { branchId: string; paused: boolean }) => branchesApi.update(branchId, { ordersPaused: paused }),
    onSuccess: branch => {
      storeBranch(queryClient, branch);
      void queryClient.invalidateQueries({ queryKey: queryKeys.kitchenContext });
      toast.success(fill(branch.ordering.paused ? t.ordersBranch.pausedToast : t.ordersBranch.resumedToast, { name: branch.name }));
    },
    onError: error => toast.error(errorMessage(error, text)),
  });
}

/** Marks an order's bill paid (or undoes it); a dine-in table frees up once all its orders are paid. */
export function useOrderPayment() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { text, number } = useLanguage();
  return useMutation({
    mutationFn: ({ order, paid }: { order: OwnerOrder; paid: boolean }) => ordersApi.setPaid(order.id, paid),
    onSuccess: saved => {
      updateBoards(queryClient, (current, scope) => mergeIntoBoard(current, saved, scope));
      queryClient.setQueryData(queryKeys.order(saved.id), saved);
      void queryClient.invalidateQueries({ queryKey: queryKeys.floors });
      void queryClient.invalidateQueries({ queryKey: queryKeys.orderHistoryAll });
      toast.success(saved.paidAt
        ? text(`طلب ${orderNo(saved.number, number)} اتدفع`, `Order #${saved.number} marked paid`)
        : text(`طلب ${orderNo(saved.number, number)} رجع مش مدفوع`, `Order #${saved.number} marked unpaid`));
    },
    onError: error => toast.error(errorMessage(error, text)),
  });
}
