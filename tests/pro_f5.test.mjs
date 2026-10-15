// KM-PRO-F5 · όριο αναγνώσεων Κώστα + συνδρομή Paddle (mock) + ροές Free→PRO / νέος PRO — 15/10/2026
//   node tests/pro_f5.test.mjs            node tests/pro_f5.test.mjs --mutate=N  (exit 0 = πιάστηκε)
// Server με ΠΡΑΓΜΑΤΙΚΗ SQL (node:sqlite, τα ίδια schema/*.sql) · γεγονότα Paddle υπογεγραμμένα όπως
// ορίζει η τεκμηρίωση (HMAC-SHA256 του «ts:σώμα») · κινητό: έλεγχοι πάνω στον κώδικα.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, createHmac } from "node:crypto";
process.removeAllListeners("warning"); process.on("warning", () => {});
const { DatabaseSync } = await import("node:sqlite");
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let pro = readFileSync("src/km_pro.js", "utf8");
let pad = readFileSync("src/km_paddle.js", "utf8");
let km = readFileSync("src/km.js", "utf8");
let js = readFileSync("site/kostometro/app.js", "utf8");
let html = readFileSync("site/kostometro/index.html", "utf8");
let wt = readFileSync("wrangler.toml", "utf8");
const MUT = [
  // Μ1 · 🔴 όριο αναγνώσεων ξανά ΣΤΑΘΕΡΑ στον κώδικα (Stavros: το όριο δεν είναι απόφαση του Claude)
  ["pro", "  const r = (over && posNum(over.reads_limit)) || posNum(env && env.PRO_MONTHLY_READS);", "  const r = (over && posNum(over.reads_limit)) || posNum(env && env.PRO_MONTHLY_READS) || 300;"],
  // Μ2 · 🔴 χωρίς ρύθμιση η ανάγνωση γίνεται ΧΩΡΙΣ όριο
  ["pro", "  if (!lim.reads || !lim.usd) {", "  if (false) {"],
  // Μ3 · 🔴 κράτηση ΧΩΡΙΣ φραγμό (δύο ταυτόχρονες περνούν το όριο)
  ["pro", "     WHERE km_pro_quota.reads < ?`", "     WHERE ? IS NOT NULL`"],
  // Μ4 · 🔴 αποτυχία του παρόχου ΚΑΙΕΙ αναγνώσεις του πελάτη
  ["pro", "  catch (e) {\n    await quotaGive(env, folder, month);", "  catch (e) {\n    (0);"],
  // Μ5 · 🔴 ανάγνωση χωρίς γραμμές μετράει ως ανάγνωση
  ["pro", "  if (!good) await quotaGive(env, folder, month);", ""],
  // Μ6 · 🔴 το όριο ανά λογαριασμό (km_pro_limits) αγνοείται
  ["pro", "  const lim = proLimits(env, await limitsRow(env, folder));\n  if (!lim.reads", "  const lim = proLimits(env, null);\n  if (!lim.reads"],
  // Μ7 · 🔴 ταβάνι κόστους δεν ελέγχεται
  ["pro", "  if (u && u.usd_micro >= Math.round(lim.usd * 1e6)) return", "  if (false) return"],
  // Μ8 · 🔴 webhook ΧΩΡΙΣ έλεγχο υπογραφής
  ["pad", "  if (bad) { console.error(\"paddle: απόρριψη · \" + bad); return h.json({ ok: false, error: bad }, 401); }", ""],
  // Μ9 · 🔴 παλιά υπογραφή (επανάληψη) γίνεται δεκτή
  ["pad", "  if (Math.abs(nowMs / 1000 - Number(parts.ts)) > PADDLE_TOLERANCE_S) return \"stale\";", ""],
  // Μ10 · 🔴 το ίδιο γεγονός εφαρμόζεται δύο φορές (καμία μοναδικότητα στο event_id)
  ["pad", "    if (prev && prev.outcome !== \"working\" && prev.outcome !== \"error\") return h.json({ ok: true, duplicate: true });", ""],
  // Μ11 · 🔴 παλιότερο γεγονός που ήρθε αργά γυρίζει πίσω την κατάσταση (η Paddle δεν εγγυάται σειρά)
  ["pad", "  if (cur && cur.occurred_at > occ) return { out: \"older\", subId };", ""],
  // Μ12 · 🔴 past_due κόβει την πρόσβαση (η Paddle συνιστά πρόσβαση όσο ξαναχρεώνει)
  ["pad", "const ACCESS = { active: 1, trialing: 1, past_due: 1 };", "const ACCESS = { active: 1, trialing: 1 };"],
  // Μ13 · 🔴 η δοκιμή (trialing) μετράει ως «πλήρωσε» στις συστάσεις
  ["pad", "const PAID = { active: 1, past_due: 1 };", "const PAID = { active: 1, past_due: 1, trialing: 1 };"],
  // Μ14 · 🔴 νέος πελάτης απευθείας PRO: η συνδρομή «σε αναμονή» δεν δένεται ποτέ
  ["pro", "  try { const { proClaim } = await import(\"./km_paddle.js\"); await proClaim(env, a.id.folder, a.acc.email, t); }", "  try { }"],
  // Μ15 · 🔴 χωρίς χρόνο ασφαλείας η χαμένη ακύρωση αφήνει PRO για πάντα (until = NULL)
  ["pad", "    const end = s.period_end ? Date.parse(s.period_end) + (GRACE_MS[s.status] || 0) : null;", "    const end = null;"],
  // Μ16 · 🔴 ληγμένη συνδρομή σβήνει τη δοκιμή του admin
  ["pad", "  if (row && row.source === \"admin\" && row.status === \"test\" && !any) return row.status;", ""],
  // Μ17 · 🔴 χωρίς μυστικό το webhook απαντά 200 (η Paddle δεν ξαναστέλνει — γεγονός χαμένο)
  ["pad", "return h.json({ ok: false, error: \"not_configured\" }, 503); }", "return h.json({ ok: true }); }"],
  // Μ18 · 🔴 κινητό: το όριο γράφεται μόνο στο διαγνωστικό (σιωπηλή αποτυχία, όπως ως τη v198)
  ["js", "          proNoteRender();\n          if (!el('s-pend').hidden) { renderPending(); }", "          (0);\n          if (false) { renderPending(); }"],
  // Μ19 · 🔴 κινητό: λωρίδα ορίου λείπει από τα «Εκκρεμή»
  ["js", "      if (lb && list.length) { body.appendChild(lb); }", ""],
  // Μ20 · 🔴 αναβάθμιση στο web δεν φαίνεται χωρίς να ξανανοίξει η εφαρμογή
  ["js", "    if (!document.hidden && Date.now() - proChecked > 300000) { proRefresh(); }", "    if (false) { proRefresh(); }"],
  // Μ21 · 🔴 διαγραφή λογαριασμού αφήνει μετρητή/όριο/κατάσταση PRO
  ["km", "\"km_pro_quota\", \"km_pro_limits\", \"km_pro_usage\", \"km_pro\"]", "\"km_pro_quota\"]"],
  // Μ22 · 🔴 staging χωρίς ρυθμισμένο όριο (η δοκιμή άκρη-σε-άκρη δεν θα έβλεπε ανάγνωση)
  ["wt", "PRO_MONTHLY_READS = \"300\"", "PRO_X = \"300\""],
  // Μ23 · 🔴 συνδρομή «μετακομίζει» σε άλλον φάκελο επειδή άλλαξε το email στην Paddle
  ["pad", "  const folder = (cur && cur.folder_id) || (await folderOfEmail(env, email));", "  const folder = (await folderOfEmail(env, email)) || (cur && cur.folder_id);"],
  // Μ24 · 🔴 συνδρομή από email σε αίτημα διαγραφής δένεται στον λογαριασμό που φεύγει
  ["pad", "WHERE email = ? AND deleted IS NULL AND delete_due_at IS NULL LIMIT 1", "WHERE email = ? AND deleted IS NULL LIMIT 1"],
  // Μ25 · 🔴 Α10: το γράμμα φεύγει ΧΩΡΙΣ φωτογραφία (ο λογιστής βλέπει τιμολόγιο χωρίς εικόνα)
  ["js", "            if (okPh === false) { acctPhLater(rid); again(); return; }", "            if (false) { acctPhLater(rid); again(); return; }"],
  // Μ26 · 🔴 «Διαγραφή σελίδας» → ο λογιστής κρατά τη ΣΒΗΣΜΕΝΗ σελίδα (ίδια ids)
  ["js", "            r.pgv = (r.pgv || 0) + 1;", ""],
  // Μ27 · 🔴 ο λογιστής αδειάζει το Σύνολο → το τιμολόγιο φεύγει από το λογιστήριο με τις φωτογραφίες του
  ["js", "    if (k === 'total') { return typeof v === 'number' && isFinite(v) && Math.abs(v) < 1e9; }", ""],
  // Μ28 · 🔴 διόρθωση με αντικείμενο/τεράστιο κείμενο γράφεται στον φάκελο
  ["js", "    return v === null || (typeof v === 'string' && v.length <= 200);", "    return true;"],
  // Μ29 · 🔴 τιμολόγιο χωρίς φωτογραφία «περιμένει» για πάντα (ποτέ στον λογιστή)
  ["js", "    if (!r.srvPages) { return Promise.resolve('none'); }", "    if (!r.srvPages) { return Promise.resolve(null); }"],
  // Μ30 · 🔴 «κολλημένα» τιμολόγια τρώνε κάθε κύκλο (χωρίς αναμονή)
  ["js", "          if (acctPhWait[r.id] && acctPhWait[r.id].until > Date.now()) { again(); return; }   /* KM-PRO-F5 */", ""],
  // Μ31 · 🔴 νέος πελάτης PRO βλέπει την οθόνη κλειδιού (το PRO ρωτιέται πριν υπάρξει λογαριασμός — βρέθηκε στο f5check)
  ["js", "      return rp.then(function () { return localStorage.getItem(LS.reg) ? proRefresh() : proOn(); });", "      return Promise.resolve(proOn());"],
  // Μ32 · το δώρο 20 του Free φαίνεται σε PRO
  ["js", "    if (proOn()) { box.hidden = true; btn.hidden = true; return; }", ""],
  // Μ33 · 🔴 σελίδα αγοράς ανοιχτή χωρίς PRO_LIVE (πληρωμή για προϊόν που δεν λειτουργεί)
  ["pro", "const ready = String(env.PRO_LIVE || \"\") === \"1\" && ", "const ready = "],
  // Μ34 · 🔴 ανοχή υπογραφής μόνο προς τα πίσω (μελλοντικές υπογραφές δεκτές)
  ["pad", "  if (Math.abs(nowMs / 1000 - Number(parts.ts)) > PADDLE_TOLERANCE_S) return \"stale\";", "  if (nowMs / 1000 - Number(parts.ts) > PADDLE_TOLERANCE_S) return \"stale\";"],
  // Μ35 · 🔴 δεμένη συνδρομή ξαναδένεται σε άλλον λογαριασμό
  ["pad", "SET folder_id = ?, updated_at = ? WHERE folder_id IS NULL AND email = ?", "SET folder_id = ?, updated_at = ? WHERE email = ?"],
  // Μ36 · παλιότερο γεγονός πελάτη αλλάζει το email
  ["pad", "  if (cur && cur.occurred_at > occ) return \"older\";", ""],
  // Μ37 · 🔴 γεγονός με σφάλμα δεν ξαναγίνεται ποτέ
  ["pad", "    if (prev && prev.outcome !== \"working\" && prev.outcome !== \"error\") return", "    if (prev) return"],
  // Μ38 · λήξη από την ΤΕΛΕΥΤΑΙΑ συνδρομή αντί για την αργότερη
  ["pad", "else if (until !== \"∞\" && (!until || u > until)) until = u;", "else if (until !== \"∞\") until = u;"],
  // Μ39 · 🔴 μεταφορά συνδρομής: ο παλιός λογαριασμός κρατά PRO
  ["pad", "  if (cur.folder_id && cur.folder_id !== folder) await proRecompute(env, cur.folder_id, t);", ""],
  // Μ40 · 🔴 μισή ρύθμιση: το status δείχνει «απομένουν» και σβήνει το μήνυμα
  ["pro", "  const set = !!(lim.reads && lim.usd);", "  const set = !!lim.reads;"],
  // Μ41 · 🔴 κινητό: σελίδα-φάντασμα μετά από «Διαγραφή σελίδας» (το γράμμα δεν φεύγει ποτέ)
  ["js", "    var n = r.pgv ? pageCount(r) : Math.max(pageCount(r), r.srvPages || 1), out = [];", "    var n = Math.max(pageCount(r), r.srvPages || 1), out = [];"],
  // Μ42 · 🔴 αναίρεση Α σβήνει νεότερη Γ με ίδια τιμή
  ["js", "    Object.keys(ch.h || {}).forEach(function (k) { if (!hTouched(k) && ", "    Object.keys(ch.h || {}).forEach(function (k) { if ("],
  // Μ43 · 🔴 κινητό: το μήνυμα μένει για πάντα (δεν σβήνει όταν ξεμπλοκάρει)
  ["js", "    else if (typeof m.limit === 'number' && m.left > 0) { proLimSet(null); }", ""],
  // Μ44 · grant δεν καθαρίζει παλιό until
  ["pro", "DO UPDATE SET status = excluded.status, source = 'admin', until = NULL, updated_at", "DO UPDATE SET status = excluded.status, updated_at"],
  // Μ45 · 🔴 Σύνολο τεράστιο από τον λογιστή
  ["js", "    if (k === 'total') { return typeof v === 'number' && isFinite(v) && Math.abs(v) < 1e9; }", "    if (k === 'total') { return typeof v === 'number' && isFinite(v); }"],
  // Μ46 · 🔴 σελίδα που άλλαξε θέση ζητιέται από τον server (ο λογιστής παίρνει τη σβησμένη)
  ["js", "    if (r.pgv) { return Promise.resolve(null); }", ""],
  // Μ47 · 🔴 διαγραφή σελίδας με σελίδες που δεν κατέβηκαν
  ["js", "            if (pgs.some(function (x) { return !x; })) { alert(", "            if (false) { alert("],
  // Μ48 · 🔴 η μέτρηση του φθηνού μοντέλου ανοιχτή σε όλους (δωρεάν αναγνώσεις για οποιονδήποτε)
  ["km", "async function readTest(request, env) {\n  if (!adminOk(request, env)) return new Response(\"Not found\", { status: 404 });", "async function readTest(request, env) {\n  if (false) return new Response(\"Not found\", { status: 404 });"],
];
if (ONLY !== null) {
  const m = MUT[ONLY - 1]; const bag = { pro, pad, km, js, html, wt };
  if (!m || !bag[m[0]].includes(m[1])) { console.log("Η ΜΕΤΑΛΛΑΞΗ Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(1); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ pro, pad, km, js, html, wt } = bag);
}
let pass = 0, fail = 0;
const crash = (e) => { console.log("  ✘ ΚΑΤΑΡΡΕΥΣΗ: " + (e && e.stack || e)); process.exit(ONLY !== null ? 0 : 1); };
process.on("uncaughtException", crash); process.on("unhandledRejection", crash);
const ok = (c, m) => { if (c) { pass++; console.log("  ✔ " + m); } else { fail++; console.log("  ✘ " + m); } };
console.error = () => {};   // τα αναμενόμενα logs σφαλμάτων δεν θολώνουν την έξοδο

// ── ψεύτικο D1 πάνω σε ΠΡΑΓΜΑΤΙΚΗ SQLite ──
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE km_accounts (folder_id TEXT PRIMARY KEY, email TEXT, deleted TEXT, delete_due_at TEXT, plan TEXT, active_device_id TEXT);");
db.exec(readFileSync("schema/km_pro.sql", "utf8"));
db.exec(readFileSync("schema/km_pro_f5.sql", "utf8"));
const D1 = { prepare(q) { let args = []; const st = {
  bind(...a) { args = a.map((x) => (x === undefined ? null : x)); return st; },
  async first() { const r = db.prepare(q).get(...args); return r === undefined ? null : { ...r }; },
  async all() { return { results: db.prepare(q).all(...args).map((r) => ({ ...r })) }; },
  async run() { const r = db.prepare(q).run(...args); return { meta: { changes: Number(r.changes) } }; } }; return st; } };

const dir = mkdtempSync(join(tmpdir(), "kmf5-"));
writeFileSync(join(dir, "km_paddle.js"), pad);
writeFileSync(join(dir, "km_pro.js"), pro);
writeFileSync(join(dir, "km_team.js"), "export async function handleTeam(){ return null; }");
writeFileSync(join(dir, "km_acct.js"), "export async function handleAcct(){ return null; }");
const P = await import("file://" + join(dir, "km_pro.js").replace(/\\/g, "/"));
const PD = await import("file://" + join(dir, "km_paddle.js").replace(/\\/g, "/"));

const SECRET = "pdl_ntfset_01test_secretvalue";
let envX = {};
const env = () => Object.assign({ DB: D1, PRO_LIVE: "1", KM_ADMIN_KEY: "adm", PADDLE_WEBHOOK_SECRET: SECRET }, envX);
let nextRead = { lines: 3 }, reads = 0;
const h = {
  json: (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { "Content-Type": "application/json" } }),
  safeJson: (r) => r.json().catch(() => null),
  clean: (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null),
  now: () => new Date().toISOString(),
  sha256hex: async (s) => createHash("sha256").update(s).digest("hex"),
  adminOk: (req, e) => req.headers.get("X-Km-Admin") === e.KM_ADMIN_KEY,
  authed: async (req) => {
    const f = req.headers.get("X-Km-Folder");
    const acc = await D1.prepare("SELECT * FROM km_accounts WHERE folder_id = ?").bind(f).first();
    if (!acc) return { err: h.json({ ok: false, error: "no_account" }, 404) };
    return { acc, id: { folder: f, device: "dev" } };
  },
  agentCall: async () => {
    reads++;
    if (nextRead.fail) throw new Error("anthropic_529");
    const lines = Array.from({ length: nextRead.lines }, (_, i) => ({ desc: "Είδος " + i, unit: "κιλ.", qty: 1, unit_price: 2, line_net: 2 }));
    return { usage: { input_tokens: 3300, output_tokens: 560 }, content: [{ type: "text", text: JSON.stringify({ net: 2 * nextRead.lines, vat: 0, total: 2 * nextRead.lines, lines }) }] };
  },
};
const call = async (method, path, o = {}) => {
  const hd = { "Content-Type": "application/json" };
  if (o.folder) hd["X-Km-Folder"] = o.folder;
  if (o.admin) hd["X-Km-Admin"] = "adm";
  Object.assign(hd, o.headers || {});
  const req = new Request("https://x" + path, { method, headers: hd, body: o.raw !== undefined ? o.raw : o.body !== undefined ? JSON.stringify(o.body) : undefined });
  const r = await P.handlePro(req, env(), path, h);
  return { st: r.status, j: await r.json().catch(() => ({})) };
};
const PAGE = { pages: ["/9j/" + "A".repeat(300)] };
const F1 = "1".repeat(64), F2 = "2".repeat(64), F3 = "3".repeat(64), F4 = "4".repeat(64);
const acc = (f, email) => db.prepare("INSERT INTO km_accounts (folder_id, email) VALUES (?, ?)").run(f, email);
const grant = (f) => db.prepare("INSERT OR REPLACE INTO km_pro VALUES (?, 'pro', 'test', 'x', NULL, 'admin', 'x')").run(f);
const proRow = (f) => db.prepare("SELECT * FROM km_pro WHERE folder_id = ?").get(f);
const plan = (f) => (db.prepare("SELECT plan FROM km_accounts WHERE folder_id = ?").get(f) || {}).plan || null;

// ═══ 1 · ΟΡΙΟ ΑΝΑΓΝΩΣΕΩΝ ═══
acc(F1, "boss@example.com"); grant(F1);
envX = {};   // καμία ρύθμιση
let r = await call("POST", "/api/km/pro/read", { folder: F1, body: PAGE });
ok(r.st === 503 && r.j.error === "limit_unset" && reads === 0, "🔴 χωρίς ρύθμιση ορίου: ΚΑΜΙΑ ανάγνωση (503 limit_unset), καμία κλήση στον πάροχο");
ok(PD && P.proLimits({}, null).reads === null && P.proLimits({ PRO_MONTHLY_READS: "abc" }, null).reads === null, "όριο: μόνο από ρύθμιση — άκυρη τιμή = μη ρυθμισμένο");
envX = { PRO_MONTHLY_READS: "2", PRO_MONTHLY_USD: "5" };
r = await call("POST", "/api/km/pro/read", { folder: F1, body: PAGE });
ok(r.st === 200 && r.j.ok && r.j.month && r.j.month.reads === 1 && r.j.month.limit === 2 && r.j.month.left === 1, "1η ανάγνωση: μετρητής 1/2 στην απάντηση");
nextRead = { fail: true };
r = await call("POST", "/api/km/pro/read", { folder: F1, body: PAGE });
ok(r.st >= 429 && r.j.error === "provider", "αποτυχία παρόχου → σφάλμα παρόχου");
ok(db.prepare("SELECT reads FROM km_pro_quota WHERE folder_id = ?").get(F1).reads === 1, "🔴 η αποτυχία του παρόχου ΔΕΝ καίει ανάγνωση του πελάτη");
nextRead = { lines: 0 };
r = await call("POST", "/api/km/pro/read", { folder: F1, body: PAGE });
ok(db.prepare("SELECT reads FROM km_pro_quota WHERE folder_id = ?").get(F1).reads === 1, "🔴 ανάγνωση χωρίς γραμμές ΔΕΝ μετράει");
nextRead = { lines: 4 };
r = await call("POST", "/api/km/pro/read", { folder: F1, body: PAGE });
ok(r.j.ok && r.j.month.left === 0, "2η ανάγνωση: 2/2, απομένουν 0");
const before = reads;
r = await call("POST", "/api/km/pro/read", { folder: F1, body: PAGE });
const month = new Date().toISOString().slice(0, 7);
ok(r.st === 429 && r.j.error === "read_limit" && r.j.reason === "reads" && r.j.used === 2 && r.j.limit === 2 && r.j.renews === P.proRenews(month) && reads === before,
   "🔴 3η: 429 read_limit {used 2, limit 2, renews} — ΧΩΡΙΣ κλήση στον πάροχο");
ok(P.proRenews("2026-12") === "2027-01-01" && P.proRenews("2026-10") === "2026-11-01", "ανανέωση: 1η του επόμενου μήνα (και Δεκέμβριος → Ιανουάριος)");
r = await call("GET", "/api/km/pro/status", { folder: F1 });
ok(r.j.ok && r.j.pro && r.j.month.reads === 2 && r.j.month.limit === 2 && r.j.month.left === 0 && r.j.month.renews, "pro/status: reads / limit / left / renews");
// όριο ανά λογαριασμό
r = await call("POST", "/api/km/admin/pro/limit", { body: { folder_id: F1, reads_limit: 5 } });
ok(r.st === 404, "όριο ανά λογαριασμό ΜΟΝΟ με κλειδί admin");
r = await call("POST", "/api/km/admin/pro/limit", { admin: 1, body: { folder_id: F1, reads_limit: -3 } });
ok(r.st === 400, "άκυρο όριο → 400");
r = await call("POST", "/api/km/admin/pro/limit", { admin: 1, body: { folder_id: F1, reads_limit: 3 } });
r = await call("POST", "/api/km/pro/read", { folder: F1, body: PAGE });
ok(r.j.ok && r.j.month.limit === 3 && r.j.month.left === 0, "🔴 το όριο ΑΝΑ λογαριασμό υπερισχύει της γενικής ρύθμισης");
// ταυτόχρονες κρατήσεις (ατομικό UPSERT)
acc(F2, "two@example.com"); grant(F2);
envX = { PRO_MONTHLY_READS: "3", PRO_MONTHLY_USD: "5" };
const par = await Promise.all(Array.from({ length: 8 }, () => call("POST", "/api/km/pro/read", { folder: F2, body: PAGE })));
ok(par.filter((x) => x.j.ok).length === 3 && par.filter((x) => x.j.error === "read_limit").length === 5, "🔴 8 ταυτόχρονες με όριο 3 → ακριβώς 3 περνούν");
// ταβάνι κόστους
acc(F3, "three@example.com"); grant(F3);
db.prepare("INSERT INTO km_pro_usage (folder_id, month, calls, usd_micro) VALUES (?, ?, 10, 5000000)").run(F3, month);
r = await call("POST", "/api/km/pro/read", { folder: F3, body: PAGE });
ok(r.st === 429 && r.j.error === "read_limit" && r.j.reason === "cost", "🔴 ταβάνι κόστους (ρύθμιση PRO_MONTHLY_USD) → read_limit/cost");

// ═══ 2 · PADDLE WEBHOOK (ψεύτικα γεγονότα, σωστή υπογραφή) ═══
const sign = (raw, ts, sec) => createHmac("sha256", sec || SECRET).update(ts + ":" + raw).digest("hex");
let evn = 0;
const hook = async (type, data, o = {}) => {
  const ev = { event_id: o.id || ("evt_" + (++evn).toString().padStart(6, "0")), event_type: type,
               occurred_at: o.at || new Date(Date.now() + evn * 1000).toISOString(), notification_id: "ntf_x", data };
  const raw = JSON.stringify(ev), ts = String(o.ts || Math.floor(Date.now() / 1000));
  const sig = o.sig !== undefined ? o.sig : "ts=" + ts + ";h1=" + (o.rot ? "0".repeat(64) + ";h1=" : "") + sign(raw, ts);
  return call("POST", "/api/km/pro/paddle/webhook", { raw, headers: sig === null ? {} : { "Paddle-Signature": sig } });
};
const sub = (id, status, o = {}) => Object.assign({ id, status, customer_id: o.cid || "ctm_01a", custom_data: o.email ? { km_email: o.email } : null,
  current_billing_period: { starts_at: new Date().toISOString(), ends_at: o.end || new Date(Date.now() + 30 * 864e5).toISOString() },
  scheduled_change: null, items: [{ price: { id: "pri_01pro" } }] }, o.extra || {});
acc(F4, "Upgrade@Example.com".toLowerCase());
r = await hook("subscription.created", sub("sub_01a", "active", { email: "upgrade@example.com" }), { sig: "ts=1;h1=abc" });
ok(r.st === 401 && !proRow(F4), "🔴 λάθος/παλιά υπογραφή → 401, καμία αλλαγή");
r = await hook("subscription.created", sub("sub_01a", "active", { email: "upgrade@example.com" }), { sig: null });
ok(r.st === 401, "χωρίς Paddle-Signature → 401");
r = await hook("subscription.created", sub("sub_01a", "active", { email: "upgrade@example.com" }), { ts: Math.floor(Date.now() / 1000) - 60 });
ok(r.st === 401 && r.j.error === "stale", "🔴 υπογραφή 60″ πριν (επανάληψη) → 401 stale");
{ const sv = envX; envX = Object.assign({}, envX, { PADDLE_WEBHOOK_SECRET: "" });
  r = await hook("subscription.created", sub("sub_01a", "active", { email: "upgrade@example.com" }));
  ok(r.st === 503 && !proRow(F4), "🔴 χωρίς μυστικό → 503 (η Paddle ξαναστέλνει), ποτέ 200"); envX = sv; }
// ΑΝΑΒΑΘΜΙΣΗ Free → PRO (υπάρχων λογαριασμός)
r = await hook("subscription.created", sub("sub_01a", "active", { email: "UPGRADE@example.com " }), { rot: 1, id: "evt_upg001" });
ok(r.st === 200 && r.j.outcome === "applied" && proRow(F4).status === "active" && proRow(F4).source === "mor" && plan(F4) === "pro",
   "ΑΝΑΒΑΘΜΙΣΗ: Free με email → PRO ενεργό (mor) + «πλήρωσε» για τις συστάσεις · δεκτό και σε αλλαγή μυστικού (2 h1)");
ok(proRow(F4).until > new Date(Date.now() + 30 * 864e5).toISOString(), "λήξη = τέλος περιόδου + χρόνος ασφαλείας (όχι «για πάντα»)");
r = await call("GET", "/api/km/pro/status", { folder: F4 });
ok(r.j.pro === true, "pro/status του κινητού: pro = true → οι γραμμές PRO στο Μενού");
r = await hook("subscription.created", sub("sub_01a", "active", { email: "upgrade@example.com" }), { id: "evt_upg001" });
ok(r.j.duplicate === true, "🔴 ίδιο event_id δεύτερη φορά → εφαρμόζεται ΜΙΑ φορά");
const t0 = Date.now();
r = await hook("subscription.past_due", sub("sub_01a", "past_due", { email: "upgrade@example.com" }), { at: new Date(t0 + 50e3).toISOString() });
ok(proRow(F4).status === "active" && plan(F4) === "pro", "past_due: η πρόσβαση ΜΕΝΕΙ (η Paddle ξαναχρεώνει)");
r = await hook("subscription.canceled", sub("sub_01a", "canceled", { email: "upgrade@example.com", extra: { current_billing_period: null } }), { at: new Date(t0 + 90e3).toISOString() });
ok(proRow(F4).status === "cancelled" && plan(F4) === null, "ακύρωση → PRO κλείνει, «πλήρωσε» σβήνει");
r = await hook("subscription.updated", sub("sub_01a", "active", { email: "upgrade@example.com" }), { at: new Date(t0 + 60e3).toISOString() });
ok(r.j.outcome === "older" && proRow(F4).status === "cancelled", "🔴 παλιότερο γεγονός που ήρθε αργά ΔΕΝ ξανανοίγει το PRO");
r = await hook("subscription.updated", sub("sub_01a", "active", { email: "upgrade@example.com" }), { at: new Date(t0 + 120e3).toISOString() });
ok(proRow(F4).status === "active", "επανενεργοποίηση (νεότερο γεγονός) → PRO ξανά");
// ΝΕΟΣ ΠΕΛΑΤΗΣ ΑΠΕΥΘΕΙΑΣ PRO: πληρώνει ΠΡΙΝ υπάρξει λογαριασμός
r = await hook("subscription.created", sub("sub_01new", "trialing", { cid: "ctm_01new", email: "new@example.com" }));
ok(r.j.outcome === "pending" && db.prepare("SELECT folder_id FROM km_pro_sub WHERE sub_id = 'sub_01new'").get().folder_id === null, "νέος πελάτης: συνδρομή «σε αναμονή» (κανένας λογαριασμός ακόμα)");
const F5 = "5".repeat(64); acc(F5, "new@example.com");
r = await call("GET", "/api/km/pro/status", { folder: F5 });
ok(r.j.pro === true && proRow(F5).source === "mor", "🔴 εγγραφή με το ίδιο email → το πρώτο pro/status δένει τη συνδρομή → PRO (χωρίς οθόνη κλειδιού)");
ok(plan(F5) === null, "🔴 δοκιμή (trialing): πρόσβαση ΝΑΙ, «πλήρωσε» ΟΧΙ (συστάσεις §9.11.2)");
// email μόνο από customer.created (χωρίς km_email)
const F6 = "6".repeat(64); acc(F6, "cust@example.com");
r = await hook("subscription.created", sub("sub_01c", "active", { cid: "ctm_01c" }));
ok(r.j.outcome === "pending", "συνδρομή χωρίς km_email και χωρίς γνωστό πελάτη → αναμονή");
r = await hook("customer.created", { id: "ctm_01c", email: "Cust@Example.com" });
ok(proRow(F6) && proRow(F6).status === "active", "customer.created με email λογαριασμού → η συνδρομή δένεται → PRO");
// δοκιμή admin δεν σβήνεται από ληγμένη συνδρομή
const F7 = "7".repeat(64); acc(F7, "test@example.com"); grant(F7);
r = await hook("subscription.created", sub("sub_01t", "canceled", { email: "test@example.com", extra: { current_billing_period: null } }));
ok(proRow(F7).status === "test", "🔴 ακυρωμένη συνδρομή ΔΕΝ σβήνει δοκιμή admin (staging)");
// μετακόμιση
const F8 = "8".repeat(64); acc(F8, "other@example.com");
r = await hook("subscription.updated", sub("sub_01a", "active", { email: "other@example.com" }), { at: new Date(t0 + 200e3).toISOString() });
ok(db.prepare("SELECT folder_id FROM km_pro_sub WHERE sub_id = 'sub_01a'").get().folder_id === F4 && !proRow(F8), "🔴 αλλαγή email στην Paddle ΔΕΝ μεταφέρει τη συνδρομή σε άλλον λογαριασμό");
// διαγραφή σε εξέλιξη
const F9 = "9".repeat(64); db.prepare("INSERT INTO km_accounts (folder_id, email, delete_due_at) VALUES (?, ?, ?)").run(F9, "gone@example.com", "2099-01-01");
r = await hook("subscription.created", sub("sub_01g", "active", { email: "gone@example.com" }));
ok(r.j.outcome === "pending" && !proRow(F9), "🔴 λογαριασμός σε αίτημα διαγραφής δεν παίρνει συνδρομή");
// λήξη χωρίς γεγονός
const FA = "a".repeat(64); acc(FA, "lost@example.com");
r = await hook("subscription.created", sub("sub_01l", "active", { email: "lost@example.com", end: new Date(Date.now() - 10 * 864e5).toISOString() }));
ok(!proRow(FA) || proRow(FA).status === "cancelled", "περίοδος που έληξε πριν 10 ημέρες → καμία πρόσβαση");
db.prepare("UPDATE km_pro SET status = 'active', until = '2020-01-01T00:00:00.000Z', source = 'mor' WHERE folder_id = ?").run(F4);
db.prepare("UPDATE km_pro_sub SET period_end = '2019-12-01T00:00:00.000Z' WHERE folder_id = ?").run(F4);
const nExp = await PD.proExpire({ DB: D1 }, new Date().toISOString());
ok(nExp >= 1 && proRow(F4).status === "cancelled" && plan(F4) === null, "🔴 χαμένο webhook ακύρωσης: ο καθημερινός έλεγχος κλείνει το PRO και το «πλήρωσε»");
// admin link
r = await call("POST", "/api/km/admin/pro/link", { admin: 1, body: { sub_id: "sub_01g", folder_id: F8 } });
ok(r.j.ok && proRow(F8).status === "active", "υποστήριξη: συνδρομή με άλλο email → δένεται με admin (μόνο με κλειδί)");
r = await call("POST", "/api/km/admin/pro/link", { body: { sub_id: "sub_01g", folder_id: F8 } });
ok(r.st === 404, "link χωρίς κλειδί admin → 404");
ok(db.prepare("SELECT COUNT(*) AS n FROM km_pro_events").get().n > 5 && !db.prepare("SELECT * FROM km_pro_events LIMIT 1").get().body, "γεγονότα: μόνο id/τύπος/πότε/αποτέλεσμα — ΚΑΝΕΝΑ σώμα");

// ═══ 2β · ΕΥΡΗΜΑΤΑ ΑΝΕΞΑΡΤΗΤΗΣ ΑΝΑΘΕΩΡΗΣΗΣ (15/10) ═══
r = await hook("subscription.updated", sub("sub_01a", "active", { email: "upgrade@example.com" }), { ts: Math.floor(Date.now() / 1000) + 60 });
ok(r.st === 401 && r.j.error === "stale", "🔴 υπογραφή ΜΕΛΛΟΝΤΙΚΗ κατά 60″ → 401 (η ανοχή ισχύει και προς τα δύο)");
// μισή ρύθμιση: μόνο αναγνώσεις → το status λέει unset (όχι «απομένουν»)
envX = { PRO_MONTHLY_READS: "50" };
r = await call("GET", "/api/km/pro/status", { folder: F2 });
ok(r.j.month.limit === null && r.j.month.left === null && r.j.month.blocked === "unset", "🔴 μισή ρύθμιση (χωρίς ταβάνι κόστους) → status: unset — το μήνυμα ΔΕΝ σβήνει");
envX = { PRO_MONTHLY_READS: "50", PRO_MONTHLY_USD: "5" };
r = await call("GET", "/api/km/pro/status", { folder: F3 });
ok(r.j.month.blocked === "cost" && r.j.month.left > 0, "status: ταβάνι κόστους → blocked = cost (ακόμα κι αν περισσεύουν αναγνώσεις)");
r = await call("GET", "/api/km/pro/status", { folder: F2 });
ok(r.j.month.blocked === null && r.j.month.left === 47, "status: όριο 50, 3 αναγνώσεις → απομένουν 47, τίποτα μπλοκαρισμένο");
// πίνακας μετρητή που λείπει → 503 limit_unset (όχι 500 σε βρόχο)
db.exec("ALTER TABLE km_pro_quota RENAME TO km_pro_quota_x");
r = await call("POST", "/api/km/pro/read", { folder: F2, body: PAGE });
db.exec("ALTER TABLE km_pro_quota_x RENAME TO km_pro_quota");
ok(r.st === 503 && r.j.error === "limit_unset", "μετρητής μη διαθέσιμος → 503 limit_unset (ορατό μήνυμα), ποτέ ανάγνωση χωρίς μέτρηση");
// διαφορετικός λογαριασμός με ίδιο email ΔΕΝ «κλέβει» δεμένη συνδρομή
db.prepare("INSERT INTO km_pro_sub (sub_id, provider, email, folder_id, status, occurred_at, created_at, updated_at) VALUES ('sub_01own', 'paddle', 'same@example.com', ?, 'active', 'x', 'x', 'x')").run(F1);
const FB = "b".repeat(64); acc(FB, "same@example.com");
r = await call("GET", "/api/km/pro/status", { folder: FB });
ok(db.prepare("SELECT folder_id FROM km_pro_sub WHERE sub_id = 'sub_01own'").get().folder_id === F1 && !r.j.pro, "🔴 δεμένη συνδρομή ΔΕΝ ξαναδένεται σε άλλον λογαριασμό με το ίδιο email");
// customer: παλιότερο γεγονός δεν αλλάζει το email
r = await hook("customer.updated", { id: "ctm_01c", email: "newer@example.com" }, { at: new Date(Date.now() + 9e5).toISOString() });
r = await hook("customer.updated", { id: "ctm_01c", email: "older@example.com" }, { at: new Date(Date.now() + 8e5).toISOString() });
ok(db.prepare("SELECT email FROM km_pro_customer WHERE customer_id = 'ctm_01c'").get().email === "newer@example.com", "πελάτης: παλιότερο γεγονός που ήρθε αργά δεν αλλάζει το email");
// γεγονός που απέτυχε → η επανάληψη της Paddle το ξαναπεξεργάζεται
const FC = "c".repeat(64); acc(FC, "retry@example.com");
db.prepare("INSERT INTO km_pro_events (event_id, event_type, occurred_at, received_at, outcome) VALUES ('evt_retry01', 'subscription.created', 'x', 'x', 'error')").run();
r = await hook("subscription.created", sub("sub_01r", "active", { email: "retry@example.com" }), { id: "evt_retry01" });
ok(r.j.outcome === "applied" && proRow(FC) && proRow(FC).status === "active", "🔴 γεγονός με σφάλμα → η επανάληψη ΕΦΑΡΜΟΖΕΤΑΙ (όχι «duplicate»)");
// πολλές συνδρομές: λήξη = η ΑΡΓΟΤΕΡΗ
const FD = "d".repeat(64); acc(FD, "multi@example.com");
const far = new Date(Date.now() + 60 * 864e5).toISOString(), near = new Date(Date.now() + 10 * 864e5).toISOString();
await hook("subscription.created", sub("sub_01m1", "active", { email: "multi@example.com", end: far }));
await hook("subscription.created", sub("sub_01m2", "active", { email: "multi@example.com", end: near }));
ok(proRow(FD).until > new Date(Date.now() + 59 * 864e5).toISOString(), "2 συνδρομές (2ο σημείο): η πρόσβαση λήγει με την ΑΡΓΟΤΕΡΗ");
r = await call("GET", "/api/km/pro/status", { folder: FD });
ok(r.j.sub === true, "status: sub = true (το κινητό προειδοποιεί στη διαγραφή λογαριασμού)");
// admin link: ο παλιός λογαριασμός χάνει το PRO
const FE = "e".repeat(64); acc(FE, "linkto@example.com");
r = await call("POST", "/api/km/admin/pro/link", { admin: 1, body: { sub_id: "sub_01m1", folder_id: FE } });
r = await call("POST", "/api/km/admin/pro/link", { admin: 1, body: { sub_id: "sub_01m2", folder_id: FE } });
ok(proRow(FE).status === "active" && proRow(FD).status === "cancelled" && plan(FD) === null, "🔴 μεταφορά συνδρομής (υποστήριξη): ο ΠΑΛΙΟΣ λογαριασμός χάνει PRO και «πλήρωσε»");
// δοκιμή admin: καθαρή (χωρίς παλιό until/source)
db.prepare("UPDATE km_pro SET until = '2020-01-01T00:00:00.000Z', source = 'mor', status = 'cancelled' WHERE folder_id = ?").run(FD);
r = await call("POST", "/api/km/admin/pro/grant", { admin: 1, body: { folder_id: FD } });
ok(proRow(FD).status === "test" && proRow(FD).source === "admin" && proRow(FD).until === null, "grant (staging): η δοκιμή γίνεται καθαρή — όχι σιωπηλά ανενεργή από παλιό until");

// σελίδα αγοράς: ρυθμίσεις
envX = {};
r = await call("GET", "/api/km/pro/checkout-config");
ok(r.j.ok && r.j.ready === false && !r.j.token, "σελίδα αγοράς: χωρίς λογαριασμό Paddle → «ανοίγει σύντομα» (ready=false)");
envX = { PADDLE_CLIENT_TOKEN: "test_abc123", PADDLE_PRICE_ID: "pri_01xyz" };
r = await call("GET", "/api/km/pro/checkout-config");
ok(r.j.ready === true && r.j.env === "sandbox" && r.j.price === "pri_01xyz", "σελίδα αγοράς: token test_ → sandbox + price");
envX = { PADDLE_CLIENT_TOKEN: "test_abc123", PADDLE_PRICE_ID: "pri_01xyz", PRO_LIVE: "" };
r = await call("GET", "/api/km/pro/checkout-config");
ok(r.j.ready === false, "🔴 σελίδα αγοράς κλειστή όπου το PRO δεν είναι ενεργό (PRO_LIVE)");
const pg = readFileSync("site/pro/index.html", "utf8");
ok(pg.includes("customData: { km_email: v }") && pg.includes("customer: { email: v }"), "σελίδα αγοράς: το email λογαριασμού ταξιδεύει ως customData.km_email");

// ═══ 3 · ΚΩΔΙΚΑΣ: σχήμα, διαγραφή, κινητό, staging ═══
const sch = readFileSync("schema/km_pro_f5.sql", "utf8");
ok(/CREATE INDEX IF NOT EXISTS idx_km_pro_quota_month/.test(sch) && /PRIMARY KEY \(folder_id, month\)/.test(sch) && /idx_km_pro_sub_email/.test(sch), "D1: μετρητής με κλειδί (λογαριασμός, μήνας) + ευρετήρια από την πρώτη έκδοση");
ok(!/"/.test(sch.replace(/--[^\n]*/g, "")), "σχήμα χωρίς διπλά εισαγωγικά (περνά από d1apply)");
ok(km.includes("\"km_pro_quota\", \"km_pro_limits\", \"km_pro_usage\", \"km_pro\"]") && km.includes("UPDATE km_pro_sub SET folder_id = NULL"), "🔴 διαγραφή λογαριασμού: μετρητής/όριο/χρήση/PRO φεύγουν · η συνδρομή ξεδένεται");
ok(km.includes("const { proExpire } = await import(\"./km_paddle.js\")"), "καθημερινός καθαρισμός: λήξη συνδρομών χωρίς γεγονός");
ok(!/month_cap/.test(pro) && !/month_cap/.test(js), "το παλιό «month_cap» (σιωπηλό) δεν υπάρχει πια");
ok(js.includes("if (err.msg === 'read_limit' || err.msg === 'limit_unset') {") && js.includes("          proNoteRender();\n          if (!el('s-pend').hidden) { renderPending(); }"), "🔴 κινητό: το όριο ΦΑΙΝΕΤΑΙ (κουτί κάμερας + Εκκρεμή)");
ok(js.includes("      if (lb && list.length) { body.appendChild(lb); }"), "🔴 κινητό: λωρίδα ορίου πάνω από τα «Εκκρεμή»");
ok(html.includes('id="pro-note"') && html.includes('id="pro-note-t"') && html.includes('id="pro-note-x"'), "κινητό: κουτί μηνύματος PRO στην κάμερα");
ok(js.includes("    if (!document.hidden && Date.now() - proChecked > 300000) { proRefresh(); }"), "🔴 αναβάθμιση στο web → φαίνεται στην επιστροφή στην εφαρμογή");
ok(js.includes("if (was !== null && was !== !!j.pro) { proNote(j.pro ? 'on' : 'off');"), "αναβάθμιση/λήξη: ΜΙΑ γραμμή ενημέρωσης, όχι οθόνη εισαγωγής");
ok(!/paddle|checkout|59\s*€|€\s*59/i.test(js) && !/href="[^"]*fastwrite\.tech\/pro/i.test(html), "🔴 Apple 3.1.3γ: καμία τιμή, κανένα κουμπί/σύνδεσμος αγοράς μέσα στην εφαρμογή");
ok(!html.includes("σου έρχεται πρόταση διόρθωσης που την εγκρίνεις εσύ με ένα πάτημα") && html.includes("η διόρθωσή του περνά αμέσως"), "«Κάλεσε»: η διόρθωση λογιστή όπως αποφασίστηκε 9/10 (άμεση + αναίρεση)");
ok(js.includes("      return rp.then(function () { return localStorage.getItem(LS.reg) ? proRefresh() : proOn(); });") && js.includes("proReady(4000).then(function () {   /* KM-PRO-NOKEY"), "🔴 νέος PRO: το «είναι PRO;» ρωτιέται ΑΦΟΥ γίνει η εγγραφή (αλλιώς οθόνη κλειδιού)");
ok(js.includes("    if (proOn()) { box.hidden = true; btn.hidden = true; return; }"), "PRO: χωρίς το «δώρο 20» του Free");
ok(js.includes("function needKeyScreen() { return !localStorage.getItem(LS.key) && !localStorage.getItem(LS.skip) && !proOn(); }"), "νέος PRO: χωρίς οθόνη κλειδιού (needKeyScreen)");
const stg = wt.slice(wt.indexOf("[env.staging.vars]"), wt.indexOf("[[env.staging.d1_databases]]"));
ok(stg.includes('PRO_MONTHLY_READS = "300"') && stg.includes('PRO_MONTHLY_USD = "15"'), "staging: όριο ρυθμισμένο (ΔΟΚΙΜΑΣΤΙΚΕΣ τιμές, όχι απόφαση)");
const prodVars = wt.slice(wt.indexOf("[vars]"), wt.indexOf("[[d1_databases]]"));
ok(!/PRO_MONTHLY_READS|PRO_MONTHLY_USD|PRO_LIVE/.test(prodVars), "🔴 παραγωγή: ΚΑΝΕΝΑ όριο/PRO γραμμένο από τον Claude (απόφαση Stavros)");
ok(!/PADDLE_WEBHOOK_SECRET\s*=/.test(wt), "🔴 το μυστικό Paddle ΠΟΤΕ στο wrangler.toml");

// ═══ 4 · Α10 (v2.6): φωτογραφία ΠΑΝΤΑ · διόρθωση άμεσα + αναίρεση · κλειδί μόνο ανάγνωσης ═══
const fnSrc = (name) => { const i = js.indexOf("  function " + name + "("); if (i < 0) return null; let d = 0, k = js.indexOf("{", i);
  for (let j = k; j < js.length; j++) { if (js[j] === "{") d++; else if (js[j] === "}") { d--; if (!d) return js.slice(i, j + 1); } } return null; };
const valOk = new Function(js.slice(js.indexOf("  var ACCT_NUM = {"), js.indexOf("\n", js.indexOf("  var ACCT_NUM = {"))) + "\n" + fnSrc("acctValOk") + "\nreturn acctValOk;")();
ok(valOk("total", 12.5) && !valOk("total", null) && !valOk("total", "12") && !valOk("total", NaN) && !valOk("total", 1e12), "🔴 διόρθωση: το Σύνολο μόνο αριθμός — ΠΟΤΕ κενό");
ok(valOk("net", null) && valOk("qty", 3) && !valOk("qty", { x: 1 }) && !valOk("unit_price", 1e12), "διόρθωση: ποσά = αριθμός ή κενό (όχι αντικείμενα, όχι τεράστια)");
ok(valOk("desc", "Γάλα 1L") && !valOk("desc", "x".repeat(201)) && !valOk("code", 5) && !valOk("desc", ["a"]), "διόρθωση: κείμενα ≤200, μόνο κείμενο");
const ids = new Function("pidOf", "pageCount", fnSrc("acctPhotoIds") + "\nreturn acctPhotoIds;")((id, i) => (i ? id + "-p" + (i + 1) : id), (r) => 1 + (r.pages ? r.pages.length : 0));
ok(ids({ id: "R1", blob: 1, pages: [1] }).join() === "R1,R1-p2" && ids({ id: "R1", blob: 1, pages: [], pgv: 2 }).join() === "R1-v2", "🔴 σελίδες μετά από «Διαγραφή σελίδας» → νέα ids (ο λογιστής δεν κρατά τη σβησμένη)");
ok(/r\.pages = left\.slice\(1\);\n\s+r\.pgv = \(r\.pgv \|\| 0\) \+ 1;/.test(js), "🔴 «Διαγραφή σελίδας» ανεβάζει την έκδοση σελίδων (pgv)");
ok(js.includes("    if (!r.srvPages) { return Promise.resolve('none'); }") && js.includes("          if (bytes === 'none') { return; }"), "φωτογραφία που δεν υπάρχει πουθενά → δεν μπλοκάρει το γράμμα");
ok(js.includes("          if (acctPhWait[r.id] && acctPhWait[r.id].until > Date.now()) { again(); return; }") && js.includes("Math.min(60000 * Math.pow(2, w.n - 1), 1800000)"), "τιμολόγια με φωτογραφία σε αναμονή: αυξανόμενη αναμονή (δεν τρώνε τον κύκλο)");
ok(ids({ id: "R2" }).length === 0, "τιμολόγιο χωρίς φωτογραφία → καμία «αναμονή» φωτογραφίας στο FastWrite");
ok(js.includes("            if (okPh === false) { acctPhLater(rid); again(); return; }") && js.indexOf("if (okPh === false)") < js.indexOf("return acctSealMail(body, fp).then(function () { sent[rid] = fp;"), "🔴 Α10: το γράμμα φεύγει ΜΟΝΟ μαζί με τη φωτογραφία");
ok(js.includes("      if (x.st === 'applied' && !isReader()) {") && !js.includes("if (i === 0 && x.st === 'applied'"), "«↩ Αναίρεση» σε ΚΑΘΕ εφαρμοσμένη διόρθωση (όχι μόνο την τελευταία)");
ok(js.includes("        if (mac !== env.mac) { throw new Error('λάθος υπογραφή'); }") && js.includes("          return acctApplyFix(priv, f).catch("), "διόρθωση: ισχύει χωρίς πάτημα ΜΕΤΑ τον έλεγχο υπογραφής A");
ok(js.includes("    return kmImportK(kmHexToBytes(acctKeyNow().k)).then(function (key) { return kmSeal(key, bytes); })") && !/acctGiveKey[\s\S]{0,400}kmKeyReady/.test(fnSrc("acctGiveKey") || ""), "🔴 κλειδί λογιστή = A (μόνο ανάγνωσης) — ποτέ το Κ");
// proMonth: η εφαρμογή ακολουθεί ΜΟΝΟ τον server
{ const store = {}; const LSs = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const pm = new Function("localStorage", "LS", "proNoteRender", fnSrc("proLimGet") + fnSrc("proLimSet") + fnSrc("proMonth") + "\nreturn { proMonth, proLimGet };")(LSs, { proLim: "L" }, () => {});
  pm.proMonth({ blocked: "unset", limit: null, left: null }); const a1 = pm.proLimGet();
  pm.proMonth({ blocked: "cost", limit: 300, left: 200, renews: "2026-11-01" }); const a2 = pm.proLimGet();
  pm.proMonth({ blocked: null, limit: 300, left: 200, renews: "2026-11-01" }); const a3 = pm.proLimGet();
  pm.proMonth({ blocked: "reads", limit: 2, left: 0, reads: 2, renews: "2026-11-01" }); const a4 = pm.proLimGet();
  ok(a1 && a1.kind === "unset" && a2 && a2.kind === "cost" && a3 === null && a4 && a4.kind === "reads" && a4.used === 2, "🔴 κινητό: unset / cost / καθαρό / reads — ακριβώς όπως το λέει ο server (σβήνει όταν ξεμπλοκάρει)"); }
// pgv + srvPages (εύρημα #1): μετά τη διαγραφή σελίδας ΚΑΜΙΑ σελίδα-φάντασμα
ok(ids({ id: "R3", blob: 1, pages: [1], srvPages: 3, pgv: 1 }).join() === "R3-v1,R3-p2-v1", "🔴 «Διαγραφή σελίδας» σε τιμολόγιο από τον server: 2 σελίδες, όχι 3 (καμία που δεν υπάρχει)");
ok(js.includes("if (pgs.some(function (x) { return !x; })) { alert("), "🔴 «Διαγραφή σελίδας» μόνο όταν ΟΛΕΣ οι σελίδες είναι στο κινητό (2η αναθεώρηση)");
ok(/r\.pgv = \(r\.pgv \|\| 0\) \+ 1;[^\n]*\n\s+if \(r\.srvPages\) \{ r\.srvPages = left\.length; \}/.test(js), "η διαγραφή σελίδας διορθώνει και το srvPages");
// σελίδες άλλαξαν και λείπουν από το κινητό → ΔΕΝ στέλνεται η παλιά (θέση) σελίδα του server
{ let fetched = 0;
  const PB = new Function("blobBytes", "pidOf", "kmKeyReady", "kmFetch", "kmHead", "kmOpenAny", fnSrc("acctPhotoBytes") + "\nreturn acctPhotoBytes;")(
    async () => new Uint8Array([1]), (id, i) => id + "-p" + (i + 1), async () => ({}), async () => { fetched++; return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) }; }, () => ({}), async () => new Uint8Array([9]));
  const x1 = await PB({ id: "R", blob: 1, pages: [], srvPages: 2, pgv: 1 }, 1);
  const x2 = await PB({ id: "R", pages: [] }, 0);
  ok(x1 === null && fetched === 0 && x2 === "none", "🔴 σελίδα που άλλαξε θέση ΔΕΝ ζητιέται από τον server (θα ήταν η σβησμένη) · χωρίς φωτογραφία πουθενά → «none»"); }
