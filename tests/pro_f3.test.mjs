// KM-PRO-F3 · η ομάδα (Boss / manager / υπάλληλος) — server με ΠΡΑΓΜΑΤΙΚΗ SQL (node:sqlite) + κρυπτογραφία + κινητό
//   node tests/pro_f3.test.mjs            node tests/pro_f3.test.mjs --mutate=N  (exit 0 = πιάστηκε)
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
process.removeAllListeners("warning"); process.on("warning", () => {});
const { DatabaseSync } = await import("node:sqlite");
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let team = readFileSync("src/km_team.js", "utf8");
let pro = readFileSync("src/km_pro.js", "utf8");
let js = readFileSync("site/kostometro/app.js", "utf8");
let cry = readFileSync("site/km-crypto.js", "utf8");
const sql = readFileSync("schema/km_team.sql", "utf8");
const MUT = [
  // Μ1 · 🔴 ληγμένη πρόσκληση (48 ώρες) γίνεται δεκτή
  ["team", "  if (m.invite_exp < h.now()) return", "  if (false) return"],
  // Μ2 · 🔴 εκτός βάρδιας το μέλος στέλνει κανονικά
  ["team", "  if (!m.on_duty) return false;\n", ""],
  // Μ3 · 🔴 η λήξη πρόσβασης αγνοείται
  ["team", "  return !m.until || m.until > nowIso;\n}", "  return true;\n}"],
  // Μ4 · 🔴 μέλος ΑΛΛΟΥ φακέλου αλλάζεται από τον Boss
  ["team", "  if (!m || m.folder_id !== who.folder || m.status === \"revoked\") return h.json({ ok: false, error: \"no_member\" }, 404);\n  if (who.actor !== \"boss\") {", "  if (!m || m.status === \"revoked\") return h.json({ ok: false, error: \"no_member\" }, 404);\n  if (who.actor !== \"boss\") {"],
  // Μ5 · 🔴 ο manager δίνει στον εαυτό του / σε υπάλληλο «ιστορικό»
  ["team", "if (m.role !== \"user\" || b.hist !== undefined || b.manage !== undefined || b.name !== undefined) return", "if (false) return"],
  // Μ6 · 🔴 ο Boss βλέπει μισή πρόταση (πριν ανέβουν οι σελίδες)
  ["team", "b.pages ? \"upload\" : \"pending\"", "\"pending\""],
  // Μ7 · 🔴 μετά το «taken» οι σελίδες μένουν στον server
  ["team", "  for (let n = 0; n < p.pages; n++) { try { await env.FOLDERS.delete(", "  for (let n = 0; n < 0; n++) { try { await env.FOLDERS.delete("],
  // Μ8 · 🔴 ο υπάλληλος κατεβάζει το ιστορικό
  ["team", "if (kind === \"hist\" && (w.m.role !== \"admin\" || !w.m.hist)) return", "if (false) return"],
  // Μ9 · 🔴 το κλείσιμο του ιστορικού δεν παίρνει πίσω το κλειδί
  ["team", "    if (!b.hist) { set.push(\"wrap_h = NULL\", \"h_ver = NULL\"); }", ""],
  // Μ10 · 🔴 η ανάκληση αφήνει το κλειδωμένο S στον server
  ["team", "SET status = 'revoked', auth_hash = NULL, wrap_s = NULL,", "SET status = 'revoked', auth_hash = NULL,"],
  // Μ11 · 🔴 πάνω από 5 μέλη
  ["team", "if (live.length >= TEAM_MAX) return", "if (false) return"],
  // Μ12 · 🔴 το κλειδί του Boss αλλάζει σιωπηλά (οι σφραγισμένες προτάσεις χάνονται)
  ["team", "if (cur && cur.boss_pub !== b.boss_pub) return", "if (false) return"],
  // Μ13 · 🔴 το μέλος καλεί kmFetch (410 = «ο λογαριασμός διαγράφηκε» → σβήσιμο συσκευής Boss)
  ["js", "  function mFetch(path, opts) { opts = opts || {}; opts.headers = Object.assign(mHead(!(opts.body instanceof Uint8Array)), opts.headers || {}); return fetch(KM_API + path, opts); }", "  function mFetch(path, opts) { opts = opts || {}; opts.headers = Object.assign(mHead(!(opts.body instanceof Uint8Array)), opts.headers || {}); return kmFetch(path, opts); }"],
  // Μ14 · 🔴 το δελτίο του υπαλλήλου κουβαλάει μέσο όρο (= ιστορικό)
  ["js", "      groups[pid] = { n: (b.prods[pid] && b.prods[pid].name) || g.name || prodName(pid), b: g.base, s: s };", "      groups[pid] = { n: g.name, b: g.base, s: s, avg: g.avg };"],
  // Μ20 · 🔴 ανακλημένος παίρνει 403 (σαν «λάθος δίκτυο») αντί για 410 — η συσκευή του ΔΕΝ καθαρίζει
  ["team", "  if (m && m.status === \"revoked\") return { err: h.json({ ok: false, error: \"revoked\" }, 410) };\n", ""],
  // Μ15 · 🔴 τα κλειδιά της ομάδας ΔΕΝ ταξιδεύουν στον φάκελο (δεύτερη συσκευή Boss = δεύτερο κλειδί)
  ["js", "book: bookForPush(), team: teamForPush() })", "book: bookForPush() })"],
  // Μ16 · 🔴 η πρόσκληση ανοίγει σε συσκευή που ΕΧΕΙ λογαριασμό (τον πατάει)
  ["js", "      if (localStorage.getItem(LS.reg) || localStorage.getItem(LS.folder)) {\n        setTimeout(function () { alert('Αυτή η συσκευή έχει ήδη", "      if (false) {\n        setTimeout(function () { alert('Αυτή η συσκευή έχει ήδη"],
  // Μ17 · 🔴 ανάκληση χωρίς νέο S (ο ανακλημένος ανοίγει τα επόμενα δελτία)
  ["js", "          if (m.status !== 'invited') { teamRotate(); }", ""],
  // Μ18 · 🔴 το μέλος αλλάζει γραμμές (φύλλο «ίδιο με/συσκευασία»)
  ["js", "      row.onclick = memberMode() ? null : function () { lineSheet(r, i); };", "      row.onclick = function () { lineSheet(r, i); };"],
  // Μ19 · 🔴 κρυπτογραφία: σταθερό αντί για εφήμερο κλειδί → ίδιο κλειδί AES για όλα
  ["cry", "  var eph = await kmEcNew(), ephRaw = await kmEcPubRaw(eph.publicKey);", "  var eph = window.__fixed || (window.__fixed = await kmEcNew()), ephRaw = await kmEcPubRaw(eph.publicKey);"],
];
if (ONLY !== null) {
  const m = MUT[ONLY - 1]; const bag = { team, js, cry };
  if (!m || !bag[m[0]].includes(m[1])) { console.log("Η ΜΕΤΑΛΛΑΞΗ Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(1); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ team, js, cry } = bag);
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
  async run() { const r = db.prepare(q).run(...args); return { meta: { changes: Number(r.changes) } }; } }; return st; } };
