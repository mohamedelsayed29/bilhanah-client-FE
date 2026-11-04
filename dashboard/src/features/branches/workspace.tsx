import { createContext, useContext } from 'react';
import type { BranchList, OwnerBranch, Permission, RestaurantRole } from '@bilhanah/contracts';
import { useBranchesQuery } from '../restaurant/queries';

/**
 * Who is running the dashboard and where their pages live. Owners and branch managers share
 * the orders board, tables, floor, branch menu, branch settings and insights; managers see
 * them under /manager, for their branch.
 */
export type Workspace = {
  /** OWNER for the owner's shell; a staff role under /manager. Pages ask `can`, never the role. */
  role: RestaurantRole;
  /** Whether the viewer holds a permission (from the server; the API checks it again on every request). */
  can: (permission: Permission) => boolean;
  /** `orderPrepMinutes`: the usual preparation time offered when accepting an order. */
  restaurant: { name: string; subdomain: string; logoUrl: string | null; brandColor: string | null; orderPrepMinutes: number | null };
  /** The first page this viewer may open (where a refused page sends them). */
  home: string;
  /** The owner-area path of a shared page, as this viewer's path (e.g. /orders → /manager). */
  to: (path: string) => string;
  /** Where this viewer changes a branch's hours and ordering. */
  branchSettings: (branchId: string) => string;
};

const WorkspaceContext = createContext<Workspace | null>(null);
export const WorkspaceProvider = WorkspaceContext.Provider;

/** Owner paths of the pages managers also have, and theirs. */
export function managerPath(path: string): string {
  const [pathname, search = ''] = path.split('?');
  const mapped = pathname === '/orders' ? '/manager'
    : pathname === '/branches/menu' ? '/manager/menu'
      : pathname!.startsWith('/branches/') ? '/manager/settings'
        : `/manager${pathname}`;
  return search ? `${mapped}?${search}` : mapped;
}

/** A permission check over a list of permissions. */
export const canWith = (permissions: readonly Permission[]) => {
  const held = new Set(permissions);
  return (permission: Permission) => held.has(permission);
};

export function ownerWorkspace(restaurant: Workspace['restaurant'], permissions: readonly Permission[], home = '/'): Workspace {
  return { role: 'OWNER', can: canWith(permissions), home, restaurant, to: path => path, branchSettings: branchId => `/branches/${branchId}` };
}

/** Staff accounts (managers, cashiers, waiters) work under /manager. */
export function managerWorkspace(restaurant: Workspace['restaurant'], role: RestaurantRole, permissions: readonly Permission[], home = '/manager'): Workspace {
  return { role, can: canWith(permissions), home, restaurant, to: managerPath, branchSettings: () => '/manager/settings' };
}

export function useWorkspace(): Workspace {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('WorkspaceProvider is required');
  return context;
}

/** The branch list inside a shell that loaded it (owner and manager shells). */
export function useBranchList(): BranchList {
  const { data } = useBranchesQuery();
  if (!data) throw new Error('useBranchList() is only available inside a shell that loads the branches.');
  return data;
}

export function useOwnerBranch(branchId: string | null): OwnerBranch | null {
  const list = useBranchList();
  return branchId ? list.branches.find(branch => branch.id === branchId) ?? null : null;
}
