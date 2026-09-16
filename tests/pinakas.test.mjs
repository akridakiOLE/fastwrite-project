// ΠΙΝΑΚΑΣ ΕΛΕΓΧΟΥ — Brief Β ((α)-(δ) του Stavros, 4/9/2026) — γράφτηκε 16/9/2026 · +FastWrite (Π-9..12) 16/9
//   node --experimental-sqlite tests/pinakas.test.mjs
//   node --experimental-sqlite tests/pinakas.test.mjs --mutate   (ΠΡΕΠΕΙ να κοκκινίσει)
//
// 🔴 Ο ΦΡΟΥΡΟΣ ΠΟΥ ΜΕΤΡΑΕΙ: «βλέπει λογαριασμό, ΠΟΤΕ περιεχόμενο» (6/9/2026).
//    Το JSON δεν επιτρέπεται να περιέχει τίποτα από τον φάκελο, ούτε ολόκληρο
//    folder_id, ούτε auth_hash, ούτε email σε ταφόπετρα ή εκκρεμή διαγραφή.

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const MUTATE = process.argv.includes("--mutate");
let src = readFileSync("src/km.js", "utf8");
const MUTATIONS = [
  // 1. Οι ταφόπετρες μπαίνουν στη λίστα → διαρρέει το «κάποτε υπήρχε» με folder.
  ["FROM km_accounts a WHERE a.deleted IS NULL ORDER BY a.created DESC LIMIT 500",
   "FROM km_accounts a ORDER BY a.created DESC LIMIT 500"],
  // 2. Το κλειδί σταματάει να ελέγχεται → ο πίνακας γίνεται δημόσιος.
  ['async function adminPinakas(request, env) {\n  if (!adminOk(request, env)) return new Response("Not found", { status: 404 });',
   'async function adminPinakas(request, env) {'],
  // 3. Οι εκκρεμείς διαγραφές αρχίζουν να κουβαλάνε email.
  ["SELECT substr(folder_id, 1, 8) AS folder, delete_requested_at, delete_due_at\n     FROM km_accounts WHERE deleted IS NULL AND delete_due_at IS NOT NULL",
   "SELECT substr(folder_id, 1, 8) AS folder, email, delete_requested_at, delete_due_at\n     FROM km_accounts WHERE deleted IS NULL AND delete_due_at IS NOT NULL"],
  // 4. Ο Worker παύει να στέλνει το κλειδί στον Hetzner → ο Hetzner λέει 404 → η ζώνη FastWrite πέφτει.
  ['headers: { "X-Km-Admin": key, "Accept": "application/json" },',
   'headers: { "Accept": "application/json" },'],
];
if (MUTATE) for (const [a, b] of MUTATIONS) {
  if (!src.includes(a)) { console.log("Η ΜΕΤΑΛΛΑΞΗ ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ:\n" + a.slice(0, 90)); process.exit(1); }
  src = src.replace(a, b);
}
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));

const db = new DatabaseSync(":memory:");
for (const f of ["km.sql", "km_h13.sql", "km_v54.sql", "km_mail.sql", "km_feedback.sql", "km_h11b.sql"]) {
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
const FW_BODY = { ok: true, product: "FastWrite Desktop",
  users: { total: 3, active: 3, admins: 1, with_2fa: 1, new_1d: 0, new_7d: 1, new_30d: 2 },
  subscriptions: { by_status: [{ status: "active", n: 3 }], by_plan: [{ plan: "Free", n: 2 }, { plan: "Pro", n: 1 }], paying: 1 },
  installs: { total: 2, seen_7d: 1, seen_30d: 2, docs_total: 40, by_version: [{ v: "2.7.0", n: 2 }] },
  documents: { total: 40, d30: 5 }, feedback: { total: 0, d30: 0 },
  accounts: [{ username: "stavros", email: "s@x.gr", created_at: "2026-09-01T10:00:00", role: "admin", is_active: 1, plan: "Pro", sub_status: "active", docs: 40, last_seen: "2026-09-16T08:00:00" }] };
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
  const r = await post("/api/km/register", H(id), Object.assign({ email: id.email }, extra || {}));
  if (r.status !== 200) throw new Error("register " + r.status);
  return id;
}
// «ΑΠΟΡΡΗΤΟ ΠΕΡΙΕΧΟΜΕΝΟ» — αν αυτό εμφανιστεί ΠΟΤΕ στο JSON του πίνακα, έχει χαθεί το παν.
const SECRET = Buffer.from("ΑΠΟΡΡΗΤΟ-ΠΕΡΙΕΧΟΜΕΝΟ-" + hex(8));

