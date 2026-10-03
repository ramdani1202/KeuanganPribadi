# Catatan Uang — PWA

Aplikasi pencatatan keuangan pribadi. Bisa diinstall di Chrome (HP/laptop) seperti aplikasi biasa, setelah di-upload ke GitHub Pages.

## Fitur

- Multi-akun (nama + kata sandi), tiap akun datanya terpisah total. Sandi di-hash PBKDF2-SHA256 + salt (akun lama di-upgrade otomatis saat login)
- Onboarding: jenis penghasilan → daftar bank → daftar e-wallet → saldo bank → saldo e-wallet → uang cash
- Beranda: grafik pemasukan & pengeluaran (mingguan/bulanan), kotak **Masuk/Keluar hari ini**, dan total saldo
- **Berita** dan **Buku PDF** di bagian bawah Beranda, isinya Anda unggah sendiri lewat GitHub (lihat bagian "Berita & Buku PDF")
- Foto profil bisa diunggah dari Pengaturan
- Catat transaksi dengan pilih sumber dana (bank / e-wallet / cash)
- Riwayat transaksi lengkap dengan filter dan hapus
- Tab **Dompet**: tambah/hapus bank & e-wallet, dan **ketuk baris mana pun (bank, e-wallet, cash) untuk mengisi/mengubah saldo**
- Peringatan sebelum mencatat pengeluaran yang membuat saldo minus
- Jenis penghasilan bisa diubah di Pengaturan; onboarding punya tombol kembali
- Backup & restore data ke file `.json` (file backup divalidasi saat dipulihkan)
- Cetak struk PDF (mirip struk Alfamart/Indomaret) langsung dari HP; tinggi struk menyesuaikan jumlah transaksi dan library PDF di-cache untuk offline
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
├── content.js        ← berita, daftar buku, dan pembaca PDF
├── manifest.json      ← konfigurasi PWA
├── sw.js              ← service worker (dukungan offline)
├── README.md
├── lib/              ← pembaca PDF (pdf.js, sudah disertakan, jangan dihapus)
├── content/          ← ISI BERITA & BUKU ANDA
│   ├── news.json     ← daftar berita
│   ├── books.json    ← daftar buku PDF
│   ├── news/         ← gambar berita (.jpg/.png)
│   └── books/        ← cover (.jpg) dan file buku (.pdf)
└── icons/
    ├── icon-192.png
    ├── icon-512.png
    ├── icon-maskable.png
    ├── banks/       ← logo bank
    └── ewallets/    ← logo e-wallet
```

## Berita & Buku PDF

Semua berita dan buku diunggah **lewat GitHub saja** (tanpa server). Aplikasi membaca dua file daftar, lalu menampilkannya di bagian bawah Beranda.

### Menambah berita
1. Upload gambar ke folder `content/news/` (mis. `berita-baru.jpg`, disarankan rasio 16:10, lebar sekitar 900 px).
2. Buka `content/news.json` di GitHub → ikon pensil (Edit), tambahkan satu blok di dalam daftar `news`:

```json
{
  "id": "n6",
  "title": "Judul berita",
  "source": "Nama sumber",
  "date": "2026-10-05",
  "image": "content/news/berita-baru.jpg",
  "summary": "Ringkasan singkat (opsional)",
  "body": ["Paragraf pertama.", "Paragraf kedua."],
  "link": "https://contoh.com/artikel-asli"
}
```

- Urutan di file = urutan di aplikasi. **3 berita pertama** tampil sebagai kartu besar, sisanya di "Berita lainnya".
- `body` boleh berupa daftar paragraf (seperti di atas) atau satu teks dengan baris kosong antarparagraf. `image`, `summary`, dan `link` boleh dikosongkan (`link` hanya `https://`).
- Hati-hati dengan tanda koma dan kutip di file JSON. Kalau ada yang salah, bagian itu tidak tampil.

### Menambah buku PDF
1. Upload file PDF ke `content/books/` (mis. `buku-saya.pdf`) dan cover ke folder yang sama (mis. `buku-saya.jpg`, rasio 3:4, lebar sekitar 600 px). Cover boleh dikosongkan, aplikasi membuat sampul warna otomatis.
2. Edit `content/books.json`, tambahkan di dalam daftar `books`:

