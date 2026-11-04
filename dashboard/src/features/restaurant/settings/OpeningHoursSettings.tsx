import { useState } from 'react';
import { CopyIcon, MoonStarsIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react';
import { type OpeningHours, openingHoursSchema, type Weekday, WEEKDAYS } from '@bilhanah/contracts';
import { Alert } from '../../../components/Alert';
import { Button } from '../../../components/Button';
import { Switch } from '../../../components/Switch';
import { errorMessage } from '../../../lib/api/error-messages';
import { useLanguage, usePageTitle } from '../../../lib/language';
import { useBranchList } from '../../branches/workspace';
import { useRestaurant } from '../queries';
import { PerBranchNotice } from './PerBranchNotice';
import { useSaveRestaurant } from './useSaveRestaurant';

const DAY_NAMES: Record<Weekday, [string, string]> = {
  sat: ['السبت', 'Saturday'], sun: ['الحد', 'Sunday'], mon: ['الاتنين', 'Monday'], tue: ['التلات', 'Tuesday'],
  wed: ['الأربع', 'Wednesday'], thu: ['الخميس', 'Thursday'], fri: ['الجمعة', 'Friday'],
};
const MAX_RANGES = 3;
const DEFAULT_RANGE = { opens: '10:00', closes: '23:00' };

/** A new range starts when the previous one closes and lasts four hours. */
function nextRange(previous: { closes: string } | undefined) {
  if (!previous) return { ...DEFAULT_RANGE };
  const [hours, minutes] = previous.closes.split(':').map(Number);
  const closes = `${String(((hours ?? 0) + 4) % 24).padStart(2, '0')}:${String(minutes ?? 0).padStart(2, '0')}`;
  return { opens: previous.closes, closes };
}

function defaultHours(): OpeningHours {
  return Object.fromEntries(WEEKDAYS.map(day => [day, [{ ...DEFAULT_RANGE }]])) as OpeningHours;
}

/** The restaurant's hours (its main branch's); with several branches, each branch's are on its own page. */
export function OpeningHoursSettings() {
  usePageTitle('مواعيد الشغل', 'Opening hours');
  const restaurant = useRestaurant();
  const list = useBranchList();
  const save = useSaveRestaurant();
  if (list.branches.filter(branch => branch.isActive).length > 1) return <PerBranchNotice kind="hours" />;
  return <OpeningHoursEditor initial={restaurant.openingHours} saving={save.isPending} error={save.isError ? save.error : null}
    onSave={openingHours => save.mutate({ openingHours })} />;
}

/** The week editor: up to three ranges a day, saved together. Used for the restaurant and for each branch. */
export function OpeningHoursEditor({ initial, saving, error, onSave, title }: {
  initial: OpeningHours | null; saving: boolean; error: unknown; onSave: (hours: OpeningHours | null) => void; title?: string;
}) {
  const { text, number } = useLanguage();
  const [hours, setHours] = useState<OpeningHours | null>(initial);
  const [showErrors, setShowErrors] = useState(false);
  const validation = hours ? openingHoursSchema.safeParse(hours) : null;
  const invalid = new Set(validation && !validation.success ? validation.error.issues.map(issue => issue.path.slice(0, 2).join('.')) : []);
  const dirty = JSON.stringify(hours) !== JSON.stringify(initial);

  const updateDay = (day: Weekday, ranges: OpeningHours[Weekday]) => setHours(current => (current ? { ...current, [day]: ranges } : current));
  const submit = () => {
    if (validation && !validation.success) { setShowErrors(true); return; }
    onSave(hours);
  };

  return <form className="settings-main hours-form" noValidate onSubmit={event => { event.preventDefault(); submit(); }}>
    {error != null && <Alert kind="error">{errorMessage(error, text)}</Alert>}
    <section className="section" aria-labelledby="hours-title">
        <div className="section-head"><div><h2 id="hours-title">{title ?? text('مواعيد الشغل', 'Opening hours')}</h2><p>{text('الزبون بيشوف إذا كنت فاتح دلوقتي حسب المواعيد دي وبتوقيت مطعمك.', 'Diners see whether you are open now, based on these hours in your restaurant’s time zone.')}</p></div></div>
      <Switch checked={hours !== null} onChange={on => setHours(on ? initial ?? defaultHours() : null)}
        label={text('اعرض مواعيد الشغل في المنيو', 'Show opening hours on the menu')}
        description={hours ? text('حدد لكل يوم لحد ٣ فترات.', 'Set up to three time ranges per day.') : text('المواعيد مش ظاهرة للزباين.', 'Opening hours are hidden from diners.')} />
    </section>
    {hours && <section className="section hours-week" aria-label={text('أيام الأسبوع', 'Days of the week')}>
      <div className="hours-toolbar">
        <Button variant="ghost" small icon={<CopyIcon size={16} aria-hidden="true" />} onClick={() => setHours(current => current && Object.fromEntries(WEEKDAYS.map(day => [day, current.sat.map(range => ({ ...range }))])) as OpeningHours)}>
          {text('طبّق مواعيد السبت على كل الأيام', 'Copy Saturday to every day')}
        </Button>
      </div>
      <ul className="hours-list">
        {WEEKDAYS.map(day => {
          const ranges = hours[day];
          const dayName = text(...DAY_NAMES[day]);
          return <li key={day} className={`hours-day ${ranges.length ? '' : 'is-closed'}`} data-testid={`day-${day}`}>
            <div className="hours-day-head">
              <Switch checked={ranges.length > 0} onChange={open => updateDay(day, open ? [{ ...DEFAULT_RANGE }] : [])}
                label={<span className="visually-hidden">{text(`${dayName} مفتوح`, `Open on ${dayName}`)}</span>} />
              <div className="hours-day-name">
                <strong>{dayName}</strong>
                <small>{ranges.length ? text('مفتوح', 'Open') : text('مقفول', 'Closed')}</small>
              </div>
            </div>
            {ranges.length > 0 && <div className="hours-ranges">
              {ranges.map((range, index) => {
                const overnight = range.closes < range.opens;
                const bad = showErrors && invalid.has(`${day}.${index}`);
                return <div className="hours-range" key={index} role="group" aria-label={text(`${dayName}، الفترة ${number(index + 1)}`, `${dayName}, range ${index + 1}`)}>
                  <label className="time-field"><span>{text('من', 'Opens')}</span>
                    <input type="time" className="input" value={range.opens} aria-invalid={bad || undefined} required
                      onChange={event => updateDay(day, ranges.map((entry, i) => (i === index ? { ...entry, opens: event.target.value } : entry)))} />
                  </label>
                  <label className="time-field"><span>{text('لحد', 'Closes')}</span>
                    <input type="time" className="input" value={range.closes} aria-invalid={bad || undefined} required
                      onChange={event => updateDay(day, ranges.map((entry, i) => (i === index ? { ...entry, closes: event.target.value } : entry)))} />
                  </label>
                  {overnight && <span className="overnight"><MoonStarsIcon size={13} aria-hidden="true" />{text('لليوم اللي بعده', 'Next day')}</span>}
                  <button type="button" className="icon-button icon-button-danger" onClick={() => updateDay(day, ranges.filter((_, i) => i !== index))}
                    aria-label={text(`امسح فترة ${number(index + 1)} يوم ${dayName}`, `Remove range ${index + 1} on ${dayName}`)}><TrashIcon size={18} /></button>
                  {bad && <p className="field-error range-error" role="alert">{text('اكتب وقت فتح وقفل مختلفين.', 'Enter different opening and closing times.')}</p>}
                </div>;
              })}
              {ranges.length < MAX_RANGES && <Button variant="ghost" small icon={<PlusIcon size={16} aria-hidden="true" />}
                onClick={() => updateDay(day, [...ranges, nextRange(ranges.at(-1))])}
                aria-label={text(`أضف فترة يوم ${dayName}`, `Add a range on ${dayName}`)}>{text('أضف فترة', 'Add range')}</Button>}
            </div>}
          </li>;
        })}
      </ul>
      <p className="field-hint">{text('لو وقت القفل قبل وقت الفتح (زي ٦ م لحد ٢ ص)، يبقى بتقفل بعد نص الليل.', 'A closing time earlier than the opening time (e.g. 6 PM to 2 AM) means you close after midnight.')}</p>
    </section>}
    <div className={`sticky-actions ${dirty ? 'is-dirty' : ''}`}>
      {dirty && <span className="muted">{text('في تغييرات مش محفوظة', 'You have unsaved changes')}</span>}
      <Button variant="secondary" disabled={!dirty || saving} onClick={() => { setHours(initial); setShowErrors(false); }}>{text('تراجع', 'Discard')}</Button>
      <Button type="submit" loading={saving} disabled={!dirty}>{text('احفظ المواعيد', 'Save hours')}</Button>
    </div>
  </form>;
}
