// v134 · Η ΑΣΠΡΗ ΟΘΟΝΗ ΤΗΣ ΕΦΑΡΜΟΓΗΣ ΚΑΤΑΣΤΗΜΑΤΟΣ (ατέρμονος κύκλος ανακατεύθυνσης στο κέλυφος Capacitor) — 20/10/2026
//   node tests/v134.test.mjs            · --mutate=N (exit 0 = πιάστηκε)
// Προσομοιώνει τον τοπικό server του Capacitor (WebViewLocalServer.handleLocalRequest, html5mode=true):
//   path === "/"  Ή  το τελευταίο κομμάτι ΔΕΝ έχει "."  →  σερβίρει το ΡΙΖΙΚΟ www/index.html.
import { readFileSync, existsSync } from "node:fs";
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
const WWW = "../kostometro-app/www";
let ROOT = readFileSync(WWW + "/index.html", "utf8");
let APP = readFileSync("site/kostometro/app.js", "utf8");
const VER = readFileSync("site/kostometro/version.json", "utf8");
const SW = readFileSync("site/kostometro/sw.js", "utf8");
const MUT = [
  ["root", "location.replace('/kostometro/index.html'", "location.replace('/kostometro/'"],                 // 1 · ρίζα χωρίς index.html → κύκλος
  ["app", "var KM_HOME = KM_NATIVE ? '/kostometro/index.html' : '/kostometro/';", "var KM_HOME = '/kostometro/';"], // 2 · KM_HOME χωρίς index.html
  ["app", "location.replace(KM_HOME + lu.search + lu.hash)", "location.replace('/kostometro/' + lu.search + lu.hash)"], // 3 · App Link με query → κύκλος
  ["app", "guide.href = (KM_NATIVE ? KM_WEB : '') + '/kostometro/kleidi/'", "guide.href = '/kostometro/kleidi/'"],      // 4 · οδηγός κλειδιού μέσα στο κέλυφος
  ["root", 'content="0;url=/kostometro/index.html"', 'content="0;url=/kostometro/"'],                      // 5 · meta refresh χωρίς index.html
];
if (ONLY) {
  const m = MUT[ONLY - 1]; if (!m) process.exit(2);
  const src = m[0] === "root" ? ROOT : APP;
  if (!src.includes(m[1])) { console.log("Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(3); }
  if (m[0] === "root") ROOT = ROOT.replace(m[1], m[2]); else APP = APP.replace(m[1], m[2]);
}
const results = [];
function ok(name, cond, info) { results.push({ ok: !!cond }); console.log((cond ? "✅" : "❌") + " " + name + (info ? "  — " + info : "")); }

// ── ο server του Capacitor ──
function serve(path) {
  const clean = path.split("?")[0].split("#")[0];
  const last = clean.split("/").filter(Boolean).pop() || "";
  if (clean === "/" || !last.includes(".")) return { file: "/index.html", body: ROOT };
  const f = WWW + clean;
  return existsSync(f) ? { file: clean, body: clean === "/index.html" ? ROOT : readFileSync(f, "utf8") } : { file: null, body: "" };
}
function redirectOf(body) {
  const m = body.match(/location\.replace\('([^']+)'/); const r = body.match(/content="0;url=([^"]+)"/);
  return { js: m ? m[1] : null, meta: r ? r[1] : null };
}
function boot(start, tag) {
  let path = start, seen = [];
  for (let i = 0; i < 6; i++) {
    const s = serve(path); seen.push(path + "→" + s.file);
    if (!s.file) return { ok: false, why: "404 " + path, seen };
    const r = redirectOf(s.body);
    if (s.file !== "/index.html") return { ok: s.body.includes('id="s-iab"'), why: "έφτασε " + s.file, seen };
    const nxt = tag === "meta" ? r.meta : r.js;
    if (!nxt) return { ok: false, why: "ρίζα χωρίς ανακατεύθυνση", seen };
    path = nxt + (tag === "js" && start.includes("?") ? start.slice(start.indexOf("?")) : "");
  }
  return { ok: false, why: "ΚΥΚΛΟΣ", seen };
}
const b1 = boot("/", "js"); ok("Β1 εκκίνηση (script): / → εφαρμογή χωρίς κύκλο", b1.ok, b1.why + " · " + b1.seen.join(" | "));
const b2 = boot("/", "meta"); ok("Β2 εκκίνηση (meta refresh): / → εφαρμογή χωρίς κύκλο", b2.ok, b2.why);

// ── KM_HOME και οι πλοηγήσεις του app.js μέσα στο κέλυφος ──
const homeM = APP.match(/var KM_HOME = KM_NATIVE \? '([^']+)' : '\/kostometro\/';/);
ok("Β3 KM_HOME στο κέλυφος = αρχείο (έχει τελεία)", homeM && serve(homeM[1]).file && serve(homeM[1]).file !== "/index.html", homeM ? homeM[1] : "λείπει");
const appLink = APP.slice(APP.indexOf("function oauthAppReturn"), APP.indexOf("function oauthAppReturn") + 900);
ok("Β4 App Link (query/hash) ξαναφορτώνει στο KM_HOME", /location\.replace\(KM_HOME \+ lu\.search/.test(appLink) && /location\.replace\(KM_HOME \+ lu\.hash\)/.test(appLink));
const bad = APP.match(/location\.(replace|assign)\(\s*'\/kostometro\/'|location\.href\s*=\s*'\/kostometro\/'|\.href\s*=\s*'\/kostometro\/[a-z]*\/?'/g) || [];
ok("Β5 καμία πλοήγηση σε σκέτο κατάλογο /kostometro/… στο app.js", bad.length === 0, bad.join(", "));
ok("Β6 οι σύνδεσμοι του οδηγού κλειδιού (index.html) πάνε στο fastwrite.tech μέσα στο κέλυφος", /a\[href\^="\/kostometro\/kleidi\/"\][\s\S]{0,200}KM_WEB \+ a\.getAttribute\('href'\)/.test(APP));
ok("Β7 στον browser ΤΙΠΟΤΑ δεν αλλάζει (KM_HOME = /kostometro/)", /var KM_HOME = KM_NATIVE \? '[^']+' : '\/kostometro\/';/.test(APP));
ok("Β8 έκδοση v134 (APP_VER · version.json · sw.js)", APP.includes("var APP_VER = 'φέτα 3 · v134';") && VER.includes('"v134"') && SW.includes("var CACHE = 'km-v134';"));
ok("Β9 το KM_HOME ορίζεται μετά το KM_NATIVE", APP.indexOf("var KM_HOME") > APP.indexOf("var KM_NATIVE ="));

const bad2 = results.filter((r) => !r.ok).length;
if (ONLY) { console.log(bad2 ? "Μ" + ONLY + " → κοκκίνισε ✔" : "Μ" + ONLY + " ΠΕΡΑΣΕ — η μετάλλαξη ΔΕΝ πιάστηκε ✘"); process.exit(bad2 ? 0 : 1); }
console.log("\n" + (results.length - bad2) + "/" + results.length + (bad2 ? " ΑΠΕΤΥΧΑΝ" : " OK"));
process.exit(bad2 ? 1 : 0);
