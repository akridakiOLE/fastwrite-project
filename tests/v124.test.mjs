// v124 · KM-V124-ORDER — ΜΙΑ ΣΕΙΡΑ, ΠΑΝΤΑ ΙΔΙΑ, Android + iPhone (εύρημα Stavros 10/10/2026)
//   Messenger → «Άνοιξε στον Chrome/Safari» (χωρίς Κώστα) · browser κινητού → ΒΗΜΑ 1
//   εγκατάσταση, ΧΩΡΙΣ «Ξεκινάω τώρα» · εικονίδιο → ΒΗΜΑ 2 «Ξεκινάω τώρα».
//   node tests/v124.test.mjs
//   node tests/v124.test.mjs --mutate=N   (exit 0 = η μετάλλαξη ΠΙΑΣΤΗΚΕ)
import { readFileSync } from "node:fs";
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let js = readFileSync("site/kostometro/app.js", "utf8");
let html = readFileSync("site/kostometro/index.html", "utf8");
let css = readFileSync("site/kostometro/app.css", "utf8");
const MUT = [
  // Μ1 · 🔴 ξαναβγαίνει το «Ξεκινάω τώρα» στον browser (εγγραφή πριν την εγκατάσταση)
  ["js", "      if (instNeedFirst()) { return show('s-step1'); }   /* v124 · KM-V124-ORDER — στον browser ΔΕΝ υπάρχει «Ξεκινάω τώρα» */\n", ""],
  // Μ2 · 🔴 το βήμα 1 εφαρμόζεται και ΜΕΣΑ στην εγκατεστημένη εφαρμογή (ατέρμονο: εικονίδιο → «εγκατάστησέ το»)
  ["js", "    return instPlatform() !== 'other' && !instStandalone() && !iabName() && !localStorage.getItem(LS.reg);",
         "    return instPlatform() !== 'other' && !iabName() && !localStorage.getItem(LS.reg);"],
  // Μ3 · 🔴 οι παλιοί δοκιμαστές με λογαριασμό στον browser κλειδώνονται έξω από τα δεδομένα τους
  ["js", " && !iabName() && !localStorage.getItem(LS.reg);", " && !iabName();"],
  // Μ4 · ξαναμπαίνει η αναμονή 4″ (η κάρτα αργεί και αλλάζει μορφή)
  ["js", "       αν ο Chrome στείλει αργότερα το beforeinstallprompt, απλώς προστίθεται το κουμπί. */\n",
         "       αν ο Chrome στείλει αργότερα το beforeinstallprompt, απλώς προστίθεται το κουμπί. */\n    if (!instDefer && !maybeInstall.waited) { maybeInstall.waited = true; setTimeout(maybeInstall, 4000); return; }\n"],
  // Μ5 · μετά την εγκατάσταση η καρτέλα μένει όπως ήταν (καμία «✓ Εγκαταστάθηκε»)
  ["js", "  window.addEventListener('appinstalled', function () { instClose(); if (el('s-step1') && !el('s-step1').hidden) { step1Render(); } });\n", ""],
  // Μ6 · ο Κώστας ξαναβγαίνει μέσα στο Messenger
  ["css", "body.on-iab .ag-fab{display:none!important}", ""],
  // Μ7 · το «Βήμα 2 από 2» φαίνεται και στον υπολογιστή / browser
  ["js", "    if (t) { t.hidden = !instStandalone(); }", "    if (t) { t.hidden = false; }"],
  // Μ9 · v125 · η κάρτα ξαναμετράει και τη γραμμή διευθύνσεων — το «Βήμα 1 από 2» κόβεται
  ["css", "max-height:calc(100dvh - 116px - env(safe-area-inset-bottom))", "max-height:86vh"],
  // Μ10 · v125 · το κουμπί χάνει το «AI» (απόφαση Stavros 1/10: το AI κολλημένο στο όνομα)
  ["html", "💬 Κώστας AI · βοήθεια", "💬 Κώστας · βοήθεια"],
  // Μ8 · η οθόνη του βήματος 1 εκτός SCREENS — αόρατη για πάντα
  ["js", "  SCREENS.push('s-step1');", "  //SCREENS.push('s-step1');"],
];
if (ONLY !== null) {
  const m = MUT[ONLY - 1]; const bag = { js, html, css };
  if (!m || !bag[m[0]].includes(m[1])) { console.log("Η ΜΕΤΑΛΛΑΞΗ Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(1); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ js, html, css } = bag);
}
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✔ " + m); } else { fail++; console.log("  ✘ " + m); } };
const body = (name) => { const i = js.indexOf("  function " + name + "("); return js.slice(i, js.indexOf("\n  }\n", i) + 4); };

ok(/APP_VER = 'φέτα 3 · v1(2[4-9]|[3-9]\d)'/.test(js), "έκδοση v124 ή νεότερη");
ok(js.includes("KM-V124-ORDER") && html.includes("KM-V124-ORDER") && css.includes("KM-V124-ORDER"), "ο δείκτης v124 σε js/html/css");

// ΣΥΜΠΕΡΙΦΟΡΑ: προσομοίωση του boot για νέο χρήστη σε 6 περιβάλλοντα
const need = body("instNeedFirst");
const fn = new Function("instPlatform", "instStandalone", "iabName", "localStorage", "LS", need + "\nreturn instNeedFirst();");
const LS = { reg: "km_reg" };
const st = (o) => ({ getItem: (k) => (o[k] || null) });
const R = (plat, sa, iab, reg) => fn(() => plat, () => sa, () => iab, st(reg ? { km_reg: "1" } : {}), LS);
ok(R("android", false, "", false) === true, "Chrome Android, νέος → ΒΗΜΑ 1 (όχι «Ξεκινάω τώρα»)");
ok(R("ios", false, "", false) === true, "Safari iPhone, νέος → ΒΗΜΑ 1 (ίδια σειρά με Android)");
ok(R("android", true, "", false) === false, "εγκατεστημένη Android → «Ξεκινάω τώρα»");
ok(R("ios", true, "", false) === false, "εγκατεστημένη iPhone → «Ξεκινάω τώρα»");
ok(R("android", false, "", true) === false, "παλιός δοκιμαστής με λογαριασμό στον browser → δεν κλειδώνεται έξω");
ok(R("other", false, "", false) === false, "υπολογιστής → όπως πριν");

// σειρά μέσα στο boot: Messenger → βήμα 1 → «Ξεκινάω τώρα»
const b = js.slice(js.indexOf("  function boot() {"), js.indexOf("  /* ── Χειριστές ── */"));
const iI = b.indexOf("if (iabName()) { return iabShow(); }"), iS = b.indexOf("if (instNeedFirst()) { return show('s-step1'); }"), iA = b.indexOf("return show('s-acc');");
ok(iI > 0 && iS > iI && iA > iS, "boot: Messenger → βήμα 1 → «Ξεκινάω τώρα», με αυτή τη σειρά");
ok(js.includes("\n  SCREENS.push('s-step1');"), "s-step1 στη SCREENS");

// html: βήμα 1 χωρίς κουμπί λογαριασμού · βήμα 2 στην εγκατεστημένη
const s1 = html.slice(html.indexOf('<section id="s-step1"'), html.indexOf("</section>", html.indexOf('<section id="s-step1"')));
ok(s1.includes("Βήμα 1 από 2") && !/<button/.test(s1), "s-step1: «Βήμα 1 από 2», ΚΑΝΕΝΑ κουμπί (ούτε «Ξεκινάω τώρα»)");
ok(s1.includes('id="st1-done" hidden') && s1.includes("από το εικονίδιο"), "s-step1: «✓ Εγκαταστάθηκε — άνοιξε από το εικονίδιο»");
ok(html.includes('<p class="step-tag" id="acc-step" hidden>Βήμα 2 από 2'), "s-acc: «Βήμα 2 από 2», κρυφό εξ αρχής");
ok(body("accStep").includes("t.hidden = !instStandalone();"), "«Βήμα 2 από 2» μόνο στην εγκατεστημένη");
ok(js.includes("    if (id === 's-acc')   { accStep(); }") && js.includes("    if (id === 's-step1') { step1Render(); }"), "τα hooks στη show()");

// η κάρτα: αμέσως, ίδια πάντα
const mi = body("maybeInstall");
ok(!mi.includes("setTimeout(maybeInstall"), "maybeInstall: καμία αναμονή 4″");
ok(js.includes("window.addEventListener('appinstalled', function () { instClose(); if (el('s-step1') && !el('s-step1').hidden) { step1Render(); } });"), "appinstalled: η καρτέλα γράφει «✓ Εγκαταστάθηκε»");
ok(body("step1Render").includes("!!instRead().done"), "βήμα 1: η κατάσταση από το πραγματικό appinstalled");

ok(html.includes('<p class="step-tag" id="inst-step" hidden>Βήμα 1 από 2') && mi.includes("el('inst-step').hidden = !!localStorage.getItem(LS.reg);"), "κάρτα: «Βήμα 1 από 2» (κρύβεται για παλιούς λογαριασμούς)");

// v125 · KM-V125-FIT + «Κώστας AI»
ok(css.includes("KM-V125-FIT") && /\.inst-card\{max-height:calc\(100vh - 140px\);max-height:calc\(100dvh - /.test(css), "v125: η κάρτα χωράει στο ΟΡΑΤΟ ύψος (dvh)");
ok(js.includes("document.querySelector('#inst .inst-card').scrollTop = 0;"), "v125: η κάρτα ανοίγει από την κορυφή («Βήμα 1 από 2» ορατό)");
ok(html.includes('data-agent="fab" hidden>💬 Κώστας AI · βοήθεια</button>'), "v125: το κουμπί γράφει «Κώστας AI»");

// Messenger: χωρίς Κώστα
ok(js.includes("document.body.classList.toggle('on-iab', id === 's-iab')") && css.includes("body.on-iab .ag-fab{display:none!important}"), "Messenger: ο Κώστας κρυφός");

console.log("\n" + pass + " ✔ · " + fail + " ✘");
if (ONLY !== null) process.exit(fail ? 0 : 1);
process.exit(fail ? 1 : 0);
