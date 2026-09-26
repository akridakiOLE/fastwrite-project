// v92 · KM-SUP-CASE — ΑΡΙΘΜΟΣ ΑΙΤΗΜΑΤΟΣ ΥΠΟΣΤΗΡΙΞΗΣ (26/9/2026, απόφαση Stavros)
//   node --experimental-sqlite tests/v92.test.mjs  ·  --mutate=N (ΠΡΕΠΕΙ να κοκκινίσει)
// Server: μετρητής ανά λογαριασμό (KM-<affiliate>-<n>) και ένας για τα email (KM-E-nnnnnn).
// Εφαρμογή: ο αριθμός ΜΟΝΟ από τον server, «Συνέχεια σε…», καμία δεύτερη υπόθεση με δεύτερο πάτημα.
// ⚠ Δεν αποδεικνύει ότι ανοίγει το email σε πραγματικό κινητό — αυτό γίνεται στη δοκιμή του Stavros.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let src = readFileSync("src/km.js", "utf8");
let js = readFileSync("site/kostometro/app.js", "utf8");
const MUT = [
  // 1 · 🔴 ο μετρητής δεν ανεβαίνει — ο ίδιος αριθμός δύο φορές
  ["src", 'const code = "KM-" + ref + "-" + n;', 'const code = "KM-" + ref + "-1";'],
  // 2 · 🔴 η διαδρομή των email χωρίς μυστικό
  ["src", '  if (!supportKeyOk(request, env)) return new Response("Not found", { status: 404 });\n  const n = await supportNext(env, "E");', '  const n = await supportNext(env, "E");'],
  // 3 · 🔴 το σκριπτ δέχεται και το KM_ADMIN_KEY (ή το αντίστροφο: μπερδεύονται τα μυστικά)
  ["src", "return !!env.KM_SUPPORT_KEY && k === env.KM_SUPPORT_KEY;", "return k === env.KM_ADMIN_KEY || (!!env.KM_SUPPORT_KEY && k === env.KM_SUPPORT_KEY);"],
  // 4 · ο μετρητής ΔΕΝ σβήνεται με τον λογαριασμό
  ["src", '    env.DB.prepare("DELETE FROM km_support_seq WHERE scope = ?").bind(folderId),\n', ""],
  // 5 · όποιος ζήτησε διαγραφή δεν μπορεί να μας γράψει
  ["src", "const a = await authed(request, env, { allowPending: true });\n  if (a.err) return a.err;\n  const ref = await ensureRefCode", "const a = await authed(request, env);\n  if (a.err) return a.err;\n  const ref = await ensureRefCode"],
  // 6 · ο αριθμός email χάνει τη σταθερή μορφή (6 ψηφία)
  ["src", 'const code = "KM-E-" + String(n).padStart(6, "0");', 'const code = "KM-E-" + n;'],
  // 7 · 🔴 η εφαρμογή δέχεται ό,τι αριθμό της δώσουν
  ["js", "return (j && j.ok && SUP_RE.test(j.code || '')) ? j.code : '';", "return (j && j.code) || '';"],
  // 8 · 🔴 δεύτερο πάτημα = δεύτερη υπόθεση
  ["js", "if (code) { hpSel = code; supRemember(code, topic); }", "if (code) { supRemember(code, topic); }"],
  // 9 · χωρίς λογαριασμό ρωτάει τον server
  ["js", "    if (!hasAccount()) { return Promise.resolve(''); }\n    var late", "    var late"],
  // 10 · τα «πρόσφατα» δείχνουν και τα πολύ παλιά
  ["js", "(Date.parse(x.d) || 0) >= lim;", "(Date.parse(x.d) || 0) >= 0;"],
  // 11 · 🔴 το θέμα του χρήστη μπαίνει σε innerHTML
  ["js", "var sp = document.createElement('span'); sp.textContent = title;", "var sp = document.createElement('span'); sp.innerHTML = title;"],
  // 12 · ο αριθμός φεύγει από το σώμα του email (αν σβηστεί το θέμα, χάνεται)
  ["js", "(p.code ? 'Αριθμός αιτήματος: ' + p.code + '\\n' : '') +", "'' +"],
  // 13 · η «συνέχεια» ανοίγει νέα υπόθεση
  ["js", "      supRemember(hpSel, topic);\n      return Promise.resolve({ code: hpSel, topic: topic });", "      hpSel = '';\n      return supNewCode().then(function (c) { return { code: c, topic: topic }; });"],
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

const A = await account(), B = await account();
await check("Σ-1 · 🔴 ο αριθμός ανεβαίνει: -1, -2, -3 στον ίδιο λογαριασμό, πρόθεμα = κωδικός affiliate", async () => {
  const a = [(await ticket(A)).j.code, (await ticket(A)).j.code, (await ticket(A)).j.code];
  const ref = (await (await call("/api/km/ref", { headers: H(A) })).json()).code;
  eq(a, ["KM-" + ref + "-1", "KM-" + ref + "-2", "KM-" + ref + "-3"]);
});
await check("Σ-2 · 🔴 ΚΑΝΕΝΑΣ ΑΡΙΘΜΟΣ ΔΥΟ ΦΟΡΕΣ: 2 λογαριασμοί × 50 + νέο κινητό του Α συνεχίζει", async () => {
  const seen = new Set();
  for (let i = 0; i < 50; i++) for (const id of [A, B]) { const c = (await ticket(id)).j.code; ok(APP_RE.test(c), "μορφή " + c); ok(!seen.has(c), "διπλός " + c); seen.add(c); }
  const phone2 = { folder: A.folder, auth: A.auth, device: "km_" + hex(6) };
  const c = (await ticket(phone2)).j.code; ok(!seen.has(c), "το νέο κινητό ξαναέδωσε " + c);
});
await check("Σ-3 · λάθος ταυτότητα → 403, ο μετρητής ΔΕΝ ανεβαίνει", async () => {
  const before = db.prepare("SELECT n FROM km_support_seq WHERE scope = ?").get(A.folder).n;
  eq((await ticket({ folder: A.folder, auth: hex(32), device: A.device })).st, 403);
  eq(db.prepare("SELECT n FROM km_support_seq WHERE scope = ?").get(A.folder).n, before);
});
await check("Σ-4 · όποιος έχει ζητήσει διαγραφή ΜΠΟΡΕΙ να πάρει αριθμό (να μας γράψει για ακύρωση)", async () => {
  const C = await account();
  db.prepare("UPDATE km_accounts SET delete_requested_at = ?, delete_due_at = ? WHERE folder_id = ?").run("2026-09-26T10:00:00Z", "2026-09-29T10:00:00Z", C.folder);
  const t = await ticket(C); eq(t.st, 200); ok(APP_RE.test(t.j.code), "μορφή");
});
await check("Σ-5 · 🔴 email-ticket: χωρίς κλειδί, λάθος κλειδί, κλειδί διαχειριστή → 404 · χωρίς KM_SUPPORT_KEY στο env → 404", async () => {
  eq((await eticket(null)).st, 404, "χωρίς:");
  eq((await eticket("wrong-key")).st, 404, "λάθος:");
  eq((await eticket("adm1n")).st, 404, "admin:");
  eq((await eticket("", Object.assign({}, env, { KM_SUPPORT_KEY: undefined }))).st, 404, "κενό env:");
});
await check("Σ-6 · email-ticket: KM-E-000001, KM-E-000002 … — ένας μετρητής, άλλη μορφή από της εφαρμογής", async () => {
  const a = (await eticket("supp0rt")).j.code, b = (await eticket("supp0rt")).j.code;
  eq([a, b], ["KM-E-000001", "KM-E-000002"]); ok(!APP_RE.test(a), "συγκρούεται με τη μορφή της εφαρμογής");
});
await check("Σ-7 · ο μετρητής σβήνεται μαζί με τον λογαριασμό (οριστική διαγραφή)", async () => {
  const r = await post("/api/km/admin/delete", { "X-Km-Admin": "adm1n" }, { folder_id: B.folder });
  eq(r.status, 200, "διαγραφή:");
  eq(db.prepare("SELECT COUNT(*) AS n FROM km_support_seq WHERE scope = ?").get(B.folder).n, 0);
});
await check("Σ-8 · η βάση κρατάει ΜΟΝΟ scope + n — κανένα θέμα, κανένα email", async () => {
  const cols = db.prepare("PRAGMA table_info(km_support_seq)").all().map((c) => c.name);
  eq(cols, ["scope", "n"]);
});

// ═════════════ ΕΦΑΡΜΟΓΗ ═════════════
const a0 = js.indexOf("  /* ══ v92 · KM-SUP-CASE"), a1 = js.indexOf("  /* ══ v62 · Brief Ε §3");
if (a0 < 0 || a1 < 0) { console.log("λείπει το μπλοκ v92"); process.exit(1); }
const block = js.slice(a0, a1).replace("SUP_WAIT_MS = 4000", "SUP_WAIT_MS = 40");
function world(opts) {
  const store = Object.assign({}, opts.ls || {});
  const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const els = {};
  const mkEl = (id) => ({ id, value: "", textContent: "", hidden: false, disabled: false, children: [], onclick: null,
    appendChild(c) { this.children.push(c); } });
  const el = (id) => els[id] || (els[id] = mkEl(id));
  const document = { createElement: (t) => { const e = mkEl(t); e.tag = t; Object.defineProperty(e, "innerHTML", { set() { e.htmlUsed = true; } }); return e; } };
  const calls = [];
  const kmFetch = (path, o) => { calls.push(path); return opts.fetch ? opts.fetch(path, o) : Promise.reject(new Error("offline")); };
  const location = { href: "" };
  const clip = [];
  const navigator = { userAgent: "UA", clipboard: { writeText: (t) => { clip.push(t); return Promise.resolve(); } } };
  const LS = { sup: "km_sup_cases" };
  const fn = new Function("localStorage", "el", "document", "kmFetch", "kmHead", "hasAccount", "LS", "location", "navigator", "shortVer", "APP_VER", "devName",
    block + "\nreturn { renderHelp: renderHelp, supRecent: supRecent, supRead: supRead };");
  const api = fn(localStorage, el, document, kmFetch, () => ({}), () => !!opts.account, LS, location, navigator, (v) => "v92", "φέτα 3 · v92", () => "Pixel");
  return { api, el, store, calls, location, clip };
}
const okFetch = (code) => () => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, code }) });
const tap = async (w, id) => { w.el(id).onclick(); await new Promise((r) => setTimeout(r, 80)); };
const subj = (w) => decodeURIComponent((/subject=([^&]*)/.exec(w.location.href) || [])[1] || "");
const bodyOf = (w) => decodeURIComponent((/body=([^&]*)/.exec(w.location.href) || [])[1] || "");
const GOOD = "KM-7QX2AB9KMP-3";

