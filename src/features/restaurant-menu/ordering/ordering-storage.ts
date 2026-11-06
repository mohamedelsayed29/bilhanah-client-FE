// What a diner's phone remembers per restaurant. Storage can be full, disabled or tampered with,
// so every read is validated and every write is best-effort.

import type { OrderPushUpdates } from '@bilhanah/contracts';
import { MAIN_BRANCH } from '../branches';

const HOUR = 60 * 60 * 1000;

function read(storage: () => Storage, key: string): unknown {
  try {
    const raw = storage().getItem(key);
    return raw === null ? null : JSON.parse(raw) as unknown;
  } catch { return null; }
}

function write(storage: () => Storage, key: string, value: unknown) {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, JSON.stringify(value));
  } catch { /* Storage is optional. */ }
}

const local = () => localStorage;
const session = () => sessionStorage;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';

// --- Cart -------------------------------------------------------------------

/** `recommendation`: the suggestion the line was added from, sent with the order for its conversion and revenue. */
export type CartLine = { menuItemId: string; variantId: string; quantity: number; note: string; recommendation?: LineRecommendation };
export type LineRecommendation = { ruleId: string; placement: 'PRODUCT_DETAILS' | 'CART' | 'CHECKOUT' };
const PLACEMENTS = ['PRODUCT_DETAILS', 'CART', 'CHECKOUT'];

/**
 * One cart per branch: branches price dishes differently, so a cart filled at one is never carried
 * to another. The main branch keeps the key every cart had before branches existed.
 */
const cartKey = (subdomain: string, branch: string | null) => `bilhanah:cart:v1:${subdomain}${branch && branch !== MAIN_BRANCH ? `:${branch}` : ''}`;
/** A cart left overnight belongs to an earlier visit. */
const CART_TTL = 12 * HOUR;

export function loadCart(subdomain: string, branch: string | null): CartLine[] {
  const stored = read(local, cartKey(subdomain, branch));
  if (!isRecord(stored) || typeof stored['savedAt'] !== 'number' || Date.now() - stored['savedAt'] > CART_TTL || !Array.isArray(stored['lines'])) return [];
  return stored['lines'].filter((line): line is CartLine => isRecord(line) && isString(line['menuItemId']) && isString(line['variantId']) && isString(line['note'])
    && Number.isInteger(line['quantity']) && (line['quantity'] as number) >= 1 && (line['quantity'] as number) <= 50)
    // A malformed suggestion tag is dropped; the dish stays.
    .map(line => isRecord(line.recommendation) && isString(line.recommendation['ruleId']) && PLACEMENTS.includes(line.recommendation['placement'] as string) ? line : { ...line, recommendation: undefined });
}

export function saveCart(subdomain: string, branch: string | null, lines: CartLine[]) {
  write(local, cartKey(subdomain, branch), lines.length ? { savedAt: Date.now(), lines } : null);
}

// --- Table ------------------------------------------------------------------

/**
 * The scanned table: `label` is null until the API confirms the code. `branch` is the slug of the
 * branch the table stands in (null from an API that predates branches); it pins the menu to it.
 */
export type TableContext = { code: string; label: string | null; branch: string | null };
const tableKey = (subdomain: string) => `bilhanah:table:v1:${subdomain}`;

export function loadTable(subdomain: string): TableContext | null {
  const stored = read(session, tableKey(subdomain));
  if (!isRecord(stored) || !isString(stored['code']) || !(stored['label'] === null || isString(stored['label']))) return null;
  return { code: stored['code'], label: stored['label'], branch: isString(stored['branch']) ? stored['branch'] : null };
}

export function saveTable(subdomain: string, table: TableContext | null) {
  write(session, tableKey(subdomain), table);
}

// --- Recent orders ------------------------------------------------------------

export type RecentOrder = { trackingToken: string; number: number; placedAt: string };
const ordersKey = (subdomain: string) => `bilhanah:orders:v1:${subdomain}`;
/** Long enough to cover a visit; older orders stop showing on the menu. */
const RECENT_ORDER_TTL = 12 * HOUR;
/** Orders are kept this long so the menu can still ask "How was it?" the next days (reviews take longer to come). */
export const REVIEWABLE_ORDER_TTL = 7 * 24 * HOUR;

/** This browser's orders at the restaurant, newest first, placed within `within` (a visit by default). */
export function loadRecentOrders(subdomain: string, within = RECENT_ORDER_TTL): RecentOrder[] {
  const stored = read(local, ordersKey(subdomain));
  if (!Array.isArray(stored)) return [];
  return stored.filter((order): order is RecentOrder => isRecord(order) && isString(order['trackingToken']) && typeof order['number'] === 'number' && isString(order['placedAt'])
    && Date.now() - Date.parse(order['placedAt']) < Math.min(within, REVIEWABLE_ORDER_TTL));
}

export function rememberOrder(subdomain: string, order: RecentOrder) {
  const others = loadRecentOrders(subdomain, REVIEWABLE_ORDER_TTL).filter(existing => existing.trackingToken !== order.trackingToken);
  write(local, ordersKey(subdomain), [order, ...others].slice(0, 10));
}

