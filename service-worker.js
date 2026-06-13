const CACHE_NAME = 'wknd-stats-offline-v4';
const APP_SHELL = [
  '/',
  '/index.html',
  '/app.bundle.js',
  '/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => (key === CACHE_NAME ? Promise.resolve() : caches.delete(key))));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;
  const isNavigationRequest = event.request.mode === 'navigate';

  if (isNavigationRequest) {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(event.request);
        const cache = await caches.open(CACHE_NAME);
        cache.put('/index.html', networkResponse.clone());
        return networkResponse;
      } catch (error) {
        const cached = await caches.match('/index.html');
        return cached || caches.match('/');
      }
    })());
    return;
  }

  if (isSameOrigin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const isAppBundleRequest = requestUrl.pathname === '/app.bundle.js';

      if (isAppBundleRequest) {
        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse && networkResponse.ok) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch (error) {
          const cachedBundle = await cache.match(event.request);
          return cachedBundle;
        }
      }

      const cached = await cache.match(event.request);
      if (cached) return cached;
      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse && networkResponse.ok) {
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (error) {
        return cached;
      }
    })());
    return;
  }
});
