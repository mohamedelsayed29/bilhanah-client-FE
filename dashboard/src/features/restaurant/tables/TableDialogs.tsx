import { useEffect, useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { HouseLineIcon, MinusIcon, PlusIcon, TreeIcon } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { ORDER_ERROR_CODES, ORDER_LIMITS, type RestaurantTable, TABLE_SEATS, type TableArea, type TableAttribute, type TableLocation, type TableShape } from '@bilhanah/contracts';
import { Alert } from '../../../components/Alert';
import { Button } from '../../../components/Button';
import { Dialog } from '../../../components/Dialog';
import { Field } from '../../../components/Field';
import { useToast } from '../../../components/Toast';
import { isApiError } from '../../../lib/api';
import { tablesApi } from '../../../lib/api/endpoints';
import { errorMessage } from '../../../lib/api/error-messages';
import { egpToPiastres, normalizeDigits, piastresToInput } from '../../../lib/format';
import { useLanguage } from '../../../lib/language';
import { queryKeys } from '../queries';
import { rangeLabel } from './qr-download';
import { TableGraphic, TableShapeIcon } from './TableGraphic';

export const TABLE_SHAPE_OPTIONS = [
  { value: 'ROUND', ar: 'مدورة', en: 'Round' },
  { value: 'SQUARE', ar: 'مربعة', en: 'Square' },
  { value: 'RECTANGLE', ar: 'مستطيلة', en: 'Rectangle' },
] as const satisfies readonly { value: TableShape; ar: string; en: string }[];

/** Where a table stands: inside the restaurant, or outside (a terrace, the street). */
export const TABLE_LOCATION_OPTIONS = [
  { value: 'INDOOR', ar: 'داخلي', en: 'Indoor', icon: HouseLineIcon },
  { value: 'OUTDOOR', ar: 'خارجي', en: 'Outdoor', icon: TreeIcon },
] as const satisfies readonly { value: TableLocation; ar: string; en: string; icon: Icon }[];
/** What a table offers, as shown on its details. */
export const TABLE_ATTRIBUTE_OPTIONS = [
  { value: 'WINDOW', ar: 'جنب الشباك', en: 'By the window' },
  { value: 'SOFA', ar: 'كنبة', en: 'Sofa seating' },
  { value: 'VIP', ar: 'VIP', en: 'VIP' },
  { value: 'ACCESSIBLE', ar: 'مناسبة للكراسي المتحركة', en: 'Wheelchair accessible' },
  { value: 'POWER_OUTLET', ar: 'فيها فيشة', en: 'Power outlet' },
  { value: 'QUIET', ar: 'هادية', en: 'Quiet corner' },
  { value: 'SMOKING', ar: 'للتدخين', en: 'Smoking' },
] as const satisfies readonly { value: TableAttribute; ar: string; en: string }[];

export const tableLocationOption = (location: TableLocation) => TABLE_LOCATION_OPTIONS.find(option => option.value === location) ?? TABLE_LOCATION_OPTIONS[0];

type TableLayout = { shape: TableShape; seats: number; location: TableLocation; areaId: string | null };
const DEFAULT_LAYOUT: TableLayout = { shape: 'SQUARE', seats: TABLE_SEATS.default, location: 'INDOOR', areaId: null };
/** A new table's starting layout: in `areaId` (and so in its location) when adding from an area. */
const startLayout = (areas: TableArea[], areaId: string | null = null): TableLayout => {
  const area = areas.find(entry => entry.id === areaId);
  return area ? { ...DEFAULT_LAYOUT, areaId: area.id, location: area.location } : DEFAULT_LAYOUT;
};
const clampSeats = (value: number) => Math.min(TABLE_SEATS.max, Math.max(TABLE_SEATS.min, value));

/**
 * The table's area and where it stands, its shape and how many guests it seats, with a drawing of
 * how it shows on the floor. A table in an area stands where the area does.
 */
function TableLayoutFields({ value, onChange, label, areas }: { value: TableLayout; onChange: (layout: TableLayout) => void; label: string; areas: TableArea[] }) {
  const { text, number, count } = useLanguage();
  const name = useId();
  const locationName = useId();
  const area = areas.find(entry => entry.id === value.areaId);
  const pickArea = (areaId: string) => {
    const picked = areas.find(entry => entry.id === areaId);
    onChange({ ...value, areaId: picked?.id ?? null, location: picked?.location ?? value.location });
  };
  const [draft, setDraft] = useState(String(value.seats));
  useEffect(() => setDraft(String(value.seats)), [value.seats]);
  const setSeats = (seats: number) => onChange({ ...value, seats: clampSeats(seats) });
  const commitDraft = () => {
    const seats = Number.parseInt(normalizeDigits(draft), 10);
    if (Number.isInteger(seats)) setSeats(seats); else setDraft(String(value.seats));
  };
  return <div className="table-layout-fields">
    {areas.length > 0 && <Field label={text('المنطقة', 'Area')} hint={area ? text('مكان الترابيزة بييجي من المنطقة.', 'The table stands where its area is.') : undefined}>
      {control => <select {...control} className="select" value={value.areaId ?? ''} onChange={event => pickArea(event.target.value)}>
        <option value="">{text('بدون منطقة', 'No area')}</option>
        {areas.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
      </select>}
    </Field>}
    <fieldset className="field" disabled={area !== undefined}>
      <legend className="field-label">{text('مكان الترابيزة', 'Table location')}</legend>
      <div className="segmented">
        {TABLE_LOCATION_OPTIONS.map(option => <label key={option.value}>
          <input type="radio" name={locationName} value={option.value} checked={value.location === option.value} onChange={() => onChange({ ...value, location: option.value })} />
          <option.icon size={18} aria-hidden="true" />{text(option.ar, option.en)}
        </label>)}
      </div>
    </fieldset>
    <fieldset className="field">
      <legend className="field-label">{text('شكل الترابيزة', 'Table shape')}</legend>
      <div className="segmented">
        {TABLE_SHAPE_OPTIONS.map(option => <label key={option.value}>
          <input type="radio" name={name} value={option.value} checked={value.shape === option.value} onChange={() => onChange({ ...value, shape: option.value })} />
          <TableShapeIcon shape={option.value} />{text(option.ar, option.en)}
        </label>)}
      </div>
    </fieldset>
    <Field label={text('عدد الأفراد', 'Seats')} hint={text(`من ${number(TABLE_SEATS.min)} لـ ${number(TABLE_SEATS.max)}. الكراسي بتترسم حوالين الترابيزة.`, `${TABLE_SEATS.min} to ${TABLE_SEATS.max}. Chairs are drawn around the table.`)}>
      {control => <div className="seat-stepper">
        <button type="button" className="icon-button" onClick={() => setSeats(value.seats - 1)} disabled={value.seats <= TABLE_SEATS.min} aria-label={text('فرد أقل', 'One seat fewer')}><MinusIcon size={18} weight="bold" /></button>
        <input {...control} className="input" inputMode="numeric" dir="ltr" maxLength={2} value={draft}
          onChange={event => setDraft(event.target.value)} onBlur={commitDraft}
          onKeyDown={event => { if (event.key === 'Enter') commitDraft(); }} />
        <button type="button" className="icon-button" onClick={() => setSeats(value.seats + 1)} disabled={value.seats >= TABLE_SEATS.max} aria-label={text('فرد زيادة', 'One more seat')}><PlusIcon size={18} weight="bold" /></button>
      </div>}
    </Field>
    <div className="table-layout-preview" aria-hidden="true">
      <TableGraphic shape={value.shape} seats={value.seats}>
        <bdi className="table-top-label">{label}</bdi>
        <small>{count(value.seats, 'seat')}</small>
      </TableGraphic>
    </div>
  </div>;
}

/** Adds one table. TABLE_LABEL_TAKEN is shown on the field. */
export function AddTableDialog({ branchId, open, onClose, areas, areaId = null }: { branchId: string; open: boolean; onClose: () => void; areas: TableArea[]; areaId?: string | null }) {
  const { text } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  const [error, setError] = useState<string | null>(null);
  // Reset only when the dialog opens, not when the areas refetch behind it.
  useEffect(() => { if (open) { setLabel(''); setLayout(startLayout(areas, areaId)); setError(null); } }, [open]);
  const create = useMutation({
    mutationFn: (value: string) => tablesApi.create({ branchId, label: value, ...layout }),
    onSuccess: table => {
      queryClient.setQueryData<RestaurantTable[]>(queryKeys.branchTables(branchId), current => [...(current ?? []), table]);
      void queryClient.invalidateQueries({ queryKey: queryKeys.branches });
      void queryClient.invalidateQueries({ queryKey: queryKeys.branchTableAreas(branchId) });
      toast.success(text(`ضفنا «${table.label}»`, `“${table.label}” added`));
      onClose();
    },
  });
  const submit = () => {
    const value = label.trim();
    if (!value) { setError(text('اكتب اسم الطاولة.', 'Enter a table name.')); return; }
    create.mutate(value);
  };
  const apiError = create.error;
  const labelProblem = isApiError(apiError, ORDER_ERROR_CODES.TABLE_LABEL_TAKEN) ? errorMessage(apiError, text) : error;
  return <Dialog open={open} onClose={onClose} size="small" busy={create.isPending} onSubmit={submit} title={text('ضيف طاولة', 'Add a table')}
    footer={<>
      <Button variant="secondary" onClick={onClose} disabled={create.isPending}>{text('إلغاء', 'Cancel')}</Button>
      <Button type="submit" loading={create.isPending}>{text('ضيف', 'Add table')}</Button>
    </>}>
    <div className="form">
      {apiError && !isApiError(apiError, ORDER_ERROR_CODES.TABLE_LABEL_TAKEN) && <Alert kind="error">{errorMessage(apiError, text)}</Alert>}
      <Field label={text('اسم الطاولة', 'Table name')} hint={text('زي «طاولة ٥» أو «تراس ٢». الاسم ده بيظهر على الكارت وفي الطلب.', 'For example “Table 5” or “Terrace 2”. It is printed on the card and shown with each order.')}
        error={labelProblem ? { message: labelProblem } : undefined}>
        <input className="input" data-autofocus maxLength={40} value={label} onChange={event => { setLabel(event.target.value); setError(null); create.reset(); }} />
      </Field>
      <TableLayoutFields value={layout} onChange={setLayout} label={label.trim() || text('طاولة', 'Table')} areas={areas} />
    </div>
  </Dialog>;
}

const PREFIXES = [['طاولة', 'Table'], ['ترابيزة', 'T-'], ['تراس', 'Terrace']] as const;

/** Adds "{prefix} {from}" … "{prefix} {to}" at once; names that already exist are skipped by the API. */
export function AddRangeDialog({ branchId, open, onClose, existing, areas, areaId = null }: { branchId: string; open: boolean; onClose: () => void; existing: number; areas: TableArea[]; areaId?: string | null }) {
  const { text, count: counted } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [prefix, setPrefix] = useState('');
  const [from, setFrom] = useState('1');
  const [to, setTo] = useState('10');
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  useEffect(() => {
    if (!open) return;
    setPrefix(text('طاولة', 'Table'));
    setFrom('1');
    setTo('10');
    setLayout(startLayout(areas, areaId));
    // Reset only when the dialog opens, not when the areas refetch behind it.
  }, [open, text]);
  const create = useMutation({
    mutationFn: (body: { from: number; to: number; prefix: string }) => tablesApi.createRange({ branchId, ...body, ...layout }),
    onSuccess: response => {
      // The API answers with the tables the caller may see; keep this branch's.
      const tables = response.filter(table => table.branchId === branchId);
      const added = tables.length - existing;
      queryClient.setQueryData(queryKeys.branchTables(branchId), tables);
      void queryClient.invalidateQueries({ queryKey: queryKeys.branches });
      void queryClient.invalidateQueries({ queryKey: queryKeys.branchTableAreas(branchId) });
      toast.success(added > 0 ? text(`ضفنا ${counted(added, 'table')}`, `${counted(added, 'table')} added`) : text('كل الطاولات دي موجودة بالفعل', 'All these tables already exist'));
      onClose();
    },
  });
  const start = Number.parseInt(normalizeDigits(from), 10);
  const end = Number.parseInt(normalizeDigits(to), 10);
  const count = end - start + 1;
  const fromError = !Number.isInteger(start) || start < 1 || start > 999 ? text('رقم من ١ لـ ٩٩٩.', 'A number from 1 to 999.') : null;
  const toError = !Number.isInteger(end) || end < 1 || end > 999 ? text('رقم من ١ لـ ٩٩٩.', 'A number from 1 to 999.')
    : !fromError && end < start ? text('لازم يكون أكبر من أو يساوي رقم البداية.', 'Must be at least the first number.')
      : !fromError && count > ORDER_LIMITS.bulkTables ? text(`لحد ${counted(ORDER_LIMITS.bulkTables, 'table')} في المرة.`, `Up to ${counted(ORDER_LIMITS.bulkTables, 'table')} at a time.`) : null;
  const valid = !fromError && !toError;
  const comma = text('، ', ', ');
  const preview = valid
    ? count <= 3 ? Array.from({ length: count }, (_, index) => rangeLabel(prefix, start + index)).join(comma)
      : `${rangeLabel(prefix, start)}${comma}${rangeLabel(prefix, start + 1)} … ${rangeLabel(prefix, end)}`
    : null;
  const submit = () => { if (valid) create.mutate({ from: start, to: end, prefix: prefix.trim() }); };
  return <Dialog open={open} onClose={onClose} busy={create.isPending} onSubmit={submit} title={text('ضيف طاولات مرة واحدة', 'Add several tables')}
    footer={<>
      <Button variant="secondary" onClick={onClose} disabled={create.isPending}>{text('إلغاء', 'Cancel')}</Button>
      <Button type="submit" loading={create.isPending} disabled={!valid}>{valid ? text(`ضيف ${counted(count, 'table')}`, `Add ${counted(count, 'table')}`) : text('ضيف', 'Add')}</Button>
    </>}>
    <div className="form">
      {create.isError && <Alert kind="error">{errorMessage(create.error, text)}</Alert>}
      <Field label={text('الاسم قبل الرقم', 'Name before the number')} optional hint={text('اسيبه فاضي لو عايز أرقام بس.', 'Leave it empty for numbers only.')}>
        <input className="input" data-autofocus maxLength={20} value={prefix} onChange={event => setPrefix(event.target.value)} />
      </Field>
      <div className="chips range-chips" role="group" aria-label={text('أسماء مقترحة', 'Suggested names')}>
        {PREFIXES.map(([ar, en]) => {
          const value = text(ar, en);
          return <button type="button" key={value} className="chip" aria-pressed={prefix === value} onClick={() => setPrefix(value)}>{value}</button>;
        })}
      </div>
      <div className="form-grid range-grid">
        <Field label={text('من رقم', 'From')} error={fromError ? { message: fromError } : undefined}>
          <input className="input" inputMode="numeric" dir="ltr" maxLength={3} value={from} onChange={event => setFrom(event.target.value)} />
        </Field>
        <Field label={text('لحد رقم', 'To')} error={toError ? { message: toError } : undefined}>
          <input className="input" inputMode="numeric" dir="ltr" maxLength={3} value={to} onChange={event => setTo(event.target.value)} />
        </Field>
      </div>
      {preview && <div className="range-preview" aria-live="polite" data-testid="range-preview">
        <strong>{preview}</strong>
        <small className="muted">{text(`${counted(count, 'table')}. الأسماء الموجودة بالفعل مش هتتكرر.`, `${counted(count, 'table')}. Names that already exist are skipped.`)}</small>
      </div>}
      <TableLayoutFields value={layout} onChange={setLayout} label={rangeLabel(prefix, Number.isInteger(start) ? start : 1)} areas={areas} />
    </div>
  </Dialog>;
}

/**
 * Edits a table: its name, area and location, shape and seats, minimum order, notes and what it
 * offers. Its QR code stays the same. TABLE_LABEL_TAKEN is shown on the name.
 */
export function TableEditDialog({ branchId, table, onClose, areas }: { branchId: string; table: RestaurantTable | null; onClose: () => void; areas: TableArea[] }) {
  const { text } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  const [minOrder, setMinOrder] = useState('');
  const [notes, setNotes] = useState('');
  const [attributes, setAttributes] = useState<TableAttribute[]>([]);
  const [problem, setProblem] = useState<{ field: 'label' | 'minOrder'; message: string } | null>(null);
  useEffect(() => {
    if (!table) return;
    setLabel(table.label);
    setLayout({ shape: table.shape, seats: table.seats, location: table.location, areaId: table.areaId });
    setMinOrder(table.minOrderPiastres === null ? '' : piastresToInput(table.minOrderPiastres));
    setNotes(table.notes ?? '');
    setAttributes(table.attributes);
    setProblem(null);
  }, [table]);
  const save = useMutation({
    mutationFn: ({ target, body }: { target: RestaurantTable; body: Parameters<typeof tablesApi.update>[1] }) => tablesApi.update(target.id, body),
    onSuccess: updated => {
      queryClient.setQueryData<RestaurantTable[]>(queryKeys.branchTables(branchId), tables => tables?.map(entry => (entry.id === updated.id ? updated : entry)));
      void queryClient.invalidateQueries({ queryKey: queryKeys.floors });
      void queryClient.invalidateQueries({ queryKey: queryKeys.branchTableAreas(branchId) });
      toast.success(text(`اتحفظت «${updated.label}»`, `“${updated.label}” saved`));
      onClose();
    },
    onError: error => { if (isApiError(error, ORDER_ERROR_CODES.TABLE_LABEL_TAKEN)) setProblem({ field: 'label', message: errorMessage(error, text) }); },
  });
  const submit = () => {
    if (!table) return;
    const name = label.trim();
    if (!name) { setProblem({ field: 'label', message: text('اكتب اسم الطاولة.', 'Enter a table name.') }); return; }
    const amount = minOrder.trim() ? egpToPiastres(minOrder) : null;
    if (minOrder.trim() && amount === null) { setProblem({ field: 'minOrder', message: text('اكتب مبلغ صحيح، زي ٢٥٠.', 'Enter an amount, for example 250.') }); return; }
    save.mutate({ target: table, body: { label: name, ...layout, minOrderPiastres: amount, notes: notes.trim(), attributes } });
  };
  const toggle = (value: TableAttribute) => setAttributes(current => (current.includes(value) ? current.filter(entry => entry !== value) : [...current, value]));
  return <Dialog open={table !== null} onClose={onClose} busy={save.isPending} onSubmit={submit}
    title={table ? text(`تعديل «${table.label}»`, `Edit “${table.label}”`) : ''}
    footer={<>
      <Button variant="secondary" onClick={onClose} disabled={save.isPending}>{text('إلغاء', 'Cancel')}</Button>
      <Button type="submit" loading={save.isPending}>{text('احفظ', 'Save')}</Button>
    </>}>
    {table && <div className="form">
      {save.isError && !isApiError(save.error, ORDER_ERROR_CODES.TABLE_LABEL_TAKEN) && <Alert kind="error">{errorMessage(save.error, text)}</Alert>}
      <Field label={text('اسم الطاولة', 'Table name')} error={problem?.field === 'label' ? { message: problem.message } : undefined}>
        <input className="input" data-autofocus maxLength={40} value={label} onChange={event => { setLabel(event.target.value); setProblem(null); save.reset(); }} />
      </Field>
      <TableLayoutFields value={layout} onChange={setLayout} label={label.trim() || table.label} areas={areas} />
      <div className="form-grid">
        <Field label={text('أقل طلب (ج.م)', 'Minimum order (EGP)')} optional hint={text('سيبه فاضي لو مفيش حد أدنى.', 'Leave it empty for none.')}
          error={problem?.field === 'minOrder' ? { message: problem.message } : undefined}>
          <input className="input" inputMode="decimal" dir="ltr" maxLength={9} value={minOrder} onChange={event => { setMinOrder(event.target.value); setProblem(null); }} />
        </Field>
        <Field label={text('ملاحظات', 'Notes')} optional hint={text('زي «جنب الشباك» أو «مناسبة للعائلات».', 'For example “Near the window”.')}>
          <input className="input" maxLength={200} value={notes} onChange={event => setNotes(event.target.value)} />
        </Field>
      </div>
      <fieldset className="field">
        <legend className="field-label">{text('مميزات الطاولة', 'Table features')}</legend>
        <div className="chips">
          {TABLE_ATTRIBUTE_OPTIONS.map(option => <button type="button" key={option.value} className="chip" aria-pressed={attributes.includes(option.value)} onClick={() => toggle(option.value)}>
            {text(option.ar, option.en)}
          </button>)}
        </div>
      </fieldset>
    </div>}
  </Dialog>;
}
