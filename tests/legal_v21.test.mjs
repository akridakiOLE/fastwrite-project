// Πολιτική Απορρήτου v2.1 (1/10/2026) — φρουροί: η σελίδα λέει ό,τι κάνει ο κώδικας, και τίποτα λιγότερο.
//   node tests/legal_v21.test.mjs  ·  --mutate=N (ΠΡΕΠΕΙ να κοκκινίσει)
import { readFileSync } from "node:fs";
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let html = readFileSync("site/legal/privacy.html", "utf8");
let en = readFileSync("site/legal/privacy-en.html", "utf8");
const src = readFileSync("src/km.js", "utf8");
const app = readFileSync("site/kostometro/index.html", "utf8");
const MUT = [
  ["html", "Anthropic PBC", "Acme Inc"],                                                   // 1 · 🔴 ο υπεκτελών του βοηθού λείπει
  ["html", "<strong>90 ημέρες</strong> από το τελευταίο μήνυμα", "<strong>7 ημέρες</strong> από το τελευταίο μήνυμα"], // 2 · 🔴 χρόνος τήρησης συζητήσεων ≠ κώδικας
  ["html", "<strong>δεν αποθηκεύεται</strong>", "<strong>αποθηκεύεται</strong>"],           // 3 · 🔴 φωτογραφίες
  ["html", "γίνεται σε 72 ώρες", "γίνεται αμέσως"],                                        // 4 · 🔴 διαγραφή
  ["html", '<p class="legal-lang"><strong>English:</strong> the previous policy (v1.2) for FastWrite Desktop remains available at <a href="/legal/privacy-en">', '<p class="legal-lang"><strong>English:</strong> the previous policy (v1.2) for FastWrite Desktop remains available at <a href="/legal/privacy-old">'],                        // 5 · σύνδεσμος στο αγγλικό
  ["en", 'is in Greek at <a href="/legal/privacy">', 'is in Greek at <a href="/legal/nothing">'],                                              // 6 · το αγγλικό δεν δείχνει στο νέο
  ["html", "προσωπικό γραμματοκιβώτιο Gmail", "γραμματοκιβώτιο Workspace"],                 // 7 · 🔴 η προώθηση στο προσωπικό Gmail κρύβεται
  ["html", "Κρατάμε μόνο το email", "Κρατάμε email και όνομα"],                            // 8 · σύνδεση Google/MS: τι κρατάμε
  ["html", "<strong>ούτε τη φωτογραφία ούτε τα ποσά.</strong>", "<strong>τη φωτογραφία για 30 ημέρες.</strong>"],  // 9 · 🔴 v113: η Α9 λέει ότι κρατάμε τη φωτογραφία
  ["html", "<td>ο βοηθός (Α8) και η ανάγνωση τιμολογίων (Α9)</td>", "<td>ο βοηθός (Α8)</td>"],                     // 10 · 🔴 v113: η Anthropic λείπει ως υπεκτελών της ανάγνωσης
];
if (ONLY) { const m = MUT[ONLY - 1]; if (!m) process.exit(2); const bag = { html, en };
  if (!bag[m[0]].includes(m[1])) { console.log("Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(3); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ html, en } = bag); }
let failed = 0;
const check = (n, f) => { try { f(); if (!ONLY) console.log("  ✔ " + n); } catch (e) { failed++; console.log("  ✘ " + n + " — " + e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const num = (re) => { const m = re.exec(src); if (!m) throw new Error("δεν βρέθηκε στον κώδικα: " + re); return Number(m[1]); };

check("Π-1 · δομή: ελληνικά, v2.1, 1/10/2026, όλες οι ενότητες και οι άγκυρες", () => {
  ok(/<html lang="el">/.test(html) && html.includes("Έκδοση 2.3") && html.includes("4 Οκτωβρίου 2026") /* v113: Πολιτική v2.3 (Α9 — ανάγνωση από τον Κώστα) */, "κεφαλίδα");
  for (const id of ["a1", "a2", "kostometro", "aa1", "aa2", "aa6", "aa7", "aa8", "fastwrite-desktop", "istotopos", "a3", "a4", "a5", "a6", "a7", "a8", "a9", "a10"]) ok(html.includes('id="' + id + '"'), "άγκυρα " + id);
  ok(/<p class="legal-lang"><strong>English:<\/strong>[^<]*<a href="\/legal\/privacy-en">/.test(html), "σύνδεσμος στο αγγλικό");
});
check("Π-2 · 🔴 ο βοηθός (Α8): AI όχι άνθρωπος · Anthropic ως υπεκτελών · φωτογραφίες δεν αποθηκεύονται · 12 λέξεις/κλειδί μπλοκάρονται · email μόνο για άνθρωπο · συγκατάθεση", () => {
  // v113: η Α8 τελειώνει στην Α9 (ανάγνωση από τον Κώστα), όχι στο Μέρος Β — αλλιώς η Α9 «καλύπτει» την Α8
  const a8 = html.slice(html.indexOf('id="aa8"'), html.indexOf('id="aa9"') > 0 ? html.indexOf('id="aa9"') : html.indexOf('id="fastwrite-desktop"'));
  ok(/όχι άνθρωπος/.test(a8) && /Anthropic PBC/.test(a8) && /<strong>δεν αποθηκεύεται<\/strong>/.test(a8) && /12 λέξεις ή με κλειδί/.test(a8) && /μόνο<\/strong> αν ζητήσεις να σε βοηθήσει άνθρωπος/.test(a8) && /συγκατάθεσή σου/.test(a8), "Α8 ελλιπές");
  ok(/<td><strong>Anthropic PBC<\/strong><\/td>/.test(html), "Anthropic στον πίνακα υπεκτελούντων");
  ok(/id="ag-consent"[\s\S]*Anthropic[\s\S]*\/legal\/privacy/.test(app), "η οθόνη συγκατάθεσης της εφαρμογής δείχνει εδώ");
});
check("Π-3 · 🔴 οι χρόνοι τήρησης της σελίδας = οι σταθερές του κώδικα", () => {
  ok(html.includes("<strong>90 ημέρες</strong> από το τελευταίο μήνυμα") && /base - 90 \* 86400000/.test(src), "βοηθός 90 ημέρες");
  ok(html.includes("<strong>24 μήνες</strong>") && /base - 730 \* 86400000/.test(src), "βοηθός με αίτημα 24 μήνες");
  ok(num(/tombstone_months:\s*(\d+)/) === 36 && html.includes("<strong>36 μήνες</strong>"), "ταφόπετρα 36");
  ok(num(/leads_months:\s*(\d+)/) === 24 && html.includes("<strong>24 μήνες</strong> από τη συμπλήρωση"), "leads 24");
  ok(num(/support_months:\s*(\d+)/) === 24 && html.includes("<strong>24 μήνες</strong> από το κλείσιμο"), "support 24");
  ok(num(/SUP_PENDING_HOURS = (\d+)/) === 24 && html.includes("αριθμοί χωρίς μήνυμα: 24 ώρες"), "αριθμοί 24 ώρες");
  ok(/km_oauth_states/.test(src) && html.includes("<strong>10 λεπτά</strong>"), "oauth 10 λεπτά");
  ok(html.includes("γίνεται σε 72 ώρες") && /delete_due_at/.test(src), "διαγραφή 72 ώρες");
});
check("Π-4 · 🔴 λέει την αλήθεια για: προώθηση στο προσωπικό Gmail · σύνδεση Google/MS κρατά μόνο email · κανένα IP · χωνί ως αποτύπωμα", () => {
  ok(html.includes("προσωπικό γραμματοκιβώτιο Gmail"), "προώθηση Gmail");
  ok(html.includes("Κρατάμε μόνο το email") && /scope: "openid email profile"/.test(src), "σύνδεση: τι ζητάμε/κρατάμε");
  ok(/<strong>Δεν<\/strong> κρατάμε διεύθυνση IP/.test(html), "IP");
  ok(/μη αναστρέψιμο αποτύπωμα, χωρίς email/.test(html) && /sha256hex\(inst \+ ":" \+ \(env\.KM_ADMIN_KEY/.test(src), "χωνί");
});
check("Π-5 · το αγγλικό v1.2 μένει στο /legal/privacy-en με σημείωση προς το νέο", () => {
  ok(/<html lang="en">/.test(en) && en.includes("Notice (1 October 2026)") && /is in Greek at <a href="\/legal\/privacy">/.test(en) && en.includes("v2.2"), "privacy-en");
});
check("Π-6 · 🔴 v113 · Α9 (ανάγνωση από τον Κώστα): μόνο μετά την ενεργοποίηση · ΟΥΤΕ φωτογραφία ΟΥΤΕ ποσά σε εμάς · Anthropic 30 ημέρες, χωρίς εκπαίδευση · υπεκτελών · τήρηση", () => {
  const a9 = html.slice(html.indexOf('id="aa9"'), html.indexOf('id="fastwrite-desktop"'));
  ok(a9.length > 500, "λείπει η Α9");
  ok(/<strong>μετά<\/strong> την ενεργοποίηση/.test(a9) && /<strong>ούτε τη φωτογραφία ούτε τα ποσά\.<\/strong>/.test(a9) && /30 ημέρες/.test(a9) && /δεν χρησιμοποιεί τις φωτογραφίες για να εκπαιδεύσει/.test(a9) && /ως εκτελών/.test(a9), "Α9 ελλιπής");
  ok(html.includes("<td>ο βοηθός (Α8) και η ανάγνωση τιμολογίων (Α9)</td>"), "Anthropic υπεκτελών της Α9");
  ok(/Φωτογραφία τιμολογίου για ανάγνωση από τον Κώστα \(Α9\)<\/td>\s*<td><strong>δεν αποθηκεύεται<\/strong>/.test(html), "τήρηση");
  ok(/id="gift-ok"[\s\S]*Anthropic[\s\S]*\/legal\/privacy#aa9/.test(app), "η οθόνη ενεργοποίησης δείχνει στην Α9");
});
if (ONLY) { if (failed) { console.log("Μ" + ONLY + " → κοκκίνισε ✔"); process.exit(0); } console.log("Μ" + ONLY + " ΠΕΡΑΣΕ — το τεστ δεν πιάνει τίποτα"); process.exit(1); }
console.log(failed ? "ΑΠΕΤΥΧΑΝ " + failed : "✔ ΟΛΑ ΠΕΡΑΣΑΝ (6)"); process.exit(failed ? 1 : 0);
