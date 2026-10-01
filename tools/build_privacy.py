# Χτίζει site/legal/privacy.html από το κανονικό κείμενο (Claude outputs/politiki/Politiki_v2.1_EL.md).
# python tools/build_privacy.py  — τρέχει στο deploy. Το κείμενο ζει στο .md, η σελίδα δεν γράφεται με το χέρι.
import markdown, re, io, os, sys
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(R, 'Claude outputs', 'politiki', 'Politiki_v2.1_EL.md')
OUT = os.path.join(R, 'site', 'legal', 'privacy.html')
md = io.open(SRC, encoding='utf-8').read()
body = markdown.markdown(md, extensions=['tables'])
def slug(t):
    t = re.sub(r'<[^>]+>', '', t)
    m = re.match(r'\s*([ΑΒΓ]\d|\d+)\.', t)
    if m: return 'a' + m.group(1).lower().replace('α', 'a').replace('.', '')
    return re.sub(r'[^a-z0-9]+', '-', t.lower()).strip('-')[:40]
body = re.sub(r'<h([23])>(.*?)</h\1>', lambda m: '<h%s id="%s">%s</h%s>' % (m.group(1), slug(m.group(2)), m.group(2), m.group(1)), body)
body = body.replace('<h1>Πολιτική Απορρήτου</h1>', '', 1)
body = re.sub(r'<p><strong>Ισχύει από:</strong>.*?</p>\n', '', body, count=1, flags=re.S)
body = re.sub(r'<h2 id="[^"]*">(ΜΕΡΟΣ Β[^<]*)</h2>', r'<h2 id="fastwrite-desktop">\1</h2>', body)
body = re.sub(r'<h2 id="[^"]*">(ΜΕΡΟΣ Γ[^<]*)</h2>', r'<h2 id="istotopos">\1</h2>', body)
body = re.sub(r'<h2 id="[^"]*">(ΜΕΡΟΣ Α[^<]*)</h2>', r'<h2 id="kostometro">\1</h2>', body)
m = re.search(r'\*\*Ισχύει από:\*\* (.+?) · \*\*Έκδοση:\*\* ([\d.]+)', md)
DATE, VER = m.group(1), m.group(2)
head = '''<!DOCTYPE html>
<html lang="el">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Πολιτική Απορρήτου — FastWrite · Kostometro</title>
<meta name="description" content="Πολιτική απορρήτου για το Kostometro, το FastWrite Desktop και τον ιστότοπο fastwrite.tech. Έκδοση %s, %s." />
<meta name="theme-color" content="#0a0e14" />
<link rel="stylesheet" href="/style.css" />
<style>
.legal-page .legal-toc{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:12px 14px;margin:0 0 28px}
.legal-page .legal-toc ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:6px 14px}
.legal-page .legal-toc li{margin:0;font-size:14px}
.legal-page .legal-lang{font-size:14px;margin:-8px 0 20px}
.legal-page table{display:block;overflow-x:auto;font-size:14px;max-width:100%%}
.legal-page th,.legal-page td{vertical-align:top;min-width:120px}
.legal-page h2,.legal-page h3{scroll-margin-top:96px}
</style>
</head>
<body>
<header><div class="container"><div class="brand">Fast<span>Write</span></div><nav><ul><li><a href="/">Αρχική</a></li><li><a href="/kostometro/">Kostometro</a></li><li><a href="/legal/privacy">Απόρρητο</a></li><li><a href="/legal/terms">Όροι</a></li><li><a href="mailto:support@fastwrite.tech">Επικοινωνία</a></li></ul></nav></div></header>
<main class="legal-page">
  <div class="container">
    <h1>Πολιτική Απορρήτου</h1>
    <div class="legal-meta">Έκδοση %s · Ισχύει από %s · Kostometro · FastWrite Desktop · fastwrite.tech</div>
    <p class="legal-lang"><strong>English:</strong> the previous policy (v1.2) for FastWrite Desktop remains available at <a href="/legal/privacy-en">/legal/privacy-en</a> until this text is translated.</p>
    <nav class="legal-toc" aria-label="Περιεχόμενα"><ul>
      <li><a href="#a1">1. Ποιοι είμαστε</a></li><li><a href="#a2">2. Με ποιον ρόλο</a></li>
      <li><a href="#kostometro">Α. Kostometro</a></li><li><a href="#aa8">Α8. Ο βοηθός (AI)</a></li>
      <li><a href="#fastwrite-desktop">Β. FastWrite Desktop</a></li><li><a href="#istotopos">Γ. Ιστότοπος, φόρμα, λίστα</a></li>
      <li><a href="#a3">3. Υπεκτελούντες</a></li><li><a href="#a5">5. Πόσο κρατάμε τι</a></li>
      <li><a href="#a6">6. Τα δικαιώματά σου</a></li><li><a href="#a7">7. Ασφάλεια και αντίγραφα</a></li>
    </ul></nav>
''' % (VER, DATE, VER, DATE)
tail = '''
<hr />
<p><em>FastWrite · Kostometro — Πολιτική Απορρήτου v%s — %s</em></p>
  </div>
</main>
<footer><div class="container"><div class="copy">© 2026 FastWrite · Σταύρος Καλλένος (Κύπρος)</div><ul><li><a href="/legal/privacy">Πολιτική Απορρήτου</a></li><li><a href="/legal/privacy-en">Privacy (EN)</a></li><li><a href="/legal/terms">Όροι Χρήσης</a></li><li><a href="mailto:support@fastwrite.tech">Επικοινωνία</a></li></ul></div></footer>
</body>
</html>
''' % (VER, DATE)
html = head + body + tail
for must in ('id="aa8"', 'id="fastwrite-desktop"', 'id="istotopos"', 'id="a5"', 'Anthropic'):
    if must not in html: sys.exit('privacy.html: λείπει ' + must)
io.open(OUT, 'w', encoding='utf-8', newline='\n').write(html)
print('privacy.html: %d chars, v%s, %s' % (len(html), VER, DATE))
