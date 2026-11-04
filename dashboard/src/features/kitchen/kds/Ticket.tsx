import { memo } from 'react';
import {
  ArrowCounterClockwiseIcon, BagIcon, BreadIcon, CheckCircleIcon, CheckIcon, CircleHalfIcon, CircleIcon, CoffeeIcon, CookingPotIcon,
  DotsThreeVerticalIcon, FireIcon, ForkKnifeIcon, IceCreamIcon, LightningIcon, NoteIcon, ProhibitIcon, SnowflakeIcon, TimerIcon, XCircleIcon,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { ORDER_ITEM_STATUS_PERMISSION, type KitchenStation, type KitchenStationKind, type OrderItemStatus, type OrderLine, type OrderStatus, type Permission } from '@bilhanah/contracts';
import { ActionMenu, type ActionMenuItem } from '../../../components/ActionMenu';
import { useLanguage } from '../../../lib/language';
import { bumpLines, bumpStatus, clock, lineStation, nextLineStatus, span, tableName, type Ticket, urgency } from './model';

export const STATION_ICONS: Record<KitchenStationKind, Icon> = {
  MAIN: CookingPotIcon, GRILL: FireIcon, DRINKS: CoffeeIcon, DESSERTS: IceCreamIcon, COLD: SnowflakeIcon, BAKERY: BreadIcon, OTHER: ForkKnifeIcon,
};

const LINE_ICONS: Partial<Record<OrderItemStatus, Icon>> = { NEW: CircleIcon, ACCEPTED: CircleHalfIcon, PREPARING: FireIcon, READY: CheckCircleIcon };
const LINE_TEXT: Partial<Record<OrderItemStatus, [string, string]>> = {
  NEW: ['جديد', 'New'], ACCEPTED: ['اتقبل', 'Accepted'], PREPARING: ['بيتحضّر', 'Cooking'], READY: ['جاهز', 'Ready'],
};
const BUMP_TEXT: Record<OrderItemStatus, [string, string]> = {
  NEW: ['', ''], ACCEPTED: ['', ''], CANCELLED: ['', ''],
  PREPARING: ['ابدأ التحضير', 'Start cooking'], READY: ['جاهز', 'Bump ready'], SERVED: ['اتسلّم', 'Served'],
};

export type TicketActions = {
  can: (permission: Permission) => boolean;
  /** Moves some of the order's dishes. */
  onLines: (ticket: Ticket, lines: OrderLine[], status: OrderItemStatus) => void;
  onRush: (ticket: Ticket) => void;
  /** Reject (not yet started) or cancel the whole order, with a reason. */
  onClose: (ticket: Ticket, status: Extract<OrderStatus, 'REJECTED' | 'CANCELLED'>) => void;
};

/**
 * One order on the kitchen display, readable from across the kitchen: the number, the table and a
 * running clock on top; then the dishes this screen makes, each tapped through its steps; the
 * order's note stands out; the big button moves every dish at once. The edge colour carries the
 * lane, and turns red once the order is past its time.
 */
export const KdsTicket = memo(function KdsTicket({ ticket, stations, now, isNew, actions }: {
  ticket: Ticket;
  stations: readonly KitchenStation[];
  now: number;
  isNew: boolean;
  actions: TicketActions;
}) {
  const { text, number } = useLanguage();
  const { order, lines, lane } = ticket;
  const state = urgency(ticket, now);
  const stationName = (id: string | null) => {
    const station = stations.find(entry => entry.id === id);
    return station ? text(station.nameAr, station.nameEn ?? station.nameAr) : text('المطبخ', 'Kitchen');
  };
  const bump = bumpStatus(lane);
  const toBump = bumpLines(ticket);
  const canBump = toBump.length > 0 && actions.can(ORDER_ITEM_STATUS_PERMISSION[bump]);
  const elapsedMs = now - Date.parse(order.placedAt);
  const longWait = elapsedMs >= 86_400_000;
  const elapsed = clock(elapsedMs, (days, hours) => text(`${number(days)} يوم ${number(hours)} س`, `${days}d ${hours}h`));
  const units = {
    m: (n: number) => text(`${number(n)} د`, `${n} min`),
    h: (h: number, m: number) => text(`${number(h)} س ${number(m)} د`, `${h}h ${m}m`),
    d: (d: number, h: number) => text(`${number(d)} يوم ${number(h)} س`, `${d}d ${h}h`),
  };
  const dueIn = Math.round((ticket.dueAt - now) / 60_000);
  const headingId = `ticket-${order.id}`;
  const where = order.type === 'DINE_IN'
    ? <><ForkKnifeIcon size={18} weight="bold" aria-hidden="true" />{order.tableLabel ? <bdi>{tableName(order.tableLabel, text('طاولة', 'Table'))}</bdi> : text('صالة', 'Dine-in')}</>
    : <><BagIcon size={18} weight="bold" aria-hidden="true" />{text('تيك أواي', 'Pickup')}</>;

  const menu: ActionMenuItem[] = [
    ...(actions.can('orders.update') ? [{
      label: order.priority === 'RUSH' ? text('شيل الاستعجال', 'Remove rush') : text('مستعجل', 'Mark as rush'),
      icon: <LightningIcon size={17} aria-hidden="true" />, onSelect: () => actions.onRush(ticket),
    }] : []),
    ...(actions.can('orders.update') ? lines.filter(line => line.prepStatus === 'READY' && order.status !== 'READY').map(line => ({
      label: text(`رجّع «${line.nameAr}» للتحضير`, `Send “${line.nameEn ?? line.nameAr}” back`),
      icon: <ArrowCounterClockwiseIcon size={17} aria-hidden="true" />, onSelect: () => actions.onLines(ticket, [line], 'PREPARING'),
    })) : []),
    ...(actions.can('orders.cancel') ? [
      ...lines.length > 1 ? lines.map(line => ({
        label: text(`ألغِ «${line.nameAr}»`, `Cancel “${line.nameEn ?? line.nameAr}”`),
        icon: <XCircleIcon size={17} aria-hidden="true" />, danger: true, onSelect: () => actions.onLines(ticket, [line], 'CANCELLED'),
      })) : [],
      {
        label: order.status === 'PLACED' ? text('ارفض الطلب', 'Reject order') : text('ألغِ الطلب كله', 'Cancel order'),
        icon: <ProhibitIcon size={17} aria-hidden="true" />, danger: true,
        onSelect: () => actions.onClose(ticket, order.status === 'PLACED' ? 'REJECTED' : 'CANCELLED'),
      },
    ] : []),
  ];

  return <article className={`kds-ticket lane-${lane} is-${state} ${isNew ? 'is-fresh' : ''} ${order.priority === 'RUSH' ? 'is-rush' : ''}`}
    aria-labelledby={headingId} data-testid="kds-ticket" data-order={order.number}>
    <header className="kds-ticket-head">
      <div className="kds-ticket-id">
        <h3 id={headingId} className="kds-number"><span aria-hidden="true">#</span>{number(order.number)}</h3>
        <span className="kds-where">{where}</span>
      </div>
      <div className={`kds-clock is-${state}`} title={text('من وقت الطلب', 'Since the order came in')}>
        <TimerIcon size={18} weight="bold" aria-hidden="true" />
        <span className={longWait ? undefined : 'ltr'} data-testid="ticket-clock">{elapsed}</span>
      </div>
    </header>
    <div className="kds-ticket-meta">
      {order.priority === 'RUSH' && <span className="kds-flag is-rush"><LightningIcon size={14} weight="fill" aria-hidden="true" />{text('مستعجل', 'Rush')}</span>}
      {isNew && <span className="kds-flag is-new">{text('جديد', 'New')}</span>}
      {state === 'late' && <span className="kds-flag is-late" data-testid="ticket-late">{text(`متأخر ${span(-dueIn, units)}`, `${span(-dueIn, units)} late`)}</span>}
      {state === 'soon' && <span className="kds-flag is-soon">{text(`فاضل ${span(dueIn, units)}`, `${span(dueIn, units)} left`)}</span>}
      <span className="kds-guest"><bdi>{order.customerName}</bdi></span>
    </div>

    {order.note && <p className="kds-note"><NoteIcon size={18} weight="fill" aria-hidden="true" /><bdi>{order.note}</bdi></p>}

    <ul className="kds-lines" aria-label={text('الأصناف', 'Dishes')}>
      {lines.map(line => {
        const next = nextLineStatus(line.prepStatus);
        // A dish cannot go back once the whole order is ready.
        const blocked = line.prepStatus === 'READY' && order.status === 'READY';
        const tappable = next !== null && !blocked && actions.can(ORDER_ITEM_STATUS_PERMISSION[next]);
        const StatusIcon = LINE_ICONS[line.prepStatus] ?? CircleIcon;
        const [ar, en] = LINE_TEXT[line.prepStatus] ?? ['', ''];
        const variant = text(line.variantNameAr ?? '', line.variantNameEn ?? line.variantNameAr ?? '');
        const body = <>
          <span className="kds-qty">{number(line.quantity)}<span aria-hidden="true">×</span></span>
          <span className="kds-line-text">
            <span className="kds-line-name"><bdi>{text(line.nameAr, line.nameEn ?? line.nameAr)}</bdi></span>
            {variant && <span className="kds-mod"><bdi>{variant}</bdi></span>}
            {line.note && <span className="kds-line-note"><bdi>{line.note}</bdi></span>}
            {ticket.elsewhere.length === 0 && stations.length > 1 && lines.length > 1 && <span className="kds-line-station">{stationName(lineStation(line, stations))}</span>}
          </span>
          <span className={`kds-line-state is-${line.prepStatus.toLowerCase()}`}>
            <StatusIcon size={22} weight={line.prepStatus === 'READY' ? 'fill' : 'bold'} aria-hidden="true" />
            <span className="visually-hidden">{text(ar, en)}</span>
          </span>
        </>;
        return <li key={line.id} className={`kds-line is-${line.prepStatus.toLowerCase()}`} data-testid="kds-line">
          {tappable
            ? <button type="button" className="kds-line-button" onClick={() => actions.onLines(ticket, [line], next)}
              aria-label={text(`${line.nameAr}: ${ar}. اضغط عشان ${next === 'READY' ? 'يبقى جاهز' : line.prepStatus === 'READY' ? 'ترجّعه للتحضير' : 'تبدأ تحضّره'}`,
                `${line.nameEn ?? line.nameAr}: ${en}. Tap to ${next === 'READY' ? 'mark ready' : line.prepStatus === 'READY' ? 'send it back' : 'start it'}`)}>{body}</button>
            : <div className="kds-line-button is-static">{body}</div>}
        </li>;
      })}
    </ul>

    {ticket.elsewhere.length > 0 && <p className="kds-elsewhere">
      {text('باقي الطلب:', 'Rest of the order:')}{' '}
      {[...new Set(ticket.elsewhere.map(entry => entry.stationId))].map(id => {
        const group = ticket.elsewhere.filter(entry => entry.stationId === id);
        const ready = group.every(entry => entry.line.prepStatus === 'READY');
        return <span key={id ?? 'none'} className={`kds-elsewhere-chip ${ready ? 'is-ready' : ''}`}>
          {ready && <CheckIcon size={13} weight="bold" aria-hidden="true" />}{stationName(id)} · {number(group.reduce((sum, entry) => sum + entry.line.quantity, 0))}
        </span>;
      })}
    </p>}

    <footer className="kds-ticket-foot">
      {menu.length > 0 && <ActionMenu className="kds-more" align="start" label={text(`إجراءات طلب ${order.number}`, `Actions for order ${order.number}`)}
        trigger={<DotsThreeVerticalIcon size={22} weight="bold" />} items={menu} />}
      {canBump && <button type="button" className={`kds-bump to-${bump.toLowerCase()}`} onClick={() => actions.onLines(ticket, toBump, bump)} data-testid="kds-bump">
        {bump === 'SERVED' ? <CheckCircleIcon size={22} weight="fill" aria-hidden="true" /> : bump === 'READY' ? <CheckIcon size={22} weight="bold" aria-hidden="true" /> : <FireIcon size={22} weight="fill" aria-hidden="true" />}
        {text(...BUMP_TEXT[bump])}
      </button>}
    </footer>
  </article>;
});
