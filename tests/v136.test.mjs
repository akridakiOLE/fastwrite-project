// v136 · Ευρήματα Stavros στο build 5 (21/10/2026): κουτί τέλους δώρου χωρίς κλειδί · Κώστας όχι πάνω από Μενού/Ρυθμίσεις ·
//        «Απάντηση ανάγνωσης» · κουμπί κλειδιού μόνο σε όσους έχουν κλειδί · ημερομηνία που δεν διαβάστηκε.
//   node tests/v136.test.mjs   · --mutate=N (exit 0 = πιάστηκε)
import { readFileSync } from "node:fs";
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let APP = readFileSync("site/kostometro/app.js", "utf8"), HTML = readFileSync("site/kostometro/index.html", "utf8"), CSS = readFileSync("site/kostometro/app.css", "utf8");
const VER = readFileSync("site/kostometro/version.json", "utf8"), SW = readFileSync("site/kostometro/sw.js", "utf8");
const MUT = [
  ["app", "εντελώς δωρεάν.';\n    el('gift-p').hidden = false; el('gift-k').hidden = true;", "εντελώς δωρεάν.';\n    el('gift-p').hidden = false; el('gift-k').hidden = false;"],      // 1 · ο οδηγός κλειδιού ξαναβγαίνει
  ["app", "'Συνεχίζεις χειροκίνητα, εντελώς δωρεάν.'", "'Συνεχίζεις χειροκίνητα, ή βάζεις δικό σου κλειδί Google για αυτόματη ανάγνωση.'"], // 2 · κείμενο κλειδιού
  ["css", "body.on-menu .ag-fab{display:none!important}", ""],                                                                          // 3 · Κώστας πάνω από Ρυθμίσεις
  ["app", "id === 's-menu' || id === 's-settings'", "false"],                                                                           // 4 · η κλάση δεν μπαίνει
  ["html", "<span>Απάντηση ανάγνωσης</span>", "<span>Απάντηση Google</span>"],                                                         // 5 · παλιά ετικέτα
  ["app", "el('st-editkey').hidden = !localStorage.getItem(LS.key);", "el('st-editkey').hidden = false;"],                               // 6 · κουμπί κλειδιού σε όλους
  ["app", "else if (sug && !sug.date && prefilled && !r.invDate && !isReader())", "else if (false)"],                                    // 7 · σιωπή όταν λείπει η ημερομηνία
  ["app", "if (t !== null) { r.invDate = t; put(r)", "if (t !== null) { put(r)"],                                                        // 8 · η αλλαγή δεν αποθηκεύεται
  ["app", "raw: JSON.stringify({ net: j.net, vat: j.vat, total: j.total, date: j.date }).slice(0, 200) };", "};"],                      // 9 · χωρίς raw ανά τιμολόγιο
];
if (ONLY) {
  const m = MUT[ONLY - 1]; if (!m) process.exit(2);
  const t = { app: APP, html: HTML, css: CSS }[m[0]];
  if (!t.includes(m[1])) { console.log("Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(3); }
  const r = t.replace(m[1], m[2]); if (m[0] === "app") APP = r; else if (m[0] === "html") HTML = r; else CSS = r;
}
const res = []; const ok = (n, c, i) => { res.push(!!c); console.log((c ? "✅" : "❌") + " " + n + (i ? "  — " + i : "")); };
const end = APP.slice(APP.indexOf("KM-V136-GIFTEND"), APP.indexOf("KM-V136-GIFTEND") + 600);
ok("Δ1 τέλος δώρου: «χειροκίνητα, εντελώς δωρεάν», χωρίς οδηγό κλειδιού", end.includes("'Συνεχίζεις χειροκίνητα, εντελώς δωρεάν.'") && end.includes("el('gift-k').hidden = true;") && !/κλειδί Google/.test(end.split("*/")[1] || ""));
ok("Δ2 ο Κώστας κρύβεται σε Μενού + Ρυθμίσεις (κλάση + CSS)", /classList\.toggle\('on-menu', id === 's-menu' \|\| id === 's-settings'\)/.test(APP) && CSS.includes("body.on-menu .ag-fab{display:none!important}"));
ok("Δ3 «Απάντηση ανάγνωσης», όχι «Απάντηση Google»", HTML.includes("<span>Απάντηση ανάγνωσης</span>") && !HTML.includes("Απάντηση Google"));
ok("Δ4 «Κλειδί Gemini» στις Ρυθμίσεις μόνο με αποθηκευμένο κλειδί", APP.includes("el('st-editkey').hidden = !localStorage.getItem(LS.key);"));
const nd = APP.slice(APP.indexOf("KM-V136-NODATE (εύρημα"), APP.indexOf("KM-V136-NODATE (εύρημα") + 1600);
ok("Δ5 χωρίς ημερομηνία: μήνυμα + «Άλλαξέ τη» που αποθηκεύει invDate", nd.includes("else if (sug && !sug.date && prefilled && !r.invDate && !isReader())") && nd.includes("Δεν βρέθηκε ημερομηνία στη φωτογραφία") && nd.includes("if (t !== null) { r.invDate = t; put(r)"));
ok("Δ6 κάθε τιμολόγιο κρατάει τη δική του raw απάντηση", APP.includes("raw: JSON.stringify({ net: j.net, vat: j.vat, total: j.total, date: j.date }).slice(0, 200) };"));
ok("Δ7 έκδοση v136", APP.includes("var APP_VER = 'φέτα 3 · v136';") && VER.includes('"v136"') && SW.includes("var CACHE = 'km-v136';"));
const bad = res.filter((x) => !x).length;
if (ONLY) { console.log(bad ? "Μ" + ONLY + " → κοκκίνισε ✔" : "Μ" + ONLY + " ΠΕΡΑΣΕ ✘"); process.exit(bad ? 0 : 1); }
console.log("\n" + (res.length - bad) + "/" + res.length + (bad ? " ΑΠΕΤΥΧΑΝ" : " OK")); process.exit(bad ? 1 : 0);
