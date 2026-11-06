import { StarIcon, ThumbsUpIcon } from '@phosphor-icons/react';
import type { DishRatingScale, MenuItemRating } from '@bilhanah/contracts';
import { useLanguage } from '../../../lib/language';

/**
 * A dish's rating from diners: "★ 4.3 · 11" on the stars scale, "👍 82% · 11" on the thumbs scale.
 * Nothing without a rating (the API sends null below the restaurant's minimum count).
 */
export function RatingBadge({ rating, scale, className = '' }: { rating: MenuItemRating | null | undefined; scale: DishRatingScale; className?: string }) {
  const { text, number } = useLanguage();
  if (!rating || !(rating.count > 0)) return null;
  const average = new Intl.NumberFormat(text('ar-EG', 'en-US'), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(rating.average);
  const share = Math.round(rating.positiveShare * 100);
  const percent = new Intl.NumberFormat(text('ar-EG', 'en-US'), { style: 'percent' }).format(share / 100);
  const label = scale === 'THUMBS'
    ? text(`${percent} عجبهم من ${number(rating.count)} تقييم`, `${percent} liked it, ${rating.count} ${rating.count === 1 ? 'rating' : 'ratings'}`)
    : text(`تقييمه ${average} من ٥، ${number(rating.count)} تقييم`, `Rated ${average} out of 5, ${rating.count} ${rating.count === 1 ? 'rating' : 'ratings'}`);
  return <span className={`dish-rating ${className}`} data-testid="dish-rating">
    <span className="visually-hidden">{label}</span>
    <span className="dish-rating-value" aria-hidden="true">
      {scale === 'THUMBS' ? <ThumbsUpIcon size={14} weight="fill" /> : <StarIcon size={14} weight="fill" />}
      <span>{scale === 'THUMBS' ? percent : average}</span>
      <span className="dish-rating-count">· {number(rating.count)}</span>
    </span>
  </span>;
}
