import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { ArrowRightIcon, ArrowSquareOutIcon } from '@phosphor-icons/react';
import { BRANCH_ERROR_CODES, type OwnerBranch, OWNER_ONLY_BRANCH_FIELDS, type updateBranchSchema } from '@bilhanah/contracts';
import type { z } from 'zod';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { CopyButton } from '../../components/CopyButton';
import { PageHeader } from '../../components/PageHeader';
import { PageSkeleton } from '../../components/Skeleton';
import { Switch } from '../../components/Switch';
import { useToast } from '../../components/Toast';
import { isApiError } from '../../lib/api';
import { errorMessage } from '../../lib/api/error-messages';
import { fill, useCopy } from '../../lib/copy';
import { applyServerIssues, schemaResolver } from '../../lib/forms';
import { useLanguage, usePageTitle } from '../../lib/language';
import { OpeningHoursEditor } from '../restaurant/settings/OpeningHoursSettings';
import { OrderingSwitches } from '../restaurant/settings/OrderingSettings';
import { PageBranchPicker, usePageBranch } from './BranchScope';
import { useUpdateBranch } from './branch-mutations';
import { BranchDetailsFields, branchDetailsSchema, branchLink, DETAIL_FIELDS } from './CreateBranchDialog';
import { useBranchList, useOwnerBranch, useWorkspace } from './workspace';

type Update = z.output<typeof updateBranchSchema>;
type Details = z.output<typeof branchDetailsSchema>;

/** The owner's page for one branch (/branches/:branchId). */
export function OwnerBranchPage() {
  const t = useCopy();
  const { branchId = '' } = useParams();
  const branch = useOwnerBranch(branchId);
  if (!branch) {
    return <div className="page">
      <BackToBranches />
      <Alert kind="error" title={t.branchPage.notFound} live={false} />
    </div>;
  }
  return <BranchSettings key={branch.id} branch={branch} />;
}

/** A branch manager's settings for their branch (/manager/settings); managers of every branch pick one. */
export function ManagerBranchPage() {
  const page = usePageBranch();
  const branch = useOwnerBranch(page.branchId);
  if (!branch) return <PageSkeleton blocks={3} />;
  return <BranchSettings key={branch.id} branch={branch} picker={<PageBranchPicker page={page} />} />;
}

function BackToBranches() {
  const t = useCopy();
  return <div className="back-row"><Link to="/branches" className="back-link"><ArrowRightIcon size={16} className="directional" aria-hidden="true" />{t.branchPage.back}</Link></div>;
}

/** Only what changed, without the owner-only fields for managers. */
export function detailsChanges(branch: OwnerBranch, values: Details, owner: boolean): Update {
  const changes: Record<string, unknown> = {};
  for (const field of DETAIL_FIELDS) {
    if (!owner && (OWNER_ONLY_BRANCH_FIELDS as readonly string[]).includes(field)) continue;
    const before = field === 'whatsappNumber' ? branch.whatsappNumber : field === 'mapUrl' ? branch.mapUrl : branch[field];
    const after = values[field] ?? null;
    if ((before ?? null) !== after) changes[field] = after;
  }
  return changes as Update;
}

/**
 * Everything about one branch: details diners see, opening hours and ordering. Owners also see its
 * status (archived) and may rename it or change its link address; managers may not.
 */
