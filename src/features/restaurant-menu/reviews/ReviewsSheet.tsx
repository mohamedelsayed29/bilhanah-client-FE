import { useEffect, useId, useRef, useState } from 'react';
import { ArrowClockwiseIcon, ChatCircleTextIcon, SealCheckIcon, StarIcon, ThumbsDownIcon, ThumbsUpIcon, XIcon } from '@phosphor-icons/react';
import { DISH_THUMBS, REVIEW_SUB_RATING_LABELS, REVIEW_SUB_RATINGS, type DishRatingScale, type PublicReview, type PublicReviewsPage, type PublicReviewSummary } from '@bilhanah/contracts';
import { useLanguage } from '../../../lib/language';
import { imageAttributes, localized } from '../menu-format';
import { fetchPublicReviews } from './review-api';
import { Stars } from './review-ui';
import './reviews.css';

type Text = (ar: string, en: string) => string;
export const REVIEWS_PAGE_SIZE = 10;

/** One decimal, in the page's digits: 4.05 → "4.1" / "٤٫١". */
export const formatAverage = (value: number, language: 'ar' | 'en') =>
  new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);

const reviewsCount = (count: number, text: Text, number: (value: number) => string) =>
  text(count === 1 ? 'تقييم واحد' : count === 2 ? 'تقييمين' : count <= 10 ? `${number(count)} تقييمات` : `${number(count)} تقييم`, `${count} ${count === 1 ? 'review' : 'reviews'}`);

/** Says how reviews get published when the restaurant moderates them, so the average can be read honestly. */
export function policyNote(policy: PublicReviewSummary['policy'], text: Text, number: (value: number) => string): string | null {
  if (policy.mode === 'MANUAL') return text('المطعم بيراجع كل تقييم قبل ما ينشره، فالمتوسط ده محسوب من التقييمات اللي نشرها.', 'The restaurant checks every review before publishing it, so this average covers the reviews it published.');
  if (policy.minStars > 1) return text(`التقييمات من ${number(policy.minStars)} نجوم وأكتر بتتنشر على طول، والأقل منها بيراجعها المطعم الأول. المتوسط محسوب من التقييمات المنشورة بس.`, `Reviews of ${policy.minStars} stars or more are published straight away; lower ones are checked by the restaurant first. The average covers published reviews only.`);
  return null;
}

/**
 * The restaurant's published reviews: the summary (average, count, how the stars spread, the extra
 * questions' averages), how they are published when the restaurant moderates them, then the
 * reviews themselves with their photos and the restaurant's replies, ten at a time.
 */
