// KM-PRO-F2-CHECK (13/10/2026) · ΕΠΑΛΗΘΕΥΣΗ Φ2 ΑΠΟ ΑΚΡΗ ΣΕ ΑΚΡΗ ΣΤΟ STAGING — χωρίς κινητό, χωρίς Stavros.
//   Τρέχει στα Windows από το deploy_v000_pro_f2check.bat (Playwright σε %LOCALAPPDATA%\km-pw).
//   ΠΡΑΓΜΑΤΙΚΑ: σύνδεση (πόρτα δοκιμών), λογαριασμός, PRO (km_pro, ίδιο SQL με το /admin/pro/grant),
//   ανάγνωση ανά γραμμή από τον Κώστα AI (Sonnet), αποθήκευση, σφραγισμένος φάκελος, κατέβασμα βιβλίου.
//   ΨΕΥΤΙΚΟ ΜΟΝΟ: η κάμερα — η «φωτογραφία» είναι συνθετικό τιμολόγιο ζωγραφισμένο σε canvas.
//   Αποτέλεσμα: Claude outputs\pro_f2check\<ώρα>\report.json + report.txt + στιγμιότυπα.
import { createRequire } from "node:module";
import { randomBytes, createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const PW = process.env.KM_PW_DIR;
const require = createRequire(join(PW, "package.json"));
const { chromium } = require("playwright");

const ROOT = "C:/Users/User/fastwrite-pro";
const BASE = "https://fastwrite-staging.stavrosfkallenos.workers.dev";
const STAMP = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
const OUT = join(ROOT, "Claude outputs", "pro_f2check", STAMP);
mkdirSync(OUT, { recursive: true });

const R = { stamp: STAMP, checks: [], steps: [], api: [], errors: [], cards: {} };
let pass = 0, fail = 0;
const save = () => {
  writeFileSync(join(OUT, "report.json"), JSON.stringify(R, null, 1));
  writeFileSync(join(OUT, "report.txt"), R.steps.join("\r\n") + "\r\n\r\n" +
    R.checks.map((c) => (c.ok ? "OK   " : "FAIL ") + c.m + (c.ok ? "" : "  <<  " + c.got)).join("\r\n") +
    "\r\n\r\n" + pass + " OK / " + fail + " FAIL\r\n");
};
const step = (m) => { const s = new Date().toISOString().slice(11, 19) + " " + m; R.steps.push(s); console.log(s); save(); };
const ok = (c, m, got) => { if (c) pass++; else fail++; R.checks.push({ ok: !!c, m, got: c ? undefined : String(got === undefined ? "" : got).slice(0, 600) }); console.log((c ? "  OK   " : "  FAIL ") + m); save(); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const d1 = (sql, tag) => {
  const f = join(OUT, tag + ".sql");
  writeFileSync(f, sql);
  // --command (API «query»): το --file περνά από το API «import», που ο λογαριασμός wrangler ΔΕΝ έχει (Authentication error 10000, 13/10)
  const one = sql.replace(/\s*\n\s*/g, " ").trim();
  return execSync(`npx --yes wrangler d1 execute DB --env staging --remote --yes --command "${one}"`, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
};

// ── ΤΑ ΤΙΜΟΛΟΓΙΑ (συνθετικά, γνωστές τιμές) ────────────────────────────────
// ΓΑΛΑ:   ΟΡΙΖΩΝ 1,50 → 1,60 → 1,62 €/λτ · ΑΚΤΗ 8,70/κιβ 6×1LT = 1,45 €/λτ
// ΑΛΕΥΡΙ: ΟΡΙΖΩΝ 20 → 21 → 22 €/σακί 25kg (0,80 → 0,84 → 0,88 €/κιλό) · ΑΚΤΗ 19 € (0,76 €/κιλό)
const INV = [
  { sup: "ΟΡΙΖΩΝ", issuer: "ΟΡΙΖΩΝ ΤΡΟΦΙΜΑ ΛΤΔ", vatno: "10123456X", no: "ΤΔΑ 4411", date: "2026-10-02",
    lines: [["K100", "ΓΑΛΑ ΦΡΕΣΚΟ 1LT", "ΛΤ", 10, 1.50], ["K200", "ΑΛΕΥΡΙ ΣΑΚΙ 25KG", "ΤΕΜ", 2, 20.00]] },
  { sup: "ΟΡΙΖΩΝ", issuer: "ΟΡΙΖΩΝ ΤΡΟΦΙΜΑ ΛΤΔ", vatno: "10123456X", no: "ΤΔΑ 4502", date: "2026-10-09",
    lines: [["K100", "ΓΑΛΑ ΦΡΕΣΚΟ 1LT", "ΛΤ", 30, 1.60], ["K200", "ΑΛΕΥΡΙ ΣΑΚΙ 25KG", "ΤΕΜ", 1, 21.00]] },
  { sup: "ΑΚΤΗ", issuer: "ΑΚΤΗ ΔΙΑΝΟΜΕΣ ΛΤΔ", vatno: "10987654K", no: "INV-0777", date: "2026-10-10",
    lines: [["G-77", "ΓΑΛΑ ΦΡΕΣΚΟ 6x1LT", "ΚΙΒ", 2, 8.70], ["A-5", "ΑΛΕΥΡΙ ΣΚΛΗΡΟ ΣΑΚΙ 25KG", "ΤΕΜ", 1, 19.00]] },
  { sup: "ΟΡΙΖΩΝ", issuer: "ΟΡΙΖΩΝ ΤΡΟΦΙΜΑ ΛΤΔ", vatno: "10123456X", no: "ΤΔΑ 4630", date: "2026-10-12",
    lines: [["K100", "ΓΑΛΑ ΦΡΕΣΚΟ 1LT", "ΛΤ", 20, 1.62], ["K200", "ΑΛΕΥΡΙ ΣΑΚΙ 25KG", "ΤΕΜ", 1, 22.00]] },
];
const eur = (v) => v.toFixed(2).replace(".", ",");
function invHtml(v) {
  const net = Math.round(v.lines.reduce((a, l) => a + l[3] * l[4], 0) * 100) / 100;
  const vat = Math.round(net * 0.19 * 100) / 100, tot = Math.round((net + vat) * 100) / 100;
  v.net = net; v.vat = vat; v.total = tot;
  const [y, m, d] = v.date.split("-");
  return `<html><body style="margin:0;width:1240px;height:1754px;background:#fff;font-family:Arial;color:#000">
<div style="padding:70px 80px">
<div style="font-size:52px;font-weight:bold">${v.issuer}</div>
<div style="font-size:30px">Λεωφ. Μακαρίου 10, Λευκωσία · Αρ. ΦΠΑ ${v.vatno}</div>
<div style="font-size:44px;font-weight:bold;margin-top:60px">ΤΙΜΟΛΟΓΙΟ ${v.no}</div>
<div style="font-size:34px">Ημερομηνία: ${d}/${m}/${y}</div>
<div style="font-size:30px;margin-top:20px">Πελάτης: ΤΑΒΕΡΝΑ ΔΟΚΙΜΗ · Αρ. ΦΠΑ 10555555Τ</div>
<table style="width:100%;border-collapse:collapse;margin-top:60px;font-size:32px" border="2" cellpadding="14">
<tr style="background:#eee"><th>Κωδ.</th><th>Περιγραφή</th><th>Μον.</th><th>Ποσ.</th><th>Τιμή</th><th>Αξία</th><th>ΦΠΑ%</th></tr>
${v.lines.map((l) => `<tr><td>${l[0]}</td><td>${l[1]}</td><td>${l[2]}</td><td align="right">${l[3]}</td><td align="right">${eur(l[4])}</td><td align="right">${eur(l[3] * l[4])}</td><td align="right">19</td></tr>`).join("")}
</table>
<table style="margin-left:auto;margin-top:50px;font-size:36px" cellpadding="10">
<tr><td>Καθαρό</td><td align="right">${eur(net)}</td></tr>
<tr><td>ΦΠΑ 19%</td><td align="right">${eur(vat)}</td></tr>
<tr><td><b>ΣΥΝΟΛΟ</b></td><td align="right"><b>${eur(tot)}</b></td></tr></table>
</div></body></html>`;
}

// ── ΨΕΥΤΙΚΗ ΚΑΜΕΡΑ: canvas → MediaStream (ό,τι άλλο, πραγματικό) ──────────────
const FAKE_CAM = `
(() => {
  const cv = document.createElement('canvas'); cv.width = 1240; cv.height = 1754;
  const cx = cv.getContext('2d'); let im = null;
  const draw = () => { cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); if (im) { cx.drawImage(im, 0, 0, cv.width, cv.height); } };
  setInterval(draw, 100); draw();
  window.__setFake = (url) => new Promise((res) => { const i = new Image(); i.onload = () => { im = i; draw(); res(true); }; i.src = url; });
  const gum = () => { draw(); return Promise.resolve(cv.captureStream(10)); };
  try { if (!navigator.mediaDevices) { Object.defineProperty(navigator, 'mediaDevices', { value: {} }); } navigator.mediaDevices.getUserMedia = gum; } catch (e) {}
})();`;

async function main() {
  step("ΞΕΚΙΝΑ · έξοδος " + OUT);
  // 1 · σύνδεσμος δοκιμών + νέος λογαριασμός (κάθε τρέξιμο καθαρό)
  const email = "km-f2-" + STAMP.toLowerCase() + "@example.com";
  const k = randomBytes(32).toString("hex"), h = createHash("sha256").update(k).digest("hex"), t = new Date().toISOString();
  d1(`DELETE FROM km_oauth_states WHERE provider = 'test:${email}';\nINSERT INTO km_oauth_states (state_hash, provider, verifier, nonce, ip_h, created) VALUES ('${h}', 'test:${email}', '-', '-', NULL, '${t}');\n`, "login");
  step("σύνδεσμος δοκιμών γράφτηκε στη βάση staging · " + email);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, locale: "el-GR", timezoneId: "Asia/Nicosia" });
  await ctx.addInitScript(FAKE_CAM);
  const page = await ctx.newPage();
  page.on("dialog", async (dg) => { R.steps.push("   διάλογος: " + dg.type() + " · " + dg.message().slice(0, 140).replace(/\n/g, " ")); await dg.accept(dg.type() === "prompt" ? (dg.defaultValue() || "") : undefined); });
  page.on("pageerror", (e) => R.errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") R.errors.push("console: " + m.text().slice(0, 300)); });
  page.on("response", (r) => { const u = r.url(); if (u.includes("/api/km/")) R.api.push(new Date().toISOString().slice(11, 19) + " " + r.request().method() + " " + u.replace(BASE, "").replace(/k=[0-9a-f]+/, "k=…") + " → " + r.status()); });
  let shotN = 0;
  const shot = async (name) => { shotN++; await page.screenshot({ path: join(OUT, String(shotN).padStart(2, "0") + "_" + name + ".png"), fullPage: false }); };
  const screens = () => page.evaluate(() => [...document.querySelectorAll("section.screen")].filter((s) => !s.hidden).map((s) => s.id).join(","));
  const until = async (fn, ms, what) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (e) {} await sleep(500); } throw new Error("χρονικό όριο: " + what); };

  // 2 · είσοδος → λογαριασμός → κάμερα
  await page.goto(BASE + "/api/km/auth/test/callback?k=" + k, { waitUntil: "domcontentloaded" });
  let last = "";
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    await sleep(800);
    const s = await screens();
    if (s !== last) { step("οθόνη: " + s); last = s; await shot("boot_" + (s || "κενό")); }
    if (s === "s-key") await page.click("#skip-key");
    else if (s === "s-perm") await page.click("#go-perm");
    else if (s === "s-cam") break;
    else if (/s-have|s-signin|s-email|s-acc|s-step1/.test(s)) throw new Error("η είσοδος δεν πέρασε: " + s);
  }
  const folder = await page.evaluate(() => localStorage.getItem("km_folder"));
  ok(/^[0-9a-f]{64}$/.test(folder || ""), "λογαριασμός φτιάχτηκε (φάκελος " + String(folder).slice(0, 8) + "…)", folder);

  // 3 · PRO (ό,τι κάνει το /api/km/admin/pro/grant, κατευθείαν στη βάση staging)
  const tg = new Date().toISOString();
  d1(`INSERT INTO km_pro (folder_id, plan, status, started_at, until, source, updated_at) VALUES ('${folder}', 'pro', 'test', '${tg}', NULL, 'admin', '${tg}') ON CONFLICT(folder_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at;\n`, "grant");
  step("PRO δόθηκε (km_pro, status=test)");
  await page.reload({ waitUntil: "domcontentloaded" });
  await until(async () => (await screens()) === "s-cam", 30000, "κάμερα μετά το PRO");
  await until(() => page.evaluate(() => { try { return JSON.parse(localStorage.getItem("km_pro")).pro === true; } catch (e) { return false; } }), 15000, "PRO από τον server");
  ok(true, "ο server λέει PRO (/api/km/pro/status)");
  ok(await page.evaluate(() => document.body.classList.contains("is-pro")), "body.is-pro");
  R.version = await page.evaluate(() => fetch("/kostometro/version.json", { cache: "no-store" }).then((r) => r.json()).then((j) => j.v).catch(() => "?"));
  step("έκδοση staging: " + R.version);
  await shot("cam_pro");

  const openMenu = async (go) => {
    if ((await screens()) !== "s-cam") { await page.evaluate(() => { location.hash = ""; }); }
    await page.click("#btn-menu");
    await until(async () => (await screens()) === "s-menu", 8000, "μενού");
    if (go) { await page.click(`[data-go="${go}"]`); await until(async () => (await screens()) === go, 8000, go); }
  };
  const backToCam = async () => {
    for (let i = 0; i < 4 && (await screens()) !== "s-cam"; i++) {
      const b = await page.$("section.screen:not([hidden]) [data-back]");
      if (b) await b.click(); else await page.goBack().catch(() => {});
      await sleep(700);
    }
    await until(async () => (await screens()) === "s-cam", 8000, "πίσω στην κάμερα");
  };

  // 4 · ΤΑ ΤΕΣΣΕΡΑ ΤΙΜΟΛΟΓΙΑ
  const imgPage = await ctx.newPage();
  // κάρτα = η ημερομηνία του τιμολογίου (μοναδική)· γραμμή = λέξη της περιγραφής. ΟΧΙ κωδικός/αριθμός:
  // 13/10 ο Κώστας διάβασε «K100» ως «Κ100» (ελληνικό Κ) και «ΤΔΑ 4411» ως «4411».
  const W = { K100: "ΓΑΛΑ", K200: "ΑΛΕΥΡΙ", "G-77": "ΓΑΛΑ", "A-5": "ΑΛΕΥΡΙ" };
  const dmy = (iso) => iso.split("-").reverse().join("/");
  const cardOf = (v) => page.locator("#pend-body .card").filter({ hasText: dmy(v.date) });
  const lineOf = (v, code) => cardOf(v).locator(".pro-ln").filter({ hasText: W[code] });

  for (let i = 0; i < INV.length; i++) {
    const v = INV[i];
    const tag = "τιμολόγιο " + (i + 1) + " (" + v.sup + " " + v.date + ")";
    await imgPage.setContent(invHtml(v));
    await imgPage.setViewportSize({ width: 1240, height: 1754 });
    const png = (await imgPage.screenshot({ type: "png" })).toString("base64");
    await page.evaluate((u) => window.__setFake(u), "data:image/png;base64," + png);
    await until(() => page.evaluate(() => document.getElementById("vid").videoWidth > 0), 15000, "βίντεο κάμερας");
    await sleep(600);
    await page.click("#shutter");
    await until(() => page.evaluate(() => !document.getElementById("preview").hidden), 8000, "προεπισκόπηση");
    await page.click("#prev-ok");
    await until(async () => (await screens()) === "s-who", 8000, "Προμηθευτής");
    await page.click("#who-date-edit");
    await page.evaluate((d) => { const x = document.getElementById("who-date-inp"); x.value = d; x.dispatchEvent(new Event("change", { bubbles: true })); }, v.date);
    await page.click("#who-tab-new");
    await page.fill("#in-sup", v.sup);
    if (i === 0) await shot("who_" + (i + 1));
    await page.click("#add-sup");
    await until(async () => (await screens()) === "s-cam", 8000, "καταχώρηση");
    step(tag + " · φωτογραφήθηκε");

    await openMenu("s-pend");
    // περιμένει την ανάγνωση του Κώστα AI (ζωντανά: η οθόνη ξαναζωγραφίζεται μόνη της)
    try {
      await until(async () => (await cardOf(v).locator(".pro-ln").count()) >= v.lines.length, 150000, "ανάγνωση " + tag);
    } catch (e) {
      await shot("pend_wait_fail_" + (i + 1));
      R.cards[tag] = await page.locator("#pend-body").innerText().catch(() => "");
      R.diag = await page.evaluate(() => ({ diag: localStorage.getItem("km_ai_diag"), err: localStorage.getItem("km_ai_err") }));
      throw e;
    }
    await sleep(500);
    await cardOf(v).scrollIntoViewIfNeeded();
    await shot("pend_" + (i + 1) + "_read");
    const txt = () => cardOf(v).innerText();
    R.cards[tag + " · διαβάστηκε"] = await txt();
    R.codes = R.codes || {};
    R.codes[tag] = (await cardOf(v).locator(".pro-d b").allInnerTexts()).map((c) => c + (/[\u0370-\u03ff]/.test(c) ? " [ΕΛΛΗΝΙΚΑ γράμματα]" : " [λατινικά]"));
    const L = async (code) => (await lineOf(v, code).innerText()).replace(/\s+/g, " ");
    ok((await cardOf(v).locator(".pro-ln").count()) === v.lines.length, tag + ": " + v.lines.length + " γραμμές", await txt());

    if (i === 0) {
      ok(/🆕 πρώτη αγορά/.test(await L("K100")) && /🆕 πρώτη αγορά/.test(await L("K200")), "Τ1: 🆕 πρώτη αγορά και στις δύο γραμμές", await txt());
      ok(/1,5 €\/λίτρο/.test(await L("K100")), "Τ1: ΓΑΛΑ 1LT → 1,5 €/λίτρο", await L("K100"));
      ok(/0,8 €\/κιλό/.test(await L("K200")), "Τ1: ΑΛΕΥΡΙ σακί 25KG × 20 € → 0,8 €/κιλό", await L("K200"));
    }
    if (i === 1) {
      ok(/🔺 \+6,7% από την τελευταία \(1,5, 02\/10\/2026\)/.test(await L("K100")), "Τ2 (σύγκριση μετά την αποθήκευση): ΓΑΛΑ 🔺 +6,7% από την τελευταία (1,5, 02/10)", await L("K100"));
      ok(/🔺 \+5% από την τελευταία \(0,8,/.test(await L("K200")), "Τ2: ΑΛΕΥΡΙ 🔺 +5% από την τελευταία (0,8)", await L("K200"));
      ok(!/Φθηνότερα/.test(await txt()), "Τ2: κανένα «Φθηνότερα» (ένας προμηθευτής)", await txt());
    }
    if (i === 2) {
      ok(/🆕 πρώτη αγορά/.test(await L("G-77")) && /🆕 πρώτη αγορά/.test(await L("A-5")), "Τ3 πριν το «ίδιο με»: ΑΚΤΗ = 🆕 (ποτέ σιωπηλή ένωση)", await txt());
      ok(/1,45 €\/λίτρο/.test(await L("G-77")), "Τ3: ΚΙΒ «6x1LT» × 8,70 → 1,45 €/λίτρο", await L("G-77"));
      // «Είναι ίδιο με…» ×2
      for (const [code, want] of [["G-77", "ΓΑΛΑ"], ["A-5", "ΑΛΕΥΡΙ"]]) {
        await lineOf(v, code).click();
        await page.waitForSelector("#pro-sheet [data-a=\"same\"]", { timeout: 8000 });
        await shot("sheet_" + code);
        await page.click("#pro-sheet [data-a=\"same\"]");
        await page.waitForSelector("#pro-sheet .pro-opt", { timeout: 8000 });
        const opts = await page.locator("#pro-sheet .pro-opt").allInnerTexts();
        R.cards["ίδιο με · επιλογές για " + code] = opts.join(" || ");
        ok(opts.length === 2, "«ίδιο με» για " + code + ": λίστα με τα 2 αποθηκευμένα προϊόντα (όχι τον εαυτό του)", opts.join(" || "));
        await page.fill("#pro-sheet .pro-find", want);
        const f = await page.locator("#pro-sheet .pro-opt").allInnerTexts();
        ok(f.length === 1 && f[0].includes(want), "«ίδιο με»: αναζήτηση «" + want + "» → 1 επιλογή", f.join(" || "));
        await shot("same_" + code);
        await page.locator("#pro-sheet .pro-opt").first().click();
        await until(async () => !(await page.$("#pro-sheet")), 5000, "κλείσιμο φύλλου");
        await sleep(800);
      }
      R.cards[tag + " · μετά το «ίδιο με»"] = await txt();
      ok(!/🆕/.test(await txt()), "Τ3 μετά το «ίδιο με»: το 🆕 έφυγε και από τις δύο γραμμές", await txt());
      const book = await page.evaluate(() => JSON.parse(localStorage.getItem("km_book") || "null"));
      const pids = book ? Object.keys(book.prods) : [];
      ok(pids.length === 2 && pids.every((p) => /^P[0-9A-Z]+$/.test(p)), "δύο κεντρικά προϊόντα με κωδικό ΣΥΣΤΗΜΑΤΟΣ (" + pids.join(", ") + ")", JSON.stringify(book && book.prods));
      ok(book && book.log.filter((x) => x.kind === "link").length === 2, "ίχνος: 2 εγγραφές «link»", JSON.stringify(book && book.log));
      R.bookPids = pids;
      // φύλλο τιμών της γραμμής
      await lineOf(v, "G-77").click();
      await page.waitForSelector("#pro-sheet .pro-tbl", { timeout: 8000 });
      const sh = (await page.locator("#pro-sheet").innerText()).replace(/\s+/g, " ");
      R.cards["φύλλο G-77 μετά το ίδιο με"] = sh;
      ok(/κεντρικό προϊόν P/.test(sh) && /ΟΡΙΖΩΝ/.test(sh) && /✂/.test(sh), "φύλλο G-77: κεντρικό προϊόν + τιμές ΟΡΙΖΩΝ + «βγάλ’ το»", sh);
      await shot("sheet_G-77_linked");
      await page.click("#pro-sheet [data-x]");
    }
    if (i === 3) {
      ok(/🔺 \+1,3% από την τελευταία \(1,6, 09\/10\/2026\)/.test(await L("K100")), "Τ4: ΓΑΛΑ 🔺 +1,3% από την τελευταία του ΙΔΙΟΥ (1,6, 09/10)", await L("K100"));
      ok(/Φθηνότερα: 1,45 €\/λίτρο από ΑΚΤΗ \(10\/10\/2026\)/.test(await L("K100")), "Τ4: ΓΑΛΑ «Φθηνότερα: 1,45 €/λίτρο από ΑΚΤΗ»", await L("K100"));
      ok(/🔺 \+4,8% από την τελευταία \(0,84,/.test(await L("K200")), "Τ4: ΑΛΕΥΡΙ 🔺 +4,8% (0,84)", await L("K200"));
      ok(/Φθηνότερα: 0,76 €\/κιλό από ΑΚΤΗ/.test(await L("K200")), "Τ4: ΑΛΕΥΡΙ «Φθηνότερα: 0,76 €/κιλό από ΑΚΤΗ»", await L("K200"));
    }
    // Αποθήκευση (τα ποσά από τον Κώστα· αν λείπει σύνολο, το γράφουμε)
    const tot = cardOf(v).locator("input").nth(2);
    const totals = await cardOf(v).locator("input").evaluateAll((xs) => xs.map((x) => x.value));
    R.cards[tag + " · ποσά"] = totals.join(" / ");
    ok(totals.some((x) => x.replace(",", ".") === String(v.total)), tag + ": σύνολο " + eur(v.total) + " διαβάστηκε", totals.join(" / "));
    await cardOf(v).getByRole("button", { name: "Αποθήκευση", exact: true }).click();
    await until(async () => (await cardOf(v).count()) === 0, 8000, "αποθήκευση " + tag);
    step(tag + " · αποθηκεύτηκε");
    void tot;
    await backToCam();
  }

  // 5 · «📊 Τιμές»
  await openMenu();
  ok(await page.locator("#m-prices-row").isVisible(), "μενού: «📊 Τιμές» φαίνεται σε PRO");
  await shot("menu");
  await page.click("#m-prices-row");
  await until(async () => (await page.locator("#prices-body .pro-card").count()) >= 1, 8000, "Τιμές");
  await sleep(500);
  await shot("prices");
  const cards = await page.locator("#prices-body .pro-card").allInnerTexts();
  R.cards["Τιμές"] = cards.map((c) => c.replace(/\s+/g, " "));
  ok(cards.length === 2, "Τιμές: 2 προϊόντα (ΓΑΛΑ, ΑΛΕΥΡΙ) — όχι 4 κωδικοί", cards.join(" || "));
  ok(cards.some((c) => /^ΓΑΛΑ ΦΡΕΣΚΟ 1LT\b/.test(c.trim())) && cards.some((c) => /^ΑΛΕΥΡΙ ΣΑΚΙ 25KG\b/.test(c.trim())), "v195: το κεντρικό προϊόν έχει το όνομα που ΔΙΑΛΕΧΤΗΚΕ (ΓΑΛΑ ΦΡΕΣΚΟ 1LT, όχι 6x1LT)", cards.join(" || "));
  const gala = (cards.find((c) => /ΓΑΛΑ/.test(c)) || "").replace(/\s+/g, " ");
  const alev = (cards.find((c) => /ΑΛΕΥΡΙ/.test(c)) || "").replace(/\s+/g, " ");
  ok(/ΑΚΤΗ 1,45 10\/10\/2026 ΟΡΙΖΩΝ 1,62 12\/10\/2026/.test(gala), "ΓΑΛΑ: ΑΚΤΗ 1,45 πρώτη (φθηνότερη), ΟΡΙΖΩΝ 1,62 (τελευταία)", gala);
  ok(/σταθμισμένος\): 1,567 €\/λίτρο · 4 αγορές/.test(gala), "ΓΑΛΑ: σταθμισμένος μέσος όρος 1,567 €/λίτρο · 4 αγορές (112,80 / 72 λτ)", gala);
  ok(/ΑΚΤΗ 0,76 .*ΟΡΙΖΩΝ 0,88/.test(alev), "ΑΛΕΥΡΙ: ΑΚΤΗ 0,76 πρώτη, ΟΡΙΖΩΝ 0,88", alev);
  ok(/σταθμισμένος\): 0,816 €\/κιλό · 4 αγορές/.test(alev), "ΑΛΕΥΡΙ: σταθμισμένος μέσος όρος 0,816 €/κιλό (102 / 125 κιλά)", alev);
  ok((await page.locator("#prices-body .pro-pid").count()) === 2, "Τιμές: κωδικός κεντρικού προϊόντος σε κάθε κάρτα");
  const log = (await page.locator("#prices-body .pro-log").innerText().catch(() => "")).replace(/\s+/g, " ");
  R.cards["Πρόσφατες αλλαγές"] = log;
  ok((log.match(/μπήκε στο/g) || []).length === 2, "«Πρόσφατες αλλαγές»: οι 2 αντιστοιχίσεις", log);
  await page.fill("#prices-body .pro-find", "αλευρι");
  ok((await page.locator("#prices-body .pro-card").count()) === 1, "Τιμές: αναζήτηση «αλευρι» (πεζά, χωρίς τόνο) → 1");
  await page.fill("#prices-body .pro-find", "G-77");
  ok((await page.locator("#prices-body .pro-card").count()) === 1, "Τιμές: αναζήτηση με κωδικό προμηθευτή «G-77» → ΓΑΛΑ");
  await page.fill("#prices-body .pro-find", "");
  await page.selectOption("#prices-body .pro-sel", "ΑΚΤΗ");
  ok((await page.locator("#prices-body .pro-card").count()) === 2, "Τιμές: φίλτρο προμηθευτή ΑΚΤΗ → 2");
  await shot("prices_filter");

  // 5β · v195: ΜΕΤΟΝΟΜΑΣΙΑ ΠΡΟΜΗΘΕΥΤΗ — το βιβλίο τιμών ακολουθεί (Προμηθευτές → ΟΡΙΖΩΝ → ✎)
  await backToCam();
  await openMenu("s-sup");
  await page.locator("#sup-body .sup-line button.row", { hasText: "ΟΡΙΖΩΝ" }).first().click();
  await page.waitForSelector("#sup-rename", { timeout: 8000 });
  await page.click("#sup-rename");
  await until(async () => (await screens()) === "s-who", 8000, "μετονομασία: οθόνη Προμηθευτής");
  await page.click("#who-tab-new");
  await page.fill("#in-sup", "ΟΡΙΖΩΝ ΤΡΟΦΙΜΑ");
  await page.click("#add-sup");
  await until(async () => (await screens()) === "s-sup", 8000, "μετονομασία: πίσω στον προμηθευτή");
  await shot("rename");
  step("μετονομασία ΟΡΙΖΩΝ → ΟΡΙΖΩΝ ΤΡΟΦΙΜΑ");
  await sleep(11000);   // περνάει το παράθυρο αναίρεσης (10″)
  await backToCam();
  await openMenu("s-prices");
  await until(async () => (await page.locator("#prices-body .pro-card").count()) >= 1, 8000, "Τιμές μετά τη μετονομασία");
  const rc = (await page.locator("#prices-body .pro-card").allInnerTexts()).map((c) => c.replace(/\s+/g, " "));
  R.cards["Τιμές μετά τη μετονομασία"] = rc;
  ok(rc.length === 2, "🔴 v195: μετά τη μετονομασία πάλι 2 προϊόντα (το «ίδιο με» ακολούθησε)", rc.join(" || "));
  ok(rc.some((c) => /ΑΚΤΗ 1,45 .*ΟΡΙΖΩΝ ΤΡΟΦΙΜΑ 1,62/.test(c)), "v195: ΓΑΛΑ: ΑΚΤΗ 1,45 · ΟΡΙΖΩΝ ΤΡΟΦΙΜΑ 1,62", rc.join(" || "));
  const bk = await page.evaluate(() => JSON.parse(localStorage.getItem("km_book") || "null"));
  ok(bk && !Object.keys(bk.items).some((k) => k.indexOf("ΟΡΙΖΩΝ|") === 0) && bk.log.some((x) => x.kind === "rename"), "v195: καμία ορφανή εγγραφή «ΟΡΙΖΩΝ|» · μετονομασία στο ίχνος", JSON.stringify(bk && Object.keys(bk.items)));
  const lg2 = (await page.locator("#prices-body .pro-log").innerText().catch(() => "")).replace(/\s+/g, " ");
  ok(/προμηθευτής «ΟΡΙΖΩΝ» → «ΟΡΙΖΩΝ ΤΡΟΦΙΜΑ»/.test(lg2), "v195: «Πρόσφατες αλλαγές» δείχνει τη μετονομασία", lg2);
  await shot("prices_after_rename");
  await backToCam();

  // 6 · Το βιβλίο ταξιδεύει στον σφραγισμένο φάκελο: σβήνω το τοπικό, ξαναφορτώνω, πρέπει να γυρίσει
  await sleep(12000);   // ο συγχρονισμός (scheduleSync) προλαβαίνει
  const pushes = R.api.filter((x) => /POST|PUT/.test(x) && /(folder|sync|push)/i.test(x));
  R.pushes = pushes;
  await page.evaluate(() => { localStorage.removeItem("km_book"); });
  await page.goto(BASE + "/kostometro/", { waitUntil: "domcontentloaded" });
  await until(async () => (await screens()) === "s-cam", 30000, "κάμερα μετά την επαναφόρτωση");
  await until(() => page.evaluate(() => { try { return Object.keys(JSON.parse(localStorage.getItem("km_book")).prods).length === 2; } catch (e) { return false; } }), 30000, "βιβλίο από τον φάκελο")
    .then(() => ok(true, "🔴 το βιβλίο γύρισε από τον σφραγισμένο φάκελο (τοπικό σβησμένο → κατέβασμα)"),
          (e) => ok(false, "🔴 το βιβλίο γύρισε από τον σφραγισμένο φάκελο", e.message));
  const b2 = await page.evaluate(() => JSON.parse(localStorage.getItem("km_book") || "null"));
  ok(b2 && JSON.stringify(Object.keys(b2.prods).sort()) === JSON.stringify((R.bookPids || []).slice().sort()), "ίδιοι κωδικοί κεντρικών προϊόντων μετά το κατέβασμα", JSON.stringify(b2 && Object.keys(b2.prods)));
  await openMenu("s-prices");
  await until(async () => (await page.locator("#prices-body .pro-card").count()) >= 1, 8000, "Τιμές 2");
  ok((await page.locator("#prices-body .pro-card").count()) === 2, "Τιμές μετά το κατέβασμα: πάλι 2 προϊόντα");
  await shot("prices_after_pull");

  // 7 · γνωστό μικρό: η μπάρα «Επίλεξε όλα» σκεπάζει την τελευταία κάρτα; (μέτρηση, με 2 εκκρεμή)
  await backToCam();
  for (let j = 0; j < 2; j++) {
    await page.evaluate((u) => window.__setFake(u), "data:image/png;base64," + (await imgPage.screenshot({ type: "png" })).toString("base64"));
    await sleep(400); await page.click("#shutter");
    await until(() => page.evaluate(() => !document.getElementById("preview").hidden), 8000, "προεπισκόπηση");
    await page.click("#prev-ok"); await until(async () => (await screens()) === "s-who", 8000, "who");
    await page.click("#who-tab-new"); await page.fill("#in-sup", "ΜΠΑΡΑ " + (j + 1)); await page.click("#add-sup");
    await until(async () => (await screens()) === "s-cam", 8000, "cam");
  }
  await openMenu("s-pend");
  await sleep(1500);
  await page.evaluate(() => { const b = document.querySelector("#s-pend .pg-body") || document.scrollingElement; b.scrollTop = 1e6; window.scrollTo(0, 1e6); });
  await sleep(600);
  const ov = await page.evaluate(() => {
    const bar = document.querySelector("#pend-body .multi-bar"), cs = [...document.querySelectorAll("#pend-body .card")];
    if (!bar || !cs.length) return { bar: !!bar, cards: cs.length };
    const a = bar.getBoundingClientRect(), last = cs[cs.length - 1], btn = last.querySelector(".acts") || last, c = btn.getBoundingClientRect();
    return { barTop: a.top, barBottom: a.bottom, barPos: getComputedStyle(bar).position, lastActsTop: c.top, lastActsBottom: c.bottom, overlap: Math.max(0, Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top)) };
  });
  R.bar = ov;
  await shot("pend_bar_bottom");
  step("μπάρα «Επίλεξε όλα»: " + JSON.stringify(ov));

  await browser.close();
}

main().then(() => {
  step("ΤΕΛΟΣ · " + pass + " OK / " + fail + " FAIL");
  save();
  process.exit(fail ? 1 : 0);
}).catch((e) => {
  R.errors.push("ΚΑΤΑΡΡΕΥΣΗ: " + (e && e.stack || e));
  step("ΚΑΤΑΡΡΕΥΣΗ: " + (e && e.message));
  save();
  process.exit(2);
});
