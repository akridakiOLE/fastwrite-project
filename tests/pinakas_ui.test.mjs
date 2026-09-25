// ΠΙΝΑΚΑΣ ΕΛΕΓΧΟΥ — ΟΙ ΦΡΟΥΡΟΙ ΤΗΣ ΟΘΟΝΗΣ (19/9/2026)
//   node tests/pinakas_ui.test.mjs
//   node tests/pinakas_ui.test.mjs --mutate=N   (ΠΡΕΠΕΙ να κοκκινίσει)
//
// ⚠ ΤΙ ΔΕΝ ΕΙΝΑΙ: δεν ανοίγει browser. Φυλάει ό,τι σπάει ΣΙΩΠΗΛΑ — ορφανά
//    el() μετά από σβήσιμο, cache που δεν ανέβηκε, και το showPicker χωρίς
//    try/catch που ρίχνει σφάλμα σε κάθε πάτημα του εικονιδίου.

import { readFileSync } from "node:fs";
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let html = readFileSync("site/pinakas/index.html", "utf8");
let js   = readFileSync("site/pinakas/app.js", "utf8");
let sw   = readFileSync("site/pinakas/sw.js", "utf8");

const MUTATIONS = [
  // Μ1 · Δ4: τα παλιά πακέτα επιστρέφουν στην οθόνη.
  ["html", "    <h2>Εκδόσεις</h2>", '    <h2>Πλάνα · Εκδόσεις</h2>\n    <div id="f-plans"></div>'],
  // Μ2 · Δ2: φεύγει το invert — το εικονίδιο ξαναγίνεται αόρατο σε σκούρο.
  ["html", "  filter: invert(1);", "  filter: none;"],
  // Μ3 · 🔴 το showPicker χωρίς try/catch: σφάλμα σε ΚΑΘΕ πάτημα εικονιδίου.
  ["js", "        try { inp.showPicker(); } catch (err) {}", "        inp.showPicker();"],
  // Μ4 · το cache δεν ανεβαίνει — το PWA σερβίρει την παλιά οθόνη για πάντα.
  ["sw", "var CACHE = 'pk-v5';", "var CACHE = 'pk-v4';"],
  // Μ5 · Δ1: φεύγει ο κανόνας «καμία οθόνη πριν αποφασιστεί» — ξαναναβοσβήνει.
  ["html", "html:not([data-gate]) #s-key,", "html[never] #s-key,"],
  // Μ6 · 🔴 Δ1: η showKeyScreen δεν γυρίζει τον διακόπτη. Με CSS !important
  //      η οθόνη κλειδιού ΔΕΝ θα εμφανιζόταν ΠΟΤΕ μετά από αποτυχία κλειδιού.
  ["js", "  function showKeyScreen(msg) {\n    gate('key');", "  function showKeyScreen(msg) {"],
];
if (ONLY !== null) {
  const m = MUTATIONS[ONLY - 1];
  if (!m) { console.log("Δεν υπάρχει μετάλλαξη Μ" + ONLY); process.exit(1); }
  const bag = { html, js, sw };
  if (!bag[m[0]].includes(m[1])) { console.log("Η ΜΕΤΑΛΛΑΞΗ Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ:\n" + m[1].slice(0, 90)); process.exit(1); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]);
  ({ html, js, sw } = bag);
}

let failed = 0;
const check = (n, f) => { try { f(); console.log("  ✔ " + n); } catch (e) { failed++; console.log("  ✘ " + n + " — " + e.message); } };
const has = (h, n, w) => { if (!h.includes(n)) throw new Error((w || "λείπει") + ": " + n.slice(0, 60)); };
const hasnt = (h, re, w) => { const m = h.match(re); if (m) throw new Error((w || "βρέθηκε") + ": " + m[0]); };

console.log(ONLY ? "ΜΕΤΑΛΛΑΓΜΕΝΟ Μ" + ONLY + " — ΠΡΕΠΕΙ ΝΑ ΚΟΚΚΙΝΙΣΕΙ\n" : "ΚΑΝΟΝΙΚΟ\n");

/* ⚠ ΧΩΡΙΣ ΣΧΟΛΙΑ HTML: η πρώτη γραφή του Π-Ο1 κοκκίνιζε στο ΙΔΙΟ ΤΟΥ ΤΟ
   σχόλιο («ΕΦΥΓΑΝ "συνδρομές ανά πλάνο"»). Δεύτερη φορά σήμερα που ένας
   έλεγχος διάβασε σχόλιο αντί για κώδικα — μπαίνει ως συνήθεια, όχι ως
   μπάλωμα: ό,τι ελέγχει ΠΑΡΟΥΣΙΑ κειμένου, το ελέγχει σε καθαρή σήμανση. */
const htmlNoC = () => html.replace(/<!--[\s\S]*?-->/g, "");

check("Π-Ο1 · Δ4 · τα ανύπαρκτα πακέτα έφυγαν από την οθόνη", () => {
  const h = htmlNoC();
  hasnt(h, /id="f-plans"/, "η μπάρα πλάνων");
  hasnt(h, /id="g-plan"/, "το φίλτρο Πλάνο");
  hasnt(h, /συνδρομές ανά πλάνο/, "η λεζάντα");
  has(h, "εγκαταστάσεις ανά έκδοση", "οι εκδόσεις ΜΕΝΟΥΝ");
});

