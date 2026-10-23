import type { Page, WebSocketRoute } from '@playwright/test';
import type { OpeningHours, OrderStatus, PublicMenuResponse, PublicOrder } from '@bilhanah/contracts';

// Mocked API for the ordering specs. Restaurant pages live on {subdomain}.localhost.
export const port = Number(process.env['WEB_E2E_PORT'] ?? 5173);
export const restaurantUrl = (path = '/') => `http://koshary.localhost:${port}${path}`;
export const TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbb';

const pixel = (color: string) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="${color}"/></svg>`);
const image = (id: string, color = '#c97b4a') => ({ id, width: 640, height: 480, sources: [{ width: 640, url: pixel(color) }], url: pixel(color) });
export const allDays = (ranges: { opens: string; closes: string }[]) => ({ sat: ranges, sun: ranges, mon: ranges, tue: ranges, wed: ranges, thu: ranges, fri: ranges });

export function menuFixture(overrides: { ordering?: { accepting: boolean; dineIn: boolean; pickup: boolean }; openingHours?: OpeningHours | null } = {}): PublicMenuResponse {
  return {
    restaurant: {
      availability: 'AVAILABLE', subdomain: 'koshary', name: 'كشري أبو طارق', defaultLanguage: 'ar', phone: '01012345678', city: 'القاهرة', address: '١٦ شارع معروف',
      whatsappNumber: '01012345678', websiteUrl: null, facebookUrl: null, instagramUrl: null, timezone: 'Africa/Cairo',
      logo: image('logo', '#b4432f'), cover: image('cover', '#d9a066'), brandColor: '#b4432f',
      openingHours: overrides.openingHours === undefined ? allDays([{ opens: '00:00', closes: '23:59' }]) : overrides.openingHours,
      ordering: overrides.ordering ?? { accepting: true, dineIn: true, pickup: true },
    },
    categories: [
      { id: 'mains', nameAr: 'رئيسي', nameEn: 'Mains', items: [
        { id: 'koshary', nameAr: 'كشري', nameEn: 'Koshary', descriptionAr: 'رز وعدس ومكرونة بالصلصة والدقة', descriptionEn: 'Rice, lentils and pasta with tomato sauce', image: image('k'), isAvailable: true, variants: [
          { id: 'v-small', nameAr: 'صغير', nameEn: 'Small', pricePiastres: 3500 }, { id: 'v-large', nameAr: 'كبير', nameEn: 'Large', pricePiastres: 5550 },
        ] },
        { id: 'fatta', nameAr: 'فتة', nameEn: 'Fatta', descriptionAr: null, descriptionEn: null, image: null, isAvailable: false, variants: [{ id: 'v-fatta', nameAr: null, nameEn: null, pricePiastres: 21000 }] },
      ] },
      { id: 'drinks', nameAr: 'مشروبات', nameEn: 'Drinks', items: [
        { id: 'lemon', nameAr: 'ليمون نعناع', nameEn: 'Lemon mint', descriptionAr: 'فريش', descriptionEn: 'Fresh', image: null, isAvailable: true, variants: [{ id: 'v-lemon', nameAr: null, nameEn: null, pricePiastres: 4500 }] },
      ] },
    ],
  };
}

export function orderFixture(status: OrderStatus, overrides: Partial<PublicOrder> = {}): PublicOrder {
  const at = (minutes: number) => new Date(Date.UTC(2026, 9, 23, 12, minutes)).toISOString();
  const reached = (target: OrderStatus) => ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED'].indexOf(status) >= ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED'].indexOf(target);
  return {
    number: 12, type: 'DINE_IN', tableLabel: '5', customerName: 'أحمد', status, subtotalPiastres: 15600, note: null,
    items: [
      { id: 'l1', menuItemId: 'koshary', nameAr: 'كشري', nameEn: 'Koshary', variantNameAr: 'كبير', variantNameEn: 'Large', unitPricePiastres: 5550, quantity: 2, note: 'من غير بصل', lineTotalPiastres: 11100 },
      { id: 'l2', menuItemId: 'lemon', nameAr: 'ليمون نعناع', nameEn: 'Lemon mint', variantNameAr: null, variantNameEn: null, unitPricePiastres: 4500, quantity: 1, note: null, lineTotalPiastres: 4500 },
    ],
    placedAt: at(0), acceptedAt: reached('ACCEPTED') ? at(2) : null, readyAt: reached('READY') ? at(14) : null, completedAt: status === 'COMPLETED' ? at(20) : null,
    closedAt: ['COMPLETED', 'REJECTED', 'CANCELLED'].includes(status) ? at(20) : null,
    rejectionReason: status === 'REJECTED' ? 'الكشري خلص النهارده' : status === 'CANCELLED' ? 'المطبخ قفل' : null,
    updatedAt: at(20),
    restaurant: { name: 'كشري أبو طارق', subdomain: 'koshary', phone: '01012345678', logo: null, brandColor: '#b4432f' },
    ...overrides,
  };
}

export const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
export const apiError = (status: number, code: string, details?: unknown) => json({ error: { code, message: code, ...(details !== undefined && { details }) } }, status);

export async function serveMenu(page: Page, menu: PublicMenuResponse = menuFixture()) {
  await page.route('**/v1/public/restaurants/koshary/menu', route => route.fulfill(json(menu)));
}

/**
 * Socket.IO over a mocked WebSocket. `fail` refuses every connection (the page falls back to polling);
 * `live` completes the handshake so tests can push `order.updated`.
 */
export async function mockRealtime(page: Page, mode: 'fail' | 'live') {
  const sockets: WebSocketRoute[] = [];
  await page.routeWebSocket(/\/v1\/realtime\//, ws => {
    if (mode === 'fail') { void ws.close({ code: 1011 }); return; }
    sockets.push(ws);
    ws.send('0' + JSON.stringify({ sid: `engine-${sockets.length}`, upgrades: [], pingInterval: 25000, pingTimeout: 20000, maxPayload: 1_000_000 }));
    ws.onMessage(message => {
      if (typeof message === 'string' && message.startsWith('40/track,')) ws.send('40/track,{"sid":"socket"}');
    });
  });
  return {
    push(order: PublicOrder) { for (const ws of sockets) ws.send(`42/track,${JSON.stringify(['order.updated', { order }])}`); },
    get connections() { return sockets.length; },
  };
}
