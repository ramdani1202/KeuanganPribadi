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

const CACHE_NAME = 'keuanganpribadi-offline-cache';

const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable.png',
  './icons/banks/seabank.png',
  './icons/banks/bca.png',
  './icons/banks/bri.png',
  './icons/banks/bni.png',
  './icons/banks/mandiri.png',
  './icons/banks/jago.png',
  './icons/banks/neobank.png',
  './icons/ewallets/gopay.png',
  './icons/ewallets/dana.png',
  './icons/ewallets/ovo.png',
  './icons/ewallets/shopeepay.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
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
  const isCoreFile =
    event.request.mode === 'navigate' ||
    url.pathname.endsWith('/app.js') ||
    url.pathname.endsWith('/manifest.json') ||
    url.pathname.endsWith('/index.html');

  if (isCoreFile) {
    // NETWORK-FIRST + no-store: selalu ambil versi terbaru dari server
    // dulu kalau online. Ini kuncinya -- tidak bergantung sama sekali
    // pada siklus update service worker, jadi tidak butuh naikkan versi.
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((resp) => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return resp;
        })
        .catch(() =>
          caches.match(event.request).then((r) => r || caches.match('./index.html'))
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
