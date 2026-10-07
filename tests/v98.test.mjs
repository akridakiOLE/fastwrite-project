// v98 · KM-OAUTH — Σύνδεση με Google / Microsoft (29/9/2026, Brief_Agent_Syndesi Μέρος Α)
//   node --experimental-sqlite tests/v98.test.mjs  ·  --mutate=N (ΠΡΕΠΕΙ να κοκκινίσει)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { webcrypto, generateKeyPairSync, createSign } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let src = readFileSync("src/km.js", "utf8");
let js = readFileSync("site/kostometro/app.js", "utf8");
let html = readFileSync("site/kostometro/index.html", "utf8");
const MUT = [
  ["src", "  if (claims.nonce !== nonce) throw new Error(\"bad_nonce\");\n", ""],                                    // 1 · 🔴 nonce αγνοείται
  ["src", "  if (!good) throw new Error(\"bad_sig\");\n", ""],                                                        // 2 · 🔴 πλαστή υπογραφή δεκτή
  ["src", "  if (!aud.includes(clientId)) throw new Error(\"bad_aud\");\n", ""],                                    // 3 · 🔴 token άλλης εφαρμογής δεκτό
  ["src", "verified: (c) => c.email_verified === true || c.email_verified === \"true\",", "verified: (c) => true,"],   // 4 · 🔴 ανεπιβεβαίωτο Google email δεκτό
  ["src", "verified: (c) => c.tid === MS_CONSUMER_TID ||", "verified: (c) => true ||"],                               // 5 · 🔴 εταιρικό MS χωρίς επιβεβαίωση δεκτό
  ["src", "DELETE FROM km_oauth_states WHERE state_hash = ? RETURNING *", "SELECT * FROM km_oauth_states WHERE state_hash = ?"], // 6 · 🔴 επανάληψη state
  ["src", " || cookieVal(request, \"km_oauth\") !== state", ""],                                                     // 7 · 🔴 state χωρίς cookie (CSRF σύνδεσης)
  ["src", "code_challenge: challenge, code_challenge_method: \"S256\"", "code_challenge: verifier, code_challenge_method: \"plain\""], // 8 · PKCE plain
  ["src", "  if (busy) return oauthBack(env, oauthFrag(\"err\", { code: busy, e: email }), true);\n", ""],           // 9 · 🔴 δεύτερος λογαριασμός στο ίδιο email
  ["js", "    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}\n", ""],   // 10 · 🔴 token μένει στη διεύθυνση
  ["src", " oauth_google: 1, oauth_microsoft: 1 };", " };"],                                                         // 11 · το χωνί δεν μετράει τα πατήματα
  ["js", "      if (refIn) { localStorage.setItem(LS.src, 'ref:' + refIn); }\n      else if (/^ref:/.test(src)) { localStorage.setItem(LS.src, 'direct'); }\n      var ck = el('ref-consent-ok');", "      var ck = el('ref-consent-ok');"], // 12 · 🔴 σύσταση χάνεται στο Google
];
if (ONLY) { const m = MUT[ONLY - 1]; if (!m) process.exit(2); const bag = { src, js, html };
  if (!bag[m[0]].includes(m[1])) { console.log("Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(3); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ src, js, html } = bag); }
let failed = 0;
const check = async (n, f) => { try { await f(); if (!ONLY) console.log("  ✔ " + n); } catch (e) { failed++; console.log("  ✘ " + n + " — " + e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
const db = new DatabaseSync(":memory:");
for (const f of ["km.sql", "km_h13.sql", "km_v54.sql", "km_mail.sql", "km_feedback.sql", "km_h11b.sql", "km_ref.sql", "km_ref2.sql", "km_verify.sql", "km_support.sql", "km_support_v95.sql", "km_funnel.sql", "km_leads.sql", "km_pinakas.sql", "km_oauth.sql"]) {
  let sql; try { sql = readFileSync("schema/" + f, "utf8"); } catch (e) { continue; }
  sql = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  for (const s of sql.split(";")) { const t = s.trim(); if (!t) continue; try { db.exec(t + ";"); } catch (e) { if (!/duplicate column|already exists/i.test(e.message)) throw e; } }
}
const stmt = (sql, args) => { const p = db.prepare(sql); return { async first() { return p.get(...args) ?? null; },
  async run() { const r = p.run(...args); return { meta: { changes: Number(r.changes) } }; }, async all() { return { results: p.all(...args) }; } }; };
const DB = { prepare: (sql) => ({ bind: (...a) => stmt(sql, a), ...stmt(sql, []) }), async batch(l) { for (const s of l) await s.run(); return []; } };
const GID = "g-client.apps.googleusercontent.com", MID = "m-client-id";
const env = { DB, KM_ADMIN_KEY: "adm1n", GOOGLE_CLIENT_ID: GID, GOOGLE_CLIENT_SECRET: "gsec", MS_CLIENT_ID: MID, MS_CLIENT_SECRET: "msec" };
// ── ψεύτικος πάροχος: δικό μας RSA ζεύγος, JWKS, token endpoint ──
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const { privateKey: evilKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = publicKey.export({ format: "jwk" });
const b64u = (b) => Buffer.from(b).toString("base64url");
const sign = (claims, key) => { const h = b64u(JSON.stringify({ alg: "RS256", kid: "k1", typ: "JWT" })), p = b64u(JSON.stringify(claims));
  const s = createSign("RSA-SHA256"); s.update(h + "." + p); return h + "." + p + "." + s.sign(key || privateKey).toString("base64url"); };
let nextIdToken = null, lastTokenBody = null;
globalThis.fetch = async (url, o) => {
  if (/certs|keys$/.test(url)) return new Response(JSON.stringify({ keys: [{ ...jwk, kid: "k1", alg: "RS256", use: "sig" }] }));
  if (/token$/.test(url)) { lastTokenBody = new URLSearchParams(o.body); return new Response(JSON.stringify({ id_token: nextIdToken() })); }
  throw new Error("fetch " + url);
};
const call = async (path, headers) => mod.handleKm(new Request("https://fastwrite.tech" + path, { headers: headers || {} }), env, null, path.split("?")[0]);
const frag = (r) => new URLSearchParams((r.headers.get("Location") || "").split("#")[1] || "");
async function start(prov, ip) {
  const r = await call("/api/km/auth/" + prov + "/start", ip ? { "CF-Connecting-IP": ip } : {});
  const loc = new URL(r.headers.get("Location")); const ck = /km_oauth=([0-9a-f]{64})/.exec(r.headers.get("Set-Cookie") || "");
  return { r, loc, state: loc.searchParams.get("state"), nonce: loc.searchParams.get("nonce"), cookie: ck && ck[1] };
}
const G = (nonce, extra) => () => sign(Object.assign({ iss: "https://accounts.google.com", aud: GID, exp: Math.floor(Date.now() / 1000) + 600, nonce, email: "maria@gmail.com", email_verified: true }, extra || {}));
const back = (prov, s, cookie) => call("/api/km/auth/" + prov + "/callback?code=abc&state=" + s, { Cookie: "km_oauth=" + (cookie === undefined ? s : cookie) });

await check("Ο-1 · start → Google με PKCE S256, state σε cookie HttpOnly, στη βάση ΜΟΝΟ hash", async () => {
  const s = await start("google");
  ok(s.r.status === 302 && s.loc.origin + s.loc.pathname === "https://accounts.google.com/o/oauth2/v2/auth", "προορισμός");
  ok(s.loc.searchParams.get("code_challenge_method") === "S256" && s.loc.searchParams.get("code_challenge").length === 43, "PKCE");
  ok(s.loc.searchParams.get("redirect_uri") === "https://fastwrite.tech/api/km/auth/google/callback", "redirect_uri");
  ok(s.loc.searchParams.get("scope") === "openid email profile", "scope");
  ok(s.cookie === s.state && /HttpOnly/.test(s.r.headers.get("Set-Cookie")) && /Secure/.test(s.r.headers.get("Set-Cookie")), "cookie");
  const rows = db.prepare("SELECT * FROM km_oauth_states").all();
  ok(rows.length === 1 && !JSON.stringify(rows).includes(s.state), "ωμό state στη βάση");
  ok(s.loc.searchParams.get("code_challenge") !== rows[0].verifier, "challenge = verifier");
});
await check("Ο-2 · 🔴 επιτυχία Google → #km_oauth=ok με token 64 hex, δεμένο στο email · state σβήστηκε · PKCE verifier στάλθηκε", async () => {
  const s = await start("google"); nextIdToken = G(s.nonce);
  const r = await back("google", s.state); const f = frag(r);
  ok(r.status === 302 && f.get("km_oauth") === "ok" && /^[0-9a-f]{64}$/.test(f.get("t")) && f.get("e") === "maria@gmail.com", "frag " + f);
  ok(db.prepare("SELECT COUNT(*) AS n FROM km_email_tokens WHERE email = ?").get("maria@gmail.com").n === 1, "token στη βάση");
  ok(lastTokenBody.get("code_verifier") && lastTokenBody.get("client_secret") === "gsec", "verifier/secret");
  ok(/Max-Age=0/.test(r.headers.get("Set-Cookie")), "cookie δεν σβήστηκε");
  const again = await back("google", s.state); ok(frag(again).get("km_oauth") === "err" && frag(again).get("code") === "state", "🔴 επανάληψη δεκτή");
});
await check("Ο-3 · 🔴 state χωρίς ταίριασμα cookie → απόρριψη (καμία κλήση στον πάροχο)", async () => {
  const s = await start("google"); nextIdToken = G(s.nonce); lastTokenBody = null;
  const r = await back("google", s.state, "0".repeat(64));
  ok(frag(r).get("code") === "state" && lastTokenBody === null, "δεκτό χωρίς cookie");
});
await check("Ο-4 · 🔴 πλαστή υπογραφή · λάθος nonce · λάθος aud · ληγμένο → απόρριψη", async () => {
  for (const [name, mk] of [["υπογραφή", (n) => () => sign({ iss: "https://accounts.google.com", aud: GID, exp: Math.floor(Date.now() / 1000) + 600, nonce: n, email: "x1@gmail.com", email_verified: true }, evilKey)],
    ["nonce", () => G("f".repeat(32))], ["aud", (n) => G(n, { aud: "other-app" })], ["λήξη", (n) => G(n, { exp: 1000 })]]) {
    const s = await start("google"); nextIdToken = mk(s.nonce);
    const r = await back("google", s.state);
    ok(frag(r).get("km_oauth") === "err" && frag(r).get("code") === "provider", name + " δεκτό");
  }
});
await check("Ο-5 · 🔴 Google χωρίς email_verified → «verify» (κωδικός 6 ψηφίων), ΟΧΙ token", async () => {
  const s = await start("google"); nextIdToken = G(s.nonce, { email: "nov@gmail.com", email_verified: false });
  const f = frag(await back("google", s.state)); ok(f.get("km_oauth") === "verify" && f.get("e") === "nov@gmail.com" && !f.get("t"), "frag " + f);
});
await check("Ο-6 · 🔴 Microsoft: προσωπικός → ok · εταιρικός χωρίς xms_edov → verify · με xms_edov → ok", async () => {
  const M = (n, tid, extra) => () => sign(Object.assign({ iss: "https://login.microsoftonline.com/" + tid + "/v2.0", tid, aud: MID, exp: Math.floor(Date.now() / 1000) + 600, nonce: n }, extra));
  let s = await start("microsoft"); ok(s.loc.hostname === "login.microsoftonline.com", "προορισμός MS");
  nextIdToken = M(s.nonce, "9188040d-6c67-4c5b-b112-36a304b66dad", { email: "nikos@outlook.com" });
  ok(frag(await back("microsoft", s.state)).get("km_oauth") === "ok", "προσωπικός");
  const T = "11111111-2222-3333-4444-555555555555";
  s = await start("microsoft"); nextIdToken = M(s.nonce, T, { email: "ceo@firm.co.uk" });
  ok(frag(await back("microsoft", s.state)).get("km_oauth") === "verify", "🔴 εταιρικός ανεπιβεβαίωτος δεκτός");
  s = await start("microsoft"); nextIdToken = M(s.nonce, T, { email: "cfo@firm.co.uk", xms_edov: true });
  ok(frag(await back("microsoft", s.state)).get("km_oauth") === "ok", "εταιρικός επιβεβαιωμένος");
  s = await start("microsoft"); nextIdToken = M(s.nonce, T, { email: "z@firm.co.uk", iss: "https://evil/v2.0" });
  ok(frag(await back("microsoft", s.state)).get("code") === "provider", "λάθος iss δεκτό");
});
await check("Ο-7 · 🔴 email με ζωντανό λογαριασμό → «taken» (κανένας δεύτερος λογαριασμός)", async () => {
  db.prepare("INSERT INTO km_accounts (folder_id, email, auth_hash, created) VALUES (?, ?, ?, ?)").run("a".repeat(64), "taken@gmail.com", "b".repeat(64), new Date().toISOString());
  const s = await start("google"); nextIdToken = G(s.nonce, { email: "taken@gmail.com" });
  const f = frag(await back("google", s.state)); ok(f.get("km_oauth") === "err" && f.get("code") === "taken" && !f.get("t"), "frag " + f);
});
await check("Ο-8 · χωρίς ρύθμιση → «unavailable» · ακύρωση στον πάροχο → «cancelled» · όριο 30/ώρα ανά IP", async () => {
  const r = await mod.handleKm(new Request("https://fastwrite.tech/api/km/auth/google/start"), { DB }, null, "/api/km/auth/google/start");
  ok(frag(r).get("code") === "unavailable", "unavailable");
  ok(frag(await call("/api/km/auth/google/callback?error=access_denied")).get("code") === "cancelled", "cancelled");
  let last; for (let i = 0; i < 31; i++) last = await start("google", "9.9.9.9");
  ok(frag(last.r).get("code") === "too_many", "όριο");
});
await check("Ο-9 · το χωνί δέχεται oauth_google / oauth_microsoft", async () => {
  for (const step of ["oauth_google", "oauth_microsoft"]) {
    const r = await mod.handleKm(new Request("https://x/api/km/funnel", { method: "POST", body: JSON.stringify({ install_id: "km_o", step, src: "leads" }) }), env, null, "/api/km/funnel");
    ok(r.status === 200, step);
  }
});
// ── εφαρμογή ──
const slice = (a, b) => { const i = js.indexOf(a), j2 = js.indexOf(b, i); if (i < 0 || j2 < 0) throw new Error("λείπει " + a); return js.slice(i, j2); };
await check("Ο-10 · 🔴 η εφαρμογή διαβάζει ΚΑΙ ΣΒΗΝΕΙ το #km_oauth · απορρίπτει άκυρο token", async () => {
  const mk = (hash) => { const loc = { hash, pathname: "/kostometro/", search: "?src=leads" }; const hist = [];
    const f = new Function("location", "history", "validEmail", slice("  function oauthTake() {", "  var OAUTH_TEXT = {") + "\nreturn oauthTake;")(loc,
      { replaceState: (a, b, u) => { hist.push(u); loc.hash = ""; } }, (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v));
    return { f, hist, loc }; };
  const t = "c".repeat(64); const w = mk("#km_oauth=ok&t=" + t + "&e=maria%40gmail.com&p=google");
  const o = w.f(); ok(o.kind === "ok" && o.t === t && o.e === "maria@gmail.com", JSON.stringify(o));
  ok(w.hist[0] === "/kostometro/?src=leads" && w.loc.hash === "", "🔴 token έμεινε στη διεύθυνση");
  ok(mk("#km_oauth=ok&t=zz&e=x%40y.gr").f().kind === "err", "άκυρο token δεκτό");
  ok(mk("#foo").f() === null, "ξένο hash");
});
await check("Ο-11 · 🔴 κουμπιά στην οθόνη email, ΠΡΙΝ το πεδίο email · σύσταση γράφεται πριν φύγει · το ok ακολουθεί τη ροή του κωδικού", async () => {
  const sE = html.indexOf('id="s-email"'), g = html.indexOf('id="go-google"'), m = html.indexOf('id="go-microsoft"'), e = html.indexOf('id="in-email"');
  ok(sE > 0 && g > sE && m > g && e > m && html.indexOf("</section>", sE) > e, "θέση κουμπιών");
  const go = slice("  function oauthGo(p) {", "  if (el('go-google'))");
  ok(/localStorage\.setItem\(LS\.src, 'ref:' \+ refIn\)/.test(go) && go.indexOf("LS.src, 'ref:'") < go.indexOf("location.assign"), "σύσταση μετά το redirect");
  ok(go.includes("location.assign(KM_API + 'auth/' + p + '/start')"), "προορισμός");
  const bootOk = slice("    var oa = oauthTake();", "    var hasEmail");
  ok(/LS\.emailTok, oa\.t/.test(bootOk) && /LS\.email, oa\.e/.test(bootOk) && /silentAccount\(\)/.test(bootOk) /* v120: εγγραφή χωρίς οθόνη 12 λέξεων (Stavros 6/10) */ && /LS\.reg/.test(bootOk), "boot");
});
if (ONLY) { if (failed) { console.log("Μ" + ONLY + " → κοκκίνισε ✔"); process.exit(0); } console.log("Μ" + ONLY + " ΠΕΡΑΣΕ — το τεστ δεν πιάνει τίποτα"); process.exit(1); }
console.log(failed ? "ΑΠΕΤΥΧΑΝ " + failed : "✔ ΟΛΑ ΠΕΡΑΣΑΝ (11)"); process.exit(failed ? 1 : 0);
