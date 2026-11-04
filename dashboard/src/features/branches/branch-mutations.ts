import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BranchList, BranchMenu, BranchMenuItem, createBranchSchema, OwnerBranch, updateBranchSchema } from '@bilhanah/contracts';
import { MENU_ERROR_CODES, BRANCH_ERROR_CODES } from '@bilhanah/contracts';
import type { z } from 'zod';
import { useToast } from '../../components/Toast';
import { isApiError } from '../../lib/api';
import { branchesApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { useLanguage } from '../../lib/language';
import { storeBranch } from '../restaurant/orders/mutations';
import { queryKeys } from '../restaurant/queries';
import { optimisticItem, type SetBranchItem, withItem } from './branch-menu';
import { reorderedList } from './scope';

/** After a change to the branch list: everything that shows branches, tables or a branch's settings refreshes. */
function refreshAfterListChange(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.branches });
  void queryClient.invalidateQueries({ queryKey: queryKeys.restaurant });
  void queryClient.invalidateQueries({ queryKey: queryKeys.kitchenAccounts });
}

export function useCreateBranch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: z.output<typeof createBranchSchema>) => branchesApi.create(body),
    onSuccess: branch => {
      queryClient.setQueryData<BranchList>(queryKeys.branches, list => (list
        ? { ...list, branches: [...list.branches, branch], used: list.used + (branch.isActive ? 1 : 0) } : list));
      refreshAfterListChange(queryClient);
    },
  });
}

/** PATCH a branch; the caller shows its own confirmation. */
export function useUpdateBranch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ branchId, body }: { branchId: string; body: z.output<typeof updateBranchSchema> }) => branchesApi.update(branchId, body),
    onSuccess: (branch, { body }) => {
      storeBranch(queryClient, branch);
      void queryClient.invalidateQueries({ queryKey: queryKeys.kitchenContext });
      // Archiving or restoring changes the plan usage and which branches can be chosen.
      if (body.isActive !== undefined || body.slug !== undefined || body.name !== undefined) refreshAfterListChange(queryClient);
    },
  });
}

export function useRemoveBranch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (branch: OwnerBranch) => branchesApi.remove(branch.id),
    onSuccess: (_data, branch) => {
      queryClient.setQueryData<BranchList>(queryKeys.branches, list => (list
        ? { ...list, branches: list.branches.filter(entry => entry.id !== branch.id), used: list.used - (branch.isActive ? 1 : 0) } : list));
      refreshAfterListChange(queryClient);
    },
  });
}

export function useMakeMainBranch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (branch: OwnerBranch) => branchesApi.makeMain(branch.id),
    onSuccess: list => {
      queryClient.setQueryData(queryKeys.branches, list);
      refreshAfterListChange(queryClient);
    },
  });
}

/** Drag-and-drop order of the branches: shown at once, rolled back when the API refuses. */
export function useReorderBranches() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { text } = useLanguage();
  return useMutation({
    mutationFn: (ids: string[]) => branchesApi.reorder(ids),
    onMutate: async ids => {
      await queryClient.cancelQueries({ queryKey: queryKeys.branches });
      const previous = queryClient.getQueryData<BranchList>(queryKeys.branches);
      if (previous) queryClient.setQueryData(queryKeys.branches, reorderedList(previous, ids));
      return { previous };
    },
    onError: (error, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.branches, context.previous);
      toast.error(errorMessage(error, text));
      if (isApiError(error, MENU_ERROR_CODES.ORDER_MISMATCH)) void queryClient.invalidateQueries({ queryKey: queryKeys.branches });
    },
    onSuccess: list => queryClient.setQueryData(queryKeys.branches, list),
  });
}

/**
 * Changes one dish at one branch (availability, hidden, prices), showing it right away.
 * `done` builds the confirmation from the saved dish.
 */
export function useSetBranchItem(branchId: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { text } = useLanguage();
  const key = queryKeys.branchMenu(branchId);
  return useMutation({
    mutationFn: ({ item, change }: { item: BranchMenuItem; change: SetBranchItem; done?: (saved: BranchMenuItem) => string }) =>
      branchesApi.setItem(branchId, item.id, change),
    onMutate: async ({ item, change }) => {
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<BranchMenu>(key, menu => (menu ? withItem(menu, optimisticItem(item, change)) : menu));
    },
    onError: (error, { item }) => {
      queryClient.setQueryData<BranchMenu>(key, menu => (menu ? withItem(menu, item) : menu));
      toast.error(errorMessage(error, text));
      if (isApiError(error, BRANCH_ERROR_CODES.VARIANT_MISMATCH) || isApiError(error, MENU_ERROR_CODES.ITEM_NOT_FOUND)) void queryClient.invalidateQueries({ queryKey: key });
    },
    onSuccess: (saved, { done }) => {
      queryClient.setQueryData<BranchMenu>(key, menu => (menu ? withItem(menu, saved) : menu));
      if (done) toast.success(done(saved));
    },
  });
}

export function useResetBranchMenu(branchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => branchesApi.resetMenu(branchId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.branchMenu(branchId) }),
  });
}

export function useCopyBranchMenu(branchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sourceId: string) => branchesApi.copyMenu(branchId, sourceId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.branchMenu(branchId) }),
  });
}
