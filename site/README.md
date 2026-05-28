# FastWrite Public Site

Static site για `fastwrite.tech`, deployed via **Cloudflare Pages**.

## Structure

```
site/
├── index.html         # Landing page
├── style.css          # Shared dark theme
├── _headers           # Cloudflare Pages security headers
├── _redirects         # URL redirects (/privacy → /legal/privacy.html, etc.)
└── legal/
    ├── privacy.html   # Auto-generated από ../privacy_policy.md
    └── terms.html     # Auto-generated από ../terms_of_service.md
```

## Deploy

Push σε `master` branch — Cloudflare Pages auto-deploys.

## Local preview

Άνοιξε `site/index.html` σε browser για quick check, ή σήκωσε local server:

```bash
cd site && python3 -m http.server 8080
# Browse: http://localhost:8080
```

## Regenerate legal pages (μετά από markdown changes)

```bash
pip install markdown   # one-time
python build_site.py
git add site/legal/
git commit -m "docs: regenerate legal HTML"
git push
```

## Cloudflare Pages settings

- **Production branch:** `master`
- **Build command:** (none — static)
- **Output directory:** `site`
- **Custom domain:** `fastwrite.tech` (root, plus optional `www` alias)
