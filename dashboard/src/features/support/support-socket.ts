import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { REALTIME_PATH, SUPPORT_EVENTS, SUPPORT_NAMESPACE, type SupportTypingEvent, type SupportUpdatedEvent } from '@bilhanah/contracts';
import { apiClient } from '../../lib/api';
import { API_URL } from '../../lib/config';
import { sessionStore } from '../../lib/session';

/**
 * One shared Socket.IO connection to the support namespace for everything on screen that needs it
 * (reference-counted). It carries the current access token on every attempt and renews the session
 * when the API ends the connection at token expiry.
 */
let socket: Socket | null = null;
let users = 0;

function acquire(): Socket {
  if (!socket) {
    const created = io(`${API_URL}${SUPPORT_NAMESPACE}`, {
      path: REALTIME_PATH,
      transports: ['websocket'],
      auth: callback => callback({ token: sessionStore.accessToken() }),
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
    });
    const renew = () => void apiClient.refreshSession().then(ok => { if (ok && socket === created) created.connect(); }, () => undefined);
    created.on('connect_error', error => { if (error.message === 'UNAUTHENTICATED') window.setTimeout(renew, 2_000); });
    created.on('disconnect', reason => { if (reason === 'io server disconnect') renew(); });
    socket = created;
  }
  users += 1;
  return socket;
}

function release() {
  users -= 1;
  if (users <= 0 && socket) {
    socket.disconnect();
    socket = null;
    users = 0;
  }
}

/** Listens to support events while mounted; returns a throttled "I am typing in this ticket". */
export function useSupportSocket(handlers: { onUpdated?: (event: SupportUpdatedEvent) => void; onTyping?: (event: SupportTypingEvent) => void; onConnect?: () => void }) {
  const latest = useRef(handlers);
  latest.current = handlers;
  const lastTyping = useRef(0);
  const connection = useRef<Socket | null>(null);
  useEffect(() => {
    const current = acquire();
    connection.current = current;
    const updated = (event: SupportUpdatedEvent) => latest.current.onUpdated?.(event);
    const typing = (event: SupportTypingEvent) => latest.current.onTyping?.(event);
    // Events may have been missed while disconnected: let the caller refetch.
    const connected = () => latest.current.onConnect?.();
    current.on(SUPPORT_EVENTS.UPDATED, updated);
    current.on(SUPPORT_EVENTS.TYPING, typing);
    current.on('connect', connected);
    return () => {
      current.off(SUPPORT_EVENTS.UPDATED, updated);
      current.off(SUPPORT_EVENTS.TYPING, typing);
      current.off('connect', connected);
      connection.current = null;
      release();
    };
  }, []);
  return {
    typing(ticketId: string) {
      const now = Date.now();
      if (now - lastTyping.current < 1_500) return;
      lastTyping.current = now;
      connection.current?.emit(SUPPORT_EVENTS.TYPING, { ticketId });
    },
  };
}
