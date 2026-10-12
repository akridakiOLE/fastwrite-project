// KM-PRO-F2 · βιβλίο τιμών — τρέχει ΠΡΑΓΜΑΤΙΚΑ τον κώδικα του app.js με δοκιμαστικά τιμολόγια
//   node tests/pro_f2.test.mjs            node tests/pro_f2.test.mjs --mutate=N  (exit 0 = πιάστηκε)
import { readFileSync } from "node:fs";
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let js = readFileSync("site/kostometro/app.js", "utf8");
let html = readFileSync("site/kostometro/index.html", "utf8");
let km = readFileSync("src/km.js", "utf8");
const toml = readFileSync("wrangler.toml", "utf8");
const MUT = [
  // Μ1 · 🔴 μέσος όρος ΧΩΡΙΣ στάθμιση με την ποσότητα
  ["js", "var q = (ln.qty || 1) * ln.pack.per;", "var q = 1;"],
  // Μ2 · 🔴 «ίδιο» χωρίς πάτημα: κάθε κωδικός με ίδια περιγραφή ενώνεται σιωπηλά
  ["js", "return s + '|' + (ln.code ? 'c:' + norm(ln.code) : 'd:' + norm(ln.desc || ''));", "return 'd:' + norm(ln.desc || '');"],
  // Μ3 · 🔴 η αλλαγή αντιστοίχισης ΔΕΝ καταγράφεται
  ["js", "    bookSave('link', key, was, pid);", "    bookSave(null);"],
  // Μ4 · 🔴 το βιβλίο δεν ταξιδεύει στον φάκελο
  ["js", "gone: goneRead(), book: bookForPush() })", "gone: goneRead() })"],
  // Μ5 · 🔴 παλιό βιβλίο από τον server πατάει νεότερο τοπικό
  ["js", "if ((remote.ver || 0) > (b.ver || 0)) {", "if (true) {"],
  // Μ6 · η γραμμή «📊 Τιμές» φαίνεται και σε Free
  ["js", "if (el('m-prices-row')) { el('m-prices-row').hidden = !proOn(); }", "if (el('m-prices-row')) { el('m-prices-row').hidden = false; }"],
  // Μ7 · 🔴 «φθηνότερα αλλού» συγκρίνει και με τον ΙΔΙΟ προμηθευτή
  ["js", "      if (s === r.supplier) { return; }\n      var x = g.sups[s];", "      var x = g.sups[s];"],
  // Μ8 · 🔴 «1,5L × 6» γίνεται 6 τεμάχια αντί για 9 λίτρα
  ["js", "    if (!m) { return { per: n, base: 'pc' }; }\n    var v", "    return { per: n, base: 'pc' };\n    var v"],
  // Μ9 · 🔴 (το σφάλμα της 12/10) δύο συναρτήσεις με το ΙΔΙΟ όνομα — η δεύτερη σκεπάζει την πρώτη
  ["js", "  function pidOf(recId, slot) {", "  function bookPid(recId, slot) {"],
  // Μ10 · 🔴 η πόρτα δοκιμών ανοίγει και ΧΩΡΙΣ τη μεταβλητή του staging (= και στην παραγωγή)
  ["km", ' && String(env.STAGING_LOGIN || "") === "1") return stagingLogin', ") return stagingLogin"],
  // Μ11 · 🔴 ο σύνδεσμος δοκιμών ξαναχρησιμοποιείται (διαβάζεται χωρίς να σβηστεί)
  ["km", "DELETE FROM km_oauth_states WHERE state_hash = ? AND provider LIKE 'test:%' RETURNING *", "SELECT * FROM km_oauth_states WHERE state_hash = ? AND provider LIKE 'test:%'"],
  // Μ12 · 🔴 PRO βλέπει ξανά «κλειδί Gemini ή Παράλειψη»
  ["js", "!localStorage.getItem(LS.skip) && !proOn(); }", "!localStorage.getItem(LS.skip); }"],
  // Μ13 · 🔴 η εκκίνηση αποφασίζει για την οθόνη κλειδιού ΠΡΙΝ μάθει αν είναι PRO
  ["js", "    proP.then(function () {   /* KM-PRO-NOKEY */\n      if (needKeyScreen())", "    (function (f) { f(); })(function () {\n      if (needKeyScreen())"],
  // Μ14 · 🔴 αβέβαιη συσκευασία → σιωπή (ούτε τιμή ούτε ερώτηση)
  ["js", "    if (ln.pack && ln.pack.per > 0) {\n      return '<span class=\"pro-ask\">", "    if (ln.pack && ln.pack.per > 0) {\n      return ''; return '<span class=\"pro-ask\">"],
];
if (ONLY !== null) {
  const m = MUT[ONLY - 1]; const bag = { js, html, km };
  if (!m || !bag[m[0]].includes(m[1])) { console.log("Η ΜΕΤΑΛΛΑΞΗ Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(1); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ js, html, km } = bag);
}
let pass = 0, fail = 0;
// κατάρρευση = ο κώδικας έσπασε: σε --mutate ΜΕΤΡΑΕΙ ως «πιάστηκε», κανονικά ως αποτυχία
const crash = (e) => { console.log("  ✘ ΚΑΤΑΡΡΕΥΣΗ: " + (e && e.message)); process.exit(ONLY !== null ? 0 : 1); };
process.on("uncaughtException", crash); process.on("unhandledRejection", crash);
const ok = (c, m) => { if (c) { pass++; console.log("  ✔ " + m); } else { fail++; console.log("  ✘ " + m); } };

// ── εξαγωγή του μπλοκ του βιβλίου + βοηθών, με ψεύτικο περιβάλλον ──
const a = js.indexOf("  var BOOK = null, PIDX = null;"), b = js.indexOf("  /* ── φύλλο γραμμής");
const normSrc = js.slice(js.indexOf("  function norm(s) {"), js.indexOf("  function num(v) {"));
const numSrc = js.slice(js.indexOf("  function num(v) {"), js.indexOf("\n  }\n", js.indexOf("  function num(v) {")) + 4);
const pfc = js.slice(js.indexOf("  function packFromCount("), js.indexOf("  function escH(t) {"));
const escSrc = js.slice(js.indexOf("  function escH(t) {"), js.indexOf("\n", js.indexOf("  function escH(t) {")) + 1);
const store = {};
const env = new Function("localStorage", "isPending", "dateOf", "dstr", "PRO_BASE", "LS",
  "var pulling = false;" + normSrc + numSrc + pfc + escSrc + js.slice(a, b) +
  "\nreturn { bookRead, bookSave, bookMerge, bookForPush, itemKey, bookPid, bookLink, bookUnlink, bookSetPack, bookApplyPack, priceIndex, priceSignalHtml: function(r,ln,ix){ PIDX = ix; return priceSignalHtml(r,ln); }, packFromCount, prodName, reset: function(){ BOOK = null; } };");
const E = env({ getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } },
  (r) => r.total === null, (r) => r.invDate || r.ts, (t) => new Date(t).toISOString().slice(0, 10),
  { kg: "€/κιλό", L: "€/λίτρο", pc: "€/τεμ." }, { book: "km_book" });

const L = (code, desc, qty, up, per, base) => ({ code, desc, qty, unit_price: up, base_price: Math.round(up / per * 10000) / 10000, pack: { per, base } });
const d = (s) => Date.parse(s + "T12:00:00");
const rows = [
  { id: 1, supplier: "Α ΛΤΔ", total: 10, invDate: d("2026-09-01"), lines: [L("K1", "ΓΑΛΑ 1LT", 10, 1.50, 1, "L")] },
  { id: 2, supplier: "Α ΛΤΔ", total: 10, invDate: d("2026-10-01"), lines: [L("K1", "ΓΑΛΑ 1LT", 30, 1.60, 1, "L")] },
  { id: 3, supplier: "Β ΛΤΔ", total: 10, invDate: d("2026-10-03"), lines: [L("G-77", "ΓΑΛΑ ΦΡΕΣΚΟ 6x1LT", 2, 8.70, 6, "L")] },
];
// χωρίς αντιστοίχιση: δύο ΧΩΡΙΣΤΑ προϊόντα
let ix = E.priceIndex(rows);
ok(Object.keys(ix).length === 2, "χωρίς «ίδιο με»: δύο χωριστά προϊόντα (ποτέ σιωπηλή ένωση)");
const kA = E.itemKey("Α ΛΤΔ", { code: "K1" }), kB = E.itemKey("Β ΛΤΔ", { code: "G-77" });
// σταθμισμένος μέσος όρος στον Α: (10×1,50 + 30×1,60)/40 = 1,575
ok(Math.abs(ix[kA].avg - 1.575) < 1e-9, "μέσος όρος ΣΤΑΘΜΙΣΜΕΝΟΣ με την ποσότητα (1,575)");
ok(ix[kA].sups["Α ΛΤΔ"].last === 1.6, "τελευταία τιμή = η νεότερη αγορά (1,60)");
// «είναι ίδιο με»
const pid = E.bookLink("Β ΛΤΔ", { code: "G-77", desc: "ΓΑΛΑ ΦΡΕΣΚΟ 6x1LT" }, kA);
ok(/^P[0-9A-Z]+$/.test(pid), "ο κοινός κωδικός τον ΔΙΝΕΙ το σύστημα (" + pid + ")");
ok(E.bookPid(kA) === pid && E.bookPid(kB) === pid, "και οι δύο κωδικοί προμηθευτή → ίδιο κεντρικό προϊόν");
ix = E.priceIndex(rows);
ok(Object.keys(ix).length === 1 && Object.keys(ix[pid].sups).length === 2, "ένα προϊόν, δύο προμηθευτές");
ok(Math.abs(ix[pid].sups["Β ΛΤΔ"].last - 1.45) < 1e-9, "τιμή μονάδας Β: 8,70 / 6 λτ = 1,45 €/λτ");
// σήμα στην παραλαβή: Α ξανά στα 1,72
const sig = E.priceSignalHtml({ supplier: "Α ΛΤΔ" }, L("K1", "ΓΑΛΑ 1LT", 10, 1.72, 1, "L"), ix);
ok(/🔺 \+7,5%/.test(sig), "σήμα: 🔺 +7,5% από την τελευταία του ΙΔΙΟΥ προμηθευτή");
ok(/Φθηνότερα: 1,45 .* από Β ΛΤΔ/.test(sig), "σήμα: «Φθηνότερα: 1,45 από Β ΛΤΔ»");
const sig2 = E.priceSignalHtml({ supplier: "Β ΛΤΔ" }, L("G-77", "ΓΑΛΑ ΦΡΕΣΚΟ 6x1LT", 1, 8.70, 6, "L"), ix);
ok(!/Φθηνότερα/.test(sig2), "ο φθηνότερος δεν βλέπει «φθηνότερα» για τον εαυτό του");
// 🔴 ίδια περιγραφή, ΑΛΛΟΣ προμηθευτής → ΔΕΝ ενώνεται χωρίς πάτημα
const ix2 = E.priceIndex([
  { id: 9, supplier: "Δ ΛΤΔ", total: 1, invDate: d("2026-10-01"), lines: [L("Z1", "ΓΑΛΑ 1LT", 1, 1.4, 1, "L")] },
  { id: 8, supplier: "Ε ΛΤΔ", total: 1, invDate: d("2026-10-01"), lines: [L("Z1", "ΓΑΛΑ 1LT", 1, 1.3, 1, "L")] }]);
ok(Object.keys(ix2).length === 2, "🔴 ίδια περιγραφή + ίδιος κωδικός σε ΑΛΛΟΝ προμηθευτή → χωριστά ως το «ίδιο με»");
// 🔴 «φθηνότερα αλλού» = ΑΛΛΟΣ προμηθευτής, ποτέ ο ίδιος
const pid3 = E.bookLink("Θ ΛΤΔ", { code: "T2", desc: "ΑΛΕΥΡΙ" }, E.itemKey("Η ΛΤΔ", { code: "T1" }));
const ix3 = E.priceIndex([
  { id: 21, supplier: "Η ΛΤΔ", total: 1, invDate: d("2026-10-01"), lines: [L("T1", "ΑΛΕΥΡΙ", 1, 1.60, 1, "kg")] },
  { id: 22, supplier: "Θ ΛΤΔ", total: 1, invDate: d("2026-10-02"), lines: [L("T2", "ΑΛΕΥΡΙ", 1, 1.65, 1, "kg")] }]);
const sig3 = E.priceSignalHtml({ supplier: "Η ΛΤΔ" }, L("T1", "ΑΛΕΥΡΙ", 1, 1.72, 1, "kg"), ix3);
ok(/από Θ ΛΤΔ/.test(sig3) && !/από Η ΛΤΔ/.test(sig3), "🔴 «φθηνότερα» δείχνει ΑΛΛΟΝ προμηθευτή, ποτέ τον ίδιο");
// ίχνος
const book = E.bookRead();
ok(book.log.some((x) => x.kind === "link" && x.item === kB && x.to === pid), "🔴 η αντιστοίχιση γράφτηκε στο ίχνος (ποιος/πότε/από-σε)");
E.bookUnlink(kB);
ok(E.bookPid(kB) === kB && book.log.some((x) => x.kind === "unlink" && x.from === pid), "«βγάλ' το»: επιστρέφει μόνο του + ίχνος");
// συσκευασία μία φορά
E.bookSetPack("Γ", { code: "W1", desc: "ΝΕΡΟ 1,5L" }, E.packFromCount("ΝΕΡΟ 1,5L", 6));
const w = { code: "W1", desc: "ΝΕΡΟ 1,5L", unit_price: 2.7, disc_pct: null, pack: null, base_price: null };
E.bookApplyPack("Γ", w);
ok(w.pack && w.pack.per === 9 && w.pack.base === "L" && w.base_price === 0.3, "📦 «1,5L» × 6 = 9 λίτρα · 2,70 € → 0,30 €/λτ, αυτόματα την επόμενη φορά");
// συγχρονισμός
const before = E.bookRead().ver;
E.bookMerge({ v: 1, ver: before - 1000, prods: {}, items: {}, log: [] });
ok(E.bookRead().ver === before, "🔴 παλιό βιβλίο από τον server ΔΕΝ πατάει νεότερο τοπικό");
E.bookMerge({ v: 1, ver: before + 1000, prods: { X: { name: "x" } }, items: {}, log: [] });
ok(E.bookRead().prods.X, "νεότερο βιβλίο από τον server κερδίζει");
ok(js.includes("gone: goneRead(), book: bookForPush() })"), "🔴 το βιβλίο ταξιδεύει στον σφραγισμένο φάκελο");
ok(js.includes("        bookMerge(folder.book);   /* KM-PRO-F2 */"), "το βιβλίο έρχεται με το κατέβασμα");
// οθόνη
ok(html.includes('<section id="s-prices"') && html.includes('id="m-prices-row" hidden'), "«📊 Τιμές»: οθόνη + γραμμή μενού κρυφή εξ αρχής");
ok(js.includes("if (el('m-prices-row')) { el('m-prices-row').hidden = !proOn(); }"), "«📊 Τιμές» μόνο σε PRO");
ok(/SCREENS\.push\('s-prices'\)/.test(js), "s-prices στη SCREENS");

// 🔴 ΟΛΟ το app.js: καμία συνάρτηση με διπλό όνομα (η 2η σκεπάζει σιωπηλά την 1η — έτσι χάλασε το «ίδιο με» 12/10)
const fnames = [...js.matchAll(/^  function ([A-Za-z0-9_$]+)\(/gm)].map((m) => m[1]);
const dup = fnames.filter((n, i) => fnames.indexOf(n) !== i);
ok(!dup.length, "🔴 καμία διπλή δήλωση συνάρτησης στο app.js" + (dup.length ? " — ΔΙΠΛΕΣ: " + dup.join(", ") : ""));
// 🔴 πόρτα δοκιμών: υπάρχει ΜΟΝΟ στο staging, μία χρήση
ok(km.includes('path === "/api/km/auth/test/callback" && method === "GET" && String(env.STAGING_LOGIN || "") === "1") return stagingLogin'), "🔴 πόρτα δοκιμών μόνο με STAGING_LOGIN=1");
ok(km.includes("DELETE FROM km_oauth_states WHERE state_hash = ? AND provider LIKE 'test:%' RETURNING *"), "🔴 ο σύνδεσμος δοκιμών σβήνεται τη στιγμή που χρησιμοποιείται");
const stg = toml.indexOf("[env.staging]");
ok(stg > 0 && toml.indexOf("STAGING_LOGIN") > stg && toml.lastIndexOf("STAGING_LOGIN") === toml.indexOf("STAGING_LOGIN"), "🔴 STAGING_LOGIN γραμμένο ΜΟΝΟ μέσα στο [env.staging]");
ok(toml.indexOf("KM_PUBLIC_ORIGIN") > stg, "η επιστροφή σύνδεσης του staging μένει στο staging (όχι στο fastwrite.tech)");
// 🔴 PRO: ποτέ οθόνη κλειδιού Gemini (Κώστας AI ενσωματωμένος — Stavros 12/10)
ok(/function needKeyScreen\(\) \{ return !localStorage\.getItem\(LS\.key\) && !localStorage\.getItem\(LS\.skip\) && !proOn\(\); \}/.test(js), "🔴 PRO δεν βλέπει την οθόνη «κλειδί Gemini»");
ok((js.match(/show\('s-key'\)/g) || []).length === (js.match(/if \(needKeyScreen\(\)\) \{ return show\('s-key'\); \}/g) || []).length, "🔴 ΚΑΘΕ δρόμος προς την οθόνη κλειδιού περνά από τον έλεγχο PRO");
ok(js.includes("    proP.then(function () {   /* KM-PRO-NOKEY */\n      if (needKeyScreen())"), "🔴 η εκκίνηση περιμένει την απάντηση PRO (έως 2,5″) πριν δείξει την οθόνη κλειδιού");
// v194 · γραμμή: τιμή μονάδας 3 δεκαδικά · αβέβαιη συσκευασία = ερώτηση
{ const a2 = js.indexOf("  var PRO_PER = {"), b2 = js.indexOf("  function proConfirm(r) {");
  const U = new Function("num", "escH", "PRO_BASE", js.slice(a2, b2) + "\nreturn proUnitTxt;")(
    (v) => String(v).replace(".", ","), (x) => String(x), { L: "€/λίτρο", kg: "€/κιλό", pc: "€/τεμ." });
  ok(/1,273 €\/λίτρο/.test(U({ base_price: 1.2727, pack: { per: 7.92, base: "L", sure: true } })), "τιμή μονάδας με 3 δεκαδικά (1,273 όχι 1,2727)");
  ok(/📦 1 εξάδ\. = 9 λτ;/.test(U({ base_price: null, unit: "εξάδ.", pack: { per: 9, base: "L", sure: false } })), "🔴 αβέβαιη συσκευασία → «1 εξάδ. = 9 λτ;» (ποτέ σιωπή)");
  ok(/πόσα έχει 1 κιβ\.;/.test(U({ base_price: null, unit: "κιβ.", pack: null })), "άγνωστη συσκευασία → «πόσα έχει 1 κιβ.;»"); }
ok(js.includes("(proOn() ? 'τον Κώστα AI' : 'το Gemini')"), "στο PRO γράφει «Διαβάστηκαν από τον Κώστα AI», όχι Gemini");
console.log("\n" + pass + " ✔ · " + fail + " ✘");
if (ONLY !== null) process.exit(fail ? 0 : 1);
process.exit(fail ? 1 : 0);
