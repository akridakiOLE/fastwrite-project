// ═══════════════════════════════════════════════════════════════════════════
// KM-PRO-V201 · Π2 · PRO.mini — ΑΓΟΡΑ ΜΕΣΑ ΣΤΗΝ ΕΦΑΡΜΟΓΗ, ΕΛΕΓΧΟΣ ΚΑΘΕ ΑΓΟΡΑΣ ΑΠΟ ΤΟΝ SERVER (Brief «Τρία σκαλιά» §4)
//
//   POST /api/km/bal/store          -> { store:'apple', transaction_id } | { store:'google', product_id, purchase_token }
//                                      → ο server ρωτά ΤΟ ΚΑΤΑΣΤΗΜΑ, πιστώνει, και λέει στην εφαρμογή «κλείσε την αγορά»
//   POST /api/km/bal/apple/notify   -> App Store Server Notifications V2 (επιστροφή χρημάτων / ανάκληση)
//   googleVoidedSweep(env)          -> ωριαίο cron: ακυρωμένες αγορές Google Play (Voided Purchases API)
//
// Κανόνας καταστημάτων 3.1.1 (Apple) / Payments policy (Google): ό,τι αγοράζει ένας χρήστης για τον εαυτό του μέσα
// στην εφαρμογή = αγορά καταστήματος. Το PRO (επιχείρηση) μένει στο web (3.1.3γ) — Α320 13/10, Brief 15/10.
//
// ΤΕΚΜΗΡΙΩΣΗ (διαβάστηκε 18/10/2026):
//   Apple · developer.apple.com/documentation/appstoreserverapi — Get Transaction Info
//     GET /inApps/v1/transactions/{transactionId} · JWT ES256 (kid = In-App Purchase key, iss = Issuer ID,
//     aud = appstoreconnect-v1, bid = bundle id) · production: api.storekit.itunes.apple.com,
//     sandbox: api.storekit-sandbox.itunes.apple.com · απάντηση: signedTransactionInfo (JWS) με
//     JWSTransactionDecodedPayload: transactionId, bundleId, productId, type, price (milliunits), currency,
//     storefront (alpha-3), appAccountToken, revocationDate, environment, quantity.
//     ⚠ Apple: «μην χρησιμοποιείς price/currency για λογιστική συμφωνία» — εδώ ΜΟΝΟ για το πόσα μπαίνουν στο υπόλοιπο.
//   Google · developers.google.com/android-publisher — purchases.products.get (purchaseState, consumptionState,
//     orderId, purchaseType 0 = δοκιμαστική, obfuscatedExternalAccountId, regionCode) · orders.get
//     (GET …/applications/{pkg}/orders/{orderId}: total, tax ως Money, buyerAddress.buyerCountry) ·
//     purchases.products.consume · purchases.voidedpurchases.list · scope androidpublisher.
//
// ΑΣΦΑΛΕΙΑ:
//   · Η εφαρμογή δεν λέει ΠΟΤΕ ποσό· λέει μόνο «ποια αγορά». Ποσό, χώρα, νόμισμα έρχονται από το κατάστημα, μέσω
//     TLS απευθείας από τον server της Apple / Google (όχι από τη συσκευή) — γι' αυτό δεν χρειάζεται έλεγχος
//     της αλυσίδας πιστοποιητικών του JWS.
//   · Η αγορά δένεται στον λογαριασμό με appAccountToken / obfuscatedAccountId = iapToken(φάκελος) — ξένη αγορά
//     δεν πιστώνεται εδώ. ext_id μοναδικό → η ίδια αγορά δεν πιστώνεται ποτέ δύο φορές.
//   · Δοκιμαστικές αγορές (Sandbox / license tester) πιστώνονται ΜΟΝΟ όπου KM_IAP_SANDBOX=1 (staging) ή για τα
//     email του KM_IAP_SANDBOX_EMAILS (λογαριασμός ελέγχου καταστημάτων) — αλλιώς δωρεάν υπόλοιπο για όποιον έχει
//     TestFlight.
//   · Λείπει ρύθμιση/κλειδί → 503: η εφαρμογή ΔΕΝ κλείνει την αγορά, την ξαναστέλνει αργότερα. Χρήματα δεν χάνονται.
// ═══════════════════════════════════════════════════════════════════════════
import { balConfig, balCredit, balRefund, balView, iapToken, vatOf, A3, MICRO } from "./km_bal.js";

