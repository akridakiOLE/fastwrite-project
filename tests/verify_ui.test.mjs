// Brief ΣΤ — ΟΙ ΦΡΟΥΡΟΙ ΤΗΣ ΟΘΟΝΗΣ ΕΓΓΡΑΦΗΣ (v84, 24/9/2026)
//   node tests/verify_ui.test.mjs
//   node tests/verify_ui.test.mjs --mutate=N   (ΠΡΕΠΕΙ να κοκκινίσει)
// Η ροή μετρήθηκε ΚΑΙ σε πραγματικό Chromium με τον πραγματικό km.js (25 έλεγχοι,
// 24/9). Εδώ φυλάγονται οι δεσμεύσεις που σπάνε ΣΙΩΠΗΛΑ σε επόμενη αλλαγή.
import { readFileSync } from "node:fs";
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let html = readFileSync("site/kostometro/index.html", "utf8");
let js = readFileSync("site/kostometro/app.js", "utf8");
let man = readFileSync("site/kostometro/manifest.webmanifest", "utf8");
const MUT = [
  // Μ1 · 🔴 το email γράφεται ΠΡΙΝ την επιβεβαίωση — το boot() θα προσπερνούσε τον κωδικό.
  ["js", "      return sendCode(v).then(function (res) {", "      localStorage.setItem(LS.email, v);\n      return sendCode(v).then(function (res) {"],
  // Μ2 · 🔴 το token δεν φεύγει με την εγγραφή — κανένας νέος λογαριασμός δεν φτιάχνεται.
  ["js", "        email_token: localStorage.getItem(LS.emailTok) || null", "        email_token: null"],
  // Μ3 · η οθόνη του κωδικού δεν είναι στο SCREENS — δεν κρύβεται ποτέ.
  ["js", "  var SCREENS = ['s-acc','s-email','s-code','s-words',", "  var SCREENS = ['s-acc','s-email','s-words',"],
  // Μ4 · 🔴 το πεδίο πρόσκλησης κρύβεται — ξαναχάνεται η σύσταση στο iPhone.
  ["html", '<label class="fld" id="ref-fld">', '<label class="fld" id="ref-fld" hidden>'],
  // Μ5 · 🔴 το manifest δεν ακολουθεί τον σύνδεσμο.
  ["js", "    manifestFollow();\n", ""],
  // Μ6 · το manifest αλλάζει και ΜΕΤΑ την εγγραφή — η σύσταση «ξαναγράφεται».
  ["js", "    if (localStorage.getItem(LS.reg)) { return; }\n    var r = /[?&]ref=", "    var r = /[?&]ref="],
  // Μ7 · σβησμένος κωδικός δεν σέβεται — η σύσταση μένει ενώ ο χρήστης την έσβησε.
  ["js", "      else if (/^ref:/.test(src)) { localStorage.setItem(LS.src, 'link'); }", ""],
  // Μ8 · το στατικό manifest χάνει το id — δύο «εφαρμογές» για το λειτουργικό.
  ["man", '"id": "/kostometro/",', '"x": 1,'],
];
if (ONLY) {
  const m = MUT[ONLY - 1]; if (!m) process.exit(2);
  const t = { js, html, man }[m[0]];
  if (!t.includes(m[1])) { console.log("Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(3); }
  if (m[0] === "js") js = js.replace(m[1], m[2]); else if (m[0] === "html") html = html.replace(m[1], m[2]); else man = man.replace(m[1], m[2]);
}
let fails = 0;
const check = (n, f) => { try { f(); if (!ONLY) console.log("  ✔ " + n); } catch (e) { fails++; console.log("  ✘ " + n + " — " + e.message); } };
const has = (s, x, w) => { if (!s.includes(x)) throw new Error(w); };
const hasnt = (s, x, w) => { if (x instanceof RegExp ? x.test(s) : s.includes(x)) throw new Error(w); };
const slice = (s, a, b) => { const i = s.indexOf(a); if (i < 0) throw new Error("δεν βρέθηκε: " + a); return s.slice(i, s.indexOf(b, i + a.length)); };

check("Π-1 · 🔴 το LS.email γράφεται ΜΟΝΟ μετά την επιβεβαίωση", () => {
  const go = slice(js, "  el('go-email').onclick = function () {", "  function codeErr(");
  hasnt(go, "localStorage.setItem(LS.email", "το go-email γράφει email πριν τον κωδικό");
  const gc = slice(js, "  el('go-code').onclick = function () {", "  el('code-resend').onclick");
  has(gc, "localStorage.setItem(LS.email, codeEmail);", "το go-code δεν γράφει το email");
  has(gc, "localStorage.setItem(LS.emailTok, j.email_token);", "το token δεν φυλάγεται");
});
check("Π-2 · 🔴 το token φεύγει με την εγγραφή και σβήνεται μετά", () => {
  const r = slice(js, "  function kmRegister() {", "\n  }\n");
  has(r, "email_token: localStorage.getItem(LS.emailTok) || null", "δεν στέλνεται token");
  has(js, "localStorage.removeItem(LS.emailTok);   // καμένο", "το token δεν σβήνεται");
});
check("Π-3 · η οθόνη s-code υπάρχει ΚΑΙ είναι στο SCREENS", () => {
  has(html, '<section id="s-code" class="screen setup" hidden>', "λείπει η οθόνη");
  has(js, "  var SCREENS = ['s-acc','s-email','s-code','s-words',", "δεν είναι στο SCREENS");
  has(html, 'autocomplete="one-time-code"', "χωρίς αυτόματη συμπλήρωση κωδικού από το κινητό");
});
check("Π-4 · 🔴 το πεδίο «Κωδικός πρόσκλησης» ΠΑΝΤΑ ορατό, κενό = κανονικό", () => {
  has(html, '<label class="fld" id="ref-fld">', "το πεδίο λείπει ή είναι κρυφό");
  has(html, "(αν έχεις)", "δεν λέει ότι είναι προαιρετικό");
  has(html, "έλεγξέ τον ή άφησέ το κενό", "το μήνυμα λάθους δεν προσφέρει το κενό");
  const go = slice(js, "  el('go-email').onclick = function () {", "  function codeErr(");
  has(go, ": Promise.resolve(true);", "κενός κωδικός δεν περνάει χωρίς έλεγχο");
});
check("Π-5 · 🔴 το manifest ακολουθεί ref/src ΜΟΝΟ πριν την εγγραφή", () => {
  has(js, "    manifestFollow();\n", "δεν καλείται στο boot");
  const f = slice(js, "  function manifestFollow() {", "\n  }\n");
  has(f, "    if (localStorage.getItem(LS.reg)) { return; }\n    var r = /[?&]ref=", "αλλάζει και μετά την εγγραφή");
  has(f, "'/api/km/manifest?'", "δεν δείχνει στο δυναμικό manifest");
});
check("Π-6 · ο σβησμένος κωδικός ΣΕΒΕΤΑΙ", () => {
  has(js, "      else if (/^ref:/.test(src)) { localStorage.setItem(LS.src, 'link'); }", "δεν καθαρίζει τη σύσταση");
});
check("Π-7 · στατικό manifest με σταθερό id", () => {
  const m = JSON.parse(man);
  if (m.id !== "/kostometro/") throw new Error("id: " + m.id);
});
check("Π-8 · δείκτες του deploy", () => {
  has(js, "KM-EMAIL-CODE", "λείπει KM-EMAIL-CODE"); has(js, "KM-MANIFEST-REF", "λείπει KM-MANIFEST-REF");
  has(html, "KM-REF-FIELD", "λείπει KM-REF-FIELD");
});
if (ONLY) { if (fails) { console.log("Μ" + ONLY + ": κοκκίνισε ✓"); process.exit(0); } console.log("Μ" + ONLY + ": ΠΕΡΑΣΕ ΠΡΑΣΙΝΟ"); process.exit(1); }
if (fails) { console.log("\n" + fails + " ΑΠΕΤΥΧΑΝ"); process.exit(1); }
console.log("\n✔ ΟΛΑ ΠΕΡΑΣΑΝ (8)");
