// Brief ΣΤ — ΕΝΑ EMAIL = ΕΝΑΣ ΛΟΓΑΡΙΑΣΜΟΣ · ΚΩΔΙΚΟΣ 6 ΨΗΦΙΩΝ · ΣΥΣΤΑΣΗ ΣΤΟ iPHONE (24/9/2026)
//   node --experimental-sqlite tests/verify.test.mjs
//   node --experimental-sqlite tests/verify.test.mjs --mutate=N   (ΠΡΕΠΕΙ να κοκκινίσει)
//
// ΤΟ ΕΥΡΗΜΑ: 23–24/9 το ίδιο email (panos@interia.pl) έφτιαξε 3 λογαριασμούς —
// το register έκανε INSERT χωρίς κανέναν έλεγχο. Και η σύσταση χανόταν στο
// iPhone, γιατί το εικονίδιο ανοίγει στο start_url του manifest χωρίς ?ref=.

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let src = readFileSync("src/km.js", "utf8");
const MUTATIONS = [
  // Μ1 · 🔴 νέος λογαριασμός ΧΩΡΙΣ επιβεβαιωμένο email.
  ['if (!tok) return json({ ok: false, error: "email_unverified" }, 403);', 'if (false) return json({ ok: false, error: "email_unverified" }, 403);'],
  // Μ2 · 🔴 δεύτερος λογαριασμός με το ίδιο email στο register — το σφάλμα της 23/9.
  ['    const busy = await emailBusy(env, email);\n    if (busy) return json({ ok: false, error: busy }, 409);\n    const wrapped',
   '    const busy = null;\n    if (busy) return json({ ok: false, error: busy }, 409);\n    const wrapped'],
  // Μ3 · το αίτημα διαγραφής δεν ξεχωρίζει — ο χρήστης δεν μαθαίνει ότι μπορεί να ακυρώσει.
  ['return row.delete_due_at ? "pending_delete" : "taken";', 'return "taken";'],
  // Μ4 · 🔴 το token ΔΕΝ καίγεται — ένα token φτιάχνει άπειρους λογαριασμούς (με άλλα email δεν περνά, αλλά…)
  ['    stmts.push(env.DB.prepare("UPDATE km_email_tokens SET used = ? WHERE token_hash = ?").bind(ts, tok));\n', ''],
  // Μ5 · 🔴 ο κωδικός αποθηκεύεται ΚΑΘΑΡΟΣ στη βάση.
  ['.bind(email, await sha256hex(email + ":" + code), new Date(t).toISOString()', '.bind(email, code, new Date(t).toISOString()'],
  // Μ6 · 🔴 άπειρες προσπάθειες — ο κωδικός 6 ψηφίων σπάει με δοκιμές.
  ['if (row.attempts >= CODE_MAX_TRIES) return json', 'if (false) return json'],
  // Μ7 · κανένα όριο αποστολών — κάποιος καίει το πλάνο των 3.000 email.
  ['if (nEmail && nEmail.n >= CODE_PER_EMAIL_HOUR) return json', 'if (false) return json'],
  // Μ8 · αποτυχία email αγνοείται — ο χρήστης κοιτάει άδειο inbox.
  ['if (!sent) return json({ ok: false, error: "mail_failed" }, 502);', ''],
  // Μ9 · 🔴 token άλλου email γίνεται δεκτό.
  ['if (!row || row.used || row.email !== email) return null;', 'if (!row || row.used) return null;'],
  // Μ10 · 🔴 το manifest πετάει τον κωδικό — η σύσταση ξαναχάνεται στο iPhone.
  ['if (/^[A-Z0-9]{4,40}$/.test(ref)) parts.push("ref=" + ref);', ''],
  // Μ11 · ο έλεγχος κωδικού βλέπει και διαγραμμένους λογαριασμούς.
  ['"SELECT 1 AS x FROM km_accounts WHERE ref_code = ? AND deleted IS NULL LIMIT 1"', '"SELECT 1 AS x FROM km_accounts WHERE ref_code = ? LIMIT 1"'],
  // Μ12 · ο ληγμένος κωδικός δουλεύει.
  ['if (row.expires < now()) return json({ ok: false, error: "code_expired" }, 400);', ''],
  // Μ13 · το id του manifest αλλάζει ανά σύνδεσμο — δύο «εφαρμογές» για το λειτουργικό.
  ['    id: "/kostometro/",\n', ''],
];
if (ONLY) {
  const m = MUTATIONS[ONLY - 1];
  if (!m) { console.log("δεν υπάρχει Μ" + ONLY); process.exit(2); }
  if (!src.includes(m[0])) { console.log("Η ΜΕΤΑΛΛΑΞΗ Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(3); }
  src = src.replace(m[0], m[1]);
}
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));

