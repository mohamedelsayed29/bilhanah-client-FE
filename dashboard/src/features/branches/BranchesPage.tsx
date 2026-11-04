import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { ArrowSquareOutIcon, ForkKnifeIcon, GearSixIcon, MapPinIcon, PhoneIcon, PlusIcon, StorefrontIcon, TableIcon } from '@phosphor-icons/react';
import { BRANCH_ERROR_CODES, type OwnerBranch } from '@bilhanah/contracts';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PageHeader } from '../../components/PageHeader';
import { Section } from '../../components/Section';
import { useToast } from '../../components/Toast';
import { isApiError } from '../../lib/api';
import { errorMessage } from '../../lib/api/error-messages';
import { fill, useCopy } from '../../lib/copy';
import { useLanguage, usePageTitle } from '../../lib/language';
import { DragHandle, SortableList, useSortableRow } from '../restaurant/menu/Sortable';
import { queryKeys } from '../restaurant/queries';
import { useBranchScope } from './BranchScope';
import { useMakeMainBranch, useRemoveBranch, useReorderBranches, useUpdateBranch } from './branch-mutations';
import { CreateBranchDialog } from './CreateBranchDialog';
import { useBranchList } from './workspace';

type Action = { kind: 'archive' | 'delete' | 'main'; branch: OwnerBranch };