function BranchSettings({ branch, picker }: { branch: OwnerBranch; picker?: ReactNode }) {
  const t = useCopy();
  const { text } = useLanguage();
  const toast = useToast();
  const workspace = useWorkspace();
  const owner = workspace.role === 'OWNER';
  const list = useBranchList();
  const main = list.branches.find(entry => entry.isMain) ?? branch;
  const { hash } = useLocation();
  usePageTitle(branch.name, branch.name);
  const details = useUpdateBranch();
  const hours = useUpdateBranch();
  const ordering = useUpdateBranch();
  const values = (): Details => ({ name: branch.name, slug: branch.slug, phone: branch.phone, whatsappNumber: branch.whatsappNumber, city: branch.city, address: branch.address, mapUrl: branch.mapUrl ?? '' });
  const { register, handleSubmit, reset, watch, setError, formState: { errors, isDirty, isSubmitting } } = useForm({
    resolver: schemaResolver(branchDetailsSchema),
    defaultValues: values(),
  });
  // The settings page and Settings links (#hours, #ordering) land on their section.
  useEffect(() => {
    if (!hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [hash]);
  const slug = watch('slug');
  const onSubmit = handleSubmit(async submitted => {
    const body = detailsChanges(branch, submitted, owner);
    if (Object.keys(body).length === 0) { reset(values()); return; }
    try {
      const saved = await details.mutateAsync({ branchId: branch.id, body });
      reset({ name: saved.name, slug: saved.slug, phone: saved.phone, whatsappNumber: saved.whatsappNumber, city: saved.city, address: saved.address, mapUrl: saved.mapUrl ?? '' });
      toast.success(t.branchPage.saved);
    } catch (caught) {
      if (isApiError(caught, BRANCH_ERROR_CODES.BRANCH_SLUG_TAKEN)) setError('slug', { type: 'server', message: errorMessage(caught, text) }, { shouldFocus: true });
      else applyServerIssues(caught, setError, [...DETAIL_FIELDS]);
    }
  });
  const saveOrdering = (body: Update) => ordering.mutate({ branchId: branch.id, body }, { onSuccess: () => toast.success(text('اتحفظت التغييرات', 'Changes saved')) });
  const slugHint = owner && slug !== branch.slug ? `${t.branchForm.slugChange} ${fill(t.branchForm.slugHint, { url: branchLink(main.publicUrl, slug ?? '') })}` : fill(t.branchForm.slugHint, { url: branch.publicUrl });
  const host = branch.publicUrl.replace(/^https?:\/\//, '');

  return <div className="page branch-settings-page">
    {owner && <BackToBranches />}
    <PageHeader title={owner ? <bdi>{branch.name}</bdi> : t.manager.settingsTitle}
      description={owner ? t.branches.description : t.manager.settingsDescription}
      actions={<a className="button button-secondary" href={branch.publicUrl} target="_blank" rel="noreferrer"><ArrowSquareOutIcon size={18} aria-hidden="true" />{t.branches.openPublic}</a>} />
    {picker}
    {!branch.isActive && <Alert kind="warning" live={false} title={t.branchPage.archivedNotice}
      actions={owner ? <Link className="link-action" to="/branches">{t.branchPage.back}</Link> : undefined} />}
    {!owner && <Alert kind="info" live={false}>{t.branchPage.managerNote}</Alert>}

    <div className="branch-link-row">
      <span className="muted">{t.branchPage.publicLink}</span>
      <span className="public-url ltr" data-testid="branch-public-url">{host}</span>
      <CopyButton value={branch.publicUrl} label={text('انسخ اللينك', 'Copy link')} />
    </div>

    <form className="settings-main" noValidate onSubmit={event => { event.preventDefault(); void onSubmit(); }} aria-labelledby="branch-details-title" id="details">
      <section className="section">
        <div className="section-head"><div><h2 id="branch-details-title">{t.branchPage.detailsTitle}</h2><p>{t.branchPage.detailsHint}</p></div></div>
        {details.isError && !isApiError(details.error, BRANCH_ERROR_CODES.BRANCH_SLUG_TAKEN) && <Alert kind="error">{errorMessage(details.error, text)}</Alert>}
        <BranchDetailsFields register={register} errors={errors} readOnlyIdentity={!owner} slugHint={slugHint} />
      </section>
      <div className={`sticky-actions ${isDirty ? 'is-dirty' : ''}`}>
        {isDirty && <span className="muted">{t.branchPage.unsaved}</span>}
        <Button variant="secondary" disabled={!isDirty || isSubmitting} onClick={() => reset(values())}>{t.branchPage.discard}</Button>
        <Button type="submit" loading={isSubmitting} disabled={!isDirty} data-testid="save-branch-details">{t.branchPage.saveDetails}</Button>
      </div>
    </form>

    <div id="hours" className="branch-settings-block">
      <OpeningHoursEditor key={JSON.stringify(branch.openingHours)} initial={branch.openingHours} saving={hours.isPending} error={hours.isError ? hours.error : null} title={t.branchPage.hoursTitle}
        onSave={openingHours => hours.mutate({ branchId: branch.id, body: { openingHours } }, { onSuccess: () => toast.success(text('اتحفظت التغييرات', 'Changes saved')) })} />
    </div>

    <div id="ordering" className="settings-main branch-settings-block">
      <section className="section" aria-labelledby="branch-ordering-title">
        <div className="section-head"><div><h2 id="branch-ordering-title">{t.branchPage.orderingTitle}</h2><p>{t.branchPage.orderingHint}</p></div></div>
        {branch.ordering.enabled && <Switch checked={!branch.ordering.paused} disabled={ordering.isPending} onChange={accepting => saveOrdering({ ordersPaused: !accepting })}
          label={t.branchPage.pauseLabel} description={branch.ordering.paused ? t.branchPage.pausedOn : t.branchPage.pausedOff} />}
      </section>
      <OrderingSwitches ordering={branch.ordering} busy={ordering.isPending} error={ordering.isError ? ordering.error : null} owner={owner}
        tablesPath={workspace.to('/tables')} onChange={saveOrdering} />
    </div>
  </div>;
}
