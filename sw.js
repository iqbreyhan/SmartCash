/**
 * Service Worker untuk Caching & Kemampuan Offline
 * Skripsi: Aplikasi Pencatat Keuangan Mahasiswa + AI Forecast
 */

const CACHE_NAME = 'smartcash-ai-v24';
const ASSETS = [
  'index.html',
  'styles.css',
  'app.js',
  'regression.js',
  'ml_engine.js',
  'manifest.json'
];

// Tahap Install: Caching static assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('SW: Caching static assets...');
        return cache.addAll(ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Tahap Aktifasi: Membersihkan cache lama
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('SW: Menghapus cache lawas...', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Tahap Fetch: Strategi Cache First, fall back to Network
self.addEventListener('fetch', (e) => {
  // Hanya intercept request untuk file lokal
  if (e.request.url.startsWith(self.location.origin)) {
    e.respondWith(
      caches.match(e.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(e.request).then((response) => {
          // Opsional: simpan request baru ke cache jika responsnya valid
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, response.clone());
            return response;
          });
        }).catch(() => {
          // Jika offline total dan file tidak ada di cache
          console.log('SW: Gagal memuat resource offline.');
        });
      })
    );
  }
});
