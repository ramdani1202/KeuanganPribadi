<div align="center">

<img src="icons/icon-192.png" alt="Logo MoneyPri" width="96" height="96">

# MoneyPri

**Pembukuan keuangan pribadi yang sederhana, privat, dan bisa dipakai offline.**

Progressive Web App (PWA) berbahasa Indonesia untuk mencatat pemasukan, pengeluaran, serta saldo bank, e-wallet, dan uang tunai. Seluruh data tersimpan di perangkat pengguna, tanpa server dan tanpa database.

[Fitur](#fitur) · [Instalasi](#instalasi-dan-deployment) · [Arsitektur](#arsitektur) · [Konfigurasi Konten](#mengelola-konten-video) · [Keamanan](#keamanan-dan-privasi) · [Pemecahan Masalah](#pemecahan-masalah)

</div>

---

## Ikhtisar

MoneyPri dirancang untuk individu yang ingin memantau arus kas harian tanpa harus membuat akun di layanan pihak ketiga. Aplikasi berjalan sepenuhnya di sisi klien (client-side) sebagai kumpulan file statis, sehingga dapat di-host gratis di GitHub Pages dan dipasang di layar utama ponsel seperti aplikasi biasa.

| | |
|---|---|
| **Platform** | Web (PWA), Android (APK opsional via Capacitor) |
| **Teknologi** | HTML, CSS, dan JavaScript murni, tanpa framework dan tanpa proses build |
| **Penyimpanan** | `localStorage` peramban |
| **Backend** | Tidak ada |
| **Bahasa antarmuka** | Indonesia |
| **Mata uang** | Rupiah (IDR) |

## Fitur

### Pencatatan keuangan
- **Pemasukan dan pengeluaran** dengan pilihan sumber dana: rekening bank, e-wallet, atau uang tunai.
- **Pembaruan saldo otomatis** pada setiap transaksi. Menghapus transaksi akan mengembalikan saldo.
- **Peringatan saldo minus** sebelum pengeluaran dicatat.
- **Input nominal berformat ribuan** (contoh `1.000.000`) dengan posisi kursor yang terjaga.
- **Riwayat transaksi** lengkap dengan filter Semua, Pemasukan, dan Pengeluaran.
- **Struk PDF** bergaya struk kasir (lebar 80 mm). Tinggi kertas menyesuaikan jumlah transaksi.

### Dompet
- Tumpukan kartu yang dapat digeser dengan gestur sentuh, lengkap dengan momentum dan efek tarik di ujung.
- Katalog logo bawaan: **SeaBank, BCA, BRI, BNI, Mandiri, Jago, Neobank, KromBank** (bank) dan **GoPay, DANA, OVO, ShopeePay** (e-wallet).
- Boleh menambahkan bank yang sama lebih dari sekali, misalnya dua rekening BCA.
- Ubah atau koreksi saldo kapan saja. Perubahan saldo manual tidak dihitung sebagai transaksi.
- Tombol **Buka aplikasi** untuk meluncurkan aplikasi bank atau e-wallet terkait di Android.

### Beranda
- Grafik batang pemasukan dan pengeluaran, **mingguan** (7 hari) atau **bulanan** (6 bulan).
- Ringkasan **Masuk hari ini**, **Keluar hari ini**, dan **Total saldo**.
- Bagian **Videos**: daftar video edukasi keuangan dari YouTube dengan My List, rating bintang, pelacakan progres tonton per akun, dan pencarian.

### Akun dan data
- **Multi-akun** pada satu perangkat. Data tiap akun terpisah sepenuhnya.
- **Backup dan restore** ke file `.json` dengan validasi dan sanitasi saat impor.
- **Foto profil** dari galeri, dipotong persegi dan dikompres otomatis.
- **Jenis penghasilan** (gaji, usaha, atau keduanya) dapat diubah kapan saja.

### Operasional
- **Mode offline**: aplikasi tetap dapat dibuka tanpa internet.
- **Pembaruan otomatis** tanpa perlu menaikkan nomor versi secara manual.
- **Dapat dipasang** di layar utama dan tampil layar penuh.

## Instalasi dan Deployment

### Prasyarat
- Akun [GitHub](https://github.com)
- Peramban modern (disarankan Chrome di Android)

> Aplikasi **harus diakses lewat HTTPS** (atau `localhost`). Hash kata sandi memakai Web Crypto API yang hanya tersedia pada konteks aman. GitHub Pages sudah menyediakan HTTPS.

### Langkah deployment ke GitHub Pages

1. Buat repository baru, misalnya `moneypri`.
2. Unggah seluruh isi proyek ke root repository: `index.html`, `app.js`, `content.js`, `sw.js`, `manifest.json`, `videos.json`, dan folder `icons/`.
3. Buka **Settings → Pages**.
4. Pada **Source**, pilih branch `main` dan folder `/ (root)`, lalu simpan.
5. Tunggu 1 sampai 2 menit. Alamat aplikasi akan tampil, misalnya `https://<username>.github.io/moneypri/`.

### Memasang di ponsel
1. Buka alamat aplikasi di Chrome.
2. Ketuk menu **⋮ → Tambahkan ke layar utama** (atau gunakan banner *Install app* bila muncul).
3. Aplikasi muncul di layar utama dan berjalan layar penuh.

### Menjalankan secara lokal

```bash
# dari folder proyek
python3 -m http.server 8080
# buka http://localhost:8080
```

`localhost` dianggap konteks aman, jadi fitur sandi dan service worker tetap berfungsi.

## Membangun APK Android (opsional)

Repository menyertakan workflow `.github/workflows/build-apk.yml` yang membungkus aplikasi web menjadi APK memakai [Capacitor](https://capacitorjs.com) 7. APK memuat alamat web Anda, jadi pembaruan konten cukup dilakukan lewat GitHub tanpa membuat APK baru.

1. Buka tab **Actions** → **Build APK Android** → **Run workflow**.
2. (Opsional) isi `site_url`. Jika dikosongkan, alamat diturunkan otomatis menjadi `https://<owner>.github.io/<repo>/`.
3. Setelah selesai, unduh `MoneyPri.apk` dari halaman **Releases**.

Workflow ini juga:
- menambahkan plugin native **AppOpener** untuk membuka aplikasi bank dan e-wallet,
- mendaftarkan nama paket aplikasi tersebut pada `<queries>` (wajib sejak Android 11),
- membuat ikon peluncur dari `icons/icon-512.png` dan menyamakan warna status bar dengan tema.

> **Catatan keamanan:** keystore penandatanganan saat ini tertanam di file workflow. Untuk penggunaan produksi atau repository publik, pindahkan ke **GitHub Secrets**. Lihat [Keamanan dan Privasi](#keamanan-dan-privasi).

## Arsitektur

```
Peramban / WebView
│
├── index.html        Markup, seluruh layar dan modal, serta CSS
├── app.js            Logika inti: auth, onboarding, transaksi, dompet, backup, PDF, update
├── content.js        Bagian video Beranda dan pemutar YouTube
├── sw.js             Service worker (cache offline, network-first)
│
└── localStorage      Satu-satunya penyimpanan data
```

### Struktur proyek

```
.
├── .github/
│   └── workflows/
│       └── build-apk.yml     Pipeline build APK Android
├── icons/
│   ├── icon-192.png          Ikon aplikasi
│   ├── icon-512.png
│   ├── icon-maskable.png
│   ├── banks/                Logo bank
│   └── ewallets/             Logo e-wallet
├── app.js                    Logika aplikasi
├── content.js                Konten dan pemutar video
├── index.html                Antarmuka
├── manifest.json             Konfigurasi PWA
├── sw.js                     Service worker
├── videos.json               Daftar video Beranda
└── README.md
```

### Model data

Seluruh data disimpan di `localStorage` dengan kunci berikut.

| Kunci | Isi |
|---|---|
| `cu_users` | `{ username: { algo, salt, iter, passHash, createdAt } }` |
| `cu_data_<user>` | Data keuangan satu akun (lihat di bawah) |
| `cu_session` | Nama akun yang sedang masuk |
| `cu_watch_<user>_<id>` | Progres tonton video |
| `cu_fav_<user>` | Daftar My List |
| `cu_rate_<user>` | Rating video |
| `cu_lastsrc_<user>_<in\|out>` | Sumber dana terakhir yang dipakai |
| `cu_ytm_<id>` | Cache judul dan channel video |

Struktur `cu_data_<user>`:

```jsonc
{
  "incomeType": "gaji | usaha | keduanya",
  "profilePhoto": "data:image/jpeg;base64,...",
  "banks":    [{ "id": "...", "key": "bca", "name": "BCA", "logo": "icons/banks/bca.png" }],
  "ewallets": [{ "id": "...", "key": "gopay", "name": "GoPay", "logo": "icons/ewallets/gopay.png" }],
  "balances": { "bank": { "<id>": 0 }, "ewallet": { "<id>": 0 }, "cash": 0 },
  "transactions": [{
    "id": "...", "type": "in | out", "amount": 50000, "name": "Makan siang",
    "source": { "type": "bank | ewallet | cash", "id": "...", "name": "BCA" },
    "date": "2026-10-06T08:30:00.000Z"
  }]
}
```

### Strategi cache dan pembaruan

| Jenis berkas | Strategi |
|---|---|
| `index.html`, `app.js`, `content.js`, `manifest.json`, `videos.json` | **Network-first** (`no-store`). Cache hanya untuk offline. |
| jsPDF (CDN) | **Cache-first**, disimpan saat instalasi agar struk dapat dicetak offline. |
| Ikon dan aset statis | **Stale-while-revalidate** |
| Domain lain (YouTube, thumbnail) | Langsung ke jaringan, tidak dicegat |

Deteksi versi memakai tag `<meta name="app-build">` di `index.html`. Saat aplikasi dibuka atau kembali dari latar belakang, nilai itu dibandingkan dengan versi di server. Jika berbeda, cache dibersihkan dan halaman dimuat ulang. Ada pengaman agar tidak terjadi muat ulang berulang dalam 3 menit.

**Alur rilis:** ubah file, naikkan nilai `app-build` di `index.html` (dan parameter `?b=` pada tag `<script>`), lalu unggah ke GitHub. Pengguna online menerima versi baru pada pembukaan berikutnya. Tidak ada perubahan di `sw.js`.

## Mengelola Konten Video

Daftar video dibaca dari `videos.json` di root repository, tanpa server.

```json
{
  "videos": [
    {
      "url": "https://youtu.be/XXXXXXXXXXX",
      "title": "Judul video",
      "author": "Nama channel",
      "category": "Finance",
      "desc": "Deskripsi singkat"
    }
  ]
}
```

| Properti | Wajib | Keterangan |
|---|:---:|---|
| `url` | Ya | Tautan YouTube (`youtu.be`, `watch`, `embed`, `shorts`, `live`) atau ID 11 karakter |
| `title` | Tidak | Jika kosong, diambil otomatis dari YouTube saat online |
| `author` | Tidak | Jika kosong, diambil otomatis dari YouTube saat online |
| `category` | Tidak | Label kategori |
| `desc` | Tidak | Deskripsi, maksimal 600 karakter |
| `thumb` | Tidak | URL thumbnail kustom (HTTPS atau path relatif) |

**Ketentuan:**
- Maksimal **80 video**. Duplikat dan tautan tidak valid diabaikan.
- Thumbnail dibuat otomatis dari YouTube.
- Video hanya dapat diputar saat perangkat **online**.
- Progres tonton disimpan **per akun**.
- Kesalahan tanda koma atau kutip pada JSON membuat daftar gagal dimuat. Periksa dengan validator JSON sebelum menyimpan.

## Backup dan Pemulihan

**Pengaturan → Data**

| Aksi | Hasil |
|---|---|
| **Unduh backup** | File `backup-moneypri-<akun>-<tanggal>.json` berisi data akun dan catatan sandi |
| **Pulihkan backup** | Memvalidasi dan membersihkan isi file, lalu menimpa data akun. Jika akun sudah ada, ada konfirmasi terlebih dahulu. |

Karena data hanya ada di peramban, backup berkala sangat disarankan, terutama sebelum mengganti ponsel, menghapus data peramban, atau menghapus aplikasi.

## Keamanan dan Privasi

**Yang dilakukan aplikasi**
- Tidak ada data yang dikirim ke server mana pun. Semua tersimpan lokal.
- Sandi di-hash dengan **PBKDF2-SHA256**, salt acak 16 byte, 100.000 iterasi. Akun lama dengan hash sederhana di-upgrade otomatis saat login.
- Semua teks yang ditampilkan di-escape (`escapeHtml`). File backup dan `videos.json` divalidasi dan dibersihkan sebelum dipakai.
- Nama akun berbahaya (`__proto__`, `constructor`, `prototype`) ditolak.

**Batasan yang perlu dipahami**
- Sandi hanya mengunci **tampilan aplikasi**. Data transaksi di `localStorage` **tidak dienkripsi**, jadi jangan anggap ini pengaman tingkat bank.
- Tidak ada pembatasan jumlah percobaan login.
- File backup memuat hash dan salt sandi. Simpan di tempat aman, dan gunakan sandi yang panjang karena batas minimum hanya 4 karakter.
- Menghapus data situs atau meng-uninstall aplikasi **menghapus semua data** yang belum di-backup.

**Rekomendasi untuk deployment**
- Pindahkan keystore penandatanganan APK dari `build-apk.yml` ke **GitHub Secrets** bila repository bersifat publik.
- Jangan membagikan file backup lewat kanal yang tidak tepercaya.

## Pemecahan Masalah

| Gejala | Penyebab dan solusi |
|---|---|
| "Buka lewat https agar sandi bisa diperiksa" | Aplikasi dibuka lewat HTTP biasa. Gunakan GitHub Pages atau `localhost`. |
| Video tidak muncul | Periksa format `videos.json`, lalu muat ulang. Lihat juga koneksi internet. |
| Video tidak bisa diputar | Pemilik video melarang pemutaran di aplikasi lain. Gunakan **Open in YouTube**. |
| "Library PDF belum termuat" | jsPDF belum pernah diunduh. Hubungkan internet sekali, lalu coba lagi. |
| Versi lama masih tampil | Ketuk tombol ↻ di halaman login atau **Pengaturan → Cek pembaruan**. |
| Tombol buka aplikasi bank membuka Play Store | Aplikasi belum terpasang, atau nama paketnya perlu disesuaikan di `APP_PACKAGES` pada `app.js`. |
| Data hilang | Data peramban terhapus atau aplikasi di-uninstall. Pulihkan dari file backup. |

## Pengembangan

Proyek ini tidak memerlukan build. Edit file, lalu muat ulang peramban.

- **Menambah bank atau e-wallet:** tambahkan logo di `icons/banks/` atau `icons/ewallets/`, daftarkan di `BANK_CATALOG` atau `EWALLET_CATALOG` pada `app.js`, dan (opsional) nama paket Android di `APP_PACKAGES`. Tambahkan juga ke daftar `ASSETS` di `sw.js` agar tersedia offline.
- **Mengubah tema warna:** variabel CSS berada di blok `:root` pada `index.html`.
- **Rilis:** naikkan nilai `app-build` seperti dijelaskan di [Strategi cache dan pembaruan](#strategi-cache-dan-pembaruan).

## Keterbatasan yang diketahui

- Tidak ada sinkronisasi antar perangkat. Gunakan backup dan restore untuk memindahkan data.
- Mata uang tunggal (Rupiah) dan tanpa kategori transaksi.
- Pemutar video memerlukan internet.
- Membuka aplikasi bank hanya tersedia di Android.

---

<div align="center">

**MoneyPri** · Catat uang, tanpa ribet, tanpa server.

</div>
