# KM-AGENT · χτίζει τη ΓΝΩΣΗ του Βοηθού από τις ΙΔΙΕΣ πηγές που βλέπει ο χρήστης:
#   tools/agent/flow_el.md (η ροή) + FAQ της εφαρμογής (app.js) + οδηγός κλειδιού (kleidi/index.html)
# Τρέχει σε κάθε deploy (deploy_v99.bat) — η γνώση δεν ξεφεύγει ποτέ από την εφαρμογή.
#   python tools/agent/build_knowledge.py  ->  site/kostometro/agent/knowledge_el.md
import re, html, io, os
R = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
def rd(p): return io.open(os.path.join(R, p), encoding='utf-8').read()
def txt(s):
    s = re.sub(r'<br\s*/?>', '\n', s); s = re.sub(r'<[^>]+>', '', s)
    return html.unescape(s).replace('\u2019', "'").strip()
out = ['# ΓΝΩΣΗ ΤΟΥ ΒΟΗΘΟΥ KOSTOMETRO', '(Αυτόματο από tools/agent/build_knowledge.py — μην το επεξεργάζεσαι με το χέρι.)', '', rd('tools/agent/flow_el.md').strip(), '', '## FAQ ΤΗΣ ΕΦΑΡΜΟΓΗΣ (αυτολεξεί)']
app = rd('site/kostometro/app.js')
faq = app[app.index('var FAQ = ['):app.index('var faqDone')]
n = 0
for m in re.finditer(r"q:\s*'((?:[^'\\]|\\.)*)',\s*a:\s*'((?:[^'\\]|\\.)*)'", faq, flags=re.S):
    out += ['- **' + txt(m.group(1)) + '** ' + txt(m.group(2)).replace('\n\n', ' ').replace('\n', ' ')]; n += 1
k = rd('site/kostometro/kleidi/index.html')
k = re.sub(r'<script.*?</script>|<style.*?</style>|<!--.*?-->', '', k, flags=re.S)
k = re.sub(r'\s+', ' ', txt(re.sub(r'</(p|li|h\d|div)>', '\n', k)))
out += ['', '## ΟΔΗΓΟΣ ΚΛΕΙΔΙΟΥ GEMINI (fastwrite.tech/kostometro/kleidi/, αυτολεξεί)', k.strip()]
# v105 · το πακέτο (πώληση οφέλους, ιστορία, τιμές, λογιστής) + η οθόνη «Κάλεσε» αυτολεξεί (PRO, FastWrite, επιβράβευση)
out += ['', rd('tools/agent/pakketo_el.md').strip()]
h = rd('site/kostometro/index.html')
a = h.index('id="s-ref"'); b = h.index('<section', a + 10)
r = h[a:b]
r = r[r.index('ΤΙ ΕΡΧΕΤΑΙ'):] if 'ΤΙ ΕΡΧΕΤΑΙ' in r else r
r = re.sub(r'<script.*?</script>|<style.*?</style>|<!--.*?-->|<select.*?</select>', '', r, flags=re.S)
r = txt(re.sub(r'</(p|li|h\d|div)>', '\n', r))
r = '\n'.join(x.strip() for x in r.split('\n') if x.strip() and x.strip() != '—')
for cut in ('ΠΟΥ ΕΙΣΑΙ',):
    if cut in r: r = r[:r.index(cut)].rstrip() + '\n' + r[r.index('Οι ενεργές συστάσεις ενεργοποιούνται'):] if 'Οι ενεργές συστάσεις ενεργοποιούνται' in r else r[:r.index(cut)]
if 'ΤΟ FastWrite' not in r and 'FastWrite' not in r: raise SystemExit('Κάλεσε: δεν βρέθηκε η ενότητα FastWrite — κάτι άλλαξε στο index.html')
if 'Η ΕΠΙΒΡΑΒΕΥΣΗ' not in r: raise SystemExit('Κάλεσε: δεν βρέθηκε η επιβράβευση — κάτι άλλαξε στο index.html')
out += ['', '## ΤΙ ΕΡΧΕΤΑΙ — οθόνη «Κάλεσε» της εφαρμογής (☰ Μενού → «Κάλεσε»), αυτολεξεί', r]
s = '\n'.join(out) + '\n'
if n < 15: raise SystemExit('FAQ: βρέθηκαν μόνο %d ερωτήσεις — κάτι άλλαξε στο app.js' % n)
if len(s) > 60000: raise SystemExit('η γνώση ξεπέρασε τους 60.000 χαρακτήρες')
io.open(os.path.join(R, 'site/kostometro/agent/knowledge_el.md'), 'w', encoding='utf-8', newline='\n').write(s)
print('knowledge_el.md: %d χαρ., %d FAQ' % (len(s), n))
