// Η ΠΡΟΤΡΟΠΗ ΕΓΚΑΤΑΣΤΑΣΗΣ — ΟΙ ΦΡΟΥΡΟΙ (v72, 20/9/2026)
//   node tests/install_ui.test.mjs
//   node tests/install_ui.test.mjs --mutate=N   (ΠΡΕΠΕΙ να κοκκινίσει)
//
// ⚠ ΤΙ ΔΕΝ ΕΙΝΑΙ: δεν ανοίγει browser και ΔΕΝ αποδεικνύει ότι η κάρτα
//    ζωγραφίζεται. Αυτό μένει για δοκιμή σε πραγματική συσκευή.
//    Εδώ φυλάγονται οι ΔΕΣΜΕΥΣΕΙΣ που σπάνε ΣΙΩΠΗΛΑ: ότι το iPhone παίρνει
//    οδηγία που εκτελείται, ότι η κάρτα δεν εμφανίζεται σε εγκατεστημένη
//    εφαρμογή, ότι ο ρυθμός δεν γίνεται «μία φορά και ποτέ ξανά», και ότι
//    το FAQ κρατάει τη δεύτερη διαδρομή για όποιον πατήσει «Όχι τώρα».

import { readFileSync } from "node:fs";

const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
const VER = JSON.parse(readFileSync("site/kostometro/version.json", "utf8")).v;
let html = readFileSync("site/kostometro/index.html", "utf8");
let js   = readFileSync("site/kostometro/app.js", "utf8");
let sw   = readFileSync("site/kostometro/sw.js", "utf8");
let css  = readFileSync("site/kostometro/app.css", "utf8");

