// v119 · ΑΦΑΙΡΕΣΗ «ΜΗΔΕΝΙΣΜΟΥ ΕΓΓΡΑΦΗΣ» — απόφαση Stavros 6/10/2026 (Brief «Μία πόρτα» Γ)
//   node tests/v119.test.mjs            · node tests/v119.test.mjs --mutate=N  (exit 0 = η μετάλλαξη ΠΙΑΣΤΗΚΕ)
import { readFileSync } from "node:fs";
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let js = readFileSync("site/kostometro/app.js", "utf8");
let html = readFileSync("site/kostometro/index.html", "utf8");
const MUT = [
  // Μ1 · το κουμπί ξαναμπαίνει στις Ρυθμίσεις
  ["html", "         Διαγραφή λογαριασμού (Η.11β). -->", "         Διαγραφή λογαριασμού (Η.11β). -->\n    <button class=\"btn danger\" id=\"st-reset\">Μηδενισμός εγγραφής</button>"],
  // Μ2 · ο χειριστής ξαναμπαίνει (σβήνει email + λογαριασμό από τη συσκευή)
  ["js", "  /* v119 · Ο χειριστής του «Μηδενισμός εγγραφής» αφαιρέθηκε", "  el('st-reset').onclick = function () { localStorage.removeItem(LS.email); location.reload(); };\n  /* v119 · Ο χειριστής του «Μηδενισμός εγγραφής» αφαιρέθηκε"],
];
if (ONLY !== null) {
  const m = MUT[ONLY - 1]; const bag = { js, html };
  if (!m || !bag[m[0]].includes(m[1])) { console.log("Η ΜΕΤΑΛΛΑΞΗ Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(1); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ js, html } = bag);
}
let failed = 0;
const check = (n, f) => { try { f(); console.log("  ✔ " + n); } catch (e) { failed++; console.log("  ✘ " + n + " — " + e.message); } };
const ok = (c, w) => { if (!c) throw new Error(w); };
check("Μ-1 · 🔴 κανένα κουμπί «Μηδενισμός εγγραφής» στην εφαρμογή", () => {
  ok(!html.includes('id="st-reset"'), "υπάρχει ακόμα το st-reset");
  ok(!/>\s*Μηδενισμός εγγραφής\s*</.test(html), "υπάρχει ακόμα κείμενο κουμπιού");
});
check("Μ-2 · 🔴 κανένας χειριστής που σβήνει email/λογαριασμό από τις Ρυθμίσεις", () => {
  ok(!js.includes("el('st-reset')"), "υπάρχει ακόμα χειριστής");
});
check("Μ-3 · η Διαγραφή λογαριασμού μένει", () => {
  ok(html.includes('id="st-delacc"') && js.includes("el('st-delacc').onclick"), "λείπει η Διαγραφή");
});
console.log(failed ? "\n✘ " + failed + " ΑΠΕΤΥΧΑΝ" : "\n✔ ΟΛΑ ΠΕΡΑΣΑΝ");
if (ONLY !== null) process.exit(failed ? 0 : 1);
process.exit(failed ? 1 : 0);
