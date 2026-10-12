// v127 · KM-V127-IOS26 — στο iOS 26 το «Κοινοποίηση» είναι μέσα στις «···» κάτω δεξιά
// (πραγματικό iPhone 16 · iOS 26.5, TestingBot, 12/10/2026). Η οδηγία το λέει σε ΚΑΘΕ σημείο:
// οθόνη εγκατάστασης, Ερωτήσεις & απαντήσεις, γνώση του Κώστα.
//   node tests/v127.test.mjs            node tests/v127.test.mjs --mutate=N   (exit 0 = πιάστηκε)
import { readFileSync } from "node:fs";
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let js = readFileSync("site/kostometro/app.js", "utf8");
let flow = readFileSync("tools/agent/flow_el.md", "utf8");
let sw = readFileSync("site/kostometro/sw.js", "utf8");
const MUT = [
  ["js", "δίπλα στη διεύθυνση. <b>Νέο iPhone (iOS 26):</b> αν δεν το βλέπεις, πάτα πρώτα τις <b>τρεις τελείες «···»</b> κάτω δεξιά και μετά <b>«Κοινοποίηση»</b>.');", "δίπλα στη διεύθυνση.');"],
  ["js", "και οι δύο δουλεύουν. <b>Νέο iPhone (iOS 26):</b>", "και οι δύο δουλεύουν. <b>Νέο iPhone:</b>"],
  ["flow", "   - iPhone με iOS 26 (νέο Safari)", "   - iPhone (νέο Safari)"],
  ["sw", "'km-v127'", "'km-v126'"],
];
if (ONLY !== null) {
  const m = MUT[ONLY - 1]; const bag = { js, flow, sw };
  if (!m || !bag[m[0]].includes(m[1])) { console.log("Η ΜΕΤΑΛΛΑΞΗ Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(1); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ js, flow, sw } = bag);
}
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✔ " + m); } else { fail++; console.log("  ✘ " + m); } };
const iosBlock = js.slice(js.indexOf("if (p === 'ios') {"), js.indexOf("if (or) { or.hidden = true; }"));
ok(/τρεις τελείες «···»<\/b> κάτω δεξιά και μετά <b>«Κοινοποίηση»<\/b>/.test(iosBlock) && /iOS 26/.test(iosBlock), "οθόνη εγκατάστασης iPhone: «iOS 26 → ··· κάτω δεξιά → Κοινοποίηση»");
ok(iosBlock.includes("Στο <b>Safari</b> είναι <b>κάτω</b> στην οθόνη"), "το παλιό iOS καλύπτεται ακόμα (Safari κάτω)");
ok(/και οι δύο δουλεύουν\. <b>Νέο iPhone \(iOS 26\):<\/b>/.test(js), "Ερωτήσεις & απαντήσεις: ίδια οδηγία iOS 26");
ok(/iPhone με iOS 26 \(νέο Safari\).*«···»/.test(flow), "γνώση του Κώστα: ίδια οδηγία iOS 26");
ok(sw.includes("'km-v127'") && /APP_VER = 'φέτα 3 · v1(2[7-9]|[3-9]\d)'/.test(js), "έκδοση v127");
console.log("\n" + pass + " ✔ · " + fail + " ✘");
if (ONLY !== null) process.exit(fail ? 0 : 1);
process.exit(fail ? 1 : 0);
