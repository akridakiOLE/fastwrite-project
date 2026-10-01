// v102 · Βοηθός ΜΟΝΟ για την εγκατάσταση (απόφαση Stavros 30/9/2026) + όριο 30 μηνυμάτων ανά συσκευή
//   node --experimental-sqlite tests/v102.test.mjs  ·  --mutate=N (ΠΡΕΠΕΙ να κοκκινίσει)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let src = readFileSync("src/km.js", "utf8");
let js = readFileSync("site/kostometro/app.js", "utf8");
const MUT = [
  ["src", "  if (!grant && !warm && await agentOnboarded(env, inst, dev)) return json({ ok: false, error: \"onboarded\" }, 403);\n", ""], // 1 · 🔴 απαντά σε ολοκληρωμένους
  ["src", "  if (!st.includes(\"account\")) return true;", "  if (!st.includes(\"account\")) return false;"],   // 2 · 🔴 παλιοί χρήστες (πριν το χωνί) ξεφεύγουν
  ["src", "  const warm = sess.last_at &&", "  const warm = false &&"],                                               // 3 · κόβει ανοιχτή συζήτηση στη μέση
  ["src", "  if (life && life.msgs >= AGENT_DEV_MAX)", "  if (false)"],                                                   // 4 · 🔴 χωρίς όριο ζωής
  ["src", "    env.DB.prepare(\"INSERT INTO km_agent_devices", "    null && env.DB.prepare(\"INSERT INTO km_agent_devices"], // 5 · 🔴 ο μετρητής δεν μετράει
  ["js", "    if (agDone()) { return false; }\n", ""],                                                                   // 6 · 🔴 κουμπί μένει μετά την εγγραφή
  ["src", "  const r4 = await env.DB.prepare(\"DELETE FROM km_agent_devices WHERE last_at < ?\").bind(m24).run();", "  const r4 = null;"], // 7 · μετρητής κρατιέται για πάντα
  ["js", "        if (j && j.error === 'onboarded') { agLS(AG.gone, '1'); agLS(AG.grant, null); }", "        if (false) { agLS(AG.gone, '1'); }"], // 8 · άρνηση server δεν κρύβει το κουμπί
];
if (ONLY) { const m = MUT[ONLY - 1]; if (!m) process.exit(2); const bag = { src, js };
  if (!bag[m[0]].includes(m[1])) { console.log("Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(3); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ src, js } = bag); }
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
const DB = { prepare: (sql) => ({ bind: (...a) => stmt(sql, a), ...stmt(sql, []) }), async batch(l) { for (const s of l) if (s) await s.run(); return []; } };
const env = { DB, KM_ADMIN_KEY: "adm1n", ANTHROPIC_API_KEY: "k-test", EMAIL: { async send() { return {}; } }, ASSETS: { async fetch() { return new Response("## Γ"); } } };
let calls = 0;
globalThis.fetch = async (url) => { if (!/anthropic/.test(url)) throw new Error(url); calls++;
  return new Response(JSON.stringify({ content: [{ type: "text", text: "Εντάξει." }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } })); };
const chat = async (body) => { const r = await mod.handleKm(new Request("https://x/api/km/agent/chat", { method: "POST", body: JSON.stringify(body) }), env, null, "/api/km/agent/chat"); return { s: r.status, j: await r.json() }; };
const hash = async (inst) => Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(inst + ":adm1n"))).toString("hex");
const T = new Date().toISOString();
const account = (inst) => db.prepare("INSERT INTO km_devices (install_id, folder_id, created) VALUES (?, 'F', ?)").run(inst, T);
const step = async (inst, s) => db.prepare("INSERT OR IGNORE INTO km_funnel (dev, step, src, at) VALUES (?, ?, 'direct', ?)").run(await hash(inst), s, T);
const msgs = async (inst) => (db.prepare("SELECT msgs FROM km_agent_devices WHERE dev = ?").get(await hash(inst)) || {}).msgs || 0;

await check("Ν102-1 · νέα συσκευή (χωρίς λογαριασμό) → απαντά · ο μετρητής ζωής γράφει +1 ανά μήνυμα", async () => {
  const r = await chat({ install_id: "km_new1", text: "πώς το βάζω;", consent: true });
  ok(r.s === 200 && r.j.reply === "Εντάξει.", JSON.stringify(r));
  await chat({ sid: r.j.sid, install_id: "km_new1", text: "και μετά;" });
  ok(await msgs("km_new1") === 2, "msgs=" + await msgs("km_new1"));
});
await check("Ν102-2 · 🔴 λογαριασμός ΚΑΙ (κλειδί ή «Παράλειψη») → 403 onboarded, ΧΩΡΙΣ κλήση στο μοντέλο · λογαριασμός χωρίς κλειδί → ακόμα βοηθάει", async () => {
  account("km_mid"); await step("km_mid", "account");
  const a = await chat({ install_id: "km_mid", text: "πού βάζω το κλειδί;", consent: true }); ok(a.s === 200, "στη μέση της εγγραφής: " + JSON.stringify(a));
  for (const [inst, s] of [["km_k", "key"], ["km_sk", "key_skip"]]) {
    account(inst); await step(inst, "account"); await step(inst, s);
    const c0 = calls; const r = await chat({ install_id: inst, text: "γεια", consent: true });
    ok(r.s === 403 && r.j.error === "onboarded" && calls === c0, s + " → " + JSON.stringify(r));
  }
});
await check("Ν102-3 · 🔴 λογαριασμός ΠΡΙΝ το χωνί (v97, κανένα βήμα) → θεωρείται ολοκληρωμένος → 403", async () => {
  account("km_old"); const r = await chat({ install_id: "km_old", text: "γεια", consent: true });
  ok(r.s === 403 && r.j.error === "onboarded", JSON.stringify(r));
});
await check("Ν102-4 · ανοιχτή συζήτηση ΔΕΝ κόβεται όταν τελειώνει η εγγραφή · μετά από 2+ ώρες σιωπής → 403", async () => {
  const r = await chat({ install_id: "km_live", text: "βοήθεια", consent: true }); ok(r.s === 200, "1ο");
  account("km_live"); await step("km_live", "account"); await step("km_live", "key");
  const r2 = await chat({ sid: r.j.sid, install_id: "km_live", text: "έβαλα το κλειδί, ευχαριστώ" });
  ok(r2.s === 200 && r2.j.reply, "κόπηκε στη μέση: " + JSON.stringify(r2));
  db.prepare("UPDATE km_agent_sessions SET last_at = ? WHERE id = ?").run(new Date(Date.now() - 3 * 3600e3).toISOString(), r.j.sid);
  const r3 = await chat({ sid: r.j.sid, install_id: "km_live", text: "κι άλλο" });
  ok(r3.s === 403 && r3.j.error === "onboarded", JSON.stringify(r3));
});
await check("Ν102-5 · 🔴 όριο ζωής 30 μηνυμάτων ανά συσκευή → απάντηση «Υποστήριξη», ΧΩΡΙΣ κλήση στο μοντέλο · ισχύει και σε ΝΕΑ συζήτηση", async () => {
  db.prepare("INSERT INTO km_agent_devices (dev, msgs, first_at, last_at) VALUES (?, 30, ?, ?)").run(await hash("km_cap"), T, T);
  const c0 = calls; const r = await chat({ install_id: "km_cap", text: "γεια", consent: true });
  ok(r.s === 200 && r.j.limit === true && /Υποστήριξη/.test(r.j.reply) && calls === c0, JSON.stringify(r));
  ok(await msgs("km_cap") === 30, "μέτρησε και το απορριφθέν");
});
await check("Ν102-6 · διαγραφή: ο μετρητής φεύγει 24 μήνες μετά το τελευταίο μήνυμα — όχι νωρίτερα", async () => {
  const old = new Date(Date.now() - 800 * 86400e3).toISOString(), mid = new Date(Date.now() - 200 * 86400e3).toISOString();
  db.prepare("INSERT INTO km_agent_devices (dev, msgs, first_at, last_at) VALUES ('old', 5, ?, ?), ('mid', 5, ?, ?)").run(old, old, mid, mid);
  const r = await mod.kmAgentPrune(env);
  ok(r.devices === 1 && db.prepare("SELECT COUNT(*) AS n FROM km_agent_devices WHERE dev IN ('old','mid')").get().n === 1, JSON.stringify(r));
});
// ── εφαρμογή ──
const slice = (a, b) => { const i = js.indexOf(a), j2 = js.indexOf(b, i); if (i < 0 || j2 < 0) throw new Error("λείπει " + a); return js.slice(i, j2); };
await check("Ν102-7 · 🔴 εφαρμογή: μετά την εγγραφή (λογαριασμός + κλειδί/Παράλειψη) το 💬 δεν ανάβει — ούτε με ?chat=1", async () => {
  const run = (store, search) => {
    const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    const LS = { reg: "km_registered", key: "km_key", skip: "km_key_skipped" };
    const code = "var AG_PUBLIC = false;\n" + slice("  var AG = {", "  var AG_SECRET") + slice("  function agLS(k, v)", "  function agLog()") + "\nreturn agEnabled();";
    return new Function("localStorage", "location", "LS", code)(localStorage, { search }, LS);
  };
  ok(run({}, "?chat=1") === true, "νέα συσκευή με ?chat=1 → πρέπει να ανάβει");
  ok(run({ km_registered: "1" }, "?chat=1") === true, "λογαριασμός χωρίς κλειδί → πρέπει να ανάβει");
  ok(run({ km_registered: "1", km_key: "x" }, "?chat=1") === false, "🔴 με κλειδί ανάβει");
  ok(run({ km_registered: "1", km_key_skipped: "1" }, "?chat=1") === false, "🔴 με Παράλειψη ανάβει");
});
await check("Ν102-8 · άρνηση του server («onboarded») σβήνει το 💬 οριστικά από τη συσκευή", async () => {
  const send = slice("  function agSend(e) {", "  function agInit() {");
  ok(send.includes("if (j && j.error === 'onboarded') { agLS(AG.gone, '1'); agLS(AG.grant, null); }"), "δεν γράφει gone");   // v106: + σβήνει την άδεια
  ok(js.includes("if (agInited || !el('ag-fab') || !agEnabled() || (agLS(AG.gone) === '1' && !agGrantOn())) { return; }"), "agInit αγνοεί gone");
  ok(/function agClose\(\) \{[^}]*agDone\(\) \|\| agLS\(AG\.gone\) === '1'/.test(js), "agClose ξαναδείχνει το κουμπί");
});
if (ONLY) { if (failed) { console.log("Μ" + ONLY + " → κοκκίνισε ✔"); process.exit(0); } console.log("Μ" + ONLY + " ΠΕΡΑΣΕ — το τεστ δεν πιάνει τίποτα"); process.exit(1); }
console.log(failed ? "ΑΠΕΤΥΧΑΝ " + failed : "✔ ΟΛΑ ΠΕΡΑΣΑΝ (8)"); process.exit(failed ? 1 : 0);
