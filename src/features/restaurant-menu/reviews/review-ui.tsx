import { useId } from 'react';
import { StarIcon, ThumbsDownIcon, ThumbsUpIcon } from '@phosphor-icons/react';
import { DISH_THUMBS, type ReviewOutcome } from '@bilhanah/contracts';
import { useLanguage } from '../../../lib/language';

type Text = (ar: string, en: string) => string;

/** What each star means, said with the stars and read to screen readers. */
export function ratingWord(stars: number, text: Text): string {
  return [
    text('وحش', 'Bad'),
    text('مش أحسن حاجة', 'Not great'),
    text('كويس', 'Okay'),
    text('حلو جدًا', 'Very good'),
    text('ممتاز', 'Excellent'),
  ][stars - 1] ?? '';
}

/** "4 out of 5 stars" / "٤ من ٥ نجوم". */
export function starsLabel(stars: number, text: Text, number: (value: number) => string): string {
  return text(`${number(stars)} من ٥ نجوم`, `${stars} out of 5 stars`);
}

/**
 * Five stars to choose from: native radio buttons (arrow keys move between them), each a large
 * tap target, the whole row a radio group with its own label, error and hint.
 */
export function StarsInput({ label, value, onChange, size = 'large', required = false, error, hint, id: givenId }: {
  label: string;
  value: number | null;
  onChange: (stars: number) => void;
  size?: 'large' | 'compact';
  required?: boolean;
  error?: string | null;
  hint?: string | null;
  id?: string;
}) {
  const { text, number } = useLanguage();
  const ownId = useId();
  const id = givenId ?? ownId;
  const described = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined;
  return <div className={`stars-field is-${size} ${error ? 'invalid' : ''}`}>
    <span className="stars-label" id={`${id}-label`}>{label}{required && <span className="field-required">{text(' (مطلوب)', ' (required)')}</span>}</span>
    <div className="stars-input" role="radiogroup" aria-labelledby={`${id}-label`} aria-required={required || undefined} aria-invalid={error ? true : undefined} aria-describedby={described} id={id} tabIndex={-1}>
      {[1, 2, 3, 4, 5].map(stars => <label key={stars} className={`star-option ${value !== null && stars <= value ? 'is-on' : ''}`}>
        <input type="radio" name={id} value={stars} checked={value === stars} onChange={() => onChange(stars)} />
        <StarIcon size={size === 'large' ? 34 : 24} weight={value !== null && stars <= value ? 'fill' : 'regular'} aria-hidden="true" />
        <span className="visually-hidden">{`${starsLabel(stars, text, number)}${text('، ', ', ')}${ratingWord(stars, text)}`}</span>
      </label>)}
    </div>
    {size === 'large' && <p className="stars-word" aria-hidden="true">{value ? ratingWord(value, text) : ' '}</p>}
    {hint && <p className="field-hint" id={`${id}-hint`}>{hint}</p>}
    {error && <p className="field-error" id={`${id}-error`}>{error}</p>}
  </div>;
}

/** Thumbs up or down for one dish; tapping the chosen one again clears it. */
export function ThumbsInput({ dish, value, onChange }: { dish: string; value: number | null; onChange: (rating: number | null) => void }) {
  const { text } = useLanguage();
  const up = value === DISH_THUMBS.UP;
  const down = value === DISH_THUMBS.DOWN;
  return <div className="thumbs-input" role="group" aria-label={dish}>
    <button type="button" className={`thumb-option is-up ${up ? 'is-on' : ''}`} aria-pressed={up} onClick={() => onChange(up ? null : DISH_THUMBS.UP)}>
      <ThumbsUpIcon size={22} weight={up ? 'fill' : 'regular'} aria-hidden="true" /><span className="visually-hidden">{text(`عجبني: ${dish}`, `Liked ${dish}`)}</span>
    </button>
    <button type="button" className={`thumb-option is-down ${down ? 'is-on' : ''}`} aria-pressed={down} onClick={() => onChange(down ? null : DISH_THUMBS.DOWN)}>
      <ThumbsDownIcon size={22} weight={down ? 'fill' : 'regular'} aria-hidden="true" /><span className="visually-hidden">{text(`معجبنيش: ${dish}`, `Didn't like ${dish}`)}</span>
    </button>
  </div>;
}

/** Read-only stars (to the nearest whole star), with the exact rating said once for screen readers. */
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  const { text, number } = useLanguage();
  const whole = Math.round(value);
  return <span className="stars" role="img" aria-label={starsLabel(Math.round(value * 10) / 10, text, number)}>
    {[1, 2, 3, 4, 5].map(stars => <StarIcon key={stars} size={size} aria-hidden="true" weight={stars <= whole ? 'fill' : 'regular'} className={stars <= whole ? 'is-on' : ''} />)}
  </span>;
}

/** What happens to the diner's review now, in a sentence. */
export function outcomeText(outcome: ReviewOutcome, text: Text): { title: string; detail: string } {
  if (outcome.status === 'PUBLISHED') return { title: text('شكرًا! تقييمك اتنشر', 'Thank you! Your review is published'), detail: text('ظاهر دلوقتي للناس اللي بتتفرج على المنيو.', 'Diners can see it on the menu now.') };
  if (outcome.status === 'PENDING') return { title: text('شكرًا! وصل تقييمك للمطعم', 'Thank you! The restaurant has your review'), detail: text('المطعم بيراجع التقييمات قبل ما تتنشر، فهيظهر بعد المراجعة.', 'The restaurant checks reviews before publishing them, so yours will show once it is approved.') };
  return { title: text('شكرًا! وصل رأيك للمطعم', 'Thank you! Your feedback reached the restaurant'), detail: text('المطعم بيقرأ الآراء بنفسه، ومش بينشرها.', 'The restaurant reads feedback itself and does not publish it.') };
}

/** "Edit until 9:40 PM · 23 hours left". */
export function editWindowText(until: string, now: number, language: 'ar' | 'en', text: Text, number: (value: number) => string): string | null {
  const left = Date.parse(until) - now;
  if (!(left > 0)) return null;
  const minutes = Math.ceil(left / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const remaining = days >= 2 ? text(`${number(days)} أيام`, `${days} days`)
    : hours >= 1 ? text(hours === 1 ? 'ساعة' : hours === 2 ? 'ساعتين' : `${number(hours)} ساعة`, `${hours} ${hours === 1 ? 'hour' : 'hours'}`)
      : text(minutes === 1 ? 'دقيقة' : minutes === 2 ? 'دقيقتين' : `${number(minutes)} دقيقة`, `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  // The day too when it is not today ("until Sat 4:52 PM").
  const today = new Date(now).toDateString() === new Date(until).toDateString();
  const when = new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG' : 'en-US', today ? { hour: 'numeric', minute: '2-digit' } : { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(until));
  return text(`تقدر تعدّله لحد ${when} (فاضل ${remaining})`, `You can edit it until ${when} (${remaining} left)`);
}
