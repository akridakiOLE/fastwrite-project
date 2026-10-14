// KM-PRO-F4 · ο λογιστής (FastWrite «γραμματοκιβώτιο») — server με ΠΡΑΓΜΑΤΙΚΗ SQL (node:sqlite) + κρυπτογραφία + κινητό
//   node tests/pro_f4.test.mjs            node tests/pro_f4.test.mjs --mutate=N  (exit 0 = πιάστηκε)
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
process.removeAllListeners("warning"); process.on("warning", () => {});
const { DatabaseSync } = await import("node:sqlite");
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let acct = readFileSync("src/km_acct.js", "utf8");
let js = readFileSync("site/kostometro/app.js", "utf8");
let cry = readFileSync("site/km-crypto.js", "utf8");
let km = readFileSync("src/km.js", "utf8");
const sql = readFileSync("schema/km_team.sql", "utf8") + "\n" + readFileSync("schema/km_acct.sql", "utf8");
const MUT = [
  // Μ1 · 🔴 ληγμένη πρόσκληση λογιστή γίνεται δεκτή
  ["acct", "  if (a.invite_exp < h.now()) return h.json({ ok: false, error: \"invite_expired\" }, 410);", ""],
  // Μ2 · 🔴 η πρόσκληση ξαναχρησιμοποιείται (δεύτερος υπολογιστής με τον ίδιο κωδικό)
  ["acct", "WHERE acct_id = ? AND status = 'invited'\"", "WHERE acct_id = ?\""],
  // Μ3 · 🔴 λογιστής χωρίς κλειδί (μόλις μπήκε) κατεβάζει γράμματα
  ["acct", " : w.a.status !== \"active\" || !w.a.wrap_a ? h.json({ ok: false, error: \"not_active\" }, 423) : null);", " : null);"],
  // Μ4 · 🔴 λογιστής ΑΛΛΗΣ επιχείρησης διαβάζει γράμματα (χωρίς φίλτρο φακέλου)
  ["acct", "FROM km_acct_mail WHERE folder_id = ? AND id > ? ORDER BY id LIMIT ?\")\n    .bind(w.folder, after, limit + 1)", "FROM km_acct_mail WHERE ? IS NOT NULL AND id > ? ORDER BY id LIMIT ?\")\n    .bind(w.folder, after, limit + 1)"],
  // Μ5 · 🔴 η παλιά έκδοση ενός τιμολογίου ΜΕΝΕΙ (διπλό τιμολόγιο στο FastWrite νέου λογιστή)
  ["acct", "  for (const o of old.results || []) {\n", "  for (const o of [] || []) {\n"],
  // Μ6 · 🔴 ανάκληση χωρίς σβήσιμο του κλειδωμένου A
  ["acct", "SET status = 'revoked', auth_hash = NULL, wrap_a = NULL,", "SET status = 'revoked', auth_hash = NULL,"],
  // Μ7 · 🔴 ανακλημένος παίρνει 403 αντί για 410 (το FastWrite δεν κόβει τη σύνδεση)
  ["acct", "  if (a && a.status === \"revoked\") return { err: h.json({ ok: false, error: \"revoked\" }, 410) };\n", ""],
  // Μ8 · 🔴 γραφή γράμματος από ΜΗ ενεργή συσκευή του Boss (δεύτερος συγγραφέας)
  ["acct", "  if (write && a.acc.active_device_id && a.acc.active_device_id !== a.id.device) return", "  if (false) return"],
  // Μ9 · 🔴 πάνω από 3 υπολογιστές λογιστηρίου
  ["acct", "  if (live.length >= ACCT_MAX) return", "  if (false) return"],
  // Μ10 · 🔴 μετά το «applied» η σφραγισμένη διόρθωση μένει στον server
  ["acct", "SET status = ?, decided_at = ?, meta = '' WHERE id = ?", "SET status = ?, decided_at = ? WHERE id = ? AND ? IS NOT NULL"],
  // Μ11 · 🔴 «αναίρεση» σε διόρθωση που δεν εφαρμόστηκε ποτέ
  ["acct", "  if (st === \"undone\" && f.status !== \"applied\") return", "  if (false) return"],
  // Μ12 · 🔴 σελίδα χωρίς όριο bytes (ένα αίτημα φορτώνει ολόκληρο το γραμματοκιβώτιο)
  ["acct", "    if (out.length && bytes + r.bytes > MAIL_PAGE_BYTES) { more = true; break; }\n", ""],
  // Μ13 · 🔴 χωρίς PRO ο λογιστής συνεχίζει να κατεβάζει
  ["acct", "const readErr = (h, w) => (!w.proOn ? h.json({ ok: false, error: \"not_pro\" }, 403) :", "const readErr = (h, w) => (false ? h.json({ ok: false, error: \"not_pro\" }, 403) :"],
  // Μ14 · 🔴 διαγραφή λογαριασμού αφήνει τον λογιστή / τα γράμματα
  ["km", "\"km_team\", \"km_acct_fix\", \"km_acct_mail\", \"km_acct\"]", "\"km_team\"]"],
  // Μ15 · 🔴 το κινητό σφραγίζει το γράμμα με το Κ (ο λογιστής θα χρειαζόταν το Κ)
  ["js", "    return kmImportK(kmHexToBytes(acctKeyNow().k)).then(function (key) { return kmSeal(key, bytes); })", "    return kmKeyReady().then(function (key) { return kmSeal(key, bytes); })"],
  // Μ16 · 🔴 ανάκληση λογιστή χωρίς νέο A
  ["js", "        if (a.status === 'active') { acctRotate(); }", ""],
  // Μ17 · 🔴 η διόρθωση του λογιστή περιμένει πάτημα του Boss (αντί για «ισχύει αμέσως», Α320 9/10)
  ["js", "          return acctApplyFix(priv, f).catch(", "          return Promise.resolve(null).catch("],
  // Μ18 · 🔴 η «Αναίρεση» δεν ξαναστέλνει το τιμολόγιο στον λογιστή
  ["js", "          acctUndoFix(r, x).then(function () { acctSoon(300);", "          acctUndoFix(r, x).then(function () { (0);"],
  // Μ19 · 🔴 εκκρεμές (μη εγκεκριμένο) τιμολόγιο φεύγει στον λογιστή
  ["js", "        if (r && !isPending(r)) {   // 🔴 μόνο ΕΓΚΕΚΡΙΜΕΝΑ", "        if (r) {   // 🔴 μόνο ΕΓΚΕΚΡΙΜΕΝΑ"],
  // Μ20 · 🔴 το βιβλίο (αντιστοίχιση) ΔΕΝ ξαναστέλνεται όταν αλλάξει
  ["js", "        acctItemBodies().forEach(function (it) {", "        [].forEach(function (it) {"],
  // Μ21 · 🔴 ο κύκλος ξανασαρώνει (και ξαναστέλνει) ΚΑΘΕ φορά — χωρίς «βρώμικο» και χωρίς δακτυλικό
  ["js", "        if (sent[rid] === fp) { return null; }", "        if (false) { return null; }"],
  // Μ22 · 🔴 διόρθωση ΧΩΡΙΣ σωστή υπογραφή A περνά (ο server θα πλαστογραφούσε διορθώσεις)
  ["js", "        if (mac !== env.mac) { throw new Error('λάθος υπογραφή'); }", ""],
  // Μ23 · 🔴 ο λογιστής παίρνει το ιστορικό ΧΩΡΙΣ πάτημα του Boss
  ["js", "a.pub && (a.status === 'active' || (a.status === 'joined' && acctOk(a.acct_id)))", "a.pub && (a.status === 'active' || (a.status === 'joined'))"],
  // Μ24 · 🔴 διόρθωση πάνω σε τιμή που άλλαξε στο μεταξύ (λάθος γραμμή/τιμή)
  ["js", "            if (!acctSame(ln[x.f], x.o)) { skipped++; return; }", ""],
  // Μ25 · 🔴 διόρθωση για τιμολόγιο που ΔΕΝ ήρθε ακόμα στη συσκευή χάνεται για πάντα
  ["js", "            if (goneMap()[m.rid]) { acctFixQ(f.id, 'rejected'); }", "            acctFixQ(f.id, 'rejected');"],
];
if (ONLY !== null) {
  const m = MUT[ONLY - 1]; const bag = { acct, js, cry, km };
  if (!m || !bag[m[0]].includes(m[1])) { console.log("Η ΜΕΤΑΛΛΑΞΗ Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(1); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ acct, js, cry, km } = bag);
}
let pass = 0, fail = 0;
const crash = (e) => { console.log("  ✘ ΚΑΤΑΡΡΕΥΣΗ: " + (e && e.stack || e)); process.exit(ONLY !== null ? 0 : 1); };
process.on("uncaughtException", crash); process.on("unhandledRejection", crash);
const ok = (c, m) => { if (c) { pass++; console.log("  ✔ " + m); } else { fail++; console.log("  ✘ " + m); } };

// ── ψεύτικο D1 πάνω σε ΠΡΑΓΜΑΤΙΚΗ SQLite · ψεύτικο R2 ──
const db = new DatabaseSync(":memory:");
db.exec(sql);
db.exec("CREATE TABLE km_pro (folder_id TEXT PRIMARY KEY, plan TEXT, status TEXT, started_at TEXT, until TEXT, source TEXT, updated_at TEXT);");
const D1 = { prepare(q) { let args = []; const st = {
  bind(...a) { args = a.map((x) => (x === undefined ? null : x)); return st; },
  async first() { const r = db.prepare(q).get(...args); return r === undefined ? null : { ...r }; },
  async all() { return { results: db.prepare(q).all(...args).map((r) => ({ ...r })) }; },
  async run() { const r = db.prepare(q).run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; } }; return st; } };
const R2 = new Map();
const FOLDERS = {
  async put(k, body) { R2.set(k, new Uint8Array(body instanceof ArrayBuffer ? body : body.buffer || body)); },
  async get(k) { const v = R2.get(k); return v ? { body: v } : null; },
  async head(k) { return R2.has(k) ? {} : null; },
  async delete(k) { (Array.isArray(k) ? k : [k]).forEach((x) => R2.delete(x)); },
  async list({ prefix }) { return { objects: [...R2.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key, size: R2.get(key).length })), truncated: false }; },
};
const env = { DB: D1, FOLDERS, PRO_LIVE: "1" };
const sha = async (s) => createHash("sha256").update(s).digest("hex");
const h = {
  json: (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { "Content-Type": "application/json" } }),
  safeJson: (r) => r.json().catch(() => null),
  clean: (v, max) => (typeof v === "string" && v.trim() ? v.replace(/[\u0000-\u001f]/g, "").trim().slice(0, max) : null),
  now: () => new Date().toISOString(), sha256hex: sha,
  authed: async (req) => { const f = req.headers.get("X-Km-Folder"); if (!f) return { err: h.json({ ok: false }, 400) };
    return { acc: { active_device_id: "dev-" + f.slice(0, 4) }, id: { folder: f, device: req.headers.get("X-Km-Device") } }; },
};
const P = {
  proRow: (e, f) => D1.prepare("SELECT * FROM km_pro WHERE folder_id = ?").bind(f).first(),
  proActive: (e, row, t) => String(e.PRO_LIVE) === "1" && !!row && (row.status === "active" || row.status === "test") && (!row.until || row.until > t),
};
const dir = mkdtempSync(join(tmpdir(), "kmacct-"));
writeFileSync(join(dir, "km_acct.mjs"), acct);
const A = await import("file://" + join(dir, "km_acct.mjs").replace(/\\/g, "/"));
const F1 = "a".repeat(64), F2 = "b".repeat(64);
const grant = (f) => db.prepare("INSERT OR REPLACE INTO km_pro VALUES (?, 'pro', 'test', 'x', NULL, 'admin', 'x')").run(f);
const call = async (method, path, o = {}) => {
  const hd = { "Content-Type": "application/json" };
  if (o.boss) { hd["X-Km-Folder"] = o.boss; hd["X-Km-Device"] = o.dev || ("dev-" + o.boss.slice(0, 4)); }
  if (o.acc) { hd["X-Km-Acct"] = o.acc.id; hd["X-Km-Acct-Auth"] = o.acc.auth; }
  Object.assign(hd, o.headers || {});
  const req = new Request("https://x" + path, { method, headers: hd, body: o.raw !== undefined ? o.raw : o.body !== undefined ? JSON.stringify(o.body) : undefined });
  const r = await A.handleAcct(req, env, path.split("?")[0], h, P);
  if (!r) return { st: 0, j: {} };
  const ct = r.headers.get("Content-Type") || "";
  return { st: r.status, j: ct.includes("json") ? await r.json() : {}, buf: ct.includes("json") ? null : new Uint8Array(await r.arrayBuffer()) };
};

