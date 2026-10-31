import type { PlaceStandOrderResponse, PublicStandOrder, ShopInfo, StandDesign, StandOrderCheckout, StandPaymentMethod, StandPurpose, ProductShape, ShopProduct, UploadedLogo } from '@bilhanah/contracts';
import { apiRequest } from '../../lib/api';

// The stand shop's public API. Types come from the zod-free contracts (shop.ts); the request
// schemas (shop-orders.ts) stay on the server so the website ships without zod.

const SHOP_PATH = '/v1/public/shop';

/** Prices, the delivery fee and the payment methods offered today. */
export function fetchShopInfo(signal?: AbortSignal): Promise<ShopInfo> {
  return apiRequest<ShopInfo>(SHOP_PATH, { signal, cache: 'no-store' });
}

/** Uploads one logo (PNG, JPEG or WebP); its id goes with every order line that uses it. */
export function uploadStandLogo(file: Blob): Promise<UploadedLogo> {
  const form = new FormData();
  const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/webp' ? 'webp' : 'png';
  form.append('file', file, `logo.${extension}`);
  return apiRequest<UploadedLogo>(`${SHOP_PATH}/logos`, { method: 'POST', body: form });
}

/** One design in the order. Never carries prices: the API computes them. */
export type StandOrderLineInput = {
  product: ShopProduct;
  shape: ProductShape;
  nfc: boolean;
  design: StandDesign;
  customColors: { background: string; ink: string } | null;
  purpose: StandPurpose;
  brand: string;
  caption: string;
  url: string;
  logoId: string | null;
  numbered: boolean;
  startNumber: number;
  quantity: number;
  notes: string;
};

export type PlaceStandOrderInput = {
  lines: StandOrderLineInput[];
  customer: { name: string; phone: string; email: string | null; city: string; address: string; notes: string };
  paymentMethod: StandPaymentMethod;
  /** Subtotal plus the delivery fee when it is known: what the customer agreed to. */
  expectedTotalPiastres: number;
  language: 'ar' | 'en';
};

/** The same `idempotencyKey` returns the same order, so retries and double taps never duplicate it. */
export function placeStandOrder(idempotencyKey: string, input: PlaceStandOrderInput): Promise<PlaceStandOrderResponse> {
  return apiRequest<PlaceStandOrderResponse>(`${SHOP_PATH}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

export function fetchStandOrder(token: string, signal?: AbortSignal): Promise<PublicStandOrder> {
  return apiRequest<PublicStandOrder>(`${SHOP_PATH}/orders/${encodeURIComponent(token)}`, { signal, cache: 'no-store' });
}

/** A new online checkout for an order still awaiting payment. */
export function payStandOrder(token: string): Promise<StandOrderCheckout> {
  return apiRequest<StandOrderCheckout>(`${SHOP_PATH}/orders/${encodeURIComponent(token)}/pay`, { method: 'POST' });
}

/** The bag keeps logos as data URLs; the upload needs the file back. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error('Not a base64 data URL');
  const binary = atob(match[2]!);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: match[1] });
}

// --- Recent orders --------------------------------------------------------------
// Remembered on this device so the shop can link back to the last order. Best-effort, like all storage.

export type RecentStandOrder = { trackingToken: string; reference: string; placedAt: string };
const RECENT_KEY = 'bilhanah:stand-orders:v1';
/** Stands take days to make and deliver; keep the link around for a while. */
const RECENT_TTL = 60 * 24 * 60 * 60 * 1000;

export function loadRecentStandOrders(): RecentStandOrder[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    if (!Array.isArray(stored)) return [];
    return stored.filter((entry): entry is RecentStandOrder => typeof entry === 'object' && entry !== null
      && typeof entry.trackingToken === 'string' && typeof entry.reference === 'string' && typeof entry.placedAt === 'string'
      && Date.now() - Date.parse(entry.placedAt) < RECENT_TTL).slice(0, 5);
  } catch { return []; }
}

export function rememberStandOrder(order: RecentStandOrder) {
  try {
    const others = loadRecentStandOrders().filter(entry => entry.trackingToken !== order.trackingToken);
    localStorage.setItem(RECENT_KEY, JSON.stringify([order, ...others].slice(0, 5)));
  } catch { /* Storage is optional. */ }
}
