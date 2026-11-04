import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { StorefrontIcon } from '@phosphor-icons/react';
import { useCopy } from '../../lib/copy';
import type { BoardScope } from '../restaurant/orders/board';
import { type BranchOption, pageBranchId, resolveSelection, switchableBranches } from './scope';

type ScopeValue = {
  /** Every branch the viewer knows about (owners: archived ones too), in the owner's order. */
  branches: BranchOption[];
  /** The ones the switcher offers (active). */
  choices: BranchOption[];
  /** 'all', or the id of the branch pages show. */
  selected: BoardScope;
  select: (scope: BoardScope) => void;
  /** Staff tied to one branch: nothing to switch. */
  locked: boolean;
  /** There is something to choose between (more than one active branch, not locked). */
  multi: boolean;
  /** The selected branch, or the only one; null while every branch of several is shown. */
  branch: BranchOption | null;
  nameOf: (branchId: string) => string | null;
};

const ScopeContext = createContext<ScopeValue | null>(null);

function readStored(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

/**
 * The branch the dashboard is working on, remembered on this device (per account).
 * `lockedTo`: staff tied to a branch always work on it.
 */
export function BranchScopeProvider({ branches, lockedTo = null, storageKey, children }: {
  branches: readonly BranchOption[]; lockedTo?: string | null; storageKey: string; children: ReactNode;
}) {
  const [stored, setStored] = useState<string | null>(() => readStored(storageKey));
  useEffect(() => setStored(readStored(storageKey)), [storageKey]);
  const select = useCallback((scope: BoardScope) => {
    setStored(scope === 'all' ? null : scope);
    try {
      if (scope === 'all') localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, scope);
    } catch { /* Storage is optional. */ }
  }, [storageKey]);
  const value = useMemo<ScopeValue>(() => {
    const choices = switchableBranches(branches);
    const selected = resolveSelection(stored, branches, lockedTo);
    const branch = selected !== 'all'
      ? branches.find(entry => entry.id === selected) ?? null
      : choices.length === 1 ? choices[0]! : null;
    return {
      branches: [...branches],
      choices,
      selected,
      select,
      locked: lockedTo !== null,
      multi: lockedTo === null && choices.length > 1,
      branch,
      nameOf: branchId => branches.find(entry => entry.id === branchId)?.name ?? null,
    };
  }, [branches, stored, lockedTo, select]);
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function useBranchScope(): ScopeValue {
  const context = useContext(ScopeContext);
  if (!context) throw new Error('BranchScopeProvider is required');
  return context;
}

/**
 * For pages that work on one branch (tables, floor, QR codes, branch menu, branch settings):
 * the selected branch, else the one picked on the page (kept in `?branch=`), else the main one.
 */
export function usePageBranch() {
  const scope = useBranchScope();
  const [params, setParams] = useSearchParams();
  const branchId = pageBranchId(scope.selected, params.get('branch'), scope.branches);
  const pick = useCallback((id: string) => setParams(current => {
    const next = new URLSearchParams(current);
    next.set('branch', id);
    return next;
  }, { replace: true }), [setParams]);
  return {
    branchId,
    branch: scope.branches.find(entry => entry.id === branchId) ?? null,
    /** Every branch of several is selected, so the page offers its own picker. */
    needsPicker: scope.multi && scope.selected === 'all',
    pick,
  };
}

/** The shell's branch switcher (a native select, so it works the same everywhere); nothing with one branch. */
export function BranchSwitcher({ className = '' }: { className?: string }) {
  const t = useCopy();
  const scope = useBranchScope();
  const id = useId();
  if (!scope.multi) return null;
  return <div className={`branch-switch ${className}`} data-testid="branch-switcher">
    <label htmlFor={id} className="branch-switch-label">
      <StorefrontIcon size={18} weight="bold" aria-hidden="true" />
      <span>{t.scope.label}</span>
    </label>
    <select id={id} className="select branch-switch-select" value={scope.selected} onChange={event => scope.select(event.target.value)}>
      <option value="all">{t.scope.all}</option>
      {scope.choices.map(branch => <option key={branch.id} value={branch.id}>{branch.isMain ? `${branch.name} (${t.scope.main})` : branch.name}</option>)}
    </select>
  </div>;
}

/** A per-page branch choice: buttons for a few branches, a select for more. */
export function BranchPicker({ value, onChange, label, hint, branches }: {
  value: string | null; onChange: (branchId: string) => void; label?: string; hint?: string;
  /** Defaults to the switchable branches. */
  branches?: readonly BranchOption[];
}) {
  const t = useCopy();
  const scope = useBranchScope();
  const id = useId();
  const options = branches ?? scope.choices;
  const title = label ?? t.scope.pick;
  if (options.length <= 3) {
    return <div className="branch-picker" data-testid="branch-picker">
      <div className="branch-picker-head"><strong id={id}>{title}</strong>{hint && <small>{hint}</small>}</div>
      <div className="segmented branch-picker-options" role="radiogroup" aria-labelledby={id}>
        {options.map(branch => <label key={branch.id}>
          <input type="radio" name={id} value={branch.id} checked={value === branch.id} onChange={() => onChange(branch.id)} />
          <bdi>{branch.name}</bdi>
        </label>)}
      </div>
    </div>;
  }
  return <div className="branch-picker" data-testid="branch-picker">
    <div className="branch-picker-head"><label htmlFor={id}><strong>{title}</strong></label>{hint && <small>{hint}</small>}</div>
    <select id={id} className="select branch-picker-select" value={value ?? ''} onChange={event => onChange(event.target.value)}>
      {options.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
    </select>
  </div>;
}

/** The picker a per-branch page shows when every branch is selected in the shell. */
export function PageBranchPicker({ page }: { page: ReturnType<typeof usePageBranch> }) {
  const t = useCopy();
  if (!page.needsPicker) return null;
  return <BranchPicker value={page.branchId} onChange={page.pick} hint={t.scope.pickHint} />;
}
