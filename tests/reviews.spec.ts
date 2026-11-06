import { test, expect, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { DinerReviewState, OrderStatus, PublicMenuResponse, PublicReview, PublicReviewsPage, ReviewForm } from '@bilhanah/contracts';
import { apiError, json, menuFixture, mockRealtime, orderFixture, restaurantUrl, serveMenu, TOKEN } from './ordering-fixtures';

// Reviews from the diner's side, against a mocked API (docs/REVIEWS.md in the API): the tracking
// page's "How was it?", the review sheet, editing, dish badges, the reviews page and feedback.

const orderPath = `/v1/public/orders/${TOKEN}`;
const KEY = 'k'.repeat(32);

const form: ReviewForm = {
  restaurant: { name: 'كشري أبو طارق', subdomain: 'koshary' },
  branch: { slug: 'main', name: 'وسط البلد' },
  subRatings: ['food', 'service'],
  dishRatings: true,
  dishRatingScale: 'THUMBS',
  commentRequiredBelow: 3,
  photos: true,
  maxPhotos: 3,
  tags: [
    { code: 'DELICIOUS', nameAr: 'الأكل حلو', nameEn: 'Delicious', sentiment: 'POSITIVE' },
    { code: 'SLOW', nameAr: 'اتأخر', nameEn: 'Slow', sentiment: 'NEGATIVE' },
  ],
  displayName: 'FIRST_NAME_INITIAL',
  // The order's two lines (orderFixture): only these can be rated.
  dishes: [
    { orderItemId: 'l1', nameAr: 'كشري', nameEn: 'Koshary', variantNameAr: 'كبير', variantNameEn: 'Large', quantity: 2 },
    { orderItemId: 'l2', nameAr: 'ليمون نعناع', nameEn: 'Lemon mint', variantNameAr: null, variantNameEn: null, quantity: 1 },
  ],
};

const open: DinerReviewState = { eligibility: 'OPEN', form, review: null, editableUntil: null, outcome: null };
const review = (overrides: Partial<NonNullable<DinerReviewState['review']>> = {}): NonNullable<DinerReviewState['review']> => ({
  overall: 4, ratings: { food: 4 }, dishes: [{ orderItemId: 'l1', rating: 5 }], tags: ['DELICIOUS'], comment: 'حلو قوي', photoIds: [], name: 'منى أحمد',
  hasContact: false, language: 'ar', createdAt: '2026-11-06T12:00:00.000Z', updatedAt: '2026-11-06T12:00:00.000Z', ...overrides,
});
const GOOGLE = 'https://search.google.com/local/writereview?placeid=demo';

type Mocks = { reviewGets: number; puts: Record<string, unknown>[]; uploads: number };

/** The order (live over a mocked socket), its alerts and its review state. */
async function serveOrder(page: Page, status: OrderStatus | (() => OrderStatus), state: () => DinerReviewState | Promise<DinerReviewState>, put?: (body: Record<string, unknown>, route: Route) => Promise<void>) {
  const mocks: Mocks = { reviewGets: 0, puts: [], uploads: 0 };
  await serveMenu(page);
  const realtime = await mockRealtime(page, 'live');
  await page.route(url => url.pathname === orderPath, route => route.fulfill(json(orderFixture(typeof status === 'function' ? status() : status, { type: 'PICKUP', tableLabel: null }))));
  await page.route('**/v1/public/orders/*/alerts', route => route.fulfill(json({ readyAlerts: false, push: null })));
  await page.route(url => url.pathname === `${orderPath}/review`, async route => {
    if (route.request().method() === 'GET') { mocks.reviewGets++; return route.fulfill(json(await state())); }
    const body = route.request().postDataJSON() as Record<string, unknown>;
    mocks.puts.push(body);
    if (put) return put(body, route);
    return route.fulfill(json({ review: review({ overall: body['overall'] as number }), outcome: { status: 'PUBLISHED', google: null }, editableUntil: new Date(Date.now() + 86_400_000).toISOString() }));
  });
  return { mocks, realtime };
}

async function axe(page: Page, selector: string) {
  const result = await new AxeBuilder({ page }).include(selector).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([]);
}

const sheet = (page: Page) => page.locator('dialog.review-sheet');
/** The overall stars (the sub-ratings' stars have the same names). */
const overall = (scope: ReturnType<Page['locator']>) => scope.getByRole('radiogroup', { name: /تقييمك العام|Your overall rating|^تقييمك/ });
const send = (page: Page) => sheet(page).getByRole('button', { name: /ابعت التقييم|احفظ التعديل/ }).click();

test('asks "How was it?" only once the order is reviewable, at the moment it completes', async ({ page }) => {
  let status: OrderStatus = 'PREPARING';
  const { mocks, realtime } = await serveOrder(page, () => status, () => (status === 'COMPLETED' ? open : { ...open, eligibility: 'NOT_YET', form: null }));
  await page.goto(restaurantUrl(`/order/${TOKEN}`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('طلبك بيتحضّر');
  await expect(page.locator('.track-live')).toHaveText('تحديث مباشر');
  // Not reviewable before the order is ready: the page does not even ask.
  expect(mocks.reviewGets).toBe(0);

  status = 'READY';
  realtime.push(orderFixture('READY', { type: 'PICKUP', tableLabel: null }));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('طلبك جاهز!');
  await expect.poll(() => mocks.reviewGets).toBe(1);
  await expect(page.getByTestId('review-invite')).toHaveCount(0);

  status = 'COMPLETED';
  realtime.push(orderFixture('COMPLETED', { type: 'PICKUP', tableLabel: null }));
  const invite = page.getByTestId('review-invite');
  await expect(invite).toBeVisible();
  await expect(invite.getByRole('heading')).toHaveText('الأكل كان عامل إيه؟');
  expect(mocks.reviewGets).toBe(2);

  // "Not now" puts it off for this order: a quiet link stays.
  await invite.getByRole('button', { name: 'مش دلوقتي' }).click();
  await expect(invite).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'قيّم طلبك' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'قيّم طلبك' })).toBeVisible();
  await expect(page.getByTestId('review-invite')).toHaveCount(0);
});