const R2 = new Map();
const FOLDERS = {
  async put(k, body) { R2.set(k, new Uint8Array(body instanceof ArrayBuffer ? body : body.buffer || body)); },
  async get(k) { const v = R2.get(k); return v ? { body: v } : null; },
  async head(k) { return R2.has(k) ? {} : null; },
  async delete(k) { R2.delete(k); },
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
  readFor: async () => h.json({ ok: true, lines: [{ desc: "x" }] }),
};
const dir = mkdtempSync(join(tmpdir(), "kmteam-"));
writeFileSync(join(dir, "km_team.mjs"), team);
const T = await import("file://" + join(dir, "km_team.mjs").replace(/\\/g, "/"));
const F1 = "a".repeat(64), F2 = "b".repeat(64);
const grant = (f) => db.prepare("INSERT OR REPLACE INTO km_pro VALUES (?, 'pro', 'test', 'x', NULL, 'admin', 'x')").run(f);
const call = async (method, path, o = {}) => {
  const hd = { "Content-Type": "application/json" };
  if (o.boss) { hd["X-Km-Folder"] = o.boss; hd["X-Km-Device"] = o.dev || ("dev-" + o.boss.slice(0, 4)); }
  if (o.mem) { hd["X-Km-Member"] = o.mem.id; hd["X-Km-Member-Auth"] = o.mem.auth; }
  Object.assign(hd, o.headers || {});
  const req = new Request("https://x" + path, { method, headers: hd, body: o.raw !== undefined ? o.raw : o.body !== undefined ? JSON.stringify(o.body) : undefined });
  const r = await T.handleTeam(req, env, path.split("?")[0], h, P);
  if (!r) return { st: 0, j: {} };
  const ct = r.headers.get("Content-Type") || "";
  return { st: r.status, j: ct.includes("json") ? await r.json() : {}, buf: ct.includes("json") ? null : new Uint8Array(await r.arrayBuffer()) };
};

