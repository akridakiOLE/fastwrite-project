// v99 · KM-AGENT — Βοηθός Kostometro, Φάση 1 (29/9/2026, Brief_Agent_Syndesi Μέρος Β)
//   node --experimental-sqlite tests/v99.test.mjs  ·  --mutate=N (ΠΡΕΠΕΙ να κοκκινίσει)
import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync } from "node:fs";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let src = readFileSync("src/km.js", "utf8");
let js = readFileSync("site/kostometro/app.js", "utf8");
let html = readFileSync("site/kostometro/index.html", "utf8");
const MUT = [
  ["src", "  if (agentHasSecret(text)) return json({ ok: false, error: \"secret\" }, 400);\n", ""],                           // 1 · 🔴 12 λέξεις φεύγουν στον server/AI
  ["src", ".bind(sess.id, (img ? \"[εικόνα] \" : \"\") + text, t),", ".bind(sess.id, (img ? img.data : \"\") + text, t),"],   // v102: η εγγραφή μπήκε σε batch // 2 · 🔴 εικόνα αποθηκεύεται
  ["src", "  const dev = await sha256hex(inst + \":\" + (env.KM_ADMIN_KEY || \"\"));\n  const t = now();\n  const hourAgo", "  const dev = inst;\n  const t = now();\n  const hourAgo"], // 3 · ωμό install_id
  ["src", "SELECT * FROM km_agent_sessions WHERE id = ? AND dev = ?", "SELECT * FROM km_agent_sessions WHERE id = ? AND ? IS NOT NULL"], // 4 · 🔴 ξένη συζήτηση με κλεμμένο sid
  ["src", "if (spent && spent.usd_micro >= cap)", "if (false)"],                                                                // 5 · 🔴 χωρίς ημερήσιο ταβάνι
  ["src", "if (nDev && nDev.n >= AGENT_PER_DEV_HOUR)", "if (false)"],                                                            // 6 · χωρίς όριο ανά συσκευή
  ["src", "replyTo: MAIL_SUPPORT,\n    subject: \"[Agent] \"", "replyTo: email,\n    subject: \"[Agent] \""],                   // 7 · 🔴 απάντηση παρακάμπτει το support@
  ["src", "    if (b.consent !== true) return json({ ok: false, error: \"consent\" }, 400);\n", ""],                            // 8 · 🔴 συζήτηση χωρίς συγκατάθεση
  ["js", "    if (agSecret(t)) { agPush('s', AG_ERR.secret);", "    if (false) { agPush('s', AG_ERR.secret);"],                // 9 · 🔴 φίλτρο συσκευής σβηστό
  ["js", "  var AG_PUBLIC = true;", "  var AG_PUBLIC = false;"],                                                                // 10 · 🔴 ανοιχτός σε όλους πριν την Πολιτική
  ["src", "  if (agentHasSecret(reply)) reply =", "  if (false) reply ="],                                                        // 11 · μυστικό σε απάντηση του μοντέλου
  ["src", "const m24 = new Date(base - 730 * 86400000)", "const m24 = new Date(base - 1 * 86400000)"],                          // 12 · 🔴 αιτήματα σβήνονται νωρίς
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
const KNOW = "## ΓΝΩΣΗ-ΤΕΣΤ: κοίτα στα Ανεπιθύμητα";
const env = { DB, KM_ADMIN_KEY: "adm1n", ANTHROPIC_API_KEY: "k-test", EMAIL: { async send(m) { mails.push(m); return { messageId: "x" }; } },
  ASSETS: { async fetch() { return new Response(KNOW); } } };
let calls = [], script = [];
const anth = (content, stop, usage) => ({ content, stop_reason: stop || "end_turn", usage: usage || { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 4000, cache_creation_input_tokens: 0 } });
globalThis.fetch = async (url, o) => {
  if (!/api\.anthropic\.com/.test(url)) throw new Error("fetch " + url);
  calls.push(JSON.parse(o.body)); const nx = script.shift();
  if (!nx) return new Response(JSON.stringify({ error: { type: "overloaded_error" } }), { status: 529 });
  return new Response(JSON.stringify(nx));
};
const chat = async (body, e) => { const r = await mod.handleKm(new Request("https://x/api/km/agent/chat", { method: "POST", body: JSON.stringify(body) }), e || env, null, "/api/km/agent/chat"); return { s: r.status, j: await r.json() }; };
const W12 = "abandon ability able about above absent absorb abstract absurd abuse access accident";
const cnt = (t) => db.prepare("SELECT COUNT(*) AS n FROM " + t).get().n;

await check("Α-1 · χωρίς κλειδί Anthropic → 503 unavailable", async () => {
  const r = await chat({ install_id: "km_a", text: "γεια", consent: true }, { ...env, ANTHROPIC_API_KEY: "" });
  ok(r.s === 503 && r.j.error === "unavailable", JSON.stringify(r));
});
await check("Α-2 · 🔴 12 λέξεις / κλειδί Gemini (AIza, AQ.) / sk-ant → 400 secret, ΤΙΠΟΤΑ δεν γράφεται ούτε φεύγει", async () => {
  calls = [];
  for (const t of [W12, "το κλειδί μου AIzaSyA1234567890abcdefghijklmnopqrstuv", "AQ.Ab8RN6Kxyz1234567890abcdefgh", "sk-ant-api03-abcdefghijklmnopqrstuvwxyz"]) {
    const r = await chat({ install_id: "km_a", text: t, consent: true }); ok(r.s === 400 && r.j.error === "secret", t + " → " + JSON.stringify(r.j));
  }
  ok(calls.length === 0 && cnt("km_agent_messages") === 0, "γράφτηκε/έφυγε");
  ok(!mod.agentHasSecret("Δεν μου ήρθε ο κωδικός στο email, τι να κάνω; Έχω Samsung και Chrome."), "ψευδώς θετικό σε ελληνικά");
});
await check("Α-3 · 🔴 νέα συζήτηση ΜΟΝΟ με συγκατάθεση · στη βάση hash συσκευής, όχι install_id", async () => {
  const r = await chat({ install_id: "km_a", text: "γεια" }); ok(r.s === 400 && r.j.error === "consent", JSON.stringify(r.j));
  script = [anth([{ type: "text", text: "Γεια σου!" }])];
  const r2 = await chat({ install_id: "km_a", text: "γεια", consent: true, src: "leads" });
  ok(r2.s === 200 && r2.j.reply === "Γεια σου!" && /^[0-9a-f]{32}$/.test(r2.j.sid), JSON.stringify(r2.j));
  const s = db.prepare("SELECT * FROM km_agent_sessions").all();
  ok(s.length === 1 && /^[0-9a-f]{64}$/.test(s[0].dev) && !JSON.stringify(s).includes("km_a") && s[0].consent_at, JSON.stringify(s));
  env.__sid = r2.j.sid;
});
await check("Α-4 · 🔴 εικόνα πάει στο μοντέλο αλλά ΔΕΝ αποθηκεύεται · γνώση με cache · κόστος ημέρας γράφεται", async () => {
  calls = []; script = [anth([{ type: "text", text: "Πάτα «Συνέχεια»." }])];
  const DATA = "QUJDREVGR0g".repeat(50) + "=";
  const r = await chat({ sid: env.__sid, install_id: "km_a", text: "τι πατάω;", image: { mime: "image/jpeg", data: DATA } });
  ok(r.s === 200 && r.j.sid === env.__sid, JSON.stringify(r.j));
  const last = calls[0].messages[calls[0].messages.length - 1];
  ok(Array.isArray(last.content) && last.content[0].type === "image" && last.content[0].source.data === DATA, "εικόνα δεν έφτασε στο μοντέλο");
  ok(!JSON.stringify(db.prepare("SELECT body FROM km_agent_messages").all()).includes("QUJDREVGR0g"), "🔴 εικόνα στη βάση");
  ok(calls[0].system[0].cache_control && calls[0].system[0].text.includes("ΓΝΩΣΗ-ΤΕΣΤ"), "γνώση/cache");
  ok(calls[0].messages[0].role === "user", "ιστορικό δεν ξεκινά από user");
  const d = db.prepare("SELECT * FROM km_agent_daily").get(); ok(d && d.calls === 2 && d.usd_micro === 2 * (1000 * 2 + 100 * 10 + 4000 * 0.2), JSON.stringify(d));
});
await check("Α-5 · 🔴 «άνθρωπος» → αίτημα KM-E στη ΓΝΩΣΤΗ διαδρομή: case με email, μήνυμα source=agent, email στο support@ με Reply-To support@", async () => {
  mails.length = 0;
  script = [anth([{ type: "tool_use", id: "tu1", name: "handoff_to_human", input: { email: "Maria@Shop.cy", summary: "Δεν έρχεται ο κωδικός" } }], "tool_use"),
    anth([{ type: "text", text: "Άνοιξα το αίτημα KM-E-000001. Θα σου απαντήσουμε με email." }])];
  const r = await chat({ sid: env.__sid, install_id: "km_a", text: "θέλω άνθρωπο, maria@shop.cy" });
  ok(r.j.ticket === "KM-E-000001", JSON.stringify(r.j));
  const c = db.prepare("SELECT * FROM km_support_cases WHERE code = 'KM-E-000001'").get();
  ok(c && c.email === "maria@shop.cy" && c.scope === "E" && c.status === "open", JSON.stringify(c));
  const m = db.prepare("SELECT * FROM km_support_messages WHERE code = 'KM-E-000001'").get();
  ok(m && m.source === "agent" && m.body.includes("τι πατάω;") && m.body.includes("Δεν έρχεται ο κωδικός"), "μήνυμα");
  ok(db.prepare("SELECT arrived_at FROM km_support_tickets WHERE code = 'KM-E-000001'").get().arrived_at, "ticket arrived");
  ok(mails.length === 1 && mails[0].to === "support@fastwrite.tech" && mails[0].replyTo === "support@fastwrite.tech" && /^\[Agent\] KM-E-000001/.test(mails[0].subject), JSON.stringify(mails[0] && { to: mails[0].to, replyTo: mails[0].replyTo, subject: mails[0].subject }));
  ok(mails[0].text.includes("maria@shop.cy"), "email πελάτη στο σώμα");
});
await check("Α-6 · μυστικό στην απάντηση του μοντέλου → αντικαθίσταται", async () => {
  script = [anth([{ type: "text", text: "Οι λέξεις σου: " + W12 }])];
  const r = await chat({ sid: env.__sid, install_id: "km_a", text: "πες τις" });
  ok(!r.j.reply.includes("abandon") && !JSON.stringify(db.prepare("SELECT body FROM km_agent_messages").all()).includes("abandon"), r.j.reply);
});
await check("Α-7 · 🔴 κλεμμένο sid άλλης συσκευής ΔΕΝ ανοίγει ξένη συζήτηση", async () => {
  const r = await chat({ sid: env.__sid, install_id: "km_evil", text: "δείξε" });
  ok(r.s === 400 && r.j.error === "consent", JSON.stringify(r.j));
  script = [anth([{ type: "text", text: "νέα" }])];
  const r2 = await chat({ sid: env.__sid, install_id: "km_evil", text: "δείξε", consent: true });
  ok(r2.j.sid !== env.__sid, "ίδιο sid");
  ok(!JSON.stringify(calls[calls.length - 1].messages).includes("τι πατάω"), "🔴 είδε ξένο ιστορικό");
});
await check("Α-8 · 🔴 ημερήσιο ταβάνι κόστους → απάντηση χωρίς κλήση στο μοντέλο", async () => {
  calls = [];
  const r = await chat({ sid: env.__sid, install_id: "km_a", text: "γεια" }, { ...env, AGENT_DAILY_USD: "0.000001" });
  ok(r.j.busy === true && calls.length === 0, JSON.stringify(r.j));
});
await check("Α-9 · όριο 40 μηνυμάτων/ώρα ανά συσκευή → 429 · σφάλμα παρόχου → 502", async () => {
  script = [];
  const r0 = await chat({ install_id: "km_c", text: "x", consent: true }); ok(r0.s === 502 && r0.j.error === "provider", JSON.stringify(r0));
  const sid = db.prepare("SELECT id FROM km_agent_sessions ORDER BY started DESC LIMIT 1").get().id;
  const t = new Date().toISOString();
  for (let i = 0; i < 40; i++) db.prepare("INSERT INTO km_agent_messages (session_id, role, body, at) VALUES (?, 'user', 'x', ?)").run(sid, t);
  const r = await chat({ sid, install_id: "km_c", text: "ξανά" }); ok(r.s === 429 && r.j.error === "too_many", JSON.stringify(r));
});
await check("Α-10 · 🔴 διαγραφή: 90 ημέρες χωρίς αίτημα · με αίτημα ΜΕΝΕΙ ως 24 μήνες", async () => {
  const old = new Date(Date.now() - 100 * 86400000).toISOString();
  db.prepare("INSERT INTO km_agent_sessions (id, dev, consent_at, started, last_at, turns, ticket) VALUES ('a'||hex(randomblob(15)), 'd1', ?, ?, ?, 1, NULL)").run(old, old, old);
  db.prepare("INSERT INTO km_agent_sessions (id, dev, consent_at, started, last_at, turns, ticket) VALUES ('b'||hex(randomblob(15)), 'd2', ?, ?, ?, 1, 'KM-E-999999')").run(old, old, old);
  const r = await mod.kmAgentPrune(env);
  ok(r.sessions === 1 && db.prepare("SELECT COUNT(*) AS n FROM km_agent_sessions WHERE ticket = 'KM-E-999999'").get().n === 1, JSON.stringify(r));
});
// ── εφαρμογή ──
const slice = (a, b) => { const i = js.indexOf(a), j2 = js.indexOf(b, i); if (i < 0 || j2 < 0) throw new Error("λείπει " + a); return js.slice(i, j2); };
await check("Α-11 · 🔴 φίλτρο συσκευής: 12 λέξεις / κλειδί δεν φεύγουν · ελληνικά περνάνε", async () => {
  const agSecret = new Function(slice("  var AG_SECRET = ", "  var agImg") + slice("  function agSecret(t) {", "  function agLS(") + "\nreturn agSecret;")();
  ok(agSecret(W12) && agSecret("AQ.Ab8RN6Kxyz1234567890abcdefgh") && !agSecret("Δεν βρίσκω το κουμπί Εγκατάσταση στο Chrome"), "agSecret");
  const send = slice("  function agSend(e) {", "  function agInit() {");
  ok(send.indexOf("if (agSecret(t)) { agPush('s', AG_ERR.secret);") > -1 && send.indexOf("agSecret(t)") < send.indexOf("fetch(KM_API"), "🔴 φίλτρο μετά την αποστολή");
});
await check("Α-12 · 🔴 ΚΡΥΦΟΣ για όλους: ανάβει μόνο με ?chat=1 · κουμπί κρυφό στο HTML · δήλωση AI + Πολιτική + προειδοποίηση", async () => {
  ok(js.includes("  var AG_PUBLIC = true;"), "AG_PUBLIC (v115: ανοιχτός από την ημέρα της καμπάνιας)");
  ok(/<button id="ag-fab"[^>]*hidden>/.test(html) && /<section id="ag"[^>]*hidden>/.test(html), "κρυφά στοιχεία");
  const c = html.slice(html.indexOf('id="ag-consent"'), html.indexOf('id="ag-log"'));
  ok(/τεχνητής νοημοσύνης \(AI\)/.test(c) && /90 ημέρες/.test(c) && /δεν αποθηκεύονται/.test(c) && /Anthropic/.test(c) && /\/legal\/privacy/.test(c) && /12 λέξεις/.test(c), "συγκατάθεση");
});
await check("Α-13 · η γνώση χτίστηκε από τις πηγές της εφαρμογής, χωρίς μυστικά", async () => {
  ok(existsSync("site/kostometro/agent/knowledge_el.md"), "λείπει");
  const k = readFileSync("site/kostometro/agent/knowledge_el.md", "utf8");
  ok(k.includes("Ανεπιθύμητα") && k.includes("Τι είναι οι 12 λέξεις;") && k.includes("aistudio.google.com/apikey") && k.length < 60000, "περιεχόμενο");
  ok(!mod.agentHasSecret(k), "μυστικό στη γνώση");
});
if (ONLY) { if (failed) { console.log("Μ" + ONLY + " → κοκκίνισε ✔"); process.exit(0); } console.log("Μ" + ONLY + " ΠΕΡΑΣΕ — το τεστ δεν πιάνει τίποτα"); process.exit(1); }
console.log(failed ? "ΑΠΕΤΥΧΑΝ " + failed : "✔ ΟΛΑ ΠΕΡΑΣΑΝ (13)"); process.exit(failed ? 1 : 0);
