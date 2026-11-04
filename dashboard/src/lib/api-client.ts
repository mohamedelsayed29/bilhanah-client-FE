import type { ApiError as ApiErrorBody, SessionResponse } from '@bilhanah/contracts';
import { SESSION_ROUTES } from './config';

const API_URL = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
  }
}

// The access token lives only in memory; the refresh token is an HttpOnly
// cookie the browser sends to /v1/auth.
let accessToken: string | null = null;
const sessionEndedListeners = new Set<() => void>();

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** Called when a request fails because the session can no longer be refreshed. */
export function onSessionEnded(listener: () => void): () => void {
  sessionEndedListeners.add(listener);
  return () => sessionEndedListeners.delete(listener);
}

async function toApiError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
  return new ApiError(
    response.status,
    body?.error.code ?? 'NETWORK_ERROR',
    body?.error.message ?? response.statusText,
    body?.error.details,
    body?.error.requestId,
  );
}

let refreshInFlight: Promise<SessionResponse | null> | null = null;

/**
 * Exchanges the refresh cookie for a new access token. The API rotates the
 * refresh token and revokes the session if an old one is reused, so refreshes
 * must never overlap: one in-flight request per tab, serialized across tabs
 * with the Web Locks API.
 */
export function refreshSession(): Promise<SessionResponse | null> {
  refreshInFlight ??= (async () => {
    const run = async () => {
      const response = await fetch(`${API_URL}${SESSION_ROUTES.refresh}`, { method: 'POST', credentials: 'include' });
      if (response.status === 401) return null;
      if (!response.ok) throw await toApiError(response);
      return (await response.json()) as SessionResponse;
    };
    const session = navigator.locks ? await navigator.locks.request('bilhanah:auth-refresh', run) : await run();
    setAccessToken(session?.accessToken ?? null);
    return session;
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Send the access token and retry once after refreshing on 401. Default true. */
  authenticated?: boolean;
  signal?: AbortSignal;
};

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, authenticated = true, signal } = options;
  const send = () =>
    fetch(`${API_URL}${path}`, {
      method,
      credentials: 'include',
      signal,
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(authenticated && accessToken && { Authorization: `Bearer ${accessToken}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  let response: Response;
  try {
    response = await send();
    if (response.status === 401 && authenticated) {
      const session = await refreshSession();
      if (!session) {
        sessionEndedListeners.forEach((listener) => listener());
        throw await toApiError(response);
      }
      response = await send();
    }
  } catch (error) {
    if (error instanceof ApiError || (error instanceof DOMException && error.name === 'AbortError')) throw error;
    throw new ApiError(0, 'NETWORK_ERROR', 'The server could not be reached.');
  }

  if (!response.ok) throw await toApiError(response);
  if (response.status === 202 || response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
