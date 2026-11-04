import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useForm, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { BRANCH_ERROR_CODES, createBranchSchema, suggestBranchSlug } from '@bilhanah/contracts';
import type { z } from 'zod';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Field } from '../../components/Field';
import { useToast } from '../../components/Toast';
import { isApiError } from '../../lib/api';
import { errorMessage } from '../../lib/api/error-messages';
import { fill, useCopy } from '../../lib/copy';
import { applyServerIssues, emptyToNull, schemaResolver } from '../../lib/forms';
import { useLanguage } from '../../lib/language';
import { useCreateBranch } from './branch-mutations';
import { useBranchList } from './workspace';

/** The branch's details as a form: everything diners see about the location. */
export const branchDetailsSchema = createBranchSchema.pick({ name: true, slug: true, phone: true, whatsappNumber: true, city: true, address: true, mapUrl: true });
type DetailsInput = z.input<typeof branchDetailsSchema>;
export const DETAIL_FIELDS = ['name', 'slug', 'phone', 'whatsappNumber', 'city', 'address', 'mapUrl'] as const;

/** "http://cafe.bilhanah.com/?b=nasr-city" for a slug, from the main branch's link. */
export function branchLink(mainUrl: string, slug: string): string {
  return `${mainUrl.replace(/\/?(\?.*)?$/, '')}/?b=${slug || '…'}`;
}

/**
 * Name, link address, phone, WhatsApp, city, address and map link. `ownerOnly` fields (name and
 * address in the link) are shown read-only to managers.
 */
export function BranchDetailsFields<T extends DetailsInput>({ register, errors, readOnlyIdentity = false, slugHint, autoFocus = false, onSlugInput }: {
  register: UseFormRegister<T>; errors: FieldErrors<T>; readOnlyIdentity?: boolean; slugHint: string; autoFocus?: boolean;
  /** The owner typed in the link address (it stops following the name). */
  onSlugInput?: () => void;
}) {
  const t = useCopy();
  const f = t.branchForm;
  const reg = register as unknown as UseFormRegister<DetailsInput>;
  const err = errors as FieldErrors<DetailsInput>;
  return <div className="form-grid">
    <Field label={f.name} error={err.name} required hint={readOnlyIdentity ? undefined : f.nameHint}>
      <input className="input" maxLength={80} readOnly={readOnlyIdentity} data-autofocus={autoFocus || undefined} {...reg('name')} />
    </Field>
    <Field label={f.slug} error={err.slug} required hint={slugHint}>
      <input className="input ltr-input" dir="ltr" maxLength={40} autoCapitalize="none" spellCheck={false} readOnly={readOnlyIdentity} onInput={onSlugInput} {...reg('slug')} />
    </Field>
    <Field label={f.phone} error={err.phone} required>
      <input className="input ltr-input" dir="ltr" type="tel" inputMode="tel" autoComplete="off" {...reg('phone')} />
    </Field>
    <Field label={f.whatsapp} error={err.whatsappNumber} optional>
      <input className="input ltr-input" dir="ltr" type="tel" inputMode="tel" autoComplete="off" {...reg('whatsappNumber', { setValueAs: emptyToNull })} />
    </Field>
    <Field label={f.city} error={err.city} required>
      <input className="input" maxLength={60} {...reg('city')} />
    </Field>
    <Field label={f.address} error={err.address} required hint={f.addressHint}>
      <input className="input" maxLength={200} {...reg('address')} />
    </Field>
    <Field label={f.mapUrl} error={err.mapUrl} optional hint={f.mapHint} className="field-wide">
      <input className="input ltr-input" dir="ltr" type="url" inputMode="url" placeholder="https://maps.app.goo.gl/…" {...reg('mapUrl')} />
    </Field>
  </div>;
}

/** Adds a branch: its details, and optionally the tables of another branch (with new codes). */
export function CreateBranchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useCopy();
  const { text, count } = useLanguage();
  const toast = useToast();
  const list = useBranchList();
  const create = useCreateBranch();
  const main = list.branches.find(branch => branch.isMain) ?? list.branches[0];
  const [error, setError] = useState<unknown>(null);
  const slugTouched = useRef(false);
  const { register, handleSubmit, reset, watch, setValue, setError: setFieldError, formState: { errors, isSubmitting } } = useForm({
    resolver: schemaResolver(createBranchSchema),
    defaultValues: { name: '', slug: '', phone: '', whatsappNumber: null, city: main?.city ?? '', address: '', mapUrl: '', copyTablesFrom: undefined } as z.input<typeof createBranchSchema>,
  });
  useEffect(() => {
    if (!open) return;
    reset({ name: '', slug: '', phone: '', whatsappNumber: null, city: main?.city ?? '', address: '', mapUrl: '', copyTablesFrom: undefined });
    slugTouched.current = false;
    setError(null);
  }, [open, reset, main?.city]);
  const name = watch('name');
  const slug = watch('slug');
  // The link address follows the name until the owner types one (Arabic names give no suggestion).
  useEffect(() => {
    if (!slugTouched.current) setValue('slug', suggestBranchSlug(name ?? ''), { shouldValidate: false });
  }, [name, setValue]);
  const sources = list.branches.filter(branch => branch.tableCount > 0);
  const onSubmit = handleSubmit(async values => {
    setError(null);
    try {
      const branch = await create.mutateAsync(values);
      toast.success(fill(t.branchForm.created, { name: branch.name }));
      onClose();
    } catch (caught) {
      if (isApiError(caught, BRANCH_ERROR_CODES.BRANCH_SLUG_TAKEN)) setFieldError('slug', { type: 'server', message: errorMessage(caught, text) }, { shouldFocus: true });
      else if (!applyServerIssues(caught, setFieldError, [...DETAIL_FIELDS])) setError(caught);
    }
  });
  const suggested = suggestBranchSlug(name ?? '');
  const slugHint = !suggested && (name ?? '').trim() && !slug
    ? t.branchForm.slugArabic
    : fill(t.branchForm.slugHint, { url: branchLink(main?.publicUrl ?? '', slug ?? '') });
  return <Dialog open={open} onClose={onClose} busy={isSubmitting} onSubmit={() => void onSubmit()} title={t.branchForm.createTitle} size="wide"
    footer={<>
      <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>{t.branchForm.cancel}</Button>
      <Button type="submit" loading={isSubmitting} data-testid="create-branch-submit">{t.branchForm.submit}</Button>
    </>}>
    <div className="form">
      {error !== null && <Alert kind="error" actions={isApiError(error, BRANCH_ERROR_CODES.BRANCH_LIMIT_REACHED)
        ? <Link className="link-action" to="/subscription" onClick={onClose}>{t.branches.seePlans}</Link> : undefined}>{errorMessage(error, text)}</Alert>}
      <BranchDetailsFields register={register} errors={errors} slugHint={slugHint} autoFocus onSlugInput={() => { slugTouched.current = true; }} />
      {sources.length > 0 && <Field label={t.branchForm.copyTables} hint={t.branchForm.copyTablesHint}>
        <select className="select" {...register('copyTablesFrom', { setValueAs: value => value || undefined })} data-testid="copy-tables-from">
          <option value="">{t.branchForm.copyTablesNone}</option>
          {sources.map(branch => <option key={branch.id} value={branch.id}>{fill(t.branchForm.copyTablesOption, { name: branch.name, tables: count(branch.tableCount, 'table') })}</option>)}
        </select>
      </Field>}
      <p className="field-hint">{t.branchForm.laterHint}</p>
    </div>
  </Dialog>;
}
