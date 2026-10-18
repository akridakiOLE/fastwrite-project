// K3β · ΦΥΛΑΞΗ + ΑΝΑΚΛΗΣΗ TOKEN ΤΗΣ APPLE (Apple TN3194) — 18/10/2026
//   node --experimental-sqlite tests/k3b.test.mjs
//   node --experimental-sqlite tests/k3b.test.mjs --mutate=N   (exit 0 = η μετάλλαξη πιάστηκε)
// Κάθε έλεγχος διαβάζει τη ΒΑΣΗ και τις ΚΛΗΣΕΙΣ προς την Apple — όχι το «ok» του endpoint.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
if (ONLY) process.on("uncaughtException", () => { console.log("Μ" + ONLY + " → κοκκίνισε ✔ (κατέρρευσε)"); process.exit(0); });
let SRC = readFileSync("src/km.js", "utf8");
const MUT = [
  ['  const apple = await appleRevokeFor(env, folderId, acc.email ? String(acc.email) : "");\n', '  const apple = null;\n'],   // 1 · η διαγραφή δεν ανακαλεί
  ['const tkOk = prov !== "apple" || !!(await appleTokKey(env).catch(() => null));', 'const tkOk = true;'],              // 2 · Apple ξεκινά χωρίς κλειδί
  ['      if (!tok || !tok.refresh_token) throw new Error("no_refresh_token");\n', ''],                                       // 3 · χωρίς refresh_token περνάει
  ['crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) }', 'crypto.subtle.encrypt({ name: "AES-GCM", iv }'], // 4 · χωρίς AAD
  ['    stmts.push(await appleLinkStmt(env, email, id.folder));\n', ''],                                                    // 5 · ο λογαριασμός δεν δένεται
  ['folder_id IS NULL AND updated < ?', 'folder_id IS NULL AND updated > ?'],                                             // 6 · ορφανά λάθος κατεύθυνση
  ['    if (!aud.some((a) => okAud.includes(a))) throw new Error("bad_aud");\n', ''],                                      // 7 · ειδοποίηση χωρίς aud
  ['const tries = (Number(q.attempts) || 0) + (res === "fail" ? 1 : 0);', 'const tries = (Number(q.attempts) || 0) + 1;'], // 8 · ρύθμιση καίει προσπάθειες
  ['"(folder_id = ? OR folder_id IS NULL)"', '"(? IS NOT NULL)"'],                                                            // 9 · διπλότυπο σκοτώνει τον ζωντανό
  ['DELETE FROM km_apple_tokens WHERE sub_h = ? AND updated < ?', 'DELETE FROM km_apple_tokens WHERE sub_h = ? AND ? IS NOT NULL'], // 10 · επανάληψη ειδοποίησης σβήνει ζωντανό
  ['WHERE next_at <= ? ORDER BY next_at', 'WHERE ? IS NOT NULL ORDER BY next_at'],                                         // 11 · χωρίς αναμονή
  ['for (const raw of [env.APPLE_TOKEN_KEY, env.APPLE_TOKEN_KEY_OLD])', 'for (const raw of [env.APPLE_TOKEN_KEY])'],       // 12 · χωρίς παλιό κλειδί
  ['WHERE email_h = ? AND rt_enc = ? AND ` + cond', 'WHERE email_h = ? AND rt_enc = ? AND ? IS NOT NULL`'],                // 13 · μετακόμιση χωρίς όρο (ορφανό που δέθηκε ανακαλείται)
  ['const old = res !== "config" && Date.parse', 'const old = Date.parse'],                                              // 14 · ρύθμιση εγκαταλείπεται
];
if (ONLY) { const m = MUT[ONLY - 1]; if (!m) process.exit(2); if (!SRC.includes(m[0])) { console.log("Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(3); } SRC = SRC.replace(m[0], m[1]); }
const mod = await import("data:text/javascript;base64," + Buffer.from(SRC).toString("base64"));

const results = [];
function ok(name, cond, info) { results.push({ name, ok: !!cond }); console.log((cond ? "✅" : "❌") + " " + name + (info ? "  — " + info : "")); }

// ── βάση ───────────────────────────────────────────────────────────────────
const db = new DatabaseSync(":memory:");
for (const f of ["km.sql", "km_h13.sql", "km_v54.sql", "km_mail.sql", "km_h11b.sql", "km_ref.sql", "km_ref2.sql", "km_verify.sql", "km_support.sql", "km_support_v95.sql", "km_funnel.sql", "km_transfer.sql", "km_oauth.sql", "km_k3.sql", "km_apple.sql"]) {
  const sql = readFileSync("schema/" + f, "utf8").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  for (const s of sql.split(";")) { const t = s.trim(); if (!t) continue; try { db.exec(t + ";"); } catch (e) { if (!/duplicate column|already exists/i.test(e.message)) throw e; } }
}
const stmt = (sql, args) => { const p = db.prepare(sql); return {
  async first() { return p.get(...args) ?? null; },
  async run() { const r = p.run(...args); return { meta: { changes: Number(r.changes) } }; },
  async all() { return { results: p.all(...args) }; } }; };
const DB = { prepare: (sql) => ({ bind: (...a) => stmt(sql, a.map((x) => (x === undefined ? null : x))), ...stmt(sql, []) }),
  async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } };
const r2 = new Map();
const FOLDERS = {
  async put(k, v) { r2.set(k, Buffer.from(v)); }, async get(k) { return r2.has(k) ? { arrayBuffer: async () => r2.get(k) } : null; },
  async delete(k) { for (const key of (Array.isArray(k) ? k : [k])) r2.delete(key); },
  async list({ prefix, limit }) { return { objects: [...r2.keys()].filter((k) => k.startsWith(prefix)).slice(0, limit || 1000).map((k) => ({ key: k, size: r2.get(k).length })), truncated: false, cursor: null }; },
};
const EMAIL = { send: async () => ({ messageId: "m" }) };

// ── κλειδιά (ΜΟΝΟ για το τεστ) ─────────────────────────────────────────────
const b64url = (buf) => Buffer.from(buf).toString("base64url");
const rsa = await webcrypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const rsaJwk = await webcrypto.subtle.exportKey("jwk", rsa.publicKey);
const rsaBad = await webcrypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const KID = "kid-k3b";
async function jwt(claims, key) {
  const h = b64url(JSON.stringify({ alg: "RS256", kid: KID })), p = b64url(JSON.stringify(claims));
  const s = await webcrypto.subtle.sign("RSASSA-PKCS1-v1_5", (key || rsa).privateKey, new TextEncoder().encode(h + "." + p));
  return h + "." + p + "." + b64url(s);
}
const ec = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const pkcs8 = Buffer.from(await webcrypto.subtle.exportKey("pkcs8", ec.privateKey)).toString("base64");
const P8 = "-----BEGIN PRIVATE KEY-----\n" + pkcs8.match(/.{1,64}/g).join("\n") + "\n-----END PRIVATE KEY-----";
const TOKKEY = b64url(webcrypto.getRandomValues(new Uint8Array(32)));
const env = { DB, FOLDERS, EMAIL, KM_ADMIN_KEY: "s3cret", KM_PUBLIC_ORIGIN: "https://fastwrite.tech",
  APPLE_CLIENT_ID: "tech.fastwrite.kostometro.web", APPLE_TEAM_ID: "5FM8N85F5U", APPLE_KEY_ID: "N8QC6LYTLC", APPLE_PRIVATE_KEY: P8, APPLE_TOKEN_KEY: TOKKEY };

// ── Apple προσομοιωμένη ────────────────────────────────────────────────────
const revokes = [];
let revokeStatus = 200, revokeErr = null, giveRefresh = true, nextClaims = null;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u === "https://appleid.apple.com/auth/keys") return new Response(JSON.stringify({ keys: [{ kty: "RSA", kid: KID, n: rsaJwk.n, e: rsaJwk.e, alg: "RS256" }] }), { status: 200 });
  if (u === "https://appleid.apple.com/auth/token") {
    const f = Object.fromEntries(new URLSearchParams(init.body));
    const j = { id_token: await jwt(nextClaims) }; if (giveRefresh) j.refresh_token = "rt-" + f.code;
    return new Response(JSON.stringify(j), { status: 200 });
  }
  if (u === "https://appleid.apple.com/auth/revoke") { revokes.push(Object.fromEntries(new URLSearchParams(init.body))); return new Response(revokeErr ? JSON.stringify({ error: revokeErr }) : "", { status: revokeStatus }); }
  throw new Error("unexpected fetch " + u);
};
const call = (path, opts, e) => mod.handleKm(new Request("https://fastwrite.tech" + path, opts), e || env, null, path.split("?")[0]);
const hex = (n) => [...webcrypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha = async (s) => Buffer.from(await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(s))).toString("hex");
const plus = (iso, h) => new Date(Date.parse(iso) + h * 3600 * 1000).toISOString();
const tokRow = async (email) => db.prepare("SELECT * FROM km_apple_tokens WHERE email_h = ?").get(await sha("apple|" + email));
let n = 0;
async function appleSignIn(email, sub) {
  const s = await call("/api/km/auth/apple/start");
  const L = new URL(s.headers.get("Location"));
  const st = L.searchParams.get("state"), nonce = L.searchParams.get("nonce");
  nextClaims = { iss: "https://appleid.apple.com", aud: env.APPLE_CLIENT_ID, sub, email, email_verified: true, nonce, exp: Math.floor(Date.now() / 1000) + 600 };
  const code = "c" + (++n);
  const cb = await call("/api/km/auth/apple/callback", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: "km_oauth=" + st }, body: new URLSearchParams({ code, state: st }).toString() });
  const loc = cb.headers.get("Location") || "";
  return { loc, code, t: (/t=([0-9a-f]{64})/.exec(loc) || [])[1] };
}
async function register(email, t) {
  const id = { folder: hex(32), auth: hex(32), device: "km_" + hex(6) };
  const r = await call("/api/km/register", { method: "POST", headers: { "Content-Type": "application/json", "X-Km-Folder": id.folder, "X-Km-Auth": id.auth, "X-Km-Device": id.device }, body: JSON.stringify({ email, email_token: t, source: "store:ios" }) });
  if (r.status !== 200) throw new Error("register " + r.status + " " + await r.text());
  return id;
}
const H = (id) => ({ "Content-Type": "application/json", "X-Km-Folder": id.folder, "X-Km-Auth": id.auth, "X-Km-Device": id.device });

