// KM-PRO-F5-CHECK (15/10/2026) · ΑΠΟ ΑΚΡΗ ΣΕ ΑΚΡΗ: ΣΥΝΔΡΟΜΗ (Paddle, ψεύτικα γεγονότα) + ΟΡΙΟ ΑΝΑΓΝΩΣΕΩΝ + ΡΟΕΣ.
//   KM_F5_MODE=staging (προεπιλογή, Windows από .bat): staging Worker + ΑΛΗΘΙΝΗ ανάγνωση PRO (Sonnet) + webhook με
//     υπογραφή από το δικό μας μυστικό staging (secrets\paddle_staging_whsec.txt). ΚΑΝΕΝΑΣ λογαριασμός Paddle.
//   KM_F5_MODE=local: τοπικός δίδυμος (f4local --fake-ai) — ίδιος κώδικας server· ο Κώστας απαντά από αρχείο.
//   1 Free Boss → 2 webhook χωρίς/με λάθος υπογραφή = 401 → 3 ΑΝΑΒΑΘΜΙΣΗ: subscription.created → το PRO
//   εμφανίζεται ΣΤΟ ΜΕΝΟΥ χωρίς οθόνες εισαγωγής → 4 ΟΡΙΟ 1/μήνα: 1η ανάγνωση ✔ · 2η → μήνυμα στην κάμερα +
//   λωρίδα στα Εκκρεμή · χειροκίνητη καταχώρηση δουλεύει · αύξηση ορίου → ανάγνωση ξανά → 5 ΑΚΥΡΩΣΗ → «έληξε»,
//   το μενού PRO φεύγει → 6 ΝΕΟΣ ΠΕΛΑΤΗΣ ΑΠΕΥΘΕΙΑΣ PRO: πληρώνει πριν τον λογαριασμό → εγγραφή → κάμερα ΧΩΡΙΣ οθόνη κλειδιού.
//   (Boss + λογιστής: tools/pro/f4check.mjs, τρέχει στο ίδιο .bat.)
import { createRequire } from "node:module";
import { randomBytes, createHash } from "node:crypto";
import { writeFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { execSync, spawn, fork } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MODE = process.env.KM_F5_MODE || "staging";
const ROOT = process.env.KM_F4_ROOT || join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(join(process.env.KM_PW_DIR || join(ROOT, "node_modules"), "package.json"));
const { chromium } = require("playwright");
const STAMP = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
const OUT = process.env.KM_F5_OUT || join(ROOT, "Claude outputs", "pro_f5check", STAMP);
mkdirSync(OUT, { recursive: true });
const FAKE_AI = join(OUT, "_fake_ai.json");
const PY = process.env.KM_PY || (process.platform === "win32" ? "python" : "python3");
const FW_PORT = Number(process.env.KM_F4_FW_PORT || 8766);
const FW = "http://127.0.0.1:" + FW_PORT;
const LOCAL_PORT = 8789;
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
  local = fork(join(ROOT, "tools", "pro", "f4local.mjs"), ["--port=" + LOCAL_PORT, "--dir=" + dir, "--fake-ai=" + FAKE_AI], { stdio: ["ignore", "pipe", "pipe", "ipc"] });
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


import { paddleEvent, paddleSub, paddleSend } from "./paddle_mock.mjs";
const SECRET = MODE === "local" ? "pdl_ntfset_local_test" : readFileSync(join(ROOT, "secrets", "paddle_staging_whsec.txt"), "utf8").trim();
const ADMIN = MODE === "local" ? "local-admin" : readFileSync("C:/Users/User/fastwrite-project/secrets/km_admin_key.txt", "utf8").trim();
function fakeFor(v) {   // ΜΟΝΟ local: τι «διαβάζει» ο Κώστας (ίδιο σχήμα με την απάντηση του μοντέλου)
  writeFileSync(FAKE_AI, JSON.stringify({ supplier: { name: v.issuer, vat_no: v.vatno }, number: v.no, date: v.date, net: v.net, vat: v.vat, total: v.total,
    lines: v.lines.map((l) => ({ code: l[0], desc: l[1], unit: l[2], qty: l[3], unit_price: l[4], disc_pct: null, line_net: Math.round(l[3] * l[4] * 100) / 100, vat_pct: 19 })) }));
}
const admin = (path, body) => fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json", "X-Km-Admin": ADMIN }, body: JSON.stringify(body) }).then((r) => r.json());
const proLS = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem("km_pro") || "null"); } catch (e) { return null; } });
const noteTxt = (page) => page.evaluate(() => { const b = document.getElementById("pro-note"); return b && !b.hidden ? b.innerText.replace(/\s+/g, " ") : ""; });
async function signup(page, email, seen) {
  const k = randomBytes(32).toString("hex"), hsh = createHash("sha256").update(k).digest("hex"), t = new Date().toISOString();
  await d1(`DELETE FROM km_oauth_states WHERE provider = 'test:${email}'; INSERT INTO km_oauth_states (state_hash, provider, verifier, nonce, ip_h, created) VALUES ('${hsh}', 'test:${email}', '-', '-', NULL, '${t}');`);
  await page.goto(BASE + "/api/km/auth/test/callback?k=" + k, { waitUntil: "domcontentloaded" });
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    await sleep(700); const s = await page.screens(); if (s && !seen.includes(s)) seen.push(s);
    if (s === "s-key") await page.click("#skip-key"); else if (s === "s-perm") await page.click("#go-perm"); else if (s === "s-cam") break;
  }
  return page.evaluate(() => localStorage.getItem("km_folder"));
}
async function reopen(page) {   // «ξανανοίγει την εφαρμογή»
  await page.reload({ waitUntil: "domcontentloaded" });
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) { await sleep(700); const s = await page.screens(); if (s === "s-perm") await page.click("#go-perm"); else if (s === "s-cam") break; }
  await sleep(2500);
}
const menuRows = async (page) => { await openMenu(page); const r = await page.evaluate(() => ({ prices: !document.getElementById("m-prices-row").hidden, team: !document.getElementById("m-team-row").hidden })); await backToCam(page); return r; };

