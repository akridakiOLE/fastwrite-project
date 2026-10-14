// KM-PRO-F4-CHECK (14/10/2026) · ΤΟ ΓΡΑΜΜΑΤΟΚΙΒΩΤΙΟ ΑΠΟ ΑΚΡΗ ΣΕ ΑΚΡΗ — Boss (κινητό) + λογιστής (FastWrite).
//   KM_F4_MODE=staging (προεπιλογή, Windows από .bat): staging Worker + αληθινή ανάγνωση PRO.
//   KM_F4_MODE=local: ο τοπικός δίδυμος (tools/pro/f4local.mjs) — ίδιος κώδικας, χωρίς δίκτυο· η ανάγνωση δίνεται έτοιμη.
//   Ψεύτικη ΜΟΝΟ η κάμερα. Το FastWrite τρέχει ΑΛΗΘΙΝΟ (main_api.py + km_mailbox.py) σε τοπική θύρα.
//   1 Boss: λογαριασμός + PRO + 2 τιμολόγια (ΟΡΙΖΩΝ, ΑΚΤΗ)
//   2 Boss: «👥 Ομάδα → 📒 Λογιστής → Πρόσκληση» → σύνδεσμος
//   3 FastWrite: Kostometro → Σύνδεση (σύνδεσμος) → περιμένει → ο Boss ανοίγει την εφαρμογή → ενεργό
//   4 FastWrite: «Λήψη τώρα» → 2 τιμολόγια με γραμμές + φωτογραφία · αναζήτηση/σελιδοποίηση · έγγραφο για Xero
//   5 FastWrite: διόρθωση (τιμή + σύνολο) → ισχύει αμέσως → φτάνει στο κινητό ΧΩΡΙΣ πάτημα → «↩ Αναίρεση» → γυρίζει στο FastWrite
//   6 Boss: 3ο τιμολόγιο ΑΚΤΗ, «G-77 ίδιο με ΓΑΛΑ» → FastWrite: «⚠ άλλαξε η αντιστοίχιση» στο παλιό ΑΚΤΗ → «Το είδα»
//   7 Boss: ανάκληση → FastWrite: «η πρόσβαση έκλεισε», τα τιμολόγια μένουν
import { createRequire } from "node:module";
import { randomBytes, createHash } from "node:crypto";
import { writeFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { execSync, spawn, fork } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MODE = process.env.KM_F4_MODE || "staging";
const ROOT = process.env.KM_F4_ROOT || join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(join(process.env.KM_PW_DIR || join(ROOT, "node_modules"), "package.json"));
const { chromium } = require("playwright");
const STAMP = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
const OUT = process.env.KM_F4_OUT || join(ROOT, "Claude outputs", "pro_f4check", STAMP);
mkdirSync(OUT, { recursive: true });
const PY = process.env.KM_PY || (process.platform === "win32" ? "python" : "python3");
const FW_PORT = Number(process.env.KM_F4_FW_PORT || 8766);
const FW = "http://127.0.0.1:" + FW_PORT;
const LOCAL_PORT = 8788;
const BASE = MODE === "local" ? "http://127.0.0.1:" + LOCAL_PORT : "https://fastwrite-staging.stavrosfkallenos.workers.dev";
const R = { stamp: STAMP, mode: MODE, checks: [], steps: [], api: [], errors: [], cards: {} };
let pass = 0, fail = 0;
const save = () => {
  writeFileSync(join(OUT, "report.json"), JSON.stringify(R, null, 1));
  writeFileSync(join(OUT, "report.txt"), R.steps.join("\r\n") + "\r\n\r\n" + R.checks.map((c) => (c.ok ? "OK   " : "FAIL ") + c.m + (c.ok ? "" : "  <<  " + c.got)).join("\r\n") + "\r\n\r\n" + pass + " OK / " + fail + " FAIL\r\n");
};
const step = (m) => { const s = new Date().toISOString().slice(11, 19) + " " + m; R.steps.push(s); console.log(s); save(); };
const ok = (c, m, got) => { if (c) pass++; else fail++; R.checks.push({ ok: !!c, m, got: c ? undefined : String(got === undefined ? "" : got).slice(0, 900) }); console.log((c ? "  OK   " : "  FAIL ") + m); save(); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, what) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (e) {} await sleep(500); } throw new Error("χρονικό όριο: " + what); };

