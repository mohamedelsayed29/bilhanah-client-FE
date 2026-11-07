import { SESSION_ROUTES } from '../config';
import type { SessionResponse } from '@bilhanah/contracts';
import type { SessionStore } from '../session/session-store';
import { ApiError, CLIENT_ERROR_CODES, toApiError } from './api-error';
import { createExclusive, type LockManagerLike, singleFlight } from './single-flight';

type RawResponse = { status: number; body: unknown; requestId: string | null };
type Transport = (token: string | null) => Promise<RawResponse>;

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** JSON-serialized unless it is FormData. */
  body?: unknown;
  /** Send the bearer token and refresh it on 401. Default true. */
  auth?: boolean;
  signal?: AbortSignal;
  /** Extra headers (Idempotency-Key, X-Pos-Device). */
  headers?: Record<string, string>;
};

export type UploadOptions = {
  /** 0–1 while the file is being sent. */
  onProgress?: (fraction: number) => void;
  /** The file has been sent; the API is now processing it. */
  onUploaded?: () => void;
  signal?: AbortSignal;
};

/** Messages other tabs of the dashboard send about the session. */
type AuthMessage = { type: 'signed-in' } | { type: 'signed-out' };
type ChannelLike = { postMessage(message: AuthMessage): void; addEventListener(type: 'message', listener: (event: { data: AuthMessage }) => void): void };

export type ApiClientOptions = {
  baseUrl: string;
  store: SessionStore;
  fetch?: typeof fetch;
  /** `navigator.locks`; null falls back to coordinating within this tab only. */
  locks?: LockManagerLike | null;
  /** Tells other tabs about sign-in and sign-out. */
  channel?: ChannelLike | null;
  createXhr?: () => XMLHttpRequest;
};

const REFRESH_LOCK = 'bilhanah:auth-session';

export type ApiClient = ReturnType<typeof createApiClient>;

