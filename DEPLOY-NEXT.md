# Deploy Berikutnya — Lensa

## Status

Backend sudah live:

```text
https://lensa-api.zaychik2006lya.workers.dev
```

Sudah selesai:

- Worker `lensa-api` deployed.
- D1 `lensa-db` remote sudah dimigrasikan (schema awal, 5 tabel).
- R2 `expo-booth-ril` terpasang sebagai binding `PHOTOS`.
- 3 secret Worker sudah di-set.
- Login admin production sudah diuji berhasil.
- CORS ke `https://lensa-studio.vercel.app` sudah diuji.
- E2E 31/31, live 8/8, visual tanpa error.
- Repo lokal sudah di-commit.

Password admin ada di file lokal `.deploy-secrets.local`, baris `ADMIN_PASSWORD`. File itu di-ignore git.

---

## 1. Push repo ke GitHub

Repo lokal sudah ada di branch `main`, tetapi belum punya remote.

Buat repository kosong di GitHub, lalu:

```bash
git remote add origin https://github.com/USERNAME/REPO.git
git push -u origin main
```

Jangan commit file secret. Semua sudah masuk `.gitignore`.

## 2. Vercel

Import repo GitHub ke Vercel.

- Root Directory: **root repo**
- Framework: Vite
- Build Command: `npm run build`
- Output Directory: `dist`

Environment Variable:

```env
VITE_API_BASE_URL=https://lensa-api.zaychik2006lya.workers.dev
```

Lalu deploy.

### Penting soal URL Vercel

Saat dicek, `https://lensa-studio.vercel.app` sudah menampilkan website Lensa Studio lama.

- Kalau itu project Vercel milikmu dan akan diganti dengan repo ini, URL tersebut bisa tetap dipakai.
- Kalau bukan, Vercel akan memberi URL lain. Setelah deploy, catat URL finalnya.

Jika URL final berbeda, ubah `worker/wrangler.toml`:

```toml
PUBLIC_APP_URL = "https://<url-vercel-final>"
FRONTEND_ORIGINS = "https://<url-vercel-final>"
```

Lalu deploy Worker ulang:

```bash
npm run worker:deploy
```

## 3. Cek setelah Vercel live

- Buka `https://<url-vercel>/admin/login`.
- Login dengan `ADMIN_PASSWORD` dari `.deploy-secrets.local`.
- Buat sesi.
- QR harus berisi URL Vercel.
- Foto akan diambil dari Worker/R2.

## 4. Uploader laptop

Salin `watcher/config.example.json` menjadi `watcher/config.json`:

```json
{
  "serverUrl": "https://lensa-api.zaychik2006lya.workers.dev",
  "ingestToken": "INGEST_TOKEN_DARI_DEPLOY_SECRETS",
  "watchDir": "C:\\Users\\NamaKamu\\Pictures\\Tethering",
  "agentName": "Laptop Studio",
  "stabilitySeconds": 2
}
```

`INGEST_TOKEN` ada di `.deploy-secrets.local`.

Jalankan:

```bash
npm run watcher
```

atau `start-watcher.cmd`.

---

## Lokal

```bash
npm run worker:migrate
npm run dev
```

Frontend: `http://127.0.0.1:5173`
Worker: `http://127.0.0.1:8787`

Tes:

```bash
npm run test:e2e
npm run test:live
npm run test:visual
```
