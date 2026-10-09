// v122 · Η ΕΓΚΑΤΑΣΤΑΣΗ ΠΡΩΤΟ ΒΗΜΑ (Android + iPhone ίδια) · αναγνώριση «έχεις ήδη
//        λογαριασμό» από το email · σάρωση QR μέσα στην εφαρμογή · φιλικό όνομα
//        συσκευής στα email (αποφάσεις Stavros 8/10/2026)
//   node tests/v122.test.mjs
//   node tests/v122.test.mjs --mutate=N   (exit 0 = η μετάλλαξη ΠΙΑΣΤΗΚΕ)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let js = readFileSync("site/kostometro/app.js", "utf8");
let html = readFileSync("site/kostometro/index.html", "utf8");
const MUT = [
  // Μ1 · 🔴 η κάρτα αποκτά «Κλείσιμο» ΚΑΙ χωρίς λογαριασμό (ή τώρα ή ποτέ — χάνεται)
  ["js", "if (el('inst-x')) { el('inst-x').hidden = !localStorage.getItem(LS.reg); }   /* KM-V122-FIRST */",
         "if (el('inst-x')) { el('inst-x').hidden = false; }   /* KM-V122-FIRST */"],
  // Μ2 · 🔴 ξαναμπαίνει η πύλη «μόνο μετά τον λογαριασμό» (η παγίδα του iPhone)
  ["js", "    /* (2) μέσα σε Facebook/Messenger δεν εγκαθίσταται τίποτα — ποτέ κάρτα εκεί */\n    if (iabName()) { return; }",
         "    if (!localStorage.getItem(LS.reg)) { return; }\n    /* (2) μέσα σε Facebook/Messenger δεν εγκαθίσταται τίποτα — ποτέ κάρτα εκεί */\n    if (iabName()) { return; }"],
  // Μ3 · 🔴 το 'taken' ξαναγίνεται αδιέξοδο μήνυμα αντί για την οθόνη των δύο δρόμων
  ["js", "        if (res === 'taken') { return haveShow(v); }   /* v122 · KM-V122-HAVE */\n", ""],
  // Μ4 · 🔴 ο σαρωτής δέχεται λάθος μορφή κωδικού (σπασμένο μονοπάτι QR)
  ["js", "/#km_qr=([0-9a-f]{32})\\.([A-Za-z0-9_-]{43})/", "/#km_qr=([0-9a-f]{31})\\.([A-Za-z0-9_-]{43})/"],
  // Μ5 · το email ξαναγράφει «X11; Linux x86_64»
  ["js", "    else if (/Linux/.test(ua) && touch) { dev = 'Tablet Android'; }\n", ""],
  // Μ6 · ξαναγυρίζει το «Συνέχεια εδώ» στον browser του Messenger
  ["js", "      if (iabName()) { return iabShow(); }   /* v122: χωρίς «Συνέχεια εδώ» */\n",
         "      if (iabName() && !sessionStorage.getItem('km_iab_stay')) { return iabShow(); }\n"],
];
if (ONLY !== null) {
  const m = MUT[ONLY - 1]; const bag = { js, html };
  if (!m || !bag[m[0]].includes(m[1])) { console.log("Η ΜΕΤΑΛΛΑΞΗ Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(1); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ js, html } = bag);
}
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✔ " + m); } else { fail++; console.log("  ✘ " + m); } };
const body = (name) => { const i = js.indexOf("  function " + name + "("); return js.slice(i, js.indexOf("\n  }\n", i) + 4); };

ok(/APP_VER = 'φέτα 3 · v1(2[2-9]|[3-9]\d)'/.test(js), "έκδοση v122 ή νεότερη");   // v123: η έκδοση ανεβαίνει σε κάθε deploy
ok(["KM-V122-FIRST", "KM-V122-HAVE", "KM-V122-SCAN", "KM-V122-DEVNAME"].every((k) => js.includes(k)), "οι 4 δείκτες v122");

// (1) εγκατάσταση πρώτο βήμα — καμία πύλη λογαριασμού, καμία πύλη iPhone
const mi = body("maybeInstall");
ok(!/getItem\(LS\.reg\)[^\n]*\{ return; \}/.test(mi), "maybeInstall: ΚΑΜΙΑ πύλη «μόνο μετά τον λογαριασμό»");
ok(!/'ios'/.test(mi), "maybeInstall: καμία εξαίρεση πλατφόρμας — Android και iPhone ίδια");
ok(mi.includes("el('inst-x').hidden = !localStorage.getItem(LS.reg)"), "«Κλείσιμο» ΜΟΝΟ για συσκευή με λογαριασμό");
ok(!html.includes('id="inst-no"') && html.includes('id="inst-x"'), "html: το «Όχι τώρα» έφυγε, υπάρχει μόνο «Κλείσιμο» (κρυφό)");
ok(!html.includes("Θα το ξαναβρεις στο"), "html: έφυγε η υπόδειξη «Θα το ξαναβρεις»");

// (2) Messenger χωρίς «Συνέχεια εδώ»
ok(!html.includes('id="iab-stay"'), "html: χωρίς «Συνέχεια εδώ»");
ok(js.includes("if (iabName()) { return iabShow(); }"), "boot: Facebook/Messenger → πάντα «Άνοιξε στον Chrome/Safari»");
ok(!js.includes("km_iab_stay"), "κανένα υπόλειμμα km_iab_stay");

// (3) πρώτη οθόνη: μόνο «Ξεκινάω τώρα» — αναγνώριση από το email
ok(!html.includes('id="acc-yes"') && !html.includes('id="email-have"'), "html: χωρίς «Έχω ήδη λογαριασμό» (s-acc + s-email)");
ok(html.includes('id="s-have"') && html.includes('id="hv-scan"') && html.includes('id="hv-words"'), "html: οθόνη «Έχεις ήδη λογαριασμό» με QR + 12 λέξεις");
ok(js.includes("if (res === 'taken') { return haveShow(v); }"), "sendCode 'taken' → s-have");
ok(js.includes("if (o.code === 'taken') { return haveShow("), "OAuth 'taken' → s-have");
ok(js.includes("haveShow(codeEmail)"), "verify 'taken' → s-have");
ok(js.includes("if (signinFrom === 's-have') { haveShow(); return; }"), "«Πίσω» από τις 12 λέξεις γυρίζει στο s-have");
ok(/SCREENS\.push\('s-have', 's-scan'\)/.test(js), "οι νέες οθόνες στη SCREENS (χωριστό push)");

// (4) σάρωση: πραγματικός κύκλος — φτιάχνω QR με το qr.js, το διαβάζω με το qrscan.js
const rx = /\/#km_qr=\(\[0-9a-f\]\{(\d+)\}\)\\\.\(\[A-Za-z0-9_-\]\{(\d+)\}\)\//.exec(js);
ok(!!rx, "ο σαρωτής έχει το μοτίβο #km_qr=");
const scanRe = new RegExp("#km_qr=([0-9a-f]{" + rx[1] + "})\\.([A-Za-z0-9_-]{" + rx[2] + "})");
const tid = "ab12cd34ef56ab12cd34ef56ab12cd34";
const T = "A".repeat(42) + "_";
const link = "https://fastwrite.tech/kostometro/?src=qr#km_qr=" + tid + "." + T;
const qrcode = require("../site/kostometro/qr.js");
const jsQR = require("../site/kostometro/qrscan.js");
const q = qrcode(0, "M"); q.addData(link); q.make();
const n = q.getModuleCount(), sc = 4, quiet = 4 * sc, size = n * sc + 2 * quiet;
const data = new Uint8ClampedArray(size * size * 4).fill(255);
for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c))
  for (let y = 0; y < sc; y++) for (let x = 0; x < sc; x++) {
    const px = ((quiet + r * sc + y) * size + quiet + c * sc + x) * 4;
    data[px] = data[px + 1] = data[px + 2] = 0;
  }
