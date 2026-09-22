// Η ΑΝΑΓΝΩΣΗ GEMINI — ΟΙ ΦΡΟΥΡΟΙ ΤΗΣ v78 (22/9/2026)
//   node tests/ai78.test.mjs
//   node tests/ai78.test.mjs --mutate=N   (ΠΡΕΠΕΙ να κοκκινίσει)
//
// ΤΟ ΕΥΡΗΜΑ: 22/9 στο κινητό του Stavros «Η ανάγνωση σταμάτησε» — και το ίδιο
// τιμολόγιο διαβάστηκε μόλις ξανανοίχτηκε η εφαρμογή. Ως τη v77 ΚΑΘΕ σφάλμα
// εκτός 429 κλείδωνε την ανάγνωση. Εδώ φυλάγονται:
//   · τα προσωρινά (5xx, λήξη χρόνου, δίκτυο) ΞΑΝΑΔΟΚΙΜΑΖΟΥΝ, δεν κλειδώνουν
//   · η κλήση ζητάει ΧΑΜΗΛΗ σκέψη — και αν το μοντέλο την απορρίψει, ξαναπάει χωρίς
//   · το σφάλμα και η διάρκεια μένουν ορατά στις Ρυθμίσεις
// ⚠ ΤΙ ΔΕΝ ΑΠΟΔΕΙΚΝΥΕΙ: ότι η Google δέχεται το thinking_level σε κάθε μοντέλο,
//   ούτε πόσο πιο γρήγορα διαβάζει. Αυτά μετριούνται στο κινητό (Ρυθμίσεις →
//   «Διάρκεια ανάγνωσης»). Το δίχτυ ασφαλείας (400 → χωρίς σκέψη) ΑΠΟΔΕΙΚΝΥΕΤΑΙ εδώ.

import { readFileSync } from "node:fs";

const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let js   = readFileSync("site/kostometro/app.js", "utf8");
let html = readFileSync("site/kostometro/index.html", "utf8");

