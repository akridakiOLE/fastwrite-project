// v129 · KM-MAIL-LOG — «Αλληλογραφία»: ό,τι γράφεται από/προς support@ και stavros@ φαίνεται στον Πίνακα
//   node --experimental-sqlite tests/v129.test.mjs            ... --mutate=N   (exit 0 = πιάστηκε)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let src = readFileSync("src/km.js", "utf8");
let ui = readFileSync("site/pinakas/app.js", "utf8");
let gs = readFileSync("tools/support/mail_log.gs", "utf8");
const MUT = [
  ["src", "async function supportMailLog(request, env) {\n  if (!supportKeyOk(request, env)) return new Response(\"Not found\", { status: 404 });", "async function supportMailLog(request, env) {"],
  ["src", "INSERT OR IGNORE INTO km_corr", "INSERT INTO km_corr"],
  ["src", "|| MAIL_OURS_RE.test(peer) ||", "||"],
  ["src", "    mail_log:        await wipe(\"km_corr\", \"at < ?\", monthsAgo(RETENTION.mail_months, nowIso)),\n", ""],
  ["ui", "el('k-ml-wait').textContent = mp.filter(function (r) { return r.last_dir === 'in'; }).length;", "el('k-ml-wait').textContent = 0;"],
  ["gs", "body = String(m.getPlainBody() || '').replace(/\\s+/g, ' ').trim().slice(0, 200);", "body = String(m.getPlainBody() || '');"],
];
if (ONLY !== null) {
  const m = MUT[ONLY - 1]; const bag = { src, ui, gs };
  if (!m || !bag[m[0]].includes(m[1])) { console.log("Η ΜΕΤΑΛΛΑΞΗ Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(1); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ src, ui, gs } = bag);
}
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✔ " + m); } else { fail++; console.log("  ✘ " + m); } };
const crash = (e) => { console.log("  ✘ ΚΑΤΑΡΡΕΥΣΗ: " + (e && e.message)); process.exit(ONLY !== null ? 0 : 1); };
process.on("uncaughtException", crash); process.on("unhandledRejection", crash);
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
const db = new DatabaseSync(":memory:");
for (const f of ["km.sql", "km_h13.sql", "km_v54.sql", "km_mail.sql", "km_feedback.sql", "km_h11b.sql", "km_ref.sql", "km_ref2.sql", "km_verify.sql", "km_support.sql", "km_support_v95.sql", "km_funnel.sql", "km_leads.sql", "km_corr.sql"]) {
  const sql = readFileSync("schema/" + f, "utf8").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  for (const s of sql.split(";")) { const t = s.trim(); if (!t) continue; try { db.exec(t + ";"); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; } }
}
const stmt = (sql, args) => { const p = db.prepare(sql); return {
  async first() { return p.get(...args) ?? null; }, async run() { const r = p.run(...args); return { meta: { changes: Number(r.changes) } }; },
  async all() { return { results: p.all(...args) }; } }; };
const DB = { prepare: (sql) => ({ bind: (...a) => stmt(sql, a), ...stmt(sql, []) }), async batch(l) { const o = []; for (const s of l) o.push(await s.run()); return o; } };
const env = { DB, FOLDERS: { list: async () => ({ objects: [], truncated: false }) }, EMAIL: { send: async () => ({}) }, KM_ADMIN_KEY: "adm", KM_SUPPORT_KEY: "sup" };
globalThis.fetch = async () => new Response("{}", { status: 500 });
const post = (key, body) => mod.handleKm(new Request("https://x/api/km/support/mail-log", { method: "POST",
  headers: Object.assign({ "Content-Type": "application/json" }, key ? { "X-Km-Support": key } : {}), body: JSON.stringify(body) }), env, null, "/api/km/support/mail-log");
const I = (id, dir, peer, at, subj, box) => ({ msg_id: id, thread_id: "t-" + peer, mailbox: box || "support@fastwrite.tech", dir, peer, peer_name: dir === "in" ? "Nicolas C" : "", subject: subj, at, snippet: "x".repeat(500) });
ok((await post(null, { items: [I("m1", "in", "nc@x.cy", "2026-10-05T09:00:00Z", "Ερώτηση")] })).status === 404, "χωρίς κλειδί → 404 (η διαδρομή δεν υπάρχει)");
ok((await post("adm", { items: [I("m1", "in", "nc@x.cy", "2026-10-05T09:00:00Z", "Ερώτηση")] })).status === 404, "με το κλειδί ADMIN → 404 (μόνο το κλειδί support)");
const r1 = await (await post("sup", { items: [
  I("m1", "in", "nc@x.cy", "2026-10-05T09:00:00Z", "Ερώτηση για λογιστές"),
  I("m2", "out", "nc@x.cy", "2026-10-05T12:00:00Z", "Re: Ερώτηση για λογιστές"),
  I("m3", "in", "nc@x.cy", "2026-10-07T08:00:00Z", "Re: Ερώτηση για λογιστές"),
  I("m4", "out", "lead@x.cy", "2026-10-06T10:00:00Z", "Kostometro PRO", "stavros@fastwrite.tech"),
  I("m5", "in", "support@fastwrite.tech", "2026-10-06T10:00:00Z", "εσωτερικό"),
  I("m6", "in", "noreply@bank.cy", "2026-10-06T10:00:00Z", "spam"),
  I("m7", "in", "z@x.cy", "2026-10-06T10:00:00Z", "λάθος κουτί", "admin@gmail.com"),
] })).json();
ok(r1.saved === 4 && r1.skipped === 3, "κρατάει 4 · απορρίπτει εαυτό/noreply/ξένο κουτί (πήρα " + r1.saved + "/" + r1.skipped + ")");
const r2 = await (await post("sup", { items: [I("m1", "in", "nc@x.cy", "2026-10-05T09:00:00Z", "Ερώτηση για λογιστές")] })).json();
ok(r2.saved === 0, "το ίδιο μήνυμα ΔΕΝ γράφεται δεύτερη φορά");
ok(db.prepare("SELECT MAX(length(snippet)) AS n FROM km_corr").get().n <= 200, "ο server κρατάει ≤200 χαρακτήρες κειμένου");
const pk = await (await mod.handleKm(new Request("https://x/api/km/admin/pinakas?k=adm"), env, null, "/api/km/admin/pinakas")).json();
const P = Object.fromEntries(((pk.mail && pk.mail.peers) || []).map((x) => [x.peer, x]));
ok(P["nc@x.cy"] && P["nc@x.cy"].n_in === 2 && P["nc@x.cy"].n_out === 1 && P["nc@x.cy"].last_dir === "in", "Nicolas: ήρθαν 2, στείλαμε 1, τελευταίο ΗΡΘΕ → «περιμένει»");
ok(P["nc@x.cy"] && P["nc@x.cy"].name === "Nicolas C" && P["nc@x.cy"].last_thread === "t-nc@x.cy", "όνομα + σύνδεσμος συζήτησης");
ok(P["lead@x.cy"] && P["lead@x.cy"].boxes.indexOf("stavros@fastwrite.tech") >= 0, "και το stavros@ καταγράφεται");
ok(pk.mail.peers[0].peer === "nc@x.cy", "τελευταία δραστηριότητα πρώτη");
ok(src.includes('    mail_log:        await wipe("km_corr", "at < ?", monthsAgo(RETENTION.mail_months, nowIso)),'), "διαγραφή μετά από 24 μήνες");
ok(ui.includes("el('k-ml-wait').textContent = mp.filter(function (r) { return r.last_dir === 'in'; }).length;"), "η κάρτα μετράει «περιμένουν απάντηση»");
ok(/slice\(0, 200\)/.test(gs) && !/sendEmail|reply\(|createDraft/.test(gs), "το Apps Script στέλνει ≤200 χαρακτήρες και ΔΕΝ στέλνει/απαντά ποτέ email");
console.log("\n" + pass + " ✔ · " + fail + " ✘");
if (ONLY !== null) process.exit(fail ? 0 : 1);
process.exit(fail ? 1 : 0);
