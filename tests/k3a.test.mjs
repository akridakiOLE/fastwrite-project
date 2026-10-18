// K3 + K3α · τεστ σε ΑΝΤΙΓΡΑΦΟ του km.js (km_k3a.js), D1 προσομοιωμένη σε SQLite,
// πάροχοι προσομοιωμένοι (JWKS + token endpoint) μέσω fetch.
// Τρέξιμο (από τη ρίζα του repo): node --experimental-sqlite tests/k3a.test.mjs [--mutate=N]   (Node 22)
import { DatabaseSync } from "node:sqlite";
import { webcrypto } from "node:crypto";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
// K3α στο repo (17/10/2026): τρέχει πάνω στο src/km.js · --mutate=N = μετάλλαξη (exit 0 = πιάστηκε)
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
if (ONLY) process.on("uncaughtException", () => { console.log("Μ" + ONLY + " → κοκκίνισε ✔ (κατέρρευσε)"); process.exit(0); });
let SRC = readFileSync("src/km.js", "utf8");
const MUT = [
  ['const sameSite = P.formPost ? "None" : "Lax";', 'const sameSite = "Lax";'],                                   // 1 · cookie δεν φτάνει στο POST της Apple
  ['(method === "POST" && m[1] === "apple")', 'method === "POST"'],                                                 // 2 · POST δεκτό και στη Google
  ['exp: now + 600,', 'exp: now + 86400 * 180,'],                                                                    // 3 · μυστικό 6 μηνών
  ['issOk: (c) => c.iss === "https://appleid.apple.com",\n    verified: (c) => c.email_verified === true || c.email_verified === "true",', 'issOk: (c) => c.iss === "https://appleid.apple.com",\n    verified: (c) => true,'], // 4 · ανεπιβεβαίωτο email Apple δεκτό
  ['formPost: true, pkce: false, scope: "email",', 'formPost: true, pkce: false, scope: "name email",'],            // 5 · ζητάμε και όνομα
  ['const secret = prov === "apple" ? await appleClientSecret(env) : env[P.secVar];', 'const secret = env[P.secVar];'], // 6 · .p8 ως client_secret
  ['if (sp.get("error")) return back(', 'if (false) return back('],                                                 // 7 · ακύρωση αγνοείται
  ['if (P.formPost) q.set("response_mode", "form_post");', ''],                                                     // 8 · χωρίς form_post
  ['if (request.method === "POST" && Number(request.headers.get("content-length") || 0) > 16384) return', 'if (false) return'], // 9 · χωρίς όριο σώματος
];
if (ONLY) { const m = MUT[ONLY - 1]; if (!m) process.exit(2); if (!SRC.includes(m[0])) { console.log("Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(3); } SRC = SRC.replace(m[0], m[1]); }
const TMP = mkdtempSync(join(tmpdir(), "k3a-"));
writeFileSync(join(TMP, "km.mjs"), SRC);
const KM = await import(pathToFileURL(join(TMP, "km.mjs")).href);

const results = [];
function ok(name, cond, info) { results.push({ name, ok: !!cond, info }); console.log((cond ? "✅" : "❌") + " " + name + (info ? "  — " + info : "")); }

// ─── D1 shim ─────────────────────────────────────────────────────────────
function d1(db) {
  return {
    prepare(sql) {
      const st = db.prepare(sql);
      let args = [];
      const o = {
        bind(...a) { args = a.map((x) => (x === undefined ? null : x)); return o; },
        async first() { return st.get(...args) ?? null; },
        async all() { return { results: st.all(...args) }; },
        async run() { const r = st.run(...args); return { meta: { changes: r.changes } }; },
      };
      return o;
    },
    async batch(stmts) { for (const s of stmts) await s.run(); return []; },
  };
}
const db = new DatabaseSync(":memory:");
db.exec(`
CREATE TABLE km_oauth_states (state_hash TEXT PRIMARY KEY, provider TEXT NOT NULL, verifier TEXT NOT NULL, nonce TEXT NOT NULL, ip_h TEXT, created TEXT NOT NULL, app_ch TEXT);
CREATE TABLE km_oauth_handoff (h_hash TEXT PRIMARY KEY, app_ch TEXT NOT NULL, frag TEXT NOT NULL, created TEXT NOT NULL);
CREATE TABLE km_email_tokens (token_hash TEXT PRIMARY KEY, email TEXT, created TEXT, expires TEXT, used TEXT);
CREATE TABLE km_accounts (folder_id TEXT, email TEXT, deleted TEXT, delete_due_at TEXT, ref_code TEXT);
CREATE TABLE km_funnel (dev TEXT, step TEXT, src TEXT, at TEXT, PRIMARY KEY (dev, step));
`);

// ─── κλειδιά παρόχων (προσομοίωση) ──────────────────────────────────────
const b64url = (buf) => Buffer.from(buf).toString("base64url");
const rsa = await webcrypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const rsaJwk = await webcrypto.subtle.exportKey("jwk", rsa.publicKey);
const KID = "kid-test-1";
async function idToken(claims) {
  const h = b64url(JSON.stringify({ alg: "RS256", kid: KID }));
  const p = b64url(JSON.stringify(claims));
  const s = await webcrypto.subtle.sign("RSASSA-PKCS1-v1_5", rsa.privateKey, new TextEncoder().encode(h + "." + p));
  return h + "." + p + "." + b64url(s);
}
// Apple .p8 (ES256) δοκιμαστικό — ΜΟΝΟ για το τεστ
const ec = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const pkcs8 = Buffer.from(await webcrypto.subtle.exportKey("pkcs8", ec.privateKey)).toString("base64");
const P8_PEM = "-----BEGIN PRIVATE KEY-----\n" + pkcs8.match(/.{1,64}/g).join("\n") + "\n-----END PRIVATE KEY-----";

const env = {
  DB: d1(db), KM_PUBLIC_ORIGIN: "https://fastwrite.tech", KM_ADMIN_KEY: "k",
  GOOGLE_CLIENT_ID: "gcid.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "gsec",
  MS_CLIENT_ID: "mscid", MS_CLIENT_SECRET: "mssec",
  APPLE_CLIENT_ID: "tech.fastwrite.kostometro.web", APPLE_TEAM_ID: "ABCDE12345", APPLE_KEY_ID: "KEYID12345", APPLE_PRIVATE_KEY: P8_PEM,
};

// ─── fetch προσομοίωση παρόχων ──────────────────────────────────────────
const seen = { token: [] };
let nextClaims = null;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (/\/certs$|\/keys$|discovery\/v2\.0\/keys$/.test(u)) return new Response(JSON.stringify({ keys: [{ kty: "RSA", kid: KID, n: rsaJwk.n, e: rsaJwk.e, alg: "RS256", use: "sig" }] }), { status: 200 });
  if (/\/token$/.test(u)) {
    const form = Object.fromEntries(new URLSearchParams(init.body));
    seen.token.push({ url: u, form });
    return new Response(JSON.stringify({ id_token: await idToken(nextClaims) }), { status: 200 });
  }
  throw new Error("unexpected fetch " + u);
};

const req = (path, opt) => {
  const r = new Request("https://fastwrite.tech" + path, opt);
  return KM.handleKm(r, env, {}, new URL(r.url).pathname);
};
const sha256b64url = async (s) => b64url(await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
function cookieOf(res) { return /km_oauth=([0-9a-f]{64})/.exec(res.headers.get("Set-Cookie") || "")?.[1]; }
function stateOf(res) { return new URL(res.headers.get("Location")).searchParams.get("state"); }
function nonceOf(res) { return new URL(res.headers.get("Location")).searchParams.get("nonce"); }

// ═══ 1 · Apple · ροή browser (PWA) ══════════════════════════════════════
{
  const r = await req("/api/km/auth/apple/start");
  const L = new URL(r.headers.get("Location"));
  ok("A1 apple/start → 302 appleid.apple.com", r.status === 302 && L.origin === "https://appleid.apple.com", L.pathname);
  ok("A2 response_mode=form_post + scope 'email' (μόνο) + χωρίς PKCE/prompt", L.searchParams.get("response_mode") === "form_post" && L.searchParams.get("scope") === "email" && !L.searchParams.get("code_challenge") && !L.searchParams.get("prompt"));
  ok("A3 cookie state SameSite=None (cross-site POST)", /SameSite=None/.test(r.headers.get("Set-Cookie")) && /Secure/.test(r.headers.get("Set-Cookie")), r.headers.get("Set-Cookie").slice(0, 40) + "…");
  ok("A4 redirect_uri = /api/km/auth/apple/callback", L.searchParams.get("redirect_uri") === "https://fastwrite.tech/api/km/auth/apple/callback");
  const st = stateOf(r), nonce = nonceOf(r);
  ok("A5 state = cookie, 64 hex", st === cookieOf(r) && /^[0-9a-f]{64}$/.test(st));
  nextClaims = { iss: "https://appleid.apple.com", aud: env.APPLE_CLIENT_ID, sub: "001234.abcd", email: "abc123@privaterelay.appleid.com", email_verified: "true", is_private_email: "true", nonce, exp: Math.floor(Date.now() / 1000) + 600 };
  const cb = await req("/api/km/auth/apple/callback", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: "km_oauth=" + st }, body: new URLSearchParams({ code: "apple-code-1", state: st, user: JSON.stringify({ name: { firstName: "X" } }) }).toString() });
  const loc = cb.headers.get("Location") || "";
  ok("A6 callback POST (form_post) → 302 /kostometro/#km_oauth=ok&p=apple&e=relay", cb.status === 302 && /#km_oauth=ok/.test(loc) && /p=apple/.test(loc) && /privaterelay\.appleid\.com/.test(loc), loc.replace(/t=[0-9a-f]{64}/, "t=…"));
  const tk = seen.token.at(-1);
  ok("A7 token endpoint: client_secret = JWT ES256, χωρίς code_verifier", tk && tk.url === "https://appleid.apple.com/auth/token" && !tk.form.code_verifier && tk.form.client_secret.split(".").length === 3);
  const [h, p, s] = tk.form.client_secret.split(".");
  const head = JSON.parse(Buffer.from(h, "base64url")), body = JSON.parse(Buffer.from(p, "base64url"));
  const good = await webcrypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, ec.publicKey, Buffer.from(s, "base64url"), new TextEncoder().encode(h + "." + p));
  ok("A8 JWT: alg ES256, kid, iss=Team ID, sub=Services ID, aud=appleid.apple.com, exp ≤ 10′, υπογραφή έγκυρη με το .p8", good && head.alg === "ES256" && head.kid === env.APPLE_KEY_ID && body.iss === env.APPLE_TEAM_ID && body.sub === env.APPLE_CLIENT_ID && body.aud === "https://appleid.apple.com" && body.exp - body.iat === 600);
  const tokRaw = /t=([0-9a-f]{64})/.exec(loc)[1];
  const row = db.prepare("SELECT email FROM km_email_tokens WHERE token_hash = ?").get(await sha256hex(tokRaw));
  ok("A9 email_token εκδόθηκε για το relay email (ίδιο μονοπάτι με Google)", row && row.email === "abc123@privaterelay.appleid.com");
  ok("A10 cookie σβήνεται στο callback", /km_oauth=;/.test(cb.headers.get("Set-Cookie") || ""));
}
// ═══ 2 · Apple · ακύρωση με POST (user_cancelled_authorize) ═════════════
{
  const r = await req("/api/km/auth/apple/start");
  const st = stateOf(r);
  const cb = await req("/api/km/auth/apple/callback", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: "km_oauth=" + st }, body: new URLSearchParams({ error: "user_cancelled_authorize", state: st }).toString() });
  ok("B1 ακύρωση Apple (POST error) → #km_oauth=err&code=cancelled", cb.status === 302 && /km_oauth=err&code=cancelled/.test(cb.headers.get("Location")));
  const cb2 = await req("/api/km/auth/apple/callback", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: "km_oauth=" + st }, body: new URLSearchParams({ code: "x", state: st }).toString() });
  ok("B2 ίδιο state δεύτερη φορά → err&code=state (μία χρήση)", /code=state/.test(cb2.headers.get("Location")));
}
// ═══ 3 · Apple · ροή ΕΦΑΡΜΟΓΗΣ (app=1, RFC 8252) — επιτυχία ═════════════
{
  const v = b64url(webcrypto.getRandomValues(new Uint8Array(32))), ac = await sha256b64url(v);
  const r = await req("/api/km/auth/apple/start?app=1&ac=" + ac);
  ok("C1 app=1 apple/start → 302 Apple, app_ch στη γραμμή", r.status === 302 && db.prepare("SELECT app_ch FROM km_oauth_states WHERE app_ch = ?").get(ac));
  const st = stateOf(r), nonce = nonceOf(r);
  nextClaims = { iss: "https://appleid.apple.com", aud: env.APPLE_CLIENT_ID, sub: "001234.efgh", email: "real@icloud.com", email_verified: true, nonce, exp: Math.floor(Date.now() / 1000) + 600 };
  const cb = await req("/api/km/auth/apple/callback", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: "km_oauth=" + st }, body: new URLSearchParams({ code: "apple-code-2", state: st }).toString() });
  const html = await cb.text();
  const hm = /tech\.fastwrite\.kostometro:\/\/oauth\?h=([0-9a-f]{64})/.exec(html);
  ok("C2 callback → σελίδα επιστροφής 200 με σχήμα tech.fastwrite.kostometro://oauth?h=…, χωρίς token μέσα", cb.status === 200 && hm && !/km_oauth=ok/.test(html) && !/[0-9a-f]{64}.*[0-9a-f]{64}/.test(html.replace(hm[1], "")));
  const bad = await req("/api/km/auth/app/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ h: hm[1], v: b64url(webcrypto.getRandomValues(new Uint8Array(32))) }) });
  ok("C3 redeem με λάθος v → 403 mismatch", bad.status === 403);
  const burned = await req("/api/km/auth/app/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ h: hm[1], v }) });
  ok("C4 μετά το λάθος, το h κάηκε → 410", burned.status === 410);
}
{
  const v = b64url(webcrypto.getRandomValues(new Uint8Array(32))), ac = await sha256b64url(v);
  const r = await req("/api/km/auth/apple/start?app=1&ac=" + ac);
  const st = stateOf(r), nonce = nonceOf(r);
  nextClaims = { iss: "https://appleid.apple.com", aud: env.APPLE_CLIENT_ID, sub: "001234.ijkl", email: "real2@icloud.com", email_verified: true, nonce, exp: Math.floor(Date.now() / 1000) + 600 };
  const cb = await req("/api/km/auth/apple/callback", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: "km_oauth=" + st }, body: new URLSearchParams({ code: "apple-code-3", state: st }).toString() });
  const hm = /oauth\?h=([0-9a-f]{64})/.exec(await cb.text());
  const good = await req("/api/km/auth/app/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ h: hm[1], v }) });
  const j = await good.json();
  ok("C5 redeem με σωστό v → 200 {km_oauth:ok, p:apple, e, t}", good.status === 200 && j.km_oauth === "ok" && j.p === "apple" && j.e === "real2@icloud.com" && /^[0-9a-f]{64}$/.test(j.t));
  const again = await req("/api/km/auth/app/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ h: hm[1], v }) });
  ok("C6 δεύτερη εξαργύρωση → 410 (μία χρήση)", again.status === 410);
}
// ═══ 4 · Apple · ακύρωση στη ροή εφαρμογής, bad_request, unavailable ═════
{
  const v = b64url(webcrypto.getRandomValues(new Uint8Array(32))), ac = await sha256b64url(v);
  const r = await req("/api/km/auth/apple/start?app=1&ac=" + ac);
  const st = stateOf(r);
  const cb = await req("/api/km/auth/apple/callback", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: "km_oauth=" + st }, body: new URLSearchParams({ error: "user_cancelled_authorize", state: st }).toString() });
  const hm = /oauth\?h=([0-9a-f]{64})/.exec(await cb.text());
  const j = await (await req("/api/km/auth/app/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ h: hm[1], v }) })).json();
  ok("D1 ακύρωση στην εφαρμογή → h → redeem = {km_oauth:err, code:cancelled}", hm && j.km_oauth === "err" && j.code === "cancelled");
  const br = await req("/api/km/auth/apple/start?app=1&ac=short");
  ok("D2 app=1 με άκυρο ac → σελίδα με ?err=bad_request", br.status === 200 && /oauth\?err=bad_request/.test(await br.text()));
  const env2 = Object.assign({}, env, { APPLE_PRIVATE_KEY: "" });
  const r2 = await KM.handleKm(new Request("https://fastwrite.tech/api/km/auth/apple/start"), env2, {}, "/api/km/auth/apple/start");
  ok("D3 χωρίς .p8 → unavailable (browser)", r2.status === 302 && /code=unavailable/.test(r2.headers.get("Location")));
  const r3 = await KM.handleKm(new Request("https://fastwrite.tech/api/km/auth/apple/start?app=1&ac=" + ac), env2, {}, "/api/km/auth/apple/start");
  ok("D4 χωρίς .p8 → unavailable (εφαρμογή, μέσω σχήματος)", r3.status === 200 && /err=unavailable/.test(await r3.text()));
  const r4 = await req("/api/km/auth/apple/callback", { method: "GET" });
  ok("D5 callback Apple με GET χωρίς state → err&code=state (δεν σκάει)", r4.status === 302 && /code=state/.test(r4.headers.get("Location")));
  const r5 = await req("/api/km/auth/google/callback", { method: "POST", body: "" });
  ok("D6 POST στο callback της Google ΔΕΝ δρομολογείται (μόνο Apple δέχεται POST)", r5.status === 404 || r5.status === 405, "status " + r5.status);
}
// ═══ 5 · Apple · έλεγχοι id_token ═════════════════════════════════════════
{
  const r = await req("/api/km/auth/apple/start");
  const st = stateOf(r), nonce = nonceOf(r);
  nextClaims = { iss: "https://appleid.apple.com", aud: "other-client", sub: "x", email: "a@b.c", email_verified: true, nonce, exp: Math.floor(Date.now() / 1000) + 600 };
  const cb = await req("/api/km/auth/apple/callback", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: "km_oauth=" + st }, body: new URLSearchParams({ code: "c", state: st }).toString() });
  ok("E1 λάθος aud → code=provider", /code=provider/.test(cb.headers.get("Location")));
  const r2 = await req("/api/km/auth/apple/start");
  const st2 = stateOf(r2), nonce2 = nonceOf(r2);
  nextClaims = { iss: "https://appleid.apple.com", aud: env.APPLE_CLIENT_ID, sub: "x", email: "a@b.c", email_verified: true, nonce: "wrong", exp: Math.floor(Date.now() / 1000) + 600 };
  const cb2 = await req("/api/km/auth/apple/callback", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: "km_oauth=" + st2 }, body: new URLSearchParams({ code: "c", state: st2 }).toString() });
  ok("E2 λάθος nonce → code=provider", /code=provider/.test(cb2.headers.get("Location")));
  const r3 = await req("/api/km/auth/apple/start");
  const st3 = stateOf(r3), nonce3 = nonceOf(r3);
  nextClaims = { iss: "https://appleid.apple.com", aud: env.APPLE_CLIENT_ID, sub: "x", email: "a@b.c", email_verified: "false", nonce: nonce3, exp: Math.floor(Date.now() / 1000) + 600 };
  const cb3 = await req("/api/km/auth/apple/callback", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: "km_oauth=" + st3 }, body: new URLSearchParams({ code: "c", state: st3 }).toString() });
  ok("E3 email_verified=false → km_oauth=verify (πέφτει στον 6ψήφιο)", /km_oauth=verify/.test(cb3.headers.get("Location")));
  // λογαριασμός που υπάρχει ήδη
  db.prepare("INSERT INTO km_accounts (folder_id, email, deleted, delete_due_at) VALUES ('f1','taken@icloud.com',NULL,NULL)").run();
  const r4 = await req("/api/km/auth/apple/start");
  const st4 = stateOf(r4), nonce4 = nonceOf(r4);
  nextClaims = { iss: "https://appleid.apple.com", aud: env.APPLE_CLIENT_ID, sub: "x", email: "taken@icloud.com", email_verified: true, nonce: nonce4, exp: Math.floor(Date.now() / 1000) + 600 };
  const cb4 = await req("/api/km/auth/apple/callback", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: "km_oauth=" + st4 }, body: new URLSearchParams({ code: "c", state: st4 }).toString() });
  ok("E4 email σε υπάρχοντα λογαριασμό → code=taken (ίδια ροή με Google)", /code=taken/.test(cb4.headers.get("Location")));
}
// ═══ 6 · Google/Microsoft ΑΜΕΤΑΒΛΗΤΑ ═══════════════════════════════════════
{
  const r = await req("/api/km/auth/google/start");
  const L = new URL(r.headers.get("Location"));
  ok("F1 google/start: PKCE S256 + prompt=select_account + scope openid email profile + SameSite=Lax", L.searchParams.get("code_challenge_method") === "S256" && L.searchParams.get("prompt") === "select_account" && L.searchParams.get("scope") === "openid email profile" && !L.searchParams.get("response_mode") && /SameSite=Lax/.test(r.headers.get("Set-Cookie")));
  const st = stateOf(r), nonce = nonceOf(r);
  nextClaims = { iss: "https://accounts.google.com", aud: env.GOOGLE_CLIENT_ID, sub: "g1", email: "g@gmail.com", email_verified: true, nonce, exp: Math.floor(Date.now() / 1000) + 600 };
  const cb = await req("/api/km/auth/google/callback?code=gc&state=" + st, { headers: { Cookie: "km_oauth=" + st } });
  const tk = seen.token.at(-1);
  ok("F2 google/callback GET → #km_oauth=ok&p=google · token form με code_verifier + σταθερό client_secret", cb.status === 302 && /km_oauth=ok/.test(cb.headers.get("Location")) && /p=google/.test(cb.headers.get("Location")) && tk.form.code_verifier && tk.form.client_secret === "gsec");
  const m = await req("/api/km/auth/microsoft/start");
  ok("F3 microsoft/start → 302 login.microsoftonline.com, SameSite=Lax", m.status === 302 && /login\.microsoftonline\.com/.test(m.headers.get("Location")) && /SameSite=Lax/.test(m.headers.get("Set-Cookie")));
  const stm = stateOf(m), noncem = nonceOf(m);
  nextClaims = { iss: "https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0", tid: "9188040d-6c67-4c5b-b112-36a304b66dad", aud: env.MS_CLIENT_ID, sub: "m1", email: "m@outlook.com", nonce: noncem, exp: Math.floor(Date.now() / 1000) + 600 };
  const cbm = await req("/api/km/auth/microsoft/callback?code=mc&state=" + stm, { headers: { Cookie: "km_oauth=" + stm } });
  ok("F4 microsoft/callback → #km_oauth=ok&p=microsoft", /km_oauth=ok/.test(cbm.headers.get("Location")) && /p=microsoft/.test(cbm.headers.get("Location")));
  // Google στη ροή εφαρμογής (K3 χθες) — ξανά, πάνω στο νέο αντίγραφο
  const v = b64url(webcrypto.getRandomValues(new Uint8Array(32))), ac = await sha256b64url(v);
  const g = await req("/api/km/auth/google/start?app=1&ac=" + ac);
  const stg = stateOf(g), nonceg = nonceOf(g);
  nextClaims = { iss: "https://accounts.google.com", aud: env.GOOGLE_CLIENT_ID, sub: "g2", email: "g2@gmail.com", email_verified: true, nonce: nonceg, exp: Math.floor(Date.now() / 1000) + 600 };
  const cbg = await req("/api/km/auth/google/callback?code=gc2&state=" + stg, { headers: { Cookie: "km_oauth=" + stg } });
  const hm = /oauth\?h=([0-9a-f]{64})/.exec(await cbg.text());
  const jg = await (await req("/api/km/auth/app/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ h: hm[1], v }) })).json();
  ok("F5 Google στη ροή εφαρμογής (K3) → redeem ok, p=google", cbg.status === 200 && jg.km_oauth === "ok" && jg.p === "google");
  const fr = await req("/api/km/funnel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ install_id: "x", step: "oauth_apple", src: "direct" }) });
  ok("F6 funnel δέχεται step=oauth_apple (δεν είναι 400)", fr.status !== 400, "status " + fr.status);
}

{ // G · όριο σώματος στο POST της Apple (17/10/2026)
  const rg = await req("/api/km/auth/apple/start");
  const stg = stateOf(rg), nonceg = nonceOf(rg);
  nextClaims = { iss: "https://appleid.apple.com", aud: env.APPLE_CLIENT_ID, sub: "g", email: "big@b.c", email_verified: true, nonce: nonceg, exp: Math.floor(Date.now() / 1000) + 600 };
  const big = await req("/api/km/auth/apple/callback", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": "20000", Cookie: "km_oauth=" + stg }, body: new URLSearchParams({ code: "c", state: stg }).toString() });
  ok("G1 POST > 16 KB → err&code=state, χωρίς ανάγνωση", big.status === 302 && /km_oauth=err&code=state/.test(big.headers.get("Location") || ""));
}

async function sha256hex(s) { return Buffer.from(await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(s))).toString("hex"); }

const pass = results.filter((r) => r.ok).length;
if (ONLY) { if (pass !== results.length) { console.log("Μ" + ONLY + " → κοκκίνισε ✔"); process.exit(0); } console.log("Μ" + ONLY + " ΠΕΡΑΣΕ — το τεστ δεν πιάνει τίποτα"); process.exit(1); }
console.log("\n" + pass + "/" + results.length + " OK");
if (pass !== results.length) process.exit(1);
