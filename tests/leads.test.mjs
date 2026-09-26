// KM-LEADS — λίστα leads, αποστολή, σελίδα «μένω / φεύγω» (26/9/2026)
//   node --experimental-sqlite tests/leads.test.mjs  ·  --mutate=N (ΠΡΕΠΕΙ να κοκκινίσει)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let src = readFileSync("src/km.js", "utf8");
const MUT = [
  // 1 · 🔴 το GET διαγράφει (τα φίλτρα ασφαλείας των email θα έσβηναν όλη τη λίστα)
  ['  if (request.method === "POST") {\n    const form', '  if (true) {\n    const form = { get: () => "leave" }; const _f'],
  // 2 · 🔴 η εισαγωγή ξαναβάζει διαγραμμένους
  ["ON CONFLICT(email) DO NOTHING", "ON CONFLICT(email) DO UPDATE SET unsub_at = NULL"],
  // 3 · 🔴 διπλή αποστολή στην ίδια εκστρατεία
  ["AND s.campaign = ? AND s.ok = 1))", "AND s.campaign = ? AND 0))"],
  // 4 · 🔴 στέλνει σε διαγραμμένους
  ["             WHERE l.unsub_at IS NULL\n", "             WHERE 1=1\n"],
  // 5 · η αποστολή χωρίς dry_run στέλνει κατευθείαν
  ["const dryRun = b.dry_run === false ? false : true;   // ⚠ default: ΔΕΝ στέλνει", "const dryRun = b.dry_run === true;"],
  // 6 · χωρίς κλειδί διαχειριστή
  ["async function adminLeadsSend(request, env) {\n  if (!adminOk(request, env)) return new Response(\"Not found\", { status: 404 });", "async function adminLeadsSend(request, env) {"],
  // 7 · το όνομα ξαναμπαίνει στον χαιρετισμό
  ['const hi = "Γεια σου,";', 'const hi = "Γεια σου " + (lead.name || "") + ",";'],
  // 9 · 🔴 η αυτόματη διαγραφή των 24 μηνών δεν σβήνει leads
  ['    leads:           await wipe("km_leads", "consent_at < ?", monthsAgo(RETENTION.leads_months, nowIso)),', ""],
  // 10 · το resend χωρίς only_email ξαναστέλνει σε όλους
  ["const resend = !!(b.resend === true && only);", "const resend = b.resend === true;"],
  // 8 · ο σύνδεσμος της εφαρμογής χάνει το ?src=leads
  ['const app = LEAD_SITE + "/kostometro/?src=leads";', 'const app = LEAD_SITE + "/kostometro/";'],
];
if (ONLY) { const m = MUT[ONLY - 1]; if (!m) process.exit(2); if (!src.includes(m[0])) { console.log("Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(3); } src = src.replace(m[0], m[1]); }
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
const db = new DatabaseSync(":memory:");
for (const f of ["km.sql", "km_mail.sql", "km_leads.sql", "gnomi.sql", "km_feedback.sql", "km_support.sql"]) {
  const sql = readFileSync("schema/" + f, "utf8").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  for (const s of sql.split(";")) { const t = s.trim(); if (!t) continue; try { db.exec(t + ";"); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; } }
}
const stmt = (sql, args) => { const p = db.prepare(sql); return {
  async first() { return p.get(...args) ?? null; },
  async run() { const r = p.run(...args); return { meta: { changes: Number(r.changes) } }; },
  async all() { return { results: p.all(...args) }; } }; };
const DB = { prepare: (sql) => ({ bind: (...a) => stmt(sql, a), ...stmt(sql, []) }) };
const outbox = [];
const env = { DB, KM_ADMIN_KEY: "s3cret", EMAIL: { send: async (m) => { if (m.to === "bounce@example.com") throw new Error("rejected"); outbox.push(m); return { messageId: "m" + outbox.length }; } } };
const call = (path, opts) => mod.handleKm(new Request("https://x" + path, opts), env, null, path.split("?")[0]);
const admin = (path, body, key) => call(path, { method: "POST", headers: { "Content-Type": "application/json", "X-Km-Admin": key === undefined ? "s3cret" : key }, body: JSON.stringify(body) });
const form = (path, c) => call(path, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "c=" + c });
const tokenOf = (e) => db.prepare("SELECT token FROM km_leads WHERE email = ?").get(e).token;
let fails = 0;
const check = async (n, f) => { try { await f(); if (!ONLY) console.log("  ✔ " + n); } catch (e) { fails++; console.log("  ✘ " + n + " — " + e.message); } };
const eq = (g, w, what) => { if (JSON.stringify(g) !== JSON.stringify(w)) throw new Error((what || "") + " πήρα " + JSON.stringify(g) + " περίμενα " + JSON.stringify(w)); };

await check("Λ-1 · εισαγωγή: έγκυρα μπαίνουν, άκυρα αναφέρονται, διπλά δεν διπλασιάζονται", async () => {
  const r = await (await admin("/api/km/admin/leads/import", { rows: [
    { email: "Maria@Example.com", name: "Μαρία Παπά", consent_at: "2026-08-22T10:00:00+0300" },
    { email: "nikos@example.com", name: "<b>Νίκος</b>" },
    { email: "bounce@example.com", name: "X" },
    { email: "όχι-email" }, { email: "maria@example.com", name: "ξανά" },
  ] })).json();
  eq([r.inserted, r.known, r.invalid.length], [3, 1, 1]);
});
await check("Λ-2 · χωρίς κλειδί διαχειριστή: 404 και στις δύο διαδρομές", async () => {
  eq((await admin("/api/km/admin/leads/import", { rows: [] }, "wrong")).status, 404);
  eq((await admin("/api/km/admin/leads/send", { campaign: "dianomi-1" }, "")).status, 404);
});
await check("Λ-3 · χωρίς dry_run:false ΔΕΝ στέλνεται τίποτα", async () => {
  const r = await (await admin("/api/km/admin/leads/send", { campaign: "dianomi-1" })).json();
  eq([r.dry_run, r.pending, outbox.length], [true, 3, 0]);
});
await check("Λ-4 · άγνωστη εκστρατεία απορρίπτεται", async () => {
  eq((await admin("/api/km/admin/leads/send", { campaign: "κάτι", dry_run: false })).status, 400);
});
await check("Λ-5 · δοκιμή σε ένα email (only_email): φεύγει μόνο αυτό", async () => {
  const r = await (await admin("/api/km/admin/leads/send", { campaign: "dianomi-1", dry_run: false, only_email: "maria@example.com" })).json();
  eq([r.sent, outbox.length, outbox[0].to], [1, 1, "maria@example.com"]);
});
await check("Λ-6 · το περιεχόμενο: όνομα, ?src=leads, προσωπικός σύνδεσμος διαγραφής, αποστολέας", async () => {
  const m = outbox[0];
  if (!m.html.includes("Γεια σου,") || m.html.includes("Μαρία")) throw new Error("χαιρετισμός χωρίς όνομα (26/9)");
  if (!m.html.includes("https://fastwrite.tech/kostometro/?src=leads")) throw new Error("?src=leads");
  if (!m.html.includes("/api/km/lista?t=" + tokenOf("maria@example.com"))) throw new Error("σύνδεσμος διαγραφής");
  if (!m.text.includes("/api/km/lista?t=" + tokenOf("maria@example.com"))) throw new Error("διαγραφή στο κείμενο");
  if (!/πρώτο βήμα, όχι το τελικό προϊόν/.test(m.html)) throw new Error("το «πρώτο βήμα» λείπει");
  if (m.html.includes("ξαναπληκτρολογεί")) throw new Error("παλιά φράση");
  eq(m.from, "Kostometro <noreply@notify.fastwrite.tech>");
});
await check("Λ-7 · όλοι: κανείς δεύτερη φορά · αποτυχία καταγράφεται και ξαναδοκιμάζεται", async () => {
  const r = await (await admin("/api/km/admin/leads/send", { campaign: "dianomi-1", dry_run: false, limit: 40 })).json();
  eq([r.sent, r.failed.length, outbox.length], [1, 1, 2]);
  const r2 = await (await admin("/api/km/admin/leads/send", { campaign: "dianomi-1", dry_run: false })).json();
  eq([r2.sent, r2.failed.length, outbox.length], [0, 1, 2], "δεύτερο πέρασμα:");
});
await check("Λ-8 · όνομα με HTML δεν εκτελείται (escape)", async () => {
  const m = outbox.find((x) => x.to === "nikos@example.com");
  if (m.html.includes("<b>Νίκος</b>,")) throw new Error("ωμό HTML");
  if (!m.html.includes("Γεια σου,")) throw new Error("σκουπίδι-όνομα → «Γεια σου,»");
});
await check("Λ-9 · 🔴 GET στον σύνδεσμο ΔΕΝ διαγράφει — δείχνει «Μένω / Διαγραφή»", async () => {
  const t = tokenOf("nikos@example.com");
  const h = await (await call("/api/km/lista?t=" + t, { method: "GET" })).text();
  if (!h.includes("Μένω στη λίστα") || !h.includes("Διαγραφή από τη λίστα")) throw new Error("λείπουν τα κουμπιά");
  eq(db.prepare("SELECT unsub_at FROM km_leads WHERE email='nikos@example.com'").get().unsub_at, null);
});
await check("Λ-10 · POST «Διαγραφή» → εκτός λίστας · δεν ξαναπαίρνει · δεν ξαναμπαίνει με εισαγωγή", async () => {
  const t = tokenOf("nikos@example.com");
  await form("/api/km/lista?t=" + t, "leave");
  if (!db.prepare("SELECT unsub_at FROM km_leads WHERE email='nikos@example.com'").get().unsub_at) throw new Error("δεν διαγράφηκε");
  await admin("/api/km/admin/leads/import", { rows: [{ email: "nikos@example.com" }] });
  if (!db.prepare("SELECT unsub_at FROM km_leads WHERE email='nikos@example.com'").get().unsub_at) throw new Error("η εισαγωγή τον ξανάβαλε");
  db.exec("DELETE FROM km_lead_sends");
  const r = await (await admin("/api/km/admin/leads/send", { campaign: "dianomi-1" })).json();
  if (r.would_send.includes("nikos@example.com")) throw new Error("θα του ξαναστελνόταν");
});
await check("Λ-11 · «Μένω» καταγράφεται · άκυρος σύνδεσμος = ουδέτερη σελίδα", async () => {
  await form("/api/km/lista?t=" + tokenOf("maria@example.com"), "stay");
  if (!db.prepare("SELECT stay_at FROM km_leads WHERE email='maria@example.com'").get().stay_at) throw new Error("stay");
  const h = await (await call("/api/km/lista?t=deadbeef", { method: "GET" })).text();
  if (!h.includes("δεν ισχύει")) throw new Error("άκυρος");
});
await check("Λ-12 · resend ΜΟΝΟ για ένα email · χωρίς only_email αγνοείται", async () => {
  await admin("/api/km/admin/leads/send", { campaign: "dianomi-1", dry_run: false, limit: 40 });   // ό,τι εκκρεμεί, φεύγει πρώτα
  const n0 = outbox.length;
  const r = await (await admin("/api/km/admin/leads/send", { campaign: "dianomi-1", dry_run: false, resend: true })).json();
  if (r.sent !== 0) throw new Error("το resend έστειλε σε όλους: " + r.sent);
  const r2 = await (await admin("/api/km/admin/leads/send", { campaign: "dianomi-1", dry_run: false, resend: true, only_email: "maria@example.com" })).json();
  eq([r2.sent, outbox.length - n0], [1, 1]);
});
await check("Λ-13 · 24 μήνες: το παλιό lead και οι αποστολές του σβήνονται, τα νέα μένουν", async () => {
  await admin("/api/km/admin/leads/import", { rows: [{ email: "old@example.com", consent_at: "2024-01-01T00:00:00Z" }] });
  db.prepare("INSERT INTO km_lead_sends (email, campaign, at, ok) VALUES ('old@example.com','dianomi-1','2024-02-01',1)").run();
  const d = await mod.kmCleanup(env, "2026-09-26T00:00:00Z");
  eq([d.leads, d.lead_sends], [1, 1]);
  if (!db.prepare("SELECT 1 FROM km_leads WHERE email='maria@example.com'").get()) throw new Error("έσβησε νέο lead");
});
if (ONLY) { if (fails) { console.log("Μ" + ONLY + ": κοκκίνισε ✓"); process.exit(0); } console.log("Μ" + ONLY + ": ΠΕΡΑΣΕ ΠΡΑΣΙΝΟ"); process.exit(1); }
if (fails) { console.log("\n" + fails + " ΑΠΕΤΥΧΑΝ"); process.exit(1); }
console.log("\n✔ ΟΛΑ ΠΕΡΑΣΑΝ (13)");
