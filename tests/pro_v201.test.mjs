// KM-PRO-V201 · Brief «Τρία σκαλιά» (εγκρίθηκε 18/10/2026): Π1 υπόλοιπο σε χρήματα · Π2 PRO.mini αγορά μέσα στην εφαρμογή
// + έλεγχος από τον server · Π3 προπληρωμή PRO στο web · Π4 Free χωρίς Κώστα-βοηθό / οθόνη κλειδιού · δοκιμή 14 ημερών.
//   node tests/pro_v201.test.mjs            node tests/pro_v201.test.mjs --mutate=N  (exit 0 = πιάστηκε)
// Server με ΠΡΑΓΜΑΤΙΚΗ SQL (node:sqlite, τα ίδια schema/*.sql, batch = μία δοσοληψία όπως η D1) · Apple / Google / Paddle /
// Anthropic = ψεύτικοι server με τη μορφή της τεκμηρίωσής τους · κινητό: έλεγχοι πάνω στον κώδικα.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, createHmac, generateKeyPairSync, webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
process.removeAllListeners("warning"); process.on("warning", () => {});
const { DatabaseSync } = await import("node:sqlite");
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let bal = readFileSync("src/km_bal.js", "utf8"), iap = readFileSync("src/km_iap.js", "utf8"), pro = readFileSync("src/km_pro.js", "utf8");
let pad = readFileSync("src/km_paddle.js", "utf8"), km = readFileSync("src/km.js", "utf8"), js = readFileSync("site/kostometro/app.js", "utf8");
let html = readFileSync("site/kostometro/index.html", "utf8"), wt = readFileSync("wrangler.toml", "utf8"), wk = readFileSync("src/worker.js", "utf8");
const MUT = [
  // Μ1 · 🔴 χρέωση ΧΩΡΙΣ έλεγχο ver (δύο συσκευές ξοδεύουν τα ίδια χρήματα)
  ["bal", 'env.DB.prepare("UPDATE km_bal SET left_micro = left_micro - ?, ver = ?, updated_at = ? WHERE folder_id = ? AND ver = ?").bind(sum, nv, t, folder, row.ver)', 'env.DB.prepare("UPDATE km_bal SET left_micro = left_micro - ?, ver = ?, updated_at = ? WHERE folder_id = ? AND ? IS NOT NULL").bind(sum, nv, t, folder, row.ver)'],
  // Μ2 · 🔴 χρέωση χωρίς υπόλοιπο (αρνητικό χωρίς άδεια)
  ["bal", "    if (short && !opts.allowNegative) return { ok: false, error: \"no_balance\", left_micro: row.left_micro };", ""],
  // Μ3 · 🔴 η ανάγνωση παίρνει τη ΣΗΜΕΡΙΝΗ τιμή αντί της κλειδωμένης του lot
  ["bal", "    : need.kind === \"mini\" ? (l) => l.rate_mini : (l) => l.rate_pro;", "    : need.kind === \"mini\" ? (l) => lots[lots.length - 1].rate_mini : (l) => lots[lots.length - 1].rate_pro;"],
  // Μ4 · 🔴 η επιστροφή κράτησης γίνεται ΔΥΟ φορές
  ["bal", "WHERE folder_id = ? AND NOT EXISTS (SELECT 1 FROM km_bal_tx WHERE op_id = ?)\")", "WHERE folder_id = ? AND ? IS NOT NULL\")"],
  // Μ5 · 🔴 η ίδια αγορά πιστώνεται δύο φορές
  ["bal", "    const mine = \"(SELECT lot_id FROM km_bal_lot WHERE ext_id = ?) = ?\";", "    const mine = \"(? IS NOT NULL AND ? IS NOT NULL)\";"],
  // Μ6 · 🔴 η ίδια επιστροφή χρημάτων αφαιρείται δύο φορές
  ["bal", "WHERE lot_id = ? AND status != 'refunded' AND ${kv}`)", "WHERE lot_id = ? AND status != 'refunded' AND ? IS NOT NULL AND ? IS NOT NULL`)"],
  // Μ7 · 🔴 στο υπόλοιπο μπαίνει ΜΙΚΤΟ (με ΦΠΑ) από την Apple
  ["iap", "Math.round((price * 1000) / (1 + vat / 100) * (1 - feePct / 100))", "Math.round((price * 1000) * (1 - feePct / 100))"],
  // Μ8 · 🔴 στο υπόλοιπο μπαίνει χωρίς να αφαιρεθεί η προμήθεια της Google
  ["iap", "net_micro: status === \"ok\" ? Math.round((total - tax) * MICRO * (1 - feePct / 100)) : 0,", "net_micro: status === \"ok\" ? Math.round((total - tax) * MICRO) : 0,"],
  // Μ9 · 🔴 αγορά ΞΕΝΟΥ λογαριασμού πιστώνεται εδώ (Apple)
  ["iap", "      if (info.appAccountToken !== token) return h.json({ ok: false, error: \"not_yours\" }, 403);", ""],
  // Μ10 · 🔴 δοκιμαστική αγορά (Sandbox) πιστώνεται στην παραγωγή
  ["iap", "      if (sandbox && !sbx) return h.json({ ok: false, error: \"sandbox\", finish: true }, 403);\n      const n = appleNet", "      const n = appleNet"],
  // Μ11 · 🔴 Google: πληρωμή σε εκκρεμότητα πιστώνεται
  ["iap", "      if (p.purchaseState === 2) return h.json({ ok: false, error: \"pending\", retry: true }, 409);    // πληρωμή σε εκκρεμότητα\n      if (p.purchaseState !== 0)", "      if (false)"],
  // Μ12 · 🔴 χωρίς ρύθμιση η αγορά «κλείνει» (finish) χωρίς πίστωση — χαμένα χρήματα
  ["iap", "return h.json({ ok: false, error: \"not_configured\", retry: true }, 503);\n  }", "return h.json({ ok: false, error: \"not_configured\", finish: true }, 200);\n  }"],
  // Μ13 · 🔴 ειδοποίηση Apple εφαρμόζεται χωρίς να ρωτηθεί ξανά η Apple
  ["iap", "  if (!info || !info.revocationDate) return h.json({ ok: true, applied: false });", "  if (!info) info = tx;"],
  // Μ14 · 🔴 ανάγνωση PRO χωρίς χρέωση
  ["pro", "  const hold = await balDebit(env, folder, { kind: \"pro\", reads: np }, \"pro\", { hold: true });\n  if (!hold.ok) {", "  const hold = { ok: true, op_id: null, micro: 0 };\n  if (!hold.ok) {"],
  // Μ15 · 🔴 αποτυχία παρόχου ΚΑΙΕΙ χρήματα
  ["pro", "    try { await balRelease(env, folder, hold.op_id); } catch (x)", "    try { } catch (x)"],
  // Μ16 · 🔴 ανάγνωση χωρίς γραμμές χρεώνεται
  ["pro", "  if (!good) await balRelease(env, folder, hold.op_id);", ""],
  // Μ17 · 🔴 δεύτερη δοκιμή με το ίδιο email (η σελίδα δίνει ξανά την τιμή ΜΕ δοκιμή)
  ["pro", "price: used ? noTrial : price,", "price: price,"],
  // Μ18 · 🔴 checkout «δοκιμή + προπληρωμή»: στο υπόλοιπο μπαίνει και το μερίδιο της συνδρομής
  ["pad", "{ n.net_micro = Math.round(n.net_micro * mine / all); n.gross_minor = mine; }", "{ n.gross_minor = mine; }"],
  // Μ19 · 🔴 η δοκιμή δεν καταγράφεται ανά email (άπειρες δοκιμές)
  ["pad", "  if (status === \"trialing\" && email) {", "  if (false) {"],
  // Μ20 · 🔴 Κώστας στη δοκιμή χωρίς χρέωση από το υπόλοιπο
  ["pro", "  if (trialing) {\n    const max", "  if (false) {\n    const max"],
  // Μ21 · 🔴 Κώστας συνδρομητή χωρίς ταβάνι μήνα
  ["pro", "  if (u && u.us_eur_micro >= Math.round(cap * 1e6)) return { error: \"agent_cap\", status: 429, renews: proRenews(month) };", ""],
  // Μ22 · 🔴 η κράτηση του Κώστα δεν επιστρέφει (χρέωση ταβανιού αντί κόστους)
  ["pro", "    await balRelease(env, g.folder, g.hold);\n", "\n"],
  // Μ23 · 🔴 Π4: ο Κώστας απαντά σε Free (χωρίς λογαριασμό PRO)
  ["km", "  } else if (!freeAgentOn(env)) return json({ ok: false, error: \"pro_only\" }, 403);", "  }"],
  // Μ24 · 🔴 Κώστας στη δοκιμή χρεώνεται σκέτο κόστος (χωρίς το 15 % — ζημιά, αντίθετο στην απόφαση 18/10)
  ["bal", "  const per = need.kind === \"agent\" ? (l) => l.fx_usd_eur * (1 + l.markup_pct / 100)", "  const per = need.kind === \"agent\" ? (l) => l.fx_usd_eur"],
  // Μ25 · 🔴 PRO.mini: ανάγνωση συνόλων χωρίς χρέωση μετά τα 20 δώρα
  ["km", "    const d = kb ? await kb.balDebit(env, folder, { kind: \"mini\", reads: pages.length }, \"mini\", { hold: true }) : { ok: false, error: \"no_balance\" };", "    const d = { ok: true, op_id: null, micro: 0 };"],
  // Μ26 · 🔴 PRO.mini: ανάγνωση χωρίς ποσά χρεώνεται
  ["km", "  if (nothing) await refund();   // διάβασε αλλά δεν είδε ποσά → δεν μετράει (ούτε στο δώρο, ούτε στο υπόλοιπο)", ""],
  // Μ27 · 🔴 Paddle: προπληρωμή πιστώνεται ΜΙΚΤΗ (με φόρο και προμήθεια)
  ["pad", "net_micro: (tot - tx - fee) * 10000,", "net_micro: tot * 10000,"],
  // Μ28 · 🔴 Paddle: συνδρομή (όχι προπληρωμή) γίνεται υπόλοιπο
  ["pad", "  if (!items.some(isTop)) return { out: \"ignored\" };", ""],
  // Μ29 · 🔴 διαγραφή λογαριασμού αφήνει υπόλοιπο/κινήσεις
  ["km", "  try { const { balWipe } = await import(\"./km_bal.js\"); await balWipe(env, folderId); } catch (e) {}", ""],
  // Μ30 · 🔴 κινητό: ξανά οθόνη κλειδιού για τους νέους
  ["js", "  function needKeyScreen() { return false; }", "  function needKeyScreen() { return !localStorage.getItem(LS.key) && !localStorage.getItem(LS.skip) && !proOn(); }"],
  // Μ31 · 🔴 κινητό: ο Κώστας του PRO χωρίς ταυτότητα λογαριασμού (ο server δεν μπορεί να χρεώσει)
  ["js", "headers: agProOn() ? Object.assign({ 'Content-Type': 'application/json' }, kmHead()) : { 'Content-Type': 'application/json' },", "headers: { 'Content-Type': 'application/json' },"],
  // Μ32 · 🔴 κινητό: η αγορά «κλείνει» στο κατάστημα ΠΡΙΝ πιστωθεί
  ["js", "        if (j && (j.ok || j.finish === true) && window.KM_IAP && KM_IAP.finish) {", "        if (window.KM_IAP && KM_IAP.finish) {"],
  // Μ33 · 🔴 κινητό: η οθόνη δοκιμής δεν λέει τι γίνεται το υπόλοιπο ΠΡΙΝ τη μετάβαση (απόφαση 18/10)
  ["js", "μεταφέρονται ως έχουν, με την τιμή του PRO: φτάνουν για ~", "φτάνουν για ~"],
  // Μ34 · 🔴 Google: η αγορά δεν «καταναλώνεται» (η Google την επιστρέφει σε 3 ημέρες, ο χρήστης δεν ξαναγοράζει)
  ["iap", "  if (lot._g && !lot._g.consumed) {", "  if (false) {"],
  // Μ36 · 🔴 μηδέν υπόλοιπο: η προπληρωμή δεν είναι υποχρεωτική (δοκιμή όπου τίποτα δεν διαβάζει)
  ["pro", "topup_required: !!qe && level === \"none\" }", "topup_required: false }"],
  // Μ37 · 🔴 τιμολόγιο πολλών σελίδων χρεώνεται σαν μία (ζημιά — αναθεώρηση #1)
  ["bal", "  const extra = Math.round(actualUsdMicro - (oneCostUsd || 0) * 1e6);", "  const extra = 0;"],
  // Μ38 · 🔴 κράτηση χωρίς καταγραφή (κομμένο Worker = χρέωση χωρίς αποτέλεσμα — αναθεώρηση #2)
  ["bal", "    if (opts.hold) st.push(", "    if (false) st.push("],
  // Μ39 · 🔴 γραμμές χωρίς κανένα ποσό χρεώνονται (αναθεώρηση #4)
  ["pro", "  const good = r.data.lines.some((l) => l.line_net !== null || l.unit_price !== null);", "  const good = r.data.lines.length > 0;"],
  // Μ40 · 🔴 το ταβάνι του συνδρομητή γεμίζει από όσα πλήρωσε ο ίδιος (αναθεώρηση #7)
  ["pro", "g.mode === \"balance\" ? 0 : eur, g.mode", "eur, g.mode"],
  // Μ41 · 🔴 δεύτερη μερική επιστροφή αφαιρεί λιγότερα (αναθεώρηση #8)
  ["bal", "  const base = lot.net0_micro == null ? lot.net_micro : lot.net0_micro;", "  const base = lot.net_micro;"],
  // Μ42 · 🔴 επιστροφή Paddle πριν από την πίστωση χάνεται (αναθεώρηση #9)
  ["pad", "    if (w.length) {", "    if (false) {"],
  // Μ43 · 🔴 Κώστας στη δοκιμή: ο βρόχος συνεχίζει πάνω από την κράτηση (αναθεώρηση #5)
  ["km", "      if (proMode && gate.max && micro >= gate.max) {", "      if (false) {"],
  // Μ35 · 🔴 επιστροφή χρημάτων Google ποτέ (cron)
  ["wk", "ctx.waitUntil(import(\"./km_iap.js\").then((m) => m.googleVoidedSweep(env))", "ctx.waitUntil(Promise.resolve(null).then((m) => null)"],
];
if (ONLY !== null) {
  const m = MUT[ONLY - 1]; const bag = { bal, iap, pro, pad, km, js, html, wt, wk };
  if (!m || !bag[m[0]].includes(m[1])) { console.log("Η ΜΕΤΑΛΛΑΞΗ Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(1); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ bal, iap, pro, pad, km, js, html, wt, wk } = bag);
}
let pass = 0, fail = 0;
const crash = (e) => { console.log("  ✘ ΚΑΤΑΡΡΕΥΣΗ: " + (e && e.stack || e)); process.exit(ONLY !== null ? 0 : 1); };
process.on("uncaughtException", crash); process.on("unhandledRejection", crash);
const ok = (c, m) => { if (c) { pass++; if (ONLY === null) console.log("  ✔ " + m); } else { fail++; console.log("  ✘ " + m); } };
console.error = () => {};

// ── βάση: ΠΡΑΓΜΑΤΙΚΗ SQLite · batch = ΜΙΑ δοσοληψία (όπως η D1) ──
const db = new DatabaseSync(":memory:");
for (const f of ["km.sql", "km_h13.sql", "km_v54.sql", "km_h11b.sql", "km_verify.sql", "km_support.sql", "km_support_v95.sql", "km_funnel.sql", "km_agent.sql", "km_read.sql", "km_pro.sql", "km_pro_f5.sql", "km_bal.sql"]) {
  let sql; try { sql = readFileSync("schema/" + f, "utf8"); } catch (e) { continue; }
  sql = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  for (const s of sql.split(";")) { const t = s.trim(); if (!t) continue; try { db.exec(t + ";"); } catch (e) { if (!/duplicate column|already exists/i.test(e.message)) throw e; } }
}
const mk = (q, args) => ({
  async first() { const r = db.prepare(q).get(...args); return r === undefined ? null : { ...r }; },
  async all() { return { results: db.prepare(q).all(...args).map((r) => ({ ...r })) }; },
  async run() { const r = db.prepare(q).run(...args); return { meta: { changes: Number(r.changes) } }; },
  _sync() { const r = db.prepare(q).run(...args); return { meta: { changes: Number(r.changes) } }; } });
const DB = { prepare: (q) => ({ bind: (...a) => mk(q, a.map((x) => (x === undefined ? null : x))), ...mk(q, []) }),
  async batch(list) { db.exec("BEGIN"); try { const out = list.map((s) => s._sync()); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; } } };

// ── ο κώδικας σε φάκελο (τα δυναμικά import λύνονται) ──
const dir = mkdtempSync(join(tmpdir(), "km201-"));
for (const [n, c] of [["km_bal.js", bal], ["km_iap.js", iap], ["km_pro.js", pro], ["km_paddle.js", pad], ["km.js", km]]) writeFileSync(join(dir, n), c);
writeFileSync(join(dir, "km_team.js"), "export async function handleTeam(){ return null; }");
writeFileSync(join(dir, "km_acct.js"), "export async function handleAcct(){ return null; }");
const U = (n) => "file://" + join(dir, n).replace(/\\/g, "/");
const B = await import(U("km_bal.js")), I = await import(U("km_iap.js")), P = await import(U("km_pro.js")), K = await import(U("km.js")), PD = await import(U("km_paddle.js"));

// ── ψεύτικοι εξωτερικοί server ──
const ec = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ type: "pkcs8", format: "pem" });
const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" });
const jws = (o) => "eyJhbGciOiJFUzI1NiJ9." + Buffer.from(JSON.stringify(o)).toString("base64url") + ".c2ln";
const apple = {}, google = { purchases: {}, orders: {}, consumed: [], voided: [], ordersDown: false }, hits = [];
let ai = { lines: 3 }, aiCalls = 0, aiUsage = { input_tokens: 3300, output_tokens: 560 };
globalThis.fetch = async (url, o = {}) => {
  url = String(url); hits.push(url);
  if (/api\.anthropic\.com/.test(url)) {
    aiCalls++;
    if (ai.fail) throw new Error("net");
    const body = JSON.parse(o.body);
    if (body.tools) return new Response(JSON.stringify({ usage: aiUsage, stop_reason: "end_turn", content: [{ type: "text", text: "Στο Μενού → Ομάδα." }] }));
    if (body.max_tokens === 300) return new Response(JSON.stringify({ usage: { input_tokens: 2000, output_tokens: 60 }, content: [{ type: "text", text: ai.nothing ? "{}" : '{"net": 10, "vat": 1.9, "total": 11.9, "date": "2026-10-18"}' }] }));
    const lines = Array.from({ length: ai.lines }, (_, i) => ({ desc: "Είδος " + i, unit: "κιλ.", qty: 1, unit_price: 2, line_net: 2 }));
    return new Response(JSON.stringify({ usage: aiUsage, content: [{ type: "text", text: JSON.stringify({ net: 2 * ai.lines, vat: 0, total: 2 * ai.lines, lines }) }] }));
  }
  let m = /api\.storekit(-sandbox)?\.itunes\.apple\.com\/inApps\/v1\/transactions\/(\d+)$/.exec(url);
  if (m) {
    if (!/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/.test((o.headers || {}).Authorization || "")) return new Response("{}", { status: 401 });
    const t = apple[m[2]];
    if (!t || (t.environment === "Sandbox") !== !!m[1]) return new Response(JSON.stringify({ errorCode: 4040010 }), { status: 404 });
    return new Response(JSON.stringify({ signedTransactionInfo: jws(t) }));
  }
  if (url === "https://oauth2.googleapis.com/token") return new Response(JSON.stringify({ access_token: "ya29.t", expires_in: 3600 }));
  m = /androidpublisher\/v3\/applications\/([^/]+)\/(.*)$/.exec(url);
  if (m) {
    const path = decodeURIComponent(m[2]);
    let x = /^purchases\/products\/([^/]+)\/tokens\/(.+?)(:consume)?$/.exec(path);
    if (x && x[3]) { google.consumed.push(x[2]); return new Response("", { status: 200 }); }
    if (x) { const p = google.purchases[x[2]]; return p ? new Response(JSON.stringify(p)) : new Response("{}", { status: 404 }); }
    x = /^orders\/(.+)$/.exec(path);
    if (x) { if (google.ordersDown) return new Response("{}", { status: 500 }); const od = google.orders[x[1]]; return od ? new Response(JSON.stringify(od)) : new Response("{}", { status: 404 }); }
    if (/^purchases\/voidedpurchases/.test(path)) return new Response(JSON.stringify({ voidedPurchases: google.voided }));
  }
  throw new Error("απρόσμενο fetch " + url);
};

