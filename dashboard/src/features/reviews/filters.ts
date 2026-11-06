import { REVIEW_FOLLOW_UP_STATUSES, REVIEW_STATUSES, type ReviewFollowUpStatus, type ReviewStatus } from '@bilhanah/contracts';
import type { ReviewQuery } from '../../lib/api/endpoints';

/**
 * The inbox filters, kept in the address bar so a filtered inbox can be linked, survives a reload
 * and comes back when leaving a review. `branchId` narrows within the branch chosen in the shell.
 */
export type InboxFilters = {
  branchId: string | null;
  /** Star ratings shown (none: every rating). */
  stars: number[];
  status: ReviewStatus | null;
  verified: boolean | null;
  hasComment: boolean | null;
  /** NONE: reviews nobody followed up. */
  followUp: ReviewFollowUpStatus | 'NONE' | null;
  /** Local days (YYYY-MM-DD), both inclusive. */
  from: string | null;
  to: string | null;
  q: string;
  page: number;
};

export const EMPTY_FILTERS: InboxFilters = { branchId: null, stars: [], status: null, verified: null, hasComment: null, followUp: null, from: null, to: null, q: '', page: 1 };

/** Reviews of these ratings are the unhappy ones (UNHAPPY_MAX_STARS in the stats). */
export const LOW_STARS = [1, 2];

const PARAM = { branchId: 'branch', stars: 'stars', status: 'status', verified: 'verified', hasComment: 'comment', followUp: 'followUp', from: 'from', to: 'to', q: 'q', page: 'page' } as const;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bool = (value: string | null) => (value === 'true' ? true : value === 'false' ? false : null);
const oneOf = <T extends string>(value: string | null, options: readonly T[]): T | null => (value && (options as readonly string[]).includes(value) ? value as T : null);

/** Stars as a sorted list of distinct 1–5 ratings. */
export function normalizeStars(values: readonly number[]): number[] {
  return [...new Set(values.filter(value => Number.isInteger(value) && value >= 1 && value <= 5))].sort((a, b) => a - b);
}

/** The filters in the address bar; anything malformed is ignored rather than sent to the API. */
export function readFilters(params: URLSearchParams): InboxFilters {
  const page = Number(params.get(PARAM.page));
  const day = (value: string | null) => (value && DAY.test(value) ? value : null);
  const branch = params.get(PARAM.branchId);
  return {
    branchId: branch && UUID.test(branch) ? branch : null,
    stars: normalizeStars((params.get(PARAM.stars) ?? '').split(',').filter(Boolean).map(Number)),
    status: oneOf(params.get(PARAM.status), REVIEW_STATUSES),
    verified: bool(params.get(PARAM.verified)),
    hasComment: bool(params.get(PARAM.hasComment)),
    followUp: oneOf(params.get(PARAM.followUp), [...REVIEW_FOLLOW_UP_STATUSES, 'NONE'] as const),
    from: day(params.get(PARAM.from)),
    to: day(params.get(PARAM.to)),
    q: (params.get(PARAM.q) ?? '').slice(0, 100),
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** The filters written into the address bar (defaults left out); other parameters are kept. */
export function writeFilters(filters: InboxFilters, current: URLSearchParams = new URLSearchParams()): URLSearchParams {
  const next = new URLSearchParams(current);
  for (const key of Object.values(PARAM)) next.delete(key);
  const set = (key: keyof typeof PARAM, value: string | null) => { if (value) next.set(PARAM[key], value); };
  set('branchId', filters.branchId);
  set('stars', normalizeStars(filters.stars).join(','));
  set('status', filters.status);
  set('verified', filters.verified === null ? null : String(filters.verified));
  set('hasComment', filters.hasComment === null ? null : String(filters.hasComment));
  set('followUp', filters.followUp);
  set('from', filters.from);
  set('to', filters.to);
  set('q', filters.q.trim() || null);
  set('page', filters.page > 1 ? String(filters.page) : null);
  return next;
}

/**
 * The API query for the filters. `scopeBranch`: the branch chosen in the shell (staff tied to a
 * branch: theirs), which wins over the page's own branch filter. Dates the wrong way round are swapped.
 */
export function toReviewQuery(filters: InboxFilters, scopeBranch: string | null): ReviewQuery {
  const [from, to] = filters.from && filters.to && filters.from > filters.to ? [filters.to, filters.from] : [filters.from, filters.to];
  const stars = normalizeStars(filters.stars);
  const q = filters.q.trim();
  return {
    branchId: scopeBranch ?? filters.branchId,
    // Every rating selected is the same as none.
    stars: stars.length && stars.length < 5 ? stars.join(',') : null,
    status: filters.status,
    verified: filters.verified === null ? null : filters.verified ? 'true' : 'false',
    hasComment: filters.hasComment === null ? null : filters.hasComment ? 'true' : 'false',
    followUp: filters.followUp,
    from, to,
    q: q ? q.slice(0, 100) : null,
  };
}

/** How many filters narrow the list (the branch chosen in the shell does not count). */
export function activeFilterCount(filters: InboxFilters): number {
  const stars = normalizeStars(filters.stars);
  return [
    filters.branchId, stars.length > 0 && stars.length < 5 ? 'stars' : null, filters.status, filters.verified, filters.hasComment, filters.followUp,
    filters.from || filters.to ? 'dates' : null, filters.q.trim() || null,
  ].filter(value => value !== null && value !== '').length;
}

/** One-tap views of the inbox. */
export const INBOX_PRESETS = {
  low: { stars: LOW_STARS },
  pending: { status: 'PENDING' as const },
  followUp: { followUp: 'OPEN' as const },
} satisfies Record<string, Partial<InboxFilters>>;
export type InboxPreset = keyof typeof INBOX_PRESETS;

/** Whether the filters are exactly a preset (so its chip shows as selected). */
export function matchesPreset(filters: InboxFilters, preset: InboxPreset): boolean {
  const wanted = { ...EMPTY_FILTERS, branchId: filters.branchId, ...INBOX_PRESETS[preset] };
  return JSON.stringify(toReviewQuery({ ...filters, page: 1 }, null)) === JSON.stringify(toReviewQuery(wanted, null));
}

/** A preset applied: everything else cleared except the branch. */
export function applyPreset(filters: InboxFilters, preset: InboxPreset): InboxFilters {
  return { ...EMPTY_FILTERS, branchId: filters.branchId, ...INBOX_PRESETS[preset] };
}
