// v110 · «voithos-2» — δεύτερη επαφή με τους παλιούς leads (έγκριση Stavros 1/10/2026)
//   ΚΟΙΝΟ: μόνο όσοι πήραν το dianomi-1 · ΟΧΙ όσοι πήραν το voithos-1 · ΟΧΙ όσοι έχουν ήδη λογαριασμό με το ίδιο
//   email · ΟΧΙ όσοι διαγράφηκαν. Δικό της src=voithos2.
//   node --experimental-sqlite tests/v110.test.mjs  ·  --mutate=N (ΠΡΕΠΕΙ να κοκκινίσει)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let src = readFileSync("src/km.js", "utf8");
const MUT = [
  ["src", '  "voithos-2": { need: ["dianomi-1"], skip: ["voithos-1"], skipAccounts: true },', '  "voithos-2": { need: [], skip: ["voithos-1"], skipAccounts: true },'], // 1 · 🔴 και σε όσους δεν πήραν ποτέ το πρώτο
  ["src", '  "voithos-2": { need: ["dianomi-1"], skip: ["voithos-1"], skipAccounts: true },', '  "voithos-2": { need: ["dianomi-1"], skip: [], skipAccounts: true },'], // 2 · 🔴 οι 3 το παίρνουν δεύτερη φορά
  ["src", '  "voithos-2": { need: ["dianomi-1"], skip: ["voithos-1"], skipAccounts: true },', '  "voithos-2": { need: ["dianomi-1"], skip: ["voithos-1"], skipAccounts: false },'], // 3 · ήδη χρήστες το παίρνουν
  ["src", '  const app = LEAD_SITE + "/kostometro/?chat=1&src=voithos2";', '  const app = LEAD_SITE + "/kostometro/?chat=1&src=leads";'],       // 4 · χωρίς δικό του src
  ["src", '  const p4 = "Αν το έχεις ήδη στήσει, σε ευχαριστούμε — δεν χρειάζεται να κάνεις τίποτα.";', '  const p4 = "";'],                  // 5 · λείπει η φράση για όσους γράφτηκαν με άλλο email
  ["src", '    if (aud.skipAccounts) sql += " AND NOT EXISTS (SELECT 1 FROM km_accounts a WHERE a.email = l.email AND a.deleted IS NULL)";', '    if (aud.skipAccounts) sql += " AND NOT EXISTS (SELECT 1 FROM km_accounts a WHERE a.email = l.email)";'], // 6 · σβησμένος λογαριασμός μετράει ως χρήστης
];
if (ONLY) { const m = MUT[ONLY - 1]; if (!m) process.exit(2);
  if (!src.includes(m[0] === "src" ? m[1] : "")) { console.log("Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(3); }
  src = src.replace(m[1], m[2]); }
let failed = 0;
const check = async (n, f) => { try { await f(); if (!ONLY) console.log("  ✔ " + n); } catch (e) { failed++; console.log("  ✘ " + n + " — " + e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
const db = new DatabaseSync(":memory:");
for (const f of ["km.sql", "km_leads.sql"]) {
  let sql = readFileSync("schema/" + f, "utf8").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  for (const s of sql.split(";")) { const t = s.trim(); if (t) try { db.exec(t + ";"); } catch (e) { if (!/duplicate column|already exists/i.test(e.message)) throw e; } }
}
const stmt = (sql, a) => { const p = db.prepare(sql); return { async first() { return p.get(...a) ?? null; }, async run() { const r = p.run(...a); return { meta: { changes: Number(r.changes) } }; }, async all() { return { results: p.all(...a) }; } }; };
const DB = { prepare: (sql) => ({ bind: (...a) => stmt(sql, a), ...stmt(sql, []) }), async batch(l) { for (const s of l) await s.run(); return []; } };
const sent = [];
const env = { DB, KM_ADMIN_KEY: "adm", EMAIL: { async send(m) { sent.push(m); return { messageId: "m" + sent.length }; } } };
const call = async (body) => { const r = await mod.handleKm(new Request("https://x/api/km/admin/leads/send", { method: "POST", headers: { "X-Km-Admin": "adm" }, body: JSON.stringify(body) }), env, null, "/api/km/admin/leads/send"); return { s: r.status, j: await r.json() }; };
const T = "2026-09-20T10:00:00.000Z";
let i = 0;
const lead = (email, sends, extra) => {
  db.prepare("INSERT INTO km_leads (email, name, source, consent_at, imported_at, token, unsub_at) VALUES (?, '', 'fb-form', ?, ?, ?, ?)").run(email, T, T, String(++i).padStart(32, "0"), (extra && extra.unsub) || null);
  for (const c of sends) db.prepare("INSERT INTO km_lead_sends (email, campaign, at, ok) VALUES (?, ?, ?, 1)").run(email, c, T);
};
lead("a@x.cy", ["dianomi-1"]);                              // ✔
lead("b@x.cy", ["dianomi-1", "voithos-1"]);                 // ✘ πήρε το voithos-1
lead("c@x.cy", ["dianomi-1"]);                              // ✘ έχει λογαριασμό
lead("d@x.cy", []);                                         // ✘ δεν πήρε ποτέ το dianomi-1
lead("e@x.cy", ["dianomi-1"], { unsub: T });                // ✘ διαγράφηκε
lead("f@x.cy", ["dianomi-1"]);                              // ✔ ο λογαριασμός του σβήστηκε
db.prepare("INSERT INTO km_lead_sends (email, campaign, at, ok) VALUES ('g@x.cy', 'dianomi-1', ?, 0)").run(T);
lead("g@x.cy", []);                                         // ✘ το dianomi-1 ΑΠΕΤΥΧΕ (ok=0) — δεν το πήρε
db.prepare("INSERT INTO km_accounts (folder_id, auth_hash, email, created) VALUES (?, ?, 'c@x.cy', ?)").run("c".repeat(64), "a".repeat(64), T);
db.prepare("INSERT INTO km_accounts (folder_id, auth_hash, email, created, deleted) VALUES (?, ?, 'f@x.cy', ?, ?)").run("f".repeat(64), "a".repeat(64), T, T);

await check("Ν110-1 · 🔴 ΚΟΙΝΟ voithos-2: μόνο a, f (dianomi-1 ναι · voithos-1 όχι · χωρίς ζωντανό λογαριασμό · όχι διαγραμμένοι)", async () => {
  const r = await call({ campaign: "voithos-2", dry_run: true, limit: 40 });
  ok(r.s === 200 && r.j.dry_run === true, JSON.stringify(r.j));
  ok(JSON.stringify(r.j.would_send.sort()) === JSON.stringify(["a@x.cy", "f@x.cy"]) && r.j.pending === 2, JSON.stringify(r.j));
  ok(sent.length === 0, "dry run έστειλε");
});
await check("Ν110-2 · 🔴 email: θέμα, Κώστας (AI), ?chat=1&src=voithos2, «κάτω από 1 €», «Αν το έχεις ήδη στήσει», διαγραφή με token, πολιτική", async () => {
  const r = await call({ campaign: "voithos-2", dry_run: false, limit: 40 });
  ok(r.j.sent === 2 && sent.length === 2, JSON.stringify(r.j));
  const m = sent.find((x) => x.to === "a@x.cy");
  ok(m.subject === "Σου στήνουμε το Kostometro σε 5 λεπτά — μαζί με τον Κώστα", m.subject);
  ok(m.html.includes("https://fastwrite.tech/kostometro/?chat=1&src=voithos2") && m.text.includes("https://fastwrite.tech/kostometro/?chat=1&src=voithos2"), "σύνδεσμος");
  ok(m.html.includes("τον ψηφιακό μας βοηθό (AI)") && m.html.includes("<b>Κώστα</b>"), "AI");
  ok(m.text.includes("ενδεικτικά κάτω από 1 € τον μήνα") && m.text.includes("Αν το έχεις ήδη στήσει, σε ευχαριστούμε — δεν χρειάζεται να κάνεις τίποτα."), "κείμενο");
  ok(m.html.includes("/api/km/lista?t=" + "1".padStart(32, "0")) && m.html.includes("https://fastwrite.tech/legal/privacy"), "διαγραφή/πολιτική");
  ok(!/Γεια σου [^,]/.test(m.text), "χωρίς όνομα");
});
await check("Ν110-3 · δεύτερη εκτέλεση: κανένα διπλό · dianomi-1 χωρίς κανόνα κοινού (όπως πριν)", async () => {
  const r = await call({ campaign: "voithos-2", dry_run: true });
  ok(r.j.pending === 0, JSON.stringify(r.j));
  const d = await call({ campaign: "dianomi-1", dry_run: true, limit: 40 });
  ok(d.j.would_send.includes("d@x.cy") && d.j.would_send.includes("g@x.cy"), "dianomi-1 άλλαξε κοινό: " + JSON.stringify(d.j));
});
if (ONLY) { if (failed) { console.log("Μ" + ONLY + " → κοκκίνισε ✔"); process.exit(0); } console.log("Μ" + ONLY + " ΠΕΡΑΣΕ — το τεστ δεν πιάνει τίποτα"); process.exit(1); }
console.log(failed ? "ΑΠΕΤΥΧΑΝ " + failed : "✔ ΟΛΑ ΠΕΡΑΣΑΝ (3)"); process.exit(failed ? 1 : 0);
