// KM-PRO-F1 · Φάση 1 — ανάγνωση ανά γραμμή (server + κινητό), κλάδος pro (12/10/2026)
//   node tests/pro_f1.test.mjs            node tests/pro_f1.test.mjs --mutate=N  (exit 0 = πιάστηκε)
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--mutate=")); return a ? Number(a.split("=")[1]) : null; })();
let pro = readFileSync("src/km_pro.js", "utf8");
let km = readFileSync("src/km.js", "utf8");
let js = readFileSync("site/kostometro/app.js", "utf8");
let wt = readFileSync("wrangler.toml", "utf8");
const MUT = [
  // Μ1 · 🔴 κιβώτιο χωρίς περιεχόμενο → μάντεψη αντί για ερώτηση
  ["pro", "    if (count) return { per: count, base: \"pc\", sure: true, why: \"desc\" };\n    return null;\n  }", "    if (count) return { per: count, base: \"pc\", sure: true, why: \"desc\" };\n    return { per: 1, base: \"pc\", sure: true, why: \"guess\" };\n  }"],
  // Μ2 · 🔴 το «αυτόματο» δεν ελέγχει το άθροισμα των γραμμών
  ["pro", "approve: allOk && netOk && totOk ? \"auto\" : \"manual\"", "approve: allOk && totOk ? \"auto\" : \"manual\""],
  // Μ3 · 🔴 το PRO ξαναπάει στο Haiku (μετρήθηκε 12/10: επινοεί γραμμές)
  ["pro", "export const PRO_MODEL_DEFAULT = \"claude-sonnet-5-5\";", "export const PRO_MODEL_DEFAULT = \"claude-haiku-4-5-20251001\";"],
  // Μ4 · 🔴 το grant δουλεύει και στην παραγωγή (χωρίς PRO_LIVE)
  ["pro", "  if (String(env.PRO_LIVE || \"\") !== \"1\") return h.json({ ok: false, error: \"pro_not_live\" }, 409);\n", ""],
  // Μ5 · 🔴 οι γραμμές δεν ταξιδεύουν στον φάκελο
  ["js", "             lines: r.lines || undefined, proInfo: r.proInfo || undefined };   /* KM-PRO-F1 */", "             };"],
  // Μ6 · 🔴 οι γραμμές γίνονται οριστικές χωρίς πάτημα ανθρώπου
  ["js", "      proConfirm(r);   /* KM-PRO-F1", "      /* */ (function(){})(r);   /* KM-PRO-F1"],
  // Μ7 · 🔴 το staging δείχνει στην ΠΑΡΑΓΩΓΙΚΗ βάση
  ["wt", "database_id = \"ce2e7e05-151a-440e-9da7-461c1109bf5b\"", "database_id = \"153089e9-11bd-4051-b0bd-a62438fec07e\""],
  // Μ8 · το staging δεν φαίνεται ως staging
  ["js", "if (/workers\\.dev$/.test(location.hostname)) { document.body.classList.add('is-staging'); }", ""],
];
if (ONLY !== null) {
  const m = MUT[ONLY - 1]; const bag = { pro, km, js, wt };
  if (!m || !bag[m[0]].includes(m[1])) { console.log("Η ΜΕΤΑΛΛΑΞΗ Μ" + ONLY + " ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ"); process.exit(1); }
  bag[m[0]] = bag[m[0]].replace(m[1], m[2]); ({ pro, km, js, wt } = bag);
}
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✔ " + m); } else { fail++; console.log("  ✘ " + m); } };
// φόρτωσε το (πιθανώς μεταλλαγμένο) km_pro.js
const dir = mkdtempSync(join(tmpdir(), "kmpro-"));
writeFileSync(join(dir, "km_pro.mjs"), pro);
const P = await import("file://" + join(dir, "km_pro.mjs").replace(/\\/g, "/"));

// συσκευασία
const pk = (d, u) => P.proPack(d, u);
ok(pk("Coca Cola 330ml 1x24", "ΚΙΒ").per === 7.92 && pk("Coca Cola 330ml 1x24", "ΚΙΒ").base === "L", "«330ml 1x24 · ΚΙΒ» → 7,92 λτ");
ok(pk("Αναψυκτικό κόλα 330ml (κιβ. 24)", "κιβ.").per === 7.92, "«330ml (κιβ. 24)» → 7,92 λτ");
ok(pk("ΓΑΛΑ ΦΡΕΣΚΟ 6x1LT", "ΚΙΒ").per === 6, "«6x1LT» → 6 λτ");
ok(pk("Ζιβανία 700ml", "φιάλ.").per === 0.7, "«700ml · φιάλ.» → 0,7 λτ");
ok(pk("Χοιρινό μπούτι", "κιλ.").base === "kg", "κιλ. → €/κιλό");
ok(pk("ΝΕΡΟ 1,5L", "ΚΙΒ") === null, "🔴 «1,5L · ΚΙΒ» χωρίς πλήθος → ΡΩΤΑΜΕ (null), ποτέ μάντεψη");
ok(pk("ΧΑΡΤΟΠΕΤΣΕΤΕΣ", "ΚΙΒ") === null, "🔴 σκέτο «ΚΙΒ» → ΡΩΤΑΜΕ");

