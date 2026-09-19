// ΟΘΟΝΗ «ΚΑΛΕΣΕ» — ΟΙ ΦΡΟΥΡΟΙ ΤΟΥ ΚΕΙΜΕΝΟΥ ΚΑΙ ΤΩΝ ΔΥΟ ΚΑΤΑΣΤΑΣΕΩΝ (17/9/2026)
//   node tests/ref_ui.test.mjs
//   node tests/ref_ui.test.mjs --mutate=N   (ΠΡΕΠΕΙ να κοκκινίσει)
//
// ⚠ ΤΙ ΔΕΝ ΕΙΝΑΙ ΑΥΤΟ ΤΟ ΤΕΣΤ: δεν ανοίγει browser και ΔΕΝ αποδεικνύει ότι η
//    οθόνη ζωγραφίζεται σωστά. Αυτό μένει για δοκιμή σε πραγματική συσκευή.
//    Εδώ φυλάγονται οι ΔΕΣΜΕΥΣΕΙΣ: τι λέει το κείμενο σε πελάτες, ότι
//    υπάρχουν και οι δύο καταστάσεις, και ότι ο κωδικός δεν ξαναγίνεται
//    κωδικός συσκευής. Αυτά σπάνε σιωπηλά — μια λάθος λέξη δεν βγάζει σφάλμα.

import { readFileSync } from "node:fs";

const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
const VER = JSON.parse(readFileSync("site/kostometro/version.json", "utf8")).v;
let html = readFileSync("site/kostometro/index.html", "utf8");
let js   = readFileSync("site/kostometro/app.js", "utf8");
let sw   = readFileSync("site/kostometro/sw.js", "utf8");
let css  = readFileSync("site/kostometro/app.css", "utf8");