const MUTATIONS = [
  /* Μ1 · 🔴 Η ΚΑΡΤΑ ΓΙΝΕΤΑΙ ΟΘΟΝΗ. Το show() κρύβει ό,τι είναι στο SCREENS σε
     κάθε πλοήγηση — η προτροπή θα εξαφανιζόταν ή θα σκέπαζε την πρώτη οθόνη. */
  ["html", '<div id="inst" class="inst" hidden>', '<section id="inst" class="screen setup" hidden>'],
  // Μ2 · χάνεται το βήμα του Safari — σε Chrome iPhone η οδηγία δεν εκτελείται.
  ["js", "if (instIosNotSafari()) {", "if (false) {"],
  // Μ3 · 🔴 ΤΟ iPhone ΠΑΙΡΝΕΙ ΟΔΗΓΙΑ ANDROID — το σφάλμα της v70, ξαναμπαίνει.
  ["js", "    if (p === 'ios') {", "    if (false) {"],
  // Μ4 · το κουμπί βγαίνει ΧΩΡΙΣ αποθηκευμένο συμβάν — πατιέται και δεν κάνει τίποτα.
  ["js", "    if (instDefer) {\n      step(", "    if (true) {\n      step("],
  // Μ5 · φεύγει το preventDefault — ο Chrome δείχνει ΚΑΙ τη δική του μπάρα.
  ["js", "try { e.preventDefault(); } catch (x) {}", ""],
  /* Μ6 · 🔴 Η ΠΡΟΤΡΟΠΗ ΕΜΦΑΝΙΖΕΤΑΙ ΣΕ ΗΔΗ ΕΓΚΑΤΕΣΤΗΜΕΝΗ ΕΦΑΡΜΟΓΗ:
     ο χρήστης που το έκανε ήδη, το ξαναβλέπει σε κάθε άνοιγμα. */
  ["js", "    if (instStandalone()) { return; }", ""],
  // Μ7 · το iOS δεν ανιχνεύεται ως εγκατεστημένο (matchMedia μόνο) — ίδιο αποτέλεσμα, μόνο σε iPhone.
  ["js", "    if (navigator.standalone === true) { return true; }", ""],
  /* Μ8 · 🔴 «ΜΙΑ ΦΟΡΑ ΚΑΙ ΠΟΤΕ ΞΑΝΑ»: όποιος πατήσει «Όχι τώρα» στο πρώτο
     άνοιγμα δεν ξαναβλέπει ποτέ την οδηγία. */
  ["js", "var INST_AT   = [1, 4, 10];", "var INST_AT   = [1];"],
  // Μ9 · η προτροπή σε ΚΑΘΕ άνοιγμα — γίνεται εμπόδιο και διώχνει.
  ["js", "    if (INST_AT.indexOf(n) === -1) { return; }", ""],
  /* Μ10 · ο μετρητής γράφεται ΜΕΤΑ τον έλεγχο — κολλάει στο 1 και η κάρτα
     βγαίνει για πάντα σε κάθε άνοιγμα. */
  ["js", "    instState({ n: n });\n    if (INST_AT.indexOf(n) === -1) { return; }",
         "    if (INST_AT.indexOf(n) === -1) { return; }\n    instState({ n: n });"],
  /* Μ11 · 🔴 Η ΚΛΗΣΗ ΜΠΑΙΝΕΙ ΜΕΣΑ ΣΤΟ boot: το boot έχει πέντε πρόωρα return
     (νέος χρήστης, λέξεις, κλειδί, άδεια κάμερας) — ακριβώς οι διαδρομές του
     νέου χρήστη. Ίδιο σφάλμα με το hook συγκατάθεσης της v67. */
  ["js", "openDB().then(boot).then(function () { schedule(800); maybeInstall(); })",
         "openDB().then(boot).then(function () { schedule(800); })"],
  // Μ12 · το αποθηκευμένο συμβάν δεν αδειάζει — δεύτερο πάτημα ρίχνει σφάλμα.
  ["js", "      instDefer = null;\n      instClose();", "      instClose();"],
  /* Μ13 · 🔴 ΧΑΝΕΤΑΙ Η ΔΕΥΤΕΡΗ ΔΙΑΔΡΟΜΗ. Η προτροπή είναι περαστική· όποιος
     πατήσει «Όχι τώρα», ή αλλάξει κινητό, χρειάζεται το FAQ. */
  ["js", "    { id: 'install-ios',", "    { id: 'install-XXX',"],
  // Μ14 · το SHELL cache δεν ανεβαίνει — ο κόσμος μένει στην παλιά έκδοση.
  ["sw", "var CACHE = 'km-" + VER + "';", "var CACHE = 'km-vPALIA';"],
  // Μ15 · η κάρτα πέφτει κάτω από τις οθόνες — υπάρχει και δεν φαίνεται.
  ["css", ".inst{position:fixed;inset:0;z-index:70;", ".inst{position:fixed;inset:0;z-index:1;"],
  /* Μ16 · 🔴 ΤΟ ΛΑΘΟΣ ΤΗΣ v72 ΞΑΝΑΜΠΑΙΝΕΙ: «Εγκατάσταση» και «Προσθήκη στην
     αρχική οθόνη» δοσμένα ως ΙΣΟΔΥΝΑΜΑ, με «ή». Α440 1/9/2026: η δεύτερη
     διαδρομή δίνει ΣΥΝΤΟΜΕΥΣΗ — σήμα browser πάνω στο εικονίδιο. */
  ["js", "Αν ο browser σου γράφει «Προσθήκη στην αρχική οθόνη», πάτα αυτό και μετά διάλεξε <b>«Εγκατάσταση»</b>.",
         "ή <b>«Προσθήκη στην αρχική οθόνη»</b>."],
  // Μ17 · φεύγει η προειδοποίηση για τη συντόμευση — ο χρήστης δεν προειδοποιείται πουθενά.
  ["js", "    warn('Μη διαλέξεις", "    (function(){})('Μη διαλέξεις"],
  /* Μ18 · 🔴 Η ΠΑΛΙΝΔΡΟΜΗΣΗ ΤΗΣ v72: το minimal-ui ξαναμπαίνει στον έλεγχο.
     Απαντάει «ναι» σε απλό tab σε browsers κινητού — η προτροπή πεθαίνει. */
  ["js", "    try { return window.matchMedia('(display-mode: standalone)').matches; } catch (e) { return false; }",
         "    try { return window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: minimal-ui)').matches; } catch (e) { return false; }"],
  /* Μ19 · 🔴 ΠΑΡΟΔΙΚΗ ΕΝΔΕΙΞΗ ΞΑΝΑΓΡΑΦΕΙ ΜΟΝΙΜΗ ΚΑΤΑΣΤΑΣΗ: μία λάθος
     ανάγνωση σβήνει την προτροπή για πάντα σε εκείνη τη συσκευή. */
  ["js", "    if (instStandalone()) { return; }", "    if (instStandalone()) { instState({ done: 1 }); return; }"],
];
if (ONLY !== null) {
  const m = MUTATIONS[ONLY - 1];
  if (!m) { console.log("Δεν υπάρχει μετάλλαξη Μ" + ONLY); process.exit(1); }
  const [which, a, b] = m;
  const bag = { html, js, sw, css };
  if (!bag[which].includes(a)) { console.log("Η ΜΕΤΑΛΛΑΞΗ Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ:\n" + a.slice(0, 90)); process.exit(1); }
  bag[which] = bag[which].replace(a, b);
  ({ html, js, sw, css } = bag);
}

