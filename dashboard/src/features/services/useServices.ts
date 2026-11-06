import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SERVICE_LABELS, type RestaurantServiceKey } from '@bilhanah/contracts';
import { useToast } from '../../components/Toast';
import { restaurantApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { useLanguage } from '../../lib/language';
import { queryKeys } from '../restaurant/queries';

/** The setup with every service and what it needs (owners only). */
export function useSetupQuery(enabled = true) {
  return useQuery({ queryKey: queryKeys.setup, queryFn: ({ signal }) => restaurantApi.setup(signal), enabled, staleTime: 0 });
}

/**
 * Switches services on or off in order (requirements first), then refreshes the restaurant so the
 * navigation and every page follow at once. Data is never deleted, which the message says.
 */
export function useServiceSwitch() {
  const { text } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ keys, enabled }: { keys: RestaurantServiceKey[]; enabled: boolean }) => {
      let last = null;
      for (const key of keys) last = await restaurantApi.setService(key, enabled);
      return last;
    },
    onSuccess: (setup, { keys, enabled }) => {
      if (setup) queryClient.setQueryData(queryKeys.setup, setup);
      void queryClient.invalidateQueries({ queryKey: queryKeys.restaurant });
      const names = keys.map(key => text(...SERVICE_LABELS[key])).join(text(' و', ' and '));
      toast.success(enabled ? text(`اتشغّل: ${names}`, `Turned on: ${names}`) : text(`اتقفل: ${names}. بياناتك محفوظة لو رجعت تشغّله.`, `Turned off: ${names}. Your data is kept if you turn it back on.`));
    },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
}
