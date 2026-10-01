// v105 · ο «Κώστας» ξέρει ΟΛΟ το πακέτο (Free, PRO, FastWrite, επιβράβευση, λογιστής, ιστορία) και πουλάει ΟΦΕΛΟΣ
//        — ΧΩΡΙΣ τιμές, με την εγκατάσταση πάντα πρώτη (brief «Προφίλ Κώστα», έγκριση Stavros 1/10/2026)
//   node --experimental-sqlite tests/v105.test.mjs  ·  --mutate=N (ΠΡΕΠΕΙ να κοκκινίσει)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let src = readFileSync("src/km.js", "utf8");
let know = readFileSync("site/kostometro/agent/knowledge_el.md", "utf8");
let build = readFileSync("tools/agent/build_knowledge.py", "utf8");
const MUT = [
  ["src", "ΠΡΟΤΕΡΑΙΟΤΗΤΑ: αν ο χρήστης έχει κολλήσει σε βήμα της εγκατάστασης, ΠΡΩΤΑ λύνεις το βήμα — ποτέ πώληση πάνω σε πρόβλημα.", "ΠΡΟΤΕΡΑΙΟΤΗΤΑ: πρώτα η πώληση."], // 1 · 🔴 πώληση πάνω στο πρόβλημα
  ["src", "ΤΙΜΕΣ: ΚΑΜΙΑ τιμή για PRO ή FastWrite — ούτε ενδεικτική", "ΤΙΜΕΣ: ενδεικτική τιμή για PRO ή FastWrite — με επιφύλαξη"],       // 2 · 🔴 τιμές
  ["know", "ΚΑΜΙΑ τιμή για το PRO ή το FastWrite, ούτε ενδεικτική", "Το PRO κοστίζει ενδεικτικά 59 €/μήνα"],                                // 3 · 🔴 τιμή στη γνώση
  ["src", "τη λες σε ΤΡΙΤΟ πρόσωπο, το πολύ μία φορά, μόνο με όσα γράφει η ΓΝΩΣΗ — ποτέ σαν δική σου εμπειρία (είσαι AI).", "τη λες σαν δική σου."], // 4 · 🔴 AI που «έζησε» την ιστορία
  ["src", "με περίληψη που αρχίζει «Συνεργασία λογιστή:».", "και διαπραγματεύεσαι τους όρους."],                                               // 5 · 🔴 διαπραγμάτευση με λογιστή
  ["know", "Η διαφορά είναι η ΣΤΑΘΕΡΟΤΗΤΑ, όχι το απόρρητο.", "Στο δωρεάν κλειδί η Google χρησιμοποιεί τα τιμολόγιά σου για να εκπαιδεύει τα μοντέλα της."], // 6 · 🔴 ψευδής ισχυρισμός (ΕΟΧ)
  ["build", "out += ['', rd('tools/agent/pakketo_el.md').strip()]", "pass"],                                                                    // 7 · το πακέτο δεν φτάνει στη γνώση
  ["know", "## ΤΙ ΕΡΧΕΤΑΙ — οθόνη «Κάλεσε» της εφαρμογής", "## (κενό)"],                                                                    // 8 · χωρίς PRO/FastWrite/επιβράβευση
  ["src", "reply = agentCut(blocks.filter((x) => x.type === \"text\").map((x) => x.text).join(\"\\n\").trim(), j.stop_reason);", "reply = blocks.filter((x) => x.type === \"text\").map((x) => x.text).join(\"\\n\").trim();"], // 9 · 🔴 μισή λέξη στον πελάτη
  ["src", "const AGENT_MAX_OUT = 1000;", "const AGENT_MAX_OUT = 700;"],                                                                      // 10 · πίσω στο όριο που έκοβε
];
if (ONLY) { const m = MUT[ONLY - 1]; if (!m) process.exit(2); const bag = { src, know, build };
  if (!bag[m[0]].includes(m[1])) { console.log("Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(3); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ src, know, build } = bag); }
let failed = 0;
const check = async (n, f) => { try { await f(); if (!ONLY) console.log("  ✔ " + n); } catch (e) { failed++; console.log("  ✘ " + n + " — " + e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
const db = new DatabaseSync(":memory:");
for (const f of ["km.sql", "km_h13.sql", "km_v54.sql", "km_mail.sql", "km_feedback.sql", "km_h11b.sql", "km_ref.sql", "km_ref2.sql", "km_verify.sql", "km_support.sql", "km_support_v95.sql", "km_funnel.sql", "km_leads.sql", "km_pinakas.sql", "km_oauth.sql", "km_agent.sql"]) {
  let sql; try { sql = readFileSync("schema/" + f, "utf8"); } catch (e) { continue; }
  sql = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  for (const s of sql.split(";")) { const t = s.trim(); if (!t) continue; try { db.exec(t + ";"); } catch (e) { if (!/duplicate column|already exists/i.test(e.message)) throw e; } }
}
const stmt = (sql, args) => { const p = db.prepare(sql); return { async first() { return p.get(...args) ?? null; },
  async run() { const r = p.run(...args); return { meta: { changes: Number(r.changes) } }; }, async all() { return { results: p.all(...args) }; } }; };
const DB = { prepare: (sql) => ({ bind: (...a) => stmt(sql, a), ...stmt(sql, []) }), async batch(l) { for (const s of l) await s.run(); return []; } };
const env = { DB, KM_ADMIN_KEY: "adm1n", ANTHROPIC_API_KEY: "k-test", EMAIL: { async send() { return { messageId: "x" }; } },
  ASSETS: { async fetch() { return new Response(know); } } };
const calls = [];
let nextResp = null;
globalThis.fetch = async (url, o) => {
  if (!/api\.anthropic\.com/.test(url)) throw new Error("fetch " + url);
  calls.push(JSON.parse(o.body));
  const r = nextResp || { content: [{ type: "text", text: "Τι επιχείρηση έχεις;" }], stop_reason: "end_turn" }; nextResp = null;
  return new Response(JSON.stringify(Object.assign({ usage: { input_tokens: 10, output_tokens: 10 } }, r)));
};
const chat = async (body) => { const r = await mod.handleKm(new Request("https://x/api/km/agent/chat", { method: "POST", body: JSON.stringify(body) }), env, null, "/api/km/agent/chat"); return { s: r.status, j: await r.json() }; };
let sys = "";

await check("Ν105-1 · 🔴 το system που ΦΤΑΝΕΙ στο μοντέλο έχει τους νέους κανόνες: προτεραιότητα εγκατάστασης, καμία τιμή, ιστορία σε τρίτο πρόσωπο, λογιστής → άνθρωπος", async () => {
  const r = await chat({ install_id: "km_v105a", text: "αξίζει;", consent: true });
  ok(r.s === 200 && calls.length === 1, JSON.stringify(r.j));
  sys = calls[0].system.map((b) => b.text).join("\n");
  ok(sys.includes("ΠΡΩΤΑ λύνεις το βήμα — ποτέ πώληση πάνω σε πρόβλημα"), "προτεραιότητα");
  ok(sys.includes("ΚΑΜΙΑ τιμή για PRO ή FastWrite — ούτε ενδεικτική") && sys.includes("ΚΑΜΙΑ ημερομηνία"), "τιμές");
  ok(sys.includes("ΤΡΙΤΟ πρόσωπο") && sys.includes("ποτέ σαν δική σου εμπειρία (είσαι AI)"), "ιστορία");
  ok(sys.includes("καλείς handoff_to_human με περίληψη που αρχίζει «Συνεργασία λογιστή:».") && sys.includes("δεν διαπραγματεύεσαι όρους"), "λογιστής");
  ok(sys.includes("ΔΕΝ είσαι άνθρωπος"), "AI (v104) έμεινε");
  ok(calls[0].system[0].cache_control && calls[0].system[0].text.includes("# ΓΝΩΣΗ\n"), "κανόνες + γνώση στο cached μπλοκ");
});
await check("Ν105-2 · 🔴 η γνώση έχει ΟΛΟ το πακέτο και ΚΑΜΙΑ τιμή/ημερομηνία προϊόντος", async () => {
  for (const h of ["## ΤΟ ΠΑΚΕΤΟ", "### Πώς μιλάς για όφελος", "### Η ιστορία του ανθρώπου που το έφτιαξε", "### Τιμές — ο κανόνας",
    "### Πληρωμένο κλειδί Gemini", "### Λογιστής — γνώση και συνεργασία", "## ΤΙ ΕΡΧΕΤΑΙ — οθόνη «Κάλεσε» της εφαρμογής"]) ok(know.includes(h), "λείπει: " + h);
  for (const h of ["ΤΙ ΚΑΝΕΙ ΤΟ PRO", "ΚΑΙ ΤΟ FastWrite", "ΠΟΙΟΣ ΒΛΕΠΕΙ ΤΙ", "Η ΕΠΙΒΡΑΒΕΥΣΗ", "Δεν υπάρχει δεύτερο επίπεδο"]) ok(know.includes(h), "Κάλεσε: λείπει " + h);
  ok(know.includes("ΚΑΜΙΑ τιμή για το PRO ή το FastWrite, ούτε ενδεικτική"), "κανόνας τιμών");
  ok(!/59\s*€|590\s*€|29\s*€\/μήνα|€\s*\/\s*μήνα|ευρώ\s+τον\s+μήνα|47,20|11,80/.test(know), "τιμή PRO στη γνώση: " + (know.match(/59\s*€|590\s*€|29\s*€\/μήνα|€\s*\/\s*μήνα|47,20|11,80/) || [])[0]);
  ok(!/εκπαιδε[υύ]|χρησιμοποιεί τα τιμολόγια|βελτιώνει τις υπηρεσίες της/.test(know.replace("🔴 ΜΗΝ λες ότι η Google χρησιμοποιεί τα τιμολόγια του σε δωρεάν κλειδί", "")), "🔴 ψευδής ισχυρισμός για δεδομένα δωρεάν κλειδιού (ΕΟΧ)");
  ok(know.includes("Η διαφορά είναι η ΣΤΑΘΕΡΟΤΗΤΑ, όχι το απόρρητο."), "κανόνας ΕΟΧ");
});
await check("Ν105-3 · 🔴 κόκκινες γραμμές της ιστορίας (Α350): χωρίς ίδρυμα, χωρίς «δεν είναι προγραμματιστής» · τρίτο πρόσωπο", async () => {
  ok(know.includes("45.000 σε 90.000") && know.includes("ΤΡΙΤΟ πρόσωπο"), "ιστορία");
  ok(!/προγραμματιστ/i.test(know), "«προγραμματιστής» στη γνώση");
  ok(know.includes("🔴 ΠΟΤΕ: το όνομα του ιδρύματος"), "απαγόρευση ονόματος ιδρύματος");
});
await check("Ν105-4 · ο builder βάζει πακέτο + «Κάλεσε» και ΣΤΑΜΑΤΑ αν λείψει το FastWrite/η επιβράβευση από την οθόνη", async () => {
  ok(build.includes("out += ['', rd('tools/agent/pakketo_el.md').strip()]"), "πακέτο");
  ok(build.includes("raise SystemExit('Κάλεσε: δεν βρέθηκε η ενότητα FastWrite") && build.includes("raise SystemExit('Κάλεσε: δεν βρέθηκε η επιβράβευση"), "φρένα");
  ok(build.includes("if len(s) > 60000:"), "όριο μεγέθους");
});
await check("Ν105-5 · το v102 μένει: μετά την εγκατάσταση (λογαριασμός + κλειδί) ο Κώστας ΔΕΝ ανοίγει νέα συζήτηση", async () => {
  ok(src.includes("if (!warm && await agentOnboarded(env, inst, dev)) return json({ ok: false, error: \"onboarded\" }, 403);"), "πόρτα v102");
  ok(src.includes("const AGENT_DEV_MAX = 30;"), "όριο ζωής");
});
await check("Ν105-6 · 🔴 απάντηση που κόπηκε στο όριο tokens: φτάνει στον πελάτη ΜΕΧΡΙ την τελευταία ολόκληρη πρόταση · όριο 1000", async () => {
  const C = mod.agentCut;
  ok(C("Πρώτη πρόταση εδώ. Δεύτερη και β", "max_tokens") === "Πρώτη πρόταση εδώ.", "πρόταση");
  ok(C("1. Βήμα ένα\n2. Βήμα δύο\n3. Βήμα τρ", "max_tokens") === "1. Βήμα ένα\n2. Βήμα δύο", "αρίθμηση");
  ok(C("Ολόκληρη απάντηση χωρίς τελεία", "end_turn") === "Ολόκληρη απάντηση χωρίς τελεία", "κανονική ΔΕΝ πειράζεται");
  nextResp = { content: [{ type: "text", text: "Γεια.\n\nΤο PRO σχεδιάζεται. Δεν μπορώ να σας δώσω τιμές ούτε ημερομηνί" }], stop_reason: "max_tokens" };
  const r = await chat({ install_id: "km_v105b", text: "τιμή;", consent: true });
  ok(r.j.reply === "Γεια.\n\nΤο PRO σχεδιάζεται.", JSON.stringify(r.j.reply));
  const h = db.prepare("SELECT body FROM km_agent_messages WHERE role = 'assistant' ORDER BY id DESC LIMIT 1").get();
  ok(h && h.body === "Γεια.\n\nΤο PRO σχεδιάζεται.", "ιστορικό: " + JSON.stringify(h));
  ok(calls[calls.length - 1].max_tokens === 1000, "max_tokens = " + calls[calls.length - 1].max_tokens);
});
if (ONLY) { if (failed) { console.log("Μ" + ONLY + " → κοκκίνισε ✔"); process.exit(0); } console.log("Μ" + ONLY + " ΠΕΡΑΣΕ — το τεστ δεν πιάνει τίποτα"); process.exit(1); }
console.log(failed ? "ΑΠΕΤΥΧΑΝ " + failed : "✔ ΟΛΑ ΠΕΡΑΣΑΝ (6)"); process.exit(failed ? 1 : 0);
