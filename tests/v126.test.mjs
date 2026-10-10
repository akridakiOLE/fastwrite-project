// v126 · οι 12 λέξεις ΜΟΝΟ για απώλεια/κλοπή — σε κάθε κείμενο της εφαρμογής ΚΑΙ στη γνώση του Κώστα ·
//        άδεια κάμερας για iPhone (Stavros 10/10/2026: «δεν θα πρέπει ο χρήστης εκείνη τη στιγμή
//        να μπει σε αυτή τη διαδικασία… ο μοναδικός λόγος είναι σε περίπτωση κλοπής κινητού»)
//   node tests/v126.test.mjs
//   node tests/v126.test.mjs --mutate=N   (exit 0 = η μετάλλαξη ΠΙΑΣΤΗΚΕ)
import { readFileSync } from "node:fs";
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let js = readFileSync("site/kostometro/app.js", "utf8");
let html = readFileSync("site/kostometro/index.html", "utf8");
let kn = readFileSync("site/kostometro/agent/knowledge_el.md", "utf8");
const MUT = [
  // Μ1 · 🔴 η γνώση του Κώστα ξαναβάζει τις 12 λέξεις μέσα στην εγγραφή
  ["kn", "   - **Ο λογαριασμός είναι έτοιμος.** ΔΕΝ υπάρχει βήμα 12 λέξεων στην εγγραφή.\n", "4. **Οι 12 λέξεις**: τις γράφει σε ΧΑΡΤΙ. Τσεκάρει «Τις έγραψα σε χαρτί» → «Συνέχεια».\n"],
  // Μ2 · 🔴 ο Κώστας στέλνει σε κουμπί που δεν υπάρχει («Έχω ήδη λογαριασμό»)
  ["kn", "2. **Βήμα 2 από 2 · Λογαριασμός** (από το εικονίδιο): ένα κουμπί, «Ξεκινάω τώρα».", "2. **Πρώτη οθόνη**: «Ξεκινάω τώρα» (νέος) ή «Έχω ήδη λογαριασμό» (email + 12 λέξεις)."],
  // Μ3 · «Οι 12 λέξεις μου» ξαναλέει «ανοίγουν σε άλλη συσκευή»
  ["html", "Τις χρειάζεσαι <b>μόνο αν χαθεί ή κλαπεί το κινητό σου</b>.", "Αυτές ανοίγουν τα τιμολόγιά σου σε <b>άλλη συσκευή</b>."],
  // Μ4 · η υπενθύμιση στην κάμερα ξαναγίνεται εντολή
  ["html", "🔑 Αν χαθεί το κινητό:<br>οι 12 λέξεις σου", "🔑 Αποθήκευσε τις<br>12 λέξεις σου"],
  // Μ5 · το iPhone ξαναπαίρνει τις επιλογές του Android στην άδεια κάμερας
  ["js", "    if (!n || instPlatform() !== 'ios') { return; }", "    if (!n || true) { return; }"],
  // Μ6 · το hook της άδειας κάμερας ξεκρεμάει από τη show()
  ["js", "    if (id === 's-perm')  { permNote(); }", "    if (false)  { permNote(); }"],
];
if (ONLY !== null) {
  const m = MUT[ONLY - 1]; const bag = { js, html, kn };
  if (!m || !bag[m[0]].includes(m[1])) { console.log("Η ΜΕΤΑΛΛΑΞΗ Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(1); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ js, html, kn } = bag);
}
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✔ " + m); } else { fail++; console.log("  ✘ " + m); } };
ok(/APP_VER = 'φέτα 3 · v1(2[6-9]|[3-9]\d)'/.test(js), "έκδοση v126 ή νεότερη");

// γνώση του Κώστα = η ροή της v124–v126
const flow = kn.slice(kn.indexOf("## Η ΡΟΗ ΤΗΣ ΕΓΚΑΤΑΣΤΑΣΗΣ"), kn.indexOf("## ΣΥΧΝΑ ΠΡΟΒΛΗΜΑΤΑ"));
ok(flow.includes("Βήμα 1 από 2") && flow.includes("Βήμα 2 από 2"), "Κώστας: Βήμα 1 / Βήμα 2");
ok(flow.includes("ΔΕΝ υπάρχει βήμα 12 λέξεων στην εγγραφή"), "Κώστας: καμία 12άδα στην εγγραφή");
ok(!/Τσεκάρει «Τις έγραψα σε χαρτί» → «Συνέχεια»/.test(flow), "Κώστας: έφυγε το παλιό βήμα 4 (12 λέξεις → Συνέχεια)");
ok(!kn.includes("«Έχω ήδη λογαριασμό»"), "Κώστας: κανένα κουμπί που δεν υπάρχει («Έχω ήδη λογαριασμό»)");
ok(flow.includes("ΜΟΝΟ αν χαθεί ή κλαπεί το κινητό") && flow.includes("ΔΕΝ τις πιέζεις"), "Κώστας: λέξεις μόνο για απώλεια/κλοπή, όχι πίεση");
ok(flow.includes("Να επιτρέπεται"), "Κώστας: άδεια κάμερας iPhone");

// κείμενα εφαρμογής
const mw = html.slice(html.indexOf('<section id="s-mywords"'), html.indexOf("</section>", html.indexOf('<section id="s-mywords"')));
ok(mw.includes("μόνο αν χαθεί ή κλαπεί το κινητό σου") && mw.includes("QR"), "«Οι 12 λέξεις μου»: μόνο για απώλεια/κλοπή, αλλαγή = QR");
ok(!/ανοίγουν τα τιμολόγιά σου σε <b>άλλη συσκευή<\/b>/.test(html), "κανένα «ανοίγουν σε άλλη συσκευή»");
ok(html.includes("🔑 Αν χαθεί το κινητό:<br>οι 12 λέξεις σου"), "υπενθύμιση κάμερας: «Αν χαθεί το κινητό»");
ok(!js.includes("Με αυτές θα τα ανοίγεις σε άλλη συσκευή") && !js.includes("και μόνο με αυτές — ανοίγεις"), "οθόνη λέξεων (παλιές διαδρομές): χωρίς «άλλη συσκευή»");
ok(html.includes('id="perm-note"') && js.includes("    if (id === 's-perm')  { permNote(); }"), "άδεια κάμερας: hook στη show()");
const pn = js.slice(js.indexOf("  function permNote()"), js.indexOf("  function accStep()"));
ok(pn.includes("instPlatform() !== 'ios'") && pn.includes("Να επιτρέπεται"), "άδεια κάμερας: iPhone «Να επιτρέπεται», Android ως έχει");

console.log("\n" + pass + " ✔ · " + fail + " ✘");
if (ONLY !== null) process.exit(fail ? 0 : 1);
process.exit(fail ? 1 : 0);
