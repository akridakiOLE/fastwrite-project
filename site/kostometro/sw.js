/* Kostometro service worker — κέλυφος offline.
   ⚠ Το CACHE ανεβαίνει σε ΚΑΘΕ αλλαγή αρχείου, αλλιώς μένει το παλιό.

   v28 (3/9/2026) — ΓΙΑΤΙ ΑΛΛΑΞΕ Η ΛΟΓΙΚΗ:
   Μέχρι το v27 ΟΛΑ σερβίρονταν cache-first. Αυτό σημαίνει ότι το πρώτο
   άνοιγμα μετά από κάθε deploy έδειχνε ΥΠΟΧΡΕΩΤΙΚΑ την παλιά έκδοση, και
   η ανανέωση ερχόταν μόνο αφού προλάβαινε να κατέβει ολόκληρο το κέλυφος,
   να ενεργοποιηθεί ο νέος worker και να «πάρει» τη σελίδα. Σε εγκατεστημένο
   PWA που ΞΥΠΝΑΕΙ από το παρασκήνιο δεν γίνεται καν πλοήγηση, άρα ούτε
   έλεγχος ενημέρωσης: ο Stavros άνοιξε/έκλεισε 4+ φορές και έμεινε στο v26.

   Τώρα: τα τέσσερα αρχεία του κελύφους πάνε ΔΙΚΤΥΟ-ΠΡΩΤΑ με φρένο 2,5″
   (χωρίς δίκτυο πέφτουν στη μνήμη, άρα η εφαρμογή δουλεύει κανονικά offline),
   και τα υπόλοιπα (εικονίδια, manifest) μένουν cache-first.
   ⚠ Και το /km-crypto.js μπήκε στο πεδίο: ζει ΕΞΩ από το /kostometro/, άρα
   μέχρι τώρα δεν το έπιανε καθόλου ο worker — χωρίς δίκτυο η οθόνη των 12
   λέξεων θα έσπαγε. */
var CACHE = 'km-v28';
var SHELL = [
  '/kostometro/',
  '/kostometro/index.html',
  '/kostometro/app.css',
  '/kostometro/app.js',
  '/km-crypto.js',
  '/kostometro/manifest.webmanifest',
  '/kostometro/icons/icon-192.png',
  '/kostometro/icons/icon-512.png'
];
/* Ό,τι είναι εδώ ΠΡΕΠΕΙ να είναι φρέσκο, αλλιώς ο χρήστης τρέχει παλιά έκδοση. */
var FRESH = ['/kostometro/', '/kostometro/index.html', '/kostometro/app.js',
             '/kostometro/app.css', '/km-crypto.js'];
var NET_MS = 2500;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function fromCache(req) {
  return caches.match(req, { ignoreSearch: true }).then(function (hit) {
    if (hit) { return hit; }
    return req.mode === 'navigate' ? caches.match('/kostometro/index.html') : undefined;
  });
}
function store(req, res) {
  var copy = res.clone();
  caches.open(CACHE).then(function (c) { c.put(req, copy); });
}

/* Δίκτυο πρώτα, με φρένο: αν το δίκτυο αργήσει πάνω από NET_MS, σερβίρεται η
   μνήμη ΑΜΕΣΩΣ — και η απάντηση του δικτύου, όταν έρθει, ενημερώνει τη μνήμη
   για το επόμενο άνοιγμα. Καμία οθόνη δεν περιμένει ποτέ το δίκτυο. */
function netFirst(req) {
  return new Promise(function (resolve) {
    var settled = false;
    var give = function (r) { if (!settled && r) { settled = true; resolve(r); } };
    var timer = setTimeout(function () { fromCache(req).then(give); }, NET_MS);
    fetch(req).then(function (res) {
      clearTimeout(timer);
      if (res && res.ok) { store(req, res); }
      give(res);
    }).catch(function () {
      clearTimeout(timer);
      fromCache(req).then(function (hit) { give(hit || Response.error()); });
    });
  });
}
function cacheFirst(req) {
  return fromCache(req).then(function (hit) {
    return hit || fetch(req).then(function (res) {
      if (res && res.ok) { store(req, res); }
      return res;
    }).catch(function () { return fromCache(req); });
  });
}

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') { return; }
  var u = new URL(e.request.url);
  if (u.origin !== location.origin) { return; }
  var mine = u.pathname.indexOf('/kostometro/') === 0 || u.pathname === '/km-crypto.js';
  if (!mine) { return; }
  e.respondWith(FRESH.indexOf(u.pathname) >= 0 ? netFirst(e.request) : cacheFirst(e.request));
});
