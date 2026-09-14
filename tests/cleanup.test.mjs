// Τεστ για τους ΧΡΟΝΟΥΣ ΤΗΡΗΣΗΣ (Πολιτική v2.0 §5) — 14/9/2026.
// Πραγματική sqlite με τα ΠΡΑΓΜΑΤΙΚΑ σχήματα. Καμία σύνδεση, κανένα Cloudflare.
//
//   node --experimental-sqlite tests/cleanup.test.mjs
//   node --experimental-sqlite tests/cleanup.test.mjs --mutate   (ΠΡΕΠΕΙ να κοκκινίσει)

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const MUTATE = process.argv.includes("--mutate");
let src = readFileSync("src/km.js", "utf8");
if (MUTATE) {
  // Σπάμε τα ρολόγια: 36/24 μήνες -> 0. Αν το τεστ δεν το δει, δεν δοκιμάζει τίποτα.
  src = src.replace("tombstone_months: 36,", "tombstone_months: 0,");
  src = src.replace("feedback_months: 24,", "feedback_months: 0,");
  src = src.replace("const CLEANUP_BATCH = 500;", "const CLEANUP_BATCH = 2;");
}
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));

const db = new DatabaseSync(":memory:");
for (const f of ["schema/km.sql", "schema/gnomi.sql", "schema/km_feedback.sql"]) {
  db.exec(readFileSync(f, "utf8"));
}
const stmt = (sql, args) => {
  const p = db.prepare(sql);
  return {
    async first() { return p.get(...args) ?? null; },
    async run() { const r = p.run(...args); return { meta: { changes: Number(r.changes) } }; },
    async all() { return { results: p.all(...args) }; },
  };
};
const env = { DB: { prepare: (sql) => ({ bind: (...a) => stmt(sql, a), ...stmt(sql, []) }) }, KM_ADMIN_KEY: "s3cret" };

const NOW = "2026-09-14T09:00:00.000Z";
const ago = (m) => { const d = new Date(NOW); d.setUTCMonth(d.getUTCMonth() - m); return d.toISOString(); };

// ── ΣΠΟΡΑ: ζευγάρια «μόλις πριν το όριο» και «μόλις μετά» ──────────────────
db.exec("DELETE FROM km_accounts");
const acc = db.prepare("INSERT INTO km_accounts (folder_id,auth_hash,email,created,deleted) VALUES (?,?,?,?,?)");
acc.run("a".repeat(64), "", "", ago(40), ago(37));   // ταφόπετρα 37 μηνών -> ΣΒΗΝΕΙ
acc.run("b".repeat(64), "", "", ago(40), ago(35));   // ταφόπετρα 35 μηνών -> ΜΕΝΕΙ
acc.run("c".repeat(64), "h", "z@z.gr", ago(40), null); // ΖΩΝΤΑΝΟΣ, παλιός -> ΜΕΝΕΙ

const fb = db.prepare("INSERT INTO km_feedback (stars,text,ver,month) VALUES (?,?,?,?)");
fb.run(5, "παλιά", "v60", ago(25).slice(0, 7));      // 25 μηνών -> ΣΒΗΝΕΙ
fb.run(4, "πρόσφατη", "v60", ago(23).slice(0, 7));   // 23 μηνών -> ΜΕΝΕΙ

const gr = db.prepare("INSERT INTO gnomi_responses (sid,ts) VALUES (?,?)");
gr.run("s1", ago(25)); gr.run("s2", ago(23));
const ge = db.prepare("INSERT INTO gnomi_events (sid,ev,ts) VALUES (?,?,?)");
ge.run("s1", "view", ago(25)); ge.run("s2", "view", ago(23));

let failed = 0;
const check = async (n, f) => { try { await f(); console.log("  ✔ " + n); } catch (e) { failed++; console.log("  ✘ " + n + " — " + e.message); } };
const eq = (g, w, what) => { if (JSON.stringify(g) !== JSON.stringify(w)) throw new Error((what || "") + " πήρα " + JSON.stringify(g) + " περίμενα " + JSON.stringify(w)); };
const count = (t) => db.prepare("SELECT COUNT(*) AS n FROM " + t).get().n;

