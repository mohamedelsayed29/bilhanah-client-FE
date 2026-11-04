import { readFile } from 'node:fs/promises';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import type { PublicMenuResponse } from '@bilhanah/contracts';
import { API_URL, emailLink, expectAccessible, expectNoOverflow, makeJpeg, screenshot, uniqueSuffix } from './helpers';

// One owner account per run (the API rate-limits registrations per IP), shared by the steps below.
test.describe.configure({ mode: 'serial' });

const suffix = uniqueSuffix();
const email = `owner-${suffix}@e2e-bilhanah.test`;
const password = 'Kofta-and-Rice-2026';
const newPassword = 'Grilled-Fish-2027!';
const subdomain = `e2e-${suffix}`;
const restaurantName = 'مشويات أبو طارق';

let context: BrowserContext;
let page: Page;
const pageErrors: string[] = [];

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext();
  page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
});
test.afterAll(async () => { await context.close(); });

async function publicMenu(): Promise<PublicMenuResponse> {
  const response = await page.request.get(`${API_URL}/v1/public/restaurants/${subdomain}/menu`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as PublicMenuResponse;
}

/** Waits for the API call matching `method` and `path`, and that it succeeded. */
function apiCall(method: string, path: RegExp) {
  return page.waitForResponse(response => response.request().method() === method && path.test(new URL(response.url()).pathname) && response.ok());
}

test('registers, confirms the email from Mailpit and signs in', async () => {
  const startedAt = Date.now() - 5_000;
  await page.goto('/register');
  await page.getByLabel('اسمك').fill('طارق الاختبار');
  await page.getByLabel('الإيميل').fill(email);
  await page.getByLabel('كلمة السر', { exact: true }).fill(password);
  await page.getByRole('radio', { name: 'العربية' }).check();
  await page.getByRole('button', { name: 'إنشاء الحساب' }).click();
  await expect(page).toHaveURL(/\/check-email$/);
  await expect(page.getByRole('heading', { level: 1, name: 'افتح إيميلك' })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  await expectAccessible(page, 'check email');

  const link = await emailLink(page.request, email, 'verify-email', startedAt);
  expect(link.startsWith('http://127.0.0.1:5174/verify-email#token=')).toBe(true);
  await page.goto(link);
  await expect(page.getByRole('heading', { level: 1, name: 'إيميلك اتأكد' })).toBeVisible();
  await expect(page).toHaveURL(/\/verify-email$/);

  await page.getByRole('link', { name: 'سجّل دخولك' }).click();
  await page.getByLabel('الإيميل').fill(email);
  await page.getByLabel('كلمة السر', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'دخول' }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
});

test('creates the restaurant with a live subdomain check', async () => {
  await expect(page.getByRole('heading', { level: 1, name: 'عرّفنا على مطعمك' })).toBeVisible();
  await expect(page).toHaveTitle(/بيانات مطعمك/);
  await page.getByLabel('اسم المطعم').fill(restaurantName);
  const address = page.getByLabel('عنوان المنيو على الإنترنت');
  await address.fill('admin');
  await expect(page.locator('#subdomain-status')).toContainText('محجوز');
  await address.fill('ab');
  await expect(page.locator('#subdomain-status')).toContainText('من ٣ لـ ٤٠ حرف');
  await address.fill(subdomain);
  await expect(page.locator('#subdomain-status')).toContainText('متاح');
  await expect(page.locator('.subdomain-preview')).toContainText(`${subdomain}.bilhanah.com`);
  await expect(page.getByLabel('اسم المسؤول')).toHaveValue('طارق الاختبار');
  await page.getByLabel('رقم الموبايل').fill('0101 234 5678');
  await page.getByLabel('المدينة').fill('الإسكندرية');
  await page.getByLabel('العنوان', { exact: true }).fill('١٢ شارع خالد بن الوليد، سيدي بشر');
  await expectAccessible(page, 'onboarding');
  await screenshot(page, 'onboarding-ar-desktop');
  await page.getByRole('button', { name: 'أنشئ مطعمي وابدأ التجربة' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: restaurantName })).toBeVisible();
  await expect(page.getByText('مطعمك جاهز! بدأت تجربتك المجانية لمدة ٣٠ يوم.')).toBeVisible();
  await expect(page.locator('.plan-card')).toContainText('تجربة مجانية');
  await expect(page.locator('.plan-card .plan-days strong')).toHaveText(/[٢٣][٠٩]/);
});

test('builds the menu: categories, an item with a photo, sizes, sold out and reordering', async () => {
  await page.getByRole('navigation', { name: 'القائمة الرئيسية' }).getByRole('link', { name: 'المنيو' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'المنيو' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'المنيو لسه فاضي' })).toBeVisible();

  // A suggested category, then one typed by hand.
  await page.getByRole('button', { name: 'مشويات' }).click();
  const categoryDialog = page.getByRole('dialog', { name: 'قسم جديد' });
  await expect(categoryDialog.getByLabel('الاسم بالعربي')).toHaveValue('مشويات');
  await categoryDialog.getByRole('button', { name: 'أضف القسم' }).click();
  await expect(categoryDialog).toBeHidden();
  await page.getByRole('button', { name: 'قسم جديد', exact: true }).click();
  await categoryDialog.getByLabel('الاسم بالعربي').fill('مشروبات');
  await categoryDialog.getByLabel('الاسم بالإنجليزي').fill('Drinks');
  await categoryDialog.getByLabel('الاسم بالعربي').press('Enter');
  await expect(page.getByTestId('category')).toHaveCount(2);

  // Item with a photo.
  await page.getByRole('button', { name: 'أضف صنف في مشويات' }).click();
  const itemDialog = page.getByRole('dialog', { name: 'صنف جديد' });
  await itemDialog.getByLabel('الاسم بالعربي').fill('كفتة مشوية');
  await itemDialog.getByLabel('الاسم بالإنجليزي').fill('Grilled kofta');
  await itemDialog.getByLabel('الوصف بالعربي').fill('نص كيلو كفتة على الفحم مع عيش وسلطة');
  await itemDialog.getByRole('button', { name: 'أضف الصنف' }).click();
  await expect(itemDialog.getByText('اكتب السعر بالجنيه، زي 45 أو 45.50')).toBeVisible();
  await itemDialog.getByLabel('السعر بالجنيه').fill('١٤٥٫٥');
  const photo = await makeJpeg(page, 800, 600);
  const uploaded = apiCall('POST', /\/v1\/media$/);
  await itemDialog.getByTestId('upload-item').setInputFiles({ name: 'kofta.jpg', mimeType: 'image/jpeg', buffer: photo });
  await uploaded;
  await expect(itemDialog.getByRole('button', { name: 'تغيير الصورة' })).toBeVisible();
  await expectAccessible(page, 'item editor');
  await screenshot(page, 'item-editor-ar-desktop', false);
  await itemDialog.getByRole('button', { name: 'أضف الصنف' }).click();
  await expect(itemDialog).toBeHidden();

  // A rejected file is explained without being uploaded.
  await page.getByRole('button', { name: 'أضف صنف في مشويات' }).click();
  await itemDialog.getByTestId('upload-item').setInputFiles({ name: 'menu.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
  await expect(itemDialog.getByRole('alert')).toContainText('ارفع صورة JPEG أو PNG أو WebP.');
  // An image the API rejects as too small.
  await itemDialog.getByTestId('upload-item').setInputFiles({ name: 'tiny.jpg', mimeType: 'image/jpeg', buffer: await makeJpeg(page, 120, 120) });
  await expect(itemDialog.getByRole('alert')).toContainText('الصورة صغيرة');

  // Item with sizes.
  await itemDialog.getByLabel('الاسم بالعربي').fill('شيش طاووق');
  await itemDialog.getByRole('radio', { name: 'أكتر من حجم' }).check();
  await itemDialog.getByLabel('اسم الحجم ١').fill('نص');
  await itemDialog.getByLabel('سعر الحجم ١').fill('90');
  await itemDialog.getByLabel('اسم الحجم ٢').fill('كامل');
  await itemDialog.getByLabel('سعر الحجم ٢').fill('170');
  await itemDialog.getByRole('button', { name: 'أضف الصنف' }).click();
  await expect(itemDialog).toBeHidden();

  for (const [category, name, price] of [['مشويات', 'ريش ضاني', '320'], ['مشروبات', 'عصير مانجو', '45']] as const) {
    await page.getByRole('button', { name: `أضف صنف في ${category}` }).click();
    await itemDialog.getByLabel('الاسم بالعربي').fill(name);
    await itemDialog.getByLabel('السعر بالجنيه').fill(price);
    await itemDialog.getByRole('button', { name: 'أضف الصنف' }).click();
    await expect(itemDialog).toBeHidden();
  }
  await expect(page.getByTestId('item-row')).toHaveCount(4);

  // One-tap sold out.
  const soldOut = apiCall('PATCH', /\/v1\/menu\/items\//);
  await page.getByRole('switch', { name: 'كفتة مشوية متاح' }).click();
  await expect(page.getByRole('switch', { name: 'كفتة مشوية متاح' })).toHaveAttribute('aria-checked', 'false');
  await soldOut;

  // Keyboard reordering: lamb chops to the top of the grills, drinks above grills.
  const itemOrder = apiCall('PUT', /\/v1\/menu\/categories\/[^/]+\/items\/order$/);
  const handle = page.getByRole('button', { name: 'رتّب ريش ضاني' });
  await handle.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');
  await itemOrder;
  const grills = page.getByTestId('category').filter({ has: page.getByRole('heading', { name: 'مشويات' }) });
  await expect(grills.locator('.item-text strong')).toHaveText(['ريش ضاني', 'كفتة مشوية', 'شيش طاووق']);

  const categoryOrder = apiCall('PUT', /\/v1\/menu\/categories\/order$/);
  await page.getByRole('button', { name: 'رتّب قسم مشروبات' }).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');
  await categoryOrder;
  await expect(page.getByTestId('category').locator('h2')).toHaveText(['مشروبات', 'مشويات']);

  await expectAccessible(page, 'menu editor');
  await screenshot(page, 'menu-ar-desktop');

  // The public menu reflects every change immediately.
  const menu = await publicMenu();
  expect(menu.restaurant.availability).toBe('AVAILABLE');
  expect(menu.categories.map(category => category.nameAr)).toEqual(['مشروبات', 'مشويات']);
  const grillItems = menu.categories[1]!.items;
  expect(grillItems.map(item => item.nameAr)).toEqual(['ريش ضاني', 'كفتة مشوية', 'شيش طاووق']);
  const kofta = grillItems[1]!;
  expect(kofta.isAvailable).toBe(false);
  expect(kofta.nameEn).toBe('Grilled kofta');
  expect(kofta.variants.map(variant => variant.pricePiastres)).toEqual([14550]);
  expect(kofta.image?.sources.length).toBeGreaterThan(0);
  expect(grillItems[2]!.variants.map(variant => [variant.nameAr, variant.pricePiastres])).toEqual([['نص', 9000], ['كامل', 17000]]);
});

test('edits an item and hides a category', async () => {
  await page.getByRole('button', { name: 'عدّل شيش طاووق' }).first().click();
  const editor = page.getByRole('dialog', { name: 'تعديل الصنف' });
  await expect(editor.getByLabel('سعر الحجم ٢')).toHaveValue('170');
  await editor.getByLabel('سعر الحجم ٢').fill('175');
  await editor.getByRole('button', { name: 'احفظ التغييرات' }).click();
  await expect(editor).toBeHidden();
  await expect(page.getByText('من ٩٠ ج.م')).toBeVisible();

  await page.getByRole('button', { name: 'اخفي قسم مشروبات' }).click();
  await expect(page.getByRole('button', { name: 'اظهر قسم مشروبات' })).toBeVisible();
  await expect.poll(async () => (await publicMenu()).categories.map(category => category.nameAr)).toEqual(['مشويات']);
  await page.getByRole('button', { name: 'اظهر قسم مشروبات' }).click();
  await expect.poll(async () => (await publicMenu()).categories.length).toBe(2);
});

test('saves the brand color and opening hours', async () => {
  await page.getByRole('navigation', { name: 'القائمة الرئيسية' }).getByRole('link', { name: 'الإعدادات' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'الإعدادات' })).toBeVisible();
  await expect(page.locator('.address-card')).toContainText(subdomain);
  await expectAccessible(page, 'settings: profile');

  await page.getByRole('link', { name: 'الشكل والألوان' }).click();
  await page.getByLabel('كود اللون').fill('#b91c1c');
  // The theme switches the live preview of the real menu at once; it reaches diners when saved.
  await expect(page.getByRole('radio', { name: /كلاسيك/ })).toBeChecked();
  await page.getByRole('radio', { name: /أرابيسك/ }).check();
  await expect(page.locator('.live-preview iframe')).toHaveAttribute('src', new RegExp(`^https?://${subdomain}\\.[^/]+/\\?preview-theme=arabesque`));
  const logo = await makeJpeg(page, 500, 500);
  await page.getByTestId('upload-logo').setInputFiles({ name: 'logo.jpg', mimeType: 'image/jpeg', buffer: logo });
  await expect(page.getByRole('button', { name: 'تغيير الصورة' })).toBeVisible();
  await expectAccessible(page, 'settings: branding');
  await screenshot(page, 'branding-ar-desktop');
  await page.getByRole('button', { name: 'احفظ', exact: true }).click();
  await expect(page.getByText('اتحفظت التغييرات')).toBeVisible();

  await page.getByRole('link', { name: 'مواعيد الشغل' }).click();
  await page.getByRole('switch', { name: 'اعرض مواعيد الشغل في المنيو' }).click();
  await page.getByRole('switch', { name: 'الجمعة مفتوح' }).click();
  const thursday = page.getByTestId('day-thu');
  await thursday.getByLabel('لحد').fill('02:00');
  await expect(thursday.getByText('لليوم اللي بعده')).toBeVisible();
  await page.getByRole('button', { name: 'أضف فترة يوم السبت' }).click();
  await page.getByTestId('day-sat').getByLabel('من').nth(1).fill('23:00');
  await page.getByTestId('day-sat').getByLabel('لحد').nth(1).fill('23:00');
  await page.getByRole('button', { name: 'احفظ المواعيد' }).click();
  await expect(page.getByText('اكتب وقت فتح وقفل مختلفين.')).toBeVisible();
  await page.getByRole('button', { name: 'امسح فترة ٢ يوم السبت' }).click();
  await expectAccessible(page, 'settings: hours');
  await screenshot(page, 'hours-ar-desktop');
  // The branding save's toast may still be showing, so wait for this save itself.
  const savedHours = apiCall('PATCH', /\/v1\/restaurants\/mine$/);
  await page.getByRole('button', { name: 'احفظ المواعيد' }).click();
  await savedHours;
  await expect(page.getByText('اتحفظت التغييرات')).toBeVisible();

  const { restaurant } = await publicMenu();
  if (restaurant.availability !== 'AVAILABLE') throw new Error('Restaurant should be available during the trial');
  expect(restaurant.brandColor).toBe('#b91c1c');
  expect(restaurant.menuTheme).toBe('arabesque');
  expect(restaurant.logo).not.toBeNull();
  expect(restaurant.openingHours?.fri).toEqual([]);
  expect(restaurant.openingHours?.thu).toEqual([{ opens: '10:00', closes: '02:00' }]);
  expect(restaurant.openingHours?.sat).toEqual([{ opens: '10:00', closes: '23:00' }]);
});

test('changes the password and signs in with the new one', async () => {
  await page.getByRole('link', { name: 'الحساب والأمان' }).click();
  await expect(page.getByTestId('session-row').filter({ hasText: 'الجهاز ده' })).toHaveCount(1);
  await page.getByLabel('كلمة السر الحالية').fill('definitely-wrong');
  await page.getByLabel('كلمة السر الجديدة').fill(newPassword);
  await page.getByLabel('اكتبها تاني').fill(newPassword);
  await page.getByRole('button', { name: 'غيّر كلمة السر' }).click();
  await expect(page.getByText('كلمة السر الحالية مش صح.')).toBeVisible();
  await page.getByLabel('كلمة السر الحالية').fill(password);
  await page.getByRole('button', { name: 'غيّر كلمة السر' }).click();
  await expect(page.getByText('اتغيرت كلمة السر، وخرّجنا أي جهاز تاني من حسابك.')).toBeVisible();
  await expectAccessible(page, 'settings: account');

  // The session survives a reload (restored from the refresh cookie), then ends on sign-out.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'الإعدادات' })).toBeVisible();
  await page.locator('.sidebar').getByRole('button', { name: 'كل الاختيارات' }).click();
  await page.getByRole('dialog', { name: 'القائمة' }).getByRole('button', { name: 'تسجيل الخروج' }).click();
  await page.getByRole('dialog', { name: 'تسجيل الخروج' }).getByRole('button', { name: 'اخرج' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('خرجت من حسابك.')).toBeVisible();
  await page.goto('/menu');
  await expect(page).toHaveURL(/\/login\?next=%2Fmenu$/);
  await page.getByLabel('الإيميل').fill(email);
  await page.getByLabel('كلمة السر', { exact: true }).fill(newPassword);
  await page.getByRole('button', { name: 'دخول' }).click();
  await expect(page).toHaveURL(/\/menu$/);
});

test('QR code downloads as a print-size PNG and an SVG', async () => {
  await page.getByRole('navigation', { name: 'القائمة الرئيسية' }).getByRole('link', { name: 'كود QR' }).click();
  await expect(page.getByRole('img', { name: `كود QR لمنيو ${restaurantName}` })).toBeVisible();
  const [png] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /صورة PNG/ }).click()]);
  expect(png.suggestedFilename()).toBe(`bilhanah-${subdomain}-qr.png`);
  const bytes = await readFile((await png.path())!);
  expect(bytes.readUInt32BE(16)).toBe(1024); // IHDR width
  const [svg] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'ملف SVG للطباعة' }).click()]);
  expect(svg.suggestedFilename()).toBe(`bilhanah-${subdomain}-qr.svg`);
  expect((await readFile((await svg.path())!, 'utf8'))).toContain('<svg');
  await expectAccessible(page, 'qr codes');
  await screenshot(page, 'qr-ar-desktop');
});

