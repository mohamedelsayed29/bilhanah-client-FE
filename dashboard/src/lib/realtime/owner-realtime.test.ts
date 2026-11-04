import { describe, expect, it, vi } from 'vitest';
import type { OwnerOrder } from '@bilhanah/contracts';
import { backoffDelay, createOwnerRealtime, type AuthCallback, type ConnectionState, type SocketLike } from './owner-realtime';

/** Behaves like a Socket.IO client socket: `connect()` runs the auth callback and records the token sent. */
class FakeSocket implements SocketLike {
  active = false;
  readonly attempts: (string | null)[] = [];
  disconnects = 0;
  private readonly listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  constructor(private readonly auth: AuthCallback) {}
  on(event: string, listener: (...args: never[]) => void) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener as (...args: unknown[]) => void]);
    return this;
  }
  connect() {
    this.active = true;
    this.auth(data => this.attempts.push(data.token));
    return this;
  }
  disconnect() {
    this.active = false;
    this.disconnects += 1;
    this.emit('disconnect', 'io client disconnect');
    return this;
  }
  emit(event: string, ...args: unknown[]) {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }
  /** The handshake succeeded. */
  accept() { this.emit('connect'); }
  /** The server middleware refused the handshake (Socket.IO then stops retrying). */
  reject(message = 'UNAUTHENTICATED') { this.active = false; this.emit('connect_error', new Error(message)); }
  /** The server closed the connection, e.g. when the access token expired. */
  serverDisconnect() { this.active = false; this.emit('disconnect', 'io server disconnect'); }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function setup(options: { refresh?: () => Promise<boolean> } = {}) {
  let token: string | null = 'token-1';
  let refreshes = 0;
  const timers: { callback: () => void; ms: number }[] = [];
  const states: ConnectionState[] = [];
  const created: OwnerOrder[] = [];
  const settings: unknown[] = [];
  const resyncs = vi.fn();
  let socket!: FakeSocket;
  const refresh = options.refresh ?? (async () => { refreshes += 1; token = `token-${refreshes + 1}`; return true; });
  const realtime = createOwnerRealtime({
    url: 'http://api.test',
    getToken: () => token,
    refresh: async () => { const result = await refresh(); return result; },
    onOrderCreated: order => created.push(order),
    onOrderUpdated: () => undefined,
    onRestaurantUpdated: event => settings.push(event),
    onResync: resyncs,
    onStateChange: state => states.push(state),
    createSocket: (_url, auth) => (socket = new FakeSocket(auth)),
    setTimer: (callback, ms) => { timers.push({ callback, ms }); return timers.length; },
    clearTimer: () => undefined,
  });
  return {
    realtime, timers, states, created, resyncs, settings,
    get socket() { return socket; },
    get refreshes() { return refreshes; },
    setToken: (value: string | null) => { token = value; },
  };
}

describe('owner realtime', () => {
  it('connects with the current token, resyncs on every connection and delivers events', () => {
    const t = setup();
    t.realtime.start();
    expect(t.socket.attempts).toEqual(['token-1']);
    expect(t.realtime.getState()).toBe('connecting');
    t.socket.accept();
    expect(t.realtime.getState()).toBe('connected');
    expect(t.resyncs).toHaveBeenCalledTimes(1);
    t.socket.emit('order.created', { order: { id: 'o1' } });
    expect(t.created.map(order => order.id)).toEqual(['o1']);
    t.socket.emit('restaurant.updated', { branchId: 'nasr', ordering: { paused: true } });
    expect(t.settings).toEqual([{ branchId: 'nasr', ordering: { paused: true } }]);
    // A network drop: Socket.IO reconnects by itself; the board refetches afterwards.
    t.socket.emit('disconnect', 'transport close');
    expect(t.realtime.getState()).toBe('reconnecting');
    t.socket.accept();
    expect(t.resyncs).toHaveBeenCalledTimes(2);
    expect(t.refreshes).toBe(0);
  });

  it('refreshes the session and reconnects when the server disconnects on token expiry', async () => {
    const t = setup();
    t.realtime.start();
    t.socket.accept();
    t.socket.serverDisconnect();
    expect(t.realtime.getState()).toBe('reconnecting');
    await flush();
    expect(t.refreshes).toBe(1);
    expect(t.socket.attempts).toEqual(['token-1', 'token-2']);
    t.socket.accept();
    expect(t.states).toEqual(['connecting', 'connected', 'reconnecting', 'connected']);
  });

  it('reuses a token renewed meanwhile instead of refreshing again', async () => {
    const t = setup();
    t.realtime.start();
    t.socket.accept();
    t.setToken('renewed-by-http');
    t.socket.serverDisconnect();
    await flush();
    expect(t.refreshes).toBe(0);
    expect(t.socket.attempts).toEqual(['token-1', 'renewed-by-http']);
  });

  it('retries an UNAUTHENTICATED handshake once right away, then backs off', async () => {
    const t = setup();
    t.realtime.start();
    t.socket.reject();
    await flush();
    expect(t.refreshes).toBe(1);
    expect(t.socket.attempts).toEqual(['token-1', 'token-2']);
    expect(t.timers).toHaveLength(0);

    t.socket.reject();
    await flush();
    expect(t.refreshes).toBe(1);
    expect(t.timers.map(timer => timer.ms)).toEqual([4_000]);

    // When the timer fires the session is renewed (again) and the socket reconnects.
    t.timers[0]!.callback();
    await flush();
    expect(t.refreshes).toBe(2);
    expect(t.socket.attempts).toEqual(['token-1', 'token-2', 'token-3']);
    t.socket.reject();
    await flush();
    expect(t.timers.map(timer => timer.ms)).toEqual([4_000, 8_000]);

    // A successful connection resets the backoff.
    t.timers[1]!.callback();
    await flush();
    t.socket.accept();
    t.socket.serverDisconnect();
    await flush();
    t.socket.reject();
    await flush();
    expect(t.timers).toHaveLength(2);
  });

  it('leaves transport errors to Socket.IO', async () => {
    const t = setup();
    t.realtime.start();
    t.socket.emit('connect_error', new Error('websocket error'));
    await flush();
    expect(t.realtime.getState()).toBe('reconnecting');
    expect(t.refreshes).toBe(0);
    expect(t.timers).toHaveLength(0);
  });

  it('stops trying when the session has ended', async () => {
    const t = setup({ refresh: async () => false });
    t.realtime.start();
    t.socket.accept();
    t.socket.serverDisconnect();
    await flush();
    expect(t.socket.attempts).toEqual(['token-1']);
    expect(t.realtime.getState()).toBe('reconnecting');
  });

  it('backs off when refreshing fails because of the network', async () => {
    const t = setup({ refresh: async () => { throw new Error('offline'); } });
    t.realtime.start();
    t.socket.accept();
    t.socket.serverDisconnect();
    await flush();
    expect(t.timers.map(timer => timer.ms)).toEqual([2_000]);
  });

  it('disconnects on stop and ignores late events', async () => {
    const t = setup();
    t.realtime.start();
    t.socket.accept();
    const socket = t.socket;
    t.realtime.stop();
    expect(socket.disconnects).toBe(1);
    expect(t.realtime.getState()).toBe('stopped');
    socket.serverDisconnect();
    await flush();
    expect(t.refreshes).toBe(0);
  });

  it('caps the backoff at a minute', () => {
    expect([1, 2, 3, 6, 10].map(backoffDelay)).toEqual([2_000, 4_000, 8_000, 60_000, 60_000]);
  });
});