const MUTATIONS = [
  // Μ1 · 🔴 το 503 ξαναγίνεται μόνιμο κλείδωμα — το σφάλμα της 22/9.
  ["js", "err.status >= 500 || err.status === 408", "err.status === 408"],
  // Μ2 · 🔴 ο κλάδος του προσωρινού κλειδώνει κι αυτός.
  ["js", "          aiRetryN++;\n", "          aiHalt = true; aiRetryN++;\n"],
  // Μ3 · φεύγει η ρύθμιση σκέψης — πίσω στην αργή ανάγνωση.
  ["js", "g.thinking_config = ", "g.no_think = "],
  // Μ4 · «minimal»: το 3.7/3.8 το απορρίπτει με σφάλμα (τεκμηρίωση Google 22/9).
  ["js", "thinking_level: 'low'", "thinking_level: 'minimal'"],
  // Μ5 · 🔴 χάνεται το δίχτυ: 400 λόγω ρύθμισης σκέψης = ανάγνωση νεκρή.
  ["js", "if (err && err.status === 400 && !deep && !AI_NOTHINK[list[i]]) {", "if (false) {"],
  // Μ6 · η αναμονή μεγαλώνει χωρίς όριο — ώρες ανάμεσα σε δύο προσπάθειες.
  ["js", "Math.max(0, n - 1)), 120000);", "Math.max(0, n - 1)), 1e12);"],
  // Μ7 · η διάρκεια δεν γράφεται — δεν μπορούμε να μετρήσουμε το «αργό».
  ["js", "localStorage.setItem(LS.aiMs,", "localStorage.setItem('km_x',"],
  // Μ8 · η γραμμή «Τελευταίο σφάλμα» φεύγει από τις Ρυθμίσεις.
  ["html", '<b id="st-aierr">', '<b id="st-xx">'],
  // Μ9 · 🔴 λήξη χρόνου / δίκτυο (χωρίς status) → κλείδωμα.
  ["js", "    if (err && err.status) { return 'halt'; }\n    return 'retry';", "    if (err && err.status) { return 'halt'; }\n    return 'halt';"],
  // Μ10 · 🔴 το προσωρινό δεν ξαναπρογραμματίζει — η ουρά κοιμάται ως την επόμενη οθόνη.
  ["js", "          schedule(back + 500);\n", ""],
  // Μ11 · ο χρόνος λήξης ξαναπέφτει στα 30″.
  ["js", "ctrl.abort(); }, 60000)", "ctrl.abort(); }, 30000)"],
  // Μ12 · η «ακατάλληλη απάντηση» σταματάει ξανά την ουρά.
  ["js", "          schedule(AI_GAP);   // v78", "          // v78"],
  // Μ13 · το σφάλμα δεν γράφεται μόνιμα στο κλείδωμα (άκυρο κλειδί).
  ["js", "          aiHalt = true;   // 'halt': 4xx — άκυρο κλειδί ή αίτημα\n          aiErrLog(aiErrText(err));", "          aiHalt = true;   // 'halt': 4xx — άκυρο κλειδί ή αίτημα"],
  // Μ14 · το 2.5 παίρνει thinking_level — δεν το ξέρει.
  ["js", "/^gemini-2\\.5/.test(model)", "false"],
  // Μ15 · v79 🔴 υπερφορτωμένο μοντέλο → περιμένουμε το ίδιο αντί για το επόμενο.
  ["js", "        if (err && (err.status >= 500 || err.status === 429)) {\n          err.msg", "        if (false) {\n          err.msg"],
  // Μ16 · v79 το εφεδρικό μοντέλο γίνεται μόνιμα προτιμώμενο μετά από μια στιγμή φορτίου.
  ["js", "if (!overErr && localStorage.getItem(LS.model) !== list[i]) {", "if (localStorage.getItem(LS.model) !== list[i]) {"],
  // Μ17 · v79 🔴 όλα υπερφορτωμένα → βγαίνει «κανένα μοντέλο» (404 = κλείδωμα) αντί για 503.
  ["js", "        if (overErr) { return Promise.reject(overErr); }\n", ""],
  // Μ18 · v80 🔴 η κανονική σκέψη δεν έρχεται ποτέ — τα δύσκολα τιμολόγια μένουν αδιάβαστα.
  ["js", "var deep = ((rec && rec.aiTry) || 0) >= 1;", "var deep = false;"],
  // Μ19 · v80 κανονική σκέψη από την ΠΡΩΤΗ — χάνεται η ταχύτητα των εύκολων.
  ["js", "var deep = ((rec && rec.aiTry) || 0) >= 1;", "var deep = true;"],
  // Μ20 · v80 η «Διάρκεια ανάγνωσης» δεν λέει ποια σκέψη διάβασε — δεν μετριέται η υπόθεση.
  ["js", "' · σκέψη κανονική' : ' · σκέψη χαμηλή'", "'' : ''"],
  // Μ21 · v81 🔴 πίσω στο parts[0] — ένα μέρος σκέψης μπροστά σβήνει τα ποσά.
  ["js", "        txt = (cand.content.parts || []).filter(function (pt) {", "        txt = (cand.content.parts || []).slice(0, 1).filter(function (pt) {"],
  // Μ22 · v81 το κείμενο της σκέψης μπαίνει στο JSON — χαλάει την ανάλυση.
  ["js", "return pt && !pt.thought && typeof pt.text === 'string';", "return pt && typeof pt.text === 'string';"],
  // Μ23 · v81 η αυτολεξεί απάντηση δεν γράφεται — ξανά αδιάγνωστο.
  ["js", "localStorage.setItem(LS.aiRaw,", "localStorage.setItem('km_x',"],
  // Μ24 · v81 η λίστα [{...}] μετράει ως «κανένα ποσό».
  ["js", "      if (Array.isArray(o)) { o = o[0] || null; }\n", ""],
  // Μ25 · v81 η γραμμή «Απάντηση Google» φεύγει από τις Ρυθμίσεις.
  ["html", '<b id="st-airaw">', '<b id="st-yy">'],
  // Μ26 · v82 🔴 το 429 δεν πάει στο επόμενο μοντέλο.
  ["js", "if (err && (err.status >= 500 || err.status === 429)) {", "if (err && err.status >= 500) {"],
  // Μ27 · v82 το μήνυμα του 429 δεν γράφεται — δεν ξέρουμε αν είναι ημερήσιο.
  ["js", "          aiErrLog('όριο 429 · ' + (err.msg || ''));   // v82", "          // v82"],
  // Μ28 · v82 ξανά σκέτο «TypeError».
  ["js", "(err && err.message && err.message !== 'http' ? ': ' + String(err.message).slice(0, 120) : '')", "''"],
];

