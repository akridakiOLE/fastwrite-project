// v87 — ΤΟ «‹ ΠΙΣΩ» ΤΟΥ ΟΔΗΓΟΥ ΕΚΛΕΙΝΕ ΤΗΝ ΕΦΑΡΜΟΓΗ (24/9/2026)
//   node tests/v87.test.mjs  ·  --mutate=N (ΠΡΕΠΕΙ να κοκκινίσει)
// ΤΟ ΕΥΡΗΜΑ: Android του Stavros, v86 — Ρυθμίσεις → οδηγός → «‹ Πίσω» = η εφαρμογή
// κλείνει απότομα. Αιτία: ο σύνδεσμος άνοιγε με target=_blank μέσα στο παράθυρο της
// εγκατεστημένης εφαρμογής, το history.length ήταν 1 και το window.close() έκλεινε
// ΟΛΟ το παράθυρο. ⚠ Δεν αποδεικνύει τη συμπεριφορά σε πραγματικό Android/iPhone —
// μόνο ότι δεν υπάρχει πια ούτε _blank ούτε window.close στη διαδρομή.
import { readFileSync } from "node:fs";
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let js = readFileSync("site/kostometro/app.js", "utf8");
let html = readFileSync("site/kostometro/index.html", "utf8");
let guide = readFileSync("site/kostometro/kleidi/index.html", "utf8");
const MUT = [
  ["guide", "return true; }\ndocument.getElementById", "try { window.close(); } catch (e) {} return true; }\ndocument.getElementById"],
  ["html", '<a class="howto" href="/kostometro/kleidi/">', '<a class="howto" href="/kostometro/kleidi/" target="_blank">'],
  ["js", "guide.href = '/kostometro/kleidi/';   // v87", "guide.href = '/kostometro/kleidi/'; guide.target = '_blank';   // v87"],
  ["guide", "r.indexOf(location.origin + '/kostometro/') === 0", "true"],
];
if (ONLY) {
  const m = MUT[ONLY - 1]; if (!m) process.exit(2);
  const t = { js, html, guide }[m[0]];
  if (!t.includes(m[1])) { console.log("Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(3); }
  const r = t.replace(m[1], m[2]); if (m[0] === "js") js = r; else if (m[0] === "html") html = r; else guide = r;
}
let fails = 0;
const check = (n, f) => { try { f(); if (!ONLY) console.log("  ✔ " + n); } catch (e) { fails++; console.log("  ✘ " + n + " — " + e.message); } };
check("Ν87-1 · 🔴 ο οδηγός ΠΟΤΕ δεν κλείνει παράθυρο", () => { if (guide.includes("window.close")) throw new Error("window.close στον οδηγό"); });
check("Ν87-2 · 🔴 κανένας σύνδεσμος προς τον οδηγό σε νέο παράθυρο", () => {
  const links = [...html.matchAll(/<a [^>]*href="\/kostometro\/kleidi\/"[^>]*>/g)].map((m) => m[0]);
  if (links.length !== 2) throw new Error("περίμενα 2 συνδέσμους, βρήκα " + links.length);
  if (links.some((l) => l.includes("_blank"))) throw new Error("σύνδεσμος με _blank");
  const i = js.indexOf("guide.href = '/kostometro/kleidi/'"); if (i < 0) throw new Error("λείπει ο σύνδεσμος του «σταμάτησε»");
  if (js.slice(i, js.indexOf("\n", i)).includes("_blank")) throw new Error("ο σύνδεσμος του «σταμάτησε» ανοίγει νέο παράθυρο");
});
check("Ν87-3 · το «πίσω» γυρίζει στο ιστορικό ΜΟΝΟ αν ήρθαμε από το Kostometro", () => {
  if (!guide.includes("r.indexOf(location.origin + '/kostometro/') === 0")) throw new Error("χωρίς έλεγχο προέλευσης");
  if (!guide.includes('id="back" href="/kostometro/"')) throw new Error("χωρίς εφεδρικό σύνδεσμο");
});
check("Ν87-4 · δείκτης", () => { if (!guide.includes("KM-KLEIDI-BACK2")) throw new Error("δείκτης"); if (!/φέτα 3 · v(8[7-9]|9\d)/.test(js)) throw new Error("έκδοση"); });
if (ONLY) { if (fails) { console.log("Μ" + ONLY + ": κοκκίνισε ✓"); process.exit(0); } console.log("Μ" + ONLY + ": ΠΕΡΑΣΕ ΠΡΑΣΙΝΟ"); process.exit(1); }
if (fails) { console.log("\n" + fails + " ΑΠΕΤΥΧΑΝ"); process.exit(1); }
console.log("\n✔ ΟΛΑ ΠΕΡΑΣΑΝ (4)");
