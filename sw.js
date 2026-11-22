const CACHE = 'pintar-v11';

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './v3-camera-gallery-patch.js',
  './v5-drawing-progress-patch.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key =>
            key.startsWith('pintar-v') && key !== CACHE
          )
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET' ||
      url.origin !== self.location.origin) return;

  // La app instalada y la web usan el mismo HTML de inicio.
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match('./index.html');
        return cached || fetch(request);
      })
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(request, {
        ignoreSearch: true
      });
      return cached || fetch(request);
    })
  );
});