if (ONLY) {
  const m = MUTATIONS[ONLY - 1];
  if (!m) { console.log("δεν υπάρχει μετάλλαξη " + ONLY); process.exit(2); }
  const src = m[0] === "js" ? js : html;
  if (!src.includes(m[1])) { console.log("Μ" + ONLY + ": ΤΟ ΚΕΙΜΕΝΟ ΔΕΝ ΒΡΕΘΗΚΕ — η μετάλλαξη δεν εφαρμόζεται"); process.exit(3); }
  if (m[0] === "js") js = js.replace(m[1], m[2]); else html = html.replace(m[1], m[2]);
}

let fails = 0;
async function check(name, fn) {
  try { await fn(); if (!ONLY) console.log("  ✓ " + name); }
  catch (e) { fails++; console.log("  ✗ " + name + " — " + e.message); }
}
function has(s, sub, why) { if (!s.includes(sub)) throw new Error(why); }
function eq(a, b, why) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(why + " — πήρα " + JSON.stringify(a) + ", ήθελα " + JSON.stringify(b)); }

/* ── Το κομμάτι της ανάγνωσης, ζωντανό, σε δικό του κόσμο ── */
function world(responses) {
  const a = js.indexOf("  var AI_MODELS");
  const b = js.indexOf("  /* Ένα και μόνο χρονόμετρο");
  if (a < 0 || b < 0) throw new Error("δεν βρέθηκε το κομμάτι της ανάγνωσης");
  const store = {};
  const calls = [];
  const env = {
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    LS: { model: "km_ai_model", diag: "km_ai_diag", aiErr: "km_ai_err", aiMs: "km_ai_ms", aiRaw: "km_ai_raw" },
    el: () => ({ hidden: true }),
    renderSettings: () => {},
    pagesOf: () => ["BLOB"],
    FileReader: class { readAsDataURL() { this.result = "data:image/jpeg;base64,AAAA"; setTimeout(() => this.onload(), 0); } },
    window: {},
    fetch: async (url, opt) => {
      calls.push({ url, body: JSON.parse(opt.body) });
      const r = responses.shift() || { status: 200 };
      if (r.status === 200) return { ok: true, json: async () => (r.body || { candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"net":10,"vat":1.9,"total":11.9,"date":null}' }] } }] }) };
      return { ok: false, status: r.status, text: async () => JSON.stringify({ error: { message: r.msg || "x" } }) };
    },
  };
  const names = Object.keys(env);
  const f = new Function(...names, js.slice(a, b) + "\nreturn { aiErrKind, aiBackoff, aiRead, aiGen, AI_NOTHINK };");
  return { api: f(...names.map((n) => env[n])), calls, store };
}

await check("Β-1 · 🔴 Κάθε σφάλμα στη σωστή κατηγορία", () => {
  const { aiErrKind } = world([]).api;
  eq([503, 500, 502, 504, 408].map((s) => aiErrKind({ status: s })), ["retry", "retry", "retry", "retry", "retry"], "τα προσωρινά δεν ξαναδοκιμάζουν");
  eq(aiErrKind({ name: "AbortError" }), "retry", "η λήξη χρόνου κλειδώνει");
  eq(aiErrKind({}), "retry", "το σφάλμα δικτύου κλειδώνει");
  eq(aiErrKind({ status: 429 }), "wait", "το 429 άλλαξε συμπεριφορά");
  eq([400, 401, 403].map((s) => aiErrKind({ status: s })), ["halt", "halt", "halt"], "άκυρο κλειδί δεν σταματάει — καίει κλήσεις");
  eq(aiErrKind({ soft: true, status: 200 }), "soft", "η ακατάλληλη απάντηση άλλαξε κατηγορία");
});

await check("Β-2 · Η αναμονή διπλασιάζεται και σταματάει στα 120″", () => {
  const { aiBackoff } = world([]).api;
  eq([1, 2, 3, 4, 5, 9].map(aiBackoff), [15000, 30000, 60000, 120000, 120000, 120000], "λάθος κλίμακα αναμονής");
});

await check("Β-3 · 🔴 Η κλήση ζητάει ΧΑΜΗΛΗ σκέψη — 3.x low, 2.5 μηδέν", async () => {
  const w = world([{ status: 200 }]);
  await w.api.aiRead({}, "K");
  eq(w.calls[0].body.generationConfig.thinking_config, { thinking_level: "low" }, "το 3.x δεν παίρνει thinking_level low");
  eq(w.calls[0].body.generationConfig.response_mime_type, "application/json", "χάθηκε το JSON");
  eq(w.api.aiGen("gemini-2.5-flash").thinking_config, { thinking_budget: 0 }, "το 2.5 δεν παίρνει thinking_budget 0");
  eq(w.api.aiGen("gemini-flash-latest").thinking_config, { thinking_level: "low" }, "το latest χωρίς ρύθμιση");
});

await check("Β-4 · 🔴 400 με ρύθμιση σκέψης → ΙΔΙΟ μοντέλο, χωρίς ρύθμιση, και διαβάζει", async () => {
  const w = world([{ status: 400, msg: "Invalid thinking level" }, { status: 200 }]);
  const out = await w.api.aiRead({}, "K");
  eq(w.calls.length, 2, "δεν ξαναστάλθηκε");
  eq(w.calls[0].url === w.calls[1].url, true, "άλλαξε μοντέλο αντί να βγάλει τη ρύθμιση");
  eq("thinking_config" in w.calls[1].body.generationConfig, false, "η δεύτερη κλήση κρατάει τη ρύθμιση");
  eq(out.total, 11.9, "δεν γύρισε το ποσό");
});

await check("Β-5 · Διπλό 400 (άκυρο κλειδί) → σταματάει στις 2 κλήσεις", async () => {
  const w = world([{ status: 400, msg: "API key not valid" }, { status: 400, msg: "API key not valid" }]);
  let err = null;
  try { await w.api.aiRead({}, "K"); } catch (e) { err = e; }
  eq(err && err.status, 400, "δεν γύρισε το 400");
  eq(w.calls.length, 2, "έκαψε παραπάνω κλήσεις");
});

await check("Β-6 · 🔴 ΟΛΑ υπερφορτωμένα → 503 (ξαναδοκιμάζει), όχι «κανένα μοντέλο»", async () => {
  const w = world([{ status: 503, msg: "high demand" }, { status: 503, msg: "high demand" }, { status: 503, msg: "high demand" }]);
  let err = null;
  try { await w.api.aiRead({}, "K"); } catch (e) { err = e; }
  eq(err && err.status, 503, "το 503 χάθηκε");
  eq(w.api.aiErrKind(err), "retry", "το 503 δεν ξαναδοκιμάζει");
  eq(w.calls.length, 3, "δεν δοκίμασε όλα τα μοντέλα");
});

await check("Β-13 · 🔴 v79 · 503 στο πρώτο → το ΕΠΟΜΕΝΟ μοντέλο διαβάζει, αμέσως", async () => {
  const w = world([{ status: 503, msg: "high demand" }, { status: 200 }]);
  const out = await w.api.aiRead({}, "K");
  eq(out.total, 11.9, "δεν διάβασε από το δεύτερο μοντέλο");
  eq(w.calls.length, 2, "λάθος αριθμός κλήσεων");
  eq(w.calls[0].url !== w.calls[1].url, true, "ξαναχτύπησε το ίδιο υπερφορτωμένο μοντέλο");
  eq(w.store["km_ai_model"] === undefined, true, "το εφεδρικό έγινε μόνιμα προτιμώμενο");
});

await check("Β-14 · v79 · 404 και μετά 503 → 503 (ξαναδοκιμάζει), όχι κλείδωμα", async () => {
  const w = world([{ status: 404 }, { status: 503 }, { status: 404 }]);
  let err = null;
  try { await w.api.aiRead({}, "K"); } catch (e) { err = e; }
  eq(err && err.status, 503, "βγήκε 404 = κλείδωμα αντί για 503");
});

await check("Β-16 · 🔴 v80 · 1η προσπάθεια χαμηλή σκέψη, από τη 2η κανονική", async () => {
  const w1 = world([{ status: 200 }]);
  await w1.api.aiRead({ aiTry: 0 }, "K");
  eq(w1.calls[0].body.generationConfig.thinking_config, { thinking_level: "low" }, "η 1η δεν είναι χαμηλή");
  const w2 = world([{ status: 200 }]);
  await w2.api.aiRead({ aiTry: 1 }, "K");
  eq("thinking_config" in w2.calls[0].body.generationConfig, false, "η 2η δεν πάει με κανονική σκέψη");
  const w3 = world([{ status: 200 }]);
  await w3.api.aiRead({ aiTry: 2 }, "K");
  eq("thinking_config" in w3.calls[0].body.generationConfig, false, "η 3η δεν πάει με κανονική σκέψη");
  if (!/σκέψη χαμηλή$/.test(w1.store["km_ai_ms"] || "")) throw new Error("η διάρκεια δεν λέει «σκέψη χαμηλή»: " + w1.store["km_ai_ms"]);
  if (!/σκέψη κανονική$/.test(w2.store["km_ai_ms"] || "")) throw new Error("η διάρκεια δεν λέει «σκέψη κανονική»: " + w2.store["km_ai_ms"]);
});

await check("Β-17 · v80 · 400 σε κανονική σκέψη ΔΕΝ ξαναστέλνεται (τίποτα να αφαιρεθεί)", async () => {
  const w = world([{ status: 400 }, { status: 200 }]);
  let err = null;
  try { await w.api.aiRead({ aiTry: 1 }, "K"); } catch (e) { err = e; }
  eq(err && err.status, 400, "δεν γύρισε το 400");
  eq(w.calls.length, 1, "έκαψε δεύτερη κλήση χωρίς λόγο");
});

await check("Β-18 · 🔴 v81 · μέρος σκέψης ΠΡΩΤΟ — τα ποσά διαβάζονται από το επόμενο", async () => {
  const w = world([{ status: 200, body: { candidates: [{ finishReason: "STOP", content: { parts: [
    { thought: true, text: "σκέφτομαι… 37.50" }, { thoughtSignature: "abc" }, { text: '{"net":34.4,"vat":3.1,"total":37.5,"date":null}' }] } }] } }]);
  const out = await w.api.aiRead({}, "K");
  eq(out.total, 37.5, "δεν βρέθηκε το σύνολο πίσω από το μέρος σκέψης");
});

await check("Β-19 · v81 · η αυτολεξεί απάντηση + λόγος τερματισμού γράφονται", async () => {
  const w = world([{ status: 200, body: { candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: '{"net":null' }] } }] } }]);
  let err = null;
  try { await w.api.aiRead({}, "K"); } catch (e) { err = e; }
  eq(err && err.soft, true, "το μισό JSON δεν μέτρησε ως ακατάλληλο");
  const v = w.store["km_ai_raw"] || "";
  if (!/MAX_TOKENS/.test(v) || !/\{"net":null/.test(v) || !/σκέψη χαμηλή/.test(v)) throw new Error("λείπουν στοιχεία: " + v);
});