const qRows = () => db.prepare("SELECT * FROM km_apple_revoke").all();
const qClear = () => db.prepare("DELETE FROM km_apple_revoke").run();
// ═══ K1 · χωρίς κλειδί κρυπτογράφησης η Apple δεν ξεκινά ═══════════════════
{
  const e2 = Object.assign({}, env, { APPLE_TOKEN_KEY: "" });
  const r = await call("/api/km/auth/apple/start", {}, e2);
  ok("K1 χωρίς APPLE_TOKEN_KEY → unavailable (fail closed)", r.status === 302 && /code=unavailable/.test(r.headers.get("Location")));
  const r3 = await call("/api/km/auth/apple/start", {}, Object.assign({}, env, { APPLE_TOKEN_KEY: b64url(new Uint8Array(16)) }));
  ok("K1b κλειδί λάθος μήκους (16 bytes) → unavailable", /code=unavailable/.test(r3.headers.get("Location")));
  const rg = await call("/api/km/auth/google/start", {}, Object.assign({}, e2, { GOOGLE_CLIENT_ID: "g", GOOGLE_CLIENT_SECRET: "s" }));
  ok("K1c Google ΔΕΝ επηρεάζεται από το κλειδί της Apple", rg.status === 302 && /accounts\.google\.com/.test(rg.headers.get("Location")));
}
// ═══ K2 · η σύνδεση φυλάει το token — κρυπτογραφημένο, χωρίς email ════════
const E1 = "anna@icloud.com";
let s1;
{
  s1 = await appleSignIn(E1, "001.anna");
  ok("K2 callback → ok", /km_oauth=ok/.test(s1.loc));
  const row = await tokRow(E1);
  ok("K2b γραμμή υπάρχει, folder_id NULL, client_id = Services ID", row && row.folder_id === null && row.client_id === env.APPLE_CLIENT_ID);
  const dump = JSON.stringify(db.prepare("SELECT * FROM km_apple_tokens").all());
  ok("K2c ΟΥΤΕ το token ΟΥΤΕ το email ΟΥΤΕ το sub σε καθαρό κείμενο", !dump.includes("rt-" + s1.code) && !dump.includes(E1) && !dump.includes("001.anna"));
}
// ═══ K3 · χωρίς refresh_token → σφάλμα, όχι σιωπή ═════════════════════════
{
  giveRefresh = false;
  const s = await appleSignIn("norefresh@icloud.com", "001.nr");
  giveRefresh = true;
  ok("K3 Apple χωρίς refresh_token → code=provider, καμία γραμμή", /code=provider/.test(s.loc) && !(await tokRow("norefresh@icloud.com")));
}
// ═══ K4 · δεύτερη σύνδεση ίδιου email → ΑΝΤΙΚΑΤΑΣΤΑΣΗ, ΚΑΜΙΑ ανάκληση ═════
{
  const before = revokes.length, old = (await tokRow(E1)).rt_enc;
  const s = await appleSignIn(E1, "001.anna");
  ok("K4 ΚΑΜΙΑ ανάκληση στη νέα σύνδεση (θα ακύρωνε ΟΛΗ την εξουσιοδότηση, και το νέο token)", revokes.length === before);
  ok("K4b μία γραμμή, νέο κρυπτογράφημα", (await tokRow(E1)).rt_enc !== old && db.prepare("SELECT COUNT(*) AS n FROM km_apple_tokens WHERE email_h = ?").get(await sha("apple|" + E1)).n === 1);
  s1 = s;
}
// ═══ K5 · register → δένει το token με τον λογαριασμό ═════════════════════
let A1;
{
  A1 = await register(E1, s1.t);
  ok("K5 μετά το register: folder_id = ο νέος λογαριασμός", (await tokRow(E1)).folder_id === A1.folder);
}
// ═══ K6 · αίτημα διαγραφής → ΤΙΠΟΤΑ · μετά τις 72 ώρες → ανάκληση ═════════
{
  const before = revokes.length;
  await call("/api/km/delete", { method: "POST", headers: H(A1), body: JSON.stringify({ confirm: "ΔΙΑΓΡΑΦΗ" }) });
  ok("K6 το ΑΙΤΗΜΑ δεν ανακαλεί", revokes.length === before && !!(await tokRow(E1)));
  const due = db.prepare("SELECT delete_due_at FROM km_accounts WHERE folder_id = ?").get(A1.folder).delete_due_at;
  await mod.kmDeleteDue(env, plus(due, -1));
  ok("K6b μία ώρα πριν τη λήξη: ακόμα τίποτα", revokes.length === before);
  await mod.kmDeleteDue(env, plus(due, 0.02));
  const r = revokes.slice(before);
  ok("K6c στη λήξη: ΜΙΑ κλήση /auth/revoke με το ΤΡΕΧΟΝ token", r.length === 1 && r[0].token === "rt-" + s1.code);
  ok("K6d client_id = Services ID · token_type_hint = refresh_token · client_secret = JWT", r[0] && r[0].client_id === "tech.fastwrite.kostometro.web" && r[0].token_type_hint === "refresh_token" && r[0].client_secret.split(".").length === 3);
  ok("K6e γραμμή + ουρά άδειες", !(await tokRow(E1)) && qRows().length === 0);
  const acc = db.prepare("SELECT email, deleted FROM km_accounts WHERE folder_id = ?").get(A1.folder);
  ok("K6f η διαγραφή ολοκληρώθηκε κανονικά", acc.email === "" && !!acc.deleted);
}
// ═══ K7 · Apple πέφτει → η διαγραφή ΣΤΕΚΕΙ · ουρά με αναμονή ══════════════
{
  const E = "bob@icloud.com";
  const s = await appleSignIn(E, "001.bob");
  const id = await register(E, s.t);
  revokeStatus = 503;
  const res = await call("/api/km/admin/delete?k=s3cret", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder_id: id.folder }) });
  const j = await res.json();
  const q = qRows();
  ok("K7 Apple 503 → διαγραφή ΟΛΟΚΛΗΡΩΘΗΚΕ", res.status === 200 && db.prepare("SELECT email FROM km_accounts WHERE folder_id = ?").get(id.folder).email === "");
  ok("K7b ζωντανή γραμμή έφυγε · 1 στην ουρά, attempts=1, next_at στο μέλλον · apple.wait=1", !(await tokRow(E)) && q.length === 1 && q[0].attempts === 1 && Date.parse(q[0].next_at) > Date.now() && j.deleted.apple.wait === 1);
  revokeStatus = 200;
  const before = revokes.length;
  await mod.kmAppleTokensDue(env);
  ok("K7c πριν το next_at: καμία κλήση (αναμονή, όχι σφυροκόπημα)", revokes.length === before && qRows().length === 1);
  const c = await mod.kmAppleTokensDue(env, plus(new Date().toISOString(), 3));
  ok("K7d μετά το next_at: ανακλήθηκε με το token του bob, ουρά άδεια", c.revoked === 1 && revokes.at(-1).token === "rt-" + s.code && qRows().length === 0, JSON.stringify(c));
}
// ═══ K8 · πρόβλημα ΡΥΘΜΙΣΗΣ (invalid_client / χωρίς κλειδί) δεν καίει προσπάθειες
{
  const E = "carl@icloud.com";
  const s = await appleSignIn(E, "001.carl");
  const id = await register(E, s.t);
  revokeStatus = 400; revokeErr = "invalid_client";
  await call("/api/km/admin/delete?k=s3cret", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder_id: id.folder }) });
  ok("K8 invalid_client → attempts ΜΕΝΕΙ 0 (δικό μας θέμα), last_error=config", qRows()[0].attempts === 0 && qRows()[0].last_error === "config");
  revokeStatus = 500; revokeErr = null;
  await mod.kmAppleTokensDue(env, plus(new Date().toISOString(), 24 * 5));
  ok("K8b Apple 500 → attempts=1", qRows()[0].attempts === 1);
  await mod.kmAppleTokensDue(env, plus(new Date().toISOString(), 24 * 20));
  ok("K8c στις 20 ημέρες: ΑΚΟΜΑ στην ουρά", qRows().length === 1);
  const c = await mod.kmAppleTokensDue(env, plus(new Date().toISOString(), 24 * 31));
  ok("K8d στις 31 ημέρες: εγκατάλειψη (gave_up), ουρά άδεια", c.gave_up === 1 && qRows().length === 0);
  revokeStatus = 200;
}
// ═══ K9 · ορφανό ════════════════════════════════════════════════════════════
{
  const E = "orphan@icloud.com";
  const s = await appleSignIn(E, "001.or");
  const before = revokes.length;
  await mod.kmAppleTokensDue(env, plus(new Date().toISOString(), 24 * 6));
  ok("K9 στις 6 ημέρες: ΜΕΝΕΙ", !!(await tokRow(E)) && revokes.length === before);
  await mod.kmAppleTokensDue(env, plus(new Date().toISOString(), 24 * 8));
  ok("K9b στις 8 ημέρες: ανάκληση + σβήσιμο", !(await tokRow(E)) && revokes.slice(before).some((r) => r.token === "rt-" + s.code) && qRows().length === 0);
}
// ═══ K10 · ακύρωση διαγραφής μέσα στις 72 ώρες → token άθικτο ═════════════
{
  const E = "dina@icloud.com";
  const s = await appleSignIn(E, "001.dina");
  const id = await register(E, s.t);
  const before = revokes.length;
  await call("/api/km/delete", { method: "POST", headers: H(id), body: JSON.stringify({ confirm: "ΔΙΑΓΡΑΦΗ" }) });
  await call("/api/km/delete/cancel", { method: "POST", headers: H(id), body: "{}" });
  await mod.kmDeleteDue(env, plus(new Date().toISOString(), 80));
  ok("K10 ακύρωση → καμία ανάκληση, γραμμή δεμένη", revokes.length === before && (await tokRow(E)).folder_id === id.folder);
}
// ═══ K11 · ειδοποιήσεις server-to-server ═════════════════════════════════
{
  const E = "eva@icloud.com";
  await appleSignIn(E, "001.eva");
  const ev = (type, sub, t) => ({ iss: "https://appleid.apple.com", aud: "tech.fastwrite.kostometro", iat: Math.floor(Date.now() / 1000), jti: hex(8), events: JSON.stringify({ type, sub, event_time: t || Date.now() + 1000 }) });
  const notify = (payload) => call("/api/km/auth/apple/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payload }) });
  ok("K11 άκυρη υπογραφή → 400, άθικτη", (await notify(await jwt(ev("consent-revoked", "001.eva"), rsaBad))).status === 400 && !!(await tokRow(E)));
  ok("K11b λάθος aud → 400, άθικτη", (await notify(await jwt(Object.assign(ev("consent-revoked", "001.eva"), { aud: "com.other.app" })))).status === 400 && !!(await tokRow(E)));
  ok("K11c email-disabled → 200, άθικτη", (await notify(await jwt(ev("email-disabled", "001.eva")))).status === 200 && !!(await tokRow(E)));
  ok("K11d consent-revoked ΠΑΛΑΙΟΤΕΡΟ από τη σύνδεση (επανάληψη) → 200, άθικτη", (await notify(await jwt(ev("consent-revoked", "001.eva", Date.now() - 3600000)))).status === 200 && !!(await tokRow(E)));
  ok("K11e consent-revoked ΜΕΤΑ τη σύνδεση → 200, σβήστηκε", (await notify(await jwt(ev("consent-revoked", "001.eva")))).status === 200 && !(await tokRow(E)));
  const big = await call("/api/km/auth/apple/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array(20000).fill(32)); c.close(); } }), duplex: "half" });
  ok("K11f σώμα > 16 KB χωρίς Content-Length (chunked) → 400", big.status === 400);
}
// ═══ K12 · AAD: ξένο κρυπτογράφημα δεν ανοίγει ═════════════════════════════
{
  const Ea = "fay@icloud.com", Eb = "gus@icloud.com";
  const sa = await appleSignIn(Ea, "001.fay"); const sb = await appleSignIn(Eb, "001.gus");
  const ib = await register(Eb, sb.t);
  db.prepare("UPDATE km_apple_tokens SET rt_enc = ? WHERE email_h = ?").run((await tokRow(Ea)).rt_enc, await sha("apple|" + Eb));
  const before = revokes.length;
  await call("/api/km/admin/delete?k=s3cret", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder_id: ib.folder }) });
  ok("K12 ξένο κρυπτογράφημα ΔΕΝ ανοίγει → κανένα token της fay δεν φεύγει, μένει στην ουρά (config)", !revokes.slice(before).some((r) => r.token === "rt-" + sa.code) && qRows().length === 1);
  qClear();
}
// ═══ K13 · εκκρεμής ανάκληση + νέα σύνδεση ίδιου email → η ανάκληση ΔΕΝ χάνεται
{
  const E = "hal@icloud.com";
  const s = await appleSignIn(E, "001.hal");
  const id = await register(E, s.t);
  revokeStatus = 503;
  await call("/api/km/admin/delete?k=s3cret", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder_id: id.folder }) });
  revokeStatus = 200;
  const s2 = await appleSignIn(E, "001.hal");
  ok("K13 νέα σύνδεση: ζωντανή γραμμή ΝΕΑ (folder_id NULL) + η παλιά ΜΕΝΕΙ στην ουρά", (await tokRow(E)).folder_id === null && qRows().length === 1);
  await mod.kmAppleTokensDue(env, plus(new Date().toISOString(), 3));
  ok("K13b το cron ανακαλεί το ΠΑΛΙΟ token", revokes.at(-1).token === "rt-" + s.code && qRows().length === 0);
  await mod.kmAppleTokensDue(env, plus(new Date().toISOString(), 24 * 8));
  ok("K13c το νέο, χωρίς λογαριασμό, φεύγει ως ορφανό", revokes.at(-1).token === "rt-" + s2.code && !(await tokRow(E)));
}
// ═══ K14 · διπλότυπο email: διαγραφή του σκουπιδιού ΔΕΝ αγγίζει τον ζωντανό
{
  const E = "ida@icloud.com";
  const s = await appleSignIn(E, "001.ida");
  const live = await register(E, s.t);
  const junk = hex(32);
  // διπλότυπα της εποχής ΠΡΙΝ το μοναδικό index (Α300: 3 λογαριασμοί ίδιου email) — το index φεύγει ΜΟΝΟ για να στηθεί το σενάριο
  db.exec("DROP INDEX IF EXISTS uq_km_accounts_email_live");
  db.prepare("INSERT INTO km_accounts (folder_id, auth_hash, email, created) VALUES (?, ?, ?, ?)").run(junk, hex(32), E, new Date().toISOString());
  const before = revokes.length;
  await call("/api/km/admin/delete?k=s3cret", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder_id: junk }) });
  ok("K14 διαγραφή διπλότυπου με ίδιο email → token του ζωντανού ΑΘΙΚΤΟ", revokes.length === before && (await tokRow(E)).folder_id === live.folder);
}
// ═══ K15 · R2 σκάει στη διαγραφή → η ανάκληση έχει ΗΔΗ γίνει ══════════════
{
  const E = "jon@icloud.com";
  const s = await appleSignIn(E, "001.jon");
  const id = await register(E, s.t);
  const e2 = Object.assign({}, env, { FOLDERS: Object.assign({}, FOLDERS, { list: async () => { throw new Error("r2 down"); } }) });
  const before = revokes.length;
  await call("/api/km/admin/delete?k=s3cret", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder_id: id.folder }) }, e2).catch(() => null);
  ok("K15 R2 πέφτει → το token ανακλήθηκε ΠΡΙΝ (σειρά: σφραγίδα → Apple → R2)", revokes.slice(before).some((r) => r.token === "rt-" + s.code));
}
// ═══ K16 · αλλαγή κλειδιού: APPLE_TOKEN_KEY_OLD ανοίγει τα παλιά ═══════════
{
  const E = "kim@icloud.com";
  const s = await appleSignIn(E, "001.kim");
  const id = await register(E, s.t);
  const e2 = Object.assign({}, env, { APPLE_TOKEN_KEY: b64url(webcrypto.getRandomValues(new Uint8Array(32))), APPLE_TOKEN_KEY_OLD: env.APPLE_TOKEN_KEY });
  const before = revokes.length;
  await call("/api/km/admin/delete?k=s3cret", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder_id: id.folder }) }, e2);
  ok("K16 νέο κλειδί + παλιό ως _OLD → ανάκληση πέτυχε", revokes.slice(before).some((r) => r.token === "rt-" + s.code) && qRows().length === 0);
}

