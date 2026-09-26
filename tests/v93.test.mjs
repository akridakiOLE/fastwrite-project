// v93 · KM-SUP-ARRIVED — «Συνέχεια σε…» ΜΟΝΟ για αριθμούς που ΕΦΤΑΣΑΝ στο support@ (26/9/2026, πρόταση Stavros)
//   node --experimental-sqlite tests/v93.test.mjs  ·  --mutate=N (ΠΡΕΠΕΙ να κοκκινίσει)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let src = readFileSync("src/km.js", "utf8");
let js = readFileSync("site/kostometro/app.js", "utf8");
const MUT = [
  // 1 · 🔴 αριθμός που ΔΕΝ έφτασε φαίνεται στη «Συνέχεια»
  ["js", "return x && x.ok === 1 && SUP_RE.test(x.c || '') && (Date.parse(x.d) || 0) >= lim;", "return x && SUP_RE.test(x.c || '') && (Date.parse(x.d) || 0) >= lim;"],
  // 2 · 🔴 το status απαντάει και για ξένους αριθμούς
  ["src", '"SELECT code FROM km_support_tickets WHERE scope = ? AND arrived_at IS NOT NULL AND code IN ("', '"SELECT code FROM km_support_tickets WHERE ? IS NOT NULL AND arrived_at IS NOT NULL AND code IN ("'],
  // 3 · 🔴 το arrived δέχεται αριθμό που ο server δεν εξέδωσε ποτέ
  ["src", "if (!seq || Number(m[2]) < 1 || Number(m[2]) > Number(seq.n)) return json({ ok: true, known: false });", ""],
  // 4 · το arrived χωρίς μυστικό
  ["src", '  if (!supportKeyOk(request, env)) return new Response("Not found", { status: 404 });\n  const b = (await safeJson(request)) || {};\n  const code = (clean(b.code, 40)', '  const b = (await safeJson(request)) || {};\n  const code = (clean(b.code, 40)'],
  // 5 · 🔴 το ωριαίο σβήνει και όσους ΕΦΤΑΣΑΝ
  ["src", "WHERE arrived_at IS NULL AND issued_at < ? LIMIT ?", "WHERE issued_at < ? LIMIT ?"],
  // 6 · το ωριαίο δεν σβήνει τίποτα (24 ώρες → ποτέ)
  ["src", "const SUP_PENDING_HOURS = 24;", "const SUP_PENDING_HOURS = 24 * 365 * 100;"],
  // 7 · οι αριθμοί δεν σβήνονται με τον λογαριασμό
  ["src", '    env.DB.prepare("DELETE FROM km_support_tickets WHERE scope = ?").bind(folderId),\n', ""],
  // 8 · η «συνέχεια» χάνει την επιβεβαίωση (εξαφανίζεται μετά τη χρήση)
  ["js", "if (x && x.c === code) { was = x.ok === 1 ? 1 : 0; return false; }", "if (x && x.c === code) { return false; }"],
  // 9 · οι ανεπιβεβαίωτοι δεν πετιούνται ποτέ
  ["js", "var keep = all.filter(function (x) { return x && (x.ok === 1 || (Date.parse(x.d) || 0) >= lim); });", "var keep = all.filter(function (x) { return !!x; });"],
  // 10 · το email-ticket δεν γράφεται ως «έφτασε»
  ["src", "INSERT OR IGNORE INTO km_support_tickets (code, scope, issued_at, arrived_at) VALUES (?, 'E', ?, ?)\")\n    .bind(code, t, t)", "INSERT OR IGNORE INTO km_support_tickets (code, scope, issued_at, arrived_at) VALUES (?, 'E', ?, NULL)\")\n    .bind(code, t)"],
  // 11 · νέο ticket γράφεται κατευθείαν «έφτασε»
  ["src", 'VALUES (?, ?, ?, NULL)")\n    .bind(code, a.id.folder, now())', 'VALUES (?, ?, ?, ?)")\n    .bind(code, a.id.folder, now(), now())'],
];
if (ONLY) {
  const m = MUT[ONLY - 1]; if (!m) process.exit(2);
  const bag = { src, js };
  if (!bag[m[0]].includes(m[1])) { console.log("Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(3); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ src, js } = bag);
}

let failed = 0;
const check = async (n, f) => { try { await f(); if (!ONLY) console.log("  ✔ " + n); } catch (e) { failed++; console.log("  ✘ " + n + " — " + e.message); } };
const eq = (g, w, what) => { if (JSON.stringify(g) !== JSON.stringify(w)) throw new Error((what || "") + " πήρα " + JSON.stringify(g) + " περίμενα " + JSON.stringify(w)); };
const ok = (c, what) => { if (!c) throw new Error(what); };

// ═════════════ SERVER ═════════════
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
const db = new DatabaseSync(":memory:");
for (const f of ["km.sql", "km_h13.sql", "km_v54.sql", "km_mail.sql", "km_feedback.sql", "km_h11b.sql", "km_ref.sql", "km_ref2.sql", "km_verify.sql", "km_support.sql"]) {
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
const env = { DB, FOLDERS, EMAIL: { send: async () => ({ messageId: "m" }) }, KM_ADMIN_KEY: "adm1n", KM_SUPPORT_KEY: "supp0rt" };
const hex = (n) => [...webcrypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
const J = { "Content-Type": "application/json" };
const H = (id) => ({ "X-Km-Folder": id.folder, "X-Km-Auth": id.auth, "X-Km-Device": id.device });
const call = (path, opts, e) => mod.handleKm(new Request("https://x" + path, opts), e || env, null, path.split("?")[0]);
const post = (path, headers, body, e) => call(path, { method: "POST", headers: Object.assign({}, J, headers || {}), body: JSON.stringify(body || {}) }, e);
async function account() {
  const id = { folder: hex(32), auth: hex(32), device: "km_" + hex(6), email: "u" + hex(3) + "@example.com" };
  const r = await post("/api/km/register", H(id), { email: id.email, email_token: await mod.issueEmailToken(env, id.email), source: "direct" });
  if (r.status !== 200) throw new Error("register " + r.status);
  return id;
}
const ticket = async (id) => { const r = await post("/api/km/support/ticket", H(id)); return { st: r.status, j: await r.json().catch(() => null) }; };
const eticket = async (key, e) => { const r = await post("/api/km/support/email-ticket", key === null ? {} : { "X-Km-Support": key }, {}, e); return { st: r.status, j: r.status === 200 ? await r.json() : null }; };
const APP_RE = /^KM-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{10}-\d+$/;


const tk = (code) => db.prepare("SELECT * FROM km_support_tickets WHERE code = ?").get(code);
const arrived = async (code, key) => { const r = await post("/api/km/support/arrived", key === null ? {} : { "X-Km-Support": key === undefined ? "supp0rt" : key }, { code }); return { st: r.status, j: r.status === 200 || r.status === 400 ? await r.json() : null }; };
const status = async (id, codes) => (await post("/api/km/support/status", H(id), { codes })).json();
const A = await account(), B = await account();
const a1 = (await ticket(A)).j.code, a2 = (await ticket(A)).j.code, b1 = (await ticket(B)).j.code;

await check("Υ-1 · νέος αριθμός γράφεται ΑΝΕΠΙΒΕΒΑΙΩΤΟΣ (issued_at, arrived_at = NULL)", async () => {
  const r = tk(a1); ok(r && r.issued_at && r.arrived_at === null, JSON.stringify(r)); eq(r.scope, A.folder);
});
await check("Υ-2 · 🔴 arrived: μόνο με KM_SUPPORT_KEY · μετά ο αριθμός «έφτασε»", async () => {
  eq((await arrived(a1, null)).st, 404, "χωρίς:"); eq((await arrived(a1, "adm1n")).st, 404, "admin:");
  eq(tk(a1).arrived_at, null, "άλλαξε χωρίς κλειδί");
  const r = await arrived(a1); eq([r.st, r.j.known], [200, true]); ok(tk(a1).arrived_at, "δεν σημαδεύτηκε");
});
await check("Υ-3 · 🔴 status: ο λογαριασμός βλέπει ΜΟΝΟ δικούς του που ΕΦΤΑΣΑΝ — όχι ξένους, όχι ανεπιβεβαίωτους", async () => {
  await arrived(b1);
  eq((await status(A, [a1, a2, b1])).arrived, [a1]);
  eq((await status(B, [a1, b1])).arrived, [b1]);
});
await check("Υ-4 · 🔴 arrived για αριθμό που ΔΕΝ εκδόθηκε ποτέ (n πάνω από τον μετρητή) → δεν γράφεται", async () => {
  const fake = a1.replace(/-\d+$/, "-999");
  eq((await arrived(fake)).j.known, false); eq(tk(fake), undefined);
});
await check("Υ-5 · email μετά από 3 μέρες (ο αριθμός είχε σβηστεί) → ξαναγράφεται ως «έφτασε»", async () => {
  db.prepare("DELETE FROM km_support_tickets WHERE code = ?").run(a2);
  eq((await arrived(a2)).j.known, true); ok(tk(a2) && tk(a2).arrived_at, "δεν ξαναγράφτηκε");
  eq((await status(A, [a2])).arrived, [a2]);
});
await check("Υ-6 · email-ticket: γεννιέται «έφτασε» · arrived σε KM-E γνωστό", async () => {
  const e = (await eticket("supp0rt")).j.code; ok(tk(e).arrived_at, "όχι έφτασε"); eq((await arrived(e)).j.known, true);
});
await check("Υ-7 · 🔴 ωριαίο: σβήνει ΜΟΝΟ ανεπιβεβαίωτους πάνω από 24 ώρες", async () => {
  const c = (await ticket(A)).j.code, young = (await ticket(A)).j.code;
  db.prepare("UPDATE km_support_tickets SET issued_at = ? WHERE code IN (?, ?)").run("2026-01-01T00:00:00.000Z", c, a1);
  const r = await mod.kmSupportPrune(env);
  ok(!tk(c), "ο παλιός ανεπιβεβαίωτος έμεινε"); ok(tk(young), "έσβησε τον νέο"); ok(tk(a1), "έσβησε αυτόν που ΕΦΤΑΣΕ");
  ok(r.pending_deleted >= 1, "μέτρηση");
});
await check("Υ-8 · ο αριθμός σβήνεται με τον λογαριασμό · διπλό arrived δεν αλλάζει την ώρα άφιξης", async () => {
  const t0 = tk(b1).arrived_at; await arrived(b1); eq(tk(b1).arrived_at, t0, "άλλαξε η ώρα:");
  eq((await post("/api/km/admin/delete", { "X-Km-Admin": "adm1n" }, { folder_id: B.folder })).status, 200);
  eq(db.prepare("SELECT COUNT(*) AS n FROM km_support_tickets WHERE scope = ?").get(B.folder).n, 0);
});
await check("Υ-9 · άκυρη μορφή στο arrived → 400", async () => { eq((await arrived("KM-AB12")).st, 400); });
// ═════════════ ΕΦΑΡΜΟΓΗ ═════════════
const a0 = js.indexOf("  /* ══ v92 · KM-SUP-CASE"), a9 = js.indexOf("  /* ══ v62 · Brief Ε §3");
if (a0 < 0 || a9 < 0) { console.log("λείπει το μπλοκ v92"); process.exit(1); }
const block = js.slice(a0, a9).replace("SUP_WAIT_MS = 4000", "SUP_WAIT_MS = 40");
function world(opts) {
  const store = Object.assign({}, opts.ls || {});
  const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const els = {};
  // ⚠ Όπως στο πραγματικό DOM: textContent = '' ΑΔΕΙΑΖΕΙ τα παιδιά.
  const mkEl = (id) => { let tc = ""; const e = { id, value: "", hidden: false, disabled: false, children: [], onclick: null,
    appendChild(c) { this.children.push(c); } };
    Object.defineProperty(e, "textContent", { get() { return tc; }, set(v) { tc = String(v); e.children = []; } }); return e; };
  const el = (id) => els[id] || (els[id] = mkEl(id));
  const document = { createElement: (t) => { const e = mkEl(t); e.tag = t; Object.defineProperty(e, "innerHTML", { set() { e.htmlUsed = true; } }); return e; } };
  const calls = [];
  const kmFetch = (path, o) => { calls.push(path); return opts.fetch ? opts.fetch(path, o) : Promise.reject(new Error("offline")); };
  const location = { href: "" };
  const clip = [];
  const navigator = { userAgent: "UA", clipboard: { writeText: (t) => { clip.push(t); return Promise.resolve(); } } };
  const LS = { sup: "km_sup_cases" };
  const fn = new Function("localStorage", "el", "document", "kmFetch", "kmHead", "hasAccount", "LS", "location", "navigator", "shortVer", "APP_VER", "devName",
    block + "\nreturn { renderHelp: renderHelp, supRecent: supRecent, supRead: supRead, supCheck: supCheck };");
  const api = fn(localStorage, el, document, kmFetch, () => ({}), () => !!opts.account, LS, location, navigator, (v) => "v92", "φέτα 3 · v92", () => "Pixel");
  return { api, el, store, calls, location, clip };
}

const okFetch2 = (map) => (path, o) => Promise.resolve({ ok: true, json: () => Promise.resolve(map(path, o)) });
const day = (n) => new Date(Date.now() - n * 864e5).toISOString();
await check("Ε-1 · 🔴 ανεπιβεβαίωτος ΔΕΝ φαίνεται στη «Συνέχεια»", async () => {
  const w = world({ account: true, ls: { km_sup_cases: JSON.stringify([{ c: "KM-2222222222-1", d: day(0), t: "α", ok: 0 }]) } });
  w.api.renderHelp(); ok(w.el("hp-cases-wrap").hidden, "φάνηκε");
});
await check("Ε-2 · 🔴 ο server λέει «έφτασε» → φαίνεται, και ρωτήθηκαν ΜΟΝΟ οι ανεπιβεβαίωτοι", async () => {
  let asked = null;
  const w = world({ account: true, ls: { km_sup_cases: JSON.stringify([
    { c: "KM-2222222222-2", d: day(0), t: "νέο", ok: 0 }, { c: "KM-2222222222-1", d: day(1), t: "παλιό", ok: 1 }]) },
    fetch: okFetch2((p, o) => { asked = JSON.parse(o.body).codes; return { ok: true, arrived: ["KM-2222222222-2"] }; }) });
  w.api.renderHelp(); await new Promise((r) => setTimeout(r, 30));
  eq(asked, ["KM-2222222222-2"]);
  eq(w.el("hp-cases").children.length, 3, "Νέο + 2:");
});
await check("Ε-3 · ανεπιβεβαίωτος πάνω από 7 ημέρες πετιέται · επιβεβαιωμένος μένει", async () => {
  const w = world({ account: true, ls: { km_sup_cases: JSON.stringify([
    { c: "KM-2222222222-3", d: day(8), ok: 0 }, { c: "KM-2222222222-1", d: day(20), ok: 1 }]) } });
  await w.api.supCheck();
  eq(JSON.parse(w.store.km_sup_cases).map((x) => x.c), ["KM-2222222222-1"]);
});
await check("Ε-4 · η «Συνέχεια» κρατάει την επιβεβαίωση (δεν εξαφανίζεται μετά τη χρήση)", async () => {
  const w = world({ account: true, ls: { km_sup_cases: JSON.stringify([{ c: "KM-2222222222-1", d: day(1), t: "α", ok: 1 }]) } });
  w.api.renderHelp();
  const r = w.el("hp-cases").children[1].children[0]; r.checked = true; r.onchange();
  w.el("hp-mail").onclick(); await new Promise((r) => setTimeout(r, 30));
  eq(JSON.parse(w.store.km_sup_cases)[0].ok, 1);
});
await check("Ε-5 · νέος αριθμός αποθηκεύεται με ok 0", async () => {
  const w = world({ account: true, fetch: okFetch2(() => ({ ok: true, code: "KM-2222222222-9" })) });
  w.api.renderHelp(); w.el("hp-mail").onclick(); await new Promise((r) => setTimeout(r, 60));
  eq(JSON.parse(w.store.km_sup_cases)[0], Object.assign(JSON.parse(w.store.km_sup_cases)[0], { c: "KM-2222222222-9", ok: 0 }));
  eq(JSON.parse(w.store.km_sup_cases)[0].ok, 0);
});

console.log(failed ? "\n✘ ΑΠΕΤΥΧΑΝ " + failed : "\n✔ ΟΛΑ ΠΕΡΑΣΑΝ (14)");
if (ONLY) process.exit(failed ? 0 : 1);
process.exit(failed ? 1 : 0);