await check("Β-20 · v81 · JSON ως λίστα [{...}] διαβάζεται", async () => {
  const w = world([{ status: 200, body: { candidates: [{ content: { parts: [{ text: '[{"net":1,"vat":0.19,"total":1.19,"date":null}]' }] } }] } }]);
  const out = await w.api.aiRead({}, "K");
  eq(out.total, 1.19, "η λίστα δεν ξετυλίχτηκε");
});

await check("Β-21 · 🔴 v82 · 429 στο πρώτο → το επόμενο μοντέλο διαβάζει", async () => {
  const w = world([{ status: 429, msg: "Quota exceeded per day" }, { status: 200 }]);
  const out = await w.api.aiRead({}, "K");
  eq(out.total, 11.9, "δεν διάβασε από το δεύτερο μοντέλο");
  eq(w.calls[0].url !== w.calls[1].url, true, "ξαναχτύπησε το ίδιο μοντέλο");
});

await check("Β-22 · v82 · όλα 429 → επιστρέφεται 429 (αναμονή, όχι κλείδωμα)", async () => {
  const w = world([{ status: 429 }, { status: 429 }, { status: 429 }]);
  let err = null;
  try { await w.api.aiRead({}, "K"); } catch (e) { err = e; }
  eq(err && err.status, 429, "χάθηκε το 429");
  eq(w.api.aiErrKind(err), "wait", "το 429 άλλαξε κατηγορία");
});

