/* Hand Control service worker — κέλυφος offline.
   ⚠ Το CACHE ανεβαίνει σε ΚΑΘΕ αλλαγή αρχείου, αλλιώς μένει το παλιό. */
var CACHE = 'hc-v1';
var SHELL = [
  '/hc/',
  '/hc/index.html',
  '/hc/hc.css',
  '/hc/app.js',
  '/hc/manifest.webmanifest',
  '/hc/icons/icon-192.png',
  '/hc/icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') { return; }
  var u = new URL(e.request.url);
  if (u.origin !== location.origin || u.pathname.indexOf('/hc/') !== 0) { return; }
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      return hit || fetch(e.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        return res;
      }).catch(function () { return caches.match('/hc/index.html'); });
    })
  );
});
