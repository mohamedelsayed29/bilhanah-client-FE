import { TABLE_GUEST_HEADER, type SubmitTableSessionResponse, type TableSessionView } from '@bilhanah/contracts';
import { apiRequest } from '../../lib/api';

const send = (method: string, guest: string | null, body?: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method,
  headers: { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(guest && { [TABLE_GUEST_HEADER]: guest }), ...headers },
  ...(body !== undefined && { body: JSON.stringify(body) }),
});

/** Joins the table's shared session; with this phone's earlier token, rejoins as the same guest. */
export const joinSharedTable = (subdomain: string, code: string, guestToken: string | null, signal?: AbortSignal) =>
  apiRequest<TableSessionView>(`/v1/public/restaurants/${encodeURIComponent(subdomain)}/tables/${encodeURIComponent(code)}/join`,
    { ...send('POST', null, guestToken ? { guestToken } : {}), signal });

export const fetchSharedTable = (guest: string, signal?: AbortSignal) => apiRequest<TableSessionView>('/v1/public/table-session', { ...send('GET', guest), signal });

export const renameGuest = (guest: string, displayName: string) => apiRequest<TableSessionView>('/v1/public/table-session/me', send('PATCH', guest, { displayName }));

export const addSharedItem = (guest: string, body: { menuItemId: string; variantId: string; quantity: number; note?: string | null }) =>
  apiRequest<TableSessionView>('/v1/public/table-session/items', send('POST', guest, body));

export const updateSharedItem = (guest: string, itemId: string, body: { quantity?: number; note?: string | null; version: number }) =>
  apiRequest<TableSessionView>(`/v1/public/table-session/items/${encodeURIComponent(itemId)}`, send('PATCH', guest, body));

export const removeSharedItem = (guest: string, itemId: string, version: number) =>
  apiRequest<TableSessionView>(`/v1/public/table-session/items/${encodeURIComponent(itemId)}?version=${version}`, send('DELETE', guest));

export const submitSharedTable = (guest: string, idempotencyKey: string, body: { scope: 'MINE' | 'TABLE'; expectedTotalPiastres?: number }) =>
  apiRequest<SubmitTableSessionResponse>('/v1/public/table-session/submit', send('POST', guest, body, { 'Idempotency-Key': idempotencyKey }));

/** This phone's guest token for a table, kept across reloads and reopening the menu (localStorage). */
const key = (subdomain: string, code: string) => `bilhanah:table-guest:v1:${subdomain}:${code}`;
export function loadGuestToken(subdomain: string, code: string): string | null {
  try { return localStorage.getItem(key(subdomain, code)); } catch { return null; }
}
export function saveGuestToken(subdomain: string, code: string, token: string | null) {
  try { if (token) localStorage.setItem(key(subdomain, code), token); else localStorage.removeItem(key(subdomain, code)); } catch { /* Storage is optional. */ }
}
