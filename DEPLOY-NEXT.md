# Lensa — Status Deploy

## Live

| Bagian | URL |
|---|---|
| Frontend | **https://lensa-studio-six.vercel.app** |
| API Worker | **https://lensa-api.zaychik2006lya.workers.dev** |
| R2 | `expo-booth-ril` |
| D1 | `lensa-db` |

Sudah diverifikasi:

- Login admin dari frontend Vercel berhasil.
- CORS Vercel → Worker berhasil.
- Buat sesi dan QR dari dashboard production berhasil.
- QR berisi URL `https://lensa-studio-six.vercel.app/s/...`.
- D1 remote sudah dimigrasikan.
- R2 binding aktif.
- D1 production bersih (0 sesi, 0 foto).
- E2E lokal 31/31, live 8/8, visual tanpa error.

## Login admin

Password ada di file lokal `.deploy-secrets.local`, baris `ADMIN_PASSWORD`.

Jangan commit atau kirim file itu.

## Yang tersisa: uploader laptop

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

## Cara pakai

1. Login admin di `https://lensa-studio-six.vercel.app/admin/login`.
2. Klik **New Session**.
3. Fotografer memindai QR atau membagikan tautannya.
4. Uploader mengirim foto dari folder kamera ke sesi aktif.
5. Tamu melihat foto di halaman `/s/<token>`.
6. Sesi selesai otomatis setelah 15 menit; QR tetap membuka arsip.

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
