"""
Build helper για το static site (site/) — μετατρέπει markdown legal docs σε HTML.

Usage:
    python build_site.py

Όταν αλλάξεις το privacy_policy.md ή terms_of_service.md, τρέξε αυτό για να
ξαναγεννηθούν τα αντίστοιχα HTML files στο site/legal/.

Dependency: pip install markdown
"""
from __future__ import annotations

import sys
from pathlib import Path

try:
    import markdown
except ImportError:
    print("ERROR: pip install markdown")
    sys.exit(1)


SITE_DIR = Path(__file__).parent / "site"
LEGAL_DIR = SITE_DIR / "legal"

NAV_HEADER = (
    '<header><div class="container"><div class="brand">Fast<span>Write</span></div>'
    '<nav><ul>'
    '<li><a href="/">Home</a></li>'
    '<li><a href="/legal/privacy">Privacy</a></li>'
    '<li><a href="/legal/terms">Terms</a></li>'
    '<li><a href="mailto:support@fastwrite.tech">Contact</a></li>'
    '</ul></nav></div></header>'
)
FOOTER = (
    '<footer><div class="container">'
    '<div class="copy">© 2026 FastWrite · Operated by Stavros Kallenos (Cyprus)</div>'
    '<ul>'
    '<li><a href="/legal/privacy">Privacy Policy</a></li>'
    '<li><a href="/legal/terms">Terms of Service</a></li>'
    '<li><a href="mailto:support@fastwrite.tech">Contact</a></li>'
    '</ul></div></footer>'
)


def render(md_path: Path, html_path: Path, title: str, meta_line: str) -> None:
    md_text = md_path.read_text(encoding="utf-8")
    # Drop the top-level H1 title — we render it ourselves
    lines = md_text.splitlines()
    body_md_lines = []
    skip_first_h1 = True
    for line in lines:
        if skip_first_h1 and line.startswith("# "):
            skip_first_h1 = False
            continue
        body_md_lines.append(line)
    body_md = "\n".join(body_md_lines)
    body_html = markdown.markdown(body_md, extensions=["extra", "sane_lists"])

    full = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>{title} — FastWrite</title>
<meta name="theme-color" content="#0a0e14" />
<link rel="stylesheet" href="/style.css" />
</head>
<body>
{NAV_HEADER}
<main class="legal-page">
  <div class="container">
    <h1>{title}</h1>
    <div class="legal-meta">{meta_line}</div>
    {body_html}
  </div>
</main>
{FOOTER}
</body>
</html>
"""
    html_path.write_text(full, encoding="utf-8")
    print(f"  ✓ {html_path.relative_to(SITE_DIR.parent)} ({len(full):,} bytes)")


def main() -> None:
    LEGAL_DIR.mkdir(parents=True, exist_ok=True)
    print("Building static site…")
    render(
        Path("privacy_policy.md"),
        LEGAL_DIR / "privacy.html",
        "Privacy Policy",
        "Effective Date: 11 June 2026 · Last Updated: 6 August 2026",
    )
    render(
        Path("terms_of_service.md"),
        LEGAL_DIR / "terms.html",
        "Terms of Service",
        "Effective Date: 11 June 2026 · Last Updated: 11 June 2026",
    )
    print("Done. Files ready στο site/ — commit + push για auto-deploy μέσω Cloudflare Pages.")


if __name__ == "__main__":
    main()
