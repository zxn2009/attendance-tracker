/* =========================================================================
 * Service Worker
 * Strategy:
 *   - App shell (HTML, manifest, icons): cached on install
 *   - Navigation / HTML: network-first (always fresh), cache fallback offline
 *   - External assets (fonts): cache-first with network fallback
 *   - Internal assets: cache-first with network update
 * ========================================================================= */

const CACHE_NAME = 'hazoor-v3';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg'
];

/* -------------------------------------------------------------------------
 * Install: pre-cache the app shell
 * ------------------------------------------------------------------------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

/* -------------------------------------------------------------------------
 * Activate: remove outdated caches and take control immediately
 * ------------------------------------------------------------------------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* -------------------------------------------------------------------------
 * Fetch: routing based on request type
 * ------------------------------------------------------------------------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET requests
  if (req.method !== 'GET') return;

  /* --- External resources (e.g., Google Fonts): cache-first --- */
  if (!req.url.startsWith(self.location.origin)) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;

        return fetch(req)
          .then(res => {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
            return res;
          })
          .catch(() => cached);
      })
    );
    return;
  }

  /* --- Navigation & HTML documents: network-first --- */
  const isHTML = req.mode === 'navigate' ||
                 req.destination === 'document' ||
                 req.url.endsWith('.html') ||
                 req.url.endsWith('/');

  if (isHTML) {
    event.respondWith(
      fetch(req)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
          return res;
        })
        .catch(() =>
          caches.match(req).then(cached => cached || caches.match('./index.html'))
        )
    );
    return;
  }

  /* --- Internal assets (CSS, JS, icons): cache-first --- */
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;

      return fetch(req).then(res => {
        // Only cache successful same-origin responses
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return res;
      });
    })
  );
});
