// v123 · FAQ μετά τις v113–v122 (Κώστας, δώρο 20, QR) + το κουμπί «Κώστας · βοήθεια» μαζεύεται
//        όταν κλείσει συζήτηση της Υποστήριξης (Stavros 9/10/2026)
//   node tests/v123.test.mjs   ·   node tests/v123.test.mjs --mutate=N   (exit 0 = η μετάλλαξη ΠΙΑΣΤΗΚΕ)
import { readFileSync } from "node:fs";
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let js = readFileSync("site/kostometro/app.js", "utf8");
let html = readFileSync("site/kostometro/index.html", "utf8");
let know = readFileSync("site/kostometro/agent/knowledge_el.md", "utf8");
const MUT = [
  // Μ1 · 🔴 το FAQ ξαναλέει ότι η φωτογραφία ΔΕΝ περνά ποτέ από εμάς (ψέμα για τον Κώστα)
  ["js", "<b>Με τον Κώστα (τα 20 δωρεάν):</b> η φωτογραφία περνάει από τον διακομιστή μας μόνο για τη στιγμή της ανάγνωσης και δεν αποθηκεύεται.", ""],
  // Μ2 · ξαναγυρίζει «με τις 12 λέξεις σε νέο κινητό» ως ο δρόμος αλλαγής
  ["js", "Στο παλιό κινητό άνοιξε Ρυθμίσεις → «Μεταφορά σε νέα συσκευή (QR)» και σκάναρε τον κωδικό.", "Μπες με τις 12 λέξεις σε νέο κινητό."],
  // Μ3 · 🔴 το κλείσιμο με άδεια ξαναφήνει το κουμπί σε όλες τις οθόνες
  ["js", "    if (agGrantOn()) { agLS(AG.fold, '1'); el('ag-fab').hidden = true; return; }\n", ""],
  // Μ4 · 🔴 μετά από επαναφόρτωση το κουμπί ξαναβγαίνει παρότι μαζεύτηκε
  ["js", "    el('ag-fab').hidden = agGrantOn() && agLS(AG.fold) === '1';   /* KM-V123-FOLD */", "    el('ag-fab').hidden = false;"],
  // Μ5 · 🔴 η Υποστήριξη ξοδεύει ΝΕΟ επανάνοιγμα (από τα 2 του μήνα) ενώ η άδεια ισχύει
  ["js", "        if (agGrantOn()) { agInit(); agOpen(); return; }\n", ""],
  // Μ6 · το άνοιγμα δεν καθαρίζει το «μαζεμένο»
  ["js", "    agLS(AG.fold, null);\n    el('ag').hidden = false;", "    el('ag').hidden = false;"],
  // Μ7 · η οδηγία ξαναστέλνει στο Μενού (εκεί ΔΕΝ υπάρχει η Μεταφορά)
  ["html", "Στην άλλη συσκευή: <b>Ρυθμίσεις → Μεταφορά σε νέα συσκευή (QR)</b>", "Στην άλλη συσκευή: <b>Μενού → Μεταφορά σε νέα συσκευή (QR)</b>"],
];
if (ONLY !== null) {
  const m = MUT[ONLY - 1]; const bag = { js, html };
  if (!m || !bag[m[0]].includes(m[1])) { console.log("Η ΜΕΤΑΛΛΑΞΗ Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(1); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ js, html } = bag);
}
let failed = 0;
const check = (n, f) => { try { f(); console.log("  ✔ " + n); } catch (e) { failed++; console.log("  ✘ " + n + " — " + e.message); } };
const ok = (c, w) => { if (!c) throw new Error(w); };
const faq = js.slice(js.indexOf("  var FAQ = ["), js.indexOf("var faqDone"));
check("Φ-1 · 🔴 η φωτογραφία: δύο δρόμοι, ο Κώστας περνά από εμάς χωρίς αποθήκευση", () => {
  ok(faq.includes("<b>Με τον Κώστα (τα 20 δωρεάν):</b> η φωτογραφία περνάει από τον διακομιστή μας μόνο για τη στιγμή της ανάγνωσης και δεν αποθηκεύεται."), "Κώστας");
  ok(!faq.includes("Απευθείας από το κινητό σου στην Google, με το δικό σου κλειδί. Δεν περνάει από δικό μας διακομιστή."), "παλιό απόλυτο κείμενο");
});
check("Φ-2 · αλλαγή κινητού = QR από τις Ρυθμίσεις· 12 λέξεις μόνο για απώλεια", () => {
  ok(faq.includes("Στο παλιό κινητό άνοιξε Ρυθμίσεις → «Μεταφορά σε νέα συσκευή (QR)» και σκάναρε τον κωδικό."), "QR");
  ok(faq.includes("Αν το παλιό κινητό χάθηκε ή κλάπηκε, στη θέση του QR γράφεις τις 12 λέξεις σου."), "απώλεια");
  ok(!faq.includes("Με αυτές ανοίγεις τα τιμολόγιά σου σε άλλο κινητό."), "παλιό 12 λέξεις");
});
check("Φ-3 · νέες ερωτήσεις: Κώστας και δώρο 20", () => {
  ok(faq.includes("{ q: 'Ποιος είναι ο Κώστας;'") && faq.includes("{ q: 'Πώς δουλεύει το δώρο των 20 τιμολογίων;'"), "ερωτήσεις");
});
check("Φ-4 · προπληρωμή Google 5 $ / 12 μήνες (ai.google.dev, 9/10)", () => {
  ok(faq.includes("ελάχιστο 5 $, ισχύει 12 μήνες"), "προπληρωμή");
});
check("Φ-5 · η γνώση του Κώστα ξαναχτίστηκε από το νέο FAQ", () => {
  ok(know.includes("Ποιος είναι ο Κώστας;") && know.includes("Μεταφορά σε νέα συσκευή (QR)") && !know.includes("Με αυτές ανοίγεις τα τιμολόγιά σου σε άλλο κινητό."), "knowledge_el.md");
});
check("Κ-1 · 🔴 κλείσιμο με άδεια: το κουμπί μαζεύεται και θυμάται", () => {
  ok(js.includes("    if (agGrantOn()) { agLS(AG.fold, '1'); el('ag-fab').hidden = true; return; }"), "agClose");
  ok(js.includes("    el('ag-fab').hidden = agGrantOn() && agLS(AG.fold) === '1';   /* KM-V123-FOLD */"), "agInit");
  ok(js.includes("    agLS(AG.fold, null);\n    el('ag').hidden = false;"), "agOpen");
});
check("Κ-2 · 🔴 η Υποστήριξη ξανανοίγει την ΙΔΙΑ συζήτηση όσο ισχύει η άδεια", () => {
  ok(js.includes("        if (agGrantOn()) { agInit(); agOpen(); return; }"), "support");
});
check("Κ-3 · στην εγκατάσταση (χωρίς άδεια) τίποτα δεν άλλαξε", () => {
  ok(js.includes("    el('ag-fab').hidden = agDone() || agLS(AG.gone) === '1';"), "onboarding");
});
check("Κ-4 · οδηγία s-have: Ρυθμίσεις, όχι Μενού", () => {
  ok(html.includes("Στην άλλη συσκευή: <b>Ρυθμίσεις → Μεταφορά σε νέα συσκευή (QR)</b>"), "s-have");
});
console.log(failed ? "\n✘ " + failed + " ΑΠΕΤΥΧΑΝ" : "\n✔ ΟΛΑ ΠΕΡΑΣΑΝ");
if (ONLY !== null) process.exit(failed ? 0 : 1);
process.exit(failed ? 1 : 0);
