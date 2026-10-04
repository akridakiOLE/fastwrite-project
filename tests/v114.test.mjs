// v114 · KM-PK-KOSTAS — Πίνακας: κάρτα «Κώστας (βοηθός)» + στήλες Google/Microsoft στο χωνί (Α010 §2.3, 4/10/2026)
//   node --experimental-sqlite tests/v114.test.mjs
//   node --experimental-sqlite tests/v114.test.mjs --mutate=N   (exit 0 = η μετάλλαξη ΠΙΑΣΤΗΚΕ)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let src = readFileSync("src/km.js", "utf8");
let ui = readFileSync("site/pinakas/app.js", "utf8");
let js = readFileSync("site/kostometro/app.js", "utf8");
const khtml = readFileSync("site/kostometro/index.html", "utf8");
const kcss = readFileSync("site/kostometro/app.css", "utf8");
const html = readFileSync("site/pinakas/index.html", "utf8");
const MUT = [
  // Μ1 · οι συνομιλίες αγνοούν το «Μετράω από» (οι δοκιμές πριν την καμπάνια μετράνε)
  ["src", "       FROM km_agent_sessions${whereC(\"started\")}`, ...SA);", "       FROM km_agent_sessions`);"],
  // Μ2 · «σε άνθρωπο» μετράει όλες τις συνομιλίες
  ["src", "              SUM(CASE WHEN ticket IS NOT NULL THEN 1 ELSE 0 END) AS handoffs,\n              COUNT(DISTINCT dev) AS devices", "              COUNT(*) AS handoffs,\n              COUNT(DISTINCT dev) AS devices"],
  // Μ3 · το χωνί χωρίς Google/Microsoft
  ["ui", "    var FN = ['open', 'email', 'oauth_google', 'oauth_microsoft', 'code',", "    var FN = ['open', 'email', 'code',"],
  // Μ4 · το κόστος σήμερα διαβάζει λάθος μονάδα (μικρο-$ ως $)
  ["src", "      today: { calls: Number(ktd.calls) || 0, usd: (Number(ktd.usd_micro) || 0) / 1e6 },\n      period_usd", "      today: { calls: Number(ktd.calls) || 0, usd: Number(ktd.usd_micro) || 0 },\n      period_usd"],
  // Μ5 · 🔴 το βελάκι ξανά ✕: μαζεμένο = εντελώς κρυφό, δεν ξανανοίγει στην ίδια οθόνη
  ["js", "    box.hidden = false;\n    box.classList.toggle('fold', !!giftFold);", "    box.hidden = !!giftFold;\n    box.classList.toggle('fold', !!giftFold);"],
  // Μ6 · το βελάκι μόνο μαζεύει (δεν ξανανοίγει)
  ["js", "    giftFold = !giftFold;      // v114: το βελάκι μαζεύει ΚΑΙ ξανανοίγει", "    giftFold = true;"],
];
if (ONLY !== null) {
  const m = MUT[ONLY - 1]; const bag = { src, ui, js };
  if (!m || !bag[m[0]].includes(m[1])) { console.log("Η ΜΕΤΑΛΛΑΞΗ Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(1); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ src, ui, js } = bag);
}
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
const db = new DatabaseSync(":memory:");
for (const f of ["km.sql", "km_h13.sql", "km_v54.sql", "km_mail.sql", "km_feedback.sql", "km_h11b.sql", "km_ref.sql", "km_ref2.sql", "km_verify.sql", "km_support.sql", "km_support_v95.sql", "km_funnel.sql", "km_leads.sql", "km_agent.sql", "km_read.sql"]) {
  const sql = readFileSync("schema/" + f, "utf8").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  for (const s of sql.split(";")) { const t = s.trim(); if (!t) continue;
    try { db.exec(t + ";"); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; } }
}
const stmt = (sql, args) => { const p = db.prepare(sql); return {
  async first() { return p.get(...args) ?? null; },
  async run() { const r = p.run(...args); return { meta: { changes: Number(r.changes) } }; },
  async all() { return { results: p.all(...args) }; } }; };
const DB = { prepare: (sql) => ({ bind: (...a) => stmt(sql, a), ...stmt(sql, []) }),
  async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } };
const env = { DB, KM_ADMIN_KEY: "s3cret" };
globalThis.fetch = async () => new Response(JSON.stringify({ ok: true }), { status: 200 });
const call = (path) => mod.handleKm(new Request("https://x" + path, {}), env, null, path.split("?")[0]);
const NOW = "2026-10-05T12:00:00.000Z";
const pk = async (q) => { const r = await call("/api/km/admin/pinakas?k=s3cret&now=" + encodeURIComponent(NOW) + (q || "")); if (r.status !== 200) throw new Error("pinakas " + r.status); return r.json(); };
let failed = 0;
const check = async (n, f) => { try { await f(); console.log("  ✔ " + n); } catch (e) { failed++; console.log("  ✘ " + n + " — " + e.message); } };
const eq = (g, w, what) => { if (JSON.stringify(g) !== JSON.stringify(w)) throw new Error((what || "") + " βρήκα " + JSON.stringify(g) + " περίμενα " + JSON.stringify(w)); };
console.log(ONLY ? "ΜΕΤΑΛΛΑΓΜΕΝΟ Μ" + ONLY + "\n" : "ΚΑΝΟΝΙΚΟ\n");

// 2 δοκιμές πριν την καμπάνια (1/10, test) + 3 συνομιλίες καμπάνιας (5/10, fasi3), η μία με παράδοση σε άνθρωπο
const S = db.prepare("INSERT INTO km_agent_sessions (id, dev, src, ticket, consent_at, started, last_at, turns) VALUES (?,?,?,?,?,?,?,?)");
S.run("a", "d1", "test", null, "2026-10-01T09:00:00Z", "2026-10-01T09:00:00Z", "2026-10-01T09:05:00Z", 4);
S.run("b", "d1", "test", "KM-E-000005", "2026-10-01T10:00:00Z", "2026-10-01T10:00:00Z", "2026-10-01T10:05:00Z", 3);
S.run("c", "d2", "fasi3", null, "2026-10-05T08:00:00Z", "2026-10-05T08:00:00Z", "2026-10-05T08:05:00Z", 5);
S.run("d", "d3", "fasi3", "KM-E-000009", "2026-10-05T09:00:00Z", "2026-10-05T09:00:00Z", "2026-10-05T09:05:00Z", 6);
S.run("e", "d4", null, null, "2026-10-05T10:00:00Z", "2026-10-05T10:00:00Z", "2026-10-05T10:05:00Z", 1);
db.prepare("INSERT INTO km_agent_daily (day, calls, usd_micro) VALUES (?,?,?)").run("2026-10-01", 7, 41000);
db.prepare("INSERT INTO km_agent_daily (day, calls, usd_micro) VALUES (?,?,?)").run("2026-10-05", 12, 83500);
db.prepare("INSERT INTO km_agent_followups (folder_id, dev, created, due_at, sent_at, used_at) VALUES (?,?,?,?,?,?)").run("f", "d2", "2026-10-05T08:04:00Z", "2026-10-08T08:00:00Z", null, null);
db.prepare("INSERT INTO km_funnel (dev, step, src, at) VALUES (?,?,?,?)").run("d2", "oauth_google", "fasi3", "2026-10-05T08:01:00Z");

await check("Κ-1 · χωρίς ημερομηνία: όλες οι συνομιλίες (5), 2 σε άνθρωπο, κόστος σήμερα 0,0835 $", async () => {
  const k = (await pk()).kostas;
  eq([k.sessions, k.turns, k.handoffs, k.devices], [5, 19, 2, 4]); eq(k.today.usd, 0.0835, "σήμερα:"); eq(k.today.calls, 12, "κλήσεις:");
  eq(k.followups.booked, 1, "ραντεβού:");
});
await check("Κ-2 · «Μετράω από» 2026-10-05: μόνο η καμπάνια (3 συνομιλίες, 1 σε άνθρωπο, κόστος περιόδου 0,0835 $)", async () => {
  const k = (await pk("&since=2026-10-05")).kostas;
  eq([k.sessions, k.handoffs], [3, 1]); eq(Math.round(k.period_usd * 1e4) / 1e4, 0.0835, "περίοδος:");
  eq(k.by_src.map((r) => r.src).sort(), ["direct", "fasi3"], "προελεύσεις:");
});
await check("Κ-3 · το χωνί δείχνει Google / Microsoft — στήλες ίσες με τα βήματα", async () => {
  if (!/var FN = \['open', 'email', 'oauth_google', 'oauth_microsoft', 'code', 'account', 'key', 'key_skip'\]/.test(ui)) throw new Error("FN χωρίς oauth");
  const th = (html.slice(html.indexOf("Χωνί εγγραφής")).match(/<thead>[\s\S]*?<\/thead>/) || [""])[0];
  eq((th.match(/<th>/g) || []).length, 9, "στήλες:");
  if (!ui.includes('colspan="9"')) throw new Error("colspan");
  const f = (await pk()).funnel; if (!f.some((r) => r.step === "oauth_google" && r.n === 1)) throw new Error("ο server δεν φέρνει oauth");
});
await check("Κ-4 · η κάρτα υπάρχει στην οθόνη και κρύβεται αν ο server δεν τη στείλει", async () => {
  for (const id of ["ks-card", "k-ks-s", "k-ks-h", "k-ks-usd", "k-ks-all", "ks-src"]) if (!html.includes('id="' + id + '"')) throw new Error("#" + id);
  if (!ui.includes("el('ks-card').hidden = !ks;")) throw new Error("δεν κρύβεται");
});
await check("Β-1 · 🔴 βελάκι αντί για ✕ (εισήγηση Stavros 4/10): μαζεύει, ΜΕΝΕΙ ορατό, ξανανοίγει · νέο άνοιγμα κάμερας = ολόκληρο", async () => {
  if (!khtml.includes('id="gift-x" type="button" aria-label="Μάζεμα" aria-expanded="true">︿</button>')) throw new Error("δεν είναι βελάκι");
  if (/id="gift-x"[^>]*>✕/.test(khtml)) throw new Error("ακόμα ✕");
  const f = js.slice(js.indexOf("  function giftFoldShow(box) {"), js.indexOf("  function giftShow() {"));
  if (!/box\.hidden = false;/.test(f)) throw new Error("το μαζεμένο κρύβει όλο το κουτί");
  if (!js.includes("    giftFold = !giftFold;")) throw new Error("δεν ξανανοίγει");
  if (!js.includes("    giftFold = false;          // το μάζεμα ισχύει ως το επόμενο άνοιγμα της κάμερας")) throw new Error("δεν ξαναβγαίνει ολόκληρο");
  if (/done_seen/.test(js)) throw new Error("το «τελείωσαν» κρύβεται για πάντα");
  if (!/\.gift\.fold > :not\(\.gift-x\)\{display:none\}/.test(kcss)) throw new Error("css μαζέματος");
});
console.log(failed ? "\nΚΟΚΚΙΝΟ: " + failed : "\n✔ ΟΛΑ ΠΕΡΑΣΑΝ");
process.exit(ONLY !== null ? (failed ? 0 : 1) : (failed ? 1 : 0));
