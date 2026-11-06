/** Query keys of the reviews section (every key starts with 'reviews', so one invalidation refreshes them all). */
export const reviewKeys = {
  all: ['reviews'] as const,
  settings: ['reviews', 'settings'] as const,
  list: (query: object, page: number) => ['reviews', 'list', query, page] as const,
  /** The newest reviews of a branch scope, for the "new" badge. */
  badge: (scope: string) => ['reviews', 'badge', scope] as const,
  detail: (id: string) => ['reviews', 'detail', id] as const,
  stats: (params: object) => ['reviews', 'stats', params] as const,
  dishes: (params: object) => ['reviews', 'dishes', params] as const,
  assignees: (branchId: string) => ['reviews', 'assignees', branchId] as const,
};
