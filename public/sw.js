// Service Worker para NetPremium PWA
const CACHE_NAME = 'netpremium-v1';
const STATIC_ASSETS = [
  '/',
  '/menu',
  '/manifest.json',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip video/media requests (let them stream normally)
  const url = new URL(event.request.url);
  if (url.pathname.includes('.m3u8') || 
      url.pathname.includes('.ts') || 
      url.pathname.includes('.mp4') ||
      url.hostname.includes('kingx.dev') ||
      url.hostname.includes('terabox')) {
    return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache if offline
        return caches.match(event.request);
      })
  );
});

// Handle share target (deep linking)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  if (url.pathname === '/share' && event.request.method === 'POST') {
    event.respondWith(
      (async () => {
        const formData = await event.request.formData();
        const sharedUrl = formData.get('url') || formData.get('text');
        
        // Redirect to main app with shared URL
        const redirectUrl = sharedUrl 
          ? `/?shared=${encodeURIComponent(sharedUrl)}`
          : '/';
        
        return Response.redirect(redirectUrl, 303);
      })()
    );
  }
});