const db = new DatabaseSync(":memory:");
for (const f of ["km.sql", "km_h13.sql", "km_v54.sql", "km_mail.sql", "km_feedback.sql", "km_h11b.sql", "km_ref.sql", "km_ref2.sql", "km_verify.sql"]) {
  const sql = readFileSync("schema/" + f, "utf8").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  for (const s of sql.split(";")) { const t = s.trim(); if (!t) continue;
    try { db.exec(t + ";"); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; } }
}
const stmt = (sql, args) => { const p = db.prepare(sql); return {
  async first() { return p.get(...args) ?? null; },
  async run() { const r = p.run(...args); return { meta: { changes: Number(r.changes) } }; },
  async all() { return { results: p.all(...args) }; } }; };
const DB = { prepare: (sql) => ({ bind: (...a) => stmt(sql, a), ...stmt(sql, []) }),
  async batch(list) { db.exec("BEGIN"); try { const out = []; for (const s of list) out.push(await s.run()); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; } } };
const FOLDERS = { async put() {}, async get() { return null; }, async delete() {}, async list() { return { objects: [], truncated: false }; } };
const sent = [];
let mailFail = false;
const env = { DB, FOLDERS, KM_ADMIN_KEY: "s3cret",
  EMAIL: { send: async (m) => { if (mailFail) throw new Error("boom"); sent.push(m); return { messageId: "m" }; } } };

