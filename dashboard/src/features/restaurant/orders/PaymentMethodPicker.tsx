import { useId } from 'react';
import { ORDER_PAYMENT_METHOD_LABELS, ORDER_PAYMENT_METHODS, type OrderPaymentMethod } from '@bilhanah/contracts';
import { useLanguage } from '../../../lib/language';

/** How the guests paid. Only cash goes into the cashier's drawer. */
export function PaymentMethodPicker({ value, onChange, disabled }: { value: OrderPaymentMethod; onChange: (method: OrderPaymentMethod) => void; disabled?: boolean }) {
  const { text } = useLanguage();
  const name = useId();
  return <div className="payment-method-picker">
    <span className="payment-method-label" id={`${name}-label`}>{text('طريقة الدفع', 'Paid by')}</span>
    <div className="segmented" role="radiogroup" aria-labelledby={`${name}-label`}>
      {ORDER_PAYMENT_METHODS.map(method => <label key={method}>
        <input type="radio" name={name} value={method} checked={value === method} disabled={disabled} onChange={() => onChange(method)} />
        {text(...ORDER_PAYMENT_METHOD_LABELS[method])}
      </label>)}
    </div>
  </div>;
}
