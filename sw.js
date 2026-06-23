/* Action Reminders service worker
   - Precaches the app shell so the PWA opens offline.
   - Caches Google Fonts at runtime (immutable, cache-first).
   - NEVER intercepts or caches api.github.com (it is authenticated, dynamic data);
     offline task data is served from the app's own localStorage, not from here.
   Bump CACHE on any shell change to force an update. */
var CACHE = 'ar-shell-v13';
var SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(SHELL).catch(function () { /* tolerate a missing asset */ });
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function cacheFirst(req) {
  return caches.match(req).then(function (hit) {
    if (hit) return hit;
    return fetch(req).then(function (res) {
      if (res && res.status === 200) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    });
  });
}

function networkFirstNav(req) {
  return fetch(req).then(function (res) {
    var copy = res.clone();
    caches.open(CACHE).then(function (c) { c.put(req, copy); });
    return res;
  }).catch(function () {
    return caches.match(req).then(function (m) {
      return m || caches.match('./index.html') || caches.match('./');
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  // Authenticated, dynamic — always go straight to the network, never cache.
  if (url.hostname === 'api.github.com') return;

  // Google Fonts — immutable, cache-first.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(cacheFirst(req));
    return;
  }

  // App's own origin: navigations get fresh-when-online, cached-when-offline;
  // static assets are cache-first.
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') { e.respondWith(networkFirstNav(req)); return; }
    e.respondWith(cacheFirst(req));
    return;
  }
  // Anything else cross-origin: default to network.
});
