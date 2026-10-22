import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {
  BASE,
  loginAdmin,
  makeTestPhotos,
  uploadTestPhoto,
} from './test-helpers.mjs';

const [PHOTO, PHOTO2] = await makeTestPhotos(2);

let token = '';
const results = [];

function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function req(pathname, options = {}) {
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${BASE}${pathname}`, { ...options, headers });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { response, data };
}

async function login() {
  token = await loginAdmin();
  check('Login admin berhasil & token dibuat', Boolean(token));
}

function expireWithD1(sessionId, when) {
  const root = process.cwd();
  const wrangler = path.resolve('node_modules/wrangler/bin/wrangler.js');
  const command = `UPDATE sessions SET ends_at = '${when}' WHERE id = '${sessionId}'`;
  execFileSync(
    process.execPath,
    [
      wrangler,
      'd1',
      'execute',
      'lensa-db',
      '--local',
      '--config',
      'worker/wrangler.toml',
      '--persist-to',
      'worker/.wrangler/state',
      '--command',
      command,
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        XDG_CONFIG_HOME: path.join(root, '.wrangler-config'),
        TMP: path.join(root, '.wrangler-tmp'),
        TEMP: path.join(root, '.wrangler-tmp'),
        WRANGLER_HOME: path.join(root, '.wrangler-config'),
      },
      stdio: 'ignore',
    },
  );
}

async function createSession(title) {
  const { response, data } = await req('/api/admin/sessions', {
    method: 'POST',
    body: JSON.stringify(title ? { title } : {}),
  });
  check('Membuat sesi baru', response.status === 201, `HTTP ${response.status}`);
  return data.session;
}

async function upload(filePath, capturedAt = new Date()) {
  return uploadTestPhoto(filePath, capturedAt);
}

console.log('\n— Lensa end-to-end test —\n');

const unauth = await req('/api/admin/overview');
check('Admin tanpa login ditolak', unauth.response.status === 401);

await login();
const me = await req('/api/auth/me');
check('Bearer token admin terbaca', me.data.authenticated === true);

const overview = await req('/api/admin/overview');
if (overview.data.activeSession) {
  const ended = await req(`/api/admin/sessions/${overview.data.activeSession.id}/end`, {
    method: 'POST',
  });
  check('Menutup sesi lama', ended.response.ok);
}

const session = await createSession('Uji otomatis · Lensa');
check('URL sesi publik dibuat', Boolean(session.publicUrl));
check('Sesi awal live', session.status === 'live');
const plannedMs = new Date(session.endsAt).getTime() - new Date(session.startedAt).getTime();
check('Durasi sesi 15 menit', plannedMs === 15 * 60 * 1000, `${plannedMs / 60000} menit`);

const secondActive = await req('/api/admin/sessions', {
  method: 'POST',
  body: JSON.stringify({ title: 'Tidak boleh dibuat' }),
});
check('Sesi kedua ditolak saat masih aktif', secondActive.response.status === 409);

const upload1 = await upload(PHOTO);
check('Upload foto pertama', upload1.response.status === 200, `HTTP ${upload1.response.status}`);

const uploadDuplicate = await upload(PHOTO);
check('Deduplikasi foto yang sama', uploadDuplicate.data.duplicate === true);

const upload2 = await upload(PHOTO2, new Date(Date.now() + 500));
check('Upload foto kedua', upload2.response.status === 200, `HTTP ${upload2.response.status}`);

const detail = await req(`/api/admin/sessions/${session.id}`);
check('Dua foto tersimpan', detail.data.session.photoCount === 2);

const patch = await req(`/api/admin/sessions/${session.id}`, {
  method: 'PATCH',
  body: JSON.stringify({ title: 'Sesi Uji Kualitas', note: 'Catatan internal uji.' }),
});
check('Edit judul dan catatan', patch.data.session.title === 'Sesi Uji Kualitas');

const publicLive = await req(`/api/public/sessions/${session.publicToken}`);
check('Galeri publik live bisa dibuka', publicLive.response.ok && publicLive.data.status === 'live');
check('Foto tampil di galeri publik', publicLive.data.photos.length === 2);

check(
  'URL media absolut ke backend',
  publicLive.data.photos[0].thumbUrl.startsWith('http'),
);
const thumb = await fetch(publicLive.data.photos[0].thumbUrl);
check('Thumbnail bisa diakses', thumb.ok && thumb.headers.get('content-type').startsWith('image/'));
const original = await fetch(publicLive.data.photos[0].downloadUrl);
check(
  'Download asli memakai attachment',
  original.ok && original.headers.get('content-disposition')?.includes('attachment'),
);

const ingestBad = await fetch(`${BASE}/api/ingest/prepare`, {
  method: 'POST',
  headers: { Authorization: 'Bearer wrong-token', 'Content-Type': 'application/json' },
  body: '{}',
});
check('Uploader token salah ditolak', ingestBad.status === 401);

const end = await req(`/api/admin/sessions/${session.id}/end`, { method: 'POST' });
check('Sesi diakhiri manual', end.data.session.status === 'ended');
const publicEnded = await req(`/api/public/sessions/${session.publicToken}`);
check('QR lama tetap membuka galeri', publicEnded.response.ok && publicEnded.data.status === 'ended');
check('Foto tetap ada setelah sesi selesai', publicEnded.data.photos.length === 2);

const ingestAfterEnd = await upload(PHOTO2, new Date());
check('Upload ditolak tanpa sesi aktif', ingestAfterEnd.response.status === 409);

const session2 = await createSession('Uji auto-end · Lensa');
const upload3 = await upload(PHOTO);
check('Upload ke sesi kedua', upload3.response.status === 200);

expireWithD1(session2.id, new Date(Date.now() - 1000).toISOString());

const autoEnded = await req(`/api/public/sessions/${session2.publicToken}`);
check('Sesi otomatis selesai', autoEnded.data.status === 'ended');
const autoDetail = await req(`/api/admin/sessions/${session2.id}`);
check('Alasan auto-end tercatat', autoDetail.data.session.endReason === 'auto');

const search = await req('/api/admin/sessions?q=Kualitas');
check('Pencarian arsip menemukan sesi', search.data.sessions.length >= 1);

const photoId = detail.data.session.photos[0].id;
const del = await req(`/api/admin/photos/${photoId}`, { method: 'DELETE' });
check('Hapus foto', del.response.ok);
const afterDelete = await req(`/api/public/sessions/${session.publicToken}`);
check('Foto terhapus dari galeri', afterDelete.data.photos.length === 1);

const noAuthLogout = await req('/api/auth/logout', { method: 'POST' });
check('Logout', noAuthLogout.response.ok);

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} pengujian lulus.`);
if (failed.length) process.exitCode = 1;