/** Branches of the restaurant: plan usage, each branch at a glance, adding, ordering, archiving and the main branch. */
export function BranchesPage() {
  const t = useCopy();
  const { number, count, text } = useLanguage();
  usePageTitle(t.branches.title, t.branches.title);
  const toast = useToast();
  // Counts (orders on the board, tables, staff) move all day: fresh ones each time the page opens.
  const queryClient = useQueryClient();
  useEffect(() => { void queryClient.invalidateQueries({ queryKey: queryKeys.branches }); }, [queryClient]);
  const list = useBranchList();
  const [creating, setCreating] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [problem, setProblem] = useState<unknown>(null);
  const update = useUpdateBranch();
  const remove = useRemoveBranch();
  const makeMain = useMakeMainBranch();
  const reorder = useReorderBranches();
  const active = list.branches.filter(branch => branch.isActive);
  const archived = list.branches.filter(branch => !branch.isActive);
  const full = list.used >= list.limit;

  const restore = (branch: OwnerBranch) => {
    setProblem(null);
    update.mutate({ branchId: branch.id, body: { isActive: true } }, {
      onSuccess: saved => toast.success(fill(t.branches.restored, { name: saved.name })),
      onError: error => setProblem(error),
    });
  };
  const confirm = () => {
    if (!action) return;
    const { kind, branch } = action;
    const done = (message: string) => { toast.success(fill(message, { name: branch.name })); setAction(null); };
    if (kind === 'archive') update.mutate({ branchId: branch.id, body: { isActive: false } }, { onSuccess: () => done(t.branches.archived) });
    if (kind === 'delete') remove.mutate(branch, { onSuccess: () => done(t.branches.removed) });
    if (kind === 'main') makeMain.mutate(branch, { onSuccess: () => done(t.branches.madeMain) });
  };
  const busy = update.isPending || remove.isPending || makeMain.isPending;
  const actionError = action ? (action.kind === 'delete' ? remove.error : action.kind === 'main' ? makeMain.error : update.error) : null;
  const open = (next: Action) => { update.reset(); remove.reset(); makeMain.reset(); setAction(next); };

  return <div className="page branches-page">
    <PageHeader title={t.branches.title} description={t.branches.description}
      actions={<Button onClick={() => { setProblem(null); setCreating(true); }} disabled={full} icon={<PlusIcon size={18} weight="bold" aria-hidden="true" />} data-testid="add-branch">{t.branches.add}</Button>} />

    <div className="branch-usage" data-testid="branch-usage">
      <strong>{fill(t.branches.usage, { used: number(list.used), limit: count(list.limit, 'branch') })}</strong>
      <span className="bar-track" aria-hidden="true"><span className="bar-fill" style={{ width: `${list.limit ? Math.min(100, (list.used / list.limit) * 100) : 0}%` }} /></span>
    </div>

    {full && <Alert kind="info" live={false} title={list.limit === 0 ? undefined : t.branches.limitTitle}
      actions={<Link className="link-action" to="/subscription">{t.branches.seePlans}</Link>}>
      {list.limit === 0 ? t.branches.noAccess : fill(t.branches.limitBody, { limit: count(list.limit, 'branch') })}
    </Alert>}
    {problem !== null && <ProblemAlert error={problem} onClose={() => setProblem(null)} />}

    <Section id="active-branches-title" title={t.branches.usageLabel} description={active.length > 1 ? t.branches.reorderHint : t.branches.single}>
      <SortableList items={active} nameOf={branch => branch.name} onReorder={ids => reorder.mutate([...ids, ...archived.map(branch => branch.id)], { onSuccess: () => toast.success(t.branches.reordered) })}>
        <ol className="branch-list" aria-labelledby="active-branches-title">
          {active.map(branch => <BranchCard key={branch.id} branch={branch} sortable={active.length > 1} onAction={open} />)}
        </ol>
      </SortableList>
    </Section>

    {archived.length > 0 && <Section id="archived-branches-title" title={t.branches.archivedTitle} description={t.branches.archivedHint}>
      <ul className="branch-list">
        {archived.map(branch => <li key={branch.id} className="card branch-card is-archived" data-testid="branch-card" data-slug={branch.slug}>
          <div className="branch-card-head">
            <div className="branch-card-title">
              <h3><bdi>{branch.name}</bdi></h3>
              <span className="badge badge-muted">{t.branches.archivedBadge}</span>
            </div>
          </div>
          <BranchPlace branch={branch} />
          <div className="branch-card-actions">
            <Button small variant="secondary" loading={update.isPending && update.variables?.branchId === branch.id} onClick={() => restore(branch)}>{t.branches.restore}</Button>
            <Link className="button button-ghost button-small" to={`/branches/${branch.id}`}><GearSixIcon size={16} aria-hidden="true" />{t.branches.settings}</Link>
            <Button small variant="danger-outline" onClick={() => open({ kind: 'delete', branch })}>{t.branches.remove}</Button>
          </div>
        </li>)}
      </ul>
    </Section>}

    <CreateBranchDialog open={creating} onClose={() => setCreating(false)} />
    <ConfirmDialog open={action !== null} busy={busy} onCancel={() => setAction(null)} onConfirm={confirm}
      tone={action?.kind === 'main' ? 'primary' : 'danger'}
      title={action ? fill(action.kind === 'archive' ? t.branches.archiveTitle : action.kind === 'delete' ? t.branches.removeTitle : t.branches.mainTitle, { name: action.branch.name }) : ''}
      description={action?.kind === 'archive' ? t.branches.archiveBody : action?.kind === 'delete' ? t.branches.removeBody : t.branches.mainBody}
      confirmLabel={action?.kind === 'archive' ? t.branches.archiveConfirm : action?.kind === 'delete' ? t.branches.removeConfirm : t.branches.mainConfirm}>
      {actionError && <div className="confirm-error"><Alert kind="error">{errorMessage(actionError, text)}</Alert>
        {action && isApiError(actionError, BRANCH_ERROR_CODES.BRANCH_HAS_ORDERS) && action.branch.isActive
          && <Button small variant="secondary" onClick={() => open({ kind: 'archive', branch: action.branch })}>{t.branches.archiveInstead}</Button>}
        {isApiError(actionError, BRANCH_ERROR_CODES.BRANCH_HAS_STAFF) && <Link className="link-action" to="/settings/kitchen">{t.branches.goToTeam}</Link>}
      </div>}
    </ConfirmDialog>
  </div>;
}

