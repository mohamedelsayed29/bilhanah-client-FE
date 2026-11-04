import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { BranchList, KitchenContext, OwnerOrder, OwnerRestaurant } from '@bilhanah/contracts';
import { useToast } from '../../../components/Toast';
import { apiClient } from '../../../lib/api';
import { ordersApi } from '../../../lib/api/endpoints';
import { API_URL } from '../../../lib/config';
import { useLanguage } from '../../../lib/language';
import type { ConnectionState, OwnerRealtime } from '../../../lib/realtime/owner-realtime';
import { sessionStore } from '../../../lib/session';
import { useBranchScope } from '../../branches/BranchScope';
import { contextFollowsBranch, withBranchOrdering } from '../../branches/scope';
import { queryKeys, useOpenServiceRequestsQuery } from '../queries';
import { SERVICE_TYPES } from '../service/service-types';
import { type BoardScope, isActiveStatus, mergeIntoBoard } from './board';
import { updateBoards } from './board-cache';
import { getAudioState, getChimeStyle, playChime, subscribeAudio, unlockAudio, type AudioState } from './chime';
import { orderNo } from './labels';

const SOUND_KEY = 'bilhanah:order-sound:v1';
/** While new orders are unseen, the sound repeats this often. */
const REPEAT_MS = 30_000;
/** The board API pages; a restaurant never has this many open orders at once. */
const BOARD_PAGE_SIZE = 100;

type LiveValue = {
  /** Ordering is part of the plan, so the board is loaded and kept live. */
  enabled: boolean;
  /** The branch (or every branch) whose orders the board, alerts and count follow. */
  scope: BoardScope;
  connection: ConnectionState;
  /** Orders that arrived since the owner last interacted with the board. */
  unseen: ReadonlySet<string>;
  markSeen: () => void;
  /** Orders waiting to be accepted (the navigation badge). */
  newCount: number;
  /** Goes up by one each time new orders arrive (not on the first load); the sidebar animates on it. */
  arrivals: number;
  /** Table service requests still waiting on the staff (the navigation badge); 0 where they are not handled (the kitchen). */
  serviceOpen: number;
  /** Goes up by one each time a table asks for service live; the sidebar animates on it. */
  serviceArrivals: number;
  sound: { on: boolean; setOn: (on: boolean) => void; audio: AudioState; unlock: () => Promise<boolean> };
};

const LiveContext = createContext<LiveValue | null>(null);

export const fetchBoard = async (scope: BoardScope): Promise<OwnerOrder[]> =>
  (await ordersApi.list({ view: 'active', pageSize: BOARD_PAGE_SIZE, branchId: scope === 'all' ? null : scope })).items;

/** The live board of one branch, or of every branch the viewer may see. */
export function useBoardQuery(scope: BoardScope, enabled = true) {
  return useQuery({ queryKey: queryKeys.board(scope), queryFn: () => fetchBoard(scope), enabled, staleTime: 15_000 });
}

function readSoundPreference(): boolean {
  try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; }
}