// Μόνο το κομμάτι της κάρτας — όχι όλο το index.html.
const CARD = (() => {
  const i = html.indexOf('id="inst"');
  if (i < 0) return "";
  return html.slice(Math.max(0, i - 400), html.indexOf("</div>", html.indexOf('id="inst-no"')) + 200);
})();
// Μόνο το κλαδί του iOS μέσα στο instSteps().
const IOS = (() => {
  const i = js.indexOf("function instSteps()");
  if (i < 0) return "";
  const j = js.indexOf("if (instDefer) {", i);
  return j < 0 ? "" : js.slice(i, j);
})();

let failed = 0;
const check = (n, f) => { try { f(); console.log("  ✔ " + n); } catch (e) { failed++; console.log("  ✘ " + n + " — " + e.message); } };
const has = (hay, needle, what) => { if (!hay.includes(needle)) throw new Error((what || "λείπει") + ": " + needle.slice(0, 70)); };
const hasnt = (hay, re, what) => { const m = hay.match(re); if (m) throw new Error((what || "βρέθηκε") + ": " + String(m[0]).slice(0, 70)); };

console.log(ONLY ? "ΜΕΤΑΛΛΑΓΜΕΝΟ Μ" + ONLY + " — ΠΡΕΠΕΙ ΝΑ ΚΟΚΚΙΝΙΣΕΙ\n" : "ΚΑΝΟΝΙΚΟ\n");

check("Ε-1 · Η κάρτα ΔΕΝ είναι οθόνη και ΔΕΝ μπαίνει στο SCREENS", () => {
  has(html, '<div id="inst" class="inst" hidden>', "η κάρτα δεν είναι div.inst");
  hasnt(js, /SCREENS = \[[^\]]*'inst'/, "το 'inst' μπήκε στο SCREENS");
});

check("Ε-2 · 🔴 Το iPhone παίρνει τη ΔΙΚΗ ΤΟΥ οδηγία, που εκτελείται", () => {
  has(js, "if (p === 'ios') {", "λείπει το κλαδί iOS");
  has(IOS, "Κοινοποίηση", "λείπει το κουμπί Κοινοποίηση");
  has(IOS, "Προσθήκη στην οθόνη Αφετηρίας", "λείπει η ακριβής φράση του iOS");
  has(IOS, "Safari", "λείπει το Safari");
});

check("Ε-2β · Το βήμα «άνοιξέ το στο Safari» είναι ΠΡΟΣΒΑΣΙΜΟ, όχι νεκρός κώδικας", () => {
  has(IOS, "if (instIosNotSafari()) {", "το βήμα Safari δεν κρέμεται από τον έλεγχο browser");
  has(js, "function instIosNotSafari() { return /CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent || \'\'); }",
      "ο έλεγχος δεν αναγνωρίζει Chrome/Firefox του iPhone");
});

check("Ε-3 · Στο iPhone ΔΕΝ λέγεται ποτέ «τρεις τελείες» (δεν υπάρχει τέτοιο μενού)", () => {
  hasnt(IOS, /τρεις τελείες|⋮/, "οδηγία Chrome μέσα στο κλαδί iOS");
});

