/* ΠΙΝΑΚΑΣ ΕΛΕΓΧΟΥ — service worker. Scope: /pinakas/ ΜΟΝΟ.
   🔴 ΜΑΘΗΜΑ 15/9/2026 (η σελίδα ακύρωσης που «έφαγε» ο sw του Kostometro):
   αυτός ο sw κρατάει στη μνήμη ΜΟΝΟ το κέλυφος (3 αρχεία). ΚΑΜΙΑ κλήση προς
   /api/ δεν περνάει από εδώ — τα νούμερα του πίνακα λένε ΠΑΝΤΑ την αλήθεια του
   server. Χωρίς δίκτυο ο πίνακας ανοίγει και λέει «χωρίς σύνδεση», δεν δείχνει
   χθεσινά νούμερα σαν σημερινά. */
var CACHE = 'pk-v5';
var SHELL = ['/pinakas/', '/pinakas/index.html', '/pinakas/app.js', '/pinakas/manifest.webmanifest'];

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
  if (u.origin !== location.origin) { return; }
  if (u.pathname.indexOf('/api/') === 0) { return; }          // ΠΟΤΕ δεδομένα από μνήμη
  if (u.pathname.indexOf('/pinakas/') !== 0) { return; }
  /* Δίκτυο πρώτα· μνήμη μόνο αν το δίκτυο λείπει. Το κέλυφος αλλάζει σπάνια,
     αλλά όταν αλλάξει πρέπει να φτάσει με το επόμενο άνοιγμα. */
  e.respondWith(fetch(e.request).then(function (r) {
    if (r && r.ok) { var c = r.clone(); caches.open(CACHE).then(function (k) { k.put(e.request, c); }); }
    return r;
  }).catch(function () { return caches.match(e.request, { ignoreSearch: true }); }));
});
