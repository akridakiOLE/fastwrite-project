"""
FastWrite Desktop — License Manager (Phase 2)

Σκοπός
------
Τοπική επαλήθευση signed entitlement JWT για το desktop app + τοπικός
μετρητής χρήσης. Καμία επικοινωνία με server σε αυτή τη φάση
(heartbeat θα μπει στο Phase 7).

Σχεδιαστικές Αποφάσεις (defaults — αλλάζουν εύκολα)
---------------------------------------------------
* Αλγόριθμος: **ES256 (ECDSA P-256 + SHA-256)** — μικρά tokens, ευρέως
  υποστηριζόμενο, public key ασφαλώς ενσωματώσιμο στο binary.
* **Client = verify only.** Το private key μένει εκτός desktop binary.
  Η υπογραφή γίνεται είτε χειροκίνητα (`tools/license_issue.py`) είτε
  μελλοντικά από τον licensing server.
* License file path:  `<BASE_DIR>/secrets/license.jwt`
  όπου `BASE_DIR = FASTWRITE_BASE_DIR env var` (Phase 1 convention).
  Στο desktop = `%APPDATA%\\FastWrite\\secrets\\license.jwt`.
* Public key path:    `<PROJECT_ROOT>/license_pubkey.pem`
  (PEM SubjectPublicKeyInfo) — κάνει embed στο PyInstaller bundle.
* Local counter: νέος πίνακας `license_usage` (στήλες παρακάτω).
  Πρόσκτηση γίνεται μέσα από το `db_manager.DatabaseManager` ώστε να
  χρησιμοποιεί το ίδιο `threading.RLock` με το `record_usage_event` (v14).
* Grace period: 7 ημέρες. Αν `last_heartbeat_at > 7d ago` ΚΑΙ
  ο server είναι unreachable → μπλοκάρισμα. (Heartbeat θα μπει Phase 7.)
* Schema (claims):
    iss   "fastwrite.tech"
    aud   "fastwrite-desktop"
    sub   user identifier (email ή uuid)
    iat   issued-at (unix)
    exp   expiry (unix)
    nbf   not-before (unix, optional)
    jti   unique license id (uuid)
    plan  "trial" | "solo" | "team" | "business"  (ελεύθερο string)
    limits: {
        "docs_per_period": int | None  # None = unlimited
        "pages_per_period": int | None
        "period_days": int             # rolling window
        "features": [str, ...]         # ["extract","batch","approve","tour",...]
    }
    machine_id: str | None  # προαιρετικό binding με συγκεκριμένο μηχάνημα

Δημόσιες κλάσεις/συναρτήσεις
----------------------------
* `LicenseError`                        — base exception
* `LicenseMissingError`                 — δεν υπάρχει license.jwt
* `LicenseInvalidError`                 — bad signature / wrong issuer / expired
* `LicenseLimitReachedError`            — counter εξαντλήθηκε
* `Entitlement` (dataclass)             — parsed claims
* `LicenseManager`                      — main API
"""

from __future__ import annotations

import os
import time
import uuid
import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import jwt  # PyJWT (ήδη στο requirements)


log = logging.getLogger("fastwrite.license")


# ── Σταθερές ────────────────────────────────────────────────────────────────

ISSUER   = "fastwrite.tech"
AUDIENCE = "fastwrite-desktop"
ALGO     = "ES256"
LEEWAY_S = 30  # ανοχή ρολογιού (clock skew)

GRACE_PERIOD_DAYS = 7

# Default trial entitlement που χρησιμοποιείται όταν δεν υπάρχει license file.
# Επιτρέπει register + δοκιμή με cap 10000 docs (lifetime — χωρίς πρακτικό
# χρονικό όριο· το period_days είναι μεγάλο ώστε να ΜΗΝ γίνεται reset του counter).
TRIAL_DEFAULTS = {
    "plan": "trial",
    "limits": {
        "docs_per_period": 10000,
        "pages_per_period": None,
        "period_days": 3650,
        "features": ["extract", "approve", "tour"],
    },
}


# ── Exceptions ──────────────────────────────────────────────────────────────

class LicenseError(Exception):
    """Base για όλα τα licensing σφάλματα."""


class LicenseMissingError(LicenseError):
    """Δεν βρέθηκε license.jwt στον αναμενόμενο φάκελο."""


class LicenseInvalidError(LicenseError):
    """Το JWT είναι ληγμένο, tampered, ή λάθος issuer/audience."""


