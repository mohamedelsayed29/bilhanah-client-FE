import type { RestaurantStats, RestaurantStatsDay, VisitSource } from '@bilhanah/contracts';
import { completeDays } from '../../../lib/charts';

/** Every day of the period once, oldest first (days the API left out count as zero). */
export function statsDays(stats: Pick<RestaurantStats, 'days'>): RestaurantStatsDay[] {
  return completeDays(stats.days, date => ({ date, visits: 0, orders: 0, revenuePiastres: 0 }));
}

/** Sources in a fixed order, so their bars never change places between periods. */
export const SOURCE_ORDER: readonly VisitSource[] = ['qr', 'table', 'link'];

/** Whether the period has anything to chart: visits, or orders when the plan has ordering. */
export function hasStats(stats: RestaurantStats): boolean {
  return stats.totals.visits > 0 || (stats.ordering && stats.totals.orders > 0);
}

/** The dish name in the dashboard's language (English falls back to Arabic). */
export function dishName(item: RestaurantStats['topItems'][number], language: 'ar' | 'en'): string {
  return language === 'en' ? item.nameEn ?? item.nameAr : item.nameAr;
}