const CFG = { KM_COST_MINI_USD: "0.00243", KM_COST_PRO_USD: "0.0121", KM_FX_USD_EUR: "0.864", KM_MARKUP_PCT: "15" };
let envX = {};
const ENV = () => Object.assign({ DB, KM_ADMIN_KEY: "adm", PRO_LIVE: "1", ANTHROPIC_API_KEY: "k", PADDLE_WEBHOOK_SECRET: "pdl_sec",
  KM_APPLE_FEE_PCT: "15", KM_GOOGLE_FEE_PCT: "15", APPLE_IAP_KEY_ID: "KEYID12345", APPLE_IAP_ISSUER_ID: "iss-1", APPLE_IAP_PRIVATE_KEY: ec,
  GOOGLE_PLAY_SA: JSON.stringify({ client_email: "sa@x.iam.gserviceaccount.com", private_key: rsa }), PRO_AGENT_MONTHLY_EUR: "3",
  EMAIL: { async send() { return {}; } }, ASSETS: { async fetch() { return new Response("## γνώση"); } } }, CFG, envX);
const sha = (s) => createHash("sha256").update(s).digest("hex");
let nAcc = 0;
const account = (email) => { nAcc++; const f = sha("folder" + nAcc), a = sha("auth" + nAcc);
  db.prepare("INSERT INTO km_accounts (folder_id, auth_hash, email, created) VALUES (?, ?, ?, ?)").run(f, sha(a), email, new Date().toISOString());
  return { f, a, email }; };