class LicenseLimitReachedError(LicenseError):
    """Ο τοπικός μετρητής έχει φτάσει το όριο του τρέχοντος period."""


# ── Δομές δεδομένων ─────────────────────────────────────────────────────────

@dataclass
class Entitlement:
    """Verified entitlement (parsed JWT claims)."""
    jti: str
    sub: str
    plan: str
    iat: int
    exp: int
    limits: dict[str, Any] = field(default_factory=dict)
    machine_id: str | None = None
    raw_claims: dict[str, Any] = field(default_factory=dict)

    # ── Βοηθητικά ─────────────────────────────────────────────────────────
    @property
    def is_trial(self) -> bool:
        return self.plan == "trial"

    @property
    def docs_per_period(self) -> int | None:
        return self.limits.get("docs_per_period")

    @property
    def pages_per_period(self) -> int | None:
        return self.limits.get("pages_per_period")

    @property
    def period_days(self) -> int:
        return int(self.limits.get("period_days") or 30)

    @property
    def features(self) -> list[str]:
        return list(self.limits.get("features") or [])

    def has_feature(self, name: str) -> bool:
        feats = self.features
        # Αν το claim λείπει εντελώς, επιτρέπουμε τα πάντα (back-compat).
        return (not feats) or (name in feats)


# ── License Manager ─────────────────────────────────────────────────────────