await check("Β-23 · v82 · το TypeError γράφεται με το μήνυμά του", () => {
  const a = js.indexOf("  function aiErrText(err) {");
  const f = new Function(js.slice(a, js.indexOf("\n  }", a) + 4) + "\nreturn aiErrText;")();
  const t = f({ name: "TypeError", message: "Failed to fetch" });
  if (!/TypeError: Failed to fetch/.test(t)) throw new Error("λείπει το μήνυμα: " + t);
  const sw = js.slice(js.indexOf("  function aiSweep() {"), js.indexOf("  /* ── Κάμερα ── */"));
  has(sw, "aiErrLog('όριο 429 · ' + (err.msg || ''));   // v82", "το 429 δεν γράφεται στο «Τελευταίο σφάλμα»");
});

await check("Β-15 · v79 · αποσυρμένο (404) → το επόμενο ΓΙΝΕΤΑΙ προτιμώμενο (όπως πριν)", async () => {
  const w = world([{ status: 404 }, { status: 200 }]);
  await w.api.aiRead({}, "K");
  eq(w.store["km_ai_model"], "gemini-2.5-flash", "το 404 δεν μετακινεί την προτίμηση");
});

await check("Β-7 · Η διάρκεια γράφεται μετά από κάθε επιτυχία", async () => {
  const w = world([{ status: 200 }]);
  await w.api.aiRead({}, "K");
  const v = w.store["km_ai_ms"] || "";
  if (!/″ · gemini-/.test(v)) throw new Error("δεν γράφτηκε διάρκεια: " + JSON.stringify(v));
});

