// v104 · ο βοηθός λέγεται «Κώστας» (απόφαση Stavros 1/10/2026) + εκστρατεία «voithos-1» για τους 3 νέους leads
//   node --experimental-sqlite tests/v104.test.mjs  ·  --mutate=N (ΠΡΕΠΕΙ να κοκκινίσει)
import { readFileSync } from "node:fs";
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let src = readFileSync("src/km.js", "utf8");
let html = readFileSync("site/kostometro/index.html", "utf8");
let js = readFileSync("site/kostometro/app.js", "utf8");
const MUT = [
  ["src", "ΔΕΝ είσαι άνθρωπος: το λες αν ρωτηθείς και δεν προσποιείσαι ποτέ το αντίθετο.", "Είσαι άνθρωπος."],     // 1 · 🔴 κρύβει ότι είναι AI
  ["src", '"/kostometro/?chat=1&src=leads"', '"/kostometro/?src=leads"'],                                          // 2 · 🔴 ο σύνδεσμος δεν ανάβει τον Κώστα
  ["src", "/api/km/lista?t=\" + lead.token;\n  const pol = LEAD_SITE + \"/legal/privacy\";", "/api/km/lista\";\n  const pol = LEAD_SITE + \"/legal/privacy\";"], // 3 · 🔴 χωρίς σύνδεσμο διαγραφής
  ["src", '  if (campaign === "voithos-1") return leadMailVoithos(lead);', ""],                                     // 4 · η εκστρατεία δεν υπάρχει
  ["html", '<span class="ag-ai">AI</span>', ""],                                                                    // 5 · 🔴 λείπει η ένδειξη AI δίπλα στο όνομα
  ["src", 'const AGENT_TOPIC = "Κώστας · βοηθός Kostometro";', 'const AGENT_TOPIC = "Βοηθός Kostometro";'],         // 6 · θέμα email με το όνομα
];
if (ONLY) { const m = MUT[ONLY - 1]; if (!m) process.exit(2); const bag = { src, html, js };
  if (!bag[m[0]].includes(m[1])) { console.log("Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(3); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ src, html, js } = bag); }
let failed = 0;
const check = async (n, f) => { try { await f(); if (!ONLY) console.log("  ✔ " + n); } catch (e) { failed++; console.log("  ✘ " + n + " — " + e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
// leadMail δεν εξάγεται· το φτάνουμε μέσω του admin route με dry run σε ψεύτικη βάση.
const leads = [{ email: "a@x.cy", name: "Α", token: "tok123" }];
const DB = { prepare: (sql) => ({ bind: () => ({ async first() { return { n: 1 }; }, async all() { return { results: leads }; }, async run() { return { meta: { changes: 1 } }; } }) }) };
const sent = [];
const env = { DB, KM_ADMIN_KEY: "adm", EMAIL: { async send(m) { sent.push(m); return { messageId: "m1" }; } } };
const call = async (body) => { const r = await mod.handleKm(new Request("https://x/api/km/admin/leads/send", { method: "POST", headers: { "X-Km-Admin": "adm" }, body: JSON.stringify(body) }), env, null, "/api/km/admin/leads/send"); return { s: r.status, j: await r.json() }; };

await check("Κ-1 · 🔴 ο Κώστας δηλώνει AI: κανόνες server, κεφαλίδα + συγκατάθεση εφαρμογής, πρώτο μήνυμα", async () => {
  ok(src.includes("Είσαι ο «Κώστας»") && src.includes("ΔΕΝ είσαι άνθρωπος: το λες αν ρωτηθείς και δεν προσποιείσαι ποτέ το αντίθετο."), "κανόνες");
  ok(/<b>Κώστας<\/b> <span class="ag-sub">· βοηθός Kostometro<\/span> <span class="ag-ai">AI<\/span>/.test(html), "κεφαλίδα: όνομα + AI κολλημένα");
  ok(/Ο Κώστας είναι <b>βοηθός τεχνητής νοημοσύνης \(AI\)<\/b>, όχι άνθρωπος\./.test(html), "συγκατάθεση");
  ok(js.includes("Είμαι ο Κώστας, ο ψηφιακός βοηθός του Kostometro (AI)."), "πρώτο μήνυμα");
  ok(src.includes('const AGENT_TOPIC = "Κώστας · βοηθός Kostometro";'), "θέμα email");
});
await check("Κ-2 · 🔴 εκστρατεία voithos-1: σύνδεσμος με ?chat=1&src=leads · διαγραφή με token · πολιτική · θέμα · ΧΩΡΙΣ όνομα στον χαιρετισμό", async () => {
  const r = await call({ campaign: "voithos-1", dry_run: false, limit: 1 });
  ok(r.s === 200 && r.j.sent === 1 && sent.length === 1, JSON.stringify(r.j));
  const m = sent[0];
  ok(m.subject === "Ο Κώστας σε περιμένει για να στήσετε μαζί το Kostometro", m.subject);
  ok(m.html.includes("https://fastwrite.tech/kostometro/?chat=1&src=leads") && m.text.includes("https://fastwrite.tech/kostometro/?chat=1&src=leads"), "σύνδεσμος");
  ok(m.html.includes("/api/km/lista?t=tok123") && m.text.includes("/api/km/lista?t=tok123"), "διαγραφή με token");
  ok(m.html.includes("https://fastwrite.tech/legal/privacy") && m.html.includes("Κώστα") && /ψηφιακό μας τεχνικό \(AI\)/.test(m.html), "περιεχόμενο");
  ok(m.html.includes("<p style=\"margin:0 0 12px\">Γεια σου,</p>") && !m.html.includes("Γεια σου Α"), "χαιρετισμός χωρίς όνομα");
  ok(m.from.includes("noreply@notify.fastwrite.tech"), "αποστολέας");
});
await check("Κ-3 · άγνωστη εκστρατεία → 400 · η dianomi-1 ΔΕΝ άλλαξε", async () => {
  const r = await call({ campaign: "voithos-9", dry_run: true }); ok(r.s === 400 && r.j.error === "unknown_campaign", JSON.stringify(r.j));
  sent.length = 0; const r2 = await call({ campaign: "dianomi-1", dry_run: false, limit: 1 });
  ok(r2.j.sent === 1 && sent[0].subject === "Το πρώτο βήμα είναι έτοιμο — και είσαι μέσα από την αρχή", "dianomi-1");
});
if (ONLY) { if (failed) { console.log("Μ" + ONLY + " → κοκκίνισε ✔"); process.exit(0); } console.log("Μ" + ONLY + " ΠΕΡΑΣΕ — το τεστ δεν πιάνει τίποτα"); process.exit(1); }
console.log(failed ? "ΑΠΕΤΥΧΑΝ " + failed : "✔ ΟΛΑ ΠΕΡΑΣΑΝ (3)"); process.exit(failed ? 1 : 0);