// ── backend ──
let local = null;
async function d1(sql) {
  if (MODE === "local") return new Promise((res, rej) => { local.once("message", (m) => (m.ok ? res() : rej(new Error(m.error)))); local.send({ sql }); });
  return execSync(`npx --yes wrangler d1 execute DB --env staging --remote --yes --command "${sql.replace(/\s*\n\s*/g, " ").trim()}"`, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
async function startLocal() {
  if ((await fetch(BASE + "/kostometro/").catch(() => ({ ok: false }))).ok) throw new Error("η θύρα " + LOCAL_PORT + " είναι πιασμένη — κλείσ' την πρώτα");
  const dir = join(OUT, "_local");
  local = fork(join(ROOT, "tools", "pro", "f4local.mjs"), ["--port=" + LOCAL_PORT, "--dir=" + dir], { stdio: ["ignore", "pipe", "pipe", "ipc"] });
  local.stdout.on("data", (b) => { R.steps.push("   [local] " + String(b).trim().slice(0, 200)); });
  local.stderr.on("data", (b) => { R.errors.push("[local] " + String(b).trim().slice(0, 300)); });
  await until(async () => (await fetch(BASE + "/kostometro/").catch(() => ({ ok: false }))).ok, 20000, "τοπικός Worker");
  R.localDir = dir;
}
let fwProc = null;
async function startFastWrite() {
  if ((await fetch(FW + "/health").catch(() => ({ ok: false }))).ok) throw new Error("η θύρα " + FW_PORT + " είναι πιασμένη από παλιό FastWrite — κλείσ' το πρώτα");
  const data = join(OUT, "_fastwrite");
  mkdirSync(data, { recursive: true });
  const code = "import sys; sys.path.insert(0, r'" + ROOT + "'); import main_api; main_api.app.run(host='127.0.0.1', port=" + FW_PORT + ", threaded=True, use_reloader=False)";
  fwProc = spawn(PY, ["-c", code], { cwd: ROOT, env: Object.assign({}, process.env, { FASTWRITE_BASE_DIR: data, FASTWRITE_KM_MAILBOX: "1", FASTWRITE_KM_NOTHREAD: "1",
    FASTWRITE_MODE: "web", FASTWRITE_KM_ORIGIN: BASE, PYTHONIOENCODING: "utf-8" }), stdio: ["ignore", "pipe", "pipe"] });
  const log = []; fwProc.stdout.on("data", (b) => log.push(String(b))); fwProc.stderr.on("data", (b) => log.push(String(b)));
  R.fwLog = log;
  await until(async () => (await fetch(FW + "/health").catch(() => ({ ok: false }))).ok, 90000, "FastWrite (Flask) — " + log.join("").slice(-400));
  R.fwData = data;
}

// ── τιμολόγια ──
const eur = (v) => v.toFixed(2).replace(".", ",");
function invHtml(v) {
  const net = Math.round(v.lines.reduce((a, l) => a + l[3] * l[4], 0) * 100) / 100;
  const vat = Math.round(net * 0.19 * 100) / 100, tot = Math.round((net + vat) * 100) / 100;
  v.net = net; v.vat = vat; v.total = tot;
  const [y, m, d] = v.date.split("-");
  return `<html><body style="margin:0;width:1240px;height:1754px;background:#fff;font-family:Arial;color:#000"><div style="padding:70px 80px">
<div style="font-size:52px;font-weight:bold">${v.issuer}</div><div style="font-size:30px">Λεωφ. Μακαρίου 10, Λευκωσία · Αρ. ΦΠΑ ${v.vatno}</div>
<div style="font-size:44px;font-weight:bold;margin-top:60px">ΤΙΜΟΛΟΓΙΟ ${v.no}</div><div style="font-size:34px">Ημερομηνία: ${d}/${m}/${y}</div>
<table style="width:100%;border-collapse:collapse;margin-top:60px;font-size:32px" border="2" cellpadding="14">
<tr style="background:#eee"><th>Κωδ.</th><th>Περιγραφή</th><th>Μον.</th><th>Ποσ.</th><th>Τιμή</th><th>Αξία</th><th>ΦΠΑ%</th></tr>
${v.lines.map((l) => `<tr><td>${l[0]}</td><td>${l[1]}</td><td>${l[2]}</td><td align="right">${l[3]}</td><td align="right">${eur(l[4])}</td><td align="right">${eur(l[3] * l[4])}</td><td align="right">19</td></tr>`).join("")}
</table><table style="margin-left:auto;margin-top:50px;font-size:36px" cellpadding="10"><tr><td>Καθαρό</td><td align="right">${eur(net)}</td></tr>
<tr><td>ΦΠΑ 19%</td><td align="right">${eur(vat)}</td></tr><tr><td><b>ΣΥΝΟΛΟ</b></td><td align="right"><b>${eur(tot)}</b></td></tr></table></div></body></html>`;
}
const INV = [
  { sup: "ΟΡΙΖΩΝ", issuer: "ΟΡΙΖΩΝ ΤΡΟΦΙΜΑ ΛΤΔ", vatno: "10123456X", no: "ΤΔΑ 4411", date: "2026-10-02", lines: [["K100", "ΓΑΛΑ ΦΡΕΣΚΟ 1LT", "ΛΤ", 10, 1.50], ["K200", "ΑΛΕΥΡΙ ΣΑΚΙ 25KG", "ΤΕΜ", 2, 20.00]] },
  { sup: "ΑΚΤΗ", issuer: "ΑΚΤΗ ΔΙΑΝΟΜΕΣ ΛΤΔ", vatno: "10987654K", no: "INV-0777", date: "2026-10-05", lines: [["G-77", "ΓΑΛΑ ΦΡΕΣΚΟ 6x1LT", "ΚΙΒ", 2, 8.70]] },
  { sup: "ΑΚΤΗ", issuer: "ΑΚΤΗ ΔΙΑΝΟΜΕΣ ΛΤΔ", vatno: "10987654K", no: "INV-0801", date: "2026-10-10", lines: [["G-77", "ΓΑΛΑ ΦΡΕΣΚΟ 6x1LT", "ΚΙΒ", 3, 8.40]] },
];
INV.forEach((v) => invHtml(v));
let readN = 0;
async function stubRead(page) {   // ΜΟΝΟ local: η ανάγνωση PRO δίνεται έτοιμη, στο ΙΔΙΟ σχήμα (proNormalize του server)
  const { proNormalize } = await import(pathToFileURL(join(ROOT, "src", "km_pro.js")).href);
  await page.route("**/api/km/pro/read", async (route) => {
    const v = INV[Math.min(readN, INV.length - 1)]; readN++;
    const raw = { supplier: { name: v.issuer, vat_no: v.vatno }, number: v.no, date: v.date, net: v.net, vat: v.vat, total: v.total,
                  lines: v.lines.map((l) => ({ code: l[0], desc: l[1], unit: l[2], qty: l[3], unit_price: l[4], disc_pct: null, line_net: Math.round(l[3] * l[4] * 100) / 100, vat_pct: 19 })) };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(Object.assign({ ok: true }, proNormalize(raw))) });
  });
}
const FAKE_CAM = `(() => {
  const cv = document.createElement('canvas'); cv.width = 1240; cv.height = 1754;
  const cx = cv.getContext('2d'); let im = null;
  const draw = () => { cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); if (im) { cx.drawImage(im, 0, 0, cv.width, cv.height); } };
  setInterval(draw, 100); draw();
  window.__setFake = (url) => new Promise((res) => { const i = new Image(); i.onload = () => { im = i; draw(); res(true); }; i.src = url; });
  const gum = () => { draw(); return Promise.resolve(cv.captureStream(10)); };
  try { if (!navigator.mediaDevices) { Object.defineProperty(navigator, 'mediaDevices', { value: {} }); } navigator.mediaDevices.getUserMedia = gum; } catch (e) {}
})();`;
function hook(page, tag, base) {
  page.__prompts = [];
  page.__confirms = [];
  page.on("dialog", async (dg) => {
    R.steps.push("   [" + tag + "] διάλογος " + dg.type() + ": " + dg.message().slice(0, 140).replace(/\n/g, " "));
    if (dg.type() === "prompt") await dg.accept(page.__prompts.length ? page.__prompts.shift() : (dg.defaultValue() || ""));
    else { page.__confirms.push(dg.message()); await dg.accept(); }
  });
  page.on("pageerror", (e) => R.errors.push("[" + tag + "] pageerror: " + e.message));
  page.on("response", (r) => { const u = r.url(); if (u.includes("/api/km")) R.api.push(tag + " " + new Date().toISOString().slice(11, 19) + " " + r.request().method() + " " + u.replace(base, "").replace(/k=[0-9a-f]+/, "k=…") + " → " + r.status()); });
  let n = 0;
  page.shot = async (name) => { n++; await sleep(450); await page.screenshot({ path: join(OUT, tag + "_" + String(n).padStart(2, "0") + "_" + name + ".png") }).catch(() => {}); };
}
async function newPhone(browser) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, locale: "el-GR", timezoneId: "Asia/Nicosia" });
  await ctx.addInitScript(FAKE_CAM);
  const page = await ctx.newPage();
  hook(page, "boss", BASE);
  page.screens = () => page.evaluate(() => [...document.querySelectorAll("section.screen")].filter((s) => !s.hidden).map((s) => s.id).join(","));
  return page;
}
async function backToCam(page) {
  for (let i = 0; i < 6 && (await page.screens()) !== "s-cam"; i++) { const b = await page.$("section.screen:not([hidden]) [data-back]"); if (b) await b.click(); else break; await sleep(600); }
}
async function openMenu(page, go) {
  await backToCam(page);
  await page.click("#btn-menu");
  await until(async () => (await page.screens()) === "s-menu", 8000, "μενού");
  if (go) { await page.click(`[data-go="${go}"]`); await until(async () => (await page.screens()) === go, 8000, go); }
}
async function shoot(page, imgPage, v) {
  await imgPage.setContent(invHtml(v));
  const png = (await imgPage.screenshot({ type: "png" })).toString("base64");
  await page.evaluate((u) => window.__setFake(u), "data:image/png;base64," + png);
  await until(() => page.evaluate(() => document.getElementById("vid").videoWidth > 0), 15000, "βίντεο");
  await sleep(600);
  await page.click("#shutter");
  await until(() => page.evaluate(() => !document.getElementById("preview").hidden), 8000, "προεπισκόπηση");
  await page.click("#prev-ok");
  await until(async () => (await page.screens()) === "s-who", 8000, "Προμηθευτής");
  await page.click("#who-date-edit");
  await page.evaluate((d) => { const x = document.getElementById("who-date-inp"); x.value = d; x.dispatchEvent(new Event("change", { bubbles: true })); }, v.date);
  const have = await page.locator("#sup-list button.sup", { hasText: v.sup }).count();
  if (have) { await page.locator("#sup-list button.sup", { hasText: v.sup }).first().click(); }
  else { await page.click("#who-tab-new"); await page.fill("#in-sup", v.sup); await page.click("#add-sup"); }
  await until(async () => (await page.screens()) === "s-cam", 8000, "καταχώρηση");
}
const dmy = (iso) => iso.split("-").reverse().join("/");
const cardOf = (page, v) => page.locator("#pend-body .card").filter({ hasText: dmy(v.date) });
async function readAndMaybeSave(page, v, tag, beforeSave) {
  await openMenu(page, "s-pend");
  const card = cardOf(page, v);
  await until(async () => (await card.locator(".pro-ln").count()) >= v.lines.length, 150000, "ανάγνωση " + tag);
  if (beforeSave) await beforeSave(card);
  const inputs = card.locator("input:not([type=checkbox])");
  const vals = await inputs.evaluateAll((xs) => xs.map((x) => x.value));
  if (!vals.some((x) => x.replace(",", ".") === String(v.total))) {   // ο Κώστας δεν έγραψε σύνολο → το γράφουμε εμείς
    await inputs.nth(2).fill(eur(v.total));
  }
  await card.getByRole("button", { name: "Αποθήκευση", exact: true }).click();
  await until(async () => (await card.count()) === 0, 8000, "αποθήκευση " + tag);
  await backToCam(page);
}
// FastWrite: ό,τι θα πατούσε ο λογιστής
async function fwSync(fw) {
  await fw.click("#km-sync");
  await until(async () => (await fw.locator("#km-sync").innerText()).includes("Λήψη τώρα") && !(await fw.locator("#km-sync").isDisabled()), 60000, "Λήψη τώρα");
  await sleep(400);
}
const fwApi = (fw, method, path, body) => fw.evaluate(([m, p, b]) => fetch(p, { method: m, credentials: "include", headers: b ? { "Content-Type": "application/json" } : {}, body: b ? JSON.stringify(b) : undefined }).then((r) => r.json()), [method, path, body]);

