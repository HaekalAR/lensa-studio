# Lensa — studio foto per sesi

Website untuk fotografer: setiap sesi punya QR dan galeri sendiri. Foto dari folder kamera di laptop masuk otomatis ke sesi aktif, lalu muncul di galeri publik. Admin bisa membuka semua sesi dan arsipnya.

**Arsitektur:** frontend React di **Vercel**, backend **Cloudflare Worker**, database **Cloudflare D1**, foto di **Cloudflare R2**. Tanpa Fly, tanpa server Node yang harus selalu hidup.

---

## Fitur

- **Sesi + QR unik** — klik New Session, QR dibuat di browser dan siap dipindai.
- **Hanya satu sesi aktif**.
- **Auto-selesai 15 menit** sejak New Session; bisa diakhiri manual.
- **QR tetap hidup setelah sesi selesai** — membuka galeri arsip, tidak menerima foto baru.
- **Uploader folder lokal** — memantau folder kamera, membuat preview/thumbnail, mengunggah ke Worker + R2.
- **Galeri live** — polling 3 detik; foto baru muncul tanpa reload.
- **Unduh resolusi penuh**.
- **Dashboard admin** — QR, hitung mundur, foto terbaru, uploader online/offline.
- **Arsip sesi** — cari, detail, ubah judul/catatan, hapus foto.
- **Privat** — publik hanya bisa membuka `/s/<token>`.
- **Auth lintas origin** — Bearer token di `sessionStorage`, bukan cookie lintas situs.
- **Thumbnail di laptop** — Worker tidak memproses gambar, jadi ringan dan cepat.

---

## Cara kerja

```text
Kamera / tethering
       │  menyimpan JPEG
       ▼
Folder lokal  ◄──── watcher memantau
       │                 │ Sharp: preview + thumbnail
       │                 │ prepare → upload 3 aset → commit
       │                 ▼
       │          Cloudflare Worker ──────► R2 (foto)
       │                 │
       │                 ▼
       │          Cloudflare D1 (metadata)
       │                 │
       │                 │ JSON / media (Bearer token)
       ▼                 ▼
  Laptop fotografer   Vercel (React) ◄── scan QR /s/<token>
```

- QR berisi URL Vercel (`PUBLIC_APP_URL`).
- API, media, dan upload dilayani Worker (`PUBLIC_API_URL`).
- R2 hanya diakses lewat Worker; bucket tetap private.
- Auto-end dihitung lazy saat API dipanggil; tidak butuh cron.

---

## Menjalankan lokal

Prasyarat: **Node.js 24+**, npm, dan Chrome (untuk tes visual).

```bash
npm install
cp worker/.dev.vars.example worker/.dev.vars
cp .env.example .env
```

Isi `worker/.dev.vars`:

```env
ADMIN_PASSWORD_HASH=...
SESSION_SECRET=...
INGEST_TOKEN=...
```

Buat hash password dan secret:

```bash
npm run hash-password -- "password-lokal-kamu"
npm run secrets
```

Salin `ADMIN_PASSWORD_HASH` ke `worker/.dev.vars`. Isi `SESSION_SECRET` dan `INGEST_TOKEN` dari output `npm run secrets`. Samakan `INGEST_TOKEN` di `.env` (untuk tes dan uploader).

Inisialisasi D1 lokal:

```bash
npm run worker:migrate
```

Jalankan Worker + Vite:

```bash
npm run dev
```

- Frontend: `http://127.0.0.1:5173`
- Worker API: `http://127.0.0.1:8787`
- Login: `http://127.0.0.1:5173/admin/login`
- Password: yang kamu hash tadi.

Vite mem-proxy `/api` ke Worker, jadi frontend lokal tidak perlu `VITE_API_BASE_URL`.

Jika ingin memakai build statis:

```bash
VITE_API_BASE_URL=http://127.0.0.1:8787 npm run build
npm run preview
```

Di PowerShell, set env sebelum build:

```powershell
$env:VITE_API_BASE_URL="http://127.0.0.1:8787"
npm run build
npm run preview
```

---

## Uploader folder lokal

1. Salin `watcher/config.example.json` menjadi `watcher/config.json`.
2. Isi:

```json
{
  "serverUrl": "https://lensa-api.namamu.workers.dev",
  "ingestToken": "INGEST_TOKEN_DARI_WORKER",
  "watchDir": "C:\\Users\\NamaKamu\\Pictures\\Tethering",
  "agentName": "Laptop Studio",
  "stabilitySeconds": 2
}
```

3. Jalankan `start-watcher.cmd`, atau:

```bash
npm run watcher
```

Uploader memakai **Sharp** untuk membuat preview 2400px dan thumbnail 720px. Karena itu `npm install` harus sudah dijalankan di laptop.

Perilaku:

- Memantau folder rekursif sampai 4 level.
- Hanya `.jpg`, `.jpeg`, `.jfif`.
- Menunggu file stabil 2 detik.
- Hanya upload saat ada sesi aktif.
- Melewati file yang sudah ada di folder sebelum sesi dimulai; file yang baru disalin setelah sesi tetap diunggah meskipun timestamp kameranya lama.
- State disimpan di `watcher/.state.json`.
- Server memakai SHA-256 untuk deduplikasi per sesi.
- Heartbeat tiap 10 detik; dashboard menampilkan uploader online/offline.

---

## Deploy ke Cloudflare + Vercel

### 1. Buat resource Cloudflare

```bash
npx wrangler login

# D1
npx wrangler d1 create lensa-db
# Salin database_id ke worker/wrangler.toml

# R2
npx wrangler r2 bucket create lensa-photos
```

Edit `worker/wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "lensa-db"
database_id = "UUID_DARI_WRANGLER"
migrations_dir = "migrations"

[[r2_buckets]]
binding = "PHOTOS"
bucket_name = "lensa-photos"
```

Isi juga `[vars]`:

```toml
SITE_NAME = "Lensa"
APP_TIMEZONE = "Asia/Jakarta"
SESSION_DURATION_MINUTES = "15"
PUBLIC_APP_URL = "https://lensa-studio.vercel.app"
PUBLIC_API_URL = "https://lensa-api.namamu.workers.dev"
FRONTEND_ORIGINS = "https://lensa-studio.vercel.app"
R2_BUCKET_NAME = "lensa-photos"
```

Gunakan URL yang benar-benar akan dipakai. Jika URL Vercel berubah, update `PUBLIC_APP_URL` dan `FRONTEND_ORIGINS` lalu deploy ulang Worker.

### 2. Migrasi D1 remote

```bash
npx wrangler d1 migrations apply lensa-db --remote --config worker/wrangler.toml
```

### 3. Secret Worker

```bash
npx wrangler secret put ADMIN_PASSWORD_HASH --config worker/wrangler.toml
npx wrangler secret put SESSION_SECRET --config worker/wrangler.toml
npx wrangler secret put INGEST_TOKEN --config worker/wrangler.toml
```

Nilai:

- `ADMIN_PASSWORD_HASH`: hasil `npm run hash-password -- "password-kuat"`.
- `SESSION_SECRET`: hasil `npm run secrets`.
- `INGEST_TOKEN`: hasil `npm run secrets`, dipakai juga di `watcher/config.json`.

### 4. Deploy Worker

```bash
npm run worker:deploy
```

Catat URL Worker, misalnya:

```text
https://lensa-api.namamu.workers.dev
```

Pastikan `PUBLIC_API_URL` di `worker/wrangler.toml` sama dengan URL ini, lalu deploy ulang jika baru diubah.

### 5. Deploy Vercel

1. Import repository ke Vercel.
2. Root directory: **root repo**.
3. Environment Variable:

```env
VITE_API_BASE_URL=https://lensa-api.namamu.workers.dev
```

4. Deploy. Vercel memakai `vercel.json`:

```text
Build Command   : npm run build
Output Directory: dist
```

5. Buka `https://lensa-studio.vercel.app/admin/login`, masuk dengan password admin.

### 6. Custom domain (opsional)

- Vercel: tambahkan domain frontend.
- Cloudflare: tambahkan custom domain Worker di dashboard **Workers → Settings → Domains & Routes**.
- Samakan:
  - `PUBLIC_APP_URL` = URL frontend.
  - `PUBLIC_API_URL` = URL API.
  - `FRONTEND_ORIGINS` = origin frontend.
  - `VITE_API_BASE_URL` di Vercel = URL API.
- Ganti `https://*.workers.dev` di CSP `vercel.json` menjadi domain API kamu, lalu redeploy Vercel.

---

## Environment dan secret

### Worker variables (`worker/wrangler.toml`)

| Variable | Keterangan |
|---|---|
| `SITE_NAME` | Nama studio. |
| `APP_TIMEZONE` | Default `Asia/Jakarta`. |
| `SESSION_DURATION_MINUTES` | Default `15`. |
| `PUBLIC_APP_URL` | URL Vercel; dipakai QR. |
| `PUBLIC_API_URL` | URL Worker; dipakai media/API. |
| `FRONTEND_ORIGINS` | Origin Vercel yang diizinkan CORS. |
| `R2_BUCKET_NAME` | Nama bucket untuk ditampilkan di dashboard. |

### Worker secrets

| Secret | Keterangan |
|---|---|
| `ADMIN_PASSWORD_HASH` | PBKDF2 hash dari `npm run hash-password`. |
| `SESSION_SECRET` | Minimal 32 karakter acak untuk token admin. |
| `INGEST_TOKEN` | Token uploader; bukan password admin. |

