// v130 · KM-CORR-V130 — «Αλληλογραφία»: ΜΟΝΟ άνθρωποι (όχι Google Play/Instagram/Apple, όχι οι λογαριασμοί του Stavros)
//   node --experimental-sqlite tests/v130.test.mjs            ... --mutate=N   (exit 0 = πιάστηκε)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let src = readFileSync("src/km.js", "utf8");
let ui = readFileSync("site/pinakas/app.js", "utf8");
let gs = readFileSync("tools/support/mail_log.gs", "utf8");
const MUT = [
  ["src", " || MAIL_AUTO_RE.test(peer) ||", " ||"],
  ["src", " || MAIL_SELF.indexOf(peer) >= 0 ||", " ||"],
  ["src", " || (x && x.auto)) {", ") {"],
  ["src", "do[._-]?not[._-]?reply|", ""],
  ["gs", "if (h('List-Unsubscribe') || h('List-Id')) { return true; }", ""],
  ["gs", "return /no[._-]?reply|do[._-]?not[._-]?reply|bounce|mailer-daemon/i.test(h('Return-Path'));", "return false;"],
  ["gs", "  return { auto: auto_(m) ? 1 : 0, msg_id:", "  return { msg_id:"],
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
const I = (id, peer, x) => Object.assign({ msg_id: id, thread_id: "t-" + id, mailbox: "stavros@fastwrite.tech", dir: "in", peer, peer_name: "", subject: "s", at: "2026-10-05T09:00:00Z", snippet: "" }, x || {});
const r = await (await post("sup", { items: [
  I("h1", "nicolaschristofi@live.com", { mailbox: "support@fastwrite.tech", dir: "out" }),
  I("h2", "customer@gmail.com"),
  I("h3", "maria.reply@x.cy"),
  I("a1", "googleplay-noreply@google.com"),
  I("a2", "payments-noreply@google.com"),
  I("a3", "noreply-play-console@google.com"),
  I("a4", "do_not_reply@id.apple.com"),
  I("a5", "notifications@github.com"),
  I("a6", "follow-suggestions@mail.instagram.com", { auto: 1 }),
  I("a7", "appleid@id.apple.com", { auto: 1 }),
  I("s1", "stavrosfkallenos@gmail.com"),
  I("s2", "pricelbkallenos@gmail.com", { mailbox: "support@fastwrite.tech" }),
  I("s3", "platiaenastavros@gmail.com"),
] })).json();
const got = db.prepare("SELECT peer FROM km_corr ORDER BY msg_id").all().map((x) => x.peer);
ok(r.saved === 3 && r.skipped === 10, "κρατάει 3 ανθρώπους · απορρίπτει 10 αυτόματα/δικά μας (πήρα " + r.saved + "/" + r.skipped + ")");
ok(got.includes("nicolaschristofi@live.com") && got.includes("customer@gmail.com") && got.includes("maria.reply@x.cy"), "ο Nicolas, πελάτης Gmail και «maria.reply» (άνθρωπος) μένουν");
ok(!got.some((p) => /google|apple|instagram|github/.test(p)), "κανένα Google Play/Payments/Apple/Instagram/GitHub");
ok(!got.some((p) => /kallenos|platiaenastavros/.test(p)), "κανένας από τους 3 λογαριασμούς του Stavros");
const fake = (hdr) => ({ getHeader: (n) => hdr[n] || "" });
const auto_ = new Function(gs.match(/function auto_\(m\) \{[\s\S]*?\n\}/)[0] + "; return auto_;")();
ok(auto_(fake({ "List-Unsubscribe": "<https://x>" })) === true, "Instagram/Google: List-Unsubscribe → αυτόματο");
ok(auto_(fake({ "Return-Path": "<SRS0=5tf1=sg=id.apple.com=Do_not_reply@fastwrite.tech>" })) === true, "Apple ID: Return-Path Do_not_reply (μέσω Cloudflare) → αυτόματο");
ok(auto_(fake({ "Auto-Submitted": "auto-replied" })) === true && auto_(fake({ "Auto-Submitted": "no" })) === false, "Auto-Submitted: auto → ναι · no → όχι");
ok(auto_(fake({ "Return-Path": "<nicolaschristofi@live.com>", "Precedence": "" })) === false, "ο Nicolas ΔΕΝ είναι αυτόματος");
ok(/auto: auto_\(m\) \? 1 : 0/.test(gs), "το Apps Script στέλνει το σημάδι auto στον server");
console.log("\n" + pass + " ✔ · " + fail + " ✘");
if (ONLY !== null) process.exit(fail ? 0 : 1);
process.exit(fail ? 1 : 0);
