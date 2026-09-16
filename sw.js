// APP_VERSION di-update OTOMATIS oleh GitHub Action (.github/workflows/auto-bump-sw.yml)
// setiap kali ada push ke branch main. Kamu TIDAK perlu mengubah baris ini manual.
// Perubahan string ini membuat browser mendeteksi sw.js sebagai "berbeda" dan
// otomatis menjalankan siklus update, sehingga user tidak perlu clear cache manual.
const APP_VERSION = '20260916052145-64289b9';
const CACHE_NAME = `catatan-uang-react-${APP_VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './src/utils.js',
  './src/AppContext.js',
  './src/Icons.js',
  './src/components.js',
  './src/pages.js',
  './src/App.js',
  './src/main.js',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  './icons/icon-maskable.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
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

  // Halaman & file inti (html/js/css): network-first supaya versi terbaru
  // selalu diprioritaskan saat online, tapi tetap bisa dibuka offline lewat cache.
  if (event.request.mode === 'navigate' || ASSETS.some(a => event.request.url.endsWith(a.replace('./', '/')))) {
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

  // Aset lain (CDN React/Babel/jsPDF, font, ikon): cache-first + update diam-diam
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request).then((resp) => {
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return resp;
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
});
