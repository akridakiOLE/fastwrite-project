// v113 · KM-READ-GIFT — «Δώρο 20 αναγνώσεων με τον Κώστα (AI)» (Brief_Doro20_04-10-2026)
//   node --experimental-sqlite tests/v113.test.mjs
//   node --experimental-sqlite tests/v113.test.mjs --mutate=N   (ΠΡΕΠΕΙ να κοκκινίσει)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let src = readFileSync("src/km.js", "utf8");
let js = readFileSync("site/kostometro/app.js", "utf8");
const html = readFileSync("site/kostometro/index.html", "utf8");
const MUT = [
  // Μ1 · 🔴 η δέσμευση χωρίς φράγμα: δύο συσκευές ταυτόχρονα περνούν το 20
  ["src", "     WHERE folder_id = ? AND activated_at IS NOT NULL AND used < ?`", "     WHERE folder_id = ? AND activated_at IS NOT NULL AND ? > -1`"],
  // Μ2 · 🔴 σφάλμα παρόχου ΚΑΙΕΙ το δώρο (δεν επιστρέφεται)
  ["src", "  } catch (e) {\n    await refund();\n    await readDaily(env, day, { fail: 1 });", "  } catch (e) {\n    await readDaily(env, day, { fail: 1 });"],
  // Μ3 · το ```json του Haiku δεν καθαρίζεται → κάθε ανάγνωση «χωρίς ποσά»
  ["src", "  const a = s.indexOf(\"{\"), b = s.lastIndexOf(\"}\");\n  if (a < 0 || b <= a) return null;", "  const a = 0, b = s.length - 1;"],
  // Μ4 · temperature στην κλήση (το Sonnet 5.5 το απορρίπτει με 400 — μετρήθηκε 4/10)
  ["src", "max_tokens: 300, messages: [{ role: \"user\", content }] });", "max_tokens: 300, temperature: 0, messages: [{ role: \"user\", content }] });"],
  // Μ5 · αναγνώστρια συσκευή διαβάζει (και καίει δώρο)
  ["src", "  if (a.acc.active_device_id && a.acc.active_device_id !== a.id.device) return json({ ok: false, error: \"not_active\" }, 409);\n", ""],
  // Μ6 · κανένα ημερήσιο ταβάνι
  ["src", "  if (spent && spent.usd_micro >= cap) return json({ ok: false, error: \"busy\", retry_after: 1800 }, 429);\n", ""],
  // Μ7 · 🔴 «χωρίς ποσά» μετράει στο δώρο
  ["src", "  if (nothing) await refund();", "  if (false) await refund();"],
  // Μ8 · η διαγραφή λογαριασμού αφήνει τον μετρητή πίσω
  ["src", "  try { await env.DB.prepare(\"DELETE FROM km_read_gift WHERE folder_id = ?\").bind(folderId).run(); } catch (e) {}\n", ""],
  // Μ9 · 🔴 εφαρμογή: παλιά εκκρεμή (πριν την ενεργοποίηση) καίνε το δώρο
  ["js", "    return !!(giftLive() && r && g.at && r.ts >= g.at);", "    return !!(giftLive() && r);"],
  // Μ10 · 🔴 εφαρμογή: σφάλμα του δώρου κλειδώνει και την ανάγνωση με κλειδί
  ["js", "        if (err.gift === 'stop') { diag('Κώστας AI · ' + (err.msg || '')); giftWait = Date.now() + 600000; return; }", "        if (err.gift === 'stop') { aiHalt = true; return; }"],
  // Μ11 · εφαρμογή: το κλειδί προηγείται του δώρου
  ["js", "    if (giftSweep()) { return; }\n    aiSweepKey();", "    if (localStorage.getItem(LS.key)) { return aiSweepKey(); }\n    if (giftSweep()) { return; }\n    aiSweepKey();"],
  // Μ12 · όριο ρυθμού ανενεργό
  ["src", "  if (winFresh && (Number(row.win_n) || 0) >= READ_RATE_PER_MIN) return json({ ok: false, error: \"rate\", retry_after: 30 }, 429);\n", ""],
];
if (ONLY !== null) {
  const m = MUT[ONLY - 1]; const bag = { src, js };
  if (!m || !bag[m[0]].includes(m[1])) { console.log("Η ΜΕΤΑΛΛΑΞΗ Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(1); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ src, js } = bag);
}
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
const db = new DatabaseSync(":memory:");
for (const f of ["km.sql", "km_h13.sql", "km_v54.sql", "km_mail.sql", "km_feedback.sql", "km_h11b.sql", "km_ref.sql", "km_ref2.sql", "km_verify.sql", "km_support.sql", "km_support_v95.sql", "km_funnel.sql", "km_leads.sql", "km_read.sql"]) {
  const sql = readFileSync("schema/" + f, "utf8").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  for (const s of sql.split(";")) { const t = s.trim(); if (!t) continue;
    try { db.exec(t + ";"); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; } }
}
// slow: κάνει τις αναγνώσεις του μετρητή να «κοιμούνται» — έτσι τρεις ταυτόχρονες κλήσεις
// διαβάζουν ΟΛΕΣ used=19 πριν γράψει καμία (όπως στο D1 υπό φορτίο). Μόνο το SQL τις σταματά.
const slow = { on: false };
const stmt = (sql, args) => { const p = db.prepare(sql); return {
  async first() { const v = p.get(...args) ?? null; if (slow.on && /FROM km_read_gift/.test(sql)) await new Promise((r) => setTimeout(r, 15)); return v; },
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
const env = { DB, FOLDERS, EMAIL: { send: async () => ({ messageId: "m" }) }, KM_ADMIN_KEY: "s3cret", ANTHROPIC_API_KEY: "test-key" };

// ── Η Anthropic, ψεύτικη: απαντά όπως ΜΕΤΡΗΘΗΚΕ το Haiku 4/10 (```json …```) ──
const ant = { mode: "ok", calls: [], delay: 0 };
const REPLY_OK = '```json\n{\n  "net": 267.90,\n  "vat": 13.40,\n  "total": 281.30,\n  "date": "2026-10-03"\n}\n```';
globalThis.fetch = async (url, opts) => {
  if (!String(url).startsWith("https://api.anthropic.com/")) return new Response("{}", { status: 404 });
  const body = JSON.parse(opts.body); ant.calls.push(body);
  if (ant.delay) await new Promise((r) => setTimeout(r, ant.delay));
  if (body.temperature !== undefined) return new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "`temperature` is deprecated for this model." } }), { status: 400 });
  if (ant.mode === "529") return new Response(JSON.stringify({ type: "error", error: { type: "overloaded_error" } }), { status: 529 });
  const text = ant.mode === "nothing" ? '```json\n{"net": null, "vat": null, "total": null, "date": null}\n```' : REPLY_OK;
  return new Response(JSON.stringify({ content: [{ type: "text", text }], usage: { input_tokens: 2163, output_tokens: 55 }, stop_reason: "end_turn" }), { status: 200 });
};

