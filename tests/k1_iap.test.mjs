// Κ1 · KM-IAP-BRIDGE (21/10/2026) — η γέφυρα αγορών (site/km-iap.js) πάνω σε ψεύτικο @capgo/native-purchases.
//   node tests/k1_iap.test.mjs   · --mutate=N (exit 0 = πιάστηκε)
import { readFileSync } from "node:fs";
import vm from "node:vm";
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let SRC = readFileSync("site/km-iap.js", "utf8");
const HTML = readFileSync("site/kostometro/index.html", "utf8");
const MUT = [
  ["autoAcknowledgePurchases: false", "autoAcknowledgePurchases: true"],                    // 1 · το κατάστημα κλείνει πριν πιστώσει ο server
  ["isConsumable: false", "isConsumable: true"],                                            // 2 · κατανάλωση στη συσκευή (ο server δεν ξαναελέγχει)
  ["appAccountToken: tok,", ""],                                                            // 3 · χωρίς ταυτότητα λογαριασμού
  ["if (!tok) { return Promise.reject(new Error('no_account_token')); }", ""],             // 4 · αγορά χωρίς token
  ["if (cancelled(e)) { return null; } throw e;", "throw e;"],                              // 5 · ακύρωση = σφάλμα
  ["if (p && p.store === 'apple' && p.transaction_id && NP.finishTransaction) {", "if (p && NP.finishTransaction) {"], // 6 · finish και στο Google
  [".filter(function (t) { return OURS.test(t.productIdentifier || ''); })", ""],          // 7 · ξένα προϊόντα στο pending
  ["if (!C || !C.isNativePlatform || !C.isNativePlatform()) { return; }", ""],             // 8 · ορίζεται και στον browser
];
if (ONLY) { const m = MUT[ONLY - 1]; if (!m) process.exit(2); if (!SRC.includes(m[0])) { console.log("Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(3); } SRC = SRC.replace(m[0], m[1]); }
const res = []; const ok = (n, c, i) => { res.push(!!c); console.log((c ? "✅" : "❌") + " " + n + (i ? "  — " + i : "")); };
function load(plat, native, plugin) {
  const calls = []; const w = {};
  const NP = plugin === null ? undefined : Object.assign({
    getProducts: async (o) => { calls.push(["getProducts", o]); return { products: [{ identifier: "km_mini_10", priceString: "10,00 €" }] }; },
    purchaseProduct: async (o) => { calls.push(["purchase", o]); return plat === "ios" ? { transactionId: "2000001", productIdentifier: o.productIdentifier } : { transactionId: "GPA.1", purchaseToken: "tok-abc", productIdentifier: o.productIdentifier }; },
    finishTransaction: async (o) => { calls.push(["finish", o]); },
    getUnfinishedTransactions: async () => ({ transactions: [{ productIdentifier: "km_mini_10", transactionId: "2000002", purchaseToken: "tok-p" }, { productIdentifier: "other_app_item", transactionId: "9", purchaseToken: "x" }] }),
  }, plugin || {});
  w.Capacitor = { isNativePlatform: () => native, getPlatform: () => plat, Plugins: { NativePurchases: NP } };
  vm.runInNewContext(SRC, { window: w, Promise, String, Error });
  return { w, calls };
}
const web = load("web", false); ok("Ε1 στον browser ΔΕΝ ορίζεται KM_IAP", !web.w.KM_IAP);
const noplug = load("android", true, null); ok("Ε2 κέλυφος χωρίς plugin: ΔΕΝ ορίζεται KM_IAP", !noplug.w.KM_IAP);
const a = load("android", true);
const prods = await a.w.KM_IAP.products(["km_mini_10"]);
ok("Ε3 products → [{id, price από το κατάστημα}]", prods.length === 1 && prods[0].id === "km_mini_10" && prods[0].price === "10,00 €");
const pa = await a.w.KM_IAP.buy("km_mini_10", { accountToken: "11111111-2222-4333-8444-555555555555" });
const pc = a.calls.find((c) => c[0] === "purchase")[1];
ok("Ε4 Android: σωστή μορφή για τον server", pa && pa.store === "google" && pa.product_id === "km_mini_10" && pa.purchase_token === "tok-abc");
ok("Ε5 αγορά με appAccountToken + ΧΩΡΙΣ αυτόματο κλείσιμο/κατανάλωση", pc.appAccountToken === "11111111-2222-4333-8444-555555555555" && pc.autoAcknowledgePurchases === false && pc.isConsumable === false && pc.productType === "inapp");
await a.w.KM_IAP.finish(pa); ok("Ε6 Android finish: ΤΙΠΟΤΑ στη συσκευή (consume από τον server)", !a.calls.some((c) => c[0] === "finish"));
const i = load("ios", true);
const pi = await i.w.KM_IAP.buy("km_mini_10", { accountToken: "11111111-2222-4333-8444-555555555555" });
ok("Ε7 iOS: { store:'apple', transaction_id }", pi && pi.store === "apple" && pi.transaction_id === "2000001");
await i.w.KM_IAP.finish(pi); const fc = i.calls.find((c) => c[0] === "finish");
ok("Ε8 iOS finish → finishTransaction(transactionId)", fc && fc[1].transactionId === "2000001");
let rej = false; try { await i.w.KM_IAP.buy("km_mini_10", {}); } catch (e) { rej = /no_account_token/.test(e.message); }
ok("Ε9 χωρίς accountToken: άρνηση, καμία κλήση στο κατάστημα", rej && i.calls.filter((c) => c[0] === "purchase").length === 1);
const c1 = load("android", true, { purchaseProduct: async () => { const e = new Error("User cancelled the purchase"); e.code = "USER_CANCELED"; throw e; } });
let pcan = "σφάλμα"; try { pcan = await c1.w.KM_IAP.buy("km_mini_10", { accountToken: "t" }); } catch (e) {} ok("Ε10 ακύρωση από τον χρήστη → null (όχι σφάλμα)", pcan === null);
const c2 = load("android", true, { purchaseProduct: async () => { throw new Error("BILLING_UNAVAILABLE"); } });
let thrown = false; try { await c2.w.KM_IAP.buy("km_mini_10", { accountToken: "t" }); } catch (e) { thrown = true; } ok("Ε11 άλλο σφάλμα → απορρίπτεται (δεν κρύβεται ως ακύρωση)", thrown);
const pend = await a.w.KM_IAP.pending(); ok("Ε12 pending: μόνο τα δικά μας km_*, σε μορφή server", pend.length === 1 && pend[0].purchase_token === "tok-p");
const iS = HTML.indexOf('<script src="/km-iap.js">'), aS = HTML.indexOf('<script src="/kostometro/app.js">');
ok("Ε13 index.html: km-iap.js φορτώνει ΠΡΙΝ το app.js", iS > 0 && iS < aS);
const bad = res.filter((x) => !x).length;
if (ONLY) { console.log(bad ? "Μ" + ONLY + " → κοκκίνισε ✔" : "Μ" + ONLY + " ΠΕΡΑΣΕ ✘"); process.exit(bad ? 0 : 1); }
console.log("\n" + (res.length - bad) + "/" + res.length + (bad ? " ΑΠΕΤΥΧΑΝ" : " OK")); process.exit(bad ? 1 : 0);
