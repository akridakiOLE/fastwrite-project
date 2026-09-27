// v94 — «Η γνώμη σου, εισηγήσεις»: η γνώμη ΦΤΑΝΕΙ στο support@ + η φόρμα φεύγει μετά την αποστολή (27/9/2026)
//   node --experimental-sqlite tests/v94.test.mjs  ·  --mutate=N (ΠΡΕΠΕΙ να κοκκινίσει)
// Server: πραγματική sqlite με τα ΠΡΑΓΜΑΤΙΚΑ schema/km_feedback.sql + km_mail.sql, ψεύτικο env.EMAIL.
// Εφαρμογή: η λογική renderFb / επιτυχίας τρέχει σε μικρό κόσμο με ψεύτικα στοιχεία.
// ⚠ Δεν αποδεικνύει ότι το Google Group δέχεται το email — αυτό μετριέται ζωντανά μετά το deploy.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let km = readFileSync("src/km.js", "utf8");
let js = readFileSync("site/kostometro/app.js", "utf8");
let html = readFileSync("site/kostometro/index.html", "utf8");
const MUT = [
  // 1 · 🔴 η γνώμη δεν στέλνεται ποτέ (η κατάσταση της v93)
  ["km", "  const fm = feedbackMail(env,", "  const fm = null && feedbackMail(env,"],
  // 2 · Reply-To μπαίνει ΠΑΝΤΑ (διαρροή email ανώνυμης γνώμης)
  ["km", "  if (f.email) msg.replyTo = f.email;", "  msg.replyTo = f.email || MAIL_SUPPORT;"],
  // 3 · Reply-To δεν μπαίνει ποτέ
  ["km", "  if (f.email) msg.replyTo = f.email;", ""],
  // 4 · αποτυχία email ρίχνει την κλήση
  ["km", "    const r = await env.EMAIL.send(msg);\n    return log(true, null, r && r.messageId ? String(r.messageId) : null);\n  } catch (e) {\n    return log(false, String((e && e.message) || e).slice(0, 300));\n  }", "    const r = await env.EMAIL.send(msg);\n    return log(true, null, r && r.messageId ? String(r.messageId) : null);\n  } finally {}"],
  // 5 · χωρίς [Comments] στο θέμα → το φίλτρο Gmail δεν το πιάνει
  ["km", "const subject = \"[Comments] Kostometro · \"", "const subject = \"Kostometro · \""],
  // 6 · 🔴 η φόρμα ΜΕΝΕΙ μετά την αποστολή (το στιγμιότυπο 27/9)
  ["js", "        el('fb-form').hidden = true; el('fb-done').hidden = false;\n", ""],
  // 7 · το επόμενο άνοιγμα δείχνει ακόμα την επιβεβαίωση
  ["js", "    el('fb-form').hidden = false; el('fb-done').hidden = true;", ""],
  // 8 · το παλιό όνομα στο μενού
  ["html", "<span class=\"row-t\">Η γνώμη σου, εισηγήσεις</span>", "<span class=\"row-t\">Η γνώμη σου</span>"],
  // 9 · 🔴 το email διανομής δείχνει σε μενού που δεν υπάρχει πια
  ["km", "από το μενού <b>«Η γνώμη σου, εισηγήσεις»</b>", "από το μενού <b>«Η γνώμη σου»</b>"],
];
if (ONLY) {
  const m = MUT[ONLY - 1]; if (!m) process.exit(2);
  const bag = { km, js, html };
  if (!bag[m[0]].includes(m[1])) { console.log("Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(3); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ km, js, html } = bag);
}
let fails = 0;
const check = async (n, f) => { try { await f(); if (!ONLY) console.log("  ✔ " + n); } catch (e) { fails++; console.log("  ✘ " + n + " — " + e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m); };

// ── server ──
const mod = await import("data:text/javascript;base64," + Buffer.from(km).toString("base64"));
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(readFileSync("schema/km_feedback.sql", "utf8"));
sqlite.exec(readFileSync("schema/km_mail.sql", "utf8"));
const stmt = (sql, args) => { const p = sqlite.prepare(sql); return {
  async first() { return p.get(...args) ?? null; }, async run() { const r = p.run(...args); return { meta: { changes: r.changes } }; },
  async all() { return { results: p.all(...args) }; } }; };
const DB = { prepare: (sql) => ({ bind: (...a) => stmt(sql, a), ...stmt(sql, []) }) };
const outbox = []; let boom = false;
const env = { DB, KM_ADMIN_KEY: "k", EMAIL: { send: async (m) => { if (boom) throw new Error("rejected"); outbox.push(m); return { messageId: "m" + outbox.length }; } } };
const call = (body) => { const r = new Request("https://fastwrite.tech/api/km/feedback", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
  Object.defineProperty(r, "cf", { value: { country: "CY" }, configurable: true }); return mod.handleKm(r, env, null, "/api/km/feedback"); };
const rows = (q) => sqlite.prepare(q).all();

await check("Ν94-1 · 🔴 κάθε γνώμη φτάνει στο support@ με [Comments] στο θέμα", async () => {
  const r = await call({ install_id: "d1", stars: 4, text: "Καλό αλλά αργό", ver: "v94" });
  ok(r.status === 200, "status " + r.status);
  ok(outbox.length === 1, "email: " + outbox.length);
  const m = outbox[0];
  ok(m.to === "support@fastwrite.tech", "to " + m.to);
  ok(m.subject.startsWith("[Comments] Kostometro · ★4 · Καλό αλλά αργό"), "θέμα " + m.subject);
  ok(/Καλό αλλά αργό/.test(m.text) && /v94/.test(m.text), "σώμα");
});
await check("Ν94-2 · ανώνυμη γνώμη: ΚΑΝΕΝΑ Reply-To, καμία διεύθυνση στο σώμα", async () => {
  const m = outbox[0];
  ok(!("replyTo" in m), "Reply-To " + m.replyTo);
  ok(!/@/.test(m.text.replace("support@", "")), "διεύθυνση στο σώμα");
});
await check("Ν94-3 · «Θέλω απάντηση»: Reply-To = ο χρήστης, και το σώμα το λέει", async () => {
  const r = await call({ install_id: "d2", text: "θέλω βοήθεια", reply: true, email: "Maria@Example.com" });
  ok(r.status === 200, "status");
  const m = outbox[outbox.length - 1];
  ok(m.replyTo === "maria@example.com", "Reply-To " + m.replyTo);
  ok(/ΖΗΤΑΕΙ ΑΠΑΝΤΗΣΗ/.test(m.text), "σήμα απάντησης");
});
await check("Ν94-4 · 🔴 email αποτυγχάνει → η γνώμη ΜΕΝΕΙ, η κλήση περνάει, η αποτυχία φαίνεται", async () => {
  boom = true;
  const before = rows("SELECT COUNT(*) n FROM km_feedback")[0].n;
  const r = await call({ install_id: "d3", stars: 2 });
  boom = false;
  ok(r.status === 200, "status " + r.status);
  ok(rows("SELECT COUNT(*) n FROM km_feedback")[0].n === before + 1, "η γνώμη χάθηκε");
  const bad = rows("SELECT * FROM km_mail_log WHERE kind='feedback' AND ok=0");
  ok(bad.length === 1 && /rejected/.test(bad[0].err), "log " + JSON.stringify(bad));
});
await check("Ν94-5 · το km_mail_log ΔΕΝ κρατά διευθύνσεις", async () => {
  ok(!JSON.stringify(rows("SELECT * FROM km_mail_log")).includes("@"), "διεύθυνση στο log");
});
await check("Ν94-6 · το email διανομής δείχνει στο ΝΕΟ όνομα μενού", async () => {
  ok(km.includes("από το μενού <b>«Η γνώμη σου, εισηγήσεις»</b>"), "παλιό όνομα στο dianomi-1");
});

// ── εφαρμογή ──
await check("Ν94-7 · μενού και τίτλος: «Η γνώμη σου, εισηγήσεις»", async () => {
  ok(html.includes('<span class="row-t">Η γνώμη σου, εισηγήσεις</span>'), "μενού");
  ok(html.includes("<h2>Η γνώμη σου, εισηγήσεις</h2>"), "τίτλος");
  ok(!html.includes('id="fb-ok"'), "η παλιά γραμμή «Έφτασε» έμεινε");
});
const slice = (a, b) => { const i = js.indexOf(a), j = js.indexOf(b, i); if (i < 0 || j < 0) throw new Error("λείπει: " + a); return js.slice(i, j); };
function world(fetchRes) {
  const nodes = {}; const mk = (id) => (nodes[id] = { id, hidden: false, value: "", checked: false, disabled: false, textContent: "", className: "",
    getAttribute: () => "0", querySelectorAll: () => [] });
  ["fb-stars", "fb-text", "fb-reply", "fb-err", "fb-send", "fb-form", "fb-done", "fb-done-sub"].forEach(mk);
  nodes["fb-done"].hidden = true;
  const store = { km_email: "a@b.gr", km_id: "dev" };
  const localStorage = { getItem: (k) => store[k] ?? null };
  const fetch = async () => fetchRes;
  const src = "var el = arguments[0], localStorage = arguments[1], fetch = arguments[2], LS = { email: 'km_email', id: 'km_id' }, KM_API = '/api/km/', APP_VER = 'x · v94', shortVer = function (v) { return 'v94'; };\n" +
    slice("  var fbStars = 0;", "  /* Σβήνει ΟΛΑ τα τοπικά") + "\n return { renderFb: renderFb };";
  const api = new Function(src)((id) => nodes[id], localStorage, fetch);
  return { api, nodes, flush: async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); } };
}
await check("Ν94-8 · 🔴 μετά την επιτυχία η φόρμα ΦΕΥΓΕΙ και φαίνεται μόνο η επιβεβαίωση", async () => {
  const w = world({ status: 200, json: async () => ({ ok: true }) });
  w.api.renderFb(); w.nodes["fb-text"].value = "δοκιμή"; w.nodes["fb-reply"].checked = true;
  w.nodes["fb-send"].onclick(); await w.flush();
  ok(w.nodes["fb-form"].hidden === true, "η φόρμα έμεινε");
  ok(w.nodes["fb-done"].hidden === false, "καμία επιβεβαίωση");
  ok(/a@b\.gr/.test(w.nodes["fb-done-sub"].textContent), "δεν λέει πού θα απαντήσουμε");
  w.api.renderFb();
  ok(w.nodes["fb-form"].hidden === false && w.nodes["fb-done"].hidden === true, "το επόμενο άνοιγμα δεν ξεκινά καθαρό");
  ok(w.nodes["fb-text"].value === "", "το κείμενο έμεινε");
});
await check("Ν94-9 · αποτυχία: η φόρμα ΜΕΝΕΙ με το κείμενο, για να ξαναδοκιμάσει", async () => {
  const w = world({ status: 500, json: async () => ({}) });
  w.api.renderFb(); w.nodes["fb-text"].value = "δοκιμή";
  w.nodes["fb-send"].onclick(); await w.flush();
  ok(w.nodes["fb-form"].hidden === false && w.nodes["fb-done"].hidden === true, "κρύφτηκε σε αποτυχία");
  ok(w.nodes["fb-text"].value === "δοκιμή", "χάθηκε το κείμενο");
});

if (ONLY) { if (fails) { console.log("Μ" + ONLY + " → κοκκίνισε ✔"); process.exit(0); } console.log("Μ" + ONLY + " ΠΕΡΑΣΕ — το τεστ δεν πιάνει τίποτα"); process.exit(1); }
console.log(fails ? "ΑΠΕΤΥΧΑΝ " + fails : "ΟΛΑ ΠΡΑΣΙΝΑ (9)"); process.exit(fails ? 1 : 0);