test('validates the review: stars first, a comment below the threshold, consent for a phone; rates only the order’s dishes', async ({ page }) => {
  const { mocks } = await serveOrder(page, 'COMPLETED', () => open, async (_body, route) => route.fulfill(json({
    review: review({ overall: 2 }), outcome: { status: 'PENDING', google: null }, editableUntil: new Date(Date.now() + 86_400_000).toISOString(),
  })));
  await page.goto(restaurantUrl(`/order/${TOKEN}`));
  await page.getByTestId('review-invite').locator('.review-quick-star').first().click();
  const dialog = page.getByRole('dialog', { name: 'الأكل كان عامل إيه؟' });
  await expect(dialog).toBeVisible();
  // Tapping one star on the invitation starts the review with it.
  await expect(overall(dialog).getByRole('radio', { name: /^١ من ٥ نجوم/ })).toBeChecked();
  await axe(page, 'dialog.review-sheet');

  // The order's own dishes, nothing else.
  await expect(dialog.getByTestId('review-dish')).toHaveCount(2);
  await expect(dialog.getByTestId('review-dish').nth(0)).toContainText('كشري');
  await expect(dialog.getByTestId('review-dish').nth(0)).toContainText('كبير');
  await expect(dialog.getByTestId('review-dish').nth(1)).toContainText('ليمون نعناع');

  // Below three stars the comment is required, and the form says why.
  await overall(dialog).getByRole('radio', { name: /^٢ من ٥ نجوم/ }).check();
  await expect(dialog.getByLabel(/تعليقك/)).toHaveAttribute('aria-required', 'true');
  await expect(dialog.locator('.review-field').first()).toContainText('مطلوب للتقييم الأقل من ٣ نجوم، عشان المطعم يعرف يصلّح إيه.');
  await send(page);
  await expect(dialog.getByLabel(/تعليقك/)).toBeFocused();
  await expect(dialog.locator('.field-error')).toContainText('التعليق مطلوب للتقييم الأقل من ٣ نجوم');
  expect(mocks.puts).toHaveLength(0);
  await dialog.getByLabel(/تعليقك/).fill('الأكل وصل بارد');

  // A phone number needs explicit consent.
  await dialog.getByLabel('رقم تليفونك').fill('010 1234 5678');
  await send(page);
  await expect(dialog.getByRole('checkbox', { name: /موافق إن المطعم يكلّمني/ })).toBeFocused();
  await expect(dialog.locator('.review-consent .field-error')).toContainText('وافق إن المطعم يكلّمك');
  expect(mocks.puts).toHaveLength(0);
  await dialog.getByRole('checkbox', { name: /موافق إن المطعم يكلّمني/ }).check();

  await dialog.getByRole('radiogroup', { name: 'الأكل' }).getByRole('radio', { name: /^٢ من ٥/ }).check();
  await dialog.getByRole('button', { name: 'معجبنيش: كشري (كبير)' }).click();
  await expect(dialog.getByRole('button', { name: 'معجبنيش: كشري (كبير)' })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'اتأخر' }).click();
  // How the name will show publicly (one word: as it is).
  await expect(dialog.getByText('هيظهر باسم:')).toContainText('أحمد');
  await send(page);
  await expect(page.getByTestId('review-thanks')).toHaveAttribute('data-outcome', 'pending');
  await expect(page.getByTestId('review-thanks')).toContainText('المطعم بيراجع التقييمات قبل ما تتنشر');
  // Not happy enough for the restaurant's Google threshold: no invitation.
  await expect(page.getByTestId('review-google')).toHaveCount(0);

  expect(mocks.puts).toHaveLength(1);
  const body = mocks.puts[0]!;
  expect(body).toMatchObject({
    overall: 2, ratings: { food: 2 }, dishes: [{ orderItemId: 'l1', rating: 1 }], tags: ['SLOW'], comment: 'الأكل وصل بارد', photoIds: [],
    name: 'أحمد', contactPhone: '01012345678', contactConsent: true, language: 'ar',
  });
  expect(body['editKey']).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
  // The key stays in this browser, so only it can edit the review.
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('bilhanah:review-keys:v1') ?? '{}'));
  expect(Object.values(stored)[0]).toMatchObject({ key: body['editKey'], sent: true });
});

