// v85 — ΠΡΟΠΛΗΡΩΜΗ (402) + ΟΔΗΓΟΣ ΚΛΕΙΔΙΟΥ (24/9/2026)
//   node tests/v85.test.mjs
//   node tests/v85.test.mjs --mutate=N   (ΠΡΕΠΕΙ να κοκκινίσει)
//
// ΤΟ ΕΥΡΗΜΑ: 24/9 στο AI Studio του Stavros — «Get $10 in free credits when you
// switch to prepay and buy credits by October 12. After that, your account will
// auto-switch to prepay and API requests will fail until you buy credits.»
// Όταν τελειώσουν τα credits, η Google απαντάει 402 σε ΚΑΘΕ κλειδί του
// λογαριασμού (τεκμηρίωση billing, 22/9). Ως τη v84 το 402 έπεφτε στο 'halt':
// «Η ανάγνωση σταμάτησε», χωρίς εξήγηση, και κολλημένο ως το επόμενο άνοιγμα
// ΑΚΟΜΑ κι αφού ο χρήστης γέμιζε.
// ⚠ ΤΙ ΔΕΝ ΑΠΟΔΕΙΚΝΥΕΙ: ότι η Google στέλνει πράγματι 402 (από την τεκμηρίωση,
//   όχι μετρημένο) ούτε ότι το aistudio.google.com/billing ανοίγει τον σωστό
//   λογαριασμό όταν ο χρήστης έχει πολλούς.
import { readFileSync, existsSync } from "node:fs";
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let js = readFileSync("site/kostometro/app.js", "utf8");
let html = readFileSync("site/kostometro/index.html", "utf8");
let sw = readFileSync("site/kostometro/sw.js", "utf8");
let guide = readFileSync("site/kostometro/kleidi/index.html", "utf8");
const MUT = [
  // Μ1 · 🔴 το 402 ξαναπέφτει στο «άκυρο κλειδί» — σιωπηλό κλείδωμα.
  ["js", "    if (err && err.status === 402) { return 'pay'; }\n", ""],
  // Μ2 · 🔴 ο κλάδος της προπληρωμής κλειδώνει την ανάγνωση.
  ["js", "          aiPay = true;\n          aiWait = Date.now() + AI_PAY_WAIT;", "          aiPay = true; aiHalt = true;\n          aiWait = Date.now() + AI_PAY_WAIT;"],
  // Μ3 · 🔴 δεν ξαναδοκιμάζει μόνο του — μετά το γέμισμα μένει νεκρό ως το επόμενο άνοιγμα.
  ["js", "          schedule(AI_PAY_WAIT + 500);\n", ""],
  // Μ4 · η επιτυχημένη ανάγνωση δεν σβήνει το μήνυμα της προπληρωμής.
  ["js", "        aiPay = false;  // v85: αφού διάβασε, υπάρχουν credits\n", ""],
  // Μ5 · 🔴 το μήνυμα λέει γενικό «σταμάτησε» αντί για «τελείωσε η προπληρωμή».
  ["js", "      } else if (aiPay) {", "      } else if (false) {"],
  // Μ6 · το μήνυμα χωρίς σύνδεσμο για γέμισμα.
  ["js", "        busy.appendChild(topUp);\n", ""],
  // Μ7 · το νέο κλειδί κρατάει την αναμονή των 10′ του παλιού.
  ["js", "aiPay = false; aiWait = 0; aiHalt = false; aiSlow = false; }", "aiHalt = false; aiSlow = false; }"],
  // Μ8 · η αλλαγή κλειδιού από τις Ρυθμίσεις κρατάει την προπληρωμή.
  ["js", "    aiHalt = false; aiPay = false; aiWait = 0;   // v85", "    aiHalt = false;   // v85"],
  // Μ9 · 🔴 ο σύνδεσμος «Πώς βγάζω κλειδί» ξαναδείχνει σκέτη τη Google.
  ["html", 'href="/kostometro/kleidi/"', 'href="https://aistudio.google.com/apikey"'],
  // Μ10 · παλιό παράδειγμα κλειδιού — ο χρήστης νομίζει ότι το «AQ.» είναι λάθος.
  ["html", 'placeholder="AQ.…"', 'placeholder="AIza…"'],
  // Μ11 · το κουμπί των Ρυθμίσεων δεν λέγεται όπως στον οδηγό.
  ["html", 'id="st-editkey">Κλειδί Gemini<', 'id="st-editkey">Αλλαγή κλειδιού Gemini<'],
  // Μ12 · 🔴 ο οδηγός περνάει από τη μνήμη — χωρίς δίκτυο σερβίρεται η εφαρμογή στη θέση του.
  ["sw", "  if (u.pathname.indexOf('/kostometro/kleidi') === 0) { return; }\n", ""],
  // Μ13 · 🔴 το κλειδί που φάνηκε στη συνομιλία 24/9 διαρρέει στον οδηγό.
  ["guide", "</main>", "AQ.Ab8RN6LZx2juj</main>"],
  // Μ14 · ο οδηγός χωρίς δρόμο πίσω στην εφαρμογή.
  ["guide", 'id="back" href="/kostometro/"', 'id="xx" href="/"'],
  // Μ15 · ο οδηγός δημοσιεύεται με σημάδια προσχεδίου.
  ["guide", "</main>", "[ΠΡΟΣ ΕΠΑΛΗΘΕΥΣΗ]</main>"],
  // Μ16 · 🔴 ο οδηγός λέει στον χρήστη να στείλει το κλειδί στον εαυτό του — χάνεται η προειδοποίηση.
  ["guide", "Μη στείλεις το κλειδί στον εαυτό σου", "Στείλε το κλειδί στον εαυτό σου"],
];
if (ONLY) {
  const m = MUT[ONLY - 1]; if (!m) process.exit(2);
  const t = { js, html, sw, guide }[m[0]];
  if (!t.includes(m[1])) { console.log("Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(3); }
  const r = t.replace(m[1], m[2]);
  if (m[0] === "js") js = r; else if (m[0] === "html") html = r; else if (m[0] === "sw") sw = r; else guide = r;
}
let fails = 0;
async function check(n, f) { try { await f(); if (!ONLY) console.log("  ✔ " + n); } catch (e) { fails++; console.log("  ✘ " + n + " — " + e.message); } }
const has = (s, x, w) => { if (!s.includes(x)) throw new Error(w); };
const hasnt = (s, x, w) => { if (x instanceof RegExp ? x.test(s) : s.includes(x)) throw new Error(w); };
const eq = (a, b, w) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(w + " — πήρα " + JSON.stringify(a)); };
const slice = (s, a, b) => { const i = s.indexOf(a); if (i < 0) throw new Error("δεν βρέθηκε: " + a.slice(0, 60)); return s.slice(i, s.indexOf(b, i + a.length)); };

function world(responses) {
  const a = js.indexOf("  var AI_MODELS"), b = js.indexOf("  /* Ένα και μόνο χρονόμετρο");
  if (a < 0 || b < 0) throw new Error("δεν βρέθηκε το κομμάτι της ανάγνωσης");
  const store = {}, calls = [];
  const env = {
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    LS: { model: "km_ai_model", diag: "km_ai_diag", aiErr: "km_ai_err", aiMs: "km_ai_ms", aiRaw: "km_ai_raw", aiTok: "km_ai_tok" },
    el: () => ({ hidden: true }), renderSettings: () => {}, pagesOf: () => ["BLOB"],
    FileReader: class { readAsDataURL() { this.result = "data:image/jpeg;base64,AAAA"; setTimeout(() => this.onload(), 0); } },
    window: {},
    fetch: async (url, opt) => {
      calls.push({ url });
      const r = responses.shift() || { status: 200 };
      if (r.status === 200) return { ok: true, json: async () => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"net":10,"vat":1.9,"total":11.9,"date":null}' }] } }] }) };
      return { ok: false, status: r.status, text: async () => JSON.stringify({ error: { message: r.msg || "x" } }) };
    },
  };
  const names = Object.keys(env);
  const f = new Function(...names, js.slice(a, b) + "\nreturn { aiErrKind, aiRead };");
  return { api: f(...names.map((n) => env[n])), calls };
}

await check("Ν-1 · 🔴 το 402 είναι «προπληρωμή», όχι άκυρο κλειδί ούτε φόρτος", () => {
  const { aiErrKind } = world([]).api;
  eq(aiErrKind({ status: 402 }), "pay", "το 402 σε λάθος κατηγορία");
  eq([400, 401, 403].map((s) => aiErrKind({ status: s })), ["halt", "halt", "halt"], "άλλαξαν τα υπόλοιπα 4xx");
  eq(aiErrKind({ status: 429 }), "wait", "άλλαξε το 429");
});
await check("Ν-2 · 402 → ΜΙΑ κλήση, όχι γύρος σε όλα τα μοντέλα (ίδιος λογαριασμός χρέωσης)", async () => {
  const w = world([{ status: 402, msg: "prepaid credits depleted" }, { status: 200 }]);
  let err = null; try { await w.api.aiRead({}, "K"); } catch (e) { err = e; }
  eq(err && err.status, 402, "το 402 χάθηκε");
  eq(w.calls.length, 1, "έκαψε κλήσεις σε άλλα μοντέλα");
});
await check("Ν-3 · 🔴 ο κλάδος 402: ΔΕΝ κλειδώνει, ξαναδοκιμάζει μόνος σε 10′, γράφει το σφάλμα", () => {
  const br = slice(js, "        } else if (kind === 'pay') {", "        } else {\n          aiHalt = true;");
  has(br, "aiPay = true;", "δεν σημειώνεται η προπληρωμή");
  hasnt(br, "aiHalt = true", "κλειδώνει την ανάγνωση");
  has(br, "schedule(AI_PAY_WAIT + 500);", "δεν ξαναπρογραμματίζει");
  has(br, "aiErrLog('τελείωσε η προπληρωμή · 402", "δεν γράφεται στις Ρυθμίσεις");
  has(js, "var AI_PAY_WAIT = 600000;", "η αναμονή δεν είναι 10′");
});
await check("Ν-4 · η ανάγνωση που πέτυχε σβήνει την προπληρωμή (και η «Δοκιμή ανάγνωσης τώρα»)", () => {
  has(js, "        aiPay = false;  // v85: αφού διάβασε, υπάρχουν credits\n", "η ουρά δεν καθαρίζει");
  has(js, "        aiPay = false;   // v85: απάντησε — υπάρχουν credits\n", "η δοκιμή δεν καθαρίζει");
});
await check("Ν-5 · 🔴 το μήνυμα λέει ΤΙ έγινε και έχει σύνδεσμο για γέμισμα", () => {
  const m = slice(js, "      } else if (aiPay) {", "      } else if ((r.aiTry || 0) >= AI_MAX_TRY) {");
  has(m, "Τελείωσε η προπληρωμή", "γενικό μήνυμα");
  has(m, "topUp.href = AI_BILLING_URL;", "χωρίς σύνδεσμο");
  has(m, "busy.appendChild(topUp);", "ο σύνδεσμος δεν μπαίνει στη σελίδα");
  has(js, "var AI_BILLING_URL = 'https://aistudio.google.com/billing';", "λάθος σελίδα γεμίσματος");
});
await check("Ν-6 · νέο κλειδί = καθαρό μητρώο (οθόνη εγγραφής ΚΑΙ Ρυθμίσεις)", () => {
  has(js, "aiPay = false; aiWait = 0; aiHalt = false; aiSlow = false; }", "go-key");
  has(js, "    aiHalt = false; aiPay = false; aiWait = 0;   // v85", "st-editkey");
});
await check("Ν-7 · η εφαρμογή ταιριάζει με τον οδηγό", () => {
  has(html, 'href="/kostometro/kleidi/"', "ο σύνδεσμος δεν δείχνει στον οδηγό");
  has(html, 'placeholder="AQ.…"', "παλιό παράδειγμα");
  hasnt(html, "AIza", "έμεινε «AIza» στην οθόνη");
  has(html, 'id="st-editkey">Κλειδί Gemini<', "το κουμπί δεν λέει «Κλειδί Gemini»");
});
await check("Ν-8 · 🔴 ο οδηγός ΔΕΝ περνάει από τη μνήμη του service worker", () => {
  has(sw, "  if (u.pathname.indexOf('/kostometro/kleidi') === 0) { return; }\n", "ο οδηγός πιάνεται από τον worker");
  if (sw.indexOf("/kostometro/kleidi') === 0) { return; }") > sw.indexOf("var mine =")) throw new Error("η εξαίρεση μπαίνει μετά το «mine»");
  has(sw, "var CACHE = 'km-v85';", "η μνήμη δεν ανέβηκε");
});
await check("Ν-9 · 🔴 ο οδηγός: καθαρός, πλήρης, ασφαλής", () => {
  hasnt(guide, "AQ.Ab8RN6", "ΔΙΑΡΡΟΗ του κλειδιού της 24/9");
  hasnt(guide, /ΠΡΟΣ ΕΠΑΛΗΘΕΥΣΗ|ΠΡΟΣΧΕΔΙΟ|ΜΕΤΡΗΣΗ ΕΚΚΡΕΜΕΙ|data:image/, "σημάδια προσχεδίου ή ενσωματωμένες εικόνες");
  has(guide, 'id="back" href="/kostometro/"', "χωρίς δρόμο πίσω");
  has(guide, "Μη στείλεις το κλειδί στον εαυτό σου", "χάθηκε η προειδοποίηση");
  const imgs = [...guide.matchAll(/src="([a-z0-9]+\.png)"/g)].map((m) => m[1]);
  eq(imgs.length, 11, "λάθος αριθμός εικόνων");
  for (const f of imgs) if (!existsSync("site/kostometro/kleidi/" + f)) throw new Error("λείπει η εικόνα " + f);
});
await check("Ν-10 · δείκτες του deploy", () => {
  has(js, "KM-AI-PREPAY-402", "λείπει KM-AI-PREPAY-402");
  has(html, "KM-KLEIDI-GUIDE", "λείπει KM-KLEIDI-GUIDE");
  has(sw, "KM-SW-KLEIDI", "λείπει KM-SW-KLEIDI");
  has(js, "var APP_VER = 'φέτα 3 · v85';", "λάθος έκδοση");
});
if (ONLY) {
  if (fails) { console.log("Μ" + ONLY + ": κοκκίνισε (" + fails + ") ✓"); process.exit(0); }
  console.log("Μ" + ONLY + ": ΠΕΡΑΣΕ ΠΡΑΣΙΝΟ — ο φρουρός ΔΕΝ πιάνει τη μετάλλαξη"); process.exit(1);
}
if (fails) { console.log("\n" + fails + " ΑΠΕΤΥΧΑΝ"); process.exit(1); }
console.log("\n✔ ΟΛΑ ΠΕΡΑΣΑΝ (10)");
