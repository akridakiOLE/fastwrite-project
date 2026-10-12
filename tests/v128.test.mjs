// v128 · KM-PK-V128-LEADS — Πίνακας «Λίστα leads»: ΑΤΟΜΑ, όχι αποστολές (εύρημα Stavros 12/10: «190» = αποστολές σε 97 άτομα)
//   node --experimental-sqlite tests/v128.test.mjs            ... --mutate=N   (exit 0 = πιάστηκε)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let src = readFileSync("src/km.js", "utf8");
let ui = readFileSync("site/pinakas/app.js", "utf8");
let csv = readFileSync("tools/leads_csv.mjs", "utf8");
const MUT = [
  ["src", "unique: (Number(lt.total) || 0) - test,", "unique: Number(lt.total) || 0,"],
  ["src", "SELECT COUNT(DISTINCT email) AS n FROM km_lead_sends WHERE ok = 1 AND email IN", "SELECT COUNT(email) AS n FROM km_lead_sends WHERE ok = 1 AND email IN"],
  ["src", '  "voithos-2": { title: "Κώστας 2 · δεύτερη επαφή",', '  "voithos-x": { title: "Κώστας 2 · δεύτερη επαφή",'],
  ["ui", "el('k-ld-sent').textContent = ld.recipients;", "el('k-ld-sent').textContent = (ld.sends || []).reduce(function (a, r) { return a + (Number(r.ok) || 0); }, 0);"],
  ["src", "FROM km_lead_sends WHERE email IN (${real})${andC(\"at\")} GROUP BY campaign", "FROM km_lead_sends WHERE 1=1${andC(\"at\")} GROUP BY campaign"],
  ["csv", 'source: "fb:" + form.toLowerCase(),', 'source: "fb-form",'],
];
if (ONLY !== null) {
  const m = MUT[ONLY - 1]; const bag = { src, ui, csv };
  if (!m || !bag[m[0]].includes(m[1])) { console.log("Η ΜΕΤΑΛΛΑΞΗ Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(1); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ src, ui, csv } = bag);
}
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✔ " + m); } else { fail++; console.log("  ✘ " + m); } };
const crash = (e) => { console.log("  ✘ ΚΑΤΑΡΡΕΥΣΗ: " + (e && e.message)); process.exit(ONLY !== null ? 0 : 1); };
process.on("uncaughtException", crash); process.on("unhandledRejection", crash);

const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
const db = new DatabaseSync(":memory:");
for (const f of ["km.sql", "km_h13.sql", "km_v54.sql", "km_mail.sql", "km_feedback.sql", "km_h11b.sql", "km_ref.sql", "km_ref2.sql", "km_verify.sql", "km_support.sql", "km_support_v95.sql", "km_funnel.sql", "km_leads.sql"]) {
  const sql = readFileSync("schema/" + f, "utf8").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  for (const s of sql.split(";")) { const t = s.trim(); if (!t) continue; try { db.exec(t + ";"); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; } }
}
const stmt = (sql, args) => { const p = db.prepare(sql); return {
  async first() { return p.get(...args) ?? null; }, async run() { const r = p.run(...args); return { meta: { changes: Number(r.changes) } }; },
  async all() { return { results: p.all(...args) }; } }; };
const DB = { prepare: (sql) => ({ bind: (...a) => stmt(sql, a), ...stmt(sql, []) }), async batch(l) { const o = []; for (const s of l) o.push(await s.run()); return o; } };
const env = { DB, FOLDERS: { list: async () => ({ objects: [], truncated: false }) }, EMAIL: { send: async () => ({}) }, KM_ADMIN_KEY: "s3cret" };
globalThis.fetch = async () => new Response(JSON.stringify({ ok: true }), { status: 200 });
const T = "2026-10-01T10:00:00.000Z";
const L = (e, s) => db.prepare("INSERT INTO km_leads (email, name, source, consent_at, imported_at, token) VALUES (?, '', ?, ?, ?, ?)").run(e, s, T, T, e + "-t");
const S = (e, c, okv, at) => db.prepare("INSERT INTO km_lead_sends (email, campaign, at, ok) VALUES (?, ?, ?, ?)").run(e, c, at, okv);
L("a@x.cy", "fb-form"); L("b@x.cy", "fb-form"); L("c@x.cy", "fb-form"); L("d@x.cy", "fb:fasi3"); L("e@x.cy", "fb:fasi3"); L("me@x.cy", "test");
for (const e of ["a@x.cy", "b@x.cy", "c@x.cy", "me@x.cy"]) S(e, "dianomi-1", 1, "2026-09-26T09:00:00.000Z");
S("a@x.cy", "voithos-2", 1, "2026-10-02T09:00:00.000Z"); S("b@x.cy", "voithos-2", 1, "2026-10-02T09:00:00.000Z"); S("c@x.cy", "voithos-2", 0, "2026-10-02T09:00:00.000Z");
S("me@x.cy", "voithos-2", 1, "2026-10-02T09:00:00.000Z");
const r = await mod.handleKm(new Request("https://x/api/km/admin/pinakas?k=s3cret"), env, null, "/api/km/admin/pinakas");
const j = await r.json(); const ld = j.leads || {};
ok(ld.unique === 5 && ld.test === 1, "μοναδικά email = 5 (το δοκιμαστικό ΔΕΝ μετράει) — πήρα " + ld.unique);
ok(ld.recipients === 3, "άτομα που έλαβαν = 3 (όχι 6 αποστολές, όχι το δοκιμαστικό) — πήρα " + ld.recipients);
ok(JSON.stringify(ld.times) === JSON.stringify([{ times: 1, people: 1 }, { times: 2, people: 2 }]), "πόσες φορές: 1→1 άτομο, 2→2 άτομα — πήρα " + JSON.stringify(ld.times));
const bs = Object.fromEntries((ld.by_source || []).map((x) => [x.source, x]));
ok(bs["fb-form"] && bs["fb-form"].n === 3 && bs["fb:fasi3"] && bs["fb:fasi3"].n === 2 && !bs.test, "ανά προέλευση: 3 + 2, χωρίς δοκιμαστικό");
ok(bs["fb:fasi3"] && bs["fb:fasi3"].label === "Φόρμα Facebook · fasi3", "ετικέτα «Φόρμα Facebook · fasi3»");
const cp = Object.fromEntries((ld.campaigns || []).map((x) => [x.campaign, x]));
ok(cp["dianomi-1"] && cp["dianomi-1"].ok === 3 && cp["voithos-2"] && cp["voithos-2"].ok === 2 && cp["voithos-2"].fail === 1, "ανά αποστολή: έλαβαν/απέτυχαν χωρίς το δοκιμαστικό");
ok(cp["voithos-2"] && /Κώστας 2/.test(cp["voithos-2"].title) && /5 λεπτά/.test(cp["voithos-2"].subject), "αποστολή με τίτλο και θέμα email");
// κάθε εκστρατεία που ξέρει το leadMail έχει γραμμή στον κατάλογο του Πίνακα
const known = [...src.matchAll(/campaign (?:===|!==) "([a-z0-9-]+)"/g)].map((m) => m[1]);
const cat = src.slice(src.indexOf("const LEAD_CAMPAIGNS = {"), src.indexOf("};", src.indexOf("const LEAD_CAMPAIGNS = {")));
ok(known.length >= 3 && known.every((c) => cat.includes('"' + c + '"')), "κάθε εκστρατεία του leadMail έχει τίτλο στον Πίνακα (" + known.join(", ") + ")");
ok(ui.includes("el('k-ld-sent').textContent = ld.recipients;") && ui.includes("el('k-ld').textContent = ld.unique;"), "η οθόνη δείχνει ΑΤΟΜΑ, όχι αποστολές");
ok(csv.includes('source: "fb:" + form.toLowerCase(),') && /process\.exit\(2\)/.test(csv), "η εισαγωγή CSV δηλώνει ΥΠΟΧΡΕΩΤΙΚΑ από ποια φόρμα");
console.log("\n" + pass + " ✔ · " + fail + " ✘");
if (ONLY !== null) process.exit(fail ? 0 : 1);
process.exit(fail ? 1 : 0);
