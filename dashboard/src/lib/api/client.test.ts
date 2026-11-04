import { describe, expect, it, vi } from 'vitest';
import type { SessionResponse } from '@bilhanah/contracts';
import { SessionStore } from '../session/session-store';
import { ApiError } from './api-error';
import { createApiClient } from './client';
import { createExclusive, type LockManagerLike, singleFlight } from './single-flight';

const user = { id: 'u1', email: 'owner@example.com', fullName: 'Owner', preferredLanguage: 'ar', role: 'OWNER', emailVerified: true, permissions: [] as never[] } as const;
const session = (token: string): SessionResponse => ({ accessToken: token, accessTokenExpiresIn: 900, user });

const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'x-request-id': 'req-1' } });

/** Resolves later, so tests control when a fake response arrives. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

/** A fake `navigator.locks`: one holder at a time per name, FIFO, shared by every "tab" that uses it. */
function fakeLocks(): LockManagerLike & { held: () => number; maxHeld: () => number } {
  const queues = new Map<string, Promise<unknown>>();
  let held = 0;
  let maxHeld = 0;
  return {
    held: () => held,
    maxHeld: () => maxHeld,
    request<T>(name: string, callback: () => Promise<T>): Promise<T> {
      const previous = queues.get(name) ?? Promise.resolve();
      const run = previous.then(async () => {
        held += 1;
        maxHeld = Math.max(maxHeld, held);
        try { return await callback(); } finally { held -= 1; }
      });
      queues.set(name, run.catch(() => undefined));
      return run;
    },
  };
}

/** A fake API: protected routes accept access tokens issued by refresh; the cookie rotates on each refresh. */
function fakeApi(options: { refreshDelay?: Promise<void>; refreshStatus?: number } = {}) {
  const validTokens = new Set<string>();
  let refreshes = 0;
  let concurrentRefreshes = 0;
  let maxConcurrentRefreshes = 0;
  const calls: { url: string; auth: string | null; credentials: RequestCredentials | undefined }[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const auth = (init?.headers as Record<string, string> | undefined)?.['Authorization'] ?? null;
    calls.push({ url, auth, credentials: init?.credentials });
    if (url.endsWith('/v1/auth/refresh')) {
      refreshes += 1;
      concurrentRefreshes += 1;
      maxConcurrentRefreshes = Math.max(maxConcurrentRefreshes, concurrentRefreshes);
      try {
        await options.refreshDelay;
        if (options.refreshStatus && options.refreshStatus !== 200) {
          return json(options.refreshStatus, { error: { code: 'SESSION_INVALID', message: 'Session ended.', requestId: 'r' } });
        }
        const token = `token-${refreshes}`;
        validTokens.add(token);
        return json(200, session(token));
      } finally {
        concurrentRefreshes -= 1;
      }
    }
    if (!auth || !validTokens.has(auth.slice('Bearer '.length))) return json(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.', requestId: 'r' } });
    return json(200, { ok: true, url });
  });
  return {
    fetchImpl,
    calls,
    get refreshes() { return refreshes; },
    get maxConcurrentRefreshes() { return maxConcurrentRefreshes; },
  };
}

describe('singleFlight', () => {
  it('shares one in-flight call between concurrent callers and runs again afterwards', async () => {
    const gate = deferred<void>();
    let runs = 0;
    const shared = singleFlight(async () => { runs += 1; await gate.promise; return runs; }, createExclusive(null, 'test'));
    const [a, b, c] = [shared(), shared(), shared()];
    gate.resolve();
    expect(await Promise.all([a, b, c])).toEqual([1, 1, 1]);
    expect(await shared()).toBe(2);
    expect(runs).toBe(2);
  });

  it('clears the in-flight call after a failure so the next caller retries', async () => {
    let runs = 0;
    const shared = singleFlight(async () => { runs += 1; if (runs === 1) throw new Error('boom'); return 'ok'; }, createExclusive(null, 'test'));
    await expect(Promise.all([shared(), shared()])).rejects.toThrow('boom');
    await expect(shared()).resolves.toBe('ok');
    expect(runs).toBe(2);
  });

  it('holds the named lock while running, so two tabs never overlap', async () => {
    const locks = fakeLocks();
    const gate = deferred<void>();
    const tabA = singleFlight(async () => { await gate.promise; return 'a'; }, createExclusive(locks, 'auth'));
    const tabB = singleFlight(async () => 'b', createExclusive(locks, 'auth'));
    const a = tabA();
    const b = tabB();
    await Promise.resolve();
    expect(locks.held()).toBe(1);
    gate.resolve();
    expect(await Promise.all([a, b])).toEqual(['a', 'b']);
    expect(locks.maxHeld()).toBe(1);
  });
});

