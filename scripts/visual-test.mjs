import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import {
  ADMIN_PASSWORD,
  BASE,
  createTestSession,
  loginAdmin,
  makeTestPhotos,
  uploadTestPhoto,
} from './test-helpers.mjs';

const OUT = path.resolve('demo/screens');
fs.mkdirSync(OUT, { recursive: true });

const adminToken = await loginAdmin();
const session = await createTestSession(adminToken, 'Sesi Demo · Lensa');
const photos = await makeTestPhotos(6);
for (const [index, photo] of photos.entries()) {
  const result = await uploadTestPhoto(photo, new Date(Date.now() + index * 100));
  if (!result.response.ok) {
    throw new Error(`Fixture ${index + 1} gagal diunggah (HTTP ${result.response.status}).`);
  }
}
const publicUrl = session.publicUrl;
const FRONTEND = new URL(publicUrl).origin;

const problems = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
  colorScheme: 'light',
});
const page = await context.newPage();
page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(`console: ${message.text()}`);
});
page.on('requestfailed', (request) => {
  const url = request.url();
  const error = request.failure()?.errorText || '';
  if (url.includes('/events') || error.includes('ERR_ABORTED')) return;
  if (!url.includes('fonts.googleapis.com') && !url.includes('fonts.gstatic.com')) {
    problems.push(`requestfailed: ${url} — ${error}`);
  }
});

async function settle(ms = 900) {
  await page.waitForTimeout(ms);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => {
      let y = 0;
      const step = () => {
        y += window.innerHeight * 0.8;
        window.scrollTo(0, y);
        if (y < document.body.scrollHeight) setTimeout(step, 90);
        else {
          window.scrollTo(0, 0);
          setTimeout(resolve, 350);
        }
      };
      step();
    });
  });
  await page.waitForTimeout(500);
}

async function shot(name, fullPage = true) {
  await page.screenshot({ path: path.join(OUT, name), fullPage });
  console.log(`saved ${name}`);
}

await page.goto(`${FRONTEND}/`, { waitUntil: 'networkidle' });
await settle();
await shot('01-landing-desktop.png');

await page.goto(publicUrl, { waitUntil: 'networkidle' });
await settle(1200);
await shot('02-public-desktop.png');

await page.locator('.photo-card').first().click();
await page.waitForTimeout(500);
await shot('03-public-lightbox.png', false);
await page.keyboard.press('Escape');

await page.goto(`${FRONTEND}/admin/login`, { waitUntil: 'networkidle' });
await settle(500);
await shot('04-login-desktop.png', false);

await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
await page.locator('button[type="submit"]').click();
await page.waitForURL('**/admin');
await settle(1400);
await shot('05-dashboard-desktop.png');

await page.goto(`${FRONTEND}/admin/sessions/${session.id}`, { waitUntil: 'networkidle' });
await settle(1200);
await shot('06-session-detail-desktop.png');

await page.goto(`${FRONTEND}/admin/sessions`, { waitUntil: 'networkidle' });
await settle(700);
await shot('07-archive-desktop.png');

const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  colorScheme: 'light',
});
const mp = await mobile.newPage();
mp.on('pageerror', (error) => problems.push(`mobile pageerror: ${error.message}`));
await mp.goto(publicUrl, { waitUntil: 'networkidle' });
await mp.waitForTimeout(1300);
await mp.evaluate(async () => {
  await document.fonts.ready;
  window.scrollTo(0, document.body.scrollHeight);
});
await mp.waitForTimeout(800);
await mp.evaluate(() => window.scrollTo(0, 0));
await mp.waitForTimeout(400);
await mp.screenshot({ path: path.join(OUT, '08-public-mobile.png'), fullPage: true });
console.log('saved 08-public-mobile.png');

await mp.goto(`${FRONTEND}/`, { waitUntil: 'networkidle' });
await mp.waitForTimeout(900);
await mp.screenshot({ path: path.join(OUT, '09-landing-mobile.png'), fullPage: true });
console.log('saved 09-landing-mobile.png');

// End the final session through the authenticated API, then capture ended states.
const endResponse = await fetch(`${BASE}/api/admin/sessions/${session.id}/end`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${adminToken}` },
});
if (!endResponse.ok) problems.push(`end session failed: ${endResponse.status}`);

await page.goto(publicUrl, { waitUntil: 'networkidle' });
await settle(700);
await shot('10-public-ended.png');

await page.goto(`${FRONTEND}/admin`, { waitUntil: 'networkidle' });
await settle(700);
await shot('11-dashboard-empty.png');

await page.goto(`${FRONTEND}/admin/sessions`, { waitUntil: 'networkidle' });
await settle(700);
await shot('12-archive-ended.png');

await mobile.close();
await browser.close();

if (problems.length) {
  console.log('\nPROBLEMS:');
  for (const problem of [...new Set(problems)]) console.log(`- ${problem}`);
  process.exitCode = 2;
} else {
  console.log('\nNo browser errors.');
}
