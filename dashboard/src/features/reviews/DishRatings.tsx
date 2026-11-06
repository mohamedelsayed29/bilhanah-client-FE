import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { StarIcon, ThumbsDownIcon, ThumbsUpIcon } from '@phosphor-icons/react';
import { REVIEW_ERROR_CODES, type ReviewDishReport } from '@bilhanah/contracts';
import { isApiError } from '../../lib/api';
import { reviewsApi } from '../../lib/api/endpoints';
import { useLanguage } from '../../lib/language';
import { useWorkspace } from '../branches/workspace';
import { useRestaurant } from '../restaurant/queries';
import { reviewKeys } from './keys';
import { formatAverage, formatShare } from './present';

/** The menu editor shows what diners thought of each dish over this many days (every branch). */
export const DISH_RATING_DAYS = 90;

type DishRow = ReviewDishReport['dishes'][number];

/** A dish reads as a concern once a third of its ratings are down, or its average is below 3. */
export const dishIsLow = (row: Pick<DishRow, 'average' | 'downShare'>) => row.downShare >= 1 / 3 || row.average < 3;

/**
 * Diners' ratings of the menu's dishes (GET /reviews/dishes), by menu item, when the plan includes
 * reviews and the owner reads them. Every branch, published or not: this is the owner's view.
 */
export function useDishRatings() {
  const restaurant = useRestaurant();
  const { can } = useWorkspace();
  const enabled = Boolean(restaurant.access.features.reviews) && can('reviews.view');
  const params = { branchId: null, days: DISH_RATING_DAYS };
  const report = useQuery({
    queryKey: reviewKeys.dishes(params),
    queryFn: () => reviewsApi.dishes(params),
    enabled,
    staleTime: 5 * 60_000,
    retry: (count, error) => !isApiError(error, REVIEW_ERROR_CODES.UNAVAILABLE) && count < 2,
  });
  const byItem = useMemo(() => new Map((report.data?.dishes ?? []).filter(row => row.menuItemId).map(row => [row.menuItemId!, row])), [report.data]);
  return { enabled, scale: report.data?.dishRatingScale ?? 'THUMBS', byItem };
}

/** "👍 83% · 12" (thumbs) or "★ 4.3 · 12" (stars) on a dish row. */
export function ItemRatingBadge({ itemId }: { itemId: string }) {
  const { text, number, language } = useLanguage();
  const { byItem, scale } = useDishRatings();
  const row = byItem.get(itemId);
  if (!row) return null;
  const summary = scale === 'STARS'
    ? text(`تقييم الزباين ${formatAverage(row.average, 'ar')} من ٥، من ${number(row.count)} تقييم في آخر ${number(DISH_RATING_DAYS)} يوم`, `Diners rate it ${formatAverage(row.average, 'en')} of 5, from ${row.count} ratings in the last ${DISH_RATING_DAYS} days`)
    : text(`${formatShare(row.upShare, 'ar')} من الزباين عجبهم، من ${number(row.count)} تقييم في آخر ${number(DISH_RATING_DAYS)} يوم`, `${formatShare(row.upShare, 'en')} of diners liked it, from ${row.count} ratings in the last ${DISH_RATING_DAYS} days`);
  const low = dishIsLow(row);
  return <span className={`item-rating ${low ? 'is-low' : ''}`} title={summary} data-testid="item-rating">
    {scale === 'STARS' ? <StarIcon size={13} weight="fill" aria-hidden="true" /> : low ? <ThumbsDownIcon size={13} weight="fill" aria-hidden="true" /> : <ThumbsUpIcon size={13} weight="fill" aria-hidden="true" />}
    <span aria-hidden="true">{scale === 'STARS' ? formatAverage(row.average, language) : formatShare(row.upShare, language)} · {number(row.count)}</span>
    <span className="visually-hidden">{summary}</span>
  </span>;
}

/** The item editor's panel: how diners rated the dish, and their latest comments on it. */
export function ItemRatingsPanel({ itemId }: { itemId: string }) {
  const { text, number, language } = useLanguage();
  const { enabled, byItem, scale } = useDishRatings();
  const { to } = useWorkspace();
  if (!enabled) return null;
  const row = byItem.get(itemId);
  return <section className="rv-item-panel" aria-labelledby={`rv-item-${itemId}`} data-testid="item-ratings">
    <h3 id={`rv-item-${itemId}`}>{text(`رأي الزباين (آخر ${number(DISH_RATING_DAYS)} يوم)`, `What diners thought (last ${DISH_RATING_DAYS} days)`)}</h3>
    {!row ? <p className="field-hint">{text('لسه محدش قيّم الطبق ده.', 'Nobody has rated this dish yet.')}</p> : <>
      <div className="rv-updown" aria-label={text(`عجب ${formatShare(row.upShare, 'ar')} وماعجبش ${formatShare(row.downShare, 'ar')} من ${number(row.count)} تقييم`, `${formatShare(row.upShare, 'en')} liked and ${formatShare(row.downShare, 'en')} disliked it, of ${row.count} ratings`)}>
        <span className="rv-updown-bar" aria-hidden="true"><span className="is-up" style={{ width: `${row.upShare * 100}%` }} /><span className="is-down" style={{ width: `${row.downShare * 100}%` }} /></span>
        <span className="rv-updown-text" aria-hidden="true">
          {scale === 'STARS' && <span><StarIcon size={13} weight="fill" />{formatAverage(row.average, language)}</span>}
          <span className="is-up"><ThumbsUpIcon size={13} weight="fill" />{formatShare(row.upShare, language)}</span>
          <span className="is-down"><ThumbsDownIcon size={13} weight="fill" />{formatShare(row.downShare, language)}</span>
          <span className="muted">{text(`${number(row.count)} تقييم`, `${row.count} ratings`)}</span>
        </span>
      </div>
      {row.recentComments.length > 0 && <details className="rv-dish-comments">
        <summary>{text(`آخر التعليقات (${number(row.recentComments.length)})`, `Latest comments (${row.recentComments.length})`)}</summary>
        <ul>{row.recentComments.map(comment => <li key={comment.reviewId}><p dir="auto"><bdi dir="auto">{comment.comment}</bdi></p></li>)}</ul>
      </details>}
    </>}
    <Link className="link-action" to={to('/reviews/insights')}>{text('كل أرقام التقييمات', 'All review insights')}</Link>
  </section>;
}
