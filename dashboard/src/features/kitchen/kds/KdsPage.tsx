import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowsClockwiseIcon, CheckCircleIcon, FireIcon, LockIcon, PowerIcon, ProhibitIcon, SquaresFourIcon, TrayIcon, WarningIcon, WifiSlashIcon } from '@phosphor-icons/react';
import type { OrderItemStatus, OrderLine, OrderStatus, OwnerOrder } from '@bilhanah/contracts';
import { ErrorPanel } from '../../../components/ErrorBoundary';
import { Skeleton } from '../../../components/Skeleton';
import { kitchenStationsApi } from '../../../lib/api/endpoints';
import { useCopy } from '../../../lib/copy';
import { useLanguage, usePageTitle } from '../../../lib/language';
import { useBranchScope } from '../../branches/BranchScope';
import { SoldOutDialog } from '../../branches/SoldOutDialog';
import { queryKeys, useBranchesQuery } from '../../restaurant/queries';
import { useBoardQuery, useOrdersLive } from '../../restaurant/orders/live';
import { useOrderStatus } from '../../restaurant/orders/mutations';
import { ReasonDialog } from '../../restaurant/orders/ReasonDialog';
import { useKitchenContext } from '../KitchenLayout';
import { type Lane, LANES, stationCounts, type StationView, type Ticket, ticketsFor, urgency } from './model';
import { useLineStatus, usePriority } from './mutations';
import { KdsTicket, STATION_ICONS, type TicketActions } from './Ticket';

const VIEW_KEY = 'bilhanah:kds-station:v1';
const LANE_TEXT: Record<Lane, { ar: string; en: string; emptyAr: string; emptyEn: string; icon: typeof TrayIcon }> = {
  new: { ar: 'جديد', en: 'New', emptyAr: 'مفيش طلبات جديدة. أول ما طلب يوصل هيظهر هنا بصوت.', emptyEn: 'No new orders. The next one appears here with a sound.', icon: TrayIcon },
  cooking: { ar: 'بيتحضّر', en: 'Cooking', emptyAr: 'اضغط «ابدأ التحضير» على أي طلب جديد.', emptyEn: 'Tap “Start cooking” on a new order.', icon: FireIcon },
  ready: { ar: 'جاهز للتسليم', en: 'Ready', emptyAr: 'الطلبات الجاهزة بتستنى هنا لحد ما تتسلّم.', emptyEn: 'Ready orders wait here until they are served.', icon: CheckCircleIcon },
};

function readView(): StationView {
  try { return localStorage.getItem(VIEW_KEY) ?? 'all'; } catch { return 'all'; }
}

/** A clock that ticks every second (the tickets' timers). */
function useSecondClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/**
 * The kitchen display: each station sees the dishes routed to it, as tickets in three lanes (new,
 * cooking, ready). Dishes are tapped through their steps, or bumped all at once; rush and late
 * orders stand out. The board stays live over the realtime feed, and refreshes itself while the
 * connection is down.
 */
