// KM-PRO-STAGING-LOGIN · φτιάχνει σύνδεσμο ΜΙΑΣ χρήσης (30') για τον server δοκιμών.
//   node tools/pro/staging_link.mjs <email> <sql_out> <link_out>
// Στη βάση μπαίνει ΜΟΝΟ το hash του κλειδιού. Το κλειδί υπάρχει μόνο στο link_out (εκτός Git).
import { randomBytes, createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
const [email, sqlOut, linkOut] = process.argv.slice(2);
if (!/^[^@\s']+@[^@\s']+\.[^@\s']+$/.test(email || "")) { console.error("bad email"); process.exit(1); }
const k = randomBytes(32).toString("hex");
const h = createHash("sha256").update(k).digest("hex");
const t = new Date().toISOString();
const e = email.toLowerCase();
writeFileSync(sqlOut,
  `DELETE FROM km_oauth_states WHERE provider = 'test:${e}';\n` +
  `INSERT INTO km_oauth_states (state_hash, provider, verifier, nonce, ip_h, created) VALUES ('${h}', 'test:${e}', '-', '-', NULL, '${t}');\n`);
writeFileSync(linkOut, "https://fastwrite-staging.stavrosfkallenos.workers.dev/api/km/auth/test/callback?k=" + k + "\r\n");
console.log("LINK_OK " + e + " " + t);
