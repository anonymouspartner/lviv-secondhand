/* Lviv Second Hand — service worker
   - App shell + Leaflet are precached so the app opens offline.
   - HTML is network-first so an online visit always gets the latest build.
   - Map tiles are cached opportunistically for offline panning of visited areas. */
const SHELL_CACHE = 'lviv-sh-shell-v5';
const TILE_CACHE  = 'lviv-sh-tiles-v1';
const MAX_TILES = 400;

const SHELL = [
  './', 'index.html', 'privacy.html', 'manifest.webmanifest',
  'favicon.svg', 'favicon-32.png', 'apple-touch-icon.png',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png',
  'vendor/leaflet.css', 'vendor/leaflet.js', 'vendor/qrcode.js',
  'stores.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== TILE_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Keep the tile cache from growing without bound.
async function trimTiles() {
  const cache = await caches.open(TILE_CACHE);
  const keys = await cache.keys();
  if (keys.length > MAX_TILES) {
    for (let i = 0; i < keys.length - MAX_TILES; i++) await cache.delete(keys[i]);
  }
}

// Restock push notifications (payload is JSON sent by the metrics/push Worker).
self.addEventListener('push', (e) => {
  let data = { title: 'Lviv Second Hand', body: '', url: './' };
  try { if (e.data) data = Object.assign(data, e.data.json()); } catch (err) {}
  const payload = data;
  e.waitUntil(Promise.all([
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: 'icon-192.png',
      badge: 'favicon-32.png',
      tag: data.tag || 'restock',
      // The whole payload, not just the url: notificationclick has to hand the
      // page enough to render a banner, and the body is prose that cannot be
      // parsed back into store ids.
      data: payload
    }),
    // A push that lands while the app is open produces a system notification
    // the user may never look at, on top of a window already showing the map.
    // Tell the page too, so it can surface a banner in place.
    notifyClients({ type: 'push', payload })
  ]));
});

// One channel to the page for both arrival and tap. Fire-and-forget: a page
// that is not listening (an older cached build) simply ignores the message.
async function notifyClients(msg) {
  const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const c of cs) { try { c.postMessage(msg); } catch (err) {} }
  return cs.length;
}

// Tapping a notification has to ACT on it, not merely surface the app.
//
// The previous version called focus() on the first open window and returned,
// discarding the url entirely — and on a phone with the PWA installed there is
// almost always an open window, so that branch nearly always won. The app came
// to the front unchanged and nothing said why, which reads as the notification
// doing nothing at all.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const payload = e.notification.data || {};
  const url = payload.url || './';
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of cs) {
      if (!('focus' in c)) continue;
      // Tell the page first: navigate() does not re-run the app, so a client
      // that is already on the target URL would otherwise show nothing new.
      try { c.postMessage({ type: 'notificationclick', payload }); } catch (err) {}
      if ('navigate' in c) { try { await c.navigate(url); } catch (err) {} }
      return c.focus();
    }
    return self.clients.openWindow(url);
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Version checks bypass the cache entirely (always straight to network).
  if (url.searchParams.has('vcheck')) return;

  // OpenStreetMap tiles: cache-first into a capped runtime cache.
  if (/(^|\.)tile\.openstreetmap\.org$/.test(url.hostname)) {
    e.respondWith((async () => {
      const cache = await caches.open(TILE_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) { cache.put(req, res.clone()); trimTiles(); }
        return res;
      } catch (err) {
        return hit || Response.error();
      }
    })());
    return;
  }

  // Only handle our own origin beyond this point.
  if (url.origin !== location.origin) return;

  // HTML documents: network-first so online users get the newest build.
  if (req.mode === 'navigate' || req.destination === 'document') {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(SHELL_CACHE).then((c) => c.put(req, copy)); return res; })
        .catch(() => caches.match(req).then((h) => h || caches.match('index.html')))
    );
    return;
  }

  // stores.json: also network-first (store data changes without an app redeploy),
  // but the app appends a cache-busting ?v= so every request has a unique URL —
  // cache and match it under a normalized key instead, or offline lookups would
  // always miss.
  if (url.pathname.endsWith('/stores.json')) {
    const cacheKey = new Request(url.origin + url.pathname);
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(SHELL_CACHE).then((c) => c.put(cacheKey, copy)); return res; })
        .catch(() => caches.match(cacheKey))
    );
    return;
  }

  // Everything else (Leaflet, icons, manifest): cache-first, refresh in background.
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
      return res;
    }).catch(() => hit))
  );
});
