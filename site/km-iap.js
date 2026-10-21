/* KM-IAP-BRIDGE · Κ1 (21/10/2026) — η γέφυρα αγορών της εφαρμογής καταστήματος (PRO.mini μέσα στην εφαρμογή).
   Συμβόλαιο: Claude outputs\pro\KM_IAP_GEFYRA_18-10-2026.txt (Συνεδρία Β). Το app.js ψάχνει window.KM_IAP.

   ΤΕΧΝΙΚΗ ΕΠΙΛΟΓΗ (Claude, 21/10): @capgo/native-purchases (Capacitor, Swift Package + Play Billing) αντί για το
   cordova-plugin-purchase της πρότασης 18/10 — το κέλυφος iOS είναι SPM χωρίς CocoaPods, και το capgo δίνει StoreKit 2
   με appAccountToken (UUID — αυτό που ελέγχει ο server) + χειροκίνητο κλείσιμο ΜΕΤΑ την πίστωση από τον server.

   ΑΣΦΑΛΕΙΑ ΤΗΣ ΣΕΙΡΑΣ: autoFinishTransactions:false (capacitor.config) + autoAcknowledgePurchases:false στην αγορά.
   Καμία αγορά δεν «κλείνει» στο κατάστημα πριν ο server πει ok/finish (app.js · iapSend). Στο Google την αγορά την
   καταναλώνει ο SERVER (purchases.products.consume) — εδώ ΤΙΠΟΤΑ, αλλιώς δεν μπορεί να την ξαναελέγξει.

   Στον browser και σε κέλυφος χωρίς το plugin: window.KM_IAP ΔΕΝ ορίζεται → η σελίδα δείχνει «η αγορά γίνεται από
   την εφαρμογή καταστήματος», ακριβώς όπως πριν. */
(function () {
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) { return; }
  var NP = C.Plugins && C.Plugins.NativePurchases;
  if (!NP || !NP.purchaseProduct) { return; }
  var PLAT = C.getPlatform ? C.getPlatform() : '';
  var OURS = /^km_/;                                   // μόνο τα δικά μας προϊόντα (km_mini_10 …)

  function shape(t, id) {
    /* Μορφή που περιμένει ο server (POST /api/km/bal/store) */
    if (!t) { return null; }
    if (PLAT === 'ios') { return t.transactionId ? { store: 'apple', transaction_id: String(t.transactionId) } : null; }
    var tok = t.purchaseToken || null;
    return tok ? { store: 'google', product_id: t.productIdentifier || id, purchase_token: tok } : null;
  }
  function cancelled(e) {
    /* ακύρωση από τον χρήστη = null (όχι σφάλμα): Apple userCancelled · Google USER_CANCELED */
    var m = String((e && e.code) || '') + ' ' + String((e && e.message) || e || '');
    return /cancel/i.test(m);
  }

  window.KM_IAP = {
    platform: PLAT,
    products: function (ids) {
      return NP.getProducts({ productIdentifiers: ids, productType: 'inapp' }).then(function (r) {
        return ((r && r.products) || []).map(function (p) { return { id: p.identifier, price: p.priceString }; });
      });
    },
    buy: function (id, opts) {
      var tok = opts && opts.accountToken;
      if (!tok) { return Promise.reject(new Error('no_account_token')); }
      return NP.purchaseProduct({ productIdentifier: id, productType: 'inapp', appAccountToken: tok,
                                  isConsumable: false, autoAcknowledgePurchases: false, quantity: 1 })
        .then(function (t) { return shape(t, id); }, function (e) { if (cancelled(e)) { return null; } throw e; });
    },
    finish: function (p) {
      /* ΜΟΝΟ αφού ο server πιστώσει. Apple: finishTransaction. Google: τίποτα — consume από τον server. */
      if (p && p.store === 'apple' && p.transaction_id && NP.finishTransaction) {
        return NP.finishTransaction({ transactionId: String(p.transaction_id) });
      }
      return Promise.resolve();
    },
    pending: function () {
      if (!NP.getUnfinishedTransactions) { return Promise.resolve([]); }
      return NP.getUnfinishedTransactions().then(function (r) {
        return ((r && r.transactions) || []).filter(function (t) { return OURS.test(t.productIdentifier || ''); })
          .map(function (t) { return shape(t, t.productIdentifier); }).filter(Boolean);
      });
    }
  };
})();
