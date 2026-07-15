const CACHE = 'ultramax-v5';

const OFFLINE = [
  '/setup.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/pwa-manifest.json'
];

const NEVER_CACHE = [
  '/app.html',
  '/app-version.json',
  '/sw.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(OFFLINE))
  );

  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE)
          .map(key => caches.delete(key))
      )
    )
  );

  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  if (NEVER_CACHE.includes(url.pathname)) {
    event.respondWith(
      fetch(event.request, {
        cache: 'no-store'
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.ok) {
          const copy = response.clone();

          caches.open(CACHE).then(cache => {
            cache.put(event.request, copy);
          });
        }

        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
