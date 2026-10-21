// v135 · Ευρήματα Stavros στη δοκιμή του build 4 (20/10/2026): οθόνη κλειδιού Gemini · άσπρο αναβόσβημα ·
//        γκρι «▶» στην κάμερα · «Διαβάστηκαν από το Gemini» ενώ διάβασε ο Κώστας.
//   node tests/v135.test.mjs            · --mutate=N (exit 0 = πιάστηκε)
import { readFileSync } from "node:fs";
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let APP = readFileSync("site/kostometro/app.js", "utf8");
let HTML = readFileSync("site/kostometro/index.html", "utf8");
let CAP = readFileSync("../kostometro-app/capacitor.config.json", "utf8");
const VER = readFileSync("site/kostometro/version.json", "utf8"), SW = readFileSync("site/kostometro/sw.js", "utf8");
const MUT = [
  ["app", "/* v135 · KM-V135-NOKEY:", "if (!localStorage.getItem(LS.key) && !localStorage.getItem(LS.skip)) { return show('s-key'); } /* v135 · KM-V135-NOKEY:"],  // 1 · ξαναμπαίνει η οθόνη κλειδιού
  ["html", '<video id="vid" playsinline muted autoplay poster="', '<video id="vid" playsinline muted autoplay data-x="'],      // 2 · κάμερα χωρίς poster
  ["html", 'muted poster="data:image/gif', 'muted data-x="data:image/gif'],                                                   // 3 · σαρωτής QR χωρίς poster
  ["app", "r && r.aiBy === 'kostas' ? 'Διαβάστηκαν από τον Κώστα (AI)'", "false ? 'Διαβάστηκαν από τον Κώστα (AI)'"],          // 4 · πάντα «Gemini»
  ["cap", '"backgroundColor": "#0a0e14",\n  "android"', '"android"'],                                                          // 5 · άσπρο φόντο στο κέλυφος
  ["html", "<style>html{background:#0a0e14}", "<style>"],                                                                       // 6 · άσπρο πριν το app.css
];
if (ONLY) {
  const m = MUT[ONLY - 1]; if (!m) process.exit(2);
  const t = { app: APP, html: HTML, cap: CAP }[m[0]];
  if (!t.includes(m[1])) { console.log("Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(3); }
  const r = t.replace(m[1], m[2]); if (m[0] === "app") APP = r; else if (m[0] === "html") HTML = r; else CAP = r;
}
const res = []; const ok = (n, c, i) => { res.push(!!c); console.log((c ? "✅" : "❌") + " " + n + (i ? "  — " + i : "")); };
const showKey = (APP.match(/show\('s-key'\)/g) || []).length;
ok("Γ1 καμία διαδρομή προς την οθόνη κλειδιού Gemini (show('s-key'))", showKey === 0, showKey + " βρέθηκαν");
const vids = [...HTML.matchAll(/<video [^>]*>/g)].map((m) => m[0]);
ok("Γ2 κάθε <video> έχει διάφανο poster (όχι γκρι «▶» στο Android)", vids.length >= 2 && vids.every((v) => /poster="data:image\/gif;base64,/.test(v)), vids.length + " βίντεο");
const note = APP.slice(APP.indexOf("KM-V135-READBY"), APP.indexOf("KM-V135-READBY") + 400);
ok("Γ3 το «Διαβάστηκαν από…» ακολουθεί το rec.aiBy", /r && r\.aiBy === 'kostas' \? 'Διαβάστηκαν από τον Κώστα \(AI\)' : 'Διαβάστηκαν από το Gemini'/.test(note));
ok("Γ4 ο Κώστας γράφει aiBy='kostas' όταν διαβάζει", APP.includes("rec.aiBy = 'kostas'"));
let cap = {}; try { cap = JSON.parse(CAP); } catch (e) {}
ok("Γ5 κέλυφος: σκούρο φόντο (γενικό + Android + iOS)", cap.backgroundColor === "#0a0e14" && cap.android && cap.android.backgroundColor === "#0a0e14" && cap.ios && cap.ios.backgroundColor === "#0a0e14");
ok("Γ6 index.html: σκούρο html πριν το app.css", /<style>html\{background:#0a0e14\}/.test(HTML) && HTML.indexOf("html{background:#0a0e14}") < HTML.indexOf("<body"));
ok("Γ7 έκδοση ≥ v135 (v136 21/10: ελέγχεται στο v136.test)", /var APP_VER = 'φέτα 3 · v13[5-9]';/.test(APP) && /"v13[5-9]"/.test(VER) && /var CACHE = 'km-v13[5-9]';/.test(SW));
const bad = res.filter((x) => !x).length;
if (ONLY) { console.log(bad ? "Μ" + ONLY + " → κοκκίνισε ✔" : "Μ" + ONLY + " ΠΕΡΑΣΕ ✘"); process.exit(bad ? 0 : 1); }
console.log("\n" + (res.length - bad) + "/" + res.length + (bad ? " ΑΠΕΤΥΧΑΝ" : " OK")); process.exit(bad ? 1 : 0);
