import { Link } from 'react-router';
import { ArrowLeftIcon } from '@phosphor-icons/react';
import { Alert } from '../../../components/Alert';
import { fill, useCopy } from '../../../lib/copy';
import { useLanguage } from '../../../lib/language';
import { useBranchList } from '../../branches/workspace';

/**
 * With several branches, opening hours and ordering belong to each branch: the restaurant's
 * settings page points to them (and shows where each branch stands) instead of editing the main one.
 */
export function PerBranchNotice({ kind }: { kind: 'hours' | 'ordering' }) {
  const t = useCopy();
  const { count } = useLanguage();
  const list = useBranchList();
  const active = list.branches.filter(branch => branch.isActive);
  const copy = t.settingsBranches;
  const status = (branch: (typeof active)[number]) => {
    if (kind === 'hours') return branch.openingHours ? copy.hoursShown : copy.hoursHidden;
    if (!branch.ordering.enabled) return copy.orderingOff;
    return branch.ordering.paused ? copy.paused : copy.orderingOn;
  };
  return <div className="settings-main" data-testid={`per-branch-${kind}`}>
    <Alert kind="info" live={false} title={kind === 'hours' ? copy.hoursTitle : copy.orderingTitle}
      actions={<Link className="link-action" to="/branches">{copy.goToBranches}<ArrowLeftIcon size={14} className="directional" aria-hidden="true" /></Link>}>
      {fill(kind === 'hours' ? copy.hoursBody : copy.orderingBody, { count: count(active.length, 'branch') })}
    </Alert>
    <ul className="per-branch-list">
      {active.map(branch => <li key={branch.id}>
        <span className="per-branch-name"><bdi>{branch.name}</bdi>{branch.isMain && <span className="badge badge-muted">{t.scope.main}</span>}</span>
        <span className="muted">{status(branch)}</span>
        <Link className="button button-secondary button-small" to={`/branches/${branch.id}#${kind}`} aria-label={fill(copy.editBranch, { name: branch.name })}>{copy.edit}</Link>
      </li>)}
    </ul>
  </div>;
}