// ═══ K17 · ορφανό που ΔΕΝΕΤΑΙ με λογαριασμό ανάμεσα σε SELECT και μετακόμιση → ΔΕΝ ανακαλείται
{
  const E = "leo@icloud.com";
  const s = await appleSignIn(E, "001.leo");
  const realFolder = hex(32);
  const DB2 = { prepare(sql) { const st = DB.prepare(sql);
      if (/FROM km_apple_tokens WHERE folder_id IS NULL AND updated/.test(sql)) return { bind: (...a) => { const b = st.bind(...a); return { ...b, all: async () => { const r = await b.all(); db.prepare("UPDATE km_apple_tokens SET folder_id = ? WHERE email_h = ?").run(realFolder, (r.results[0] || {}).email_h || ""); return r; } }; } };
      return st; }, batch: DB.batch };
  const before = revokes.length;
  await mod.kmAppleTokensDue(Object.assign({}, env, { DB: DB2 }), plus(new Date().toISOString(), 24 * 8));
  ok("K17 register την τελευταία στιγμή → η γραμμή ΜΕΝΕΙ ζωντανή, καμία ανάκληση", revokes.length === before && (await tokRow(E)) && (await tokRow(E)).folder_id === realFolder && qRows().length === 0);
}
// ═══ K18 · πρόβλημα ρύθμισης ΔΕΝ εγκαταλείπεται ποτέ ════════════════════════
{
  const E = "max@icloud.com";
  const s = await appleSignIn(E, "001.max");
  const id = await register(E, s.t);
  revokeStatus = 400; revokeErr = "invalid_client";
  await call("/api/km/admin/delete?k=s3cret", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder_id: id.folder }) });
  await mod.kmAppleTokensDue(env, plus(new Date().toISOString(), 24 * 60));
  ok("K18 invalid_client στις 60 ημέρες: ΑΚΟΜΑ στην ουρά (περιμένει διόρθωση)", qRows().length === 1 && qRows()[0].last_error === "config");
  revokeStatus = 200; revokeErr = null;
  await mod.kmAppleTokensDue(env, plus(new Date().toISOString(), 24 * 61));
  ok("K18b μόλις διορθωθεί: ανακαλείται", qRows().length === 0 && revokes.at(-1).token === "rt-" + s.code);
}

const pass = results.filter((r) => r.ok).length;
if (ONLY) { if (pass !== results.length) { console.log("Μ" + ONLY + " → κοκκίνισε ✔"); process.exit(0); } console.log("Μ" + ONLY + " ΠΕΡΑΣΕ — το τεστ δεν πιάνει τίποτα"); process.exit(1); }
console.log("\n" + pass + "/" + results.length + " OK");
if (pass !== results.length) process.exit(1);