let failed = 0;
const check = async (n, f) => { try { await f(); console.log("  ✔ " + n); } catch (e) { failed++; console.log("  ✘ " + n + " — " + e.message); } };
const eq = (g, w, what) => { if (JSON.stringify(g) !== JSON.stringify(w)) throw new Error((what || "") + " πήρα " + JSON.stringify(g) + " περίμενα " + JSON.stringify(w)); };
const pinakas = async () => { const r = await call("/api/km/admin/pinakas?k=s3cret", {}); if (r.status !== 200) throw new Error("pinakas " + r.status); return r.json(); };

console.log(MUTATE ? "ΜΕΤΑΛΛΑΓΜΕΝΟ — ΠΡΕΠΕΙ ΝΑ ΚΟΚΚΙΝΙΣΕΙ\n" : "ΚΑΝΟΝΙΚΟ\n");

// στήσιμο: 3 από Play (1 με ref), 2 από link, 1 διαγραμμένος, 1 σε εκκρεμότητα, 1 με δεδομένα
const a1 = await account({ source: "store:play", ref: "MARIA" });
const a2 = await account({ source: "store:play", ref: "MARIA" });
const a3 = await account({ source: "store:play" });
const a4 = await account({ source: "link" });
const a5 = await account({ source: "link", ref: "NIKOS" });
await call("/api/km/folder", { method: "PUT", headers: H(a5), body: SECRET });     // φάκελος με περιεχόμενο
const dead = await account({ source: "link" });
await post("/api/km/delete", H(dead), { confirm: "ΔΙΑΓΡΑΦΗ" });
await mod.kmDeleteDue(env, "2030-01-01T00:00:00Z");                                // ταφόπετρα
const pend = await account({ source: "store:play" });
await post("/api/km/delete", H(pend), { confirm: "ΔΙΑΓΡΑΦΗ" });                     // εκκρεμής

await check("Π-1 · χωρίς κλειδί η διαδρομή ΔΕΝ ΥΠΑΡΧΕΙ (404, όχι 403)", async () => {
  eq((await call("/api/km/admin/pinakas", {})).status, 404);
  eq((await call("/api/km/admin/pinakas?k=wrong", {})).status, 404);
});

await check("Π-2 · τα σύνολα: 6 ζωντανοί · 1 ταφόπετρα · 1 εκκρεμής · 1 με δεδομένα", async () => {
  const j = await pinakas();
  eq(j.totals.live, 6, "live:"); eq(j.totals.tombstones, 1, "tombstones:");
  eq(j.totals.pending_delete, 1, "pending:"); eq(j.totals.with_data, 1, "with_data:");
  eq(j.totals.new_1d, 6, "new_1d:");
  if (j.totals.bytes !== SECRET.length) throw new Error("bytes " + j.totals.bytes);
});

await check("Π-3 · (α) ΑΠΟ ΠΟΥ — store:play 4, link 2", async () => {
  const j = await pinakas();
  const m = Object.fromEntries(j.by_source.map((r) => [r.source, r.n]));
  eq(m["store:play"], 4, "play:"); eq(m["link"], 2, "link:");
});

await check("Π-4 · (γ) ΠΟΙΟΣ ΣΥΣΤΗΣΕ ΠΟΙΟΝ — MARIA 2, NIKOS 1, με σειρά", async () => {
  const j = await pinakas();
  eq(j.by_ref.map((r) => [r.ref, r.n]), [["MARIA", 2], ["NIKOS", 1]]);
});

await check("Π-5 · η λίστα δείχνει ποιος/από πού/πότε — και ΟΧΙ τους διαγραμμένους", async () => {
  const j = await pinakas();
  eq(j.accounts.length, 6, "γραμμές:");
  const row = j.accounts.find((r) => r.email === a1.email);
  if (!row) throw new Error("ο a1 δεν φαίνεται");
  eq([row.source, row.ref], ["store:play", "MARIA"]);
  if (j.accounts.some((r) => r.folder === dead.folder.slice(0, 8))) throw new Error("η ταφόπετρα μπήκε στη λίστα");
  if (!j.accounts.some((r) => r.delete_due_at)) throw new Error("ο εκκρεμής δεν σημαίνεται");
});