### Vercel

| Variable | Keterangan |
|---|---|
| `VITE_API_BASE_URL` | URL Worker, dibaca saat build. |

### Bindings

| Binding | Resource |
|---|---|
| `DB` | D1 database `lensa-db`. |
| `PHOTOS` | R2 bucket private `lensa-photos`. |

R2 Access Key/Secret Key yang kamu punya **tidak perlu** dimasukkan ke Vercel atau Worker jika memakai binding `PHOTOS`. Simpan key tersebut; hanya diperlukan jika memakai S3 API langsung.

---

## Biaya

- **Cloudflare Workers + D1**: free tier cukup untuk skala kecil.
- **Cloudflare R2**: free tier 10 GB storage, egress gratis.
- **Vercel Hobby**: gratis untuk personal/non-komersial. Untuk studio komersial, Vercel biasanya meminta Pro sekitar **$20/bulan per member** ([Vercel pricing](https://vercel.com/pricing)).

Tidak ada lagi biaya Fly karena backend tidak memakai Fly.

---

## Struktur proyek

```text
client/                 React + TypeScript + Vite
  src/pages/            Landing, galeri, login, dashboard, arsip, detail
  src/components/       UI, QR, session row
shared/image.js         Sharp: preview, thumbnail, hash
worker/
  wrangler.toml         Konfigurasi Worker, D1, R2
  migrations/           Skema D1
  src/index.js          API Worker
  .dev.vars.example     Contoh secret lokal
watcher/                Uploader folder lokal
scripts/                Hash, secrets, tes E2E/live/visual
vercel.json             Build, rewrite, CSP Vercel
```

---

## Pengujian

Pastikan Worker dev berjalan di `:8787` dan frontend di `:5173`.

```bash
npm run test:e2e     # API end-to-end
npm run test:live    # galeri polling
npm run test:visual  # screenshot
```

E2E mencakup auth, sesi, upload, deduplikasi, media, download, URL publik, auto-end, pencarian, hapus foto, dan logout. Tes membuat fixture sendiri dan sesi uji di D1 lokal.

Tes visual membutuhkan Vite di `http://127.0.0.1:5173` dan Worker di `http://127.0.0.1:8787`. `npm run dev` sudah menjalankan keduanya. Screenshot disimpan di `demo/screens/`.

---

## Keamanan

- Password admin di-hash PBKDF2-SHA256, bukan disimpan polos.
- Admin memakai Bearer token bertanda tangan HMAC di `sessionStorage`.
- Login dibatasi 8 percobaan per 15 menit per IP (D1).
- Token uploader terpisah dari password admin.
- Token sesi publik 144-bit.
- CORS hanya mengizinkan `FRONTEND_ORIGINS` dan origin `PUBLIC_APP_URL`.
- R2 private; akses hanya lewat Worker.
- Header keamanan di Worker dan Vercel; `robots.txt` menolak crawler.
- QR yang bocor bisa diakses siapa pun yang memilikinya; jangan mencetak QR sesi privat di tempat umum.

---

## Batasan

- Satu sesi aktif.
- Galeri live memakai polling 3 detik, bukan SSE (serverless).
- Uploader harus hidup di laptop dan sudah `npm install` agar Sharp tersedia.
- Worker memproses metadata; file asli/preview/thumb dibuat di laptop.
- Belum ada multi-admin, email, atau auto-delete.
- D1 metadata; R2 untuk file.
- Worker free plan punya batas request/CPU; cukup untuk studio kecil.

---

## Troubleshooting

**Worker gagal start: `worker/.dev.vars` tidak ada**  
Salin `worker/.dev.vars.example`, isi hash/secret/token.

**Login selalu gagal**  
Pastikan `ADMIN_PASSWORD_HASH` di `.dev.vars` dibuat dengan `npm run hash-password -- "password-yang-sama"`.

**D1 table belum ada**  
Jalankan `npm run worker:migrate`.

**Gambar tidak muncul di Vercel**  
Cek `VITE_API_BASE_URL`, `PUBLIC_API_URL`, `FRONTEND_ORIGINS`, dan CSP `vercel.json`. Jika custom domain API, ganti `*.workers.dev` di CSP.

**QR berisi localhost**  
Ubah `PUBLIC_APP_URL` di `worker/wrangler.toml` ke URL Vercel, lalu deploy ulang Worker.

**Uploader offline**  
Cek `watcher/config.json`, token, folder, dan `npm install` (Sharp). Jalankan `npm run watcher` untuk melihat log.

**Foto tidak masuk**  
Pastikan sesi aktif, file JPEG, ukuran stabil, dan foto dimasukkan setelah sesi dibuat.

---

Dibuat untuk alur **satu jepret → file masuk folder → foto muncul di web**.
