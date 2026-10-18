// KM-PRO-V201-CHECK (18/10/2026) · ΑΠΟ ΑΚΡΗ ΣΕ ΑΚΡΗ ΣΤΟ STAGING — υπόλοιπο · PRO.mini · PRO · δοκιμή Paddle · Κώστας · προπληρωμή.
//   node tools/pro/v201check.mjs   (Windows, από .bat · πραγματικός Worker staging, ΠΡΑΓΜΑΤΙΚΕΣ κλήσεις Haiku/Sonnet)
// Λογαριασμοί δοκιμής γράφονται ΑΠΕΥΘΕΙΑΣ στη βάση staging (μόνο staging). Γεγονότα Paddle = ψεύτικα, υπογεγραμμένα με το
// μυστικό STAGING (secrets\paddle_staging_whsec.txt) — κανένας λογαριασμός Paddle. Αγορές καταστημάτων: χωρίς κλειδιά
// Apple/Google στο staging → αναμένεται 503 «ξαναστείλε» (ποτέ πίστωση χωρίς έλεγχο).
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { createHash, createHmac, randomBytes } from "node:crypto";
const BASE = "https://fastwrite-staging.stavrosfkallenos.workers.dev";
const ADMIN = readFileSync("C:/Users/User/fastwrite-project/secrets/km_admin_key.txt", "utf8").trim();
const WHSEC = readFileSync("secrets/paddle_staging_whsec.txt", "utf8").trim();
const OUT = "Claude outputs/pro/v201check"; mkdirSync(OUT, { recursive: true });
const IMG = "Claude outputs/pro/f5_metrisi/" + readdirSync("Claude outputs/pro/f5_metrisi/").filter((f) => f.endsWith(".jpg")).sort()[0];
const PAGE = { pages: [readFileSync(IMG).toString("base64")] };
const R = []; let pass = 0, fail = 0;
const ok = (c, m, got) => { if (c) pass++; else fail++; const l = (c ? "OK   " : "FAIL ") + m + (c ? "" : "  <<  " + String(got === undefined ? "" : typeof got === "string" ? got : JSON.stringify(got)).slice(0, 600)); R.push(l); console.log(l); };
const sha = (s) => createHash("sha256").update(s).digest("hex");
const d1 = (sql) => execSync(`npx --yes wrangler d1 execute DB --env staging --remote --yes --json --command "${sql}"`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const q1 = (sql) => { const o = d1(sql); const j = JSON.parse(o.slice(o.indexOf("["))); return (j[0] && j[0].results && j[0].results[0]) || null; };
const STAMP = Date.now().toString(36);
const mkAcc = (tag) => { const f = sha("v201-" + tag + STAMP + randomBytes(8).toString("hex")), a = randomBytes(32).toString("hex"), email = "v201-" + tag + "-" + STAMP + "@example.com";
  d1(`INSERT INTO km_accounts (folder_id, auth_hash, email, created) VALUES ('${f}', '${sha(a)}', '${email}', '${new Date().toISOString()}')`); return { f, a, email }; };
const call = async (method, path, A, body, extra) => {
  const h = Object.assign({ "Content-Type": "application/json" }, A ? { "X-Km-Folder": A.f, "X-Km-Auth": A.a, "X-Km-Device": "km_v201chk" } : {}, extra || {});
  const r = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : (typeof body === "string" ? body : JSON.stringify(body)) });
  return { st: r.status, j: await r.json().catch(() => ({})) };
};
const admin = (path, body) => call("POST", path, null, body, { "X-Km-Admin": ADMIN });
let evn = 0;
const hook = (type, data) => { const ev = { event_id: "evt_v201chk" + STAMP + (++evn), event_type: type, occurred_at: new Date(Date.now() + evn * 1000).toISOString(), data };
  const raw = JSON.stringify(ev), ts = String(Math.floor(Date.now() / 1000));
  return call("POST", "/api/km/pro/paddle/webhook", null, raw, { "Paddle-Signature": "ts=" + ts + ";h1=" + createHmac("sha256", WHSEC).update(ts + ":" + raw).digest("hex") }); };
