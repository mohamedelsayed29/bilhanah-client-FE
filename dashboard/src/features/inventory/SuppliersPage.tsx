import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { ArchiveIcon, ArrowCounterClockwiseIcon, EnvelopeIcon, PencilSimpleIcon, PhoneIcon, PlusIcon, TrashIcon, UsersThreeIcon } from '@phosphor-icons/react';
import { createSupplierSchema, INVENTORY_ERROR_CODES, INVENTORY_LIMITS, type InventorySupplier } from '@bilhanah/contracts';
import type { z } from 'zod';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Dialog } from '../../components/Dialog';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Field } from '../../components/Field';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { isApiError } from '../../lib/api';
import { inventoryApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { applyServerIssues, emptyToNull, schemaResolver } from '../../lib/forms';
import { useLanguage, usePageTitle } from '../../lib/language';
import { inventoryKeys, useInventoryActions } from './shared';
import { formatNumber } from './units';

type SupplierInput = z.input<typeof createSupplierSchema>;
const FIELDS = ['name', 'phone', 'email', 'note'] as const;

/** Who the restaurant buys from: contact details, how many ingredients prefer them, and their deliveries. */
export function InventorySuppliersPage() {
  const { text, language } = useLanguage();
  usePageTitle('الموردين', 'Suppliers');
  const actions = useInventoryActions();
  const toast = useToast();
  const queryClient = useQueryClient();
  const suppliers = useQuery({ queryKey: inventoryKeys.suppliers, queryFn: inventoryApi.suppliers });
  const [editing, setEditing] = useState<InventorySupplier | 'new' | null>(null);
  const [deleting, setDeleting] = useState<InventorySupplier | null>(null);
  const archive = useMutation({
    mutationFn: (supplier: InventorySupplier) => inventoryApi.updateSupplier(supplier.id, { isActive: !supplier.isActive }),
    onSuccess: saved => { void queryClient.invalidateQueries({ queryKey: inventoryKeys.all }); toast.success(saved.isActive ? text('المورد رجع', 'Supplier restored') : text('المورد اتأرشف', 'Supplier archived')); },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  const remove = useMutation({
    mutationFn: (supplier: InventorySupplier) => inventoryApi.deleteSupplier(supplier.id),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: inventoryKeys.all }); toast.success(text('المورد اتمسح', 'Supplier deleted')); setDeleting(null); },
    onError: failure => { toast.error(errorMessage(failure, text)); setDeleting(null); },
  });
  return <>
    {actions.manage && <div className="inv-toolbar is-end"><Button onClick={() => setEditing('new')} icon={<PlusIcon size={17} weight="bold" aria-hidden="true" />} data-testid="new-supplier">{text('ضيف مورد', 'Add a supplier')}</Button></div>}
    {suppliers.isError && <ErrorPanel error={suppliers.error} onRetry={() => void suppliers.refetch()} />}
    {suppliers.isPending && <Skeleton height={200} />}
    {suppliers.data?.length === 0 && <section className="card"><div className="empty-state">
      <span className="empty-state-icon" aria-hidden="true"><UsersThreeIcon size={30} /></span>
      <h2>{text('مفيش موردين لسه', 'No suppliers yet')}</h2>
      <p>{text('سجّل اللي بتشتري منهم عشان تربطهم بالخامات، وتقرير الطلب يجمّع لك اللي محتاجه من كل واحد.', 'Record who you buy from to link them to ingredients; the reorder report then groups what you need by supplier.')}</p>
    </div></section>}
    {suppliers.data && suppliers.data.length > 0 && <ul className="inv-suppliers" data-testid="suppliers">
      {suppliers.data.map(supplier => <li key={supplier.id} className={`card inv-supplier ${supplier.isActive ? '' : 'is-archived'}`} data-testid="supplier">
        <div className="inv-supplier-main">
          <strong><bdi>{supplier.name}</bdi>{!supplier.isActive && <span className="badge badge-muted">{text('متأرشف', 'Archived')}</span>}</strong>
          <span className="inv-supplier-contact">
            {supplier.phone && <a href={`tel:${supplier.phone}`} className="inv-phone"><PhoneIcon size={15} aria-hidden="true" /><span className="ltr">{supplier.phone}</span></a>}
            {supplier.email && <a href={`mailto:${supplier.email}`} className="inv-phone"><EnvelopeIcon size={15} aria-hidden="true" /><span className="ltr">{supplier.email}</span></a>}
          </span>
          {supplier.note && <p className="muted"><bdi>{supplier.note}</bdi></p>}
          <small className="muted">{text(`${formatNumber(supplier.ingredients, 'ar')} خامة مفضلة · ${formatNumber(supplier.purchases, 'ar')} استلام`, `${supplier.ingredients} preferred ingredient${supplier.ingredients === 1 ? '' : 's'} · ${supplier.purchases} deliver${supplier.purchases === 1 ? 'y' : 'ies'}`)}</small>
        </div>
        {actions.manage && <div className="inv-supplier-actions">
          <Button small variant="ghost" onClick={() => setEditing(supplier)} icon={<PencilSimpleIcon size={15} aria-hidden="true" />} aria-label={`${text('عدّل', 'Edit')}: ${supplier.name}`}>{text('عدّل', 'Edit')}</Button>
          <Button small variant="ghost" loading={archive.isPending && archive.variables?.id === supplier.id} onClick={() => archive.mutate(supplier)}
            icon={supplier.isActive ? <ArchiveIcon size={15} aria-hidden="true" /> : <ArrowCounterClockwiseIcon size={15} aria-hidden="true" />}>{supplier.isActive ? text('أرشف', 'Archive') : text('رجّعه', 'Restore')}</Button>
          {supplier.purchases === 0 && <Button small variant="danger-outline" onClick={() => setDeleting(supplier)} icon={<TrashIcon size={15} aria-hidden="true" />} aria-label={`${text('امسح', 'Delete')}: ${supplier.name}`}>{text('امسح', 'Delete')}</Button>}
        </div>}
      </li>)}
    </ul>}
    {editing && <SupplierDialog supplier={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    <ConfirmDialog open={Boolean(deleting)} busy={remove.isPending} onCancel={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting)}
      title={text('تمسح المورد؟', 'Delete this supplier?')} confirmLabel={text('امسح', 'Delete')}
      description={language === 'ar' ? 'الخامات اللي كانت مفضلة منه هتبقى من غير مورد مفضل.' : 'Ingredients that preferred this supplier will have no preferred supplier.'} />
  </>;
}

function SupplierDialog({ supplier, onClose }: { supplier: InventorySupplier | null; onClose: () => void }) {
  const { text } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<SupplierInput, unknown, z.output<typeof createSupplierSchema>>({
    resolver: schemaResolver(createSupplierSchema),
    defaultValues: { name: supplier?.name ?? '', phone: supplier?.phone ?? '', email: supplier?.email ?? '', note: supplier?.note ?? '' },
  });
  useEffect(() => { reset({ name: supplier?.name ?? '', phone: supplier?.phone ?? '', email: supplier?.email ?? '', note: supplier?.note ?? '' }); }, [supplier, reset]);
  const submit = handleSubmit(async values => {
    try {
      if (supplier) await inventoryApi.updateSupplier(supplier.id, values);
      else await inventoryApi.createSupplier(values);
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      toast.success(supplier ? text('اتحفظ المورد', 'Supplier saved') : text('المورد اتضاف', 'Supplier added'));
      onClose();
    } catch (failure) {
      if (isApiError(failure, INVENTORY_ERROR_CODES.SUPPLIER_NAME_TAKEN)) setError('name', { type: 'server', message: text('في مورد تاني بنفس الاسم.', 'Another supplier has this name.') });
      else if (!applyServerIssues<SupplierInput>(failure, setError as never, FIELDS)) toast.error(errorMessage(failure, text));
    }
  });
  return <Dialog open onClose={onClose} busy={isSubmitting} onSubmit={() => void submit()} title={supplier ? text('تعديل المورد', 'Edit supplier') : text('مورد جديد', 'New supplier')}
    footer={<><Button variant="secondary" onClick={onClose} disabled={isSubmitting}>{text('إلغاء', 'Cancel')}</Button><Button type="submit" loading={isSubmitting} data-testid="supplier-save">{text('احفظ', 'Save')}</Button></>}>
    <div className="form-grid">
      <Field label={text('الاسم', 'Name')} error={errors.name} required className="field-wide"><input className="input" maxLength={INVENTORY_LIMITS.nameLength} data-autofocus {...register('name')} /></Field>
      <Field label={text('الموبايل', 'Phone')} error={errors.phone} optional><input className="input ltr-input" dir="ltr" type="tel" inputMode="tel" {...register('phone', { setValueAs: emptyToNull })} /></Field>
      <Field label={text('الإيميل', 'Email')} error={errors.email} optional><input className="input ltr-input" dir="ltr" type="email" inputMode="email" {...register('email', { setValueAs: emptyToNull })} /></Field>
      <Field label={text('ملاحظة', 'Note')} error={errors.note} optional className="field-wide" hint={text('مثلاً مواعيد التوريد أو شروط الدفع.', 'Delivery days or payment terms, for example.')}>
        <input className="input" maxLength={INVENTORY_LIMITS.noteLength} {...register('note', { setValueAs: emptyToNull })} />
      </Field>
    </div>
  </Dialog>;
}