const hex = (n) => [...webcrypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
const J = { "Content-Type": "application/json" };
const H = (id) => ({ "X-Km-Folder": id.folder, "X-Km-Auth": id.auth, "X-Km-Device": id.device });
const call = (path, opts) => mod.handleKm(new Request("https://x" + path, opts), env, null, path.split("?")[0]);
const post = (path, headers, body, ip) => call(path, { method: "POST",
  headers: Object.assign({}, J, ip ? { "CF-Connecting-IP": ip } : {}, headers || {}), body: JSON.stringify(body || {}) });
const newId = (email) => ({ folder: hex(32), auth: hex(32), device: "km_" + hex(6), email: email || ("u" + hex(4) + "@example.com") });
const lastCode = () => { const m = /είναι: (\d{6})/.exec(sent[sent.length - 1].text); return m ? m[1] : null; };
async function viaCode(email, ip) {
  const r = await post("/api/km/email/code", null, { email }, ip || "1.1.1." + Math.floor(Math.random() * 250));
  if (r.status !== 200) return { status: r.status, j: await r.json() };
  const v = await post("/api/km/email/verify", null, { email, code: lastCode() });
  return { status: v.status, j: await v.json() };
}
async function register(id, token, extra) {
  const r = await post("/api/km/register", H(id), Object.assign({ email: id.email, email_token: token }, extra || {}));
  return { status: r.status, j: await r.json() };
}

let failed = 0;
const check = async (n, f) => { try { await f(); if (!ONLY) console.log("  ✔ " + n); } catch (e) { failed++; console.log("  ✘ " + n + " — " + e.message); } };
const eq = (g, w, what) => { if (JSON.stringify(g) !== JSON.stringify(w)) throw new Error((what || "") + " πήρα " + JSON.stringify(g) + " περίμενα " + JSON.stringify(w)); };

await check("Β-1 · ο κωδικός φεύγει με email και ΔΕΝ αποθηκεύεται καθαρός", async () => {
  const email = "a" + hex(3) + "@example.com";
  const r = await post("/api/km/email/code", null, { email }, "9.9.9.1");
  eq(r.status, 200, "status:");
  const code = lastCode();
  if (!/^\d{6}$/.test(code || "")) throw new Error("δεν βρέθηκε 6ψήφιος στο email");
  const row = db.prepare("SELECT code_hash FROM km_email_codes WHERE email = ?").get(email);
  if (!row || row.code_hash === code || !/^[0-9a-f]{64}$/.test(row.code_hash)) throw new Error("ο κωδικός δεν είναι hash: " + (row && row.code_hash));
});

await check("Β-2 · 🔴 ροή: κωδικός → token → ΝΕΟΣ λογαριασμός · το token καίγεται", async () => {
  const id = newId();
  const v = await viaCode(id.email);
  eq(v.status, 200, "verify:");
  const r = await register(id, v.j.email_token);
  eq([r.status, r.j.account], [200, "new"], "register:");
  const again = await register(newId(id.email), v.j.email_token);
  eq(again.status, 403, "ξανά με το ίδιο token:");
});

await check("Β-3 · 🔴 register ΧΩΡΙΣ token → 403 · με token ΑΛΛΟΥ email → 403", async () => {
  const id = newId();
  eq((await register(id, null)).status, 403, "χωρίς token:");
  const other = await mod.issueEmailToken(env, "x" + hex(3) + "@example.com");
  eq((await register(id, other)).status, 403, "token άλλου email:");
});

await check("Β-4 · 🔴 ΙΔΙΟ EMAIL ΔΕΥΤΕΡΗ ΦΟΡΑ → «taken» και στον κωδικό ΚΑΙ στο register", async () => {
  const id = newId();
  const v = await viaCode(id.email);
  eq((await register(id, v.j.email_token)).status, 200, "πρώτος:");
  const r = await post("/api/km/email/code", null, { email: id.email }, "9.9.9.2");
  eq([r.status, (await r.json()).error], [409, "taken"], "κωδικός:");
  const tok = await mod.issueEmailToken(env, id.email);
  const r2 = await register(newId(id.email), tok);
  eq([r2.status, r2.j.error], [409, "taken"], "register:");
  const n = db.prepare("SELECT COUNT(*) AS n FROM km_accounts WHERE email = ?").get(id.email).n;
  eq(n, 1, "λογαριασμοί με αυτό το email:");
});

await check("Β-5 · αίτημα διαγραφής σε εξέλιξη → «pending_delete» (όχι «taken»)", async () => {
  const id = newId();
  await register(id, (await viaCode(id.email)).j.email_token);
  db.prepare("UPDATE km_accounts SET delete_due_at = ? WHERE folder_id = ?").run("2099-01-01T00:00:00Z", id.folder);
  const r = await post("/api/km/email/code", null, { email: id.email }, "9.9.9.3");
  eq((await r.json()).error, "pending_delete", "σφάλμα:");
  const r2 = await register(newId(id.email), await mod.issueEmailToken(env, id.email));
  eq([r2.status, r2.j.error], [409, "pending_delete"], "register:");
});

await check("Β-6 · διαγραμμένος λογαριασμός (ταφόπετρα) → το email ξαναγράφεται", async () => {
  const id = newId();
  await register(id, (await viaCode(id.email)).j.email_token);
  db.prepare("UPDATE km_accounts SET email = '', deleted = ? WHERE folder_id = ?").run("2026-09-24T00:00:00Z", id.folder);
  const v = await viaCode(id.email);
  eq(v.status, 200, "κωδικός:");
  eq((await register(newId(id.email), v.j.email_token)).status, 200, "νέα εγγραφή:");
});

await check("Β-7 · 🔴 Η ΕΙΣΟΔΟΣ με 12 λέξεις (υπάρχων λογαριασμός) ΔΕΝ θέλει token", async () => {
  const id = newId();
  await register(id, (await viaCode(id.email)).j.email_token);
  const other = { folder: id.folder, auth: id.auth, device: "km_" + hex(6), email: id.email };
  const r = await register(other, null);
  eq([r.status, r.j.account], [200, "existing"], "είσοδος:");
});

await check("Β-8 · λάθος κωδικός: μετράει · στις 5 κλειδώνει · ο σωστός μετά ΔΕΝ περνά", async () => {
  const email = "b" + hex(3) + "@example.com";
  await post("/api/km/email/code", null, { email }, "9.9.9.4");
  const good = lastCode();
  const bad = good === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) await post("/api/km/email/verify", null, { email, code: bad });
  const r = await post("/api/km/email/verify", null, { email, code: good });
  eq(r.status, 429, "μετά από 5 λάθη:");
});