check("Ε-4 · Το κουμπί «Εγκατάσταση» βγαίνει ΜΟΝΟ με αποθηκευμένο συμβάν", () => {
  has(js, "    if (instDefer) {\n      step(", "το κουμπί δεν εξαρτάται από το instDefer");
  has(js, "      go.hidden = false;", "το κουμπί δεν ξεκρύβεται εκεί");
  has(js, "    go.hidden = true;", "το κουμπί δεν ξεκινάει κρυμμένο");
});

check("Ε-5 · preventDefault στο beforeinstallprompt (αλλιώς δύο προτροπές μαζί)", () => {
  has(js, "try { e.preventDefault(); } catch (x) {}", "λείπει το preventDefault");
});

check("Ε-6 · 🔴 Καμία προτροπή σε ΕΓΚΑΤΕΣΤΗΜΕΝΗ εφαρμογή", () => {
  has(js, "if (instStandalone()) { return; }", "λείπει ο φραγμός standalone");
  has(js, "if (navigator.standalone === true) { return true; }", "το iOS δεν ανιχνεύεται ως εγκατεστημένο");
  has(js, "'(display-mode: standalone)'", "λείπει ο έλεγχος display-mode");
});

check("Ε-7 · Το iPadOS ανιχνεύεται παρότι λέει «Macintosh»", () => {
  has(js, "if (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1) { return 'ios'; }",
      "το iPad περνάει ως υπολογιστής");
});

check("Ε-8 · 🔴 Ο ρυθμός: ΟΥΤΕ μία φορά μόνο, ΟΥΤΕ σε κάθε άνοιγμα", () => {
  const m = js.match(/var INST_AT\s+=\s+\[([^\]]*)\]/);
  if (!m) throw new Error("λείπει το INST_AT");
  const at = m[1].split(",").map((x) => Number(x.trim())).filter((x) => !isNaN(x));
  if (at.length < 2) throw new Error("μία μόνο εμφάνιση: " + m[1]);
  if (at[0] !== 1) throw new Error("δεν εμφανίζεται στο πρώτο άνοιγμα");
  has(js, "    if (INST_AT.indexOf(n) === -1) { return; }", "λείπει το φρένο του ρυθμού");
});

check("Ε-9 · Ο μετρητής γράφεται ΠΡΙΝ τον έλεγχο (αλλιώς κολλάει στο 1)", () => {
  has(js, "    instState({ n: n });\n    if (INST_AT.indexOf(n) === -1) { return; }",
      "λάθος σειρά: έλεγχος πριν την εγγραφή");
});

check("Ε-10 · 🔴 Η κλήση είναι ΕΞΩ από το boot (το boot έχει 5 πρόωρα return)", () => {
  has(js, "openDB().then(boot).then(function () { schedule(800); maybeInstall(); })",
      "η maybeInstall δεν καλείται μετά το boot");
  const b = js.slice(js.indexOf("  function boot() {"), js.indexOf("  /* ── Χειριστές ── */"));
  hasnt(b, /maybeInstall\(\)/, "η κλήση μπήκε ΜΕΣΑ στο boot");
});

check("Ε-11 · Το αποθηκευμένο συμβάν αδειάζει ΠΡΙΝ το prompt()", () => {
  has(js, "      instDefer = null;\n      instClose();", "το instDefer δεν αδειάζει πρώτο");
});

check("Ε-12 · 🔴 Η ΔΕΥΤΕΡΗ ΔΙΑΔΡΟΜΗ ΖΕΙ: το FAQ κρατάει και τις δύο οδηγίες", () => {
  has(js, "    { id: 'install-android',", "λείπει η οδηγία Android από το FAQ");
  has(js, "    { id: 'install-ios',", "λείπει η οδηγία iPhone από το FAQ");
  has(CARD, "Μενού → Ερωτήσεις", "η κάρτα δεν λέει πού θα το ξαναβρεί");
});

