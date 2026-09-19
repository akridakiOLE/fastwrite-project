// ΣΥΣΤΑΣΕΙΣ — ο κωδικός ανήκει στον ΛΟΓΑΡΙΑΣΜΟ, όχι στη συσκευή (17/9/2026)
//   node --experimental-sqlite tests/ref.test.mjs
//   node --experimental-sqlite tests/ref.test.mjs --mutate   (ΠΡΕΠΕΙ να κοκκινίσει)
//
// 🔴 Ο ΦΡΟΥΡΟΣ ΠΟΥ ΜΕΤΡΑΕΙ (Σ-2): ΔΥΟ ΣΥΣΚΕΥΕΣ ΤΟΥ ΙΔΙΟΥ ΛΟΓΑΡΙΑΣΜΟΥ ΠΑΙΡΝΟΥΝ
//    ΤΟΝ ΙΔΙΟ ΚΩΔΙΚΟ. Αυτό ακριβώς δεν ίσχυε ως τις 17/9: ο κωδικός έβγαινε από
//    το localStorage της συσκευής, άρα αλλαγή κινητού μηδένιζε τις συστάσεις
//    ενός χρήστη που είχε ήδη καλέσει επιχειρήσεις. Αν αυτό το τεστ πρασινίσει
//    ενώ η συμπεριφορά γύρισε πίσω, το τεστ είναι άχρηστο — γι' αυτό υπάρχει η
//    μετάλλαξη Μ5.

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const MUTATE = process.argv.some((a) => a.startsWith("--mutate"));
// ⚠ ΜΙΑ ΜΕΤΑΛΛΑΞΗ ΤΗ ΦΟΡΑ (--mutate=3). Με όλες μαζί, δύο μεταλλάξεις μπορούν
//   να ΑΛΛΗΛΟΑΚΥΡΩΘΟΥΝ και το τεστ να πρασινίσει ψευδώς: μετρήθηκε 17/9/2026
//   στο Σ-7 (η Μ3 έσβηνε την κανονικοποίηση, η Μ4 ανέβαζε τον μετρητή, και τα
//   δύο λάθη μαζί έδιναν το σωστό νούμερο). Η απόδειξη είναι ανά μετάλλαξη.
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let src = readFileSync("src/km.js", "utf8");
const MUTATIONS = [
  // Μ1 · ο μετρητής εγγραφών αρχίζει να μετράει και τους διαγραμμένους.
  ['const signups = await n("SELECT COUNT(*) AS n FROM km_accounts WHERE ref = ? AND deleted IS NULL");',
   'const signups = await n("SELECT COUNT(*) AS n FROM km_accounts WHERE ref = ?");'],
  // Μ2 · 🔴 ΤΟ ΣΙΩΠΗΛΟ ΨΕΜΑ: το «—» γίνεται «0» πριν υπάρξει PRO.
  //      «0 ενεργές» διαβάζεται «κανείς δεν μπήκε». Η αλήθεια είναι «όχι ακόμα».
  /* ⚠ ΑΓΚΥΡΑ ΣΤΗΝ ΙΔΙΑ ΤΗΝ ΕΚΦΡΑΣΗ, ΟΧΙ ΣΤΟ ΤΙ ΑΚΟΛΟΥΘΕΙ: η πρώτη γραφή
     έδενε με το «return json({...}) από κάτω» και έχασε τον στόχο της μόλις
     μπήκε η λίστα ανάμεσα (19/9/2026). Μια μετάλλαξη που δεν βρίσκει στόχο
     παύει σιωπηλά να αποδεικνύει — ο φρουρός «ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ» το έπιασε. */
  ['  const active = live\n    ? await n("SELECT COUNT(*) AS n FROM km_accounts WHERE ref = ? AND deleted IS NULL AND plan IS NOT NULL")\n    : null;',
   '  const active = live\n    ? await n("SELECT COUNT(*) AS n FROM km_accounts WHERE ref = ? AND deleted IS NULL AND plan IS NOT NULL")\n    : 0;'],
  // Μ3 · φεύγει η κανονικοποίηση — ο ίδιος σύνδεσμος μετράει σε δύο κουβάδες.
  ['function normRef(v) { return (clean(v, 40) || "").toUpperCase() || null; }',
   'function normRef(v) { return clean(v, 40) || null; }'],
  // Μ4 · φεύγει το de-duplication των ανοιγμάτων — το ίδιο κινητό μετράει άπειρες φορές.
  ['  ).bind(code, inst, now(), (request.cf && request.cf.country) || null).run().catch(() => null);',
   '  ).bind(code, inst + Math.random(), now(), (request.cf && request.cf.country) || null).run().catch(() => null);'],
  // Μ5 · 🔴 Η ΠΑΛΙΝΔΡΟΜΗΣΗ ΠΟΥ ΔΙΟΡΘΩΣΑΜΕ: ο κωδικός ξαναγίνεται της ΣΥΣΚΕΥΗΣ.
  ['const code = await ensureRefCode(env, a.id.folder, a.acc.ref_code);',
   'const code = await refCodeFor(a.id.device, 0);'],
  // Μ6 · 🔴 ΔΙΑΡΡΟΗ: το email φεύγει από τη βάση ΧΩΡΙΣ συγκατάθεση.
  ['CASE WHEN ref_share = 1 THEN email ELSE NULL END AS email', 'email AS email'],
  // Μ7 · γράφεται συγκατάθεση σε λογαριασμό που δεν ήρθε καν από σύσταση.
  ['(normRef(b.ref) && b.ref_share) ? 1 : 0', 'b.ref_share ? 1 : 0'],
  // Μ8 · 🔴 Η ΩΡΑ ΦΕΥΓΕΙ ΚΑΙ ΣΕ ΑΝΩΝΥΜΗ ΓΡΑΜΜΗ — ταυτοποιεί όποιον είπε ΟΧΙ.
  ['CASE WHEN ref_share = 1 THEN created ELSE substr(created, 1, 10) END AS pote',
   'created AS pote'],
];
if (MUTATE) MUTATIONS.forEach(([a, b], i) => {
  if (ONLY !== null && ONLY !== i + 1) return;
  if (!src.includes(a)) { console.log("Η ΜΕΤΑΛΛΑΞΗ Μ" + (i + 1) + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ:\n" + a.slice(0, 90)); process.exit(1); }
  src = src.replace(a, b);
});
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));