// έλεγχοι
const good = P.proNormalize({ net: 75.05, vat: 3.75, total: 78.8, lines: [
  { desc: "Ντομάτες", unit: "κιλ.", qty: 12, unit_price: 1.65, line_net: 19.8 },
  { desc: "Υπόλοιπα", unit: "κιλ.", qty: 1, unit_price: 55.25, line_net: 55.25 }] });
ok(good.check.approve === "auto", "όλα κλείνουν → «auto»");
const badSum = P.proNormalize({ net: 80, vat: 4, total: 84, lines: [{ desc: "Χ", unit: "κιλ.", qty: 1, unit_price: 10, line_net: 10 }] });
ok(badSum.check.approve === "manual" && !badSum.check.net_ok, "🔴 Σ γραμμών ≠ καθαρό → «manual»");
const badLine = P.proNormalize({ net: 20, vat: 1, total: 21, lines: [{ desc: "Χ", unit: "κιλ.", qty: 2, unit_price: 5, line_net: 20 }] });
ok(badLine.check.approve === "manual" && badLine.lines[0].ok === false, "🔴 ποσότητα × τιμή ≠ αξία → «manual»");
ok(P.PRO_MODEL_DEFAULT === "claude-sonnet-5-5", "🔴 μοντέλο PRO = Sonnet (μέτρηση 12/10)");
ok(/if \(String\(env\.PRO_LIVE \|\| ""\) !== "1"\) return h\.json\(\{ ok: false, error: "pro_not_live" \}/.test(pro), "🔴 grant ΜΟΝΟ όπου PRO_LIVE=1");
ok(/proActive\(env, await proRow\(env, folder\), t\)\) return h\.json\(\{ ok: false, error: "not_pro" \}, 403\)/.test(pro), "read: μόνο λογαριασμός PRO");
ok(pro.includes('error: "month_cap"'), "ταβάνι μήνα ανά λογαριασμό");
ok(km.includes('const { handlePro } = await import("./km_pro.js");') && km.includes('path.startsWith("/api/km/pro/")'), "km.js → km_pro.js (δυναμικά)");

// κινητό
ok(js.includes("             lines: r.lines || undefined, proInfo: r.proInfo || undefined };   /* KM-PRO-F1 */"), "🔴 metaOf: οι γραμμές ταξιδεύουν στον φάκελο");
ok((js.match(/lines: m\.lines \|\| undefined, proInfo: m\.proInfo \|\| undefined/g) || []).length === 2, "κατέβασμα: οι γραμμές επιστρέφουν (2 σημεία)");
ok(js.includes("      proConfirm(r);   /* KM-PRO-F1"), "🔴 οριστικές ΜΟΝΟ με «Αποθήκευση»");
ok(js.includes("    if (proSweep()) { return; }"), "PRO πρώτο στην ουρά ανάγνωσης");
ok(js.includes("if (/workers\\.dev$/.test(location.hostname)) { document.body.classList.add('is-staging'); }"), "σήμα STAGING");

// staging
ok(wt.includes('[env.staging]') && wt.includes('database_id = "ce2e7e05-151a-440e-9da7-461c1109bf5b"') && wt.includes('bucket_name = "fastwrite-km-staging"'), "🔴 staging = ΔΙΚΗ του βάση + R2");
const stg = wt.slice(wt.indexOf("[env.staging]"));
ok(!stg.includes("153089e9-11bd-4051-b0bd-a62438fec07e") && !/bucket_name = "fastwrite-km-eu"/.test(stg), "🔴 staging ΧΩΡΙΣ παραγωγικά ids");
ok(!/\[env\.staging\.triggers\]/.test(wt), "staging χωρίς cron");

console.log("\n" + pass + " ✔ · " + fail + " ✘");
if (ONLY !== null) process.exit(fail ? 0 : 1);
process.exit(fail ? 1 : 0);
