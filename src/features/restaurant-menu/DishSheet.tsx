import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { XIcon } from '@phosphor-icons/react';
import { menuDescription, menuName, type DishRatingScale, type PublicMenuItem } from '@bilhanah/contracts';
import { useLanguage } from '../../lib/language';
import { formatPrice, hasCalories, imageAttributes, variantFacts, variantLabel } from './menu-format';
import { RatingBadge } from './reviews/RatingBadge';

/** A size's calories, portion and servings on one quiet line ("520 kcal · 350 g · Serves 1"). */
export function SizeFacts({ facts, className = 'size-facts' }: { facts: string[]; className?: string }) {
  if (facts.length === 0) return null;
  return <span className={className} data-testid="size-facts">{facts.join(' · ')}</span>;
}

/** Said once under the sizes when any of them states calories. */
export function CaloriesNote({ item }: { item: PublicMenuItem }) {
  const { text } = useLanguage();
  return hasCalories(item) ? <p className="calories-note">{text('السعرات الحرارية تقريبية.', 'Calories are approximate.')}</p> : null;
}

/** A dish's photo, full description and sizes, as a bottom sheet on phones and a dialog on wider screens. */
export function DishSheet({ item, onClose, addForm, extras, ratingScale = 'THUMBS' }: { item: PublicMenuItem; onClose: () => void; addForm?: (close: () => void) => ReactNode; extras?: ReactNode; ratingScale?: DishRatingScale }) {
  const { language, menuLanguage, text } = useLanguage();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    // No cleanup: unmounting removes the dialog, and calling close() would fire
    // onClose, which in StrictMode's double effect would dismiss the sheet.
    if (dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }, []);

  const name = menuName(item, menuLanguage);
  const description = menuDescription(item, menuLanguage);
  const orderable = !!addForm && item.isAvailable;
  // One size: its facts sit with the description. Several: each size shows its own, by its price.
  const single = item.variants.length === 1;
  const singleFacts = single ? variantFacts(item.variants[0]!, language) : [];
  return <dialog
    ref={dialogRef}
    className="dish-sheet"
    aria-labelledby="dish-sheet-title"
    onClose={onClose}
    // A click on the backdrop lands on the dialog element itself.
    onClick={event => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}
  >
    <div className="dish-sheet-body">
      <button type="button" className="dish-sheet-close" onClick={() => dialogRef.current?.close()} aria-label={text('إغلاق', 'Close')}><XIcon size={20} /></button>
      {item.image && <img className="dish-sheet-image" {...imageAttributes(item.image, '(min-width: 640px) 560px, 100vw')} alt={name} />}
      <div className="dish-sheet-text">
        <h2 id="dish-sheet-title"><bdi>{name}</bdi></h2>
        <RatingBadge rating={item.rating} scale={ratingScale} className="in-sheet" />
        {!item.isAvailable && <span className="sold-out-badge">{text('خلصت النهارده', 'Sold out today')}</span>}
        {description && <p><bdi>{description}</bdi></p>}
        {singleFacts.length > 0 && <p className="dish-facts"><SizeFacts facts={singleFacts} className="dish-facts-line" />{hasCalories(item) && <small>{text('السعرات الحرارية تقريبية.', 'Calories are approximate.')}</small>}</p>}
        {!orderable && <ul className="dish-sheet-prices">
          {item.variants.map(variant => <li key={variant.id}>
            <span className="dish-sheet-size"><bdi>{variantLabel(variant, menuLanguage) ?? text('السعر', 'Price')}</bdi>{!single && <SizeFacts facts={variantFacts(variant, language)} />}</span>
            <strong>{formatPrice(variant.pricePiastres, language)} <small>{text('ج.م', 'EGP')}</small></strong>
          </li>)}
        </ul>}
        {!orderable && !single && <CaloriesNote item={item} />}
        {/* Alternatives: other dishes to try, shown even when this one is sold out. */}
        {extras}
      </div>
      {orderable && addForm(() => dialogRef.current?.close())}
    </div>
  </dialog>;
}