export function KdsPage() {
  const { text, number } = useLanguage();
  const t = useCopy();
  usePageTitle('شاشة المطبخ', 'Kitchen display');
  const context = useKitchenContext();
  const scope = useBranchScope();
  const branches = useBranchesQuery();
  const ordering = (scope.branch && branches.data?.branches.find(branch => branch.id === scope.branch!.id)?.ordering) || context.ordering;
  const live = useOrdersLive();
  const board = useBoardQuery(scope.selected, ordering.included);
  const stationsQuery = useQuery({ queryKey: queryKeys.kitchenStations, queryFn: kitchenStationsApi.list, staleTime: 60_000 });
  const stations = useMemo(() => stationsQuery.data?.stations.filter(station => station.isActive) ?? [], [stationsQuery.data]);
  const [view, setViewState] = useState<StationView>(readView);
  const [lane, setLane] = useState<Lane>('new');
  const [soldOutOpen, setSoldOutOpen] = useState(false);
  const [closing, setClosing] = useState<{ order: OwnerOrder; status: 'REJECTED' | 'CANCELLED' } | null>(null);
  const lineStatus = useLineStatus();
  const priority = usePriority();
  const orderStatus = useOrderStatus();
  const now = useSecondClock();
  const { markSeen, unseen, connection } = live;
  const offline = connection !== 'connected';

  const setView = (next: StationView) => {
    setViewState(next);
    try { localStorage.setItem(VIEW_KEY, next); } catch { /* Storage is optional. */ }
  };
  // A station that was removed or switched off falls back to every station.
  const current: StationView = view === 'all' || stations.some(station => station.id === view) || !stationsQuery.data ? view : 'all';

  // Touching the screen counts as having seen the new orders (stops the repeating sound).
  useEffect(() => {
    if (unseen.size === 0) return;
    const seen = () => { if (document.visibilityState === 'visible') markSeen(); };
    document.addEventListener('pointerdown', seen);
    document.addEventListener('keydown', seen);
    return () => {
      document.removeEventListener('pointerdown', seen);
      document.removeEventListener('keydown', seen);
    };
  }, [unseen.size, markSeen]);

  // While the live feed is down, refresh the board every 15 seconds so nothing is missed.
  const { refetch } = board;
  useEffect(() => {
    if (!offline || !ordering.included) return;
    const timer = window.setInterval(() => void refetch(), 15_000);
    return () => window.clearInterval(timer);
  }, [offline, ordering.included, refetch]);

  const can = useCallback((permission: Parameters<TicketActions['can']>[0]) => context.permissions.includes(permission), [context.permissions]);
  const actions = useMemo<TicketActions>(() => ({
    can,
    onLines: (ticket: Ticket, lines: OrderLine[], status: OrderItemStatus) => {
      if (lines.length) lineStatus.mutate({ order: ticket.order, lineIds: lines.map(line => line.id), status });
    },
    onRush: (ticket: Ticket) => priority.mutate({ order: ticket.order, priority: ticket.order.priority === 'RUSH' ? 'NORMAL' : 'RUSH' }),
    onClose: (ticket: Ticket, status: Extract<OrderStatus, 'REJECTED' | 'CANCELLED'>) => setClosing({ order: ticket.order, status }),
  }), [can, lineStatus, priority]);

  if (!ordering.included || !ordering.enabled) {
    const plan = !ordering.included;
    return <div className="kds-empty-page">
      <section className="kds-empty-card" aria-labelledby="kitchen-off-title">
        <span className="kds-empty-icon" aria-hidden="true">{plan ? <LockIcon size={34} /> : <PowerIcon size={34} />}</span>
        <h1 id="kitchen-off-title">{text('الطلبات مش شغّالة', 'Ordering is off')}</h1>
        <p>{plan
          ? text('باقة المطعم مفيهاش استقبال طلبات. صاحب المطعم يقدر يغيّر الباقة من لوحة التحكم.', 'The restaurant’s plan does not include ordering. The owner can change it from the dashboard.')
          : text('صاحب المطعم لسه مشغّلش الطلبات. أول ما يشغّلها، الطلبات هتظهر هنا لوحدها.', 'The owner has not turned ordering on yet. Once they do, orders appear here by themselves.')}</p>
      </section>
    </div>;
  }

  const orders = board.data ?? [];
  const tickets = ticketsFor(orders, stations, current);
  const byLane = (key: Lane) => tickets.filter(ticket => ticket.lane === key);
  const counts = stationCounts(orders, stations);
  const late = tickets.filter(ticket => urgency(ticket, now) === 'late').length;
  const viewName = current === 'all' ? text('كل المحطات', 'All stations') : (() => {
    const station = stations.find(entry => entry.id === current);
    return station ? text(station.nameAr, station.nameEn ?? station.nameAr) : '';
  })();

  return <div className="kds-page">
    <h1 className="visually-hidden">{text(`شاشة المطبخ: ${viewName}`, `Kitchen display: ${viewName}`)}</h1>

    {offline && <div className="kds-banner is-offline" role="status" data-testid="kds-offline">
      <WifiSlashIcon size={20} weight="bold" aria-hidden="true" />
      <span>{connection === 'connecting'
        ? text('بنوصّل بالسيرفر…', 'Connecting to the server…')
        : text('الاتصال المباشر اتقطع، بنحاول نرجّعه. الشاشة بتتحدّث لوحدها كل ١٥ ثانية لحد ما يرجع.', 'The live connection dropped; we are reconnecting. The display refreshes itself every 15 seconds meanwhile.')}</span>
      <button type="button" className="kds-chip-button" onClick={() => void board.refetch()}>
        <ArrowsClockwiseIcon size={16} weight="bold" aria-hidden="true" />{text('حدّث دلوقتي', 'Refresh now')}
      </button>
    </div>}
    {ordering.paused && <div className="kds-banner is-paused" role="status">
      <WarningIcon size={20} weight="bold" aria-hidden="true" />
      <span>{text('استقبال الطلبات الجديدة واقف مؤقتًا. كمّلوا اللي على الشاشة.', 'New orders are paused. Keep working on the ones on screen.')}</span>
    </div>}

    <div className="kds-toolbar">
      <nav className="kds-stations" aria-label={text('المحطات', 'Stations')}>
        <button type="button" className="kds-station" aria-pressed={current === 'all'} onClick={() => setView('all')} data-testid="kds-station-all">
          <SquaresFourIcon size={20} weight="bold" aria-hidden="true" />
          <span>{text('الكل', 'All')}</span>
          <span className="kds-station-count">{number(counts.all ?? 0)}</span>
        </button>
        {stations.map(station => {
          const StationIcon = STATION_ICONS[station.kind];
          return <button type="button" key={station.id} className="kds-station" aria-pressed={current === station.id} onClick={() => setView(station.id)} data-testid="kds-station">
            <StationIcon size={20} weight="bold" aria-hidden="true" />
            <span>{text(station.nameAr, station.nameEn ?? station.nameAr)}</span>
            <span className="kds-station-count">{number(counts[station.id] ?? 0)}</span>
          </button>;
        })}
      </nav>
      <div className="kds-stats" aria-label={text('الملخص', 'Summary')}>
        <span className="kds-stat"><strong>{number(tickets.length)}</strong>{text('طلب', 'open')}</span>
        <span className={`kds-stat ${late ? 'is-late' : ''}`} data-testid="kds-late-count"><strong>{number(late)}</strong>{text('متأخر', 'late')}</span>
        <button type="button" className="kds-chip-button" onClick={() => setSoldOutOpen(true)} data-testid="kitchen-sold-out">
          <ProhibitIcon size={17} weight="bold" aria-hidden="true" />{t.branchMenu.soldOutTitle}
        </button>
      </div>
    </div>

    {board.isError && <ErrorPanel error={board.error} onRetry={() => void board.refetch()} />}

    <div className="kds-lane-switch" role="group" aria-label={text('اختار العمود', 'Choose a lane')}>
      {LANES.map(key => <button type="button" key={key} aria-pressed={lane === key} onClick={() => setLane(key)}>
        {text(LANE_TEXT[key].ar, LANE_TEXT[key].en)}<span className="kds-lane-count">{number(byLane(key).length)}</span>
      </button>)}
    </div>

    <div className="kds-lanes">
      {LANES.map(key => {
        const list = byLane(key);
        const LaneIcon = LANE_TEXT[key].icon;
        return <section key={key} className={`kds-lane lane-${key} ${lane === key ? 'is-current' : ''}`} aria-labelledby={`lane-${key}`} data-testid={`lane-${key}`}>
          <header className="kds-lane-head">
            <LaneIcon size={20} weight="bold" aria-hidden="true" />
            <h2 id={`lane-${key}`}>{text(LANE_TEXT[key].ar, LANE_TEXT[key].en)}</h2>
            <span className="kds-lane-count">{number(list.length)}</span>
          </header>
          <div className="kds-lane-body">
            {board.isPending && <><Skeleton height={220} radius={16} /><Skeleton height={180} radius={16} /></>}
            {board.data && list.length === 0 && <p className="kds-lane-empty">{text(LANE_TEXT[key].emptyAr, LANE_TEXT[key].emptyEn)}</p>}
            {list.map(ticket => <KdsTicket key={ticket.order.id} ticket={ticket} stations={stations} now={now} isNew={unseen.has(ticket.order.id)} actions={actions} />)}
          </div>
        </section>;
      })}
    </div>

    <SoldOutDialog branch={scope.branch} open={soldOutOpen} onClose={() => setSoldOutOpen(false)} />
    <ReasonDialog order={closing?.order ?? null} status={closing?.status ?? 'REJECTED'} onClose={() => setClosing(null)}
      onConfirm={reason => { if (closing) orderStatus.mutate({ order: closing.order, status: closing.status, reason }); setClosing(null); }} />
  </div>;
}
