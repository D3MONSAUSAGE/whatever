/* Pekko TV player service worker. Scope: /player only (never the dashboard).
   Network first, so updates to the player page reach TVs right away; the saved copy
   is used only when the network is down, letting a TV restart and play saved media offline. */
var PLAYER_CACHE = 'seemple-player-v1';
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) {
  var req = e.request, url;
  if (req.method !== 'GET' || req.mode !== 'navigate') return;
  url = new URL(req.url);
  if (url.origin !== self.location.origin || (url.pathname !== '/player' && url.pathname !== '/player.html')) return;
  e.respondWith(fetch(req).then(function (res) {
    if (res && res.ok) {
      var copy = res.clone();
      caches.open(PLAYER_CACHE).then(function (c) { return c.put('/player', copy); }).then(null, function () {});
    }
    return res;
  }, function () {
    return caches.open(PLAYER_CACHE).then(function (c) { return c.match('/player'); }).then(function (hit) { return hit || Response.error(); });
  }));
});
