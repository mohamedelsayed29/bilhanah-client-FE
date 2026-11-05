import type { Page, Request } from '@playwright/test';
import { type AuthUser, type BranchList, type OwnerRestaurant, ROLE_PERMISSIONS, type SessionResponse } from '@bilhanah/contracts';

/**
 * A fake API for specs that must not depend on bilhanah-BE (features it has not shipped yet):
 * every request to the API origin is answered here, CORS preflights included, so the dashboard
 * runs unchanged on any port. Unhandled routes answer 404 and are listed in `unhandled`.
 */
export const MOCK_API_URL = process.env['E2E_API_URL'] ?? 'http://127.0.0.1:3000';

export type MockReply = { status?: number; json?: unknown; body?: Buffer | string; contentType?: string };
type Responder = (request: Request, url: URL, match: RegExpMatchArray) => MockReply | Promise<MockReply>;
type Route = { method: string; pattern: RegExp; respond: Responder };

export class MockApi {
  private routes: Route[] = [];
  readonly calls: { method: string; path: string; search: string; body: unknown; authorization: string | null }[] = [];
  readonly unhandled: string[] = [];

  /** Later registrations win, so a test can override a default. `path` matches the whole pathname. */
  on(method: string, path: string | RegExp, respond: Responder | MockReply): this {
    const pattern = typeof path === 'string' ? new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) : path;
    this.routes.unshift({ method, pattern, respond: typeof respond === 'function' ? respond : () => respond });
    return this;
  }

  /** Requests made to `method path` so far. */
  callsTo(method: string, path: string | RegExp) {
    return this.calls.filter(call => call.method === method && (typeof path === 'string' ? call.path === path : path.test(call.path)));
  }

  async install(page: Page) {
    await page.route(`${MOCK_API_URL}/**`, async route => {
      const request = route.request();
      const url = new URL(request.url());
      const origin = (await request.headerValue('origin')) ?? new URL(page.url() || 'http://127.0.0.1').origin;
      const cors = {
        'access-control-allow-origin': origin,
        'access-control-allow-credentials': 'true',
        'access-control-expose-headers': 'x-request-id',
        vary: 'Origin',
      };
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE', 'access-control-allow-headers': 'authorization,content-type,accept' } });
        return;
      }
      let body: unknown = null;
      try { body = request.postDataJSON(); } catch { body = request.postData(); }
      this.calls.push({ method: request.method(), path: url.pathname, search: url.search, body, authorization: request.headers()['authorization'] ?? null });
      for (const entry of this.routes) {
        const match = entry.method === request.method() ? url.pathname.match(entry.pattern) : null;
        if (!match) continue;
        const reply = await entry.respond(request, url, match);
        const status = reply.status ?? 200;
        if (reply.body !== undefined) {
          await route.fulfill({ status, headers: cors, contentType: reply.contentType ?? 'application/octet-stream', body: reply.body });
        } else if (status === 204) {
          await route.fulfill({ status, headers: cors });
        } else {
          await route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(reply.json ?? null) });
        }
        return;
      }
      this.unhandled.push(`${request.method()} ${url.pathname}${url.search}`);
      await route.fulfill({ status: 404, headers: cors, contentType: 'application/json', body: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not mocked' } }) });
    });
    // The owner shell's live order feed: no socket server in mocked runs.
    await page.routeWebSocket(/socket\.io/, socket => socket.close());
  }
}

export const ownerUser: AuthUser = { id: 'u-owner', email: 'owner@example.test', fullName: 'منى الاختبار', preferredLanguage: 'ar', role: 'OWNER', emailVerified: true, permissions: [...ROLE_PERMISSIONS.OWNER] };

/** A signed-in session restored from the refresh cookie, as on every page load. */
export function signedIn(api: MockApi, user: AuthUser) {
  const session: SessionResponse = { accessToken: `token-${user.role}`, accessTokenExpiresIn: 900, user };
  api.on('POST', '/v1/auth/refresh', { json: session });
  api.on('GET', '/v1/auth/me', { json: user });
  api.on('POST', '/v1/auth/logout', { status: 204 });
  return api;
}

export function restaurant(changes: Partial<OwnerRestaurant> = {}): OwnerRestaurant {
  return {
    id: 'r-1', name: 'كشري التحرير', subdomain: 'tahrir', publicUrl: 'https://tahrir.bilhanah.com', contactName: 'منى', phone: '01098765432', city: 'طنطا', address: '٥ شارع البحر',
    defaultLanguage: 'ar', timezone: 'Africa/Cairo', whatsappNumber: null, websiteUrl: null, facebookUrl: null, instagramUrl: null, createdAt: '2026-09-01T09:00:00.000Z',
    access: { status: 'PAID', planCode: 'ORDERS', features: { menu: true, ordering: true, readyAlerts: false, branches: 3 }, currentPeriodEndsAt: '2026-12-01T00:00:00.000Z', trialEndsAt: null },
    // The board and its socket stay off in mocked runs.
    ordering: { included: false, enabled: false, acceptsDineIn: true, acceptsPickup: true, paused: false },
    serviceRequests: { enabled: true, cooldownSeconds: 120, hourlyLimit: 20 },
    tableSessions: { enabled: true, sharedEditing: false },
    orderPrepMinutes: null,
    logo: null, cover: null, brandColor: null, openingHours: null, menuTheme: 'classic', mainBranchId: 'b-main', branchCount: 1,
    ...changes,
  };
}

/** The restaurant's single (main) branch, mirroring its details. */
export function branchList(owner: OwnerRestaurant): BranchList {
  return {
    limit: owner.access.features.branches, used: 1,
    branches: [{
      id: owner.mainBranchId, name: owner.name, slug: 'main', isMain: true, isActive: true, phone: owner.phone, whatsappNumber: owner.whatsappNumber,
      city: owner.city, address: owner.address, mapUrl: null, openingHours: owner.openingHours, ordering: owner.ordering, publicUrl: owner.publicUrl,
      tableCount: 0, staffCount: 0, activeOrders: 0, createdAt: owner.createdAt,
    }],
  };
}

/** A signed-in owner with a restaurant and an empty menu. */
export function ownerApi(changes: Partial<OwnerRestaurant> = {}) {
  const owner = restaurant(changes);
  return signedIn(new MockApi(), ownerUser)
    .on('GET', '/v1/restaurants/mine', { json: owner })
    .on('GET', '/v1/branches', { json: branchList(owner) })
    .on('GET', '/v1/menu', { json: { categories: [] } })
    .on('GET', '/v1/orders/tracking-stats', { json: {
      days: 30, orders: 0, tracked: 0, trackingRate: null, readyAlertOrders: 0, readyNotified: 0, readyDeliveryRate: null,
      estimatedOrders: 0, readyOnTime: 0, onTimeRate: null, statusEnquiries: 0,
    } });
}

/** A 1×1 PNG. */
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
