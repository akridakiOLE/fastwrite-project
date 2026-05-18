"""
Έκδοση signed entitlement JWT για χρήστη FastWrite Desktop (Phase 2).

ΧΡΗΣΗ (dev / server-side ΜΟΝΟ — το private key ΔΕΝ φεύγει από εδώ):

    python tools/license_issue.py \\
        --priv  secrets/license_private.pem \\
        --sub   user@example.com \\
        --plan  solo \\
        --days  365 \\
        --docs  500 \\
        --features extract,batch,approve,tour \\
        --out   licenses/user_at_example_com.jwt

Παράμετροι:
    --sub        identifier χρήστη (email ή uuid)
    --plan       trial | solo | team | business | <custom>
    --days       διάρκεια ισχύος (default 365)
    --docs       docs ανά period (None = unlimited)
    --pages      pages ανά period (None = unlimited)
    --period     μήκος rolling window σε ημέρες (default 30)
    --features   comma-separated list (default "extract,approve,tour")
    --machine    optional machine_id (binding)
    --jti        optional explicit license id (default: uuid4)

Παράγει JWT υπογεγραμμένο με ES256 σε αρχείο `--out`.
Δεν χρειάζεται το desktop binary για αυτό.
"""

from __future__ import annotations

import argparse
import sys
import time
import uuid
from pathlib import Path

import jwt
from cryptography.hazmat.primitives import serialization


PROJECT_ROOT = Path(__file__).resolve().parent.parent

ISSUER   = "fastwrite.tech"
AUDIENCE = "fastwrite-desktop"
ALGO     = "ES256"


def load_private_key(path: Path):
    pem = Path(path).read_bytes()
    return serialization.load_pem_private_key(pem, password=None)


def build_claims(args) -> dict:
    now = int(time.time())
    exp = now + int(args.days) * 86400
    features = [f.strip() for f in (args.features or "").split(",") if f.strip()]
    claims = {
        "iss": ISSUER,
        "aud": AUDIENCE,
        "sub": args.sub,
        "iat": now,
        "nbf": now,
        "exp": exp,
        "jti": args.jti or f"lic-{uuid.uuid4().hex}",
        "plan": args.plan,
        "limits": {
            "docs_per_period":  None if args.docs  in (None, "", "none") else int(args.docs),
            "pages_per_period": None if args.pages in (None, "", "none") else int(args.pages),
            "period_days": int(args.period),
            "features": features or ["extract", "approve", "tour"],
        },
    }
    if args.machine:
        claims["machine_id"] = args.machine
    return claims


def issue(args) -> Path:
    priv = load_private_key(Path(args.priv))
    claims = build_claims(args)
    token = jwt.encode(claims, priv, algorithm=ALGO)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(token, encoding="utf-8")
    return out_path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--priv", required=True, help="Path στο license_private.pem")
    parser.add_argument("--sub",  required=True, help="Subject (email/uuid χρήστη)")
    parser.add_argument("--plan", required=True, help="Plan name (trial/solo/team/business/...)")
    parser.add_argument("--days", type=int, default=365, help="Διάρκεια ισχύος σε ημέρες")
    parser.add_argument("--docs", default=None, help="Docs/period (None = unlimited)")
    parser.add_argument("--pages", default=None, help="Pages/period (None = unlimited)")
    parser.add_argument("--period", type=int, default=30, help="Rolling window σε ημέρες")
    parser.add_argument("--features", default="extract,approve,tour",
                        help="Comma-separated feature list")
    parser.add_argument("--machine", default=None, help="machine_id binding (optional)")
    parser.add_argument("--jti", default=None, help="Explicit license id (default: uuid4)")
    parser.add_argument("--out", required=True, help="Αρχείο εξόδου JWT")
    args = parser.parse_args()

    out = issue(args)
    print(f"OK license JWT εγγράφηκε στο {out}")
    print(f"   plan = {args.plan}, days = {args.days}, docs/period = {args.docs}, "
          f"pages/period = {args.pages}, period_days = {args.period}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
