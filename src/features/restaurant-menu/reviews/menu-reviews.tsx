import { lazy, Suspense, useEffect, useState } from 'react';
import type { ComponentProps, MouseEvent } from 'react';
import { CaretLeftIcon, StarIcon, XIcon } from '@phosphor-icons/react';
import type { PublicReviewsInfo, PublicReviewsPage, PublicRestaurant } from '@bilhanah/contracts';
import { useLanguage } from '../../../lib/language';
import { branchesOf, branchOf } from '../branches';
import { dismissReview, isReviewDismissed, loadRecentOrders, loadReviewKey, REVIEWABLE_ORDER_TTL, type RecentOrder } from '../ordering/ordering-storage';
import { fetchPublicReviews, fetchReviewState } from './review-api';

// What the menu shows of reviews: the average in the header (opening the reviews), dish badges
// (RatingBadge.tsx), "Rate your last order", and "Share feedback". The sheets load on demand.

type AvailableRestaurant = Extract<PublicRestaurant, { availability: 'AVAILABLE' }>;

/** The restaurant's review settings for diners; null when there are none (or from an older API). */
export function reviewsInfo(restaurant: AvailableRestaurant): PublicReviewsInfo | null {
  const info = (restaurant as { reviews?: PublicReviewsInfo | null }).reviews;
  return info && typeof info === 'object' ? info : null;
}

function SheetUnavailable({ onClose }: { onClose: () => void }) {
  const { text } = useLanguage();
  return <p className="review-toast" role="alert">
    <span>{text('مقدرناش نفتح الصفحة دي. اتأكد من النت وجرّب تاني.', 'We could not open this. Check your connection and try again.')}</span>
    <button type="button" onClick={onClose} aria-label={text('إخفاء', 'Dismiss')}><XIcon size={16} /></button>
  </p>;
}

const ReviewsSheet = lazy(() => import('./ReviewsSheet').catch(() => ({ default: SheetUnavailable as unknown as typeof import('./ReviewsSheet').default })));
const FeedbackSheet = lazy(() => import('./FeedbackSheet').catch(() => ({ default: SheetUnavailable as unknown as typeof import('./FeedbackSheet').default })));

export function LazyReviewsSheet(props: ComponentProps<typeof ReviewsSheet>) {
  return <Suspense fallback={null}><ReviewsSheet {...props} /></Suspense>;
}

export function LazyFeedbackSheet(props: ComponentProps<typeof FeedbackSheet>) {
  return <Suspense fallback={null}><FeedbackSheet {...props} /></Suspense>;
}

/** The branch the reviews are about: the menu's branch when the restaurant has several, else the whole restaurant. */
export function reviewsBranch(restaurant: AvailableRestaurant): { slug: string; name: string } | null {
  const branch = branchOf(restaurant);
  return branch && branchesOf(restaurant).length > 1 ? { slug: branch.slug, name: branch.name } : null;
}

/** The first page of published reviews (its summary goes in the header), when the restaurant shows them. */
export function useReviewSummary(restaurant: AvailableRestaurant): PublicReviewsPage | null {
  const shown = reviewsInfo(restaurant)?.page === true;
  const branch = reviewsBranch(restaurant)?.slug ?? null;
  const [page, setPage] = useState<PublicReviewsPage | null>(null);
  useEffect(() => {
    if (!shown) return;
    const controller = new AbortController();
    // After the menu has painted: the summary never delays it.
    const timer = window.setTimeout(() => {
      fetchPublicReviews(restaurant.subdomain, { branch, pageSize: 10 }, controller.signal)
        .then(next => { if (next && typeof next.summary === 'object' && Array.isArray(next.items)) setPage(next); })
        .catch(() => undefined);
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [restaurant.subdomain, branch, shown]);
  return page;
}

/** "★ 4.1 · 20 reviews" in the header, opening the reviews. */
export function MenuRatingButton({ page, onOpen }: { page: PublicReviewsPage; onOpen: () => void }) {
  const { language, text, number } = useLanguage();
  const { average, count } = page.summary;
  if (!count || average === null) return null;
  const value = new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(average);
  const reviews = text(count === 1 ? 'تقييم واحد' : count === 2 ? 'تقييمين' : count <= 10 ? `${number(count)} تقييمات` : `${number(count)} تقييم`, `${count} ${count === 1 ? 'review' : 'reviews'}`);
  return <button type="button" className="menu-rating" onClick={onOpen} aria-haspopup="dialog" data-testid="menu-rating"
    aria-label={text(`التقييم ${value} من ٥، ${reviews}. اقرا الآراء`, `Rated ${value} out of 5 from ${reviews}. Read the reviews`)}>
    <StarIcon size={16} weight="fill" aria-hidden="true" /><strong aria-hidden="true">{value}</strong><span aria-hidden="true">· {reviews}</span>
  </button>;
}

/**
 * "How was order #12?" on the menu: the diner's latest order here (within a week) that can still be
 * reviewed and was not reviewed or put off from this browser. One request, for that order only.
 */
export function ReviewPrompt({ restaurant, navigate }: { restaurant: AvailableRestaurant; navigate?: (path: string, state?: unknown) => void }) {
  const { text, digits } = useLanguage();
  const asks = reviewsInfo(restaurant) !== null;
  const [order, setOrder] = useState<RecentOrder | null>(null);
  useEffect(() => {
    if (!asks) return;
    const latest = loadRecentOrders(restaurant.subdomain, REVIEWABLE_ORDER_TTL)
      .find(recent => !isReviewDismissed(recent.trackingToken) && !loadReviewKey(recent.trackingToken)?.sent);
    if (!latest) return;
    const controller = new AbortController();
    fetchReviewState(latest.trackingToken, controller.signal)
      .then(state => { if (state?.eligibility === 'OPEN') setOrder(latest); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [asks, restaurant.subdomain]);
  if (!order) return null;
  const path = `/order/${encodeURIComponent(order.trackingToken)}`;
  const open = (event: MouseEvent) => {
    if (!navigate) return;
    event.preventDefault();
    navigate(path, { token: order.trackingToken, review: true });
  };
  return <div className="review-prompt" data-testid="review-prompt">
    <a href={path} onClick={open}>
      <StarIcon size={20} weight="fill" aria-hidden="true" />
      <span>{text(`طلب رقم ${digits(order.number)} كان عامل إيه؟`, `How was order #${order.number}?`)}<small>{text('قيّم آخر طلب ليك', 'Rate your last order')}</small></span>
      <CaretLeftIcon size={16} className="directional-arrow" aria-hidden="true" />
    </a>
    <button type="button" onClick={() => { dismissReview(order.trackingToken); setOrder(null); }} aria-label={text('مش دلوقتي', 'Not now')}><XIcon size={16} /></button>
  </div>;
}
