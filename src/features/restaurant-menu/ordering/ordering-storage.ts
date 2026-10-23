// What a diner's phone remembers per restaurant. Storage can be full, disabled or tampered with,
// so every read is validated and every write is best-effort.

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

export type CartLine = { menuItemId: string; variantId: string; quantity: number; note: string };

const cartKey = (subdomain: string) => `bilhanah:cart:v1:${subdomain}`;
/** A cart left overnight belongs to an earlier visit. */
const CART_TTL = 12 * HOUR;

export function loadCart(subdomain: string): CartLine[] {
  const stored = read(local, cartKey(subdomain));
  if (!isRecord(stored) || typeof stored['savedAt'] !== 'number' || Date.now() - stored['savedAt'] > CART_TTL || !Array.isArray(stored['lines'])) return [];
  return stored['lines'].filter((line): line is CartLine => isRecord(line) && isString(line['menuItemId']) && isString(line['variantId']) && isString(line['note'])
    && Number.isInteger(line['quantity']) && (line['quantity'] as number) >= 1 && (line['quantity'] as number) <= 50);
}

export function saveCart(subdomain: string, lines: CartLine[]) {
  write(local, cartKey(subdomain), lines.length ? { savedAt: Date.now(), lines } : null);
}

// --- Table ------------------------------------------------------------------

/** The scanned table: `label` is null until the API confirms the code. */
export type TableContext = { code: string; label: string | null };
const tableKey = (subdomain: string) => `bilhanah:table:v1:${subdomain}`;

export function loadTable(subdomain: string): TableContext | null {
  const stored = read(session, tableKey(subdomain));
  return isRecord(stored) && isString(stored['code']) && (stored['label'] === null || isString(stored['label'])) ? { code: stored['code'], label: stored['label'] } : null;
}

export function saveTable(subdomain: string, table: TableContext | null) {
  write(session, tableKey(subdomain), table);
}

// --- Recent orders ------------------------------------------------------------

export type RecentOrder = { trackingToken: string; number: number; placedAt: string };
const ordersKey = (subdomain: string) => `bilhanah:orders:v1:${subdomain}`;
/** Long enough to cover a visit; older orders stop showing on the menu. */
const RECENT_ORDER_TTL = 12 * HOUR;

export function loadRecentOrders(subdomain: string): RecentOrder[] {
  const stored = read(local, ordersKey(subdomain));
  if (!Array.isArray(stored)) return [];
  return stored.filter((order): order is RecentOrder => isRecord(order) && isString(order['trackingToken']) && typeof order['number'] === 'number' && isString(order['placedAt'])
    && Date.now() - Date.parse(order['placedAt']) < RECENT_ORDER_TTL);
}

export function rememberOrder(subdomain: string, order: RecentOrder) {
  const others = loadRecentOrders(subdomain).filter(existing => existing.trackingToken !== order.trackingToken);
  write(local, ordersKey(subdomain), [order, ...others].slice(0, 10));
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