await check("Β-9 · όριο αποστολών: 4η στην ίδια ώρα → 429", async () => {
  const email = "c" + hex(3) + "@example.com";
  const s = [];
  for (let i = 0; i < 4; i++) s.push((await post("/api/km/email/code", null, { email }, "8.8.8." + i)).status);
  eq(s, [200, 200, 200, 429], "διαδοχή:");
});

await check("Β-10 · αποτυχία email → 502 «mail_failed» (όχι σιωπηλό 200)", async () => {
  mailFail = true;
  try {
    const r = await post("/api/km/email/code", null, { email: "d" + hex(3) + "@example.com" }, "7.7.7.7");
    eq([r.status, (await r.json()).error], [502, "mail_failed"], "απάντηση:");
  } finally { mailFail = false; }
});

await check("Β-11 · ληγμένος κωδικός → «code_expired»", async () => {
  const email = "e" + hex(3) + "@example.com";
  await post("/api/km/email/code", null, { email }, "6.6.6.6");
  db.prepare("UPDATE km_email_codes SET expires = '2000-01-01T00:00:00Z' WHERE email = ?").run(email);
  const r = await post("/api/km/email/verify", null, { email, code: lastCode() });
  eq((await r.json()).error, "code_expired", "σφάλμα:");
});

await check("Β-12 · έλεγχος κωδικού πρόσκλησης: υπάρχει / δεν υπάρχει / διαγραμμένος", async () => {
  const id = newId();
  await register(id, (await viaCode(id.email)).j.email_token);
  const code = db.prepare("SELECT ref_code FROM km_accounts WHERE folder_id = ?").get(id.folder).ref_code;
  const q = async (c) => (await (await call("/api/km/ref/check?code=" + c, { method: "GET" })).json()).exists;
  eq(await q(code), true, "υπάρχων:");
  eq(await q("ZZZZZZZZZZ"), false, "ανύπαρκτος:");
  db.prepare("UPDATE km_accounts SET deleted = ? WHERE folder_id = ?").run("2026-09-24T00:00:00Z", id.folder);
  eq(await q(code), false, "διαγραμμένος:");
});

await check("Β-13 · 🔴 manifest: το start_url ΚΡΑΤΑΕΙ ref και src · σκουπίδια πετιούνται · id σταθερό", async () => {
  const m = async (qs) => (await call("/api/km/manifest" + qs, { method: "GET" })).json();
  const a = await m("?ref=mh8y9qvnhh&src=fb_cy");
  eq(a.start_url, "/kostometro/?ref=MH8Y9QVNHH&src=fb_cy", "start_url:");
  eq(a.id, "/kostometro/", "id:");
  eq(a.scope, "/kostometro/", "scope:");
  const b = await m("?ref=<script>&src=a b");
  eq(b.start_url, "/kostometro/", "σκουπίδια:");
});

await check("Β-14 · ο ΤΕΛΙΚΟΣ φρουρός στη βάση: μοναδικό index σε ζωντανά email", async () => {
  const email = "f" + hex(3) + "@example.com";
  const ins = (f) => db.prepare("INSERT INTO km_accounts (folder_id, auth_hash, email, created) VALUES (?, 'h', ?, 't')").run(f, email);
  ins(hex(32));
  let threw = false;
  try { ins(hex(32)); } catch (e) { threw = true; }
  eq(threw, true, "δεύτερο ζωντανό με το ίδιο email:");
});

if (ONLY) {
  if (failed) { console.log("Μ" + ONLY + ": κοκκίνισε (" + failed + ") ✓"); process.exit(0); }
  console.log("Μ" + ONLY + ": ΠΕΡΑΣΕ ΠΡΑΣΙΝΟ — ο φρουρός ΔΕΝ πιάνει τη μετάλλαξη"); process.exit(1);
}
if (failed) { console.log("\n" + failed + " ΑΠΕΤΥΧΑΝ"); process.exit(1); }
console.log("\n✔ ΟΛΑ ΠΕΡΑΣΑΝ (14)");
