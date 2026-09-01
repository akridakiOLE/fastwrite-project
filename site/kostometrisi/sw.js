/* Παλιός service worker του /kostometrisi/ — αντικαταστάθηκε 1/9/2026 από
   worker αυτοκαταστροφής. Δεν σερβίρει τίποτα: σβήνει τις cache του,
   ξεγράφεται, και στέλνει κάθε ανοιχτή καρτέλα στο /kostometro/.
   ⚠ Τα δεδομένα (IndexedDB + km_* κλειδιά) ΔΕΝ αγγίζονται — ζουν στην
   προέλευση, όχι στη διαδρομή, και επιβιώνουν ακέραια. */
self.addEventListener('install', function (e) { e.waitUntil(self.skipWaiting()); });
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.registration.unregister(); })
      .then(function () { return self.clients.matchAll({ type: 'window' }); })
      .then(function (cs) { cs.forEach(function (c) { c.navigate('/kostometro/'); }); })
  );
});
