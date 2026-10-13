// KM-PRO-F3-CHECK (13/10/2026) · Η ΟΜΑΔΑ ΑΠΟ ΑΚΡΗ ΣΕ ΑΚΡΗ ΣΤΟ STAGING — δύο «κινητά»: Boss + υπάλληλος.
//   Τρέχει στα Windows από .bat (Playwright σε %LOCALAPPDATA%\km-pw). Ψεύτικη ΜΟΝΟ η κάμερα.
//   Boss: λογαριασμός + PRO + 2 τιμολόγια → «👥 Ομάδα» → πρόσκληση «Νίκος»
//   Νίκος: σύνδεσμος → «Σύνδεση» → περιμένει → ενεργός → βλέπει ΜΟΝΟ τελευταίες τιμές → φωτογραφίζει →
//          σήμα 🔺 από το δελτίο → «📤 Αποστολή» → τίποτα δεν μένει στο κινητό
//   Boss: «📥 από Νίκος» στα Εκκρεμή → Αποθήκευση (= έγκριση) → μπαίνει στις τιμές
//   Boss: εκτός βάρδιας → Νίκος κλειδώνει · ανάκληση → Νίκος καθαρίζει · ίχνος
import { createRequire } from "node:module";
import { randomBytes, createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const require = createRequire(join(process.env.KM_PW_DIR, "package.json"));
const { chromium } = require("playwright");
const ROOT = "C:/Users/User/fastwrite-pro";
const BASE = "https://fastwrite-staging.stavrosfkallenos.workers.dev";
const STAMP = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
const OUT = join(ROOT, "Claude outputs", "pro_f3check", STAMP);
mkdirSync(OUT, { recursive: true });
const R = { stamp: STAMP, checks: [], steps: [], api: [], errors: [], cards: {} };
let pass = 0, fail = 0;
const save = () => {
  writeFileSync(join(OUT, "report.json"), JSON.stringify(R, null, 1));
  writeFileSync(join(OUT, "report.txt"), R.steps.join("\r\n") + "\r\n\r\n" + R.checks.map((c) => (c.ok ? "OK   " : "FAIL ") + c.m + (c.ok ? "" : "  <<  " + c.got)).join("\r\n") + "\r\n\r\n" + pass + " OK / " + fail + " FAIL\r\n");
};
const step = (m) => { const s = new Date().toISOString().slice(11, 19) + " " + m; R.steps.push(s); console.log(s); save(); };
const ok = (c, m, got) => { if (c) pass++; else fail++; R.checks.push({ ok: !!c, m, got: c ? undefined : String(got === undefined ? "" : got).slice(0, 700) }); console.log((c ? "  OK   " : "  FAIL ") + m); save(); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const d1 = (sql) => execSync(`npx --yes wrangler d1 execute DB --env staging --remote --yes --command "${sql.replace(/\s*\n\s*/g, " ").trim()}"`, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const eur = (v) => v.toFixed(2).replace(".", ",");
function invHtml(v) {
  const net = Math.round(v.lines.reduce((a, l) => a + l[3] * l[4], 0) * 100) / 100;
  const vat = Math.round(net * 0.19 * 100) / 100, tot = Math.round((net + vat) * 100) / 100;
  v.total = tot;
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
  // ο υπάλληλος:
  { sup: "ΟΡΙΖΩΝ", issuer: "ΟΡΙΖΩΝ ΤΡΟΦΙΜΑ ΛΤΔ", vatno: "10123456X", no: "ΤΔΑ 4502", date: "2026-10-09", lines: [["K100", "ΓΑΛΑ ΦΡΕΣΚΟ 1LT", "ΛΤ", 30, 1.60], ["K200", "ΑΛΕΥΡΙ ΣΑΚΙ 25KG", "ΤΕΜ", 1, 21.00]] },
];
const FAKE_CAM = `(() => {
  const cv = document.createElement('canvas'); cv.width = 1240; cv.height = 1754;
  const cx = cv.getContext('2d'); let im = null;
  const draw = () => { cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); if (im) { cx.drawImage(im, 0, 0, cv.width, cv.height); } };
  setInterval(draw, 100); draw();
  window.__setFake = (url) => new Promise((res) => { const i = new Image(); i.onload = () => { im = i; draw(); res(true); }; i.src = url; });
  const gum = () => { draw(); return Promise.resolve(cv.captureStream(10)); };
  try { if (!navigator.mediaDevices) { Object.defineProperty(navigator, 'mediaDevices', { value: {} }); } navigator.mediaDevices.getUserMedia = gum; } catch (e) {}
})();`;

async function newPhone(browser, tag) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, locale: "el-GR", timezoneId: "Asia/Nicosia" });
  await ctx.addInitScript(FAKE_CAM);
  const page = await ctx.newPage();
  page.__prompts = [];
  page.on("dialog", async (dg) => {
    R.steps.push("   [" + tag + "] διάλογος " + dg.type() + ": " + dg.message().slice(0, 120).replace(/\n/g, " "));
    if (dg.type() === "prompt") await dg.accept(page.__prompts.length ? page.__prompts.shift() : (dg.defaultValue() || ""));
    else await dg.accept();
  });
  page.on("pageerror", (e) => R.errors.push("[" + tag + "] pageerror: " + e.message));
  page.on("response", (r) => { const u = r.url(); if (u.includes("/api/km/")) R.api.push(tag + " " + new Date().toISOString().slice(11, 19) + " " + r.request().method() + " " + u.replace(BASE, "").replace(/k=[0-9a-f]+/, "k=…") + " → " + r.status()); });
  let n = 0;
  page.shot = async (name) => { n++; await page.screenshot({ path: join(OUT, tag + "_" + String(n).padStart(2, "0") + "_" + name + ".png") }); };
  page.screens = () => page.evaluate(() => [...document.querySelectorAll("section.screen")].filter((s) => !s.hidden).map((s) => s.id).join(","));
  return page;
}
const until = async (fn, ms, what) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (e) {} await sleep(500); } throw new Error("χρονικό όριο: " + what); };
async function openMenu(page, go) {
  if ((await page.screens()) !== "s-cam") { for (let i = 0; i < 4 && (await page.screens()) !== "s-cam"; i++) { const b = await page.$("section.screen:not([hidden]) [data-back]"); if (b) await b.click(); await sleep(600); } }
  await page.click("#btn-menu");
  await until(async () => (await page.screens()) === "s-menu", 8000, "μενού");
  if (go) { await page.click(`[data-go="${go}"]`); await until(async () => (await page.screens()) === go, 8000, go); }
}
async function backToCam(page) {
  for (let i = 0; i < 5 && (await page.screens()) !== "s-cam"; i++) { const b = await page.$("section.screen:not([hidden]) [data-back]"); if (b) await b.click(); else break; await sleep(600); }
}
async function shoot(page, imgPage, v, pickFromList) {
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
  if (pickFromList) {
    await page.locator("#sup-list button.sup", { hasText: v.sup }).first().click();
  } else {
    await page.click("#who-tab-new"); await page.fill("#in-sup", v.sup); await page.click("#add-sup");
  }
  await until(async () => (await page.screens()) === "s-cam", 8000, "καταχώρηση");
}
const dmy = (iso) => iso.split("-").reverse().join("/");

