import { chromium } from '@playwright/test';
import {
  BASE,
  createTestSession,
  loginAdmin,
  makeTestPhotos,
  uploadTestPhoto,
} from './test-helpers.mjs';

const results = [];
function check(name, condition, detail = '') {
  results.push(Boolean(condition));
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const token = await loginAdmin();
check('Login', Boolean(token));

const session = await createTestSession(token, 'Uji live gallery');
check('Sesi dibuat', Boolean(session?.id));
const [photo] = await makeTestPhotos(1);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const problems = [];
page.on('pageerror', (error) => problems.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(message.text());
});

await page.goto(session.publicUrl, { waitUntil: 'networkidle' });
await page.waitForSelector('.public-empty', { timeout: 8000 });
check('Galeri kosong tampil sebelum foto', await page.locator('.public-empty').isVisible());

const upload = await uploadTestPhoto(photo);
check(
  'Foto diunggah saat halaman terbuka',
  upload.response.status === 200,
  `HTTP ${upload.response.status}`,
);

let liveUpdated = false;
try {
  await page.waitForSelector('.photo-card', { timeout: 9000 });
  liveUpdated = (await page.locator('.photo-card').count()) === 1;
} catch {
  liveUpdated = false;
}
check('Foto muncul otomatis tanpa reload (polling)', liveUpdated);

await page.waitForTimeout(1200);
await page.screenshot({ path: 'demo/screens/live-one-photo.png', fullPage: true });

const end = await fetch(`${BASE}/api/admin/sessions/${session.id}/end`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
});
check('Sesi diakhiri', end.ok);

let endedUi = false;
try {
  await page.waitForFunction(
    () => document.querySelector('.status--ended') !== null,
    undefined,
    { timeout: 9000 },
  );
  endedUi = true;
} catch {
  endedUi = false;
}
check('Galeri berubah ke status selesai otomatis (polling)', endedUi);
check(
  'Banner sesi selesai muncul',
  (await page.locator('.public-banner').innerText()).includes('Sesi telah selesai'),
);
await page.screenshot({ path: 'demo/screens/live-ended.png', fullPage: true });

await browser.close();
if (problems.length) {
  console.log('\nBrowser errors:');
  for (const problem of [...new Set(problems)]) console.log(`- ${problem}`);
}
console.log(`\n${results.filter(Boolean).length}/${results.length} pengujian live lulus.`);
if (results.some((result) => !result) || problems.length) process.exitCode = 1;