const H = (A) => ({ "X-Km-Folder": A.f, "X-Km-Auth": A.a, "X-Km-Device": "km_dev" + A.f.slice(0, 6) });
const api = async (method, path, A, body, extra) => {
  const hd = Object.assign({ "Content-Type": "application/json" }, A ? H(A) : {}, extra || {});
  const r = await K.handleKm(new Request("https://x" + path, { method, headers: hd, body: body === undefined ? undefined : (typeof body === "string" ? body : JSON.stringify(body)) }), ENV(), { waitUntil() {} }, path.split("?")[0]);
  return { st: r.status, j: await r.json().catch(() => ({})) };
};
const left = (A) => (db.prepare("SELECT left_micro FROM km_bal WHERE folder_id = ?").get(A.f) || {}).left_micro || 0;
const lotsSum = (A) => db.prepare("SELECT COALESCE(SUM(left_micro),0) AS s FROM km_bal_lot WHERE folder_id = ? AND status IN ('ok','refunded')").get(A.f).s;
const credit = async (A, eur) => (await api("POST", "/api/km/admin/bal/credit", null, { folder_id: A.f, eur }, { "X-Km-Admin": "adm" })).j;
const PAGE = { pages: ["/9j/" + "A".repeat(300)] };
const proGrant = (A, status, source) => db.prepare("INSERT OR REPLACE INTO km_pro VALUES (?, 'pro', ?, 'x', NULL, ?, 'x')").run(A.f, status || "test", source || "admin");

// ═══ 1 · ΤΙΜΕΣ = ΡΥΘΜΙΣΗ ═══
ok(B.balConfig({}) === null && B.balConfig(Object.assign({}, CFG, { KM_FX_USD_EUR: "abc" })) === null, "🔴 τιμές μόνο από ρύθμιση — λείπει/άκυρη → καμία τιμολόγηση");
const C = B.balConfig(CFG);
ok(C.rate_mini === Math.round(0.00243 * 0.864 * 1.15 * 1e6) && C.rate_pro === Math.round(0.0121 * 0.864 * 1.15 * 1e6), "τιμή = μετρημένο κόστος × ισοτιμία × 1,15 (PRO.mini " + C.rate_mini / 1e6 + " € · PRO " + C.rate_pro / 1e6 + " €)");
ok(B.vatOf({}, "CY") === 19 && B.vatOf({}, "GR") === 24 && B.vatOf({}, "US") === null && B.vatOf({ KM_VAT_JSON: '{"CY":20}' }, "CY") === 20, "ΦΠΑ ανά χώρα από πίνακα + αλλαγή με ρύθμιση · χώρα εκτός πίνακα → null");
{ const r = await api("POST", "/api/km/admin/bal/credit", null, { email: "x@y.zz", eur: 5 }); ok(r.st === 404, "πίστωση admin ΜΟΝΟ με κλειδί admin"); }

// ═══ 2 · ΥΠΟΛΟΙΠΟ: χρέωση, επιστροφή, κλειδωμένες τιμές, ταυτόχρονες ═══
const A1 = account("one@example.com");
let r = await api("GET", "/api/km/bal", A1);
ok(r.st === 200 && r.j.left_eur === 0 && r.j.reads_mini === 0 && r.j.iap && /^[0-9a-f-]{36}$/.test(r.j.iap.token) && r.j.iap.products[0] === "km_mini_10", "νέος λογαριασμός: 0 € · ταυτότητα αγορών (UUID, όχι folder_id) · προϊόν km_mini_10");
ok(r.j.iap.token !== A1.f && !r.j.iap.token.includes(A1.f.slice(0, 8)), "🔴 η ταυτότητα προς τα καταστήματα ΔΕΝ είναι το folder_id");
await credit(A1, 10);
ok(left(A1) === 10e6 && lotsSum(A1) === 10e6, "πίστωση 10 € → υπόλοιπο 10 € (km_bal = Σ lots)");
let d = await B.balDebit({ DB }, A1.f, { kind: "pro", reads: 1 }, "pro");
ok(d.ok && d.micro === C.rate_pro && left(A1) === 10e6 - C.rate_pro && lotsSum(A1) === left(A1), "ανάγνωση PRO: −" + C.rate_pro + " μικρο-€, km_bal και lots συμφωνούν");
ok(await B.balRelease({ DB }, A1.f, d.op_id) && left(A1) === 10e6 && lotsSum(A1) === 10e6, "επιστροφή κράτησης → ξανά 10 €, στα ΙΔΙΑ lots");
ok(!(await B.balRelease({ DB }, A1.f, d.op_id)) && left(A1) === 10e6, "🔴 δεύτερη επιστροφή της ίδιας κράτησης = τίποτα");
// κλειδωμένες τιμές: νέα τιμή ισχύει μόνο σε νέα αγορά · ανάγνωση που «σπάει» ανάμεσα σε δύο lots
const A2 = account("two@example.com");
await credit(A2, 0.02);                                          // lot Α: παλιά τιμή
envX = { KM_COST_PRO_USD: "0.0242" };                            // η τιμή διπλασιάζεται
await credit(A2, 1);                                             // lot Β: νέα τιμή
envX = {};
const L = db.prepare("SELECT lot_id, rate_pro, left_micro FROM km_bal_lot WHERE folder_id = ? ORDER BY created_at, lot_id").all(A2.f);
ok(L.length === 2 && L[1].rate_pro === Math.round(0.0242 * 0.864 * 1.15 * 1e6) && L[0].rate_pro === C.rate_pro, "🔴 ό,τι αγοράστηκε κρατά την τιμή του · νέα τιμή μόνο στη νέα αγορά");
d = await B.balDebit({ DB }, A2.f, { kind: "pro", reads: 1 }, "pro");
ok(d.ok && d.micro === C.rate_pro && db.prepare("SELECT left_micro FROM km_bal_lot WHERE lot_id = ?").get(L[1].lot_id).left_micro === 1e6, "1η ανάγνωση: από το ΠΑΛΙΟ lot, με την παλιά τιμή");
const restA = db.prepare("SELECT left_micro FROM km_bal_lot WHERE lot_id = ?").get(L[0].lot_id).left_micro;
d = await B.balDebit({ DB }, A2.f, { kind: "pro", reads: 1 }, "pro");
const expB = Math.ceil((1 - restA / C.rate_pro) * L[1].rate_pro - 1e-9);
ok(d.ok && d.micro === restA + expB && db.prepare("SELECT left_micro FROM km_bal_lot WHERE lot_id = ?").get(L[0].lot_id).left_micro === 0,
   "🔴 ανάγνωση που σπάει: το υπόλοιπο του παλιού lot ΣΤΗΝ ΠΑΛΙΑ τιμή + το υπόλοιπο ποσοστό στη ΝΕΑ (" + restA + " + " + expB + ")");
