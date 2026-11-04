# Restaurant Dashboard

The restaurant owner's dashboard for Bilhanah (بالهنا): sign-up, onboarding, the menu editor, QR codes, the live order board and order history, tables with printable QR cards, settings and the subscription (manual-transfer payments). Bilhanah's own **admin console** is a separate app in [bilhanah-dashboard-FE](https://github.com/mohamedelsayed29/bilhanah-dashboard-FE); `/admin` here only points to it. It is Arabic-first (RTL) with English, and works on phones.

It lives in the `dashboard/` folder of bilhanah-client-FE (an npm workspace beside the website) and uses that repository's `packages/contracts`. Part of Bilhanah, three repositories cloned side by side: [bilhanah-BE](https://github.com/mohamedelsayed29/bilhanah-BE) (API, shared packages, infrastructure), [bilhanah-client-FE](https://github.com/mohamedelsayed29/bilhanah-client-FE) (website + this dashboard) and [bilhanah-dashboard-FE](https://github.com/mohamedelsayed29/bilhanah-dashboard-FE) (admin console). To run everything together, use `npm run dev` in bilhanah-BE; it starts this app too.

`../packages/contracts` is a copy of the API's request/response schemas, owned by bilhanah-BE. Do not edit it here: change it in bilhanah-BE and run `npm run contracts:sync` there (see `packages/README.md`).

Stack: React 19, TypeScript, Vite, React Router, TanStack Query, react-hook-form with the zod schemas from `@bilhanah/contracts`, dnd-kit for drag-and-drop, socket.io-client for live orders and qrcode.react for QR codes. The brand tokens, fonts and the inline `text('عربي', 'English')` language provider are the same as the website (bilhanah-client-FE).

## Running locally

The API must be running (`npm run dev` in bilhanah-BE); email links are caught by Mailpit at http://127.0.0.1:8025.

```bash
cp .env.example .env   # optional; the defaults suit local development
npm run dev -w @bilhanah/restaurant-dashboard                   # http://127.0.0.1:5174
```

The dev server is pinned to `127.0.0.1:5174` (`strictPort`): it is the origin the API allows for credentialed CORS (`CORS_ORIGINS`) and the `DASHBOARD_URL` in email links. Use `127.0.0.1`, not `localhost`; they are different origins.

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | `http://127.0.0.1:3000` | API origin |
| `VITE_MENU_DOMAIN` | `bilhanah.com` | Domain in the onboarding address preview. The real public link always comes from the API (`publicUrl`) |

| Command (`-w @bilhanah/restaurant-dashboard`) | Purpose |
| --- | --- |
| `npm run dev` | Dev server on 127.0.0.1:5174 |
| `npm run build` | Type-check and build to `dist/` (needs `VITE_API_URL`) |
| `npm run typecheck` | TypeScript only |
| `npm test` | Unit tests (Vitest): session refresh coordination, authenticated blob downloads, price conversion, menu cache updates, paid-period dates, the realtime reconnect/refresh logic (fake socket), order board updates and actions |
| `npm run test:e2e` | Playwright against the running API, worker and Mailpit (see below) |

### End-to-end tests

`tests/owner-journey.spec.ts` registers a new owner (confirmed through the Mailpit API), creates a restaurant, builds a menu with a photo, sizes, sold-out and reordering, checks `GET /v1/public/restaurants/:subdomain/menu`, saves branding and opening hours, changes the password, downloads the QR code, and checks Arabic, English and 390 px layouts with axe. `tests/public-pages.spec.ts` covers the signed-out pages. Every run uses a new email and subdomain because the development database is shared; the API allows 10 registrations per IP per hour.

`tests/orders.spec.ts` covers ordering with one new owner and at most 6 public orders per run (the API allows 20 orders per 10 minutes per IP, shared with other suites): it builds a menu through the API, switches ordering on in Settings → Ordering, adds a table and a range (with the label-taken error and the 100-table range limit), renames, switches one off, issues a new code (the old QR link returns 404) and deletes one, downloads a table PNG, opens the print sheet (also in print media), then places orders through `POST /v1/public/restaurants/:subdomain/orders` with Node `fetch` and checks that they appear on the board live, with the title prefix and navigation count; accepts → prepares → marks ready → completes one, rejects one with a reason, follows changes made through the API (another device), pauses ordering (a new order gets 409 `ORDERING_UNAVAILABLE`) and resumes, checks the history and its detail dialog, the 390 px board with its column switcher, English, and axe on the board, tables and print view.

Screenshots of the main screens are written to `test-results/screens/`. Locally the tests use the installed Chrome (`channel: 'chrome'`); in CI they use Playwright's Chromium. The port can be changed with `DASHBOARD_E2E_PORT` (the API must allow that origin), the API and Mailpit with `E2E_API_URL` and `E2E_MAILPIT_URL`.

## Structure

```
src/
  main.tsx                    Entry: fonts, styles, providers, router
  app/
    router.tsx                Routes; everything beyond sign-in and the overview loads on demand
    router/guards.tsx         RequireAuth (owners), RequireAdmin, RequireGuest, RestaurantGate (no restaurant → onboarding), OnboardingGate
    providers/                Query client, language, toasts, session restore on startup
  layouts/
    AuthLayout.tsx            Brand photo panel + form (sign-in, registration, email links, onboarding)
    OwnerLayout.tsx           Sidebar on desktop; top bar and bottom tab bar on phones (overview, orders, menu, tables, settings); new-order count
    AdminLayout.tsx           Admin console shell: same structure, ink sidebar with a guava "Admin console" mark
  lib/
    api/client.ts             fetch wrapper: JSON, credentials, bearer token, ApiError, refresh on 401; blob downloads; owner sign-in
    api/single-flight.ts      One refresh at a time per tab and across tabs (navigator.locks)
    api/endpoints.ts          Typed calls for every route the dashboard uses
    api/error-messages.ts     Error codes → Arabic/English messages
    realtime/owner-realtime.ts  Socket.IO /owner feed: token per attempt, refresh on expiry, backoff, resync on reconnect
    session/                  In-memory session store (access token never touches storage)
    forms.ts                  zod resolver with translatable validation messages
    format.ts                 EGP ⇄ piastres, dates, Arabic-Indic digits
    language.tsx              Language provider (shared approach with the website)
  components/                 Button, Field, Dialog, ConfirmDialog, Toast, Switch, ImageUpload, ProtectedImage, Pagination, ErrorBoundary…
  features/
    auth/                     Login, register, check email, verify email, forgot/reset password, logout
    onboarding/               Restaurant details with a live subdomain check
    restaurant/overview/      Link, trial/plan status, menu stats, setup checklist
    restaurant/menu/          Menu editor (categories, items, photos, sizes, sold out, drag and keyboard reordering)
    restaurant/qr-codes/      QR code with PNG (1024 px) and SVG downloads
    restaurant/orders/        Live order board, order history and detail, realtime provider, new-order sound
    restaurant/tables/        Tables (add, range, rename, on/off, new code, delete), table QR downloads, A4 print sheet
    restaurant/settings/      Profile and social links, branding with live preview, opening hours, ordering, password and sessions
    restaurant/subscription/  Current plan, pay or renew by manual transfer, the payment under review, payment history
    billing/                  Plan, method and status labels; paid-period dates (same rules as the API)
  styles/                     Tokens (shared with the website), layouts, pages
tests/                        Playwright end-to-end tests
```


## Orders (owners)

Ordering needs a plan that includes it (`restaurant.ordering.included`) and the owner switching it on. Prices are piastres from the API, shown in EGP.

| Route | Page |
| --- | --- |
| `/orders` | Live board: New (PLACED), In progress (ACCEPTED, PREPARING) and Ready (READY), oldest first; on phones one column at a time with a switcher. Each card shows the number, time since it was placed (late orders turn red), dine-in table or pickup customer with a tap-to-call phone, lines with sizes and highlighted notes, the order note and the subtotal. The buttons come from `ORDER_TRANSITIONS`: Accept / Reject, Start preparing / Mark ready / Cancel, Ready / Cancel, Complete. Rejecting and cancelling ask for a reason (the diner sees it). Header: connection status, pause/resume (`ordersPaused`) and the sound switch. Without ordering in the plan the page shows an upsell to `/subscription`; when it is switched off, a link to the ordering settings |
| `/orders/history?page=` | Completed, rejected and cancelled orders, newest first, with a detail dialog (`GET /v1/orders/:id`): timeline, lines with prices, reason |
| `/tables` | Tables with a QR preview, inline rename, on/off, PNG/SVG download, new code (confirmed: printed codes stop working), delete; add one or a range (`{prefix} {from}` … `{prefix} {to}`, preview, existing names skipped) |
| `/tables/print` | One card per active table (restaurant logo and name, table name, QR of `qrUrl`, “scan to order” in Arabic and English), six per A4 sheet; `@media print` hides the dashboard, “Print” calls `window.print()` |
| `/settings/ordering` | Ordering on/off, dine-in and pickup (at least one), what diners see, link to tables; locked with an explanation when the plan has no ordering |

**Live updates.** While an owner with ordering in the plan is signed in, `OrdersLiveProvider` (in the owner shell, so it works on every page) connects to Socket.IO namespace `/owner` (`path: REALTIME_PATH`, WebSocket only) with an `auth` callback, so every attempt sends the current access token. `order.created` / `order.updated` go straight into the board cache (late events never move a card backwards); every (re)connection refetches the board, since events may have been missed. When the API disconnects the socket because the access token expired (`io server disconnect`), the session is renewed through the shared single-flight `refreshSession` (or the token another request already renewed is reused) and the socket reconnects; a handshake rejected as `UNAUTHENTICATED` is retried once right away, then with backoff (2 s … 60 s). Network drops are retried by Socket.IO. The socket closes on sign-out. Status changes are optimistic and only the affected card rolls back on failure; 409 `INVALID_STATUS_CHANGE` (another device moved it first) refetches the board with a message.

**New-order alert.** A new order (live or found by a refetch) plays a short chime synthesized with the Web Audio API, shows a toast and prefixes the tab title with the number of unseen orders (“(2) Orders | Bilhanah”); the chime repeats every 30 s while orders are unseen. Touching the board (click or key) marks them seen. The navigation shows the number of orders waiting to be accepted. Browsers block audio until the page has been touched, so the board asks to “Enable sound” when needed; the sound switch is remembered in `localStorage` (`bilhanah:order-sound:v1`).

## Subscription (owners)

`/subscription` (also linked from the overview's plan card) shows the current access and, unless a payment is waiting for review, the pay or renew flow: plan (prices from `GET /v1/billing`), 1, 3, 6 or 12 months, the total and the dates the new period would cover (it starts when current coverage ends, so trial days are kept), one of the payment methods the administrators have set up with copyable details, then the transfer reference, an optional sender name and an optional receipt photo (`POST /v1/media?kind=PAYMENT_PROOF`; the API returns no URL for receipts, so the preview is the local file). A pending payment can be withdrawn. Receipts are fetched with the bearer token (`apiClient.requestBlob`) and shown from object URLs, never as plain `<img src>`.

## Sessions

- The access token lives in memory only. On startup the dashboard calls `POST /v1/auth/refresh`; the HttpOnly refresh cookie (scoped to `/v1/auth` on the API) restores the session.
- Every request is sent with `credentials: 'include'`. A 401 triggers one shared refresh and a single retry. Refresh tokens rotate and reuse revokes the session, so refreshes never overlap: callers in a tab share the in-flight refresh, and tabs take turns through `navigator.locks` (falling back to an in-tab queue). Sign-in and sign-out hold the same lock.
- Sign-in and sign-out are broadcast to other tabs (`BroadcastChannel`).
- Email links carry their token in the fragment (`/verify-email#token=…`, `/reset-password#token=…`); it is read once and removed from the address bar.

Route guards only shape navigation; the API enforces authorization.