// ── κρυπτογραφία (το ΙΔΙΟ km-crypto.js που φορτώνει το κινητό) ──
globalThis.window = globalThis;
const K = new Function(cry + "\nreturn { kmEcNew, kmEcPubRaw, kmEcPrivJwk, kmEcImportPriv, kmSealTo, kmOpenWith, kmB64, kmUnB64, kmImportK, kmSeal, kmOpen, kmHexToBytes };")();
const bossKp = await K.kmEcNew(), bossPub = K.kmB64(await K.kmEcPubRaw(bossKp.publicKey));
const fwKp = await K.kmEcNew(), fwPub = K.kmB64(await K.kmEcPubRaw(fwKp.publicKey));
const enc = (o) => new TextEncoder().encode(JSON.stringify(o));
const dec = (u) => JSON.parse(new TextDecoder().decode(u));

// ── ΣΕΝΑΡΙΟ ──
let r = await call("POST", "/api/km/pro/acct/invite", { boss: F1, body: { name: "Λογιστήριο Χριστοφή" } });
ok(r.st === 403 && r.j.error === "not_pro", "χωρίς PRO: κανένας λογιστής (403 not_pro)");
grant(F1); grant(F2);
db.prepare("INSERT INTO km_team (folder_id, boss_pub, slip_ver, updated_at) VALUES (?, ?, 0, 'x')").run(F1, bossPub);
r = await call("POST", "/api/km/pro/acct/invite", { boss: F1, dev: "dev-other", body: { name: "Χ" } });
ok(r.st === 409 && r.j.error === "not_active", "πρόσκληση ΜΟΝΟ από την ενεργή συσκευή του Boss");
r = await call("POST", "/api/km/pro/acct/invite", { boss: F1, body: { name: "" } });
ok(r.st === 400, "πρόσκληση χωρίς όνομα → 400");
r = await call("POST", "/api/km/pro/acct/invite", { boss: F1, body: { name: "Λογιστήριο Χριστοφή" } });
ok(r.j.ok && /^[0-9a-f]{32}$/.test(r.j.code) && r.j.invite_exp, "πρόσκληση λογιστή → κωδικός μίας χρήσης, λήξη 48 ωρών");
const code1 = r.j.code, acct1 = r.j.acct_id;
ok(Math.abs(Date.parse(r.j.invite_exp) - Date.now() - 48 * 3600e3) < 60e3, "η πρόσκληση ζει 48 ώρες");
{ const x = await call("POST", "/api/km/pro/acct/invite", { boss: F1, body: { name: "Παλιό" } });
  db.prepare("UPDATE km_acct SET invite_exp = '2020-01-01T00:00:00.000Z' WHERE acct_id = ?").run(x.j.acct_id);
  const y = await call("POST", "/api/km/pro/a/join", { body: { code: x.j.code, acct_auth: "5".repeat(64), pub: fwPub } });
  ok(y.st === 410 && y.j.error === "invite_expired", "🔴 ληγμένη πρόσκληση λογιστή → 410");
  await call("POST", "/api/km/pro/acct/revoke", { boss: F1, body: { acct_id: x.j.acct_id } }); }
