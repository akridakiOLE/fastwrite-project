"""
ECDSA P-256 keypair generator για το FastWrite licensing system (Phase 2).

ΧΡΗΣΗ (μία φορά, στο dev μηχάνημα — ΟΧΙ στο desktop binary):

    python tools/license_keygen.py --out-dir secrets/

Δημιουργεί:
    secrets/license_private.pem   ← ΑΥΣΤΗΡΑ ΚΑΤΩ ΑΠΟ secrets/, ΟΧΙ στο git
    license_pubkey.pem            ← στο project root, ΘΑ μπει στο git
                                    και στο PyInstaller bundle

Αυτό τρέχει μία φορά. Το private key χρησιμοποιείται για να υπογράφει
license JWTs με το `tools/license_issue.py`. Το public key ενσωματώνεται
στο desktop binary για να επαληθεύει licenses τοπικά.

ΠΡΟΣΟΧΗ:
* Μην ξανατρέξεις αν υπάρχει ήδη private key — θα γίνουν invalid ΟΛΑ
  τα licenses που έχεις εκδώσει.
* Το `secrets/` αγνοείται από το `.gitignore`. Επιβεβαίωσε με
  `git check-ignore secrets/license_private.pem` πριν οποιαδήποτε
  ενέργεια γκιτ.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


PROJECT_ROOT = Path(__file__).resolve().parent.parent


def generate_keypair(out_dir: Path, force: bool = False) -> tuple[Path, Path]:
    out_dir = Path(out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    priv_path = out_dir / "license_private.pem"
    pub_path  = PROJECT_ROOT / "license_pubkey.pem"

    if priv_path.exists() and not force:
        raise SystemExit(
            f"ΣΦΑΛΜΑ: υπάρχει ήδη private key στο {priv_path}.\n"
            "Αν θες σίγουρα νέο keypair, χρησιμοποίησε --force "
            "(θα invalidate ΟΛΑ τα ήδη εκδοθέντα licenses)."
        )

    priv_key = ec.generate_private_key(ec.SECP256R1())
    pub_key = priv_key.public_key()

    priv_pem = priv_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    pub_pem = pub_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )

    priv_path.write_bytes(priv_pem)
    pub_path.write_bytes(pub_pem)

    try:
        os.chmod(priv_path, 0o600)
    except OSError:
        pass  # Windows: αγνοούμε, αλλά κράτα secrets/ έξω από το git

    return priv_path, pub_path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out-dir", default=str(PROJECT_ROOT / "secrets"),
                        help="Φάκελος για το private key (default: secrets/)")
    parser.add_argument("--force", action="store_true",
                        help="Επιτρέπει overwrite υπάρχοντος keypair")
    args = parser.parse_args()

    priv, pub = generate_keypair(Path(args.out_dir), force=args.force)
    print(f"OK private key  -> {priv}  (chmod 600, ΜΗΝ γίνει commit)")
    print(f"OK public  key  -> {pub}  (commit + ship με το binary)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