export const IAP_PRODUCT_DEFAULT = "km_mini_10";
const APPLE_HOST = { prod: "https://api.storekit.itunes.apple.com", sandbox: "https://api.storekit-sandbox.itunes.apple.com" };
const GOOGLE_API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/";
const pnum = (v) => { if (v === undefined || v === null || v === "") return null; const n = Number(v); return Number.isFinite(n) && n > 0 && n < 100 ? n : null; };

// Ποια προϊόντα πουλάμε (ίδιο id στα δύο καταστήματα). Ρύθμιση KM_IAP_PRODUCTS="km_mini_10,km_mini_20".
export function iapProducts(env) {
  const s = String((env && env.KM_IAP_PRODUCTS) || IAP_PRODUCT_DEFAULT);
  return s.split(",").map((x) => x.trim()).filter((x) => /^[a-z0-9_.]{1,100}$/.test(x));
}
function sandboxOk(env, email) {
  if (String((env && env.KM_IAP_SANDBOX) || "") === "1") return true;
  const list = String((env && env.KM_IAP_SANDBOX_EMAILS) || "").toLowerCase().split(",").map((x) => x.trim()).filter(Boolean);
  return !!email && list.includes(String(email).toLowerCase());
}

// ── μικρά κρυπτογραφικά ─────────────────────────────────────────────────────
const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uStr = (s) => b64u(new TextEncoder().encode(s));
function pemDer(pem) {
  const b = String(pem || "").replace(/\\n/g, "\n").replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const raw = atob(b); const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out.buffer;
}
export function jwsPayload(jws) {
  const p = String(jws || "").split(".");
  if (p.length !== 3) return null;
  try {
    const s = atob(p[1].replace(/-/g, "+").replace(/_/g, "/") + "===".slice((p[1].length + 3) % 4));
    const bytes = Uint8Array.from(s, (c) => c.charCodeAt(0));
    const o = JSON.parse(new TextDecoder().decode(bytes));
    return o && typeof o === "object" ? o : null;
  } catch (e) { return null; }
}
async function signJwt(header, claims, pem, alg) {
  const key = await crypto.subtle.importKey("pkcs8", pemDer(pem),
    alg === "ES256" ? { name: "ECDSA", namedCurve: "P-256" } : { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const data = b64uStr(JSON.stringify(header)) + "." + b64uStr(JSON.stringify(claims));
  const sig = await crypto.subtle.sign(alg === "ES256" ? { name: "ECDSA", hash: "SHA-256" } : { name: "RSASSA-PKCS1-v1_5" }, key, new TextEncoder().encode(data));
  return data + "." + b64u(sig);   // WebCrypto ECDSA = r‖s (64 bytes) — ακριβώς η μορφή του JWS
}

// ── APPLE ───────────────────────────────────────────────────────────────────
function appleReady(env) { return !!(env.APPLE_IAP_KEY_ID && env.APPLE_IAP_ISSUER_ID && env.APPLE_IAP_PRIVATE_KEY); }
const appleBundle = (env) => env.APPLE_BUNDLE_ID || "tech.fastwrite.kostometro";
async function appleJwt(env) {
  const iat = Math.floor(Date.now() / 1000);
  return signJwt({ alg: "ES256", kid: env.APPLE_IAP_KEY_ID, typ: "JWT" },
    { iss: env.APPLE_IAP_ISSUER_ID, iat, exp: iat + 300, aud: "appstoreconnect-v1", bid: appleBundle(env) }, env.APPLE_IAP_PRIVATE_KEY, "ES256");
}
// → αποκωδικοποιημένη συναλλαγή · null = δεν υπάρχει (ούτε production ούτε sandbox) · throw = κατάστημα/κλειδί
export async function appleTx(env, txId, fetchFn) {
  const f = fetchFn || fetch;
  const jwt = await appleJwt(env);
  for (const where of ["prod", "sandbox"]) {   // Apple: πρώτα production, και στο «4040010 δεν βρέθηκε» το sandbox
    const r = await f(APPLE_HOST[where] + "/inApps/v1/transactions/" + encodeURIComponent(txId), { headers: { Authorization: "Bearer " + jwt } });
    if (r.status === 200) {
      const j = await r.json().catch(() => null);
      const p = j && jwsPayload(j.signedTransactionInfo);
      if (!p) throw new Error("apple_bad_payload");
      return p;
    }
    if (r.status === 404) continue;
    if (r.status === 401 || r.status === 403) throw new Error("apple_auth_" + r.status);
    throw new Error("apple_" + r.status);
  }
  return null;
}

// ── GOOGLE ──────────────────────────────────────────────────────────────────
let gTok = null;   // { at, exp } — ανά isolate, ζει ~1 ώρα
function googleSa(env) {
  try { const o = JSON.parse(env.GOOGLE_PLAY_SA || ""); return o && o.client_email && o.private_key ? o : null; } catch (e) { return null; }
}
const googlePkg = (env) => env.GOOGLE_PLAY_PACKAGE || "tech.fastwrite.kostometro";
async function googleToken(env, f) {
  if (gTok && gTok.exp > Date.now() + 60000) return gTok.at;
  const sa = googleSa(env); if (!sa) throw new Error("google_not_configured");
  const iat = Math.floor(Date.now() / 1000);
  const jwt = await signJwt({ alg: "RS256", typ: "JWT" }, { iss: sa.client_email, scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600 }, sa.private_key, "RS256");
  const r = await f("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") + "&assertion=" + jwt });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error("google_auth_" + r.status);
  gTok = { at: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return gTok.at;
}
async function gapi(env, f, method, path) {
  const at = await googleToken(env, f);
  const r = await f(GOOGLE_API + encodeURIComponent(googlePkg(env)) + path, { method, headers: { Authorization: "Bearer " + at } });
  if (r.status === 404 || r.status === 410) return { status: r.status, j: null };
  if (r.status === 401 || r.status === 403) throw new Error("google_auth_" + r.status);
  if (!r.ok) throw new Error("google_" + r.status);
  const txt = await r.text();
  return { status: r.status, j: txt ? JSON.parse(txt) : {} };
}
const money = (m) => (m && typeof m === "object" ? (Number(m.units || 0) + Number(m.nanos || 0) / 1e9) : null);

// ── ΠΟΣΑ ΜΠΑΙΝΟΥΝ ΣΤΟ ΥΠΟΛΟΙΠΟ ─────────────────────────────────────────────
// Apple: η τιμή περιέχει ΦΠΑ της χώρας → καθαρό = τιμή / (1 + ΦΠΑ) × (1 − προμήθεια).
export function appleNet(env, info, feePct) {
  const cc = A3[String(info.storefront || "").toUpperCase()] || null;
  const vat = vatOf(env, cc), price = info.price, qty = info.quantity || 1;
  const okNum = Number.isInteger(price) && price > 0;
  const status = info.currency === "EUR" && vat !== null && okNum && qty === 1 ? "ok" : "review";
  const net = status === "ok" ? Math.round((price * 1000) / (1 + vat / 100) * (1 - feePct / 100)) : 0;   // price σε χιλιοστά € → μικρο-€
  const gross = okNum ? Math.round(price / 10) : null;
  return { status, country: cc, currency: info.currency || null, gross_minor: gross,
           tax_minor: status === "ok" ? gross - Math.round(price / 10 / (1 + vat / 100)) : null, net_micro: net,
           note: status === "ok" ? null : "έλεγχος: " + [info.currency !== "EUR" ? "νόμισμα " + info.currency : "", vat === null ? "ΦΠΑ χώρας " + (info.storefront || "?") : "", qty !== 1 ? "ποσότητα " + qty : "", okNum ? "" : "τιμή"].filter(Boolean).join(", ") };
}
// Google: η παραγγελία δίνει ΣΥΝΟΛΟ και ΦΟΡΟ → καθαρό = (σύνολο − φόρος) × (1 − προμήθεια).
export function googleNet(order, p, feePct) {
  const total = order ? money(order.total) : null, tax = order ? money(order.tax) : null;
  const cur = order && order.total ? order.total.currencyCode : null;
  const cc = (order && order.buyerAddress && order.buyerAddress.buyerCountry) || (p && p.regionCode) || null;
  const status = cur === "EUR" && total > 0 && tax !== null && tax >= 0 && tax < total ? "ok" : "review";
  return { status, country: cc, currency: cur, gross_minor: total ? Math.round(total * 100) : null, tax_minor: tax !== null ? Math.round(tax * 100) : null,
           net_micro: status === "ok" ? Math.round((total - tax) * MICRO * (1 - feePct / 100)) : 0,
           note: status === "ok" ? null : "έλεγχος: " + (order ? "νόμισμα/φόρος παραγγελίας " + (cur || "?") : "η παραγγελία δεν διαβάστηκε") };
}

// ── POST /api/km/bal/store ──────────────────────────────────────────────────
export async function iapStore(request, env, h, fetchFn) {
  const f = fetchFn || fetch;
  const a = await h.authed(request, env);
  if (a.err) return a.err;
  const folder = a.id.folder;
  const b = (await h.safeJson(request)) || {};
  const store = b.store === "apple" || b.store === "google" ? b.store : null;
  if (!store) return h.json({ ok: false, error: "bad_store" }, 400);
  const cfg = balConfig(env);
  const fee = pnum(store === "apple" ? env.KM_APPLE_FEE_PCT : env.KM_GOOGLE_FEE_PCT);
  if (!cfg || !fee || (store === "apple" ? !appleReady(env) : !googleSa(env))) {
    console.error("iap: λείπει ρύθμιση (" + store + ") — η αγορά ΔΕΝ πιστώθηκε, η εφαρμογή θα την ξαναστείλει");
    return h.json({ ok: false, error: "not_configured", retry: true }, 503);
  }
  const token = await iapToken(env, folder), products = iapProducts(env), sbx = sandboxOk(env, a.acc.email);
  let lot;
  try {
    if (store === "apple") {
      const txId = typeof b.transaction_id === "string" && /^\d{1,30}$/.test(b.transaction_id) ? b.transaction_id : null;
      if (!txId) return h.json({ ok: false, error: "bad_transaction" }, 400);
      const info = await appleTx(env, txId, f);
      if (!info) return h.json({ ok: false, error: "not_found" }, 404);
      if (info.bundleId !== appleBundle(env) || !products.includes(info.productId) || info.type !== "Consumable") return h.json({ ok: false, error: "wrong_product" }, 400);
      if (info.appAccountToken !== token) return h.json({ ok: false, error: "not_yours" }, 403);
      if (info.revocationDate) return h.json({ ok: false, error: "revoked", finish: true }, 409);
      const sandbox = info.environment === "Sandbox";
      if (sandbox && !sbx) return h.json({ ok: false, error: "sandbox", finish: true }, 403);
      const n = appleNet(env, info, fee);
      lot = Object.assign(n, { source: "apple", ext_id: "apple:" + info.transactionId, env: sandbox ? "sandbox" : "prod", product: info.productId, fee_pct: fee });
    } else {
      const pid = typeof b.product_id === "string" && products.includes(b.product_id) ? b.product_id : null;
      const ptok = typeof b.purchase_token === "string" && /^[A-Za-z0-9._:-]{10,600}$/.test(b.purchase_token) ? b.purchase_token : null;
      if (!pid || !ptok) return h.json({ ok: false, error: "bad_purchase" }, 400);
      const g = await gapi(env, f, "GET", "/purchases/products/" + encodeURIComponent(pid) + "/tokens/" + encodeURIComponent(ptok));
      const p = g.j;
      if (!p) return h.json({ ok: false, error: "not_found" }, 404);
      if (p.purchaseState === 2) return h.json({ ok: false, error: "pending", retry: true }, 409);    // πληρωμή σε εκκρεμότητα
      if (p.purchaseState !== 0) return h.json({ ok: false, error: "not_purchased", finish: true }, 409);
      if (p.obfuscatedExternalAccountId !== token) return h.json({ ok: false, error: "not_yours" }, 403);
      const sandbox = p.purchaseType === 0;
      if (sandbox && !sbx) return h.json({ ok: false, error: "sandbox", finish: true }, 403);
      let order = null;
      if (p.orderId) { const o = await gapi(env, f, "GET", "/orders/" + encodeURIComponent(p.orderId)); order = o.j; }
      const n = googleNet(order, p, fee);
      const ext = p.orderId ? "google:" + p.orderId : "google:tok:" + (await h.sha256hex(ptok));
      lot = Object.assign(n, { source: "google", ext_id: ext, env: sandbox ? "sandbox" : "prod", product: pid, fee_pct: fee, _g: { pid, ptok, consumed: p.consumptionState === 1 } });
    }
  } catch (e) {
    console.error("iap " + store + ": " + (e && e.message));
    const cfgErr = /_auth_|not_configured/.test(String(e && e.message));
    return h.json({ ok: false, error: cfgErr ? "not_configured" : "store_unavailable", retry: true }, 503);
  }
  const r = await balCredit(env, Object.assign({ folder_id: folder, email: null, cfg }, lot));
  if (r.folder_id && r.folder_id !== folder) return h.json({ ok: false, error: "not_yours" }, 403);
  let consumed = null;
  if (lot._g && !lot._g.consumed) {   // Google: «κατανάλωση» = ο χρήστης μπορεί να ξαναγοράσει (και επιβεβαίωση, αλλιώς επιστροφή σε 3 ημέρες)
    try { await gapi(env, f, "POST", "/purchases/products/" + encodeURIComponent(lot._g.pid) + "/tokens/" + encodeURIComponent(lot._g.ptok) + ":consume"); consumed = true; }
    catch (e) { consumed = false; console.error("iap google consume: " + (e && e.message)); }
  }
  return h.json({ ok: true, finish: consumed !== false, dup: r.dup, status: r.status, credited_eur: Math.round(r.net_micro / 1e4) / 100,
                  bal: await balView(env, folder, null) });
}

// ── POST /api/km/bal/apple/notify ───────────────────────────────────────────
// Το σώμα ΔΕΝ εμπιστεύεται: παίρνουμε μόνο το transactionId και ρωτάμε ξανά την Apple (Get Transaction Info).
export async function appleNotify(request, env, h, fetchFn) {
  const len = Number(request.headers.get("Content-Length") || 0);
  if (len > 256 * 1024) return h.json({ ok: false, error: "too_big" }, 413);
  const b = (await h.safeJson(request)) || {};
  const n = jwsPayload(b.signedPayload);
  if (!n) return h.json({ ok: false, error: "bad_payload" }, 400);
  if (n.notificationType !== "REFUND" && n.notificationType !== "REVOKE") return h.json({ ok: true, ignored: n.notificationType || null });
  const tx = n.data && jwsPayload(n.data.signedTransactionInfo);
  const txId = tx && typeof tx.transactionId === "string" && /^\d{1,30}$/.test(tx.transactionId) ? tx.transactionId : null;
  if (!txId) return h.json({ ok: true, ignored: "no_tx" });
  if (!appleReady(env)) { console.error("apple notify: λείπει κλειδί — επιστροφή ΔΕΝ εφαρμόστηκε (η Apple ξαναστέλνει)"); return h.json({ ok: false, error: "not_configured" }, 503); }
  let info;
  try { info = await appleTx(env, txId, fetchFn); }
  catch (e) { console.error("apple notify: " + (e && e.message)); return h.json({ ok: false, error: "store_unavailable" }, 503); }
  if (!info || !info.revocationDate) return h.json({ ok: true, applied: false });
  const r = await balRefund(env, "apple:" + info.transactionId, 1, "apple:" + info.transactionId);
  return h.json({ ok: true, applied: !!(r && r.applied) });
}

// ── ωριαίο: ακυρωμένες αγορές Google ───────────────────────────────────────
export async function googleVoidedSweep(env, fetchFn) {
  if (!googleSa(env)) return { skipped: "not_configured" };
  const f = fetchFn || fetch;
  const t = new Date().toISOString();
  const cur = await env.DB.prepare("SELECT v FROM km_iap_kv WHERE k = 'google_voided_ms'").first().catch(() => null);
  let since = cur && /^\d+$/.test(cur.v || "") ? Number(cur.v) : Date.now() - 30 * 864e5;   // το API κρατά 30 ημέρες
  let page = null, n = 0, maxMs = since;
  for (let i = 0; i < 20; i++) {
    const q = "/purchases/voidedpurchases?type=0&maxResults=1000&startTime=" + since + (page ? "&token=" + encodeURIComponent(page) : "");
    const r = await gapi(env, f, "GET", q);
    const list = (r.j && r.j.voidedPurchases) || [];
    for (const v of list) {
      const ms = Number(v.voidedTimeMillis) || 0; if (ms > maxMs) maxMs = ms;
      if (v.orderId) { const x = await balRefund(env, "google:" + v.orderId, 1, "google:" + v.orderId); if (x && x.applied) n++; }
    }
    page = r.j && r.j.tokenPagination && r.j.tokenPagination.nextPageToken;
    if (!page) break;
  }
  await env.DB.prepare("INSERT INTO km_iap_kv (k, v, updated_at) VALUES ('google_voided_ms', ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at")
    .bind(String(maxMs), t).run();
  return { refunded: n };
}
