#!/usr/bin/env node
// Records the real dashboard as the website's "how it works" film.
//
//   1. bash scripts/dev.sh in bilhanah-backend (API, worker, Mailpit) and `npm run dev` here (port 5174)
//   2. npm run seed:demo in bilhanah-backend (the demo restaurant the film shows)
//   3. node scripts/record-platform-film.mjs
//
// A headless Chrome signs up a brand-new restaurant (a throwaway @bilhanah.local account, confirmed through
// Mailpit), then signs in as the demo owner and walks the menu, QR codes, live orders and reports. Frames come
// from the Chrome screencast (sharper than Playwright's video); waits are cut out. Output, for the website:
//   ../public/media/film/platform-ar.mp4, platform-ar.jpg (poster), platform-ar.json (chapter start times)
// Local development only: it uses the demo accounts from bilhanah-backend/scripts/seed-demo.mjs.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const DASHBOARD = process.env.DASHBOARD_URL ?? 'http://127.0.0.1:5174';
const API = process.env.API_URL ?? 'http://127.0.0.1:3000';
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:8025';
const DEMO = { email: 'demo-owner@bilhanah.local', password: 'demo-password-1', subdomain: 'koshary-demo' };
const OUT = resolve(import.meta.dirname, '../../public/media/film');
const FRAMES = resolve(import.meta.dirname, '../test-results/film-frames');
const SIZE = { width: 1600, height: 1000 };
const suffix = Date.now().toString(36);
const fresh = { name: 'أحمد سامي', email: `film-${suffix}@bilhanah.local`, password: `film-${suffix}-pass`, restaurant: 'كشري الهنا', subdomain: `hana-${suffix}` };

const sleep = ms => new Promise(done => setTimeout(done, ms));
const now = () => Date.now() / 1000;