// ταυτόχρονες: υπόλοιπο για 3 αναγνώσεις, 8 συσκευές μαζί
const A3 = account("three@example.com");
await credit(A3, (3 * C.rate_pro + 10) / 1e6);
const par = await Promise.all(Array.from({ length: 8 }, () => B.balDebit({ DB }, A3.f, { kind: "pro", reads: 1 }, "pro")));
ok(par.filter((x) => x.ok).length === 3 && left(A3) === 10 && lotsSum(A3) === 10, "🔴 8 ταυτόχρονες με υπόλοιπο για 3 → ακριβώς 3 χρεώνονται, ποτέ αρνητικό");
d = await B.balDebit({ DB }, A3.f, { kind: "pro", reads: 1 }, "pro");
ok(!d.ok && d.error === "no_balance", "χωρίς υπόλοιπο → no_balance");
d = await B.balDebit({ DB }, A3.f, { kind: "agent", usd_micro: 20000 }, "agent", { allowNegative: true });
ok(d.ok && left(A3) < 0 && lotsSum(A3) === left(A3), "διαφορά κόστους Κώστα (μόνο αυτή) μπορεί να αφήσει χρέος — και το χρέος φαίνεται");
r = await api("GET", "/api/km/bal", A3);
ok(r.j.reads_mini === 0 && r.j.reads_pro === 0 && r.j.can_mini === false, "χρέος → 0 τιμολόγια, καμία ανάγνωση");

// ═══ 3 · Π1 στο PRO: κάθε ανάγνωση χρεώνεται ═══
const A4 = account("boss@example.com"); proGrant(A4);
aiCalls = 0;
r = await api("POST", "/api/km/pro/read", A4, PAGE);
ok(r.st === 402 && r.j.error === "no_balance" && aiCalls === 0 && r.j.bal && r.j.bal.reads_pro === 0, "🔴 PRO χωρίς υπόλοιπο: 402 no_balance, ΚΑΜΙΑ κλήση στον πάροχο");
await credit(A4, 1);
r = await api("POST", "/api/km/pro/read", A4, PAGE);
ok(r.st === 200 && r.j.lines.length === 3 && r.j.charged_eur === Math.round(C.rate_pro / 100) / 1e4 && left(A4) === 1e6 - C.rate_pro, "ανάγνωση PRO: γραμμές + χρέωση στην κλειδωμένη τιμή");
ai = { fail: true }; r = await api("POST", "/api/km/pro/read", A4, PAGE); ai = { lines: 3 };
ok(r.j.error === "provider" && left(A4) === 1e6 - C.rate_pro, "🔴 αποτυχία παρόχου → τα χρήματα ΓΥΡΙΖΟΥΝ");
ai = { lines: 0 }; r = await api("POST", "/api/km/pro/read", A4, PAGE); ai = { lines: 3 };
ok(r.j.ok && r.j.charged_eur === 0 && left(A4) === 1e6 - C.rate_pro, "🔴 ανάγνωση χωρίς γραμμές → ΔΕΝ χρεώνεται (Brief §3)");
r = await api("GET", "/api/km/pro/status", A4);
ok(r.j.pro && r.j.bal && r.j.bal.reads_pro >= 1 && r.j.month.blocked === null && r.j.trial && r.j.trial.used === false, "pro/status: υπόλοιπο + δοκιμή, τίποτα μπλοκαρισμένο");
const A4b = account("member-free@example.com"); proGrant(A4b);
r = await api("GET", "/api/km/pro/status", A4b);
ok(r.j.month.blocked === "balance", "pro/status: PRO χωρίς υπόλοιπο → blocked = balance (η εφαρμογή το δείχνει)");

// ═══ 3β · ΕΥΡΗΜΑΤΑ ΑΝΕΞΑΡΤΗΤΗΣ ΑΝΑΘΕΩΡΗΣΗΣ (18/10) ═══
{ const Am = account("multi@example.com"); proGrant(Am);
  const P3 = { pages: [PAGE.pages[0], PAGE.pages[0], PAGE.pages[0]] };
  await credit(Am, (2 * C.rate_pro) / 1e6);
  aiCalls = 0; let x = await api("POST", "/api/km/pro/read", Am, P3);
  ok(x.st === 402 && aiCalls === 0, "#1 τιμολόγιο 3 σελίδων με υπόλοιπο για 2 αναγνώσεις → 402 (η κράτηση είναι ανά σελίδα)");
  await credit(Am, 1);
  const l0 = left(Am); aiUsage = { input_tokens: 9900, output_tokens: 600 };
  x = await api("POST", "/api/km/pro/read", Am, P3);
  const actual = 9900 * 2 + 600 * 10, extra = actual - 12100;
  const want = C.rate_pro + Math.ceil(extra * 0.864 * 1.15 - 1e-9);
  ok(x.j.ok && l0 - left(Am) === want && x.j.charged_eur === Math.round(want / 100) / 1e4, "🔴 #1 3 σελίδες: 1 ανάγνωση στην κλειδωμένη τιμή + ό,τι ξεπέρασε το κόστος (×fx×1,15) = " + want + " μικρο-€ — χωρίς ζημιά");
  aiUsage = { input_tokens: 3300, output_tokens: 560 };
  ok(!db.prepare("SELECT 1 FROM km_bal_hold WHERE folder_id = ?").get(Am.f), "#2 μετά την ανάγνωση καμία κράτηση δεν μένει ανοιχτή");
  const hd = await B.balDebit({ DB }, Am.f, { kind: "pro", reads: 1 }, "pro", { hold: true });
  const l1 = left(Am);
  db.prepare("UPDATE km_bal_hold SET at = ? WHERE op_id = ?").run(new Date(Date.now() - 20 * 60000).toISOString(), hd.op_id);
  const sw = await B.balHoldSweep({ DB }, new Date().toISOString());
  ok(sw.released === 1 && left(Am) === l1 + C.rate_pro && !db.prepare("SELECT 1 FROM km_bal_hold").get(), "🔴 #2 κράτηση που έμεινε ανοιχτή >15′ (κομμένο Worker) → το ωριαίο cron την ΕΠΙΣΤΡΕΦΕΙ");
  ok(wk.includes('ctx.waitUntil(import("./km_bal.js").then((m) => m.balHoldSweep(env))'), "#2 ωριαίο cron κρατήσεων");
  ai = { lines: 2 }; const l2 = left(Am);
  globalThis.__noAmounts = true;
  const sv = globalThis.fetch; globalThis.fetch = async (u, o) => { if (/anthropic/.test(String(u)) && !JSON.parse(o.body).tools && JSON.parse(o.body).max_tokens !== 300) return new Response(JSON.stringify({ usage: aiUsage, content: [{ type: "text", text: JSON.stringify({ net: null, total: null, lines: [{ desc: "Κάτι" }, { desc: "Άλλο" }] }) }] })); return sv(u, o); };
  x = await api("POST", "/api/km/pro/read", Am, PAGE); globalThis.fetch = sv; ai = { lines: 3 };
  ok(x.j.ok && x.j.lines.length === 2 && left(Am) === l2 && x.j.charged_eur === 0, "🔴 #4 γραμμές ΧΩΡΙΣ κανένα ποσό → δεν χρεώνεται"); }
ok(await I.iapProducts !== undefined && (await B.iapToken({ KM_ADMIN_KEY: "a" }, A1.f)) === (await B.iapToken({ KM_ADMIN_KEY: "b" }, A1.f)), "#6 η ταυτότητα αγορών ΔΕΝ αλλάζει με το κλειδί admin (αγορές σε εξέλιξη δεν γίνονται «ξένες»)");
ok(km.includes("if (proMode && gate.max && micro >= gate.max) {") && pro.includes("return { mode: \"balance\", folder, month, hold: d.op_id, max };"), "#5 Κώστας στη δοκιμή: καμία νέα κλήση πάνω από την κράτηση");

// ═══ 4 · ΔΟΚΙΜΗ PRO 14 ΗΜΕΡΩΝ = ΣΥΝΔΡΟΜΗ PADDLE ΜΕ ΔΟΚΙΜΗ (κάρτα, απόφαση 18/10 16:19) ═══
let evn = 0;
const hook = async (type, data) => {
  const ev = { event_id: "evt_v201" + String(++evn).padStart(6, "0"), event_type: type, occurred_at: new Date(Date.now() + evn * 1000).toISOString(), data };
  const raw = JSON.stringify(ev), ts = String(Math.floor(Date.now() / 1000));
  const sig = "ts=" + ts + ";h1=" + createHmac("sha256", "pdl_sec").update(ts + ":" + raw).digest("hex");
  return api("POST", "/api/km/pro/paddle/webhook", null, raw, { "Paddle-Signature": sig });
};
const trialSub = (id, email, status) => ({ id, status: status || "trialing", customer_id: "ctm_01" + id.slice(-6), custom_data: { km_email: email },
  current_billing_period: { starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + 14 * 864e5).toISOString() }, scheduled_change: null, items: [{ price: { id: "pri_01pro" } }] });
const A5 = account("trial@example.com");
r = await api("GET", "/api/km/pro/trial", A5);
ok(r.j.trial.used === false && r.j.trial.active === false && r.j.trial.days === 14, "δοκιμή: δεν έχει χρησιμοποιηθεί · 14 ημέρες");
r = await api("POST", "/api/km/pro/trial", A5, { start: true });
ok(r.st === 404, "🔴 ΚΑΜΙΑ δοκιμή χωρίς κάρτα από την εφαρμογή (ξεκινά μόνο στο web, με συνδρομή Paddle)");
envX = { PADDLE_CLIENT_TOKEN: "test_abc", PADDLE_PRICE_ID: "pri_01pro", PADDLE_PRICE_NOTRIAL_ID: "pri_01nt", PADDLE_TOPUP_PRICE_ID: "pri_01topup" };
r = await api("GET", "/api/km/pro/checkout-config?email=trial@example.com", null);
ok(r.j.ready && r.j.trial === true && r.j.price === "pri_01pro" && r.j.trial_days === 14 && r.j.topup === "pri_01topup", "σελίδα PRO: νέο email → τιμή ΜΕ δοκιμή + προπληρωμή στο ίδιο checkout");
ok(r.j.bal === "none" && r.j.topup_required === true && !/\d+[.,]\d+/.test(JSON.stringify({ b: r.j.bal })), "🔴 μηδέν υπόλοιπο → προπληρωμή ΥΠΟΧΡΕΩΤΙΚΗ στη σελίδα (απόφαση 18/10 16:30) · ΕΠΙΠΕΔΟ, όχι ποσό");
r = await api("GET", "/api/km/pro/checkout-config?email=nobody-yet@example.com", null);
ok(r.j.topup_required === true, "νέος πελάτης (χωρίς λογαριασμό) → επίσης υποχρεωτική προπληρωμή");
{ const Al = account("low@example.com"); await credit(Al, 0.3);
  r = await api("GET", "/api/km/pro/checkout-config?email=low@example.com", null);
  ok(r.j.bal === "low" && r.j.topup_required === false && JSON.stringify(r.j).indexOf("0.3") < 0, "χαμηλό υπόλοιπο (< 50 τιμολόγια PRO) → «low» — το ποσό ΔΕΝ φεύγει ποτέ από τον server");
  await credit(Al, 5);
  r = await api("GET", "/api/km/pro/checkout-config?email=low@example.com", null);
  ok(r.j.bal === "ok" && r.j.topup_required === false, "αρκετό υπόλοιπο → «ok», η προπληρωμή προαιρετική"); }