const db = new DatabaseSync(":memory:");
for (const f of ["km.sql", "km_h13.sql", "km_v54.sql", "km_mail.sql", "km_feedback.sql", "km_h11b.sql", "km_ref.sql", "km_ref2.sql"]) {
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
const env = { DB, FOLDERS, EMAIL: { send: async () => ({ messageId: "m" }) }, KM_ADMIN_KEY: "s3cret" };

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
const refOf = async (id) => (await call("/api/km/ref", { headers: H(id) })).json();

let failed = 0;
const check = async (n, f) => { try { await f(); console.log("  ✔ " + n); } catch (e) { failed++; console.log("  ✘ " + n + " — " + e.message); } };
const eq = (g, w, what) => { if (JSON.stringify(g) !== JSON.stringify(w)) throw new Error((what || "") + " πήρα " + JSON.stringify(g) + " περίμενα " + JSON.stringify(w)); };

console.log(MUTATE ? "ΜΕΤΑΛΛΑΓΜΕΝΟ" + (ONLY ? " Μ" + ONLY : " (ΟΛΕΣ)") + " — ΠΡΕΠΕΙ ΝΑ ΚΟΚΚΙΝΙΣΕΙ\n" : "ΚΑΝΟΝΙΚΟ\n");

const A = await account({ source: "link" });
const jA = await refOf(A);

await check("Σ-1 · ο κωδικός γεννιέται με τον λογαριασμό: 10 χαρακτήρες, χωρίς I/L/O/U/0/1", async () => {
  if (!jA.ok) throw new Error("ok=false");
  if (!/^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{10}$/.test(jA.code)) throw new Error("κωδικός: " + jA.code);
});

await check("Σ-2 · 🔴 ΑΛΛΗ ΣΥΣΚΕΥΗ, ΙΔΙΟΣ ΛΟΓΑΡΙΑΣΜΟΣ → ΙΔΙΟΣ ΚΩΔΙΚΟΣ (το σφάλμα της 17/9)", async () => {
  const other = { folder: A.folder, auth: A.auth, device: "km_" + hex(6) };
  eq((await refOf(other)).code, jA.code, "νέο κινητό:");
  eq((await refOf(A)).code, jA.code, "δεύτερη κλήση:");
});

await check("Σ-3 · δύο διαφορετικοί λογαριασμοί → δύο διαφορετικοί κωδικοί", async () => {
  const B = await account({ source: "link" });
  const jB = await refOf(B);
  if (jB.code === jA.code) throw new Error("ίδιος κωδικός σε δύο λογαριασμούς");
});

await check("Σ-4 · παλιός λογαριασμός ΧΩΡΙΣ κωδικό τον αποκτά στην πρώτη κλήση και τον ΚΡΑΤΑΕΙ", async () => {
  const old = await account({ source: "link" });
  db.prepare("UPDATE km_accounts SET ref_code = NULL WHERE folder_id = ?").run(old.folder);
  const first = (await refOf(old)).code;
  if (!first) throw new Error("δεν δόθηκε κωδικός");
  eq((await refOf(old)).code, first, "δεύτερη κλήση:");
  const row = db.prepare("SELECT ref_code FROM km_accounts WHERE folder_id = ?").get(old.folder);
  eq(row.ref_code, first, "στη βάση:");
});

await check("Σ-5 · εγγραφές: μετράει μόνο ΖΩΝΤΑΝΟΥΣ που ήρθαν από ΤΟΝ ΔΙΚΟ ΜΟΥ κωδικό", async () => {
  await account({ source: "link", ref: jA.code });
  await account({ source: "link", ref: jA.code });
  await account({ source: "link", ref: "AΛΛΟΣ" });
  const dead = await account({ source: "link", ref: jA.code });
  await post("/api/km/delete", H(dead), { confirm: "ΔΙΑΓΡΑΦΗ" });
  await mod.kmDeleteDue(env, "2030-01-01T00:00:00Z");
  eq((await refOf(A)).signups, 2, "εγγραφές:");
});

await check("Σ-6 · ανοίγματα: η ΙΔΙΑ συσκευή μετριέται ΜΙΑ φορά, όσες κι αν ανοίξει", async () => {
  eq((await refOf(A)).opened, 0, "στην αρχή:");
  await post("/api/km/ref/hit", {}, { ref: jA.code, install_id: "km_visitor1" });
  await post("/api/km/ref/hit", {}, { ref: jA.code, install_id: "km_visitor1" });
  await post("/api/km/ref/hit", {}, { ref: jA.code, install_id: "km_visitor1" });
  eq((await refOf(A)).opened, 1, "μετά από 3 ανοίγματα του ίδιου:");
  await post("/api/km/ref/hit", {}, { ref: jA.code, install_id: "km_visitor2" });
  eq((await refOf(A)).opened, 2, "με δεύτερο επισκέπτη:");
});

await check("Σ-7 · πεζά στον σύνδεσμο μετράνε το ίδιο (κανονικοποίηση)", async () => {
  await post("/api/km/ref/hit", {}, { ref: jA.code.toLowerCase(), install_id: "km_visitor3" });
  eq((await refOf(A)).opened, 3, "με πεζό ref:");
  await account({ source: "link", ref: jA.code.toLowerCase() });
  eq((await refOf(A)).signups, 3, "εγγραφή με πεζό ref:");
});

await check("Σ-8 · 🔴 ΧΩΡΙΣ PRO το «ενεργές» είναι null (= «—»), ΠΟΤΕ 0", async () => {
  const j = await refOf(A);
  eq(j.pro_live, false, "pro_live:");
  eq(j.active, null, "ενεργές:");
});

await check("Σ-9 · με PRO ζωντανό μετράει ΜΟΝΟ όσους πληρώνουν", async () => {
  env.PRO_LIVE = "1";
  const mine = db.prepare("SELECT folder_id FROM km_accounts WHERE ref = ? AND deleted IS NULL").all(jA.code);
  db.prepare("UPDATE km_accounts SET plan = 'pro' WHERE folder_id = ?").run(mine[0].folder_id);
  const j = await refOf(A);
  eq(j.pro_live, true, "pro_live:");
  eq(j.active, 1, "ενεργές:");
  eq(j.signups, 3, "εγγραφές αμετάβλητες:");
  delete env.PRO_LIVE;
});

await check("Σ-10 · σκουπίδια στο /ref/hit → 400, και τίποτα δεν γράφεται", async () => {
  const before = db.prepare("SELECT COUNT(*) AS n FROM km_ref_hits").get().n;
  eq((await post("/api/km/ref/hit", {}, {})).status, 400, "άδειο:");
  eq((await post("/api/km/ref/hit", {}, { ref: "X" })).status, 400, "χωρίς install:");
  eq(db.prepare("SELECT COUNT(*) AS n FROM km_ref_hits").get().n, before, "γραμμές:");
});

await check("Σ-12 · 🔴 ΧΩΡΙΣ ΣΥΓΚΑΤΑΘΕΣΗ ΤΟ EMAIL ΔΕΝ ΦΕΥΓΕΙ ΑΠΟ ΤΗ ΒΑΣΗ", async () => {
  const C = await account({ source: "link" });
  const jc = await refOf(C);
  await account({ source: "link", ref: jc.code });                    // χωρίς ref_share
  await account({ source: "link", ref: jc.code, ref_share: 0 });      // ρητό όχι
  const j = await refOf(C);
  eq(j.list.length, 2, "γραμμές:");
  for (const r of j.list) {
    if (r.email !== null) throw new Error("ΔΙΑΡΡΟΗ email: " + r.email);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.when)) throw new Error("ημερομηνία: " + r.when);
  }
});

