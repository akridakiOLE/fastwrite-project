/* Kostometrisi service worker — κέλυφος offline.
   ⚠ Το CACHE ανεβαίνει σε ΚΑΘΕ αλλαγή αρχείου, αλλιώς μένει το παλιό. */
var CACHE = 'km-v20';
var SHELL = [
  '/kostometrisi/',
  '/kostometrisi/index.html',
  '/kostometrisi/app.css',
  '/kostometrisi/app.js',
  '/kostometrisi/manifest.webmanifest',
  '/kostometrisi/icons/icon-192.png',
  '/kostometrisi/icons/icon-512.png'
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
  if (u.origin !== location.origin || u.pathname.indexOf('/kostometrisi/') !== 0) { return; }
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      return hit || fetch(e.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        return res;
      }).catch(function () { return caches.match('/kostometrisi/index.html'); });
    })
  );
});
