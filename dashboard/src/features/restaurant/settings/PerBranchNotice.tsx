import { Link } from 'react-router';
import { ArrowLeftIcon, StorefrontIcon } from '@phosphor-icons/react';
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
  const status = (branch: (typeof active)[number]): [string, 'on' | 'off' | 'paused'] => {
    if (kind === 'hours') return branch.openingHours ? [copy.hoursShown, 'on'] : [copy.hoursHidden, 'off'];
    if (!branch.ordering.enabled) return [copy.orderingOff, 'off'];
    return branch.ordering.paused ? [copy.paused, 'paused'] : [copy.orderingOn, 'on'];
  };
  return <section className="card inv-set-card per-branch-card" aria-labelledby={`per-branch-${kind}-title`} data-testid={`per-branch-${kind}`}>
    <div className="per-branch-head">
      <span className="inv-set-head-icon" aria-hidden="true"><StorefrontIcon size={20} /></span>
      <div><h2 id={`per-branch-${kind}-title`}>{kind === 'hours' ? copy.hoursTitle : copy.orderingTitle}</h2>
        <p>{fill(kind === 'hours' ? copy.hoursBody : copy.orderingBody, { count: count(active.length, 'branch') })}</p></div>
      <Link className="link-action" to="/branches">{copy.goToBranches}<ArrowLeftIcon size={14} className="directional" aria-hidden="true" /></Link>
    </div>
    <ul className="per-branch-list">
      {active.map(branch => <li key={branch.id}>
        <span className="per-branch-name"><bdi>{branch.name}</bdi>{branch.isMain && <span className="badge badge-muted">{t.scope.main}</span>}</span>
        <span className={`per-branch-status is-${status(branch)[1]}`}>{status(branch)[0]}</span>
        <Link className="button button-secondary button-small" to={`/branches/${branch.id}#${kind}`} aria-label={fill(copy.editBranch, { name: branch.name })}>{copy.edit}</Link>
      </li>)}
    </ul>
  </section>;
}
