/**
 * Pure helpers behind the dashboard's inline SVG charts (no chart library):
 * axis scaling, gap-free daily series, bar geometry that follows the reading
 * direction, and percentages that add up to 100.
 */

/** The smallest "nice" number (1, 2, 2.5 or 5 × 10ⁿ) at or above `value`; at least `minimum`. */
export function niceMax(value: number, minimum = 4): number {
  if (!(value > minimum)) return minimum;
  const target = value;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= target - 1e-9) return candidate;
  }
  return 10 * magnitude;
}

/** Gridline values from 0 to the nice maximum, in 4 or 5 equal whole-number steps where possible. */
export function axisTicks(max: number): number[] {
  const top = niceMax(max);
  const steps = [4, 5, 2].find(count => Number.isInteger(top / count)) ?? 1;
  return Array.from({ length: steps + 1 }, (_, index) => (top / steps) * index);
}

/** Adds one day to a `YYYY-MM-DD` date (calendar arithmetic, no time zone involved). */
export function nextDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

/**
 * Sorts days by date and fills missing dates between the first and the last with zeros,
 * so every bar stands for exactly one day.
 */
export function completeDays<Day extends { date: string }>(days: readonly Day[], zero: (date: string) => Day): Day[] {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const result: Day[] = [];
  for (const day of sorted) {
    const previous = result.at(-1);
    if (previous?.date === day.date) continue;
    if (previous) {
      let date = nextDate(previous.date);
      // A broken date would never reach `day.date`; stop after a year of gaps.
      for (let guard = 0; date < day.date && guard < 400; guard += 1) {
        result.push(zero(date));
        date = nextDate(date);
      }
    }
    result.push(day);
  }
  return result;
}

export type Bar = { index: number; x: number; width: number };

/**
 * Horizontal positions of `count` equal bars across `width`, leaving `gap` between them.
 * In right-to-left layouts time runs from right to left, so the first (oldest) bar is on the right.
 */
export function barLayout(count: number, width: number, options: { gap?: number; rtl?: boolean } = {}): Bar[] {
  if (count <= 0 || width <= 0) return [];
  const slot = width / count;
  const gap = Math.min(options.gap ?? 2, slot * 0.4);
  const barWidth = Math.max(slot - gap, 0.5);
  return Array.from({ length: count }, (_, index) => {
    const position = options.rtl ? count - 1 - index : index;
    return { index, x: position * slot + (slot - barWidth) / 2, width: barWidth };
  });
}

/** Height of a bar for `value` on a scale whose top is `max`, never below `minimum` for non-zero values (so small days stay visible). */
export function barHeight(value: number, max: number, height: number, minimum = 2): number {
  if (value <= 0 || max <= 0) return 0;
  return Math.max(minimum, (Math.min(value, max) / max) * height);
}

/** Which of `count` days get a date under the axis: about `maxLabels`, always including the first and the last. */
export function labelIndexes(count: number, maxLabels: number): number[] {
  if (count <= 0) return [];
  if (count <= maxLabels) return Array.from({ length: count }, (_, index) => index);
  const every = Math.ceil((count - 1) / Math.max(1, maxLabels - 1));
  const indexes: number[] = [];
  for (let index = 0; index < count; index += every) indexes.push(index);
  const last = count - 1;
  // Drop a label that would crowd the last one.
  if (indexes.at(-1) !== last) {
    if (last - indexes.at(-1)! < every / 2) indexes.pop();
    indexes.push(last);
  }
  return indexes;
}

/**
 * Whole-number percentages of `values` that add up to exactly 100 (largest remainder),
 * or all zeros when there is nothing to share.
 */
export function percentages(values: readonly number[]): number[] {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) return values.map(() => 0);
  const exact = values.map(value => (Math.max(0, value) / total) * 100);
  const result = exact.map(Math.floor);
  let remaining = 100 - result.reduce((sum, value) => sum + value, 0);
  const order = exact.map((value, index) => ({ index, rest: value - Math.floor(value) })).sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (const { index } of order) {
    if (remaining <= 0) break;
    result[index]! += 1;
    remaining -= 1;
  }
  return result;
}

/** A `YYYY-MM-DD` day as a short date ("23 أكتوبر" / "Oct 23"), without shifting it through a time zone. */
export function formatDay(date: string, locale: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** Whether any day has a value above zero for any of `keys`. */
export function hasActivity<Day>(days: readonly Day[], keys: readonly (keyof Day)[]): boolean {
  return days.some(day => keys.some(key => Number(day[key]) > 0));
}