envX = { PADDLE_CLIENT_TOKEN: "test_abc", PADDLE_PRICE_ID: "pri_01pro", PADDLE_PRICE_NOTRIAL_ID: "pri_01nt" };
r = await api("GET", "/api/km/pro/checkout-config?email=nobody-yet@example.com", null);
ok(r.j.ready === false && r.j.reason === "topup_unavailable", "🔴 μηδέν υπόλοιπο και χωρίς προϊόν προπληρωμής → η σελίδα ΔΕΝ ανοίγει (δοκιμή όπου τίποτα δεν διαβάζει)");
envX = { PADDLE_CLIENT_TOKEN: "test_abc", PADDLE_PRICE_ID: "pri_01pro", PADDLE_PRICE_NOTRIAL_ID: "pri_01nt", PADDLE_TOPUP_PRICE_ID: "pri_01topup" };
{ const pg = readFileSync("site/pro/index.html", "utf8");
  ok(pg.includes("if (c.topup_required) { tb.checked = true; tb.disabled = true;") && !/bal_eur|left_eur/.test(pg), "σελίδα PRO: με μηδέν υπόλοιπο το κουτάκι κλειδώνει τσεκαρισμένο · κανένα ποσό στη σελίδα"); }
r = await hook("subscription.created", trialSub("sub_01trial01", "trial@example.com"));
const tr = db.prepare("SELECT * FROM km_pro WHERE folder_id = ?").get(A5.f);
ok(r.j.outcome === "applied" && tr.status === "active" && tr.source === "mor", "κάρτα στη σελίδα → «trialing» → PRO ενεργό (πρόσβαση, χωρίς χρέωση)");
ok(db.prepare("SELECT folder_id FROM km_pro_trial").get().folder_id === A5.f && !db.prepare("SELECT email_h FROM km_pro_trial").get().email_h.includes("trial@"), "η δοκιμή γράφεται ανά email (hash, όχι email)");
r = await api("GET", "/api/km/pro/trial", A5);
ok(r.j.trial.active === true && r.j.trial.used === true && r.j.trial.until, "κατάσταση: δοκιμή σε εξέλιξη, ως πότε");
r = await api("GET", "/api/km/pro/checkout-config?email=TRIAL@example.com", null);
ok(r.j.ready && r.j.trial === false && r.j.price === "pri_01nt", "🔴 ίδιο email ξανά → τιμή ΧΩΡΙΣ δοκιμή (μία δοκιμή ανά email)");
envX = { PADDLE_CLIENT_TOKEN: "test_abc", PADDLE_PRICE_ID: "pri_01pro" };
r = await api("GET", "/api/km/pro/checkout-config?email=trial@example.com", null);
ok(r.j.ready === false && r.j.reason === "trial_used", "🔴 χωρίς τιμή «χωρίς δοκιμή» → η σελίδα ΔΕΝ ανοίγει δεύτερη δοκιμή");
envX = {};
r = await api("POST", "/api/km/pro/read", A5, PAGE);
ok(r.st === 402 && r.j.error === "no_balance", "δοκιμή χωρίς υπόλοιπο: η ανάγνωση ζητά υπόλοιπο (402)");
await credit(A5, 2);
r = await api("POST", "/api/km/pro/read", A5, PAGE);
ok(r.j.ok && left(A5) === 2e6 - C.rate_pro, "δοκιμή: η ανάγνωση PRO χρεώνεται από το υπόλοιπο (απόφαση 18/10)");
r = await hook("subscription.canceled", Object.assign(trialSub("sub_01trial01", "trial@example.com", "canceled"), { current_billing_period: null }));
ok(db.prepare("SELECT status FROM km_pro WHERE folder_id = ?").get(A5.f).status === "cancelled", "ακύρωση πριν τη λήξη της δοκιμής → PRO κλείνει, καμία χρέωση συνδρομής");
const A5b = account("trial-b@example.com");
r = await hook("subscription.created", trialSub("sub_01trial02", "trial-b@example.com"));
r = await hook("subscription.updated", trialSub("sub_01trial02", "trial-b@example.com", "active"));
ok(db.prepare("SELECT COUNT(*) AS n FROM km_pro_trial").get().n === 2, "η δοκιμή που έγινε συνδρομή μένει καταγεγραμμένη (δεν ξαναδίνεται)");
// checkout «δοκιμή + προπληρωμή»: η συνδρομή χρεώνεται 0 σήμερα, η προπληρωμή 11,90
envX = { PADDLE_TOPUP_PRICE_ID: "pri_01topup" };
const mixed = (id, subTot) => ({ id, status: "completed", customer_id: "ctm_01mix", custom_data: { km_email: "trial-b@example.com" },
  items: [{ price: { id: "pri_01pro" }, quantity: 1 }, { price: { id: "pri_01topup" }, quantity: 1 }],
  details: { line_items: [{ price_id: "pri_01pro", totals: { total: String(subTot) } }, { price_id: "pri_01topup", totals: { total: "1190" } }],
    totals: { total: String(1190 + subTot), tax: String(190 + Math.round(subTot * 0.19 / 1.19)), fee: String(110 + Math.round(subTot * 0.06)), currency_code: "EUR" },
    payout_totals: { total: String(1190 + subTot), tax: String(190 + Math.round(subTot * 0.19 / 1.19)), fee: String(110 + Math.round(subTot * 0.06)), currency_code: "EUR" } } });
r = await hook("transaction.completed", mixed("txn_01mixmixmixmixmixmixmixmix", 0));
ok(left(A5b) === 8.9e6, "🔴 δοκιμή + προπληρωμή στο ίδιο checkout → στο υπόλοιπο ΜΟΝΟ η προπληρωμή (8,90 €)");
const lb = left(A5b);
r = await hook("transaction.completed", mixed("txn_01mixpaidpaidpaidpaidpaid", 7021));
const allT = 1190 + 7021, netAll = (allT - (190 + Math.round(7021 * 0.19 / 1.19)) - (110 + Math.round(7021 * 0.06))) * 10000;
ok(left(A5b) - lb === Math.round(netAll * 1190 / allT), "συνδρομή πληρωμένη + προπληρωμή μαζί → στο υπόλοιπο μόνο το μερίδιο της προπληρωμής");
envX = {};

// ═══ 5 · Π4 · ΚΩΣΤΑΣ: μόνο PRO · δοκιμή → υπόλοιπο · συνδρομή → ταβάνι ═══
const chat = (A, text, extraEnv) => { const sv = envX; envX = Object.assign({}, envX, extraEnv || {}); const p = api("POST", "/api/km/agent/chat", A, { install_id: "km_dev1", text, consent: true }); return p.finally(() => { envX = sv; }); };
aiCalls = 0;
r = await chat(null, "γεια");
ok(r.st === 403 && r.j.error === "pro_only" && aiCalls === 0, "🔴 Free χωρίς λογαριασμό: 403 pro_only, καμία κλήση (ο βοηθός εγκατάστασης έκλεισε)");
const A8 = account("free@example.com");
r = await chat(A8, "γεια");
ok(r.st === 403 && r.j.error === "pro_only" && aiCalls === 0, "🔴 λογαριασμός Free με ταυτότητα: 403 pro_only");
r = await chat(null, "γεια", { FREE_AGENT: "1" });
ok(r.st === 200 && aiCalls === 1, "FREE_AGENT=1 ξανανοίγει τον βοηθό του Free χωρίς νέα έκδοση (αναστρέψιμο)");
const A9 = account("trialk@example.com"); await credit(A9, 1); await hook("subscription.created", trialSub("sub_01trialk9", "trialk@example.com"));
const before9 = left(A9); aiUsage = { input_tokens: 1000, output_tokens: 500 };
r = await chat(A9, "πώς προσθέτω υπάλληλο;");
const usd9 = 1000 * 2 + 500 * 10, eur9 = Math.ceil(usd9 * 0.864 * 1.15 - 1e-9);
ok(r.st === 200 && r.j.reply && before9 - left(A9) === eur9, "🔴 δοκιμή: το μήνυμα χρεώνεται ΜΟΝΟ το πραγματικό κόστος + 15 % (" + eur9 + " μικρο-€), η κράτηση επιστρέφει");
ok(db.prepare("SELECT paid_by, turns FROM km_pro_agent WHERE folder_id = ?").get(A9.f).paid_by === "balance", "Κώστας PRO: καταγραφή ανά λογαριασμό/μήνα (πληρώνει: υπόλοιπο)");
ok(db.prepare("SELECT us_eur_micro FROM km_pro_agent WHERE folder_id = ?").get(A9.f).us_eur_micro === 0, "🔴 #7 ό,τι πλήρωσε ο ίδιος στη δοκιμή ΔΕΝ μετράει στο ταβάνι των 3 € της συνδρομής");
const A10 = account("trialpoor@example.com"); await credit(A10, 0.01); await hook("subscription.created", trialSub("sub_01trialp0", "trialpoor@example.com"));
aiCalls = 0; r = await chat(A10, "γεια");
ok(r.st === 402 && r.j.error === "no_balance" && aiCalls === 0, "δοκιμή χωρίς αρκετό υπόλοιπο για ένα μήνυμα → 402, καμία κλήση");
const A11 = account("subk@example.com"); await hook("subscription.created", trialSub("sub_01subk11", "subk@example.com", "active"));
r = await chat(A11, "γεια");
const e11 = db.prepare("SELECT eur_micro, paid_by FROM km_pro_agent WHERE folder_id = ?").get(A11.f);
ok(r.st === 200 && e11.paid_by === "us" && e11.eur_micro === Math.round(usd9 * 0.864) && left(A11) === 0, "συνδρομή: πληρώνουμε εμείς (κόστος, χωρίς περιθώριο) — το υπόλοιπο ΔΕΝ αγγίζεται");
db.prepare("UPDATE km_pro_agent SET us_eur_micro = 3000000 WHERE folder_id = ?").run(A11.f);
aiCalls = 0; r = await chat(A11, "και κάτι ακόμα");
ok(r.st === 429 && r.j.error === "agent_cap" && aiCalls === 0, "🔴 συνδρομή: ταβάνι 3 €/μήνα (PRO_AGENT_MONTHLY_EUR) → agent_cap");
r = await chat(A11, "γεια", { PRO_AGENT_MONTHLY_EUR: "" });
ok(r.st === 503 && r.j.error === "agent_unset", "χωρίς ρύθμιση ταβανιού → ο Κώστας PRO ΔΕΝ απαντά (ποτέ χωρίς ταβάνι)");
r = await api("POST", "/api/km/agent/reopen", null, { install_id: "km_dev1" });
ok(r.st === 403 && r.j.error === "pro_only", "άδειες επανανοίγματος (Free) → pro_only");
ok((await K.kmAgentFollowups(ENV())).skipped === "pro_only", "email «ραντεβού» του Free βοηθού δεν φεύγουν πια");

