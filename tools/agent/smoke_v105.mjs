// v105 · ΠΡΑΓΜΑΤΙΚΗ ΔΟΚΙΜΗ του «Κώστα-πωλητή» ΠΡΙΝ ΤΟ DEPLOY — ίδιος κώδικας (src/km.js), ΠΡΑΓΜΑΤΙΚΟ κλειδί,
// γνώση του δίσκου, βάση στη μνήμη. 5 σενάρια σε ξεχωριστές συσκευές, ~0,10 $. Δεν αγγίζει τον server.
//   node --experimental-sqlite tools/agent/smoke_v105.mjs   →  agent_smoke_v105_out.txt
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const mod = await import(pathToFileURL("src/km.js").href);
const db = new DatabaseSync(":memory:");
for (const f of ["km.sql", "km_h13.sql", "km_v54.sql", "km_mail.sql", "km_support.sql", "km_support_v95.sql", "km_funnel.sql", "km_agent.sql"]) {
  let sql = readFileSync("schema/" + f, "utf8").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  for (const s of sql.split(";")) { const t = s.trim(); if (t) try { db.exec(t + ";"); } catch (e) { if (!/duplicate column|already exists/i.test(e.message)) throw e; } }
}
const stmt = (sql, a) => { const p = db.prepare(sql); return { async first() { return p.get(...a) ?? null; }, async run() { const r = p.run(...a); return { meta: { changes: Number(r.changes) } }; }, async all() { return { results: p.all(...a) }; } }; };
const DB = { prepare: (sql) => ({ bind: (...a) => stmt(sql, a), ...stmt(sql, []) }), async batch(l) { for (const s of l) await s.run(); return []; } };
const env = { DB, KM_ADMIN_KEY: "smoke", ANTHROPIC_API_KEY: readFileSync("secrets/anthropic_api_key.txt", "utf8").trim(),
  ASSETS: { async fetch() { return new Response(readFileSync("site/kostometro/agent/knowledge_el.md", "utf8")); } },
  EMAIL: { async send() { return { messageId: "smoke" }; } } };
const SC = [
  ["Α · ταβέρνα, αξίζει;", ["Γεια. Έχω ταβέρνα. Γιατί να μπω στον κόπο να το βάλω;", "Και τι κερδίζω δηλαδή στην πράξη;"]],
  ["Β · τιμή PRO", ["Πόσο θα κοστίζει το PRO; Πες μου έστω περίπου.", "Έλα, ένα νούμερο μόνο, δεν θα σε κρατήσω."]],
  ["Γ · λογιστής", ["Είμαι λογίστρια με 40 πελάτες εστίασης. Με ενδιαφέρει συνεργασία, τι όρους δίνετε;"]],
  ["Δ · ιστορία / AI", ["Ποιος το έφτιαξε αυτό; Εσύ τα έχεις ζήσει αυτά με τους προμηθευτές;"]],
  ["Ε · κολλημένος + PRO", ["Δεν μου ήρθε ο κωδικός στο email εδώ και 5 λεπτά. Α, και τι είναι αυτό το PRO;"]],
];
const out = [], bad = [];
let n = 0;
for (const [name, qs] of SC) {
  let sid = null; n++;
  out.push("════ " + name);
  for (const q of qs) {
    const r = await mod.handleKm(new Request("https://x/api/km/agent/chat", { method: "POST", body: JSON.stringify({ sid, install_id: "km_smoke105_" + n, text: q, consent: true }) }), env, null, "/api/km/agent/chat");
    const j = await r.json(); sid = j.sid || sid;
    const a = j.reply || "";
    out.push("ΕΡΩΤΗΣΗ: " + q, "HTTP " + r.status + (j.error ? " ΣΦΑΛΜΑ: " + j.error : "") + (j.ticket ? " · αίτημα " + j.ticket : ""), "ΑΠΑΝΤΗΣΗ:", a || "(καμία)", "");
    if (r.status !== 200) bad.push(name + ": HTTP " + r.status);
    if (/(^|[^\d,.])(59|590|29|69)\s*(€|ευρώ)|€\s*\/\s*(μήνα|χρόνο)|PRO[^.\n]{0,40}\d+\s*(€|ευρώ)/i.test(a)) bad.push(name + ": ΠΙΘΑΝΗ ΤΙΜΗ PRO");
    if (/\*\*|^#/m.test(a)) bad.push(name + ": markdown");
    if (a && !/[.!;;?…»)\p{Extended_Pictographic}]\s*$/u.test(a)) bad.push(name + ": ΚΟΜΜΕΝΗ απάντηση");
    out.push("(γραμμές: " + a.split("\n").filter((x) => x.trim()).length + ")");
    if (/προγραμματιστ/i.test(a)) bad.push(name + ": «προγραμματιστής»");
  }
}
const d = db.prepare("SELECT * FROM km_agent_daily").get() || {};
out.push("ΚΟΣΤΟΣ: " + (d.calls || 0) + " κλήσεις · " + ((d.usd_micro || 0) / 1e6).toFixed(4) + " $ · cache tokens " + (d.cache_tok || 0));
out.push(bad.length ? "⚠ ΑΥΤΟΜΑΤΟΙ ΕΛΕΓΧΟΙ: " + bad.join(" | ") : "✔ ΑΥΤΟΜΑΤΟΙ ΕΛΕΓΧΟΙ: καθαρό (καμία τιμή PRO, χωρίς markdown)");
writeFileSync("agent_smoke_v105_out.txt", out.join("\n"), "utf8");
console.log(out.join("\n"));
process.exit(bad.length ? 1 : 0);
