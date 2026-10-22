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
- R2 binding aktif; upload 1 foto production berhasil dan thumbnail `200`.
- Data uji production sudah dihapus; D1 bersih (0 sesi, 0 foto).
- E2E lokal 31/31, live 8/8, visual tanpa error.

## Login admin

Password ada di file lokal `.deploy-secrets.local`, baris `ADMIN_PASSWORD`.

Jangan commit atau kirim file itu.

## Uploader

Sudah berjalan dan online:

- Folder: `F:\!EXPOSURE BOOTH\Gallery`
- Server: `https://lensa-api.zaychik2006lya.workers.dev`
- Agen: `Exposure Booth`
- Upload 1 foto production sudah diuji; thumbnail `200`.
- Data uji sudah dihapus.

Saat ini folder kosong dan belum ada sesi aktif, jadi uploader standby.

## Yang belum dilakukan

1. **Buat sesi pertama** dari dashboard, lalu masukkan foto asli ke folder.
2. **Auto-start uploader saat Windows menyala** belum dibuat; sekarang masih manual `npm run watcher` atau `start-watcher.cmd`.
3. **Folder F: harus tetap terhubung**; kalau drive dilepas, uploader tidak bisa membaca foto.
4. **Custom domain** untuk Vercel/Worker belum dipakai; masih memakai `vercel.app` dan `workers.dev`.
5. **Backup/retensi R2** belum diatur; foto tersimpan sampai dihapus manual.
6. **Push commit terbaru ke GitHub** kalau ingin source di GitHub sama dengan konfigurasi production saat ini.

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
