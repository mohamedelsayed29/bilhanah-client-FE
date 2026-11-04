import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RESERVATION_LIMITS, type Reservation, type ReservationStatus, type RestaurantTable } from '@bilhanah/contracts';
import { Alert } from '../../../components/Alert';
import { Button } from '../../../components/Button';
import { Dialog } from '../../../components/Dialog';
import { Field } from '../../../components/Field';
import { useToast } from '../../../components/Toast';
import { reservationsApi } from '../../../lib/api/endpoints';
import { errorMessage } from '../../../lib/api/error-messages';
import { normalizeDigits } from '../../../lib/format';
import { useLanguage } from '../../../lib/language';
import { queryKeys } from '../queries';

export const RESERVATION_STATUS_OPTIONS: { value: ReservationStatus; ar: string; en: string }[] = [
  { value: 'PENDING', ar: 'بانتظار التأكيد', en: 'Pending' },
  { value: 'CONFIRMED', ar: 'مؤكد', en: 'Confirmed' },
  { value: 'SEATED', ar: 'وصلوا', en: 'Seated' },
  { value: 'COMPLETED', ar: 'خلص', en: 'Completed' },
  { value: 'CANCELLED', ar: 'اتلغى', en: 'Cancelled' },
  { value: 'NO_SHOW', ar: 'محضروش', en: 'No-show' },
];
export const reservationStatusOption = (status: ReservationStatus) => RESERVATION_STATUS_OPTIONS.find(option => option.value === status)!;

/** "2026-11-03" in the browser's time zone (the restaurant's, for its staff). */
export const localDay = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
/** What the form sends: the same for a new booking and an edit. */
type Body = { customerName: string; customerPhone: string; guests: number; reservedAt: string; tableId: string | null; notes: string; status: ReservationStatus };

const localTime = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

