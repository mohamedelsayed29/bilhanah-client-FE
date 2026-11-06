import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS, type CostingRow, type InventoryDish, type MenuEngineeringRow, type Permission } from '@bilhanah/contracts';
import { canWith } from '../branches/workspace';
import { compileQty, defaultUnitKey } from './doc-lines';
import { countPostOutcome, inventoryActions, inventoryOffered, kitchenInventoryOffered, visibleInventoryTabs } from './access';
import { arrangeCosting, costingFlag, foodCostPercent, foodCostTone, groupByCategory, lineUsage, marginOf, previewRecipeCost } from './costing';
import { engineeringSummary, groupByClass, MATRIX_LAYOUT, sortEngineering } from './menu-engineering';
import {
  costPerBase, costPerDisplayUnit, egpInput, formatInUnit, formatPercent, formatQuantity, fromBaseInput, parseEgp, parseQuantity, preferredUnitKey, roundTo, toBase, unitLabel, unitOptions,
} from './units';

const kilo = { id: 'u-kg', nameAr: 'كيلو', nameEn: 'kg', factor: 1000 };
const sack = { id: 'u-sack', nameAr: 'شوال ٢٥ كيلو', nameEn: '25 kg sack', factor: 25000 };

describe('units', () => {
  it('rounds without floating-point noise', () => {
    expect(roundTo(0.1 + 0.2, 3)).toBe(0.3);
    expect(roundTo(1.0005, 3)).toBe(1.001);
    expect(roundTo(-2.5, 0)).toBe(-3);
    expect(roundTo(-0.0001, 2)).toBe(0);
  });

  it('offers the base unit, kilos or litres, and the ingredient’s own units', () => {
    expect(unitOptions('g', [sack]).map(option => option.key)).toEqual(['base', 'large', 'u-sack']);
    // An own kilo replaces the generic one, and is sent with its id.
    const own = unitOptions('g', [kilo, sack]);
    expect(own.map(option => option.key)).toEqual(['base', 'u-kg', 'u-sack']);
    expect(own[1]).toMatchObject({ unitId: 'u-kg', factor: 1000 });
    expect(unitOptions('pcs', []).map(option => option.key)).toEqual(['base']);
    expect(unitOptions('ml', [], { purchaseUnits: false }).map(option => option.label[1])).toEqual(['ml', 'l']);
    expect(preferredUnitKey(own, 'g')).toBe('u-kg');
    expect(preferredUnitKey(unitOptions('g', []), 'g')).toBe('large');
    expect(preferredUnitKey(unitOptions('pcs', []), 'pcs')).toBe('base');
  });

  it('parses quantities typed with Arabic digits and converts them to base units', () => {
    expect(parseQuantity('٢٫٥')).toBe(2.5);
    expect(parseQuantity('2,5')).toBe(2.5);
    expect(parseQuantity(' 12 ')).toBe(12);
    expect(parseQuantity('-1')).toBeNull();
    expect(parseQuantity('abc')).toBeNull();
    expect(parseQuantity('')).toBeNull();
    expect(toBase(2.5, 1000)).toBe(2500);
    expect(toBase(1.1, 3)).toBe(3.3);
    expect(toBase(0.3333, 1)).toBe(0.333);
    expect(fromBaseInput(2500, 1000)).toBe('2.5');
    expect(fromBaseInput(1999.999, 1000)).toBe('1.999999');
    expect(fromBaseInput(null, 1000)).toBe('');
  });

  it('formats quantities in the unit they read best in', () => {
    expect(formatQuantity(49274, 'g', 'en')).toBe('49.274 kg');
    expect(formatQuantity(5974.24, 'ml', 'en')).toBe('5.974 l');
    expect(formatQuantity(8.889, 'g', 'en')).toBe('8.9 g');
    expect(formatQuantity(12, 'pcs', 'en')).toBe('12 pcs');
    expect(formatQuantity(-1500, 'g', 'en')).toBe('-1.5 kg');
    expect(formatQuantity(250, 'g', 'en', { signed: true })).toBe('+250 g');
    expect(formatQuantity(2500, 'g', 'ar')).toBe('٢٫٥ كيلو');
  });

  it('turns unit costs into prices per kilo, litre or piece and back', () => {
    expect(costPerDisplayUnit(3.2, 'g')).toEqual({ piastres: 3200, label: ['كيلو', 'kg'] });
    expect(costPerDisplayUnit(9.975, 'ml').piastres).toBe(9975);
    expect(costPerDisplayUnit(150, 'pcs').piastres).toBe(150);
    expect(costPerBase(3257, 'g')).toBe(3.257);
    expect(costPerBase(150, 'pcs')).toBe(150);
  });

  it('parses pounds to piastres with the allowed precision', () => {
    expect(parseEgp('12.5')).toBe(1250);
    expect(parseEgp('٤٥٫٥٠')).toBe(4550);
    expect(parseEgp('12.345')).toBeNull();
    expect(parseEgp('0.1234', 4)).toBe(12.34);
    expect(parseEgp('')).toBeNull();
    expect(egpInput(1250)).toBe('12.5');
    expect(egpInput(null)).toBe('');
  });

  it('formats food cost percentages', () => {
    expect(formatPercent(38.84, 'en')).toBe('38.8%');
    expect(formatPercent(null, 'en')).toBe('—');
    expect(formatPercent(7.63, 'ar')).toMatch(/^٧٫٦٪/);
  });
});

