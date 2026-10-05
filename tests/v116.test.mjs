// v116 · KM-PK-V116 — Πίνακας: διορθώσεις μέτρησης (εύρημα Stavros 5/10/2026)
//   (1) είσοδος με 12 λέξεις = βήμα «login», ΟΧΙ «λογαριασμός» · (2) ΕΝΕΡΓΕΣ συσκευές
//   (3) καθαρές ετικέτες χωνιού · (4) «Μετράω από» με ημερομηνία + ΩΡΑ Κύπρου
//   node --experimental-sqlite tests/v116.test.mjs
//   node --experimental-sqlite tests/v116.test.mjs --mutate=N   (exit 0 = η μετάλλαξη ΠΙΑΣΤΗΚΕ)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let src = readFileSync("src/km.js", "utf8");
let ui = readFileSync("site/pinakas/app.js", "utf8");
let js = readFileSync("site/kostometro/app.js", "utf8");
const html = readFileSync("site/pinakas/index.html", "utf8");
const MUT = [
  // Μ1 · ο server δεν δέχεται το βήμα «login»
  ["src", "oauth_microsoft: 1, login: 1 };", "oauth_microsoft: 1 };"],
  // Μ2 · 🔴 η εφαρμογή ξαναμετράει ΚΑΘΕ είσοδο ως νέο λογαριασμό
  ["js", "        if (j && j.account === 'existing') { funnel('login'); } else { funnel('account'); }", "        funnel('account');"],
  // Μ3 · «ενεργή συσκευή» = πάντα 1 (και σε λογαριασμό χωρίς ενεργή)
  ["src", "(CASE WHEN a.deleted IS NULL AND a.active_device_id IS NOT NULL THEN 1 ELSE 0 END) AS devices_active", "1 AS devices_active"],
  // Μ4 · η ώρα του «Μετράω από» αγνοείται (μετράει από τα μεσάνυχτα)
  ["src", "  if (ymd.length === 16) return cyLocalUtc(ymd.slice(0, 10), ymd.slice(11));", "  if (ymd.length === 16) ymd = ymd.slice(0, 10);"],
  // Μ5 · ο server απορρίπτει ημερομηνία με ώρα (σιωπηλά: καμία φιλτράρισμα)
  ["src", "  if (!/^\\d{4}-\\d{2}-\\d{2}(T([01]\\d|2[0-3]):[0-5]\\d)?$/.test(v)) return \"\";", "  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(v)) return \"\";"],
  // Μ6 · η κάρτα «συσκευές» δείχνει ξανά το ιστορικό αντί για τις ενεργές
  ["ui", "    el('k-dev').textContent = (j.devices.active != null ? j.devices.active : j.devices.distinct);", "    el('k-dev').textContent = j.devices.distinct;"],
  // Μ7 · η εφαρμογή στέλνει «login» αλλά το φρένο «ήδη εγγεγραμμένος» το κόβει
  ["js", "&& step !== 'account' && step !== 'login' && step !== 'key'", "&& step !== 'account' && step !== 'key'"],
];
if (ONLY !== null) {
  const m = MUT[ONLY - 1]; const bag = { src, ui, js };
  if (!m || !bag[m[0]].includes(m[1])) { console.log("Η ΜΕΤΑΛΛΑΞΗ Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(1); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ src, ui, js } = bag);
}
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
const db = new DatabaseSync(":memory:");
for (const f of ["km.sql", "km_h13.sql", "km_v54.sql", "km_mail.sql", "km_feedback.sql", "km_h11b.sql", "km_ref.sql", "km_ref2.sql", "km_verify.sql", "km_support.sql", "km_support_v95.sql", "km_funnel.sql", "km_leads.sql", "km_agent.sql", "km_read.sql"]) {
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
const env = { DB, KM_ADMIN_KEY: "s3cret" };
globalThis.fetch = async () => new Response(JSON.stringify({ ok: true }), { status: 200 });
const call = (path, body) => mod.handleKm(new Request("https://x" + path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}), env, null, path.split("?")[0]);
const NOW = "2026-10-05T18:00:00.000Z";
const pk = async (q) => { const r = await call("/api/km/admin/pinakas?k=s3cret&now=" + encodeURIComponent(NOW) + (q || "")); if (r.status !== 200) throw new Error("pinakas " + r.status); return r.json(); };
let failed = 0;
const check = async (n, f) => { try { await f(); console.log("  ✔ " + n); } catch (e) { failed++; console.log("  ✘ " + n + " — " + e.message); } };
const eq = (g, w, what) => { if (JSON.stringify(g) !== JSON.stringify(w)) throw new Error((what || "") + " βρήκα " + JSON.stringify(g) + " περίμενα " + JSON.stringify(w)); };
console.log(ONLY ? "ΜΕΤΑΛΛΑΓΜΕΝΟ Μ" + ONLY + "\n" : "ΚΑΝΟΝΙΚΟ\n");

// Λογαριασμός Α: 08:00Z (= 11:00 Κύπρου), ΜΙΑ ενεργή συσκευή, ΔΥΟ ταυτότητες στο ιστορικό (έξοδος + είσοδος στο ίδιο tablet)
// Λογαριασμός Β: 10:00Z (= 13:00 Κύπρου), καμία ενεργή συσκευή
const A = "a".repeat(64), B = "b".repeat(64), H = "0".repeat(64);
const ACC = db.prepare("INSERT INTO km_accounts (folder_id, auth_hash, email, created, source, active_device_id) VALUES (?,?,?,?,?,?)");
ACC.run(A, H, "a@x.cy", "2026-10-05T08:00:00.000Z", "direct", "tabNEW");
ACC.run(B, H, "b@x.cy", "2026-10-05T10:00:00.000Z", "fasi3", null);
const L = db.prepare("INSERT INTO km_device_links (install_id, folder_id, created, last_seen) VALUES (?,?,?,?)");
L.run("tabOLD", A, "2026-10-05T08:00:00.000Z", "2026-10-05T08:10:00.000Z");
L.run("tabNEW", A, "2026-10-05T08:20:00.000Z", "2026-10-05T17:00:00.000Z");

await check("Π-1 · 🔴 είσοδος με 12 λέξεις = «login», ΟΧΙ «λογαριασμός» (server + εφαρμογή)", async () => {
  const r1 = await call("/api/km/funnel", { install_id: "dev-login-1", step: "login", src: "direct" });
  eq(r1.status, 200, "login στον server:");
  const r2 = await call("/api/km/funnel", { install_id: "dev-login-1", step: "bogus" });
  eq(r2.status, 400, "άγνωστο βήμα:");
  const f = (await pk()).funnel;
  if (!f.some((r) => r.step === "login" && r.n === 1)) throw new Error("ο Πίνακας δεν φέρνει το login");
  if (f.some((r) => r.step === "account")) throw new Error("η είσοδος μετρήθηκε ως λογαριασμός");
  // εφαρμογή: η απόφαση account/login παίρνεται από την απάντηση του server, ΟΧΙ πριν
  const reg = js.slice(js.indexOf("localStorage.setItem(LS.reg, '1');"), js.indexOf("}).catch(function () { setActiveState(true); return true; });"));
  if (!reg.includes("if (j && j.account === 'existing') { funnel('login'); } else { funnel('account'); }")) throw new Error("η εφαρμογή δεν ξεχωρίζει την είσοδο");
  eq((reg.match(/funnel\('account'\)/g) || []).length, 1, "κλήσεις funnel('account') στο register:");
  if (!/step !== 'account' && step !== 'login'/.test(js)) throw new Error("το φρένο «ήδη εγγεγραμμένος» κόβει το login");
});
await check("Π-2 · 🔴 συσκευές: ΜΙΑ ενεργή ανά λογαριασμό · το ιστορικό χωριστά", async () => {
  const j = await pk();
  eq(j.devices.active, 1, "ενεργές:"); eq(j.devices.distinct, 2, "ιστορικό:");
  const k = await pk("&only=km");
  const a = k.accounts.find((r) => r.email === "a@x.cy"), b = k.accounts.find((r) => r.email === "b@x.cy");
  eq([a.devices, a.devices_active], [2, 1], "Α:"); eq([b.devices, b.devices_active], [0, 0], "Β:");
  if (!ui.includes("el('k-dev').textContent = (j.devices.active != null ? j.devices.active : j.devices.distinct);")) throw new Error("η κάρτα δείχνει ιστορικό");
  if (!ui.includes("'<span>συσκευή <b>' + (r.devices_active || 0) + '</b> ενεργή'")) throw new Error("η γραμμή λογαριασμού δείχνει ιστορικό");
  if (!html.includes('<div class="l">ενεργές συσκευές</div>')) throw new Error("ετικέτα κάρτας");
});
await check("Π-3 · «Μετράω από» με ΩΡΑ Κύπρου: 05/10 12:00 → μόνο ο Β (13:00) · 05/10 → και οι δύο", async () => {
  const t = await pk("&since=2026-10-05T12:00");
  eq(t.since, "2026-10-05T12:00", "since:"); eq(t.totals.live, 1, "ζωντανοί από 12:00:");
  const k = await pk("&since=2026-10-05T12:00&only=km");
  eq(k.accounts.map((r) => r.email), ["b@x.cy"], "λίστα:");
  eq((await pk("&since=2026-10-05T11:00")).totals.live, 2, "από 11:00 (ακριβώς ο Α):");
  eq((await pk("&since=2026-10-05")).totals.live, 2, "μόνο ημερομηνία:");
});
await check("Π-4 · 🔴 σκουπίδια στην ώρα = ΚΑΝΕΝΑ φίλτρο, ποτέ σφάλμα", async () => {
  for (const bad of ["2026-10-05T24:00", "2026-10-05T12:60", "2026-10-05T1200", "2026-02-30T10:00", "2026-10-05T12:00:00", "x'--"]) {
    const j = await pk("&since=" + encodeURIComponent(bad));
    eq(j.since, null, "since(" + bad + "):"); eq(j.totals.live, 2, "live(" + bad + "):");
  }
});
await check("Π-5 · οθόνη: ημερομηνία + ώρα · στήλες χωνιού με καθαρά ονόματα", async () => {
  if (!html.includes('<input type="datetime-local" id="since">')) throw new Error("χωρίς ώρα");
  if (!ui.includes("return /^\\d{4}-\\d{2}-\\d{2}(T\\d{2}:\\d{2})?$/.test(v) ? v : '';")) throw new Error("η μνήμη πετάει την ώρα");
  if (!ui.includes("var vi = v && v.length === 10 ? v + 'T00:00' : v;")) throw new Error("η παλιά τιμή (μόνο ημερομηνία) χάνεται");
  const th = (html.slice(html.indexOf("Χωνί εγγραφής")).match(/<thead>[\s\S]*?<\/thead>/) || [""])[0];
  for (const s of ["άνοιξαν (browser)", "πάτησαν Σύνδεση Google", "ΝΕΟΣ λογαριασμός", "είσοδος με 12 λέξεις"]) if (!th.includes(s)) throw new Error("λείπει στήλη «" + s + "»");
  if (!/var FN = \['open', 'email', 'oauth_google', 'oauth_microsoft', 'code', 'account', 'login', 'key', 'key_skip'\]/.test(ui)) throw new Error("FN");
});
await check("Π-6 · v117: η ετικέτα «Μετράω από» σε δική της γραμμή — η ώρα δεν κόβεται στο κινητό", async () => {
  if (!/\.since-row \{[^}]*flex-wrap: wrap/.test(html)) throw new Error("χωρίς αναδίπλωση");
  if (!/\.since-lab \{[^}]*flex-basis: 100%/.test(html)) throw new Error("η ετικέτα μοιράζεται τη γραμμή");
});
console.log(failed ? "\nΚΟΚΚΙΝΟ: " + failed : "\n✔ ΟΛΑ ΠΕΡΑΣΑΝ");
process.exit(ONLY !== null ? (failed ? 0 : 1) : (failed ? 1 : 0));