test('a published review invites the diner to Google (http(s) links only), and the API’s errors are explained', async ({ page }) => {
  let google: string | null = GOOGLE;
  let fail: [number, string, unknown?] | null = [409, 'REVIEW_NOT_ELIGIBLE', { eligibility: 'CLOSED' }];
  const { mocks } = await serveOrder(page, 'COMPLETED', () => open, async (body, route) => {
    if (fail) { const [status, code, details] = fail; fail = null; return route.fulfill(apiError(status, code, details)); }
    return route.fulfill(json({ review: review({ overall: body['overall'] as number }), outcome: { status: 'PUBLISHED', google: google && { url: google } }, editableUntil: new Date(Date.now() + 86_400_000).toISOString() }));
  });
  await page.goto(restaurantUrl(`/order/${TOKEN}`));
  await page.getByTestId('review-invite').locator('.review-quick-star').nth(4).click();
  await send(page);
  await expect(sheet(page).getByRole('alert')).toContainText('الطلب ده مينفعش يتقيّم.');
  // The page asked again for the state after that answer.
  await expect.poll(() => mocks.reviewGets).toBe(2);

  await send(page);
  const thanks = page.getByTestId('review-thanks');
  await expect(thanks).toHaveAttribute('data-outcome', 'published');
  await expect(thanks).toContainText('شكرًا! تقييمك اتنشر');
  const link = page.getByTestId('review-google').getByRole('link', { name: /قيّم على جوجل/ });
  await expect(link).toHaveAttribute('href', GOOGLE);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.getByTestId('review-google')).toContainText('فرع وسط البلد');
  await axe(page, 'dialog.review-sheet');
  await thanks.getByRole('button', { name: 'تمام' }).click();
  await expect(page.getByTestId('review-mine')).toContainText('منشور على المنيو');
  await expect(page.getByTestId('review-mine').getByRole('link', { name: /قيّم على جوجل/ })).toHaveAttribute('href', GOOGLE);

  // Another order, a link that is not http(s): never offered.
  google = 'javascript:alert(1)';
  await page.evaluate(() => localStorage.removeItem('bilhanah:review-keys:v1'));
  await page.reload();
  await page.getByTestId('review-invite').locator('.review-quick-star').nth(4).click();
  for (const [status, code, details, message] of [
    [403, 'REVIEW_EDIT_FORBIDDEN', undefined, 'التقييم ده اتكتب من جهاز تاني'],
    [429, 'RATE_LIMITED', undefined, 'محاولات كتير ورا بعض'],
    [400, 'REVIEW_TAG_UNKNOWN', { tag: 'X' }, 'المطعم غيّر الأسئلة من شوية'],
  ] as const) {
    fail = [status, code, details];
    await send(page);
    await expect(sheet(page).getByRole('alert')).toContainText(message);
  }
  await send(page);
  await expect(page.getByTestId('review-thanks')).toBeVisible();
  await expect(page.getByTestId('review-google')).toHaveCount(0);
});