r = await call("POST", "/api/km/pro/a/join", { body: { code: code1, acct_auth: "1".repeat(64), pub: "όχι-κλειδί" } });
ok(r.st === 400, "join χωρίς σωστό δημόσιο κλειδί → 400");
const fw = { id: acct1, auth: "2".repeat(64) };
r = await call("POST", "/api/km/pro/a/join", { body: { code: code1, acct_auth: fw.auth, pub: fwPub, device: "FastWrite · Windows", office: "Christofi & Co" } });
ok(r.j.ok && r.j.acct_id === acct1 && r.j.name === "Λογιστήριο Χριστοφή" && r.j.boss_pub === bossPub, "το FastWrite μπήκε: όνομα + δημόσιο κλειδί του Boss (για τις διορθώσεις)");
r = await call("POST", "/api/km/pro/a/join", { body: { code: code1, acct_auth: "3".repeat(64), pub: fwPub } });
ok(r.st === 404, "🔴 η πρόσκληση ΔΕΝ ξαναχρησιμοποιείται");
r = await call("GET", "/api/km/pro/a/me", { acc: { id: acct1, auth: "9".repeat(64) } });
ok(r.st === 403, "λάθος κωδικός υπολογιστή → 403");
r = await call("GET", "/api/km/pro/a/me", { acc: fw });
ok(r.j.ok && r.j.me.status === "joined" && !r.j.me.wrap_a && r.j.boss_pub === bossPub, "πριν πάρει κλειδί: «joined», χωρίς A");
r = await call("GET", "/api/km/pro/a/mail?after=0", { acc: fw });
ok(r.st === 423 && r.j.error === "not_active", "🔴 χωρίς κλειδί A δεν κατεβάζει τίποτα");
// ο Boss δίνει το A (όλες οι εκδόσεις, κλειδωμένες προς τον υπολογιστή)
const A1 = crypto.getRandomValues(new Uint8Array(32));
const hexOf = (u) => [...u].map((x) => x.toString(16).padStart(2, "0")).join("");
const ring = { 1: hexOf(A1) };
const wA = await K.kmSealTo(K.kmUnB64(fwPub), enc(ring));
r = await call("POST", "/api/km/pro/acct/key", { boss: F1, body: { acct_id: acct1, wrap_a: K.kmB64(wA), a_ver: 1 } });
ok(r.j.ok, "ο Boss δίνει το κλειδί ανάγνωσης A στον λογιστή");
r = await call("GET", "/api/km/pro/a/me", { acc: fw });
const ringOpen = dec(await K.kmOpenWith(await K.kmEcImportPriv(await K.kmEcPrivJwk(fwKp.privateKey)), K.kmUnB64(r.j.me.wrap_a)));
ok(r.j.me.status === "active" && ringOpen[1] === hexOf(A1), "λογιστής: ενεργός· ανοίγει το A ΜΟΝΟ με το ιδιωτικό κλειδί του υπολογιστή του");
let wrongOk = true; try { await K.kmOpenWith(bossKp.privateKey, K.kmUnB64(r.j.me.wrap_a)); } catch (e) { wrongOk = false; }
ok(!wrongOk, "🔴 με άλλο ιδιωτικό κλειδί το A ΔΕΝ ανοίγει");
// γράμματα
const kA1 = await K.kmImportK(A1);
const letter = async (o) => K.kmSeal(kA1, enc(o));
const putMail = (rid, kind, o, extra = {}) => letter(o).then((raw) => call("PUT", "/api/km/pro/acct/mail?rid=" + rid + "&kind=" + kind, Object.assign({ boss: F1, raw, headers: { "X-Km-A-Ver": "1", "Content-Type": "application/octet-stream" } }, extra)));
r = await putMail("_book", "inv", { v: 1 });
ok(r.st === 400, "το «_book» ΜΟΝΟ ως kind=book (και το book ΜΟΝΟ ως _book)");
r = await putMail("r9", "item", { v: 1 });
ok(r.st === 400, "kind=item ΜΟΝΟ με rid «i_…»");
r = await putMail("i_00ff", "item", { v: 1, kind: "item", key: "ορίζων|c:K100" });
ok(r.j.ok, "ένας κωδικός του βιβλίου = ένα μικρό γράμμα «item»");
r = await putMail("r1", "inv", { v: 1, rid: "r1", rec: { supplier: "ΟΡΙΖΩΝ", total: 10 } }, { dev: "dev-xx" });
ok(r.st === 409, "🔴 γράμμα ΜΟΝΟ από την ενεργή συσκευή (ένας συγγραφέας)");
r = await putMail("r1", "inv", { v: 1, rid: "r1", rec: { supplier: "ΟΡΙΖΩΝ", total: 10 } });
ok(r.j.ok && r.j.seq > 0, "ο Boss στέλνει γράμμα (τιμολόγιο r1)");
const seq1 = r.j.seq;
ok(![...R2.values()].some((v) => Buffer.from(v).includes(Buffer.from("ΟΡΙΖΩΝ"))), "🔴 ο server ΔΕΝ βλέπει ούτε το όνομα του προμηθευτή (μόνο σφραγισμένα)");
for (let i = 2; i <= 7; i++) await putMail("r" + i, "inv", { v: 1, rid: "r" + i, rec: { supplier: "S" + i, total: i } });
await putMail("_book", "book", { v: 1, biz: "Ταβέρνα Ακτή", items: {} });
r = await call("GET", "/api/km/pro/a/mail?after=0&limit=3", { acc: fw });
ok(r.j.ok && r.j.entries.length === 3 && r.j.more === true && r.j.next === r.j.entries[2].seq, "σελιδοποίηση: 3 γράμματα, «υπάρχουν κι άλλα», δείκτης «μετά το Ν»");
const e1 = r.j.entries.find((e) => e.rid === "r1");
const firstOpen = dec(await K.kmOpen(kA1, K.kmUnB64(e1.body)));
ok(firstOpen.rec.supplier === "ΟΡΙΖΩΝ", "ο λογιστής ανοίγει το γράμμα με το A");
let got = r.j.entries.map((e) => e.rid), nx = r.j.next;
while (true) { const p = await call("GET", "/api/km/pro/a/mail?after=" + nx + "&limit=3", { acc: fw }); got = got.concat(p.j.entries.map((e) => e.rid)); nx = p.j.next; if (!p.j.more) break; }
ok(got.length === 9 && got.includes("_book") && got.includes("i_00ff") && new Set(got).size === 9, "όλες οι σελίδες: 9 γράμματα, κανένα διπλό, κανένα χαμένο");
r = await call("GET", "/api/km/pro/a/mail?after=" + nx, { acc: fw });
ok(r.j.ok && r.j.entries.length === 0 && r.j.more === false && r.j.next === nx, "τίποτα νέο → άδεια σελίδα, ο δείκτης μένει");
// νέα έκδοση του r1 → αντικαθιστά την παλιά
r = await putMail("r1", "inv", { v: 1, rid: "r1", rec: { supplier: "ΟΡΙΖΩΝ", total: 11 } });
ok(r.j.seq > nx, "η νέα έκδοση του r1 παίρνει ΝΕΟ αριθμό (έρχεται στον επόμενο γύρο)");
ok(db.prepare("SELECT COUNT(*) AS n FROM km_acct_mail WHERE folder_id = ? AND rid = 'r1'").get(F1).n === 1 &&
   [...R2.keys()].filter((k) => k.startsWith(F1 + "/acct/m/")).length === db.prepare("SELECT COUNT(*) AS n FROM km_acct_mail WHERE folder_id = ?").get(F1).n,
   "🔴 μία έκδοση ανά τιμολόγιο: η παλιά σβήνει (βάση + R2 — κανένα ορφανό αντικείμενο)");