// ═══ 6 · PRO.mini: σύνολα μετά τα 20 δώρα, από το υπόλοιπο ═══
const A12 = account("mini@example.com");
db.prepare("INSERT INTO km_read_gift (folder_id, activated_at, consent, used) VALUES (?, ?, 'v113-el', 20)").run(A12.f, new Date().toISOString());
aiCalls = 0; r = await api("POST", "/api/km/read", A12, PAGE);
ok(r.st === 403 && r.j.error === "gift_done" && r.j.no_balance === true && aiCalls === 0, "20 δώρα + 0 υπόλοιπο → gift_done + no_balance (οι παλιές εκδόσεις σταματούν ήσυχα)");
await credit(A12, 1);
r = await api("POST", "/api/km/read", A12, PAGE);
ok(r.j.ok && r.j.paid === "balance" && r.j.total === 11.9 && left(A12) === 1e6 - C.rate_mini && r.j.bal.reads_mini >= 1, "🔴 PRO.mini: ανάγνωση συνόλων χρεώνεται την κλειδωμένη τιμή PRO.mini");
ai = { nothing: true }; r = await api("POST", "/api/km/read", A12, PAGE); ai = { lines: 3 };
ok(r.j.ok && r.j.counted === false && left(A12) === 1e6 - C.rate_mini, "🔴 PRO.mini: χωρίς ποσά → δεν χρεώνεται");
ai = { fail: true }; r = await api("POST", "/api/km/read", A12, PAGE); ai = { lines: 3 };
ok(r.j.error === "provider" && left(A12) === 1e6 - C.rate_mini, "PRO.mini: αποτυχία παρόχου → τα χρήματα γυρίζουν");
const A13 = account("gift@example.com");
db.prepare("INSERT INTO km_read_gift (folder_id, activated_at, consent, used) VALUES (?, ?, 'v113-el', 5)").run(A13.f, new Date().toISOString());
await credit(A13, 1);
r = await api("POST", "/api/km/read", A13, PAGE);
ok(r.j.paid === "gift" && left(A13) === 1e6 && r.j.used === 6, "πρώτα το δώρο (20), μετά το υπόλοιπο");
r = await api("POST", "/api/km/read", account("noconsent@example.com"), PAGE);
ok(r.st === 403 && r.j.error === "not_activated", "χωρίς συγκατάθεση (ενεργοποίηση) → καμία ανάγνωση, ούτε με υπόλοιπο");

// ═══ 7 · Π2 · APPLE ═══
const A14 = account("apple@example.com");
const tok14 = (await api("GET", "/api/km/bal", A14)).j.iap.token;
const atx = (id, o) => { apple[id] = Object.assign({ transactionId: id, bundleId: "tech.fastwrite.kostometro", productId: "km_mini_10", type: "Consumable",
  price: 10000, currency: "EUR", storefront: "CYP", appAccountToken: tok14, environment: "Production", quantity: 1 }, o || {}); };
atx("2000000001");
r = await api("POST", "/api/km/bal/store", A14, { store: "apple", transaction_id: "2000000001" });
const net14 = Math.round(10000 * 1000 / 1.19 * 0.85);
ok(r.j.ok && r.j.finish === true && left(A14) === net14 && r.j.credited_eur === Math.round(net14 / 1e4) / 100, "🔴 Apple Κύπρος 10 €: στο υπόλοιπο ό,τι εισπράττουμε = 10 / 1,19 × 0,85 = " + net14 / 1e6 + " €");
ok(hits.some((u) => /api\.storekit\.itunes\.apple\.com\/inApps\/v1\/transactions\/2000000001/.test(u)), "ο server ρωτά ΤΗΝ APPLE (Get Transaction Info), όχι τη συσκευή");
r = await api("POST", "/api/km/bal/store", A14, { store: "apple", transaction_id: "2000000001" });
ok(r.j.ok && r.j.dup === true && left(A14) === net14, "🔴 η ίδια αγορά δεύτερη φορά → πιστώνεται ΜΙΑ φορά (και η εφαρμογή την κλείνει)");
atx("2000000002", { storefront: "GRC" });
r = await api("POST", "/api/km/bal/store", A14, { store: "apple", transaction_id: "2000000002" });
ok(left(A14) === net14 + Math.round(10000 * 1000 / 1.24 * 0.85), "Apple Ελλάδα: ΦΠΑ 24 % (τα τιμολόγια ανά χώρα, Brief §3)");
atx("2000000003", { appAccountToken: "11111111-1111-4111-8111-111111111111" });
r = await api("POST", "/api/km/bal/store", A14, { store: "apple", transaction_id: "2000000003" });
ok(r.st === 403 && r.j.error === "not_yours", "🔴 αγορά άλλου λογαριασμού → not_yours, καμία πίστωση");
atx("2000000004", { environment: "Sandbox" });
r = await api("POST", "/api/km/bal/store", A14, { store: "apple", transaction_id: "2000000004" });
ok(r.st === 403 && r.j.error === "sandbox", "🔴 δοκιμαστική (Sandbox) αγορά στην παραγωγή → καμία πίστωση");
envX = { KM_IAP_SANDBOX_EMAILS: "apple@example.com" };
r = await api("POST", "/api/km/bal/store", A14, { store: "apple", transaction_id: "2000000004" });
envX = {};
ok(r.j.ok && db.prepare("SELECT env FROM km_bal_lot WHERE ext_id = 'apple:2000000004'").get().env === "sandbox", "Sandbox μόνο για τον λογαριασμό ελέγχου (KM_IAP_SANDBOX_EMAILS) ή στο staging · σημειώνεται sandbox");
atx("2000000005", { currency: "USD", price: 9990, storefront: "USA" });
const l5 = left(A14);
r = await api("POST", "/api/km/bal/store", A14, { store: "apple", transaction_id: "2000000005" });
ok(r.j.ok && r.j.status === "review" && left(A14) === l5 && db.prepare("SELECT status, note FROM km_bal_lot WHERE ext_id = 'apple:2000000005'").get().status === "review", "νόμισμα εκτός ευρώ → αγορά «υπό έλεγχο» (καμία μαντεψιά), η εφαρμογή την κλείνει");
const rv = db.prepare("SELECT lot_id FROM km_bal_lot WHERE ext_id = 'apple:2000000005'").get().lot_id;
r = await api("POST", "/api/km/admin/bal/review", null, { lot_id: rv, net_eur: 6.5 }, { "X-Km-Admin": "adm" });
ok(r.j.ok && left(A14) === l5 + 6.5e6, "ο Stavros ορίζει το καθαρό της αγοράς «υπό έλεγχο» → μπαίνει στο υπόλοιπο");
atx("2000000006", { revocationDate: 1760000000000 });
r = await api("POST", "/api/km/bal/store", A14, { store: "apple", transaction_id: "2000000006" });
ok(r.st === 409 && r.j.error === "revoked", "ανακληθείσα αγορά → καμία πίστωση");
r = await api("POST", "/api/km/bal/store", A14, { store: "apple", transaction_id: "2999999999" });
ok(r.st === 404, "άγνωστη συναλλαγή (ούτε production ούτε sandbox) → 404");
envX = { KM_APPLE_FEE_PCT: "" }; atx("2000000007");
r = await api("POST", "/api/km/bal/store", A14, { store: "apple", transaction_id: "2000000007" });
envX = {};
ok(r.st === 503 && r.j.retry === true && !r.j.finish && !db.prepare("SELECT 1 FROM km_bal_lot WHERE ext_id = 'apple:2000000007'").get(), "🔴 λείπει ρύθμιση → 503, η εφαρμογή ΔΕΝ κλείνει την αγορά (θα την ξαναστείλει) — χρήματα δεν χάνονται");
r = await api("POST", "/api/km/bal/store", A14, { store: "apple", transaction_id: "2000000007" });
ok(r.j.ok, "…και με τη ρύθμιση στη θέση της, η ίδια αγορά πιστώνεται");
// επιστροφή χρημάτων Apple (ειδοποίηση V2 → ρωτάμε ξανά την Apple)
const l7 = left(A14);
r = await api("POST", "/api/km/bal/apple/notify", null, { signedPayload: jws({ notificationType: "REFUND", data: { signedTransactionInfo: jws({ transactionId: "2000000007" }) } }) });
ok(r.j.ok && r.j.applied === false && left(A14) === l7, "🔴 πλαστή ειδοποίηση REFUND (η Apple λέει «δεν ανακλήθηκε») → τίποτα");
apple["2000000007"].revocationDate = Date.now();
r = await api("POST", "/api/km/bal/apple/notify", null, { signedPayload: jws({ notificationType: "REFUND", data: { signedTransactionInfo: jws({ transactionId: "2000000007" }) } }) });
ok(r.j.applied === true && left(A14) === l7 - net14, "επιστροφή χρημάτων Apple → αφαιρείται ό,τι είχε πιστωθεί");
r = await api("POST", "/api/km/bal/apple/notify", null, { signedPayload: jws({ notificationType: "REFUND", data: { signedTransactionInfo: jws({ transactionId: "2000000007" }) } }) });
ok(left(A14) === l7 - net14, "🔴 ίδια ειδοποίηση δεύτερη φορά → αφαιρείται ΜΙΑ φορά");
r = await api("POST", "/api/km/bal/apple/notify", null, { signedPayload: jws({ notificationType: "CONSUMPTION_REQUEST" }) });
ok(r.j.ok && r.j.ignored === "CONSUMPTION_REQUEST", "άλλα είδη ειδοποίησης → 200, αγνοούνται");

