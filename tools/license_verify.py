"""
Dry-run verifier για το FastWrite license JWT (Phase 2).

Διαβάζει το `<base_dir>/secrets/license.jwt`, το επαληθεύει με το
`license_pubkey.pem` του project, και τυπώνει σύνοψη (plan, expiry,
limits, remaining). Δεν αυξάνει counter — μόνο read-only inspection.

Χρήση (από project root):

    # Default: base_dir = %APPDATA%\\FastWrite (Windows) ή
    #          ~/Library/Application Support/FastWrite (Mac) ή
    #          ~/.local/share/FastWrite (Linux)
    venv\\Scripts\\python tools\\license_verify.py

    # Ή explicit:
    venv\\Scripts\\python tools\\license_verify.py --base-dir "%APPDATA%\\FastWrite"
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import threading
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from license_manager import (  # noqa: E402
    LicenseInvalidError,
    LicenseManager,
    LicenseMissingError,
)


def default_base_dir() -> Path:
    """Ίδια λογική με desktop/main.py:setup_app_data_dir()."""
    if sys.platform == "win32":
        return Path(os.environ["APPDATA"]) / "FastWrite"
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "FastWrite"
    return Path.home() / ".local" / "share" / "FastWrite"


class _StubDB:
    """In-memory SQLite, μόνο για να δημιουργηθεί ο πίνακας license_usage."""
    def __init__(self):
        self.conn = sqlite3.connect(":memory:", check_same_thread=False)
        self._write_lock = threading.RLock()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-dir", default=None,
                        help="Φάκελος εφαρμογής (default: per-OS app data folder)")
    parser.add_argument("--pubkey", default=str(PROJECT_ROOT / "license_pubkey.pem"),
                        help="Path στο license_pubkey.pem")
    parser.add_argument("--allow-trial", action="store_true",
                        help="Αν λείπει license, επέστρεψε trial αντί να σκάσει")
    args = parser.parse_args()

    base_dir = Path(args.base_dir) if args.base_dir else default_base_dir()
    pubkey_path = Path(args.pubkey)

    print(f"base_dir   : {base_dir}")
    print(f"license    : {base_dir / 'secrets' / 'license.jwt'}")
    print(f"public key : {pubkey_path}")
    print()

    if not pubkey_path.exists():
        print(f"ΣΦΑΛΜΑ: λείπει το public key στο {pubkey_path}", file=sys.stderr)
        print("Τρέξε πρώτα: venv\\Scripts\\python tools\\license_keygen.py", file=sys.stderr)
        return 2

    base_dir.mkdir(parents=True, exist_ok=True)
    (base_dir / "secrets").mkdir(parents=True, exist_ok=True)

    lm = LicenseManager(
        base_dir=base_dir,
        public_key_pem=pubkey_path.read_bytes(),
        db=_StubDB(),
    )

    try:
        ent = lm.load_entitlement(allow_trial_fallback=args.allow_trial)
    except LicenseMissingError as e:
        print(f"ΛΕΙΠΕΙ LICENSE: {e}", file=sys.stderr)
        print("Έκδοσέ το με: tools\\license_issue.py ή χρησιμοποίησε --allow-trial",
              file=sys.stderr)
        return 3
    except LicenseInvalidError as e:
        print(f"INVALID LICENSE: {e}", file=sys.stderr)
        return 4

    print("=== VERIFIED ===")
    print(f"plan       : {ent.plan}")
    print(f"sub        : {ent.sub}")
    print(f"jti        : {ent.jti}")
    print(f"iat (unix) : {ent.iat}")
    print(f"exp (unix) : {ent.exp}")
    print(f"features   : {ent.features}")
    print(f"machine_id : {ent.machine_id or '-'}")
    print()
    print("=== SUMMARY ===")
    print(json.dumps(lm.summary(ent), indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