const ver = await (await fetch(BASE + "/kostometro/version.json", { cache: "no-store" })).json().catch(() => ({}));
ok(ver.v === "v201", "staging τρέχει v201", ver);

// 1 · υπόλοιπο + PRO.mini (σύνολα, Haiku) μετά τα 20 δώρα
const A = mkAcc("mini");
let r = await call("GET", "/api/km/bal", A);
ok(r.st === 200 && r.j.left_eur === 0 && r.j.rates_now && r.j.rates_now.markup_pct === 15, "υπόλοιπο 0 · τιμές από τη ρύθμιση (+15 %)", r.j);
const rates = r.j.rates_now;
r = await admin("/api/km/admin/bal/credit", { folder_id: A.f, eur: 1, note: "v201check" });
ok(r.j.ok && Math.abs(r.j.summary.left_eur - 1) < 1e-9, "πίστωση admin 1 € (~" + r.j.summary.reads_mini + " PRO.mini · ~" + r.j.summary.reads_pro + " PRO)", r);
d1(`INSERT INTO km_read_gift (folder_id, activated_at, consent, used) VALUES ('${A.f}', '${new Date().toISOString()}', 'v113-el', 20)`);
r = await call("POST", "/api/km/read", A, PAGE);
ok(r.j.ok && r.j.paid === "balance" && r.j.total !== null && Math.abs(r.j.charged_eur - rates.mini) < 0.00006, "PRO.mini: ΠΡΑΓΜΑΤΙΚΗ ανάγνωση συνόλων, χρέωση " + r.j.charged_eur + " €", r.j);
const leftA = q1(`SELECT left_micro FROM km_bal WHERE folder_id = '${A.f}'`);
ok(leftA && leftA.left_micro === 1e6 - Math.round(rates.mini * 1e6), "βάση: −" + Math.round(rates.mini * 1e6) + " μικρο-€", leftA);

// 2 · PRO (γραμμές, Sonnet) από το υπόλοιπο
const B = mkAcc("pro");
await admin("/api/km/admin/pro/grant", { folder_id: B.f });
r = await call("POST", "/api/km/pro/read", B, PAGE);
ok(r.st === 402 && r.j.error === "no_balance", "PRO χωρίς υπόλοιπο → 402 (καμία κλήση)", r);
await admin("/api/km/admin/bal/credit", { folder_id: B.f, eur: 1, note: "v201check" });
r = await call("POST", "/api/km/pro/read", B, PAGE);
ok(r.j.ok && r.j.lines && r.j.lines.length > 0 && r.j.charged_eur > 0 && r.j.bal.reads_pro >= 1, "PRO: ΠΡΑΓΜΑΤΙΚΗ ανάγνωση γραμμών (" + (r.j.lines || []).length + "), χρέωση " + r.j.charged_eur + " €", r.j);
r = await call("GET", "/api/km/pro/status", B);
ok(r.j.pro && r.j.bal && r.j.month.blocked === null, "pro/status: υπόλοιπο, τίποτα μπλοκαρισμένο", r.j);

// 3 · Κώστας: Free → pro_only · δοκιμή Paddle (trialing) → χρέωση υπολοίπου
r = await call("POST", "/api/km/agent/chat", null, { install_id: "km_v201chk", text: "γεια", consent: true });
ok(r.st === 403 && r.j.error === "pro_only", "Free χωρίς λογαριασμό: ο Κώστας ΔΕΝ απαντά (Π4)", r);
const C = mkAcc("trial");
await admin("/api/km/admin/bal/credit", { folder_id: C.f, eur: 1, note: "v201check" });
r = await hook("subscription.created", { id: "sub_01v201chk" + STAMP, status: "trialing", customer_id: "ctm_01v201" + STAMP, custom_data: { km_email: C.email },
  current_billing_period: { starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + 14 * 864e5).toISOString() }, scheduled_change: null, items: [{ price: { id: "pri_01pro" } }] });
