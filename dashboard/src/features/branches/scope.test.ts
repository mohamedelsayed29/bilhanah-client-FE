import { describe, expect, it } from 'vitest';
import type { BranchList, OwnerBranch } from '@bilhanah/contracts';
import { contextFollowsBranch, pageBranchId, reorderedList, resolveSelection, switchableBranches, withBranchOrdering, type BranchOption } from './scope';

const option = (id: string, extra: Partial<BranchOption> = {}): BranchOption => ({ id, name: id, slug: id, isMain: false, isActive: true, ...extra });
const main = option('main', { isMain: true });
const nasr = option('nasr');
const old = option('old', { isActive: false });

const ordering = { included: true, enabled: true, acceptsDineIn: true, acceptsPickup: true, paused: false };
const branch = (id: string, isMain = false): OwnerBranch => ({
  id, name: id, slug: id, isMain, isActive: true, phone: '0100', whatsappNumber: null, city: 'Cairo', address: 'Street 1', mapUrl: null,
  openingHours: null, ordering, publicUrl: `http://x/?b=${id}`, tableCount: 0, staffCount: 0, activeOrders: 0, createdAt: '2026-10-01T00:00:00.000Z',
});

describe('branch selection', () => {
  it('offers active branches in the owner’s order', () => {
    expect(switchableBranches([nasr, old, main]).map(entry => entry.id)).toEqual(['nasr', 'main']);
  });

  it('remembers a branch that still exists and is active, else shows every branch', () => {
    expect(resolveSelection('nasr', [main, nasr])).toBe('nasr');
    expect(resolveSelection('gone', [main, nasr])).toBe('all');
    expect(resolveSelection('old', [main, nasr, old])).toBe('all');
    expect(resolveSelection(null, [main, nasr])).toBe('all');
  });

  it('has nothing to choose with one branch, and staff tied to a branch always see theirs', () => {
    expect(resolveSelection('main', [main, old])).toBe('all');
    expect(resolveSelection(null, [nasr], 'nasr')).toBe('nasr');
    expect(resolveSelection('main', [main, nasr], 'nasr')).toBe('nasr');
  });

  it('gives per-branch pages the selected branch, else the one picked there, else the main one', () => {
    expect(pageBranchId('nasr', 'main', [main, nasr])).toBe('nasr');
    expect(pageBranchId('all', 'nasr', [main, nasr])).toBe('nasr');
    expect(pageBranchId('all', 'old', [main, nasr, old])).toBe('main');
    expect(pageBranchId('all', null, [nasr, main])).toBe('main');
    expect(pageBranchId('all', null, [])).toBeNull();
  });
});

describe('branch cache updates', () => {
  const list: BranchList = { branches: [branch('main', true), branch('nasr')], limit: 3, used: 2 };

  it('applies a realtime ordering change to its branch only', () => {
    const next = withBranchOrdering(list, { branchId: 'nasr', ordering: { ...ordering, paused: true } });
    expect(next.branches.map(entry => entry.ordering.paused)).toEqual([false, true]);
    expect(withBranchOrdering(list, { branchId: 'other', ordering })).toBe(list);
  });

  it('knows which branch a kitchen screen’s settings follow', () => {
    const branches = [{ id: 'main', name: 'Main', slug: 'main', isMain: true }, { id: 'nasr', name: 'Nasr', slug: 'nasr', isMain: false }];
    expect(contextFollowsBranch({ branch: null, branches }, 'main')).toBe(true);
    expect(contextFollowsBranch({ branch: null, branches }, 'nasr')).toBe(false);
    expect(contextFollowsBranch({ branch: branches[1]!, branches: [branches[1]!] }, 'nasr')).toBe(true);
  });

  it('reorders the list optimistically, keeping branches the order left out', () => {
    expect(reorderedList(list, ['nasr', 'main']).branches.map(entry => entry.id)).toEqual(['nasr', 'main']);
    expect(reorderedList(list, ['nasr']).branches.map(entry => entry.id)).toEqual(['nasr', 'main']);
  });
});
