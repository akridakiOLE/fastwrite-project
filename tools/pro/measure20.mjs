// KM-PRO-F5 · ΜΕΤΡΗΣΗ ΚΟΣΤΟΥΣ ανά ανάγνωση PRO (15/10/2026) — 20 πραγματικές αναγνώσεις Sonnet στο STAGING.
//   node tools/pro/measure20.mjs  → «Claude outputs/pro/f5_measure.json» + γραμμή ανά ανάγνωση
// Ίδια διαδρομή με την ανάγνωση PRO (proExtract): ίδιο prompt, ίδιο μοντέλο, εικόνες ≤1568 px (όπως το κινητό).
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
const BASE = "https://fastwrite-staging.stavrosfkallenos.workers.dev";
const KEY = readFileSync("C:/Users/User/fastwrite-project/secrets/km_admin_key.txt", "utf8").trim();
const DIR = "Claude outputs/pro/f5_metrisi/";
const IMGS = readdirSync(DIR).filter((f) => f.endsWith(".jpg")).sort();
const out = [];
let tin = 0, tout = 0, tmicro = 0, n = 0;
for (const f of IMGS) {
  const b64 = readFileSync(DIR + f).toString("base64");
  const r = await fetch(BASE + "/api/km/admin/pro/read-test", {
    method: "POST", headers: { "Content-Type": "application/json", "X-Km-Admin": KEY },
    body: JSON.stringify({ pages: [b64] }),
  });
  const j = await r.json().catch(() => ({ ok: false, error: "json" }));
  const row = { img: f, bytes: b64.length, status: r.status, ok: !!j.ok, model: j.model || null,
                in_tok: j.usage ? j.usage.in : null, out_tok: j.usage ? j.usage.out : null,
                usd: j.usage ? j.usage.micro / 1e6 : null, ms: j.usage ? j.usage.ms : null,
                lines: j.lines ? j.lines.length : null, approve: j.check ? j.check.approve : null, error: j.ok ? null : j.error };
  out.push(row);
  if (j.ok) { n++; tin += j.usage.in; tout += j.usage.out; tmicro += j.usage.micro; }
  console.log(f, r.status, j.ok ? `${j.model} in=${j.usage.in} out=${j.usage.out} $${(j.usage.micro / 1e6).toFixed(5)} ${j.usage.ms}ms lines=${j.lines.length} ${j.check.approve}` : j.error);
}
const sum = { n, in_avg: n ? Math.round(tin / n) : null, out_avg: n ? Math.round(tout / n) : null,
              usd_total: tmicro / 1e6, usd_avg: n ? tmicro / 1e6 / n : null,
              usd_min: Math.min(...out.filter((x) => x.ok).map((x) => x.usd)), usd_max: Math.max(...out.filter((x) => x.ok).map((x) => x.usd)),
              prices: "Sonnet 5.5 $2/MTok in · $10/MTok out (platform.claude.com/docs/en/about-claude/pricing, 15/10/2026)" };
writeFileSync("Claude outputs/pro/f5_measure.json", JSON.stringify({ at: new Date().toISOString(), sum, rows: out }, null, 1));
console.log("SUM", JSON.stringify(sum));
console.log(n === IMGS.length ? "PRO_MEASURE20_TELOS" : "PRO_MEASURE20_MERIKO");
process.exit(n >= 20 ? 0 : 1);
