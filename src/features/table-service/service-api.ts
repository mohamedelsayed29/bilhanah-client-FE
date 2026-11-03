import type { CreateServiceRequestResponse, PublicServiceRequest, ServiceRequestType, TableServiceSession } from '@bilhanah/contracts';
import { apiRequest } from '../../lib/api';

const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** Joins the table's current session (everyone at the table shares it), keeping the one this phone holds. */
export const joinTableSession = (subdomain: string, code: string, sessionToken: string | null, signal?: AbortSignal) =>
  apiRequest<TableServiceSession>(`/v1/public/restaurants/${encodeURIComponent(subdomain)}/tables/${encodeURIComponent(code)}/session`, { ...json(sessionToken ? { sessionToken } : {}), signal });

export const fetchTableSession = (sessionToken: string, signal?: AbortSignal) =>
  apiRequest<TableServiceSession>(`/v1/public/service-requests?token=${encodeURIComponent(sessionToken)}`, { signal });

export const sendServiceRequest = (sessionToken: string, type: ServiceRequestType, note?: string) =>
  apiRequest<CreateServiceRequestResponse>('/v1/public/service-requests', json({ sessionToken, type, ...(note && { note }) }));

export const cancelServiceRequest = (sessionToken: string, requestId: string) =>
  apiRequest<PublicServiceRequest>(`/v1/public/service-requests/${encodeURIComponent(requestId)}/cancel`, json({ sessionToken }));

/** The session token of a table, kept for the visit (sessionStorage), so a reload stays in the same session. */
const key = (subdomain: string, code: string) => `bilhanah:table-session:v1:${subdomain}:${code}`;
export function loadSessionToken(subdomain: string, code: string): string | null {
  try { return sessionStorage.getItem(key(subdomain, code)); } catch { return null; }
}
export function saveSessionToken(subdomain: string, code: string, token: string | null) {
  try { if (token) sessionStorage.setItem(key(subdomain, code), token); else sessionStorage.removeItem(key(subdomain, code)); } catch { /* Storage is optional. */ }
}