test('Arabic and English layouts on desktop and phone', async () => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expectAccessible(page, 'overview (ar)');
  await screenshot(page, 'overview-ar-desktop');
  const sidebar = await page.locator('.sidebar').boundingBox();
  expect(sidebar!.x).toBeGreaterThan(1000); // RTL: navigation on the right

  await page.setViewportSize({ width: 390, height: 844 });
  for (const [path, name] of [['/', 'overview'], ['/menu', 'menu'], ['/qr-codes', 'qr'], ['/settings/hours', 'hours']] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'التنقل' })).toBeVisible();
    await expectNoOverflow(page, `${name} at 390px`);
    await screenshot(page, `${name}-ar-mobile`, false);
  }
  await page.goto('/menu');
  await page.getByRole('button', { name: 'عدّل كفتة مشوية' }).first().click();
  await expect(page.getByRole('dialog', { name: 'تعديل الصنف' })).toBeVisible();
  await screenshot(page, 'item-editor-ar-mobile', false);
  await expectAccessible(page, 'item editor (mobile)');
  await page.getByRole('dialog').getByRole('button', { name: 'إلغاء' }).click();

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByRole('button', { name: 'Switch to English' }).first().click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('heading', { level: 1, name: 'Menu' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Grilled kofta available' })).toHaveAttribute('aria-checked', 'false');
  await expectAccessible(page, 'menu (en)');
  await screenshot(page, 'menu-en-desktop');
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: restaurantName })).toBeVisible();
  const ltrSidebar = await page.locator('.sidebar').boundingBox();
  expect(ltrSidebar!.x).toBe(0);
  await expectAccessible(page, 'overview (en)');
  await screenshot(page, 'overview-en-desktop');
  await page.goto('/settings/branding');
  await screenshot(page, 'branding-en-desktop');
  await page.goto('/qr-codes');
  await screenshot(page, 'qr-en-desktop');
  await page.getByRole('button', { name: 'عربي، التبديل للعربية' }).first().click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  expect(pageErrors).toEqual([]);
});