class LicenseManager:
    """
    Verify + χρήση τοπικού μετρητή. Δεν επικοινωνεί με server.

    Παράδειγμα χρήσης:
        lm = LicenseManager(base_dir=Path(os.environ['FASTWRITE_BASE_DIR']),
                            public_key_pem=Path(__file__).with_name('license_pubkey.pem').read_bytes(),
                            db=db_manager_instance)

        ent = lm.load_entitlement()      # μπορεί να επιστρέψει trial defaults
        lm.assert_feature(ent, 'extract')
        lm.consume(ent, docs=1, pages=3)  # raise αν εξαντληθεί
    """

    def __init__(
        self,
        base_dir: Path,
        public_key_pem: bytes | str,
        db,  # DatabaseManager — duck-typed για να μη φέρουμε hard import
        license_filename: str = "license.jwt",
        clock: callable = time.time,
    ):
        self.base_dir = Path(base_dir)
        self.license_path = self.base_dir / "secrets" / license_filename
        self.public_key = public_key_pem if isinstance(public_key_pem, bytes) else public_key_pem.encode("utf-8")
        self.db = db
        self._clock = clock
        self._ensure_counter_table()

    # ── Counter table (μία φορά, idempotent) ─────────────────────────────
    def _ensure_counter_table(self) -> None:
        sql = """
        CREATE TABLE IF NOT EXISTS license_usage (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            license_id      TEXT    NOT NULL,
            period_start    INTEGER NOT NULL,
            docs_consumed   INTEGER NOT NULL DEFAULT 0,
            pages_consumed  INTEGER NOT NULL DEFAULT 0,
            last_check_at   INTEGER NOT NULL,
            UNIQUE (license_id, period_start)
        );
        """
        conn = getattr(self.db, "conn", None)
        lock = getattr(self.db, "_write_lock", None)
        if conn is None:
            log.warning("DatabaseManager χωρίς .conn — counter table δεν δημιουργήθηκε")
            return
        if lock is not None:
            with lock:
                conn.execute(sql)
                conn.commit()
        else:
            conn.execute(sql)
            conn.commit()

    # ── Load + verify ────────────────────────────────────────────────────
    def load_entitlement(self, allow_trial_fallback: bool = True) -> Entitlement:
        """
        Διαβάζει + επαληθεύει το license.jwt. Αν λείπει και
        `allow_trial_fallback=True`, επιστρέφει trial entitlement.
        Αν είναι tampered/expired → `LicenseInvalidError`.
        """
        if not self.license_path.exists():
            if allow_trial_fallback:
                return self._make_trial_entitlement()
            raise LicenseMissingError(f"Δεν βρέθηκε license στο {self.license_path}")

        token = self.license_path.read_text(encoding="utf-8").strip()
        try:
            claims = jwt.decode(
                token,
                self.public_key,
                algorithms=[ALGO],
                audience=AUDIENCE,
                issuer=ISSUER,
                leeway=LEEWAY_S,
            )
        except jwt.ExpiredSignatureError as e:
            raise LicenseInvalidError("License has expired") from e
        except jwt.InvalidIssuerError as e:
            raise LicenseInvalidError("License issuer mismatch") from e
        except jwt.InvalidAudienceError as e:
            raise LicenseInvalidError("License audience mismatch") from e
        except jwt.InvalidSignatureError as e:
            raise LicenseInvalidError("License signature is invalid") from e
        except jwt.PyJWTError as e:
            raise LicenseInvalidError(f"License rejected: {e}") from e

        return self._claims_to_entitlement(claims)

    def _claims_to_entitlement(self, claims: dict[str, Any]) -> Entitlement:
        try:
            return Entitlement(
                jti=str(claims["jti"]),
                sub=str(claims.get("sub", "")),
                plan=str(claims.get("plan", "unknown")),
                iat=int(claims["iat"]),
                exp=int(claims["exp"]),
                limits=dict(claims.get("limits") or {}),
                machine_id=claims.get("machine_id"),
                raw_claims=claims,
            )
        except (KeyError, ValueError, TypeError) as e:
            raise LicenseInvalidError(f"Missing/invalid claims: {e}") from e

    def _make_trial_entitlement(self) -> Entitlement:
        """Δομεί ένα τοπικό trial χωρίς υπογραφή. Το jti ΚΑΙ το iat είναι σταθερά
        per-machine ώστε ο doc counter να επιμένει σωστά μεταξύ restarts/requests
        (το period_start εξαρτάται από το iat — αν το iat γλιστράει, ο counter
        μηδενίζεται και το όριο δεν επιβάλλεται ποτέ)."""
        trial_id = self._stable_trial_id()
        started = self._stable_trial_started()
        return Entitlement(
            jti=trial_id,
            sub="trial",
            plan=TRIAL_DEFAULTS["plan"],
            iat=started,
            exp=started + TRIAL_DEFAULTS["limits"]["period_days"] * 86400,
            limits=dict(TRIAL_DEFAULTS["limits"]),
            machine_id=None,
            raw_claims={"_synthetic_trial": True},
        )

    def _stable_trial_id(self) -> str:
        """Σταθερό id για το τοπικό trial — αποθηκεύεται σε αρχείο
        στον secrets φάκελο ώστε να επιβιώνει restarts."""
        marker = self.base_dir / "secrets" / ".trial_id"
        marker.parent.mkdir(parents=True, exist_ok=True)
        if marker.exists():
            return marker.read_text(encoding="utf-8").strip()
        new_id = f"trial-{uuid.uuid4().hex}"
        marker.write_text(new_id, encoding="utf-8")
        try:
            os.chmod(marker, 0o600)
        except OSError:
            pass  # Windows: αγνοούμε
        return new_id

    def _stable_trial_started(self) -> int:
        """Σταθερό timestamp έναρξης trial (persisted στο secrets/.trial_started)
        ώστε το period_start — που εξαρτάται από το iat — να μένει σταθερό και ο
        doc counter να αθροίζεται σωστά μεταξύ restarts/requests."""
        marker = self.base_dir / "secrets" / ".trial_started"
        marker.parent.mkdir(parents=True, exist_ok=True)
        if marker.exists():
            try:
                return int(marker.read_text(encoding="utf-8").strip())
            except (ValueError, OSError):
                pass
        started = int(self._clock())
        marker.write_text(str(started), encoding="utf-8")
        try:
            os.chmod(marker, 0o600)
        except OSError:
            pass  # Windows: αγνοούμε
        return started

    # ── Feature gating ───────────────────────────────────────────────────
    def assert_feature(self, ent: Entitlement, feature: str) -> None:
        if not ent.has_feature(feature):
            raise LicenseLimitReachedError(
                f"Feature '{feature}' δεν περιλαμβάνεται στο plan '{ent.plan}'"
            )

    # ── Counter ──────────────────────────────────────────────────────────
    def usage(self, ent: Entitlement) -> dict[str, int]:
        """Επιστρέφει {'docs': X, 'pages': Y} για το τρέχον period."""
        period_start = self._current_period_start(ent)
        row = self._fetch_usage_row(ent.jti, period_start)
        return {
            "period_start": period_start,
            "docs_consumed": row["docs_consumed"] if row else 0,
            "pages_consumed": row["pages_consumed"] if row else 0,
        }

    def remaining(self, ent: Entitlement) -> dict[str, int | None]:
        """Επιστρέφει {'docs': N | None, 'pages': N | None} (None = unlimited)."""
        used = self.usage(ent)
        return {
            "docs": None if ent.docs_per_period is None
                    else max(0, ent.docs_per_period - used["docs_consumed"]),
            "pages": None if ent.pages_per_period is None
                     else max(0, ent.pages_per_period - used["pages_consumed"]),
        }

    def consume(self, ent: Entitlement, docs: int = 0, pages: int = 0) -> dict[str, int]:
        """
        Αυξάνει τον τοπικό μετρητή. Raise `LicenseLimitReachedError` αν θα
        ξεπεραστεί κάποιο όριο. Atomic via DatabaseManager._write_lock.
        """
        if docs < 0 or pages < 0:
            raise ValueError("Τα docs/pages πρέπει να είναι >= 0")
        if docs == 0 and pages == 0:
            return self.usage(ent)

        period_start = self._current_period_start(ent)
        conn = self.db.conn
        lock = getattr(self.db, "_write_lock", None)

        def _do():
            row = self._fetch_usage_row(ent.jti, period_start)
            cur_docs  = (row["docs_consumed"]  if row else 0) + docs
            cur_pages = (row["pages_consumed"] if row else 0) + pages

            if ent.docs_per_period is not None and cur_docs > ent.docs_per_period:
                raise LicenseLimitReachedError(
                    f"docs limit ({ent.docs_per_period}) θα ξεπεραστεί "
                    f"(τρέχουσα κατανάλωση: {cur_docs - docs}, αίτημα: {docs})"
                )
            if ent.pages_per_period is not None and cur_pages > ent.pages_per_period:
                raise LicenseLimitReachedError(
                    f"pages limit ({ent.pages_per_period}) θα ξεπεραστεί "
                    f"(τρέχουσα κατανάλωση: {cur_pages - pages}, αίτημα: {pages})"
                )

            now = int(self._clock())
            if row is None:
                conn.execute(
                    "INSERT INTO license_usage (license_id, period_start, "
                    "docs_consumed, pages_consumed, last_check_at) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (ent.jti, period_start, cur_docs, cur_pages, now),
                )
            else:
                conn.execute(
                    "UPDATE license_usage SET docs_consumed = ?, "
                    "pages_consumed = ?, last_check_at = ? "
                    "WHERE license_id = ? AND period_start = ?",
                    (cur_docs, cur_pages, now, ent.jti, period_start),
                )
            conn.commit()
            return {"docs_consumed": cur_docs, "pages_consumed": cur_pages,
                    "period_start": period_start}

        if lock is not None:
            with lock:
                return _do()
        return _do()

    # ── Internals ────────────────────────────────────────────────────────
    def _current_period_start(self, ent: Entitlement) -> int:
        """Rolling-window αρχή. Χρησιμοποιούμε iat ως anchor."""
        now = int(self._clock())
        period_s = ent.period_days * 86400
        if period_s <= 0:
            return ent.iat
        # Πόσα ολόκληρα periods έχουν περάσει από iat;
        delta = max(0, now - ent.iat)
        n = delta // period_s
        return ent.iat + n * period_s

    def _fetch_usage_row(self, license_id: str, period_start: int):
        cur = self.db.conn.execute(
            "SELECT docs_consumed, pages_consumed, last_check_at "
            "FROM license_usage WHERE license_id = ? AND period_start = ?",
            (license_id, period_start),
        )
        row = cur.fetchone()
        if row is None:
            return None
        return {
            "docs_consumed":  row[0],
            "pages_consumed": row[1],
            "last_check_at":  row[2],
        }

    # ── Σύνοψη για UI ────────────────────────────────────────────────────
    def summary(self, ent: Entitlement) -> dict[str, Any]:
        used = self.usage(ent)
        rem = self.remaining(ent)
        return {
            "plan": ent.plan,
            "is_trial": ent.is_trial,
            "exp": ent.exp,
            "period_days": ent.period_days,
            "period_start": used["period_start"],
            "docs": {
                "limit": ent.docs_per_period,
                "consumed": used["docs_consumed"],
                "remaining": rem["docs"],
            },
            "pages": {
                "limit": ent.pages_per_period,
                "consumed": used["pages_consumed"],
                "remaining": rem["pages"],
            },
            "features": ent.features,
        }