// ── κρυπτογραφία (το ΙΔΙΟ km-crypto.js που φορτώνει το κινητό) ──
globalThis.window = globalThis;
const K = new Function(cry + "\nreturn { kmEcNew, kmEcPubRaw, kmEcPrivJwk, kmEcImportPriv, kmSealTo, kmOpenWith, kmB64, kmUnB64, kmImportK, kmSeal, kmOpen };")();
const bossKp = await K.kmEcNew(), bossPub = K.kmB64(await K.kmEcPubRaw(bossKp.publicKey));
const nikosKp = await K.kmEcNew(), nikosPub = K.kmB64(await K.kmEcPubRaw(nikosKp.publicKey));
ok(T.isPub(bossPub) && !T.isPub("BA" + "x".repeat(10)) && !T.isPub(bossPub.slice(0, -2) + "=="), "δημόσιο κλειδί P-256: ο server δέχεται ΜΟΝΟ τη σωστή μορφή");
const S = crypto.getRandomValues(new Uint8Array(32));
const wS = await K.kmSealTo(K.kmUnB64(nikosPub), S);
const S2 = await K.kmOpenWith(await K.kmEcImportPriv(await K.kmEcPrivJwk(nikosKp.privateKey)), wS);
ok(Buffer.from(S2).equals(Buffer.from(S)), "κρυπτο: το S κλειδώνεται προς τον Νίκο και ανοίγει ΜΟΝΟ με το δικό του κλειδί");
let wrongOk = true; try { await K.kmOpenWith(bossKp.privateKey, wS); } catch (e) { wrongOk = false; }
ok(!wrongOk, "🔴 κρυπτο: με άλλο ιδιωτικό κλειδί ΔΕΝ ανοίγει (ούτε του Boss)");
const a1 = await K.kmSealTo(K.kmUnB64(bossPub), new TextEncoder().encode("ίδιο")), a2 = await K.kmSealTo(K.kmUnB64(bossPub), new TextEncoder().encode("ίδιο"));
ok(!Buffer.from(a1.slice(0, 65)).equals(Buffer.from(a2.slice(0, 65))), "🔴 κρυπτο: εφήμερο κλειδί ανά σφράγισμα (ίδιο κείμενο → άλλα bytes)");
ok(new TextDecoder().decode(await K.kmOpenWith(bossKp.privateKey, a1)) === "ίδιο", "κρυπτο: ο Boss ανοίγει ό,τι σφραγίστηκε προς αυτόν");

