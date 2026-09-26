// Η.11β · ΑΝΑΣΤΟΛΗ ΔΙΑΓΡΑΦΗΣ 72 ΩΡΩΝ — 15/9/2026
//   node --experimental-sqlite tests/h11b.test.mjs
//   node --experimental-sqlite tests/h11b.test.mjs --mutate   (ΠΡΕΠΕΙ να κοκκινίσει)
//
// 🔴 Η ΑΠΟΔΕΙΞΗ ΔΕΝ ΕΙΝΑΙ Η ΑΠΑΝΤΗΣΗ ΤΟΥ ENDPOINT. Κάθε έλεγχος διαβάζει τη
//    ΒΑΣΗ και το R2 από κάτω — όχι το «ok» που τύπωσε αυτός που έκανε τη δουλειά
//    (κανόνας 29/8: ο έλεγχος στο τεκμήριο).

import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync } from "node:fs";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const MUTATE = process.argv.includes("--mutate");
let src = readFileSync("src/km.js", "utf8");
const MUTATIONS = [
  // 1. Ο φραγμός της διπλής κλήσης φεύγει → το αίτημα μετακινεί τη λήξη προς τα
  //    εμπρός, δηλαδή ο κλέφτης πατάει «διαγραφή» κάθε ώρα και το παράθυρο δεν
  //    κλείνει ποτέ.
  ["WHERE folder_id = ? AND delete_requested_at IS NULL AND deleted IS NULL",
   "WHERE folder_id = ? AND deleted IS NULL"],
  // 2. Το πάγωμα φεύγει → ο κλέφτης συνεχίζει να διαβάζει τον φάκελο επί 72 ώρες.
  ['  if (acc.delete_due_at && !(opts && opts.allowPending)) {\n    return { err: json({ ok: false, error: "pending_delete", due_at: acc.delete_due_at }, 423) };\n  }', ""],
  // 3. Η ακύρωση αρχίζει να απαιτεί ενεργή συσκευή → μόνο ο κλέφτης μπορεί να
  //    ακυρώσει. Αυτή ΑΚΡΙΒΩΣ είναι η αστοχία που γεννά το Η.11β.
  ['const a = await authed(request, env, { allowPending: true });\n  if (a.err) return a.err;\n  if (!a.acc.delete_due_at) {',
   'const a = await authed(request, env, { allowPending: true });\n  if (a.err) return a.err;\n  if (a.acc.active_device_id !== a.id.device) return json({ ok: false, error: "not_active_device" }, 409);\n  if (!a.acc.delete_due_at) {'],
];
if (MUTATE) {
  for (const [a, b] of MUTATIONS) {
    if (!src.includes(a)) { console.log("Η ΜΕΤΑΛΛΑΞΗ ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ:\n" + a.slice(0, 90)); process.exit(1); }
    src = src.replace(a, b);
  }
}
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));

// ── βάση + R2 ──────────────────────────────────────────────────────────────
const db = new DatabaseSync(":memory:");
for (const f of ["km.sql", "km_h13.sql", "km_v54.sql", "km_mail.sql", "km_h11b.sql", "km_ref.sql", "km_ref2.sql", "km_verify.sql", "km_support.sql"]) {
  // ⚠ Οι γραμμές σχολίων φεύγουν ΠΡΙΝ το σπάσιμο σε εντολές. Πρώτη γραφή:
  // split(";") και μετά «πέτα ό,τι αρχίζει με --» — που πετούσε ΟΛΟΚΛΗΡΟ το
  // πρώτο κομμάτι, σχόλιο ΚΑΙ το CREATE TABLE μαζί («no such table»).
  const sql = readFileSync("schema/" + f, "utf8")
    .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  for (const s of sql.split(";")) {
    const t = s.trim();
    if (!t) continue;
    try { db.exec(t + ";"); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
  }
}
const stmt = (sql, args) => {
  const p = db.prepare(sql);
  return {
    async first() { return p.get(...args) ?? null; },
    async run() { const r = p.run(...args); return { meta: { changes: Number(r.changes) } }; },
    async all() { return { results: p.all(...args) }; },
  };
};
const DB = {
  prepare: (sql) => ({ bind: (...a) => stmt(sql, a), ...stmt(sql, []) }),
  async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; },
};