await check("Σ-13 · με ρητή συγκατάθεση το email φαίνεται — και ΜΟΝΟ αυτό", async () => {
  const C = await account({ source: "link" });
  const jc = await refOf(C);
  const yes = await account({ source: "link", ref: jc.code, ref_share: 1 });
  await account({ source: "link", ref: jc.code });
  const j = await refOf(C);
  const shown = j.list.filter((r) => r.email);
  eq(shown.length, 1, "πόσα email φαίνονται:");
  eq(shown[0].email, yes.email, "ποιο:");
});

await check("Σ-14 · συγκατάθεση ΧΩΡΙΣ σύσταση δεν γράφεται (σκουπίδι στη βάση)", async () => {
  const solo = await account({ source: "link", ref_share: 1 });
  const row = db.prepare("SELECT ref_share FROM km_accounts WHERE folder_id = ?").get(solo.folder);
  eq(row.ref_share, 0, "ref_share:");
});

await check("Σ-15 · η λίστα δεν δείχνει διαγραμμένους", async () => {
  const C = await account({ source: "link" });
  const jc = await refOf(C);
  const dead = await account({ source: "link", ref: jc.code, ref_share: 1 });
  eq((await refOf(C)).list.length, 1, "πριν:");
  await post("/api/km/delete", H(dead), { confirm: "ΔΙΑΓΡΑΦΗ" });
  await mod.kmDeleteDue(env, "2030-01-01T00:00:00Z");
  eq((await refOf(C)).list.length, 0, "μετά:");
});

