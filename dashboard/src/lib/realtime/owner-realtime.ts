import { io } from 'socket.io-client';
import { REALTIME_EVENTS, REALTIME_PATH, SERVICE_REQUEST_EVENTS, type OwnerOrder, type OwnerOrderEvent, type OwnerServiceRequest, type RestaurantUpdatedEvent, type ServiceRequestEvent } from '@bilhanah/contracts';

/** What the board shows: live, or trying to get back (events may be missed meanwhile). */
export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'stopped';

/** The parts of a Socket.IO client socket this module uses, so tests can supply a fake. */
export type SocketLike = {
  /** True while Socket.IO itself will keep reconnecting (false after a server disconnect or a middleware rejection). */
  readonly active: boolean;
  connect(): unknown;
  disconnect(): unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, listener: (...args: any[]) => void): unknown;
};

export type AuthCallback = (callback: (data: { token: string | null }) => void) => void;

export type OwnerRealtimeOptions = {
  /** API origin, e.g. http://127.0.0.1:3000. */
  url: string;
  /** The current access token (read on every connection attempt). */
  getToken: () => string | null;
  /** Renews the session through the shared single-flight refresh; false when the session has ended. */
  refresh: () => Promise<boolean>;
  onOrderCreated: (order: OwnerOrder) => void;
  onOrderUpdated: (order: OwnerOrder) => void;
  /** A branch's ordering settings changed, e.g. orders paused on another device. */
  onRestaurantUpdated?: (event: RestaurantUpdatedEvent) => void;
  /** A table asked for service, or a request changed (on any device). */
  onServiceRequest?: (kind: 'created' | 'updated', request: OwnerServiceRequest) => void;
  /** Called on every (re)connection: events may have been missed, so refetch. */
  onResync: () => void;
  onStateChange?: (state: ConnectionState) => void;
  /** Defaults to socket.io-client's `io`. */
  createSocket?: (url: string, auth: AuthCallback) => SocketLike;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

/** The middleware's rejection message for a missing, expired or revoked access token. */
export const UNAUTHENTICATED = 'UNAUTHENTICATED';

/** Waits after repeated authentication failures: 2 s, 4 s, 8 s … up to a minute. */
export function backoffDelay(failures: number): number {
  return Math.min(60_000, 1_000 * 2 ** Math.max(1, failures));
}

function defaultSocket(url: string, auth: AuthCallback): SocketLike {
  return io(`${url}/owner`, {
    path: REALTIME_PATH,
    transports: ['websocket'],
    autoConnect: false,
    // The callback runs on every attempt, so reconnections carry the current token.
    auth,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 10_000,
  });
}

/**
 * The owner's live order feed (`/owner` namespace).
 *
 * - The API disconnects the socket when the access token expires ("io server disconnect"):
 *   the session is renewed through the shared refresh and the socket reconnects.
 * - A handshake rejected as UNAUTHENTICATED is handled the same way once; after that,
 *   attempts back off (each one renews the session first).
 * - Other drops (network, server restart) are retried by Socket.IO itself.
 * - Every successful connection asks for a resync, since events may have been missed.
 */
export function createOwnerRealtime(options: OwnerRealtimeOptions) {
  const setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimer = options.clearTimer ?? (handle => clearTimeout(handle as ReturnType<typeof setTimeout>));
  let state: ConnectionState = 'stopped';
  let socket: SocketLike | null = null;
  let stopped = true;
  /** The token sent with the latest connection attempt. */
  let lastToken: string | null = null;
  let authFailures = 0;
  let timer: unknown = null;
  let renewing = false;

  const setState = (next: ConnectionState) => {
    if (state === next) return;
    state = next;
    options.onStateChange?.(next);
  };

  const cancelTimer = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  /** Reconnects with a fresh token: reuses one renewed meanwhile (e.g. by an HTTP call), otherwise refreshes. */
  async function renewAndReconnect(): Promise<void> {
    if (renewing || stopped) return;
    renewing = true;
    try {
      const current = options.getToken();
      if (!current || current === lastToken) {
        const renewed = await options.refresh();
        // The session has ended: the app signs the owner out, which stops this feed.
        if (!renewed) return;
      }
      if (!stopped) socket?.connect();
    } catch {
      // Network trouble while refreshing: try again later.
      if (!stopped) retryLater();
    } finally {
      renewing = false;
    }
  }

  function retryLater() {
    cancelTimer();
    authFailures += 1;
    timer = setTimer(() => { timer = null; void renewAndReconnect(); }, backoffDelay(authFailures));
  }

  function start() {
    if (!stopped) return;
    stopped = false;
    authFailures = 0;
    const created = (options.createSocket ?? defaultSocket)(options.url, callback => {
      lastToken = options.getToken();
      callback({ token: lastToken });
    });
    socket = created;
    created.on('connect', () => {
      authFailures = 0;
      cancelTimer();
      setState('connected');
      options.onResync();
    });
    created.on('disconnect', (reason: string) => {
      if (stopped || reason === 'io client disconnect') return;
      setState('reconnecting');
      // The server ended the connection (token expired or session revoked); Socket.IO will not retry on its own.
      if (reason === 'io server disconnect') void renewAndReconnect();
    });
    created.on('connect_error', (error: Error) => {
      if (stopped) return;
      setState('reconnecting');
      // Transport errors are retried by Socket.IO (socket.active); middleware rejections are not.
      if (created.active) return;
      if (error?.message === UNAUTHENTICATED && authFailures === 0) {
        authFailures = 1;
        void renewAndReconnect();
      } else {
        retryLater();
      }
    });
    created.on(REALTIME_EVENTS.ORDER_CREATED, (event: OwnerOrderEvent) => options.onOrderCreated(event.order));
    created.on(REALTIME_EVENTS.ORDER_UPDATED, (event: OwnerOrderEvent) => options.onOrderUpdated(event.order));
    created.on(REALTIME_EVENTS.RESTAURANT_UPDATED, (event: RestaurantUpdatedEvent) => options.onRestaurantUpdated?.(event));
    created.on(SERVICE_REQUEST_EVENTS.CREATED, (event: ServiceRequestEvent) => options.onServiceRequest?.('created', event.request));
    created.on(SERVICE_REQUEST_EVENTS.UPDATED, (event: ServiceRequestEvent) => options.onServiceRequest?.('updated', event.request));
    setState('connecting');
    created.connect();
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    cancelTimer();
    socket?.disconnect();
    socket = null;
    setState('stopped');
  }

  return { start, stop, getState: () => state };
}

export type OwnerRealtime = ReturnType<typeof createOwnerRealtime>;
