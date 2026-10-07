// v120 · «Μία πόρτα» + Brief Γ — εγκατάσταση ΜΕΤΑ τον λογαριασμό · Messenger · Κώστας πάντα ορατός ·
//        εγγραφή χωρίς 12 λέξεις · μεταφορά λογαριασμού με QR (αποφάσεις Stavros 6–7/10/2026)
//   node --experimental-sqlite tests/v120.test.mjs
//   node --experimental-sqlite tests/v120.test.mjs --mutate=N   (exit 0 = η μετάλλαξη ΠΙΑΣΤΗΚΕ)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { webcrypto, createHash } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let src = readFileSync("src/km.js", "utf8");
let js = readFileSync("site/kostometro/app.js", "utf8");
let html = readFileSync("site/kostometro/index.html", "utf8");
let css = readFileSync("site/kostometro/app.css", "utf8");
const MUT = [
  // Μ1 · 🔴 η εκτός λειτουργίας (ή ο κλέφτης χωρίς σκυτάλη) φτιάχνει QR
  ["src", "  if (a.acc.active_device_id !== a.id.device) return json({ ok: false, error: \"not_active_device\" }, 409);\n  const b = (await safeJson(request)) || {};\n  const blob", "  const b = (await safeJson(request)) || {};\n  const blob"],
  // Μ2 · 🔴 το πακέτο δίνεται ΧΩΡΙΣ απόδειξη email
  ["src", "  if (!tok) return json({ ok: false, error: \"email_unverified\" }, 403);\n  const ts = now();\n  // Μία χρήση", "  const ts = now();\n  // Μία χρήση"],
  // Μ3 · 🔴 το πακέτο ξαναδίνεται (όχι μία χρήση)
  ["src", "UPDATE km_transfers SET taken = ?, blob = '' WHERE tid_hash = ? AND taken IS NULL", "UPDATE km_transfers SET created = created WHERE tid_hash = ? OR ? IS NULL"],
  // Μ13 · 🔴 το κλειδωμένο πακέτο ΜΕΝΕΙ στον server μετά την παραλαβή
  ["src", "UPDATE km_transfers SET taken = ?, blob = '' WHERE", "UPDATE km_transfers SET taken = ? WHERE"],
  // Μ4 · ληγμένο QR δεκτό
  ["src", "  if (!t || t.taken || t.deleted || t.due || t.expires < now()) return null;", "  if (!t || t.taken || t.deleted || t.due) return null;"],
  // Μ5 · 🔴 ο κωδικός «transfer» πάει σε όποιο email γράψει ο αιτών
  ["src", "    email = normEmail(t.email);\n    if (!email) return json({ ok: false, error: \"no_email\" }, 409);", "    email = normEmail(b.email) || normEmail(t.email);\n    if (!email) return json({ ok: false, error: \"no_email\" }, 409);"],
  // Μ6 · 🔴 (1) η κάρτα εγκατάστασης ξαναβγαίνει ΠΡΙΝ τον λογαριασμό
  ["js", "    if (!localStorage.getItem(LS.reg)) { return; }\n    /* (2) μέσα σε Facebook", "    /* (2) μέσα σε Facebook"],
  // Μ7 · (2) καμία οθόνη «Άνοιξε στον Chrome» μέσα στο Messenger
  ["js", "      if (iabName() && !sessionStorage.getItem('km_iab_stay')) { return iabShow(); }\n", ""],
  // Μ8 · (4) ο Κώστας ξαναπέφτει ΚΑΤΩ από το παράθυρο εγκατάστασης
  ["css", ".ag-fab{z-index:75;", ".ag-fab{z-index:60;"],
  // Μ9 · (5) η εγγραφή ξαναδείχνει την οθόνη των 12 λέξεων
  ["js", "          silentAccount();   // v120 · (5) — χωρίς οθόνη 12 λέξεων", "          startWords(false);"],
  // Μ10 · 🔴 (6) το Τ φεύγει προς τον server
  ["js", "          return kmFetch('transfer/new', { method: 'POST', headers: kmHead(), body: JSON.stringify({ blob: blob }) });", "          return kmFetch('transfer/new', { method: 'POST', headers: kmHead(), body: JSON.stringify({ blob: blob, t: qrB64(T) }) });"],
  // Μ11 · (5) η υπενθύμιση δεν φαίνεται ποτέ
  ["js", "    b.hidden = !(localStorage.getItem(LS.wordsTodo) && localStorage.getItem(LS.reg) && !isLocked());", "    b.hidden = true;"],
  // Μ12 · (6) η νέα συσκευή στέλνει το ίδιο email «με τις 12 λέξεις σου» αντί για «μεταφέρθηκε»
  ["src", "fireMail(env, ctx, b.via === \"qr\" ? \"qrdev\" : \"newdev\"", "fireMail(env, ctx, \"newdev\""],
];
if (ONLY !== null) {
  const m = MUT[ONLY - 1]; const bag = { src, js, html, css };
  if (!m || !bag[m[0]].includes(m[1])) { console.log("Η ΜΕΤΑΛΛΑΞΗ Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(1); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ src, js, html, css } = bag);
}
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
const db = new DatabaseSync(":memory:");
for (const f of ["km.sql", "km_h13.sql", "km_v54.sql", "km_mail.sql", "km_feedback.sql", "km_h11b.sql", "km_ref.sql", "km_ref2.sql", "km_verify.sql", "km_oauth.sql", "km_transfer.sql"]) {
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
const env = { DB, EMAIL, KM_ADMIN_KEY: "s3cret" };
const sha = (x) => createHash("sha256").update(x).digest("hex");
const H = (c) => c.repeat(64);
const FOLDER = H("f"), L1 = H("1"), A1 = H("a");
const call = (path, body, headers) => mod.handleKm(new Request("https://fastwrite.tech" + path,
  body !== undefined ? { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, headers || {}), body: JSON.stringify(body) }
                     : { headers: headers || {} }), env, null, path.split("?")[0]);
const head = (dev) => ({ "X-Km-Folder": FOLDER, "X-Km-Auth": A1, "X-Km-Device": dev, "X-Km-Lock": L1 });
let failed = 0;
const check = async (n, f) => { try { await f(); console.log("  ✔ " + n); } catch (e) { failed++; console.log("  ✘ " + n + " — " + e.message); } };
const eq = (g, w, what) => { if (JSON.stringify(g) !== JSON.stringify(w)) throw new Error((what || "") + " βρήκα " + JSON.stringify(g) + " περίμενα " + JSON.stringify(w)); };
const ok = (c, what) => { if (!c) throw new Error(what || "ψευδές"); };
console.log(ONLY ? "ΜΕΤΑΛΛΑΓΜΕΝΟ Μ" + ONLY + "\n" : "ΚΑΝΟΝΙΚΟ\n");
function reset() {
  for (const t of ["km_accounts", "km_locks", "km_device_links", "km_devices", "km_email_codes", "km_email_tokens", "km_mail_log", "km_transfers"]) db.exec("DELETE FROM " + t);
  db.prepare("INSERT INTO km_accounts (folder_id, auth_hash, email, created, source, active_device_id, active_since) VALUES (?,?,?,?,?,?,?)")
    .run(FOLDER, sha(A1), "owner@x.cy", "2026-10-01T08:00:00.000Z", "direct", "phoneA", "2026-10-07T15:00:00.000Z");
  db.prepare("INSERT INTO km_locks (lock_id, folder_id, kind, auth_hash, wrapped_k, created, created_by) VALUES (?,?,?,?,?,?,?)")
    .run(L1, FOLDER, "words", sha(A1), "e".repeat(120), "2026-10-01T08:00:00.000Z", "phoneA");
  db.prepare("INSERT INTO km_device_links (install_id, folder_id, created, last_seen) VALUES (?,?,?,?)").run("phoneA", FOLDER, "2026-10-01T08:00:00.000Z", "2026-10-07T14:00:00.000Z");
  sent.length = 0;
}
const BLOB = "AbC_-" + "x".repeat(200);
async function newQr() { const r = await call("/api/km/transfer/new", { blob: BLOB }, head("phoneA")); eq(r.status, 200, "transfer/new:"); return (await r.json()).tid; }

await check("Q-1 · 🔴 μόνο η ΕΝΕΡΓΗ συσκευή φτιάχνει QR", async () => {
  reset();
  db.exec("UPDATE km_accounts SET active_device_id = 'tablet'");
  const r = await call("/api/km/transfer/new", { blob: BLOB }, head("phoneA"));
  eq(r.status, 409);
});
await check("Q-2 · 🔴 το πακέτο ΜΟΝΟ με απόδειξη του email του λογαριασμού — και ΜΙΑ φορά", async () => {
  reset();
  const tid = await newQr();
  ok(/^[0-9a-f]{32}$/.test(tid), "tid");
  eq((await call("/api/km/transfer/take", { tid })).status, 403, "χωρίς token:");
  const wrong = await mod.issueEmailToken(env, "thief@x.cy");
  eq((await call("/api/km/transfer/take", { tid, email_token: wrong })).status, 403, "άλλο email:");
  const tok = await mod.issueEmailToken(env, "owner@x.cy");
  const r = await call("/api/km/transfer/take", { tid, email_token: tok });
  eq(r.status, 200, "σωστό email:"); eq((await r.json()).blob, BLOB);
  const tok2 = await mod.issueEmailToken(env, "owner@x.cy");
  eq((await call("/api/km/transfer/take", { tid, email_token: tok2 })).status, 410, "δεύτερη φορά:");
  eq(db.prepare("SELECT blob FROM km_transfers").get().blob, "", "το πακέτο σβήστηκε μετά την παραλαβή:");
  const st = await call("/api/km/transfer/status?tid=" + tid, undefined, head("phoneA"));
  eq((await st.json()).taken, true, "status:");
});
await check("Q-3 · ο κωδικός «transfer» πάει ΜΟΝΟ στο email του λογαριασμού · δίνει token που περνάει", async () => {
  reset();
  const tid = await newQr();
  const r = await call("/api/km/email/code", { purpose: "transfer", tid, email: "thief@x.cy" });
  eq(r.status, 200); eq(sent[sent.length - 1].to, "owner@x.cy", "παραλήπτης:");
  ok(/νέα συσκευή/.test(sent[sent.length - 1].subject), "κείμενο μεταφοράς");
  const code = /: (\d{6})\./.exec(sent[sent.length - 1].text)[1];
  const v = await call("/api/km/email/verify", { purpose: "transfer", tid, code });
  eq(v.status, 200);
  const r2 = await call("/api/km/transfer/take", { tid, email_token: (await v.json()).email_token });
  eq(r2.status, 200);
});
await check("Q-4 · ληγμένο QR = 410 · άγνωστο tid = 410", async () => {
  reset();
  const tid = await newQr();
  db.exec("UPDATE km_transfers SET expires = '2020-01-01T00:00:00.000Z'");
  const tok = await mod.issueEmailToken(env, "owner@x.cy");
  eq((await call("/api/km/transfer/take", { tid, email_token: tok })).status, 410);
  eq((await call("/api/km/email/code", { purpose: "transfer", tid: "0".repeat(32) })).status, 410);
});
await check("Q-5 · η Β μπαίνει με τα στοιχεία του πακέτου → ενεργή · email «μεταφέρθηκε με QR»", async () => {
  reset();
  const r = await call("/api/km/register", { email: "owner@x.cy", via: "qr", device_name: "Tab" }, { ...head("tabletB") });
  eq(r.status, 200);
  eq(db.prepare("SELECT active_device_id FROM km_accounts").get().active_device_id, "tabletB");
  ok(sent.some((m) => /μεταφέρθηκε/.test(m.subject)), "email qrdev");
  ok(!sent.some((m) => /Μπήκε νέα συσκευή/.test(m.subject)), "όχι το email «με τις 12 λέξεις»");
});
await check("U-1 · (1)(3) εγκατάσταση μόνο ΜΕΤΑ τον λογαριασμό, ποτέ μέσα σε Facebook, Chrome-incognito σιωπηλό", async () => {
  const f = js.slice(js.indexOf("function maybeInstall()"), js.indexOf("if (el('inst-no'))"));
  ok(f.includes("if (!localStorage.getItem(LS.reg)) { return; }"), "χωρίς λογαριασμό");
  ok(f.includes("if (iabName()) { return; }"), "Facebook");
  ok(f.includes("instChromeAndroid() && !instDefer"), "Chrome χωρίς beforeinstallprompt");
  ok(js.includes("    setTimeout(maybeInstall, 600);   // v120 · (1)"), "μετά τον λογαριασμό");
});
await check("U-2 · (2) οθόνη «Άνοιξε στον Chrome» πριν από την πρώτη οθόνη, με «Συνέχεια εδώ»", async () => {
  ok(html.includes('<section id="s-iab"') && html.includes('id="iab-stay"') && html.includes('id="iab-open"'), "html");
  ok(js.includes("      if (iabName() && !sessionStorage.getItem('km_iab_stay')) { return iabShow(); }"), "boot");
  ok(js.includes("package=com.android.chrome"), "intent Chrome");
});
await check("U-3 · (4) ο Κώστας ΠΑΝΩ από το παράθυρο εγκατάστασης (70)", async () => {
  ok(/\.ag-fab\{z-index:75;/.test(css), "z-index");
});
await check("U-4 · (5) εγγραφή χωρίς οθόνη λέξεων · υπενθύμιση ως «τις έγραψα»", async () => {
  ok(js.includes("          silentAccount();   // v120 · (5) — χωρίς οθόνη 12 λέξεων"), "μετά τον κωδικό");
  ok(js.includes("      return silentAccount();   // v120 · (5)"), "μετά Google/Microsoft");
  ok(js.includes("    b.hidden = !(localStorage.getItem(LS.wordsTodo) && localStorage.getItem(LS.reg) && !isLocked());"), "υπενθύμιση");
  ok(html.includes('id="kw-b"') && html.includes('id="kw-chk"'), "html");
});
await check("U-5 · 🔴 (6) QR: το Τ μένει στο # και ΔΕΝ φεύγει ποτέ προς τον server · AES-GCM", async () => {
  ok(js.includes("'/kostometro/?src=qr#km_qr=' + j.tid + '.' + qrB64(T)"), "Τ μετά το #");
  ok(js.includes("body: JSON.stringify({ blob: blob }) });"), "ανεβαίνει μόνο το πακέτο");
  ok(js.includes("crypto.subtle.encrypt({ name: 'AES-GCM'"), "AES-GCM");
  ok(html.includes('<script src="/kostometro/qr.js"></script>'), "qr.js");
});

console.log(failed ? "\n✘ " + failed + " ΑΠΕΤΥΧΑΝ" : "\n✔ ΟΛΑ ΠΕΡΑΣΑΝ");
if (ONLY !== null) process.exit(failed ? 0 : 1);
process.exit(failed ? 1 : 0);
