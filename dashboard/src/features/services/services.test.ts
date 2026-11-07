import { describe, expect, it } from 'vitest';
import type { RestaurantServiceKey } from '@bilhanah/contracts';
import { defaultServices, servicesToEnable, toggleService } from './choices';

const sorted = (set: Set<RestaurantServiceKey>) => [...set].sort();

describe('choosing services', () => {
  it('starts from the answer about the QR menu', () => {
    expect(sorted(defaultServices('BILHANAH'))).toEqual(['ATTENDANCE', 'CASH_DRAWER', 'DIGITAL_MENU', 'INVENTORY', 'LOYALTY', 'QR_ORDERING', 'REVIEWS']);
    // Keeping their own menu, or none: nothing that needs Bilhanah's menu.
    expect(sorted(defaultServices('EXTERNAL'))).toEqual(['ATTENDANCE', 'CASH_DRAWER', 'INVENTORY']);
    expect(sorted(defaultServices('NONE'))).toEqual(['ATTENDANCE', 'CASH_DRAWER', 'INVENTORY']);
  });

  it('adds what a service needs, and removes what needs it', () => {
    const withOrdering = toggleService(defaultServices('EXTERNAL'), 'QR_ORDERING');
    expect(withOrdering.has('DIGITAL_MENU')).toBe(true);
    const withoutMenu = toggleService(defaultServices('BILHANAH'), 'DIGITAL_MENU');
    expect(withoutMenu.has('QR_ORDERING')).toBe(false);
    expect(withoutMenu.has('REVIEWS')).toBe(false);
    // Loyalty needs ordering, which needs the menu: it goes too.
    expect(withoutMenu.has('LOYALTY')).toBe(false);
    expect(withoutMenu.has('INVENTORY')).toBe(true);
    // Removing a service nothing needs leaves the rest alone.
    expect(sorted(toggleService(defaultServices('BILHANAH'), 'CASH_DRAWER'))).toEqual(['ATTENDANCE', 'DIGITAL_MENU', 'INVENTORY', 'LOYALTY', 'QR_ORDERING', 'REVIEWS']);
  });

  it('turns on requirements first, once, when switching on from the dashboard', () => {
    const on = new Set<RestaurantServiceKey>(['INVENTORY']);
    expect(servicesToEnable('QR_ORDERING', key => on.has(key))).toEqual(['DIGITAL_MENU', 'QR_ORDERING']);
    expect(servicesToEnable('CASH_DRAWER', key => on.has(key))).toEqual(['CASH_DRAWER']);
    // Already on: only what is missing.
    expect(servicesToEnable('REVIEWS', key => key === 'REVIEWS')).toEqual(['DIGITAL_MENU']);
    expect(servicesToEnable('LOYALTY', key => on.has(key))).toEqual(['DIGITAL_MENU', 'QR_ORDERING', 'LOYALTY']);
  });
});
