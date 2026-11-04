import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { updateRestaurantSchema } from '@bilhanah/contracts';
import type { z } from 'zod';
import { useToast } from '../../../components/Toast';
import { restaurantApi } from '../../../lib/api/endpoints';
import { useLanguage } from '../../../lib/language';
import { queryKeys } from '../queries';

/** PATCH /v1/restaurants/mine and refresh the cached restaurant with the response. */
export function useSaveRestaurant() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { text } = useLanguage();
  return useMutation({
    mutationFn: (body: z.output<typeof updateRestaurantSchema>) => restaurantApi.update(body),
    onSuccess: restaurant => {
      queryClient.setQueryData(queryKeys.restaurant, restaurant);
      toast.success(text('اتحفظت التغييرات', 'Changes saved'));
    },
  });
}
