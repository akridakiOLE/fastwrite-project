// v89 — «ΕΝΗΜΕΡΩΘΗΚΕ · vNN» ΣΤΗΝ ΚΑΜΕΡΑ (πρόταση Stavros 25/9/2026)
//   node tests/v89.test.mjs  ·  --mutate=N (ΠΡΕΠΕΙ να κοκκινίσει)
// Μετράει τη ΛΟΓΙΚΗ (πότε βγαίνει, πότε όχι) με ψεύτικο localStorage και ψεύτικα στοιχεία οθόνης.
// ⚠ Δεν αποδεικνύει εμφάνιση σε πραγματικό κινητό — αυτό το βλέπει ο Stavros στην πρώτη ενημέρωση.
import { readFileSync } from "node:fs";
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let js = readFileSync("site/kostometro/app.js", "utf8");
let html = readFileSync("site/kostometro/index.html", "utf8");
let css = readFileSync("site/kostometro/app.css", "utf8");
const MUT = [
  // 1 · 🔴 βγαίνει και στην πρώτη εγκατάσταση
  ["js", "    if (!seen && !existing) { return false; }\n", ""],
  // 2 · βγαίνει σε ΚΑΘΕ άνοιγμα (δεν γράφεται η έκδοση που είδε)
  ["js", "      localStorage.setItem(LS.seenVer, cur);\n    } catch (e) { return; }", "    } catch (e) { return; }"],
  // 3 · δεν φεύγει ποτέ μόνο του
  ["js", "      setTimeout(hide, UPD_MS);", ""],
  // 4 · δεν δένεται στην κάμερα
  ["js", "    if (id === 's-cam')   { updToast(); }\n", ""],
  // 5 · 🔴 το σημάδι πρώτης εγκατάστασης φεύγει → ο νέος χρήστης το βλέπει στην πρώτη φωτογραφία
  ["js", "      localStorage.setItem(LS.seenVer, shortVer(APP_VER));\n    }\n  } catch (e) {}", "    }\n  } catch (e) {}"],
  // 6 · η γραμμή «τι νέο» δεν διαβάζεται
  ["js", "srvNote = (j && typeof j.note === 'string') ? j.note.slice(0, 90) : '';", "srvNote = '';"],
  // 7 · v90 · το ✕ δεν κλείνει
  ["js", "if (x) { x.onclick = function (e) { e.stopPropagation(); hide(); }; }", ""],
  // 8 · v90 · το λάθος κείμενο επιστρέφει στο «Τι έρχεται»
  ["html", "Κανείς δεν το πληκτρολογεί ξανά", "Κανείς δεν το ξαναπληκτρολογεί"],
];
if (ONLY) {
  const m = MUT[ONLY - 1]; if (!m) process.exit(2);
  const bag = { js, html, css };
  if (!bag[m[0]].includes(m[1])) { console.log("Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(3); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ js, html, css } = bag);
}
const slice = (a, b) => { const i = js.indexOf(a), j = js.indexOf(b, i); if (i < 0 || j < 0) throw new Error("λείπει: " + a); return js.slice(i, j); };

// Μικρός κόσμος: localStorage, στοιχεία, χρονόμετρα που τρέχουμε με το χέρι.
function world(ls, verJson) {
  const store = Object.assign({}, ls);
  const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const nodes = {}; const mk = (id) => (nodes[id] = { id, hidden: true, textContent: "", onclick: null, cls: new Set(),
    classList: { add(c) { nodes[id].cls.add(c); }, remove(c) { nodes[id].cls.delete(c); } } });
  ["upd-toast", "upd-ver", "upd-note", "upd-x"].forEach(mk);
  const timers = []; const setTimeout = (f, ms) => timers.push({ f, ms });
  const fetch = async () => ({ ok: true, json: async () => verJson });
  const LS = { seenVer: "km_seen_ver", reg: "km_registered", folder: "km_folder" };
  const src = "var LS = arguments[0], localStorage = arguments[1], setTimeout = arguments[2], fetch = arguments[3], el = arguments[4], requestAnimationFrame = function (f) { f(); };\n" +
    slice("  var APP_VER =", "  function aiModels()") + "\n" +
    "  var srvVer = null, srvNote = '';\n" +
    slice("  function shortVer(", "  function checkVersion(") +
    "\n return { updToast: updToast };";
  const api = new Function(src)(LS, localStorage, setTimeout, fetch, (id) => nodes[id]);
  return { api, store, nodes, timers, flush: async () => { for (let i = 0; i < 5; i++) await new Promise((r) => globalThis.setTimeout(r, 0)); } };
}
const VER = JSON.parse(readFileSync("site/kostometro/version.json", "utf8"));
let fails = 0;
const check = async (n, f) => { try { await f(); if (!ONLY) console.log("  ✔ " + n); } catch (e) { fails++; console.log("  ✘ " + n + " — " + e.message); } };

await check("Ν89-1 · 🔴 πρώτη εγκατάσταση: ΚΑΜΙΑ ένδειξη, ούτε όταν ο φάκελος γεννηθεί πριν την κάμερα", async () => {
  const w = world({}, VER);                                  // καθαρή συσκευή: η φόρτωση σημαδεύει
  w.store.km_folder = "f"; w.store.km_registered = "1";      // η εγγραφή ολοκληρώνεται
  w.api.updToast(); await w.flush();
  if (!w.nodes["upd-toast"].hidden) throw new Error("βγήκε σε νέο χρήστη");
});
await check("Ν89-2 · αναβάθμιση από v88 (χωρίς σημάδι, με λογαριασμό) → «Ενημερώθηκε · v89» + τι νέο", async () => {
  const w = world({ km_folder: "f", km_registered: "1" }, VER);
  w.api.updToast(); await w.flush();
  if (w.nodes["upd-toast"].hidden) throw new Error("δεν βγήκε");
  if (w.nodes["upd-ver"].textContent !== "Ενημερώθηκε · " + VER.v) throw new Error(w.nodes["upd-ver"].textContent);
  if (!VER.note || w.nodes["upd-note"].textContent !== VER.note || w.nodes["upd-note"].hidden) throw new Error("λείπει το «τι νέο»");
});
await check("Ν89-3 · αναβάθμιση από παλιότερο σημάδι (v88 → v89) → βγαίνει", async () => {
  const w = world({ km_folder: "f", km_seen_ver: "v88" }, VER);
  w.api.updToast(); await w.flush();
  if (w.nodes["upd-toast"].hidden) throw new Error("δεν βγήκε");
});
await check("Ν89-4 · ΜΙΑ φορά ανά έκδοση: δεύτερο άνοιγμα, τίποτα", async () => {
  const w = world({ km_folder: "f", km_seen_ver: "v88" }, VER);
  w.api.updToast(); await w.flush();
  const w2 = world(w.store, VER); w2.api.updToast(); await w2.flush();
  if (!w2.nodes["upd-toast"].hidden) throw new Error("ξαναβγήκε");
});
await check("Ν89-5 · φεύγει μόνο του σε 7″ (v90· όχι 3″ — δεν προλάβαινε να διαβαστεί)", async () => {
  const w = world({ km_folder: "f", km_seen_ver: "v88" }, VER);
  w.api.updToast(); await w.flush();
  const t = w.timers.find((x) => x.ms === 7000); if (!t) throw new Error("χωρίς χρονόμετρο 7″");
  t.f(); if (w.nodes["upd-toast"].cls.has("on")) throw new Error("έμεινε");
});
await check("Ν89-6 · χωρίς «τι νέο» στο version.json → σκέτο «Ενημερώθηκε · vNN»", async () => {
  const w = world({ km_folder: "f", km_seen_ver: "v88" }, { v: VER.v });
  w.api.updToast(); await w.flush();
  if (!w.nodes["upd-note"].hidden) throw new Error("κενή γραμμή φαίνεται");
});
await check("Ν89-8 · δεύτερη ασφάλεια: χωρίς σημάδι ΚΑΙ χωρίς λογαριασμό → τίποτα", async () => {
  const w = world({}, VER); delete w.store.km_seen_ver;      // το σημάδι χάθηκε (π.χ. καθαρισμός αποθήκευσης)
  w.api.updToast(); await w.flush();
  if (!w.nodes["upd-toast"].hidden) throw new Error("βγήκε χωρίς λογαριασμό");
});
await check("Ν89-7 · δεμένο στην κάμερα · στοιχεία στο HTML · δεν κάθεται στο κουμπί λήψης", async () => {
  if (!js.includes("if (id === 's-cam')   { updToast(); }")) throw new Error("δεν καλείται στην κάμερα");
  for (const id of ["upd-toast", "upd-ver", "upd-note", "upd-x"]) if (!html.includes('id="' + id + '"')) throw new Error("#" + id);
  const i = html.indexOf('id="upd-toast"'), c = html.indexOf('class="cam-bottom"');
  if (!(i > 0 && i < c)) throw new Error("λάθος θέση");
  if (!/\.upd-toast\{[^}]*top:/.test(css)) throw new Error("χωρίς θέση πάνω");
});
await check("Ν90-1 · το ✕ κλείνει το μήνυμα αμέσως", async () => {
  const w = world({ km_folder: "f", km_seen_ver: "v88" }, VER);
  w.api.updToast(); await w.flush();
  if (!w.nodes["upd-x"].onclick) throw new Error("το ✕ δεν έχει ενέργεια");
  w.nodes["upd-x"].onclick({ stopPropagation() {} });
  if (w.nodes["upd-toast"].cls.has("on")) throw new Error("δεν έκλεισε");
});
await check("Ν90-2 · «Τι έρχεται»: «πληκτρολογεί ξανά», όχι «ξαναπληκτρολογεί» (διόρθωση Stavros 26/9)", async () => {
  if (html.includes("ξαναπληκτρολογεί")) throw new Error("το λάθος κείμενο υπάρχει ακόμα");
  if (!html.includes("Κανείς δεν το πληκτρολογεί ξανά")) throw new Error("λείπει η σωστή φράση");
});
if (ONLY) { if (fails) { console.log("Μ" + ONLY + ": κοκκίνισε ✓"); process.exit(0); } console.log("Μ" + ONLY + ": ΠΕΡΑΣΕ ΠΡΑΣΙΝΟ"); process.exit(1); }
if (fails) { console.log("\n" + fails + " ΑΠΕΤΥΧΑΝ"); process.exit(1); }
console.log("\n✔ ΟΛΑ ΠΕΡΑΣΑΝ (10)");