// ═══ 8 · Π2 · GOOGLE ═══
const A15 = account("google@example.com");
const tok15 = (await api("GET", "/api/km/bal", A15)).j.iap.token;
const gp = (t, o, ord) => { google.purchases[t] = Object.assign({ purchaseState: 0, consumptionState: 0, orderId: "GPA.1111-" + t.slice(-4), obfuscatedExternalAccountId: tok15, regionCode: "CY", purchaseType: undefined }, o || {});
  google.orders[google.purchases[t].orderId] = ord || { total: { currencyCode: "EUR", units: "10", nanos: 0 }, tax: { currencyCode: "EUR", units: "1", nanos: 600000000 }, buyerAddress: { buyerCountry: "CY" } }; };
gp("tok_google_0001");
r = await api("POST", "/api/km/bal/store", A15, { store: "google", product_id: "km_mini_10", purchase_token: "tok_google_0001" });
const net15 = Math.round((10 - 1.6) * 1e6 * 0.85);
ok(r.j.ok && left(A15) === net15 && google.consumed.includes("tok_google_0001"), "🔴 Google: (σύνολο − φόρος) × 0,85 από την ΠΑΡΑΓΓΕΛΙΑ της Google · η αγορά «καταναλώνεται»");
r = await api("POST", "/api/km/bal/store", A15, { store: "google", product_id: "km_mini_10", purchase_token: "tok_google_0001" });
ok(r.j.dup === true && left(A15) === net15, "ίδια αγορά Google δεύτερη φορά → μία πίστωση");
gp("tok_google_0002", { purchaseState: 2 });
r = await api("POST", "/api/km/bal/store", A15, { store: "google", product_id: "km_mini_10", purchase_token: "tok_google_0002" });
ok(r.st === 409 && r.j.error === "pending" && r.j.retry, "🔴 πληρωμή σε εκκρεμότητα → καμία πίστωση, η εφαρμογή ξαναρωτά");
gp("tok_google_0003", { obfuscatedExternalAccountId: "other" });
r = await api("POST", "/api/km/bal/store", A15, { store: "google", product_id: "km_mini_10", purchase_token: "tok_google_0003" });
ok(r.st === 403 && r.j.error === "not_yours", "Google: αγορά άλλου λογαριασμού → not_yours");
gp("tok_google_0004", { purchaseType: 0 });
r = await api("POST", "/api/km/bal/store", A15, { store: "google", product_id: "km_mini_10", purchase_token: "tok_google_0004" });
ok(r.st === 403 && r.j.error === "sandbox", "Google: αγορά δοκιμαστή (license tester) στην παραγωγή → καμία πίστωση");
gp("tok_google_0005"); google.ordersDown = true;
r = await api("POST", "/api/km/bal/store", A15, { store: "google", product_id: "km_mini_10", purchase_token: "tok_google_0005" });
google.ordersDown = false;
ok(r.st === 503 && r.j.retry && !google.consumed.includes("tok_google_0005"), "🔴 η παραγγελία δεν διαβάζεται → 503, ΧΩΡΙΣ πίστωση και ΧΩΡΙΣ κατανάλωση (ξαναδοκιμάζει)");
r = await api("POST", "/api/km/bal/store", A15, { store: "google", product_id: "km_other", purchase_token: "tok_google_0005" });
ok(r.st === 400, "άγνωστο προϊόν → 400");
// ακυρωμένες αγορές Google (ωριαίο)
google.voided = [{ purchaseToken: "tok_google_0001", orderId: "GPA.1111-0001", voidedTimeMillis: String(Date.now()) }];
const vs = await I.googleVoidedSweep(ENV());
ok(vs.refunded === 1 && left(A15) === 0, "ακυρωμένη αγορά Google (Voided Purchases API) → αφαιρείται");
ok((await I.googleVoidedSweep(ENV())).refunded === 0 && left(A15) === 0, "δεύτερος γύρος → τίποτα δεύτερη φορά");

// ═══ 9 · Π3 · PADDLE ΠΡΟΠΛΗΡΩΜΗ ═══
envX = { PADDLE_TOPUP_PRICE_ID: "pri_01topup" };
const txn = (id, email, o) => Object.assign({ id, status: "completed", customer_id: "ctm_01pt", custom_data: email ? { km_email: email } : null, items: [{ price: { id: "pri_01topup" }, quantity: 1 }],
  details: { totals: { subtotal: "1000", tax: "190", total: "1190", fee: "110", earnings: "890", currency_code: "EUR" },
             payout_totals: { subtotal: "1000", tax: "190", total: "1190", fee: "110", earnings: "890", currency_code: "EUR", exchange_rate: "1.0" } } }, o || {});
const A16 = account("web@example.com");
r = await hook("transaction.completed", txn("txn_01aaaaaaaaaaaaaaaaaaaaaaaa", "web@example.com"));
ok(r.j.outcome === "credited" && left(A16) === (1190 - 190 - 110) * 10000, "🔴 προπληρωμή web: στο υπόλοιπο σύνολο − φόρος − προμήθεια Paddle = 8,90 €");
r = await hook("transaction.completed", txn("txn_01aaaaaaaaaaaaaaaaaaaaaaaa", "web@example.com"));
ok(left(A16) === 8.9e6, "ίδια συναλλαγή σε νέο γεγονός → μία πίστωση");
r = await hook("transaction.completed", txn("txn_01bbbbbbbbbbbbbbbbbbbbbbbb", "web@example.com", { items: [{ price: { id: "pri_01pro" }, quantity: 1 }] }));
ok(r.j.outcome === "ignored" && left(A16) === 8.9e6, "🔴 πληρωμή συνδρομής ΔΕΝ γίνεται υπόλοιπο");
r = await hook("transaction.completed", txn("txn_01cccccccccccccccccccccccc", "later@example.com"));
ok(r.j.outcome === "pending_topup", "πληρωμή web πριν υπάρξει λογαριασμός → «σε αναμονή»");
const A17 = account("later@example.com");
r = await api("GET", "/api/km/bal", A17);
ok(r.j.left_eur === 8.9, "εγγραφή με το ίδιο email → η προπληρωμή δένεται στον λογαριασμό");
r = await hook("adjustment.updated", { id: "adj_01aaaaaaaaaaaaaaaaaaaaaaaa", action: "refund", status: "approved", type: "partial", transaction_id: "txn_01aaaaaaaaaaaaaaaaaaaaaaaa", totals: { total: "595" } });
ok(r.j.outcome === "refunded" && left(A16) === 8.9e6 - 4.45e6, "μερική επιστροφή Paddle (μισό) → αφαιρείται το μισό");
r = await hook("adjustment.updated", { id: "adj_01aaaaaaaaaaaaaaaaaaaaaaaa", action: "refund", status: "approved", type: "partial", transaction_id: "txn_01aaaaaaaaaaaaaaaaaaaaaaaa", totals: { total: "595" } });
ok(left(A16) === 4.45e6, "ίδια επιστροφή (ίδιο adjustment) δεύτερη φορά → τίποτα");
r = await hook("adjustment.updated", { id: "adj_01bbbbbbbbbbbbbbbbbbbbbbbb", action: "refund", status: "approved", type: "partial", transaction_id: "txn_01aaaaaaaaaaaaaaaaaaaaaaaa", totals: { total: "595" } });
ok(left(A16) === 0, "🔴 #8 δεύτερη μερική επιστροφή (το άλλο μισό) → αφαιρείται το ΑΛΛΟ μισό, όχι το μισό του μισού");
r = await hook("adjustment.updated", { id: "adj_01cccccccccccccccccccccccc", action: "refund", status: "approved", type: "full", transaction_id: "txn_01ffffffffffffffffffffffff", totals: { total: "1190" } });
ok(r.j.outcome === "refund_waiting", "#9 επιστροφή που ήρθε ΠΡΙΝ από την πίστωση → κρατιέται");
const A16b = account("early@example.com");
r = await hook("transaction.completed", txn("txn_01ffffffffffffffffffffffff", "early@example.com"));
ok(r.j.outcome === "credited" && left(A16b) === 0 && db.prepare("SELECT status FROM km_bal_lot WHERE ext_id = 'paddle:txn_01ffffffffffffffffffffffff'").get().status === "refunded", "🔴 #9 …και εφαρμόζεται τη στιγμή της πίστωσης (χρήματα που επιστράφηκαν δεν μένουν στο υπόλοιπο)");
r = await hook("transaction.completed", txn("txn_01dddddddddddddddddddddddd", null, { customer_id: "ctm_01noemail", details: { totals: { subtotal: "1000", tax: "0", total: "1000", fee: "100", currency_code: "USD" }, payout_totals: null } }));
ok(r.j.outcome === "pending_topup" && db.prepare("SELECT status FROM km_bal_lot WHERE ext_id = 'paddle:txn_01dddddddddddddddddddddddd'").get().status === "review", "χωρίς ευρώ από την Paddle → «υπό έλεγχο» · χωρίς email → αναμονή");
const A18 = account("noemail@example.com");
await hook("customer.created", { id: "ctm_01noemail", email: "noemail@example.com" });
ok(db.prepare("SELECT folder_id FROM km_bal_lot WHERE ext_id = 'paddle:txn_01dddddddddddddddddddddddd'").get().folder_id === A18.f, "το email έρχεται με το customer.created → η προπληρωμή δένεται");
envX = { PADDLE_TOPUP_PRICE_ID: "pri_01topup", KM_FX_USD_EUR: "" };
r = await hook("transaction.completed", txn("txn_01eeeeeeeeeeeeeeeeeeeeeeee", "web@example.com"));
ok(r.st === 500 && !db.prepare("SELECT 1 FROM km_bal_lot WHERE ext_id = 'paddle:txn_01eeeeeeeeeeeeeeeeeeeeeeee'").get(), "🔴 χωρίς ρύθμιση τιμών → 500 (η Paddle ξαναστέλνει 3 ημέρες), ποτέ «χαμένη» πληρωμή");
envX = {};
r = await api("GET", "/api/km/pro/checkout-config", null);
envX = { PADDLE_CLIENT_TOKEN: "test_abc", PADDLE_PRICE_ID: "pri_01pro", PADDLE_TOPUP_PRICE_ID: "pri_01topup" };
r = await api("GET", "/api/km/pro/checkout-config", null);
envX = {};
ok(r.j.ready && r.j.topup === "pri_01topup", "σελίδα αγοράς: δημόσιο price id της προπληρωμής");

