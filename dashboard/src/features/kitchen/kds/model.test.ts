import { describe, expect, it } from 'vitest';
import type { KitchenStation, OrderLine, OwnerOrder } from '@bilhanah/contracts';
import { bumpLines, clock, laneOf, lineStation, nextLineStatus, stationCounts, ticketsFor, urgency, withLines } from './model';

const station = (id: string, extra: Partial<KitchenStation> = {}): KitchenStation =>
  ({ id, nameAr: id, nameEn: id, kind: 'OTHER', targetMinutes: 10, isDefault: false, isActive: true, sortOrder: 0, ...extra });
const STATIONS = [station('main', { isDefault: true, targetMinutes: 15 }), station('grill', { targetMinutes: 20 }), station('drinks', { targetMinutes: 5 })];

const line = (id: string, stationId: string | null, prepStatus: OrderLine['prepStatus'] = 'NEW'): OrderLine => ({
  id, menuItemId: null, nameAr: id, nameEn: null, variantNameAr: null, variantNameEn: null, unitPricePiastres: 100, quantity: 1, note: null,
  lineTotalPiastres: 100, stationId, stationName: null, prepStatus, startedAt: null, readyAt: null,
});

const order = (id: string, items: OrderLine[], extra: Partial<OwnerOrder> = {}): OwnerOrder => ({
  id, number: 1, status: 'PLACED', placedAt: '2026-11-03T10:00:00.000Z', type: 'DINE_IN', tableLabel: '4', customerName: 'Mona', customerPhone: null,
  notifiesDiner: false, priority: 'NORMAL', branchId: 'b', branchName: 'B', subtotalPiastres: 100, note: null, items, acceptedAt: null, readyAt: null,
  completedAt: null, closedAt: null, rejectionReason: null, paidAt: null, estimatedReadyAt: null, history: [], updatedAt: '2026-11-03T10:00:00.000Z', ...extra,
});

describe('kitchen display model', () => {
  it('sends unrouted dishes to the default station', () => {
    expect(lineStation(line('a', null), STATIONS)).toBe('main');
    expect(lineStation(line('a', 'gone'), STATIONS)).toBe('main');
    expect(lineStation(line('a', 'grill'), STATIONS)).toBe('grill');
  });

  it('shows each station only its dishes, and what waits elsewhere', () => {
    const orders = [order('o1', [line('kofta', 'grill'), line('lemon', 'drinks'), line('done', 'drinks', 'SERVED')])];
    const grill = ticketsFor(orders, STATIONS, 'grill');
    expect(grill).toHaveLength(1);
    expect(grill[0]!.lines.map(entry => entry.id)).toEqual(['kofta']);
    expect(grill[0]!.elsewhere.map(entry => entry.line.id)).toEqual(['lemon']);
    expect(ticketsFor(orders, STATIONS, 'main')).toEqual([]);
    expect(ticketsFor(orders, STATIONS, 'all')[0]!.lines).toHaveLength(2);
    expect(stationCounts(orders, STATIONS)).toEqual({ all: 1, grill: 1, drinks: 1 });
  });

  it('puts rush orders first, then the oldest; due by the slowest station', () => {
    const tickets = ticketsFor([
      order('old', [line('a', 'drinks')], { placedAt: '2026-11-03T09:00:00.000Z' }),
      order('rush', [line('b', 'grill')], { priority: 'RUSH' }),
    ], STATIONS, 'all');
    expect(tickets.map(ticket => ticket.order.id)).toEqual(['rush', 'old']);
    expect(tickets[0]!.dueAt).toBe(Date.parse('2026-11-03T10:20:00.000Z'));
  });

  it('sorts dishes into lanes and flags late tickets', () => {
    expect(laneOf([line('a', null), line('b', null, 'ACCEPTED')])).toBe('new');
    expect(laneOf([line('a', null, 'READY'), line('b', null)])).toBe('cooking');
    expect(laneOf([line('a', null, 'READY')])).toBe('ready');
    const [ticket] = ticketsFor([order('o', [line('a', 'main', 'PREPARING')])], STATIONS, 'all');
    const at = (minutes: number) => Date.parse('2026-11-03T10:00:00.000Z') + minutes * 60_000;
    expect(urgency(ticket!, at(5))).toBe('ok');
    expect(urgency(ticket!, at(12))).toBe('soon');
    expect(urgency(ticket!, at(16))).toBe('late');
  });

  it('moves dishes with a tap and with the big button', () => {
    expect(nextLineStatus('NEW')).toBe('PREPARING');
    expect(nextLineStatus('READY')).toBe('PREPARING');
    expect(nextLineStatus('SERVED')).toBeNull();
    expect(bumpLines({ lane: 'cooking', lines: [line('a', null, 'READY'), line('b', null, 'PREPARING')] }).map(entry => entry.id)).toEqual(['b']);
    expect(withLines(order('o', [line('a', null)]), ['a'], 'PREPARING', 'now').items[0]).toMatchObject({ prepStatus: 'PREPARING', startedAt: 'now' });
  });

  it('reads like a kitchen clock', () => {
    const days = (count: number, hours: number) => `${count}d ${hours}h`;
    expect(clock(247_000, days)).toBe('4:07');
    expect(clock(4_360_000, days)).toBe('1:12:40');
    expect(clock(26 * 3_600_000, days)).toBe('1d 2h');
  });
});
