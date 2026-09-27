// v95 · KM-SUP-THREAD — οθόνες «Υποστήριξη» + «Αίτημα» (27/9/2026)
//   node tests/v95_ui.test.mjs  ·  --mutate=N (ΠΡΕΠΕΙ να κοκκινίσει)
// Η λογική τρέχει σε μικρό κόσμο με ψεύτικα στοιχεία και ψεύτικο server.
// ⚠ Δεν αποδεικνύει εμφάνιση σε κινητό — αυτό το βλέπει ο Stavros στη ζωντανή δοκιμή.
import { readFileSync } from "node:fs";
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let js = readFileSync("site/kostometro/app.js", "utf8");
let html = readFileSync("site/kostometro/index.html", "utf8");
const MUT = [
  // 1 · 🔴 το κείμενο σβήνεται ΚΑΙ σε αποτυχία
  ["js", "      e.hidden = false;\n    });\n  };\n  function renderCase() {", "      e.hidden = false; el('hp-text').value = '';\n    });\n  };\n  function renderCase() {"],
  // 2 · μετά την αποστολή δεν ανοίγει το αίτημα
  ["js", "        csCode = x.j.code; goto('s-case'); return;", "        return;"],
  // 3 · 🔴 οθόνη εκτός λίστας → αόρατη για πάντα
  ["js", "'s-faq','s-help','s-fb','s-case'];", "'s-faq','s-help','s-fb'];"],
  // 4 · η απάντησή μας φαίνεται σαν του χρήστη
  ["js", "d.className = 'cs-msg ' + (m.dir === 'out' ? 'us' : 'me');", "d.className = 'cs-msg me';"],
  // 5 · «Λύθηκε» φαίνεται και σε κλειστό
  ["js", "    el('cs-close').hidden = c.status === 'closed';\n", ""],
  // 6 · 🔴 innerHTML αντί textContent (XSS από κείμενο χρήστη)
  ["js", "var p = document.createElement('span'); p.textContent = m.body;", "var p = document.createElement('span'); p.innerHTML = m.body;"],
  // 7 · κουκκίδα «νέα απάντηση» δεν μπαίνει
  ["js", "hpList = x.j.cases || []; hpMine(); helpDot(x.j.unread || 0);", "hpList = x.j.cases || []; hpMine();"],
  // 8 · 409 (χωρίς email) δεν ανοίγει την εναλλακτική
  ["js", "if (x.s === 409) { e.textContent = 'Δεν βρήκαμε email στον λογαριασμό σου — γράψε μας με email πιο κάτω.'; el('hp-email').open = true; }", "if (x.s === 409) { e.textContent = 'x'; }"],
  // 9 · το mailto ξαναγίνεται το κύριο κουμπί
  ["html", '<button class="btn ghost" id="hp-mail">Άνοιξε το email μου</button>', '<button class="btn primary" id="hp-mail">Γράψε μας</button>'],
  // 10 · v96 · το «Άνοιξε ›» λείπει
  ["js", "var gt = document.createElement('b'); gt.textContent = 'Άνοιξε ›'; go.appendChild(gt);", "var gt = document.createElement('b');"],
];
if (ONLY) { const m = MUT[ONLY - 1]; if (!m) process.exit(2); const bag = { js, html };
  if (!bag[m[0]].includes(m[1])) { console.log("Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(3); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ js, html } = bag); }
const slice = (a, b) => { const i = js.indexOf(a), j = js.indexOf(b, i); if (i < 0 || j < 0) throw new Error("λείπει: " + a); return js.slice(i, j); };
function mkNode(id) { let tc = ""; const n = { id, hidden: false, value: "", disabled: false, open: false, className: "", title: "", children: [], onclick: null, _html: null,
  appendChild(c) { this.children.push(c); } };
  Object.defineProperty(n, "textContent", { get() { return tc; }, set(v) { tc = String(v); n.children = []; } });
  Object.defineProperty(n, "innerHTML", { get() { return n._html; }, set(v) { n._html = String(v); } });
  return n; }
function world(server) {
  const nodes = {}; const el = (id) => nodes[id] || (nodes[id] = mkNode(id));
  const document = { createElement: (t) => mkNode(t) };
  const calls = [], went = [];
  const kmFetch = async (path, o) => { const body = JSON.parse(o.body || "{}"); calls.push({ path, body }); const r = server(path, body);
    return { status: r.s, json: async () => r.j }; };
  const src = "var el = arguments[0], document = arguments[1], kmFetch = arguments[2], goto = arguments[3], hasAccount = function () { return true; }, kmHead = function () { return {}; }, shortVer = function () { return 'v95'; }, devName = function () { return 'Android'; }, APP_VER = 'x', supTopic = function (v) { return String(v || '').trim(); };\n" +
    slice("  var ST_LAB =", "  /* ══ v62 · Brief Ε §3") + "\n return { hpLoad: hpLoad, renderCase: renderCase, setCode: function (c) { csCode = c; }, getCode: function () { return csCode; } };";
  const api = new Function(src)(el, document, kmFetch, (id) => went.push(id));
  return { api, el, calls, went, flush: async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); } };
}
let fails = 0;
const check = async (n, f) => { try { await f(); if (!ONLY) console.log("  ✔ " + n); } catch (e) { fails++; console.log("  ✘ " + n + " — " + e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m); };

await check("Ω-1 · 🔴 «Στείλε»: πάει στον server (όχι mailto), σβήνει το κείμενο ΜΟΝΟ μετά το ok, ανοίγει το αίτημα", async () => {
  const w = world(() => ({ s: 200, j: { ok: true, code: "KM-ABCDEFGHJK-1" } }));
  w.el("hp-text").value = "Δεν διαβάζει"; w.el("hp-topic").value = "κάμερα";
  w.el("hp-send").onclick(); await w.flush();
  ok(w.calls[0].path === "support/send" && w.calls[0].body.text === "Δεν διαβάζει" && w.calls[0].body.topic === "κάμερα", JSON.stringify(w.calls));
  ok(w.el("hp-text").value === "", "έμεινε το κείμενο"); ok(w.went[0] === "s-case" && w.api.getCode() === "KM-ABCDEFGHJK-1", "δεν άνοιξε");
});
await check("Ω-2 · 🔴 αποτυχία: το κείμενο ΜΕΝΕΙ, μήνυμα λάθους", async () => {
  const w = world(() => ({ s: 500, j: {} }));
  w.el("hp-text").value = "κρατήσου"; w.el("hp-send").onclick(); await w.flush();
  ok(w.el("hp-text").value === "κρατήσου", "χάθηκε"); ok(!w.el("hp-err").hidden, "κανένα μήνυμα");
});
await check("Ω-3 · 409 (λογαριασμός χωρίς email) → ανοίγει το «Προτιμάς email;»", async () => {
  const w = world(() => ({ s: 409, j: {} }));
  w.el("hp-text").value = "x"; w.el("hp-send").onclick(); await w.flush();
  ok(w.el("hp-email").open === true, "κλειστό");
});
await check("Ω-4 · συζήτηση: Εσύ / Υποστήριξη, κείμενο ως ΚΕΙΜΕΝΟ, «Λύθηκε» μόνο σε ανοιχτό", async () => {
  const thread = (st) => () => ({ s: 200, j: { ok: true, case: { code: "K", topic: "κάμερα", status: st }, messages: [
    { dir: "in", body: "<b>γεια</b>", at: "2026-09-27T08:00:00Z" }, { dir: "out", body: "απάντηση", at: "2026-09-27T09:00:00Z" }] } });
  const w = world(thread("answered")); w.api.setCode("K"); await w.api.renderCase(); await w.flush();
  const ms = w.el("cs-msgs").children;
  ok(ms.length === 2 && ms[0].className === "cs-msg me" && ms[1].className === "cs-msg us", ms.map((m) => m.className).join());
  ok(ms[0].children[1].textContent === "<b>γεια</b>" && ms[0].children[1]._html === null, "όχι ως κείμενο");
  ok(ms[1].children[0].textContent.startsWith("Υποστήριξη"), "ετικέτα");
  ok(w.el("cs-close").hidden === false && w.el("cs-closed-note").hidden === true, "ανοιχτό");
  const w2 = world(thread("closed")); w2.api.setCode("K"); await w2.api.renderCase(); await w2.flush();
  ok(w2.el("cs-close").hidden === true && w2.el("cs-closed-note").hidden === false, "κλειστό");
});
await check("Ω-5 · «Λύθηκε» → support/close με τον αριθμό", async () => {
  const w = world((p) => p === "support/close" ? { s: 200, j: { ok: true } } : { s: 200, j: { ok: true, case: { status: "closed" }, messages: [] } });
  w.api.setCode("KM-X"); w.el("cs-close").onclick(); await w.flush();
  ok(w.calls[0].path === "support/close" && w.calls[0].body.code === "KM-X", JSON.stringify(w.calls));
});
await check("Ω-6 · λίστα + κουκκίδα «νέα απάντηση» στο μενού", async () => {
  const w = world(() => ({ s: 200, j: { ok: true, unread: 1, cases: [{ code: "KM-A-1", topic: "κάμερα", status: "answered", unread: 1, last_out_at: "2026-09-27T09:00:00Z" }] } }));
  await w.api.hpLoad(); await w.flush();
  ok(w.el("hp-mine-wrap").hidden === false && w.el("hp-mine").children.length === 1, "λίστα");
  ok(w.el("m-help").children.length === 1 && w.el("m-help").className === "row-b hot", "κουκκίδα");
  // v96 · KM-SUP-OPEN — ορατό «Άνοιξε ›» σε κάθε κάρτα
  const card = w.el("hp-mine").children[0], go = card.children[card.children.length - 1];
  ok(go.className === "hp-go" && go.children.some((x) => x.textContent === "Άνοιξε ›"), "λείπει το «Άνοιξε ›»");
});
await check("Ω-7 · οθόνη s-case στη λίστα SCREENS + στο render + στο index", async () => {
  ok(js.includes("'s-faq','s-help','s-fb','s-case'];"), "SCREENS");
  ok(js.includes("if (id === 's-case')     { renderCase(); }"), "render");
  ok(html.includes('<section id="s-case"') && html.includes('id="hp-send"') && html.includes('id="m-help"'), "index");
});
await check("Ω-8 · το mailto μένει ΜΟΝΟ ως εναλλακτική μέσα στο «Προτιμάς email;»", async () => {
  const i = html.indexOf('<details class="faq" id="hp-email">'), m = html.indexOf('id="hp-mail"'), e = html.indexOf("</details>", i);
  ok(i > 0 && m > i && m < e, "εκτός details"); ok(html.includes('<button class="btn ghost" id="hp-mail">'), "κύριο κουμπί");
});
if (ONLY) { if (fails) { console.log("Μ" + ONLY + " → κοκκίνισε ✔"); process.exit(0); } console.log("Μ" + ONLY + " ΠΕΡΑΣΕ — το τεστ δεν πιάνει τίποτα"); process.exit(1); }
console.log(fails ? "ΑΠΕΤΥΧΑΝ " + fails : "✔ ΟΛΑ ΠΕΡΑΣΑΝ (8)"); process.exit(fails ? 1 : 0);
