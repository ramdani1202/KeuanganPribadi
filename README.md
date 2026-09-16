# Catatan Uang — React (versi tanpa build, siap upload dari HP)

Ini adalah **migrasi ke React** dari versi vanilla JS sebelumnya — tapi ditulis dengan cara khusus supaya **tidak perlu `npm install` atau `npm run build`**. React, ReactDOM, dan Babel di-load langsung dari CDN, dan Babel yang mengompilasi kode JSX **di dalam browser saat dibuka**. Jadi kamu bisa upload semua file ini langsung ke GitHub lewat HP, persis seperti versi sebelumnya.

## Kenapa bukan project Vite biasa?

Project React modern (Vite/Next.js dll) butuh langkah `npm run build` di komputer/CI sebelum bisa di-hosting, karena JSX perlu dikompilasi jadi JavaScript biasa dulu. Karena kamu upload manual dari HP (tanpa command line), langkah build itu tidak bisa dilakukan. Solusinya: pakai Babel Standalone yang mengompilasi JSX **secara langsung di browser pengguna** — sedikit lebih lambat saat pertama load, tapi tidak butuh proses build sama sekali.

## Struktur file

```
catatan-uang-react/
├── index.html         ← entry point, load React+Babel+jsPDF dari CDN
├── manifest.json       ← konfigurasi PWA
├── sw.js                ← service worker (auto-update + offline)
├── styles.css
├── README.md
├── icons/
│   ├── icon-192.svg
│   ├── icon-512.svg
│   └── icon-maskable.svg
└── src/
    ├── utils.js          ← helper functions, storage, PDF generator
    ├── AppContext.js      ← React Context (state global: auth, data, dsb)
    ├── Icons.js            ← komponen ikon SVG
    ├── components.js       ← TabBar, Toast, TxModal
    ├── pages.js             ← semua halaman (Login, Register, Onboarding, Home, dst)
    ├── App.js                ← routing utama (berbasis state, tanpa react-router)
    └── main.js                ← render React ke DOM
```

## Cara upload ke GitHub repo yang SUDAH ADA (dari HP)

1. Buka repo GitHub kamu yang sudah ada isinya (versi vanilla JS sebelumnya) lewat browser HP
2. **Hapus file-file lama** dulu (opsional tapi disarankan, biar bersih): buka tiap file lama (`app.js`, dan `index.html` versi lama) → titik tiga → Delete file → commit
3. Upload semua file baru ini:
   - Di halaman utama repo, ketuk **Add file → Upload files**
   - Upload `index.html`, `manifest.json`, `sw.js`, `styles.css`, `README.md` ke root
   - Untuk folder `icons/` dan `src/`: GitHub web/app mendukung drag-drop folder, tapi kalau tidak bisa, buat file satu-satu dengan **Add file → Create new file**, lalu ketik nama lengkap dengan folder (contoh: ketik `src/utils.js` di kolom nama file — GitHub otomatis buat foldernya)
4. Commit semua perubahan
5. Pastikan GitHub Pages sudah aktif (Settings → Pages → Source: branch `main`, folder `/root`) — kalau sudah aktif dari sebelumnya, tidak perlu diulang
6. Tunggu 1-2 menit, buka link GitHub Pages kamu di Chrome
7. Karena nama file `index.html` sama seperti sebelumnya, Chrome/PWA akan otomatis mendeteksi ada pembaruan dan reload sendiri (lihat bagian Auto-update di bawah)

## Fitur (sama seperti versi vanilla JS)

- Multi-akun dengan nama + kata sandi, data terpisah total per akun
- Onboarding 6 langkah: jenis penghasilan → bank → e-wallet → saldo bank → saldo e-wallet → cash
- Beranda: dua kartu besar Pemasukan/Pengeluaran dengan persentase harian
- Catat transaksi: pilih sumber dana (bank/e-wallet/cash) → nama → nominal → tombol **"Buy"** untuk pengeluaran
- Riwayat lengkap dengan filter dan hapus transaksi
- Cetak struk PDF gaya kasir
- PWA — bisa diinstall ke homescreen Chrome
- **Auto-update** — lihat bagian di bawah

## Auto-update (WAJIB dibaca sebelum upload ulang)

Sama seperti versi vanilla JS sebelumnya, app ini **auto-update** — user tidak perlu clear cache Chrome manual.

**Cara kerjanya:**
- Tiap app dibuka / kembali aktif dari background, otomatis cek apakah `sw.js` di server sudah berubah
- Kalau berubah, versi baru otomatis di-download di background lalu langsung diaktifkan, halaman reload sendiri
- Ada juga tombol lingkaran ↻ di pojok kanan atas halaman login untuk cek manual

**Yang WAJIB kamu lakukan tiap kali edit/upload ulang file apa pun:**

Buka `sw.js`, baris paling atas:
```js
const APP_VERSION = 'v1';
```
Naikkan jadi `'v2'`, `'v3'`, dst — **setiap kali** kamu mengubah isi file apa pun di project ini dan upload ulang ke GitHub. Ini penting karena begitulah browser tahu ada versi baru; kalau `sw.js` isinya persis sama seperti sebelumnya, browser menganggap tidak ada perubahan.

## Catatan penting

- **Data disimpan di localStorage browser**, bukan cloud — privat, tapi tidak sinkron antar perangkat, dan hilang kalau kamu clear data browsing Chrome untuk situs ini
- **Koneksi internet dibutuhkan saat pertama kali buka** (untuk mengambil React/Babel/jsPDF dari CDN). Setelah itu, service worker menyimpan cache-nya sehingga bisa dipakai offline
- Karena JSX dikompilasi di browser (bukan saat build), loading pertama kali sedikit lebih lambat dibanding app React yang sudah di-build — tapi setelah itu cepat karena sudah ke-cache
- Kata sandi disimpan dalam bentuk hash sederhana — cukup untuk memisahkan akun pribadi, bukan untuk data sangat sensitif

## Kalau nanti mau upgrade ke React "beneran" (dengan build step)

Kalau suatu saat kamu punya akses ke komputer/laptop dengan Node.js, project ini juga tersedia dalam bentuk Vite standar (dengan `npm run build`) yang lebih cepat dan modern — tinggal minta lagi versi itu, strukturnya sudah saya siapkan sebelumnya dan tinggal disesuaikan.
