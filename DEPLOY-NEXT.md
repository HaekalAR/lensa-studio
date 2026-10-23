# Lensa — Status Deploy

## Live

| Bagian | URL |
|---|---|
| Frontend | **https://lensa-studio-six.vercel.app** |
| API Worker | **https://lensa-api.zaychik2006lya.workers.dev** |
| R2 | `expo-booth-ril` |
| D1 | `lensa-db` |

## Fitur strip photobooth

Sudah live dan diuji di production:

- Pilih maksimal 3 foto dari galeri sesi.
- Foto di-crop cover ke 3 slot frame Exposure Fest.
- Sudut mengikuti frame rounded.
- Preview hasil.
- Download JPEG 1386×3024.
- Hasil disimpan ke R2 dan tabel `prints` di D1.
- Hasil muncul lagi saat halaman sesi dibuka ulang.

Backend production sudah membawa endpoint prints dan migrasi `0002_prints.sql`. Frontend Vercel sudah ter-redeploy dari commit fitur strip.

Data print uji production sudah dihapus; tabel `prints` kosong.

## Uploader

Sudah berjalan dengan:

- Folder: `F:\!EXPOSURE BOOTH\Gallery`
- Server production Worker
- Token production
- Upload foto production sudah diuji

Tanggal file tidak dipakai lagi untuk menerima/menolak foto. Duplikat dicegah lewat state file yang sudah pernah diunggah.

## Yang belum dilakukan

1. **Auto-start uploader saat Windows menyala** belum dibuat.
2. Folder F: harus tetap terhubung.
3. Custom domain dan backup/retensi R2 belum diatur.

## Login admin

Password ada di `.deploy-secrets.local`, baris `ADMIN_PASSWORD`.

## Tes

E2E: 32/32 lulus. Live polling: 8/8 lulus. Visual: tanpa error browser.