// --- Reviews -------------------------------------------------------------------

/**
 * Per tracking token: the key the review was (or will be) written with, so only this browser can
 * edit it, and whether it was sent. Kept as long as the longest edit window (30 days).
 */
type ReviewKeys = Record<string, { key: string; savedAt: number; sent: boolean }>;
const REVIEW_KEYS = 'bilhanah:review-keys:v1';
const REVIEW_KEY_TTL = 31 * 24 * HOUR;

function loadReviewKeys(): ReviewKeys {
  const stored = read(local, REVIEW_KEYS);
  if (!isRecord(stored)) return {};
  const keys: ReviewKeys = {};
  for (const [token, record] of Object.entries(stored)) {
    if (isRecord(record) && isString(record['key']) && /^[A-Za-z0-9_-]{16,128}$/.test(record['key']) && typeof record['savedAt'] === 'number' && Date.now() - record['savedAt'] < REVIEW_KEY_TTL) {
      keys[token] = { key: record['key'], savedAt: record['savedAt'], sent: record['sent'] === true };
    }
  }
  return keys;
}

export function loadReviewKey(token: string): { key: string; sent: boolean } | null {
  const record = loadReviewKeys()[token];
  return record ? { key: record.key, sent: record.sent } : null;
}

/** Remembers the review's key before it is sent (a retry reuses it), and marks it sent afterwards. */
export function saveReviewKey(token: string, key: string, sent: boolean) {
  const keys = loadReviewKeys();
  keys[token] = { key, savedAt: keys[token]?.savedAt ?? Date.now(), sent };
  // The 40 most recent are plenty for one phone.
  const kept = Object.entries(keys).sort(([, a], [, b]) => b.savedAt - a.savedAt).slice(0, 40);
  write(local, REVIEW_KEYS, Object.fromEntries(kept));
}

/** Orders whose "How was it?" the diner put off ("Not now"): token → when. */
const REVIEW_DISMISSED = 'bilhanah:review-dismissed:v1';

function loadDismissed(): Record<string, number> {
  const stored = read(local, REVIEW_DISMISSED);
  if (!isRecord(stored)) return {};
  return Object.fromEntries(Object.entries(stored).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Date.now() - entry[1] < REVIEWABLE_ORDER_TTL));
}

export function isReviewDismissed(token: string): boolean {
  return token in loadDismissed();
}

export function dismissReview(token: string) {
  write(local, REVIEW_DISMISSED, { ...loadDismissed(), [token]: Date.now() });
}

// --- Diner details ------------------------------------------------------------

const DINER_KEY = 'bilhanah:diner:v1';
export type DinerDetails = { name: string; phone: string };

export function loadDiner(): DinerDetails {
  const stored = read(local, DINER_KEY);
  return isRecord(stored) ? { name: isString(stored['name']) ? stored['name'] : '', phone: isString(stored['phone']) ? stored['phone'] : '' } : { name: '', phone: '' };
}

export function saveDiner(details: DinerDetails) {
  write(local, DINER_KEY, details);
}

// --- Ready alerts --------------------------------------------------------------

/** Orders whose updates this browser asked to be pushed: tracking token → the push endpoint, and which updates. */
type PushRecords = Record<string, { endpoint: string; savedAt: number; updates: OrderPushUpdates }>;
const PUSH_KEY = 'bilhanah:push:v1';

function loadPushRecords(): PushRecords {
  const stored = read(local, PUSH_KEY);
  if (!isRecord(stored)) return {};
  const records: PushRecords = {};
  for (const [token, record] of Object.entries(stored)) {
    // The API forgets a subscription once its order is finished; orders last a visit.
    if (isRecord(record) && isString(record['endpoint']) && typeof record['savedAt'] === 'number' && Date.now() - record['savedAt'] < RECENT_ORDER_TTL) {
      records[token] = { endpoint: record['endpoint'], savedAt: record['savedAt'], updates: record['updates'] === 'ALL' ? 'ALL' : 'READY' };
    }
  }
  return records;
}

/** The endpoint this order's alerts were turned on with, if they were. */
export function loadPushEndpoint(token: string): string | null {
  return loadPushRecords()[token]?.endpoint ?? null;
}

/** Which updates this order's alerts were turned on for. */
export function loadPushUpdates(token: string): OrderPushUpdates {
  return loadPushRecords()[token]?.updates ?? 'READY';
}

export function savePushEndpoint(token: string, endpoint: string | null, updates: OrderPushUpdates = 'READY') {
  const records = loadPushRecords();
  if (endpoint) records[token] = { endpoint, savedAt: Date.now(), updates };
  else delete records[token];
  write(local, PUSH_KEY, Object.keys(records).length ? records : null);
}

/** Whether another order still has its alerts on through `endpoint`. */
export function pushEndpointInUse(endpoint: string): boolean {
  return Object.values(loadPushRecords()).some(record => record.endpoint === endpoint);
}
