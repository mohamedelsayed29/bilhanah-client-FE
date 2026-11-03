import { useCallback, useEffect, useRef, useState } from 'react';
import { type PublicServiceRequest, SERVICE_REQUEST_EVENTS, type TableServiceEvent } from '@bilhanah/contracts';
import { ApiError } from '../../lib/api';
import { API_URL } from '../../lib/config';
import { fetchTableSession, joinTableSession, loadSessionToken, saveSessionToken } from './service-api';

/** Without a live connection, the requests' status is checked this often. */
const POLL_MS = 15_000;

export type TableService = {
  /** Null until the table session is joined (or when the table takes no requests). */
  token: string | null;
  requests: PublicServiceRequest[];
  /** The restaurant took requests when the session was joined. */
  available: boolean;
  /** Replaces or adds a request in the list (after sending or withdrawing one). */
  upsert: (request: PublicServiceRequest) => void;
  /** The session ended (bill settled, or idle): join a new one. */
  rejoin: () => void;
};

/**
 * The scanned table's service session: joined once the table code is known, with this session's
 * requests kept live over the /table socket (falling back to polling), so the guests see the
 * staff acknowledge and complete them without refreshing.
 */
export function useTableService(subdomain: string, code: string | null, enabled: boolean): TableService {
  const [token, setToken] = useState<string | null>(null);
  const [requests, setRequests] = useState<PublicServiceRequest[]>([]);
  const [available, setAvailable] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const upsert = useCallback((request: PublicServiceRequest) => setRequests(current => {
    const others = current.filter(entry => entry.id !== request.id);
    return [request, ...others].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }), []);
  const rejoin = useCallback(() => { if (code) saveSessionToken(subdomain, code, null); setToken(null); setAttempt(value => value + 1); }, [subdomain, code]);

  useEffect(() => {
    if (!enabled || !code) return;
    const controller = new AbortController();
    joinTableSession(subdomain, code, loadSessionToken(subdomain, code), controller.signal).then(session => {
      saveSessionToken(subdomain, code, session.sessionToken);
      setToken(session.sessionToken);
      setRequests(session.requests);
      setAvailable(true);
    }).catch(error => {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.code === 'SERVICE_REQUESTS_UNAVAILABLE') setAvailable(false);
    });
    return () => controller.abort();
  }, [subdomain, code, enabled, attempt]);

  // Live status: the /table socket, loaded on demand; polling while it is not connected.
  const latest = useRef({ upsert, rejoin });
  latest.current = { upsert, rejoin };
  useEffect(() => {
    if (!token) return;
    let active = true;
    let poll: number | null = null;
    const refresh = () => fetchTableSession(token).then(session => { if (active) setRequests(session.requests); }).catch(error => {
      if (active && error instanceof ApiError && error.code === 'TABLE_SESSION_INVALID') latest.current.rejoin();
    });
    const startPolling = () => { if (poll === null) poll = window.setInterval(refresh, POLL_MS); };
    const stopPolling = () => { if (poll !== null) { window.clearInterval(poll); poll = null; } };
    let socket: { disconnect: () => void; removeAllListeners: () => void } | null = null;
    startPolling();
    void import('socket.io-client').then(({ io }) => {
      if (!active) return;
      const live = io(`${API_URL}/table`, { path: '/v1/realtime', transports: ['websocket'], auth: { token } });
      live.on('connect', () => { stopPolling(); void refresh(); });
      live.on('connect_error', startPolling);
      live.on('disconnect', startPolling);
      const onEvent = (event: TableServiceEvent) => { if (active) latest.current.upsert(event.request); };
      live.on(SERVICE_REQUEST_EVENTS.CREATED, onEvent);
      live.on(SERVICE_REQUEST_EVENTS.UPDATED, onEvent);
      socket = live;
    });
    return () => {
      active = false;
      stopPolling();
      socket?.removeAllListeners();
      socket?.disconnect();
    };
  }, [token]);

  return { token, requests, available, upsert, rejoin };
}