r = await call("GET", "/api/km/pro/a/mail?after=" + nx, { acc: fw });
ok(r.j.entries.length === 1 && dec(await K.kmOpen(kA1, K.kmUnB64(r.j.entries[0].body))).rec.total === 11, "ο λογιστής παίρνει ΜΟΝΟ την αλλαγή (total 11)");
r = await call("GET", "/api/km/pro/a/mail?after=0&limit=200", { acc: fw });
ok(r.j.entries.filter((e) => e.rid === "r1").length === 1, "νέος λογιστής από την αρχή: το r1 ΜΙΑ φορά (η νεότερη)");
// όριο bytes ανά σελίδα
{ const big = "x".repeat(400 * 1024);
  for (let i = 0; i < 12; i++) await putMail("big" + i, "inv", { v: 1, pad: big });
  const p = await call("GET", "/api/km/pro/a/mail?after=" + nx + "&limit=200", { acc: fw });
  const bytes = p.j.entries.reduce((a, e) => a + e.body.length * 0.75, 0);
  ok(p.j.more === true && p.j.entries.length < 12 && bytes <= A.MAIL_PAGE_BYTES * 1.02, "🔴 όριο σελίδας σε bytes (" + p.j.entries.length + " γράμματα ≤ 4 MB) — ποτέ όλο το γραμματοκιβώτιο μαζί");
  for (let i = 0; i < 12; i++) { const raw = await letter({ v: 1, del: true }); await call("PUT", "/api/km/pro/acct/mail?rid=big" + i + "&kind=del", { boss: F1, raw, headers: { "X-Km-A-Ver": "1", "Content-Type": "application/octet-stream" } }); } }
