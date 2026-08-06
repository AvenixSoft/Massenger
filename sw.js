// Avenix Messenger Service Worker
// Updated for better cache invalidation on GitHub Pages / deployments

const CACHE_NAME = 'avenix-cache-v2026087'; // ← CHANGE THIS VERSION ON EVERY DEPLOY (or use build date)
const OFFLINE_URL = 'index.html';

self.addEventListener('install', (event) => {
  console.log('[SW] Install');
  // Immediately activate new SW
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Pre-cache the shell (optional)
      return cache.addAll([
        '/',
        '/index.html',
        // Add other static assets here if you have separate files
      ]).catch(() => {});
    })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activate');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      // Take control of all clients immediately
      return self.clients.claim();
    })
  );
});

// Fetch strategy: Network-first for HTML (always get latest), cache-first for everything else
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // For the main document (index.html) → always try network first (bust cache)
  if (request.mode === 'navigate' || 
      (request.destination === 'document' && url.pathname.endsWith('index.html') || url.pathname === '/')) {
    
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache a copy of the fresh response
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
          return response;
        })
        .catch(() => {
          // Offline fallback
          return caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL));
        })
    );
    return;
  }

  // For all other assets (fonts, images, etc.) → cache-first with network fallback
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(request).then((networkResponse) => {
        // Only cache successful responses
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => caches.match(request));
    })
  );
});

// Listen for messages from the page (e.g. "SKIP_WAITING")
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Optional: Notify clients when a new SW is waiting
self.addEventListener('install', () => {
  self.clients.matchAll({ type: 'window' }).then((clients) => {
    clients.forEach((client) => {
      client.postMessage({ type: 'SW_UPDATED' });
    });
  });
});
