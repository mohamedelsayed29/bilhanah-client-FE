import { ACTIVE_ORDER_STATUSES, ORDER_TRANSITIONS, type OrderStatus, type OwnerOrder } from '@bilhanah/contracts';

/** Board columns: New, In progress, Ready. */
export const COLUMNS = ['new', 'progress', 'ready'] as const;
export type Column = (typeof COLUMNS)[number];

export const COLUMN_STATUSES: Record<Column, readonly OrderStatus[]> = {
  new: ['PLACED'],
  progress: ['ACCEPTED', 'PREPARING'],
  ready: ['READY'],
};

export const isActiveStatus = (status: OrderStatus) => (ACTIVE_ORDER_STATUSES as readonly OrderStatus[]).includes(status);

/** Closing an order this way is shown to the diner with a reason. */
export const needsReason = (status: OrderStatus) => status === 'REJECTED' || status === 'CANCELLED';

/** How far along an order is; statuses only ever move forward. */
const RANK: Record<OrderStatus, number> = { PLACED: 0, ACCEPTED: 1, PREPARING: 2, READY: 3, COMPLETED: 4, REJECTED: 4, CANCELLED: 4 };

const byPlacedAt = (a: OwnerOrder, b: OwnerOrder) => a.placedAt.localeCompare(b.placedAt) || a.number - b.number;

/**
 * Puts the latest version of an order on the board (oldest first), or takes it off once it is closed.
 * A late event that is behind what the board already shows (e.g. after an optimistic step) is ignored
 * unless `force` is set (rollbacks).
 */
export function upsertOrder(board: readonly OwnerOrder[], order: OwnerOrder, force = false): OwnerOrder[] {
  const current = board.find(entry => entry.id === order.id);
  if (current && !force && RANK[order.status] < RANK[current.status]) return [...board];
  const rest = board.filter(entry => entry.id !== order.id);
  if (!isActiveStatus(order.status)) return rest;
  return [...rest, order].sort(byPlacedAt);
}

/** The board right after the owner moved an order (before the API answers). */
export function withStatus(board: readonly OwnerOrder[], orderId: string, status: OrderStatus, reason: string | null = null): OwnerOrder[] {
  const order = board.find(entry => entry.id === orderId);
  if (!order) return [...board];
  return upsertOrder(board, { ...order, status, ...(needsReason(status) && { rejectionReason: reason }) }, true);
}

export function groupByColumn(board: readonly OwnerOrder[]): Record<Column, OwnerOrder[]> {
  return {
    new: board.filter(order => COLUMN_STATUSES.new.includes(order.status)),
    progress: board.filter(order => COLUMN_STATUSES.progress.includes(order.status)),
    ready: board.filter(order => COLUMN_STATUSES.ready.includes(order.status)),
  };
}

/** The card's main step forward, and the other allowed changes (closing ones last), of those the viewer may make. */
export function orderActions(status: OrderStatus, permitted: (next: OrderStatus) => boolean = () => true): { primary: OrderStatus | null; secondary: OrderStatus[] } {
  const allowed = ORDER_TRANSITIONS[status].filter(permitted);
  const forward = allowed.filter(next => !needsReason(next));
  const closing = allowed.filter(needsReason);
  return { primary: forward[0] ?? null, secondary: [...forward.slice(1), ...closing] };
}

/** Whole minutes since `iso`. */
export function minutesSince(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
}

/** Which orders a board shows: every branch the viewer may see, or one branch (its id). */
export type BoardScope = 'all' | (string & {});

/** Whether `order` belongs on a board of `scope`. */
export const inScope = (scope: BoardScope, order: Pick<OwnerOrder, 'branchId'>) => scope === 'all' || order.branchId === scope;

/**
 * `upsertOrder` for a board that shows one scope: an order of another branch is never added
 * (and is taken off if it was there, e.g. after a cache was filled under another scope).
 */
export function mergeIntoBoard(board: readonly OwnerOrder[], order: OwnerOrder, scope: BoardScope, force = false): OwnerOrder[] {
  if (!inScope(scope, order)) return board.some(entry => entry.id === order.id) ? board.filter(entry => entry.id !== order.id) : [...board];
  return upsertOrder(board, order, force);
}

/** The scope a board cache key (['orders', 'board', scope]) was made for; 'all' for older keys. */
export function scopeOfKey(key: readonly unknown[]): BoardScope {
  const scope = key[2];
  return typeof scope === 'string' && scope ? scope : 'all';
}
