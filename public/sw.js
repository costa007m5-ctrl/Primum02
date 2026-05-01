// NetPremium Service Worker - PWA Offline Support & Caching
const CACHE_NAME = 'netpremium-cache-v1';
const STATIC_CACHE = 'netpremium-static-v1';
const IMAGE_CACHE = 'netpremium-images-v1';

// Arquivos essenciais para cache offline
const STATIC_FILES = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Instalar e cachear arquivos essenciais
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_FILES);
    })
  );
  // Ativar imediatamente
  self.skipWaiting();
});

// Ativar e limpar caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE && 
              cacheName !== CACHE_NAME && 
              cacheName !== IMAGE_CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Controlar todas as páginas imediatamente
  self.clients.claim();
});

// Estratégia de fetch: Network First com fallback para cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar requests não-GET
  if (request.method !== 'GET') return;

  // Ignorar extensões Chrome e requests de terceiros que não são imagens
  if (url.protocol === 'chrome-extension:') return;

  // Cache especial para imagens do TMDB
  if (url.hostname === 'image.tmdb.org') {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            // Retornar cache imediatamente, atualizar em background
            fetch(request).then((response) => {
              if (response.ok) {
                cache.put(request, response.clone());
              }
            }).catch(() => {});
            return cachedResponse;
          }
          // Buscar da rede e cachear
          return fetch(request).then((response) => {
            if (response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          }).catch(() => {
            // Imagem placeholder se offline
            return new Response('', { status: 404 });
          });
        });
      })
    );
    return;
  }

  // Para arquivos estáticos (JS, CSS, HTML) - Network first
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cachear arquivos estáticos
          if (response.ok && (
            request.url.includes('.js') || 
            request.url.includes('.css') ||
            request.url.includes('.html')
          )) {
            const responseClone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback para cache se offline
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            // Se for navegação, retornar index.html
            if (request.mode === 'navigate') {
              return caches.match('/index.html');
            }
            return new Response('Offline', { status: 503 });
          });
        })
    );
    return;
  }
});

// Limpar cache de imagens periodicamente (manter apenas últimas 200)
self.addEventListener('message', (event) => {
  if (event.data === 'CLEAN_IMAGE_CACHE') {
    caches.open(IMAGE_CACHE).then((cache) => {
      cache.keys().then((keys) => {
        if (keys.length > 200) {
          // Remover imagens mais antigas
          const toDelete = keys.slice(0, keys.length - 200);
          toDelete.forEach((key) => cache.delete(key));
        }
      });
    });
  }
});