console.log(MUTATE ? "ΜΕΤΑΛΛΑΓΜΕΝΟ — ΠΡΕΠΕΙ ΝΑ ΚΟΚΚΙΝΙΣΕΙ" : "ΚΑΝΟΝΙΚΟ");

const adminReq = (m, q) => new Request("https://x/api/km/admin/cleanup?k=s3cret&now=" + encodeURIComponent(NOW) + (q || ""), { method: m });

await check("η ΠΡΟΒΟΛΗ μετράει σωστά και ΔΕΝ σβήνει τίποτα", async () => {
  const before = [count("km_accounts"), count("km_feedback"), count("gnomi_responses"), count("gnomi_events")];
  const r = await mod.handleKm(adminReq("GET"), env, null, "/api/km/admin/cleanup");
  const j = await r.json();
  eq(j.mode, "dry-run");
  eq(j.would_delete.tombstones, 1, "ταφόπετρες:");
  eq(j.would_delete.feedback, 1, "γνώμες:");
  eq(j.would_delete.gnomi_responses, 1, "απαντήσεις:");
  eq([count("km_accounts"), count("km_feedback"), count("gnomi_responses"), count("gnomi_events")], before, "τίποτα δεν σβήστηκε:");
});

await check("χωρίς κλειδί: 404 και καμία διαγραφή", async () => {
  const before = count("km_accounts");
  const r = await mod.handleKm(new Request("https://x/api/km/admin/cleanup", { method: "POST" }), env, null, "/api/km/admin/cleanup");
  eq(r.status, 404); eq(count("km_accounts"), before);
});

await check("η ΔΙΑΓΡΑΦΗ σβήνει ΜΟΝΟ ό,τι πέρασε το ρολόι", async () => {
  const r = await mod.handleKm(adminReq("POST"), env, null, "/api/km/admin/cleanup");
  const j = await r.json();
  eq(j.deleted.tombstones, 1); eq(j.deleted.feedback, 1);
  eq(j.deleted.gnomi_responses, 1); eq(j.deleted.gnomi_events, 1);
});

await check("ο ΖΩΝΤΑΝΟΣ λογαριασμός και τα ΠΡΟΣΦΑΤΑ επέζησαν", async () => {
  const left = db.prepare("SELECT folder_id, deleted FROM km_accounts ORDER BY folder_id").all();
  eq(left.length, 2, "λογαριασμοί:");
  if (!left.some((r) => r.deleted === null)) throw new Error("ο ζωντανός λογαριασμός σβήστηκε!");
  eq(count("km_feedback"), 1); eq(count("gnomi_responses"), 1); eq(count("gnomi_events"), 1);
});

await check("δεύτερη εκτέλεση δεν σβήνει τίποτα άλλο (ιδεμποτικό)", async () => {
  const r = await mod.handleKm(adminReq("POST"), env, null, "/api/km/admin/cleanup");
  const j = await r.json();
  eq([j.deleted.tombstones, j.deleted.feedback, j.deleted.gnomi_responses, j.deleted.gnomi_events], [0, 0, 0, 0]);
});

await check("το όριο ανά εκτέλεση τηρείται και δηλώνεται", async () => {
  for (let i = 0; i < 12; i++) db.prepare("INSERT INTO km_feedback (stars,month) VALUES (1,?)").run(ago(30).slice(0, 7));
  const r = await mod.kmCleanup(env, NOW);
  if (r.feedback > r.batch_limit) throw new Error("σβήστηκαν " + r.feedback + " > όριο " + r.batch_limit);
  if (r.feedback === r.batch_limit && r.more !== true) throw new Error("γέμισε το όριο αλλά δεν δήλωσε more");
});

console.log(failed ? "\nΚΟΚΚΙΝΟ: " + failed + " φρουροί έπεσαν" : "\nΠΡΑΣΙΝΟ: όλοι οι φρουροί πέρασαν");
process.exit(MUTATE ? (failed ? 0 : 1) : (failed ? 1 : 0));