async function main() {
  step("ΞΕΚΙΝΑ · mode=" + MODE + " · " + OUT);
  if (MODE === "local") await startLocal();
  const browser = await chromium.launch({ headless: true });
  const boss = await newPhone(browser);
  const imgPage = await (await browser.newContext()).newPage();
  await imgPage.setViewportSize({ width: 1240, height: 1754 });

  // ── 1 · FREE ──
  const email = "km-f5-" + STAMP.toLowerCase() + "@example.com";
  const folder = await signup(boss, email, []);
  ok(/^[0-9a-f]{64}$/.test(folder || ""), "Boss: λογαριασμός Free", folder);
  ok(!(await proLS(boss) || {}).pro, "Boss: Free (όχι PRO)", JSON.stringify(await proLS(boss)));
  const m0 = await menuRows(boss);
  ok(!m0.prices && !m0.team, "Free: χωρίς γραμμές PRO στο Μενού", JSON.stringify(m0));
  await boss.shot("free_cam");

  // ── 2 · WEBHOOK ΧΩΡΙΣ ΣΩΣΤΗ ΥΠΟΓΡΑΦΗ ──
  const subId = "sub_f5" + STAMP.replace(/[^0-9]/g, "").slice(-12);
  let w = await paddleSend(BASE, SECRET, paddleEvent("subscription.created", paddleSub(subId, "active", email)), { sig: "" });
  ok(w.status === 401, "webhook χωρίς υπογραφή → 401", JSON.stringify(w));
  w = await paddleSend(BASE, "pdl_ntfset_WRONG", paddleEvent("subscription.created", paddleSub(subId, "active", email)));
  ok(w.status === 401 && w.j.error === "bad_signature", "webhook με λάθος μυστικό → 401 bad_signature", JSON.stringify(w));
  await reopen(boss);
  ok(!(await proLS(boss) || {}).pro, "🔴 μετά τα πλαστά γεγονότα ο λογαριασμός ΜΕΝΕΙ Free", JSON.stringify(await proLS(boss)));

  // ── 3 · ΑΝΑΒΑΘΜΙΣΗ Free → PRO (πληρωμή στο web, mock) ──
  const evUp = paddleEvent("subscription.created", paddleSub(subId, "active", email.toUpperCase()));
  w = await paddleSend(BASE, SECRET, evUp);
  ok(w.status === 200 && w.j.outcome === "applied", "subscription.created (km_email = email λογαριασμού) → applied", JSON.stringify(w));
  w = await paddleSend(BASE, SECRET, evUp);
  ok(w.status === 200 && w.j.duplicate === true, "ίδιο γεγονός ξανά → duplicate (μία εφαρμογή)", JSON.stringify(w));
  const seenUp = [];
  boss.on("framenavigated", () => {});
  await reopen(boss);
  const scr = await boss.screens();
  ok(scr === "s-cam", "αναβάθμιση: ανοίγει ΚΑΤΕΥΘΕΙΑΝ η κάμερα — καμία οθόνη εισαγωγής", scr);
  await until(async () => (await proLS(boss) || {}).pro === true, 15000, "PRO στο κινητό");
  const nUp = await noteTxt(boss);
  await boss.shot("upgrade_note");
  ok(/✓ Το Kostometro PRO είναι ενεργό/.test(nUp), "αναβάθμιση: ΜΙΑ γραμμή «✓ Το Kostometro PRO είναι ενεργό»", nUp);
  const m1 = await menuRows(boss);
  ok(m1.prices && m1.team, "🔴 αναβάθμιση: «📊 Τιμές» και «👥 Ομάδα» ΑΠΕΥΘΕΙΑΣ στο Μενού", JSON.stringify(m1));
  await openMenu(boss); await boss.shot("upgrade_menu"); await backToCam(boss);

  // ── 4 · ΟΡΙΟ ΑΝΑΓΝΩΣΕΩΝ (ανά λογαριασμό = 1 για τη δοκιμή) ──
  let a = await admin("/api/km/admin/pro/limit", { folder_id: folder, reads_limit: 1, note: "f5check" });
  ok(a.ok && a.limits.reads === 1, "admin: όριο λογαριασμού 1/μήνα (μόνο για τη δοκιμή)", JSON.stringify(a));
  if (MODE === "local") fakeFor(INV[0]);
  await shoot(boss, imgPage, INV[0]);
  await readAndMaybeSave(boss, INV[0], "ΟΡΙΖΩΝ (1/1)");
  step("Boss · 1η ανάγνωση ΟΡΙΖΩΝ ✔");
  const p1 = await proLS(boss);
  ok(p1 && p1.month && p1.month.reads === 1 && p1.month.left === 0, "μετρητής: 1/1 — απομένουν 0", JSON.stringify(p1 && p1.month));
  if (MODE === "local") fakeFor(INV[1]);
  await shoot(boss, imgPage, INV[1]);
  await until(async () => /Συμπληρώθηκαν οι αναγνώσεις PRO του μήνα/.test(await noteTxt(boss)), 120000, "μήνυμα ορίου στην κάμερα");
  const nLim = await noteTxt(boss);
  await boss.shot("limit_cam");
  R.cards["κάμερα · όριο"] = nLim;
  ok(/\(1\/1\)/.test(nLim) && /Δεν χάθηκε τίποτα/.test(nLim) && /έως \d{1,2}\/\d{1,2}/.test(nLim), "🔴 ΟΡΙΟ: μήνυμα στην ΚΑΜΕΡΑ — (1/1), τι κάνει ο χρήστης, ως πότε", nLim);
  ok(!/€|\$|αγόρασε|αναβάθμ/i.test(nLim), "μήνυμα ορίου: καμία τιμή, καμία προτροπή αγοράς (Apple 3.1.1)", nLim);
  await openMenu(boss, "s-pend");
  await until(async () => (await boss.locator("#pend-body .pro-lim-bar").count()) === 1, 10000, "λωρίδα Εκκρεμών");
  await boss.shot("limit_pending");
  const bar = (await boss.locator("#pend-body .pro-lim-bar").innerText()).replace(/\s+/g, " ");
  R.cards["Εκκρεμή · όριο"] = bar;
  ok(/Συμπληρώθηκαν/.test(bar), "🔴 ΟΡΙΟ: λωρίδα πάνω από τα «Εκκρεμή» (εκεί που περιμένει η φωτογραφία)", bar);
  const card = cardOf(boss, INV[1]);
  ok((await card.count()) === 1 && (await card.locator(".pro-ln").count()) === 0, "η φωτογραφία ΜΕΝΕΙ στα Εκκρεμή, χωρίς ανάγνωση (καμία σιωπηλή αποτυχία, τίποτα δεν χάθηκε)");
  // χειροκίνητα: ο χρήστης ΔΕΝ κολλάει
  const inputs = card.locator("input:not([type=checkbox])");
  await inputs.nth(0).fill(eur(INV[1].net)); await inputs.nth(1).fill(eur(INV[1].vat)); await inputs.nth(2).fill(eur(INV[1].total));
  await card.getByRole("button", { name: "Αποθήκευση", exact: true }).click();
  await until(async () => (await card.count()) === 0, 8000, "χειροκίνητη αποθήκευση");
  ok(true, "στο όριο η χειροκίνητη καταχώρηση δουλεύει κανονικά");
  await backToCam(boss);
  // αύξηση ορίου (admin) → ο Κώστας ξαναδιαβάζει
  a = await admin("/api/km/admin/pro/limit", { folder_id: folder, reads_limit: 3, note: "f5check" });
  await reopen(boss);
  ok(!/Συμπληρώθηκαν/.test(await noteTxt(boss)), "όριο 3: το μήνυμα φεύγει μόνο του (νούμερα ΜΟΝΟ από τον server)", await noteTxt(boss));
  if (MODE === "local") fakeFor(INV[2]);
  await shoot(boss, imgPage, INV[2]);
  await readAndMaybeSave(boss, INV[2], "ΑΚΤΗ 10/10 (2/3)");
  const p2 = await proLS(boss);
  ok(p2 && p2.month && p2.month.reads === 2 && p2.month.limit === 3, "μετά την αύξηση: διαβάζει ξανά — 2/3", JSON.stringify(p2 && p2.month));

  // ── 5 · ΑΚΥΡΩΣΗ ──
  w = await paddleSend(BASE, SECRET, paddleEvent("subscription.canceled", paddleSub(subId, "canceled", email), new Date(Date.now() + 5000).toISOString()));
  ok(w.status === 200 && w.j.outcome === "applied", "subscription.canceled → applied", JSON.stringify(w));
  await reopen(boss);
  await until(async () => (await proLS(boss) || {}).pro === false, 15000, "Free ξανά");
  const nOff = await noteTxt(boss);
  await boss.shot("cancel_note");
  ok(/Η συνδρομή PRO έληξε/.test(nOff) && /μένουν/.test(nOff), "ακύρωση: «Η συνδρομή PRO έληξε — … μένουν όπως είναι»", nOff);
  const m2 = await menuRows(boss);
  ok(!m2.prices && !m2.team, "ακύρωση: οι γραμμές PRO φεύγουν από το Μενού", JSON.stringify(m2));
  const kept = await boss.evaluate(() => new Promise((res) => { const q = indexedDB.open("kostometrisi", 1); q.onsuccess = () => { let n = 0; q.result.transaction("shots").objectStore("shots").openCursor().onsuccess = (e) => { const c = e.target.result; if (c) { if (c.value.total !== null) n++; c.continue(); } else res(n); }; }; }));
  ok(kept === 3, "ακύρωση: τα 3 τιμολόγια ΜΕΝΟΥΝ στο κινητό", kept);

  // ── 6 · ΝΕΟΣ ΠΕΛΑΤΗΣ ΑΠΕΥΘΕΙΑΣ PRO ──
  const email2 = "km-f5n-" + STAMP.toLowerCase() + "@example.com";
  w = await paddleSend(BASE, SECRET, paddleEvent("subscription.created", paddleSub(subId + "n", "trialing", email2)));
  ok(w.status === 200 && w.j.outcome === "pending", "πληρωμή ΠΡΙΝ τον λογαριασμό → συνδρομή «σε αναμονή»", JSON.stringify(w));
  const phone2 = await newPhone(browser);
  const seen2 = [];
  const f2 = await signup(phone2, email2, seen2);
  R.cards["νέος PRO · οθόνες"] = seen2.join(" → ");
  ok(/^[0-9a-f]{64}$/.test(f2 || "") && !seen2.includes("s-key"), "🔴 νέος PRO: εγγραφή → κάμερα ΧΩΡΙΣ οθόνη κλειδιού Gemini", seen2.join(" → "));
  ok((await proLS(phone2) || {}).pro === true, "νέος PRO: ο λογαριασμός είναι PRO από την πρώτη στιγμή (η συνδρομή δέθηκε στην εγγραφή)", JSON.stringify(await proLS(phone2)));
  const m3 = await menuRows(phone2);
  ok(m3.prices && m3.team, "νέος PRO: «📊 Τιμές» και «👥 Ομάδα» στο Μενού", JSON.stringify(m3));
  await phone2.shot("newpro_cam");

  ok(R.errors.filter((e) => /pageerror/.test(e)).length === 0, "κανένα σφάλμα JavaScript στις σελίδες", R.errors.join(" | "));
  await browser.close();
}

main().catch((e) => { R.errors.push("ΚΑΤΑΡΡΕΥΣΗ: " + (e && e.stack || e)); fail++; console.log("ΚΑΤΑΡΡΕΥΣΗ:", e && e.message); })
  .finally(() => {
    step("ΤΕΛΟΣ · " + pass + " OK / " + fail + " FAIL");
    try { if (local) local.kill(); } catch (e) {}
    save();
    process.exit(fail ? 1 : 0);
  });
