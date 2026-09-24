// v86 — Ο ΟΔΗΓΟΣ ΚΛΕΙΔΙΟΥ ΒΡΙΣΚΕΤΑΙ ΚΑΙ ΜΕΤΑ ΤΗΝ ΕΓΓΡΑΦΗ (24/9/2026)
//   node tests/v86.test.mjs  ·  --mutate=N (ΠΡΕΠΕΙ να κοκκινίσει)
// ΤΟ ΕΥΡΗΜΑ: ο Stavros (v85) δεν βρήκε τον οδηγό μέσα στην εφαρμογή — ζούσε μόνο
// στην οθόνη s-key, που εμφανίζεται ΜΙΑ φορά, στην εγγραφή.
import { readFileSync } from "node:fs";
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let js = readFileSync("site/kostometro/app.js", "utf8");
let html = readFileSync("site/kostometro/index.html", "utf8");
let sw = readFileSync("site/kostometro/sw.js", "utf8");
const MUT = [
  // Μ1 · 🔴 ο σύνδεσμος φεύγει από τις Ρυθμίσεις.
  ["html", '<a class="howto st-howto" id="st-howto" href="/kostometro/kleidi/"', '<a class="howto st-howto" id="st-howto" href="#"'],
  // Μ2 · ο σύνδεσμος μπαίνει ΕΞΩ από την οθόνη Ρυθμίσεων.
  ["html", '    <button class="btn ghost" id="st-editkey">Κλειδί Gemini</button>\n', '    <button class="btn ghost" id="st-editkey">Κλειδί Gemini</button>\n</section><section>\n'],
  // Μ3 · 🔴 το «σταμάτησε» χωρίς δρόμο προς τον οδηγό.
  ["js", "        busy.appendChild(guide);\n", ""],
  // Μ4 · ο σύνδεσμος του «σταμάτησε» δείχνει αλλού.
  ["js", "guide.href = '/kostometro/kleidi/';", "guide.href = '#';"],
];
if (ONLY) {
  const m = MUT[ONLY - 1]; if (!m) process.exit(2);
  const t = m[0] === "js" ? js : html;
  if (!t.includes(m[1])) { console.log("Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(3); }
  if (m[0] === "js") js = js.replace(m[1], m[2]); else html = html.replace(m[1], m[2]);
}
let fails = 0;
const check = (n, f) => { try { f(); if (!ONLY) console.log("  ✔ " + n); } catch (e) { fails++; console.log("  ✘ " + n + " — " + e.message); } };
const has = (s, x, w) => { if (!s.includes(x)) throw new Error(w); };
check("Ν86-1 · 🔴 ο οδηγός στις Ρυθμίσεις, μέσα στην οθόνη s-settings", () => {
  const a = html.indexOf('<section id="s-settings"'); const b = html.indexOf("</section>", a);
  const set = html.slice(a, b);
  has(set, '<a class="howto st-howto" id="st-howto" href="/kostometro/kleidi/">', "λείπει, είναι έξω από τις Ρυθμίσεις ή ανοίγει σε νέο παράθυρο");
});
check("Ν86-2 · 🔴 το «Η ανάγνωση σταμάτησε» δείχνει τον οδηγό", () => {
  const i = js.indexOf("      } else if (aiHalt) {"); const m = js.slice(i, js.indexOf("      } else if (aiPay) {", i));
  has(m, "guide.href = '/kostometro/kleidi/';", "λάθος ή κανένας σύνδεσμος");
  has(m, "busy.appendChild(guide);", "ο σύνδεσμος δεν μπαίνει");
});
check("Ν86-3 · δείκτες και έκδοση", () => {
  has(html, "KM-KLEIDI-SETTINGS", "δείκτης"); has(js, "KM-KLEIDI-HALT", "δείκτης");
  if (/APP_VER = 'φέτα 3 · v8[45]'/.test(js)) throw new Error("έκδοση"); if (/km-v8[45]'/.test(sw)) throw new Error("μνήμη");
});
if (ONLY) { if (fails) { console.log("Μ" + ONLY + ": κοκκίνισε ✓"); process.exit(0); } console.log("Μ" + ONLY + ": ΠΕΡΑΣΕ ΠΡΑΣΙΝΟ"); process.exit(1); }
if (fails) { console.log("\n" + fails + " ΑΠΕΤΥΧΑΝ"); process.exit(1); }
console.log("\n✔ ΟΛΑ ΠΕΡΑΣΑΝ (3)");