test('photos: uploads with progress and a preview, rejects wrong types and sizes nicely, and are sent with the review', async ({ page }) => {
  const { mocks } = await serveOrder(page, 'COMPLETED', () => open);
  let release: () => void = () => undefined;
  let reject = false;
  await page.route(url => url.pathname === `${orderPath}/review/photos`, async route => {
    mocks.uploads++;
    if (reject) return route.fulfill(apiError(400, 'UNSUPPORTED_IMAGE'));
    await new Promise<void>(resolve => { release = resolve; });
    return route.fulfill(json({ id: '7d8f1c2e-0000-4000-8000-000000000001', width: 640, height: 480 }, 201));
  });
  await page.goto(restaurantUrl(`/order/${TOKEN}`));
  await page.getByTestId('review-invite').locator('.review-quick-star').nth(4).click();
  const dialog = sheet(page);
  const input = dialog.getByTestId('review-photo-input');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

  // Wrong type and too large: refused before any upload.
  await input.setInputFiles({ name: 'menu.gif', mimeType: 'image/gif', buffer: png });
  await expect(dialog.locator('.review-section [role="status"]')).toContainText('«menu.gif» مش صورة JPEG أو PNG أو WebP.');
  await input.setInputFiles({ name: 'huge.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
  await expect(dialog.locator('.review-section [role="status"]')).toContainText('«huge.jpg» أكبر من ٥ ميجا.');
  expect(mocks.uploads).toBe(0);

  // A good photo: previewed at once, with a progress bar until the API has it.
  await input.setInputFiles({ name: 'koshary.png', mimeType: 'image/png', buffer: png });
  await expect(dialog.getByTestId('review-photo')).toHaveCount(1);
  await expect(dialog.locator('.review-photo.is-uploading progress')).toBeVisible();
  await expect(dialog.getByTestId('review-photo').locator('img')).toHaveAttribute('src', /^blob:/);
  // Sending waits for it.
  await send(page);
  await expect(dialog.getByRole('alert')).toContainText('استنى لحد ما الصور تخلص رفع.');
  release();
  await expect(dialog.locator('.review-photo.is-done')).toHaveCount(1);

  // The API refuses a file the browser thought was fine: it is taken out, and the diner is told.
  reject = true;
  await input.setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: png });
  await expect(dialog.locator('.review-section [role="status"]')).toContainText('«fake.png»: الصورة دي مش JPEG أو PNG أو WebP.');
  await expect(dialog.getByTestId('review-photo')).toHaveCount(1);

  await send(page);
  await expect(page.getByTestId('review-thanks')).toBeVisible();
  expect(mocks.puts[0]!['photoIds']).toEqual(['7d8f1c2e-0000-4000-8000-000000000001']);
});

test('edits the review within the window from the same browser, and shows it read-only after', async ({ page }) => {
  const now = new Date('2026-11-06T12:00:00.000Z');
  await page.clock.install({ time: now });
  const until = new Date(now.getTime() + 2 * 60_000).toISOString();
  await page.addInitScript(([key, token]) => localStorage.setItem('bilhanah:review-keys:v1', JSON.stringify({ [token!]: { key, savedAt: Date.now(), sent: true } })), [KEY, TOKEN]);
  const editable: DinerReviewState = { eligibility: 'EDITABLE', form, review: review(), editableUntil: until, outcome: { status: 'PUBLISHED', google: null } };
  const { mocks } = await serveOrder(page, 'COMPLETED', () => editable, async (body, route) => route.fulfill(json({
    review: review({ overall: body['overall'] as number, comment: body['comment'] as string }), outcome: { status: 'PUBLISHED', google: null }, editableUntil: until,
  })));
  await page.goto(restaurantUrl(`/order/${TOKEN}`));
  const mine = page.getByTestId('review-mine');
  await expect(mine).toContainText('حلو قوي');
  await expect(mine).toContainText('فاضل دقيقتين');
  await mine.getByRole('button', { name: 'عدّل تقييمك' }).click();

  const dialog = page.getByRole('dialog', { name: 'عدّل تقييمك' });
  await expect(overall(dialog).getByRole('radio', { name: /^٤ من ٥ نجوم/ })).toBeChecked();
  await expect(dialog.getByLabel(/تعليقك/)).toHaveValue('حلو قوي');
  await expect(dialog.getByRole('button', { name: 'عجبني: كشري (كبير)' })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByRole('button', { name: /الأكل حلو/ })).toHaveAttribute('aria-pressed', 'true');
  await overall(dialog).getByRole('radio', { name: /^٥ من ٥ نجوم/ }).check();
  await dialog.getByLabel(/تعليقك/).fill('أحلى من المرة اللي فاتت');
  await send(page);
  await expect(page.getByTestId('review-thanks')).toBeVisible();
  expect(mocks.puts[0]).toMatchObject({ overall: 5, comment: 'أحلى من المرة اللي فاتت', editKey: KEY, dishes: [{ orderItemId: 'l1', rating: 5 }], tags: ['DELICIOUS'] });
  await page.getByTestId('review-thanks').getByRole('button', { name: 'تمام' }).click();
  await expect(mine).toContainText('أحلى من المرة اللي فاتت');

  // The window closes while the page is open: read-only from then on.
  await page.clock.runFor(3 * 60_000);
  await expect(mine).toHaveAttribute('data-eligibility', 'locked');
  await expect(mine).toContainText('التقييم ده مبقاش ينفع يتعدّل.');
  await expect(mine.getByRole('button', { name: 'عدّل تقييمك' })).toHaveCount(0);
});

