import { describe, expect, it } from 'vitest';
import { axisTicks, barHeight, barLayout, completeDays, formatDay, hasActivity, labelIndexes, nextDate, niceMax, percentages } from './charts';

describe('niceMax', () => {
  it('rounds up to 1, 2, 2.5 or 5 times a power of ten', () => {
    expect(niceMax(7)).toBe(10);
    expect(niceMax(13)).toBe(20);
    expect(niceMax(21)).toBe(25);
    expect(niceMax(40)).toBe(50);
    expect(niceMax(100)).toBe(100);
    expect(niceMax(101)).toBe(200);
    expect(niceMax(123_456)).toBe(200_000);
  });

  it('keeps a small minimum so empty or tiny series still get an axis', () => {
    expect(niceMax(0)).toBe(4);
    expect(niceMax(1)).toBe(4);
    expect(niceMax(-5)).toBe(4);
  });
});

describe('axisTicks', () => {
  it('splits the axis into whole-number steps', () => {
    expect(axisTicks(7)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(axisTicks(21)).toEqual([0, 5, 10, 15, 20, 25]);
    expect(axisTicks(0)).toEqual([0, 1, 2, 3, 4]);
    expect(axisTicks(180)).toEqual([0, 50, 100, 150, 200]);
  });
});

describe('completeDays', () => {
  const zero = (date: string) => ({ date, visits: 0 });

  it('sorts days and fills the gaps between them with zeros', () => {
    const days = completeDays([{ date: '2026-10-03', visits: 4 }, { date: '2026-10-01', visits: 2 }], zero);
    expect(days).toEqual([{ date: '2026-10-01', visits: 2 }, { date: '2026-10-02', visits: 0 }, { date: '2026-10-03', visits: 4 }]);
  });

  it('crosses month and year ends and drops duplicate dates', () => {
    const days = completeDays([{ date: '2026-12-31', visits: 1 }, { date: '2027-01-02', visits: 1 }, { date: '2027-01-02', visits: 9 }], zero);
    expect(days.map(day => day.date)).toEqual(['2026-12-31', '2027-01-01', '2027-01-02']);
  });

  it('leaves an empty series empty', () => {
    expect(completeDays([], zero)).toEqual([]);
  });
});

describe('nextDate', () => {
  it('handles leap years', () => {
    expect(nextDate('2028-02-28')).toBe('2028-02-29');
    expect(nextDate('2026-02-28')).toBe('2026-03-01');
  });
});

describe('barLayout', () => {
  it('places bars left to right with a gap, centred in their slots', () => {
    const bars = barLayout(4, 100, { gap: 4 });
    expect(bars.map(bar => bar.x)).toEqual([2, 27, 52, 77]);
    expect(bars.every(bar => bar.width === 21)).toBe(true);
  });

  it('runs from right to left in RTL: the first day is the rightmost bar', () => {
    const bars = barLayout(4, 100, { gap: 4, rtl: true });
    expect(bars[0]!.x).toBe(77);
    expect(bars[3]!.x).toBe(2);
  });

  it('shrinks the gap when bars are narrow and returns nothing without room', () => {
    const bars = barLayout(90, 180, { gap: 4 });
    expect(bars[0]!.width).toBeCloseTo(1.2);
    expect(barLayout(0, 100)).toEqual([]);
    expect(barLayout(3, 0)).toEqual([]);
  });
});

describe('barHeight', () => {
  it('scales to the axis and keeps tiny values visible', () => {
    expect(barHeight(50, 100, 120)).toBe(60);
    expect(barHeight(1, 10_000, 120)).toBe(2);
    expect(barHeight(0, 100, 120)).toBe(0);
    expect(barHeight(500, 100, 120)).toBe(120);
  });
});

describe('labelIndexes', () => {
  it('labels every day of a short period', () => {
    expect(labelIndexes(7, 8)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('labels about maxLabels days of a long period, always the first and the last', () => {
    const indexes = labelIndexes(30, 6);
    expect(indexes[0]).toBe(0);
    expect(indexes.at(-1)).toBe(29);
    expect(indexes.length).toBeLessThanOrEqual(7);
    const ninety = labelIndexes(90, 5);
    expect(ninety.at(-1)).toBe(89);
    expect(new Set(ninety).size).toBe(ninety.length);
  });

  it('handles empty series', () => {
    expect(labelIndexes(0, 5)).toEqual([]);
  });
});

describe('percentages', () => {
  it('adds up to exactly 100', () => {
    expect(percentages([1, 1, 1])).toEqual([34, 33, 33]);
    expect(percentages([2, 1])).toEqual([67, 33]);
    expect(percentages([70, 20, 10])).toEqual([70, 20, 10]);
  });

  it('is all zeros when there is nothing to share', () => {
    expect(percentages([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe('formatDay', () => {
  it('formats the calendar day itself, whatever the time zone', () => {
    expect(formatDay('2026-10-01', 'en-EG')).toBe('Oct 1');
    expect(formatDay('2026-10-01', 'ar-EG')).toContain('أكتوبر');
  });
});

describe('hasActivity', () => {
  it('is true when any day has a value', () => {
    expect(hasActivity([{ visits: 0, orders: 0 }, { visits: 0, orders: 1 }], ['visits', 'orders'])).toBe(true);
    expect(hasActivity([{ visits: 0, orders: 0 }], ['visits'])).toBe(false);
  });
});
