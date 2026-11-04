import { useEffect, useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPinAreaIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react';
import { ORDER_ERROR_CODES, ORDER_LIMITS, type TableArea, type TableAreaTheme, type TableLocation } from '@bilhanah/contracts';
import { Alert } from '../../../components/Alert';
import { Button } from '../../../components/Button';
import { Dialog } from '../../../components/Dialog';
import { Field } from '../../../components/Field';
import { useToast } from '../../../components/Toast';
import { isApiError } from '../../../lib/api';
import { tableAreasApi } from '../../../lib/api/endpoints';
import { errorMessage } from '../../../lib/api/error-messages';
import { useLanguage } from '../../../lib/language';
import { queryKeys } from '../queries';
import { AREA_THEMES, areaTheme } from './area-themes';
import { TABLE_LOCATION_OPTIONS, tableLocationOption } from './TableDialogs';

/** Common seating areas, as one-tap names; each comes with the look it is drawn with and where it usually is. */
const SUGGESTIONS: { ar: string; en: string; theme: TableAreaTheme }[] = [
  { ar: 'الصالة الرئيسية', en: 'Main hall', theme: 'HALL' },
  { ar: 'الجنينة', en: 'Garden', theme: 'GARDEN' },
  { ar: 'الروف', en: 'Rooftop', theme: 'ROOFTOP' },
  { ar: 'التراس', en: 'Terrace', theme: 'TERRACE' },
  { ar: 'VIP', en: 'VIP section', theme: 'VIP' },
  { ar: 'منطقة التدخين', en: 'Smoking area', theme: 'SMOKING' },
];

/** Adds an area, or renames one and changes its look and where it is (its tables move with it). */
export function TableAreaDialog({ branchId, area, open, onClose }: { branchId: string; area: TableArea | null; open: boolean; onClose: () => void }) {
  const { text } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const locationName = useId();
  const themeName = useId();
  const [name, setName] = useState('');
  const [location, setLocation] = useState<TableLocation>('INDOOR');
  const [theme, setTheme] = useState<TableAreaTheme>('HALL');
  /** Picking a look suggests its usual location; the owner can still change it. */
  const pickTheme = (value: TableAreaTheme) => { setTheme(value); setLocation(areaTheme(value).location); };
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setName(area?.name ?? '');
    setLocation(area?.location ?? 'INDOOR');
    setTheme(area?.theme ?? 'HALL');
    setError(null);
  }, [open, area]);
  const save = useMutation({
    mutationFn: (value: string) => (area ? tableAreasApi.update(area.id, { name: value, location, theme }) : tableAreasApi.create({ branchId, name: value, location, theme })),
    onSuccess: saved => {
      // A new location moves the area's tables, so their cards and the floor change too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.tables });
      void queryClient.invalidateQueries({ queryKey: queryKeys.floors });
      toast.success(area ? text(`اتحفظت «${saved.name}»`, `“${saved.name}” saved`) : text(`ضفنا منطقة «${saved.name}»`, `Area “${saved.name}” added`));
      onClose();
    },
  });
  const submit = () => {
    const value = name.trim();
    if (!value) { setError(text('اكتب اسم المنطقة.', 'Enter an area name.')); return; }
    save.mutate(value);
  };
  const nameProblem = isApiError(save.error, ORDER_ERROR_CODES.TABLE_AREA_NAME_TAKEN) ? errorMessage(save.error, text) : error;
  const moving = area && area.location !== location && area.tableCount > 0;
  return <Dialog open={open} onClose={onClose} size="small" busy={save.isPending} onSubmit={submit}
    title={area ? text(`تعديل «${area.name}»`, `Edit “${area.name}”`) : text('ضيف منطقة', 'Add an area')}
    footer={<>
      <Button variant="secondary" onClick={onClose} disabled={save.isPending}>{text('إلغاء', 'Cancel')}</Button>
      <Button type="submit" loading={save.isPending}>{area ? text('احفظ', 'Save') : text('ضيف', 'Add area')}</Button>
    </>}>
    <div className="form">
      {save.isError && !isApiError(save.error, ORDER_ERROR_CODES.TABLE_AREA_NAME_TAKEN) && <Alert kind="error">{errorMessage(save.error, text)}</Alert>}
      <Field label={text('اسم المنطقة', 'Area name')} hint={text('زي «الصالة الرئيسية» أو «الجنينة». بيظهر فوق ترابيزاتها.', 'For example “Main hall” or “Garden”. It heads its tables.')}
        error={nameProblem ? { message: nameProblem } : undefined}>
        <input className="input" data-autofocus maxLength={40} value={name} onChange={event => { setName(event.target.value); setError(null); save.reset(); }} />
      </Field>
      {!area && <div className="chips range-chips" role="group" aria-label={text('أسماء مقترحة', 'Suggested names')}>
        {SUGGESTIONS.map(suggestion => {
          const value = text(suggestion.ar, suggestion.en);
          return <button type="button" key={value} className="chip" aria-pressed={name === value}
            onClick={() => { setName(value); pickTheme(suggestion.theme); setError(null); }}>{value}</button>;
        })}
      </div>}
      <fieldset className="field">
        <legend className="field-label">{text('شكلها على الخريطة', 'Look on the floor plan')}</legend>
        <div className="area-theme-picker">
          {AREA_THEMES.map(option => <label key={option.value} className={`area-theme-option ${theme === option.value ? 'is-checked' : ''}`}>
            <input type="radio" name={themeName} value={option.value} checked={theme === option.value} onChange={() => pickTheme(option.value)} />
            <span className={`area-theme-swatch floor-zone theme-${option.value.toLowerCase()}`} aria-hidden="true"><span className="floor-zone-decor" /></span>
            <span className="area-theme-name"><option.icon size={15} aria-hidden="true" />{text(option.ar, option.en)}</span>
          </label>)}
        </div>
      </fieldset>
      <fieldset className="field">
        <legend className="field-label">{text('مكانها', 'Location')}</legend>
        <div className="segmented">
          {TABLE_LOCATION_OPTIONS.map(option => <label key={option.value}>
            <input type="radio" name={locationName} value={option.value} checked={location === option.value} onChange={() => setLocation(option.value)} />
            <option.icon size={18} aria-hidden="true" />{text(option.ar, option.en)}
          </label>)}
        </div>
      </fieldset>
      {moving && <Alert kind="info" live={false}>{text('كل ترابيزات المنطقة دي هيتغيّر مكانها معاها.', 'Every table in this area moves with it.')}</Alert>}
    </div>
  </Dialog>;
}