const hex = (n) => [...webcrypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
const J = { "Content-Type": "application/json" };
const H = (id, dev) => ({ "X-Km-Folder": id.folder, "X-Km-Auth": id.auth, "X-Km-Device": dev || id.device });
const call = (path, opts) => mod.handleKm(new Request("https://x" + path, opts), env, null, path.split("?")[0]);
const post = (path, headers, body) => call(path, { method: "POST", headers: Object.assign({}, J, headers || {}), body: JSON.stringify(body || {}) });
const get = (path, headers) => call(path, { method: "GET", headers: headers || {} });
async function account() {
  const id = { folder: hex(32), auth: hex(32), device: "km_" + hex(6), email: "u" + hex(3) + "@example.com" };
  const r = await post("/api/km/register", H(id), { email: id.email, email_token: await mod.issueEmailToken(env, id.email) });
  if (r.status !== 200) throw new Error("register " + r.status);
  return id;
}
const IMG = "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo" + "x".repeat(0) + Buffer.from("ΕΙΚΟΝΑ-ΤΙΜΟΛΟΓΙΟΥ-" + hex(8)).toString("base64");
const read = (id, dev, pages) => post("/api/km/read", H(id, dev), { pages: pages || [IMG] });
const used = (id) => (db.prepare("SELECT used FROM km_read_gift WHERE folder_id = ?").get(id.folder) || {}).used;

let failed = 0;
const check = async (n, f) => { try { await f(); console.log("  ✔ " + n); } catch (e) { failed++; console.log("  ✘ " + n + " — " + e.message); } };
const eq = (g, w, what) => { if (JSON.stringify(g) !== JSON.stringify(w)) throw new Error((what || "") + " βρήκα " + JSON.stringify(g) + " περίμενα " + JSON.stringify(w)); };
console.log(ONLY ? "ΜΕΤΑΛΛΑΓΜΕΝΟ Μ" + ONLY + " — ΠΡΕΠΕΙ ΝΑ ΚΟΚΚΙΝΙΣΕΙ\n" : "ΚΑΝΟΝΙΚΟ\n");

const A = await account();
await check("Δ-1 · πριν την ενεργοποίηση: ανενεργό, 20 διαθέσιμα — και η ανάγνωση ΑΡΝΕΙΤΑΙ χωρίς να καλέσει την Anthropic", async () => {
  const j = await (await get("/api/km/read/status", H(A))).json();
  eq([j.active, j.left, j.gift], [false, 20, 20]);
  const n0 = ant.calls.length; const r = await read(A);
  eq(r.status, 403, "status:"); eq((await r.json()).error, "not_activated"); eq(ant.calls.length, n0, "κλήσεις:");
});
await check("Δ-2 · η ενεργοποίηση θέλει ρητή συγκατάθεση· δεύτερο πάτημα ΔΕΝ ξαναγεμίζει", async () => {
  eq((await post("/api/km/read/activate", H(A), {})).status, 400, "χωρίς consent:");
  const j = await (await post("/api/km/read/activate", H(A), { consent: true })).json();
  eq([j.active, j.left], [true, 20]);
  db.prepare("UPDATE km_read_gift SET used = 5 WHERE folder_id = ?").run(A.folder);
  const k = await (await post("/api/km/read/activate", H(A), { consent: true })).json();
  eq(k.left, 15, "μετά το 2ο πάτημα:");
  db.prepare("UPDATE km_read_gift SET used = 0 WHERE folder_id = ?").run(A.folder);
});
await check("Δ-3 · ανάγνωση: τα ποσά του Haiku (με ```json) φτάνουν σωστά, ένα από το δώρο", async () => {
  const r = await read(A); const j = await r.json();
  eq(r.status, 200, "status:"); eq([j.net, j.vat, j.total, j.date, j.left, j.counted], [267.9, 13.4, 281.3, "2026-10-03", 19, true]);
});
await check("Δ-4 · η κλήση: Haiku, χωρίς temperature, εικόνα + η ΙΔΙΑ εντολή με το Gemini", async () => {
  const b = ant.calls[ant.calls.length - 1];
  eq(b.model, "claude-haiku-4-5-20251001", "μοντέλο:"); eq(b.temperature, undefined, "temperature:");
  eq(b.messages[0].content[0].type, "image"); eq(b.messages[0].content[0].source.data, IMG, "εικόνα:");
  if (!b.messages[0].content[1].text.includes("ποτέ μην μαντεύεις")) throw new Error("άλλη εντολή");
  if (!js.includes("ποτέ μην μαντεύεις.' }")) throw new Error("η εντολή του Gemini άλλαξε — οι δύο πρέπει να μείνουν ίδιες");
});
await check("Δ-5 · 🔴 Η ΕΙΚΟΝΑ ΔΕΝ ΓΡΑΦΕΤΑΙ ΠΟΥΘΕΝΑ — ούτε σε πίνακα, ούτε στο R2", async () => {
  const tabs = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t) => t.name);
  for (const t of tabs) for (const row of db.prepare("SELECT * FROM " + t).all())
    if (JSON.stringify(row).includes(IMG.slice(-20))) throw new Error("βρέθηκε στον πίνακα " + t);
  for (const v of r2.values()) if (v.toString().includes(IMG.slice(-20))) throw new Error("βρέθηκε στο R2");
});
await check("Δ-6 · 🔴 σφάλμα παρόχου (529): το δώρο ΕΠΙΣΤΡΕΦΕΤΑΙ και η συσκευή περιμένει (429)", async () => {
  const u0 = used(A); ant.mode = "529"; const r = await read(A); ant.mode = "ok";
  eq(r.status, 429, "status:"); eq(used(A), u0, "used:");
});
await check("Δ-7 · 🔴 «δεν διάβασε ποσά» ΔΕΝ μετράει στο δώρο", async () => {
  const u0 = used(A); ant.mode = "nothing"; const j = await (await read(A)).json(); ant.mode = "ok";
  eq([j.counted, j.total], [false, null]); eq(used(A), u0, "used:");
});
await check("Δ-8 · 🔴 ΔΥΟ ΣΥΣΚΕΥΕΣ ΤΑΥΤΟΧΡΟΝΑ ΣΤΟ 19: ΜΙΑ περνάει, η άλλη «τελείωσε» — ποτέ 21", async () => {
  db.prepare("UPDATE km_read_gift SET used = 19, win_n = 0 WHERE folder_id = ?").run(A.folder);
  slow.on = true; const rs = await Promise.all([read(A), read(A), read(A)]); slow.on = false;
  const st = rs.map((r) => r.status).sort(); eq(st, [200, 403, 403], "statuses:"); eq(used(A), 20, "used:");
  const j = await (await read(A)).json(); eq([j.error, j.left], ["gift_done", 0]);
});
const B = await account();
await post("/api/km/read/activate", H(B), { consent: true });
await check("Δ-9 · αναγνώστρια συσκευή (όχι η ενεργή): 409, κανένα δώρο δεν καίγεται", async () => {
  const r = await read(B, "km_other"); eq(r.status, 409, "status:"); eq(used(B), 0, "used:");
});
await check("Δ-10 · ημερήσιο ταβάνι: η ανάγνωση ΠΕΡΙΜΕΝΕΙ (429 busy), καμία κλήση", async () => {
  const day = new Date().toISOString().slice(0, 10);
  db.prepare("INSERT OR REPLACE INTO km_read_daily (day, usd_micro) VALUES (?, ?)").run(day, 10_000_001);
  const n0 = ant.calls.length; const r = await read(B);
  eq(r.status, 429, "status:"); eq((await r.json()).error, "busy"); eq(ant.calls.length, n0, "κλήσεις:"); eq(used(B), 0, "used:");
  db.prepare("DELETE FROM km_read_daily WHERE day = ?").run(day);
});
await check("Δ-11 · όριο ρυθμού: 10 το λεπτό ανά λογαριασμό, η 11η περιμένει", async () => {
  for (let i = 0; i < 10; i++) eq((await read(B)).status, 200, "ανάγνωση " + (i + 1) + ":");
  const r = await read(B); eq(r.status, 429, "11η:"); eq((await r.json()).error, "rate");
});
await check("Δ-12 · μετρήσεις: tokens και κόστος στο km_read_daily, κάρτα στον Πίνακα", async () => {
  const d = db.prepare("SELECT SUM(in_tok) AS i, SUM(usd_micro) AS u FROM km_read_daily").get();
  if (!(d.i > 0 && d.u > 0)) throw new Error("δεν μετρήθηκε τίποτα");
  const j = await (await call("/api/km/admin/pinakas?k=s3cret", {})).json();
  if (!j.read_gift) throw new Error("λείπει read_gift"); eq([j.read_gift.activated, j.read_gift.finished], [2, 1]);
});
await check("Δ-13 · η διαγραφή λογαριασμού σβήνει και τον μετρητή του δώρου", async () => {
  const r = await post("/api/km/admin/delete?k=s3cret", { "X-Km-Admin": "s3cret" }, { folder_id: B.folder });
  if (r.status !== 200) throw new Error("admin/delete " + r.status);
  eq(db.prepare("SELECT COUNT(*) AS n FROM km_read_gift WHERE folder_id = ?").get(B.folder).n, 0, "γραμμές:");
});
await check("Δ-14 · κακή είσοδος: χωρίς σελίδες / 7 σελίδες / όχι base64 → 400, κανένα δώρο", async () => {
  const C = await account(); await post("/api/km/read/activate", H(C), { consent: true });
  eq((await read(C, null, [])).status, 400); eq((await read(C, null, Array(7).fill(IMG))).status, 400);
  eq((await read(C, null, ["<script>"])).status, 400); eq(used(C), 0, "used:");
});
// ── Εφαρμογή (στατικοί φρουροί) ──
await check("Ε-1 · 🔴 μόνο φωτογραφίες ΜΕΤΑ την ενεργοποίηση μετράνε στο δώρο", async () => {
  if (!js.includes("return !!(giftLive() && r && g.at && r.ts >= g.at);")) throw new Error("giftFor χωρίς έλεγχο χρόνου");
});
await check("Ε-2 · 🔴 πρώτα το δώρο, μετά το κλειδί — και σφάλμα δώρου δεν κλειδώνει το κλειδί", async () => {
  const i = js.indexOf("  function aiSweep() {"), k = js.indexOf("  function aiSweepKey() {");
  const body = js.slice(i, k);
  if (!(body.indexOf("giftSweep()") > 0 && body.indexOf("giftSweep()") < body.lastIndexOf("aiSweepKey()"))) throw new Error("λάθος σειρά");
  if (/localStorage\.getItem\(LS\.key\)/.test(body)) throw new Error("το κλειδί ελέγχεται πριν το δώρο");
  const g = js.slice(js.indexOf("  function giftSweep() {"), js.indexOf("  function giftNext() {"));
  if (/aiHalt\s*=/.test(g)) throw new Error("το δώρο αγγίζει το aiHalt");
});
await check("Ε-3 · το κουτί: κείμενο Stavros, ✕, κουμπί δίπλα στη λήψη, συγκατάθεση πριν την ενεργοποίηση", async () => {
  for (const id of ["gift", "gift-x", "gift-b", "gift-ok", "gift-ok-go", "gift-ok-no", "st-gift"]) if (!html.includes('id="' + id + '"')) throw new Error("#" + id);
  if (!html.includes("20 τιμολόγια εντελώς ΔΩΡΕΑΝ")) throw new Error("κείμενο");
  if (!html.includes("Έκπληξη bonus")) throw new Error("τίτλος");
  const cb = html.indexOf('class="cam-bottom"'), gb = html.indexOf('id="gift-b"');
  if (!(gb > cb && gb - cb < 300)) throw new Error("το κουμπί δεν είναι δίπλα στη λήψη");
  if (!js.includes("kmFetch('read/activate', { method: 'POST', headers: kmHead(), body: JSON.stringify({ consent: true }) })")) throw new Error("ενεργοποίηση χωρίς συγκατάθεση");
  if (/PRO|€/.test(html.slice(html.indexOf('id="gift"'), html.indexOf('class="cam-bottom"')))) throw new Error("τιμή ή PRO στο κουτί");
});
await check("Ε-4 · η εικόνα μικραίνει στη συσκευή στα 1568 px πριν φύγει", async () => {
  if (!js.includes("var GIFT_PX = 1568;") || !js.includes("Promise.all(pagesOf(rec).map(giftShrink))")) throw new Error("χωρίς σμίκρυνση");
});

console.log(failed ? "\nΚΟΚΚΙΝΟ: " + failed + " φρουροί έπεσαν" : "\n✔ ΟΛΑ ΠΕΡΑΣΑΝ");
// Σύμβαση του repo: σε --mutate, exit 0 = η μετάλλαξη ΠΙΑΣΤΗΚΕ (το deploy .bat περιμένει 0).
process.exit(ONLY !== null ? (failed ? 0 : 1) : (failed ? 1 : 0));