/** Takes a booking, or edits one: who, how many, when, which table, notes and (when editing) its status. */
export function ReservationDialog({ branchId, open, reservation, day, tables, tableId = null, onClose }: {
  branchId: string;
  open: boolean;
  /** The booking being edited; null for a new one. */
  reservation: Reservation | null;
  /** The day shown in the list: a new booking starts on it. */
  day: string;
  tables: RestaurantTable[];
  /** A new booking for this table (from its details). */
  tableId?: string | null;
  onClose: () => void;
}) {
  const { text } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [guests, setGuests] = useState('2');
  const [date, setDate] = useState(day);
  const [time, setTime] = useState('20:00');
  const [table, setTable] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<ReservationStatus>('CONFIRMED');
  const [problem, setProblem] = useState<{ field: 'name' | 'guests' | 'when'; message: string } | null>(null);
  useEffect(() => {
    if (!open) return;
    const at = reservation ? new Date(reservation.reservedAt) : null;
    setName(reservation?.customerName ?? '');
    setPhone(reservation?.customerPhone ?? '');
    setGuests(String(reservation?.guests ?? 2));
    setDate(at ? localDay(at) : day);
    setTime(at ? localTime(at) : '20:00');
    setTable(reservation ? reservation.tableId ?? '' : tableId ?? '');
    setNotes(reservation?.notes ?? '');
    setStatus(reservation?.status ?? 'CONFIRMED');
    setProblem(null);
  }, [open, reservation, day, tableId]);

  const save = useMutation({
    mutationFn: (body: Body) => (reservation ? reservationsApi.update(reservation.id, body) : reservationsApi.create({ ...body, branchId })),
    onSuccess: saved => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.reservations });
      void queryClient.invalidateQueries({ queryKey: queryKeys.floors });
      toast.success(reservation ? text('اتحفظ الحجز', 'Reservation saved') : text(`اتسجل حجز ${saved.customerName}`, `Booked ${saved.customerName}`));
      onClose();
    },
  });

  const submit = () => {
    const count = Number.parseInt(normalizeDigits(guests), 10);
    const at = new Date(`${date}T${time}`);
    if (!name.trim()) { setProblem({ field: 'name', message: text('اكتب اسم الزبون.', 'Enter the guest’s name.') }); return; }
    if (!Number.isInteger(count) || count < 1 || count > RESERVATION_LIMITS.guests) {
      setProblem({ field: 'guests', message: text(`من ١ لـ ${RESERVATION_LIMITS.guests}.`, `1 to ${RESERVATION_LIMITS.guests}.`) });
      return;
    }
    if (!date || !time || Number.isNaN(at.getTime())) { setProblem({ field: 'when', message: text('اختار اليوم والساعة.', 'Choose a day and time.') }); return; }
    save.mutate({ customerName: name.trim(), customerPhone: phone.trim(), guests: count, reservedAt: at.toISOString(), tableId: table || null, notes: notes.trim(), status });
  };

  const seatsOf = (entry: RestaurantTable) => text(`${entry.label} (${entry.seats} أفراد)`, `${entry.label} (${entry.seats} seats)`);
  return <Dialog open={open} onClose={onClose} busy={save.isPending} onSubmit={submit}
    title={reservation ? text(`حجز ${reservation.customerName}`, `${reservation.customerName}’s reservation`) : text('حجز جديد', 'New reservation')}
    footer={<>
      <Button variant="secondary" onClick={onClose} disabled={save.isPending}>{text('إلغاء', 'Cancel')}</Button>
      <Button type="submit" loading={save.isPending}>{reservation ? text('احفظ', 'Save') : text('سجّل الحجز', 'Book')}</Button>
    </>}>
    <div className="form">
      {save.isError && <Alert kind="error">{errorMessage(save.error, text)}</Alert>}
      <div className="form-grid">
        <Field label={text('اسم الزبون', 'Guest name')} error={problem?.field === 'name' ? { message: problem.message } : undefined}>
          <input className="input" data-autofocus maxLength={80} value={name} onChange={event => { setName(event.target.value); setProblem(null); }} />
        </Field>
        <Field label={text('الموبايل', 'Phone')} optional>
          <input className="input" type="tel" dir="ltr" inputMode="tel" maxLength={20} value={phone} onChange={event => setPhone(event.target.value)} />
        </Field>
      </div>
      <div className="form-grid reservation-when">
        <Field label={text('اليوم', 'Day')} error={problem?.field === 'when' ? { message: problem.message } : undefined}>
          <input className="input" type="date" dir="ltr" value={date} onChange={event => { setDate(event.target.value); setProblem(null); }} />
        </Field>
        <Field label={text('الساعة', 'Time')}>
          <input className="input" type="time" dir="ltr" value={time} onChange={event => { setTime(event.target.value); setProblem(null); }} />
        </Field>
        <Field label={text('عدد الأفراد', 'Guests')} error={problem?.field === 'guests' ? { message: problem.message } : undefined}>
          <input className="input" inputMode="numeric" dir="ltr" maxLength={2} value={guests} onChange={event => { setGuests(event.target.value); setProblem(null); }} />
        </Field>
      </div>
      <Field label={text('الترابيزة', 'Table')} optional hint={text('الترابيزة بتبان محجوزة من قبل الميعاد بساعتين.', 'The table shows as reserved from two hours before.')}>
        {control => <select {...control} className="select" value={table} onChange={event => setTable(event.target.value)}>
          <option value="">{text('من غير ترابيزة لسه', 'No table yet')}</option>
          {tables.filter(entry => entry.isActive || entry.id === table).map(entry => <option key={entry.id} value={entry.id}>{seatsOf(entry)}</option>)}
        </select>}
      </Field>
      {reservation && <Field label={text('الحالة', 'Status')}>
        {control => <select {...control} className="select" value={status} onChange={event => setStatus(event.target.value as ReservationStatus)}>
          {RESERVATION_STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{text(option.ar, option.en)}</option>)}
        </select>}
      </Field>}
      <Field label={text('ملاحظات', 'Notes')} optional>
        <input className="input" maxLength={300} value={notes} onChange={event => setNotes(event.target.value)} />
      </Field>
    </div>
  </Dialog>;
}
