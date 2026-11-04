import { expect, type Page } from '@playwright/test';

const MAILPIT = 'http://127.0.0.1:8025/api/v1';

// Keep in sync with the port defaults in playwright.config.ts.
export const API_URL = `http://127.0.0.1:${process.env.E2E_API_PORT ?? '3000'}`;
export const WEB_PORT = process.env.E2E_WEB_PORT ?? '5173';

export function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.bilhanah.test`;
}

/** Waits for the newest email to `to` with `subjectPart`, and returns its link containing `#token=`. */
export async function emailLink(to: string, subjectPart: RegExp): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const search = await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const { messages } = (await search.json()) as { messages: { ID: string; Subject: string }[] };
    const message = messages.find((candidate) => subjectPart.test(candidate.Subject));
    if (message) {
      const detail = (await (await fetch(`${MAILPIT}/message/${message.ID}`)).json()) as { Text: string };
      const link = /(https?:\/\/\S+#token=[A-Za-z0-9_-]+)/.exec(detail.Text)?.[1];
      if (link) return link;
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error(`No email matching ${subjectPart} reached ${to}`);
}

export const PASSWORD = 'correct-horse-battery';

/** Registers through the UI and confirms the email via Mailpit. */
export async function registerAndVerify(page: Page, email: string, name = 'Om Hassan') {
  await page.goto('/register');
  await page.getByLabel(/اسمك|Your name/).fill(name);
  await page.getByLabel(/^(الإيميل|Email)$/).fill(email);
  await page.getByLabel(/^(كلمة المرور|Password)$/).fill(PASSWORD);
  await page.getByLabel(/^(تأكيد كلمة المرور|Confirm password)$/).fill(PASSWORD);
  await page.getByRole('button', { name: /إنشاء الحساب|Create account/ }).click();
  await expect(page).toHaveURL(/\/check-email$/);

  await page.goto(await emailLink(email, /فعّل حسابك|Confirm your Bilhanah account/));
  await expect(page.getByRole('heading', { name: /إيميلك اتأكد|Your email is confirmed/ })).toBeVisible();
  // The single-use token is removed from the address bar.
  expect(page.url()).not.toContain('token=');
}

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel(/^(الإيميل|Email)$/).fill(email);
  await page.getByLabel(/^(كلمة المرور|Password)$/).fill(password);
  await page.getByRole('button', { name: /^(تسجيل الدخول|Sign in)$/ }).click();
}

export async function onboard(page: Page, name: string) {
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel(/اسم المطعم|Restaurant name/).fill(name);
  await expect(page.getByText(/العنوان متاح|This address is available/)).toBeVisible();
  await page.getByLabel(/رقم التليفون|Phone number/).fill('010 1234 5678');
  await page.getByLabel(/^(المدينة|City)$/).fill('القاهرة');
  await page.getByLabel(/^(العنوان|Address)$/).fill('16 شارع معروف، وسط البلد');
  await page.getByRole('button', { name: /إنشاء المطعم|Create restaurant/ }).click();
  await expect(page).toHaveURL(/\/$/);
}
