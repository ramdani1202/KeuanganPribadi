// CATATAN PENTING:
// Browser membandingkan isi sw.js APA ADANYA (byte per byte) untuk tahu
// "ada versi baru atau tidak". Karena itu versi cache TIDAK dihitung dari
// hash di dalam sw.js ini (itu tidak akan pernah trigger update -- isi
// file ini sendiri tidak pernah berubah). Sebagai gantinya:
//
// 1. sw.js ini pakai strategi NETWORK-FIRST untuk semua file inti
//    (index.html, app.js, manifest.json) -- jadi begitu online, user
//    SELALU dapat versi terbaru langsung dari server, tanpa nunggu
//    siklus install/activate service worker sama sekali.
// 2. Cache di sini fungsinya cuma buat offline fallback (jaga-jaga
//    kalau lagi tidak ada koneksi internet).
// 3. Hasilnya: kamu tinggal upload ulang index.html/app.js ke GitHub
//    Pages, dan user yang online akan langsung lihat versi terbaru
//    saat itu juga -- TANPA perlu naikkan versi apa pun di file ini.

const CACHE_NAME = 'moneypri-offline-cache';

// Library PDF dari CDN: disimpan ke cache saat install supaya cetak struk
// tetap jalan offline. Responsnya "opaque" (lintas domain), tapi tetap bisa
// disajikan dari cache untuk tag <script>.
const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

const ASSETS = [
  './',
  './index.html',
  './app.js',
  './content.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable.png',
  './lib/pdf.min.mjs',
  './lib/pdf.worker.min.mjs',
  './icons/banks/seabank.png',
  './icons/banks/bca.png',
  './icons/banks/bri.png',
  './icons/banks/bni.png',
  './icons/banks/mandiri.png',
  './icons/banks/jago.png',
  './icons/banks/neobank.png',
  './icons/banks/krombank.png',
  './icons/ewallets/gopay.png',
  './icons/ewallets/dana.png',
  './icons/ewallets/ovo.png',
  './icons/ewallets/shopeepay.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(ASSETS).then(() =>
        // kalau CDN gagal dijangkau, install tetap lanjut
        fetch(new Request(JSPDF_URL, { mode: 'no-cors' }))
          .then((resp) => cache.put(JSPDF_URL, resp))
          .catch(() => {})
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // jsPDF: cache-first, kalau belum ada ambil dari jaringan lalu simpan
  if (event.request.url === JSPDF_URL) {
    event.respondWith(
      caches.match(JSPDF_URL).then((cached) =>
        cached || fetch(event.request).then((resp) => {
          if (resp && (resp.ok || resp.type === 'opaque')) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(JSPDF_URL, clone));
          }
          return resp;
        })
      )
    );
    return;
  }

  const isCoreFile =
    event.request.mode === 'navigate' ||
    url.pathname.endsWith('/app.js') ||
    url.pathname.endsWith('/content.js') ||
    url.pathname.endsWith('/manifest.json') ||
    url.pathname.endsWith('/index.html');

  if (isCoreFile) {
    // NETWORK-FIRST + no-store: selalu ambil versi terbaru dari server
    // dulu kalau online. Ini kuncinya -- tidak bergantung sama sekali
    // pada siklus update service worker, jadi tidak butuh naikkan versi.
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((resp) => {
          // hanya simpan respons sukses (jangan cache 404/500)
          if (resp && resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return resp;
        })
        .catch(() =>
          caches.match(event.request).then((r) =>
            // index.html hanya jadi cadangan untuk navigasi halaman,
            // bukan untuk app.js / manifest.json
            r || (event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error())
          )
        )
    );
    return;
  }

  // Konten Beranda (cover, daftar buku): NETWORK-FIRST supaya
  // perubahan daftar buku di GitHub langsung muncul. Jika offline,
  // pakai salinan terakhir yang pernah dibuka.
  // PDF: cek server dulu, cache hanya cadangan offline (nama file yang sama
  // boleh diganti isinya).
  if (url.origin === self.location.origin && url.pathname.includes('/content/')) {
    const isPdf = url.pathname.toLowerCase().endsWith('.pdf');
    const store = (resp) => {
      // hanya respons utuh (200); respons 206 (sebagian) tidak boleh masuk cache
      if (resp && resp.status === 200) {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
      }
      return resp;
    };
    event.respondWith(
      isPdf
        // PDF: cek ke server dulu (revalidasi ETag -- kalau file tidak berubah,
        // server cukup balas 304 tanpa unduh ulang). Jadi mengganti isi PDF
        // dengan NAMA YANG SAMA tetap langsung terbaca. Offline -> pakai cache.
        ? fetch(new Request(event.request.url, { cache: 'no-cache' })).then(store).catch(() =>
            caches.match(event.request).then((r) => r || Response.error())
          )
        : fetch(event.request, { cache: 'no-store' }).then(store).catch(() =>
            caches.match(event.request).then((r) => r || Response.error())
          )
    );
    return;
  }

  // Aset statis lain (icon dll): cache-first, tetap diperbarui diam-diam
  // di background (stale-while-revalidate). Ini aman untuk aset yang
  // jarang berubah.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request).then((resp) => {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return resp;
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
});
