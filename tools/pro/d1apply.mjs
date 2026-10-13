// KM-PRO · εφαρμογή σχήματος στη βάση STAGING με --command (το --file περνά από το API «import»,
// που ο λογαριασμός wrangler του υπολογιστή ΔΕΝ έχει: Authentication error 10000, μετρημένο 13/10/2026).
//   node tools/pro/d1apply.mjs schema/km_team.sql
// ⚠ ΜΟΝΟ staging (--env staging). Τα σχήματα είναι «IF NOT EXISTS» — ξανατρέχουν χωρίς ζημιά.
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
const f = process.argv[2];
if (!f) { console.error("χρήση: node tools/pro/d1apply.mjs <αρχείο.sql>"); process.exit(1); }
const sql = readFileSync(f, "utf8").split(/\r?\n/).map((l) => l.replace(/--.*$/, "")).join(" ").replace(/\s+/g, " ").trim();
if (/"/.test(sql)) { console.error("το σχήμα έχει διπλά εισαγωγικά — δεν περνά με --command"); process.exit(1); }
const out = execSync(`npx --yes wrangler d1 execute DB --env staging --remote --yes --command "${sql}"`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
console.log(out.split(/\r?\n/).filter((l) => /success|rows|changes|Executed|error/i.test(l)).slice(0, 8).join("\n"));
console.log("D1APPLY_OK " + f);
