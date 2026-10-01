// v100 · Βοηθός Kostometro — διορθώσεις από τη δοκιμή του Stavros 30/9/2026
//   (1) μικρογραφία φωτογραφίας με ✕ · (2) «δωρεάν κλειδί» → πληρωμένο (FAQ + γνώση)
//   (3) μοναχικός χαρακτήρας στο τέλος απάντησης · (4) ουδέτερο θέμα email προς πελάτη
//   node --experimental-sqlite tests/v100.test.mjs  ·  --mutate=N (ΠΡΕΠΕΙ να κοκκινίσει)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let src = readFileSync("src/km.js", "utf8");
let js = readFileSync("site/kostometro/app.js", "utf8");
let html = readFileSync("site/kostometro/index.html", "utf8");
const know = readFileSync("site/kostometro/agent/knowledge_el.md", "utf8");
const MUT = [
  ["src", "  reply = agentTidy(reply);\n", ""],                                                                    // 1 · 🔴 το «Β» ξαναγράφεται στο ιστορικό
  ["src", ".bind(code, AGENT_TOPIC, email, t, t),", ".bind(code, (\"Βοηθός · \" + summary).slice(0, 60), email, t, t),"], // 2 · 🔴 εσωτερική περίληψη στο θέμα του πελάτη
  ["js", "if (k) { m.k = k; }", "if (k) { m.k = k; m.img = agThumbs[k]; }"],                                      // 3 · 🔴 εικόνα αποθηκεύεται στη συσκευή
  ["js", "    var img = agImg, th = agThumb, k = '';\n    agDropImg();\n", "    var img = agImg, th = agThumb, k = '';\n"], // 4 · η μικρογραφία μένει μετά την αποστολή
  ["html", "<div id=\"ag-prev\" class=\"ag-prev\" data-agent=\"preview\" hidden>", "<div id=\"ag-prev\" class=\"ag-prev\" data-agent=\"preview\">"], // 5 · κενό πλαίσιο πάντα ορατό
  ["js", "<b>Σου συνιστούμε πληρωμένο κλειδί</b>", "Με <b>δωρεάν κλειδί</b> δεν πληρώνεις τίποτα"],             // 6 · πίσω στο «δωρεάν»
  ["src", "while (lines.length > 1 && [...lines", "while (lines.length > 0 && [...lines"],                          // 7 · κόβει και απάντηση ενός χαρακτήρα
  ["js", "    el('ag-imgx').onclick = agDropImg;\n", ""],                                                         // 8 · το ✕ δεν κάνει τίποτα
];
if (ONLY) { const m = MUT[ONLY - 1]; if (!m) process.exit(2); const bag = { src, js, html };
  if (!bag[m[0]].includes(m[1])) { console.log("Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(3); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ src, js, html } = bag); }
let failed = 0;
const check = async (n, f) => { try { await f(); if (!ONLY) console.log("  ✔ " + n); } catch (e) { failed++; console.log("  ✘ " + n + " — " + e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
const db = new DatabaseSync(":memory:");
for (const f of ["km.sql", "km_h13.sql", "km_v54.sql", "km_mail.sql", "km_feedback.sql", "km_h11b.sql", "km_ref.sql", "km_ref2.sql", "km_verify.sql", "km_support.sql", "km_support_v95.sql", "km_funnel.sql", "km_leads.sql", "km_pinakas.sql", "km_oauth.sql", "km_agent.sql"]) {
  let sql; try { sql = readFileSync("schema/" + f, "utf8"); } catch (e) { continue; }
  sql = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  for (const s of sql.split(";")) { const t = s.trim(); if (!t) continue; try { db.exec(t + ";"); } catch (e) { if (!/duplicate column|already exists/i.test(e.message)) throw e; } }
}
const stmt = (sql, args) => { const p = db.prepare(sql); return { async first() { return p.get(...args) ?? null; },
  async run() { const r = p.run(...args); return { meta: { changes: Number(r.changes) } }; }, async all() { return { results: p.all(...args) }; } }; };
const DB = { prepare: (sql) => ({ bind: (...a) => stmt(sql, a), ...stmt(sql, []) }), async batch(l) { for (const s of l) await s.run(); return []; } };
const mails = [];
const env = { DB, KM_ADMIN_KEY: "adm1n", ANTHROPIC_API_KEY: "k-test", EMAIL: { async send(m) { mails.push(m); return { messageId: "x" }; } },
  ASSETS: { async fetch() { return new Response("## ΓΝΩΣΗ-ΤΕΣΤ"); } } };
let calls = [], script = [];
const anth = (content, stop) => ({ content, stop_reason: stop || "end_turn", usage: { input_tokens: 10, output_tokens: 10 } });
globalThis.fetch = async (url, o) => {
  if (!/api\.anthropic\.com/.test(url)) throw new Error("fetch " + url);
  calls.push(JSON.parse(o.body)); const nx = script.shift();
  if (!nx) return new Response(JSON.stringify({ error: { type: "overloaded_error" } }), { status: 529 });
  return new Response(JSON.stringify(nx));
};
const chat = async (body) => { const r = await mod.handleKm(new Request("https://x/api/km/agent/chat", { method: "POST", body: JSON.stringify(body) }), env, null, "/api/km/agent/chat"); return { s: r.status, j: await r.json() }; };

// ── server ──
await check("Ν100-1 · agentTidy: κόβει τελική γραμμή ενός χαρακτήρα — ΟΧΙ απάντηση που είναι μόνο ένας χαρακτήρας, ΟΧΙ αριθμημένα βήματα", async () => {
  const T = mod.agentTidy;
  ok(T("Μη πατήσεις «Ξεκινάω τώρα».\n\nΒ") === "Μη πατήσεις «Ξεκινάω τώρα».", JSON.stringify(T("Μη πατήσεις «Ξεκινάω τώρα».\n\nΒ")));
  ok(T("Γεια.\nΒ\n  \nΓ\n") === "Γεια.", "πολλές");
  ok(T("Β") === "Β", "μόνος χαρακτήρας κόπηκε");
  ok(T("1. Πάτα\n2. Γράψε") === "1. Πάτα\n2. Γράψε", "βήματα");
  ok(T("Έτοιμο 🙂") === "Έτοιμο 🙂", "emoji στην ίδια γραμμή");
});
await check("Ν100-2 · 🔴 στη συζήτηση: το μοναχικό «Β» ΔΕΝ φτάνει στον χρήστη ΟΥΤΕ στο ιστορικό (άρα ούτε στον επόμενο γύρο)", async () => {
  script = [anth([{ type: "text", text: "Στο κινητό πάτα «Έχω ήδη λογαριασμό».\n\nΒ" }])];
  const r = await chat({ install_id: "km_t1", text: "στο iPhone;", consent: true });
  ok(r.s === 200 && r.j.reply === "Στο κινητό πάτα «Έχω ήδη λογαριασμό».", JSON.stringify(r.j));
  const a = db.prepare("SELECT body FROM km_agent_messages WHERE role = 'assistant'").all().map((x) => x.body);
  ok(a.length === 1 && !/\nΒ$/.test(a[0]) && !a[0].endsWith("Β"), JSON.stringify(a));
  env.__sid = r.j.sid;
});
await check("Ν100-3 · 🔴 «άνθρωπος»: το θέμα του αιτήματος (= θέμα email πελάτη) είναι ουδέτερο · η περίληψη ΜΟΝΟ στο εσωτερικό email", async () => {
  mails.length = 0;
  script = [anth([{ type: "tool_use", id: "tu1", name: "handoff_to_human", input: { email: "maria@shop.cy", summary: "Ο χρήστης δεν έχει λογαριασμό και θέλει να εγκαταστήσει" } }], "tool_use"),
    anth([{ type: "text", text: "Άνοιξα το αίτημα KM-E-000001." }])];
  const r = await chat({ sid: env.__sid, install_id: "km_t1", text: "θέλω άνθρωπο" });
  ok(r.j.ticket === "KM-E-000001", JSON.stringify(r.j));
  const c = db.prepare("SELECT topic FROM km_support_cases WHERE code = 'KM-E-000001'").get();
  ok(c && c.topic === "Κώστας · βοηθός Kostometro", "topic = " + JSON.stringify(c));   // v104: όνομα
  ok(mails.length === 1 && /^\[Agent\] KM-E-000001 · Kostometro · Ο χρήστης δεν έχει/.test(mails[0].subject), "εσωτερικό θέμα: " + (mails[0] && mails[0].subject));
});

// ── εφαρμογή ──
const slice = (a, b) => { const i = js.indexOf(a), j2 = js.indexOf(b, i); if (i < 0 || j2 < 0) throw new Error("λείπει " + a); return js.slice(i, j2); };
await check("Ν100-4 · HTML: πλαίσιο μικρογραφίας ΚΡΥΦΟ αρχικά, με εικόνα, σημείωμα και ✕", async () => {
  const p = html.slice(html.indexOf('id="ag-prev"') - 10, html.indexOf('id="ag-form"'));
  ok(/<div id="ag-prev"[^>]*\bhidden>/.test(html), "όχι κρυφό");
  ok(p.includes('id="ag-thumb"') && p.includes('id="ag-imgnote"') && p.includes('id="ag-imgx"') && /aria-label="Αφαίρεση φωτογραφίας"/.test(p), "στοιχεία");
});
await check("Ν100-5 · 🔴 μικρογραφία: φαίνεται στη φούσκα, ΑΛΛΑ στη συσκευή (localStorage) γράφεται μόνο κλειδί — ποτέ εικόνα · ✕ και αποστολή καθαρίζουν", async () => {
  const store = {}, els = {};
  const mk = (id) => els[id] || (els[id] = { id, hidden: true, value: "", src: "", innerHTML: "", scrollTop: 0, scrollHeight: 0, textContent: "", removeAttribute(a) { this[a] = ""; } });
  const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const code = slice("  var AG = {", "  function agShowChat()") + slice("  function agDropImg()", "  function agSend(e) {") +
    "\nreturn { agPush, agRender, agDropImg, set: (i, t) => { agImg = i; agThumb = t; }, thumbs: agThumbs, get img() { return agImg; } };";
  const api = new Function("el", "localStorage", "location", code)(mk, localStorage, { search: "" });
  const TH = "data:image/jpeg;base64,/9j/THUMB";
  api.thumbs.k1 = TH; api.agPush("u", "📎 τι πατάω;", "k1");
  ok(!store.km_agent_log.includes("data:") && !store.km_agent_log.includes("THUMB") && JSON.parse(store.km_agent_log)[0].k === "k1", "🔴 στη συσκευή: " + store.km_agent_log);
  ok(els["ag-log"].innerHTML.includes('<img class="ag-mimg"') && els["ag-log"].innerHTML.includes(TH), "δεν φαίνεται στη φούσκα");
  api.set({ mime: "image/jpeg", data: "AAA" }, TH); mk("ag-prev").hidden = false; mk("ag-thumb").src = TH; mk("ag-img").value = "C:\\x.jpg";
  api.agDropImg();
  ok(api.img === null && els["ag-prev"].hidden === true && !els["ag-thumb"].src && els["ag-img"].value === "", "✕ δεν καθάρισε");
  const send = slice("  function agSend(e) {", "  function agInit() {");
  ok(send.indexOf("agDropImg();") > -1 && send.indexOf("agDropImg();") < send.indexOf("fetch(KM_API"), "η αποστολή δεν καθαρίζει την προεπισκόπηση");
  ok(/el\('ag-imgx'\)\.onclick = agDropImg;/.test(js), "✕ χωρίς χειριστή");
  const pick = slice("  function agPick(f) {", "  function agDropImg()");
  ok(pick.includes("el('ag-thumb').src = agThumb") && pick.includes("el('ag-prev').hidden = false") && /240/.test(pick), "agPick");
});
await check("Ν100-6 · 🔴 κλειδί Gemini: η εφαρμογή ΚΑΙ ο βοηθός συστήνουν πληρωμένο (απόφαση 22/9) · ίδιο ενδεικτικό κόστος με τον οδηγό", async () => {
  const faq = slice("  var FAQ = [", "var faqDone");
  ok(!/δωρεάν από την Google/.test(faq) && !/κάτω από 2 €/.test(faq), "παλιό κείμενο στο FAQ");
  ok(faq.includes("<b>Σου συνιστούμε πληρωμένο κλειδί</b>") && faq.includes("περίπου 0,50 € για 100 τιμολόγια"), "νέο κείμενο");
  ok(!/δωρεάν από την Google/.test(know) && know.includes("Σου συνιστούμε πληρωμένο κλειδί") && know.includes("ΠΡΩΤΑ στον υπολογιστή"), "γνώση δεν ξαναχτίστηκε");
  ok(!mod.agentHasSecret(know), "μυστικό στη γνώση");
});
if (ONLY) { if (failed) { console.log("Μ" + ONLY + " → κοκκίνισε ✔"); process.exit(0); } console.log("Μ" + ONLY + " ΠΕΡΑΣΕ — το τεστ δεν πιάνει τίποτα"); process.exit(1); }
console.log(failed ? "ΑΠΕΤΥΧΑΝ " + failed : "✔ ΟΛΑ ΠΕΡΑΣΑΝ (6)"); process.exit(failed ? 1 : 0);
