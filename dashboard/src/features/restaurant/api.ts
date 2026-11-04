import { useQuery } from '@tanstack/react-query';
import type { OwnerRestaurant } from '@bilhanah/contracts';
import { ApiError, api } from '../../lib/api-client';

export const myRestaurantKey = ['restaurant', 'mine'] as const;

/** The owner's restaurant, or null before onboarding. */
export function useMyRestaurant() {
  return useQuery({
    queryKey: myRestaurantKey,
    queryFn: async () => {
      try {
        return await api<OwnerRestaurant>('/v1/restaurants/mine');
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  });
}
