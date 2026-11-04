import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router';
import { CheckCircleIcon, CookingPotIcon, type Icon, LockIcon, PowerIcon, ReceiptIcon, SpeakerHighIcon, SpeakerSlashIcon } from '@phosphor-icons/react';
import type { OrderStatus, OwnerBranch, OwnerOrder } from '@bilhanah/contracts';
import { Alert } from '../../../components/Alert';
import { Button } from '../../../components/Button';
import { ErrorPanel } from '../../../components/ErrorBoundary';
import { PageHeader } from '../../../components/PageHeader';
import { Skeleton } from '../../../components/Skeleton';
import { Switch } from '../../../components/Switch';
import { fill, useCopy } from '../../../lib/copy';
import { formatPrice } from '../../../lib/format';
import { useLanguage, usePageTitle } from '../../../lib/language';
import type { ConnectionState } from '../../../lib/realtime/owner-realtime';
import { useBranchScope } from '../../branches/BranchScope';
import { useBranchList, useWorkspace } from '../../branches/workspace';
import { COLUMNS, groupByColumn, needsReason, type Column } from './board';
import { useBoardQuery, useOrdersLive } from './live';
import { useOrderPayment, useOrdersPause, useOrderStatus } from './mutations';
import { OrderCard, useNow } from './OrderCard';
import { ReasonDialog } from './ReasonDialog';

const COLUMN_TEXT: Record<Column, { ar: string; en: string; emptyAr: string; emptyEn: string; icon: Icon }> = {
  new: { ar: 'جديد', en: 'New', icon: ReceiptIcon, emptyAr: 'مفيش طلبات جديدة. أول ما زبون يطلب هيظهر هنا وهتسمع تنبيه.', emptyEn: 'No new orders. When a diner orders, it appears here with a sound.' },
  progress: { ar: 'بيتحضّر', en: 'In progress', icon: CookingPotIcon, emptyAr: 'الطلبات اللي قبلتها هتفضل هنا لحد ما تجهز.', emptyEn: 'Orders you accept stay here until they are ready.' },
  ready: { ar: 'جاهز', en: 'Ready', icon: CheckCircleIcon, emptyAr: 'الطلبات الجاهزة للتسليم هتظهر هنا.', emptyEn: 'Orders ready to hand over appear here.' },
};

/** Live board / history switch shared by both order pages. */
export function OrdersTabs() {
  const { text } = useLanguage();
  const { to } = useWorkspace();
  return <nav className="tabs" aria-label={text('أقسام الطلبات', 'Order sections')}>
    <NavLink to={to('/orders')} end className="tab">{text('اللوحة المباشرة', 'Live board')}</NavLink>
    <NavLink to={to('/orders/history')} className="tab">{text('الطلبات السابقة', 'History')}</NavLink>
  </nav>;
}

/**
 * The branches a board shows and their ordering switches together: one branch when one is
 * selected (or the restaurant has one), otherwise every active branch.
 */
export function useBoardBranches() {
  const scope = useBranchScope();
  const list = useBranchList();
  const shown: OwnerBranch[] = scope.branch
    ? list.branches.filter(branch => branch.id === scope.branch!.id)
    : list.branches.filter(branch => branch.isActive);
  const one = shown.length === 1 ? shown[0]! : null;
  return {
    scope: scope.selected,
    /** The restaurant has several active branches (whatever is selected). */
    multiRestaurant: list.branches.filter(branch => branch.isActive).length > 1,
    shown,
    /** The single branch on the board, or null for several. */
    one,
    /** Show which branch each order is for. */
    labelled: shown.length > 1,
    included: (shown[0] ?? list.branches[0])?.ordering.included ?? false,
    enabled: shown.some(branch => branch.ordering.enabled),
    paused: shown.filter(branch => branch.ordering.enabled && branch.ordering.paused),
  };
}

export function ConnectionPill({ state }: { state: ConnectionState }) {
  const { text } = useLanguage();
  const live = state === 'connected';
  return <span className={`connection-pill ${live ? 'is-live' : 'is-waiting'}`} role="status" data-testid="connection-state">
    <span className="connection-dot" aria-hidden="true" />
    {live ? text('مباشر', 'Live') : state === 'connecting' ? text('بنوصّل…', 'Connecting…') : text('بنعيد الاتصال…', 'Reconnecting…')}
  </span>;
}

