import type { QueryClient } from '@tanstack/react-query';
import type { OwnerOrder } from '@bilhanah/contracts';
import { queryKeys } from '../queries';
import { type BoardScope, scopeOfKey } from './board';

/**
 * Applies a change to every loaded board (each branch scope has its own cache), passing each
 * board's scope so an order only lands on the boards that show its branch.
 */
export function updateBoards(queryClient: QueryClient, update: (board: OwnerOrder[], scope: BoardScope) => OwnerOrder[]) {
  for (const [key, board] of queryClient.getQueriesData<OwnerOrder[]>({ queryKey: queryKeys.boards })) {
    if (board) queryClient.setQueryData<OwnerOrder[]>(key, update(board, scopeOfKey(key)));
  }
}