check("Π-Ο2 · 🔴 ΚΑΝΕΝΑ ΟΡΦΑΝΟ el() ΜΕΤΑ ΤΟ ΣΒΗΣΙΜΟ", () => {
  /* Σβήνεις στοιχείο από το HTML και ξεχνάς το el() στη JS: το el() γυρίζει
     null, η επόμενη γραμμή σκάει, και η ΜΙΣΗ οθόνη δεν ζωγραφίζεται — χωρίς
     τίποτα ορατό εκτός κονσόλας. Ο έλεγχος είναι για ΟΛΑ τα id, όχι μόνο
     για όσα άγγιξα σήμερα. */
  const used = new Set([...js.matchAll(/\bel\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]));
  const declared = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const orphans = [...used].filter((id) => !declared.has(id));
  if (orphans.length) throw new Error("el() χωρίς στοιχείο: " + orphans.join(", "));
});

check("Π-Ο3 · Δ2 · το εικονίδιο ημερολογίου γίνεται ορατό και πιάνεται με δάχτυλο", () => {
  has(html, "::-webkit-calendar-picker-indicator", "ο κανόνας");
  has(html, "filter: invert(1);", "το invert");
  if (!/width:\s*28px/.test(html)) throw new Error("ο στόχος αφής δεν μεγάλωσε");
});

check("Π-Ο4 · 🔴 ΤΟ showPicker ΕΙΝΑΙ ΤΥΛΙΓΜΕΝΟ — ΡΙΧΝΕΙ ΟΤΑΝ ΕΙΝΑΙ ΗΔΗ ΑΝΟΙΧΤΟ", () => {
  const f = js.slice(js.indexOf("function wireDatePickers"), js.indexOf("function val(id)"));
  has(f, "typeof inp.showPicker !== 'function'", "έλεγχος ύπαρξης");
  has(f, "try { inp.showPicker(); } catch", "try/catch");
  has(js, "wireDatePickers();", "καλείται στην εκκίνηση");
});

check("Π-Ο5 · το SHELL cache ανέβηκε — αλλιώς το PWA σερβίρει την παλιά οθόνη", () => {
  has(sw, "var CACHE = 'pk-v5';", "νέα έκδοση cache");
});

check("Π-Ο6 · 🔴 Δ1 · Η ΑΠΟΦΑΣΗ ΓΙΝΕΤΑΙ ΠΡΙΝ ΤΗΝ ΠΡΩΤΗ ΖΩΓΡΑΦΙΑ", () => {
  /* Το app.js τρέχει ΜΕΤΑ την πρώτη ζωγραφιά — εκεί είναι ήδη αργά.
     Το inline script πρέπει να είναι πριν το <body> ΚΑΙ πριν το #s-key. */
  const iScript = html.indexOf("data-gate");
  const iBody = html.indexOf("<body");
  const iKey = html.indexOf('id="s-key"');
  if (!(iScript > -1 && iScript < iBody && iBody < iKey)) {
    throw new Error("το φράγμα δεν είναι πριν τις οθόνες");
  }
  has(html, "localStorage.getItem('pk_admin_key')", "σύγχρονη ανάγνωση");
});

check("Π-Ο7 · όσο δεν υπάρχει απόφαση, ΚΑΜΙΑ από τις δύο οθόνες", () => {
  has(html, "html:not([data-gate]) #s-key,", "ο κανόνας του κενού");
  has(html, 'html[data-gate="key"]', "οθόνη κλειδιού");
  has(html, 'html[data-gate="data"]', "οθόνη δεδομένων");
});

check("Π-Ο8 · 🔴 Ο ΔΙΑΚΟΠΤΗΣ ΓΥΡΙΖΕΙ ΚΑΙ ΣΤΙΣ ΔΥΟ ΔΙΑΔΡΟΜΕΣ", () => {
  const f = js.slice(js.indexOf("function showKeyScreen"), js.indexOf("function showKeyScreen") + 400);
  has(f, "gate('key')", "στην οθόνη κλειδιού");
  has(js, "gate('data');", "στην επιτυχία");
});

check("Π-Ο9 · το φράγμα ΔΕΝ εκθέτει την τιμή του κλειδιού", () => {
  const sc = html.slice(html.indexOf("<script"), html.indexOf("</script>"));
  if (/console\.|innerHTML|document\.write/.test(sc)) throw new Error("το script τυπώνει/γράφει");
  // διαβάζει την ΥΠΑΡΞΗ, όχι την τιμή: καμία ανάθεση της τιμής σε μεταβλητή
  has(sc, "if (localStorage.getItem('pk_admin_key'))", "έλεγχος ύπαρξης");
});

console.log("\n" + (failed ? "✘ ΑΠΕΤΥΧΑΝ " + failed : "✔ ΟΛΑ ΠΕΡΑΣΑΝ"));
process.exit(ONLY ? (failed ? 0 : 1) : (failed ? 1 : 0));
