// v118 · KM-OWN-PROOF — «Αλλαγή 12 λέξεων» με ΔΙΠΛΗ απόδειξη, ΚΑΙ από συσκευή εκτός λειτουργίας
//   Brief Γ (Claude outputs\kampania\Brief_Gamma_Chtisimo_07-10-2026.md) · αποφάσεις Stavros 7/10/2026
//   node --experimental-sqlite tests/v118.test.mjs
//   node --experimental-sqlite tests/v118.test.mjs --mutate=N   (exit 0 = η μετάλλαξη ΠΙΑΣΤΗΚΕ)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { webcrypto, createHash } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let src = readFileSync("src/km.js", "utf8");
let js = readFileSync("site/kostometro/app.js", "utf8");
let html = readFileSync("site/kostometro/index.html", "utf8");
const MUT = [
  // Μ1 · 🔴 το reclaim δεν ζητά απόδειξη email (ο κλέφτης με το χαρτί αλλάζει τις λέξεις)
  ["src", "  if (!tok) return json({ ok: false, error: \"email_unverified\" }, 403);\n  const taken", "  const taken"],
  // Μ2 · 🔴 η παλιά αλλαγή χωρίς email ξανανοίγει από το /lock
  ["src", "  if (kind === \"words\" && replace) {\n    return json({ ok: false, error: \"use_reclaim\" }, 403);\n  }", ""],
  // Μ3 · το reclaim δεν κάνει τη συσκευή ενεργή
  ["src", "UPDATE km_accounts SET auth_hash = ?, active_device_id = ?, active_since = ? WHERE folder_id = ?\")\n      .bind(await sha256hex(accountAuth), a.id.device, ts, a.id.folder)", "UPDATE km_accounts SET auth_hash = ? WHERE folder_id = ?\")\n      .bind(await sha256hex(accountAuth), a.id.folder)"],
  // Μ4 · 🔴 οι παλιές κλειδαριές λέξεων ΔΕΝ σβήνουν → ο κλέφτης μένει μέσα
  ["src", "    env.DB.prepare(\"DELETE FROM km_locks WHERE folder_id = ? AND kind = 'words'\").bind(a.id.folder),\n", ""],
  // Μ5 · συσκευή που δεν μπήκε ποτέ παίρνει τον λογαριασμό
  ["src", "  if (!linked) return json({ ok: false, error: \"unknown_device\" }, 403);", ""],
  // Μ6 · 🔴 ο κωδικός «own» πάει σε όποιο email γράψει ο αιτών
  ["src", "    email = normEmail(a.acc.email);\n    if (!email) return json({ ok: false, error: \"no_email\" }, 409);", "    email = normEmail(b.email) || normEmail(a.acc.email);\n    if (!email) return json({ ok: false, error: \"no_email\" }, 409);"],
  // Μ7 · δεν φεύγει ειδοποίηση όταν μπαίνει ΑΛΛΗ συσκευή
  ["src", "  if (acc.active_device_id && acc.active_device_id !== id.device) {\n    fireMail(env, ctx, b.via", "  if (false) {\n    fireMail(env, ctx, b.via"],
  // Μ8 · το token δεν καίγεται — ξαναχρησιμοποιείται
  ["src", "    env.DB.prepare(\"UPDATE km_email_tokens SET used = ? WHERE token_hash = ?\").bind(ts, tok),\n  ]);\n  await touchDevice(env, request, a.id, null);\n  fireMail(env, ctx, \"words\", email);", "  ]);\n  await touchDevice(env, request, a.id, null);\n  fireMail(env, ctx, \"words\", email);"],
  // Μ9 · η εφαρμογή ξαναστέλνει την αλλαγή στο παλιό /lock
  ["js", "        return kmFetch('words/reclaim', {", "        return kmFetch('lock', {"],
  // Μ10 · η συσκευή εκτός λειτουργίας δεν βλέπει ποτέ το «Πάρε πίσω»
  ["js", "    el('ro-reclaim').hidden = !locked;", "    el('ro-reclaim').hidden = true;"],
  // Μ11 · η αλλαγή μένει στις Ρυθμίσεις αντί για το «Οι 12 λέξεις μου»
  ["html", "    <button class=\"btn ghost\" id=\"st-rotate\">Τις είδε κάποιος άλλος; Βγάλε νέες</button>", ""],
];
if (ONLY !== null) {
  const m = MUT[ONLY - 1]; const bag = { src, js, html };
  if (!m || !bag[m[0]].includes(m[1])) { console.log("Η ΜΕΤΑΛΛΑΞΗ Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(1); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ src, js, html } = bag);
}
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
const db = new DatabaseSync(":memory:");
for (const f of ["km.sql", "km_h13.sql", "km_v54.sql", "km_mail.sql", "km_feedback.sql", "km_h11b.sql", "km_ref.sql", "km_ref2.sql", "km_verify.sql", "km_oauth.sql"]) {
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
const sent = [];
const EMAIL = { async send(m) { sent.push(m); return { messageId: "m" + sent.length }; } };
const env = { DB, EMAIL, KM_ADMIN_KEY: "s3cret", GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsec" };
const sha = (x) => createHash("sha256").update(x).digest("hex");
const H = (c) => c.repeat(64);
const FOLDER = H("f"), L1 = H("1"), A1 = H("a"), WR = "e".repeat(120);
const call = (path, body, headers) => mod.handleKm(new Request("https://fastwrite.tech" + path,
  body !== undefined ? { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, headers || {}), body: JSON.stringify(body) }
                     : { headers: headers || {} }), env, null, path.split("?")[0]);
const head = (dev, lock, auth) => ({ "X-Km-Folder": FOLDER, "X-Km-Auth": auth || A1, "X-Km-Device": dev, ...(lock ? { "X-Km-Lock": lock } : {}) });
let failed = 0;
const check = async (n, f) => { try { await f(); console.log("  ✔ " + n); } catch (e) { failed++; console.log("  ✘ " + n + " — " + e.message); } };
const eq = (g, w, what) => { if (JSON.stringify(g) !== JSON.stringify(w)) throw new Error((what || "") + " βρήκα " + JSON.stringify(g) + " περίμενα " + JSON.stringify(w)); };
const ok = (c, what) => { if (!c) throw new Error(what || "ψευδές"); };
console.log(ONLY ? "ΜΕΤΑΛΛΑΓΜΕΝΟ Μ" + ONLY + "\n" : "ΚΑΝΟΝΙΚΟ\n");

// Σενάριο Stavros 7/10: κινητό (phone) = ιδιοκτήτης · tablet = «κλέφτης» που μπήκε με το χαρτί → ενεργό.
function reset() {
  for (const t of ["km_accounts", "km_locks", "km_device_links", "km_devices", "km_email_codes", "km_email_tokens", "km_mail_log", "km_oauth_states"]) db.exec("DELETE FROM " + t);
  db.prepare("INSERT INTO km_accounts (folder_id, auth_hash, email, created, source, active_device_id, active_since) VALUES (?,?,?,?,?,?,?)")
    .run(FOLDER, sha(A1), "owner@x.cy", "2026-10-01T08:00:00.000Z", "direct", "tablet", "2026-10-07T15:00:00.000Z");
  db.prepare("INSERT INTO km_locks (lock_id, folder_id, kind, auth_hash, wrapped_k, created, created_by) VALUES (?,?,?,?,?,?,?)")
    .run(L1, FOLDER, "words", sha(A1), WR, "2026-10-01T08:00:00.000Z", "phone");
  const L = db.prepare("INSERT INTO km_device_links (install_id, folder_id, created, last_seen) VALUES (?,?,?,?)");
  L.run("phone", FOLDER, "2026-10-01T08:00:00.000Z", "2026-10-07T14:00:00.000Z");
  L.run("tablet", FOLDER, "2026-10-07T15:00:00.000Z", "2026-10-07T15:00:00.000Z");
  sent.length = 0;
}
async function ownToken(dev) {
  const r1 = await call("/api/km/email/code", { purpose: "own" }, head(dev, L1));
  eq(r1.status, 200, "email/code own:");
  const code = /: (\d{6})\./.exec(sent[sent.length - 1].text)[1];
  const r2 = await call("/api/km/email/verify", { purpose: "own", code }, head(dev, L1));
  eq(r2.status, 200, "email/verify own:");
  return (await r2.json()).email_token;
}
const NEW = { lock_id: H("2"), auth_token: H("b"), wrapped_k: "d".repeat(120), account_auth: H("b") };

await check("R-1 · 🔴 (α) το κινητό ΕΚΤΟΣ ΛΕΙΤΟΥΡΓΙΑΣ παίρνει πίσω τον λογαριασμό ΧΩΡΙΣ να βάλει πρώτα τις λέξεις — ο κλέφτης βγαίνει", async () => {
  reset();
  const tok = await ownToken("phone");
  const r = await call("/api/km/words/reclaim", { ...NEW, email_token: tok }, head("phone", L1));
  eq(r.status, 200, "reclaim:");
  const acc = db.prepare("SELECT active_device_id, auth_hash FROM km_accounts").get();
  eq(acc.active_device_id, "phone", "ενεργή:");
  eq(db.prepare("SELECT lock_id FROM km_locks WHERE kind='words'").all().map((x) => x.lock_id), [H("2")], "κλειδαριές λέξεων:");
  const t = await call("/api/km/status", undefined, head("tablet", L1));
  eq(t.status, 403, "ο κλέφτης με την παλιά κλειδαριά:");
  const n = await call("/api/km/status", undefined, head("tablet", H("2"), H("b")));
  eq(n.status, 200, "με τις ΝΕΕΣ λέξεις:");
  ok(sent.some((m) => /άλλαξαν/.test(m.subject)), "email «οι λέξεις άλλαξαν»");
});
await check("R-2 · 🔴 (β) ΧΩΡΙΣ απόδειξη email: καμία αλλαγή — ούτε από τον «κλέφτη» ούτε από τον ιδιοκτήτη", async () => {
  reset();
  for (const dev of ["tablet", "phone"]) {
    const r = await call("/api/km/words/reclaim", { ...NEW }, head(dev, L1));
    eq(r.status, 403, dev + ":"); eq((await r.json()).error, "email_unverified");
  }
  eq(db.prepare("SELECT lock_id FROM km_locks").all().map((x) => x.lock_id), [L1], "κλειδαριές:");
  eq(db.prepare("SELECT active_device_id FROM km_accounts").get().active_device_id, "tablet");
});
await check("R-3 · token ΑΛΛΟΥ email δεν περνάει", async () => {
  reset();
  const other = await mod.issueEmailToken(env, "thief@x.cy");
  const r = await call("/api/km/words/reclaim", { ...NEW, email_token: other }, head("tablet", L1));
  eq(r.status, 403);
});
await check("R-4 · 🔴 (β) η ΠΑΛΙΑ πόρτα /lock με replace λέξεων ΚΛΕΙΣΤΗ — ακόμα και για την ενεργή συσκευή", async () => {
  reset();
  const r = await call("/api/km/lock", { lock_id: H("2"), auth_token: H("b"), wrapped_k: "d".repeat(120), kind: "words", replace: L1, account_auth: H("b") }, head("tablet", L1));
  eq(r.status, 403, "lock replace:"); eq((await r.json()).error, "use_reclaim");
  eq(db.prepare("SELECT lock_id FROM km_locks").all().map((x) => x.lock_id), [L1]);
});
await check("R-5 · συσκευή που ΔΕΝ πέρασε ποτέ από τον λογαριασμό δεν «παίρνει πίσω» τίποτα", async () => {
  reset();
  const tok = await mod.issueEmailToken(env, "owner@x.cy");
  const r = await call("/api/km/words/reclaim", { ...NEW, email_token: tok }, head("stranger", L1));
  eq(r.status, 403); eq((await r.json()).error, "unknown_device");
});
await check("R-6 · 🔴 ο κωδικός «own» πάει ΜΟΝΟ στο email του λογαριασμού · η εγγραφή με πιασμένο email μένει 409", async () => {
  reset();
  const r = await call("/api/km/email/code", { purpose: "own", email: "thief@x.cy" }, head("tablet", L1));
  eq(r.status, 200);
  eq(sent[sent.length - 1].to, "owner@x.cy", "παραλήπτης:");
  ok(/12 λέξ/.test(sent[sent.length - 1].subject), "κείμενο αλλαγής λέξεων");
  eq((await r.json()).to, "o•••@x.cy", "μασκαρισμένο:");
  const r2 = await call("/api/km/email/code", { email: "owner@x.cy" });
  eq(r2.status, 409, "εγγραφή με πιασμένο email:");
  const r3 = await call("/api/km/email/code", { purpose: "own" }, head("tablet", L1, H("9")));
  eq(r3.status, 403, "χωρίς σωστή κλειδαριά:");
});
await check("R-7 · (γ) email «Μπήκε νέα συσκευή» όταν ΑΛΛΗ συσκευή παίρνει τη σκυτάλη — ΟΧΙ όταν ξαναμπαίνει η ίδια", async () => {
  reset();
  const r = await call("/api/km/register", { email: "owner@x.cy", device_name: "Galaxy" }, head("phone", L1));
  eq(r.status, 200, "register:");
  const m = sent.filter((x) => /νέα συσκευή/.test(x.subject));
  eq(m.length, 1, "email newdev:"); eq(m[0].to, "owner@x.cy");
  ok(/Πάρε πίσω τον λογαριασμό σου/.test(m[0].text), "οδηγία «Πάρε πίσω»");
  sent.length = 0;
  await call("/api/km/register", { email: "owner@x.cy" }, head("phone", L1));
  eq(sent.filter((x) => /νέα συσκευή/.test(x.subject)).length, 0, "ίδια συσκευή:");
});
await check("R-8 · 🔴 μετά το reclaim η ΠΛΑΓΙΑ πόρτα (παλιός κωδικός λογαριασμού, χωρίς κλειδαριά) είναι κλειστή", async () => {
  reset();
  const tok = await ownToken("phone");
  await call("/api/km/words/reclaim", { ...NEW, email_token: tok }, head("phone", L1));
  const r = await call("/api/km/status", undefined, head("tablet", null, A1));
  eq(r.status, 403);
});
await check("R-9 · το token καίγεται: δεύτερη χρήση = 403", async () => {
  reset();
  const tok = await ownToken("phone");
  eq((await call("/api/km/words/reclaim", { ...NEW, email_token: tok }, head("phone", L1))).status, 200);
  const r = await call("/api/km/words/reclaim", { lock_id: H("3"), auth_token: H("c"), wrapped_k: "c".repeat(120), account_auth: H("c"), email_token: tok }, head("phone", H("2"), H("b")));
  eq(r.status, 403);
});
await check("R-10 · Google/Microsoft «own»: ο σκοπός γράφεται στη γραμμή του state (google:own)", async () => {
  reset();
  const r = await call("/api/km/auth/google/start?purpose=own");
  eq(r.status, 302);
  eq(db.prepare("SELECT provider FROM km_oauth_states").all().map((x) => x.provider), ["google:own"]);
});
await check("R-11 · εφαρμογή: s-own · «Πάρε πίσω» στη συσκευή εκτός · αλλαγή μέσα στο «Οι 12 λέξεις μου» · /words/reclaim με email_token", async () => {
  ok(js.includes("SCREENS.push('s-own');"), "SCREENS");
  ok(html.includes('<section id="s-own"'), "οθόνη s-own");
  ok(js.includes("    el('ro-reclaim').hidden = !locked;"), "ro-reclaim ορατό όταν εκτός");
  const mw = html.slice(html.indexOf('<section id="s-mywords"'), html.indexOf("</section>", html.indexOf('<section id="s-mywords"')));
  ok(mw.includes('id="st-rotate"'), "κουμπί μέσα στο «Οι 12 λέξεις μου»");
  const st = html.slice(html.indexOf('<section id="s-settings"'), html.indexOf("</section>", html.indexOf('<section id="s-settings"')));
  ok(!st.includes('id="st-rotate"'), "όχι στις Ρυθμίσεις");
  const ra = js.slice(js.indexOf("function rotateAccepted()"), js.indexOf("v29 · Ο ΦΡΟΥΡΟΣ ΤΗΣ ΑΛΛΑΓΗΣ ΛΕΞΕΩΝ"));
  ok(ra.includes("kmFetch('words/reclaim'") && ra.includes("email_token: ownTok"), "reclaim + email_token");
  ok(!ra.includes("kmFetch('lock'"), "όχι πια /lock");
  ok(js.includes("location.assign(KM_API + 'auth/' + p + '/start?purpose=own');"), "Google/MS με purpose=own");
});

console.log(failed ? "\n✘ " + failed + " ΑΠΕΤΥΧΑΝ" : "\n✔ ΟΛΑ ΠΕΡΑΣΑΝ");
if (ONLY !== null) process.exit(failed ? 0 : 1);
process.exit(failed ? 1 : 0);