async function main() {
  step("ΞΕΚΙΝΑ · mode=" + MODE + " · " + OUT);
  if (MODE === "local") await startLocal();
  await startFastWrite();
  step("FastWrite σε " + FW + " · Worker " + BASE);
  const email = "km-f4-" + STAMP.toLowerCase() + "@example.com";
  const k = randomBytes(32).toString("hex"), hsh = createHash("sha256").update(k).digest("hex"), t = new Date().toISOString();
  await d1(`DELETE FROM km_oauth_states WHERE provider = 'test:${email}'; INSERT INTO km_oauth_states (state_hash, provider, verifier, nonce, ip_h, created) VALUES ('${hsh}', 'test:${email}', '-', '-', NULL, '${t}');`);
  const browser = await chromium.launch({ headless: true });
  const boss = await newPhone(browser);
  if (MODE === "local") await stubRead(boss);
  const imgPage = await (await browser.newContext()).newPage();
  await imgPage.setViewportSize({ width: 1240, height: 1754 });

  // ── 1 · BOSS: λογαριασμός + PRO + 2 τιμολόγια ──
  await boss.goto(BASE + "/api/km/auth/test/callback?k=" + k, { waitUntil: "domcontentloaded" });
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    await sleep(800); const s = await boss.screens();
    if (s === "s-key") await boss.click("#skip-key"); else if (s === "s-perm") await boss.click("#go-perm"); else if (s === "s-cam") break;
  }
  const folder = await boss.evaluate(() => localStorage.getItem("km_folder"));
  ok(/^[0-9a-f]{64}$/.test(folder || ""), "Boss: λογαριασμός", folder);
  const tg = new Date().toISOString();
  await d1(`INSERT INTO km_pro (folder_id, plan, status, started_at, until, source, updated_at) VALUES ('${folder}', 'pro', 'test', '${tg}', NULL, 'admin', '${tg}') ON CONFLICT(folder_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at;`);
  await boss.reload({ waitUntil: "domcontentloaded" });
  await until(async () => (await boss.screens()) === "s-cam", 30000, "κάμερα PRO");
  await until(() => boss.evaluate(() => { try { return JSON.parse(localStorage.getItem("km_pro")).pro === true; } catch (e) { return false; } }), 15000, "PRO");
  R.version = await boss.evaluate(() => fetch("/kostometro/version.json", { cache: "no-store" }).then((r) => r.json()).then((j) => j.v).catch(() => null));
  step("Boss PRO · έκδοση " + R.version);
  for (const v of INV.slice(0, 2)) {
    await shoot(boss, imgPage, v);
    await readAndMaybeSave(boss, v, v.sup + " " + v.date);
    step("Boss · αποθήκευσε " + v.sup + " " + v.date);
  }

  // ── 2 · BOSS: πρόσκληση λογιστή ──
  await openMenu(boss);
  await boss.click("#m-team-row");
  await until(async () => (await boss.locator("#acct-inv").count()) === 1, 40000, "Ομάδα → Λογιστής");
  await boss.shot("team_acct_empty");
  ok(/📒 Λογιστής \(FastWrite\)/.test(await boss.locator("#team-body").innerText()), "Boss: «📒 Λογιστής (FastWrite)» μέσα στην Ομάδα");
  boss.__prompts.push("Λογιστήριο Χριστοφή", "Ταβέρνα Ακτή");
  await boss.click("#acct-inv");
  await boss.waitForSelector("#pro-sheet #acct-link", { timeout: 10000 });
  const link = (await boss.locator("#acct-link").innerText()).trim();
  ok(/\/kostometro\/#km_acct=[0-9a-f]{32}$/.test(link), "πρόσκληση λογιστή: σύνδεσμος μίας χρήσης", link);
  await boss.shot("acct_invite");
  await boss.click("#pro-sheet [data-x]");
  const team1 = await boss.evaluate(() => JSON.parse(localStorage.getItem("km_team") || "null"));
  ok(team1 && /^[0-9a-f]{64}$/.test(team1.ak) && team1.av === 1 && team1.biz === "Ταβέρνα Ακτή", "Boss: κλειδί ανάγνωσης A (έκδοση 1) + όνομα επιχείρησης — στη συσκευή, μέσα στην ομάδα", JSON.stringify(team1 && { av: team1.av, biz: team1.biz, ak: !!team1.ak }));

  // ── 3 · FASTWRITE: σύνδεση ──
  const fctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "el-GR", timezoneId: "Asia/Nicosia" });
  const fw = await fctx.newPage();
  hook(fw, "fastwrite", FW);
  await fw.goto(FW + "/ui/login", { waitUntil: "domcontentloaded" });
  const reg = await fwApi(fw, "POST", "/api/auth/register", { username: "logistis", password: "logistis123", email: "acct@example.com" });
  ok(reg && reg.success, "FastWrite: τοπικός χρήστης λογιστή", JSON.stringify(reg));
  await fw.goto(FW + "/ui#kostometro", { waitUntil: "domcontentloaded" });
  await fw.evaluate(() => { try { localStorage.setItem("fw_tour_done", "1"); } catch (e) {} });
  await fw.evaluate(() => showPage("kostometro", false));
  await until(async () => await fw.locator("#km-connect").isVisible(), 15000, "FastWrite: φόρμα σύνδεσης (χωρίς συνδέσεις)");
  await fw.shot("connect_empty");
  await fw.fill("#km-c-link", link);
  await fw.fill("#km-c-office", "Christofi & Co");
  await fw.click("#km-c-go");
  await until(async () => /✓ Συνδέθηκε/.test(await fw.locator("#km-c-msg").innerText()), 20000, "σύνδεση FastWrite");
  await until(async () => /περιμένει ενεργοποίηση/.test(await fw.locator("#km-links").innerText()), 15000, "περιμένει ενεργοποίηση");
  await fw.shot("connected_waiting");
  ok(true, "FastWrite: συνδέθηκε με τον σύνδεσμο — «περιμένει ενεργοποίηση από το κινητό του πελάτη»");
  const fwCode = ((await fw.locator("#km-links .km-code b").innerText().catch(() => "")) || "").trim();
  ok(/^[0-9A-F]{4}-[0-9A-F]{4}$/.test(fwCode), "FastWrite: δείχνει κωδικό επιβεβαίωσης (" + fwCode + ")", fwCode);
  // ο Boss ανοίγει την Ομάδα → ΒΛΕΠΕΙ ποιος μπήκε → «✓ Ενεργοποίηση» → ο κύκλος δίνει το A και στέλνει τα γράμματα
  await backToCam(boss); await openMenu(boss); await boss.click("#m-team-row");
  await until(async () => { if ((await boss.locator(".acct-card .acct-ok").count()) === 1) return true; await backToCam(boss); await openMenu(boss); await boss.click("#m-team-row"); await sleep(2500); return false; }, 60000, "Boss: «✓ Ενεργοποίηση»");
  await until(async () => /Κωδικός επιβεβαίωσης: [0-9A-F]{4}-/.test(await boss.locator(".acct-card .acct-who").innerText()), 10000, "κωδικός στο κινητό");
  const who = (await boss.locator(".acct-card .acct-who").innerText()).replace(/\s+/g, " ");
  R.cards["Boss · ποιος μπήκε"] = who;
  await boss.shot("acct_confirm");
  ok(who.includes(fwCode) && /FastWrite · Windows/.test(who), "🔴 ο Boss βλέπει ΠΡΙΝ δώσει πρόσβαση: συσκευή + τον ΙΔΙΟ κωδικό επιβεβαίωσης με το FastWrite", who + " ≠ " + fwCode);
  const st1 = await fwApi(fw, "GET", "/api/km/status");
  ok(st1.links[0].status === "joined", "🔴 χωρίς το πάτημα του Boss ο λογιστής ΔΕΝ έχει κλειδί (μένει «joined»)", JSON.stringify(st1.links[0].status));
  await boss.click(".acct-card .acct-ok");
  await until(async () => {
    const tx = await boss.locator("#team-body").innerText();
    if (/🟢 Συνδεδεμένος/.test(tx) && /γραμματοκιβώτιο του λογιστή: [1-9]/.test(tx)) return true;
    await backToCam(boss); await openMenu(boss); await boss.click("#m-team-row"); await sleep(3000); return false;
  }, 120000, "Boss: ο λογιστής ενεργός + γράμματα");
  await boss.shot("team_acct_active");
  const bossTeam = (await boss.locator("#team-body").innerText()).replace(/\s+/g, " ");
  R.cards["Boss · Ομάδα"] = bossTeam;
  ok(/Λογιστήριο Χριστοφή · Christofi & Co/.test(bossTeam), "Boss: βλέπει «Λογιστήριο Χριστοφή · Christofi & Co» — 🟢 Συνδεδεμένος", bossTeam);

  // ── 4 · FASTWRITE: λήψη ──
  await until(async () => { await fwSync(fw); return (await fw.locator("#km-table tr.km-row").count()) >= 2; }, 120000, "FastWrite: 2 τιμολόγια");
  await fw.shot("invoices");
  const rows = (await fw.locator("#km-table").innerText()).replace(/\s+/g, " ");
  R.cards["FastWrite · τιμολόγια"] = rows;
  ok(/ΟΡΙΖΩΝ/.test(rows) && /ΑΚΤΗ/.test(rows) && /Ταβέρνα Ακτή/.test(rows), "FastWrite: 2 τιμολόγια της «Ταβέρνας Ακτή» (ΟΡΙΖΩΝ, ΑΚΤΗ)", rows);
  ok(/65,45/.test(rows) && /20,71/.test(rows), "FastWrite: σύνολα 65,45 και 20,71", rows);
  ok(/Σελίδα 1 από 1 · 2 αποτελέσματα/.test(await fw.locator("#km-pager").innerText()), "σελιδοποίηση: «Σελίδα 1 από 1 · 2 αποτελέσματα»");
  const st0 = await fwApi(fw, "GET", "/api/km/status");
  ok(st0.links.length === 1 && st0.links[0].status === "active" && st0.links[0].biz === "Ταβέρνα Ακτή", "FastWrite: σύνδεση ενεργή", JSON.stringify(st0));
  // λεπτομέρεια ΟΡΙΖΩΝ
  await fw.locator("#km-table tr.km-row", { hasText: "ΟΡΙΖΩΝ" }).first().click();
  await fw.waitForSelector("#km-detail #km-lines", { timeout: 10000 });
  await until(() => fw.evaluate(() => { const i = document.querySelector("#km-detail img.km-photo"); return i && i.complete && i.naturalWidth > 500; }), 15000, "φωτογραφία");
  await fw.shot("detail_oriz");
  const det = (await fw.locator("#km-detail").innerText()).replace(/\s+/g, " ");
  R.cards["FastWrite · ΟΡΙΖΩΝ"] = det;
  const lnVals = await fw.locator("#km-detail .km-l").evaluateAll((xs) => xs.map((x) => x.getAttribute("data-f") + "=" + x.value));
  ok(lnVals.includes("code=K100") && lnVals.includes("qty=10") && lnVals.includes("unit_price=1,5") && lnVals.includes("code=K200"), "λεπτομέρεια: 2 γραμμές με κωδικό, ποσότητα, τιμή", lnVals.join(" "));
  ok(true, "λεπτομέρεια: η φωτογραφία του τιμολογίου φαίνεται (ο λογιστής βλέπει ΠΑΝΤΑ τη φωτογραφία)");
  const inv1 = await fwApi(fw, "GET", "/api/km/invoices?q=" + encodeURIComponent("οριζων"));
  const docId = inv1.items[0].doc_id;
  const doc = await fwApi(fw, "GET", "/api/documents/" + docId);
  const rd = doc.result_data || {};
  ok(doc.status === "Pending" && rd.supplier_name === "ΟΡΙΖΩΝ" && rd.invoice_number && rd.line_items && rd.line_items.length === 2, "Xero ως έχει: κανονικό έγγραφο FastWrite «Pending» με προμηθευτή, αριθμό και 2 γραμμές (→ Push to Xero)", JSON.stringify({ st: doc.status, sup: rd.supplier_name, n: rd.invoice_number, li: (rd.line_items || []).length }));
  const ls = await fwApi(fw, "GET", "/api/km/lines?q=" + encodeURIComponent("γαλα"));
  ok(ls.total === 2, "αναζήτηση γραμμών «γαλα» (χωρίς τόνους) → 2", JSON.stringify(ls.total));
  await fw.click("#km-detail .modal-close");

  // ── 5 · ΔΙΟΡΘΩΣΗ ΛΟΓΙΣΤΗ → κινητό χωρίς πάτημα → Αναίρεση ──
  await fw.locator("#km-table tr.km-row", { hasText: "ΟΡΙΖΩΝ" }).first().click();
  await fw.waitForSelector("#km-detail #km-lines", { timeout: 10000 });
  await fw.fill('#km-detail .km-l[data-i="0"][data-f="unit_price"]', "1,55");
  await fw.fill('#km-detail .km-l[data-i="0"][data-f="line_net"]', "15,5");
  await fw.fill('#km-detail .km-h[data-f="net"]', "55,5");
  await fw.fill('#km-detail .km-h[data-f="vat"]', "10,55");
  await fw.fill('#km-detail .km-h[data-f="total"]', "66,05");
  await fw.click("#km-save");
  await until(async () => /Η διόρθωσή σου ισχύει/.test(await fw.locator("#km-detail").innerText()), 15000, "διόρθωση ισχύει");
  await fw.shot("fix_saved");
  const doc2 = await fwApi(fw, "GET", "/api/documents/" + docId);
  ok(doc2.result_data.total === 66.05 && doc2.result_data.line_items[0].unit_price === 1.55, "🔴 η διόρθωση ισχύει ΑΜΕΣΩΣ στο FastWrite και στο έγγραφο (Xero/εξαγωγές)", JSON.stringify({ t: doc2.result_data.total, p: doc2.result_data.line_items[0].unit_price }));
  await fw.click("#km-detail .modal-close");
  await fwSync(fw);
  // κινητό: περνά ΧΩΡΙΣ πάτημα
  await backToCam(boss); await openMenu(boss); await boss.click("#m-team-row");   // ο κύκλος τρέχει και μόνος του κάθε 30″
  const recOf = (sup) => boss.evaluate((s) => new Promise((res) => { const q = indexedDB.open("kostometrisi", 1); q.onsuccess = () => { const out = []; q.result.transaction("shots").objectStore("shots").openCursor().onsuccess = (e) => { const c = e.target.result; if (c) { if (c.value.supplier === s && c.value.total !== null) out.push({ id: c.value.id, total: c.value.total, p0: c.value.lines && c.value.lines[0] && c.value.lines[0].unit_price, afix: c.value.afix || null, date: c.value.invDate }); c.continue(); } else res(out); }; }; }), sup);
  await until(async () => { const r = await recOf("ΟΡΙΖΩΝ"); return r.length && r[0].afix && r[0].afix.length; }, 120000, "Boss: η διόρθωση πέρασε");
  const rb = (await recOf("ΟΡΙΖΩΝ"))[0];
  R.cards["Boss · ΟΡΙΖΩΝ μετά τη διόρθωση"] = JSON.stringify({ total: rb.total, p0: rb.p0, by: rb.afix[0].by, what: rb.afix[0].what });
  ok(rb.total === 66.05 && rb.p0 === 1.55 && rb.afix[0].st === "applied" && rb.afix[0].by === "Λογιστήριο Χριστοφή", "🔴 η διόρθωση πέρασε στο κινητό ΧΩΡΙΣ πάτημα (σύνολο 66,05 · τιμή 1,55 · «Λογιστήριο Χριστοφή»)", R.cards["Boss · ΟΡΙΖΩΝ μετά τη διόρθωση"]);
  // FastWrite: «πέρασε»
  await until(async () => { await fwSync(fw); return /διόρθωση πέρασε/.test(await fw.locator("#km-table").innerText()); }, 120000, "FastWrite: διόρθωση πέρασε");
  ok(true, "FastWrite: «✏️ διόρθωση πέρασε»");
  // Boss: Προμηθευτές → ΟΡΙΖΩΝ → τιμολόγιο → «↩ Αναίρεση»
  await openMenu(boss, "s-sup");
  await boss.locator("section.screen:not([hidden]) button", { hasText: "ΟΡΙΖΩΝ" }).first().click();
  await sleep(800);
  await boss.locator("section.screen:not([hidden]) button.inv").first().click();
  await until(async () => (await boss.screens()) === "s-shot", 8000, "τιμολόγιο");
  await boss.waitForSelector("#shot-body .acct-fix", { timeout: 8000 });
  await boss.locator("#shot-body .acct-fix").scrollIntoViewIfNeeded();
  await boss.shot("shot_fixed");
  const fixTxt = (await boss.locator("#shot-body .acct-fix").innerText()).replace(/\s+/g, " ");
  R.cards["Boss · σήμανση"] = fixTxt;
  ok(/✏️ Διορθώθηκε από τον λογιστή «Λογιστήριο Χριστοφή»/.test(fixTxt) && /↩ Αναίρεση/.test(fixTxt), "Boss: «✏️ Διορθώθηκε από τον λογιστή» + «↩ Αναίρεση» στο τιμολόγιο", fixTxt);
  await boss.click("#shot-body .acct-undo");
  await until(async () => { const r = await recOf("ΟΡΙΖΩΝ"); return r[0].afix[0].st === "undone"; }, 15000, "αναίρεση");
  await boss.shot("shot_undone");
  const ru = (await recOf("ΟΡΙΖΩΝ"))[0];
  ok(ru.total === 65.45 && ru.p0 === 1.5, "Boss: «↩ Αναίρεση» → το τιμολόγιο γύρισε (65,45 · 1,50)", JSON.stringify(ru));
  await until(async () => { await fwSync(fw); return /αναιρέθηκε/.test(await fw.locator("#km-table").innerText()); }, 120000, "FastWrite: αναιρέθηκε");
  const doc3 = await fwApi(fw, "GET", "/api/documents/" + docId);
  ok(doc3.result_data.total === 65.45 && doc3.result_data.line_items[0].unit_price === 1.5, "🔴 η αναίρεση γύρισε και στο FastWrite (65,45 · 1,50) με σήμανση «↩ αναιρέθηκε»", JSON.stringify({ t: doc3.result_data.total }));
  await fw.shot("undone");
  await backToCam(boss);

  // ── 6 · «ίδιο με» στο κινητό → «⚠ άλλαξε η αντιστοίχιση» στο FastWrite ──
  const v3 = INV[2];
  await shoot(boss, imgPage, v3);
  await readAndMaybeSave(boss, v3, "ΑΚΤΗ 10/10", async (card) => {
    await card.locator(".pro-ln").filter({ hasText: "ΓΑΛΑ" }).first().click();
    await boss.waitForSelector('#pro-sheet [data-a="same"]', { timeout: 8000 });
    await boss.click('#pro-sheet [data-a="same"]');
    await boss.waitForSelector("#pro-sheet .pro-opt", { timeout: 8000 });
    await boss.fill("#pro-sheet .pro-find", "ΓΑΛΑ");
    await boss.locator("#pro-sheet .pro-opt").first().click();
    await until(async () => !(await boss.$("#pro-sheet")), 5000, "κλείσιμο φύλλου");
    await sleep(600);
  });
  step("Boss · ΑΚΤΗ 10/10 με «G-77 ίδιο με ΓΑΛΑ ΦΡΕΣΚΟ 1LT»");
  await openMenu(boss); await boss.click("#m-team-row");
  await until(async () => { await fwSync(fw); return /άλλαξε η αντιστοίχιση/.test(await fw.locator("#km-table").innerText()); }, 150000, "FastWrite: άλλαξε η αντιστοίχιση");
  await fw.shot("map_changed");
  const t3 = (await fw.locator("#km-table").innerText()).replace(/\s+/g, " ");
  R.cards["FastWrite · μετά το ίδιο με"] = t3;
  const mp = await fwApi(fw, "GET", "/api/km/invoices?flag=map");
  ok(mp.total === 1 && mp.items[0].supplier === "ΑΚΤΗ" && mp.items[0].inv_date === "2026-10-05", "🔴 «⚠ άλλαξε η αντιστοίχιση» ΜΟΝΟ στο παλιό ΑΚΤΗ 05/10 (όχι θόρυβος στο ΟΡΙΖΩΝ)", JSON.stringify(mp.items.map((x) => x.supplier + " " + x.inv_date)));
  await fw.locator("#km-table tr.km-row", { hasText: "05/10/2026" }).first().click();
  await fw.waitForSelector("#km-detail #km-seen", { timeout: 10000 });
  const mapNote = (await fw.locator("#km-detail").innerText()).replace(/\s+/g, " ");
  R.cards["FastWrite · σήμανση αντιστοίχισης"] = mapNote;
  ok(/Άλλαξε η αντιστοίχιση: προϊόν «ΓΑΛΑ ΦΡΕΣΚΟ 6x1LT» → «ΓΑΛΑ ΦΡΕΣΚΟ 1LT»/.test(mapNote), "σήμανση «από τι σε τι»: προϊόν «ΓΑΛΑ ΦΡΕΣΚΟ 6x1LT» → «ΓΑΛΑ ΦΡΕΣΚΟ 1LT»", mapNote);
  await fw.shot("map_detail");
  await fw.click("#km-seen");
  await until(async () => (await fwApi(fw, "GET", "/api/km/invoices?flag=map")).total === 0, 10000, "Το είδα");
  ok(true, "«✔ Το είδα» → η σήμανση φεύγει");
  await fw.click("#km-detail .modal-close").catch(() => {});
  await until(async () => { if ((await fwApi(fw, "GET", "/api/km/invoices")).total === 3) return true; await fwSync(fw); return false; }, 120000, "FastWrite: 3ο τιμολόγιο").catch(() => {});
  ok((await fwApi(fw, "GET", "/api/km/invoices")).total === 3, "FastWrite: 3 τιμολόγια (ήρθε και το νέο ΑΚΤΗ 10/10)");

  // ── 7 · ΑΝΑΚΛΗΣΗ ──
  await openMenu(boss); await boss.click("#m-team-row");
  await until(async () => (await boss.locator(".acct-card .acct-revoke").count()) === 1, 20000, "κάρτα λογιστή");
  await boss.click(".acct-card .acct-revoke");
  await until(async () => (await boss.locator(".acct-card").count()) === 0, 20000, "ανάκληση");
  await boss.shot("acct_revoked");
  const team2 = await boss.evaluate(() => JSON.parse(localStorage.getItem("km_team") || "null"));
  ok(team2.av === 2 && team2.ak !== team1.ak && team2.akeys && team2.akeys[1] === team1.ak, "🔴 ανάκληση → νέο A (έκδοση 2)· το παλιό μένει στο μπρελόκ", JSON.stringify({ av: team2.av }));
  await fwSync(fw);
  await until(async () => /η πρόσβαση έκλεισε/.test(await fw.locator("#km-links").innerText()), 30000, "FastWrite: έκλεισε");
  await fw.shot("revoked");
  ok((await fwApi(fw, "GET", "/api/km/invoices")).total === 3, "FastWrite: «η πρόσβαση έκλεισε» — τα 3 τιμολόγια ΜΕΝΟΥΝ στο λογιστήριο");

  // ── ιδιωτικότητα (μόνο local: βλέπουμε τον «server» από μέσα) ──
  if (MODE === "local") {
    const r2 = join(R.localDir, "r2"), needles = ["ΟΡΙΖΩΝ", "ΑΚΤΗ", "ΓΑΛΑ"].map((s) => Buffer.from(s, "utf8"));
    const leak = readdirSync(r2).filter((f) => decodeURIComponent(f).includes("/acct/")).filter((f) => { const b = readFileSync(join(r2, f)); return needles.some((n) => b.includes(n)); });
    ok(readdirSync(r2).some((f) => decodeURIComponent(f).includes("/acct/m/")) && leak.length === 0, "🔴 ο server κρατά ΜΟΝΟ σφραγισμένα γράμματα/φωτογραφίες λογιστή — κανένα όνομα σε καθαρό κείμενο", leak.join(","));
    const d1txt = execSync(`node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(process.argv[1]);for(const t of ['km_acct','km_acct_mail','km_acct_fix'])console.log(JSON.stringify(d.prepare('SELECT * FROM '+t).all()))" "${join(R.localDir, "d1.sqlite")}"`, { encoding: "utf8" });
    ok(!/ΟΡΙΖΩΝ|ΑΚΤΗ|ΓΑΛΑ|65[.,]45/.test(d1txt), "🔴 ούτε η βάση του server έχει προμηθευτές ή ποσά", d1txt.slice(0, 300));
  }
  ok(R.errors.filter((e) => /pageerror/.test(e)).length === 0, "κανένα σφάλμα JavaScript στις σελίδες", R.errors.join(" | "));
  await browser.close();
}

main().catch((e) => { R.errors.push("ΚΑΤΑΡΡΕΥΣΗ: " + (e && e.stack || e)); fail++; console.log("ΚΑΤΑΡΡΕΥΣΗ:", e && e.message); })
  .finally(() => {
    step("ΤΕΛΟΣ · " + pass + " OK / " + fail + " FAIL");
    try { if (fwProc) fwProc.kill(); } catch (e) {}
    try { if (local) local.kill(); } catch (e) {}
    save();
    process.exit(fail ? 1 : 0);
  });
