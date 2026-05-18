"""
Tests για το license_manager (Phase 2). Χρησιμοποιεί unittest (όπως
όλα τα υπόλοιπα test_*.py του project — όχι pytest).

Τρέξιμο:
    cd C:\\Users\\User\\fastwrite-project
    venv\\Scripts\\python -m unittest test_license_manager.py -v

Καλύπτει:
* sign + verify (happy path)
* tampered token
* expired token
* wrong issuer / audience
* missing claims
* trial fallback (όταν δεν υπάρχει license file)
* counter increment + atomic update
* docs_per_period limit reached
* pages_per_period limit reached
* unlimited (None) limits
* period rollover (rolling window)
* feature gating
* summary shape
"""

from __future__ import annotations

import os
import sqlite3
import sys
import tempfile
import threading
import time
import unittest
import uuid
from pathlib import Path

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

sys.path.insert(0, str(Path(__file__).resolve().parent))

from license_manager import (
    ALGO,
    AUDIENCE,
    ISSUER,
    Entitlement,
    LicenseInvalidError,
    LicenseLimitReachedError,
    LicenseManager,
    LicenseMissingError,
)


# ── Helpers ─────────────────────────────────────────────────────────────────

class _FakeDB:
    """Ελάχιστο stand-in για το DatabaseManager — μόνο ό,τι χρειάζεται
    το license_manager (.conn + ._write_lock)."""

    def __init__(self):
        self.conn = sqlite3.connect(":memory:", check_same_thread=False)
        self._write_lock = threading.RLock()


def _make_keypair():
    priv = ec.generate_private_key(ec.SECP256R1())
    pub = priv.public_key()
    pub_pem = pub.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return priv, pub_pem


def _issue_license(priv_key, *, sub="user@x", plan="solo", days=365, docs=500,
                   pages=None, period_days=30, features=None,
                   iat=None, jti=None, iss=ISSUER, aud=AUDIENCE):
    now = iat if iat is not None else int(time.time())
    claims = {
        "iss": iss,
        "aud": aud,
        "sub": sub,
        "iat": now,
        "nbf": now,
        "exp": now + days * 86400,
        "jti": jti or f"lic-{uuid.uuid4().hex}",
        "plan": plan,
        "limits": {
            "docs_per_period": docs,
            "pages_per_period": pages,
            "period_days": period_days,
            "features": features if features is not None else ["extract", "approve", "tour"],
        },
    }
    return jwt.encode(claims, priv_key, algorithm=ALGO), claims


def _write_license(base_dir: Path, token: str) -> Path:
    p = base_dir / "secrets" / "license.jwt"
    p.write_text(token, encoding="utf-8")
    return p


# ── Base TestCase (κάνει setup keypair + tmpdir + db για κάθε test) ─────────

class _LicenseTestBase(unittest.TestCase):
    def setUp(self):
        self.priv, self.pub_pem = _make_keypair()
        self._tmp = tempfile.TemporaryDirectory(prefix="fw_lic_test_")
        self.base_dir = Path(self._tmp.name)
        (self.base_dir / "secrets").mkdir(parents=True, exist_ok=True)
        self.db = _FakeDB()

    def tearDown(self):
        try:
            self.db.conn.close()
        except Exception:
            pass
        self._tmp.cleanup()

    def make_lm(self, *, clock=None):
        return LicenseManager(
            base_dir=self.base_dir,
            public_key_pem=self.pub_pem,
            db=self.db,
            clock=clock or time.time,
        )


# ── Verify ──────────────────────────────────────────────────────────────────

class TestVerify(_LicenseTestBase):

    def test_valid_license_loads(self):
        token, _ = _issue_license(self.priv)
        _write_license(self.base_dir, token)
        ent = self.make_lm().load_entitlement()
        self.assertEqual(ent.plan, "solo")
        self.assertEqual(ent.sub, "user@x")
        self.assertEqual(ent.docs_per_period, 500)
        self.assertIsNone(ent.pages_per_period)
        self.assertIn("extract", ent.features)

    def test_missing_license_no_fallback_raises(self):
        lm = self.make_lm()
        with self.assertRaises(LicenseMissingError):
            lm.load_entitlement(allow_trial_fallback=False)

    def test_missing_license_with_fallback_returns_trial(self):
        lm = self.make_lm()
        ent = lm.load_entitlement(allow_trial_fallback=True)
        self.assertTrue(ent.is_trial)
        self.assertEqual(ent.docs_per_period, 100)  # default trial cap
        self.assertEqual(ent.period_days, 14)
        # Stable trial id: δεύτερο load πρέπει να δώσει ίδιο jti
        ent2 = lm.load_entitlement()
        self.assertEqual(ent.jti, ent2.jti)

    def test_tampered_token_raises(self):
        token, _ = _issue_license(self.priv)
        tampered = token[:-5] + ("A" if token[-5] != "A" else "B") + token[-4:]
        _write_license(self.base_dir, tampered)
        with self.assertRaises(LicenseInvalidError):
            self.make_lm().load_entitlement()

    def test_expired_token_raises(self):
        old = int(time.time()) - 365 * 86400 - 60
        token, _ = _issue_license(self.priv, iat=old, days=1)
        _write_license(self.base_dir, token)
        with self.assertRaises(LicenseInvalidError):
            self.make_lm().load_entitlement()

    def test_wrong_issuer_raises(self):
        token, _ = _issue_license(self.priv, iss="other-issuer")
        _write_license(self.base_dir, token)
        with self.assertRaises(LicenseInvalidError):
            self.make_lm().load_entitlement()

    def test_wrong_audience_raises(self):
        token, _ = _issue_license(self.priv, aud="some-other-app")
        _write_license(self.base_dir, token)
        with self.assertRaises(LicenseInvalidError):
            self.make_lm().load_entitlement()

    def test_missing_jti_raises(self):
        now = int(time.time())
        claims = {
            "iss": ISSUER, "aud": AUDIENCE, "sub": "u",
            "iat": now, "exp": now + 3600,
            "plan": "solo",
            "limits": {"docs_per_period": 1, "pages_per_period": None,
                       "period_days": 30, "features": ["extract"]},
        }
        token = jwt.encode(claims, self.priv, algorithm=ALGO)
        _write_license(self.base_dir, token)
        with self.assertRaises(LicenseInvalidError):
            self.make_lm().load_entitlement()


