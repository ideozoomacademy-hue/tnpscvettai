/**
 * TNPSC தமிழ் வழிகாட்டி — Service Worker
 * Offline-first strategy with cache versioning
 */

const CACHE_NAME = 'tnpsc-guide-v3';
const STATIC_CACHE = 'tnpsc-static-v3';
const DYNAMIC_CACHE = 'tnpsc-dynamic-v3';

// Files to cache immediately on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+Tamil:wght@300;400;500;600;700;800;900&family=Noto+Serif+Tamil:wght@400;600;700;900&display=swap',
];

// ── INSTALL ──
self.addEventListener('install', (event) => {
  console.log('[SW] Installing TNPSC Service Worker...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch(err => console.log('[SW] Cache failed:', err))
  );
});

// ── ACTIVATE ──
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ── FETCH ──
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin (except fonts)
  if (request.method !== 'GET') return;

  // Cache-first for fonts
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Network-first for API calls / dynamic content
  if (url.pathname.includes('/api/') || url.pathname.includes('/firebase')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Network-first for HTML files (always get latest)
  if (url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(networkFirst(request));
    return;
  }

  // Stale-while-revalidate for CSS/JS/images
  event.respondWith(staleWhileRevalidate(request));
});

// ── STRATEGIES ──

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName || DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || offlineFallback();
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) {
      caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, response.clone()));
    }
    return response;
  }).catch(() => null);

  return cached || fetchPromise || offlineFallback();
}

function offlineFallback() {
  return new Response(`
    <!DOCTYPE html>
    <html lang="ta">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>இணைப்பு இல்லை</title>
      <style>
        body { font-family: sans-serif; text-align: center; padding: 60px 20px; background: #f4f1eb; }
        h1 { font-size: 48px; margin-bottom: 16px; }
        h2 { color: #0c4b76; margin-bottom: 10px; }
        p { color: #6b7280; }
        button { margin-top: 20px; padding: 12px 28px; background: #0c4b76; color: white; border: none; border-radius: 10px; font-size: 14px; cursor: pointer; }
      </style>
    </head>
    <body>
      <h1>📡</h1>
      <h2>இணைப்பு இல்லை</h2>
      <p>இணையம் இல்லாமல் இயங்க முயற்சிக்கிறீர்கள்.<br>சில பகுதிகள் cache-ல் உள்ளன.</p>
      <button onclick="location.reload()">மீண்டும் முயற்சி</button>
    </body>
    </html>
  `, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

// ── PUSH NOTIFICATIONS ──
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const options = {
    body: data.body || 'TNPSC வழிகாட்டியிலிருந்து புதிய அறிவிப்பு',
    icon: '/assets/images/icon-192.png',
    badge: '/assets/images/icon-72.png',
    tag: 'tnpsc-notification',
    renotify: true,
    actions: [
      { action: 'open', title: 'திறக்கவும்' },
      { action: 'close', title: 'மூடவும்' }
    ]
  };
  event.waitUntil(
    self.registration.showNotification(data.title || 'TNPSC வழிகாட்டி', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'open') {
    event.waitUntil(clients.openWindow('/'));
  }
});

// ── BACKGROUND SYNC ──
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-progress') {
    event.waitUntil(syncUserProgress());
  }
});

async function syncUserProgress() {
  // Sync offline quiz results to Firebase when back online
  console.log('[SW] Syncing user progress...');
}