/** "(2) Orders | Bilhanah" while there are unseen orders; survives page title changes. */
function useTitleCount(count: number) {
  useEffect(() => {
    const apply = () => {
      const base = document.title.replace(/^\(\d+\)\s/, '');
      const wanted = count > 0 ? `(${count}) ${base}` : base;
      if (document.title !== wanted) document.title = wanted;
    };
    apply();
    const title = document.querySelector('title');
    if (!title || count === 0) return;
    const observer = new MutationObserver(apply);
    observer.observe(title, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, [count]);
}

/**
 * Keeps the board live across the owner shell (or the kitchen screen): the Socket.IO feed,
 * the new-order alert (sound, toast, tab title) and the count for the navigation, for the
 * branch scope being worked on (a device at one branch does not ring for another's orders).
 * `enabled`: ordering is part of the plan.
 */
export function OrdersLiveProvider({ enabled, scope, serviceRequests = false, children }: {
  enabled: boolean;
  scope: BoardScope;
  /** This viewer handles table service requests (owners and managers, not the kitchen). */
  serviceRequests?: boolean;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { text, number } = useLanguage();
  const board = useBoardQuery(scope, enabled);
  const [connection, setConnection] = useState<ConnectionState>('stopped');
  const [unseen, setUnseen] = useState<ReadonlySet<string>>(() => new Set());
  const [arrivals, setArrivals] = useState(0);
  const [serviceArrivals, setServiceArrivals] = useState(0);
  const openRequests = useOpenServiceRequestsQuery(scope, enabled && serviceRequests);
  const [soundOn, setSoundOnState] = useState(readSoundPreference);
  const audio = useSyncExternalStore(subscribeAudio, getAudioState, () => 'unsupported' as const);

  const latest = useRef({ soundOn, text, number, toast, scope, serviceRequests });
  latest.current = { soundOn, text, number, toast, scope, serviceRequests };

  // The live feed: events go straight into the board cache; every (re)connection refetches.
  useEffect(() => {
    if (!enabled) return;
    let realtime: OwnerRealtime | null = null;
    let cancelled = false;
    // The Socket.IO client loads on demand, outside the first bundle.
    void import('../../../lib/realtime/owner-realtime').then(({ createOwnerRealtime }) => {
      if (cancelled) return;
      realtime = createOwnerRealtime({
        url: API_URL,
        getToken: () => sessionStore.accessToken(),
        refresh: () => apiClient.refreshSession(),
        // Owners and all-branch staff hear about every branch: each board keeps its own branch's orders.
        onOrderCreated: order => {
          updateBoards(queryClient, (current, boardScope) => mergeIntoBoard(current, order, boardScope));
          if (order.type === 'DINE_IN') void queryClient.invalidateQueries({ queryKey: queryKeys.floors });
        },
        onOrderUpdated: order => {
          if (order.type === 'DINE_IN') void queryClient.invalidateQueries({ queryKey: queryKeys.floors });
          updateBoards(queryClient, (current, boardScope) => mergeIntoBoard(current, order, boardScope));
          queryClient.setQueryData(queryKeys.order(order.id), order);
          if (!isActiveStatus(order.status)) void queryClient.invalidateQueries({ queryKey: queryKeys.orderHistoryAll });
        },
        // One branch's ordering switches changed (e.g. paused on another device).
        onRestaurantUpdated: event => {
          queryClient.setQueryData<BranchList>(queryKeys.branches, current => (current ? withBranchOrdering(current, event) : current));
          queryClient.setQueryData<OwnerRestaurant>(queryKeys.restaurant, current => (current && current.mainBranchId === event.branchId ? { ...current, ordering: event.ordering } : current));
          queryClient.setQueryData<KitchenContext>(queryKeys.kitchenContext, current => (current && contextFollowsBranch(current, event.branchId) ? { ...current, ordering: event.ordering } : current));
        },
        // A table asked for service, or a request changed: refetch the lists, and ring for new ones of this branch.
        onServiceRequest: (kind, request) => {
          const { serviceRequests: handles, scope: current, soundOn: sound, text: t, toast: notify } = latest.current;
          if (!handles) return;
          void queryClient.invalidateQueries({ queryKey: queryKeys.serviceRequests });
          if (kind !== 'created' || (current !== 'all' && current !== request.branchId)) return;
          setServiceArrivals(count => count + 1);
          if (sound) playChime();
          const type = SERVICE_TYPES[request.type];
          notify.success(t(`${request.tableLabel}: ${type.ar}`, `${request.tableLabel}: ${type.en}`));
        },
        onResync: () => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.serviceRequests });
          void queryClient.invalidateQueries({ queryKey: queryKeys.boards });
          void queryClient.invalidateQueries({ queryKey: queryKeys.floors });
          void queryClient.invalidateQueries({ queryKey: queryKeys.branches });
        },
        onStateChange: setConnection,
      });
      realtime.start();
    });
    return () => {
      cancelled = true;
      realtime?.stop();
    };
  }, [enabled, queryClient]);

  // New orders, however they arrived (live event or a refetch after reconnecting), alert once.
  const known = useRef<{ scope: BoardScope; ids: Set<string> } | null>(null);
  useEffect(() => {
    const orders = board.data;
    if (!orders) return;
    const placed = orders.filter(order => order.status === 'PLACED');
    if (known.current === null || known.current.scope !== scope) {
      // The first load (and the first one after switching branch) is not news.
      known.current = { scope, ids: new Set(orders.map(order => order.id)) };
      setUnseen(current => (current.size === 0 ? current : new Set()));
      return;
    }
    const seenIds = known.current.ids;
    const fresh = placed.filter(order => !seenIds.has(order.id));
    for (const order of orders) seenIds.add(order.id);
    setUnseen(current => {
      const stillNew = [...current].filter(id => placed.some(order => order.id === id));
      const next = new Set([...stillNew, ...fresh.map(order => order.id)]);
      return next.size === current.size && stillNew.length === current.size ? current : next;
    });
    if (fresh.length === 0) return;
    setArrivals(count => count + 1);
    const { soundOn: sound, text: t, number: n, toast: notify } = latest.current;
    if (sound) playChime();
    notify.success(fresh.length === 1
      ? t(`طلب جديد ${orderNo(fresh[0]!.number, n)}`, `New order #${fresh[0]!.number}`)
      : t(`${n(fresh.length)} طلبات جديدة`, `${fresh.length} new orders`));
  }, [board.data, scope]);

  // Repeat the sound while new orders are waiting to be seen.
  useEffect(() => {
    if (unseen.size === 0 || !soundOn) return;
    const timer = window.setInterval(() => { if (getChimeStyle().repeat) playChime(); }, REPEAT_MS);
    return () => window.clearInterval(timer);
  }, [unseen.size, soundOn]);

  // Any click or key press unlocks the sound (browsers block audio until then).
  useEffect(() => {
    if (!enabled || !soundOn || audio !== 'locked') return;
    const unlock = () => void unlockAudio();
    document.addEventListener('click', unlock, true);
    document.addEventListener('keydown', unlock, true);
    return () => {
      document.removeEventListener('click', unlock, true);
      document.removeEventListener('keydown', unlock, true);
    };
  }, [enabled, soundOn, audio]);

  useTitleCount(unseen.size);

  const markSeen = useCallback(() => setUnseen(current => (current.size === 0 ? current : new Set())), []);
  const setSoundOn = useCallback((on: boolean) => {
    setSoundOnState(on);
    try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch { /* Storage is optional. */ }
    if (on) void unlockAudio().then(ready => { if (ready) playChime(); });
  }, []);

  const newCount = board.data?.filter(order => order.status === 'PLACED').length ?? 0;
  const serviceOpen = openRequests.data?.length ?? 0;
  const value = useMemo<LiveValue>(() => ({
    enabled, scope, connection, unseen, markSeen, newCount, arrivals, serviceOpen, serviceArrivals,
    sound: { on: soundOn, setOn: setSoundOn, audio, unlock: unlockAudio },
  }), [enabled, scope, connection, unseen, markSeen, newCount, arrivals, serviceOpen, serviceArrivals, soundOn, setSoundOn, audio]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useOrdersLive(): LiveValue {
  const context = useContext(LiveContext);
  if (!context) throw new Error('OrdersLiveProvider is required');
  return context;
}

/** The live board of the branch chosen in the shell (or every branch). */
export function LiveForScope({ enabled, serviceRequests = false, children }: { enabled: boolean; serviceRequests?: boolean; children: ReactNode }) {
  const { selected } = useBranchScope();
  return <OrdersLiveProvider enabled={enabled} scope={selected} serviceRequests={serviceRequests}>{children}</OrdersLiveProvider>;
}
