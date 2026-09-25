// v88 — ΠΙΝΑΚΑΣ ΣΕ ΗΜΕΡΟΛΟΓΙΑΚΕΣ ΜΕΡΕΣ ΚΥΠΡΟΥ · ΓΡΑΦΗΜΑ ΜΕ ΠΑΤΗΜΑ · ΠΡΟΕΛΕΥΣΗ «direct»/«ref» (25/9/2026)
//   node --experimental-sqlite tests/v88.test.mjs  ·  --mutate=N (ΠΡΕΠΕΙ να κοκκινίσει)
// ΤΟ ΕΥΡΗΜΑ (Stavros, 25/9 19:23): «νέοι σήμερα = 1» ενώ σήμερα δεν έγινε κανένας λογαριασμός —
// ο λογαριασμός ήταν της 24/9 βράδυ. Το κουτί μετρούσε «24 ώρες πίσω», όχι «από τα μεσάνυχτα».
// Και το (α) «Από πού» έγραφε «link» σε ΟΛΟΥΣ: και σε σύσταση και σε σύνδεσμο χωρίς ?src=.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let src = readFileSync("src/km.js", "utf8");
let app = readFileSync("site/kostometro/app.js", "utf8");
let pjs = readFileSync("site/pinakas/app.js", "utf8");
let phtml = readFileSync("site/pinakas/index.html", "utf8");
const MUT = [
  // 1 · 🔴 πίσω στο «24 ώρες»: ο χθεσινοβραδινός λογαριασμός ξαναμετράει «σήμερα»
  ["src", "const d1 = cyMidnightUtc(today),", "const d1 = daysAgo(1, nowIso),"],
  // 2 · οι μέρες του γραφήματος ξαναγίνονται μέρες UTC (01:30 Κύπρου → προηγούμενη μέρα)
  ["src", 'const k = dayIdx[cyDate(r.h + ":00:00Z")];', "const k = dayIdx[r.h.slice(0, 10)];"],
  // 3 · χάνεται το «διαγράφηκαν αργότερα»
  ["src", "perDay[k].gone += Number(r.gone) || 0;", ""],
  // 4 · ο server ξαναγράφει «link» όταν δεν έρθει πηγή
  ["src", 'clean(b.source, 20) || "direct",', 'clean(b.source, 20) || "link",'],
  // 5 · η σύσταση ξαναγίνεται «link» στο (α)
  ["app", "source: ref ? 'ref' : src,", "source: ref ? 'link' : src,"],
  // 6 · σύνδεσμος χωρίς ?src= ξαναγράφει «link»
  ["app", "return qSrc ? qSrc[1] : 'direct';", "return qSrc ? qSrc[1] : 'link';"],
  // 7 · το πάτημα χάνεται — μένει μόνο το title του ποντικιού
  ["pjs", "el('days').addEventListener('click',", "el('days').addEventListener('dblclick',"],
  // 8 · 🔴 χωρίς σύνδεση PRO↔FastWrite τα κουτιά λένε 0 αντί για «—» (ψέμα: «μετρήσαμε»)
  ["pjs", "ids.forEach(function (id) { el(id).textContent = '—'; });", "ids.forEach(function (id) { el(id).textContent = '0'; });"],
  // 9 · το «321 / 30» ξανακολλάει σε ένα κουτί
  ["pjs", "el('f-docs').textContent = Number(i.docs_total) || 0;", "el('f-docs').textContent = (Number(d.total) || 0) + ' / ' + (Number(i.docs_total) || 0);"],
];
if (ONLY) {
  const m = MUT[ONLY - 1]; if (!m) process.exit(2);
  const bag = { src, app, pjs, phtml };
  if (!bag[m[0]].includes(m[1])) { console.log("Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(3); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ src, app, pjs, phtml } = bag);
}
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
const db = new DatabaseSync(":memory:");
for (const f of ["km.sql", "km_h13.sql", "km_v54.sql", "km_mail.sql", "km_feedback.sql", "km_h11b.sql", "km_ref.sql", "km_ref2.sql", "km_verify.sql"]) {
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
const env = { DB, FOLDERS: { async put() {}, async get() { return null; }, async delete() {}, async list() { return { objects: [], truncated: false }; } },
  EMAIL: { send: async () => ({}) }, KM_ADMIN_KEY: "s3cret" };
globalThis.fetch = async () => { throw Object.assign(new Error("x"), { name: "TimeoutError" }); };
const hex = (n) => [...webcrypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
const H = (id) => ({ "Content-Type": "application/json", "X-Km-Folder": id.folder, "X-Km-Auth": id.auth, "X-Km-Device": id.device });
const call = (path, opts) => mod.handleKm(new Request("https://x" + path, opts), env, null, path.split("?")[0]);
async function account(created, extra) {
  const id = { folder: hex(32), auth: hex(32), device: "km_" + hex(6), email: "u" + hex(4) + "@example.com" };
  const r = await call("/api/km/register", { method: "POST", headers: H(id),
    body: JSON.stringify(Object.assign({ email: id.email, email_token: await mod.issueEmailToken(env, id.email) }, extra || {})) });
  if (r.status !== 200) throw new Error("register " + r.status);
  db.prepare("UPDATE km_accounts SET created = ? WHERE folder_id = ?").run(created, id.folder);
  return id;
}
const pk = async (now) => (await call("/api/km/admin/pinakas?k=s3cret&now=" + encodeURIComponent(now), {})).json();

// ΣΤΗΣΙΜΟ — «τώρα» = 25/9/2026 19:14 Κύπρου = 16:14Z (θερινή, UTC+3)
const NOW = "2026-09-25T16:14:00.000Z";
await account("2026-09-24T17:30:00.000Z");                 // 24/9 20:30 Κύπρου — Ο ΛΟΓΑΡΙΑΣΜΟΣ ΤΗΣ ΓΥΝΑΙΚΑΣ
await account("2026-09-24T22:30:00.000Z");                 // 25/9 01:30 Κύπρου — ΣΗΜΕΡΑ, αν και UTC λέει 24/9
const gone = await account("2026-09-25T09:00:00.000Z");    // 25/9 12:00 Κύπρου, διαγράφεται μετά
db.prepare("UPDATE km_accounts SET deleted = ? WHERE folder_id = ?").run("2026-09-25T10:00:00.000Z", gone.folder);
await account("2026-09-19T21:30:00.000Z");                 // 20/9 00:30 Κύπρου — μέσα στις 7 μέρες (19/9–25/9)
await account("2026-09-18T20:30:00.000Z");                 // 18/9 23:30 Κύπρου — ΕΞΩ από τις 7 μέρες
await account("2026-09-10T08:00:00.000Z", { source: "fasi3" });
await account("2026-09-11T08:00:00.000Z", { ref: "MH8Y9QVNHH", source: "ref" });

let fails = 0;
const check = async (n, f) => { try { await f(); if (!ONLY) console.log("  ✔ " + n); } catch (e) { fails++; console.log("  ✘ " + n + " — " + e.message); } };
const eq = (g, w, what) => { if (JSON.stringify(g) !== JSON.stringify(w)) throw new Error((what || "") + " πήρα " + JSON.stringify(g) + " περίμενα " + JSON.stringify(w)); };

await check("Ν88-1 · 🔴 «σήμερα» = από τα μεσάνυχτα Κύπρου — ο λογαριασμός της 24/9 20:30 ΔΕΝ μετράει", async () => {
  const j = await pk(NOW);
  eq(j.today, "2026-09-25", "today:");
  eq(j.totals.new_1d, 1, "new_1d (μόνο ο 01:30 της 25/9, ο διαγραμμένος δεν είναι ζωντανός):");
});
await check("Ν88-2 · «7 ημέρες» = σήμερα + 6 προηγούμενες (19/9–25/9), όχι 7×24 ώρες", async () => {
  const j = await pk(NOW);
  eq(j.totals.new_7d, 3, "new_7d:");       // 24/9 20:30 · 25/9 01:30 · 20/9 00:30
});
await check("Ν88-3 · το γράφημα: 30 μέρες Κύπρου, άδειες μέσα, 01:30 Κύπρου στη σωστή μέρα", async () => {
  const j = await pk(NOW);
  eq(j.per_day.length, 30, "μέρες:");
  eq(j.per_day[29].day, "2026-09-25", "τελευταία:"); eq(j.per_day[0].day, "2026-08-27", "πρώτη:");
  const m = Object.fromEntries(j.per_day.map((r) => [r.day, r]));
  eq(m["2026-09-25"].n, 2, "25/9 (01:30 + ο διαγραμμένος):"); eq(m["2026-09-24"].n, 1, "24/9:");
  eq(m["2026-09-20"].n, 1, "20/9:"); eq(m["2026-09-19"].n, 0, "19/9:");
});
await check("Ν88-4 · το γράφημα λέει πόσοι από την ημέρα διαγράφηκαν αργότερα", async () => {
  const j = await pk(NOW);
  eq(j.per_day[29].gone, 1, "gone 25/9:"); eq(j.per_day[28].gone, 0, "gone 24/9:");
});
await check("Ν88-5 · χειμερινή ώρα: μεσάνυχτα Κύπρου 1/12 = 30/11 22:00Z · 26/10 (μετά την αλλαγή) = 25/10 22:00Z", async () => {
  const j = await pk("2026-12-01T10:00:00.000Z"); eq(j.today, "2026-12-01");
  const f = new Function(src.slice(src.indexOf("const CY_TZ"), src.indexOf("function daysAgo(")) + "; return cyMidnightUtc;")();
  eq(f("2026-12-01"), "2026-11-30T22:00:00.000Z"); eq(f("2026-10-26"), "2026-10-25T22:00:00.000Z");
  eq(f("2026-10-25"), "2026-10-24T21:00:00.000Z"); eq(f("2026-09-25"), "2026-09-24T21:00:00.000Z");
});
await check("Ν88-6 · (α) Από πού: χωρίς πηγή = «direct», με σύσταση = «ref», καμπάνια = «fasi3»", async () => {
  const j = await pk(NOW);
  const m = Object.fromEntries(j.by_source.map((r) => [r.source, r.n]));
  eq(m.direct, 4, "direct (5 χωρίς πηγή, ο 1 διαγράφηκε):"); eq(m.fasi3, 1, "fasi3:"); eq(m.ref, 1, "ref:"); eq(m.link, undefined, "link:");
});
await check("Ν88-7 · η εφαρμογή: σύνδεσμος χωρίς ?src= → «direct» · σύσταση → source «ref»", async () => {
  const fn = new Function(app.slice(app.indexOf("function refCaptureSrc("), app.indexOf("/* Brief ΣΤ · KM-MANIFEST-REF")) + "; return refCaptureSrc;")();
  eq(fn("", false, null), "direct"); eq(fn("?src=leads", false, null), "leads"); eq(fn("?ref=ab12cd34", false, null), "ref:AB12CD34");
  if (!app.includes("source: ref ? 'ref' : src,")) throw new Error("η σύσταση δεν στέλνει source=ref");
  if (/\|\| 'link'/.test(app)) throw new Error("έμεινε προεπιλογή 'link'");
});
await check("Ν88-8 · Πίνακας: πάτημα σε μπάρα (click, όχι μόνο ποντίκι) + ετικέτες ημερών", async () => {
  if (!pjs.includes("el('days').addEventListener('click',")) throw new Error("χωρίς πάτημα");
  if (/title="' \+ x\.day/.test(pjs)) throw new Error("έμεινε το title-μόνο");
  for (const id of ["days-sel", "days-ax", "days"]) if (!phtml.includes('id="' + id + '"')) throw new Error("λείπει #" + id);
});
await check("Ν88-9 · 🔴 FastWrite «ανά FastWrite»: χωρίς σύνδεση «—», ΠΟΤΕ 0 · τα έγγραφα σε δύο θέσεις", async () => {
  for (const id of ["fl-fw", "fl-biz", "fl-avg", "fl-max", "fl-users", "fl-km7", "fl-km30", "fl-oth30", "fl-rows", "fl-state"])
    if (!phtml.includes('id="' + id + '"')) throw new Error("λείπει #" + id);
  if (!pjs.includes("ids.forEach(function (id) { el(id).textContent = '—'; });")) throw new Error("δεν λέει «—»");
  if (!pjs.includes("el('f-docs').textContent = Number(i.docs_total) || 0;")) throw new Error("τα έγγραφα ξανακόλλησαν");
  if (!pjs.includes("Έγγραφα στον server (παλιό web /ui)")) throw new Error("χάθηκαν τα έγγραφα του server");
});
if (ONLY) { if (fails) { console.log("Μ" + ONLY + ": κοκκίνισε ✓"); process.exit(0); } console.log("Μ" + ONLY + ": ΠΕΡΑΣΕ ΠΡΑΣΙΝΟ"); process.exit(1); }
if (fails) { console.log("\n" + fails + " ΑΠΕΤΥΧΑΝ"); process.exit(1); }
console.log("\n✔ ΟΛΑ ΠΕΡΑΣΑΝ (9)");
