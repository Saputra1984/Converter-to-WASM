const CACHE_NAME = 'wasm-forge-v1';

// Hanya cache asset statis LOCAL saja
const ASSETS_TO_CACHE = [
  './',
  './index.html'
];

// Asset CDN dicache terpisah, satu per satu (biar gagal 1 tidak mematikan semua)
const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/ace/1.32.2/ace.js'
];

// Install: cache asset lokal + coba cache CDN (opsional)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Wajib: asset lokal
      await cache.addAll(ASSETS_TO_CACHE);
      
      // Opsional: CDN, satu per satu biar tidak saling menjatuhkan
      for (const url of CDN_ASSETS) {
        try {
          await cache.add(new Request(url, { mode: 'cors' }));
        } catch (e) {
          console.warn('SW: gagal cache CDN', url, e.message);
        }
      }
    })
  );
  self.skipWaiting();
});

// Activate: bersihkan cache lama
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch: pintar — jangan ganggu API, cache hanya asset statis
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. JANGAN ganggu request non-GET (POST ke Worker = compile)
  if (req.method !== 'GET') {
    return; // biarkan browser handle langsung
  }

  // 2. JANGAN ganggu request ke Worker kompilasi (domain workers.dev)
  if (url.hostname.endsWith('workers.dev')) {
    return;
  }

  // 3. JANGAN ganggu request ke API Godbolt, corsproxy, allorigins
  if (url.hostname.includes('godbolt.org') ||
      url.hostname.includes('corsproxy.io') ||
      url.hostname.includes('allorigins.win') ||
      url.hostname.includes('cors.lol')) {
    return;
  }

  // 4. Untuk asset statis: cache-first
  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(req).then((networkResponse) => {
        // Cache hanya response yang valid & GET
        if (networkResponse && networkResponse.status === 200 && req.method === 'GET') {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return networkResponse;
      }).catch(() => {
        // Offline + tidak ada di cache → biarkan gagal
        return new Response('Offline', { status: 503 });
      });
    })
  );
});