export default function ReviewsSheet({ subdomain, restaurantName, timezone, branch, several, initial, onClose }: {
  subdomain: string;
  restaurantName: string;
  timezone: string;
  /** The branch the menu shows (its slug and name); null for a restaurant with one branch. */
  branch: { slug: string; name: string } | null;
  /** The restaurant has several branches: the diner can read the branch's reviews or all of them. */
  several: boolean;
  /** The first page for the branch, already loaded for the header. */
  initial: PublicReviewsPage | null;
  onClose: () => void;
}) {
  const { language, text, number } = useLanguage();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [scope, setScope] = useState<'branch' | 'all'>('branch');
  const [pages, setPages] = useState<PublicReviewsPage[]>(() => (initial ? [initial] : []));
  // The page being loaded (`attempt` changes on a retry); null while nothing is.
  const [request, setRequest] = useState<{ page: number; attempt: number } | null>(initial ? null : { page: 1, attempt: 0 });
  const [failed, setFailed] = useState(false);

  useEffect(() => { if (dialog.current && !dialog.current.open) dialog.current.showModal(); }, []);
  const close = () => dialog.current?.close();
  const branchSlug = scope === 'branch' && several ? branch?.slug ?? null : null;

  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    setFailed(false);
    fetchPublicReviews(subdomain, { branch: branchSlug, page: request.page, pageSize: REVIEWS_PAGE_SIZE }, controller.signal)
      .then(page => { setPages(current => request.page === 1 ? [page] : [...current, page]); setRequest(null); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [subdomain, branchSlug, request]);

  const chooseScope = (next: 'branch' | 'all') => {
    if (next === scope) return;
    setScope(next);
    const reuse = next === 'branch' && initial;
    setPages(reuse ? [initial] : []);
    setRequest(reuse ? null : { page: 1, attempt: 0 });
  };

  const first = pages[0];
  const items = pages.flatMap(page => page.items);
  const total = first?.total ?? 0;
  const summary = first?.summary;
  const note = summary ? policyNote(summary.policy, text, number) : null;
  const date = new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeZone: timezone });

  return <dialog ref={dialog} className="review-sheet reviews-sheet" aria-labelledby={`${id}-title`} onClose={onClose}
    onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="review-sheet-body">
      <header className="review-sheet-header">
        <h2 id={`${id}-title`}>{text('آراء الزباين', 'Reviews')}<small className="reviews-sheet-place"> · <bdi>{restaurantName}</bdi></small></h2>
        <button type="button" className="review-icon-button" onClick={close} aria-label={text('إغلاق', 'Close')}><XIcon size={20} /></button>
      </header>
      <div className="review-sheet-content reviews-content">
        {several && branch && <div className="reviews-scope" role="group" aria-label={text('آراء مين؟', 'Which reviews?')}>
          <button type="button" aria-pressed={scope === 'branch'} onClick={() => chooseScope('branch')}><bdi>{branch.name}</bdi></button>
          <button type="button" aria-pressed={scope === 'all'} onClick={() => chooseScope('all')}>{text('كل الفروع', 'All branches')}</button>
        </div>}

        {summary && <section className="reviews-summary" aria-labelledby={`${id}-summary`} data-testid="reviews-summary">
          <h3 id={`${id}-summary`} className="visually-hidden">{text('الملخص', 'Summary')}</h3>
          {summary.count > 0 && summary.average !== null ? <div className="reviews-average">
            <strong>{formatAverage(summary.average, language)}</strong>
            <span><Stars value={summary.average} size={20} />
              <span>{reviewsCount(summary.count, text, number)}{summary.verifiedCount > 0 && <>{text('، ', ' · ')}{text(`${number(summary.verifiedCount)} من طلبات مؤكدة`, `${summary.verifiedCount} from verified orders`)}</>}</span>
            </span>
          </div> : <p className="reviews-empty">{text('مفيش تقييمات منشورة لسه.', 'No published reviews yet.')}</p>}
          {summary.count > 0 && <ul className="reviews-distribution" aria-label={text('توزيع النجوم', 'How the stars spread')}>
            {[5, 4, 3, 2, 1].map(stars => {
              const count = summary.distribution[String(stars) as '1'] ?? 0;
              const share = summary.count ? count / summary.count : 0;
              return <li key={stars}>
                <span className="reviews-bar-label" aria-hidden="true">{number(stars)}<StarIcon size={13} weight="fill" /></span>
                <span className="reviews-bar" aria-hidden="true"><span style={{ inlineSize: `${Math.round(share * 100)}%` }} /></span>
                <span className="reviews-bar-count" aria-hidden="true">{number(count)}</span>
                <span className="visually-hidden">{text(`${number(stars)} نجوم: ${number(count)}`, `${stars} stars: ${count}`)}</span>
              </li>;
            })}
          </ul>}
          {Object.keys(summary.subRatings).length > 0 && <dl className="reviews-subratings">
            {REVIEW_SUB_RATINGS.filter(key => summary.subRatings[key] !== undefined).map(key => <div key={key}>
              <dt>{text(...REVIEW_SUB_RATING_LABELS[key])}</dt>
              <dd><StarIcon size={14} weight="fill" aria-hidden="true" />{formatAverage(summary.subRatings[key]!, language)}</dd>
            </div>)}
          </dl>}
          {note && <p className="reviews-policy" data-testid="reviews-policy">{note}</p>}
        </section>}

        {items.length > 0 && <ol className="reviews-list" aria-label={text('التقييمات', 'Reviews')}>
          {items.map(review => <li key={review.id}><ReviewItem review={review} scale={first!.dishRatingScale} restaurantName={restaurantName} date={date} showBranch={several && scope === 'all'} /></li>)}
        </ol>}

        <div className="reviews-more" role="status" aria-live="polite">
          {request && !failed && <p className="reviews-loading">{text('بنحمّل التقييمات…', 'Loading reviews…')}</p>}
          {failed && <p className="review-alert">{text('مقدرناش نجيب التقييمات.', 'We could not load the reviews.')}
            <button type="button" className="review-link" onClick={() => setRequest(current => current && { ...current, attempt: current.attempt + 1 })}><ArrowClockwiseIcon size={16} aria-hidden="true" />{text('حاول تاني', 'Try again')}</button></p>}
        </div>
        {!request && items.length < total && <button type="button" className="review-button secondary" onClick={() => setRequest({ page: pages.length + 1, attempt: 0 })}>
          {text(`اعرض تقييمات تانية (${number(total - items.length)})`, `Show more reviews (${total - items.length})`)}
        </button>}
      </div>
    </div>
  </dialog>;
}

