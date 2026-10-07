// v121 · QR ΠΙΣΩ στη συσκευή που βγήκε εκτός (ίδιος λογαριασμός) · κείμενο κουμπιού αλλαγής λέξεων (Stavros 7/10/2026)
//   node tests/v121.test.mjs   ·   node tests/v121.test.mjs --mutate=N   (exit 0 = η μετάλλαξη ΠΙΑΣΤΗΚΕ)
import { readFileSync } from "node:fs";
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let js = readFileSync("site/kostometro/app.js", "utf8");
let html = readFileSync("site/kostometro/index.html", "utf8");
const MUT = [
  // Μ1 · η εκτός λειτουργίας ξανα-αρνείται το QR
  ["js", "    if (qin && localStorage.getItem(LS.reg) && !isLocked() && !localStorage.getItem(LS.lockDead)) {", "    if (qin && localStorage.getItem(LS.reg)) {"],
  // Μ2 · 🔴 QR ΑΛΛΟΥ λογαριασμού πατάει τον λογαριασμό της συσκευής
  ["js", "          if (localStorage.getItem(LS.reg) && localStorage.getItem(LS.folder) && localStorage.getItem(LS.folder) !== p.f) {", "          if (false) {"],
  // Μ3 · το παλιό κείμενο του κουμπιού
  ["html", "Τις είδε κάποιος άλλος; Δημιούργησε 12 καινούριες λέξεις και αποθήκευσέ τες σε ένα κομμάτι χαρτί", "Τις είδε κάποιος άλλος; Βγάλε νέες"],
];
if (ONLY !== null) {
  const m = MUT[ONLY - 1]; const bag = { js, html };
  if (!m || !bag[m[0]].includes(m[1])) { console.log("Η ΜΕΤΑΛΛΑΞΗ Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(1); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ js, html } = bag);
}
let failed = 0;
const check = (n, f) => { try { f(); console.log("  ✔ " + n); } catch (e) { failed++; console.log("  ✘ " + n + " — " + e.message); } };
const ok = (c, w) => { if (!c) throw new Error(w); };
check("Κ-1 · η συσκευή ΕΚΤΟΣ λειτουργίας δέχεται QR· η ΕΝΕΡΓΗ όχι", () => {
  ok(js.includes("    if (qin && localStorage.getItem(LS.reg) && !isLocked() && !localStorage.getItem(LS.lockDead)) {"), "φραγμός ενεργής");
});
check("Κ-2 · 🔴 μόνο ο ΙΔΙΟΣ λογαριασμός", () => {
  ok(js.includes("localStorage.getItem(LS.folder) !== p.f) {"), "έλεγχος φακέλου");
});
check("Κ-3 · κείμενο κουμπιού (Stavros 7/10)", () => {
  ok(html.includes(">Τις είδε κάποιος άλλος; Δημιούργησε 12 καινούριες λέξεις και αποθήκευσέ τες σε ένα κομμάτι χαρτί</button>"), "κείμενο");
});
console.log(failed ? "\n✘ " + failed + " ΑΠΕΤΥΧΑΝ" : "\n✔ ΟΛΑ ΠΕΡΑΣΑΝ");
if (ONLY !== null) process.exit(failed ? 0 : 1);
process.exit(failed ? 1 : 0);
