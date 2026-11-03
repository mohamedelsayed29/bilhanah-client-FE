import { useId, useState } from 'react';
import type { PublicMenuItem } from '@bilhanah/contracts';
import { useLanguage } from '../../../lib/language';
import { formatPrice, variantLabel } from '../menu-format';
import { QuantityStepper } from './QuantityStepper';
import { CART_LIMITS } from './use-cart';
import type { Suggestion } from '../../recommendations/recommend';
import { ExtrasPicker, missingRequired, pickedExtras, type ExtrasSelection, type PickedExtra } from '../../recommendations/Suggestions';
import type { Tracker } from '../../recommendations/tracker';

type AddToOrder = (variantId: string, quantity: number, note: string, extras: PickedExtra[]) => void;

/**
 * Size, quantity and a note for the kitchen, the dish's add-ons and "often ordered with it"
 * suggestions, then "Add to order" with the running price (extras included).
 */
export function AddToOrderForm({ item, onAdd, extras = [], tracker }: { item: PublicMenuItem; onAdd: AddToOrder; extras?: Suggestion[]; tracker?: Tracker }) {
  const { language, text } = useLanguage();
  const [variantId, setVariantId] = useState(item.variants[0]!.id);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const id = useId();
  const variant = item.variants.find(candidate => candidate.id === variantId) ?? item.variants[0]!;
  const currency = text('ج.م', 'EGP');
  const [selection, setSelection] = useState<ExtrasSelection>({});
  const [tried, setTried] = useState(false);
  const picked = pickedExtras(extras, selection);
  const extrasTotal = picked.reduce((sum, entry) => sum + (entry.suggestion.item.variants.find(candidate => candidate.id === entry.variantId)?.pricePiastres ?? 0) * entry.quantity, 0);
  const missing = missingRequired(extras, selection);

  return <form className="add-form" onSubmit={event => {
    event.preventDefault();
    // A required add-on must be picked first; the button says so instead of failing silently.
    if (missing.length) { setTried(true); return; }
    onAdd(variant.id, quantity, note, picked);
  }}>
    <div className="add-form-fields">
      {item.variants.length > 1 ? <fieldset className="size-picker">
        <legend>{text('اختار الحجم', 'Choose a size')}</legend>
        {item.variants.map(option => <label key={option.id} className="size-option">
          <input type="radio" name={`${id}-size`} value={option.id} checked={option.id === variantId} onChange={() => setVariantId(option.id)} />
          <span className="size-name">{variantLabel(option, language) ?? text('عادي', 'Regular')}</span>
          <span className="size-price">{formatPrice(option.pricePiastres, language)} <small>{currency}</small></span>
        </label>)}
      </fieldset> : <p className="single-price"><span>{text('السعر', 'Price')}</span><strong>{formatPrice(variant.pricePiastres, language)} <small>{currency}</small></strong></p>}

      <div className="add-form-row">
        <span className="add-form-label" id={`${id}-quantity`}>{text('الكمية', 'Quantity')}</span>
        <QuantityStepper value={quantity} onChange={setQuantity} labelledBy={`${id}-quantity`} />
      </div>

      {tracker && extras.length > 0 && <ExtrasPicker suggestions={extras} selection={selection} onChange={setSelection} tracker={tracker} showMissing={tried} />}

      <label className="note-field">
        <span>{text('ملاحظة للمطبخ', 'Note for the kitchen')} <small>{text('(اختياري)', '(optional)')}</small></span>
        <textarea rows={2} maxLength={CART_LIMITS.note} value={note} onChange={event => setNote(event.target.value)} placeholder={text('مثلًا: من غير بصل', 'e.g. no onions')} />
      </label>
    </div>
    <div className="add-form-footer">
      {tried && missing.length > 0 && <p className="extras-missing" role="alert">{text('اختار الإضافة المطلوبة الأول.', 'Pick the required add-on first.')}</p>}
      <button type="submit" className="order-button">
        <span>{text('أضف للطلب', 'Add to order')}</span>
        <span className="order-button-price">{formatPrice(variant.pricePiastres * quantity + extrasTotal, language)} {currency}</span>
      </button>
    </div>
  </form>;
}
