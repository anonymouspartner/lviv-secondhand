/* Lviv Second Hand — service worker
   - App shell + Leaflet are precached so the app opens offline.
   - HTML is network-first so an online visit always gets the latest build.
   - Map tiles are cached opportunistically for offline panning of visited areas. */
const SHELL_CACHE = 'lviv-sh-shell-v1';
const TILE_CACHE  = 'lviv-sh-tiles-v1';
const MAX_TILES = 400;

const SHELL = [
  './', 'index.html', 'privacy.html', 'manifest.webmanifest',
  'favicon.svg', 'favicon-32.png', 'apple-touch-icon.png',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png',
  'vendor/leaflet.css', 'vendor/leaflet.js'
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

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

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

  // Everything else (Leaflet, icons, manifest): cache-first, refresh in background.
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
      return res;
    }).catch(() => hit))
  );
});