describe('recipe cost preview', () => {
  const costs: Record<string, number | null> = { rice: 3.2, sauce: 3.0465, unknown: null };

  it('applies the waste percentage to the usage', () => {
    expect(lineUsage(100, 10)).toBe(111.111);
    expect(lineUsage(100, 0)).toBe(100);
    expect(lineUsage(100, 95)).toBe(1000);
  });

  it('adds the lines at the branch’s unit costs, as the server does', () => {
    const preview = previewRecipeCost([{ ingredientId: 'rice', quantity: 90, wastePercent: 0 }, { ingredientId: 'sauce', quantity: 80, wastePercent: 0 }], id => costs[id]);
    expect(preview.cost).toBe(531.72);
    expect(preview.incomplete).toBe(false);
    expect(preview.lines.map(line => line.cost)).toEqual([288, 243.72]);
  });

  it('marks the cost incomplete when a line has no unit cost yet', () => {
    const preview = previewRecipeCost([{ ingredientId: 'rice', quantity: 100, wastePercent: 10 }, { ingredientId: 'unknown', quantity: 5, wastePercent: 0 }], id => costs[id]);
    expect(preview.cost).toBe(355.56);
    expect(preview.incomplete).toBe(true);
    expect(preview.lines[1]).toEqual({ usage: 5, cost: null });
  });

  it('computes food cost and margin against a price', () => {
    expect(foodCostPercent(1359.53, 3500)).toBe(38.84);
    expect(foodCostPercent(100, 0)).toBeNull();
    expect(marginOf(1359.53, 3500)).toBe(2140.47);
    expect(foodCostTone(29)).toBe('good');
    expect(foodCostTone(38.8)).toBe('watch');
    expect(foodCostTone(57.2)).toBe('high');
    expect(foodCostTone(null)).toBe('none');
  });

  const row = (variantId: string, extra: Partial<CostingRow> = {}): CostingRow => ({
    itemId: variantId, variantId, categoryNameAr: 'أطباق', itemNameAr: variantId, itemNameEn: variantId, variantNameAr: null, variantNameEn: null,
    pricePiastres: 1000, hasRecipe: true, recipeCost: 300, foodCostPercent: 30, marginPiastres: 700, incomplete: false, ...extra,
  });
  const rows = [
    row('a', { foodCostPercent: 45, marginPiastres: 550 }),
    row('b', { hasRecipe: false, recipeCost: null, foodCostPercent: null, marginPiastres: null }),
    row('c', { foodCostPercent: 12, marginPiastres: 880, incomplete: true }),
    row('d', { foodCostPercent: 30, itemNameEn: 'Koshary' }),
  ];

  it('flags dishes without a recipe or with an incomplete one', () => {
    expect(rows.map(costingFlag)).toEqual([null, 'NO_RECIPE', 'INCOMPLETE', null]);
  });

  it('sorts by food cost with dishes without a figure last, and filters', () => {
    expect(arrangeCosting(rows, 'all', 'foodCostDesc').map(entry => entry.variantId)).toEqual(['a', 'd', 'c', 'b']);
    expect(arrangeCosting(rows, 'all', 'foodCostAsc').map(entry => entry.variantId)).toEqual(['c', 'd', 'a', 'b']);
    expect(arrangeCosting(rows, 'all', 'marginAsc').map(entry => entry.variantId)).toEqual(['a', 'd', 'c', 'b']);
    expect(arrangeCosting(rows, 'all', 'menu').map(entry => entry.variantId)).toEqual(['a', 'b', 'c', 'd']);
    expect(arrangeCosting(rows, 'missing', 'menu').map(entry => entry.variantId)).toEqual(['b']);
    expect(arrangeCosting(rows, 'incomplete', 'menu').map(entry => entry.variantId)).toEqual(['c']);
    expect(arrangeCosting(rows, 'high', 'menu').map(entry => entry.variantId)).toEqual(['a']);
    expect(arrangeCosting(rows, 'all', 'menu', 'kosh').map(entry => entry.variantId)).toEqual(['d']);
  });
});

