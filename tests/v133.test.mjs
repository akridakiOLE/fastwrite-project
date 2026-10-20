// v133 · Πολιτική v2.6 + κουμπιά Apple + διαγραφή χωρίς την εφαρμογή (ΚΩΔ-6) + ειδοποίηση Πολιτικής — 18/10/2026
//   node --experimental-sqlite tests/v133.test.mjs            · --mutate=N (exit 0 = πιάστηκε)
import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync } from "node:fs";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
if (ONLY) process.on("uncaughtException", () => { console.log("Μ" + ONLY + " → κοκκίνισε ✔ (κατέρρευσε)"); process.exit(0); });
let SRC = readFileSync("src/km.js", "utf8");
const MUT = [
  ['  if (!adminOk(request, env)) return new Response("Not found", { status: 404 });\n  const b = (await safeJson(request)) || {};\n  const email = normEmail(b.email);\n  if (!email) return json({ ok: false, error: "bad_email" }, 400);\n  const accs',
   '  const b = (await safeJson(request)) || {};\n  const email = normEmail(b.email);\n  if (!email) return json({ ok: false, error: "bad_email" }, 400);\n  const accs'],      // 1 · delreq χωρίς κλειδί
  ['  if (row.attempts >= CODE_MAX_TRIES) return json({ ok: false, error: "too_many" }, 429);\n  if ((await sha256hex("delreq:"', '  if ((await sha256hex("delreq:"'],                       // 2 · απεριόριστες προσπάθειες
  ['  if (row.expires < now()) return json({ ok: false, error: "code_expired" }, 400);\n  if (row.attempts >= CODE_MAX_TRIES) return json({ ok: false, error: "too_many" }, 429);\n  if ((await sha256hex("delreq:"',
   '  if (row.attempts >= CODE_MAX_TRIES) return json({ ok: false, error: "too_many" }, 429);\n  if ((await sha256hex("delreq:"'],                        // 3 · ληγμένος δεκτός
  ['WHERE folder_id = ? AND email = ? AND deleted IS NULL AND delete_requested_at IS NULL`', 'WHERE folder_id = ? AND email = ? AND deleted IS NULL`'],        // 4 · δεύτερο αίτημα μετακινεί λήξη
  ['  const dryRun = b.dry_run === false ? false : true;\n  const acc = (await', '  const dryRun = false;\n  const acc = (await'],             // 5 · ειδοποίηση στέλνει χωρίς ερώτηση
  ['    if (r && r.ok) { done++; continue; }', ''],                                                  // 6 · διπλή αποστολή
  ['    if (!((c && c.meta && c.meta.changes) || 0)) { busy++; continue; }', ''],                    // 8 · ταυτόχρονη εκτέλεση στέλνει δεύτερο
  ['(viaMail ? " Το αίτημα έγινε με email', '(false ? " Το αίτημα έγινε με email'],                     // 9 · email διαγραφής χωρίς εφαρμογή λέει «κινητό»
  ['try { done.delreq_codes = await wipe("km_delreq_codes", "expires < ?", nowIso || now()); } catch (e) { done.delreq_codes = 0; }', ''],   // 10 · ληγμένοι κωδικοί μένουν για πάντα
  ['if (accs.length > 1) return json(', 'if (false) return json('],                                // 11 · διπλότυπα παγώνουν όλα
  ['if (!e || seen[e] || no[e] ||', 'if (!e || seen[e] ||'],                                        // 12 · email σε όσους διαγράφηκαν από τη λίστα
  ['if (!e || seen[e] || no[e] || MAIL_OURS_RE.test(e) || ', 'if (!e || seen[e] || no[e] || '],     // 7 · ελεγκτής καταστημάτων / δικά μας email παίρνουν ειδοποίηση
];
if (ONLY) { const m = MUT[ONLY - 1]; if (!m) process.exit(2); if (!SRC.includes(m[0])) { console.log("Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(3); } SRC = SRC.replace(m[0], m[1]); }
const mod = await import("data:text/javascript;base64," + Buffer.from(SRC).toString("base64"));
const results = [];
function ok(name, cond, info) { results.push({ ok: !!cond }); console.log((cond ? "✅" : "❌") + " " + name + (info ? "  — " + info : "")); }

const db = new DatabaseSync(":memory:");
for (const f of ["km.sql", "km_h13.sql", "km_v54.sql", "km_mail.sql", "km_h11b.sql", "km_ref.sql", "km_ref2.sql", "km_verify.sql", "km_support.sql", "km_support_v95.sql", "km_funnel.sql", "km_transfer.sql", "km_corr.sql", "km_leads.sql", "km_feedback.sql", "gnomi.sql", "km_apple.sql", "km_v133.sql"]) {
  const sql = readFileSync("schema/" + f, "utf8").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  for (const s of sql.split(";")) { const t = s.trim(); if (!t) continue; try { db.exec(t + ";"); } catch (e) { if (!/duplicate column|already exists/i.test(e.message)) throw e; } }
}
const stmt = (sql, args) => { const p = db.prepare(sql); return {
  async first() { return p.get(...args) ?? null; }, async run() { const r = p.run(...args); return { meta: { changes: Number(r.changes) } }; },
  async all() { return { results: p.all(...args) }; } }; };
const DB = { prepare: (sql) => ({ bind: (...a) => stmt(sql, a.map((x) => (x === undefined ? null : x))), ...stmt(sql, []) }),
  async batch(list) { for (const s of list) await s.run(); return []; } };
const sent = [];
const EMAIL = { send: async (m) => { sent.push(m); return { messageId: "m" + sent.length }; } };
const env = { DB, EMAIL, KM_ADMIN_KEY: "s3cret", FOLDERS: { list: async () => ({ objects: [], truncated: false }), delete: async () => {} } };
const call = (path, body, key) => mod.handleKm(new Request("https://fastwrite.tech" + path + (key === false ? "" : "?k=s3cret"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) }), env, { waitUntil: (p) => p }, path);
const hex = (n) => [...webcrypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
const addAcc = (email, extra) => { const f = hex(32); db.prepare("INSERT INTO km_accounts (folder_id, auth_hash, email, created, source) VALUES (?, ?, ?, ?, ?)").run(f, hex(32), email, new Date().toISOString(), (extra && extra.source) || "direct"); return f; };
const accRow = (f) => db.prepare("SELECT * FROM km_accounts WHERE folder_id = ?").get(f);
const codeOf = (m) => (/(\d{6})/.exec(m.text) || [])[1];

// ═══ D · διαγραφή χωρίς την εφαρμογή ═══════════════════════════════════════
{
  const f = addAcc("nia@example.com");
  ok("D1 χωρίς κλειδί → 404 (η διαδρομή «δεν υπάρχει»)", (await call("/api/km/admin/delreq", { email: "nia@example.com" }, false)).status === 404);
  ok("D2 άγνωστο email → 404 no_account", (await call("/api/km/admin/delreq", { email: "nobody@example.com" })).status === 404);
  const r = await call("/api/km/admin/delreq", { email: "nia@example.com" });
  const j = await r.json(); const m = sent.at(-1); const code = codeOf(m);
  ok("D3 start → 200, email κωδικού στο email του λογαριασμού, μασκαρισμένο στην απάντηση", r.status === 200 && m.to === "nia@example.com" && /^\d{6}$/.test(code) && j.to && !j.to.includes("nia@"), j.to);
  ok("D4 το email λέει «στείλε τον κωδικό στο support@» (όχι «απάντησε» — δεν υπάρχει Reply-To)", /support@fastwrite\.tech/.test(m.text) && !/απάντησε σε αυτό/.test(m.text));
  const dump = JSON.stringify(db.prepare("SELECT * FROM km_delreq_codes").all());
  ok("D5 ο κωδικός ΔΕΝ είναι σε καθαρό κείμενο στη βάση, ούτε το email", !dump.includes(code) && !dump.includes("nia@"));
  ok("D6 ο λογαριασμός ΔΕΝ πάγωσε ακόμα (μόνο κωδικός)", !accRow(f).delete_due_at);
  const v = await mod.handleKm(new Request("https://fastwrite.tech/api/km/email/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "nia@example.com", code }) }), env, {}, "/api/km/email/verify");
  const vj = await v.json();
  ok("D7 ο κωδικός διαγραφής ΔΕΝ ανοίγει σύνδεση (/email/verify)", !vj.email_token, JSON.stringify(vj));
  const bad = await call("/api/km/admin/delreq/confirm", { email: "nia@example.com", code: code === "000000" ? "111111" : "000000" });
  ok("D8 λάθος κωδικός → 400 bad_code, ο λογαριασμός άθικτος", bad.status === 400 && !accRow(f).delete_due_at);
  const good = await call("/api/km/admin/delreq/confirm", { email: "nia@example.com", code });
  const gj = await good.json(); const a = accRow(f);
  const hrs = (Date.parse(a.delete_due_at) - Date.parse(a.delete_requested_at)) / 3600000;
  ok("D9 σωστός → αίτημα 72 ωρών (ΙΔΙΟ με την εφαρμογή), όχι άμεση διαγραφή", good.status === 200 && hrs === 72 && !a.deleted && gj.pending);
  await new Promise((r) => setTimeout(r, 20));
  const dm = sent.find((x) => /Ζητήθηκε διαγραφή/.test(x.subject) && x.to === "nia@example.com");
  ok("D10 έφυγε το email «Ζητήθηκε διαγραφή» — λέει «με email» και «πρόσβαση στο email σου», ΟΧΙ «κινητό»", dm && /έγινε με email/.test(dm.text) && /πρόσβαση στο email σου/.test(dm.text) && !/πρόσβαση στο κινητό σου/.test(dm.text));
  ok("D11 ο κωδικός κάηκε (δεύτερη χρήση → no_code)", (await (await call("/api/km/admin/delreq/confirm", { email: "nia@example.com", code })).json()).error === "no_code");
  const again = await call("/api/km/admin/delreq", { email: "nia@example.com" });
  ok("D12 ξανά start σε εκκρεμή → 409 already_pending (η λήξη δεν μετακινείται)", again.status === 409 && accRow(f).delete_due_at === a.delete_due_at);
}
{
  const f = addAcc("omar@example.com");
  await call("/api/km/admin/delreq", { email: "omar@example.com" });
  const code = codeOf(sent.at(-1));
  for (let i = 0; i < 5; i++) await call("/api/km/admin/delreq/confirm", { email: "omar@example.com", code: "999999" === code ? "888888" : "999999" });
  const r = await call("/api/km/admin/delreq/confirm", { email: "omar@example.com", code });
  ok("D13 μετά από 5 λάθη → 429, ακόμα και ο σωστός απορρίπτεται", r.status === 429 && !accRow(f).delete_due_at);
  const f2 = addAcc("pia@example.com");
  await call("/api/km/admin/delreq", { email: "pia@example.com" });
  const c2 = codeOf(sent.at(-1));
  db.prepare("UPDATE km_delreq_codes SET expires = ?").run(new Date(Date.now() - 1000).toISOString());
  const r2 = await call("/api/km/admin/delreq/confirm", { email: "pia@example.com", code: c2 });
  ok("D14 ληγμένος κωδικός → code_expired, λογαριασμός άθικτος", (await r2.json()).error === "code_expired" && !accRow(f2).delete_due_at);
}
{
  const f = addAcc("rex@example.com");
  await call("/api/km/admin/delreq", { email: "rex@example.com" });
  const code = codeOf(sent.at(-1));
  const t0 = new Date(Date.now() - 3600000).toISOString(), due0 = new Date(Date.now() + 71 * 3600000).toISOString();
  db.prepare("UPDATE km_accounts SET delete_requested_at = ?, delete_due_at = ? WHERE folder_id = ?").run(t0, due0, f);   // στο μεταξύ ζήτησε διαγραφή από την εφαρμογή
  const r = await call("/api/km/admin/delreq/confirm", { email: "rex@example.com", code });
  ok("D15 αίτημα ήδη από την εφαρμογή → confirm 409, η λήξη ΔΕΝ μετακινείται", r.status === 409 && accRow(f).delete_due_at === due0);
}
{
  const E = "dup@example.com";
  db.exec("DROP INDEX IF EXISTS uq_km_accounts_email_live");
  addAcc(E); addAcc(E);
  const r = await call("/api/km/admin/delreq", { email: E });
  ok("D16 διπλότυπα ίδιου email → 409 duplicates, κανένας κωδικός, κανείς δεν παγώνει", r.status === 409 && (await r.json()).n === 2 && !db.prepare("SELECT COUNT(*) AS n FROM km_accounts WHERE email = ? AND delete_due_at IS NOT NULL").get(E).n);
}
{
  const f = addAcc("sam@example.com");
  await call("/api/km/admin/delreq", { email: "sam@example.com" });
  db.prepare("UPDATE km_delreq_codes SET expires = ?").run(new Date(Date.now() - 1000).toISOString());
  const before = db.prepare("SELECT COUNT(*) AS n FROM km_delreq_codes").get().n;
  const c = await mod.kmCleanup(env);
  ok("D17 ο καθημερινός καθαρισμός σβήνει τους ληγμένους κωδικούς", before >= 1 && db.prepare("SELECT COUNT(*) AS n FROM km_delreq_codes").get().n === 0 && c.delreq_codes >= 1, JSON.stringify({ before, c: c.delreq_codes }));
}
// ═══ N · ειδοποίηση Πολιτικής v2.6 ════════════════════════════════════════
{
  addAcc("appreview@fastwrite.tech", { source: "review" });
  db.prepare("INSERT INTO km_corr (msg_id, thread_id, mailbox, dir, peer, at) VALUES ('m1','t1','support@fastwrite.tech','in','nicolas@example.com',?)").run(new Date().toISOString());
  db.prepare("INSERT INTO km_corr (msg_id, thread_id, mailbox, dir, peer, at) VALUES ('m2','t1','support@fastwrite.tech','out','nicolas@example.com',?)").run(new Date().toISOString());
  db.prepare("INSERT INTO km_corr (msg_id, thread_id, mailbox, dir, peer, at) VALUES ('m3','t2','support@fastwrite.tech','in','gone@example.com',?)").run(new Date().toISOString());
  db.prepare("INSERT INTO km_leads (email, consent_at, imported_at, token, unsub_at) VALUES ('gone@example.com', ?, ?, 'tok1', ?)").run(new Date().toISOString(), new Date().toISOString(), new Date().toISOString());
  ok("N1 χωρίς κλειδί → 404", (await call("/api/km/admin/notice", { kind: "policy_v26" }, false)).status === 404);
  const before = sent.length;
  const d = await (await call("/api/km/admin/notice", { kind: "policy_v26" })).json();
  ok("N2 ΕΞ ΟΡΙΣΜΟΥ dry_run: καμία αποστολή, μόνο πόσοι", d.dry_run === true && sent.length === before && d.pending >= 1, JSON.stringify(d));
  const nAcc = db.prepare("SELECT COUNT(DISTINCT email) AS n FROM km_accounts WHERE deleted IS NULL AND email <> '' AND email NOT LIKE '%@fastwrite.tech'").get().n;
  ok("N3 παραλήπτες = ζωντανοί λογαριασμοί + Nicolas ΜΙΑ φορά · ΟΧΙ ο ελεγκτής καταστημάτων · ΟΧΙ όποιος διαγράφηκε από τη λίστα", d.total === nAcc + 1 && !d.sample.some((x) => /fastwrite|^g/.test(x)), "total " + d.total + " / αναμενόμενο " + (nAcc + 1));
  const s1 = await (await call("/api/km/admin/notice", { kind: "policy_v26", dry_run: false })).json();
  const mine = sent.slice(before);
  ok("N4 αποστολή: όσοι εκκρεμούσαν, ένα email ο καθένας, θέμα «Ενημέρωση της Πολιτικής»", s1.sent === d.pending && !mine.some((m) => m.to === "gone@example.com") && mine.length === d.pending && mine.every((m) => /Ενημέρωση της Πολιτικής/.test(m.subject)));
  ok("N5 το κείμενο λέει την ΑΛΗΘΕΙΑ (ο κατάλογος λειτουργεί από 12/10, απόφαση Stavros 18/10 «β») + δικαίωμα αντίταξης + σύνδεσμο", /λειτουργεί από τις 12 Οκτωβρίου 2026/.test(mine[0].text) && !/17 Νοεμβρίου/.test(mine[0].text) && /αντιταχθείς/.test(mine[0].text) && /fastwrite\.tech\/legal\/privacy/.test(mine[0].text));
  const s2 = await (await call("/api/km/admin/notice", { kind: "policy_v26", dry_run: false })).json();
  ok("N6 δεύτερη εκτέλεση: ΚΑΝΕΝΑ νέο email (μία φορά ανά διεύθυνση)", s2.sent === 0);
  ok("N7 άγνωστο kind → 400", (await call("/api/km/admin/notice", { kind: "x" })).status === 400);
}
{
  // ταυτόχρονες εκτελέσεις: μία «κλειδώνει» → η άλλη ΔΕΝ στέλνει
  const E = "twin@example.com"; addAcc(E);
  const before = sent.length;
  const [a, b2] = await Promise.all([call("/api/km/admin/notice", { kind: "policy_v26", dry_run: false }), call("/api/km/admin/notice", { kind: "policy_v26", dry_run: false })]);
  const ja = await a.json(), jb = await b2.json();
  ok("N8 δύο ταυτόχρονες εκτελέσεις → ΕΝΑ email στον νέο παραλήπτη", sent.slice(before).filter((m) => m.to === E).length === 1, JSON.stringify([ja, jb]));
  // αποτυχία αποστολής → attempts, μετά από 3 σταματά
  const F = "fail@example.com"; addAcc(F);
  const orig = EMAIL.send; EMAIL.send = async (m) => { if (m.to === F) throw new Error("x"); return orig(m); };
  for (let i = 0; i < 4; i++) await call("/api/km/admin/notice", { kind: "policy_v26", dry_run: false });
  EMAIL.send = orig;
  const dd = await (await call("/api/km/admin/notice", { kind: "policy_v26" })).json();
  ok("N9 μόνιμη αποτυχία → σταματά μετά από 3 (δεν γεμίζει κάθε δόση για πάντα)", dd.given_up === 1 && dd.pending === 0, JSON.stringify(dd));
}

// ═══ S · σελίδες ════════════════════════════════════════════════════════════
{
  const idx = readFileSync("site/kostometro/index.html", "utf8");
  ok("S1 τρία κουμπιά Apple (εγγραφή, μεταφορά QR, απόδειξη κατόχου) + γραμμή όρων με Apple", ["go-apple", "qi-apple", "own-apple"].every((x) => idx.includes('id="' + x + '"')) && /Google \/ Microsoft \/ Apple/.test(idx) && /data-oauth="google-microsoft-apple"/.test(idx));
  const app = readFileSync("site/kostometro/app.js", "utf8"), sw = readFileSync("site/kostometro/sw.js", "utf8"), ver = readFileSync("site/kostometro/version.json", "utf8");
  ok("S2 έκδοση ≥ v133 σε app.js · sw.js · version.json (v134 20/10: η έκδοση ελέγχεται πλέον στο v134.test)", /APP_VER = 'φέτα 3 · v13[3-9]'/.test(app) && /CACHE = 'km-v13[3-9]'/.test(sw) && /"v13[3-9]"/.test(ver));
  const el = readFileSync("site/legal/privacy.html", "utf8"), en = readFileSync("site/legal/privacy-en.html", "utf8");
  ok("S3 Πολιτική ΕΛ+EN: v2.6, καμία σήμανση ⬜, ημερομηνία ισχύος", !/⬜/.test(el + en) && /Έκδοση 2\.6 · Ισχύει από 18 Οκτωβρίου 2026/.test(el) && /Version 2\.6 · Effective from 18 October 2026/.test(en));
  ok("S4 Τ.Θ. 27452, 1645 Λευκωσία · ΚΑΜΙΑ διεύθυνση κατοικίας · ΚΑΜΙΑ παλιά 55518", /Τ\.Θ\. 27452, 1645 Λευκωσία/.test(el) && /P\.O\. Box 27452, 1645 Nicosia/.test(en) && !/55518/.test(el + en) && !/Δερβενίου|Derveniou/.test(el + en));
  ok("S5 το κλειδί της Apple δηλώνεται (Α2 + τήρηση + διαγραφή) σε ΕΛ και EN", /κρυπτογραφημένο<\/strong>, ένα κλειδί που μας δίνει η Apple/.test(el) && /Κλειδί σύνδεσης Apple/.test(el) && /ακυρώνουμε και τη σύνδεση στην Apple/.test(el) && /Apple sign-in key/.test(en) && /cancel the sign-in with Apple/.test(en));
  ok("S6 χωρίς PRO/Paddle/Capgo (δεν είναι ζωντανά)", !/\bPRO\b|Paddle|Capgo/.test(el + en));
  ok("S8 «β» 18/10: ο κατάλογος «λειτουργεί από 12/10», ΚΑΜΙΑ υπόσχεση «30 ημέρες πριν ισχύσει» · Apple 30 ημέρες επανάληψης · κωδικός διαγραφής 7 ημέρες · Apple στις γραμμές σύνδεσης (ΕΛ+EN)", /λειτουργεί από τις 12 Οκτωβρίου 2026/.test(el) && /running since 12 October 2026/.test(en) && !/30 ημέρες πριν ισχύσει|30 days before it applies/.test(el + en) && /έως <strong>30 ημέρες<\/strong>/.test(el) && /up to <strong>30 days<\/strong>/.test(en) && /Κωδικός διαγραφής χωρίς την εφαρμογή/.test(el) && /Code for deletion without the app/.test(en) && /Google \/ Microsoft \/ Apple<\/td>/.test(el) && /Google\/Microsoft\/Apple\)/.test(el + en));
  ok("S7 το αρχείο v1.2 υπάρχει (ο σύνδεσμος δεν σπάει)", existsSync("site/legal/privacy-en-v1-2.html") && /\/legal\/privacy-en-v1-2/.test(el));
}
const pass = results.filter((r) => r.ok).length;
if (ONLY) { if (pass !== results.length) { console.log("Μ" + ONLY + " → κοκκίνισε ✔"); process.exit(0); } console.log("Μ" + ONLY + " ΠΕΡΑΣΕ — το τεστ δεν πιάνει τίποτα"); process.exit(1); }
console.log("\n" + pass + "/" + results.length + " OK");
if (pass !== results.length) process.exit(1);
