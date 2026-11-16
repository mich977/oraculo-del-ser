const CACHE_NAME = 'oraculo-cache-v3';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json'
];

// Fase de Instalación
self.addEventListener('install', event => {
  // Obliga al Service Worker a tomar el control sin esperar a que se cierren las pestañas
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Fase de Activación: Limpieza de Cachés Antiguas
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Si la caché no es la actual (v3), la borramos para liberar memoria y forzar la actualización
          if (cacheName !== CACHE_NAME) {
            console.log('Borrando caché antigua:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Toma el control inmediato de todos los clientes (pestañas abiertas)
      return self.clients.claim();
    })
  );
});

// Interceptación de Fetch
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Devuelve el archivo desde caché si existe, si no, lo pide a la red
        return response || fetch(event.request);
      })
  );
});
