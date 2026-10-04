const CACHE_NAME = 'oraculo-cache-v1';
const urlsToCache = [
  './',
  './Matriz del alma.html',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Devuelve la respuesta en caché si existe, de lo contrario la solicita a la red.
        return response || fetch(event.request);
      })
  );
});
