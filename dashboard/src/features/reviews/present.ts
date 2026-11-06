import {
  REVIEW_SUB_RATINGS,
  type RatingDistribution, type ReviewDishReport, type ReviewSettings, type ReviewStats, type ReviewStatus, type ReviewSubRating, type ReviewTag,
} from '@bilhanah/contracts';
import { percentages } from '../../lib/charts';
import type { Language } from '../../lib/language';

/** Pure presentation of reviews and their stats (what the screens show, tested without React). */

const locale = (language: Language) => (language === 'ar' ? 'ar-EG' : 'en-EG');

/** 3.77 → "3.8" / "٣٫٨"; null → "—". One decimal, always (so "4.0" next to "3.8" lines up). */
export function formatAverage(value: number | null | undefined, language: Language): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat(locale(language), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.round(value * 10) / 10);
}

/** 0.8333 → "83%" / "٨٣٪"; null → "—". */
export function formatShare(value: number | null | undefined, language: Language): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat(locale(language), { style: 'percent', maximumFractionDigits: 0 }).format(value);
}

/** Minutes to a reply, in the unit that reads best: "under a minute", "45 min", "3.5 hours", "2 days". */
export function formatReplyTime(minutes: number | null | undefined, language: Language): string {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return '—';
  const n = (value: number, digits = 0) => new Intl.NumberFormat(locale(language), { maximumFractionDigits: digits }).format(value);
  if (minutes < 1) return language === 'ar' ? 'أقل من دقيقة' : 'under a minute';
  if (minutes < 60) return language === 'ar' ? `${n(Math.round(minutes))} دقيقة` : `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 48) {
    const shown = hours < 10 ? Math.round(hours * 2) / 2 : Math.round(hours);
    return language === 'ar' ? `${n(shown, 1)} ساعة` : `${n(shown, 1)} hour${shown === 1 ? '' : 's'}`;
  }
  const days = Math.round(hours / 24);
  return language === 'ar' ? `${n(days)} يوم` : `${days} days`;
}

export type DistributionRow = { stars: 1 | 2 | 3 | 4 | 5; count: number; percent: number };

/** Five rows, 5 stars first, with whole percentages that add up to 100. */
export function distributionRows(distribution: RatingDistribution): DistributionRow[] {
  const order = [5, 4, 3, 2, 1] as const;
  const counts = order.map(stars => distribution[String(stars) as keyof RatingDistribution] ?? 0);
  const shares = percentages(counts);
  return order.map((stars, index) => ({ stars, count: counts[index]!, percent: shares[index]! }));
}

/** The day series as the daily chart takes it; days without reviews chart as 0 (shown as "—"). */
export function chartDays(series: ReviewStats['series']): { date: string; count: number; average: number }[] {
  return series.map(day => ({ date: day.day, count: day.count, average: day.average ?? 0 }));
}

/** Sub-rating averages in the questions' order: those asked now, and those with answers from before. */
export function subRatingRows(subRatings: ReviewStats['subRatings'], asked: readonly ReviewSubRating[] = []) {
  return REVIEW_SUB_RATINGS.filter(key => asked.includes(key) || subRatings[key])
    .map(key => ({ key, average: subRatings[key]?.average ?? null, count: subRatings[key]?.count ?? 0 }));
}

/** Tag counts as positive and negative lists, most used first (ties by name code). */
export function splitTags<T extends ReviewTag & { count: number }>(tags: readonly T[]): { positive: T[]; negative: T[] } {
  const sorted = [...tags].filter(tag => tag.count > 0).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
  return { positive: sorted.filter(tag => tag.sentiment === 'POSITIVE'), negative: sorted.filter(tag => tag.sentiment === 'NEGATIVE') };
}

type DishRow = ReviewDishReport['dishes'][number];

/**
 * The best and the worst rated dishes (each with at least `minCount` ratings, so one unlucky rating
 * does not rank a dish): best by average then by how many rated it; worst the other way. A dish
 * appears in one list only; the worst list only holds dishes someone disliked.
 */
export function rankDishes(dishes: readonly DishRow[], { minCount = 3, size = 3 }: { minCount?: number; size?: number } = {}) {
  const ranked = dishes.filter(dish => dish.count >= minCount);
  const best = [...ranked].sort((a, b) => b.average - a.average || b.count - a.count).slice(0, size);
  const taken = new Set(best.map(dish => dish.menuItemId ?? dish.nameAr));
  const worst = [...ranked].filter(dish => !taken.has(dish.menuItemId ?? dish.nameAr) && dish.downShare > 0)
    .sort((a, b) => a.average - b.average || b.downShare - a.downShare || b.count - a.count).slice(0, size);
  return { best, worst, unranked: dishes.length - ranked.length };
}

/**
 * Whether a reply shows publicly, and if not why: the review is waiting or hidden, the restaurant
 * keeps every review private (NEVER), or the reviews page is off on the menu.
 */
export type ReplyVisibility = 'public' | 'pending' | 'hidden' | 'never' | 'page-off';
export function replyVisibility(status: ReviewStatus, settings: Pick<ReviewSettings, 'publishMode' | 'showOnMenu'> | null | undefined): ReplyVisibility {
  if (settings?.publishMode === 'NEVER') return 'never';
  if (status === 'HIDDEN') return 'hidden';
  if (status === 'PENDING') return 'pending';
  if (settings && !settings.showOnMenu) return 'page-off';
  return 'public';
}

/** A diner's number for WhatsApp: Egyptian mobiles (01…) get the country code; "+" and spaces dropped. */
export function whatsappLink(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, '');
  const plain = digits.startsWith('+') ? digits.slice(1) : digits.startsWith('00') ? digits.slice(2) : digits;
  if (!/^\d{7,15}$/.test(plain)) return null;
  const international = /^01\d{9}$/.test(plain) ? `2${plain}` : plain;
  return `https://wa.me/${international}`;
}

/** A comment shortened at a word boundary for the inbox. */
export function excerpt(text: string | null | undefined, max = 180): string | null {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  if ([...clean].length <= max) return clean;
  const cut = [...clean].slice(0, max).join('');
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.،؛]+$/, '')}…`;
}

/** A tag's name in the interface language (a removed tag keeps its code as its name). */
export function tagName(tag: Pick<ReviewTag, 'nameAr' | 'nameEn' | 'code'>, language: Language): string {
  return (language === 'en' ? tag.nameEn || tag.nameAr : tag.nameAr || tag.nameEn) || tag.code;
}

/** Local day (YYYY-MM-DD) `days` days back from `day`, so a period of N days ends today. */
export function periodStart(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, date - (days - 1))).toISOString().slice(0, 10);
}

/** A new tag's code from its English (or Arabic) name; codes stay fixed once used, so old reviews keep their tag. */
export function tagCode(name: string, taken: readonly string[]): string {
  const base = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'TAG';
  const start = /^[A-Z]/.test(base) ? base : `T_${base}`.slice(0, 24);
  let code = start;
  for (let index = 2; taken.includes(code); index++) code = `${start}_${index}`.slice(0, 30);
  return code;
}