function ReviewItem({ review, scale, restaurantName, date, showBranch }: { review: PublicReview; scale: DishRatingScale; restaurantName: string; date: Intl.DateTimeFormat; showBranch: boolean }) {
  const { language, text, number } = useLanguage();
  const name = review.displayName ?? text('ضيف', 'Guest');
  return <article className="public-review" data-testid="public-review">
    <header className="public-review-head">
      <Stars value={review.overall} size={16} />
      <span className="public-review-name"><bdi dir="auto">{name}</bdi></span>
      {review.verified
        ? <span className="public-review-badge is-verified"><SealCheckIcon size={15} weight="fill" aria-hidden="true" />{text('طلب مؤكد', 'Verified order')}</span>
        : <span className="public-review-badge">{text('من غير طلب', 'Unverified')}</span>}
      <time dateTime={review.publishedAt}>{date.format(new Date(review.publishedAt))}</time>
    </header>
    {showBranch && <p className="public-review-branch"><bdi>{review.branch.name}</bdi></p>}
    {review.tags.length > 0 && <ul className="public-review-tags">{review.tags.map(tag => <li key={tag.code} className={`is-${tag.sentiment.toLowerCase()}`}><bdi>{localized(language, tag.nameAr, tag.nameEn)}</bdi></li>)}</ul>}
    {review.comment && <p className="public-review-comment"><bdi dir="auto">{review.comment}</bdi></p>}
    {review.dishes.length > 0 && <ul className="public-review-dishes" aria-label={text('الأطباق', 'Dishes')}>
      {review.dishes.map((dish, index) => {
        const dishName = localized(language, dish.nameAr, dish.nameEn);
        const liked = dish.rating >= 4;
        return <li key={index}>
          {scale === 'THUMBS'
            ? <>{dish.rating === DISH_THUMBS.UP || liked ? <ThumbsUpIcon size={15} weight="fill" aria-hidden="true" /> : <ThumbsDownIcon size={15} weight="fill" aria-hidden="true" />}
              <span className="visually-hidden">{liked ? text('عجبه: ', 'Liked: ') : text('معجبهوش: ', 'Did not like: ')}</span></>
            : <><StarIcon size={15} weight="fill" aria-hidden="true" /><span aria-hidden="true">{number(dish.rating)}</span><span className="visually-hidden">{text(`${number(dish.rating)} من ٥: `, `${dish.rating} out of 5: `)}</span></>}
          <bdi>{dishName}</bdi>
        </li>;
      })}
    </ul>}
    {review.photos.length > 0 && <ul className="public-review-photos">
      {review.photos.map((photo, index) => {
        const largest = [...photo.sources].sort((a, b) => b.width - a.width)[0]?.url ?? photo.url;
        return <li key={photo.id}><a href={largest} target="_blank" rel="noopener noreferrer" aria-label={text(`صورة ${number(index + 1)} من ${name} (بتفتح في صفحة جديدة)`, `Photo ${index + 1} from ${name} (opens in a new tab)`)}>
          <img {...imageAttributes(photo, '96px')} alt="" loading="lazy" decoding="async" />
        </a></li>;
      })}
    </ul>}
    {review.reply && <div className="public-review-reply" data-testid="review-reply">
      <p className="public-review-reply-from"><ChatCircleTextIcon size={16} weight="fill" aria-hidden="true" />{text('رد ', 'Reply from ')}<bdi>{restaurantName}</bdi></p>
      <p><bdi dir="auto">{review.reply.text}</bdi></p>
    </div>}
  </article>;
}
