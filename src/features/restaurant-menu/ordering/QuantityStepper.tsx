import { MinusIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react';
import { useLanguage } from '../../../lib/language';
import { CART_LIMITS } from './use-cart';

/** − n + for a quantity. With `onRemove`, the minus at 1 becomes a remove button. */
export function QuantityStepper({ value, onChange, onRemove, labelledBy, label }: { value: number; onChange: (value: number) => void; onRemove?: () => void; labelledBy?: string; label?: string }) {
  const { text, number } = useLanguage();
  const removes = !!onRemove && value <= 1;
  return <div className="stepper" role="group" aria-labelledby={labelledBy} aria-label={label}>
    <button type="button" onClick={() => removes ? onRemove() : onChange(value - 1)} disabled={!removes && value <= 1}
      aria-label={removes ? text('شيل من الطلب', 'Remove from order') : text('قلّل الكمية', 'Decrease quantity')}>
      {removes ? <TrashIcon size={17} /> : <MinusIcon size={17} weight="bold" />}
    </button>
    <output aria-live="polite">{number(value)}</output>
    <button type="button" onClick={() => onChange(value + 1)} disabled={value >= CART_LIMITS.quantity} aria-label={text('زوّد الكمية', 'Increase quantity')}>
      <PlusIcon size={17} weight="bold" />
    </button>
  </div>;
}