// ── ΣΕΝΑΡΙΟ ──
let r = await call("POST", "/api/km/pro/team/setup", { boss: F1, body: { boss_pub: bossPub } });
ok(r.st === 403 && r.j.error === "not_pro", "χωρίς PRO: καμία ομάδα (403 not_pro)");
grant(F1); grant(F2);
r = await call("POST", "/api/km/pro/team/setup", { boss: F1, body: { boss_pub: "xyz" } });
ok(r.st === 400, "setup: σκουπίδι αντί για κλειδί → 400");
r = await call("POST", "/api/km/pro/team/setup", { boss: F1, dev: "dev-other", body: { boss_pub: bossPub } });
ok(r.st === 409 && r.j.error === "not_active", "setup: ΜΟΝΟ η ενεργή συσκευή του Boss");
r = await call("POST", "/api/km/pro/team/setup", { boss: F1, body: { boss_pub: bossPub } });
ok(r.st === 200 && r.j.ok, "setup: η ομάδα στήθηκε");
r = await call("POST", "/api/km/pro/team/setup", { boss: F1, body: { boss_pub: nikosPub } });
ok(r.st === 409 && r.j.error === "boss_pub_exists", "🔴 το κλειδί του Boss ΔΕΝ αλλάζει σιωπηλά");
r = await call("POST", "/api/km/pro/team/invite", { boss: F1, body: { role: "user", name: "Νίκος" } });
ok(r.j.ok && /^[0-9a-f]{32}$/.test(r.j.code), "πρόσκληση υπαλλήλου «Νίκος» → κωδικός μίας χρήσης");
const nikosCode = r.j.code, nikosId = r.j.member_id;
r = await call("POST", "/api/km/pro/team/invite", { boss: F1, body: { role: "admin", name: "Μαρία" } });
const mariaCode = r.j.code, mariaId = r.j.member_id;
ok(r.j.ok, "πρόσκληση manager «Μαρία»");
r = await call("POST", "/api/km/pro/team/invite", { boss: F1, body: { role: "admin", name: "Β" } });
ok(r.st === 409 && r.j.error === "admin_exists", "ένας manager ανά σημείο");
{ const x = await call("POST", "/api/km/pro/team/invite", { boss: F1, body: { role: "user", name: "Παλιός" } });
  db.prepare("UPDATE km_members SET invite_exp = '2020-01-01T00:00:00.000Z' WHERE member_id = ?").run(x.j.member_id);
  const y = await call("POST", "/api/km/pro/m/join", { body: { code: x.j.code, member_auth: "5".repeat(64), pub: nikosPub } });
  ok(y.st === 410 && y.j.error === "invite_expired", "🔴 ληγμένη πρόσκληση (48 ώρες) → 410");
  await call("POST", "/api/km/pro/team/revoke", { boss: F1, body: { member_id: x.j.member_id } }); }