/**
 * Deletes an area. An empty one just goes; one with tables needs a place for them first (another
 * area or none), and says how many have guests with open orders, which stay with their tables.
 */
export function DeleteTableAreaDialog({ area, areas, onClose }: { area: TableArea | null; areas: TableArea[]; onClose: () => void }) {
  const { text, count } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const others = areas.filter(entry => entry.id !== area?.id);
  const [moveTo, setMoveTo] = useState('');
  useEffect(() => { if (area) setMoveTo(''); }, [area]);
  const remove = useMutation({
    mutationFn: (target: TableArea) => tableAreasApi.remove(target.id, target.tableCount > 0 ? moveTo : undefined),
    onSuccess: (_data, target) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tables });
      void queryClient.invalidateQueries({ queryKey: queryKeys.floors });
      toast.success(text(`مسحنا «${target.name}»`, `“${target.name}” deleted`));
      onClose();
    },
  });
  const hasTables = (area?.tableCount ?? 0) > 0;
  const ready = !hasTables || moveTo !== '';
  return <Dialog open={area !== null} onClose={onClose} size="small" busy={remove.isPending} onSubmit={() => area && ready && remove.mutate(area)}
    title={area ? text(`امسح «${area.name}»؟`, `Delete “${area.name}”?`) : ''}
    footer={<>
      <Button variant="secondary" onClick={onClose} disabled={remove.isPending}>{text('إلغاء', 'Cancel')}</Button>
      <Button type="submit" variant="danger" loading={remove.isPending} disabled={!ready}>{text('امسح المنطقة', 'Delete area')}</Button>
    </>}>
    {area && <div className="form">
      {remove.isError && <Alert kind="error">{errorMessage(remove.error, text)}</Alert>}
      {hasTables
        ? <>
          <p>{text(`المنطقة دي فيها ${count(area.tableCount, 'table')}. اختار تروح فين الأول؛ الترابيزات وأكوادها مش هتتمسح.`, `This area has ${count(area.tableCount, 'table')}. Choose where they go first; the tables and their codes stay.`)}</p>
          {area.activeOrders > 0 && <Alert kind="warning" live={false} title={text('فيها طلبات لسه مفتوحة', 'It has open orders')}>
            {text(`عليها ${count(area.activeOrders, [{ one: 'طلب مفتوح', two: 'طلبين مفتوحين', few: '{n} طلبات مفتوحة', many: '{n} طلب مفتوح' }, { one: '{n} open order', other: '{n} open orders' }])}. الطلبات هتفضل مع ترابيزاتها في المكان الجديد.`, `Its tables have ${count(area.activeOrders, [{ one: 'طلب مفتوح', two: 'طلبين مفتوحين', few: '{n} طلبات مفتوحة', many: '{n} طلب مفتوح' }, { one: '{n} open order', other: '{n} open orders' }])}. They stay with their tables in the new place.`)}
          </Alert>}
          <Field label={text('انقل الترابيزات لـ', 'Move the tables to')}>
            {control => <select {...control} className="select" value={moveTo} onChange={event => setMoveTo(event.target.value)} data-testid="area-move-to">
              <option value="" disabled>{text('اختار…', 'Choose…')}</option>
              {others.map(other => <option key={other.id} value={other.id}>{other.name}</option>)}
              <option value="none">{text('بدون منطقة', 'No area')}</option>
            </select>}
          </Field>
        </>
        : <p>{text('المنطقة فاضية، ومفيش ترابيزات هتتأثر.', 'The area is empty; no tables are affected.')}</p>}
    </div>}
  </Dialog>;
}


