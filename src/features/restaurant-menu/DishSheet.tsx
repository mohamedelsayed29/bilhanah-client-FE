import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { XIcon } from '@phosphor-icons/react';
import type { PublicMenuItem } from '@bilhanah/contracts';
import { useLanguage } from '../../lib/language';
import { formatPrice, imageAttributes, localized, variantLabel } from './menu-format';

/** A dish's photo, full description and sizes, as a bottom sheet on phones and a dialog on wider screens. */
export function DishSheet({ item, onClose, addForm, extras }: { item: PublicMenuItem; onClose: () => void; addForm?: (close: () => void) => ReactNode; extras?: ReactNode }) {
  const { language, text } = useLanguage();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    // No cleanup: unmounting removes the dialog, and calling close() would fire
    // onClose, which in StrictMode's double effect would dismiss the sheet.
    if (dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }, []);

  const name = localized(language, item.nameAr, item.nameEn);
  const description = localized(language, item.descriptionAr, item.descriptionEn);
  const orderable = !!addForm && item.isAvailable;
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
        <h2 id="dish-sheet-title">{name}</h2>
        {!item.isAvailable && <span className="sold-out-badge">{text('خلصت النهارده', 'Sold out today')}</span>}
        {description && <p>{description}</p>}
        {!orderable && <ul className="dish-sheet-prices">
          {item.variants.map(variant => <li key={variant.id}>
            <span>{variantLabel(variant, language) ?? text('السعر', 'Price')}</span>
            <strong>{formatPrice(variant.pricePiastres, language)} <small>{text('ج.م', 'EGP')}</small></strong>
          </li>)}
        </ul>}
        {/* Alternatives: other dishes to try, shown even when this one is sold out. */}
        {extras}
      </div>
      {orderable && addForm(() => dialogRef.current?.close())}
    </div>
  </dialog>;
}

