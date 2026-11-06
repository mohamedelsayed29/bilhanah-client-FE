import type { Permission, PlanFeatures } from '@bilhanah/contracts';

/** Any of these opens the inventory section (the API answers the section's routes for each). */
export const INVENTORY_PERMISSIONS: Permission[] = ['inventory.view', 'inventory.waste', 'inventory.operate', 'inventory.manage', 'inventory.costs', 'inventory.approve'];
/** The section's own guard (inventory.waste and .operate come with inventory.view in every default role). */
export const INVENTORY_SECTION: Permission[] = ['inventory.view', 'inventory.manage', 'inventory.costs', 'inventory.approve'];

export type InventoryTabKey = 'overview' | 'stock' | 'counts' | 'waste' | 'purchases' | 'recipes' | 'ingredients' | 'transfers' | 'movements' | 'suppliers' | 'reports' | 'settings';

/** The section's pages in the order of the tabs; `need`: any one of them (the routes check the same). */
export const INVENTORY_TABS: { key: InventoryTabKey; path: string; need: Permission[]; multiBranch?: boolean }[] = [
  { key: 'overview', path: '/inventory', need: ['inventory.view'] },
  { key: 'stock', path: '/inventory/stock', need: ['inventory.view'] },
  { key: 'counts', path: '/inventory/counts', need: ['inventory.view'] },
  { key: 'waste', path: '/inventory/waste', need: ['inventory.view'] },
  { key: 'purchases', path: '/inventory/purchases', need: ['inventory.view'] },
  { key: 'recipes', path: '/inventory/recipes', need: ['inventory.view'] },
  { key: 'ingredients', path: '/inventory/ingredients', need: ['inventory.manage'] },
  { key: 'transfers', path: '/inventory/transfers', need: ['inventory.operate'], multiBranch: true },
  { key: 'movements', path: '/inventory/movements', need: ['inventory.view'] },
  { key: 'suppliers', path: '/inventory/suppliers', need: ['inventory.view'] },
  { key: 'reports', path: '/inventory/reports', need: ['inventory.view', 'inventory.costs'] },
  { key: 'settings', path: '/inventory/settings', need: ['inventory.manage'] },
];

type Can = (permission: Permission) => boolean;

/** The tabs a viewer sees: what their permissions allow, and transfers only with another branch to send to. */
export function visibleInventoryTabs(can: Can, { branchCount }: { branchCount: number }) {
  return INVENTORY_TABS.filter(tab => tab.need.some(can) && (!tab.multiBranch || branchCount > 1));
}

/** Whether the section is offered at all: the plan includes inventory and the viewer holds an inventory permission. */
export function inventoryOffered(can: Can, features: Pick<PlanFeatures, 'inventory'> | null | undefined): boolean {
  return Boolean(features?.inventory) && INVENTORY_SECTION.some(can);
}

/** Whether a kitchen screen links to its inventory pages (waste, counts, stock): the plan includes it and the account may see or record stock. */
export function kitchenInventoryOffered(permissions: readonly Permission[], features: Pick<PlanFeatures, 'inventory'> | null | undefined): boolean {
  return Boolean(features?.inventory) && permissions.some(permission => permission === 'inventory.view' || permission === 'inventory.waste');
}

/** What the viewer may do, so screens show only those buttons (the API checks again). */
export function inventoryActions(can: Can, { branchCount = 1 }: { branchCount?: number } = {}) {
  return {
    view: can('inventory.view'),
    /** Cost columns, values, prices and the cost reports; without it the API sends null, never 0. */
    costs: can('inventory.costs'),
    recordWaste: can('inventory.waste'),
    /** Typing counted quantities on an open count. */
    enterCounts: can('inventory.waste') || can('inventory.operate'),
    /** Receive and void deliveries, start, post and cancel counts. */
    operate: can('inventory.operate'),
    transfer: can('inventory.operate') && branchCount > 1,
    /** Ingredients, recipes, suppliers, reorder levels and settings. */
    manage: can('inventory.manage'),
    approve: can('inventory.approve'),
  };
}
export type InventoryActions = ReturnType<typeof inventoryActions>;

/**
 * What posting a count will do for this viewer: post at once, or wait for an approver when the
 * settings ask for approval and a line is off by more than the threshold.
 */
export function countPostOutcome({ requireApproval, linesOverThreshold, canApprove }: { requireApproval: boolean; linesOverThreshold: number; canApprove: boolean }): 'post' | 'approval' {
  return requireApproval && linesOverThreshold > 0 && !canApprove ? 'approval' : 'post';
}