/** Every area of the branch, to add, edit or delete them; opened from the Tables page header. */
export function ManageAreasDialog({ open, areas, onClose, onAdd, onEdit, onDelete }: {
  open: boolean; areas: TableArea[]; onClose: () => void; onAdd: () => void; onEdit: (area: TableArea) => void; onDelete: (area: TableArea) => void;
}) {
  const { text, count } = useLanguage();
  return <Dialog open={open} onClose={onClose} title={text('مناطق المطعم', 'Seating areas')}
    footer={<>
      <Button variant="secondary" onClick={onClose}>{text('إغلاق', 'Close')}</Button>
      <Button onClick={onAdd} disabled={areas.length >= ORDER_LIMITS.tableAreas} icon={<PlusIcon size={16} aria-hidden="true" />}>{text('ضيف منطقة', 'Add area')}</Button>
    </>}>
    <div className="form" data-testid="areas-panel">
      <p className="muted">{text('قسّم المطعم لمناطق زي الصالة والجنينة والروف، وكل ترابيزة تتحط في منطقتها.', 'Divide the restaurant into areas such as the main hall, the garden or the rooftop, and put each table in its area.')}</p>
      {areas.length === 0
        ? <p className="areas-empty"><MapPinAreaIcon size={18} aria-hidden="true" />{text('لسه مفيش مناطق.', 'No areas yet.')}</p>
        : <ul className="areas-list">
          {areas.map(area => {
            const location = tableLocationOption(area.location);
            const look = areaTheme(area.theme);
            return <li key={area.id} className={`area-card is-${area.location.toLowerCase()}`} data-testid="area-card" data-name={area.name}>
              <span className={`area-card-icon area-theme-swatch floor-zone theme-${area.theme.toLowerCase()}`} aria-hidden="true"><span className="floor-zone-decor" /><look.icon size={18} weight="fill" /></span>
              <span className="area-card-body">
                <strong><bdi>{area.name}</bdi></strong>
                <small>{text(location.ar, location.en)} · {count(area.tableCount, 'table')}</small>
                {area.activeOrders > 0 && <small className="area-card-orders">{count(area.activeOrders, [{ one: 'طلب مفتوح', two: 'طلبين مفتوحين', few: '{n} طلبات مفتوحة', many: '{n} طلب مفتوح' }, { one: '{n} open order', other: '{n} open orders' }])}</small>}
              </span>
              <button type="button" className="icon-button" onClick={() => onEdit(area)} aria-label={text(`عدّل ${area.name}`, `Edit ${area.name}`)}><PencilSimpleIcon size={17} /></button>
              <button type="button" className="icon-button icon-button-danger" onClick={() => onDelete(area)} aria-label={text(`امسح ${area.name}`, `Delete ${area.name}`)}><TrashIcon size={17} /></button>
            </li>;
          })}
        </ul>}
    </div>
  </Dialog>;
}
