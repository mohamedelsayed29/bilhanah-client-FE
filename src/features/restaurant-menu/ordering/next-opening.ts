import type { OpeningHours, Weekday } from '@bilhanah/contracts';

const JS_WEEKDAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/**
 * When a closed restaurant opens next, in its own time zone: `inDays` 0 is today, 1 tomorrow.
 * Null when it has no hours in the coming week.
 */
export function nextOpening(hours: OpeningHours, now: Date, timeZone: string): { day: Weekday; opens: string; inDays: number } | null {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const part = (type: string) => parts.find(candidate => candidate.type === type)?.value ?? '';
  const today = JS_WEEKDAYS.indexOf(part('weekday').toLowerCase().slice(0, 3) as Weekday);
  const minute = Number(part('hour')) * 60 + Number(part('minute'));
  for (let inDays = 0; inDays <= 7; inDays++) {
    const day = JS_WEEKDAYS[(today + inDays) % 7]!;
    const opens = hours[day].map(range => range.opens).filter(time => inDays > 0 || toMinutes(time) > minute).sort()[0];
    if (opens) return { day, opens, inDays };
  }
  return null;
}

