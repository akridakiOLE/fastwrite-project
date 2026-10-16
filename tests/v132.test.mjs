// v132 · KM-PGV — έκδοση σελίδων: «Διαγραφή σελίδας» χωρίς φαντάσματα στον server (15/10/2026)
//   node tests/v132.test.mjs  ·  --mutate=N (ΠΡΕΠΕΙ να κοκκινίσει: exit 0 = πιάστηκε)
//   Άκρη-σε-άκρη: npx playwright test tests/v132_pages.spec.js (wrangler dev + KM_REVIEW_CODE)
import { readFileSync } from "node:fs";
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let js = readFileSync("site/kostometro/app.js", "utf8");
const MUT = [
  // 1 · 🔴 οι φωτογραφίες ανεβαίνουν ξανά με id = θέση (το σφάλμα της v131)
  ["    var out = [{ id: phId(r, 0), blob: r.blob }];", "    var out = [{ id: r.id, blob: r.blob }];"],
  // 2 · 🔴 η διαγραφή σελίδας δεν ανεβάζει την έκδοση
  ["            r.pgv = Math.max(Date.now(), (r.pgv || 0) + 1); // νέα ids για ΟΛΕΣ τις σελίδες — μοναδικά (χρόνος), όχι απλός μετρητής\n", ""],
  // 3 · 🔴 «-v» αντί «_v»: τυχαίο id τιμολογίου διαβάζεται ως έκδοση
  ["    var v = 0, mv = /^(.*)_v(\\d+)$/.exec(pid);", "    var v = 0, mv = /^(.*)-v(\\d+)$/.exec(pid);"],
  // 4 · 🔴 οι παλιές σβήνονται ΚΑΙ όταν το ανέβασμα των νέων απέτυχε
  ["            if (syncInfo.hard || !isActiveNow()) { return null; }\n            return killPhotos(ids)", "            return killPhotos(ids)"],
  // 5 · 🔴 σβήνονται φωτογραφίες τιμολογίων που δεν υπάρχουν εδώ
  ["      return r && q.v !== (r.pgv || 0);", "      return !r || q.v !== (r.pgv || 0);"],
  // 6 · 🔴 ο κάδος σβήνει θέση με βάση ΠΑΛΙΑ καταχώρηση (πρώτη εμφάνιση)
  ["        if (q.v !== (fresh.pgv || 0)) { return; }          // v132: παλιά έκδοση — η θέση κρατά ΑΛΛΗ σελίδα\n", ""],
  // 7 · 🔴 φωτογραφία παλιάς έκδοσης γράφεται πάνω σε νέα διάταξη
  ["            if ((fresh.pgv || 0) !== ver) { throw new Error('οι σελίδες άλλαξαν στο μεταξύ'); }\n", ""],
  // 8 · 🔴 ΠΑΛΙΟΤΕΡΗ έκδοση του server σβήνει νεότερη τοπική (που δεν έχει ανέβει)
  ["            if ((m.pgv || 0) > (cur.pgv || 0)) {", "            if ((m.pgv || 0) !== (cur.pgv || 0)) {"],
  // 9 · 🔴 η έκδοση δεν ταξιδεύει με τα στοιχεία
  ["             pages: 1 + ((r.pages && r.pages.length) || 0),\n             pgv: r.pgv || 0 };", "             pages: 1 + ((r.pages && r.pages.length) || 0) };"],
  // 10 · 🔴 διαγραφή σελίδας ενώ κάποια σελίδα ζει μόνο στον server
  ["            if (!pgs.every(function (b) { return !!b; })) { return; }\n", ""],
  // 11 · 🔴 το ευρετήριο του κάδου κρατά τις παλιές θέσεις μετά τη διαγραφή
  ["            pcForget(r.id);\n            put(r)", "            put(r)"],
  // 12 · νέο τιμολόγιο από τον server χωρίς έκδοση
  ["                           pages: [], srvPages: m.pages || 1, pgv: m.pgv || 0 })\n                .then(function () { pullInfo.added++;", "                           pages: [], srvPages: m.pages || 1 })\n                .then(function () { pullInfo.added++;"],
  // 13 · αυτόματο κατέβασμα με id = θέση
  ["          var pid = phId(r, i);\n          if (!keep[pid]) { continue; }", "          var pid = pidOf(r.id, i);\n          if (!keep[pid]) { continue; }"],
  // 14 · 🔴 (HIGH αναθεώρησης) οι παλιές σβήνονται χωρίς η νέα έκδοση να είναι ΟΛΟΚΛΗΡΗ στον server
  ["    return staleOf(rows, have).filter(function (id) { return completeOn(live[pidSplit(id).rec], onSrv); });", "    return staleOf(rows, have);"],
  // 15 · 🔴 στοιχεία ανεβαίνουν ενώ φωτογραφία της νέας έκδοσης απέτυχε (δίκτυο)
  ["            if (syncInfo.hard) { return null; }\n            return pushMeta(", "            return pushMeta("],
  // 16 · 🔴 απλός μετρητής: δύο συσκευές φτιάχνουν τα ΙΔΙΑ ids με άλλο περιεχόμενο
  ["            r.pgv = Math.max(Date.now(), (r.pgv || 0) + 1);", "            r.pgv = (r.pgv || 0) + 1;"],
  // 17 · 🔴 στιγμιότυπο της αρχής: τοπική αλλαγή στο μεταξύ πατιέται από παλιότερη έκδοση
  ["                if ((m.pgv || 0) <= (fresh.pgv || 0)) { return; }   // άλλαξε τοπικά στο μεταξύ — η νεότερη μένει\n", ""],
  // 18 · η περικοπή μένει στη θέση της σβησμένης σελίδας
  ["            if (r.crops) { r.crops.splice(i, 1); }          // η περικοπή φεύγει με τη σελίδα της\n", ""],
  // 19 · τυχαίο «p12345» διαβάζεται ως σελίδα
  ["    var m = /^(\\d+-[a-z0-9]{1,6})-p(\\d+)$/.exec(pid) || (/^\\d+-/.test(pid) ? null : /^(.*)-p(\\d+)$/.exec(pid));", "    var m = /^(.*)-p(\\d+)$/.exec(pid);"],
  // 20 · 🔴 η ΠΑΛΙΑ σειρά: στοιχεία πριν από φωτογραφίες
  ["            if (!isActiveNow()) { return null; }               // 409 στο ανέβασμα: δεν είμαστε η ενεργή\n", "            if (!isActiveNow()) { return null; }\n            if (!window.__v131order) { window.__v131order = 1; }\n"],
  // 21 · 🔴 (N1) μόνιμο 400 σε μία φωτογραφία παγώνει τα στοιχεία όλων
  ["          if (res.status === 400) { syncInfo.msg = 'μία φωτογραφία δεν γίνεται δεκτή (400)'; return step(i + 1); }\n", ""],
  // 22 · 🔴 (N2) αποτυχημένη λίστα = «ο server δεν έχει τίποτα» → ξανανεβαίνουν όλες
  ["            if (!r.ok) { syncInfo.msg = 'σφάλμα λίστας ' + r.status; syncInfo.hard = true; return null; }\n", ""],
  // 23 · 🔴 (N5) inbox (στοιχεία) πριν ανέβουν οι φωτογραφίες
  ["            if (syncInfo.hard) { throw new Error('φωτογραφίες: ' + (syncInfo.msg || 'σφάλμα')); }\n", ""],
  // 24 · προσωρινό σφάλμα φωτογραφίας δεν σταματά τον γύρο
  ["          syncInfo.msg = 'σφάλμα ' + res.status;\n          syncInfo.hard = true;\n", "          syncInfo.msg = 'σφάλμα ' + res.status;\n"],
  // 25 · (R3-1) νέος συγχρονισμός μηδενίζει την αποτυχία ξεφορτώματος που τρέχει
  ["    if (flushBusy) { scheduleSync(1500); return Promise.resolve(); }\n", ""],
];
if (ONLY) { const m = MUT[ONLY - 1]; if (!m) process.exit(2);
  if (!js.includes(m[0])) { console.log("Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(3); }
  js = js.replace(m[0], m[1]); }
let failed = 0;
const check = async (n, f) => { try { await f(); if (!ONLY) console.log("  ✔ " + n); } catch (e) { failed++; console.log("  ✘ " + n + " — " + e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m); };

// Εκτελέσιμα κομμάτια: ΑΥΤΟΥΣΙΕΣ οι συναρτήσεις του app.js (όχι αντίγραφο στο τεστ).
function fn(name) {
  const i = js.indexOf("  function " + name + "(");
  if (i < 0) throw new Error("λείπει η " + name);
  let d = 0, j = js.indexOf("{", i);
  for (let k = j; k < js.length; k++) { if (js[k] === "{") d++; else if (js[k] === "}") { d--; if (d === 0) return js.slice(i, k + 1); } }
  throw new Error("άκλειστη " + name);
}
const calls = [];
const lib = new Function("kmFetch", "kmHead", [fn("pagesOf"), fn("pageCount"), fn("pidOf"), fn("phId"), fn("pidSplit"), fn("photoIds"), fn("metaOf"),
  fn("staleOf"), fn("completeOn"), fn("prunable"), fn("prunePending"), fn("prunePhotos"),
  "return { pidOf, phId, pidSplit, photoIds, metaOf, prunePhotos, prunePending };"].join("\n"))(
  async (u, o) => { calls.push([u, o && o.method]); return { ok: true }; }, () => ({}));

await check("Π-1 · παλιό τιμολόγιο (χωρίς έκδοση) = ΙΔΙΑ ids με τη v131 — τίποτα δεν ξανανεβαίνει", () => {
  const r = { id: "1760000000000-ab12cd", blob: 1, pages: [1, 1] };
  ok(JSON.stringify(lib.photoIds(r).map((x) => x.id)) === JSON.stringify(["1760000000000-ab12cd", "1760000000000-ab12cd-p2", "1760000000000-ab12cd-p3"]), "ids");
});
await check("Π-2 · μετά από αλλαγή σελίδων: ΝΕΑ ids για όλες τις σελίδες (_vN)", () => {
  const r = { id: "1760000000000-ab12cd", blob: 1, pages: [1], pgv: 2 };
  ok(JSON.stringify(lib.photoIds(r).map((x) => x.id)) === JSON.stringify(["1760000000000-ab12cd_v2", "1760000000000-ab12cd-p2_v2"]), JSON.stringify(lib.photoIds(r)));
});
await check("Π-3 · pidSplit: έκδοση + θέση πίσω σωστά · id τιμολογίου που τελειώνει σε «-v12345» ΔΕΝ διαβάζεται ως έκδοση", () => {
  const a = lib.pidSplit("1760000000000-ab12cd-p3_v4"); ok(a.rec === "1760000000000-ab12cd" && a.slot === 2 && a.v === 4, JSON.stringify(a));
  const b = lib.pidSplit("1760000000000-ab12cd"); ok(b.rec === "1760000000000-ab12cd" && b.slot === 0 && b.v === 0, JSON.stringify(b));
  const c = lib.pidSplit("1760000000000-v12345"); ok(c.rec === "1760000000000-v12345" && c.v === 0, "τυχαίο -v12345: " + JSON.stringify(c));
  const d = lib.pidSplit(lib.phId({ id: "1760000000000-v12345", pgv: 7 }, 1)); ok(d.rec === "1760000000000-v12345" && d.slot === 1 && d.v === 7, JSON.stringify(d));
  const e = lib.pidSplit("1760000000000-p12345"); ok(e.rec === "1760000000000-p12345" && e.slot === 0, "τυχαίο -p12345: " + JSON.stringify(e));
  const f = lib.pidSplit("1760000000000-p12345-p2_v1760000000001"); ok(f.rec === "1760000000000-p12345" && f.slot === 1 && f.v === 1760000000001, JSON.stringify(f));
});
await check("Π-4 · τα ids της έκδοσης περνούν τον έλεγχο του server (PHOTO_ID)", () => {
  const src = readFileSync("src/km.js", "utf8"); const re = new RegExp(/const PHOTO_ID = (\/.*\/);/.exec(src)[1].slice(1, -1));
  ok(re.test(lib.phId({ id: "1760000000000-ab12cd", pgv: 12 }, 4)), "PHOTO_ID");
});
await check("Π-5 · η έκδοση ταξιδεύει με τα στοιχεία (metaOf)", () => {
  ok(lib.metaOf({ id: "x", pages: [1], pgv: 3 }).pgv === 3 && lib.metaOf({ id: "x" }).pgv === 0, "pgv");
});
await check("Π-6 · prunePhotos: σβήνει ΜΟΝΟ παλιές εκδόσεις ζωντανών τιμολογίων — ό,τι δεν ξέρουμε μένει", async () => {
  calls.length = 0;
  const rows = [{ id: "A", pgv: 1, blob: 1, pages: [1] }, { id: "B", blob: 1 }, { id: "C", pgv: 5, blob: null, pages: [], srvPages: 2 }];
  const have = ["A", "A-p2", "A-p3", "A_v1", "A-p2_v1", "B", "B-p2", "B_v1", "C", "C-p2", "C_v5", "Z", "Z_v3"];
  ok(lib.prunePending(rows, have) && !lib.prunePending([{ id: "B", blob: 1 }], ["B", "B-p2"]), "prunePending");
  const n = await lib.prunePhotos(rows, have);
  const del = calls.map((c) => decodeURIComponent(c[0].split("id=")[1]));
  ok(calls.every((c) => c[1] === "DELETE"), "DELETE");
  ok(JSON.stringify(del.sort()) === JSON.stringify(["A", "A-p2", "A-p3", "B_v1"].sort()) && n === 4, JSON.stringify(del));
  ok(!del.includes("C") && !del.includes("C-p2"), "🔴 η C (λείπει το C-p2_v5) έχασε το μόνο αντίγραφο");
});
await check("Π-7 · διαγραφή σελίδας: μόνο με όλες τις σελίδες στο κινητό · νέα έκδοση · ξεχνά το ευρετήριο", () => {
  const h = js.slice(js.indexOf("dp.textContent = 'Διαγραφή σελίδας ' + (i + 1);"), js.indexOf("block.appendChild(dp);"));
  ok(h.includes("if (!pgs.every(function (b) { return !!b; })) { return; }"), "φρουρός");
  ok(h.includes("r.pgv = Math.max(Date.now(), (r.pgv || 0) + 1);"), "έκδοση μοναδική (χρόνος)");
  ok(h.includes("if (r.crops) { r.crops.splice(i, 1); }"), "περικοπή");
  ok(h.includes("pcForget(r.id);"), "ευρετήριο");
  ok(h.indexOf("pcForget(r.id);") < h.indexOf("put(r)"), "πριν το put");
});
await check("Π-8 · συγχρονισμός: οι παλιές σβήνονται ΜΕΤΑ το ανέβασμα και ΜΟΝΟ χωρίς σφάλμα", () => {
  const s = js.slice(js.indexOf("  function syncNow()"), js.indexOf("  var pulling = false;"));
  const a = s.indexOf("return pushPhotos(rows, key,"), m = s.indexOf("return pushMeta(rows, key,"), b = s.indexOf("return prunePhotos(rows, (j2.photos");
  ok(a > 0 && m > a && b > m, "σειρά: φωτογραφίες → στοιχεία → σβήσιμο παλιών");
  ok(s.includes("if (syncInfo.hard) { return null; }\n            return pushMeta(") && s.indexOf("if (syncInfo.hard) { return null; }") < m, "στοιχεία ΜΟΝΟ αν δεν υπήρξε προσωρινό σφάλμα φωτογραφίας");
  ok(s.includes("if (!r.ok) { syncInfo.msg = 'σφάλμα λίστας ' + r.status; syncInfo.hard = true; return null; }"), "αποτυχημένη λίστα σταματά τον γύρο");
  const pp = js.slice(js.indexOf("  function pushPhotos("), js.indexOf("  function flushToInbox("));
  ok(pp.includes("if (res.status === 400) { syncInfo.msg = 'μία φωτογραφία δεν γίνεται δεκτή (400)'; return step(i + 1); }") && pp.includes("syncInfo.msg = 'σφάλμα ' + res.status;\n          syncInfo.hard = true;"), "μόνιμο = παράκαμψη · προσωρινό = hard");
  const fl = js.slice(js.indexOf("  function flushToInbox("), js.indexOf("  function maybeFlush("));
  ok(fl.indexOf("return pushPhotos(rows, key, ids);") > 0 && fl.indexOf("return pushPhotos(rows, key, ids);") < fl.indexOf("kmFetch('inbox', { method: 'PUT'") && fl.includes("if (syncInfo.hard) { throw new Error("), "inbox: φωτογραφίες πρώτα");
  ok(s.includes("if (!isActiveNow()) { return null; }") && !s.includes("window.__v131order"), "409 στο ανέβασμα σταματά");
  ok(s.includes("if (syncInfo.hard || !isActiveNow()) { return null; }\n            return killPhotos(ids)"), "σβήσιμο μόνο χωρίς προσωρινό σφάλμα (το 413/400 δεν μπλοκάρει τις ταφόπετρες)");
  ok(s.includes("if (!prunePending(rows, ids.concat(syncInfo.up))) { return null; }"), "2η λίστα μόνο αν κάτι φαίνεται ολόκληρο");
  ok(s.includes("if (flushBusy) { scheduleSync(1500); return Promise.resolve(); }") && s.indexOf("if (flushBusy)") < s.indexOf("syncInfo.hard = false; syncInfo.up = [];"), "όχι συγχρονισμός όσο τρέχει ξεφόρτωμα");
});
await check("Π-9 · κατέβασμα: νεότερη έκδοση στον server αλλάζει τις σελίδες — ΠΟΤΕ παλιότερη", () => {
  const st = js.indexOf("  function pullNow()"); const s = js.slice(st, js.indexOf("\n  function ", st + 10));
  ok(s.includes("if ((m.pgv || 0) > (cur.pgv || 0)) {"), "μόνο νεότερη");
  ok(s.includes("if ((m.pgv || 0) <= (fresh.pgv || 0)) { return; }") && s.includes("fresh.crops = [];"), "ξανά-έλεγχος στη φρέσκια εγγραφή · περικοπές");
  ok(s.includes("pages: [], srvPages: m.pages || 1, pgv: m.pgv || 0 })"), "νέο τιμολόγιο");
  ok(/fresh\.pgv = m\.pgv;\s*fresh\.blob = null;\s*fresh\.pages = \[\];\s*fresh\.crops = \[\];\s*fresh\.srvPages = m\.pages \|\| 1;/.test(s), "αλλαγή σελίδων");
});
await check("Π-10 · κάδος (δύο σημεία) και κατέβασμα φωτογραφίας σέβονται την έκδοση", () => {
  ok(js.split("if (q.v !== (fresh.pgv || 0)) { return; }").length === 3, "κάδος ×2");
  ok(js.includes("if ((fresh.pgv || 0) !== ver) { throw new Error('οι σελίδες άλλαξαν στο μεταξύ'); }"), "fetchPhoto");
  ok(!/pidOf\(r\.id, i\)/.test(js.slice(js.indexOf("  function autoPhotoIds"), js.indexOf("  function pullPhotos"))), "χωρίς id = θέση στο αυτόματο σύνολο");
  ok(js.includes("          var pid = phId(r, i);\n          if (!keep[pid]) { continue; }"), "pullPhotos");
});
await check("Π-11 · έκδοση v132 σε APP_VER, SHELL cache και version.json", () => {
  ok(js.includes("var APP_VER = 'φέτα 3 · v132';"), "APP_VER");
  ok(readFileSync("site/kostometro/sw.js", "utf8").includes("var CACHE = 'km-v132';"), "sw");
  ok(JSON.parse(readFileSync("site/kostometro/version.json", "utf8")).v === "v132", "version.json");
});

if (ONLY) { console.log(failed ? "Μ" + ONLY + " ΠΙΑΣΤΗΚΕ" : "Μ" + ONLY + " ΔΕΝ ΠΙΑΣΤΗΚΕ"); process.exit(failed ? 0 : 1); }
console.log(failed ? "✘ ΑΠΕΤΥΧΑΝ " + failed : "✔ ΟΛΑ ΠΕΡΑΣΑΝ");
process.exit(failed ? 1 : 0);
