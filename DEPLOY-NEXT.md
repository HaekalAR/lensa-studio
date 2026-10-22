# Deploy Berikutnya — Lensa

Status repo: kode, konfigurasi, build, tes lokal, dan commit git sudah selesai.
Yang tersisa hanya langkah yang membutuhkan login/akun kamu.

Resource yang sudah tercatat di `worker/wrangler.toml`:

- Worker: `lensa-api`
- D1: `lensa-db` (`ceec3b04-32e4-469c-9d14-865655fa7180`)
- R2: `expo-booth-ril`
- Frontend: `https://lensa-studio.vercel.app`

Kalau nama/URL di atas berbeda dengan akunmu, ubah `worker/wrangler.toml`.

---

## 1. Login Cloudflare

```bash
node scripts/wrangler-run.mjs login
```

Browser akan terbuka. Setujui akses, lalu kembali ke terminal.

Cek:

```bash
node scripts/wrangler-run.mjs whoami
```

## 2. Migrasi D1 remote

```bash
npx wrangler d1 migrations apply lensa-db --remote --config worker/wrangler.toml
```

## 3. Upload tiga secret

File `.deploy-secrets.worker.env` sudah dibuat dan **di-ignore git**. Isinya:
`ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, `INGEST_TOKEN`.

```bash
npx wrangler secret bulk .deploy-secrets.worker.env --config worker/wrangler.toml
```

Setelah berhasil, hapus file itu:

```bash
rm .deploy-secrets.worker.env
```

Di PowerShell:

```powershell
Remove-Item .deploy-secrets.worker.env
```

Password admin ada di `.deploy-secrets.local` (juga di-ignore git). Jangan commit file itu.

## 4. Deploy Worker

```bash
npm run worker:deploy
```

Output akan memberi URL, misalnya:

```text
https://lensa-api.<subdomain-akun>.workers.dev
```

### Setelah dapat URL Worker

Ubah `worker/wrangler.toml`:

```toml
PUBLIC_API_URL = "https://lensa-api.<subdomain-akun>.workers.dev"
```

Lalu deploy ulang:

```bash
npm run worker:deploy
```

## 5. Push ke GitHub

Repo lokal sudah di-commit di branch `main`. Buat repository kosong di GitHub, lalu:

```bash
git remote add origin https://github.com/USERNAME/REPO.git
git push -u origin main
```

Jangan commit:

- `.env`
- `.deploy-secrets.local`
- `.deploy-secrets.worker.env`
- `worker/.dev.vars`
- `watcher/config.json`

Semua sudah masuk `.gitignore`.

## 6. Import di Vercel

1. Vercel → Add New → Project → import repo GitHub.
2. Root Directory: **root repo**.
3. Framework: Vite.
4. Environment Variable:

```env
VITE_API_BASE_URL=https://lensa-api.<subdomain-akun>.workers.dev
```

5. Deploy.

Kalau URL Vercel yang jadi berbeda dari `https://lensa-studio.vercel.app`, update di `worker/wrangler.toml`:

```toml
PUBLIC_APP_URL = "https://<url-vercel-kamu>"
FRONTEND_ORIGINS = "https://<url-vercel-kamu>"
```

Lalu deploy Worker ulang.

## 7. Cek

- Buka `https://<url-vercel>/admin/login`.
- Password: lihat `ADMIN_PASSWORD` di `.deploy-secrets.local`.
- Buat sesi.
- QR harus berisi URL Vercel.
- Foto muncul setelah uploader mengirim.

## 8. Uploader laptop

Salin `watcher/config.example.json` menjadi `watcher/config.json`:

```json
{
  "serverUrl": "https://lensa-api.<subdomain-akun>.workers.dev",
  "ingestToken": "INGEST_TOKEN_DARI_DEPLOY_SECRETS",
  "watchDir": "C:\\Users\\NamaKamu\\Pictures\\Tethering",
  "agentName": "Laptop Studio",
  "stabilitySeconds": 2
}
```

Jalankan:

```bash
npm run watcher
```

atau `start-watcher.cmd`.

---

## Tes lokal

```bash
npm run dev
npm run test:e2e
npm run test:live
npm run test:visual
```

Hasil terakhir:

- E2E: 31/31 lulus
- Live polling: 8/8 lulus
- Visual: tidak ada error browser