const MUTATIONS = [
  // Μ1 · χάνεται η κατάσταση Β — την ημέρα του PRO η οθόνη λέει ακόμα «ΤΙ ΕΡΧΕΤΑΙ».
  ["html", '<h3 class="sec" data-pro="live" hidden>ΤΙ ΚΑΝΕΙ ΤΟ PRO</h3>', ""],
  // Μ2 · 🔴 Η ΠΑΛΙΝΔΡΟΜΗΣΗ: ο κωδικός ξαναγίνεται κωδικός ΣΥΣΚΕΥΗΣ.
  ["js", "function refCode() { return localStorage.getItem(LS.refCode) || ''; }",
         "function refCode() { return (localStorage.getItem(LS.id) || '').slice(-8); }"],
  // Μ3 · ο μετρητής ξαναλέει «έστειλες» — νούμερο που ΔΕΝ μπορεί να μετρηθεί.
  ["html", "<span>Άνοιξαν τον σύνδεσμό σου</span>", "<span>Προσκλήσεις που έστειλες</span>"],
  // Μ4 · μπαίνει τιμή στην οθόνη πριν κλειδώσει η τιμή και πριν επιλεγεί MoR.
  ["html", "<h3 class=\"sec\">Η ΕΠΙΒΡΑΒΕΥΣΗ</h3>", "<h3 class=\"sec\">Η ΕΠΙΒΡΑΒΕΥΣΗ</h3>\n    <p>Μόνο 59 € τον μήνα.</p>"],
  /* Μ5 · το SHELL cache δεν ανεβαίνει — ο κόσμος μένει με την παλιά οθόνη.
     ⚠ ΔΙΑΒΑΖΕΤΑΙ ΑΠΟ ΤΟ version.json, ΠΟΤΕ καρφωτό: στη v66 η καρφωτή
     μετάλλαξη «km-v65» δεν έβρισκε πια στόχο και η απόδειξη έπαυε σιωπηλά
     να ισχύει. Μετρήθηκε 19/9/2026 — το έπιασε ο φρουρός «ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ». */
  ["sw", "var CACHE = 'km-" + VER + "';", "var CACHE = 'km-vPALIA';"],
  // Μ6 · ο σύνδεσμος γίνεται σύνδεσμος Store — το ?ref= δεν επιβιώνει του Play.
  ["js", "location.origin + '/kostometro/?ref=' + c", "'https://play.google.com/store/apps/details?id=km'"],
  // Μ7 · 🔴 ΤΟ ΣΦΑΛΜΑ ΤΗΣ 17/9 ΞΑΝΑΜΠΑΙΝΕΙ: το ?ref= διαβάζεται μόνο σε καθαρή συσκευή.
  ["js", "if (qRef && !registered) { return 'ref:' + qRef[1].toUpperCase(); }",
         "if (qRef && !registered && !current) { return 'ref:' + qRef[1].toUpperCase(); }"],
  // Μ8 · φεύγει η κανονικοποίηση σε κεφαλαία — δύο κουβάδες για τον ίδιο σύνδεσμο.
  ["js", "return 'ref:' + qRef[1].toUpperCase();", "return 'ref:' + qRef[1];"],
  // Μ9 · η σύσταση αρχίζει να αλλάζει ΑΝΑΔΡΟΜΙΚΑ, μετά την εγγραφή (Α400 §Δ).
  ["js", "if (qRef && !registered) {", "if (qRef) {"],
  // Μ10 · 🔴 ΤΟ ΚΟΥΤΑΚΙ ΣΥΓΚΑΤΑΘΕΣΗΣ ΕΡΧΕΤΑΙ ΠΡΟΕΠΙΛΕΓΜΕΝΟ — δεν είναι συγκατάθεση.
  ["html", '<input type="checkbox" id="ref-consent-ok">', '<input type="checkbox" id="ref-consent-ok" checked>'],
  // Μ11 · το email μπαίνει σε innerHTML — δεδομένο χρήστη στην οθόνη άλλου χρήστη.
  ["js", "who.textContent = r.email ? r.email : ('Εγγραφή #' + (list.length - i));",
         "who.innerHTML = r.email ? r.email : ('Εγγραφή #' + (list.length - i));"],
  // Μ12 · ο κανόνας ξεφεύγει από το .consent και αλλάζει ΟΛΑ τα κουτάκια.
  ["css", ".consent .chk { align-items: flex-start;", ".chk { align-items: flex-start;"],
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

// Μόνο η ενότητα της οθόνης — όχι όλο το index.html.
const S = html.slice(html.indexOf('<section id="s-ref"'), html.indexOf("</section>", html.indexOf('<section id="s-ref"')));

let failed = 0;
const check = (n, f) => { try { f(); console.log("  ✔ " + n); } catch (e) { failed++; console.log("  ✘ " + n + " — " + e.message); } };
const has = (hay, needle, what) => { if (!hay.includes(needle)) throw new Error((what || "λείπει") + ": " + needle.slice(0, 60)); };
const hasnt = (hay, re, what) => { const m = hay.match(re); if (m) throw new Error((what || "βρέθηκε") + ": " + m[0]); };

console.log(ONLY ? "ΜΕΤΑΛΛΑΓΜΕΝΟ Μ" + ONLY + " — ΠΡΕΠΕΙ ΝΑ ΚΟΚΚΙΝΙΣΕΙ\n" : "ΚΑΝΟΝΙΚΟ\n");

check("Ο-1 · 🔴 ΚΑΜΙΑ ΤΙΜΗ ΣΕ € ΣΤΗΝ ΟΘΟΝΗ (η τιμή έχει ανοιχτό δρόμο προς τα πάνω)", () => {
  hasnt(S, /\d[\d.,]*\s*(€|ευρώ|EUR)/i, "τιμή στην οθόνη");
});

check("Ο-2 · 🔴 ΚΑΜΙΑ ΗΜΕΡΟΜΗΝΙΑ ΚΥΚΛΟΦΟΡΙΑΣ (δεν δεσμευόμαστε σε ημέρα)", () => {
  hasnt(S, /(Ιανουάρ|Φεβρουάρ|Μάρτ|Απρίλ|Μαΐ|Ιουν|Ιουλ|Αύγουστ|Σεπτέμβρ|Οκτώβρ|Νοέμβρ|Δεκέμβρ)\w*\s+20\d\d/i, "μήνας+έτος");
  hasnt(S, /\b(20\d\d)\b(?![^<]*-->)/, "χρονολογία");
});

check("Ο-3 · υπάρχουν ΚΑΙ ΟΙ ΔΥΟ καταστάσεις, με σημαία από τον server", () => {
  has(S, 'data-pro="soon"', "κατάσταση Α");
  has(S, 'data-pro="live"', "κατάσταση Β");
  has(S, "ΤΙ ΕΡΧΕΤΑΙ — Kostometro PRO");
  has(S, "ΤΙ ΚΑΝΕΙ ΤΟ PRO");
  has(js, "function refProState(live)", "ο διακόπτης");
  has(js, "j.pro_live", "η σημαία διαβάζεται από τον server");
});

check("Ο-4 · ο χρόνος του ρήματος αλλάζει σωστά (Α: «θα σου δείχνει» · Β: «σου δείχνει»)", () => {
  const a = S.slice(S.indexOf('data-pro="soon">Το Kostometro'));
  if (!a.startsWith('data-pro="soon">Το Kostometro')) throw new Error("δεν βρέθηκε η εισαγωγή Α");
  has(S, "<b>θα σου δείχνει</b>", "μέλλοντας στην Α");
  has(S, "<b>σου δείχνει</b>", "ενεστώτας στη Β");
});

check("Ο-5 · 🔴 Ο ΜΕΤΡΗΤΗΣ ΛΕΕΙ «ΑΝΟΙΞΑΝ», ΟΧΙ «ΕΣΤΕΙΛΕΣ» (το Web Share δεν το ξέρει)", () => {
  has(S, "Άνοιξαν τον σύνδεσμό σου");
  hasnt(S, /Προσκλήσεις που έστειλες/, "αμέτρητος μετρητής");
});

check("Ο-6 · 🔴 Ο ΚΩΔΙΚΟΣ ΔΕΝ ΒΓΑΙΝΕΙ ΑΠΟ ΤΗ ΣΥΣΚΕΥΗ", () => {
  has(js, "function refCode() { return localStorage.getItem(LS.refCode) || ''; }");
  const f = js.slice(js.indexOf("function refCode()"), js.indexOf("function refUrl()"));
  if (/LS\.id/.test(f)) throw new Error("το refCode ξαναδιαβάζει το install_id");
});

check("Ο-7 · ο σύνδεσμος είναι ΠΑΝΤΑ web με ?ref=, ΠΟΤΕ Store", () => {
  has(js, "location.origin + '/kostometro/?ref=' + c");
  const f = js.slice(js.indexOf("function refUrl()"), js.indexOf("function refProState"));
  hasnt(f, /play\.google|apps\.apple|microsoft\.com/i, "σύνδεσμος Store");
});

check("Ο-8 · οι κλειδωμένες δεσμεύσεις της 17/9 είναι ΟΛΕΣ στο κείμενο", () => {
  has(S, "Έως 6 συσκευές στο ίδιο σημείο", "6 συσκευές");
  has(S, "εφαρμογή desktop για Windows", "πλατφόρμα");
  has(S, "Η έκδοση για Mac είναι στα σχέδια", "Mac");
  has(S, "επιστρέφει το 20% της συνδρομής σου", "20%");
  has(S, "Στις 5 συστάσεις σού επιστρέφεται ολόκληρη", "οι 5");
  has(S, "πληρώνεται κανονικά κάθε μήνα", "πληρώνει πρώτος");
  has(S, "Κάθε τρίμηνο", "τρίμηνο");
  has(S, "παραστατικό που εκδίδεις εσύ", "παραστατικό");
  has(S, "Και οι δύο πλευρές ενεργές", "και οι δύο ενεργές");
  has(S, "μέσα σε 6 μήνες", "παράθυρο 6 μηνών");
  has(S, "Δεν υπάρχει δεύτερο επίπεδο", "χωρίς δεύτερο επίπεδο");
  has(S, "Ένας σύνδεσμος ανά λογαριασμό, μία φορά", "ένας σύνδεσμος");
});

check("Ο-9 · 🔴 ΚΑΝΕΝΑ ΤΡΑΠΕΖΙΚΟ ΣΤΟΙΧΕΙΟ ΜΕΣΑ ΣΤΗΝ ΕΦΑΡΜΟΓΗ", () => {
  has(S, "Κανένα τραπεζικό στοιχείο μέσα στην εφαρμογή");
  hasnt(S, /IBAN|αριθμ[όο]ς λογαριασμού/i, "τραπεζικό πεδίο");
});

check("Ο-10 · καμία θέση σε σειρά («είσαι ο #7» φωτογραφίζει ότι δεν έχουμε πελάτες)", () => {
  hasnt(S, /είσαι ο #?\d|θέση σου στη (λίστα|σειρά)|#\d+ στη/i, "θέση σε σειρά");
});

check("Ο-11 · έκδοση: APP_VER, version.json και SHELL cache συμφωνούν", () => {
  const ver = JSON.parse(readFileSync("site/kostometro/version.json", "utf8")).v;
  has(js, "var APP_VER = 'φέτα 3 · " + ver + "';", "APP_VER vs version.json");
  has(sw, "var CACHE = 'km-" + ver + "';", "CACHE vs version.json");
});

check("Ο-12 · το άνοιγμα αναφέρεται μία φορά, και ΕΞΩ από το «πρώτη εγκατάσταση»", () => {
  has(js, "function refReportHit()");
  has(js, "localStorage.getItem(LS.refHit) === code", "de-duplication");
  const boot = js.slice(js.indexOf("function boot()"));
  const iSrc = boot.indexOf("localStorage.setItem(LS.src,");
  const iHit = boot.indexOf("refReportHit();");
  if (iHit < 0) throw new Error("το boot δεν αναφέρει το άνοιγμα");
  if (iHit < iSrc) throw new Error("η αναφορά είναι ΜΕΣΑ στο «πρώτη εγκατάσταση»");
});

check("Ο-18 · 🔴 ΤΟ ΚΟΥΤΑΚΙ ΣΥΓΚΑΤΑΘΕΣΗΣ ΕΙΝΑΙ ΑΣΥΜΠΛΗΡΩΤΟ", () => {
  const S2 = html.slice(html.indexOf('id="ref-consent"'), html.indexOf('id="go-email"'));
  has(S2, '<input type="checkbox" id="ref-consent-ok">', "το κουτάκι");
  hasnt(S2, /id="ref-consent-ok"[^>]*checked/, "προεπιλεγμένο ναι");
});

check("Ο-22 · 🔴 ΚΑΝΕΝΑ ΔΙΠΛΟ id ΣΕ ΟΛΟ ΤΟ index.html", () => {
  /* 19/9/2026: το κουτάκι συγκατάθεσης πήρε id="ref-share", που το κρατούσε
     ΗΔΗ το κουμπί «Στείλ' τον». Το el() γυρίζει το ΠΡΩΤΟ στο έγγραφο, άρα
     θα έσπαγαν και τα δύο — σιωπηλά, χωρίς κανένα σφάλμα στην κονσόλα.
     Ο φρουρός μπαίνει για ΟΛΑ τα id, όχι μόνο για τα δικά μου. */
  const ids = (html.match(/\sid="([^"]+)"/g) || []).map((m) => m.slice(5, -1));
  const seen = {}, dup = [];
  for (const id of ids) { if (seen[id]) { dup.push(id); } seen[id] = 1; }
  if (dup.length) throw new Error("διπλά id: " + [...new Set(dup)].join(", "));
});

check("Ο-19 · λέει ρητά ότι η σύσταση μετράει ΚΑΙ ΧΩΡΙΣ αυτό", () => {
  const S2 = html.slice(html.indexOf('id="ref-consent"'), html.indexOf('id="go-email"'));
  has(S2, "μετράει έτσι κι αλλιώς", "χωρίς πίεση");
  has(S2, "Ήρθες από πρόσκληση", "διαφάνεια");
});

check("Ο-20 · 🔴 ΤΟ EMAIL ΑΛΛΟΥ ΧΡΗΣΤΗ ΔΕΝ ΜΠΑΙΝΕΙ ΠΟΤΕ ΣΕ innerHTML", () => {
  const raw = js.slice(js.indexOf("function renderRefList"), js.indexOf("function renderRef()"));
  // ⚠ ΧΩΡΙΣ ΣΧΟΛΙΑ: η πρώτη γραφή του ελέγχου κοκκίνιζε στο ίδιο του το
  //    σχόλιο («ΠΟΤΕ innerHTML με δεδομένα χρήστη»). Ένας έλεγχος που
  //    διαβάζει σχόλια δεν ελέγχει κώδικα.
  const f = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  has(f, "who.textContent =", "textContent");
  if (/innerHTML\s*=\s*[^'\s]/.test(f) || /innerHTML\s*\+=/.test(f)) {
    throw new Error("innerHTML με δεδομένα");
  }
});

check("Ο-21 · ο κανόνας του κουτακιού ΔΕΝ ξεφεύγει στα υπόλοιπα .chk της εφαρμογής", () => {
  // Το .chk ορίζεται ΗΔΗ δύο φορές και το χρησιμοποιούν άλλες οθόνες.
  has(css, ".consent .chk {", "περιορισμένο");
  const mine = css.slice(css.indexOf("v67 · ΣΥΓΚΑΤΑΘΕΣΗ"));
  if (/^\.chk\s*\{/m.test(mine)) throw new Error("γενικός κανόνας .chk στο v67");
});

/* ── Η ΣΥΛΛΗΨΗ ΤΗΣ ΣΥΣΤΑΣΗΣ, ΜΕΤΡΗΜΕΝΗ ΣΤΗΝ ΠΡΑΞΗ (v66) ──
   Η λογική βγήκε από το boot() σε καθαρή συνάρτηση ακριβώς γι' αυτό: μέσα
   στο boot δεν μετριόταν, και εκεί κρύφτηκε το σφάλμα της 17/9. */
const fnSrc = js.slice(js.indexOf("function refCaptureSrc("), js.indexOf("function refCode()"));
const refCaptureSrc = new Function(fnSrc + "; return refCaptureSrc;")();

check("Ο-13 · καθαρή συσκευή + ?ref= → η σύσταση καταγράφεται", () => {
  const g = refCaptureSrc("?ref=ABC23XYZ99", false, null);
  if (g !== "ref:ABC23XYZ99") throw new Error("πήρα " + g);
});

check("Ο-14 · 🔴 ΣΥΣΚΕΥΗ ΠΟΥ ΕΧΕΙ ΞΑΝΑΝΟΙΞΕΙ ΤΟ KOSTOMETRO, ΧΩΡΙΣ ΛΟΓΑΡΙΑΣΜΟ (17/9)", () => {
  // Αυτό ακριβώς απέτυχε στη δοκιμή του Stavros: km_source='link' από παλιά.
  const g = refCaptureSrc("?ref=ABC23XYZ99", false, "link");
  if (g !== "ref:ABC23XYZ99") throw new Error("η σύσταση χάθηκε ξανά: " + g);
  const g2 = refCaptureSrc("?ref=ABC23XYZ99", false, "store:play");
  if (g2 !== "ref:ABC23XYZ99") throw new Error("από Play: " + g2);
});

check("Ο-15 · 🔴 ΜΕΤΑ ΤΗΝ ΕΓΓΡΑΦΗ ΤΙΠΟΤΑ ΔΕΝ ΑΛΛΑΖΕΙ ΑΝΑΔΡΟΜΙΚΑ (Α400 §Δ)", () => {
  const g = refCaptureSrc("?ref=ALLOS1234", true, "ref:PROTOS8888");
  if (g !== null) throw new Error("άλλαξε σύσταση εγγεγραμμένου: " + g);
  const g2 = refCaptureSrc("?ref=ALLOS1234", true, "link");
  if (g2 !== null) throw new Error("άλλαξε πηγή εγγεγραμμένου: " + g2);
});

check("Ο-16 · πεζά στον σύνδεσμο γίνονται κεφαλαία (μία μορφή παντού)", () => {
  const g = refCaptureSrc("?ref=abc23xyz99", false, null);
  if (g !== "ref:ABC23XYZ99") throw new Error("πήρα " + g);
});

check("Ο-17 · χωρίς ?ref= η παλιά συμπεριφορά μένει ακριβώς ίδια", () => {
  if (refCaptureSrc("?src=store:play", false, null) !== "store:play") throw new Error("src");
  if (refCaptureSrc("", false, null) !== "link") throw new Error("κενό → link");
  if (refCaptureSrc("", false, "store:ms") !== null) throw new Error("δεν πειράζει υπάρχον");
  if (refCaptureSrc("?src=store:play", false, "link") !== null) throw new Error("δεν ξαναγράφει src");
});

console.log("\n" + (failed ? "✘ ΑΠΕΤΥΧΑΝ " + failed : "✔ ΟΛΑ ΠΕΡΑΣΑΝ"));
process.exit(ONLY ? (failed ? 0 : 1) : (failed ? 1 : 0));
