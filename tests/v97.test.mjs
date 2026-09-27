// v97 · KM-FUNNEL — χωνί εγγραφής + κάρτα leads στον Πίνακα (27/9/2026)
//   node --experimental-sqlite tests/v97.test.mjs  ·  --mutate=N (ΠΡΕΠΕΙ να κοκκινίσει)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let src = readFileSync("src/km.js", "utf8");
let js = readFileSync("site/kostometro/app.js", "utf8");
let pk = readFileSync("site/pinakas/app.js", "utf8");
const MUT = [
  ["src", 'await env.DB.prepare("INSERT OR IGNORE INTO km_funnel', 'await env.DB.prepare("INSERT INTO km_funnel_x'],                 // 1 · δεν γράφεται τίποτα
  ["src", "const dev = await sha256hex(inst + \":\" + (env.KM_ADMIN_KEY || \"\"));", "const dev = inst;"],   // 2 · 🔴 ωμό install_id στη βάση
  ["src", "if (!inst || !FUNNEL_STEPS[step])", "if (!inst)"],                                                  // 3 · οποιοδήποτε «βήμα» γράφεται
  ["src", '  if (/^ref:/.test(s)) s = "ref";\n', ""],                                                           // 4 · ref:ΚΩΔΙΚΟΣ διαρρέει ως προέλευση
  ["src", "    funnel: funnel, leads: leads,", "    funnel: [], leads: leads,"],                                 // 5 · ο Πίνακας δεν παίρνει χωνί
  ["js", "    funnel('open');   // v97 · KM-FUNNEL\n", ""],                                                       // 6 · το άνοιγμα δεν μετριέται
  ["js", "      if (localStorage.getItem(LS.reg) && step !== 'account'", "      if (false && step !== 'account'"],   // 7 · 🔴 οι υπάρχοντες χρήστες μετράνε ως «άνοιξαν»
  ["js", "      if (localStorage.getItem(k)) { return; }\n", ""],                                                   // 8 · κάθε άνοιγμα ξαναστέλνει
  ["pk", "el('k-ld-un').textContent = ld.unsub;", "el('k-ld-un').textContent = 0;"],                             // 9 · διαγραφές από τη λίστα κρυμμένες
];
if (ONLY) { const m = MUT[ONLY - 1]; if (!m) process.exit(2); const bag = { src, js, pk };
  if (!bag[m[0]].includes(m[1])) { console.log("Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(3); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ src, js, pk } = bag); }
let failed = 0;
const check = async (n, f) => { try { await f(); if (!ONLY) console.log("  ✔ " + n); } catch (e) { failed++; console.log("  ✘ " + n + " — " + e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
const db = new DatabaseSync(":memory:");
for (const f of ["km.sql", "km_h13.sql", "km_v54.sql", "km_mail.sql", "km_feedback.sql", "km_h11b.sql", "km_ref.sql", "km_ref2.sql", "km_verify.sql", "km_support.sql", "km_support_v95.sql", "km_funnel.sql", "km_leads.sql", "km_pinakas.sql"]) {
  let sql; try { sql = readFileSync("schema/" + f, "utf8"); } catch (e) { continue; }
  sql = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  for (const s of sql.split(";")) { const t = s.trim(); if (!t) continue; try { db.exec(t + ";"); } catch (e) { if (!/duplicate column|already exists/i.test(e.message)) throw e; } }
}
const stmt = (sql, args) => { const p = db.prepare(sql); return { async first() { return p.get(...args) ?? null; },
  async run() { const r = p.run(...args); return { meta: { changes: Number(r.changes) } }; }, async all() { return { results: p.all(...args) }; } }; };
const DB = { prepare: (sql) => ({ bind: (...a) => stmt(sql, a), ...stmt(sql, []) }), async batch(l) { for (const s of l) await s.run(); return []; } };
const env = { DB, KM_ADMIN_KEY: "adm1n" };
const post = async (body) => { const r = await mod.handleKm(new Request("https://x/api/km/funnel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), env, null, "/api/km/funnel"); return r.status; };
const rows = () => db.prepare("SELECT * FROM km_funnel ORDER BY at").all();

await check("Χ-1 · βήμα γράφεται μία φορά ανά συσκευή (δεύτερη κλήση δεν διπλασιάζει)", async () => {
  ok(await post({ install_id: "km_a", step: "open", src: "leads" }) === 200, "status");
  await post({ install_id: "km_a", step: "open", src: "leads" });
  await post({ install_id: "km_a", step: "email", src: "leads" });
  ok(rows().length === 2, "γραμμές " + rows().length);
});
await check("Χ-2 · 🔴 στη βάση ΔΕΝ υπάρχει ωμό install_id — μόνο hash 64 hex", async () => {
  ok(rows().every((r) => /^[0-9a-f]{64}$/.test(r.dev) && !JSON.stringify(r).includes("km_a")), JSON.stringify(rows()));
});
await check("Χ-3 · άγνωστο βήμα → 400 · σύσταση ref:XYZ → «ref» (όχι ο κωδικός)", async () => {
  ok(await post({ install_id: "km_b", step: "hack", src: "x" }) === 400, "βήμα");
  await post({ install_id: "km_b", step: "open", src: "ref:MH8Y9QVNHH" });
  ok(rows().some((r) => r.src === "ref") && !JSON.stringify(rows()).includes("MH8Y9QVNHH"), "ref");
});
await check("Χ-4 · ο Πίνακας παίρνει χωνί ανά προέλευση + διαγραφές από τη λίστα (με email)", async () => {
  db.prepare("INSERT INTO km_leads (email, name, source, consent_at, imported_at, token, unsub_at) VALUES (?,?,?,?,?,?,?)").run("x@y.gr", "Γιάννης", "fb-form", "2026-09-27T05:00:00Z", "2026-09-27T05:00:00Z", "t1", new Date().toISOString());
  const r = await mod.handleKm(new Request("https://x/api/km/admin/pinakas", { headers: { "X-Km-Admin": "adm1n" } }), env, null, "/api/km/admin/pinakas");
  const j = await r.json();
  const f = (j.funnel || []).find((x) => x.src === "leads" && x.step === "open");
  ok(f && f.n === 1, "funnel " + JSON.stringify(j.funnel));
  ok(j.leads && j.leads.unsub === 1 && j.leads.unsub_list[0].email === "x@y.gr", "leads " + JSON.stringify(j.leads));
});
// ── εφαρμογή ──
const slice = (a, b) => { const i = js.indexOf(a), j2 = js.indexOf(b, i); if (i < 0 || j2 < 0) throw new Error("λείπει " + a); return js.slice(i, j2); };
function world(ls) {
  const store = Object.assign({ km_id: "km_z", km_src: "leads" }, ls || {}); const sent = [];
  const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const fetch = (u, o) => { sent.push(JSON.parse(o.body)); return Promise.resolve({}); };
  const f = new Function("localStorage", "fetch", "LS", "KM_API", slice("  function funnel(step) {", "  function refReportHit() {") + "\nreturn funnel;")(localStorage, fetch, { reg: "km_reg", id: "km_id", src: "km_src" }, "/api/km/");
  return { f, sent };
}
await check("Χ-5 · 🔴 νέα συσκευή: άνοιγμα στέλνεται ΜΙΑ φορά με την προέλευση · εγγεγραμμένος χρήστης: τίποτα", async () => {
  const w = world(); w.f("open"); w.f("open");
  ok(w.sent.length === 1 && w.sent[0].src === "leads" && w.sent[0].step === "open", JSON.stringify(w.sent));
  const r = world({ km_reg: "1" }); r.f("open"); r.f("email");
  ok(r.sent.length === 0, "εγγεγραμμένος μέτρησε");
});
await check("Χ-6 · όλα τα βήματα δεμένα στη ροή (open · email · code · account · key · key_skip)", async () => {
  for (const s of ["funnel('open')", "funnel('email')", "funnel('code')", "funnel('account')", "funnel('key')", "funnel('key_skip')"]) ok(js.includes(s), "λείπει " + s);
});
await check("Χ-7 · ο Πίνακας δείχνει τις διαγραφές από τη λίστα", async () => {
  ok(pk.includes("el('k-ld-un').textContent = ld.unsub;"), "διαγραφές");
});
if (ONLY) { if (failed) { console.log("Μ" + ONLY + " → κοκκίνισε ✔"); process.exit(0); } console.log("Μ" + ONLY + " ΠΕΡΑΣΕ — το τεστ δεν πιάνει τίποτα"); process.exit(1); }
console.log(failed ? "ΑΠΕΤΥΧΑΝ " + failed : "✔ ΟΛΑ ΠΕΡΑΣΑΝ (7)"); process.exit(failed ? 1 : 0);
