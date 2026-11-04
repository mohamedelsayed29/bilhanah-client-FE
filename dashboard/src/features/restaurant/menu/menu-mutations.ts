import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MENU_ERROR_CODES, type OwnerMenu, type OwnerMenuItem } from '@bilhanah/contracts';
import { useToast } from '../../../components/Toast';
import { isApiError } from '../../../lib/api';
import { menuApi } from '../../../lib/api/endpoints';
import { errorMessage } from '../../../lib/api/error-messages';
import { useLanguage } from '../../../lib/language';
import { queryKeys } from '../queries';
import * as cache from './menu-cache';

type Optimistic<Vars, Data> = {
  mutationFn: (vars: Vars) => Promise<Data>;
  /** The menu as it should look right away. */
  apply: (menu: OwnerMenu, vars: Vars) => OwnerMenu;
  /** The menu once the server answered (e.g. with the saved item). */
  settle?: (menu: OwnerMenu, data: Data, vars: Vars) => OwnerMenu;
  success?: (vars: Vars) => string | null;
};

/**
 * Updates the cached menu immediately, sends the change, and rolls back with an
 * error toast when the API refuses. Out-of-date menus (ORDER_MISMATCH, not found)
 * are refetched.
 */
function useOptimisticMenu<Vars, Data>({ mutationFn, apply, settle, success }: Optimistic<Vars, Data>) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { text } = useLanguage();
  return useMutation({
    mutationFn,
    onMutate: async (vars: Vars) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.menu });
      const previous = queryClient.getQueryData<OwnerMenu>(queryKeys.menu);
      if (previous) queryClient.setQueryData<OwnerMenu>(queryKeys.menu, apply(previous, vars));
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.menu, context.previous);
      toast.error(errorMessage(error, text));
      if (isApiError(error, MENU_ERROR_CODES.ORDER_MISMATCH) || (isApiError(error) && error.status === 404)) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.menu });
      }
    },
    onSuccess: (data, vars) => {
      if (settle) queryClient.setQueryData<OwnerMenu>(queryKeys.menu, menu => (menu ? settle(menu, data, vars) : menu));
      const message = success?.(vars);
      if (message) toast.success(message);
    },
  });
}

export function useMenuMutations() {
  const { text } = useLanguage();
  const queryClient = useQueryClient();
  const toast = useToast();

  const setAvailability = useOptimisticMenu({
    mutationFn: ({ item, isAvailable }: { item: OwnerMenuItem; isAvailable: boolean }) => menuApi.updateItem(item.id, { isAvailable }),
    apply: (menu, { item, isAvailable }) => cache.patchItem(menu, item.id, { isAvailable }),
    settle: (menu, saved) => cache.upsertItem(menu, saved),
  });

  const reorderCategories = useOptimisticMenu({
    mutationFn: (ids: string[]) => menuApi.reorderCategories(ids),
    apply: (menu, ids) => cache.reorderCategories(menu, ids),
  });

  const reorderItems = useOptimisticMenu({
    mutationFn: ({ categoryId, ids }: { categoryId: string; ids: string[] }) => menuApi.reorderItems(categoryId, ids),
    apply: (menu, { categoryId, ids }) => cache.reorderItems(menu, categoryId, ids),
  });

  const setCategoryVisibility = useOptimisticMenu({
    mutationFn: ({ id, isVisible }: { id: string; isVisible: boolean }) => menuApi.updateCategory(id, { isVisible }),
    apply: (menu, { id, isVisible }) => cache.mapCategory(menu, id, category => ({ ...category, isVisible })),
    success: ({ isVisible }) => (isVisible ? text('القسم ظاهر في المنيو', 'Category is visible on the menu') : text('القسم اتخفى من المنيو', 'Category hidden from the menu')),
  });

  const deleteCategory = useOptimisticMenu({
    mutationFn: (id: string) => menuApi.deleteCategory(id),
    apply: (menu, id) => cache.removeCategory(menu, id),
    success: () => text('القسم اتمسح', 'Category deleted'),
  });

  const deleteItem = useOptimisticMenu({
    mutationFn: (id: string) => menuApi.deleteItem(id),
    apply: (menu, id) => cache.removeItem(menu, id),
    success: () => text('الصنف اتمسح', 'Item deleted'),
  });

  /** Create or rename; waits for the server (a new category needs its id). */
  const saveCategory = useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: { nameAr: string; nameEn?: string | null; isVisible?: boolean; stationId?: string | null } }) => {
      if (!id) return menuApi.createCategory(values);
      await menuApi.updateCategory(id, values);
      return null;
    },
    onSuccess: (created, { id, values }) => {
      queryClient.setQueryData<OwnerMenu>(queryKeys.menu, menu => {
        if (!menu) return menu;
        if (created) return cache.addCategory(menu, created);
        return cache.mapCategory(menu, id!, category => ({ ...category, ...values, nameEn: values.nameEn ?? null }));
      });
      toast.success(id ? text('اتحفظ القسم', 'Category saved') : text('اتضاف القسم', 'Category added'));
    },
  });

  return { setAvailability, reorderCategories, reorderItems, setCategoryVisibility, deleteCategory, deleteItem, saveCategory };
}
