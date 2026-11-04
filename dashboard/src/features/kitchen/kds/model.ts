import type { KitchenStation, OrderItemStatus, OrderLine, OwnerOrder } from '@bilhanah/contracts';

/** Which station a screen shows: one station's dishes, or every dish (the pass / expo). */
export type StationView = 'all' | (string & {});

export type Lane = 'new' | 'cooking' | 'ready';
export const LANES: Lane[] = ['new', 'cooking', 'ready'];

/** A dish's station: the one it was routed to, or the default for dishes routed before stations existed. */
export function lineStation(line: Pick<OrderLine, 'stationId'>, stations: readonly KitchenStation[]): string | null {
  if (line.stationId && stations.some(station => station.id === line.stationId)) return line.stationId;
  return stations.find(station => station.isDefault)?.id ?? null;
}

const KITCHEN_STEPS: readonly OrderItemStatus[] = ['NEW', 'ACCEPTED', 'PREPARING', 'READY'];
/** Dishes still in the kitchen's hands. */
export const isKitchenLine = (line: Pick<OrderLine, 'prepStatus'>) => KITCHEN_STEPS.includes(line.prepStatus);

/** One order as a screen shows it: its dishes for this view, where it stands, and how late it is. */
export type Ticket = {
  order: OwnerOrder;
  /** The dishes this screen prepares (still in the kitchen). */
  lines: OrderLine[];
  /** The order's other dishes still being prepared elsewhere (station view only). */
  elsewhere: { stationId: string | null; line: OrderLine }[];
  lane: Lane;
  /** When the order should be ready: its estimate, or placing time plus the slowest station's usual minutes. */
  dueAt: number;
};

/** Where a set of dishes stands: all waiting, all ready, or somewhere in between. */
export function laneOf(lines: readonly Pick<OrderLine, 'prepStatus'>[]): Lane {
  if (lines.every(line => line.prepStatus === 'READY')) return 'ready';
  if (lines.every(line => line.prepStatus === 'NEW' || line.prepStatus === 'ACCEPTED')) return 'new';
  return 'cooking';
}

/** The tickets of a view: rush orders first, then the latest against their time, then the oldest. */
export function ticketsFor(orders: readonly OwnerOrder[], stations: readonly KitchenStation[], view: StationView): Ticket[] {
  const minutes = new Map(stations.map(station => [station.id, station.targetMinutes]));
  const tickets: Ticket[] = [];
  for (const order of orders) {
    const working = order.items.filter(isKitchenLine);
    const mine = view === 'all' ? working : working.filter(line => lineStation(line, stations) === view);
    if (!mine.length) continue;
    const slowest = Math.max(...mine.map(line => minutes.get(lineStation(line, stations) ?? '') ?? 15));
    tickets.push({
      order,
      lines: mine,
      elsewhere: view === 'all' ? [] : working.filter(line => !mine.includes(line)).map(line => ({ stationId: lineStation(line, stations), line })),
      lane: laneOf(mine),
      dueAt: order.estimatedReadyAt ? Date.parse(order.estimatedReadyAt) : Date.parse(order.placedAt) + slowest * 60_000,
    });
  }
  return tickets.sort((a, b) =>
    Number(b.order.priority === 'RUSH') - Number(a.order.priority === 'RUSH')
    || Date.parse(a.order.placedAt) - Date.parse(b.order.placedAt));
}

/** How many tickets each station has (and all of them), for the station tabs. */
export function stationCounts(orders: readonly OwnerOrder[], stations: readonly KitchenStation[]): Record<string, number> {
  const counts: Record<string, number> = { all: 0 };
  for (const order of orders) {
    const working = order.items.filter(isKitchenLine);
    if (working.length) counts.all = (counts.all ?? 0) + 1;
    for (const id of new Set(working.map(line => lineStation(line, stations) ?? ''))) counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

export type Urgency = 'ok' | 'soon' | 'late';

/** Late once past its due time; "soon" in the last quarter of its time. */
export function urgency(ticket: Pick<Ticket, 'dueAt' | 'lane' | 'order'>, now: number): Urgency {
  if (ticket.lane === 'ready') return 'ok';
  const start = Date.parse(ticket.order.placedAt);
  if (now >= ticket.dueAt) return 'late';
  return now >= start + (ticket.dueAt - start) * 0.75 ? 'soon' : 'ok';
}

/** The step a tap moves a dish to: waiting → cooking → ready → (recall) cooking. */
export function nextLineStatus(status: OrderItemStatus): OrderItemStatus | null {
  switch (status) {
    case 'NEW':
    case 'ACCEPTED': return 'PREPARING';
    case 'PREPARING': return 'READY';
    case 'READY': return 'PREPARING';
    default: return null;
  }
}

/** The ticket's big button: start everything, finish everything, or hand it over. */
export function bumpStatus(lane: Lane): OrderItemStatus {
  return lane === 'new' ? 'PREPARING' : lane === 'cooking' ? 'READY' : 'SERVED';
}

/** The dishes the big button moves (those not already there). */
export function bumpLines(ticket: Pick<Ticket, 'lines' | 'lane'>): OrderLine[] {
  const target = bumpStatus(ticket.lane);
  if (target === 'SERVED') return ticket.lines.filter(line => line.prepStatus === 'READY');
  if (target === 'READY') return ticket.lines.filter(line => line.prepStatus !== 'READY');
  return ticket.lines.filter(line => line.prepStatus === 'NEW' || line.prepStatus === 'ACCEPTED');
}

/** Minutes as a short span: 45 min, 2 h 10 min, 3 d 4 h (for "late by"). */
export function span(minutes: number, units: { m: (n: number) => string; h: (h: number, m: number) => string; d: (d: number, h: number) => string }): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return units.m(total);
  if (total < 24 * 60) return units.h(Math.floor(total / 60), total % 60);
  return units.d(Math.floor(total / 1440), Math.floor((total % 1440) / 60));
}

/** A table label as the guest sees it: "4" becomes "Table 4"; "Terrace 2" or "طاولة 4" stay as they are. */
export const tableName = (label: string, word: string) => (/^[\d٠-٩]+$/.test(label.trim()) ? `${word} ${label}` : label);

/** Elapsed time as a kitchen clock: 4:07 under an hour, then 1:12:40, then days and hours. */
export function clock(ms: number, days: (count: number, hours: number) => string): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  if (hours >= 24) return days(Math.floor(hours / 24), hours % 24);
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** The order with some dishes moved (optimistic update before the server answers). */
export function withLines(order: OwnerOrder, ids: readonly string[], status: OrderItemStatus, at = new Date().toISOString()): OwnerOrder {
  return {
    ...order,
    items: order.items.map(line => (ids.includes(line.id)
      ? { ...line, prepStatus: status, ...(status === 'PREPARING' && !line.startedAt && { startedAt: at }), ...(status === 'READY' && { readyAt: at }) }
      : line)),
  };
}
