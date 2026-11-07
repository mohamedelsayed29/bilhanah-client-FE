#!/usr/bin/env node
// Captures the dashboard screens shown on the website (public/media/dashboard/<view>-<lang>.webp), from the
// demo restaurant, so the site always shows the current design.
//
//   bash scripts/dev.sh in bilhanah-backend, `npm run dev` here (5174), npm run seed:demo in bilhanah-backend
//   node scripts/capture-site-screens.mjs
// Local development only: signs in with the demo owner from bilhanah-backend/scripts/seed-demo.mjs.
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DASHBOARD = process.env.DASHBOARD_URL ?? 'http://127.0.0.1:5174';
const DEMO = { email: 'demo-owner@bilhanah.local', password: 'demo-password-1' };
const OUT = resolve(import.meta.dirname, '../../public/media/dashboard');
// File name on the website → dashboard page.
const VIEWS = { orders: '/insights', tables: '/tables', menu: '/menu', branches: '/branches' };

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const language of ['ar', 'en']) {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, locale: language === 'ar' ? 'ar-EG' : 'en-GB', timezoneId: 'Africa/Cairo' });
    await context.addInitScript(lang => { try { localStorage.setItem('bilhanah:language:v1', lang); } catch { /* ignore */ } }, language);
    const page = await context.newPage();
    await page.goto(`${DASHBOARD}/login`);
    await page.locator('input[type=email]').fill(DEMO.email);
    await page.locator('input[type=password]').first().fill(DEMO.password);
    await page.locator('button[type=submit]').click();
    await page.waitForURL(url => !/login/.test(url.pathname), { timeout: 20000 });
    for (const [name, path] of Object.entries(VIEWS)) {
      await page.goto(`${DASHBOARD}${path}`);
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.evaluate(() => document.fonts.ready);
      // The floating support button belongs to the live app, not the product shot.
      await page.addStyleTag({ content: '.support-launcher, [class*="support-fab"], [class*="chat-launcher"] { display: none !important; } *, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }' });
      await page.waitForTimeout(1200);
      const png = await page.screenshot({ type: 'png' });
      // Chrome encodes WebP through a canvas (no encoder is needed on the machine).
      const webp = await page.evaluate(async base64 => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width; canvas.height = image.height;
        canvas.getContext('2d').drawImage(image, 0, 0);
        return canvas.toDataURL('image/webp', 0.86).split(',')[1];
      }, png.toString('base64'));
      await writeFile(`${OUT}/${name}-${language}.webp`, Buffer.from(webp, 'base64'));
      console.log(`Wrote ${name}-${language}.webp from ${path}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
