import { useSearchParams } from 'react-router';
import { STATS_PERIODS, type StatsPeriod } from '@bilhanah/contracts';
import { useLanguage } from '../../lib/language';

/** The period in the address bar (`?days=`), so a view can be linked and survives reloads; 30 days by default. */
export function usePeriodParam(fallback: StatsPeriod = 30): [StatsPeriod, (days: StatsPeriod) => void] {
  const [params, setParams] = useSearchParams();
  const value = Number(params.get('days'));
  const days = (STATS_PERIODS as readonly number[]).includes(value) ? value as StatsPeriod : fallback;
  const setDays = (next: StatsPeriod) => setParams(current => {
    const updated = new URLSearchParams(current);
    if (next === fallback) updated.delete('days');
    else updated.set('days', String(next));
    return updated;
  }, { replace: true });
  return [days, setDays];
}

export function periodLabel(days: StatsPeriod, text: (ar: string, en: string) => string, number: (value: number) => string): string {
  return text(`آخر ${number(days)} يوم`, `Last ${days} days`);
}

/** Last 7 / 30 / 90 days, as a radio group. */
export function PeriodSwitch({ value, onChange }: { value: StatsPeriod; onChange: (days: StatsPeriod) => void }) {
  const { text, number } = useLanguage();
  return <div className="segmented period-switch" role="radiogroup" aria-label={text('الفترة', 'Period')}>
    {STATS_PERIODS.map(days => <label key={days}>
      <input type="radio" name="stats-period" value={days} checked={value === days} onChange={() => onChange(days)} />
      {text(days === 7 ? 'آخر ٧ أيام' : `آخر ${number(days)} يوم`, `${days} days`)}
    </label>)}
  </div>;
}
