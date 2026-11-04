import { describe, expect, it } from 'vitest';
import type { OwnerOrder } from '@bilhanah/contracts';
import { groupByColumn, inScope, mergeIntoBoard, minutesSince, orderActions, scopeOfKey, upsertOrder, withStatus } from './board';

const order = (id: string, number: number, status: OwnerOrder['status'], placedAt: string, branchId = 'main'): OwnerOrder => ({
  id, number, status, placedAt, type: 'PICKUP', tableLabel: null, customerName: 'Mona', customerPhone: '01000000000', notifiesDiner: false, priority: 'NORMAL',
  branchId, branchName: branchId === 'main' ? 'Downtown' : 'Nasr City',
  subtotalPiastres: 5000, note: null, items: [], acceptedAt: null, readyAt: null, completedAt: null, closedAt: null, rejectionReason: null, paidAt: null, estimatedReadyAt: null, history: [], updatedAt: placedAt,
});

const a = order('a', 1, 'PLACED', '2026-10-23T10:00:00.000Z');
const b = order('b', 2, 'ACCEPTED', '2026-10-23T10:05:00.000Z');
const c = order('c', 3, 'READY', '2026-10-23T10:10:00.000Z');

describe('order board', () => {
  it('inserts new orders oldest first and replaces existing ones', () => {
    const board = upsertOrder(upsertOrder([c, a], b), { ...a, note: 'extra' });
    expect(board.map(entry => entry.id)).toEqual(['a', 'b', 'c']);
    expect(board[0]!.note).toBe('extra');
  });

  it('takes closed orders off the board', () => {
    expect(upsertOrder([a, b, c], { ...c, status: 'COMPLETED' }).map(entry => entry.id)).toEqual(['a', 'b']);
    expect(upsertOrder([a, b], { ...a, status: 'REJECTED' }).map(entry => entry.id)).toEqual(['b']);
  });

  it('ignores a late event that is behind the board, unless forced (rollback)', () => {
    const ahead = withStatus([a, b], 'b', 'PREPARING');
    expect(upsertOrder(ahead, b).find(entry => entry.id === 'b')!.status).toBe('PREPARING');
    expect(upsertOrder(ahead, b, true).find(entry => entry.id === 'b')!.status).toBe('ACCEPTED');
  });

  it('applies an optimistic status with the reason for closing changes', () => {
    expect(withStatus([a, b], 'a', 'REJECTED', 'Closed early').map(entry => entry.id)).toEqual(['b']);
    expect(withStatus([a], 'a', 'ACCEPTED')[0]!.status).toBe('ACCEPTED');
    expect(withStatus([a], 'missing', 'ACCEPTED')).toEqual([a]);
  });

  it('groups orders into New, In progress and Ready', () => {
    const preparing = order('d', 4, 'PREPARING', '2026-10-23T10:12:00.000Z');
    const columns = groupByColumn([a, b, c, preparing]);
    expect(columns.new.map(entry => entry.id)).toEqual(['a']);
    expect(columns.progress.map(entry => entry.id)).toEqual(['b', 'd']);
    expect(columns.ready.map(entry => entry.id)).toEqual(['c']);
  });

  it('offers the actions ORDER_TRANSITIONS allows, the main step first', () => {
    expect(orderActions('PLACED')).toEqual({ primary: 'ACCEPTED', secondary: ['REJECTED'] });
    expect(orderActions('ACCEPTED')).toEqual({ primary: 'PREPARING', secondary: ['READY', 'CANCELLED'] });
    expect(orderActions('PREPARING')).toEqual({ primary: 'READY', secondary: ['CANCELLED'] });
    expect(orderActions('READY')).toEqual({ primary: 'COMPLETED', secondary: [] });
    expect(orderActions('COMPLETED')).toEqual({ primary: null, secondary: [] });
  });

  it('counts whole minutes since an order was placed', () => {
    const now = new Date('2026-10-23T10:07:59.000Z').getTime();
    expect(minutesSince(a.placedAt, now)).toBe(7);
    expect(minutesSince('2026-10-23T10:09:00.000Z', now)).toBe(0);
  });

  it('keeps each branch board to its own branch, and the all-branches board to every order', () => {
    const nasr = order('n', 1, 'PLACED', '2026-10-23T10:01:00.000Z', 'nasr');
    expect(mergeIntoBoard([a], nasr, 'main').map(entry => entry.id)).toEqual(['a']);
    expect(mergeIntoBoard([a], nasr, 'nasr').map(entry => entry.id)).toEqual(['a', 'n']);
    expect(mergeIntoBoard([a], nasr, 'all').map(entry => entry.id)).toEqual(['a', 'n']);
    // An order that does not belong (e.g. left from another scope) is taken off rather than updated.
    expect(mergeIntoBoard([a, nasr], { ...nasr, status: 'ACCEPTED' }, 'main').map(entry => entry.id)).toEqual(['a']);
    // Closing still removes it from the boards that show it.
    expect(mergeIntoBoard([a, nasr], { ...nasr, status: 'COMPLETED' }, 'nasr').map(entry => entry.id)).toEqual(['a']);
    expect(inScope('all', nasr)).toBe(true);
    expect(inScope('main', nasr)).toBe(false);
  });

  it('reads the branch scope from a board cache key', () => {
    expect(scopeOfKey(['orders', 'board', 'nasr'])).toBe('nasr');
    expect(scopeOfKey(['orders', 'board', 'all'])).toBe('all');
    expect(scopeOfKey(['orders', 'board'])).toBe('all');
  });
});