test('a review written on another device, or after its window, is shown read-only', async ({ page }) => {
  let state: DinerReviewState = { eligibility: 'EDITABLE', form, review: review(), editableUntil: new Date(Date.now() + 3_600_000).toISOString(), outcome: { status: 'PENDING', google: null } };
  await serveOrder(page, 'COMPLETED', () => state);
  await page.goto(restaurantUrl(`/order/${TOKEN}`));
  const mine = page.getByTestId('review-mine');
  await expect(mine).toContainText('مستني مراجعة المطعم');
  await expect(mine).toContainText('التقييم ده يتعدّل بس من الجهاز اللي اتكتب منه.');
  await expect(mine.getByRole('button', { name: 'عدّل تقييمك' })).toHaveCount(0);

  state = { eligibility: 'LOCKED', form: null, review: review(), editableUntil: new Date(Date.now() - 1000).toISOString(), outcome: { status: 'PUBLISHED', google: null } };
  await page.reload();
  await expect(mine).toContainText('التقييم ده مبقاش ينفع يتعدّل.');
  await expect(mine.getByRole('button')).toHaveCount(0);
});

test('an API without reviews, or an unexpected answer, asks nothing', async ({ page }) => {
  // Older specs route every order path to the order itself: that is not a review state.
  await serveOrder(page, 'COMPLETED', () => orderFixture('COMPLETED') as unknown as DinerReviewState);
  await page.goto(restaurantUrl(`/order/${TOKEN}`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('بالهنا والشفا!');
  await page.waitForTimeout(300);
  await expect(page.locator('.review-card')).toHaveCount(0);
});

// --- The menu -------------------------------------------------------------------------------------

function reviewsMenu(scale: 'THUMBS' | 'STARS' = 'STARS', feedback = true): PublicMenuResponse {
  const menu = menuFixture();
  const restaurant = menu.restaurant as Extract<PublicMenuResponse['restaurant'], { availability: 'AVAILABLE' }>;
  restaurant.reviews = { page: true, feedback, dishRatingScale: scale };
  const [koshary, fatta] = menu.categories[0]!.items;
  koshary!.rating = { average: 4.3, count: 11, positiveShare: 0.8182 };
  fatta!.rating = null;
  return menu;
}

const publicReview = (index: number, overrides: Partial<PublicReview> = {}): PublicReview => ({
  id: `r${index}`, overall: index % 5 === 0 ? 2 : 5, ratings: { food: 5 }, tags: [{ code: 'DELICIOUS', nameAr: 'الأكل حلو', nameEn: 'Delicious', sentiment: 'POSITIVE' }],
  comment: `تعليق رقم ${index}`, displayName: index === 1 ? null : 'منى أ.', verified: index !== 2, branch: { slug: 'main', name: 'وسط البلد' },
  dishes: [{ nameAr: 'كشري', nameEn: 'Koshary', rating: 5 }], photos: [], reply: null,
  createdAt: '2026-11-05T12:00:00.000Z', publishedAt: '2026-11-05T12:00:00.000Z', ...overrides,
});

function reviewsPage(page: number): PublicReviewsPage {
  const items = page === 1
    ? Array.from({ length: 10 }, (_, index) => publicReview(index + 1, index === 0 ? { reply: { text: 'منورنا يا فندم ❤', at: '2026-11-05T13:00:00.000Z' } } : {}))
    : [publicReview(11), publicReview(12)];
  return {
    restaurant: { name: 'كشري أبو طارق', subdomain: 'koshary' }, branch: null,
    summary: { average: 4.05, count: 12, distribution: { '1': 0, '2': 2, '3': 1, '4': 4, '5': 5 }, verifiedCount: 11, subRatings: { food: 4.3, service: 4.1 }, policy: { mode: 'AUTO', minStars: 3 } },
    dishRatingScale: 'STARS', items, total: 12, page, pageSize: 10,
  };
}

async function serveReviews(page: Page) {
  const requests: string[] = [];
  await page.route(url => url.pathname === '/v1/public/restaurants/koshary/reviews', route => {
    const url = new URL(route.request().url());
    requests.push(url.search);
    return route.fulfill(json(reviewsPage(Number(url.searchParams.get('page') ?? 1))));
  });
  return requests;
}

test('dish badges show diners’ ratings on the cards and in the dish sheet, nothing without a rating', async ({ page }) => {
  await serveMenu(page, reviewsMenu('STARS'));
  await serveReviews(page);
  await page.goto(restaurantUrl());
  const koshary = page.locator('.dish-item', { hasText: 'كشري' });
  await expect(koshary.getByTestId('dish-rating')).toContainText('تقييمه ٤٫٣ من ٥، ١١ تقييم');
  await expect(koshary.getByTestId('dish-rating').locator('.dish-rating-value')).toHaveText('٤٫٣· ١١');
  await expect(page.locator('.dish-item', { hasText: 'فتة' }).getByTestId('dish-rating')).toHaveCount(0);
  await expect(page.locator('.dish-item', { hasText: 'ليمون نعناع' }).getByTestId('dish-rating')).toHaveCount(0);
  await koshary.locator('.dish-card').click();
  await expect(page.getByRole('dialog', { name: 'كشري' }).getByTestId('dish-rating')).toContainText('٤٫٣');

  // The thumbs scale shows the share who liked it.
  await page.unroute('**/v1/public/restaurants/koshary/menu');
  await page.addInitScript(() => localStorage.setItem('bilhanah:language:v1', 'en'));
  await serveMenu(page, reviewsMenu('THUMBS'));
  await page.reload();
  await expect(page.locator('.dish-item', { hasText: 'Koshary' }).getByTestId('dish-rating')).toContainText('82%');
  await expect(page.locator('.dish-item', { hasText: 'Koshary' }).getByTestId('dish-rating')).toContainText('82% liked it, 11 ratings');

  // An API without reviews: no badges, no header rating, no feedback.
  await page.unroute('**/v1/public/restaurants/koshary/menu');
  await serveMenu(page);
  await page.reload();
  await expect(page.getByTestId('dish-rating')).toHaveCount(0);
  await expect(page.getByTestId('menu-rating')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Share feedback' })).toHaveCount(0);
});

test('the reviews page: average in the header, summary, the moderation note, verified badges, replies and paging', async ({ page }) => {
  await serveMenu(page, reviewsMenu());
  const requests = await serveReviews(page);
  await page.goto(restaurantUrl());
  const rating = page.getByTestId('menu-rating');
  await expect(rating).toHaveAccessibleName('التقييم ٤٫١ من ٥، ١٢ تقييم. اقرا الآراء');
  await rating.click();
  const dialog = page.getByRole('dialog', { name: /آراء الزباين/ });
  await expect(dialog).toBeVisible();
  // The header's request is reused for the first page.
  expect(requests).toEqual(['?pageSize=10']);
  const summary = dialog.getByTestId('reviews-summary');
  await expect(summary).toContainText('٤٫١');
  await expect(summary).toContainText('١٢ تقييم');
  await expect(summary).toContainText('١١ من طلبات مؤكدة');
  await expect(summary.getByRole('list', { name: 'توزيع النجوم' }).getByRole('listitem').first()).toContainText('٥ نجوم: ٥');
  await expect(summary).toContainText('الأكل');
  await expect(dialog.getByTestId('reviews-policy')).toHaveText('التقييمات من ٣ نجوم وأكتر بتتنشر على طول، والأقل منها بيراجعها المطعم الأول. المتوسط محسوب من التقييمات المنشورة بس.');
  const reviews = dialog.getByTestId('public-review');
  await expect(reviews).toHaveCount(10);
  await expect(reviews.nth(0)).toContainText('ضيف');
  await expect(reviews.nth(0)).toContainText('طلب مؤكد');
  await expect(reviews.nth(1)).toContainText('من غير طلب');
  await expect(reviews.nth(0).getByTestId('review-reply')).toContainText('رد كشري أبو طارق');
  await expect(reviews.nth(0).getByTestId('review-reply')).toContainText('منورنا يا فندم');
  await axe(page, 'dialog.review-sheet');

  await dialog.getByRole('button', { name: /اعرض تقييمات تانية \(٢\)/ }).click();
  await expect(reviews).toHaveCount(12);
  expect(requests).toEqual(['?pageSize=10', '?page=2&pageSize=10']);
  await expect(dialog.getByRole('button', { name: /اعرض تقييمات تانية/ })).toHaveCount(0);
});

test('without moderation the page does not add a note, and a page that fails offers a retry', async ({ page }) => {
  await serveMenu(page, reviewsMenu());
  let fail = false;
  await page.route(url => url.pathname === '/v1/public/restaurants/koshary/reviews', route => {
    if (fail) return route.fulfill(apiError(500, 'INTERNAL_SERVER_ERROR'));
    const body = reviewsPage(1);
    body.summary.policy = { mode: 'AUTO', minStars: 1 };
    return route.fulfill(json(body));
  });
  await page.goto(restaurantUrl());
  await page.getByTestId('menu-rating').click();
  const dialog = page.getByRole('dialog', { name: /آراء الزباين/ });
  await expect(dialog.getByTestId('public-review')).toHaveCount(10);
  await expect(dialog.getByTestId('reviews-policy')).toHaveCount(0);
  fail = true;
  await dialog.getByRole('button', { name: /اعرض تقييمات تانية/ }).click();
  await expect(dialog.getByText('مقدرناش نجيب التقييمات.')).toBeVisible();
  fail = false;
  await dialog.getByRole('button', { name: 'حاول تاني' }).click();
  await expect(dialog.getByTestId('public-review')).toHaveCount(20);
});

test('unverified feedback: table context, a hidden honeypot, validation and the daily limit', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('bilhanah:table:v1:koshary', JSON.stringify({ code: 'GOOD1234', label: '5', branch: null })));
  await page.route('**/v1/public/restaurants/koshary/tables/GOOD1234', route => route.fulfill(json({ label: '5' })));
  await serveMenu(page, reviewsMenu());
  await serveReviews(page);
  const posts: Record<string, unknown>[] = [];
  const answers: (() => ReturnType<typeof json>)[] = [
    () => apiError(400, 'REVIEW_COMMENT_REQUIRED', { below: 3 }),
    () => apiError(429, 'RATE_LIMITED', { limit: 5 }),
    () => json({ outcome: { status: 'PENDING', google: null } }, 201),
  ];
  await page.route('**/v1/public/restaurants/koshary/feedback', route => {
    posts.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill(answers.shift()!());
  });
  await page.goto(restaurantUrl());
  await page.getByRole('button', { name: 'قول رأيك في المطعم' }).click();
  const dialog = page.getByRole('dialog', { name: 'قول رأيك' });
  await expect(dialog.getByTestId('feedback-context')).toContainText('طاولة ٥');
  await expect(dialog).toContainText('مش مؤكد');
  // The honeypot is out of sight and out of the tab order.
  const trap = dialog.locator('input[name="website"]');
  await expect(trap).toHaveAttribute('tabindex', '-1');
  expect(await trap.evaluate(element => element.closest('[aria-hidden="true"]') !== null && element.closest<HTMLElement>('.feedback-trap')!.getBoundingClientRect().width <= 1)).toBe(true);
  await axe(page, 'dialog.review-sheet');

  await dialog.getByRole('button', { name: 'ابعت رأيك' }).click();
  await expect(dialog.locator('.stars-field .field-error')).toHaveText('اختار عدد النجوم الأول.');
  expect(posts).toHaveLength(0);
  await overall(dialog).getByRole('radio', { name: /^٢ من ٥ نجوم/ }).check();
  await dialog.getByRole('button', { name: 'ابعت رأيك' }).click();
  // The API asks for a comment below its threshold: the form now says it is required.
  await expect(dialog.getByLabel(/تعليقك/)).toBeFocused();
  await expect(dialog.locator('.review-field').first()).toContainText('(مطلوب)');
  await dialog.getByLabel(/تعليقك/).fill('الخدمة كانت بطيئة');
  await dialog.getByRole('button', { name: 'ابعت رأيك' }).click();
  await expect(dialog.getByRole('alert')).toContainText('بعت آراء كتير النهارده (الحد ٥ في اليوم). تقدر تبعت تاني بكرة.');
  await dialog.getByRole('button', { name: 'ابعت رأيك' }).click();
  await expect(page.getByTestId('review-thanks')).toHaveAttribute('data-outcome', 'pending');
  expect(posts[2]).toEqual({ overall: 2, comment: 'الخدمة كانت بطيئة', name: null, contactPhone: null, contactConsent: false, language: 'ar', tableCode: 'GOOD1234' });
});

test('"Rate your last order" on the menu opens the order with its review sheet', async ({ page }) => {
  await page.addInitScript(token => localStorage.setItem('bilhanah:orders:v1:koshary', JSON.stringify([{ trackingToken: token, number: 12, placedAt: new Date(Date.now() - 26 * 3_600_000).toISOString() }])), TOKEN);
  await serveOrder(page, 'COMPLETED', () => open);
  await page.unroute('**/v1/public/restaurants/koshary/menu');
  await serveMenu(page, reviewsMenu());
  await serveReviews(page);
  await page.goto(restaurantUrl());
  const prompt = page.getByTestId('review-prompt');
  // A day-old order no longer shows as "track your order", but can still be reviewed.
  await expect(page.locator('.recent-order-link')).toHaveCount(0);
  await expect(prompt).toContainText('طلب رقم ١٢ كان عامل إيه؟');
  await prompt.getByRole('link').click();
  await expect(page).toHaveURL(new RegExp(`/order/${TOKEN.replace('.', '\\.')}$`));
  await expect(page.getByRole('dialog', { name: 'الأكل كان عامل إيه؟' })).toBeVisible();
  await page.keyboard.press('Escape');

  // "Not now" on the menu: it stops asking.
  await page.goto(restaurantUrl());
  await prompt.getByRole('button', { name: 'مش دلوقتي' }).click();
  await expect(prompt).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('menu-rating')).toBeVisible();
  await expect(prompt).toHaveCount(0);
});