// ═══ 10 · ΔΙΑΓΡΑΦΗ ΛΟΓΑΡΙΑΣΜΟΥ ═══
await B.balWipe({ DB }, A16.f);
const w = db.prepare("SELECT folder_id, email, left_micro, status FROM km_bal_lot WHERE ext_id = 'paddle:txn_01aaaaaaaaaaaaaaaaaaaaaaaa'").get();
ok(w && w.folder_id === null && w.email === null && w.left_micro === 0 && !db.prepare("SELECT 1 FROM km_bal WHERE folder_id = ?").get(A16.f) && !db.prepare("SELECT 1 FROM km_bal_tx WHERE folder_id = ?").get(A16.f),
   "διαγραφή: υπόλοιπο/κινήσεις φεύγουν · οι αγορές μένουν ΑΝΩΝΥΜΕΣ (φορολογικά αρχεία)");
ok(km.includes('"km_pro_quota", "km_pro_limits", "km_pro_usage", "km_pro_agent", "km_pro"]') && km.includes('try { const { balWipe } = await import("./km_bal.js"); await balWipe(env, folderId); } catch (e) {}'), "🔴 διαγραφή λογαριασμού: Κώστας PRO + υπόλοιπο φεύγουν · η δοκιμή (hash email) μένει");

// ═══ 11 · ΚΩΔΙΚΑΣ: κινητό, σχήμα, ρυθμίσεις ═══
ok(js.includes("  function needKeyScreen() { return false; }") && (js.match(/show\('s-key'\)/g) || []).length === (js.match(/if \(needKeyScreen\(\)\) \{ return show\('s-key'\); \}/g) || []).length, "🔴 Π4: κανένας νέος χρήστης δεν βλέπει την οθόνη κλειδιού");
ok(js.includes("if (el('st-editkey')) { el('st-editkey').hidden = !localStorage.getItem(LS.key); }"), "Π4: «Κλειδί Gemini» στις Ρυθμίσεις μόνο για όσους έχουν ήδη κλειδί (το κλειδί τους συνεχίζει)");
ok(js.includes("  var AG_PUBLIC = false;") && js.includes("    if (agProOn()) { return true; }   /* KM-PRO-V201 */"), "Π4: ο Κώστας μόνο στο PRO");
ok(js.includes("headers: agProOn() ? Object.assign({ 'Content-Type': 'application/json' }, kmHead())"), "🔴 ο Κώστας του PRO στέλνει ταυτότητα λογαριασμού");
ok(/KM_IAP\.buy\(ids\[0\], \{ accountToken: ip\.token \}\)/.test(js) && js.includes("el('bl-buy').hidden = !native; el('bl-nobuy').hidden = native;"), "🔴 αγορά ΜΟΝΟ μέσω του καταστήματος (γέφυρα KM_IAP) — στον browser κανένα κουμπί αγοράς");
ok(js.includes("if (j && (j.ok || j.finish === true) && window.KM_IAP && KM_IAP.finish)") && js.includes("KM_IAP.pending()"), "🔴 η αγορά κλείνει ΜΟΝΟ αφού πιστωθεί · ό,τι έμεινε ανοιχτό ξαναστέλνεται");
ok(js.includes("μεταφέρονται ως έχουν, με την τιμή του PRO: φτάνουν για ~") && js.includes("(αντί για ~"), "🔴 ΠΡΙΝ τη μετάβαση στο PRO η οθόνη λέει τι γίνεται το υπόλοιπο (απόφαση 18/10)");
ok(!/pro\/trial', \{ method: 'POST'/.test(js) && !/bl-trial-go/.test(html), "🔴 κανένα κουμπί δοκιμής/αγοράς PRO μέσα στην εφαρμογή (Apple 3.1.3γ — η δοκιμή ξεκινά στο web με κάρτα)");
{ const pg = readFileSync("site/pro/index.html", "utf8");
  ok(pg.includes("fetch('/api/km/pro/checkout-config?email=' + encodeURIComponent(v)") && pg.includes("items.push({ priceId: c.topup, quantity: 1 });"), "σελίδα PRO: τιμή ανά email (μία δοκιμή) + προπληρωμή στο ίδιο checkout"); }
ok(!/(\d+[.,]?\d*\s?€|€\s?\d)/.test(html), "🔴 Apple 3.1.1: καμία τιμή σε ευρώ στο HTML (η τιμή αγοράς έρχεται από το κατάστημα)");
ok(!/(10\s?€|€\s?10|9[.,]99)/.test(js.slice(js.indexOf("KM-PRO-V201 · ΠΡΟΠΛΗΡΩΜΕΝΟ ΥΠΟΛΟΙΠΟ"), js.indexOf("══ KM-AGENT (29/9/2026)"))), "καμία τιμή προϊόντος γραμμένη στην εφαρμογή");
ok(html.includes('id="s-bal"') && js.includes("SCREENS.push('s-bal');") && html.includes('id="m-bal-row"'), "οθόνη «💶 Υπόλοιπο» στη λίστα οθονών + Μενού");
ok(js.includes("if (err.msg === 'no_balance') {") && js.includes("proLimSet({ kind: 'balance', at: Date.now() });"), "🔴 κινητό: τέλος υπολοίπου PRO ΦΑΙΝΕΤΑΙ (κάμερα + Εκκρεμή), ποτέ σιωπηλή αποτυχία");
ok(js.includes("return !!(g && g.active && (g.left > 0 || balCanMini()) && hasAccount() && !isReader());"), "κινητό: PRO.mini — ο Κώστας συνεχίζει μετά τα 20 με υπόλοιπο");
const sch = readFileSync("schema/km_bal.sql", "utf8");
ok(/ext_id\s+TEXT NOT NULL UNIQUE/.test(sch) && /idx_km_bal_tx_folder/.test(sch) && /idx_km_bal_tx_at/.test(sch) && /idx_km_bal_lot_folder/.test(sch) && /PRIMARY KEY \(folder_id, month\)/.test(sch), "D1: μοναδική αγορά + ευρετήρια από την πρώτη έκδοση (κλίμακα)");
ok(!/"/.test(sch.replace(/--[^\n]*/g, "")), "σχήμα χωρίς διπλά εισαγωγικά (περνά από d1apply)");
const stg = wt.slice(wt.indexOf("[env.staging.vars]"), wt.indexOf("[[env.staging.d1_databases]]"));
ok(/KM_COST_MINI_USD = "0\.00243"/.test(stg) && /KM_COST_PRO_USD = "0\.0121"/.test(stg) && /KM_MARKUP_PCT = "15"/.test(stg) && /PRO_AGENT_MONTHLY_EUR = "3"/.test(stg) && /KM_IAP_SANDBOX = "1"/.test(stg), "staging: τιμές από τη μέτρηση 15/10 + 15 % + ταβάνι 3 € · δοκιμαστικές αγορές δεκτές");
ok(!/^PRO_MONTHLY_(READS|USD)\s*=/m.test(stg), "staging: ο μετρητής μήνα της v199 έφυγε");
const prodVars = wt.slice(wt.indexOf("[vars]"), wt.indexOf("[[d1_databases]]"));
ok(!/KM_COST_|KM_FX_|KM_MARKUP|KM_IAP_SANDBOX|PRO_AGENT_MONTHLY|KM_APPLE_FEE|KM_GOOGLE_FEE/.test(prodVars), "🔴 παραγωγή: καμία τιμή/ρύθμιση χρημάτων γραμμένη από τον Claude (μπαίνουν την ημέρα του PRO)");
ok(!/APPLE_IAP_PRIVATE_KEY\s*=|GOOGLE_PLAY_SA\s*=/.test(wt), "🔴 κλειδιά καταστημάτων ΠΟΤΕ στο wrangler.toml (Worker secrets)");
ok(wk.includes('ctx.waitUntil(import("./km_iap.js").then((m) => m.googleVoidedSweep(env))'), "ωριαίο cron: ακυρωμένες αγορές Google");

console.log("\n" + pass + " ✔ · " + fail + " ✘");
if (ONLY !== null) process.exit(fail ? 0 : 1);
process.exit(fail ? 1 : 0);