describe('api client', () => {
  it('refreshes once for concurrent 401s and retries each request with the new token', async () => {
    const gate = deferred<void>();
    const api = fakeApi({ refreshDelay: gate.promise });
    const store = new SessionStore();
    store.setSession(session('stale-token'));
    const client = createApiClient({ baseUrl: 'http://api.test', store, fetch: api.fetchImpl, locks: null });

    const requests = Promise.all([client.request('/v1/menu'), client.request('/v1/restaurants/mine'), client.request('/v1/auth/sessions')]);
    await vi.waitFor(() => expect(api.refreshes).toBe(1));
    gate.resolve();
    const results = await requests;

    expect(api.refreshes).toBe(1);
    expect(results).toHaveLength(3);
    expect(store.accessToken()).toBe('token-1');
    const retried = api.calls.filter(call => call.auth === 'Bearer token-1').map(call => call.url);
    expect(retried.sort()).toEqual(['http://api.test/v1/auth/sessions', 'http://api.test/v1/menu', 'http://api.test/v1/restaurants/mine']);
    expect(api.calls.every(call => call.credentials === 'include')).toBe(true);
  });

  it('does not refresh again when the token was renewed while the request was in flight', async () => {
    const store = new SessionStore();
    store.setSession(session('token-0'));
    const seen: (string | null)[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string>)['Authorization'] ?? null;
      seen.push(`${String(input).replace('http://api.test', '')} ${auth}`);
      if (auth === 'Bearer token-0') {
        // Meanwhile another request renewed the session.
        store.setSession(session('token-1'));
        return json(401, { error: { code: 'UNAUTHENTICATED', message: 'x', requestId: 'r' } });
      }
      return json(200, { ok: true });
    });
    const client = createApiClient({ baseUrl: 'http://api.test', store, fetch: fetchImpl, locks: null });
    await expect(client.request('/v1/menu')).resolves.toEqual({ ok: true });
    expect(seen).toEqual(['/v1/menu Bearer token-0', '/v1/menu Bearer token-1']);
  });

  it('serializes refreshes across tabs sharing navigator.locks', async () => {
    const api = fakeApi();
    const locks = fakeLocks();
    const tabs = [new SessionStore(), new SessionStore()].map(store => {
      store.setSession(session('old'));
      return { store, client: createApiClient({ baseUrl: 'http://api.test', store, fetch: api.fetchImpl, locks }) };
    });
    await Promise.all(tabs.flatMap(({ client }) => [client.request('/v1/menu'), client.request('/v1/menu')]));
    expect(api.maxConcurrentRefreshes).toBe(1);
    expect(api.refreshes).toBe(2); // one per tab, one after the other
    expect(locks.maxHeld()).toBe(1);
  });

  it('ends the session and throws SESSION_EXPIRED when the refresh is rejected', async () => {
    const api = fakeApi({ refreshStatus: 401 });
    const store = new SessionStore();
    store.setSession(session('stale'));
    const client = createApiClient({ baseUrl: 'http://api.test', store, fetch: api.fetchImpl, locks: null });
    const error = await client.request('/v1/menu').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('SESSION_EXPIRED');
    expect(store.getState()).toEqual({ status: 'anonymous', reason: 'expired' });
  });

  it('restores a session on startup with a single refresh even when called twice', async () => {
    const api = fakeApi();
    const store = new SessionStore();
    const client = createApiClient({ baseUrl: 'http://api.test', store, fetch: api.fetchImpl, locks: null });
    expect(await Promise.all([client.refreshSession(), client.refreshSession()])).toEqual([true, true]);
    expect(api.refreshes).toBe(1);
    expect(store.getState().status).toBe('authenticated');
  });

  it('parses the error envelope into a typed ApiError without refreshing public calls', async () => {
    const fetchImpl = vi.fn(async () => json(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Wrong email or password.', requestId: 'abc' } }));
    const store = new SessionStore();
    const client = createApiClient({ baseUrl: 'http://api.test', store, fetch: fetchImpl, locks: null });
    const error = (await client.login({ email: 'a@b.co', password: 'x' }).catch((caught: unknown) => caught)) as ApiError;
    expect(error).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS', message: 'Wrong email or password.', requestId: 'abc' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('reports unreachable servers as NETWORK_ERROR', async () => {
    const store = new SessionStore();
    const client = createApiClient({ baseUrl: 'http://api.test', store, fetch: async () => { throw new TypeError('Failed to fetch'); }, locks: null });
    await expect(client.request('/v1/public/plans', { auth: false })).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('downloads protected files as a Blob with the bearer token, refreshing once on 401', async () => {
    const store = new SessionStore();
    store.setSession(session('stale'));
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const auth = (init?.headers as Record<string, string> | undefined)?.['Authorization'] ?? null;
      seen.push(`${url.replace('http://api.test', '')} ${auth}`);
      if (url.endsWith('/v1/auth/refresh')) return json(200, session('fresh'));
      if (auth !== 'Bearer fresh') return json(401, { error: { code: 'UNAUTHENTICATED', message: 'x', requestId: 'r' } });
      return new Response(new Uint8Array([0x52, 0x49, 0x46, 0x46]), { status: 200, headers: { 'content-type': 'image/webp' } });
    });
    const client = createApiClient({ baseUrl: 'http://api.test', store, fetch: fetchImpl, locks: null });
    const blob = await client.requestBlob('/v1/billing/payments/p1/proof');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/webp');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([0x52, 0x49, 0x46, 0x46]));
    expect(seen).toEqual(['/v1/billing/payments/p1/proof Bearer stale', '/v1/auth/refresh null', '/v1/billing/payments/p1/proof Bearer fresh']);
    expect(fetchImpl.mock.calls.every(([, init]) => init?.credentials === 'include')).toBe(true);
  });

  it('turns an error response to a blob request into a typed ApiError', async () => {
    const store = new SessionStore();
    store.setSession(session('token'));
    const fetchImpl = vi.fn(async () => json(404, { error: { code: 'PAYMENT_NOT_FOUND', message: 'This payment has no receipt.', requestId: 'r9' } }));
    const client = createApiClient({ baseUrl: 'http://api.test', store, fetch: fetchImpl, locks: null });
    await expect(client.requestBlob('/v1/admin/payments/p1/proof')).rejects.toMatchObject({ status: 404, code: 'PAYMENT_NOT_FOUND', requestId: 'r9' });
  });
});
