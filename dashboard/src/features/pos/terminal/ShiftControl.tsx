import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LockSimpleIcon, LockSimpleOpenIcon } from '@phosphor-icons/react';
import { Alert } from '../../../components/Alert';
import { Button } from '../../../components/Button';
import { Dialog } from '../../../components/Dialog';
import { Field } from '../../../components/Field';
import { useToast } from '../../../components/Toast';
import { cashApi } from '../../../lib/api/endpoints';
import { errorMessage } from '../../../lib/api/error-messages';
import { formatPrice } from '../../../lib/format';
import { useLanguage } from '../../../lib/language';
import { cashKeys, parseMoney } from '../../cash/shared';

/**
 * The cashier's own shift, from the POS bar: open it with the starting cash, close it with the count.
 * POS accounts have no other way to reach the cash drawer, so the terminal carries it.
 */
export function ShiftControl() {
  const { text, language } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: cashKeys.me, queryFn: cashApi.me, refetchInterval: 60_000 });
  const [dialog, setDialog] = useState<'open' | 'close' | null>(null);
  const [amount, setAmount] = useState('');
  const [registerId, setRegisterId] = useState<string>('');
  const [error, setError] = useState<unknown>(null);
  const shift = me.data?.shift ?? null;
  const registers = (me.data?.registers ?? []).filter(register => register.isActive !== false);
  const money = (piastres: number) => formatPrice(piastres, language);
  const done = () => { setDialog(null); setAmount(''); setError(null); void queryClient.invalidateQueries({ queryKey: cashKeys.all }); };
  const open = useMutation({
    mutationFn: () => cashApi.open({ openingPiastres: parseMoney(amount) ?? 0, registerId: registerId || null }),
    onSuccess: () => { toast.success(text('الوردية اتفتحت', 'Shift opened')); done(); },
    onError: setError,
  });
  const close = useMutation({
    mutationFn: () => cashApi.close(shift!.id, { countedPiastres: parseMoney(amount) ?? 0, version: shift!.version }),
    onSuccess: () => { toast.success(text('الوردية اتقفلت', 'Shift closed')); done(); },
    onError: setError,
  });
  if (me.isPending || me.isError) return null;
  const valid = parseMoney(amount) !== null && (dialog !== 'open' || registers.length === 0 || registerId !== '');
  return <>
    {shift
      ? <button type="button" className="pt-shift is-open" onClick={() => { setAmount(''); setError(null); setDialog('close'); }} title={text('قفل الوردية', 'Close the shift')}>
        <LockSimpleOpenIcon size={18} aria-hidden="true" /><span>{text('الوردية مفتوحة', 'Shift open')}</span>
      </button>
      : <button type="button" className="pt-shift" onClick={() => { setAmount(''); setRegisterId(registers[0]?.id ?? ''); setError(null); setDialog('open'); }}>
        <LockSimpleIcon size={18} aria-hidden="true" /><span>{text('افتح الوردية', 'Open shift')}</span>
      </button>}
    <Dialog open={dialog !== null} onClose={() => setDialog(null)} size="small" busy={open.isPending || close.isPending}
      title={dialog === 'close' ? text('قفل الوردية', 'Close the shift') : text('افتح الوردية', 'Open the shift')}
      onSubmit={() => { if (valid) (dialog === 'close' ? close : open).mutate(); }}
      footer={<>
        <Button variant="secondary" onClick={() => setDialog(null)}>{text('إلغاء', 'Cancel')}</Button>
        <Button type="submit" disabled={!valid} loading={open.isPending || close.isPending}>{dialog === 'close' ? text('اقفل', 'Close shift') : text('افتح', 'Open shift')}</Button>
      </>}>
      <div className="form">
        {error !== null && <Alert kind="error">{errorMessage(error, text)}</Alert>}
        {dialog === 'open' && registers.length > 0 && <Field label={text('الدرج', 'Register')} required>
          <select className="input" value={registerId} onChange={event => setRegisterId(event.target.value)}>
            {registers.map(register => <option key={register.id} value={register.id}>{register.name}</option>)}
          </select>
        </Field>}
        <Field label={dialog === 'close' ? text('الكاش اللي في الدرج دلوقتي', 'Cash in the drawer now') : text('الكاش اللي بتبدأ بيه', 'Starting cash')}
          hint={dialog === 'close' && shift ? text(`فتحت بـ ${money(shift.openingPiastres)}. عدّ الفلوس واكتب المبلغ، والفرق بيتسجّل للمدير.`, `Opened with ${money(shift.openingPiastres)}. Count the money; any difference is recorded for the manager.`) : text('بالجنيه.', 'In EGP.')}>
          <input className="input ltr-input" dir="ltr" inputMode="decimal" data-autofocus value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" />
        </Field>
      </div>
    </Dialog>
  </>;
}
