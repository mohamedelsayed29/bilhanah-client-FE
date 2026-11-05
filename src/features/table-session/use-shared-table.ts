import { useCallback, useEffect, useRef, useState } from 'react';
import { TABLE_SESSION_EVENTS, type TableSessionView } from '@bilhanah/contracts';
import { ApiError, newIdempotencyKey } from '../../lib/api';
import { API_URL } from '../../lib/config';
import {
  addSharedItem, fetchSharedTable, joinSharedTable, loadGuestToken, removeSharedItem, renameGuest, saveGuestToken, submitSharedTable, updateSharedItem,
} from './session-api';

/** Without a live connection, the shared order is refreshed this often. */
const POLL_MS = 10_000;

/** Errors that mean this phone's place in the session is gone: join again. */
const GONE = new Set(['TABLE_GUEST_INVALID']);

export type SharedTable = ReturnType<typeof useSharedTable>;

/**
 * The table's shared session for this phone: joined once the table code is known (rejoining as the
 * same guest after a reload), kept live over the /table socket with polling as a fallback. Every
 * change returns the whole session, so the view is always the server's.
 */
export function useSharedTable(subdomain: string, code: string | null, enabled: boolean) {
  const [view, setView] = useState<TableSessionView | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const guestRef = useRef<string | null>(null);
  // One key per submission: a retry after a dropped connection returns the same order.
  const submitKey = useRef<string | null>(null);

  const accept = useCallback((next: TableSessionView) => {
    guestRef.current = next.guestToken;
    if (code) saveGuestToken(subdomain, code, next.guestToken);
    setView(next);
  }, [subdomain, code]);

  /** Starts over in the table's current session (after it closed, or this phone's token was lost). */
  const rejoin = useCallback(() => { setView(null); setAttempt(value => value + 1); }, []);

  useEffect(() => {
    if (!enabled || !code) return;
    const controller = new AbortController();
    joinSharedTable(subdomain, code, loadGuestToken(subdomain, code), controller.signal).then(next => { setUnavailable(false); accept(next); }).catch(error => {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && (error.code === 'TABLE_SESSION_UNAVAILABLE' || error.code === 'TABLE_NOT_FOUND')) setUnavailable(true);
    });
    return () => controller.abort();
  }, [subdomain, code, enabled, attempt, accept]);

  const sessionToken = view?.sessionToken ?? null;
  useEffect(() => {
    if (!sessionToken) return;
    let active = true;
    let poll: number | null = null;
    const refresh = () => {
      const guest = guestRef.current;
      if (!guest) return;
      fetchSharedTable(guest).then(next => { if (active) accept(next); }).catch(error => {
        if (active && error instanceof ApiError && GONE.has(error.code)) rejoin();
      });
    };
    const startPolling = () => { if (poll === null) poll = window.setInterval(refresh, POLL_MS); };
    const stopPolling = () => { if (poll !== null) { window.clearInterval(poll); poll = null; } };
    let socket: { disconnect: () => void; removeAllListeners: () => void } | null = null;
    startPolling();
    void import('socket.io-client').then(({ io }) => {
      if (!active) return;
      const live = io(`${API_URL}/table`, { path: '/v1/realtime', transports: ['websocket'], auth: { token: sessionToken } });
      live.on('connect', () => { stopPolling(); refresh(); });
      live.on('connect_error', startPolling);
      live.on('disconnect', startPolling);
      live.on(TABLE_SESSION_EVENTS.UPDATED, refresh);
      socket = live;
    });
    // Back from another app: catch up at once.
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      stopPolling();
      document.removeEventListener('visibilitychange', onVisible);
      socket?.removeAllListeners();
      socket?.disconnect();
    };
  }, [sessionToken, accept, rejoin]);

  /** Runs a change; the answer (or a refetch after a refusal) becomes the view. Rethrows the ApiError for messages. */
  const run = useCallback(async (change: (guest: string) => Promise<TableSessionView>) => {
    const guest = guestRef.current;
    if (!guest) throw new ApiError(0, 'TABLE_GUEST_INVALID');
    setBusy(true);
    try {
      accept(await change(guest));
    } catch (error) {
      if (error instanceof ApiError && GONE.has(error.code)) rejoin();
      else fetchSharedTable(guest).then(accept).catch(() => undefined);
      throw error;
    } finally {
      setBusy(false);
    }
  }, [accept, rejoin]);

  const submit = useCallback(async (scope: 'MINE' | 'TABLE', expectedTotalPiastres: number) => {
    const guest = guestRef.current;
    if (!guest) throw new ApiError(0, 'TABLE_GUEST_INVALID');
    setBusy(true);
    try {
      const sent = await submitSharedTable(guest, submitKey.current ??= newIdempotencyKey(), { scope, expectedTotalPiastres });
      submitKey.current = null;
      accept(sent.session);
      return sent;
    } catch (error) {
      // Refused (not a lost connection): the next try is a new submission.
      if (error instanceof ApiError && error.status !== 0) submitKey.current = null;
      fetchSharedTable(guest).then(accept).catch(() => undefined);
      throw error;
    } finally {
      setBusy(false);
    }
  }, [accept]);

  return {
    view,
    /** Shared ordering is off here; the menu works as before. */
    unavailable,
    busy,
    /** Joined and the session still takes dishes or shows them (not closed). */
    joined: !!view && view.status !== 'CLOSED',
    rejoin,
    add: (body: { menuItemId: string; variantId: string; quantity: number; note?: string | null }) => run(guest => addSharedItem(guest, body)),
    update: (itemId: string, version: number, change: { quantity?: number; note?: string | null }) => run(guest => updateSharedItem(guest, itemId, { ...change, version })),
    remove: (itemId: string, version: number) => run(guest => removeSharedItem(guest, itemId, version)),
    rename: (name: string) => run(guest => renameGuest(guest, name)),
    submit,
  };
}