r = await call("GET", "/api/km/pro/a/mail?after=0&limit=10", { acc: { id: acct1, auth: fw.auth }, headers: {} });
ok(r.j.ok, "κατάσταση «del» δεκτή");
// 🔴 ΠΡΩΤΑ το αντικείμενο, μετά η γραμμή: αν το R2 αποτύχει, ΚΑΜΙΑ γραμμή (αλλιώς το FastWrite θα την προσπερνούσε για πάντα)
{ const put0 = FOLDERS.put, n0 = db.prepare("SELECT COUNT(*) AS n FROM km_acct_mail").get().n;
  FOLDERS.put = async () => { throw new Error("R2 down"); };
  let threw = false; try { await putMail("rX", "inv", { v: 1 }); } catch (e) { threw = true; }
  FOLDERS.put = put0;
  ok(threw && db.prepare("SELECT COUNT(*) AS n FROM km_acct_mail").get().n === n0, "🔴 το γράμμα γράφεται στο R2 ΠΡΙΝ από τη γραμμή της βάσης (αποτυχία R2 → καμία γραμμή-φάντασμα)"); }
// νέα συσκευή Boss: τι έχει ήδη το γραμματοκιβώτιο (δακτυλικά)
{ const raw = await letter({ v: 1, rid: "fpx" });
  await call("PUT", "/api/km/pro/acct/mail?rid=fpx&kind=inv", { boss: F1, raw, headers: { "X-Km-A-Ver": "1", "X-Km-Fp": "0123456789abcdef", "Content-Type": "application/octet-stream" } });
  const f = await call("GET", "/api/km/pro/acct/fps?after=0", { boss: F1 });
  ok(f.j.ok && f.j.items.some((x) => x.rid === "fpx" && x.fp === "0123456789abcdef"), "νέα συσκευή Boss: βλέπει τι έχει ήδη σταλεί (rid + δακτυλικό) — δεν ξαναστέλνει τα πάντα");
  const f2 = await call("GET", "/api/km/pro/acct/fps?after=0", { boss: F2 });
  ok(f2.j.items.length === 0, "🔴 άλλη επιχείρηση δεν βλέπει τα δακτυλικά"); }
