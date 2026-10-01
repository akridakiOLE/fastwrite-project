// v106 · ΡΑΝΤΕΒΟΥ ΕΠΑΝΑΣΥΝΔΕΣΗΣ του «Κώστα» — Πολιτική v2.2 §Α8 (έγκριση Stavros 1/10/2026)
//   «ναι» → schedule_followup → ΕΝΑ email τη μέρα του ραντεβού → ?reopen=<token> → άδεια μίας συζήτησης.
//   «Μίλα με τον Κώστα» στην Υποστήριξη → ίδια άδεια, έως 2 φορές τον μήνα ανά λογαριασμό.
//   node --experimental-sqlite tests/v106.test.mjs  ·  --mutate=N (ΠΡΕΠΕΙ να κοκκινίσει)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let src = readFileSync("src/km.js", "utf8");
let js = readFileSync("site/kostometro/app.js", "utf8");
let html = readFileSync("site/kostometro/index.html", "utf8");
let pol = readFileSync("site/legal/privacy.html", "utf8");
let wk = readFileSync("src/worker.js", "utf8");
const MUT = [
  ["src", "    if (f.used_at) return json({ ok: false, error: \"used\" }, 410);\n    const u = await env.DB.prepare(\"UPDATE km_agent_followups SET used_at = ? WHERE id = ? AND used_at IS NULL\").bind(t, f.id).run();\n    if (!u || !u.meta || !u.meta.changes) return json({ ok: false, error: \"used\" }, 410);", ""], // 1 · 🔴 ο σύνδεσμος ξαναχρησιμοποιείται
  ["src", "if (!f || !f.token_exp || f.token_exp <= t) return json({ ok: false, error: \"expired\" }, 410);", "if (!f) return json({ ok: false, error: \"expired\" }, 410);"], // 2 · 🔴 ληγμένος σύνδεσμος δουλεύει
  ["src", "if (n && n.n >= AGENT_REOPEN_MONTH) return json({ ok: false, error: \"month_limit\" }, 429);", ""],                                    // 3 · 🔴 χωρίς μηνιαίο όριο
  ["src", "  if (pend) return { ok: true, already: true, due: pend.due_at.slice(0, 10) };\n", ""],                                               // 4 · δύο ραντεβού = δύο email
  ["src", "  if (!acct) return { ok: false, error: \"no_account\", note: \"Το ραντεβού κλείνεται μόνο αφού ολοκληρωθεί η εγγραφή.\" };\n", ""], // 5 · 🔴 ραντεβού χωρίς λογαριασμό
  ["src", ".concat(grant ? [env.DB.prepare(\"UPDATE km_agent_grants SET msgs_left = msgs_left - 1 WHERE id = ?\").bind(grant.id)] : [])", ""],    // 6 · 🔴 η άδεια δεν τελειώνει ποτέ
  ["src", "  if (g && !grant) return done(", "  if (false) return done("],                                                                         // 7 · 🔴 μετά την άδεια συνεχίζει «ζεστό»
  ["src", "    const lock = await env.DB.prepare(\"UPDATE km_agent_followups SET sent_at = ?, token_hash = ?, token_exp = ? WHERE id = ? AND sent_at IS NULL\")", "    const lock = await env.DB.prepare(\"UPDATE km_agent_followups SET token_hash = ?, token_exp = ? WHERE id = ? AND ? IS NOT NULL\")"], // 8 · 🔴 δεύτερο email
  ["src", "Καλείς schedule_followup ΜΟΝΟ αν απαντήσει ρητά ναι", "Καλείς schedule_followup"],                                                   // 9 · 🔴 χωρίς ρητό ναι
  ["pol", "με σύνδεσμο που ξανανοίγει τον βοηθό για μία συζήτηση· ο σύνδεσμος λήγει σε 14 ημέρες", "με σύνδεσμο που ξανανοίγει τον βοηθό"],   // 10 · 🔴 η Πολιτική δεν λέει τη λήξη
  ["wk", "ctx.waitUntil(kmAgentFollowups(env).then(", "ctx.waitUntil(Promise.resolve({}).then("],                                             // 11 · το cron δεν στέλνει
  ["js", "    if (agGrantOn()) { return true; }\n", ""],                                                                                      // 12 · η άδεια δεν ανοίγει τον Κώστα στην εφαρμογή
];
if (ONLY) { const m = MUT[ONLY - 1]; if (!m) process.exit(2); const bag = { src, js, html, pol, wk };
  if (!bag[m[0]].includes(m[1])) { console.log("Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(3); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ src, js, html, pol, wk } = bag); }
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
const env = { DB, KM_ADMIN_KEY: "adm1n", ANTHROPIC_API_KEY: "k-test", EMAIL: { async send(m) { mails.push(m); return { messageId: "x" + mails.length }; } },
  ASSETS: { async fetch() { return new Response("## ΓΝΩΣΗ-ΤΕΣΤ"); } } };
const calls = []; let script = [];
const anth = (content, stop) => ({ content, stop_reason: stop || "end_turn", usage: { input_tokens: 10, output_tokens: 10 } });
globalThis.fetch = async (url, o) => {
  if (!/api\.anthropic\.com/.test(url)) throw new Error("fetch " + url);
  calls.push(JSON.parse(o.body));
  return new Response(JSON.stringify(script.shift() || anth([{ type: "text", text: "Πώς πάει;" }])));
};
const call = async (path, body) => { const r = await mod.handleKm(new Request("https://x" + path, { method: "POST", body: JSON.stringify(body) }), env, null, path); return { s: r.status, j: await r.json() }; };
const chat = (b) => call("/api/km/agent/chat", b);
const reopen = (b) => call("/api/km/agent/reopen", b);
const devOf = async (inst) => { const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(inst + ":adm1n")); return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join(""); };
const shaHex = async (s) => { const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join(""); };
// Λογαριασμός «ολοκληρωμένος»: km_accounts + km_devices + χωνί account,key
const T0 = new Date().toISOString();
const FOLD = "f".repeat(64);
db.prepare("INSERT INTO km_accounts (folder_id, auth_hash, email, created) VALUES (?, ?, ?, ?)").run(FOLD, "a".repeat(64), "maria@shop.cy", T0);
for (const i of ["km_acc1", "km_acc2"]) db.prepare("INSERT INTO km_devices (install_id, folder_id, created) VALUES (?, ?, ?)").run(i, FOLD, T0);
for (const i of ["km_acc1", "km_acc2"]) { const d = await devOf(i); for (const st of ["open", "account", "key"]) db.prepare("INSERT INTO km_funnel (dev, step, src, at) VALUES (?, ?, 'leads', ?)").run(d, st, T0); }

await check("Ρ-1 · 🔴 «ναι» → schedule_followup: ΕΝΑ ραντεβού ανά λογαριασμό, με τη φράση συγκατάθεσης · χωρίς λογαριασμό ΟΧΙ", async () => {
  script = [anth([{ type: "tool_use", id: "t1", name: "schedule_followup", input: { days: 7 } }], "tool_use"), anth([{ type: "text", text: "Κλείσαμε!" }])];
  const r = await chat({ install_id: "km_new1", text: "ναι, σε μια βδομάδα", consent: true });   // χωρίς λογαριασμό (εγκατάσταση σε εξέλιξη)
  ok(r.s === 200, JSON.stringify(r.j));
  const tr = calls[calls.length - 1].messages.at(-1).content[0];
  ok(tr.type === "tool_result" && JSON.parse(tr.content).error === "no_account", "χωρίς λογαριασμό: " + JSON.stringify(tr));
  ok(db.prepare("SELECT COUNT(*) AS n FROM km_agent_followups").get().n === 0, "γράφτηκε ραντεβού χωρίς λογαριασμό");
  // Λογαριασμός μέσα στο παράθυρο χάρης: πρώτα μια κουβέντα για να είναι «ζεστή» η συνεδρία
  db.prepare("DELETE FROM km_funnel WHERE dev = ? AND step = 'key'").run(await devOf("km_acc1"));
  script = [anth([{ type: "text", text: "Τέλεια." }])];
  const r0 = await chat({ install_id: "km_acc1", text: "έβαλα το κλειδί", consent: true });
  db.prepare("INSERT INTO km_funnel (dev, step, src, at) VALUES (?, 'key', 'leads', ?)").run(await devOf("km_acc1"), T0);
  script = [anth([{ type: "tool_use", id: "t2", name: "schedule_followup", input: { days: 7 } }], "tool_use"), anth([{ type: "text", text: "Κλείσαμε!" }])];
  const r1 = await chat({ sid: r0.j.sid, install_id: "km_acc1", text: "ναι, σε μια βδομάδα" });
  ok(r1.s === 200 && r1.j.reply === "Κλείσαμε!", JSON.stringify(r1.j));
  const f = db.prepare("SELECT * FROM km_agent_followups").all();
  ok(f.length === 1 && f[0].folder_id === FOLD && f[0].consent_text === "ναι, σε μια βδομάδα" && f[0].sent_at === null, JSON.stringify(f));
  const days = Math.round((Date.parse(f[0].due_at) - Date.parse(f[0].created)) / 86400000);
  ok(days === 7, "ημέρες " + days);
  ok(!("email" in f[0]), "το email ΔΕΝ αντιγράφεται στο ραντεβού");
  script = [anth([{ type: "tool_use", id: "t3", name: "schedule_followup", input: { days: 99 } }], "tool_use"), anth([{ type: "text", text: "ok" }])];
  await chat({ sid: r0.j.sid, install_id: "km_acc1", text: "ναι" });
  ok(db.prepare("SELECT COUNT(*) AS n FROM km_agent_followups").get().n === 1, "δεύτερο ραντεβού");
  const sys = calls[calls.length - 1].system[1].text;
  ok(/ραντεβού: κλεισμένο για \d{4}-\d{2}-\d{2}/.test(sys) && sys.includes("ΕΠΑΝΑΣΥΝΔΕΣΗ: όχι"), "κατάσταση: " + sys.slice(-200));
  ok(calls[0].tools.some((t) => t.name === "schedule_followup"), "εργαλείο");
  ok(calls[0].system[0].text.includes("Καλείς schedule_followup ΜΟΝΟ αν απαντήσει ρητά ναι"), "κανόνας «ρητό ναι»");
});
let TOKEN = "";
await check("Ρ-2 · 🔴 cron: πριν την ώρα τίποτα · στην ώρα ΕΝΑ email στο email του λογαριασμού, με ?reopen=token (μόνο hash στη βάση) · δεύτερο cron τίποτα", async () => {
  mails.length = 0;
  let r = await mod.kmAgentFollowups(env);
  ok(r.due === 0 && mails.length === 0, "έφυγε νωρίς " + JSON.stringify(r));
  const later = new Date(Date.now() + 8 * 86400000).toISOString();
  r = await mod.kmAgentFollowups(env, later);
  ok(r.sent === 1 && mails.length === 1, JSON.stringify(r));
  const m = mails[0];
  ok(m.to === "maria@shop.cy" && m.from.includes("noreply@notify.fastwrite.tech"), m.to);
  ok(m.subject === "Ο Κώστας ρωτά: πώς σου φαίνεται το Kostometro;", m.subject);
  const mm = /https:\/\/fastwrite\.tech\/kostometro\/\?reopen=([0-9a-f]{32})/.exec(m.html); ok(mm && m.text.includes(mm[0]), "σύνδεσμος");
  TOKEN = mm[1];
  ok(m.html.includes("βοηθός τεχνητής νοημοσύνης (AI), όχι άνθρωπος") && m.html.includes("ένα και μοναδικό") && m.html.includes("/legal/privacy#aa8") && m.html.includes("14 ημέρες"), "περιεχόμενο");
  const f = db.prepare("SELECT * FROM km_agent_followups").get();
  ok(f.sent_ok === 1 && f.token_hash === await shaHex(TOKEN) && !JSON.stringify(f).includes(TOKEN), "token μόνο ως hash");
  ok(Math.round((Date.parse(f.token_exp) - Date.parse(later)) / 86400000) === 14, "λήξη 14 ημέρες");
  r = await mod.kmAgentFollowups(env, new Date(Date.now() + 9 * 86400000).toISOString());
  ok(r.due === 0 && mails.length === 1, "δεύτερο email");
  ok(db.prepare("SELECT kind, ok FROM km_mail_log WHERE kind = 'agent_followup'").all().length === 1, "km_mail_log");
});
await check("Ρ-3 · ραντεβού λογαριασμού που σβήστηκε στο μεταξύ: ΚΑΝΕΝΑ email", async () => {
  const F2 = "e".repeat(64);
  db.prepare("INSERT INTO km_accounts (folder_id, auth_hash, email, created, deleted) VALUES (?, ?, ?, ?, ?)").run(F2, "b".repeat(64), "gone@x.cy", T0, T0);
  db.prepare("INSERT INTO km_agent_followups (folder_id, dev, created, due_at) VALUES (?, 'd', ?, ?)").run(F2, T0, T0);
  mails.length = 0;
  const r = await mod.kmAgentFollowups(env, new Date(Date.now() + 86400000).toISOString());
  ok(r.skipped === 1 && mails.length === 0, JSON.stringify(r));
});
await check("Ρ-4 · 🔴 ?reopen=token: άδεια μίας συζήτησης (20 μηνύματα, 24 ώρες) — ΜΙΑ φορά · άγνωστο/ληγμένο token → 410", async () => {
  let r = await reopen({ install_id: "km_safari1", token: "0".repeat(32) });
  ok(r.s === 410 && r.j.error === "expired", "άγνωστο " + JSON.stringify(r.j));
  r = await reopen({ install_id: "km_safari1", token: TOKEN });     // Safari χωρίς λογαριασμό: το token αρκεί
  ok(r.s === 200 && r.j.ok && r.j.msgs === 20 && r.j.via === "mail", JSON.stringify(r.j));
  ok(Math.round((Date.parse(r.j.until) - Date.now()) / 3600000) === 24, "24 ώρες");
  r = await reopen({ install_id: "km_safari2", token: TOKEN });
  ok(r.s === 410 && r.j.error === "used", "δεύτερη χρήση " + JSON.stringify(r.j));
  // ληγμένο
  const tk = "ab".repeat(16);
  db.prepare("INSERT INTO km_agent_followups (folder_id, dev, created, due_at, sent_at, token_hash, token_exp) VALUES (?, 'd', ?, ?, ?, ?, ?)").run(FOLD, T0, T0, T0, await shaHex(tk), new Date(Date.now() - 1000).toISOString());
  r = await reopen({ install_id: "km_safari3", token: tk });
  ok(r.s === 410 && r.j.error === "expired", "ληγμένο " + JSON.stringify(r.j));
});
await check("Ρ-5 · 🔴 Υποστήριξη χωρίς token: μόνο με λογαριασμό · έως 2 τον μήνα ΑΝΑ ΛΟΓΑΡΙΑΣΜΟ (όχι ανά συσκευή)", async () => {
  let r = await reopen({ install_id: "km_nobody" });
  ok(r.s === 403 && r.j.error === "no_account", JSON.stringify(r.j));
  r = await reopen({ install_id: "km_acc1" }); ok(r.s === 200 && r.j.via === "support", "1η " + JSON.stringify(r.j));
  const again = await reopen({ install_id: "km_acc1" }); ok(again.s === 200 && again.j.until === r.j.until, "ίδια άδεια όσο ισχύει (δεν μετράει δεύτερη)");
  r = await reopen({ install_id: "km_acc2" }); ok(r.s === 200, "2η (άλλη συσκευή, ίδιος λογαριασμός) " + JSON.stringify(r.j));
  db.prepare("UPDATE km_agent_grants SET expires_at = ? WHERE via = 'support'").run(new Date(Date.now() - 1000).toISOString());
  r = await reopen({ install_id: "km_acc1" });
  ok(r.s === 429 && r.j.error === "month_limit", "3η " + JSON.stringify(r.j));
});
await check("Ρ-6 · 🔴 με άδεια: ο Κώστας απαντά σε συσκευή που ΤΕΛΕΙΩΣΕ την εγκατάσταση, ξέρει ότι είναι επανασύνδεση, μετράει κάτω · στο τέλος κλείνει", async () => {
  // km_acc2: ολοκληρωμένη, χωρίς ζεστή συνεδρία → χωρίς άδεια 403
  db.prepare("DELETE FROM km_agent_grants").run();
  let r = await chat({ install_id: "km_acc2", text: "γεια", consent: true });
  ok(r.s === 403 && r.j.error === "onboarded", "χωρίς άδεια " + JSON.stringify(r.j));
  r = await reopen({ install_id: "km_acc2" }); ok(r.j.ok, JSON.stringify(r.j));
  db.prepare("UPDATE km_agent_grants SET msgs_left = 2").run();
  // ο μετρητής ζωής είναι γεμάτος — η άδεια έχει δικό της όριο
  db.prepare("INSERT INTO km_agent_devices (dev, msgs, first_at, last_at) VALUES (?, 30, ?, ?) ON CONFLICT(dev) DO UPDATE SET msgs = 30").run(await devOf("km_acc2"), T0, T0);
  r = await chat({ install_id: "km_acc2", text: "πάει καλά", consent: true });
  ok(r.s === 200 && r.j.reply === "Πώς πάει;", "1ο " + JSON.stringify(r.j));
  const sys = calls[calls.length - 1].system[1].text;
  ok(sys.includes("ΕΠΑΝΑΣΥΝΔΕΣΗ: ΝΑΙ (μέσω Υποστήριξης, απομένουν 1 μηνύματα)"), sys.slice(-220));
  r = await chat({ sid: r.j.sid, install_id: "km_acc2", text: "και κάτι ακόμα" }); ok(r.s === 200 && !r.j.limit, "2ο");
  const n = calls.length;
  r = await chat({ sid: r.j.sid, install_id: "km_acc2", text: "και τρίτο" });
  ok(r.j.limit === true && /ολοκληρώθηκε/.test(r.j.reply) && calls.length === n, "3ο: τέλος χωρίς κλήση μοντέλου " + JSON.stringify(r.j));
});
await check("Ρ-7 · Πολιτική v2.2 §Α8: ραντεβού, ένα email, 14 ημέρες, «Υποστήριξη», συγκατάθεση · ο κώδικας λέει τα ίδια νούμερα", async () => {
  ok(pol.includes("Έκδοση 2.2") && pol.includes("Ραντεβού επανασύνδεσης (μόνο αν το ζητήσεις)"), "ενότητα");
  ok(pol.includes("με σύνδεσμο που ξανανοίγει τον βοηθό για μία συζήτηση· ο σύνδεσμος λήγει σε 14 ημέρες"), "14 ημέρες");
  ok(/<strong>ένα<\/strong> email, στο email του λογαριασμού σου/.test(pol), "ένα email");
  ok(pol.includes("εκτός αν ζητήσεις να τον ξαναδείς (πιο κάτω)"), "εισαγωγή");
  ok(/const AGENT_FOLLOWUP_LINK_DAYS = 14;/.test(src), "κώδικας 14");
  ok(pol.includes("Η καταγραφή της συγκατάθεσης κρατιέται 24 μήνες.") && src.includes('DELETE FROM km_agent_followups WHERE created < ?'), "τήρηση 24 μήνες");
});
await check("Ρ-8 · εφαρμογή: ?reopen= μετά το boot · κουμπί «Μίλα με τον Κώστα» στην Υποστήριξη (μόνο αν ο βοηθός είναι ενεργός) · cron ωριαίο · v106", async () => {
  ok(js.includes("try { agReopenFromUrl(0); } catch (e) {}") && js.includes("if (!id && (tries || 0) < 40) { setTimeout(") && /\[\?&\]reopen=\(\[0-9a-f\]\{32\}\)/.test(js), "url");
  ok(js.includes("if (agGrantOn()) { return true; }"), "άδεια ανάβει τον Κώστα");
  ok(html.includes('<button class="btn ghost" id="hp-kostas-go">💬 Μίλα με τον Κώστα (AI)</button>') && html.includes('id="hp-kostas" class="hp-kostas" hidden'), "κουμπί");
  ok(js.includes("var kOn = (AG_PUBLIC || agLS(AG.on) === '1') && !!localStorage.getItem(LS.reg);"), "κρυφό όσο ο βοηθός είναι κρυφός");
  ok(wk.includes("ctx.waitUntil(kmAgentFollowups(env).then(") && wk.indexOf("kmAgentFollowups(env).then(") > wk.indexOf('if (cron === "0 3 * * *")') + 400, "ωριαίο cron");
  ok(js.includes("var APP_VER = 'φέτα 3 · v106';") && readFileSync("site/kostometro/sw.js", "utf8").includes("var CACHE = 'km-v106';"), "έκδοση");
});
await check("Ρ-9 · τήρηση: ραντεβού και άδειες σβήνονται στους 24 μήνες", async () => {
  const old = new Date(Date.now() - 800 * 86400000).toISOString();
  db.prepare("INSERT INTO km_agent_followups (folder_id, dev, created, due_at) VALUES ('x', 'd', ?, ?)").run(old, old);
  db.prepare("INSERT INTO km_agent_grants (dev, via, granted_at, expires_at, msgs_left) VALUES ('d', 'mail', ?, ?, 0)").run(old, old);
  const r = await mod.kmAgentPrune(env);
  ok(r.followups === 1 && r.grants === 1, JSON.stringify(r));
});
if (ONLY) { if (failed) { console.log("Μ" + ONLY + " → κοκκίνισε ✔"); process.exit(0); } console.log("Μ" + ONLY + " ΠΕΡΑΣΕ — το τεστ δεν πιάνει τίποτα"); process.exit(1); }
console.log(failed ? "ΑΠΕΤΥΧΑΝ " + failed : "✔ ΟΛΑ ΠΕΡΑΣΑΝ (9)"); process.exit(failed ? 1 : 0);