test('English, Arabesque and narrow screens: no horizontal scroll, large targets, axe-clean sheets', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bilhanah:language:v1', 'en'));
  await serveOrder(page, 'COMPLETED', () => open);
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(restaurantUrl(`/order/${TOKEN}`));
    await expect(page.getByTestId('review-invite').getByRole('heading')).toHaveText('How was it?');
    await page.getByTestId('review-invite').locator('.review-quick-star').nth(3).click();
    const dialog = page.getByRole('dialog', { name: 'How was it?' });
    await expect(overall(dialog).getByRole('radio', { name: '4 out of 5 stars, Very good' })).toBeChecked();
    await expect(dialog.getByText('Shown as:')).toContainText('أحمد');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `order page at ${width}`).toBe(true);
    const content = dialog.locator('.review-sheet-content');
    expect(await content.evaluate(element => element.scrollWidth <= element.clientWidth), `review sheet at ${width}`).toBe(true);
    // Every control in the sheet is at least 44 px tall and wide (checkboxes sit in 44 px labels).
    const small = await dialog.locator('button, .star-option, .review-consent label, .review-photo-add label').evaluateAll(elements => elements
      .map(element => ({ box: element.getBoundingClientRect(), name: `${element.className} ${element.textContent}` })).filter(({ box }) => box.width > 0 && (box.width < 43.5 || box.height < 43.5)).map(({ box, name }) => `${name} ${Math.round(box.width)}x${Math.round(box.height)}`));
    expect(small, `small targets at ${width}`).toEqual([]);
    await axe(page, 'dialog.review-sheet');
  }

  // The menu's sheets on Arabesque.
  await page.setViewportSize({ width: 390, height: 900 });
  const menu = reviewsMenu();
  (menu.restaurant as { menuTheme?: string }).menuTheme = 'arabesque';
  await page.unroute('**/v1/public/restaurants/koshary/menu');
  await serveMenu(page, menu);
  await serveReviews(page);
  await page.goto(restaurantUrl());
  await page.getByTestId('menu-rating').click();
  await expect(page.getByRole('dialog', { name: /Reviews/ }).getByTestId('public-review')).toHaveCount(10);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await axe(page, 'dialog.review-sheet');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Share feedback' }).click();
  await expect(page.getByRole('dialog', { name: 'Share feedback' })).toBeVisible();
  await axe(page, 'dialog.review-sheet');
});
