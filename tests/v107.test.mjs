// v107 · Επανασύνδεση = ΑΚΟΥΩ ΠΡΩΤΑ (απόφαση Stavros 1/10/2026): ουδέτερο email, κανόνας «πρώτα ακούς, μετά βελτίωση»,
//        και ο Κώστας ξέρει από τον λογαριασμό αν μπήκε ποτέ κλειδί — δωρεάν/πληρωμένο το ρωτάει.
//   node --experimental-sqlite tests/v107.test.mjs  ·  --mutate=N (ΠΡΕΠΕΙ να κοκκινίσει)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let src = readFileSync("src/km.js", "utf8");
let know = readFileSync("site/kostometro/agent/knowledge_el.md", "utf8");
const MUT = [
  ["src", "Θα ήθελα να ακούσω πώς σου φαίνεται τώρα που το χρησιμοποιείς στην πράξη — ό,τι έχεις να μου πεις.", "Πώς πάει; Τι σε δυσκόλεψε;"], // 1 · 🔴 email υποθέτει πρόβλημα
  ["src", "(1) ΠΡΩΤΑ ΑΚΟΥΣ: μία ανοιχτή ερώτηση", "(1) ρώτα τι τον δυσκόλεψε:"],                                                          // 2 · 🔴 κανόνας υποθέτει πρόβλημα
  ["src", "Εξηγείς τη διαφορά και τους λόγους για πληρωμένο κλειδί ΟΤΑΝ συνδέεται με αυτό που σου είπε — όχι ως πρώτη κουβέντα.", "Ξεκίνα με πρόταση για πληρωμένο κλειδί."], // 3 · 🔴 πώληση πριν ακούσει
  ["src", "\" · κλειδί Gemini (από τον λογαριασμό): \" + ", "\" · \" + \"\" && "],                                                        // 4 · δεν ξέρει αν έχει κλειδί
  ["know", "  - Δωρεάν κλειδί: δουλεύει, αλλά στις ώρες φόρτου", "  - Κάτι: "],                                                          // 5 · λείπουν οι τρεις περιπτώσεις
  ["src", "ρώτα (ΠΟΤΕ το ίδιο το κλειδί)", "ζήτα να σου το στείλει"],                                                                      // 6 · 🔴 ζητά το κλειδί
];
if (ONLY) { const m = MUT[ONLY - 1]; if (!m) process.exit(2); const bag = { src, know };
  if (!bag[m[0]].includes(m[1])) { console.log("Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(3); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ src, know } = bag); }
let failed = 0;
const check = async (n, f) => { try { await f(); if (!ONLY) console.log("  ✔ " + n); } catch (e) { failed++; console.log("  ✘ " + n + " — " + e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
const db = new DatabaseSync(":memory:");
for (const f of ["km.sql", "km_h13.sql", "km_v54.sql", "km_mail.sql", "km_support.sql", "km_support_v95.sql", "km_funnel.sql", "km_agent.sql"]) {
  let sql = readFileSync("schema/" + f, "utf8").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  for (const s of sql.split(";")) { const t = s.trim(); if (t) try { db.exec(t + ";"); } catch (e) { if (!/duplicate column|already exists/i.test(e.message)) throw e; } }
}
const stmt = (sql, a) => { const p = db.prepare(sql); return { async first() { return p.get(...a) ?? null; }, async run() { const r = p.run(...a); return { meta: { changes: Number(r.changes) } }; }, async all() { return { results: p.all(...a) }; } }; };
const DB = { prepare: (sql) => ({ bind: (...a) => stmt(sql, a), ...stmt(sql, []) }), async batch(l) { for (const s of l) await s.run(); return []; } };
const env = { DB, KM_ADMIN_KEY: "adm1n", ANTHROPIC_API_KEY: "k", ASSETS: { async fetch() { return new Response(know); } }, EMAIL: { async send() { return {}; } } };
const calls = [];
globalThis.fetch = async (u, o) => { calls.push(JSON.parse(o.body)); return new Response(JSON.stringify({ content: [{ type: "text", text: "Πώς σου φαίνεται;" }], stop_reason: "end_turn", usage: {} })); };
const devOf = async (i) => { const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(i + ":adm1n")); return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join(""); };
const T = new Date().toISOString();
async function acct(inst, n, hk) {
  const f = String(n).repeat(64);
  db.prepare("INSERT INTO km_accounts (folder_id, auth_hash, email, created, has_key) VALUES (?, ?, ?, ?, ?)").run(f, "a".repeat(64), n + "@x.cy", T, hk);
  db.prepare("INSERT INTO km_devices (install_id, folder_id, created) VALUES (?, ?, ?)").run(inst, f, T);
  const d = await devOf(inst);
  for (const st of ["account", hk ? "key" : "key_skip"]) db.prepare("INSERT INTO km_funnel (dev, step, src, at) VALUES (?, ?, 'leads', ?)").run(d, st, T);
  db.prepare("INSERT INTO km_agent_grants (dev, folder_id, via, granted_at, expires_at, msgs_left) VALUES (?, ?, 'mail', ?, ?, 20)").run(d, f, T, new Date(Date.now() + 86400000).toISOString());
}
const chat = async (inst) => { const r = await mod.handleKm(new Request("https://x/api/km/agent/chat", { method: "POST", body: JSON.stringify({ install_id: inst, text: "γεια", consent: true }) }), env, null, "/api/km/agent/chat"); return r.status; };

await check("Ν107-1 · 🔴 email ραντεβού: ουδέτερο — «πώς σου φαίνεται», ΚΑΜΙΑ υπόθεση δυσκολίας", async () => {
  const m = mod.agentFollowupMail("ab".repeat(16));
  ok(m.subject === "Ο Κώστας ρωτά: πώς σου φαίνεται το Kostometro;", m.subject);
  ok(m.text.includes("Θα ήθελα να ακούσω πώς σου φαίνεται τώρα που το χρησιμοποιείς στην πράξη"), "κείμενο");
  ok(!/δυσκόλ|πρόβλημα|τι σε/i.test(m.subject + m.text), "υποθέτει δυσκολία");
});
await check("Ν107-2 · 🔴 κανόνας: ΠΡΩΤΑ ακούς, ΜΕΤΑ βελτίωση · κλειδί μόνο όταν συνδέεται · ποτέ το ίδιο το κλειδί", async () => {
  ok(await chat("km_k0_aaaaaaaaaaaaaaaa") === 200, "chat");
  const r = calls.at(-1).system[0].text;
  ok(r.includes("(1) ΠΡΩΤΑ ΑΚΟΥΣ: μία ανοιχτή ερώτηση") && r.includes("ΔΕΝ υποθέτεις ότι κάτι τον δυσκόλεψε"), "πρώτα ακούς");
  ok(r.includes("(2) ΜΕΤΑ, μόνο αν χρειάζεται"), "μετά");
  ok(r.includes("ΟΤΑΝ συνδέεται με αυτό που σου είπε — όχι ως πρώτη κουβέντα") && r.includes("ρώτα (ΠΟΤΕ το ίδιο το κλειδί)"), "κλειδί");
});
await check("Ν107-3 · ο Κώστας βλέπει αν μπήκε ποτέ κλειδί (km_accounts.has_key) — δωρεάν/πληρωμένο «άγνωστο»", async () => {
  await acct("km_nokey_bbbbbbbbbbbbbb", 1, 0); await chat("km_nokey_bbbbbbbbbbbbbb");
  ok(calls.at(-1).system[1].text.includes("κλειδί Gemini (από τον λογαριασμό): κανένα, γράφει μόνος τα ποσά"), calls.at(-1).system[1].text.slice(-200));
  await acct("km_haskey_ccccccccccccc", 2, 1); await chat("km_haskey_ccccccccccccc");
  ok(calls.at(-1).system[1].text.includes("κλειδί Gemini (από τον λογαριασμό): έχει βάλει — δωρεάν ή πληρωμένο: άγνωστο"), "με κλειδί");
});
await check("Ν107-4 · γνώση: οι τρεις περιπτώσεις (χωρίς / δωρεάν / πληρωμένο) για την επανασύνδεση", async () => {
  ok(know.includes("Στη συζήτηση επανασύνδεσης (v107)") && know.includes("ΠΡΩΤΑ ακούς"), "ενότητα");
  for (const h of ["  - Χωρίς κλειδί: γράφει μόνος του τα ποσά", "  - Δωρεάν κλειδί: δουλεύει, αλλά στις ώρες φόρτου", "  - Πληρωμένο κλειδί: σταθερή ανάγνωση"]) ok(know.includes(h), "λείπει " + h);
  ok(!know.includes("πώς πάει, τι δυσκόλεψε, τι θα ήθελε"), "παλιά διατύπωση");
});
if (ONLY) { if (failed) { console.log("Μ" + ONLY + " → κοκκίνισε ✔"); process.exit(0); } console.log("Μ" + ONLY + " ΠΕΡΑΣΕ — το τεστ δεν πιάνει τίποτα"); process.exit(1); }
console.log(failed ? "ΑΠΕΤΥΧΑΝ " + failed : "✔ ΟΛΑ ΠΕΡΑΣΑΝ (4)"); process.exit(failed ? 1 : 0);