await check("Σ-16 · 🔴 Η ΩΡΑ ΦΕΥΓΕΙ ΜΟΝΟ ΜΑΖΙ ΜΕ ΤΟ EMAIL", async () => {
  const C = await account({ source: "link" });
  const jc = await refOf(C);
  await account({ source: "link", ref: jc.code, ref_share: 1 });   // ναι
  await account({ source: "link", ref: jc.code });                 // όχι
  const j = await refOf(C);
  for (const r of j.list) {
    if (r.email) {
      if (r.when.length <= 10) throw new Error("με συγκατάθεση λείπει η ώρα: " + r.when);
    } else {
      if (r.when.length !== 10) throw new Error("ΔΙΑΡΡΟΗ ώρας σε ανώνυμη: " + r.when);
    }
  }
});

await check("Σ-11 · χωρίς ταυτότητα ο κωδικός ΔΕΝ δίνεται", async () => {
  const r = await call("/api/km/ref", { headers: {} });
  if (r.status === 200) throw new Error("έδωσε κωδικό χωρίς ταυτότητα");
});

console.log("\n" + (failed ? "✘ ΑΠΕΤΥΧΑΝ " + failed : "✔ ΟΛΑ ΠΕΡΑΣΑΝ"));
process.exit(MUTATE ? (failed ? 0 : 1) : (failed ? 1 : 0));
