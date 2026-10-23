import { API_URL } from './config';

/** An API error with its code; `status` 0 means the request never got an answer. */
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, readonly details?: unknown) {
    super(`${code} (${status})`);
  }
}

/** Calls the API; errors arrive as `{ error: { code, message, details? } }` and are thrown as ApiError. */
export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, init);
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    throw new ApiError(0, 'NETWORK_ERROR');
  }
  if (response.status === 204) return undefined as T;
  if (response.ok) return await response.json() as T;
  const body = await response.json().catch(() => null) as { error?: { code?: string; details?: unknown } } | null;
  throw new ApiError(response.status, body?.error?.code ?? `HTTP_${response.status}`, body?.error?.details);
}

/** A key for one checkout; crypto.randomUUID needs a secure context, so fall back to random bytes. */
export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
}