/* ── Η aiSweep: στατικοί φρουροί (θέλει βάση και οθόνες) ── */
const SW = js.slice(js.indexOf("  function aiSweep() {"), js.indexOf("  /* ── Κάμερα ── */"));

await check("Β-8 · 🔴 Ο κλάδος του προσωρινού ΔΕΝ κλειδώνει και ξαναπρογραμματίζει", () => {
  const i = SW.indexOf("} else if (kind === 'retry') {");
  const br = SW.slice(i, SW.indexOf("} else if (kind === 'wait') {", i));
  if (i < 0 || !br) throw new Error("λείπει ο κλάδος retry");
  if (/aiHalt\s*=\s*true/.test(br)) throw new Error("ο κλάδος retry κλειδώνει");
  has(br, "          schedule(back + 500);\n", "δεν ξαναπρογραμματίζει");
  has(br, "aiWait = Date.now() + back;", "η οθόνη δεν ξέρει πότε ξαναδιαβάζει");
  has(br, "aiErrLog(aiErrText(err));", "το σφάλμα δεν γράφεται μόνιμα");
});

await check("Β-9 · Κλείδωμα ΜΟΝΟ στον κλάδο halt, με το σφάλμα γραμμένο", () => {
  eq((SW.match(/aiHalt = true/g) || []).length, 1, "το aiHalt γράφεται σε λάθος σημεία");
  has(SW, "          aiHalt = true;   // 'halt': 4xx — άκυρο κλειδί ή αίτημα\n          aiErrLog(aiErrText(err));", "το κλείδωμα δεν γράφει σφάλμα");
  has(SW, "aiRetryN = 0;   // η Google απάντησε", "ο μετρητής δεν μηδενίζεται στην επιτυχία");
});

