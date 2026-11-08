import type { Page, Request } from '@playwright/test';
import { STICKER_PRICES, type PublicStandOrder, type ShopInfo, type StandOrderStatus } from '@bilhanah/contracts';
import { apiError, json } from './ordering-fixtures';

// Mocked shop API (GET /v1/public/shop, logos, orders) for the stand shop specs.
export { apiError, json };
export const STAND_TOKEN = 'stand-token-0123456789abcdef';
export const PAYMOB_URL = 'https://accept.paymob.com/unifiedcheckout/?publicKey=test&clientSecret=secret';

/** 1×1 PNGs: two different logos. */
export const LOGO_A = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=';
export const LOGO_B = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

export const shopInfo = (overrides: Partial<ShopInfo> = {}): ShopInfo => ({
  prices: { unitPiastres: 35_000, nfcPiastres: 10_000 },
  stickerPrices: STICKER_PRICES,
  deliveryFeePiastres: 6_000,
  paymentMethods: ['CASH_ON_DELIVERY', 'PAYMOB'],
  ...overrides,
});

export async function serveShopInfo(page: Page, info: ShopInfo | (() => ReturnType<typeof json>) = shopInfo()) {
  let calls = 0;
  await page.route('**/v1/public/shop', route => { calls++; return route.fulfill(typeof info === 'function' ? info() : json(info)); });
  return { get calls() { return calls; } };
}

type BagConfig = Partial<{ shape: string; nfc: boolean; design: string; customColors: { background: string; ink: string } | null; purpose: string; brand: string; caption: string; url: string; logo: string; numbered: boolean; startNumber: number; quantity: number; notes: string }>;

/** Puts designs in the bag (as the design screen would) and opens the shop. */
export async function seedBag(page: Page, configs: BagConfig[]) {
  await page.goto('/products');
  await page.evaluate(items => localStorage.setItem('bilhanah:stand-bag:v1', JSON.stringify(items)), configs.map((config, index) => ({
    id: `line-${index + 1}`,
    config: { shape: 'classic', nfc: false, design: 'signature', customColors: null, purpose: 'menu', brand: `براند ${index + 1}`, caption: '', url: 'https://koshary.bilhanah.com/', logo: '', numbered: false, startNumber: 1, quantity: 1, notes: '', ...config },
  })));
  await page.reload();
}

/** From the design screen to the filled checkout form. */
export async function openCheckout(page: Page) {
  await page.getByRole('button', { name: /^السلة/ }).click();
  await page.getByRole('button', { name: 'كمّل بيانات الطلب', exact: true }).click();
}

export async function fillCheckout(page: Page, values: Partial<{ name: string; phone: string; email: string; city: string; address: string; notes: string }> = {}) {
  const v = { name: 'أحمد سامي', phone: '٠١٠١٢٣٤٥٦٧٨', email: '', city: 'القاهرة', address: '١٦ شارع معروف، وسط البلد', notes: '', ...values };
  await page.getByRole('textbox', { name: 'الاسم بالكامل', exact: true }).fill(v.name);
  await page.getByRole('textbox', { name: 'رقم الموبايل', exact: true }).fill(v.phone);
  if (v.email) await page.getByRole('textbox', { name: /البريد الإلكتروني/ }).fill(v.email);
  await page.getByRole('textbox', { name: 'المحافظة / المدينة', exact: true }).fill(v.city);
  await page.getByRole('textbox', { name: 'العنوان بالتفصيل', exact: true }).fill(v.address);
  if (v.notes) await page.getByRole('textbox', { name: /ملاحظات الاستلام/ }).fill(v.notes);
  await page.getByRole('checkbox', { name: /راجعت الشكل/ }).check();
}

export function standOrder(status: StandOrderStatus, overrides: Partial<PublicStandOrder> = {}): PublicStandOrder {
  const online = overrides.paymentMethod === 'PAYMOB';
  return {
    reference: 'S-1042', status,
    paymentMethod: 'CASH_ON_DELIVERY',
    paymentStatus: status === 'DELIVERED' || (online && status !== 'AWAITING_PAYMENT' && status !== 'CANCELLED') ? 'PAID' : 'UNPAID',
    lines: [
      { id: 'l1', shape: 'arch', nfc: true, design: 'forest', customColors: null, purpose: 'reviews', brand: 'بيت الزيتون', caption: 'رأيك يهمنا', url: 'https://g.page/r/olive/review', hasLogo: true, numbered: true, startNumber: 8, quantity: 2, notes: '', unitPricePiastres: 45_000, lineTotalPiastres: 90_000 },
      { id: 'l2', shape: 'classic', nfc: false, design: 'signature', customColors: { background: '#1C4D8D', ink: '#FFE6A7' }, purpose: 'menu', brand: 'كشري أبو طارق', caption: '', url: 'https://koshary.bilhanah.com/', hasLogo: false, numbered: false, startNumber: 1, quantity: 3, notes: '', unitPricePiastres: 35_000, lineTotalPiastres: 105_000 },
    ],
    subtotalPiastres: 195_000, deliveryFeePiastres: 6_000, totalPiastres: 201_000,
    customerName: 'أحمد سامي', city: 'القاهرة',
    createdAt: '2026-10-23T10:00:00.000Z', updatedAt: '2026-10-23T10:00:00.000Z',
    ...overrides,
  };
}

/** Requests the page sent to a route, with their JSON bodies and Idempotency-Keys. */
export const recorded = (request: Request) => ({ body: request.postDataJSON() as Record<string, unknown>, key: request.headers()['idempotency-key'] });
