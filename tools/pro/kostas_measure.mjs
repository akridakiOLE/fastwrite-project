// KM-PRO-V201 · ΜΕΤΡΗΣΗ ΚΟΣΤΟΥΣ ΜΙΑΣ ΣΥΝΟΜΙΛΙΑΣ ΚΩΣΤΑ (απόφαση Stavros 18/10/2026: «μέτρηση πριν από κάθε κείμενο»)
//   node tools/pro/kostas_measure.mjs  → Claude outputs/pro/kostas_measure.json
// Πραγματική συνομιλία 6 μηνυμάτων στο STAGING (ίδιο μοντέλο/γνώση/κανόνες με την παραγωγή), νέα συσκευή κάθε φορά.
// Το κόστος διαβάζεται από τη βάση staging (km_agent_daily) ΠΡΙΝ και ΜΕΤΑ από κάθε μήνυμα — όχι εκτίμηση.
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
const BASE = "https://fastwrite-staging.stavrosfkallenos.workers.dev";
const day = new Date().toISOString().slice(0, 10);
function spent() {
  const out = execSync(`npx --yes wrangler d1 execute fastwrite-staging --remote --env staging --json --command "SELECT calls, in_tok, out_tok, cache_tok, usd_micro FROM km_agent_daily WHERE day = '${day}'"`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const j = JSON.parse(out.slice(out.indexOf("[")));
  const r = (j[0] && j[0].results && j[0].results[0]) || {};
  return { calls: r.calls || 0, in: r.in_tok || 0, out: r.out_tok || 0, cache: r.cache_tok || 0, micro: r.usd_micro || 0 };
}
const Q = [
  "Γεια σου, έχω το Kostometro στο κινητό. Πώς προσθέτω έναν υπάλληλο στην ομάδα μου;",
  "Ο υπάλληλος θα βλέπει τις τιμές που πληρώνω στους προμηθευτές;",
  "Πώς στέλνω τα τιμολόγια στον λογιστή μου;",
  "Μια γραμμή τιμολογίου διαβάστηκε λάθος. Πώς τη διορθώνω;",
  "Αν αλλάξω κινητό, χάνω τα τιμολόγια;",
  "Ευχαριστώ πολύ!",
];
const inst = "km_meas" + Math.random().toString(36).slice(2, 10);
let sid = null; const turns = []; let prev = spent();
for (let i = 0; i < Q.length; i++) {
  const t0 = Date.now();
  const r = await fetch(BASE + "/api/km/agent/chat", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ sid, install_id: inst, src: "measure", lang: "el", text: Q[i], consent: true }) });
  const j = await r.json().catch(() => ({}));
  const ms = Date.now() - t0;
  if (!r.ok || !j.ok) { console.log("TURN_FAIL " + (i + 1) + " " + r.status + " " + JSON.stringify(j).slice(0, 200)); process.exit(1); }
  sid = j.sid;
  const now = spent();
  const d = { turn: i + 1, ms, calls: now.calls - prev.calls, in: now.in - prev.in, out: now.out - prev.out, cache_read: now.cache - prev.cache,
              usd: (now.micro - prev.micro) / 1e6, reply_chars: String(j.reply || "").length };
  turns.push(d); prev = now;
  console.log("TURN " + JSON.stringify(d));
}
const tot = turns.reduce((s, t) => s + t.usd, 0);
const sum = { turns: turns.length, usd_total: Math.round(tot * 1e6) / 1e6, usd_per_turn: Math.round(tot / turns.length * 1e6) / 1e6,
  usd_first: turns[0].usd, usd_max: Math.max(...turns.map((t) => t.usd)), model: "claude-sonnet-5-5 (AGENT_MODEL_DEFAULT)",
  prices: "Sonnet 5.5 $2/$10 ανά MTok, cache read $0.2, cache write $2.5 (km.js AGENT_PRICE)", day, at: new Date().toISOString() };
writeFileSync("Claude outputs/pro/kostas_measure.json", JSON.stringify({ sum, turns }, null, 2));
console.log("SUM " + JSON.stringify(sum));
console.log("KOSTAS_MEASURE_TELOS");