// αναίρεση Α→Β→Α (εύρημα #10)
{ const rec = { total: 110, afix: [] };
  const fx = (id, o, n) => ({ id, st: "applied", ch: { h: { total: [o, n] }, l: [] } });
  rec.afix = [fx("A", 100, 110), fx("B", 110, 100), fx("C", 100, 110)];
  const H = new Function("acctSame", "acctHdrGet", "acctHdrSet", "acctLnPrice", "acctFixQ", "put", fnSrc("acctUndoFix") + "\nreturn acctUndoFix;");
  const undo = H((a, b) => a === b, (r, k) => r[k], (r, k, v) => { r[k] = v; }, () => {}, () => {}, async () => {});
  await undo(rec, rec.afix[0]);
  ok(rec.total === 110 && rec.afix[0].st === "undone", "🔴 αναίρεση Α όταν νεότερη Γ έγραψε την ίδια τιμή → η Γ ΜΕΝΕΙ (110)");
  await undo(rec, rec.afix[2]);
  ok(rec.total === 100, "αναίρεση της Γ (τελευταίας) → 100"); }
ok(html.includes('id="dl-sub"') && js.includes("el('dl-sub').hidden = !(JSON.parse(localStorage.getItem(LS.pro) || 'null') || {}).sub;"), "🔴 διαγραφή λογαριασμού με συνδρομή: προειδοποίηση ότι η συνδρομή ΔΕΝ ακυρώνεται");
{ const pgs = readFileSync("site/pro/index.html", "utf8");
  ok(pgs.includes('id="em2"') && pgs.includes("return valid(a) && a === em2.value.trim().toLowerCase();"), "σελίδα αγοράς: email ΔΥΟ φορές (λάθος γράμμα = PRO σε ξένο)"); }
ok(!/(\d+[.,]?\d*\s?€\s?\/\s?μήνα|€\s?\d+|\d+\s?€)/.test(html) && !/(\d+[.,]?\d*\s?€|€\s?\d)/.test(html.slice(html.indexOf('id="pro-note"'), html.indexOf('id="pro-note"') + 600)), "🔴 Apple 3.1.1: καμία τιμή σε ευρώ στο HTML της εφαρμογής");
ok(/async function readTest\(request, env\) \{\n  if \(!adminOk\(request, env\)\) return new Response\("Not found", \{ status: 404 \}\);/.test(km) && km.includes('if (path === "/api/km/admin/read-test" && method === "POST") return readTest(request, env);'), "🔴 μέτρηση φθηνού μοντέλου: ΜΟΝΟ με κλειδί admin");
const py = readFileSync("km_mailbox.py", "utf8");
ok(py.includes('if k == "total" and nv is None:') && py.includes('"error": "total_required"'), "FastWrite: το Σύνολο δεν αδειάζει (ίδιος κανόνας με το κινητό)");

console.log("\n" + pass + " ✔ · " + fail + " ✘");
if (ONLY !== null) process.exit(fail ? 0 : 1);
process.exit(fail ? 1 : 0);