// φωτογραφίες
const ph = await K.kmSeal(kA1, new Uint8Array([9, 8, 7, 6, 5]));
r = await call("PUT", "/api/km/pro/acct/photo?id=r1", { boss: F1, raw: ph, headers: { "Content-Type": "application/octet-stream" } });
ok(r.j.ok, "ο Boss στέλνει φωτογραφία ξανασφραγισμένη με A");
r = await call("GET", "/api/km/pro/acct/photos", { boss: F1 });
ok(r.j.photos.includes("r1"), "ο Boss βλέπει ποιες φωτογραφίες υπάρχουν (δεν ξαναστέλνει)");
r = await call("GET", "/api/km/pro/a/photo?id=r1", { acc: fw });
ok(r.st === 200 && Buffer.from(await K.kmOpen(kA1, r.buf)).equals(Buffer.from([9, 8, 7, 6, 5])), "ο λογιστής κατεβάζει και ανοίγει τη φωτογραφία");
r = await call("GET", "/api/km/pro/a/photo?id=../x", { acc: fw });
ok(r.st === 400, "id φωτογραφίας με «../» → 400");
// διόρθωση λογιστή
const fixId = "e".repeat(32);
const fixMeta = K.kmB64(await K.kmSealTo(K.kmUnB64(bossPub), enc({ id: fixId, rid: "r1", h: { total: [11, 12] } })));
r = await call("POST", "/api/km/pro/a/fix", { acc: fw, body: { id: fixId, meta: fixMeta } });
ok(r.j.ok, "ο λογιστής στέλνει διόρθωση (σφραγισμένη ΠΡΟΣ τον Boss)");
r = await call("POST", "/api/km/pro/a/fix", { acc: fw, body: { id: fixId, meta: fixMeta } });
ok(r.j.ok && r.j.same, "ίδια διόρθωση δεύτερη φορά → «same» (καμία διπλή)");
r = await call("GET", "/api/km/pro/acct/fixes", { boss: F2 });
ok(r.st === 200 && r.j.fixes.length === 0, "🔴 άλλη επιχείρηση δεν βλέπει τις διορθώσεις");
r = await call("GET", "/api/km/pro/acct/fixes", { boss: F1 });
ok(r.j.fixes.length === 1 && r.j.fixes[0].name === "Λογιστήριο Χριστοφή", "ο Boss βλέπει τη διόρθωση «από Λογιστήριο Χριστοφή»");
ok(dec(await K.kmOpenWith(bossKp.privateKey, K.kmUnB64(r.j.fixes[0].meta))).h.total[1] === 12, "ο Boss ανοίγει τη διόρθωση");
r = await call("POST", "/api/km/pro/acct/fixdone", { boss: F1, body: { id: fixId, status: "undone" } });
ok(r.st === 409, "🔴 «αναίρεση» ΜΟΝΟ σε διόρθωση που εφαρμόστηκε");
r = await call("POST", "/api/km/pro/acct/fixdone", { boss: F1, body: { id: fixId, status: "applied" } });
ok(r.j.ok && db.prepare("SELECT meta FROM km_acct_fix WHERE id = ?").get(fixId).meta === "", "🔴 «εφαρμόστηκε» → το σφραγισμένο αντίγραφο σβήνει από τον server");
r = await call("POST", "/api/km/pro/acct/fixdone", { boss: F1, body: { id: fixId, status: "undone" } });
r = await call("GET", "/api/km/pro/a/fixes", { acc: fw });
ok(r.j.fixes[0].status === "undone" && !("meta" in r.j.fixes[0]), "ο λογιστής βλέπει «αναιρέθηκε» — μόνο την κατάσταση");
// 🔴 δύο υπολογιστές με τον ΙΔΙΟ κωδικό την ίδια στιγμή → μπαίνει ΜΟΝΟ ο ένας
{ const x = await call("POST", "/api/km/pro/acct/invite", { boss: F1, body: { name: "Υπολογιστής 2" } });
  const [p1, p2] = await Promise.all([
    call("POST", "/api/km/pro/a/join", { body: { code: x.j.code, acct_auth: "6".repeat(64), pub: fwPub } }),
    call("POST", "/api/km/pro/a/join", { body: { code: x.j.code, acct_auth: "7".repeat(64), pub: fwPub } })]);
  ok([p1, p2].filter((p) => p.j.ok).length === 1, "🔴 ίδια πρόσκληση από δύο υπολογιστές ταυτόχρονα → μπαίνει ΜΟΝΟ ο ένας"); }
