/**
 * Paid periods, computed the way the API does (bilhanah-BE: src/modules/billing/periods.ts),
 * so the dates previewed before paying or granting match the period that is created.
 */

/**
 * Adds calendar months in UTC, keeping the day of month where possible:
 * Jan 31 + 1 month is the last day of February.
 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

/** Where a new period starts: when the latest existing period (trial or paid) ends, or now. */
export function nextPeriodStart(periods: readonly { endsAt: string }[], now = Date.now()): Date {
  const latestEnd = periods.reduce((latest, period) => Math.max(latest, new Date(period.endsAt).getTime()), 0);
  return new Date(Math.max(now, latestEnd));
}

/** The period `months` would buy, starting at `startsAt` (e.g. the API's `nextPeriodStartsAt`). */
export function periodFrom(startsAt: string | Date, months: number): { startsAt: Date; endsAt: Date } {
  const start = new Date(startsAt);
  return { startsAt: start, endsAt: addMonths(start, months) };
}

/** Whether a new period would start later than now, i.e. after existing coverage (trial days are kept). */
export function startsLater(startsAt: string | Date, now = Date.now()): boolean {
  // A minute of slack: the API sets `nextPeriodStartsAt` to "now" when nothing is running.
  return new Date(startsAt).getTime() - now > 60_000;
}