export function OrdersBoardPage() {
  const { text, number, count, language } = useLanguage();
  const t = useCopy();
  usePageTitle('الطلبات', 'Orders');
  const workspace = useWorkspace();
  const branches = useBoardBranches();
  const { one, included, enabled } = branches;
  const live = useOrdersLive();
  const board = useBoardQuery(branches.scope, included);
  const [announcement, setAnnouncement] = useState('');
  const status = useOrderStatus({ announce: setAnnouncement });
  const payment = useOrderPayment();
  const pause = useOrdersPause();
  const now = useNow();
  const [closing, setClosing] = useState<{ order: OwnerOrder; status: 'REJECTED' | 'CANCELLED' } | null>(null);
  const [column, setColumn] = useState<Column>('new');
  const { markSeen, unseen } = live;
  const owner = workspace.role === 'OWNER';
  const { multiRestaurant } = branches;
  // Single-branch owners keep the restaurant's ordering settings; otherwise each branch has its own.
  const settingsPath = one ? (owner && !multiRestaurant ? '/settings/ordering' : workspace.branchSettings(one.id)) : owner ? '/branches' : '/manager/settings';

  // Touching the board (click or key) counts as having seen the new orders.
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

  const act = (order: OwnerOrder, next: OrderStatus, prepMinutes?: number) => {
    if (needsReason(next)) setClosing({ order, status: next as 'REJECTED' | 'CANCELLED' });
    else if (next !== 'PLACED') status.mutate({ order, status: next, prepMinutes });
  };

  const header = <PageHeader title={text('الطلبات', 'Orders')}
    description={one && multiRestaurant ? fill(t.scope.showing, { name: one.name }) : undefined}
    actions={included && enabled ? <ConnectionPill state={live.connection} /> : undefined} />;

  if (!included) {
    return <div className="page orders-page">
      {header}
      <section className="card empty-state upsell-card" aria-labelledby="upsell-title">
        <span className="empty-state-icon" aria-hidden="true"><LockIcon size={30} /></span>
        <h2 id="upsell-title">{text('استقبل الطلبات من الموبايل', 'Take orders from diners’ phones')}</h2>
        {owner
          ? <><p>{text('باقتك الحالية فيها المنيو بس. اشترك في باقة «منيو وطلبات» عشان الزباين يطلبوا من الترابيزة أو تيك أواي، والطلبات توصلك هنا لحظة بلحظة.',
            'Your current plan includes the menu only. Choose the “Menu & Orders” plan so diners can order from their table or for pickup, with orders arriving here live.')}</p>
            <Link className="button button-primary" to="/subscription">{text('شوف الباقات', 'See plans')}</Link></>
          : <p>{t.manager.planNoOrdering}</p>}
      </section>
    </div>;
  }

  const orders = board.data ?? [];
  const columns = groupByColumn(orders);
  const soundPrompt = enabled && live.sound.on && live.sound.audio === 'locked';

  return <div className="page orders-page">
    {header}
    <OrdersTabs />
    {!enabled && <section className="card empty-state upsell-card" aria-labelledby="enable-title">
      <span className="empty-state-icon" aria-hidden="true"><PowerIcon size={30} /></span>
      <h2 id="enable-title">{one && multiRestaurant ? fill(t.ordersBranch.offTitle, { name: one.name }) : branches.shown.length > 1 ? t.ordersBranch.allOffTitle : text('شغّل الطلبات', 'Turn on ordering')}</h2>
      <p>{text('باقتك فيها الطلبات، بس لسه مش متشغّلة. شغّلها واختار صالة ولا تيك أواي، والزباين هيلاقوا زرار الطلب في المنيو.',
        'Your plan includes ordering, but it is switched off. Turn it on and choose dine-in and/or pickup; diners then see an order button on your menu.')}</p>
      <Link className="button button-primary" to={settingsPath}>{one && (multiRestaurant || !owner) ? t.ordersBranch.branchSettings : text('إعدادات الطلبات', 'Ordering settings')}</Link>
    </section>}

    {enabled && <div className="board-toolbar">
      {one
        ? <Switch className="board-pause" checked={!one.ordering.paused} disabled={pause.isPending} onChange={accepting => pause.mutate({ branchId: one.id, paused: !accepting })}
          label={one.ordering.paused ? text('الطلبات واقفة مؤقتًا', 'Orders paused') : text('بنستقبل طلبات', 'Taking orders')}
          description={one.ordering.paused ? text('الزباين شايفين إنك مش بتستقبل طلبات دلوقتي.', 'Diners see that you are not taking orders right now.') : text('وقّفها مؤقتًا لو المطبخ زحمة.', 'Pause for a while if the kitchen is busy.')} />
        : <p className="board-scope-hint">{t.ordersBranch.allHint}</p>}
      <div className="board-sound">
        {soundPrompt && <p className="sound-locked" role="status">
          <span>{text('الصوت مقفول لحد ما تلمس الصفحة', 'Sound is off until you tap the page')}</span>
          <Button small onClick={() => void live.sound.unlock()} icon={<SpeakerHighIcon size={17} aria-hidden="true" />}>{text('شغّل الصوت', 'Enable sound')}</Button>
        </p>}
        <button type="button" className={`sound-toggle ${live.sound.on ? 'is-on' : ''}`} aria-pressed={live.sound.on} onClick={() => live.sound.setOn(!live.sound.on)}
          title={text('صوت الطلبات الجديدة', 'New-order sound')}>
          {live.sound.on ? <SpeakerHighIcon size={20} weight="bold" aria-hidden="true" /> : <SpeakerSlashIcon size={20} weight="bold" aria-hidden="true" />}
          <span className="sound-label">{text('صوت الطلبات الجديدة', 'New-order sound')}</span>
        </button>
      </div>
    </div>}

    {enabled && one && one.ordering.paused && <Alert kind="warning" title={text('استقبال الطلبات واقف مؤقتًا', 'New orders are paused')}
      actions={<Button small variant="secondary" loading={pause.isPending} onClick={() => pause.mutate({ branchId: one.id, paused: false })}>{text('ارجع استقبل طلبات', 'Resume orders')}</Button>}>
      {text('الطلبات اللي على اللوحة كمّل فيها عادي، بس مفيش طلبات جديدة هتوصل.', 'Keep working on the orders below; no new ones can be placed.')}
    </Alert>}
    {enabled && !one && branches.paused.length > 0 && <Alert kind="warning" title={fill(t.ordersBranch.pausedAt, { names: branches.paused.map(branch => branch.name).join(text('، ', ', ')) })}
      actions={branches.paused.map(branch => <Button key={branch.id} small variant="secondary" loading={pause.isPending && pause.variables?.branchId === branch.id}
        onClick={() => pause.mutate({ branchId: branch.id, paused: false })}>{fill(t.ordersBranch.resume, { name: branch.name })}</Button>)}>
      {t.ordersBranch.pausedAtBody}
    </Alert>}

    {board.isError && <ErrorPanel error={board.error} onRetry={() => void board.refetch()} />}
    {board.isPending && <div className="board" role="status" aria-label={text('جاري التحميل', 'Loading')}>
      {COLUMNS.map(key => <div className="board-column" key={key}><Skeleton height={24} width="40%" /><Skeleton height={200} radius={14} /></div>)}
    </div>}

    {board.data && (enabled || orders.length > 0) && <>
      <div className="board-switch segmented" role="group" aria-label={text('اختار العمود', 'Choose a column')}>
        {COLUMNS.map(key => <button type="button" key={key} aria-pressed={column === key} onClick={() => setColumn(key)}>
          {text(COLUMN_TEXT[key].ar, COLUMN_TEXT[key].en)}
          <span className={`board-count ${key === 'new' && columns.new.length > 0 ? 'is-hot' : ''}`}>{number(columns[key].length)}</span>
        </button>)}
      </div>
      <div className="board">
        {COLUMNS.map(key => {
          const { icon: EmptyIcon } = COLUMN_TEXT[key];
          const value = columns[key].reduce((sum, order) => sum + order.subtotalPiastres, 0);
          return <section key={key} className={`board-column board-column-${key} ${column === key ? 'is-current' : ''}`} aria-labelledby={`column-${key}`} data-testid={`column-${key}`}>
            <header className="board-column-head">
              <h2 id={`column-${key}`}>{text(COLUMN_TEXT[key].ar, COLUMN_TEXT[key].en)}</h2>
              <span className="board-count" aria-label={count(columns[key].length, 'order')}>{number(columns[key].length)}</span>
              {value > 0 && <span className="board-column-value">{formatPrice(value, language)}</span>}
            </header>
            {columns[key].length === 0
              ? <div className="board-empty"><EmptyIcon size={22} aria-hidden="true" /><p>{text(COLUMN_TEXT[key].emptyAr, COLUMN_TEXT[key].emptyEn)}</p></div>
              : <div className="board-cards">
                {columns[key].map(order => <OrderCard key={order.id} order={order} now={now} isNew={live.unseen.has(order.id)} showBranch={branches.labelled}
                  onAction={act} usualPrepMinutes={workspace.restaurant.orderPrepMinutes} can={workspace.can}
                  onPaid={workspace.can('payments.process') ? paid => payment.mutate({ order: paid, paid: true }) : undefined} />)}
              </div>}
          </section>;
        })}
      </div>
    </>}

    <p className="visually-hidden" aria-live="polite" data-testid="board-announcement">{announcement}</p>
    <ReasonDialog order={closing?.order ?? null} status={closing?.status ?? 'REJECTED'} onClose={() => setClosing(null)}
      onConfirm={reason => { if (closing) status.mutate({ order: closing.order, status: closing.status, reason }); setClosing(null); }} />
  </div>;
}