# ── Counter ─────────────────────────────────────────────────────────────────

class TestCounter(_LicenseTestBase):

    def _setup_with_limits(self, **kwargs):
        token, _ = _issue_license(self.priv, **kwargs)
        _write_license(self.base_dir, token)
        lm = self.make_lm()
        return lm, lm.load_entitlement()

    def test_consume_increments_usage(self):
        lm, ent = self._setup_with_limits(docs=10, pages=100)
        self.assertEqual(lm.usage(ent)["docs_consumed"], 0)
        lm.consume(ent, docs=3, pages=12)
        self.assertEqual(lm.usage(ent)["docs_consumed"], 3)
        self.assertEqual(lm.usage(ent)["pages_consumed"], 12)
        lm.consume(ent, docs=1, pages=4)
        self.assertEqual(lm.usage(ent)["docs_consumed"], 4)
        self.assertEqual(lm.usage(ent)["pages_consumed"], 16)

    def test_docs_limit_reached(self):
        lm, ent = self._setup_with_limits(docs=5)
        lm.consume(ent, docs=5)
        with self.assertRaises(LicenseLimitReachedError):
            lm.consume(ent, docs=1)
        # Δεν αυξήθηκε ο μετρητής μετά το exception
        self.assertEqual(lm.usage(ent)["docs_consumed"], 5)

    def test_pages_limit_reached(self):
        lm, ent = self._setup_with_limits(docs=None, pages=10)
        lm.consume(ent, pages=10)
        with self.assertRaises(LicenseLimitReachedError):
            lm.consume(ent, pages=1)

    def test_unlimited_docs_never_raises(self):
        lm, ent = self._setup_with_limits(docs=None, pages=None)
        lm.consume(ent, docs=10_000, pages=50_000)  # δεν πρέπει να σκάσει
        rem = lm.remaining(ent)
        self.assertIsNone(rem["docs"])
        self.assertIsNone(rem["pages"])

    def test_remaining_reports_correctly(self):
        lm, ent = self._setup_with_limits(docs=10, pages=50)
        lm.consume(ent, docs=3, pages=20)
        self.assertEqual(lm.remaining(ent), {"docs": 7, "pages": 30})

    def test_period_rollover_resets_counter(self):
        t0 = int(time.time())
        token, _ = _issue_license(self.priv, docs=5, period_days=1, iat=t0)
        _write_license(self.base_dir, token)

        clock_now = [t0]
        lm = self.make_lm(clock=lambda: clock_now[0])
        ent = lm.load_entitlement()
        lm.consume(ent, docs=5)
        with self.assertRaises(LicenseLimitReachedError):
            lm.consume(ent, docs=1)

        # Πέρασε το period
        clock_now[0] = t0 + 2 * 86400
        self.assertEqual(lm.usage(ent)["docs_consumed"], 0)
        lm.consume(ent, docs=3)
        self.assertEqual(lm.usage(ent)["docs_consumed"], 3)

    def test_consume_negative_raises(self):
        lm, ent = self._setup_with_limits()
        with self.assertRaises(ValueError):
            lm.consume(ent, docs=-1)


# ── Features ────────────────────────────────────────────────────────────────

class TestFeatures(_LicenseTestBase):

    def _setup_with_features(self, features):
        token, _ = _issue_license(self.priv, features=features)
        _write_license(self.base_dir, token)
        lm = self.make_lm()
        return lm, lm.load_entitlement()

    def test_feature_allowed(self):
        lm, ent = self._setup_with_features(["extract", "approve"])
        # Δεν πετάει
        lm.assert_feature(ent, "extract")

    def test_feature_blocked(self):
        lm, ent = self._setup_with_features(["extract"])
        with self.assertRaises(LicenseLimitReachedError):
            lm.assert_feature(ent, "batch")

    def test_empty_features_means_all_allowed(self):
        lm, ent = self._setup_with_features([])
        lm.assert_feature(ent, "anything-goes")


# ── Summary ─────────────────────────────────────────────────────────────────

class TestSummary(_LicenseTestBase):

    def test_summary_shape(self):
        token, _ = _issue_license(self.priv, docs=20, pages=None,
                                  features=["extract", "approve"])
        _write_license(self.base_dir, token)
        lm = self.make_lm()
        ent = lm.load_entitlement()
        lm.consume(ent, docs=4)
        s = lm.summary(ent)
        self.assertEqual(s["plan"], "solo")
        self.assertFalse(s["is_trial"])
        self.assertEqual(s["docs"]["limit"], 20)
        self.assertEqual(s["docs"]["consumed"], 4)
        self.assertEqual(s["docs"]["remaining"], 16)
        self.assertIsNone(s["pages"]["limit"])
        self.assertIn("extract", s["features"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