export function createApiClient(options: ApiClientOptions) {
  const { baseUrl, store } = options;
  const fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  const createXhr = options.createXhr ?? (() => new XMLHttpRequest());
  // Every operation that reads or replaces the refresh cookie runs under this lock.
  const exclusive = createExclusive(options.locks, REFRESH_LOCK);

  async function send(path: string, init: RequestOptions & { token: string | null }): Promise<RawResponse> {
    const headers: Record<string, string> = { Accept: 'application/json', ...init.headers };
    let body: BodyInit | undefined;
    if (typeof FormData !== 'undefined' && init.body instanceof FormData) body = init.body;
    else if (init.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(init.body);
    }
    if (init.token) headers['Authorization'] = `Bearer ${init.token}`;
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method: init.method ?? 'GET',
        headers,
        body,
        credentials: 'include',
        signal: init.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR, message: 'Could not reach the server.' });
    }
    const text = response.status === 204 ? '' : await response.text();
    return { status: response.status, body: parseBody(text), requestId: response.headers.get('x-request-id') };
  }

  /** One refresh at a time, shared by every caller in this tab and serialized with other tabs. */
  const refreshOnce = singleFlight(async (): Promise<boolean> => {
    const raw = await send(SESSION_ROUTES.refresh, { method: 'POST', token: null });
    if (raw.status === 200) {
      store.setSession(raw.body as SessionResponse);
      return true;
    }
    if (raw.status === 401 || raw.status === 403) {
      store.clear(store.getState().status === 'authenticated' ? 'expired' : 'signed-out');
      return false;
    }
    throw toApiError(raw.status, raw.body, raw.requestId);
  }, exclusive);

  /** Sends with the current access token; on 401 renews it once (shared) and retries. */
  async function authorized(transport: Transport, auth: boolean): Promise<RawResponse> {
    if (!auth) return transport(null);
    const token = store.accessToken();
    const first = await transport(token);
    if (first.status !== 401) return first;
    // Another request may have renewed the token while this one was in flight.
    const current = store.accessToken();
    if (current && current !== token) return transport(current);
    if (!(await refreshOnce())) {
      throw new ApiError({ status: 401, code: CLIENT_ERROR_CODES.SESSION_EXPIRED, message: 'Your session has ended. Please sign in again.' });
    }
    return transport(store.accessToken());
  }

  function unwrap<T>(raw: RawResponse): T {
    if (raw.status >= 200 && raw.status < 300) return raw.body as T;
    throw toApiError(raw.status, raw.body, raw.requestId);
  }

  async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
    return unwrap<T>(await authorized(token => send(path, { ...init, token }), init.auth ?? true));
  }

  /** GET of a binary resource (e.g. a private receipt image); successful bodies stay a Blob. */
  async function sendForBlob(path: string, token: string | null, signal?: AbortSignal): Promise<RawResponse> {
    const headers: Record<string, string> = { Accept: 'image/*, application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, { method: 'GET', headers, credentials: 'include', signal });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR, message: 'Could not reach the server.' });
    }
    const requestId = response.headers.get('x-request-id');
    if (response.ok) return { status: response.status, body: await response.blob(), requestId };
    return { status: response.status, body: parseBody(await response.text()), requestId };
  }

  /**
   * Authenticated download as a Blob, with the same token refresh as `request`.
   * Needed for images the API only streams with a bearer token (a plain <img src> cannot send one).
   */
  async function requestBlob(path: string, options: { signal?: AbortSignal } = {}): Promise<Blob> {
    return unwrap<Blob>(await authorized(token => sendForBlob(path, token, options.signal), true));
  }

  function sendXhr(path: string, form: FormData, token: string | null, upload: UploadOptions): Promise<RawResponse> {
    return new Promise((resolve, reject) => {
      const xhr = createXhr();
      xhr.open('POST', `${baseUrl}${path}`);
      xhr.withCredentials = true;
      xhr.setRequestHeader('Accept', 'application/json');
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = event => { if (event.lengthComputable) upload.onProgress?.(event.loaded / event.total); };
      xhr.upload.onload = () => upload.onUploaded?.();
      xhr.onload = () => resolve({ status: xhr.status, body: parseBody(xhr.responseText), requestId: xhr.getResponseHeader('x-request-id') });
      xhr.onerror = () => reject(new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR, message: 'Could not reach the server.' }));
      xhr.onabort = () => reject(new DOMException('The upload was cancelled.', 'AbortError'));
      upload.signal?.addEventListener('abort', () => xhr.abort(), { once: true });
      xhr.send(form);
    });
  }

  /** multipart/form-data upload with progress (fetch cannot report upload progress). */
  async function uploadFile<T>(path: string, form: FormData, upload: UploadOptions = {}): Promise<T> {
    return unwrap<T>(await authorized(token => sendXhr(path, form, token, upload), true));
  }

  function announce(message: AuthMessage) {
    try { options.channel?.postMessage(message); } catch { /* Other tabs simply find out on their next request. */ }
  }

  options.channel?.addEventListener('message', event => {
    if (event.data?.type === 'signed-out') store.clear('signed-out');
    if (event.data?.type === 'signed-in' && store.getState().status !== 'authenticated') void refreshOnce().catch(() => undefined);
  });

  /** Signs in through `path` under the session lock, then tells the other tabs. */
  async function signIn(path: string, body: unknown, headers?: Record<string, string>): Promise<SessionResponse> {
    const session = await exclusive(() => request<SessionResponse>(path, { method: 'POST', body, auth: false, headers }));
    store.setSession(session);
    announce({ type: 'signed-in' });
    return session;
  }

  return {
    request,
    requestBlob,
    uploadFile,
    /** Restores the session from the refresh cookie (on startup) or renews the access token. */
    refreshSession: () => refreshOnce(),
    /** Restaurant owners. */
    /** `remember`: keep the session for 14 days; otherwise it ends when the browser closes. */
    login: (credentials: { email: string; password: string; remember?: boolean }) => signIn('/v1/auth/login', credentials),
    /** Staff PIN sign-in on a registered POS device (the device key authorises it). */
    pinLogin: (deviceKey: string, body: { userId: string; pin: string }) => signIn('/v1/pos/device/pin', body, { 'X-Pos-Device': deviceKey }),
    /** Ends the session on the server (best effort) and forgets it locally, in every tab. */
    async logout(): Promise<void> {
      try {
        await exclusive(() => request<void>(SESSION_ROUTES.logout, { method: 'POST', auth: false }));
      } catch {
        // The local session ends regardless; the server session expires on its own.
      }
      store.clear('signed-out');
      announce({ type: 'signed-out' });
    },
  };
}

function parseBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
