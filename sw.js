// Naikkan APP_VERSION setiap kali ada perubahan file (index.html/app.js/dll).
// Perubahan pada string ini membuat browser mendeteksi sw.js sebagai "berbeda"
// dan otomatis menjalankan siklus update (install -> activate) tanpa perlu
// clear cache manual di Chrome.
const APP_VERSION = 'v3';
const CACHE_NAME = `catatan-uang-${APP_VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  './icons/icon-maskable.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  // Tidak langsung skipWaiting di sini — biar app.js yang mengontrol kapan
  // versi baru diaktifkan (setelah selesai download), supaya reload terjadi
  // dengan mulus dan terkontrol, bukan tiba-tiba di tengah pemakaian.
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Halaman utama: network-first, biar versi terbaru selalu diprioritaskan
  // saat online, dan tetap bisa dibuka offline lewat cache.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return resp;
        })
        .catch(() => caches.match(event.request).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // Aset lain: cache-first supaya cepat & tetap jalan offline,
  // tapi tetap diperbarui diam-diam di background (stale-while-revalidate).
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
