import { MENU_ENGINEERING_CLASSES, type MenuEngineeringClass, type MenuEngineeringReport, type MenuEngineeringRow } from '@bilhanah/contracts';

type Label = [ar: string, en: string];

/**
 * How each class of the popularity × margin matrix reads on screen, and what an owner usually
 * does about it. The quadrants are placed as on a chart: popularity across, margin up.
 */
export const CLASS_PRESENTATION: Record<MenuEngineeringClass, { tone: 'success' | 'info' | 'warning' | 'danger'; popular: boolean; profitable: boolean; advice: Label }> = {
  STAR: { tone: 'success', popular: true, profitable: true, advice: ['بيتباع كتير وبيكسب كويس. خلّيه زي ما هو وحطه قدام في المنيو.', 'Sells well and earns well. Keep it as it is and feature it.'] },
  PLOWHORSE: { tone: 'warning', popular: true, profitable: false, advice: ['الناس بتحبه بس مكسبه قليل. راجع السعر أو تكلفة الوصفة.', 'Popular but earns little. Review its price or its recipe cost.'] },
  PUZZLE: { tone: 'info', popular: false, profitable: true, advice: ['مكسبه حلو بس قليل اللي بيطلبه. رشّحه أكتر أو غيّر مكانه في المنيو.', 'Earns well but few order it. Recommend it more or move it up the menu.'] },
  DOG: { tone: 'danger', popular: false, profitable: false, advice: ['قليل في البيع والمكسب. فكّر تغيّره أو تشيله.', 'Sells little and earns little. Consider reworking or removing it.'] },
};

/** The matrix as it is drawn: top row high margin (Puzzle, Star), bottom row low margin (Dog, Plowhorse). */
export const MATRIX_LAYOUT: MenuEngineeringClass[][] = [['PUZZLE', 'STAR'], ['DOG', 'PLOWHORSE']];

export type EngineeringGroups = Record<MenuEngineeringClass, MenuEngineeringRow[]> & { unclassified: MenuEngineeringRow[] };

/** Dishes by class (best margin first within each); dishes without a recipe cost apart. */
export function groupByClass(rows: readonly MenuEngineeringRow[]): EngineeringGroups {
  const groups = { STAR: [], PLOWHORSE: [], PUZZLE: [], DOG: [], unclassified: [] } as EngineeringGroups;
  for (const row of rows) (row.class ? groups[row.class] : groups.unclassified).push(row);
  for (const key of MENU_ENGINEERING_CLASSES) groups[key].sort((a, b) => (b.totalMargin ?? 0) - (a.totalMargin ?? 0));
  return groups;
}

export type EngineeringSummary = {
  classified: number;
  unclassified: number;
  counts: Record<MenuEngineeringClass, number>;
  /** Share of the classified dishes' margin each class brings (0–100). */
  marginShare: Record<MenuEngineeringClass, number>;
  /** No dish could be classified: sales recorded before recipes (or without them). */
  empty: boolean;
};

export function engineeringSummary(report: Pick<MenuEngineeringReport, 'rows'>): EngineeringSummary {
  const groups = groupByClass(report.rows);
  const totalMargin = MENU_ENGINEERING_CLASSES.reduce((sum, key) => sum + groups[key].reduce((inner, row) => inner + Math.max(0, row.totalMargin ?? 0), 0), 0);
  const counts = {} as Record<MenuEngineeringClass, number>;
  const marginShare = {} as Record<MenuEngineeringClass, number>;
  for (const key of MENU_ENGINEERING_CLASSES) {
    counts[key] = groups[key].length;
    const margin = groups[key].reduce((sum, row) => sum + Math.max(0, row.totalMargin ?? 0), 0);
    marginShare[key] = totalMargin > 0 ? Math.round((margin / totalMargin) * 1000) / 10 : 0;
  }
  const classified = MENU_ENGINEERING_CLASSES.reduce((sum, key) => sum + counts[key], 0);
  return { classified, unclassified: groups.unclassified.length, counts, marginShare, empty: classified === 0 };
}

export type EngineeringSort = 'sold' | 'margin' | 'foodCost';

/** The per-dish table: classified dishes by the chosen figure, unclassified ones last by sales. */
export function sortEngineering(rows: readonly MenuEngineeringRow[], sort: EngineeringSort): MenuEngineeringRow[] {
  const figure = (row: MenuEngineeringRow) => (sort === 'sold' ? row.sold : sort === 'margin' ? row.totalMargin : row.foodCostPercent);
  return [...rows].sort((a, b) => {
    if (Boolean(a.class) !== Boolean(b.class)) return a.class ? -1 : 1;
    const left = figure(a) ?? -Infinity;
    const right = figure(b) ?? -Infinity;
    return right - left || b.sold - a.sold;
  });
}