/* ---------- the visible pointer (headless Chrome draws none) ---------- */
const pointer = () => {
  const install = () => {
    if (document.getElementById('film-pointer')) return;
    const style = document.createElement('style');
    style.textContent = `#film-pointer{position:fixed;top:0;left:0;z-index:2147483647;width:26px;height:26px;pointer-events:none;transition:transform 16ms linear;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}
#film-pointer svg{width:100%;height:100%}
#film-pointer::after{content:'';position:absolute;top:-10px;left:-10px;width:30px;height:30px;border-radius:50%;background:rgba(244,81,100,.4);transform:scale(0);opacity:0}
#film-pointer.down::after{animation:film-click .45s ease-out}
@keyframes film-click{from{transform:scale(.2);opacity:1}to{transform:scale(1.5);opacity:0}}`;
    document.head.appendChild(style);
    const node = document.createElement('div');
    node.id = 'film-pointer';
    node.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 2.5 19.5 13l-6.6 1.3 3.9 7.2-2.7 1.4-3.9-7.3L5.4 20z" fill="#1b0d18" stroke="#fff" stroke-width="1.4"/></svg>';
    const saved = JSON.parse(sessionStorage.getItem('film-pointer') ?? '[800,500]');
    node.style.transform = `translate(${saved[0]}px,${saved[1]}px)`;
    document.body.appendChild(node);
    addEventListener('mousemove', event => { node.style.transform = `translate(${event.clientX}px,${event.clientY}px)`; sessionStorage.setItem('film-pointer', JSON.stringify([event.clientX, event.clientY])); }, true);
    addEventListener('mousedown', () => { node.classList.remove('down'); void node.offsetWidth; node.classList.add('down'); }, true);
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', install); else install();
};

/* ---------- recording: screencast frames, kept only inside "takes" ---------- */
const frames = []; // { file, at }
const takes = [];  // { chapter, start, end }
let take = null;
function startTake(chapter) { take = { chapter, start: now() }; }
function endTake() { if (take) { take.end = now(); takes.push(take); take = null; } }

async function main() {
  await rm(FRAMES, { recursive: true, force: true });
  await mkdir(FRAMES, { recursive: true });
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 1, locale: 'ar-EG', timezoneId: 'Africa/Cairo' });
  await context.addInitScript(pointer);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  let count = 0;
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const file = `${FRAMES}/f${String(count++).padStart(6, '0')}.jpg`;
    frames.push({ file, at: metadata.timestamp ?? now() });
    await writeFile(file, Buffer.from(data, 'base64'));
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => undefined);
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: SIZE.width, maxHeight: SIZE.height, everyNthFrame: 1 });

  /* ---------- helpers that look like a person using the dashboard ---------- */
  let mouse = { x: 800, y: 500 };
  async function glide(locator, settle = 250) {
    await locator.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => undefined);
    const box = await locator.boundingBox({ timeout: 3000 }).catch(() => null);
    if (!box) return;
    const target = { x: box.x + box.width * 0.5, y: box.y + box.height * 0.55 };
    const distance = Math.hypot(target.x - mouse.x, target.y - mouse.y);
    await page.mouse.move(target.x, target.y, { steps: Math.max(12, Math.round(distance / 14)) });
    mouse = target;
    await sleep(settle);
  }
  async function tap(locator, after = 500) { await glide(locator); await page.mouse.down(); await sleep(70); await page.mouse.up(); await sleep(after); }
  async function type(locator, value, delay = 55) { await tap(locator, 150); await locator.pressSequentially(value, { delay }); await sleep(300); }
  async function scrollTo(y, wait = 1400) { await page.evaluate(top => window.scrollTo({ top, behavior: 'smooth' }), y); await sleep(wait); }
  async function scrollThrough(wait = 1300) {
    const height = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    for (const share of [0.35, 0.7]) if (height > 200) await scrollTo(Math.round(height * share), wait);
    await scrollTo(0, 900);
  }
  async function visit(path, wait = 1200) {
    await page.goto(`${DASHBOARD}${path}`);
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.evaluate(() => document.fonts.ready);
    await sleep(wait);
  }
  const optional = async (label, step) => { try { await step(); } catch (error) { console.warn(`(skipped: ${label}: ${error.message.split('\n')[0]})`); } };

  async function mailLink(to, after) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const search = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json();
      for (const message of search.messages.filter(entry => new Date(entry.Created).getTime() >= after)) {
        const detail = await (await fetch(`${MAILPIT}/api/v1/message/${message.ID}`)).json();
        const match = /https?:\/\/\S+\/verify-email#token=[\w-]+/.exec(detail.Text);
        if (match) return match[0];
      }
      await sleep(1000);
    }
    throw new Error('No verification email reached Mailpit. Is the worker running?');
  }
  async function login(email, password) {
    await visit('/login', 500);
    await type(page.getByLabel('الإيميل'), email, 30);
    await type(page.getByLabel('كلمة السر', { exact: true }), password, 30);
    await tap(page.getByRole('button', { name: 'دخول' }), 300);
  }

  /* ---------- 1. Sign up and create the restaurant ---------- */
  console.log('Chapter 1: sign up');
  await visit('/register', 300);
  startTake('signup');
  await sleep(900);
  await type(page.getByLabel('اسمك'), fresh.name);
  await type(page.getByLabel('الإيميل'), fresh.email, 35);
  await type(page.locator('input[type=password]').nth(0), fresh.password, 35);
  await type(page.locator('input[type=password]').nth(1), fresh.password, 35);
  const sentAt = Date.now() - 5000;
  await tap(page.locator('button[type=submit]'), 300);
  await page.waitForURL(/check-email/);
  await sleep(1800);
  endTake();

  await page.goto(await mailLink(fresh.email, sentAt));
  await sleep(600);
  startTake('signup');
  await sleep(1500);
  endTake();
  await login(fresh.email, fresh.password);
  await page.waitForURL(/onboarding/);
  await page.evaluate(() => document.fonts.ready);
  startTake('signup');
  await sleep(900);
  await type(page.getByLabel('اسم المطعم'), fresh.restaurant);
  await type(page.getByLabel('عنوان المنيو على الإنترنت'), fresh.subdomain, 45);
  await page.locator('#subdomain-status').filter({ hasText: 'متاح' }).waitFor().catch(() => undefined);
  await sleep(500);
  await type(page.getByLabel('رقم الموبايل'), '0109 876 5432', 45);
  await type(page.getByLabel('المدينة'), 'القاهرة');
  await type(page.getByLabel('العنوان', { exact: true }), '١٢ شارع التحرير');
  await tap(page.getByRole('button', { name: 'أنشئ مطعمي وابدأ التجربة' }), 300);
  await page.waitForURL(/setup/);
  await sleep(1200);
  await optional('setup choices', async () => {
    await glide(page.getByTestId('setup-menu-source'), 700);
    await scrollThrough(1100);
  });
  await tap(page.getByTestId('setup-skip'), 300);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await sleep(2600);
  endTake();

  /* ---------- the demo restaurant, with a full menu ---------- */
  await visit('/logout', 600);
  await login(DEMO.email, DEMO.password);
  await page.waitForURL(url => !/login/.test(url.pathname));
  await sleep(800);

  console.log('Chapter 2: brand and menu');
  await visit('/settings/branding', 400);
  startTake('brand');
  await sleep(1200);
  await optional('branding scroll', () => scrollThrough(1300));
  endTake();
  await visit('/menu', 400);
  startTake('menu');
  await sleep(1300);
  await optional('menu dishes', async () => {
    const dishes = page.getByTestId('item-row');
    for (let index = 0; index < 4; index += 1) await glide(dishes.nth(index), 550);
  });
  await optional('menu scroll', () => scrollThrough(1200));
  endTake();

  console.log('Chapter 3: tables and QR');
  await visit('/qr-codes', 400);
  startTake('qr');
  await sleep(1500);
  await optional('qr scroll', () => scrollThrough(1200));
  endTake();
  await visit('/tables', 400);
  startTake('qr');
  await sleep(2200);
  endTake();

  console.log('Chapter 4: live orders');
  const token = (await (await fetch(`${API}/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: DASHBOARD }, body: JSON.stringify({ email: DEMO.email, password: DEMO.password }) })).json()).accessToken;
  const tables = await (await fetch(`${API}/v1/tables`, { headers: { Authorization: `Bearer ${token}`, Origin: DASHBOARD } })).json();
  const menu = await (await fetch(`${API}/v1/public/restaurants/${DEMO.subdomain}/menu`)).json();
  const items = (menu.categories ?? []).flatMap(category => category.items ?? []).filter(item => item.variants?.length);
  async function order(table, picks, name) {
    const response = await fetch(`${API}/v1/public/restaurants/${DEMO.subdomain}/orders`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
      body: JSON.stringify({ type: 'DINE_IN', tableCode: table.publicCode, customerName: name, items: picks.map(([item, quantity]) => ({ menuItemId: item.id, variantId: item.variants[0].id, quantity })) }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(`order: ${response.status} ${JSON.stringify(body.error ?? body)}`);
    return body.order.number;
  }
  await visit('/orders', 600);
  await optional('sound', () => page.getByRole('button', { name: 'شغّل الصوت' }).click({ timeout: 2000 }));
  startTake('orders');
  await sleep(1500);
  await optional('orders', async () => {
    const first = await order(tables[0], [[items[0], 2], [items[1] ?? items[0], 1]], 'كريم');
    // The demo board may hold older orders with the same number; the new one is found by the guest's name.
    const card = page.getByTestId(`order-${first}`).filter({ hasText: 'كريم' }).first();
    await card.waitFor({ timeout: 8000 });
    await sleep(1600);
    await sleep(400);
    const second = await order(tables[1] ?? tables[0], [[items[2] ?? items[0], 1]], 'منى');
    await page.getByTestId(`order-${second}`).filter({ hasText: 'منى' }).first().waitFor({ timeout: 8000 }).catch(() => undefined);
    await sleep(1200);
    await tap(card.getByRole('button', { name: 'اقبل الطلب' }), 1200);
    await tap(card.getByRole('button', { name: 'ابدأ التحضير' }), 1300);
    await tap(card.getByRole('button', { name: 'جاهز' }), 1600);
  });
  endTake();

  console.log('Chapter 5: run everything');
  for (const [path, wait] of [['/', 1600], ['/insights', 1500], ['/reports', 1500], ['/loyalty/overview', 1400], ['/pos', 1400]]) {
    await optional(path, async () => {
      await visit(path, 400);
      if (new URL(page.url()).pathname !== path && path !== '/') return;
      startTake('manage');
      await sleep(wait);
      await scrollThrough(1100);
      endTake();
    });
  }

  await cdp.send('Page.stopScreencast');
  await sleep(500);
  await browser.close();

  /* ---------- cut the takes together ---------- */
  console.log(`Editing ${frames.length} frames from ${takes.length} takes…`);
  frames.sort((a, b) => a.at - b.at);
  const lines = []; const chapters = []; let clock = 0; let last = null;
  for (const piece of takes) {
    if (!chapters.length || chapters.at(-1).id !== piece.chapter) chapters.push({ id: piece.chapter, start: Number(clock.toFixed(2)) });
    // The frame on screen when the take starts, then every frame inside it, each held until the next one.
    const before = frames.filter(frame => frame.at <= piece.start).at(-1);
    const inside = frames.filter(frame => frame.at > piece.start && frame.at < piece.end);
    const shown = [...(before ? [{ ...before, at: piece.start }] : []), ...inside];
    shown.forEach((frame, index) => {
      const until = index + 1 < shown.length ? shown[index + 1].at : piece.end;
      const duration = Math.max(0.001, until - frame.at);
      lines.push(`file '${frame.file}'`, `duration ${duration.toFixed(4)}`);
      clock += duration; last = frame;
    });
  }
  if (last) lines.push(`file '${last.file}'`);
  const list = `${FRAMES}/list.txt`;
  await writeFile(list, lines.join('\n'));
  const mp4 = `${OUT}/platform-ar.mp4`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
    '-vf', 'fps=30,scale=1600:-2:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-movflags', '+faststart', mp4], { stdio: 'inherit' });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(Math.min(2, clock / 2)), '-i', mp4, '-frames:v', '1', '-q:v', '3', `${OUT}/platform-ar.jpg`], { stdio: 'inherit' });
  await writeFile(`${OUT}/platform-ar.json`, JSON.stringify({ duration: Number(clock.toFixed(2)), chapters }, null, 2) + '\n');
  console.log(`Wrote ${mp4} (${clock.toFixed(1)}s) with chapters ${chapters.map(chapter => `${chapter.id}@${chapter.start}s`).join(', ')}`);
}

main().catch(error => { console.error(error); process.exit(1); });