ok(r.j.outcome === "applied", "δοκιμή PRO (Paddle trialing, ψεύτικο υπογεγραμμένο γεγονός) → PRO", r);
r = await call("GET", "/api/km/pro/trial", C);
ok(r.j.trial && r.j.trial.active && r.j.trial.used, "δοκιμή σε εξέλιξη · καταγράφηκε ανά email", r.j);
const before = q1(`SELECT left_micro FROM km_bal WHERE folder_id = '${C.f}'`).left_micro;
r = await call("POST", "/api/km/agent/chat", C, { install_id: "km_v201chk", text: "Πώς προσθέτω έναν υπάλληλο στην ομάδα μου;", consent: true });
const after = q1(`SELECT left_micro FROM km_bal WHERE folder_id = '${C.f}'`).left_micro;
const ag = q1(`SELECT turns, usd_micro, eur_micro, paid_by FROM km_pro_agent WHERE folder_id = '${C.f}'`);
ok(r.st === 200 && r.j.reply && ag && ag.paid_by === "balance" && before - after === ag.eur_micro && ag.eur_micro >= Math.round(ag.usd_micro * 0.864 * 1.15) - 2,
   "Κώστας στη δοκιμή: χρεώθηκε " + (ag ? (ag.eur_micro / 1e6).toFixed(4) : "?") + " € = πραγματικό κόστος " + (ag ? (ag.usd_micro / 1e6).toFixed(4) : "?") + " $ × 0,864 × 1,15", { st: r.st, ag, before, after });
r = await call("GET", "/api/km/pro/checkout-config?email=" + encodeURIComponent(C.email), null);
ok(r.st === 200 && r.j.ok, "σελίδα PRO: απαντά (στο staging χωρίς Paddle → ready=false)", r.j);

// 4 · προπληρωμή web (Paddle transaction.completed, ψεύτικο υπογεγραμμένο)
const D = mkAcc("web");
r = await hook("transaction.completed", { id: "txn_01v201chk" + STAMP.padEnd(14, "0").slice(0, 14), status: "completed", customer_id: "ctm_01v201w" + STAMP, custom_data: { km_email: D.email },
  items: [{ price: { id: "pri_01stagingtopup" }, quantity: 1 }],
  details: { totals: { total: "1190", tax: "190", fee: "110", currency_code: "EUR" }, payout_totals: { total: "1190", tax: "190", fee: "110", currency_code: "EUR" } } });
const dl = q1(`SELECT left_micro FROM km_bal WHERE folder_id = '${D.f}'`);
ok(r.j.outcome === "credited" && dl && dl.left_micro === 8900000, "προπληρωμή web: 11,90 − 1,90 ΦΠΑ − 1,10 Paddle = 8,90 € στο υπόλοιπο", { r: r.j, dl });

// 5 · αγορά καταστήματος χωρίς κλειδιά στο staging → 503 «ξαναστείλε», καμία πίστωση
r = await call("POST", "/api/km/bal/store", A, { store: "apple", transaction_id: "2000000000001" });
ok(r.st === 503 && r.j.error === "not_configured" && r.j.retry === true, "Apple χωρίς κλειδί IAP: 503 retry — η εφαρμογή ΔΕΝ κλείνει την αγορά", r);

writeFileSync(OUT + "/report_" + STAMP + ".txt", R.join("\r\n") + "\r\n\r\n" + pass + " OK / " + fail + " FAIL\r\n");
console.log("\n" + pass + " OK / " + fail + " FAIL");
console.log(fail ? "V201CHECK_APETYXE" : "V201CHECK_TELOS");
process.exit(fail ? 1 : 0);
