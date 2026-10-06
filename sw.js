// Naikkan angka versi ini SETIAP KALI Anda update index.html
// SW lama akan otomatis dibuang, SW baru ambil alih.
const CACHE_VERSION = 'v4'; // ← UBAH KE v3, v4, dst. setiap update
const CACHE_NAME = `wasm-forge-${CACHE_VERSION}`;

// Asset lokal yang WAJIB ada (kalau salah satu tidak ada → SW gagal install)
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

// Asset opsional (kalau gagal, tidak mematikan SW)
const OPTIONAL_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/ace/1.32.2/ace.js'
];

// ---------- INSTALL ----------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Cache asset wajib
      await cache.addAll(CORE_ASSETS);

      // Cache asset opsional satu per satu (toleran gagal)
      for (const url of OPTIONAL_ASSETS) {
        try {
          await cache.add(new Request(url, { mode: 'cors' }));
        } catch (e) {
          console.warn('[SW] Gagal cache opsional:', url, e.message);
        }
      }
    })
  );

  // Langsung aktif tanpa menunggu tab lama ditutup
  self.skipWaiting();
});

// ---------- ACTIVATE ----------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Hapus cache versi lama
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );

      // Ambil alih kontrol semua tab yang terbuka
      await self.clients.claim();

      // Beritahu semua tab bahwa SW baru sudah aktif
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => {
        client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
      });
    })()
  );
});

// ---------- FETCH ----------
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Non-GET (POST kompilasi ke Worker) → bypass total
  if (req.method !== 'GET') return;

  // 2. Worker Cloudflare & API eksternal → bypass total
  if (
    url.hostname.endsWith('workers.dev') ||
    url.hostname.includes('godbolt.org') ||
    url.hostname.includes('corsproxy.io') ||
    url.hostname.includes('allorigins.win') ||
    url.hostname.includes('cors.lol')
  ) {
    return;
  }

  // 3. HTML / JS / CSS / JSON → NETWORK-FIRST (auto-update)
  //    Kalau network gagal → fallback ke cache (offline)
  const isDocumentOrScript =
    req.destination === 'document' ||
    req.destination === 'script' ||
    req.destination === 'style' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.json');

  if (isDocumentOrScript) {
    event.respondWith(
      fetch(req)
        .then((networkResponse) => {
          // Simpan versi terbaru ke cache
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkResponse;
        })
        .catch(() => {
          // Offline → pakai cache
          return caches.match(req).then((cached) => {
            if (cached) return cached;
            // Fallback terakhir: index.html
            return caches.match('./index.html');
          });
        })
    );
    return;
  }

  // 4. Gambar, ikon, font, dll → CACHE-FIRST
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkResponse;
        })
        .catch(() => new Response('Offline', { status: 503 }));
    })
  );
});

// ---------- MESSAGE ----------
// Menerima perintah dari halaman (misal: skipWaiting manual)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