// 🔴 λογιστής ΑΛΛΗΣ επιχείρησης
{ db.prepare("INSERT INTO km_team (folder_id, boss_pub, slip_ver, updated_at) VALUES (?, ?, 0, 'x')").run(F2, bossPub);
  const x = await call("POST", "/api/km/pro/acct/invite", { boss: F2, body: { name: "Άλλο γραφείο" } });
  const o = { id: x.j.acct_id, auth: "8".repeat(64) };
  await call("POST", "/api/km/pro/a/join", { body: { code: x.j.code, acct_auth: o.auth, pub: fwPub } });
  await call("POST", "/api/km/pro/acct/key", { boss: F2, body: { acct_id: o.id, wrap_a: K.kmB64(wA), a_ver: 1 } });
  const m2 = await call("GET", "/api/km/pro/a/mail?after=0&limit=200", { acc: o });
  ok(m2.j.ok && m2.j.entries.length === 0 && m2.j.next === 0 && m2.j.more === false, "🔴 ο λογιστής ΑΛΛΗΣ επιχείρησης δεν βλέπει κανένα γράμμα αυτής");
  const ph2 = await call("GET", "/api/km/pro/a/photo?id=r1", { acc: o });
  ok(ph2.st === 404, "🔴 ούτε φωτογραφία της"); }
// «rejected»: διόρθωση που δεν ανοίγει δεν μπλοκάρει την ουρά
{ const bad = "1".repeat(32);
  await call("POST", "/api/km/pro/a/fix", { acc: fw, body: { id: bad, meta: "QUJDREVGR0hJSktMTU5PUA==" } });
  const x = await call("POST", "/api/km/pro/acct/fixdone", { boss: F1, body: { id: bad, status: "rejected" } });
  const y = await call("GET", "/api/km/pro/acct/fixes", { boss: F1 });
  ok(x.j.ok && !y.j.fixes.some((f) => f.id === bad), "χαλασμένη/ψεύτικη διόρθωση → «rejected» · φεύγει από την ουρά"); }
// όριο υπολογιστών
await call("POST", "/api/km/pro/acct/invite", { boss: F1, body: { name: "Υπολογιστής 3" } });
r = await call("POST", "/api/km/pro/acct/invite", { boss: F1, body: { name: "Υπολογιστής 4" } });
ok(r.st === 409 && r.j.error === "acct_full", "🔴 έως 3 υπολογιστές λογιστηρίου ανά επιχείρηση");
r = await call("GET", "/api/km/pro/acct", { boss: F1 });
ok(r.j.accts.length === 3 && r.j.mail.n > 0 && r.j.accts[0].office === "Christofi & Co", "ο Boss βλέπει τους λογιστές (και πώς λέει τον εαυτό του το γραφείο)");
// χωρίς PRO
db.prepare("UPDATE km_pro SET status = 'cancelled' WHERE folder_id = ?").run(F1);
r = await call("GET", "/api/km/pro/a/mail?after=0", { acc: fw });
ok(r.st === 403 && r.j.error === "not_pro", "🔴 χωρίς ενεργό PRO δεν κατεβαίνει τίποτα νέο");
grant(F1);
// ανάκληση
r = await call("POST", "/api/km/pro/acct/revoke", { boss: F2, body: { acct_id: acct1 } });
ok(r.st === 404, "🔴 ο Boss ΑΛΛΗΣ επιχείρησης δεν ανακαλεί τον λογιστή");
await call("POST", "/api/km/pro/a/fix", { acc: fw, body: { id: "2".repeat(32), meta: fixMeta } });
r = await call("POST", "/api/km/pro/acct/revoke", { boss: F1, body: { acct_id: acct1 } });
ok(db.prepare("SELECT status FROM km_acct_fix WHERE id = ?").get("2".repeat(32)).status === "rejected", "🔴 ανάκληση → ό,τι διόρθωση περίμενε από αυτόν ΔΕΝ περνά πια");
r = await call("GET", "/api/km/pro/a/mail?after=0", { acc: fw });
ok(r.st === 410 && r.j.error === "revoked", "🔴 ανακλημένος: 410 «revoked» — το FastWrite κόβει τη σύνδεση");
ok(!db.prepare("SELECT wrap_a FROM km_acct WHERE acct_id = ?").get(acct1).wrap_a, "ανάκληση → σβήνει και το κλειδωμένο A");
r = await call("POST", "/api/km/pro/a/fix", { acc: fw, body: { id: "f".repeat(32), meta: fixMeta } });
ok(r.st === 410, "🔴 ανακλημένος δεν στέλνει διορθώσεις");
{ const x = db.prepare("SELECT acct_id FROM km_acct WHERE folder_id = ? AND status = 'joined'").get(F1);
  db.prepare("UPDATE km_acct SET auth_hash = ? WHERE acct_id = ?").run(await sha("9".repeat(64)), x.acct_id);
  const lv = await call("POST", "/api/km/pro/a/leave", { acc: { id: x.acct_id, auth: "9".repeat(64) } });
  const me2 = await call("GET", "/api/km/pro/a/me", { acc: { id: x.acct_id, auth: "9".repeat(64) } });
  ok(lv.j.ok && me2.st === 410, "ο λογιστής αποσυνδέεται μόνος του → η θέση ελευθερώνεται (410 μετά)"); }
