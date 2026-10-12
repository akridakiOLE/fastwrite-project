// KM-PRO-F1 · μέτρηση ακρίβειας ανάγνωσης ανά γραμμή, στο STAGING (12/10/2026).
// node tools/pro/measure.mjs  → γράφει pro_measure_out.json στον κεντρικό φάκελο
import { readFileSync, writeFileSync } from "node:fs";
const BASE = "https://fastwrite-staging.stavrosfkallenos.workers.dev";
const KEY = readFileSync("C:/Users/User/fastwrite-project/secrets/km_admin_key.txt", "utf8").trim();
const DIR = "C:/Users/User/fastwrite-project/Claude outputs/agent/metrisi/";
const IMGS = ["d1", "d2", "d3", "r1", "r2", "r3"];
const MODELS = ["claude-haiku-4-5-20251001", "claude-sonnet-5-5"];
const out = [];
for (const model of MODELS) for (const n of IMGS) {
  const b64 = readFileSync(DIR + n + ".jpg").toString("base64");
  const r = await fetch(BASE + "/api/km/admin/pro/read-test", {
    method: "POST", headers: { "Content-Type": "application/json", "X-Km-Admin": KEY },
    body: JSON.stringify({ pages: [b64], model }),
  });
  const j = await r.json().catch(() => ({ ok: false, error: "json" }));
  out.push({ img: n, model, status: r.status, ...j });
  console.log(model.slice(7, 12), n, r.status, j.ok ? (j.lines.length + " γραμμές · " + j.check.approve + " · " + j.usage.ms + "ms · " + j.usage.micro + "µ$") : j.error);
}
writeFileSync("C:/Users/User/fastwrite-project/pro_measure_out.json", JSON.stringify(out, null, 1));
console.log("PRO_MEASURE_TELOS");
