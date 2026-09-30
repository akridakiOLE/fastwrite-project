// KM-AGENT · ΠΡΑΓΜΑΤΙΚΗ ΔΟΚΙΜΗ ΠΡΙΝ ΤΟ DEPLOY — τρέχει τον ΙΔΙΟ κώδικα (src/km.js) με το
// ΠΡΑΓΜΑΤΙΚΟ κλειδί Anthropic (secrets\anthropic_api_key.txt) και τη ΓΝΩΣΗ του δίσκου,
// σε προσωρινή βάση στη μνήμη. Τρεις ερωτήσεις, ~0,02 $. Δεν αγγίζει τον server.
//   node --experimental-sqlite tools/agent/smoke.mjs
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
const out = [];
let sid = null;
for (const q of ["Γεια, δεν μου ήρθε ο κωδικός στο email. Τι κάνω;", "Και πώς το βάζω στην αρχική οθόνη στο iPhone;", "Ποιος είναι ο καλύτερος ποδοσφαιριστής;"]) {
  const r = await mod.handleKm(new Request("https://x/api/km/agent/chat", { method: "POST", body: JSON.stringify({ sid, install_id: "km_smoke", text: q, consent: true }) }), env, null, "/api/km/agent/chat");
  const j = await r.json(); sid = j.sid || sid;
  out.push("ΕΡΩΤΗΣΗ: " + q, "HTTP " + r.status + (j.error ? " ΣΦΑΛΜΑ: " + j.error : ""), "ΑΠΑΝΤΗΣΗ:", j.reply || "(καμία)", "");
}
const d = db.prepare("SELECT * FROM km_agent_daily").get() || {};
out.push("ΚΟΣΤΟΣ: " + (d.calls || 0) + " κλήσεις · " + ((d.usd_micro || 0) / 1e6).toFixed(4) + " $ · cache tokens " + (d.cache_tok || 0));
writeFileSync("agent_smoke_out.txt", out.join("\n"), "utf8");
console.log(out.join("\n"));
process.exit(out.some((l) => /^HTTP (?!200)/.test(l)) ? 1 : 0);
