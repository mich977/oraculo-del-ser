/**
 * Service Worker — Oráculo Ciber-Filosófico PWA
 * Estrategia:
 *  - App Shell (recursos locales): Cache-First con actualización en segundo plano (Stale-While-Revalidate)
 *  - Fuentes y CDN externos: Cache-First con fallback a red
 *  - API de Google Gemini: Network-Only (nunca cachear respuestas generativas en SW)
 */

const CACHE_VERSION = 'oraculo-cf-v1.0.33';
const RUNTIME_CACHE = 'oraculo-cf-runtime-v1.0.33';

const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './data/sabiduria.js',
  './data/sabiduria.json',
  './js/web-pulse.js',
  './js/nature-service.js',
  './js/gemini-service.js',
  './js/canvas-engine.js',
  './js/qr-generator.js',
  './js/app.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(APP_SHELL_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Nunca interceptar llamadas en vivo (Google Gemini, Wikipedia/Wikimedia REST, /api/web-pulse)
  if (
    url.hostname.includes('generativelanguage.googleapis.com') ||
    url.hostname.includes('wikipedia.org') ||
    url.hostname.includes('wikimedia.org') ||
    url.pathname.startsWith('/api/')
  ) {
    return;
  }

  // Navegación HTML: Network-First con fallback a cache offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put('./index.html', clone));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Recursos del mismo origen: Network-First para aplicar actualizaciones al instante (offline cae a caché)
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // CDN externos (Tailwind, Google Fonts): Cache-First con fallback a red
  if (
    url.hostname.includes('cdn.tailwindcss.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && (response.status === 200 || response.type === 'opaque')) {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
  }
});
