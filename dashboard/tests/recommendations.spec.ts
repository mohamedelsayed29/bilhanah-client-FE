import { expect, test } from '@playwright/test';
import { API_URL, DASHBOARD_ORIGIN, expectAccessible, expectNoOverflow, registerOwner, screenshot, uniqueSuffix } from './helpers';

const suffix = uniqueSuffix();
const owner = { email: `upsell-${suffix}@e2e-bilhanah.test`, password: 'Molokhia-Tuesday-2026', fullName: 'سارة الاختبار', restaurant: 'مطعم سارة', subdomain: `e2e-upsell-${suffix}` };

test.use({ viewport: { width: 1440, height: 900 } });

test('owners add a recommendation, switch it off and on, edit it, and delete it', async ({ page }) => {
  await registerOwner(page, owner);
  const login = await page.request.post(`${API_URL}/v1/auth/login`, { data: { email: owner.email, password: owner.password }, headers: { Origin: DASHBOARD_ORIGIN } });
  const token = ((await login.json()) as { accessToken: string }).accessToken;
  const call = async <T>(method: 'POST', path: string, data?: unknown): Promise<T> => {
    const response = await page.request.fetch(`${API_URL}${path}`, { method, data, headers: { Authorization: `Bearer ${token}`, Origin: DASHBOARD_ORIGIN } });
    expect(response.ok(), `${method} ${path}: ${response.status()} ${await response.text()}`).toBe(true);
    return (await response.json()) as T;
  };
  const category = await call<{ id: string }>('POST', '/v1/menu/categories', { nameAr: 'مشويات', nameEn: 'Grills' });
  await call('POST', '/v1/menu/items', { categoryId: category.id, nameAr: 'كفتة', nameEn: 'Kofta', variants: [{ pricePiastres: 15_000 }] });
  await call('POST', '/v1/menu/items', { categoryId: category.id, nameAr: 'ليمون بالنعناع', nameEn: 'Lemon mint', variants: [{ pricePiastres: 4_000 }] });
  await call('POST', '/v1/menu/items', { categoryId: category.id, nameAr: 'صوص طحينة', nameEn: 'Tahini', variants: [{ pricePiastres: 1_000 }] });

  await page.goto('/recommendations');
  await expect(page.getByRole('heading', { level: 1, name: 'الترشيحات' })).toBeVisible();
  await expect(page.getByText('لسه مفيش ترشيحات')).toBeVisible();
  await expect(page.getByTestId('recommendation-metric-conversion')).toContainText('—');

  // A new rule: kofta suggests lemon mint, bought together.
  await page.getByRole('button', { name: 'ترشيح جديد' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'ترشيح جديد' });
  await dialog.getByLabel('الصنف', { exact: true }).selectOption({ label: 'كفتة' });
  await dialog.getByLabel('ضيف صنف').selectOption({ label: 'ليمون بالنعناع · مشويات' });
  await dialog.getByRole('button', { name: 'ضيف', exact: true }).click();
  await expect(dialog.getByTestId('picked-item')).toHaveCount(1);
  await expectAccessible(page, 'recommendation dialog');
  await dialog.getByRole('button', { name: 'احفظ' }).click();
  await expect(dialog).toBeHidden();

  const rule = page.locator('[data-testid="recommendation-rule"][data-source="كفتة"]');
  await expect(rule).toContainText('ليمون بالنعناع');
  await expectAccessible(page, 'recommendations');
  await screenshot(page, 'recommendations-ar', false);

  // Off, then on again.
  const toggle = rule.getByRole('switch', { name: /ترشيحات كفتة/ });
  await toggle.click();
  await expect(rule).toHaveClass(/is-off/);
  await toggle.click();
  await expect(rule).not.toHaveClass(/is-off/);

  // Edit: make it a required add-on with tahini too.
  await rule.getByRole('button', { name: 'تعديل' }).click();
  const edit = page.getByRole('dialog', { name: 'تعديل الترشيح' });
  await edit.getByRole('radio', { name: /إضافات/ }).check();
  await expect(edit.getByRole('button', { name: 'صفحة الصنف' })).toHaveAttribute('aria-pressed', 'true');
  await edit.getByLabel('ضيف صنف').selectOption({ label: 'صوص طحينة · مشويات' });
  await edit.getByRole('button', { name: 'ضيف', exact: true }).click();
  await edit.getByRole('switch', { name: 'اختيار إضافة إجباري' }).click();
  await edit.getByRole('button', { name: 'احفظ' }).click();
  await expect(edit).toBeHidden();
  await expect(rule).toContainText('صوص طحينة');
  await expect(rule).toContainText('إجباري');

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoOverflow(page, 'recommendations 390');

  // Delete.
  await rule.getByRole('button', { name: 'امسح ترشيحات كفتة' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'امسح', exact: true }).click();
  await expect(rule).toHaveCount(0);
  await expect(page.getByText('لسه مفيش ترشيحات')).toBeVisible();
});
