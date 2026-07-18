/* Avenix Messenger service worker
   Provides notification click handling and supports generic Web Push/FCM payloads.
*/
const CACHE_NAME = 'avenix-messenger-v1';
const CORE_ASSETS = ['./', './index.html', './manifest.json', './2.png'];

self.addEventListener('install', event => {
  // Cache assets independently: a missing optional manifest/icon must not prevent
  // index.html from becoming available offline.
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(CORE_ASSETS.map(asset => cache.add(asset).catch(() => undefined)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (response && response.status === 200 && response.type === 'basic') {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
      }
      return response;
    }).catch(() => event.request.mode === 'navigate' ? caches.match('./index.html') : cached))
  );
});

function normalizedNotification(payload = {}) {
  const notification = payload.notification || payload;
  const data = payload.data || notification.data || {};
  return {
    title: notification.title || 'Avenix Messenger',
    options: {
      body: notification.body || data.body || 'You have a new message',
      icon: notification.icon || data.icon || '2.png',
      badge: notification.badge || data.badge || '2.png',
      tag: notification.tag || data.tag || 'avenix-message',
      renotify: true,
      data: { ...data, url: data.url || './' }
    }
  };
}

// Allows the app to ask the worker to display a browser-level notification.
self.addEventListener('message', event => {
  if (!event.data || event.data.type !== 'AVENIX_SHOW_NOTIFICATION') return;
  const note = normalizedNotification(event.data.payload || {});
  event.waitUntil(self.registration.showNotification(note.title, note.options));
});

// Supports notifications sent later by a Web Push/FCM backend.
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; }
  catch (_) { payload = { notification: { body: event.data ? event.data.text() : '' } }; }
  const note = normalizedNotification(payload);
  event.waitUntil(self.registration.showNotification(note.title, note.options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({ type: 'AVENIX_NOTIFICATION_CLICK', data: event.notification.data || {} });
          return client.focus();
        }
      }
      return clients.openWindow ? clients.openWindow(targetUrl) : undefined;
    })
  );
});
