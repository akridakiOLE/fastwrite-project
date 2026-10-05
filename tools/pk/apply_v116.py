# v116 · KM-PK-V116 — διορθώσεις μέτρησης Πίνακα (εύρημα Stavros 5/10/2026). Ιδεμποτικό· κάθε αντικατάσταση ακριβώς 1 εμφάνιση.
# (1) είσοδος με 12 λέξεις = βήμα «login», ΟΧΙ «account» · (2) ΕΝΕΡΓΕΣ συσκευές (λογαριασμός + KPI)
# (3) καθαρές ετικέτες χωνιού · (4) «Μετράω από» με ημερομηνία + ΩΡΑ Κύπρου.
import sys, io
E = [
 # ── server ──
 ("src/km.js", "oauth_google: 1, oauth_microsoft: 1 };  // KM-OAUTH: +2",
  "oauth_google: 1, oauth_microsoft: 1, login: 1 };  // KM-OAUTH: +2 · v116 KM-PK-V116: login = είσοδος με 12 λέξεις σε υπάρχοντα (ΟΧΙ νέος λογαριασμός)"),
 ("src/km.js", "function cyMidnightUtc(ymd) {\n  const base = new Date(ymd + \"T00:00:00Z\").getTime();",
  "// v116 · KM-PK-V116 — ώρα Κύπρου «ΩΩ:ΛΛ» μιας μέρας σε UTC (το «Μετράω από» με ώρα, αίτημα Stavros 5/10)\n"
  "const CY_HM = new Intl.DateTimeFormat(\"en-GB\", { timeZone: CY_TZ, hour: \"2-digit\", minute: \"2-digit\", hourCycle: \"h23\" });\n"
  "function cyLocalUtc(ymd, hm) {\n  const base = new Date(ymd + \"T\" + hm + \":00Z\").getTime();\n"
  "  for (let off = -14; off <= 14; off++) {\n    const t = base - off * 3600e3;\n"
  "    if (cyDate(t) === ymd && CY_HM.format(new Date(t)) === hm) return new Date(t).toISOString();\n  }\n"
  "  return new Date(base).toISOString();\n}\n"
  "function cyMidnightUtc(ymd) {\n  if (ymd.length === 16) return cyLocalUtc(ymd.slice(0, 10), ymd.slice(11));   // v116 · «ΗΗΗΗ-ΜΜ-ΗΗTΩΩ:ΛΛ»\n"
  "  const base = new Date(ymd + \"T00:00:00Z\").getTime();"),
 ("src/km.js", "  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(v)) return \"\";\n  const d = new Date(v + \"T12:00:00Z\");\n  if (isNaN(d) || d.toISOString().slice(0, 10) !== v) return \"\";",
  "  if (!/^\\d{4}-\\d{2}-\\d{2}(T([01]\\d|2[0-3]):[0-5]\\d)?$/.test(v)) return \"\";   // v116: + προαιρετική ώρα\n  const d = new Date(v.slice(0, 10) + \"T12:00:00Z\");\n  if (isNaN(d) || d.toISOString().slice(0, 10) !== v.slice(0, 10)) return \"\";"),
 ("src/km.js", "            (SELECT COUNT(*) FROM km_device_links l WHERE l.folder_id = a.folder_id) AS devices\n",
  "            (SELECT COUNT(*) FROM km_device_links l WHERE l.folder_id = a.folder_id) AS devices,\n"
  "            (CASE WHEN a.deleted IS NULL AND a.active_device_id IS NOT NULL THEN 1 ELSE 0 END) AS devices_active   -- v116 · KM-PK-V116\n"),
 ("src/km.js", "     FROM km_device_links${whereC(\"created\")}`, d7, ...SA);\n",
  "     FROM km_device_links${whereC(\"created\")}`, d7, ...SA);\n"
  "  // v116 · KM-PK-V116 — ΕΝΕΡΓΕΣ συσκευές: μία ανά ζωντανό λογαριασμό. Το km_device_links κρατάει ΚΑΘΕ συσκευή που\n"
  "  // πέρασε ποτέ (έξοδος + είσοδος = νέα ταυτότητα· κάθε browser/incognito = άλλη) — αυτό είναι ιστορικό, όχι «συσκευές».\n"
  "  const devAct = await one(`SELECT COUNT(*) AS n FROM km_accounts WHERE deleted IS NULL AND active_device_id IS NOT NULL${andC(\"created\")}`, ...SA);\n"),
 ("src/km.js", "    devices: { links: dev.links || 0, distinct:",
  "    devices: { active: Number(devAct.n) || 0, links: dev.links || 0, distinct:"),
 # ── εφαρμογή ──
 ("site/kostometro/app.js", "      funnel('account');   // v97 · KM-FUNNEL\n", ""),
 ("site/kostometro/app.js", "      return r.json().then(function (j) {\n        setActiveState(true, j && j.state && j.state.active_since);",
  "      return r.json().then(function (j) {\n"
  "        /* v116 · KM-PK-V116 — ο server λέει αν ΦΤΙΑΧΤΗΚΕ λογαριασμός ή αν μπήκε σε υπάρχοντα (12 λέξεις).\n"
  "           Ως τη v115 και τα δύο μετρούσαν «λογαριασμός» (εύρημα Stavros 5/10). */\n"
  "        if (j && j.account === 'existing') { funnel('login'); } else { funnel('account'); }   // v97 · KM-FUNNEL\n"
  "        setActiveState(true, j && j.state && j.state.active_since);"),
 ("site/kostometro/app.js", "&& step !== 'account' && step !== 'key' && step !== 'key_skip') { return; }",
  "&& step !== 'account' && step !== 'login' && step !== 'key' && step !== 'key_skip') { return; }"),
 ("site/kostometro/app.js", "  var APP_VER = 'φέτα 3 · v115';", "  var APP_VER = 'φέτα 3 · v116';"),
 ("site/kostometro/sw.js", "var CACHE = 'km-v115';", "var CACHE = 'km-v116';"),
 ("site/kostometro/version.json", '{ "v": "v115" }', '{ "v": "v116" }'),
 # ── Πίνακας ──
 ("site/pinakas/app.js", "'code', 'account', 'key', 'key_skip'], fm = {};", "'code', 'account', 'login', 'key', 'key_skip'], fm = {};"),
 ("site/pinakas/app.js", "'<tr><td colspan=\"9\" class=\"muted\">Κανείς ακόμα.</td></tr>'", "'<tr><td colspan=\"10\" class=\"muted\">Κανείς ακόμα.</td></tr>'"),
 ("site/pinakas/app.js", "    el('k-dev').textContent = j.devices.distinct;",
  "    el('k-dev').textContent = (j.devices.active != null ? j.devices.active : j.devices.distinct);   // v116 · KM-PK-V116: ΕΝΕΡΓΕΣ"),
 ("site/pinakas/app.js", "      'Συσκευές με ανέβαστα: <b>' + j.devices.with_unsynced + '</b> · ' +",
  "      'Συσκευές με ανέβαστα: <b>' + j.devices.with_unsynced + '</b> · ' +\n"
  "      'Ταυτότητες συσκευών στο ιστορικό: <b>' + j.devices.distinct + '</b> <span class=\"muted\">(έξοδος/είσοδος, κάθε browser και incognito μετράει χωριστά)</span> · ' +"),
 ("site/pinakas/app.js", "        '<span>sync <b>' + ago(r.last_sync) + '</b>' + (r.folder_version ? ' <span class=\"muted\">v' + r.folder_version + '</span>' : '') + '</span>' +\n        '<span>συσκευές <b>' + (r.devices || 0) + '</b></span>' +",
  "        '<span>sync <b>' + ago(r.last_sync) + '</b>' + (r.folder_version ? ' <span class=\"muted\">v' + r.folder_version + '</span>' : '') + '</span>' +\n"
  "        '<span>συσκευή <b>' + (r.devices_active || 0) + '</b> ενεργή' + ((r.devices || 0) > (r.devices_active || 0) ? ' <span class=\"muted\">· ' + r.devices + ' στο ιστορικό</span>' : '') + '</span>' +   // v116 · KM-PK-V116"),
 ("site/pinakas/app.js", "    return /^\\d{4}-\\d{2}-\\d{2}$/.test(v) ? v : '';", "    return /^\\d{4}-\\d{2}-\\d{2}(T\\d{2}:\\d{2})?$/.test(v) ? v : '';   // v116: + ώρα"),
 ("site/pinakas/app.js", "    if (inp && inp.value !== v) { inp.value = v; }",
  "    var vi = v && v.length === 10 ? v + 'T00:00' : v;   // v116: παλιά τιμή μόνο με ημερομηνία = 00:00\n    if (inp && inp.value !== vi) { inp.value = vi; }"),
 ("site/pinakas/app.js", "    var p = v ? v.split('-') : null;", "    var p = v ? v.slice(0, 10).split('-') : null, hm = v.length === 16 ? v.slice(11) : '00:00';"),
 ("site/pinakas/app.js", "p[2] + '/' + p[1] + '/' + p[0] + '</b> και μετά (ώρα Κύπρου)", "p[2] + '/' + p[1] + '/' + p[0] + ' ' + hm + '</b> και μετά (ώρα Κύπρου)"),
 ("site/pinakas/app.js", "Διάλεξε μέρα για να μετράνε", "Διάλεξε μέρα και ώρα για να μετράνε"),
 ("site/pinakas/app.js", "    sinceSet(/^\\d{4}-\\d{2}-\\d{2}$/.test(v) ? v : '');",
  "    v = v.slice(0, 16);\n    sinceSet(/^\\d{4}-\\d{2}-\\d{2}(T\\d{2}:\\d{2})?$/.test(v) ? v : '');"),
 ("site/pinakas/index.html", "<input type=\"date\" id=\"since\">", "<input type=\"datetime-local\" id=\"since\">"),
 ("site/pinakas/index.html", "<h2>Χωνί εγγραφής <span class=\"muted\">30 ημέρες · μοναδικές συσκευές</span></h2>",
  "<h2>Χωνί εγγραφής <span class=\"muted\">30 ημέρες · ανά browser</span></h2>"),
 ("site/pinakas/index.html", "<th>άνοιξαν</th><th>έβαλαν email</th><th>Google</th><th>Microsoft</th><th>επιβεβαίωσαν κωδικό</th><th>λογαριασμός</th>",
  "<th>άνοιξαν (browser)</th><th>έβαλαν email</th><th>πάτησαν Σύνδεση Google</th><th>πάτησαν Σύνδεση Microsoft</th><th>επιβεβαίωσαν email</th><th>ΝΕΟΣ λογαριασμός</th><th>είσοδος με 12 λέξεις</th>"),
 ("site/pinakas/index.html", "<p class=\"fine hint\" id=\"fnl-note\">Μετράει από τη v97 (27/9/2026) — ό,τι έγινε πριν δεν φαίνεται εδώ.</p>",
  "<p class=\"fine hint\" id=\"fnl-note\">Μετράει από τη v97 (27/9/2026). <b>Κάθε browser μετράει χωριστά</b>: ο ίδιος άνθρωπος στον browser του Facebook και μετά στο Chrome (ή σε incognito) = 2 γραμμές «άνοιξαν». Η «είσοδος με 12 λέξεις» μετριέται χωριστά από τη v116 — πριν, μετρούσε ως «λογαριασμός».</p>"),
 ("site/pinakas/index.html", "<div class=\"kpi\"><div class=\"n\" id=\"k-dev\">—</div><div class=\"l\">συσκευές</div></div>",
  "<div class=\"kpi\"><div class=\"n\" id=\"k-dev\">—</div><div class=\"l\">ενεργές συσκευές</div></div>"),
 # ── τεστ που κλειδώνουν το παλιό FN ──
 ("tests/v114.test.mjs", "'code', 'account', 'key', 'key_skip'\\]/.test(ui)", "'code', 'account', 'login', 'key', 'key_skip'\\]/.test(ui)"),
]
done = 0
for path, a, b in E:
    s = io.open(path, encoding="utf-8", newline="").read()
    if b and s.count(b) >= 1:
        continue   # ήδη εφαρμοσμένο (και όταν το νέο κείμενο ΠΕΡΙΕΧΕΙ το παλιό)
    if not b and s.count(a) == 0:
        continue
    if s.count(a) != 1:
        print("APETYXE: %s — %d emfaniseis: %s" % (path, s.count(a), a[:70])); sys.exit(1)
    io.open(path, "w", encoding="utf-8", newline="").write(s.replace(a, b))
    done += 1
print("v116 efarmogi: %d allages" % done)