const kinds = db.prepare("SELECT kind FROM km_team_log WHERE folder_id = ?").all(F1).map((x) => x.kind);
ok(["acct_invite", "acct_join", "acct_activate", "fix", "fix_applied", "fix_undone", "acct_revoke"].every((k) => kinds.includes(k)), "🧾 ίχνος: πρόσκληση · μπήκε · ενεργοποίηση · διόρθωση · εφαρμόστηκε · αναιρέθηκε · ανάκληση");

// ── κείμενο κώδικα: server ──
ok(km.includes('"km_team", "km_acct_fix", "km_acct_mail", "km_acct"]'), "🔴 διαγραφή λογαριασμού → φεύγει και ο λογιστής (σύνδεση, γράμματα, διορθώσεις)");
ok(readFileSync("src/km_pro.js", "utf8").includes('const { handleAcct } = await import("./km_acct.js");'), "km_pro → km_acct");
ok(readFileSync("src/km_team.js", "utf8").includes("SELECT acct_id, name FROM km_acct WHERE folder_id = ?"), "το ίχνος της ομάδας γράφει και τα ονόματα των λογιστών");

// ── κινητό (κείμενο κώδικα) ──
{ const a = js.indexOf("  function acctSealMail("), b = js.indexOf("  function acctPhotoBytes(");
  const s = a > 0 && b > a ? js.slice(a, b) : "";
  ok(s.includes("acctKeyNow().k") && !/kmKeyReady\(|kmDerive|LS\.words/.test(s), "🔴 τα γράμματα σφραγίζονται με το A — ΠΟΤΕ με το Κ του φακέλου"); }
ok(js.includes("        if (a.status === 'active') { acctRotate(); }"), "🔴 ανάκληση λογιστή → νέο A");
ok(js.includes("        if (mac !== env.mac) { throw new Error('λάθος υπογραφή'); }"), "🔴 η διόρθωση περνά ΜΟΝΟ με σωστή υπογραφή A (HMAC) — όχι πλαστή από τον server");
ok(js.includes("a.pub && (a.status === 'active' || (a.status === 'joined' && acctOk(a.acct_id)))") && js.includes("go.textContent = '✓ Ενεργοποίηση';"), "🔴 ο λογιστής παίρνει το ιστορικό ΜΟΝΟ μετά από «✓ Ενεργοποίηση» του Boss (με κωδικό επιβεβαίωσης)");
ok(js.includes("            if (!acctSame(ln[x.f], x.o)) { skipped++; return; }") && js.includes("!Number.isInteger(x.i)"), "🔴 διόρθωση ΜΟΝΟ όπου η τιμή είναι ακόμα αυτή που είδε ο λογιστής (και αριθμός γραμμής)");
ok(js.includes("            if (goneMap()[m.rid]) { acctFixQ(f.id, 'rejected'); }"), "🔴 διόρθωση για τιμολόγιο που δεν ήρθε ακόμα → περιμένει (δεν χάνεται)");
ok(js.includes("          return acctApplyFix(priv, f).catch("), "🔴 η διόρθωση του λογιστή περνά ΧΩΡΙΣ πάτημα (Α320 9/10)");
ok(js.includes("          acctUndoFix(r, x).then(function () { acctSoon(300);") && js.includes("if (acctSame(acctHdrGet(r, k), ch.h[k][1]))"), "🔴 «↩ Αναίρεση» → το τιμολόγιο ξαναφεύγει στον λογιστή");
ok(js.includes("        if (r && !isPending(r)) {   // 🔴 μόνο ΕΓΚΕΚΡΙΜΕΝΑ"), "🔴 μόνο εγκεκριμένα τιμολόγια φεύγουν στον λογιστή");
ok(js.includes("        acctItemBodies().forEach(function (it) {"), "η αντιστοίχιση ταξιδεύει ανά κωδικό (μικρά γράμματα «item»)");
ok(js.includes("        if (sent[rid] === fp) { return null; }") && js.includes("    if (!full && !ids.length && !book) { return Promise.resolve(); }") && js.includes("indexedDB.open('km_acct', 1)"), "🔴 ΚΛΙΜΑΚΑ: στέλνεται ΜΟΝΟ ό,τι άλλαξε, και σάρωση μόνο όταν κάτι γράφτηκε");
ok(js.includes("acctMark(rec.id); }") && js.includes("acctMark(id); }") && js.includes("{ acctMark(); }   /* KM-PRO-F4 — νέα αντιστοίχιση") && js.includes("acctBookDirty = true; }   /* KM-PRO-F4 — επιχείρηση"), "«βρώμικο» ανά τιμολόγιο (put/del) · βιβλίο = ξανασάρωση · επιχείρηση/κλειδιά");
ok(js.includes("book: bookForPush(), team: teamForPush() })"), "τα κλειδιά A ταξιδεύουν στον σφραγισμένο φάκελο μαζί με την ομάδα");
const fnames = [...js.matchAll(/^  function ([A-Za-z0-9_$]+)\(/gm)].map((m) => m[1]);
const dup = fnames.filter((n, i) => fnames.indexOf(n) !== i);
ok(!dup.length, "🔴 καμία διπλή δήλωση συνάρτησης" + (dup.length ? " — " + dup.join(", ") : ""));
console.log("\n" + pass + " ✔ · " + fail + " ✘");
if (ONLY !== null) process.exit(fail ? 0 : 1);
process.exit(fail ? 1 : 0);