const r2 = new Map();
const FOLDERS = {
  async put(k, v) { r2.set(k, Buffer.from(v)); },
  async get(k) { return r2.has(k) ? { arrayBuffer: async () => r2.get(k) } : null; },
  async delete(k) { for (const key of (Array.isArray(k) ? k : [k])) r2.delete(key); },
  async list({ prefix, limit }) {
    const objects = [...r2.keys()].filter((k) => k.startsWith(prefix))
      .slice(0, limit || 1000).map((k) => ({ key: k, size: r2.get(k).length }));
    return { objects, truncated: false, cursor: null };
  },
};

let sent = [];
const EMAIL = { send: async (m) => { sent.push(m); return { messageId: "mid-" + (sent.length) }; } };
const env = { DB, FOLDERS, EMAIL, KM_ADMIN_KEY: "s3cret" };

// ── βοηθητικά ──────────────────────────────────────────────────────────────
const hex = (n) => [...webcrypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
const J = { "Content-Type": "application/json" };
const H = (id, dev) => ({ "X-Km-Folder": id.folder, "X-Km-Auth": id.auth, "X-Km-Device": dev || id.device });
const call = (path, opts) => mod.handleKm(new Request("https://x" + path, opts), env, null, path.split("?")[0]);
const post = (path, headers, body) =>
  call(path, { method: "POST", headers: Object.assign({}, J, headers || {}), body: JSON.stringify(body || {}) });

async function account() {
  const id = { folder: hex(32), auth: hex(32), device: "km_" + hex(6), email: "u" + hex(4) + "@example.com" };
  const r = await post("/api/km/register", H(id), { email: id.email, email_token: await mod.issueEmailToken(env, id.email), source: "store:play", ref: "REF7" });
  if (r.status !== 200) throw new Error("register " + r.status + " " + await r.text());
  // πραγματικό περιεχόμενο: διαγραφή άδειου φακέλου δεν αποδεικνύει τίποτα
  await call("/api/km/folder", { method: "PUT", headers: H(id), body: Buffer.alloc(400, 7) });
  await call("/api/km/photo?id=inv1", { method: "PUT", headers: H(id), body: Buffer.alloc(300, 7) });
  return id;
}
const row = (folder) => db.prepare("SELECT * FROM km_accounts WHERE folder_id = ?").get(folder);
const r2count = (folder) => [...r2.keys()].filter((k) => k.startsWith(folder + "/")).length;
const mails = (kind) => db.prepare("SELECT COUNT(*) AS n FROM km_mail_log WHERE kind = ? AND ok = 1").get(kind).n;
const plus = (iso, h) => new Date(Date.parse(iso) + h * 3600 * 1000).toISOString();

let failed = 0;
const check = async (n, f) => { try { await f(); console.log("  ✔ " + n); } catch (e) { failed++; console.log("  ✘ " + n + " — " + e.message); } };
const eq = (g, w, what) => { if (JSON.stringify(g) !== JSON.stringify(w)) throw new Error((what || "") + " πήρα " + JSON.stringify(g) + " περίμενα " + JSON.stringify(w)); };

console.log(MUTATE ? "ΜΕΤΑΛΛΑΓΜΕΝΟ — ΠΡΕΠΕΙ ΝΑ ΚΟΚΚΙΝΙΣΕΙ\n" : "ΚΑΝΟΝΙΚΟ\n");

// ── 1 ──────────────────────────────────────────────────────────────────────
await check("Η11β-1 · 🔴 ΤΟ ΑΙΤΗΜΑ ΔΕΝ ΣΒΗΝΕΙ ΤΙΠΟΤΑ — και η λήξη είναι ΑΚΡΙΒΩΣ +72h", async () => {
  const id = await account();
  const before = r2count(id.folder);
  if (before !== 2) throw new Error("στήσιμο: R2 " + before);
  const r = await post("/api/km/delete", H(id), { confirm: "ΔΙΑΓΡΑΦΗ" });
  eq(r.status, 200, "status:");
  const a = row(id.folder);
  eq(r2count(id.folder), before, "R2 μετά το αίτημα:");
  eq(a.deleted, null, "deleted:");
  if (!a.delete_requested_at || !a.delete_due_at) throw new Error("δεν γράφτηκαν οι ημερομηνίες");
  eq(a.delete_due_at, plus(a.delete_requested_at, 72), "λήξη:");
  if (a.email !== id.email) throw new Error("το email σβήστηκε — χρειάζεται για την ειδοποίηση λήξης");
  eq(a.folder_bytes > 0, true, "τα bytes μηδενίστηκαν;");
});

// ── 2 ──────────────────────────────────────────────────────────────────────
await check("Η11β-2 · 🔴 Ο ΛΟΓΑΡΙΑΣΜΟΣ ΠΑΓΩΝΕΙ ΑΜΕΣΩΣ (423) — ο κλέφτης ΧΑΝΕΙ πρόσβαση, δεν κερδίζει 72 ώρες", async () => {
  const id = await account();
  await post("/api/km/delete", H(id), { confirm: "ΔΙΑΓΡΑΦΗ" });
  for (const [p, o] of [
    ["/api/km/status", { headers: H(id) }],
    ["/api/km/folder", { headers: H(id) }],
    ["/api/km/photos", { headers: H(id) }],
    ["/api/km/activate", { method: "POST", headers: H(id) }],
  ]) {
    const r = await call(p, o);
    eq(r.status, 423, p + ":");
    eq((await r.json()).error, "pending_delete", p + " σφάλμα:");
  }
});

// ── 3 + 6 ──────────────────────────────────────────────────────────────────
await check("Η11β-3 · η ακύρωση με τις σωστές 12 λέξεις: πεδία καθαρά, φάκελος ΑΘΙΚΤΟΣ, ενεργή η συσκευή που ακύρωσε", async () => {
  const id = await account();
  await post("/api/km/delete", H(id), { confirm: "ΔΙΑΓΡΑΦΗ" });
  const other = "km_" + hex(6);
  const r = await post("/api/km/delete/cancel", H(id, other));
  eq(r.status, 200, "status:");
  const a = row(id.folder);
  eq([a.delete_requested_at, a.delete_due_at], [null, null], "πεδία:");
  eq(r2count(id.folder), 2, "R2:");
  eq(a.active_device_id, other, "ενεργή συσκευή:");
  eq((await call("/api/km/status", { headers: H(id, other) })).status, 200, "ο λογαριασμός ξαναδουλεύει:");
});

// ── 4 ──────────────────────────────────────────────────────────────────────
await check("Η11β-4 · λάθος 12 λέξεις: η ακύρωση απορρίπτεται και η εκκρεμότητα ΜΕΝΕΙ", async () => {
  const id = await account();
  await post("/api/km/delete", H(id), { confirm: "ΔΙΑΓΡΑΦΗ" });
  const due = row(id.folder).delete_due_at;
  const r = await post("/api/km/delete/cancel", { "X-Km-Folder": id.folder, "X-Km-Auth": hex(32), "X-Km-Device": "km_" + hex(6) });
  eq(r.status, 403, "status:");
  eq(row(id.folder).delete_due_at, due, "η λήξη:");
});

// ── 5 ──────────────────────────────────────────────────────────────────────
await check("Η11β-5 · 🔴 Η ΑΚΥΡΩΣΗ ΔΟΥΛΕΥΕΙ ΧΩΡΙΣ ΕΝΕΡΓΗ ΣΥΣΚΕΥΗ — ΤΟ ΙΔΙΟ ΤΟ ΝΟΗΜΑ ΤΟΥ Η.11β", async () => {
  const id = await account();          // ενεργή = το (κλεμμένο) κινητό
  await post("/api/km/delete", H(id), { confirm: "ΔΙΑΓΡΑΦΗ" });
  // ο ιδιοκτήτης, από εντελώς ξένο browser, με μόνο εφόδιο τις 12 λέξεις
  const r = await post("/api/km/delete/cancel", H(id, "km_" + hex(6)));
  eq(r.status, 200, "status:");
  eq(row(id.folder).delete_due_at, null, "η εκκρεμότητα:");
});

// ── 8 ──────────────────────────────────────────────────────────────────────
await check("Η11β-8 · μετά την ακύρωση ο κλέφτης παίρνει 409 στη δεύτερη προσπάθεια διαγραφής", async () => {
  const id = await account();
  const thief = id.device;
  await post("/api/km/delete", H(id, thief), { confirm: "ΔΙΑΓΡΑΦΗ" });
  const owner = "km_" + hex(6);
  await post("/api/km/delete/cancel", H(id, owner));
  const r = await post("/api/km/delete", H(id, thief), { confirm: "ΔΙΑΓΡΑΦΗ" });
  eq(r.status, 409, "status:");
  eq((await r.json()).error, "not_active_device", "σφάλμα:");
  eq(row(id.folder).delete_due_at, null, "καμία νέα εκκρεμότητα:");
});

// ── φρουρός διπλής κλήσης ──────────────────────────────────────────────────
await check("Η11β-9 · 🔴 ΔΕΥΤΕΡΟ ΑΙΤΗΜΑ ΔΕΝ ΜΕΤΑΚΙΝΕΙ ΤΗ ΛΗΞΗ — αλλιώς το παράθυρο δεν κλείνει ποτέ", async () => {
  const id = await account();
  await post("/api/km/delete", H(id), { confirm: "ΔΙΑΓΡΑΦΗ" });
  const due = row(id.folder).delete_due_at;
  await new Promise((r) => setTimeout(r, 5));
  const r = await post("/api/km/delete", H(id), { confirm: "ΔΙΑΓΡΑΦΗ" });
  // Το 423 του παγώματος είναι εξίσου αποδεκτή απάντηση: και τα δύο σημαίνουν
  // «δεν ξαναγράφεται». Αυτό που ΔΕΝ επιτρέπεται είναι νέα, μεταγενέστερη λήξη.
  if (r.status !== 200 && r.status !== 423) throw new Error("status " + r.status);
  eq(row(id.folder).delete_due_at, due, "η λήξη:");
});

// ── 7 ──────────────────────────────────────────────────────────────────────
await check("Η11β-7 · στη λήξη σβήνονται όλα, ταφόπετρα σωστή, μηδέν ορφανά — και ΤΙΠΟΤΑ πριν την ώρα του", async () => {
  const id = await account();
  await post("/api/km/delete", H(id), { confirm: "ΔΙΑΓΡΑΦΗ" });
  const a0 = row(id.folder);

  // μία ώρα ΠΡΙΝ τη λήξη: δεν αγγίζεται τίποτα
  await mod.kmDeleteDue(env, plus(a0.delete_due_at, -1));
  eq(r2count(id.folder), 2, "R2 πριν την ώρα του:");
  eq(row(id.folder).deleted, null, "deleted πριν την ώρα του:");

  // ένα λεπτό ΜΕΤΑ.
  // ⚠ ΔΕΝ μετριέται ΣΥΝΟΛΟ. Τα προηγούμενα σενάρια άφησαν κι άλλους εκκρεμείς
  // με σχεδόν ίδια λήξη (όλοι φτιάχτηκαν μέσα σε δευτερόλεπτα), οπότε η ίδια
  // εκτέλεση τους σβήνει μαζί. Η πρώτη γραφή περίμενε [1,1] και κοκκίνιζε
  // χωρίς να φταίει ο κώδικας — η μέτρηση ήταν λάθος, όχι η πράξη.
  const res = await mod.kmDeleteDue(env, plus(a0.delete_due_at, 0.02));
  eq(res.due, res.wiped, "όσοι έληξαν, τόσοι σβήστηκαν:");
  if (res.due < 1) throw new Error("κανένας ληγμένος δεν βρέθηκε");
  const a = row(id.folder);
  eq(r2count(id.folder), 0, "R2:");
  eq(a.email, "", "email:");
  eq(a.auth_hash, "", "auth_hash:");
  eq([a.delete_requested_at, a.delete_due_at], [null, null], "τα πεδία της αναστολής καθάρισαν:");
  if (!a.deleted) throw new Error("λείπει η ημερομηνία διαγραφής");
  eq([a.source, a.ref], ["store:play", "REF7"], "η ταφόπετρα κρατάει στατιστικά:");
  eq(db.prepare("SELECT COUNT(*) AS n FROM km_device_links WHERE folder_id = ?").get(id.folder).n, 0, "ορφανά links:");
  eq(db.prepare("SELECT COUNT(*) AS n FROM km_devices WHERE folder_id = ?").get(id.folder).n, 0, "ορφανές συσκευές:");
  eq((await call("/api/km/status", { headers: H(id) })).status, 410, "η πόρτα μετά:");
});

// ── 9 · τα τρία email ──────────────────────────────────────────────────────
await check("Η11β-10 · και τα ΤΡΙΑ email φεύγουν και καταγράφονται — καμία διεύθυνση αποθηκευμένη", async () => {
  if (mails("delete_requested") < 1) throw new Error("κανένα email αιτήματος");
  if (mails("delete_cancelled") < 1) throw new Error("κανένα email ακύρωσης");
  if (mails("deleted") < 1) throw new Error("κανένα email ολοκλήρωσης");
  const dump = JSON.stringify(db.prepare("SELECT * FROM km_mail_log").all());
  if (/@example\.com/.test(dump)) throw new Error("βρέθηκε διεύθυνση παραλήπτη στο αρχείο καταγραφής");
});

await check("Η11β-11 · 🔴 ΤΟ EMAIL ΑΙΤΗΜΑΤΟΣ ΔΙΝΕΙ ΤΗ ΣΕΛΙΔΑ ΑΚΥΡΩΣΗΣ, ΤΗΝ ΩΡΑ ΛΗΞΗΣ — ΚΑΙ ΚΑΝΕΝΑΝ ΣΥΝΔΕΣΜΟ", async () => {
  const m = sent.filter((x) => /Ζητήθηκε διαγραφή/.test(x.subject)).pop();
  if (!m) throw new Error("δεν στάλθηκε email αιτήματος");
  if (!/akyrosi/.test(m.text)) throw new Error("λείπει η σελίδα ακύρωσης");
  if (!/12 λέξεις/.test(m.text)) throw new Error("δεν λέει τις 12 λέξεις");
  if (!/support@fastwrite\.tech/.test(m.text)) throw new Error("λείπει το support");
  // Ο σύνδεσμος ζει μέσα στο ίδιο κλεμμένο κινητό — γι' αυτό ΔΕΝ μπαίνει.
  if (/https?:\/\//.test(m.text) || /<a\s/i.test(m.html)) throw new Error("βρέθηκε σύνδεσμος ενέργειας");
});

await check("Η11β-12 · το email ακύρωσης ΣΠΡΩΧΝΕΙ σε αλλαγή 12 λέξεων — η ακύρωση δεν διώχνει μόνη της τον κλέφτη", async () => {
  const m = sent.filter((x) => /ακυρώθηκε/.test(x.subject)).pop();
  if (!m) throw new Error("δεν στάλθηκε email ακύρωσης");
  if (!/άλλαξε/i.test(m.text) || !/12 λέξεις/.test(m.text)) throw new Error("δεν προτρέπει αλλαγή λέξεων: " + m.text.slice(0, 160));
});

// ── admin ──────────────────────────────────────────────────────────────────
await check("Η11β-13 · /admin/due: χωρίς κλειδί 404, με κλειδί δείχνει τους εκκρεμείς ΧΩΡΙΣ email", async () => {
  const id = await account();
  await post("/api/km/delete", H(id), { confirm: "ΔΙΑΓΡΑΦΗ" });
  eq((await call("/api/km/admin/due", {})).status, 404, "χωρίς κλειδί:");
  const r = await call("/api/km/admin/due?k=s3cret", {});
  eq(r.status, 200, "με κλειδί:");
  const j = await r.json();
  if (!j.pending.some((p) => p.folder_id === id.folder)) throw new Error("δεν φαίνεται ο εκκρεμής");
  if (JSON.stringify(j).includes("@example.com")) throw new Error("η σελίδα δείχνει διευθύνσεις");
});

// ── Ο ΦΡΟΥΡΟΣ ΠΟΥ ΕΛΕΙΠΕ ─────────────────────────────────────────────────────
// 🔴 ΓΡΑΦΤΗΚΕ ΕΠΕΙΔΗ ΤΟ ΣΥΝΟΛΟ ΗΤΑΝ ΠΡΑΣΙΝΟ ΕΝΩ Η ΣΕΛΙΔΑ ΗΤΑΝ ΑΧΡΗΣΤΗ.
// 15/9/2026: η σελίδα ακύρωσης ζούσε στο /kostometro/akyrosi/, μέσα στο scope
// του service worker. Ο sw έπιανε την πλοήγηση, δεν την έβρισκε στη μνήμη, και
// σέρβιρε το /kostometro/index.html — την ΕΦΑΡΜΟΓΗ — χωρίς να ρωτήσει το
// δίκτυο. Ολα τα τεστ του server περνούσαν· η μοναδική πόρτα διάσωσης ήταν
// φραγμένη ακριβώς για όσους την χρειάζονται. Το βρήκε ο Stavros στον
// υπολογιστή του, όχι το τεστ (κανόνας 5/9: όταν ο Stavros βλέπει πρόβλημα
// και το τεστ είναι πράσινο, ΤΟ ΤΕΣΤ είναι λάθος).
await check("Η11β-14 · 🔴 Η ΠΟΡΤΑ ΑΚΥΡΩΣΗΣ ΖΕΙ ΕΞΩ ΑΠΟ ΤΟ SCOPE ΤΟΥ SERVICE WORKER", async () => {
  const page = "/" + (src.match(/const CANCEL_PAGE = "fastwrite\.tech([^"]*)"/) || [])[1].replace(/^\//, "");
  if (page.indexOf("/kostometro/") === 0) {
    throw new Error("η σελίδα ακύρωσης δείχνει στο " + page + " — ΜΕΣΑ στο scope του sw, ο sw θα τη φάει");
  }
  const file = "site" + (page.endsWith("/") ? page : page + "/") + "index.html";
  if (!existsSync(file)) throw new Error("το CANCEL_PAGE δείχνει στο " + page + " αλλά δεν υπάρχει " + file);
  const html = readFileSync(file, "utf8");
  if (!/kmCheckWords/.test(html) || !/delete\/cancel/.test(html)) {
    throw new Error("το " + file + " δεν είναι η σελίδα ακύρωσης — λείπει ο έλεγχος λέξεων ή η κλήση");
  }
  // Και η παλιά διεύθυνση, που ζει μέσα σε ήδη σταλμένα email, πρέπει να
  // εξαιρείται ΡΗΤΑ μέσα στον ίδιο τον sw.
  const sw = readFileSync("site/kostometro/sw.js", "utf8");
  if (!/indexOf\('\/kostometro\/akyrosi'\) === 0\) \{ return; \}/.test(sw)) {
    throw new Error("ο sw δεν εξαιρεί ρητά την παλιά διεύθυνση /kostometro/akyrosi");
  }
  if (/'\/kostometro\/akyrosi/.test(sw.slice(sw.indexOf("var SHELL"), sw.indexOf("var FRESH")))) {
    throw new Error("η σελίδα ακύρωσης ξαναμπήκε στο SHELL — θα σερβίρεται από μνήμη");
  }
});

console.log(failed ? "\nΚΟΚΚΙΝΟ: " + failed + " φρουροί έπεσαν" : "\nΠΡΑΣΙΝΟ: όλοι οι φρουροί πέρασαν");
process.exit(MUTATE ? (failed ? 0 : 1) : (failed ? 1 : 0));