check("Ε-16 · 🔴 ΕΓΚΑΤΑΣΤΑΣΗ ≠ ΣΥΝΤΟΜΕΥΣΗ (Α440, 1/9/2026 — μετρημένο)", () => {
  const i = js.indexOf("if (instDefer) {");
  const and = js.slice(i, js.indexOf("function instClose()", i));
  has(and, "«Εγκατάσταση εφαρμογής»", "δεν λέει το σωστό όνομα της επιλογής");
  /* Το «Προσθήκη στην αρχική οθόνη» επιτρέπεται ΜΟΝΟ ως ενδιάμεσο βήμα που
     καταλήγει στην «Εγκατάσταση» — ΠΟΤΕ ως ισοδύναμη επιλογή με «ή». */
  hasnt(and, /ή <b>«Προσθήκη στην αρχική οθόνη»<\/b>/, "δοσμένο ως ισοδύναμο");
  has(and, "διάλεξε <b>«Εγκατάσταση»</b>", "δεν οδηγεί στην Εγκατάσταση");
  has(and, "warn('Μη διαλέξεις <b>«Συντόμευση»</b>", "λείπει η προειδοποίηση για τη συντόμευση");
  has(and, "σήμα του browser", "δεν λέει ΤΙ χαλάει η συντόμευση");
});

check("Ε-17 · 🔴 Ο έλεγχος «εγκατεστημένη;» ρωτάει ΜΟΝΟ standalone", () => {
  const i = js.indexOf("function instStandalone()");
  const f = js.slice(i, js.indexOf("function instPlatform()", i));
  has(f, "'(display-mode: standalone)'", "λείπει ο έλεγχος standalone");
  hasnt(f, /minimal-ui|fullscreen/, "παροδική κατάσταση μέσα στον έλεγχο");
});

check("Ε-18 · 🔴 Καμία ΜΟΝΙΜΗ εγγραφή από παροδική ένδειξη", () => {
  has(js, "    if (instStandalone()) { return; }", "ο φραγμός γράφει μόνιμη κατάσταση");
  has(js, "window.addEventListener('appinstalled', function () { instState({ done: 1 }); });",
      "το done δεν έρχεται από το πραγματικό συμβάν εγκατάστασης");
});

check("Ε-19 · Η προειδοποίηση ΔΕΝ είναι αριθμημένο βήμα", () => {
  has(html, '<p class="note warn" id="inst-warn" hidden></p>', "η προειδοποίηση δεν έχει δική της θέση");
  const i = js.indexOf("function instSteps()");
  const f = js.slice(i, js.indexOf("function instClose()", i));
  hasnt(f, /step\('Μη διαλέξεις/, "η προειδοποίηση δόθηκε ως βήμα προς εκτέλεση");
});

check("Ε-13 · Το SHELL cache ανέβηκε μαζί με την έκδοση", () => {
  has(sw, "var CACHE = 'km-" + VER + "';", "το cache του worker δεν είναι " + VER);
  has(js, "var APP_VER = 'φέτα 3 · " + VER + "';", "το APP_VER δεν είναι " + VER);
});

check("Ε-14 · Η κάρτα κάθεται ΠΑΝΩ από τις οθόνες", () => {
  const m = css.match(/\.inst\{[^}]*z-index:(\d+)/);
  if (!m) throw new Error("λείπει z-index στο .inst");
  if (Number(m[1]) < 50) throw new Error("z-index πολύ χαμηλό: " + m[1]);
});

check("Ε-15 · Καμία αναφορά σε Store μέσα στην κάρτα (είναι PWA, όχι εγκατάσταση από Store)", () => {
  hasnt(CARD, /Play Store|App Store|Google Play/i, "αναφορά σε Store");
});

console.log("\n" + (failed ? "✘ " + failed + " ΑΠΕΤΥΧΑΝ" : "✔ ΟΛΑ ΠΕΡΑΣΑΝ"));
/* ⚠ ΙΔΙΑ ΣΥΜΒΑΣΗ ΜΕ ΤΟ ref_ui: σε --mutate το «failed» ΕΙΝΑΙ η επιτυχία
   — η απόδειξη είναι ότι ο φρουρός κοκκίνισε. Γι' αυτό ο κωδικός
   εξόδου αντιστρέφεται — το .bat περιμένει 0 από πετυχημένη μετάλλαξη. */
process.exit(ONLY ? (failed ? 0 : 1) : (failed ? 1 : 0));
