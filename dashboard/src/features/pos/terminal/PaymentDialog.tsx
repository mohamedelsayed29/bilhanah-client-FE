import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircleIcon, CreditCardIcon, MoneyIcon, PrinterIcon, WalletIcon } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import type { OrderPaymentMethod, PosReceipt } from '@bilhanah/contracts';
import { Button } from '../../../components/Button';
import { Dialog } from '../../../components/Dialog';
import { useToast } from '../../../components/Toast';
import { posApi } from '../../../lib/api/endpoints';
import { errorMessage } from '../../../lib/api/error-messages';
import { egpToPiastres, formatPrice, piastresToInput } from '../../../lib/format';
import { useLanguage } from '../../../lib/language';
import { loadDevice, newKey } from '../device';
import { Receipt } from './Receipt';

const METHOD_INFO: Record<OrderPaymentMethod, { icon: Icon; label: [string, string] }> = {
  CASH: { icon: MoneyIcon, label: ['كاش', 'Cash'] },
  CARD: { icon: CreditCardIcon, label: ['كارت', 'Card'] },
  WALLET: { icon: WalletIcon, label: ['محفظة', 'Wallet'] },
  OTHER: { icon: CheckCircleIcon, label: ['أخرى', 'Other'] },
};

/**
 * Taking payment for an order: one or more payments by any of the POS's methods until nothing is
 * due, cash with the change worked out, a card's approval code (never card numbers), a declined card
 * recorded for the record. The server checks every amount. Then the receipt.
 */