r = await call("POST", "/api/km/pro/m/join", { body: { code: "f".repeat(32), member_auth: "1".repeat(64), pub: nikosPub } });
ok(r.st === 404, "λάθος κωδικός πρόσκλησης → 404");
const nikos = { id: nikosId, auth: "2".repeat(64) };
r = await call("POST", "/api/km/pro/m/join", { body: { code: nikosCode, member_auth: nikos.auth, pub: nikosPub, device: "Android · Chrome" } });
ok(r.j.ok && r.j.role === "user" && r.j.name === "Νίκος" && r.j.boss_pub === bossPub, "ο Νίκος μπήκε: ρόλος, όνομα, δημόσιο κλειδί του Boss");
r = await call("POST", "/api/km/pro/m/join", { body: { code: nikosCode, member_auth: "3".repeat(64), pub: nikosPub } });
ok(r.st === 404, "🔴 η πρόσκληση ΔΕΝ ξαναχρησιμοποιείται");
r = await call("GET", "/api/km/pro/m/me", { mem: { id: nikosId, auth: "9".repeat(64) } });
ok(r.st === 403, "λάθος κωδικός συσκευής μέλους → 403");
r = await call("GET", "/api/km/pro/m/me", { mem: nikos });
ok(r.j.ok && r.j.me.status === "joined" && !r.j.me.duty_ok && !r.j.me.wrap_s, "πριν πάρει κλειδί: «joined», όχι σε βάρδια");
r = await call("POST", "/api/km/pro/m/proposal", { mem: nikos, body: { id: "c".repeat(32), meta: "A".repeat(40), pages: 0 } });
ok(r.st === 423 && r.j.error === "off_duty", "χωρίς κλειδί δεν στέλνει τίποτα");
r = await call("POST", "/api/km/pro/team/key", { boss: F1, body: { member_id: nikosId, wrap_s: K.kmB64(wS), s_ver: 1 } });
ok(r.j.ok, "ο Boss δίνει το S στον Νίκο");
r = await call("GET", "/api/km/pro/m/me", { mem: nikos });
ok(r.j.me.status === "active" && r.j.me.duty_ok && r.j.me.wrap_s === K.kmB64(wS), "Νίκος: ενεργός, σε βάρδια, έχει το κλειδωμένο S");
// δελτίο
const slipKey = await K.kmImportK(S);
const slip = await K.kmSeal(slipKey, new TextEncoder().encode(JSON.stringify({ v: 1, sups: ["ΟΡΙΖΩΝ"] })));
r = await call("PUT", "/api/km/pro/team/slip", { boss: F1, raw: slip, headers: { "X-Km-Slip-Ver": "5", "Content-Type": "application/octet-stream" } });
ok(r.j.ok, "ο Boss δημοσιεύει δελτίο (σφραγισμένο — ο server δεν το διαβάζει)");
r = await call("GET", "/api/km/pro/m/slip", { mem: nikos });
const sl = JSON.parse(new TextDecoder().decode(await K.kmOpen(await K.kmImportK(S2), r.buf)));
ok(sl.sups[0] === "ΟΡΙΖΩΝ", "ο Νίκος κατεβάζει και ανοίγει το δελτίο");
r = await call("GET", "/api/km/pro/m/hist", { mem: nikos });
ok(r.st === 403, "🔴 ο υπάλληλος ΔΕΝ κατεβάζει ιστορικό");
// βάρδια / λήξη
r = await call("POST", "/api/km/pro/team/member", { boss: F1, body: { member_id: nikosId, on_duty: false } });
r = await call("GET", "/api/km/pro/m/slip", { mem: nikos });
ok(r.st === 423, "🔴 εκτός βάρδιας: ούτε δελτίο");
r = await call("POST", "/api/km/pro/team/member", { boss: F1, body: { member_id: nikosId, on_duty: true, until: "2020-01-01T00:00:00Z" } });
r = await call("GET", "/api/km/pro/m/slip", { mem: nikos });
ok(r.st === 423, "🔴 η λήξη πρόσβασης ισχύει");
r = await call("POST", "/api/km/pro/team/member", { boss: F1, body: { member_id: nikosId, until: "2099-01-01T00:00:00Z" } });
r = await call("GET", "/api/km/pro/m/slip", { mem: nikos });
ok(r.st === 200, "λήξη στο μέλλον → πάλι μέσα");
r = await call("POST", "/api/km/pro/team/member", { boss: F2, body: { member_id: nikosId, on_duty: false } });
ok(r.st === 404, "🔴 ο Boss ΑΛΛΟΥ καταστήματος δεν αγγίζει τον Νίκο");
// πρόταση
const pid = "d".repeat(32);
const meta = K.kmB64(await K.kmSealTo(K.kmUnB64(bossPub), new TextEncoder().encode(JSON.stringify({ supplier: "ΟΡΙΖΩΝ" }))));
r = await call("POST", "/api/km/pro/m/proposal", { mem: nikos, body: { id: pid, meta, pages: 2 } });
ok(r.j.ok, "ο Νίκος στέλνει πρόταση (2 σελίδες)");
r = await call("GET", "/api/km/pro/team/proposals", { boss: F1 });
ok(r.j.proposals.length === 0, "🔴 όσο ανεβαίνουν οι σελίδες, ο Boss ΔΕΝ βλέπει μισή πρόταση");
const pg = await K.kmSealTo(K.kmUnB64(bossPub), new Uint8Array([1, 2, 3, 4]));
r = await call("PUT", "/api/km/pro/m/page?id=" + pid + "&n=0", { mem: nikos, raw: pg, headers: { "Content-Type": "application/octet-stream" } });
r = await call("PUT", "/api/km/pro/m/page?id=" + pid + "&n=1", { mem: nikos, raw: pg, headers: { "Content-Type": "application/octet-stream" } });
r = await call("GET", "/api/km/pro/team/proposals", { boss: F1 });
ok(r.j.proposals.length === 1 && r.j.proposals[0].name === "Νίκος", "με την τελευταία σελίδα: ο Boss βλέπει την πρόταση «από Νίκο»");
const opened = JSON.parse(new TextDecoder().decode(await K.kmOpenWith(bossKp.privateKey, K.kmUnB64(r.j.proposals[0].meta))));
ok(opened.supplier === "ΟΡΙΖΩΝ", "ο Boss ανοίγει την πρόταση");
r = await call("GET", "/api/km/pro/team/proposals", { boss: F2 });
ok(r.j.proposals.length === 0, "🔴 άλλο κατάστημα δεν βλέπει τις προτάσεις");
r = await call("GET", "/api/km/pro/team/page?id=" + pid + "&n=1", { boss: F1 });
ok(r.st === 200 && r.buf.length === pg.length, "ο Boss κατεβάζει τη σελίδα (σφραγισμένη)");
r = await call("POST", "/api/km/pro/team/decide", { boss: F1, body: { id: pid, decision: "taken" } });
ok(r.j.ok && !R2.has(F1 + "/team/p/" + pid + "/0.bin") && !R2.has(F1 + "/team/p/" + pid + "/1.bin"), "🔴 «παρελήφθη» → οι σελίδες σβήνουν από τον server");
ok(db.prepare("SELECT meta FROM km_proposals WHERE id = ?").get(pid).meta === "", "🔴 «παρελήφθη» → και τα σφραγισμένα στοιχεία σβήνουν");
r = await call("POST", "/api/km/pro/team/decide", { boss: F1, body: { id: pid, decision: "approved" } });
r = await call("GET", "/api/km/pro/m/proposals", { mem: nikos });
ok(r.j.proposals[0].status === "approved" && !("meta" in r.j.proposals[0]), "ο Νίκος βλέπει «εγκρίθηκε» — ΜΟΝΟ την κατάσταση, όχι τα δεδομένα");
// manager
const maria = { id: mariaId, auth: "4".repeat(64) };
await call("POST", "/api/km/pro/m/join", { body: { code: mariaCode, member_auth: maria.auth, pub: nikosPub } });
await call("POST", "/api/km/pro/team/key", { boss: F1, body: { member_id: mariaId, wrap_s: K.kmB64(wS), s_ver: 1 } });
r = await call("POST", "/api/km/pro/m/team/invite", { mem: maria, body: { role: "user", name: "Γ" } });
ok(r.st === 403, "manager ΧΩΡΙΣ «διαχείριση» δεν προσκαλεί");
await call("POST", "/api/km/pro/team/member", { boss: F1, body: { member_id: mariaId, manage: true } });
r = await call("POST", "/api/km/pro/m/team/invite", { mem: maria, body: { role: "user", name: "Γιώργος" } });
ok(r.j.ok, "manager ΜΕ «διαχείριση» προσκαλεί υπάλληλο");
r = await call("POST", "/api/km/pro/m/team/invite", { mem: maria, body: { role: "admin", name: "Χ" } });
ok(r.st === 403, "ο manager ΔΕΝ προσκαλεί manager");
r = await call("POST", "/api/km/pro/m/team/member", { mem: maria, body: { member_id: mariaId, on_duty: true } });
ok(r.st === 403, "🔴 ο manager ΔΕΝ αλλάζει τον εαυτό του");
r = await call("POST", "/api/km/pro/m/team/member", { mem: maria, body: { member_id: nikosId, hist: true } });
ok(r.st === 403, "🔴 ο manager ΔΕΝ δίνει «ιστορικό»");
r = await call("POST", "/api/km/pro/m/team/member", { mem: maria, body: { member_id: nikosId, on_duty: false } });
ok(r.j.ok && r.j.member.on_duty === false, "ο manager βγάζει υπάλληλο εκτός βάρδιας");
await call("POST", "/api/km/pro/team/member", { boss: F1, body: { member_id: nikosId, on_duty: true } });
r = await call("GET", "/api/km/pro/m/team", { mem: maria });
ok(r.j.ok && r.j.members.every((m) => m.role === "user") && r.j.used === 3, "ο manager βλέπει ΜΟΝΟ τους υπαλλήλους");
// ιστορικό
r = await call("POST", "/api/km/pro/team/key", { boss: F1, body: { member_id: mariaId, wrap_s: K.kmB64(wS), s_ver: 1, wrap_h: K.kmB64(wS), h_ver: 1 } });
ok(r.st === 403 && r.j.error === "no_hist", "🔴 κλειδί ιστορικού ΜΟΝΟ με τον διακόπτη ανοιχτό");
await call("POST", "/api/km/pro/team/member", { boss: F1, body: { member_id: mariaId, hist: true } });
r = await call("POST", "/api/km/pro/team/key", { boss: F1, body: { member_id: mariaId, wrap_s: K.kmB64(wS), s_ver: 1, wrap_h: K.kmB64(wS), h_ver: 1 } });
await call("PUT", "/api/km/pro/team/hist", { boss: F1, raw: slip, headers: { "X-Km-Slip-Ver": "7", "Content-Type": "application/octet-stream" } });
r = await call("GET", "/api/km/pro/m/hist", { mem: maria });
ok(r.st === 200, "manager με «ιστορικό» κατεβάζει το ιστορικό");
await call("POST", "/api/km/pro/team/member", { boss: F1, body: { member_id: mariaId, hist: false } });
r = await call("GET", "/api/km/pro/m/me", { mem: maria });
ok(!r.j.me.wrap_h && !r.j.me.has_h, "🔴 κλείνει ο διακόπτης → το κλειδί του ιστορικού φεύγει αμέσως");
r = await call("GET", "/api/km/pro/m/hist", { mem: maria });
ok(r.st === 403, "και το ιστορικό δεν κατεβαίνει");
// όριο 5
for (const n of ["Δ", "Ε"]) await call("POST", "/api/km/pro/team/invite", { boss: F1, body: { role: "user", name: n } });
r = await call("POST", "/api/km/pro/team/invite", { boss: F1, body: { role: "user", name: "Ζ" } });
ok(r.st === 409 && r.j.error === "team_full", "🔴 έως 5 άτομα ανά σημείο");
// ανάκληση
r = await call("POST", "/api/km/pro/team/revoke", { boss: F1, body: { member_id: nikosId } });
r = await call("GET", "/api/km/pro/m/me", { mem: nikos });
ok(r.st === 410 && r.j.error === "revoked", "🔴 ανακλημένος: 410 «revoked» — η συσκευή του καθαρίζει");
ok(!db.prepare("SELECT wrap_s FROM km_members WHERE member_id = ?").get(nikosId).wrap_s, "ανάκληση → σβήνει και το κλειδωμένο S");
r = await call("POST", "/api/km/pro/team/invite", { boss: F1, body: { role: "user", name: "Ζ" } });
ok(r.j.ok, "η θέση ελευθερώθηκε → νέα πρόσκληση");
r = await call("GET", "/api/km/pro/team", { boss: F1 });
const kinds = r.j.log.map((x) => x.kind);
ok(["setup", "invite", "join", "activate", "member", "propose", "approve", "revoke"].every((k) => kinds.includes(k)), "🧾 ίχνος: setup · invite · join · activate · member · propose · approve · revoke");
ok(r.j.members.every((m) => m.status !== "revoked") && r.j.members.length === 5, "ο Boss βλέπει 5 ενεργά/προσκεκλημένα μέλη (όχι τον ανακλημένο)");

