// v106 · ΠΡΑΓΜΑΤΙΚΗ ΔΟΚΙΜΗ του ραντεβού επανασύνδεσης ΠΡΙΝ ΤΟ DEPLOY — ίδιος κώδικας, ΠΡΑΓΜΑΤΙΚΟ κλειδί,
// βάση στη μνήμη. 3 σενάρια (~0,10 $). Δεν αγγίζει τον server, δεν στέλνει email.
//   node --experimental-sqlite tools/agent/smoke_v106.mjs   →  agent_smoke_v106_out.txt
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
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
const devOf = async (i) => { const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(i + ":smoke")); return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join(""); };
const T = new Date().toISOString();
async function acct(inst, n) {
  const f = String(n).repeat(64).slice(0, 64);
  db.prepare("INSERT INTO km_accounts (folder_id, auth_hash, email, created) VALUES (?, ?, ?, ?)").run(f, "a".repeat(64), "smoke" + n + "@x.cy", T);
  db.prepare("INSERT INTO km_devices (install_id, folder_id, created) VALUES (?, ?, ?)").run(inst, f, T);
  const d = await devOf(inst);
  for (const st of ["open", "code", "account"]) db.prepare("INSERT INTO km_funnel (dev, step, src, at) VALUES (?, ?, 'leads', ?)").run(d, st, T);
  return { f, d };
}
const say = async (inst, sid, text) => {
  const r = await mod.handleKm(new Request("https://x/api/km/agent/chat", { method: "POST", body: JSON.stringify({ sid, install_id: inst, text, consent: true }) }), env, null, "/api/km/agent/chat");
  return { s: r.status, j: await r.json() };
};
const out = [], bad = [];
const log = (q, r) => out.push("ΕΡΩΤΗΣΗ: " + q, "HTTP " + r.s + (r.j.error ? " ΣΦΑΛΜΑ: " + r.j.error : ""), "ΑΠΑΝΤΗΣΗ:", r.j.reply || "(καμία)", "");
for (const [name, n, answer, expectFup] of [["ΣΤ · τέλος εγκατάστασης → «ναι»", 1, "Ναι, γιατί όχι. Σε μια βδομάδα.", true], ["Ζ · τέλος εγκατάστασης → «όχι»", 2, "Όχι ευχαριστώ, είμαι εντάξει.", false]]) {
  out.push("════ " + name);
  const inst = "km_smoke106_" + n;
  const a = await acct(inst, n);
  let q = "Έφτιαξα λογαριασμό και έγραψα τις 12 λέξεις σε χαρτί. Τώρα με ρωτάει για κλειδί.";
  let r = await say(inst, null, q); log(q, r); const sid = r.j.sid;
  db.prepare("INSERT INTO km_funnel (dev, step, src, at) VALUES (?, 'key_skip', 'leads', ?)").run(a.d, T);
  q = "Πάτησα Παράλειψη, θα γράφω μόνος μου τα ποσά. Έτοιμο;";
  r = await say(inst, sid, q); log(q, r);
  const asked = /ξαναπούμε|ξαναμιλήσουμε|σε μια βδομάδα|ραντεβού/i.test(r.j.reply || "");
  if (!asked) { q = "Οκ. Κάτι άλλο;"; r = await say(inst, sid, q); log(q, r); }
  r = await say(inst, sid, answer); log(answer, r);
  const fup = db.prepare("SELECT * FROM km_agent_followups WHERE folder_id = ?").all(a.f);
  out.push("→ ραντεβού στη βάση: " + (fup.length ? fup[0].due_at.slice(0, 10) + " · συγκατάθεση: «" + fup[0].consent_text + "»" : "κανένα"), "");
  if (expectFup !== (fup.length === 1)) bad.push(name + (expectFup ? ": ΔΕΝ κλείστηκε ραντεβού" : ": κλείστηκε ραντεβού ΧΩΡΙΣ ναι"));
}
out.push("════ Η · επανασύνδεση από το email");
{
  const inst = "km_smoke106_3"; const a = await acct(inst, 3);
  db.prepare("INSERT INTO km_funnel (dev, step, src, at) VALUES (?, 'key', 'leads', ?)").run(a.d, T);
  db.prepare("INSERT INTO km_agent_grants (dev, folder_id, via, granted_at, expires_at, msgs_left) VALUES (?, ?, 'mail', ?, ?, 20)").run(a.d, a.f, T, new Date(Date.now() + 86400000).toISOString());
  let q = "Γεια, μου ήρθε το email σου.";
  let r = await say(inst, null, q); log(q, r);
  q = "Δουλεύει, αλλά μερικές φορές αργεί να διαβάσει το τιμολόγιο.";
  r = await say(inst, r.j.sid, q); log(q, r);
  if (r.s !== 200) bad.push("Η: HTTP " + r.s);
  if (db.prepare("SELECT COUNT(*) AS n FROM km_agent_followups WHERE folder_id = ?").get(a.f).n) bad.push("Η: νέο ραντεβού μέσα σε επανασύνδεση");
}
const d = db.prepare("SELECT * FROM km_agent_daily").get() || {};
out.push("ΚΟΣΤΟΣ: " + (d.calls || 0) + " κλήσεις · " + ((d.usd_micro || 0) / 1e6).toFixed(4) + " $");
out.push(bad.length ? "⚠ ΑΥΤΟΜΑΤΟΙ ΕΛΕΓΧΟΙ: " + bad.join(" | ") : "✔ ΑΥΤΟΜΑΤΟΙ ΕΛΕΓΧΟΙ: καθαρό («ναι» → ραντεβού · «όχι» → τίποτα · επανασύνδεση χωρίς νέο ραντεβού)");
writeFileSync("agent_smoke_v106_out.txt", out.join("\n"), "utf8");
console.log(out.join("\n"));
process.exit(bad.length ? 1 : 0);
