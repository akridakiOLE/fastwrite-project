// KM-LEADS · CSV της Meta → σώμα εισαγωγής (26/9/2026)
//   node tools/leads_csv.mjs "Claude outputs/dianomi/leads.csv" "Claude outputs/dianomi/leads_import.json"
// Η Meta δίνει CSV σε UTF-16 με tab ή σε UTF-8 με κόμμα — δεχόμαστε και τα δύο.
// Κρατάμε ΜΟΝΟ email, όνομα, ημερομηνία υποβολής. Η απάντηση της ερώτησης ΔΕΝ περνάει.
import { readFileSync, writeFileSync } from "node:fs";
const [inp, out] = process.argv.slice(2);
if (!inp || !out) { console.log("χρήση: node tools/leads_csv.mjs <leads.csv> <leads_import.json>"); process.exit(2); }
const buf = readFileSync(inp);
let txt = (buf[0] === 0xff && buf[1] === 0xfe) ? buf.toString("utf16le") : buf.toString("utf8");
txt = txt.replace(/^\uFEFF/, "");
const lines = txt.split(/\r?\n/).filter((l) => l.trim());
const sep = (lines[0].match(/\t/g) || []).length >= (lines[0].match(/,/g) || []).length ? "\t" : ",";
function split(line) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === sep) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur); return out.map((s) => s.trim());
}
const head = split(lines[0]).map((h) => h.toLowerCase());
// Πρώτα ακριβές όνομα στήλης, μετά «περιέχει» — αλλιώς το «name» πιάνει το ad_name (μετρήθηκε 26/9).
const col = (...names) => {
  const ex = head.findIndex((h) => names.includes(h));
  return ex >= 0 ? ex : head.findIndex((h) => names.some((n) => h.includes(n)));
};
const ie = col("email", "e-mail", "ηλεκτρονικό ταχυδρομείο");
const iname = col("full_name", "full name", "ονοματεπώνυμο", "όνομα", "name");
const itime = col("created_time", "created time", "ημερομηνία");
if (ie < 0) { console.log("ΔΕΝ βρέθηκε στήλη email. Στήλες: " + head.join(" | ")); process.exit(1); }
const rows = []; const seen = new Set();
for (const l of lines.slice(1)) {
  const c = split(l);
  const email = (c[ie] || "").trim().toLowerCase();
  if (!email || seen.has(email)) continue; seen.add(email);
  rows.push({ email, name: iname >= 0 ? c[iname] : "", consent_at: itime >= 0 ? c[itime] : "" });
}
writeFileSync(out, JSON.stringify({ source: "fb-form", rows }));
console.log("Στήλες: email=" + head[ie] + " · όνομα=" + (head[iname] || "—") + " · ημερομηνία=" + (head[itime] || "—"));
console.log("Γραμμές CSV: " + (lines.length - 1) + " · μοναδικά email: " + rows.length + " → " + out);