async function main() {
  step("ΞΕΚΙΝΑ · " + OUT);
  const email = "km-f3-" + STAMP.toLowerCase() + "@example.com";
  const k = randomBytes(32).toString("hex"), hsh = createHash("sha256").update(k).digest("hex"), t = new Date().toISOString();
  d1(`DELETE FROM km_oauth_states WHERE provider = 'test:${email}'; INSERT INTO km_oauth_states (state_hash, provider, verifier, nonce, ip_h, created) VALUES ('${hsh}', 'test:${email}', '-', '-', NULL, '${t}');`);
  const browser = await chromium.launch({ headless: true });
  const boss = await newPhone(browser, "boss");
  const imgPage = await (await browser.newContext()).newPage();
  await imgPage.setViewportSize({ width: 1240, height: 1754 });

  // ── BOSS: λογαριασμός + PRO ──
  await boss.goto(BASE + "/api/km/auth/test/callback?k=" + k, { waitUntil: "domcontentloaded" });
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    await sleep(800); const s = await boss.screens();
    if (s === "s-key") await boss.click("#skip-key"); else if (s === "s-perm") await boss.click("#go-perm"); else if (s === "s-cam") break;
  }
  const folder = await boss.evaluate(() => localStorage.getItem("km_folder"));
  ok(/^[0-9a-f]{64}$/.test(folder || ""), "Boss: λογαριασμός", folder);
  const tg = new Date().toISOString();
  d1(`INSERT INTO km_pro (folder_id, plan, status, started_at, until, source, updated_at) VALUES ('${folder}', 'pro', 'test', '${tg}', NULL, 'admin', '${tg}') ON CONFLICT(folder_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at;`);
  await boss.reload({ waitUntil: "domcontentloaded" });
  await until(async () => (await boss.screens()) === "s-cam", 30000, "κάμερα PRO");
  await until(() => boss.evaluate(() => { try { return JSON.parse(localStorage.getItem("km_pro")).pro === true; } catch (e) { return false; } }), 15000, "PRO");
  R.version = await boss.evaluate(() => fetch("/kostometro/version.json", { cache: "no-store" }).then((r) => r.json()).then((j) => j.v));
  step("Boss PRO · έκδοση " + R.version);

  // ── BOSS: 2 τιμολόγια (για να υπάρχει δελτίο) ──
  for (const v of INV.slice(0, 2)) {
    await shoot(boss, imgPage, v, false);
    await openMenu(boss, "s-pend");
    const card = boss.locator("#pend-body .card").filter({ hasText: dmy(v.date) });
    await until(async () => (await card.locator(".pro-ln").count()) >= v.lines.length, 150000, "ανάγνωση Boss " + v.date);
    await card.getByRole("button", { name: "Αποθήκευση", exact: true }).click();
    await until(async () => (await card.count()) === 0, 8000, "αποθήκευση");
    await backToCam(boss);
    step("Boss · αποθήκευσε " + v.sup + " " + v.date);
  }

  // ── BOSS: «👥 Ομάδα» → πρόσκληση «Νίκος» ──
  await openMenu(boss);
  ok(await boss.locator("#m-team-row").isVisible(), "Boss PRO: «👥 Ομάδα» στο μενού");
  await boss.click("#m-team-row");
  await until(async () => (await boss.locator("#team-inv-user").count()) === 1, 40000, "οθόνη Ομάδα (στήσιμο κλειδιών)");
  await boss.shot("team_empty");
  const team0 = await boss.evaluate(() => JSON.parse(localStorage.getItem("km_team") || "null"));
  ok(team0 && /^B/.test(team0.pub) && team0.priv && team0.priv.d && /^[0-9a-f]{64}$/.test(team0.s), "Boss: κλειδιά ομάδας φτιάχτηκαν στη συσκευή (δημόσιο + ιδιωτικό + S)", JSON.stringify(team0 && Object.keys(team0)));
  boss.__prompts.push("Νίκος");
  await boss.click("#team-inv-user");
  await boss.waitForSelector("#pro-sheet #team-link", { timeout: 10000 });
  const link = (await boss.locator("#team-link").innerText()).trim();
  ok(/\/kostometro\/#km_inv=[0-9a-f]{32}$/.test(link), "πρόσκληση: σύνδεσμος μίας χρήσης", link);
  ok((await boss.locator("#pro-sheet .team-qr svg").count()) === 1, "πρόσκληση: QR για να το σκανάρει");
  await boss.shot("invite_sheet");
  await boss.click("#pro-sheet [data-x]");

  // ── ΝΙΚΟΣ ──
  const nik = await newPhone(browser, "nikos");
  await nik.goto(link, { waitUntil: "domcontentloaded" });
  await until(async () => (await nik.screens()) === "s-mstate", 15000, "οθόνη πρόσκλησης");
  ok(/Πρόσκληση/.test(await nik.locator("#ms-title").innerText()), "Νίκος: οθόνη «Πρόσκληση στην ομάδα» — χωρίς email/λέξεις");
  await nik.shot("join");
  await nik.click("#ms-go");
  await until(async () => /Περιμένεις/.test(await nik.locator("#ms-title").innerText()), 15000, "αναμονή ενεργοποίησης");
  await nik.shot("wait");
  ok(true, "Νίκος: μπήκε, περιμένει ενεργοποίηση");
  const nikLS = await nik.evaluate(() => ({ member: localStorage.getItem("km_member"), folder: localStorage.getItem("km_folder"), words: localStorage.getItem("km_words") }));
  ok(nikLS.member && !nikLS.folder && !nikLS.words, "🔴 Νίκος: ΚΑΝΕΝΑΣ φάκελος, ΚΑΜΙΑ λέξη στη συσκευή του", JSON.stringify(nikLS));
  // ο Boss ανοίγει την Ομάδα → δίνει κλειδί
  await backToCam(boss); await openMenu(boss, "s-team");
  await until(async () => { if (!/🟢 Σε βάρδια/.test(await boss.locator("#team-body").innerText())) { await backToCam(boss); await openMenu(boss, "s-team"); await sleep(3000); return false; } return true; }, 90000, "Boss: ο Νίκος ενεργός");
  await boss.shot("team_active");
  await until(async () => (await nik.screens()) === "s-cam", 30000, "Νίκος: κάμερα (μόνος του, χωρίς πάτημα)");
  ok(true, "Νίκος: ενεργός → κάμερα");
  const nikKeys = await nik.evaluate(() => Object.keys(localStorage).filter((x) => /^km_/.test(x)));
  R.nikKeys = nikKeys;
  // μενού του Νίκου
  await openMenu(nik);
  const vis = await nik.evaluate(() => [...document.querySelectorAll("#s-menu .pg-body .row")].filter((x) => x.offsetParent !== null).map((x) => x.innerText.split("\n")[0]));
  R.cards["μενού Νίκου"] = vis;
  ok(vis.length === 3 && vis.some((x) => /Εκκρεμή/.test(x)) && vis.some((x) => /Τιμές/.test(x)) && vis.some((x) => /Αποσύνδεση/.test(x)), "🔴 μενού υπαλλήλου: ΜΟΝΟ Εκκρεμή · Τιμές · Αποσύνδεση", vis.join(" | "));
  await nik.shot("menu");
  await nik.click("#m-prices-row");
  await until(async () => (await nik.locator("#prices-body .pro-card").count()) >= 1, 15000, "Τιμές Νίκου");
  const npr = (await nik.locator("#prices-body").innerText()).replace(/\s+/g, " ");
  R.cards["Τιμές Νίκου"] = npr;
  ok(/ΟΡΙΖΩΝ 1,5/.test(npr) && /ΑΚΤΗ 1,45/.test(npr), "Νίκος: τελευταίες τιμές ανά προμηθευτή (ΟΡΙΖΩΝ 1,5 · ΑΚΤΗ 1,45)", npr);
  ok(!/Μέσος όρος|αγορές/.test(npr), "🔴 Νίκος: ΧΩΡΙΣ μέσο όρο / ιστορικό", npr);
  await nik.shot("prices");
  await backToCam(nik);
  // φωτογραφίζει
  const v = INV[2];
  await shoot(nik, imgPage, v, true);
  step("Νίκος · φωτογράφισε " + v.sup + " " + v.date + " (από τη λίστα του δελτίου)");
  await openMenu(nik, "s-pend");
  const nc = nik.locator("#pend-body .card").filter({ hasText: dmy(v.date) });
  await until(async () => (await nc.locator(".pro-ln").count()) >= 2, 150000, "ανάγνωση Νίκου");
  await sleep(500);
  const ntx = (await nc.innerText()).replace(/\s+/g, " ");
  R.cards["κάρτα Νίκου"] = ntx;
  ok(/🔺 \+6,7% από την τελευταία \(1,5, 02\/10\/2026\)/.test(ntx), "Νίκος: στην παραλαβή 🔺 +6,7% από την τελευταία (από το δελτίο)", ntx);
  ok(/Αποστολή στον ιδιοκτήτη/.test(ntx) && !/Αποθήκευση|ίδιο με/.test(ntx), "Νίκος: «📤 Αποστολή» — καμία «Αποθήκευση», κανένα «ίδιο με»", ntx);
  const ro = await nc.locator("input:not([type=checkbox])").evaluateAll((xs) => xs.map((x) => x.readOnly));
  ok(ro.length === 3 && ro.every(Boolean), "🔴 Νίκος: τα ποσά ΔΕΝ αλλάζουν (3 πεδία, μόνο ανάγνωση)", JSON.stringify(ro));
  await nc.locator(".pro-ln").first().click(); await sleep(600);
  ok((await nik.$("#pro-sheet")) === null, "🔴 Νίκος: πάτημα γραμμής δεν ανοίγει «ίδιο με / συσκευασία»");
  await nik.shot("card");
  await nc.getByRole("button", { name: "📤 Αποστολή στον ιδιοκτήτη" }).click();
  await until(async () => (await nc.count()) === 0, 30000, "αποστολή");
  await sleep(800);
  const sent = (await nik.locator("#pend-body").innerText()).replace(/\s+/g, " ");
  ok(/Στάλθηκαν/.test(sent) && /ΟΡΙΖΩΝ/.test(sent), "Νίκος: «📤 Στάλθηκαν» με την κατάσταση", sent);
  const left = await nik.evaluate(() => new Promise((res) => { const rq = indexedDB.open("kostometrisi"); rq.onsuccess = () => { try { const tx = rq.result.transaction("shots"); const c = tx.objectStore("shots").count(); c.onsuccess = () => res(c.result); } catch (e) { res("?" + e.message); } }; rq.onerror = () => res("err"); }));
  ok(left === 0, "🔴 Νίκος: μετά την αποστολή ΚΑΜΙΑ φωτογραφία/τιμολόγιο στο κινητό", left);
  await nik.shot("sent");

  // ── BOSS: παραλαβή → Αποθήκευση = έγκριση ──
  await backToCam(boss); await openMenu(boss, "s-pend");
  const bc = boss.locator("#pend-body .card").filter({ hasText: "από Νίκος" });
  await until(async () => (await bc.count()) === 1, 60000, "Boss: «📥 από Νίκος»");
  await sleep(800);
  const btx = (await bc.innerText()).replace(/\s+/g, " ");
  R.cards["Boss · πρόταση"] = btx;
  ok(/📥 από Νίκος \(Υπάλληλος\)/.test(btx) && /ΟΡΙΖΩΝ/.test(btx) && /09\/10\/2026/.test(btx), "Boss: κάρτα «📥 από Νίκος (Υπάλληλος)» — προμηθευτής, ημερομηνία", btx);
  ok((await bc.locator(".pro-ln").count()) === 2, "Boss: οι γραμμές που διάβασε ο Κώστας στο κινητό του Νίκου ήρθαν σφραγισμένες", btx);
  await boss.shot("proposal");
  await bc.getByRole("button", { name: "Αποθήκευση", exact: true }).click();
  await until(async () => (await bc.count()) === 0, 8000, "έγκριση");
  await backToCam(boss); await openMenu(boss, "s-prices");
  await until(async () => (await boss.locator("#prices-body .pro-card").count()) >= 1, 8000, "Τιμές Boss");
  const bpr = (await boss.locator("#prices-body").innerText()).replace(/\s+/g, " ");
  ok(/ΟΡΙΖΩΝ 1,6 09\/10\/2026/.test(bpr), "Boss: η τιμή του Νίκου (1,6 · 09/10) μπήκε στο βιβλίο τιμών", bpr);
  await sleep(6000);
  await backToCam(nik); await openMenu(nik, "s-pend");
  await until(async () => /εγκρίθηκε/.test(await nik.locator("#pend-body").innerText()), 30000, "Νίκος: εγκρίθηκε");
  ok(true, "Νίκος: «✓ εγκρίθηκε»");
  await nik.shot("approved");

  // ── ΒΑΡΔΙΑ / ΑΝΑΚΛΗΣΗ ──
  await backToCam(boss); await openMenu(boss, "s-team");
  await until(async () => (await boss.locator(".team-card .sw-duty input").count()) === 1, 15000, "διακόπτης βάρδιας");
  await boss.locator(".team-card .sw-duty input").uncheck();
  await sleep(2500);
  await nik.reload({ waitUntil: "domcontentloaded" });
  await until(async () => (await nik.screens()) === "s-mstate", 20000, "Νίκος: εκτός βάρδιας");
  ok(/Εκτός βάρδιας/.test(await nik.locator("#ms-title").innerText()), "🔴 εκτός βάρδιας → ο Νίκος κλειδώνει (καμία κάμερα)");
  await nik.shot("off");
  await until(async () => (await boss.locator(".team-card .sw-duty input").count()) === 1, 15000, "διακόπτης 2");
  await boss.locator(".team-card .sw-duty input").check();
  await sleep(2500);
  await nik.click("#ms-retry");
  await until(async () => (await nik.screens()) === "s-cam", 20000, "Νίκος: πάλι σε βάρδια");
  ok(true, "σε βάρδια ξανά → κάμερα");
  await until(async () => (await boss.locator(".team-card .team-revoke").count()) === 1, 15000, "ανάκληση");
  await boss.locator(".team-card .team-revoke").click();
  await sleep(3000);
  const teamAfter = await boss.evaluate(() => JSON.parse(localStorage.getItem("km_team")));
  ok(teamAfter.sv === team0.sv + 1 && teamAfter.s !== team0.s, "🔴 ανάκληση → νέο κλειδί δελτίου (S) στη συσκευή του Boss", teamAfter.sv);
  await nik.reload({ waitUntil: "domcontentloaded" });
  await until(async () => /ανακλήθηκε/.test(await nik.locator("#ms-title").innerText().catch(() => "")), 20000, "Νίκος: ανακλήθηκε");
  const nikAfter = await nik.evaluate(() => Object.keys(localStorage).filter((x) => /^km_(member|slip|hist|member_key)/.test(x)));
  ok(nikAfter.length === 0, "🔴 ανακλημένος: τίποτα της ομάδας δεν έμεινε στο κινητό του", nikAfter.join(","));
  await nik.shot("revoked");
  await sleep(1500);
  await backToCam(boss); await openMenu(boss, "s-team");
  await until(async () => /Ίχνος/.test(await boss.locator("#team-body").innerText()), 15000, "ίχνος");
  const lg = (await boss.locator(".team-log").innerText()).replace(/\s+/g, " ");
  R.cards["ίχνος"] = lg;
  ok(/πρόσκληση «Νίκος»/.test(lg) && /Νίκος — μπήκε/.test(lg) && /ενεργοποιήθηκε/.test(lg) && /Νίκος — έστειλε τιμολόγιο/.test(lg) && /εγκρίθηκε τιμολόγιο/.test(lg) && /εκτός βάρδιας/.test(lg) && /ανάκληση/.test(lg), "🧾 ίχνος: πρόσκληση · μπήκε · ενεργοποιήθηκε · έστειλε · εγκρίθηκε · βάρδια · ανάκληση", lg);
  await boss.shot("log");
  await browser.close();
}
main().then(() => { step("ΤΕΛΟΣ · " + pass + " OK / " + fail + " FAIL"); save(); process.exit(fail ? 1 : 0); })
  .catch((e) => { R.errors.push("ΚΑΤΑΡΡΕΥΣΗ: " + (e && e.stack || e)); step("ΚΑΤΑΡΡΕΥΣΗ: " + (e && e.message)); save(); process.exit(2); });
