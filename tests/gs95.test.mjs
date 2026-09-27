// v95 · Apps Script support_autoreply.gs — λογική handle_ με ψεύτικο Gmail/UrlFetch (27/9/2026)
//   node tests/gs95.test.mjs  ·  --mutate=N (ΠΡΕΠΕΙ να κοκκινίσει)
// ⚠ Δεν αποδεικνύει τι κεφαλίδες βάζει το πραγματικό Google Group — αυτό μετριέται στη ζωντανή δοκιμή.
import { readFileSync } from "node:fs";
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let gs = readFileSync("tools/support/support_autoreply.gs", "utf8");
const MUT = [
  // 1 · 🔴 η γνώμη [Comments] παίρνει ξανά αριθμό (το λάθος της 27/9)
  ["  if (/^\\s*\\[Comments\\]/i.test(subj0)) { return skip_(m, 'γνώμη [Comments]'); }\n", ""],
  // 2 · 🔴 η απάντηση του Stavros πάει στο φίλτρο «δική μας»/αυτόματη απάντηση αντί στον πελάτη
  ["  if (AGENTS.indexOf(addr) >= 0) { return agentReply_(m, subj0); }\n", ""],
  // 3 · 🔴 η απάντηση φεύγει στον αποστολέα αντί στη διεύθυνση του server
  ["GmailApp.sendEmail(j.to, out, body,", "GmailApp.sendEmail(senderOf_(m), out, body,"],
  // 4 · το κείμενο του πελάτη δεν φτάνει στον server
  ["    inbound_({ code: hit[0], kind: 'in', from: addr, subject: subj, text: (m.getPlainBody() || '').slice(0, 20000) });\n", ""],
  // 5 · ο αποστολέας μετά την επανεγγραφή του Group χάνεται (X-Original-Sender)
  ["  var o = addrOf_(hdr_(m, 'X-Original-Sender'));\n  if (o && o !== SUPPORT) { return o; }\n", ""],
  // 6 · (η γραμμή notify είναι δεύτερη άμυνα — το φίλτρο @fastwrite.tech την καλύπτει· δεν μετράται μόνη)
  ["var AGENTS = ['stavrosfkallenos@gmail.com', 'admin@fastwrite.tech'];", "var AGENTS = ['admin@fastwrite.tech'];"],
  // 7 · απάντηση ΑΠΟ admin@ αντί support@
  ["GmailApp.sendEmail(j.to, out, body, { from: SUPPORT,", "GmailApp.sendEmail(j.to, out, body, { from: 'admin@fastwrite.tech',"],
];
if (ONLY) { const m = MUT[ONLY - 1]; if (!m) process.exit(2); if (!gs.includes(m[0])) { console.log("Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(3); } gs = gs.replace(m[0], m[1]); }

function world(serverReply) {
  const sent = [], fetched = [];
  const Gmail = { sendEmail: (to, subj, body, opt) => sent.push({ to, subj, body, from: opt.from }) };
  const Url = { fetch: (url, o) => { const p = JSON.parse(o.payload || "{}"); fetched.push({ url, p });
    const j = url.endsWith("/email-ticket") ? { ok: true, code: "KM-E-000077" } : url.endsWith("/inbound") ? serverReply(p) : { ok: true };
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify(j) }; } };
  const Props = { getProperty: () => "supp0rt" };
  const cache = {}; const Cache = { getScriptCache: () => ({ get: (k) => cache[k] || null, put: (k, v) => { cache[k] = v; } }) };
  const api = new Function("GmailApp", "UrlFetchApp", "PropertiesService", "CacheService", "console", gs + "\nreturn { handle_: handle_ };")(
    Gmail, Url, { getScriptProperties: () => Props }, Cache, { log() {}, error() {} });
  return { api, sent, fetched };
}
const msg = (o) => ({ getFrom: () => o.from, getReplyTo: () => o.replyTo || "", getSubject: () => o.subject, getPlainBody: () => o.body || "",
  getHeader: (n) => (o.h || {})[n] || "" });
let fails = 0;
const check = (n, f) => { try { f(); if (!ONLY) console.log("  ✔ " + n); } catch (e) { fails++; console.log("  ✘ " + n + " — " + e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m); };

check("Γ-1 · 🔴 γνώμη [Comments] (Group: Από support@, Reply-To χρήστης) → ΚΑΝΕΝΑ email, κανένας αριθμός", () => {
  const w = world(() => ({ ok: true }));
  // ΧΩΡΙΣ X-Original-Sender: δεν ξέρουμε αν το Group το βάζει πάντα — το θέμα μόνο του πρέπει να φτάνει
  w.api.handle_(msg({ from: "FastWrite via FastWrite Support <support@fastwrite.tech>", replyTo: "akrisway@gmail.com", subject: "[Comments] Kostometro · ★5 · ΔΟΚΙΜΗ .v94" }));
  ok(w.sent.length === 0, "στάλθηκε " + JSON.stringify(w.sent)); ok(w.fetched.length === 0, "μίλησε στον server");
});
check("Γ-2 · ειδοποίηση αιτήματος από τον server → καμία απάντηση", () => {
  const w = world(() => ({ ok: true }));
  w.api.handle_(msg({ from: "FastWrite via FastWrite Support <support@fastwrite.tech>", replyTo: "support@fastwrite.tech", subject: "Kostometro · KM-MH8Y9QVNHH-4 · κάμερα",
    h: { "X-Original-Sender": "noreply@notify.fastwrite.tech" } }));
  ok(w.sent.length === 0 && w.fetched.length === 0, "αντέδρασε");
});
check("Γ-3 · 🔴 απάντηση Stavros → server {kind:out} → email στο to του server, ΑΠΟ support@", () => {
  const w = world((p) => ({ ok: true, to: "pelatis@shop.cy", text: "Δοκίμασε ξανά.", closed: false, topic: "κάμερα" }));
  const r = w.api.handle_(msg({ from: "Stavros <stavrosfkallenos@gmail.com>", subject: "Re: Kostometro · KM-MH8Y9QVNHH-4 · κάμερα", body: "Δοκίμασε ξανά.\n> παλιό" }));
  ok(r === "sent", "r=" + r);
  const f = w.fetched.find((x) => x.url.endsWith("/inbound")); ok(f && f.p.kind === "out" && f.p.code === "KM-MH8Y9QVNHH-4", "inbound " + JSON.stringify(f));
  ok(w.sent.length === 1 && w.sent[0].to === "pelatis@shop.cy" && w.sent[0].from === "support@fastwrite.tech", JSON.stringify(w.sent));
  ok(/\[KM-MH8Y9QVNHH-4\]/.test(w.sent[0].subj) && w.sent[0].body.startsWith("Δοκίμασε ξανά."), "θέμα/σώμα");
});
check("Γ-4 · Stavros μέσω Group (Από support@, X-Original-Sender = Stavros) → αναγνωρίζεται ως δικός μας", () => {
  const w = world(() => ({ ok: true, to: "p@x.cy", text: "ok" }));
  w.api.handle_(msg({ from: "Stavros via FastWrite Support <support@fastwrite.tech>", replyTo: "", subject: "Re: Kostometro · KM-E-000005",
    h: { "X-Original-Sender": "stavrosfkallenos@gmail.com" }, body: "ok" }));
  ok(w.sent.length === 1 && w.sent[0].to === "p@x.cy", JSON.stringify(w.sent));
});
check("Γ-5 · πελάτης με αριθμό → κείμενο στον server {kind:in} + επιβεβαίωση στον ΠΕΛΑΤΗ", () => {
  const w = world(() => ({ ok: true, known: true }));
  w.api.handle_(msg({ from: "Maria <maria@shop.cy>", subject: "Re: κάμερα [KM-MH8Y9QVNHH-4]", body: "Ευχαριστώ" }));
  const f = w.fetched.find((x) => x.url.endsWith("/inbound")); ok(f && f.p.kind === "in" && f.p.from === "maria@shop.cy", JSON.stringify(f));
  ok(w.sent.length === 1 && w.sent[0].to === "maria@shop.cy", "επιβεβαίωση");
});
check("Γ-6 · πελάτης ΧΩΡΙΣ αριθμό → νέος KM-E + κείμενο στον server", () => {
  const w = world(() => ({ ok: true, known: true }));
  w.api.handle_(msg({ from: "nikos@shop.cy", subject: "Βοήθεια", body: "γεια" }));
  const f = w.fetched.find((x) => x.url.endsWith("/inbound")); ok(f && f.p.code === "KM-E-000077" && f.p.kind === "in", JSON.stringify(w.fetched));
  ok(w.sent[0] && /KM-E-000077/.test(w.sent[0].subj), "θέμα");
});
check("Γ-7 · απάντηση Stavros ΧΩΡΙΣ αριθμό → τίποτα", () => {
  const w = world(() => ({ ok: true }));
  w.api.handle_(msg({ from: "stavrosfkallenos@gmail.com", subject: "γεια", body: "x" }));
  ok(w.sent.length === 0 && w.fetched.length === 0, "αντέδρασε");
});
check("Γ-8 · ο server αρνείται (λάθος αριθμός) → ΤΙΠΟΤΑ δεν στέλνεται στον πελάτη", () => {
  const w = world(() => ({ ok: false, error: "unknown_case" }));
  const r = w.api.handle_(msg({ from: "stavrosfkallenos@gmail.com", subject: "Re: KM-E-000999", body: "x" }));
  ok(r === "fail" && w.sent.length === 0, "r=" + r);
});

if (ONLY) { if (fails) { console.log("Μ" + ONLY + " → κοκκίνισε ✔"); process.exit(0); } console.log("Μ" + ONLY + " ΠΕΡΑΣΕ — το τεστ δεν πιάνει τίποτα"); process.exit(1); }
console.log(fails ? "ΑΠΕΤΥΧΑΝ " + fails : "✔ ΟΛΑ ΠΕΡΑΣΑΝ (8)"); process.exit(fails ? 1 : 0);
