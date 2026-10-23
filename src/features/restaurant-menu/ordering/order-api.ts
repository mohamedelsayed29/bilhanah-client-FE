import type { OrderStatus, PlaceOrderResponse, PublicOrder, PublicTable, REALTIME_EVENTS, REALTIME_PATH } from '@bilhanah/contracts';
import { API_URL } from '../../../lib/config';

// Values from contracts/orders.ts, copied because that module builds zod schemas at import time and
// the public menu must not ship zod. `satisfies`/typeof keep them in step with the contracts.
export const ORDER_PATH = { realtime: '/v1/realtime' satisfies typeof REALTIME_PATH, updated: 'order.updated' satisfies typeof REALTIME_EVENTS.ORDER_UPDATED } as const;
export const ORDER_PROGRESS = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED'] as const satisfies readonly OrderStatus[];
export const CLOSED_STATUSES: readonly OrderStatus[] = ['COMPLETED', 'REJECTED', 'CANCELLED'];

/** An API error with its code; `status` 0 means the request never got an answer. */
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, readonly details?: unknown) {
    super(`${code} (${status})`);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, init);
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    throw new ApiError(0, 'NETWORK_ERROR');
  }
  if (response.ok) return await response.json() as T;
  const body = await response.json().catch(() => null) as { error?: { code?: string; details?: unknown } } | null;
  throw new ApiError(response.status, body?.error?.code ?? `HTTP_${response.status}`, body?.error?.details);
}

const restaurantPath = (subdomain: string) => `/v1/public/restaurants/${encodeURIComponent(subdomain)}`;

/** The label of a scanned table; null when the code is unknown or retired. */
export async function fetchTable(subdomain: string, code: string, signal: AbortSignal): Promise<PublicTable | null> {
  try {
    return await request<PublicTable>(`${restaurantPath(subdomain)}/tables/${encodeURIComponent(code)}`, { signal });
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
  return request<PlaceOrderResponse>(`${restaurantPath(subdomain)}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

export function fetchTrackedOrder(token: string, signal?: AbortSignal): Promise<PublicOrder> {
  return request<PublicOrder>(`/v1/public/orders/${encodeURIComponent(token)}`, { signal, cache: 'no-store' });
}

/** A key for one checkout; crypto.randomUUID needs a secure context, so fall back to random bytes. */
export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
}
