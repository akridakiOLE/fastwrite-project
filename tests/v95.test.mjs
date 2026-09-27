// v95 · KM-SUP-THREAD — αιτήματα μέσω server: κείμενο, ιστορικό, κατάσταση, κλείσιμο (27/9/2026)
//   node --experimental-sqlite tests/v95.test.mjs  ·  --mutate=N (ΠΡΕΠΕΙ να κοκκινίσει)
// Πραγματική sqlite με τα ΠΡΑΓΜΑΤΙΚΑ schema, ψεύτικο env.EMAIL. Το Apps Script μιλάει με /support/inbound.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let src = readFileSync("src/km.js", "utf8");
const MUT = [
  // 1 · 🔴 ξένος αριθμός συνεχίζεται από άλλον λογαριασμό
  ['c = await env.DB.prepare("SELECT * FROM km_support_cases WHERE code = ? AND scope = ?").bind(code, a.id.folder).first();', 'c = await env.DB.prepare("SELECT * FROM km_support_cases WHERE code = ? AND ? IS NOT NULL").bind(code, a.id.folder).first();'],
  // 2 · 🔴 η ειδοποίηση στο support@ έχει Reply-To τον πελάτη → η απάντηση παρακάμπτει το σύστημα
  ["to: MAIL_SUPPORT, from: MAIL_FROM, replyTo: MAIL_SUPPORT,", "to: MAIL_SUPPORT, from: MAIL_FROM, replyTo: email,"],
  // 3 · 🔴 το inbound δέχεται χωρίς μυστικό
  ['async function supportInbound(request, env) {\n  if (!supportKeyOk(request, env)) return new Response("Not found", { status: 404 });', "async function supportInbound(request, env) {"],
  // 4 · το παράθεμα δεν κόβεται
  ['    if (/^>/.test(l)) { cut = i; break; }\n', ""],
  // 5 · 🔴 #κλειστό δεν κλείνει
  ['if (kind === "out" && SUP_CLOSE_TAG.test(body)) { close = true;', 'if (false) { close = true;'],
  // 6 · νέο μήνυμα σε κλειστό ΔΕΝ ξανανοίγει (app)
  ["\"UPDATE km_support_cases SET status = 'open', last_in_at = ?, closed_at = NULL, closed_by = NULL WHERE code = ?\").bind(t, code),\n  ]);\n\n  const top", "\"UPDATE km_support_cases SET last_in_at = ? WHERE code = ?\").bind(t, code),\n  ]);\n\n  const top"],
  // 7 · 🔴 αυτόματο κλείσιμο κλείνει και όσα ΠΕΡΙΜΕΝΟΥΝ ΕΜΑΣ (open)
  ["WHERE status = 'answered' AND last_out_at < ? LIMIT ?", "WHERE status <> 'closed' AND COALESCE(last_out_at, created_at) < ? LIMIT ?"],
  // 8 · αυτόματο κλείσιμο δεν τρέχει στο ωριαίο
  ["  const autoClosed = await kmSupportAutoClose(env, nowIso);\n", "  const autoClosed = 0;\n"],
  // 9 · 🔴 τα μηνύματα δεν σβήνονται με τον λογαριασμό
  ['    env.DB.prepare("DELETE FROM km_support_messages WHERE code IN (SELECT code FROM km_support_cases WHERE scope = ?)").bind(folderId),\n', ""],
  // 10 · φρένο 10/ώρα λείπει
  ["if (cnt && Number(cnt.n) >= SUP_SEND_PER_HOUR)", "if (false)"],
  // 11 · 🔴 λίστα δείχνει αιτήματα άλλων
  ["     FROM km_support_cases WHERE scope = ?\n", "     FROM km_support_cases WHERE ? IS NOT NULL\n"],
  // 12 · 🔴 out σε λάθος διεύθυνση (αποστολέας αντί πελάτη)
  ["  const to = await supCaseEmail(env, c);", "  const to = normEmail(b.from);"],
  // 13 · το thread δεν μηδενίζει το «νέα απάντηση»
  ['  await env.DB.prepare("UPDATE km_support_cases SET seen_out_at = ? WHERE code = ?").bind(now(), code).run();\n', ""],
  // 14 · 🔴 KM-E χωρίς εκδομένο ticket δημιουργεί αίτημα (φύτεμα)
  ["      if (!tk) return json({ ok: true, known: false });\n", ""],
];
if (ONLY) {
  const m = MUT[ONLY - 1]; if (!m) process.exit(2);
  if (!src.includes(m[0])) { console.log("Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(3); }
  src = src.replace(m[0], m[1]);
}
let failed = 0;
const check = async (n, f) => { try { await f(); if (!ONLY) console.log("  ✔ " + n); } catch (e) { failed++; console.log("  ✘ " + n + " — " + e.message); } };
const eq = (g, w, what) => { if (JSON.stringify(g) !== JSON.stringify(w)) throw new Error((what || "") + " πήρα " + JSON.stringify(g) + " περίμενα " + JSON.stringify(w)); };
const ok = (c, what) => { if (!c) throw new Error(what); };

const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
const db = new DatabaseSync(":memory:");
for (const f of ["km.sql", "km_h13.sql", "km_v54.sql", "km_mail.sql", "km_feedback.sql", "km_h11b.sql", "km_ref.sql", "km_ref2.sql", "km_verify.sql", "km_support.sql", "km_support_v95.sql"]) {
  const sql = readFileSync("schema/" + f, "utf8").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  for (const s of sql.split(";")) { const t = s.trim(); if (!t) continue;
    try { db.exec(t + ";"); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; } }
}
const stmt = (sql, args) => { const p = db.prepare(sql); return {
  async first() { return p.get(...args) ?? null; },
  async run() { const r = p.run(...args); return { meta: { changes: Number(r.changes) } }; },
  async all() { return { results: p.all(...args) }; } }; };
const DB = { prepare: (sql) => ({ bind: (...a) => stmt(sql, a), ...stmt(sql, []) }),
  async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } };
const r2 = new Map();
const FOLDERS = {
  async put(k, v) { r2.set(k, Buffer.from(v)); },
  async get(k) { return r2.has(k) ? { arrayBuffer: async () => r2.get(k) } : null; },
  async delete(k) { for (const key of (Array.isArray(k) ? k : [k])) r2.delete(key); },
  async list({ prefix }) { return { objects: [...r2.keys()].filter((k) => k.startsWith(prefix)).map((k) => ({ key: k, size: r2.get(k).length })), truncated: false }; },
};
const outbox = [];
const env = { DB, FOLDERS, EMAIL: { send: async (m) => { outbox.push(m); return { messageId: "m" + outbox.length }; } }, KM_ADMIN_KEY: "adm1n", KM_SUPPORT_KEY: "supp0rt" };
const hex = (n) => [...webcrypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
const J = { "Content-Type": "application/json" };
const H = (id) => ({ "X-Km-Folder": id.folder, "X-Km-Auth": id.auth, "X-Km-Device": id.device });
const call = (path, opts) => mod.handleKm(new Request("https://x" + path, opts), env, null, path.split("?")[0]);
const post = async (path, headers, body) => { const r = await call(path, { method: "POST", headers: Object.assign({}, J, headers || {}), body: JSON.stringify(body || {}) }); let j = null; try { j = await r.json(); } catch (e) {} return { st: r.status, j }; };
async function account() {
  const id = { folder: hex(32), auth: hex(32), device: "km_" + hex(6), email: "u" + hex(3) + "@example.com" };
  const r = await post("/api/km/register", H(id), { email: id.email, email_token: await mod.issueEmailToken(env, id.email), source: "direct" });
  if (r.st !== 200) throw new Error("register " + r.st);
  return id;
}
const send = (id, body) => post("/api/km/support/send", H(id), body);
const inbound = (body, key) => post("/api/km/support/inbound", key === null ? {} : { "X-Km-Support": key || "supp0rt" }, body);
const kase = (code) => db.prepare("SELECT * FROM km_support_cases WHERE code = ?").get(code);
const msgs = (code) => db.prepare("SELECT dir, source, body FROM km_support_messages WHERE code = ? ORDER BY id").all(code);
const A = await account(), B = await account();
let a1;

await check("Σ-1 · νέο αίτημα από την εφαρμογή: αριθμός, κείμενο στη βάση, email στο support@ με Reply-To = support@", async () => {
  const r = await send(A, { topic: "δεν διαβάζει", text: "Το τιμολόγιο δεν διαβάζεται", ver: "v95", dev: "Android" });
  eq(r.st, 200, "status:"); a1 = r.j.code; ok(/^KM-[2-9A-Z]{10}-1$/.test(a1), "αριθμός " + a1);
  eq(kase(a1).status, "open"); eq(msgs(a1), [{ dir: "in", source: "app", body: "Το τιμολόγιο δεν διαβάζεται" }]);
  const m = outbox[outbox.length - 1];
  eq([m.to, m.replyTo], ["support@fastwrite.tech", "support@fastwrite.tech"], "to/replyTo:");
  ok(m.subject.includes(a1) && m.subject.includes("δεν διαβάζει"), "θέμα " + m.subject);
  ok(m.text.includes(A.email) && m.text.includes("#κλειστό"), "σώμα");
  ok(db.prepare("SELECT arrived_at FROM km_support_tickets WHERE code = ?").get(a1).arrived_at, "ticket όχι «έφτασε»");
});
await check("Σ-2 · 🔴 ξένος λογαριασμός ΔΕΝ συνεχίζει, ΔΕΝ βλέπει, ΔΕΝ κλείνει", async () => {
  eq((await send(B, { code: a1, text: "κλέφτης" })).st, 404, "send:");
  eq((await post("/api/km/support/thread", H(B), { code: a1 })).st, 404, "thread:");
  eq((await post("/api/km/support/close", H(B), { code: a1 })).st, 404, "close:");
  eq((await post("/api/km/support/list", H(B))).j.cases.length, 0, "list:");
  eq(msgs(a1).length, 1, "γράφτηκε μήνυμα:");
});
await check("Σ-3 · 🔴 inbound μόνο με KM_SUPPORT_KEY", async () => {
  eq((await inbound({ code: a1, kind: "out", text: "x" }, null)).st, 404);
  eq((await inbound({ code: a1, kind: "out", text: "x" }, "adm1n")).st, 404);
});
await check("Σ-4 · 🔴 απάντηση Stavros (out): γράφεται ΧΩΡΙΣ παράθεμα, πάει στο email του ΛΟΓΑΡΙΑΣΜΟΥ, κατάσταση answered", async () => {
  const r = await inbound({ code: a1, kind: "out", from: "stavrosfkallenos@gmail.com",
    text: "Δοκίμασε ξανά με πληρωμένο κλειδί.\n\nΣτις Κυρ 27 Σεπ 2026 στις 10:00, Kostometro <noreply@notify.fastwrite.tech>\nέγραψε:\n> Το τιμολόγιο δεν διαβάζεται" });
  eq(r.st, 200, "status:"); eq(r.j.to, A.email, "to:"); eq(r.j.text, "Δοκίμασε ξανά με πληρωμένο κλειδί.");
  eq(kase(a1).status, "answered"); eq(msgs(a1)[1], { dir: "out", source: "email", body: "Δοκίμασε ξανά με πληρωμένο κλειδί." });
});
await check("Σ-5 · λίστα: μόνο τα δικά του, με «νέα απάντηση» · το thread τη μηδενίζει", async () => {
  const l = (await post("/api/km/support/list", H(A))).j;
  eq([l.cases.length, l.cases[0].code, l.cases[0].status, l.unread], [1, a1, "answered", 1]);
  const t = (await post("/api/km/support/thread", H(A), { code: a1 })).j;
  eq(t.messages.map((m) => m.dir), ["in", "out"]);
  eq((await post("/api/km/support/list", H(A))).j.unread, 0, "unread μετά:");
});
await check("Σ-6 · απάντηση πελάτη από email (in) → ιστορικό + open", async () => {
  const r = await inbound({ code: a1, kind: "in", from: A.email, text: "Ευχαριστώ, δούλεψε!\n\nOn Sun, Sep 27, 2026 support wrote:\n> Δοκίμασε ξανά" });
  eq(r.st, 200); eq(kase(a1).status, "open"); eq(msgs(a1)[2].body, "Ευχαριστώ, δούλεψε!");
});
await check("Σ-7 · 🔴 #κλειστό στην απάντηση: κλείνει, η λέξη ΔΕΝ φτάνει στον πελάτη", async () => {
  const r = await inbound({ code: a1, kind: "out", from: "stavrosfkallenos@gmail.com", text: "Χαίρομαι! #κλειστό" });
  eq([r.j.closed, r.j.text], [true, "Χαίρομαι!"]); eq([kase(a1).status, kase(a1).closed_by], ["closed", "agent"]);
});
await check("Σ-8 · 🔴 νέο μήνυμα σε κλειστό (από εφαρμογή) → ξανανοίγει, email λέει «ΞΑΝΑΝΟΙΞΕ»", async () => {
  const r = await send(A, { code: a1, text: "Πάλι δεν διαβάζει" });
  eq([r.st, r.j.code], [200, a1]); eq([kase(a1).status, kase(a1).closed_at], ["open", null]);
  ok(outbox[outbox.length - 1].text.includes("ΞΑΝΑΝΟΙΞΕ"), "δεν το λέει");
});
await check("Σ-9 · «Λύθηκε» από τον χρήστη", async () => {
  eq((await post("/api/km/support/close", H(A), { code: a1 })).st, 200);
  eq([kase(a1).status, kase(a1).closed_by], ["closed", "user"]);
});
await check("Σ-10 · 🔴 αυτόματο κλείσιμο: answered > 7 ημέρες κλείνει · open (περιμένει ΕΜΑΣ) ΠΟΤΕ", async () => {
  const x = (await send(A, { text: "παλιό απαντημένο" })).j.code, y = (await send(A, { text: "παλιό αναπάντητο" })).j.code;
  await inbound({ code: x, kind: "out", text: "απάντηση" });
  db.prepare("UPDATE km_support_cases SET last_out_at = ?, last_in_at = ?, created_at = ? WHERE code IN (?, ?)").run("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z", x, y);
  const r = await mod.kmSupportPrune(env);
  eq([kase(x).status, kase(x).closed_by], ["closed", "auto"]); eq(kase(y).status, "open", "έκλεισε αναπάντητο:");
  ok(r.auto_closed >= 1, "μέτρηση");
});
await check("Σ-11 · email εκτός εφαρμογής (KM-E): αίτημα με διεύθυνση αποστολέα · απάντηση πάει εκεί", async () => {
  const e = (await post("/api/km/support/email-ticket", { "X-Km-Support": "supp0rt" })).j.code;
  const r = await inbound({ code: e, kind: "in", from: "Maria <maria@shop.cy>", subject: "Re: Βοήθεια [" + e + "]", text: "Γεια σας, πώς βάζω κλειδί;" });
  eq([r.st, kase(e).scope, kase(e).email], [200, "E", "maria@shop.cy"]);
  const o = await inbound({ code: e, kind: "out", text: "Από τις Ρυθμίσεις." });
  eq(o.j.to, "maria@shop.cy");
});
await check("Σ-12 · 🔴 KM-E που δεν εκδόθηκε ποτέ / app αριθμός πάνω από τον μετρητή → τίποτα δεν γράφεται", async () => {
  eq((await inbound({ code: "KM-E-999999", kind: "in", from: "x@y.cy", text: "φύτεμα" })).j.known, false);
  eq(kase("KM-E-999999"), undefined);
  const fake = a1.replace(/-\d+$/, "-999");
  eq((await inbound({ code: fake, kind: "in", from: "x@y.cy", text: "φύτεμα" })).j.known, false);
  eq((await inbound({ code: fake, kind: "out", text: "x" })).st, 404, "out σε ανύπαρκτο:");
});
await check("Σ-13 · παλιό mailto (αριθμός app χωρίς αίτημα) → το πρώτο email δημιουργεί αίτημα στον σωστό λογαριασμό", async () => {
  const t = (await post("/api/km/support/ticket", H(B))).j.code;
  const r = await inbound({ code: t, kind: "in", from: B.email, subject: "Kostometro · " + t + " · κάμερα", text: "Δεν ανοίγει η κάμερα" });
  eq([r.j.known, kase(t).scope, kase(t).topic], [true, B.folder, "κάμερα"]);
});
await check("Σ-14 · 🔴 φρένο: 11ο μήνυμα μέσα σε μία ώρα → 429", async () => {
  const C = await account(); let last;
  for (let i = 0; i < 11; i++) last = await send(C, { text: "μήνυμα " + i });
  eq(last.st, 429);
});
await check("Σ-15 · κενό κείμενο → 400 · λογαριασμός χωρίς email → 409 (η εφαρμογή πέφτει στο mailto)", async () => {
  eq((await send(A, { text: "   " })).st, 400);
  const D = await account(); db.prepare("UPDATE km_accounts SET email = '' WHERE folder_id = ?").run(D.folder);
  eq((await send(D, { text: "γεια" })).st, 409);
});
await check("Σ-16 · 🔴 διαγραφή λογαριασμού: φεύγουν αιτήματα ΚΑΙ μηνύματα", async () => {
  eq((await post("/api/km/admin/delete", { "X-Km-Admin": "adm1n" }, { folder_id: A.folder })).st, 200);
  eq(db.prepare("SELECT COUNT(*) n FROM km_support_cases WHERE scope = ?").get(A.folder).n, 0, "cases:");
  eq(msgs(a1).length, 0, "messages:");
});
await check("Σ-17 · παράθεμα: Outlook «From:/Sent:» και «-----Original Message-----» κόβονται", async () => {
  eq(mod.supStripQuote("Ναι σωστά.\n\nFrom: support@fastwrite.tech\nSent: Sunday\nΠαλιό"), "Ναι σωστά.");
  eq(mod.supStripQuote("ok\n-----Original Message-----\nπαλιό"), "ok");
  eq(mod.supStripQuote("νέο\n> παλιό 1\n> παλιό 2"), "νέο");
  eq(mod.supStripQuote("γραμμή 1\nγραμμή 2"), "γραμμή 1\nγραμμή 2");
});

if (ONLY) { if (failed) { console.log("Μ" + ONLY + " → κοκκίνισε ✔"); process.exit(0); } console.log("Μ" + ONLY + " ΠΕΡΑΣΕ — το τεστ δεν πιάνει τίποτα"); process.exit(1); }
console.log(failed ? "ΑΠΕΤΥΧΑΝ " + failed : "✔ ΟΛΑ ΠΕΡΑΣΑΝ (17)"); process.exit(failed ? 1 : 0);