// ── κινητό (κείμενο κώδικα) ──
ok(js.includes("  function mFetch(path, opts) { opts = opts || {}; opts.headers = Object.assign(mHead(!(opts.body instanceof Uint8Array)), opts.headers || {}); return fetch(KM_API + path, opts); }"), "🔴 το μέλος ΔΕΝ περνά από kmFetch (410/423 εκεί = διαγραφή λογαριασμού Boss)");
{ const a = js.indexOf("  function slipBuild(rows) {"), b = js.indexOf("  function histBuild(rows) {");
  ok(a > 0 && b > a && !/avg|wsum|wq|\.n\b|qty/.test(js.slice(a, b)), "🔴 το δελτίο ΔΕΝ έχει μέσο όρο ή ποσότητες (ιστορικό = μόνο manager με διακόπτη)"); }
ok(js.includes("book: bookForPush(), team: teamForPush() })") && js.includes("        teamMerge(folder.team);   /* KM-PRO-F3 */"), "🔴 κλειδιά Boss + S/H ταξιδεύουν στον σφραγισμένο φάκελο (και γυρίζουν με το κατέβασμα)");
ok(js.indexOf("var inv = /[#&]km_inv=([0-9a-f]{32})/") > 0 && js.indexOf("var inv = /[#&]km_inv=") < js.indexOf("    var newSrc = refCaptureSrc("), "η πρόσκληση πιάνεται ΠΡΙΝ από κάθε ροή λογαριασμού");
ok(js.includes("      if (localStorage.getItem(LS.reg) || localStorage.getItem(LS.folder)) {\n        setTimeout(function () { alert('Αυτή η συσκευή έχει ήδη"), "🔴 η πρόσκληση ΔΕΝ πατάει λογαριασμό που υπάρχει");
ok(js.includes("      if (r.from) { teamDecide(r.from.p, 'approved'); }") && js.includes("      if (r.from) { teamDecide(r.from.p, 'rejected'); }"), "Αποθήκευση = έγκριση · Διαγραφή = απόρριψη");
ok(js.includes("          if (m.status !== 'invited') { teamRotate(); }") && js.includes("        if (!mgr && b.hist === false) { teamRotate('h'); }"), "🔴 ανάκληση → νέο S · κλείσιμο ιστορικού → νέο H");
ok(js.includes("      row.onclick = memberMode() ? null : function () { lineSheet(r, i); };"), "🔴 το μέλος δεν ανοίγει φύλλο γραμμής (ίδιο με / συσκευασία / διόρθωση)");
ok(js.includes("    if (ab.readOnly && memberMode()) {") && js.includes("send.textContent = '📤 Αποστολή στον ιδιοκτήτη';"), "μέλος: «📤 Αποστολή», όχι «Αποθήκευση»");
ok(js.includes("if (memberMode()) { return mFetch('pro/m/read'"), "μέλος: ο Κώστας AI διαβάζει μέσω /pro/m/read (κόστος στον φάκελο)");
ok(js.includes("      PIDX = memberMode() ? slipIndex() : proOn() ? priceIndex(rows) : null;"), "μέλος: σήμα στην παραλαβή από το δελτίο");
ok(js.includes("return del(r.id);\n    }).then(function () { renderPending(); refreshCount(); })"), "🔴 μετά την αποστολή ΤΙΠΟΤΑ δεν μένει στο κινητό του μέλους");
ok(/SCREENS\.push\('s-team', 's-mstate'\)/.test(js), "s-team, s-mstate στη SCREENS");
const fnames = [...js.matchAll(/^  function ([A-Za-z0-9_$]+)\(/gm)].map((m) => m[1]);
const dup = fnames.filter((n, i) => fnames.indexOf(n) !== i);
ok(!dup.length, "🔴 καμία διπλή δήλωση συνάρτησης" + (dup.length ? " — " + dup.join(", ") : ""));
ok(readFileSync("src/km.js", "utf8").includes('for (const t of ["km_proposals", "km_team_log", "km_members", "km_team"'), "🔴 διαγραφή λογαριασμού → φεύγει και η ομάδα (μέλη, προτάσεις, ίχνος)");
ok(pro.includes('const { handleTeam } = await import("./km_team.js");') && pro.includes("export async function proReadFor("), "km_pro → km_team · κοινή ανάγνωση για Boss και μέλος");
console.log("\n" + pass + " ✔ · " + fail + " ✘");
if (ONLY !== null) process.exit(fail ? 0 : 1);
process.exit(fail ? 1 : 0);
