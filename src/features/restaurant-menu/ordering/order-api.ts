import type { OrderAlerts, OrderStatus, PlaceOrderResponse, PublicOrder, PublicTable, REALTIME_EVENTS, REALTIME_PATH } from '@bilhanah/contracts';
import { ApiError, apiRequest } from '../../../lib/api';

export { ApiError, newIdempotencyKey } from '../../../lib/api';

// Values from contracts/orders.ts, copied because that module builds zod schemas at import time and
// the public menu must not ship zod. `satisfies`/typeof keep them in step with the contracts.
export const ORDER_PATH = { realtime: '/v1/realtime' satisfies typeof REALTIME_PATH, updated: 'order.updated' satisfies typeof REALTIME_EVENTS.ORDER_UPDATED } as const;
export const ORDER_PROGRESS = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED'] as const satisfies readonly OrderStatus[];
export const CLOSED_STATUSES: readonly OrderStatus[] = ['COMPLETED', 'REJECTED', 'CANCELLED'];

const restaurantPath = (subdomain: string) => `/v1/public/restaurants/${encodeURIComponent(subdomain)}`;

/** The label of a scanned table; null when the code is unknown or retired. */
export async function fetchTable(subdomain: string, code: string, signal: AbortSignal): Promise<PublicTable | null> {
  try {
    return await apiRequest<PublicTable>(`${restaurantPath(subdomain)}/tables/${encodeURIComponent(code)}`, { signal });
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return null;
    throw error;
  }
}

export type PlaceOrderInput = {
  type: 'DINE_IN' | 'PICKUP';
  tableCode?: string;
  tableLabel?: string;
  customerName: string;
  customerPhone?: string;
  note?: string;
  items: { menuItemId: string; variantId: string; quantity: number; note?: string }[];
};

/** Places an order. The same `idempotencyKey` returns the same order, so retries never duplicate it. */
export function placeOrder(subdomain: string, idempotencyKey: string, input: PlaceOrderInput): Promise<PlaceOrderResponse> {
  return apiRequest<PlaceOrderResponse>(`${restaurantPath(subdomain)}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

export function fetchTrackedOrder(token: string, signal?: AbortSignal): Promise<PublicOrder> {
  return apiRequest<PublicOrder>(`/v1/public/orders/${encodeURIComponent(token)}`, { signal, cache: 'no-store' });
}

/** What the restaurant's plan offers on this order's page. Anything unexpected counts as nothing. */
export async function fetchOrderAlerts(token: string, signal: AbortSignal): Promise<OrderAlerts> {
  const alerts = await apiRequest<Partial<OrderAlerts> | null>(`/v1/public/orders/${encodeURIComponent(token)}/alerts`, { signal });
  const publicKey = alerts?.push?.publicKey;
  return { readyAlerts: alerts?.readyAlerts === true, push: alerts?.readyAlerts === true && typeof publicKey === 'string' && publicKey ? { publicKey } : null };
}

/** Asks the API to push this order's updates to the browser, in `language`. */
export function subscribeToOrder(token: string, subscription: PushSubscriptionJSON, language: 'ar' | 'en'): Promise<void> {
  return apiRequest<void>(`/v1/public/orders/${encodeURIComponent(token)}/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...subscription, language }),
  });
}

/** Stops pushing this order's updates to `endpoint`. Succeeds if it was never subscribed. */
export function unsubscribeFromOrder(token: string, endpoint: string): Promise<void> {
  return apiRequest<void>(`/v1/public/orders/${encodeURIComponent(token)}/push`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });
}