describe('menu engineering presentation', () => {
  const dish = (itemId: string, extra: Partial<MenuEngineeringRow>): MenuEngineeringRow => ({
    itemId, nameAr: itemId, nameEn: itemId, sold: 10, revenue: 10000, cost: 3000, unitMargin: 700, totalMargin: 7000, share: 0.25, foodCostPercent: 30, class: 'STAR', ...extra,
  });
  const rows = [
    dish('star-small', { totalMargin: 1000 }),
    dish('star-big', { totalMargin: 9000, sold: 40 }),
    dish('horse', { class: 'PLOWHORSE', totalMargin: 3000 }),
    dish('dog', { class: 'DOG', totalMargin: -500 }),
    dish('new', { class: null, cost: null, unitMargin: null, totalMargin: null, share: null, foodCostPercent: null, sold: 3 }),
  ];

  it('groups dishes by class, best margin first, and keeps unclassified ones apart', () => {
    const groups = groupByClass(rows);
    expect(groups.STAR.map(row => row.itemId)).toEqual(['star-big', 'star-small']);
    expect(groups.PUZZLE).toEqual([]);
    expect(groups.unclassified.map(row => row.itemId)).toEqual(['new']);
  });

  it('counts each quadrant and its share of the margin', () => {
    const summary = engineeringSummary({ rows });
    expect(summary.counts).toEqual({ STAR: 2, PLOWHORSE: 1, PUZZLE: 0, DOG: 1 });
    expect(summary.classified).toBe(4);
    expect(summary.unclassified).toBe(1);
    // Losses are not a share: 10000 of 13000 positive margin.
    expect(summary.marginShare.STAR).toBe(76.9);
    expect(summary.marginShare.DOG).toBe(0);
    expect(summary.empty).toBe(false);
    expect(engineeringSummary({ rows: [rows[4]!] }).empty).toBe(true);
  });

  it('lays the matrix out with high margin on top and popular dishes on the end side', () => {
    expect(MATRIX_LAYOUT.flat()).toEqual(['PUZZLE', 'STAR', 'DOG', 'PLOWHORSE']);
  });

  it('sorts the per-dish table, unclassified dishes last', () => {
    expect(sortEngineering(rows, 'sold').map(row => row.itemId)).toEqual(['star-big', 'star-small', 'horse', 'dog', 'new']);
    expect(sortEngineering(rows, 'margin').map(row => row.itemId)).toEqual(['star-big', 'horse', 'star-small', 'dog', 'new']);
  });
});

describe('permission gating', () => {
  const tabs = (permissions: readonly Permission[], branchCount = 2) => visibleInventoryTabs(canWith(permissions), { branchCount }).map(tab => tab.key);

  it('gives the owner every page, transfers only with a second branch', () => {
    expect(tabs(ROLE_PERMISSIONS.OWNER)).toEqual(['overview', 'stock', 'counts', 'waste', 'purchases', 'recipes', 'ingredients', 'transfers', 'movements', 'suppliers', 'reports', 'settings']);
    expect(tabs(ROLE_PERMISSIONS.OWNER, 1)).not.toContain('transfers');
  });

  it('keeps the catalogue and settings for managers of inventory, transfers for operators', () => {
    const manager = tabs(ROLE_PERMISSIONS.MANAGER);
    expect(manager).toContain('transfers');
    expect(manager).not.toContain('ingredients');
    expect(manager).not.toContain('settings');
    const kitchen = tabs(ROLE_PERMISSIONS.KITCHEN);
    expect(kitchen).toEqual(['overview', 'stock', 'counts', 'waste', 'purchases', 'recipes', 'movements', 'suppliers', 'reports']);
    expect(tabs(ROLE_PERMISSIONS.CASHIER)).toEqual([]);
  });

  it('shows the actions each role may take', () => {
    const kitchen = inventoryActions(canWith(ROLE_PERMISSIONS.KITCHEN), { branchCount: 2 });
    expect(kitchen).toMatchObject({ view: true, costs: false, recordWaste: true, enterCounts: true, operate: false, transfer: false, manage: false, approve: false });
    const manager = inventoryActions(canWith(ROLE_PERMISSIONS.MANAGER), { branchCount: 2 });
    expect(manager).toMatchObject({ costs: true, operate: true, transfer: true, manage: false, approve: false });
    expect(inventoryActions(canWith(ROLE_PERMISSIONS.MANAGER), { branchCount: 1 }).transfer).toBe(false);
    // A cashier granted only waste can record waste and enter counts, nothing else.
    expect(inventoryActions(canWith(['inventory.waste']))).toMatchObject({ view: false, recordWaste: true, enterCounts: true, operate: false });
  });

  it('offers the section only when the plan includes inventory', () => {
    const owner = canWith(ROLE_PERMISSIONS.OWNER);
    expect(inventoryOffered(owner, { inventory: true })).toBe(true);
    expect(inventoryOffered(owner, { inventory: false })).toBe(false);
    expect(inventoryOffered(canWith(ROLE_PERMISSIONS.CASHIER), { inventory: true })).toBe(false);
    // Staff shells read the plan from their context (no probing an inventory route).
    expect(inventoryOffered(canWith(ROLE_PERMISSIONS.MANAGER), { inventory: true })).toBe(true);
    expect(inventoryOffered(canWith(ROLE_PERMISSIONS.MANAGER), undefined)).toBe(false);
  });

  it('links a kitchen screen to its inventory pages with the plan and a stock permission', () => {
    expect(kitchenInventoryOffered(ROLE_PERMISSIONS.KITCHEN, { inventory: true })).toBe(true);
    expect(kitchenInventoryOffered(ROLE_PERMISSIONS.KITCHEN, { inventory: false })).toBe(false);
    expect(kitchenInventoryOffered(['inventory.waste'], { inventory: true })).toBe(true);
    expect(kitchenInventoryOffered(['orders.view'], { inventory: true })).toBe(false);
  });

  it('says when posting a count will wait for approval', () => {
    expect(countPostOutcome({ requireApproval: true, linesOverThreshold: 2, canApprove: false })).toBe('approval');
    expect(countPostOutcome({ requireApproval: true, linesOverThreshold: 2, canApprove: true })).toBe('post');
    expect(countPostOutcome({ requireApproval: true, linesOverThreshold: 0, canApprove: false })).toBe('post');
    expect(countPostOutcome({ requireApproval: false, linesOverThreshold: 3, canApprove: false })).toBe('post');
  });
});

