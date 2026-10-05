# v117 · KM-PK-V117 — «Μετράω από»: η ώρα κοβόταν στο κινητό («12:0», εύρημα Stavros 5/10/2026 22:05).
# Η ετικέτα πάει σε δική της γραμμή· πεδίο + «Όλα» στη δεύτερη, σε όλο το πλάτος. Ιδεμποτικό.
import sys, io
E = [
 ("site/pinakas/index.html", ".since-row { display: flex; align-items: center; gap: 10px; }\n.since-lab { font-size: 14px; font-weight: 700; white-space: nowrap; }",
  ".since-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; }   /* v117 · KM-PK-V117 */\n.since-lab { font-size: 14px; font-weight: 700; white-space: nowrap; flex-basis: 100%; }   /* v117: δική της γραμμή — η ώρα δεν κόβεται */"),
 ("site/kostometro/app.js", "  var APP_VER = 'φέτα 3 · v116';", "  var APP_VER = 'φέτα 3 · v117';"),
 ("site/kostometro/sw.js", "var CACHE = 'km-v116';", "var CACHE = 'km-v117';"),
 ("site/kostometro/version.json", '{ "v": "v116" }', '{ "v": "v117" }'),
 ("tests/v116.test.mjs", "console.log(failed ? \"\\nΚΟΚΚΙΝΟ: \" + failed : \"\\n✔ ΟΛΑ ΠΕΡΑΣΑΝ\");",
  "await check(\"Π-6 · v117: η ετικέτα «Μετράω από» σε δική της γραμμή — η ώρα δεν κόβεται στο κινητό\", async () => {\n"
  "  if (!/\\.since-row \\{[^}]*flex-wrap: wrap/.test(html)) throw new Error(\"χωρίς αναδίπλωση\");\n"
  "  if (!/\\.since-lab \\{[^}]*flex-basis: 100%/.test(html)) throw new Error(\"η ετικέτα μοιράζεται τη γραμμή\");\n"
  "});\n"
  "console.log(failed ? \"\\nΚΟΚΚΙΝΟ: \" + failed : \"\\n✔ ΟΛΑ ΠΕΡΑΣΑΝ\");"),
]
done = 0
for path, a, b in E:
    s = io.open(path, encoding="utf-8", newline="").read()
    if s.count(b) >= 1:
        continue
    if s.count(a) != 1:
        print("APETYXE: %s — %d emfaniseis: %s" % (path, s.count(a), a[:70])); sys.exit(1)
    io.open(path, "w", encoding="utf-8", newline="").write(s.replace(a, b))
    done += 1
print("v117 efarmogi: %d allages" % done)
