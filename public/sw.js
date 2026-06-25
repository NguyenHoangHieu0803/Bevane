/* Bevane service worker — caches the app shell for offline launch.
   Network-first for navigations/API is avoided: API must never be cached.
   Strategy:
     - /api/* and /ws  -> always go to network (never cached).
     - app shell assets -> cache-first, fall back to network, then update cache.
     - navigations      -> serve cached index.html when offline.
*/

const CACHE = 'bevane-shell-v19';
const SHELL = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/state.js',
  '/js/api.js',
  '/js/ws.js',
  '/js/ui.js',
  '/js/onboarding.js',
  '/js/chats.js',
  '/js/webrtc.js',
  '/js/calllog.js',
  '/js/notes.js',
  '/js/peerpicker.js',
  '/js/profile.js',
  '/js/wallpaper.js',
  '/js/groups.js',
  '/js/reactions.js',
  '/js/ai-tools.js',
  '/js/vendor/qrcode.js',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept API or websocket upgrades.
  if (url.pathname.startsWith('/api/') || url.pathname === '/ws') return;
  if (request.method !== 'GET') return;

  // App-shell navigations: try network, fall back to cached index.html.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Static assets: cache-first with background refresh.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((res) => {
        if (res && res.ok && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
