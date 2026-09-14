// Τεστ ειδοποιήσεων email (Brief Ε §6) — 14/9/2026.
//   node --experimental-sqlite tests/mail.test.mjs
//   node --experimental-sqlite tests/mail.test.mjs --mutate   (ΠΡΕΠΕΙ να κοκκινίσει)

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const MUTATE = process.argv.includes("--mutate");
let src = readFileSync("src/km.js", "utf8");
if (MUTATE) {
  src = src.replace('const MAIL_FROM = "FastWrite <noreply@notify.fastwrite.tech>";',
                    'const MAIL_FROM = "FastWrite <noreply@fastwrite.tech>";');
  src = src.replace('  if (!dest) return log(false, "no_address");', "");
}
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));

const db = new DatabaseSync(":memory:");
db.exec(readFileSync("schema/km_mail.sql", "utf8"));
const stmt = (sql, args) => {
  const p = db.prepare(sql);
  return {
    async first() { return p.get(...args) ?? null; },
    async run() { const r = p.run(...args); return { meta: { changes: Number(r.changes) } }; },
    async all() { return { results: p.all(...args) }; },
  };
};
const DB = { prepare: (sql) => ({ bind: (...a) => stmt(sql, a), ...stmt(sql, []) }) };

let sent = [];
const okMail = { send: async (m) => { sent.push(m); return { messageId: "mid-" + sent.length }; } };
const badMail = { send: async () => { throw new Error("beta is down"); } };

let failed = 0;
const check = async (n, f) => { try { await f(); console.log("  ✔ " + n); } catch (e) { failed++; console.log("  ✘ " + n + " — " + e.message); } };
const eq = (g, w, what) => { if (JSON.stringify(g) !== JSON.stringify(w)) throw new Error((what||"") + " πήρα " + JSON.stringify(g) + " περίμενα " + JSON.stringify(w)); };
const last = () => db.prepare("SELECT kind,ok,err,msg_id FROM km_mail_log ORDER BY id DESC LIMIT 1").get();

console.log(MUTATE ? "ΜΕΤΑΛΛΑΓΜΕΝΟ — ΠΡΕΠΕΙ ΝΑ ΚΟΚΚΙΝΙΣΕΙ" : "ΚΑΝΟΝΙΚΟ");

await check("🔴 Ο ΑΠΟΣΤΟΛΕΑΣ ΕΙΝΑΙ Ο ΥΠΟΤΟΜΕΑΣ, ΟΧΙ ΤΟ APEX", async () => {
  sent = [];
  await mod.mailSend({ DB, EMAIL: okMail }, "deleted", "a@b.gr");
  const from = sent[0].from;
  if (!/noreply@notify\.fastwrite\.tech/.test(from)) throw new Error("λάθος αποστολέας: " + from);
  if (/@fastwrite\.tech>/.test(from)) throw new Error("ΣΤΕΛΝΕΙ ΑΠΟ ΤΟ APEX: " + from);
});

await check("η διαγραφή στέλνει και καταγράφεται επιτυχία", async () => {
  eq(last().kind, "deleted"); eq(last().ok, 1);
  if (!last().msg_id) throw new Error("λείπει το messageId");
});

await check("το κείμενο ΔΕΝ περιέχει κανέναν σύνδεσμο", async () => {
  const m = sent[0];
  if (/https?:\/\//.test(m.text) || /https?:\/\//.test(m.html)) throw new Error("βρέθηκε σύνδεσμος");
  if (/<a\s/i.test(m.html)) throw new Error("βρέθηκε <a>");
});

await check("η αλλαγή λέξεων έχει ΔΙΚΟ ΤΗΣ θέμα και δίνει το support", async () => {
  sent = [];
  await mod.mailSend({ DB, EMAIL: okMail }, "words", "a@b.gr");
  if (!/12 λέξεις/.test(sent[0].subject)) throw new Error("θέμα: " + sent[0].subject);
  if (!/support@fastwrite\.tech/.test(sent[0].text)) throw new Error("λείπει το support από το κείμενο");
  eq(last().kind, "words"); eq(last().ok, 1);
});

await check("αποτυχία αποστολής ΔΕΝ πετάει — καταγράφεται", async () => {
  await mod.mailSend({ DB, EMAIL: badMail }, "deleted", "a@b.gr");
  eq(last().ok, 0);
  if (!/beta is down/.test(last().err || "")) throw new Error("δεν κρατήθηκε το σφάλμα: " + last().err);
});

await check("χωρίς binding: καταγράφεται no_binding, καμία εξαίρεση", async () => {
  await mod.mailSend({ DB }, "deleted", "a@b.gr");
  eq(last().ok, 0); eq(last().err, "no_binding");
});

await check("χωρίς διεύθυνση: no_address, και ΔΕΝ καλείται η Cloudflare", async () => {
  sent = [];
  await mod.mailSend({ DB, EMAIL: okMail }, "deleted", null);
  eq(sent.length, 0, "κλήσεις:"); eq(last().ok, 0); eq(last().err, "no_address");
});

await check("🔴 ΚΑΜΙΑ ΔΙΕΥΘΥΝΣΗ ΠΑΡΑΛΗΠΤΗ ΔΕΝ ΑΠΟΘΗΚΕΥΕΤΑΙ", async () => {
  const cols = db.prepare("PRAGMA table_info(km_mail_log)").all().map((c) => c.name);
  for (const bad of ["to", "email", "recipient"]) if (cols.includes(bad)) throw new Error("στήλη " + bad);
  const dump = JSON.stringify(db.prepare("SELECT * FROM km_mail_log").all());
  if (dump.includes("a@b.gr")) throw new Error("η διεύθυνση βρέθηκε σε καθαρό κείμενο");
});

await check("σελίδα διαχείρισης: χωρίς κλειδί 404, με κλειδί 200", async () => {
  const env = { DB, KM_ADMIN_KEY: "s3cret" };
  const bad = await mod.handleKm(new Request("https://x/api/km/admin/mail"), env, null, "/api/km/admin/mail");
  eq(bad.status, 404);
  const ok = await mod.handleKm(new Request("https://x/api/km/admin/mail?k=s3cret"), env, null, "/api/km/admin/mail");
  eq(ok.status, 200);
  const html = await ok.text();
  if (!/απέτυχαν/.test(html)) throw new Error("η σελίδα δεν δείχνει αποτυχίες");
});

console.log(failed ? "\nΚΟΚΚΙΝΟ: " + failed + " φρουροί έπεσαν" : "\nΠΡΑΣΙΝΟ: όλοι οι φρουροί πέρασαν");
process.exit(MUTATE ? (failed ? 0 : 1) : (failed ? 1 : 0));
