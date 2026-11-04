import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type BillingSummary, RESTAURANT_ERROR_CODES, type OwnerRestaurant, type StatsPeriod } from '@bilhanah/contracts';
import { isApiError } from '../../lib/api';
import { authApi, billingApi, branchesApi, menuApi, restaurantApi, reservationsApi, serviceRequestsApi, tableAreasApi, tablesApi } from '../../lib/api/endpoints';
import type { BoardScope } from './orders/board';

export const queryKeys = {
  restaurant: ['restaurant'] as const,
  menu: ['menu'] as const,
  sessions: ['auth', 'sessions'] as const,
  billing: ['billing'] as const,
  subdomain: (name: string) => ['subdomain-availability', name] as const,
  /** Every live board, whatever its branch scope (for invalidation). */
  boards: ['orders', 'board'] as const,
  /** The live board (active orders, oldest first) of one branch, or of every branch ('all'). */
  board: (scope: BoardScope) => ['orders', 'board', scope] as const,
  orderHistory: (scope: BoardScope, page: number) => ['orders', 'history', scope, page] as const,
  orderHistoryAll: ['orders', 'history'] as const,
  order: (id: string) => ['orders', 'detail', id] as const,
  /** Every table list (all branches, or one). */
  tables: ['tables'] as const,
  /** One branch's tables ('all': every table the viewer may see). */
  branchTables: (branchId: string | 'all') => ['tables', branchId] as const,
  /** One branch's seating areas, with their table counts. */
  branchTableAreas: (branchId: string) => ['tables', 'areas', branchId] as const,
  /** Upselling rules, and how their suggestions perform. */
  recommendations: ['recommendations'] as const,
  recommendationStats: (days: number) => ['recommendations', 'stats', days] as const,
  /** How diners followed their orders over a period (one branch, or 'all'). */
  orderTrackingStats: (scope: string, days: number) => ['orders', 'tracking-stats', scope, days] as const,
  /** Table service requests: the open ones (the badge and the board), history pages and stats. */
  serviceRequests: ['service-requests'] as const,
  serviceRequestsOpen: (scope: string) => ['service-requests', 'open', scope] as const,
  serviceRequestsList: (scope: string, filters: Record<string, unknown>) => ['service-requests', 'list', scope, filters] as const,
  serviceRequestStats: (scope: string, days: number) => ['service-requests', 'stats', scope, days] as const,
  serviceAssignees: (branchId: string) => ['service-requests', 'assignees', branchId] as const,
  /** One branch's bookings on one local day (YYYY-MM-DD). */
  reservations: ['reservations'] as const,
  branchReservations: (branchId: string, day: string) => ['reservations', branchId, day] as const,
  /** Which tables have guests right now (GET /v1/orders/floor), every branch. */
  floors: ['orders', 'floor'] as const,
  floor: (branchId: string) => ['orders', 'floor', branchId] as const,
  stats: (days: StatsPeriod, branchId: string | null = null) => ['stats', days, branchId ?? 'all'] as const,
  /** Branch comparison over a period (owners). */
  branchStats: (days: StatsPeriod) => ['stats', 'branches', days] as const,
  branches: ['branches'] as const,
  /** A branch's view of the shared menu, with its overrides. */
  branchMenu: (branchId: string) => ['branches', branchId, 'menu'] as const,
  kitchenAccounts: ['kitchen-accounts'] as const,
  kitchenStations: ['kitchen-stations'] as const,
  kitchenStats: (days: number, branchId: string | null) => ['kitchen-stations', 'stats', days, branchId] as const,
  kitchenHistory: (orderId: string) => ['orders', orderId, 'kitchen-history'] as const,
  staffOptions: ['kitchen-accounts', 'options'] as const,
  staffActivity: ['kitchen-accounts', 'activity'] as const,
  /** The kitchen screen's restaurant (kitchen accounts only). */
  kitchenContext: ['kitchen', 'context'] as const,
};

export function useRestaurantQuery() {
  return useQuery({
    queryKey: queryKeys.restaurant,
    queryFn: restaurantApi.mine,
    retry: (count, error) => !isApiError(error, RESTAURANT_ERROR_CODES.RESTAURANT_NOT_FOUND) && count < 2,
  });
}

/** The owner's restaurant inside the owner shell, where RestaurantGate guarantees it is loaded. */
export function useRestaurant(): OwnerRestaurant {
  const { data } = useRestaurantQuery();
  if (!data) throw new Error('useRestaurant() is only available inside the owner shell.');
  return data;
}

export function useMenuQuery() {
  return useQuery({ queryKey: queryKeys.menu, queryFn: menuApi.get });
}

export function useSessionsQuery() {
  return useQuery({ queryKey: queryKeys.sessions, queryFn: authApi.sessions });
}

/** `refetchInterval`: e.g. every few seconds while an online payment is being confirmed. */
export function useBillingQuery(options: { refetchInterval?: (data: BillingSummary | undefined) => number | false } = {}) {
  const { refetchInterval } = options;
  return useQuery({
    queryKey: queryKeys.billing,
    queryFn: billingApi.summary,
    refetchInterval: refetchInterval ? query => refetchInterval(query.state.data) : undefined,
  });
}

/** One branch's tables. */
/** Every open service request of the scope ('all' or a branch), oldest first: the badge and the live list. */
export function useOpenServiceRequestsQuery(scope: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.serviceRequestsOpen(scope),
    queryFn: async () => (await serviceRequestsApi.list({ view: 'active', pageSize: 100, branchId: scope === 'all' ? undefined : scope })).items,
    enabled,
    // Live events keep it current; this catches anything missed while offline.
    refetchInterval: 60_000,
  });
}

/** A branch's bookings on `day` (local YYYY-MM-DD), from local midnight to the next. */
/** `enabled`: false for viewers without reservations.view (the API would refuse). */
export function useReservationsQuery(branchId: string, day: string, enabled = true) {
  return useQuery({
    enabled,
    queryKey: queryKeys.branchReservations(branchId, day),
    queryFn: () => {
      const from = new Date(`${day}T00:00:00`);
      const to = new Date(from);
      to.setDate(to.getDate() + 1);
      return reservationsApi.list({ branchId, from: from.toISOString(), to: to.toISOString() });
    },
    refetchInterval: 30_000,
  });
}

export function useTableAreasQuery(branchId: string) {
  return useQuery({ queryKey: queryKeys.branchTableAreas(branchId), queryFn: () => tableAreasApi.list(branchId) });
}

export function useTablesQuery(branchId: string | null) {
  return useQuery({ queryKey: queryKeys.branchTables(branchId ?? 'all'), queryFn: () => tablesApi.list(branchId), enabled: branchId !== null });
}

/**
 * Visits and orders over the last `days` days (orders of one branch when `branchId` is set);
 * the previous figures stay on screen while others load.
 */
export function useStatsQuery(days: StatsPeriod, branchId: string | null = null) {
  return useQuery({ queryKey: queryKeys.stats(days, branchId), queryFn: ({ signal }) => restaurantApi.stats(days, branchId, signal), placeholderData: keepPreviousData });
}

/** Every branch with the plan's allowance (owners: all; staff: the ones they work at). */
export function useBranchesQuery(enabled = true) {
  return useQuery({ queryKey: queryKeys.branches, queryFn: branchesApi.list, enabled, staleTime: 30_000 });
}

export function useBranchMenuQuery(branchId: string | null) {
  return useQuery({ queryKey: queryKeys.branchMenu(branchId ?? ''), queryFn: () => branchesApi.menu(branchId!), enabled: branchId !== null });
}
