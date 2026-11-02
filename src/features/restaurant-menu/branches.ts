import { useEffect, useState } from 'react';
import { isOpenAt, type MAIN_BRANCH_SLUG, type OpeningHours, type PublicBranch, type PublicRestaurant } from '@bilhanah/contracts';
import type { Language } from '../../lib/language';
import { DAY_NAMES, formatTime, hasAnyHours } from './menu-format';
import { nextOpening } from './ordering/next-opening';

// Branches on the public menu. A restaurant is one brand on one subdomain; each branch has its own
// address, hours, prices and ordering. Which branch the menu shows, first match wins:
// 1. A table QR (?t=code): the table stands in one branch, and pins the menu to it.
// 2. ?b=<slug> in the address (shared links, the branch's own QR).
// 3. The branch this browser chose last time for the restaurant (if it still exists).
// 4. With more than one branch, the diner picks; with one, the menu opens as it always did.

type AvailableRestaurant = Extract<PublicRestaurant, { availability: 'AVAILABLE' }>;

/** The main branch's slug (contracts' MAIN_BRANCH_SLUG; that module builds zod schemas). */
export const MAIN_BRANCH = 'main' satisfies typeof MAIN_BRANCH_SLUG;

/** The `?b=` parameter of shared branch links. */
export const BRANCH_PARAM = 'b';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A branch slug from the address bar, or null when absent or malformed. */
export function branchParam(search: string): string | null {
  const value = new URLSearchParams(search).get(BRANCH_PARAM)?.trim().toLowerCase();
  return value && value.length <= 40 && SLUG.test(value) ? value : null;
}

/** Every active branch, main first. Empty from an API that predates branches. */
export function branchesOf(restaurant: AvailableRestaurant): PublicBranch[] {
  const branches = (restaurant as { branches?: PublicBranch[] }).branches ?? [];
  return [...branches].sort((a, b) => Number(b.isMain) - Number(a.isMain));
}

/** The branch the menu is showing, or null from an API that predates branches. */
export function branchOf(restaurant: AvailableRestaurant): PublicBranch | null {
  return (restaurant as { branch?: PublicBranch }).branch ?? null;
}

// --- The diner's choice, remembered per restaurant --------------------------------------------

const choiceKey = (subdomain: string) => `bilhanah:branch:v1:${subdomain}`;

export function rememberedBranch(subdomain: string): string | null {
  try {
    const value = localStorage.getItem(choiceKey(subdomain));
    return value && SLUG.test(value) ? value : null;
  } catch { return null; }
}

export function rememberBranch(subdomain: string, slug: string | null) {
  try {
    if (slug) localStorage.setItem(choiceKey(subdomain), slug);
    else localStorage.removeItem(choiceKey(subdomain));
  } catch { /* Storage is optional: the picker then asks again next time. */ }
}

/** Puts `slug` in the address bar (or takes `b` out), keeping every other parameter. */
export function writeBranchParam(slug: string | null) {
  const url = new URL(location.href);
  if (url.searchParams.get(BRANCH_PARAM) === slug) return;
  if (slug) url.searchParams.set(BRANCH_PARAM, slug);
  else url.searchParams.delete(BRANCH_PARAM);
  history.replaceState(history.state, '', url.pathname + url.search + url.hash);
}

// --- Open now / opens at ----------------------------------------------------------------------

/** The time, refreshed every minute, so "open now" changes while the page is open. */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export type OpenState = { open: true } | { open: false; next: ReturnType<typeof nextOpening> } | null;

/** Whether a branch is open now, and if not when it opens; null when it has no hours set. */
export function openState(hours: OpeningHours | null, now: Date, timeZone: string): OpenState {
  if (!hasAnyHours(hours)) return null;
  return isOpenAt(hours, now, timeZone) ? { open: true } : { open: false, next: nextOpening(hours, now, timeZone) };
}

/** "today 9:00 AM" / "tomorrow …" / "Saturday …" (Arabic: "النهارده ٩:٠٠ ص"). */
export function openingPhrase(next: NonNullable<ReturnType<typeof nextOpening>>, language: Language): string {
  const day = next.inDays === 0 ? (language === 'ar' ? 'النهارده' : 'today') : next.inDays === 1 ? (language === 'ar' ? 'بكرة' : 'tomorrow') : DAY_NAMES[next.day][language];
  return `${day} ${formatTime(next.opens, language)}`;
}

// --- Naming a branch in a sentence -------------------------------------------------------------

/** Names that already say they are a branch: "فرع المعادي", "الفرع الرئيسي", "Main branch". */
const SAYS_BRANCH = /^(ال)?فرع(\s|$)|\bbranch\b/i;

/** In Arabic sentences, "مدينة نصر" → "فرع مدينة نصر"; names that already say so stay as they are. */
export function branchTitle(name: string, language: Language): string {
  const trimmed = name.trim();
  return language === 'ar' && !SAYS_BRANCH.test(trimmed) ? `فرع ${trimmed}` : trimmed;
}

/** The label before a branch's name in the menu header ("فرع", "Branch:"), or null when the name already says it. */
export function branchLabel(name: string, language: Language): string | null {
  return SAYS_BRANCH.test(name.trim()) ? null : language === 'ar' ? 'فرع' : 'Branch:';
}