describe('unit names', () => {
  it('shows the English name in English, the Arabic one when there is none', () => {
    expect(unitLabel({ unitNameAr: 'شيكارة ٢٥ كيلو', unitNameEn: '25 kg sack' })).toEqual(['شيكارة ٢٥ كيلو', '25 kg sack']);
    expect(unitLabel({ unitNameAr: 'كيس', unitNameEn: null })).toEqual(['كيس', 'كيس']);
    expect(unitLabel({ unitNameAr: 'كيس', unitNameEn: '  ' })).toEqual(['كيس', 'كيس']);
    expect(formatInUnit(2, unitLabel({ unitNameAr: 'شيكارة', unitNameEn: 'sack' }), 'en')).toMatch(/^2\ssack$/);
    expect(formatInUnit(2, unitLabel({ unitNameAr: 'شيكارة', unitNameEn: 'sack' }), 'ar')).toMatch(/\sشيكارة$/);
  });
});

describe('dish list', () => {
  const dish = (variantId: string, categoryId: string, categoryNameAr: string): InventoryDish => ({
    itemId: `item-${variantId}`, variantId, categoryId, categoryNameAr, categoryNameEn: null, itemNameAr: 'طبق', itemNameEn: null,
    variantNameAr: null, variantNameEn: null, hasRecipe: true, lines: [],
  });

  it('groups sizes by category in menu order, keeping categories with the same name apart', () => {
    const groups = groupByCategory([dish('a', 'c1', 'رئيسي'), dish('b', 'c2', 'حلو'), dish('c', 'c1', 'رئيسي'), dish('d', 'c3', 'حلو')]);
    expect(groups.map(group => [group.id, group.sizes.map(size => size.variantId)])).toEqual([['c1', ['a', 'c']], ['c2', ['b']], ['c3', ['d']]]);
  });
});

describe('document lines', () => {
  const rice = { baseUnit: 'g' as const, units: [kilo, sack] };
  const salt = { baseUnit: 'g' as const, units: [] };

  it('sends own units with their id and everything else in base units', () => {
    expect(compileQty({ quantity: '2', unitKey: 'u-sack' }, rice)).toMatchObject({ unitId: 'u-sack', quantity: 2, base: 50000 });
    expect(compileQty({ quantity: '1.5', unitKey: 'large' }, salt)).toMatchObject({ unitId: null, quantity: 1500, base: 1500 });
    expect(compileQty({ quantity: '250', unitKey: 'base' }, salt)).toMatchObject({ unitId: null, quantity: 250 });
    expect(compileQty({ quantity: '0', unitKey: 'base' }, salt)).toBeNull();
    expect(compileQty({ quantity: 'x', unitKey: 'base' }, salt)).toBeNull();
    expect(compileQty({ quantity: '1', unitKey: 'base' }, undefined)).toBeNull();
  });

  it('starts deliveries in the first purchase unit, other lines in kilos', () => {
    expect(defaultUnitKey(rice, true)).toBe('u-kg');
    expect(defaultUnitKey(salt, true)).toBe('large');
    expect(defaultUnitKey(salt)).toBe('large');
  });
});
