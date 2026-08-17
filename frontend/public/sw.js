const CACHE_NAME = 'srm-forger-v3';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('fetch', event => {
  // Only cache GET requests — skip POST/PUT/DELETE entirely
  if (event.request.method !== 'GET') return;

  // Skip non-http(s) requests (e.g. chrome-extension)
  if (!event.request.url.startsWith('http')) return;

  // Skip API calls — always go to network for those
  if (event.request.url.includes('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Only cache valid responses
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, response.clone());
          return response;
        });
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) return caches.delete(cache);
        })
      )
    )
  );
  self.clients.claim();
});
