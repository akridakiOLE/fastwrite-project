// v101 · Βοηθός: το ↵ του κινητού = νέα γραμμή, ΟΧΙ αποστολή (εύρημα Stavros 30/9/2026)
//   node tests/v101.test.mjs  ·  --mutate=N (ΠΡΕΠΕΙ να κοκκινίσει)
import { readFileSync } from "node:fs";
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let js = readFileSync("site/kostometro/app.js", "utf8");
let html = readFileSync("site/kostometro/index.html", "utf8");
const MUT = [
  ["js", " && !agTouch()) { agSend(ev); }", ") { agSend(ev); }"],                       // 1 · 🔴 ↵ στέλνει στο κινητό
  ["js", "!ev.shiftKey && !ev.isComposing", "!ev.isComposing"],                            // 2 · Shift+Enter στέλνει στον υπολογιστή
  ["js", "    el('ag-in').oninput = agGrow;\n", ""],                                        // 3 · το πεδίο δεν μεγαλώνει
  ["html", ' enterkeyhint="enter"', ' enterkeyhint="send"'],                               // 4 · το πληκτρολόγιο δείχνει «αποστολή»
];
if (ONLY) { const m = MUT[ONLY - 1]; if (!m) process.exit(2); const bag = { js, html };
  if (!bag[m[0]].includes(m[1])) { console.log("Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(3); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ js, html } = bag); }
let failed = 0;
const check = (n, f) => { try { f(); if (!ONLY) console.log("  ✔ " + n); } catch (e) { failed++; console.log("  ✘ " + n + " — " + e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const slice = (a, b) => { const i = js.indexOf(a), j = js.indexOf(b, i); if (i < 0 || j < 0) throw new Error("λείπει " + a); return js.slice(i, j); };
function world(coarse) {
  const els = {}, sent = [];
  const mk = (id) => els[id] || (els[id] = { id, value: "", style: {}, scrollHeight: 300, hidden: false, onclick: null, onkeydown: null, oninput: null, onsubmit: null, onchange: null });
  const window = { matchMedia: (q) => ({ matches: q === "(pointer: coarse)" && coarse }) };
  const code = slice("  function agTouch()", "  function agDropImg()") +
    "\nvar agSend = function (e) { sent.push(1); if (e) e.prevented = true; };\n" +
    slice("    el('ag-in').onkeydown", "    if (/[?&]chat=1") + "\nreturn { agGrow };";
  const api = new Function("el", "window", "sent", code)(mk, window, sent);
  const key = (k, o) => { const ev = Object.assign({ key: k, shiftKey: false, isComposing: false }, o || {}); mk("ag-in").onkeydown(ev); return ev; };
  return { els, sent, key, mk, api };
}
check("Ν101-1 · 🔴 ΚΙΝΗΤΟ (αφή): ↵ ΔΕΝ στέλνει — γράφει νέα γραμμή", () => {
  const w = world(true); const ev = w.key("Enter");
  ok(w.sent.length === 0 && !ev.prevented, "έστειλε ή μπλόκαρε τη νέα γραμμή");
});
check("Ν101-2 · ΥΠΟΛΟΓΙΣΤΗΣ: Enter στέλνει · Shift+Enter νέα γραμμή · μισογραμμένος τόνος (IME) δεν στέλνει", () => {
  const w = world(false);
  w.key("Enter", { shiftKey: true }); ok(w.sent.length === 0, "Shift+Enter έστειλε");
  w.key("Enter", { isComposing: true }); ok(w.sent.length === 0, "IME έστειλε");
  w.key("Enter"); ok(w.sent.length === 1, "Enter δεν έστειλε");
});
check("Ν101-3 · το πεδίο μεγαλώνει με τις γραμμές (έως 120px) και ξαναμικραίνει μετά την αποστολή", () => {
  const w = world(true); ok(typeof w.mk("ag-in").oninput === "function", "χωρίς oninput");
  w.mk("ag-in").oninput(); ok(w.mk("ag-in").style.height === "120px", w.mk("ag-in").style.height);
  ok(/el\('ag-in'\)\.value = ''; agGrow\(\);/.test(slice("  function agSend(e) {", "  function agInit() {")), "δεν ξαναμικραίνει");
});
check("Ν101-4 · το πληκτρολόγιο του κινητού δείχνει ↵ (enterkeyhint=enter), η αποστολή μένει στο ➤", () => {
  ok(/<textarea id="ag-in"[^>]*enterkeyhint="enter"/.test(html), "enterkeyhint");
  ok(/<button id="ag-send"[^>]*type="submit"/.test(html), "κουμπί ➤");
});
if (ONLY) { if (failed) { console.log("Μ" + ONLY + " → κοκκίνισε ✔"); process.exit(0); } console.log("Μ" + ONLY + " ΠΕΡΑΣΕ — το τεστ δεν πιάνει τίποτα"); process.exit(1); }
console.log(failed ? "ΑΠΕΤΥΧΑΝ " + failed : "✔ ΟΛΑ ΠΕΡΑΣΑΝ (4)"); process.exit(failed ? 1 : 0);