await check("Β-10 · Η ακατάλληλη απάντηση δεν σταματάει την ουρά", () => {
  const i = SW.indexOf("if (kind === 'soft') {");
  has(SW.slice(i, SW.indexOf("} else if (kind === 'retry')", i)), "          schedule(AI_GAP);   // v78", "λείπει το schedule");
});

await check("Β-11 · Λήξη χρόνου 60″ (όχι 30″)", () => {
  has(js, "ctrl.abort(); }, 60000)", "ο χρόνος λήξης δεν είναι 60″");
});

await check("Β-12 · Οι Ρυθμίσεις δείχνουν διάρκεια και τελευταίο σφάλμα", () => {
  has(html, '<b id="st-aims">', "λείπει η γραμμή διάρκειας");
  has(html, '<b id="st-aierr">', "λείπει η γραμμή σφάλματος");
  has(js, "el('st-aims').textContent = localStorage.getItem(LS.aiMs)", "η διάρκεια δεν ζωγραφίζεται");
  has(js, "el('st-aierr').textContent = localStorage.getItem(LS.aiErr)", "το σφάλμα δεν ζωγραφίζεται");
  has(js, "    aiErr: 'km_ai_err',", "λείπει το κλειδί aiErr");
  has(js, "    aiMs:  'km_ai_ms',", "λείπει το κλειδί aiMs");
  has(js, "KM-AI-TRANSIENT", "λείπει ο δείκτης του deploy");
  has(js, "KM-AI-THINK", "λείπει ο δείκτης του deploy");
  has(js, "KM-AI-FALLOVER", "λείπει ο δείκτης του deploy");
  has(js, "KM-AI-DEEP", "λείπει ο δείκτης του deploy");
  has(js, "KM-AI-RAW", "λείπει ο δείκτης του deploy");
  has(js, "KM-AI-QUOTA-FALLOVER", "λείπει ο δείκτης του deploy");
  has(html, '<b id="st-airaw">', "λείπει η γραμμή «Απάντηση Google»");
  has(js, "el('st-airaw').textContent = localStorage.getItem(LS.aiRaw)", "η απάντηση δεν ζωγραφίζεται");
});

if (ONLY) {
  if (fails) { console.log("Μ" + ONLY + ": κοκκίνισε (" + fails + ") ✓"); process.exit(0); }
  console.log("Μ" + ONLY + ": ΠΕΡΑΣΕ ΠΡΑΣΙΝΟ — ο φρουρός ΔΕΝ πιάνει τη μετάλλαξη"); process.exit(1);
}
if (fails) { console.log("\n" + fails + " ΑΠΕΤΥΧΑΝ"); process.exit(1); }
console.log("\nΟΛΑ ΠΡΑΣΙΝΑ (23)");
