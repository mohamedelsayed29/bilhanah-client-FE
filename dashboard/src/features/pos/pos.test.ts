import { beforeEach, describe, expect, it } from 'vitest';
import { posDiscountPiastres, posTotals } from '@bilhanah/contracts';
import { loadDevice, newKey, saveDevice } from './device';

describe('the POS bill', () => {
  const settings = { taxRateBps: 1400, taxInclusive: false, serviceChargeBps: 1200, serviceChargeDineInOnly: true };
  it('adds service after the discount and tax on top, dine-in only for service', () => {
    expect(posTotals({ subtotalPiastres: 10000, discountPiastres: 1000, dineIn: true }, settings)).toEqual({ subtotalPiastres: 10000, discountPiastres: 1000, serviceChargePiastres: 1080, taxPiastres: 1411, totalPiastres: 11491, taxInclusive: false });
    expect(posTotals({ subtotalPiastres: 10000, discountPiastres: 0, dineIn: false }, settings).serviceChargePiastres).toBe(0);
    expect(posTotals({ subtotalPiastres: 11400, discountPiastres: 0, dineIn: false }, { ...settings, taxInclusive: true })).toMatchObject({ taxPiastres: 1400, totalPiastres: 11400 });
  });
  it('never discounts more than the subtotal', () => {
    expect(posDiscountPiastres({ kind: 'AMOUNT', value: 99999 }, 5000)).toBe(5000);
    expect(posDiscountPiastres({ kind: 'PERCENT', value: 15 }, 5000)).toBe(750);
  });
});

describe('the POS device', () => {
  // The unit tests run in Node: a small in-memory localStorage.
  beforeEach(() => {
    const store = new Map<string, string>();
    globalThis.localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => void store.set(key, value), removeItem: key => void store.delete(key), clear: () => store.clear(), key: () => null, length: 0 } as Storage;
  });
  it('keeps only a valid device key', () => {
    expect(loadDevice()).toBeNull();
    saveDevice({ id: 'd1', name: 'Front', key: 'posd_abc' });
    expect(loadDevice()).toEqual({ id: 'd1', name: 'Front', key: 'posd_abc' });
    localStorage.setItem('bilhanah:pos:device:v1', JSON.stringify({ id: 'x', name: 'x', key: 'stolen' }));
    expect(loadDevice()).toBeNull();
  });
  it('makes unique keys within the API limit', () => {
    const a = newKey('pay');
    expect(a).not.toBe(newKey('pay'));
    expect(a.length).toBeLessThanOrEqual(64);
    expect(a).toMatch(/^pay-[A-Za-z0-9-]+$/);
  });
});
