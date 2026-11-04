import type { BranchList, KitchenContext, OwnerBranch, RestaurantUpdatedEvent } from '@bilhanah/contracts';
import type { BoardScope } from '../restaurant/orders/board';

/** What the branch switcher and per-branch pages need to know about a branch. */
export type BranchOption = { id: string; name: string; slug: string; isMain: boolean; isActive: boolean };

export const toOption = (branch: Pick<OwnerBranch, 'id' | 'name' | 'slug' | 'isMain' | 'isActive'>): BranchOption =>
  ({ id: branch.id, name: branch.name, slug: branch.slug, isMain: branch.isMain, isActive: branch.isActive });

/** The branches a viewer can switch between: active ones, in the owner's order. */
export function switchableBranches(branches: readonly BranchOption[]): BranchOption[] {
  return branches.filter(branch => branch.isActive);
}

/**
 * The selection to use: staff tied to a branch always see it; otherwise a remembered branch that
 * still exists (and is active), else every branch. With a single branch there is nothing to choose.
 */
export function resolveSelection(stored: string | null, branches: readonly BranchOption[], lockedTo: string | null = null): BoardScope {
  if (lockedTo) return lockedTo;
  const choices = switchableBranches(branches);
  if (choices.length <= 1) return 'all';
  return stored && choices.some(branch => branch.id === stored) ? stored : 'all';
}

/**
 * The branch a per-branch page (tables, floor, QR codes, branch menu) works on: the selected one,
 * or the one picked on the page, or the main branch. Null only while there are no branches.
 */
export function pageBranchId(selected: BoardScope, picked: string | null, branches: readonly BranchOption[]): string | null {
  const choices = switchableBranches(branches);
  if (selected !== 'all' && branches.some(branch => branch.id === selected)) return selected;
  if (picked && choices.some(branch => branch.id === picked)) return picked;
  return (choices.find(branch => branch.isMain) ?? choices[0] ?? branches[0])?.id ?? null;
}

/** A branch's new ordering settings (realtime `restaurant.updated`) applied to the branch list. */
export function withBranchOrdering(list: BranchList, event: RestaurantUpdatedEvent): BranchList {
  if (!list.branches.some(branch => branch.id === event.branchId)) return list;
  return { ...list, branches: list.branches.map(branch => (branch.id === event.branchId ? { ...branch, ordering: event.ordering } : branch)) };
}

/** Whether a kitchen screen's settings follow this branch (its own branch, or the main one for all-branch accounts). */
export function contextFollowsBranch(context: Pick<KitchenContext, 'branch' | 'branches'>, branchId: string): boolean {
  const own = context.branch?.id ?? context.branches.find(branch => branch.isMain)?.id;
  return own === branchId;
}

/** A branch list in a new order (ids first to last), before the API confirms it. */
export function reorderedList(list: BranchList, ids: readonly string[]): BranchList {
  const byId = new Map(list.branches.map(branch => [branch.id, branch]));
  const ordered = ids.map(id => byId.get(id)).filter((branch): branch is OwnerBranch => Boolean(branch));
  const rest = list.branches.filter(branch => !ids.includes(branch.id));
  return { ...list, branches: [...ordered, ...rest] };
}
