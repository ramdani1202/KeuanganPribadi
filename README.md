# Catatan Uang — PWA

Aplikasi pencatatan keuangan pribadi. Bisa diinstall di Chrome (HP/laptop) seperti aplikasi biasa, setelah di-upload ke GitHub Pages.

## Fitur

- Multi-akun (nama + kata sandi), tiap akun datanya terpisah total
- Onboarding: jenis penghasilan → daftar bank → daftar e-wallet → saldo bank → saldo e-wallet → uang cash
- Beranda dua kartu besar: **Pemasukan** dan **Pengeluaran** (dengan persentase harian)
- Catat transaksi dengan pilih sumber dana (bank / e-wallet / cash)
- Tombol **"Buy"** untuk mencatat pengeluaran
- Riwayat transaksi lengkap dengan filter dan hapus
- Cetak struk PDF (mirip struk Alfamart/Indomaret) langsung dari HP
- Data tersimpan permanen di localStorage browser (hilang hanya jika data browser dihapus)
- Bisa diinstall sebagai PWA (icon di homescreen, tampil fullscreen tanpa address bar)

## Cara upload ke GitHub Pages (langkah lengkap)

1. Buat repository baru di GitHub, contoh nama: `catatan-uang`
2. Upload **semua file di folder ini** (index.html, app.js, manifest.json, sw.js, folder icons/) ke repository tersebut — bisa lewat "Add file → Upload files" di web GitHub, tidak perlu command line
3. Buka tab **Settings** di repository → menu **Pages** di sidebar kiri
4. Di bagian **Source**, pilih branch `main` dan folder `/ (root)`, lalu klik **Save**
5. Tunggu 1-2 menit, GitHub akan kasih link seperti:
   `https://namakamu.github.io/catatan-uang/`
6. Buka link itu di **Chrome HP**
7. Ketuk menu titik tiga (⋮) di Chrome → pilih **"Tambahkan ke layar Utama"** atau akan muncul otomatis banner "Install app"
8. Aplikasi akan muncul di homescreen HP seperti aplikasi biasa

## Struktur file

```
catatan-uang/
├── index.html       ← halaman utama & semua UI
├── app.js            ← semua logika aplikasi
├── manifest.json      ← konfigurasi PWA
├── sw.js              ← service worker (dukungan offline)
├── README.md
└── icons/
    ├── icon-192.svg
    ├── icon-512.svg
    └── icon-maskable.svg
```

## Catatan penting

- **Data disimpan di browser (localStorage)**, bukan di server/cloud. Artinya:
  - Aman dan privat — tidak ada yang bisa akses dari luar
  - Tidak otomatis sinkron antar HP/browser berbeda
  - Data akan **hilang** kalau kamu hapus "Data browsing" / "Clear browsing data" di Chrome untuk situs ini
- Kata sandi disimpan dalam bentuk hash sederhana (bukan enkripsi tingkat bank) — cukup untuk memisahkan akun pribadi, bukan untuk data sangat sensitif
- Karena semua logika berjalan di sisi browser (client-side), tidak perlu server/backend/database tambahan — cukup file statis
