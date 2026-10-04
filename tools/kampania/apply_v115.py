# v115 · ΗΜΕΡΑ ΚΑΜΠΑΝΙΑΣ Fasi3 — ο Κώστας (AI) ανοίγει για όλους + ημερήσιο ταβάνι 10 $.
# Εγκρίθηκε ως σειρά (Α010 §2 βήμα 3, 1/10/2026)· ετοιμάστηκε 2/10/2026, τρέχει ΜΟΝΟ από το deploy_v115.bat. (4/10/2026: ήταν v113 → v114 → v115 — πριν την καμπάνια ανέβηκαν το «Δώρο 20» (v113) και το βελάκι + κάρτες Πίνακα (v114).)
# Ιδεμπότητο: αν έχει ήδη εφαρμοστεί, δεν ξαναγράφει τίποτα. Κάθε αντικατάσταση ελέγχεται (ακριβώς 1 εμφάνιση).
import sys, io
EDITS = [
  ("site/kostometro/app.js", "  var AG_PUBLIC = false;", "  var AG_PUBLIC = true;   // v115 · ΗΜΕΡΑ ΚΑΜΠΑΝΙΑΣ Fasi3 — Πολιτική v2.3 ζωντανή από 4/10/2026"),
  ("site/kostometro/app.js", "  var APP_VER = 'φέτα 3 · v114';", "  var APP_VER = 'φέτα 3 · v115';"),
  ("site/kostometro/sw.js", "var CACHE = 'km-v114';", "var CACHE = 'km-v115';"),
  ("site/kostometro/version.json", '{ "v": "v114" }', '{ "v": "v115" }'),
  ("src/km.js", "const AGENT_DAILY_USD_DEFAULT = 3;", "const AGENT_DAILY_USD_DEFAULT = 10;   // v115 · ημέρα καμπάνιας Fasi3 (ήταν 3 όσο ήταν κρυφός)"),
  ("tests/v99.test.mjs", '  ok(js.includes("  var AG_PUBLIC = false;"), "AG_PUBLIC");', '  ok(js.includes("  var AG_PUBLIC = true;"), "AG_PUBLIC (v115: ανοιχτός από την ημέρα της καμπάνιας)");'),
  ("tests/v99.test.mjs", '  ["js", "  var AG_PUBLIC = false;", "  var AG_PUBLIC = true;"],', '  ["js", "  var AG_PUBLIC = true;", "  var AG_PUBLIC = false;"],'),
]
done = 0
for path, a, b in EDITS:
    s = io.open(path, encoding="utf-8", newline="").read()
    if s.count(b) == 1 and s.count(a) == 0:
        continue
    if s.count(a) != 1:
        print("APETYXE: %s — %d emfaniseis: %s" % (path, s.count(a), a[:60])); sys.exit(1)
    io.open(path, "w", encoding="utf-8", newline="").write(s.replace(a, b))
    done += 1
print("v115 efarmogi: %d allages" % done)
