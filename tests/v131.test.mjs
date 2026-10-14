// v131 · K3 είσοδος από την εφαρμογή καταστήματος (RFC 8252) + CORS κελύφους + KM-REVIEW λογαριασμός ελέγχου (14/10/2026)
//   node --experimental-sqlite tests/v131.test.mjs  ·  --mutate=N (ΠΡΕΠΕΙ να κοκκινίσει: exit 0 = πιάστηκε)
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { webcrypto, createHash } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let src = readFileSync("src/km.js", "utf8");
let wk = readFileSync("src/worker.js", "utf8");
const MUT = [
  ["src", "  if (ch !== row.app_ch) return json({ ok: false, error: \"mismatch\" }, 403);\n", ""],                                    // 1 · 🔴 λάθος μυστικό εφαρμογής δεκτό
  ["src", "\"DELETE FROM km_oauth_handoff WHERE h_hash = ? RETURNING *\"", "\"SELECT * FROM km_oauth_handoff WHERE h_hash = ?\""],     // 2 · 🔴 δεύτερη εξαργύρωση
  ["src", "!row || Date.parse(row.created) < Date.now() - APP_HANDOFF_TTL_MS", "!row"],                                                // 3 · 🔴 ληγμένος κωδικός δεκτός
  ["src", "return appReturnPage(APP_SCHEME + \"://oauth?h=\" + h);", "return appReturnPage(APP_SCHEME + \"://oauth?\" + frag);"],     // 4 · 🔴 token στο σχήμα
  ["src", "/^\\d{6}$/.test(c) ? c : \"\"", "(c || \"123456\")"],                                                                       // 5 · 🔴 κωδικός ελέγχου χωρίς secret
  ["src", "@fastwrite\\.tech$/;", "@fastwrite\\.tech/;"],                                                                              // 6 · 🔴 appreview@fastwrite.tech.evil δεκτό
  ["src", "if ((await sha256hex(\"r:\" + code)) !== (await sha256hex(\"r:\" + rc))) return json({ ok: false, error: \"bad_code\" }, 400);", ""], // 7 · 🔴 οποιοσδήποτε κωδικός
  ["wk", "return KM_APP_ORIGINS.includes(o) ? o : \"\";", "return o;"],                                                               // 8 · 🔴 CORS σε κάθε προέλευση
  ["wk", "    \"Access-Control-Allow-Credentials\": \"true\",\n", ""],                                                                  // 9 · χωρίς Credentials (fetch της εφαρμογής πέφτει)
  ["src", "    const old = await env.DB.prepare(\"SELECT folder_id FROM km_accounts WHERE email = ? AND deleted IS NULL\").bind(email).all();\n    for (const r of (old.results || [])) await wipeFolder(env, r.folder_id);\n", ""], // 10 · δεύτερος έλεγχος κολλάει στο «taken»
];
if (ONLY) { const m = MUT[ONLY - 1]; if (!m) process.exit(2); const bag = { src, wk };
  if (!bag[m[0]].includes(m[1])) { console.log("Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(3); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ src, wk } = bag); }
let failed = 0;
const check = async (n, f) => { try { await f(); if (!ONLY) console.log("  ✔ " + n); } catch (e) { failed++; console.log("  ✘ " + n + " — " + e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
// Ο worker εισάγει «./km.js» → αντίγραφα σε προσωρινό φάκελο (με τη μετάλλαξη αν υπάρχει).
const dir = mkdtempSync(join(tmpdir(), "v131-"));
writeFileSync(join(dir, "km.js"), src); writeFileSync(join(dir, "worker.js"), wk);
const mod = await import(pathToFileURL(join(dir, "km.js")).href);
const worker = (await import(pathToFileURL(join(dir, "worker.js")).href)).default;
const db = new DatabaseSync(":memory:");
for (const f of ["km.sql", "km_h13.sql", "km_v54.sql", "km_mail.sql", "km_feedback.sql", "km_h11b.sql", "km_ref.sql", "km_ref2.sql", "km_verify.sql", "km_support.sql", "km_support_v95.sql", "km_funnel.sql", "km_leads.sql", "km_pinakas.sql", "km_oauth.sql", "km_k3.sql"]) {
  let sql; try { sql = readFileSync("schema/" + f, "utf8"); } catch (e) { continue; }
  sql = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  for (const s of sql.split(";")) { const t = s.trim(); if (!t) continue; try { db.exec(t + ";"); } catch (e) { if (!/duplicate column|already exists/i.test(e.message)) throw e; } }
}
const stmt = (sql, args) => { const p = db.prepare(sql); return { async first() { return p.get(...args) ?? null; },
  async run() { const r = p.run(...args); return { meta: { changes: Number(r.changes) } }; }, async all() { return { results: p.all(...args) }; } }; };
const DB = { prepare: (sql) => ({ bind: (...a) => stmt(sql, a), ...stmt(sql, []) }), async batch(l) { for (const s of l) await s.run(); return []; } };
let mails = [];
const base = { DB, KM_ADMIN_KEY: "adm1n", GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsec", MS_CLIENT_ID: "mid", MS_CLIENT_SECRET: "msec",
  FOLDERS: { list: async () => ({ objects: [], truncated: false }), delete: async () => {} },
  EMAIL: { send: async (m) => { mails.push(m); return {}; } }, KM_MAIL_FROM: "noreply@notify.fastwrite.tech",
  ASSETS: { fetch: async () => new Response("asset") } };
globalThis.fetch = async (url) => { throw new Error("fetch " + url); };
const call = (env, path, init) => mod.handleKm(new Request("https://fastwrite.tech" + path, init || {}), env, null, path.split("?")[0]);
const post = (env, path, body, headers) => call(env, path, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, headers || {}), body: JSON.stringify(body) });
const b64u = (b) => Buffer.from(b).toString("base64url");
const V = b64u(webcrypto.getRandomValues(new Uint8Array(32)));            // μυστικό της εφαρμογής (43 χαρ.)
const AC = b64u(createHash("sha256").update(V).digest());                // ό,τι στέλνει στο /start
async function appStart(prov) {
  const r = await call(base, "/api/km/auth/" + (prov || "google") + "/start?app=1&ac=" + AC);
  const loc = new URL(r.headers.get("Location")); const ck = /km_oauth=([0-9a-f]{64})/.exec(r.headers.get("Set-Cookie") || "");
  return { r, state: loc.searchParams.get("state"), cookie: ck && ck[1] };
}
const hFrom = async (r) => { const t = await r.text(); const m = /tech\.fastwrite\.kostometro:\/\/oauth\?h=([0-9a-f]{64})/.exec(t); return { h: m && m[1], t }; };

// ── K3 ──
await check("K3-1 · start με app=1 → γραμμή state με app_ch · χωρίς app → app_ch NULL (ροή PWA ίδια)", async () => {
  const s = await appStart(); ok(s.r.status === 302 && s.state === s.cookie, "302/cookie");
  const row = db.prepare("SELECT app_ch FROM km_oauth_states ORDER BY created DESC LIMIT 1").get(); ok(row.app_ch === AC, "app_ch " + row.app_ch);
  const r = await call(base, "/api/km/auth/google/start"); ok(r.status === 302, "PWA 302");
  ok(db.prepare("SELECT COUNT(*) AS n FROM km_oauth_states WHERE app_ch IS NULL").get().n >= 1, "PWA app_ch");
  const bad = await call(base, "/api/km/auth/google/start?app=1&ac=short"); ok((await bad.text()).includes("oauth?err=bad_request"), "άκυρο ac");
});
await check("K3-2 · 🔴 ακύρωση στη Google → σελίδα με ΜΟΝΟ h (κανένα token/email στο σχήμα) · σωστό v → αποτέλεσμα μία φορά", async () => {
  const s = await appStart();
  const r = await call(base, "/api/km/auth/google/callback?error=access_denied&state=" + s.state, { headers: { Cookie: "km_oauth=" + s.state } });
  const { h, t } = await hFrom(r); ok(h, "h " + t.slice(0, 200));
  ok(!/km_oauth=(ok|err)|cancelled/.test(t.replace(/km_oauth=;/, "")), "αποτέλεσμα μέσα στη σελίδα");
  ok(/no-store/.test(r.headers.get("Cache-Control") || ""), "cache");
  const x = await (await post(base, "/api/km/auth/app/redeem", { h, v: V })).json();
  ok(x.ok && x.km_oauth === "err" && x.code === "cancelled", JSON.stringify(x));
  const again = await post(base, "/api/km/auth/app/redeem", { h, v: V }); ok(again.status === 410, "🔴 δεύτερη εξαργύρωση " + again.status);
});
await check("K3-3 · 🔴 λάθος v → 403 και ο κωδικός καίγεται · άκυρη μορφή → 400 · ληγμένος → 410", async () => {
  let s = await appStart();
  let { h } = await hFrom(await call(base, "/api/km/auth/google/callback?error=x&state=" + s.state, { headers: { Cookie: "km_oauth=" + s.state } }));
  const wrong = b64u(webcrypto.getRandomValues(new Uint8Array(32)));
  ok((await post(base, "/api/km/auth/app/redeem", { h, v: wrong })).status === 403, "λάθος v");
  ok((await post(base, "/api/km/auth/app/redeem", { h, v: V })).status === 410, "μετά το λάθος έμεινε ζωντανός");
  ok((await post(base, "/api/km/auth/app/redeem", { h: "zz", v: V })).status === 400, "μορφή");
  s = await appStart();
  ({ h } = await hFrom(await call(base, "/api/km/auth/google/callback?error=x&state=" + s.state, { headers: { Cookie: "km_oauth=" + s.state } })));
  db.prepare("UPDATE km_oauth_handoff SET created = ?").run(new Date(Date.now() - 3 * 60 * 1000).toISOString());
  ok((await post(base, "/api/km/auth/app/redeem", { h, v: V })).status === 410, "🔴 ληγμένος δεκτός");
});
// ── CORS ──
const wf = (path, init) => worker.fetch(new Request("https://fastwrite.tech" + path, init || {}), base, { waitUntil() {} });
await check("CORS-1 · 🔴 προέλευση κελύφους → ακριβής Origin + Credentials + Vary · preflight 204", async () => {
  for (const o of ["https://localhost", "capacitor://localhost"]) {
    const p = await wf("/api/km/status", { method: "OPTIONS", headers: { Origin: o, "Access-Control-Request-Method": "GET" } });
    ok(p.status === 204 && p.headers.get("Access-Control-Allow-Origin") === o && p.headers.get("Access-Control-Allow-Credentials") === "true", "preflight " + o);
    ok(/X-Km-Auth/.test(p.headers.get("Access-Control-Allow-Headers") || "") && !/X-Km-Admin/i.test(p.headers.get("Access-Control-Allow-Headers") || ""), "κεφαλίδες");
    const r = await wf("/api/km/auth/app/redeem", { method: "POST", headers: { Origin: o, "Content-Type": "application/json" }, body: "{}" });
    ok(r.headers.get("Access-Control-Allow-Origin") === o && r.headers.get("Access-Control-Allow-Credentials") === "true" && /Origin/.test(r.headers.get("Vary") || ""), "απάντηση " + o);
  }
});
await check("CORS-2 · 🔴 ξένη προέλευση / browser → ΚΑΜΙΑ κεφαλίδα CORS (το PWA δεν αλλάζει)", async () => {
  for (const h of [{ Origin: "https://evil.example" }, { Origin: "https://fastwrite.tech" }, {}]) {
    const r = await wf("/api/km/auth/app/redeem", { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, h), body: "{}" });
    ok(r.headers.get("Access-Control-Allow-Origin") === null, "CORS σε " + JSON.stringify(h));
  }
});
// ── KM-REVIEW ──
const RV = Object.assign({}, base, { KM_REVIEW_CODE: "482913" });
await check("RV-1 · 🔴 χωρίς secret KM_REVIEW_CODE η λειτουργία ΔΕΝ υπάρχει (κανονικός κωδικός με email)", async () => {
  mails = [];
  const r = await (await post(base, "/api/km/email/code", { email: "appreview+apple@fastwrite.tech" })).json();
  ok(r.ok && mails.length === 1, "έπρεπε να σταλεί κανονικό email " + JSON.stringify(r) + " " + mails.length);
  const v = await post(base, "/api/km/email/verify", { email: "appreview+apple@fastwrite.tech", code: "123456" });
  ok(v.status === 400, "🔴 δεκτός κωδικός χωρίς secret");
});
await check("RV-2 · 🔴 με secret: κανένα email · μόνο ο σωστός κωδικός · token έγκυρο", async () => {
  mails = [];
  const r = await (await post(RV, "/api/km/email/code", { email: "appreview+apple@fastwrite.tech" })).json();
  ok(r.ok && mails.length === 0, "στάλθηκε email");
  ok((await post(RV, "/api/km/email/verify", { email: "appreview+apple@fastwrite.tech", code: "000000" })).status === 400, "🔴 λάθος κωδικός δεκτός");
  const v = await (await post(RV, "/api/km/email/verify", { email: "appreview+apple@fastwrite.tech", code: "482913" })).json();
  ok(v.ok && /^[0-9a-f]{64}$/.test(v.email_token), JSON.stringify(v));
});
await check("RV-3 · 🔴 μόνο appreview(+ετικέτα)@fastwrite.tech — όχι άλλο email, όχι ξένο domain", async () => {
  for (const e of ["maria@gmail.com", "appreview@fastwrite.tech.evil.com", "xappreview@fastwrite.tech", "appreview+a@fastwrite.co"]) {
    ok((await post(RV, "/api/km/email/verify", { email: e, code: "482913" })).status !== 200, "δεκτό " + e);
  }
});
await check("RV-4 · νέος έλεγχος στην ίδια διεύθυνση σβήνει ΜΟΝΟ τον προηγούμενο λογαριασμό ελέγχου της", async () => {
  const ins = (f, e) => db.prepare("INSERT INTO km_accounts (folder_id, email, auth_hash, created) VALUES (?, ?, ?, ?)").run(f, e, "b".repeat(64), new Date().toISOString());
  ins("1".repeat(64), "appreview+google@fastwrite.tech"); ins("2".repeat(64), "appreview+apple@fastwrite.tech"); ins("3".repeat(64), "real@gmail.com");
  const v = await (await post(RV, "/api/km/email/verify", { email: "appreview+google@fastwrite.tech", code: "482913" })).json(); ok(v.ok, JSON.stringify(v));
  const live = (f) => db.prepare("SELECT deleted FROM km_accounts WHERE folder_id = ?").get(f).deleted === null;
  ok(!live("1".repeat(64)), "ο παλιός google έμεινε");
  ok(live("2".repeat(64)) && live("3".repeat(64)), "🔴 σβήστηκε άλλος λογαριασμός");
});
if (ONLY) { if (failed) { console.log("Μ" + ONLY + " → κοκκίνισε ✔"); process.exit(0); } console.log("Μ" + ONLY + " ΠΕΡΑΣΕ — το τεστ δεν πιάνει τίποτα"); process.exit(1); }
console.log(failed ? "ΑΠΕΤΥΧΑΝ " + failed : "✔ ΟΛΑ ΠΕΡΑΣΑΝ (9)"); process.exit(failed ? 1 : 0);