await check("Π-6 · 🔴 ΒΛΕΠΕΙ ΛΟΓΑΡΙΑΣΜΟ, ΠΟΤΕ ΠΕΡΙΕΧΟΜΕΝΟ — ούτε φάκελο, ούτε auth, ούτε ολόκληρο folder_id", async () => {
  const j = await pinakas(); const dump = JSON.stringify(j);
  if (dump.includes(SECRET.toString())) throw new Error("ΤΟ ΠΕΡΙΕΧΟΜΕΝΟ ΤΟΥ ΦΑΚΕΛΟΥ ΒΓΗΚΕ ΣΤΟΝ ΠΙΝΑΚΑ");
  for (const id of [a1, a5, dead, pend]) {
    if (dump.includes(id.folder)) throw new Error("ολόκληρο folder_id στο JSON");
    if (dump.includes(id.auth)) throw new Error("auth στο JSON");
  }
  if (/auth_hash/.test(dump)) throw new Error("πεδίο auth_hash στο JSON");
});

await check("Π-7 · οι εκκρεμείς διαγραφές έχουν ημερομηνίες, ΟΧΙ email", async () => {
  const j = await pinakas();
  eq(j.pending_deletions.length, 1);
  const p = j.pending_deletions[0];
  if (!p.delete_due_at) throw new Error("λείπει η λήξη");
  if (JSON.stringify(p).includes("@")) throw new Error("email μέσα στην εκκρεμή διαγραφή");
});

await check("Π-8 · (β) και (δ) δηλώνονται ρητά ως «περιμένουν», δεν λείπουν σιωπηλά", async () => {
  const j = await pinakas();
  if (!j.rewards || !j.rewards.status) throw new Error("λείπει η θέση της επιβράβευσης");
  if (!j.subscriptions || !("paid" in j.subscriptions)) throw new Error("λείπει η θέση των συνδρομών");
  eq(j.subscriptions.paid, 0);
});

await check("Π-9 · FastWrite: ο Worker ρωτά ΜΟΝΟΣ τον Hetzner με το κλειδί στο header, ΟΧΙ στο URL", async () => {
  hetzner.mode = "ok"; hetzner.calls.length = 0;
  const j = await pinakas();
  eq(hetzner.calls.length, 1, "κλήσεις προς Hetzner:");
  const c = hetzner.calls[0];
  if (!c.url.startsWith("https://api.fastwrite.tech/api/admin/pinakas")) throw new Error("λάθος διεύθυνση " + c.url);
  if (c.url.includes("s3cret")) throw new Error("ΤΟ ΚΛΕΙΔΙ ΜΠΗΚΕ ΣΤΟ URL");
  eq(c.headers["X-Km-Admin"], "s3cret", "header:");
  eq(j.fastwrite.ok, true, "fastwrite.ok:");
  eq(j.fastwrite.users.total, 3, "users:"); eq(j.fastwrite.subscriptions.paying, 1, "paying:");
  eq(j.fastwrite.accounts[0].username, "stavros");
});

await check("Π-10 · FastWrite κάτω (timeout): ο πίνακας ΔΕΝ πέφτει — Kostometro κανονικά, fastwrite.ok=false", async () => {
  hetzner.mode = "down";
  const j = await pinakas();                       // 200, αλλιώς πετάει
  eq(j.totals.live, 6, "live (Kostometro):");
  eq(j.fastwrite.ok, false, "fastwrite.ok:");
  eq(j.fastwrite.error, "TimeoutError", "error:");
  hetzner.mode = "ok";
});

await check("Π-11 · FastWrite 404 (λείπει το km_admin_key.txt στον server): λέγεται ρητά http_404", async () => {
  hetzner.mode = "nokey";
  const j = await pinakas();
  eq(j.fastwrite.ok, false); eq(j.fastwrite.error, "http_404");
  hetzner.mode = "ok";
});

await check("Π-12 · 🔴 ο Hetzner ΔΕΝ στέλνει ποτέ hash/secret και ο πίνακας δεν τα προωθεί", async () => {
  hetzner.mode = "ok";
  const dump = JSON.stringify(await pinakas());
  if (/password_hash|totp_secret|stripe_customer_id/.test(dump)) throw new Error("απόρρητο πεδίο στο JSON");
});

console.log(failed ? "\nΚΟΚΚΙΝΟ: " + failed + " φρουροί έπεσαν" : "\nΠΡΑΣΙΝΟ: όλοι οι φρουροί πέρασαν");
process.exit(MUTATE ? (failed ? 0 : 1) : (failed ? 1 : 0));