export function PaymentDialog({ orderId, methods, onClose }: { orderId: string; methods: OrderPaymentMethod[]; onClose: () => void }) {
  const { text, language } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const payments = useQuery({ queryKey: ['pos', 'payments', orderId], queryFn: () => posApi.payments(orderId) });
  const [method, setMethod] = useState<OrderPaymentMethod>(methods[0] ?? 'CASH');
  const [amount, setAmount] = useState('');
  const [tendered, setTendered] = useState('');
  const [reference, setReference] = useState('');
  const [receipt, setReceipt] = useState<PosReceipt | null>(null);
  // One key per attempt: a retried click never pays twice.
  const key = useRef(newKey('pay'));
  const due = payments.data?.duePiastres ?? 0;
  useEffect(() => { if (payments.data) setAmount(piastresToInput(payments.data.duePiastres)); }, [payments.data?.duePiastres]);
  const amountPiastres = egpToPiastres(amount) ?? 0;
  const tenderedPiastres = tendered.trim() ? egpToPiastres(tendered) : null;
  const change = method === 'CASH' && tenderedPiastres !== null ? tenderedPiastres - amountPiastres : null;
  const valid = amountPiastres > 0 && amountPiastres <= due && (method !== 'CASH' || tenderedPiastres === null || tenderedPiastres >= amountPiastres);
  const money = (piastres: number) => `${formatPrice(piastres, language)} ${text('ج.م', 'EGP')}`;
  const pay = useMutation({
    mutationFn: (failed: boolean) => posApi.pay(orderId, {
      method, amountPiastres, ...(method === 'CASH' && tenderedPiastres ? { tenderedPiastres } : {}), ...(reference.trim() && { reference: reference.trim() }),
      ...(failed && { failed: true, failureReason: text('مرفوض', 'Declined') }),
    }, key.current, loadDevice()?.key),
    onSuccess: (next, failed) => {
      key.current = newKey('pay');
      queryClient.setQueryData(['pos', 'payments', orderId], next);
      void queryClient.invalidateQueries({ queryKey: ['pos', 'orders'] });
      setTendered(''); setReference('');
      if (failed) toast.error(text('اتسجل إن الكارت اترفض.', 'Recorded as declined.'));
      else if (next.settled) toast.success(text('الحساب اتقفل', 'Paid in full'));
    },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  const print = useMutation({
    mutationFn: () => posApi.receipt(orderId),
    onSuccess: data => { setReceipt(data); setTimeout(() => window.print(), 50); },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  const quick = [amountPiastres, ...[5000, 10000, 20000, 50000].filter(note => note > amountPiastres)].slice(0, 4);
  return <Dialog open onClose={onClose} size="wide" title={text('الدفع', 'Payment')} busy={pay.isPending}
    footer={<>
      <Button variant="secondary" icon={<PrinterIcon size={18} aria-hidden="true" />} loading={print.isPending} onClick={() => print.mutate()} data-testid="pos-print">{text('اطبع الإيصال', 'Print receipt')}</Button>
      <Button variant="secondary" onClick={onClose}>{payments.data?.settled ? text('تمام', 'Done') : text('بعدين', 'Later')}</Button>
    </>}>
    {payments.data && <div className="pt-pay">
      <div className="pt-pay-summary">
        <div><span>{text('الحساب', 'Bill')}</span><strong>{money(payments.data.totalPiastres)}</strong></div>
        <div><span>{text('اتدفع', 'Paid')}</span><strong>{money(payments.data.paidPiastres)}</strong></div>
        <div className={due ? 'is-due' : 'is-done'}><span>{text('المتبقي', 'Due')}</span><strong data-testid="pos-due">{money(due)}</strong></div>
      </div>
      {due > 0 ? <>
        <div className="pt-methods" role="radiogroup" aria-label={text('طريقة الدفع', 'Payment method')}>
          {methods.map(value => {
            const info = METHOD_INFO[value];
            return <button key={value} type="button" role="radio" aria-checked={method === value} className={`pt-method ${method === value ? 'active' : ''}`} onClick={() => setMethod(value)} data-testid={`pos-method-${value}`}>
              <info.icon size={24} weight="duotone" aria-hidden="true" /><span>{text(...info.label)}</span>
            </button>;
          })}
        </div>
        <div className="pt-pay-fields">
          <label><span>{text('المبلغ', 'Amount')}</span><input className="input ltr pt-big" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} data-testid="pos-amount" /></label>
          {method === 'CASH' ? <label><span>{text('الزبون دفع', 'Cash handed over')}</span><input className="input ltr pt-big" inputMode="decimal" value={tendered} onChange={event => setTendered(event.target.value)} placeholder={piastresToInput(amountPiastres)} data-testid="pos-tendered" /></label>
            : <label><span>{text('رقم العملية (اختياري)', 'Approval code (optional)')}</span><input className="input ltr" maxLength={40} value={reference} onChange={event => setReference(event.target.value)} autoComplete="off" /></label>}
        </div>
        {method === 'CASH' && <div className="pt-quick">{quick.map(note => <button key={note} type="button" onClick={() => setTendered(piastresToInput(note))}>{money(note)}</button>)}</div>}
        {change !== null && change >= 0 && <p className="pt-change" data-testid="pos-change">{text('الباقي للزبون', 'Change to give')}: <strong>{money(change)}</strong></p>}
        {amountPiastres > due && <p className="field-error">{text('أكبر من المتبقي.', 'More than is due.')}</p>}
        <div className="pt-pay-actions">
          {method !== 'CASH' && <Button variant="secondary" disabled={!valid || pay.isPending} onClick={() => pay.mutate(true)}>{text('الكارت اترفض', 'Card declined')}</Button>}
          <Button disabled={!valid} loading={pay.isPending} onClick={() => pay.mutate(false)} data-testid="pos-pay">{amountPiastres < due ? text('ادفع جزء', 'Pay part') : text('ادفع', 'Pay')} {money(amountPiastres)}</Button>
        </div>
      </> : <p className="pt-paid"><CheckCircleIcon size={28} weight="fill" aria-hidden="true" />{text('الحساب مدفوع بالكامل.', 'Paid in full.')}</p>}
      {payments.data.payments.length > 0 && <ul className="pt-pay-list">{payments.data.payments.map(payment => <li key={payment.id} className={payment.status === 'FAILED' ? 'is-failed' : ''}>
        <span>{text(...METHOD_INFO[payment.method].label)}{payment.reference && ` · ${payment.reference}`}{payment.status !== 'SUCCEEDED' && ` · ${payment.status === 'FAILED' ? text('مرفوض', 'declined') : text('مسترد', 'refunded')}`}</span>
        <strong>{money(payment.amountPiastres - payment.refundedPiastres)}</strong>
      </li>)}</ul>}
    </div>}
    {receipt && <Receipt receipt={receipt} />}
  </Dialog>;
}