/** An error from restoring a branch, with the way out (the plans page when the allowance is used up). */
function ProblemAlert({ error, onClose }: { error: unknown; onClose: () => void }) {
  const t = useCopy();
  const { text } = useLanguage();
  return <Alert kind="error" actions={<>
    {isApiError(error, BRANCH_ERROR_CODES.BRANCH_LIMIT_REACHED) && <Link className="link-action" to="/subscription">{t.branches.seePlans}</Link>}
    <button type="button" className="text-button" onClick={onClose}>{text('إخفاء', 'Dismiss')}</button>
  </>}>{errorMessage(error, text)}</Alert>;
}

function BranchPlace({ branch }: { branch: OwnerBranch }) {
  return <p className="branch-place">
    <span><MapPinIcon size={15} weight="bold" aria-hidden="true" /><bdi>{branch.city}</bdi> · <bdi>{branch.address}</bdi></span>
    <span><PhoneIcon size={15} weight="bold" aria-hidden="true" /><span className="ltr">{branch.phone}</span></span>
  </p>;
}

function BranchCard({ branch, sortable, onAction }: { branch: OwnerBranch; sortable: boolean; onAction: (action: Action) => void }) {
  const t = useCopy();
  const { number } = useLanguage();
  const scope = useBranchScope();
  const navigate = useNavigate();
  const { setNodeRef, style, isDragging, handle } = useSortableRow(branch.id);
  // Quick ways into the branch: they also switch the dashboard to it.
  const go = (path: string) => { scope.select(branch.id); navigate(path); };
  const headingId = `branch-${branch.id}`;
  const { ordering } = branch;
  return <li ref={setNodeRef} style={style} className={`card branch-card ${isDragging ? 'is-dragging' : ''}`} aria-labelledby={headingId} data-testid="branch-card" data-slug={branch.slug}>
    <div className="branch-card-head">
      {sortable && <DragHandle handle={handle} label={fill(t.branches.reorderLabel, { name: branch.name })} />}
      <span className="branch-card-icon" aria-hidden="true"><StorefrontIcon size={20} weight="bold" /></span>
      <div className="branch-card-title">
        <h3 id={headingId}><bdi>{branch.name}</bdi></h3>
        {branch.isMain && <span className="badge">{t.branches.mainBadge}</span>}
        {ordering.included && !ordering.enabled && <span className="badge badge-muted">{t.branches.orderingOffBadge}</span>}
        {ordering.included && ordering.enabled && ordering.paused && <span className="badge badge-warning">{t.branches.pausedBadge}</span>}
      </div>
      <a className="icon-button" href={branch.publicUrl} target="_blank" rel="noreferrer" aria-label={`${t.branches.openPublic}: ${branch.name}`} title={t.branches.openPublic}>
        <ArrowSquareOutIcon size={19} aria-hidden="true" />
      </a>
    </div>
    <BranchPlace branch={branch} />
    <dl className="branch-stats">
      <div><dt>{t.branches.statActiveOrders}</dt><dd>{number(branch.activeOrders)}</dd></div>
      <div><dt>{t.branches.statTables}</dt><dd>{number(branch.tableCount)}</dd></div>
      <div><dt>{t.branches.statStaff}</dt><dd>{number(branch.staffCount)}</dd></div>
    </dl>
    <div className="branch-card-actions">
      <Link className="button button-secondary button-small" to={`/branches/${branch.id}`} data-testid="branch-settings"><GearSixIcon size={16} aria-hidden="true" />{t.branches.settings}</Link>
      <button type="button" className="button button-ghost button-small" onClick={() => go('/branches/menu')}><ForkKnifeIcon size={16} aria-hidden="true" />{t.branches.menu}</button>
      <button type="button" className="button button-ghost button-small" onClick={() => go('/tables')}><TableIcon size={16} aria-hidden="true" />{t.branches.tables}</button>
    </div>
    {!branch.isMain && <div className="branch-card-more">
      <button type="button" className="text-button" onClick={() => onAction({ kind: 'main', branch })}>{t.branches.makeMain}</button>
      <button type="button" className="text-button" onClick={() => onAction({ kind: 'archive', branch })}>{t.branches.archive}</button>
      <button type="button" className="text-button text-button-danger" onClick={() => onAction({ kind: 'delete', branch })}>{t.branches.remove}</button>
    </div>}
  </li>;
}