```json
{
  "id": "b4",
  "title": "Judul buku",
  "author": "Penulis",
  "cover": "content/books/buku-saya.jpg",
  "file": "content/books/buku-saya.pdf"
}
```

- Buku tampil di baris yang bisa digeser kiri-kanan. Ketuk untuk membaca langsung di aplikasi (gulir ke bawah, tombol − / + untuk zoom, tombol Kembali HP untuk menutup).
- Halaman terakhir yang dibaca diingat per akun dan muncul sebagai bar progres di bawah cover.
- `id` tiap berita/buku harus unik. Nama file sebaiknya tanpa spasi.
- Setelah dibuka sekali, buku tersimpan dan bisa dibaca **offline**. **Jika Anda mengganti isi PDF, beri nama file baru** supaya HP mengunduh versi barunya.
- Ukuran PDF sebaiknya di bawah sekitar 30 MB. Batas GitHub per file 100 MB, tetapi file besar lama dimuat di HP. PDF yang dikunci dengan sandi belum didukung.
- Berita dan daftar buku selalu diambil terbaru saat online (cache hanya cadangan saat offline).
- Isi contoh yang disertakan (berita "MoneyPri" dan 3 buku contoh) boleh dihapus atau diganti.

## Auto-update (tidak perlu naikkan versi manual)

App ini auto-update sepenuhnya — **kamu tidak perlu mengubah apa pun di `sw.js` tiap kali deploy**, dan user tidak perlu clear cache Chrome manual.

**Cara kerjanya:**
- File inti (`index.html`, `app.js`, `manifest.json`) diambil dengan strategi **network-first**: setiap kali file itu dibutuhkan dan user online, browser **selalu ambil versi terbaru langsung dari server** (bukan dari cache).
- Cache di `sw.js` hanya dipakai sebagai cadangan untuk mode **offline** (kalau tidak ada internet).
- Karena itu, begitu kamu upload ulang `index.html` atau `app.js` yang sudah diedit ke GitHub Pages, request berikutnya dari user (reload halaman / buka app lagi) otomatis dapat versi terbaru — **tanpa perlu naikkan nomor versi apa pun**.
- Tombol lingkaran ↻ di pojok kanan atas halaman login bisa dipakai untuk memuat ulang halaman kapan saja secara manual (berguna kalau user mau cek update sekarang juga).

**Cara deploy update sekarang cukup:**
1. Edit file (`index.html` / `app.js` / dll) seperlunya
2. Upload ulang / replace file yang sama di GitHub (nama file harus sama)
3. Selesai — tidak ada langkah tambahan lain

**Catatan:** strategi ini mengutamakan "selalu versi terbaru saat online" dibanding "hemat kuota/loading instan dari cache". Untuk app sesederhana ini bedanya nyaris tidak terasa (file kecil), tapi kalau suatu saat filenya jadi besar, pertimbangkan pakai hashing di nama file per deploy (butuh build step) untuk performa maksimal.

## Catatan penting

- **Data disimpan di browser (localStorage)**, bukan di server/cloud. Artinya:
  - Aman dan privat — tidak ada yang bisa akses dari luar
  - Tidak otomatis sinkron antar HP/browser berbeda
  - Data akan **hilang** kalau kamu hapus "Data browsing" / "Clear browsing data" di Chrome untuk situs ini
- Kata sandi disimpan sebagai hash (PBKDF2 + salt) dan hanya melindungi tampilan aplikasi. Data transaksi sendiri tidak dienkripsi di localStorage, jadi jangan dianggap pengaman tingkat bank
- Pembuatan/pemeriksaan sandi butuh koneksi aman (https atau localhost) — GitHub Pages sudah https
- "Hari ini" mengikuti tanggal lokal perangkat (ganti tepat tengah malam)
- Mengubah saldo di tab Dompet tidak dicatat sebagai transaksi, jadi tidak memengaruhi angka Pemasukan/Pengeluaran
- Karena semua logika berjalan di sisi browser (client-side), tidak perlu server/backend/database tambahan — cukup file statis