await check("Ε-1 · 🔴 νέο αίτημα: ΜΙΑ κλήση support/ticket, ο αριθμός στο θέμα ΚΑΙ στο σώμα, φυλάγεται τοπικά", async () => {
  const w = world({ account: true, fetch: okFetch(GOOD) });
  w.api.renderHelp(); w.el("hp-topic").value = "  δεν   διαβάζει ";
  await tap(w, "hp-mail");
  eq(w.calls, ["support/ticket"]);
  eq(subj(w), "Kostometro · " + GOOD + " · δεν διαβάζει");
  ok(bodyOf(w).includes("Αριθμός αιτήματος: " + GOOD), "ο αριθμός λείπει από το σώμα");
  eq(JSON.parse(w.store.km_sup_cases)[0].c, GOOD);
  eq(w.el("hp-ticket").textContent, GOOD);
});
await check("Ε-2 · 🔴 δεύτερο πάτημα στο ίδιο άνοιγμα = ΙΔΙΟΣ αριθμός, καμία δεύτερη κλήση", async () => {
  const w = world({ account: true, fetch: okFetch(GOOD) });
  w.api.renderHelp(); await tap(w, "hp-mail"); await tap(w, "hp-mail"); await tap(w, "hp-copy");
  eq(w.calls.length, 1); ok(w.clip[0].includes(GOOD), "η αντιγραφή δεν έχει τον αριθμό");
});
await check("Ε-3 · χωρίς λογαριασμό: ΚΑΜΙΑ κλήση, θέμα χωρίς αριθμό, σημείωση «θα σου έρθει με την απάντηση»", async () => {
  const w = world({ account: false, fetch: okFetch(GOOD) });
  w.api.renderHelp(); w.el("hp-topic").value = "βοήθεια"; await tap(w, "hp-mail");
  eq(w.calls, []); eq(subj(w), "Kostometro · βοήθεια"); ok(!w.el("hp-note").hidden, "λείπει η σημείωση");
  eq(w.store.km_sup_cases, undefined, "φυλάχτηκε αίτημα χωρίς αριθμό");
});
await check("Ε-4 · χωρίς δίκτυο / αργός server: φεύγει χωρίς αριθμό — ΠΟΤΕ αριθμός φτιαγμένος στη συσκευή", async () => {
  const w = world({ account: true });
  w.api.renderHelp(); await tap(w, "hp-mail"); eq(subj(w), "Kostometro");
  const w2 = world({ account: true, fetch: () => new Promise(() => {}) });
  w2.api.renderHelp(); await tap(w2, "hp-mail"); eq(subj(w2), "Kostometro", "αργός:");
});
await check("Ε-5 · 🔴 ο server στέλνει σκουπίδι (παλιά μορφή KM-XXXX) → απορρίπτεται", async () => {
  const w = world({ account: true, fetch: okFetch("KM-AB12") });
  w.api.renderHelp(); await tap(w, "hp-mail"); eq(subj(w), "Kostometro");
});
const day = (n) => new Date(Date.now() - n * 864e5).toISOString();
const seven = JSON.stringify([
  { c: "KM-2222222222-7", d: day(1), t: "α", ok: 1 }, { c: "KM-E-000009", d: day(2), t: "β", ok: 1 }, { c: "KM-XXXX", d: day(3), t: "κακό", ok: 1 },
  { c: "KM-3333333333-1", d: day(70), t: "παλιό", ok: 1 }, { c: "KM-4444444444-2", d: day(4), t: "<b>x</b>", ok: 1 },
  { c: "KM-5555555555-3", d: day(5), ok: 1 }, { c: "KM-6666666666-4", d: day(6), ok: 1 }, { c: "KM-7777777777-5", d: day(7), ok: 1 },
]);
await check("Ε-6 · «Πρόσφατα»: ≤5, ≤60 ημέρες, μόνο έγκυρες μορφές, με textContent", async () => {
  const w = world({ account: true, ls: { km_sup_cases: seven } });
  w.api.renderHelp();
  const rows = w.el("hp-cases").children; ok(!w.el("hp-cases-wrap").hidden, "κρυμμένη λίστα");
  eq(rows.length, 6, "Νέο + 5:");
  const titles = rows.map((r) => r.children[1].textContent);
  ok(!titles.some((t) => /3333333333|KM-XXXX/.test(t)), "πέρασε παλιό ή άκυρο");
  ok(!rows.some((r) => r.children[1].htmlUsed), "innerHTML σε κείμενο χρήστη");
});
await check("Ε-7 · 🔴 «Συνέχεια σε…»: ΚΑΜΙΑ κλήση, ίδιος αριθμός, το θέμα από το αρχικό αίτημα", async () => {
  const w = world({ account: true, ls: { km_sup_cases: seven }, fetch: okFetch(GOOD) });
  w.api.renderHelp();
  const r = w.el("hp-cases").children[1].children[0]; r.checked = true; r.onchange();
  await tap(w, "hp-mail");
  eq(w.calls, []); eq(subj(w), "Kostometro · KM-2222222222-7 · α");
  eq(JSON.parse(w.store.km_sup_cases)[0].c, "KM-2222222222-7", "δεν ανέβηκε πρώτο:");
});
await check("Ε-8 · άδεια λίστα: κρύβεται η επιλογή, ο αριθμός «—» πριν το πάτημα", async () => {
  const w = world({ account: true }); w.api.renderHelp();
  ok(w.el("hp-cases-wrap").hidden, "φαίνεται"); eq(w.el("hp-ticket").textContent, "—");
});

console.log(failed ? "\n✘ ΑΠΕΤΥΧΑΝ " + failed : "\n✔ ΟΛΑ ΠΕΡΑΣΑΝ (16)");
if (ONLY) process.exit(failed ? 0 : 1);   // μετάλλαξη: πρέπει να κοκκινίσει
process.exit(failed ? 1 : 0);
