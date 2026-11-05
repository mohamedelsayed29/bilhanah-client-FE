import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ORDER_ERROR_CODES, TABLE_GROUP_LIMITS, type RestaurantTable, type TableArea } from '@bilhanah/contracts';
import { Alert } from '../../../components/Alert';
import { Button } from '../../../components/Button';
import { Dialog } from '../../../components/Dialog';
import { Field } from '../../../components/Field';
import { useToast } from '../../../components/Toast';
import { isApiError } from '../../../lib/api';
import { tableGroupsApi } from '../../../lib/api/endpoints';
import { errorMessage } from '../../../lib/api/error-messages';
import { useLanguage } from '../../../lib/language';
import { queryKeys } from '../queries';
import { tableLocationOption } from './TableDialogs';

/**
 * Picks two or more tables of one area to seat a larger party together, with the seats they make together.
 * Only switched-on tables that are not merged already are offered; the API checks the rest (one party at most).
 */
export function MergeTablesDialog({ open, tables, areas, initial, onClose }: {
  open: boolean;
  tables: RestaurantTable[];
  areas: TableArea[];
  /** A table to start from (the one selected). */
  initial?: string | null;
  onClose: () => void;
}) {
  const { text, number, count } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<string[]>([]);
  const [label, setLabel] = useState('');
  useEffect(() => { if (open) { setPicked(initial ? [initial] : []); setLabel(''); } }, [open, initial]);
  const free = tables.filter(table => table.isActive && !table.groupId);
  const areaKey = (table: RestaurantTable) => table.areaId ?? `none:${table.location}`;
  const groups = [...new Set(free.map(areaKey))].map(key => {
    const members = free.filter(table => areaKey(table) === key);
    const area = areas.find(entry => entry.id === members[0]!.areaId);
    const location = tableLocationOption(members[0]!.location);
    return { key, title: area?.name ?? text(location.ar, location.en), tables: members };
  });
  // Merged tables stand together: picking one area's table leaves the other areas' out.
  const pickedArea = picked.length ? areaKey(free.find(table => table.id === picked[0]) ?? free[0]!) : null;
  const chosen = free.filter(table => picked.includes(table.id));
  const seats = chosen.reduce((sum, table) => sum + table.seats, 0);

  const save = useMutation({
    mutationFn: () => tableGroupsApi.create({ tableIds: picked, label: label.trim() || null }),
    onSuccess: group => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.floors });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tables });
      toast.success(text(`اتدمجت ${group.tableLabels.join(' + ')}: ${number(group.seats)} كرسي`, `Merged ${group.tableLabels.join(' + ')}: ${group.seats} seats`));
      onClose();
    },
  });
  const conflictTables = isApiError(save.error, ORDER_ERROR_CODES.TABLE_GROUP_CONFLICT)
    ? ((save.error as { details?: { tables?: string[] } }).details?.tables ?? []) : [];
  const toggle = (id: string) => setPicked(current => current.includes(id) ? current.filter(entry => entry !== id) : current.length >= TABLE_GROUP_LIMITS.tables ? current : [...current, id]);

  return <Dialog open={open} onClose={onClose} busy={save.isPending} onSubmit={() => { if (picked.length >= 2) save.mutate(); }}
    title={text('ادمج طاولات', 'Merge tables')}
    footer={<>
      <Button variant="secondary" onClick={onClose} disabled={save.isPending}>{text('إلغاء', 'Cancel')}</Button>
      <Button type="submit" loading={save.isPending} disabled={picked.length < 2} data-testid="merge-submit">
        {picked.length >= 2 ? text(`ادمج ${number(picked.length)} طاولات`, `Merge ${picked.length} tables`) : text('اختار طاولتين على الأقل', 'Pick at least two tables')}
      </Button>
    </>}>
    <div className="form">
      <p className="field-hint">{text('للمجموعات الكبيرة: الطاولات المدموجة بتتعامل كترابيزة واحدة، بنفس الحساب ونفس الطلب المشترك. لازم تكون في نفس المنطقة.', 'For larger parties: merged tables work as one, with one bill and one shared order. They must be in the same area.')}</p>
      {save.isError && <Alert kind="error">{conflictTables.length
        ? text(`${conflictTables.join(' و')} عليهم زباين أو حجوزات مختلفة. شيل واحدة منهم.`, `${conflictTables.join(' and ')} have different guests or bookings. Leave one of them out.`)
        : errorMessage(save.error, text)}</Alert>}
      {free.length < 2 && <p className="muted">{text('محتاج طاولتين شغالين ومش مدموجين على الأقل.', 'You need at least two switched-on tables that are not merged.')}</p>}
      {groups.map(group => <fieldset key={group.key} className="merge-area" disabled={pickedArea !== null && pickedArea !== group.key}>
        <legend><bdi>{group.title}</bdi></legend>
        <div className="merge-tables">
          {group.tables.map(table => <label key={table.id} className="merge-table" data-testid="merge-option" data-label={table.label}>
            <input type="checkbox" checked={picked.includes(table.id)} onChange={() => toggle(table.id)} />
            <span><bdi>{table.label}</bdi><small>{count(table.seats, 'seat')}</small></span>
          </label>)}
        </div>
      </fieldset>)}
      <div className="merge-total" role="status" data-testid="merge-total">
        <strong>{text(`${number(seats)} كرسي`, `${seats} seats`)}</strong>
        <span>{chosen.length ? chosen.map(table => table.label).join(' + ') : text('مفيش طاولات متختارة', 'No tables picked')}</span>
      </div>
      <Field label={text('اسم المجموعة', 'Group name')} optional hint={text('مثلًا: عيلة منى. لو سبته فاضي هيظهر بأسماء الطاولات.', 'For example: Mona’s family. Left empty, it shows the table names.')}>
        <input className="input" maxLength={40} value={label} onChange={event => setLabel(event.target.value)} />
      </Field>
    </div>
  </Dialog>;
}
