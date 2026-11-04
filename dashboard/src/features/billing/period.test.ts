import { describe, expect, it } from 'vitest';
import { addMonths, nextPeriodStart, periodFrom, startsLater } from './period';

describe('addMonths', () => {
  it('adds calendar months and keeps the time of day', () => {
    expect(addMonths(new Date('2026-03-15T10:30:00.000Z'), 1).toISOString()).toBe('2026-04-15T10:30:00.000Z');
    expect(addMonths(new Date('2026-03-15T10:30:00.000Z'), 12).toISOString()).toBe('2027-03-15T10:30:00.000Z');
  });

  it('clamps to the last day of shorter months', () => {
    expect(addMonths(new Date('2026-01-31T00:00:00.000Z'), 1).toISOString()).toBe('2026-02-28T00:00:00.000Z');
    expect(addMonths(new Date('2028-01-31T00:00:00.000Z'), 1).toISOString()).toBe('2028-02-29T00:00:00.000Z');
    expect(addMonths(new Date('2026-08-31T12:00:00.000Z'), 3).toISOString()).toBe('2026-11-30T12:00:00.000Z');
  });

  it('crosses year boundaries', () => {
    expect(addMonths(new Date('2026-11-05T00:00:00.000Z'), 6).toISOString()).toBe('2027-05-05T00:00:00.000Z');
  });
});

describe('nextPeriodStart', () => {
  const now = new Date('2026-10-23T09:00:00.000Z').getTime();

  it('starts when the latest period ends, so remaining trial days are kept', () => {
    const periods = [{ endsAt: '2026-11-10T09:00:00.000Z' }, { endsAt: '2026-10-01T09:00:00.000Z' }];
    expect(nextPeriodStart(periods, now).toISOString()).toBe('2026-11-10T09:00:00.000Z');
  });

  it('starts now when access has lapsed or there is no period', () => {
    expect(nextPeriodStart([{ endsAt: '2026-09-01T00:00:00.000Z' }], now).getTime()).toBe(now);
    expect(nextPeriodStart([], now).getTime()).toBe(now);
  });
});

describe('periodFrom', () => {
  it('previews the period bought from the next start date', () => {
    const period = periodFrom('2026-11-10T09:00:00.000Z', 3);
    expect(period.startsAt.toISOString()).toBe('2026-11-10T09:00:00.000Z');
    expect(period.endsAt.toISOString()).toBe('2027-02-10T09:00:00.000Z');
  });
});

describe('startsLater', () => {
  const now = new Date('2026-10-23T09:00:00.000Z').getTime();
  it('is true only when the period starts after current coverage', () => {
    expect(startsLater('2026-11-10T09:00:00.000Z', now)).toBe(true);
    expect(startsLater('2026-10-23T09:00:00.500Z', now)).toBe(false);
  });
});