const hit = jsQR(data, size, size);
ok(!!hit && hit.data === link, "το qrscan.js διαβάζει το QR του qr.js (ίδιο κείμενο)");
const m2 = hit && scanRe.exec(hit.data);
ok(!!m2 && m2[1] === tid && m2[2] === T, "το μοτίβο του σαρωτή βγάζει σωστά tid + T από το διαβασμένο QR");
ok(js.includes("localStorage.setItem(LS.qrIn, JSON.stringify({ tid: m[1], t: m[2], at: Date.now() }));\n    qrInShow('');"), "η σάρωση μπαίνει στο ΙΔΙΟ μονοπάτι με τον σύνδεσμο (LS.qrIn → s-qrin)");
ok(js.includes("BarcodeDetector"), "Chrome Android: εγγενής BarcodeDetector");
ok(js.includes("'/kostometro/qrscan.js'"), "iPhone: το qrscan.js φορτώνεται όταν χρειαστεί");

// (5) όνομα συσκευής (v122 πρώτο μισό, μένει ως έχει)
const dn = new Function("navigator", body("devName") + "; return devName();");
const N = (ua, t) => dn({ userAgent: ua, maxTouchPoints: t });
ok(N("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36", 5) === "Tablet Android · Chrome", "tablet → «Tablet Android · Chrome»");
ok(N("Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1", 5) === "iPhone · Safari", "iPhone → «iPhone · Safari»");
ok(N("Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36", 5) === "Android · SM-S918B · Samsung Internet", "Samsung → μοντέλο + browser");
ok(N("x".repeat(200), 0).length <= 60, "όριο 60 χαρακτήρων");

console.log((fail ? "ΑΠΟΤΥΧΙΑ " : "OK ") + pass + "/" + (pass + fail));
if (ONLY !== null) process.exit(fail ? 0 : 1);
process.exit(fail ? 1 : 0);
