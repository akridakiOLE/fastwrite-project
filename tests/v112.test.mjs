// v112 · KM-PK-SINCE — «Μετράω από» στον Πίνακα Ελέγχου (αίτημα Stavros 2/10/2026)
//   node --experimental-sqlite tests/v112.test.mjs
//   node --experimental-sqlite tests/v112.test.mjs --mutate=N   (ΠΡΕΠΕΙ να κοκκινίσει)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let src = readFileSync("src/km.js", "utf8");
let ui = readFileSync("site/pinakas/app.js", "utf8");
let html = readFileSync("site/pinakas/index.html", "utf8");
const MUT = [
  // Μ1 · τα σύνολα αγνοούν την ημερομηνία
  ["src", "     FROM km_accounts${whereC(\"created\")}`, d1, d7, d30, d7, d30, ...SA);", "     FROM km_accounts`, d1, d7, d30, d7, d30);"],
  // Μ2 · η λίστα αγνοεί την ημερομηνία («δείχνω X από Y» ψεύδεται)
  ["src", "  if (since) { w.push(\"a.created >= ?\"); args.push(cyMidnightUtc(since)); }   // KM-PK-SINCE", ""],
  // Μ3 · 🔴 ο έλεγχος μορφής φεύγει: σκουπίδια φτάνουν στη βάση ως φίλτρο
  ["src", "function pkSince(p) {\n", "function pkSince(p) {\n  return String((p && p.get(\"since\")) || \"\").trim();\n"],
  // Μ4 · το χωνί ξανά μόνο 30 ημέρες
  ["src", "FROM km_funnel WHERE at >= ? GROUP BY src, step\", s0 || d30);", "FROM km_funnel WHERE at >= ? GROUP BY src, step\", d30);"],
  // Μ5 · 🔴 η οθόνη ξεχνάει την ημερομηνία στην έξοδο (σβήνει μαζί με το κλειδί)
  ["ui", "      try { localStorage.removeItem(KEY); } catch (x) {}", "      try { localStorage.removeItem(KEY); localStorage.removeItem(SINCE); } catch (x) {}"],
  // Μ6 · η οθόνη δεν στέλνει την ημερομηνία στην πλήρη φόρτωση
  ["ui", "    if (sinceGet()) { p.set('since', sinceGet()); }   // KM-PK-SINCE\n    api(p).then(function (j) {", "    api(p).then(function (j) {"],
  // Μ7 · τα αιτήματα υποστήριξης αγνοούν την ημερομηνία (η κόκκινη κουκκίδα από δοκιμές μένει)
  ["src", "       FROM km_support_cases${whereC(\"created_at\")}`).bind(h24, d7, ...SA).first();", "       FROM km_support_cases`).bind(h24, d7).first();"],
];
if (ONLY !== null) {
  const m = MUT[ONLY - 1]; const bag = { src, ui, html };
  if (!m || !bag[m[0]].includes(m[1])) { console.log("Η ΜΕΤΑΛΛΑΞΗ Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(1); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ src, ui, html } = bag);
}
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
const db = new DatabaseSync(":memory:");
for (const f of ["km.sql", "km_h13.sql", "km_v54.sql", "km_mail.sql", "km_feedback.sql", "km_h11b.sql", "km_ref.sql", "km_ref2.sql", "km_verify.sql", "km_support.sql", "km_support_v95.sql", "km_funnel.sql", "km_leads.sql"]) {
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
const r2 = new Map();
const FOLDERS = {
  async put(k, v) { r2.set(k, Buffer.from(v)); },
  async get(k) { return r2.has(k) ? { arrayBuffer: async () => r2.get(k) } : null; },
  async delete(k) { for (const key of (Array.isArray(k) ? k : [k])) r2.delete(key); },
  async list({ prefix }) { return { objects: [...r2.keys()].filter((k) => k.startsWith(prefix)).map((k) => ({ key: k, size: r2.get(k).length })), truncated: false }; },
};
const EMAIL = { send: async () => ({ messageId: "m" }) };
const env = { DB, FOLDERS, EMAIL, KM_ADMIN_KEY: "s3cret" };

// ── Ο Hetzner, ψεύτικος: ό,τι θα έλεγε το main_api.py /api/admin/pinakas ──
// Ο Worker καλεί global fetch. Εδώ τον υποδυόμαστε και καταγράφουμε ΤΙ ζήτησε.
const FW_BODY = { ok: true };
const hetzner = { mode: "ok", calls: [] };
globalThis.fetch = async (url, opts) => {
  hetzner.calls.push({ url: String(url), headers: (opts && opts.headers) || {} });
  if (hetzner.mode === "down") throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
  const key = (opts && opts.headers && opts.headers["X-Km-Admin"]) || "";
  if (hetzner.mode === "nokey" || key !== "s3cret") return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  return new Response(JSON.stringify(FW_BODY), { status: 200, headers: { "Content-Type": "application/json" } });
};

const hex = (n) => [...webcrypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
const J = { "Content-Type": "application/json" };
const H = (id) => ({ "X-Km-Folder": id.folder, "X-Km-Auth": id.auth, "X-Km-Device": id.device });
const call = (path, opts) => mod.handleKm(new Request("https://x" + path, opts), env, null, path.split("?")[0]);
const post = (path, headers, body) => call(path, { method: "POST", headers: Object.assign({}, J, headers || {}), body: JSON.stringify(body || {}) });

async function account(extra) {
  const id = { folder: hex(32), auth: hex(32), device: "km_" + hex(6), email: "u" + hex(3) + "@example.com" };
  const r = await post("/api/km/register", H(id), Object.assign({ email: id.email, email_token: await mod.issueEmailToken(env, id.email) }, extra || {}));
  if (r.status !== 200) throw new Error("register " + r.status);
  return id;
}

let failed = 0;
const check = async (n, f) => { try { await f(); console.log("  ✔ " + n); } catch (e) { failed++; console.log("  ✘ " + n + " — " + e.message); } };
const eq = (g, w, what) => { if (JSON.stringify(g) !== JSON.stringify(w)) throw new Error((what || "") + " βρήκα " + JSON.stringify(g) + " περίμενα " + JSON.stringify(w)); };
const pk = async (q) => { const r = await call("/api/km/admin/pinakas?k=s3cret" + (q || ""), {}); if (r.status !== 200) throw new Error("pinakas " + r.status); return r.json(); };
console.log(ONLY ? "ΜΕΤΑΛΛΑΓΜΕΝΟ Μ" + ONLY + " — ΠΡΕΠΕΙ ΝΑ ΚΟΚΚΙΝΙΣΕΙ\n" : "ΚΑΝΟΝΙΚΟ\n");

// 3 «δοκιμές» πριν την καμπάνια (1/10) + 2 «καμπάνια» (σήμερα, 3/10)
const NOW = "2026-10-03T15:00:00.000Z";
const old = [await account({ source: "direct" }), await account({ source: "leads" }), await account({ source: "direct" })];
const neu = [await account({ source: "fasi3" }), await account({ source: "fasi3" })];
for (const a of old) db.prepare("UPDATE km_accounts SET created = ? WHERE email = ?").run("2026-10-01T09:00:00.000Z", a.email);
for (const a of neu) db.prepare("UPDATE km_accounts SET created = ? WHERE email = ?").run("2026-10-03T08:00:00.000Z", a.email);
// χωνί: 1 παλιό άνοιγμα, 2 νέα
db.prepare("INSERT INTO km_funnel (dev, step, src, at) VALUES (?,?,?,?)").run("d1", "open", "test", "2026-09-30T10:00:00.000Z");
db.prepare("INSERT INTO km_funnel (dev, step, src, at) VALUES (?,?,?,?)").run("d2", "open", "fasi3", "2026-10-03T09:00:00.000Z");
db.prepare("INSERT INTO km_funnel (dev, step, src, at) VALUES (?,?,?,?)").run("d3", "open", "fasi3", "2026-10-03T10:00:00.000Z");
// αίτημα υποστήριξης από δοκιμή, ανοιχτό από 30/9 (η κόκκινη κουκκίδα)
db.prepare("INSERT INTO km_support_cases (code, scope, status, created_at, last_in_at) VALUES (?,?,?,?,?)").run("KM-E-000006", "E", "open", "2026-09-30T18:07:05.256Z", "2026-09-30T18:07:05.256Z");
const Q = "&now=" + encodeURIComponent(NOW);

await check("Σ-1 · χωρίς ημερομηνία: όλα (5 ζωντανοί, 3 ανοίγματα, 1 αναπάντητο)", async () => {
  const j = await pk(Q);
  eq(j.totals.live, 5, "live:"); eq(j.since, null, "since:");
  eq(j.funnel.reduce((a, r) => a + r.n, 0), 3, "χωνί:"); eq(j.support.waiting_24h, 1, "αναπάντητα:");
});
await check("Σ-2 · since=2026-10-03: μόνο η καμπάνια (2 ζωντανοί, μόνο fasi3)", async () => {
  const j = await pk(Q + "&since=2026-10-03");
  eq(j.since, "2026-10-03", "since:"); eq(j.totals.live, 2, "live:");
  eq(j.by_source.map((r) => r.source), ["fasi3"], "πηγές:");
});
await check("Σ-3 · η λίστα λογαριασμών σέβεται την ημερομηνία («δείχνω X από Y» αληθινό)", async () => {
  const j = await pk(Q + "&since=2026-10-03");
  eq(j.accounts_total, 2, "σύνολο:"); eq(j.accounts.length, 2, "γραμμές:");
  const k = await pk(Q + "&since=2026-10-03&only=km");
  eq(k.accounts_total, 2, "only=km:");
});
await check("Σ-4 · χωνί και αιτήματα: οι δοκιμές πριν από το since δεν μετράνε", async () => {
  const j = await pk(Q + "&since=2026-10-03");
  eq(j.funnel.reduce((a, r) => a + r.n, 0), 2, "χωνί:"); eq(j.support.waiting_24h, 0, "αναπάντητα:");
});
await check("Σ-5 · μεσάνυχτα ΚΥΠΡΟΥ: since=2026-10-03 πιάνει τις 02/10 21:30 UTC (= 03/10 00:30 Κύπρου)", async () => {
  const x = await account({ source: "fasi3" });
  db.prepare("UPDATE km_accounts SET created = ? WHERE email = ?").run("2026-10-02T21:30:00.000Z", x.email);
  const j = await pk(Q + "&since=2026-10-03");
  eq(j.totals.live, 3, "live:");
  db.prepare("UPDATE km_accounts SET created = ? WHERE email = ?").run("2026-10-02T20:30:00.000Z", x.email);   // 23:30 Κύπρου, 2/10
  eq((await pk(Q + "&since=2026-10-03")).totals.live, 2, "live πριν τα μεσάνυχτα:");
});
await check("Σ-6 · 🔴 σκουπίδια στο since = ΚΑΝΕΝΑ φίλτρο, ποτέ σφάλμα ή SQL", async () => {
  for (const bad of ["2026-13-45", "xx", "2026-10-03' OR 1=1 --", "2026-02-30", "03/10/26"]) {
    const j = await pk(Q + "&since=" + encodeURIComponent(bad));
    eq(j.since, null, "since(" + bad + "):"); eq(j.totals.live, 6, "live(" + bad + "):");
  }
});
await check("Σ-7 · οθόνη: η ημερομηνία ζει σε ΧΩΡΙΣΤΟ κλειδί και ΔΕΝ σβήνει με την έξοδο", async () => {
  if (!ui.includes("var SINCE = 'pk_since';")) throw new Error("λείπει το pk_since");
  if (/removeItem\(SINCE\)\s*;\s*\}\s*catch\s*\(x\)/.test(ui) || /removeItem\(KEY\);\s*localStorage\.removeItem\(SINCE\)/.test(ui)) throw new Error("η έξοδος σβήνει την ημερομηνία");
  const n = (ui.match(/p\.set\('since', sinceGet\(\)\)/g) || []).length;
  eq(n, 2, "σημεία που στέλνουν since (πλήρης + λίστα):");
  for (const id of ["since", "since-clr", "since-note", "since-card"]) if (!html.includes('id="' + id + '"')) throw new Error("λείπει #" + id);
});
console.log(failed ? "\nΚΟΚΚΙΝΟ: " + failed : "\nΠΡΑΣΙΝΟ");
process.exit(ONLY !== null ? (failed ? 0 : 1) : (failed ? 1 : 0));
