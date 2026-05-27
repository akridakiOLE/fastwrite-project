"""
Unit tests για xero_connector.py (Phase A: OAuth PKCE + Token Management).

Coverage:
    - PKCE generation (RFC 7636 conformance)
    - State CSRF protection
    - Auth URL building
    - Token exchange (code → tokens) με mocked HTTP
    - Refresh token logic με mocked HTTP
    - Tenant fetching
    - Fernet encrypt/decrypt roundtrip
    - Storage (save + load + cache)
    - Auto-refresh στο get_valid_access_token
    - Disconnect (file deletion + best-effort revoke)
    - Config errors (missing XERO_CLIENT_ID)
    - Callback handler (state mismatch, missing code)

Run:
    python -m unittest test_xero_connector -v
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import tempfile
import threading
import time
import unittest
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

import xero_connector as xc


FAKE_CLIENT_ID = "fake-client-id-1234567890"


class _FakeResponse:
    """Minimal stand-in για requests.Response στα mocks."""

    def __init__(self, status_code: int, json_data=None, text: str = ""):
        self.status_code = status_code
        self._json = json_data if json_data is not None else {}
        self.text = text or json.dumps(self._json)

    def json(self):
        return self._json


def _make_token_response(expires_in: int = 1800, suffix: str = "v1") -> dict:
    return {
        "access_token": f"access-token-{suffix}",
        "refresh_token": f"refresh-token-{suffix}",
        "id_token": f"id-token-{suffix}",
        "expires_in": expires_in,
        "token_type": "Bearer",
        "scope": "offline_access openid accounting.invoices",
    }


# ── PKCE tests ──────────────────────────────────────────────────────────────


class TestPkce(unittest.TestCase):

    def test_pair_format(self):
        verifier, challenge = xc.generate_pkce_pair()
        # RFC 7636: verifier 43-128 chars, unreserved URL-safe
        self.assertGreaterEqual(len(verifier), 43)
        self.assertLessEqual(len(verifier), 128)
        # Challenge δεν περιέχει padding "="
        self.assertNotIn("=", challenge)
        # Challenge = base64url(SHA256(verifier))
        expected = base64.urlsafe_b64encode(
            hashlib.sha256(verifier.encode("ascii")).digest()
        ).rstrip(b"=").decode("ascii")
        self.assertEqual(challenge, expected)

    def test_pair_is_random(self):
        v1, c1 = xc.generate_pkce_pair()
        v2, c2 = xc.generate_pkce_pair()
        self.assertNotEqual(v1, v2)
        self.assertNotEqual(c1, c2)

    def test_state_is_random_and_urlsafe(self):
        s1 = xc.generate_state()
        s2 = xc.generate_state()
        self.assertNotEqual(s1, s2)
        # URL-safe: μόνο A-Z a-z 0-9 - _
        for ch in s1:
            self.assertIn(ch.isalnum() or ch in "-_", [True])


# ── XeroTokens dataclass ────────────────────────────────────────────────────


class TestXeroTokens(unittest.TestCase):

    def test_roundtrip(self):
        original = xc.XeroTokens(
            access_token="a",
            refresh_token="r",
            expires_at=datetime(2026, 5, 27, 12, 0, 0, tzinfo=timezone.utc),
            id_token="i",
            scope="offline_access",
            tenants=[{"tenantId": "t1"}],
            active_tenant_id="t1",
        )
        restored = xc.XeroTokens.from_dict(original.to_dict())
        self.assertEqual(restored.access_token, "a")
        self.assertEqual(restored.refresh_token, "r")
        self.assertEqual(restored.expires_at, original.expires_at)
        self.assertEqual(restored.tenants, [{"tenantId": "t1"}])
        self.assertEqual(restored.active_tenant_id, "t1")

    def test_is_expired_true(self):
        past = datetime.now(timezone.utc) - timedelta(seconds=10)
        t = xc.XeroTokens(access_token="a", refresh_token="r", expires_at=past)
        self.assertTrue(t.is_expired())

    def test_is_expired_false(self):
        future = datetime.now(timezone.utc) + timedelta(minutes=10)
        t = xc.XeroTokens(access_token="a", refresh_token="r", expires_at=future)
        self.assertFalse(t.is_expired())

    def test_is_expired_within_leeway(self):
        # 30sec στο μέλλον, leeway 60sec → πρέπει να θεωρηθεί expired
        near = datetime.now(timezone.utc) + timedelta(seconds=30)
        t = xc.XeroTokens(access_token="a", refresh_token="r", expires_at=near)
        self.assertTrue(t.is_expired())

    def test_from_dict_handles_naive_datetime(self):
        # Παλιά αρχεία ίσως έχουν naive datetime — να αναβαθμίζονται σε UTC
        d = {
            "access_token": "a",
            "refresh_token": "r",
            "expires_at": "2026-05-27T12:00:00",  # naive
        }
        t = xc.XeroTokens.from_dict(d)
        self.assertEqual(t.expires_at.tzinfo, timezone.utc)


# ── XeroConnector base test (με tempdir + mocked HTTP) ──────────────────────


class XeroConnectorTestBase(unittest.TestCase):

    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.secrets_dir = Path(self.tmpdir.name) / "secrets"
        self.mock_session = mock.MagicMock()
        self.connector = xc.XeroConnector(
            secrets_dir=self.secrets_dir,
            client_id=FAKE_CLIENT_ID,
            http_session=self.mock_session,
        )

    def tearDown(self):
        self.tmpdir.cleanup()


# ── Config ──────────────────────────────────────────────────────────────────


class TestConfig(unittest.TestCase):

    def test_missing_client_id_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            # Καθαρίζουμε το env var για να δοκιμάσουμε missing case
            with mock.patch.dict(os.environ, {}, clear=True):
                with self.assertRaises(xc.XeroConfigError):
                    xc.XeroConnector(secrets_dir=Path(tmp))

    def test_env_var_client_id_picked_up(self):
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.dict(os.environ, {"XERO_CLIENT_ID": "from-env"}):
                connector = xc.XeroConnector(secrets_dir=Path(tmp))
                self.assertEqual(connector.client_id, "from-env")

    def test_explicit_client_id_overrides_env(self):
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.dict(os.environ, {"XERO_CLIENT_ID": "from-env"}):
                connector = xc.XeroConnector(secrets_dir=Path(tmp), client_id="explicit")
                self.assertEqual(connector.client_id, "explicit")


# ── Machine key (reuse με KeyManager) ───────────────────────────────────────


class TestMachineKey(XeroConnectorTestBase):

    def test_machine_key_created_on_first_run(self):
        key_path = self.secrets_dir / xc.MACHINE_KEY_FILENAME
        self.assertTrue(key_path.exists())
        self.assertGreater(len(key_path.read_bytes()), 0)

    def test_machine_key_reused_on_second_run(self):
        key_path = self.secrets_dir / xc.MACHINE_KEY_FILENAME
        original_key = key_path.read_bytes()
        # New connector instance — δεν πρέπει να αντικαταστήσει το key
        xc.XeroConnector(
            secrets_dir=self.secrets_dir,
            client_id=FAKE_CLIENT_ID,
            http_session=mock.MagicMock(),
        )
        self.assertEqual(key_path.read_bytes(), original_key)


# ── Auth URL ────────────────────────────────────────────────────────────────


class TestAuthUrl(XeroConnectorTestBase):

    def test_url_contains_required_params(self):
        url = self.connector.build_auth_url("CHAL", "STATE")
        parsed = urllib.parse.urlparse(url)
        params = urllib.parse.parse_qs(parsed.query)
        self.assertEqual(params["response_type"], ["code"])
        self.assertEqual(params["client_id"], [FAKE_CLIENT_ID])
        self.assertEqual(params["redirect_uri"], [xc.REDIRECT_URI])
        self.assertEqual(params["state"], ["STATE"])
        self.assertEqual(params["code_challenge"], ["CHAL"])
        self.assertEqual(params["code_challenge_method"], ["S256"])
        # Όλα τα default scopes πρέπει να είναι παρόντα
        scope = params["scope"][0]
        for s in xc.DEFAULT_SCOPES:
            self.assertIn(s, scope)


# ── Token Exchange ──────────────────────────────────────────────────────────


class TestTokenExchange(XeroConnectorTestBase):

    def test_exchange_success(self):
        self.mock_session.post.return_value = _FakeResponse(200, _make_token_response())
        tokens = self.connector._exchange_code_for_tokens("CODE", "VERIFIER")
        self.assertEqual(tokens.access_token, "access-token-v1")
        self.assertEqual(tokens.refresh_token, "refresh-token-v1")
        self.assertEqual(tokens.token_type, "Bearer")
        # expires_at πρέπει να είναι ~30min στο μέλλον
        delta = (tokens.expires_at - datetime.now(timezone.utc)).total_seconds()
        self.assertGreater(delta, 1700)
        self.assertLess(delta, 1900)

        # Verify το POST έγινε με σωστό payload
        call_kwargs = self.mock_session.post.call_args
        self.assertEqual(call_kwargs.args[0], xc.XERO_TOKEN_URL)
        payload = call_kwargs.kwargs["data"]
        self.assertEqual(payload["grant_type"], "authorization_code")
        self.assertEqual(payload["code"], "CODE")
        self.assertEqual(payload["code_verifier"], "VERIFIER")
        self.assertEqual(payload["client_id"], FAKE_CLIENT_ID)

    def test_exchange_http_error_raises(self):
        self.mock_session.post.return_value = _FakeResponse(400, text="invalid_grant")
        with self.assertRaises(xc.XeroTokenError):
            self.connector._exchange_code_for_tokens("CODE", "VERIFIER")

    def test_exchange_network_error_raises(self):
        import requests as _req
        self.mock_session.post.side_effect = _req.ConnectionError("no route")
        with self.assertRaises(xc.XeroTokenError):
            self.connector._exchange_code_for_tokens("CODE", "VERIFIER")


# ── Refresh ─────────────────────────────────────────────────────────────────


class TestRefresh(XeroConnectorTestBase):

    def test_refresh_success(self):
        self.mock_session.post.return_value = _FakeResponse(200, _make_token_response(suffix="v2"))
        tokens = self.connector._refresh_token_request("OLD-REFRESH")
        self.assertEqual(tokens.access_token, "access-token-v2")

        payload = self.mock_session.post.call_args.kwargs["data"]
        self.assertEqual(payload["grant_type"], "refresh_token")
        self.assertEqual(payload["refresh_token"], "OLD-REFRESH")

    def test_refresh_invalid_grant_raises(self):
        self.mock_session.post.return_value = _FakeResponse(400, text="invalid_grant")
        with self.assertRaises(xc.XeroTokenError):
            self.connector._refresh_token_request("EXPIRED")


# ── Tenants ─────────────────────────────────────────────────────────────────


class TestTenants(XeroConnectorTestBase):

    def test_fetch_tenants_success(self):
        tenants_data = [
            {"tenantId": "t1", "tenantName": "ABC Ltd", "tenantType": "ORGANISATION"},
            {"tenantId": "t2", "tenantName": "XYZ Inc", "tenantType": "ORGANISATION"},
        ]
        self.mock_session.get.return_value = _FakeResponse(200, tenants_data)
        result = self.connector._fetch_tenants("ACCESS-TOKEN")
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["tenantId"], "t1")

        call_kwargs = self.mock_session.get.call_args
        self.assertEqual(call_kwargs.args[0], xc.XERO_CONNECTIONS_URL)
        self.assertEqual(
            call_kwargs.kwargs["headers"]["Authorization"], "Bearer ACCESS-TOKEN"
        )

    def test_fetch_tenants_unauthorized_raises(self):
        self.mock_session.get.return_value = _FakeResponse(401, text="Unauthorized")
        with self.assertRaises(xc.XeroTokenError):
            self.connector._fetch_tenants("BAD")


# ── Storage (Fernet roundtrip) ──────────────────────────────────────────────


class TestStorage(XeroConnectorTestBase):

    def _make_tokens(self, expires_in_sec: int = 1800) -> xc.XeroTokens:
        return xc.XeroTokens(
            access_token="a",
            refresh_token="r",
            expires_at=datetime.now(timezone.utc) + timedelta(seconds=expires_in_sec),
            id_token="i",
            scope="offline_access",
            tenants=[{"tenantId": "t1", "tenantName": "ABC Ltd"}],
            active_tenant_id="t1",
        )

    def test_save_creates_encrypted_file(self):
        tokens = self._make_tokens()
        self.connector._save_tokens(tokens)
        token_file = self.secrets_dir / xc.TOKEN_FILENAME
        self.assertTrue(token_file.exists())
        raw = token_file.read_bytes()
        # Fernet ciphertext ξεκινάει με "gAAAAA"
        self.assertTrue(raw.startswith(b"gAAAAA"))
        # ΔΕΝ πρέπει να περιέχει plaintext token values
        self.assertNotIn(b"access_token", raw)

    def test_save_load_roundtrip(self):
        tokens = self._make_tokens()
        self.connector._save_tokens(tokens)
        # Fresh connector instance — διαβάζει από disk, όχι cache
        fresh = xc.XeroConnector(
            secrets_dir=self.secrets_dir,
            client_id=FAKE_CLIENT_ID,
            http_session=mock.MagicMock(),
        )
        loaded = fresh._load_tokens()
        self.assertEqual(loaded.access_token, "a")
        self.assertEqual(loaded.refresh_token, "r")
        self.assertEqual(loaded.active_tenant_id, "t1")

    def test_load_missing_file_raises_not_connected(self):
        with self.assertRaises(xc.XeroNotConnectedError):
            self.connector._load_tokens()


# ── Public API: is_connected, get_valid_access_token, disconnect ────────────


class TestPublicApi(XeroConnectorTestBase):

    def _seed_tokens(self, expires_in_sec: int = 1800) -> xc.XeroTokens:
        tokens = xc.XeroTokens(
            access_token="seed-access",
            refresh_token="seed-refresh",
            expires_at=datetime.now(timezone.utc) + timedelta(seconds=expires_in_sec),
            tenants=[{"tenantId": "t1"}],
            active_tenant_id="t1",
        )
        self.connector._save_tokens(tokens)
        return tokens

    def test_is_connected_false_initially(self):
        self.assertFalse(self.connector.is_connected())

    def test_is_connected_true_after_save(self):
        self._seed_tokens()
        self.assertTrue(self.connector.is_connected())

    def test_get_valid_access_token_no_refresh_needed(self):
        self._seed_tokens()
        token = self.connector.get_valid_access_token()
        self.assertEqual(token, "seed-access")
        self.mock_session.post.assert_not_called()

    def test_get_valid_access_token_auto_refresh(self):
        # Token expired (αρνητικό expires_in)
        self._seed_tokens(expires_in_sec=-10)
        self.mock_session.post.return_value = _FakeResponse(200, _make_token_response(suffix="refreshed"))

        token = self.connector.get_valid_access_token()
        self.assertEqual(token, "access-token-refreshed")
        self.mock_session.post.assert_called_once()

        # Verify το refreshed token αποθηκεύτηκε και διατηρήθηκαν tenants
        loaded = self.connector._load_tokens()
        self.assertEqual(loaded.access_token, "access-token-refreshed")
        self.assertEqual(loaded.tenants, [{"tenantId": "t1"}])
        self.assertEqual(loaded.active_tenant_id, "t1")

    def test_get_tenants(self):
        self._seed_tokens()
        self.assertEqual(self.connector.get_tenants(), [{"tenantId": "t1"}])

    def test_set_active_tenant_valid(self):
        tokens = xc.XeroTokens(
            access_token="a", refresh_token="r",
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            tenants=[{"tenantId": "t1"}, {"tenantId": "t2"}],
            active_tenant_id="t1",
        )
        self.connector._save_tokens(tokens)
        self.connector.set_active_tenant("t2")
        self.assertEqual(self.connector.get_active_tenant_id(), "t2")

    def test_set_active_tenant_invalid_raises(self):
        self._seed_tokens()
        with self.assertRaises(xc.XeroError):
            self.connector.set_active_tenant("unknown-tenant")

    def test_disconnect_deletes_file(self):
        self._seed_tokens()
        self.mock_session.post.return_value = _FakeResponse(200, {})
        self.assertTrue(self.connector.is_connected())
        self.connector.disconnect()
        self.assertFalse(self.connector.is_connected())

    def test_disconnect_survives_revoke_failure(self):
        # Best-effort revoke — αν αποτύχει, το local cleanup πρέπει να συνεχίσει
        self._seed_tokens()
        import requests as _req
        self.mock_session.post.side_effect = _req.ConnectionError("no route")
        self.connector.disconnect()
        self.assertFalse(self.connector.is_connected())


# ── Loopback callback handler (state mismatch, errors) ──────────────────────


class TestLoopbackCallback(unittest.TestCase):
    """
    Integration test για τον loopback HTTP server.
    Σηκώνει τον server, στέλνει HTTP request, verifies result.
    """

    def _send_callback(self, query: str) -> _CallbackTestContext:
        """
        Spawns loopback σε background, στέλνει HTTP GET, επιστρέφει result.
        Επειδή run_loopback_server() blocks, τρέχει σε thread.
        """
        ctx = _CallbackTestContext()

        def runner():
            try:
                ctx.result = xc.run_loopback_server(
                    expected_state="EXPECTED-STATE", timeout_sec=5
                )
            except Exception as e:
                ctx.exception = e
            finally:
                ctx.done.set()

        thread = threading.Thread(target=runner, daemon=True)
        thread.start()

        # Δίνουμε στον server λίγο χρόνο να σηκωθεί
        for _ in range(20):
            time.sleep(0.05)
            try:
                req = urllib.request.Request(
                    f"http://{xc.LOOPBACK_HOST}:{xc.LOOPBACK_PORT}{xc.REDIRECT_PATH}?{query}"
                )
                with urllib.request.urlopen(req, timeout=2):
                    pass
                break
            except (OSError, urllib.request.URLError):
                continue

        ctx.done.wait(timeout=5)
        return ctx

    def test_valid_callback_captures_code(self):
        ctx = self._send_callback("code=ABC123&state=EXPECTED-STATE")
        self.assertIsNone(ctx.exception)
        self.assertEqual(ctx.result.code, "ABC123")
        self.assertEqual(ctx.result.state, "EXPECTED-STATE")
        self.assertIsNone(ctx.result.error)

    def test_state_mismatch_rejected(self):
        ctx = self._send_callback("code=ABC&state=WRONG-STATE")
        self.assertIsNone(ctx.exception)
        self.assertIsNotNone(ctx.result.error)
        self.assertIn("State mismatch", ctx.result.error)
        self.assertIsNone(ctx.result.code)

    def test_missing_code_rejected(self):
        ctx = self._send_callback("state=EXPECTED-STATE")
        self.assertIsNone(ctx.exception)
        self.assertIsNotNone(ctx.result.error)
        self.assertIn("Missing code", ctx.result.error)

    def test_xero_error_in_callback(self):
        ctx = self._send_callback("error=access_denied")
        self.assertIsNone(ctx.exception)
        self.assertIsNotNone(ctx.result.error)
        self.assertIn("access_denied", ctx.result.error)

    def test_timeout_cleans_up_without_crash(self):
        """
        Regression test: όταν ο user δεν ολοκληρώσει το OAuth στο χρόνο, ο
        loopback server πρέπει να κλείσει χωρίς ValueError "Invalid file
        descriptor: -1" race condition.
        """
        import io
        import logging as _logging

        # Capture warnings/errors από το xero_connector logger
        log_buf = io.StringIO()
        handler = _logging.StreamHandler(log_buf)
        handler.setLevel(_logging.WARNING)
        xc.logger.addHandler(handler)
        try:
            with self.assertRaises(xc.XeroOAuthError) as exc_ctx:
                # 1.5 sec timeout — αρκετό για να εγκαταστήσει server αλλά
                # σύντομο για να δοκιμάσει το cleanup path
                xc.run_loopback_server(expected_state="ANY", timeout_sec=1.5)
            self.assertIn("timeout", str(exc_ctx.exception).lower())
        finally:
            xc.logger.removeHandler(handler)

        # Κανένα WARNING/ERROR στο log → καθαρό cleanup
        log_output = log_buf.getvalue()
        self.assertNotIn("Invalid file descriptor", log_output)
        self.assertNotIn("Exception", log_output)


class _CallbackTestContext:
    def __init__(self):
        self.result = None
        self.exception = None
        self.done = threading.Event()


# ── connect() integration με όλα τα mocks ───────────────────────────────────


class TestConnectFlow(XeroConnectorTestBase):
    """Smoke test του full connect() flow με mocked browser + mocked Xero API."""

    def test_connect_happy_path(self):
        # Mock Xero API responses
        token_resp = _FakeResponse(200, _make_token_response())
        self.mock_session.post.return_value = token_resp
        self.mock_session.get.return_value = _FakeResponse(
            200, [{"tenantId": "t1", "tenantName": "ABC Ltd", "tenantType": "ORGANISATION"}]
        )

        # Mock browser launch + loopback to simulate user completing OAuth
        def fake_loopback(expected_state, timeout_sec=300):
            result = xc._CallbackResult()
            result.code = "FAKE-CODE"
            result.state = expected_state
            return result

        with mock.patch.object(xc, "run_loopback_server", side_effect=fake_loopback):
            with mock.patch.object(xc.webbrowser, "open") as mock_browser:
                tokens = self.connector.connect()

        mock_browser.assert_called_once()
        auth_url = mock_browser.call_args.args[0]
        self.assertIn(xc.XERO_AUTH_URL, auth_url)
        self.assertIn(FAKE_CLIENT_ID, auth_url)

        self.assertEqual(tokens.access_token, "access-token-v1")
        self.assertEqual(len(tokens.tenants), 1)
        self.assertEqual(tokens.active_tenant_id, "t1")
        self.assertTrue(self.connector.is_connected())

    def test_connect_user_denies_raises(self):
        def fake_loopback(expected_state, timeout_sec=300):
            result = xc._CallbackResult()
            result.error = "access_denied"
            return result

        with mock.patch.object(xc, "run_loopback_server", side_effect=fake_loopback):
            with mock.patch.object(xc.webbrowser, "open"):
                with self.assertRaises(xc.XeroOAuthError):
                    self.connector.connect()



# ── Async OAuth (start_oauth / get_oauth_status) για Flask integration ──────


class TestAsyncOAuth(XeroConnectorTestBase):
    """
    Tests για το async pattern που χρησιμοποιεί το Flask endpoint.
    start_oauth() returns auth_url αμέσως + spawns background thread.
    """

    def _wait_for_status(self, target: str, timeout_sec: float = 3.0) -> None:
        deadline = time.time() + timeout_sec
        while time.time() < deadline:
            if self.connector.get_oauth_status()["status"] == target:
                return
            time.sleep(0.05)
        actual = self.connector.get_oauth_status()
        raise AssertionError(f"Status not {target} within {timeout_sec}s. Final: {actual}")

    def test_initial_status_is_idle(self):
        status = self.connector.get_oauth_status()
        self.assertEqual(status["status"], "idle")
        self.assertIsNone(status["error"])

    def test_start_oauth_returns_auth_url_immediately(self):
        callback_event = threading.Event()

        def slow_loopback(expected_state, timeout_sec=300):
            callback_event.wait(timeout=2.0)
            result = xc._CallbackResult()
            result.error = "test_abort"
            return result

        with mock.patch.object(xc, "run_loopback_server", side_effect=slow_loopback):
            with mock.patch.object(xc.webbrowser, "open"):
                start = time.time()
                auth_url = self.connector.start_oauth(open_browser=False)
                elapsed = time.time() - start

        self.assertLess(elapsed, 1.0)
        self.assertIn(xc.XERO_AUTH_URL, auth_url)
        self.assertEqual(self.connector.get_oauth_status()["status"], "in_progress")

        callback_event.set()
        self._wait_for_status("error", timeout_sec=3.0)

    def test_start_oauth_completes_async(self):
        self.mock_session.post.return_value = _FakeResponse(200, _make_token_response())
        self.mock_session.get.return_value = _FakeResponse(
            200, [{"tenantId": "t1", "tenantName": "Demo", "tenantType": "ORGANISATION"}]
        )

        def fake_loopback(expected_state, timeout_sec=300):
            result = xc._CallbackResult()
            result.code = "FAKE-CODE"
            result.state = expected_state
            return result

        with mock.patch.object(xc, "run_loopback_server", side_effect=fake_loopback):
            with mock.patch.object(xc.webbrowser, "open"):
                self.connector.start_oauth(open_browser=False)

        self._wait_for_status("completed", timeout_sec=3.0)
        self.assertTrue(self.connector.is_connected())
        self.assertEqual(self.connector.get_active_tenant_id(), "t1")
        self.assertIsNone(self.connector.get_oauth_status()["error"])

    def test_start_oauth_error_state(self):
        def fake_loopback(expected_state, timeout_sec=300):
            result = xc._CallbackResult()
            result.error = "access_denied"
            return result

        with mock.patch.object(xc, "run_loopback_server", side_effect=fake_loopback):
            with mock.patch.object(xc.webbrowser, "open"):
                self.connector.start_oauth(open_browser=False)

        self._wait_for_status("error", timeout_sec=3.0)
        status = self.connector.get_oauth_status()
        self.assertEqual(status["status"], "error")
        self.assertIn("access_denied", status["error"])
        self.assertFalse(self.connector.is_connected())




# ── Phase B: Contacts API ────────────────────────────────────────────────────


class TestContacts(XeroConnectorTestBase):

    def _seed_connection(self):
        from datetime import datetime, timedelta, timezone
        tokens = xc.XeroTokens(
            access_token="seed-access",
            refresh_token="seed-refresh",
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            tenants=[{"tenantId": "tenant-uuid-1"}],
            active_tenant_id="tenant-uuid-1",
        )
        self.connector._save_tokens(tokens)

    def test_fetch_contacts_with_where(self):
        self._seed_connection()
        contacts_data = {"Contacts": [{"ContactID": "c1", "Name": "ACME Ltd"}]}
        self.mock_session.get.return_value = _FakeResponse(200, contacts_data)

        result = self.connector.fetch_contacts(where='Name="ACME Ltd"')
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["Name"], "ACME Ltd")

        call = self.mock_session.get.call_args
        self.assertEqual(call.args[0], xc.XERO_CONTACTS_URL)
        self.assertEqual(call.kwargs["headers"]["Xero-Tenant-Id"], "tenant-uuid-1")
        self.assertEqual(call.kwargs["params"]["where"], 'Name="ACME Ltd"')

    def test_find_contact_by_name_found(self):
        self._seed_connection()
        self.mock_session.get.return_value = _FakeResponse(
            200, {"Contacts": [{"ContactID": "c1", "Name": "ACME Ltd"}]}
        )
        c = self.connector.find_contact_by_name("ACME Ltd")
        self.assertIsNotNone(c)
        self.assertEqual(c["ContactID"], "c1")

    def test_find_contact_by_name_not_found(self):
        self._seed_connection()
        self.mock_session.get.return_value = _FakeResponse(200, {"Contacts": []})
        c = self.connector.find_contact_by_name("Nonexistent Supplier")
        self.assertIsNone(c)

    def test_find_contact_empty_name(self):
        self._seed_connection()
        self.assertIsNone(self.connector.find_contact_by_name(""))
        self.assertIsNone(self.connector.find_contact_by_name("   "))

    def test_create_contact_with_vat(self):
        self._seed_connection()
        self.mock_session.post.return_value = _FakeResponse(
            200, {"Contacts": [{"ContactID": "new-c1", "Name": "New Supplier", "TaxNumber": "GB123"}]}
        )
        c = self.connector.create_contact("New Supplier", vat="GB123")
        self.assertEqual(c["ContactID"], "new-c1")

        body = self.mock_session.post.call_args.kwargs["json"]
        self.assertEqual(body["Contacts"][0]["Name"], "New Supplier")
        self.assertEqual(body["Contacts"][0]["TaxNumber"], "GB123")

    def test_create_contact_error(self):
        self._seed_connection()
        self.mock_session.post.return_value = _FakeResponse(400, text="invalid name")
        with self.assertRaises(xc.XeroTokenError):
            self.connector.create_contact("X")

    def test_ensure_contact_existing(self):
        self._seed_connection()
        self.mock_session.get.return_value = _FakeResponse(
            200, {"Contacts": [{"ContactID": "exist-1", "Name": "Existing"}]}
        )
        c = self.connector.ensure_contact("Existing")
        self.assertEqual(c["ContactID"], "exist-1")
        self.mock_session.post.assert_not_called()  # Δεν κάναμε create

    def test_ensure_contact_creates_when_missing(self):
        self._seed_connection()
        self.mock_session.get.return_value = _FakeResponse(200, {"Contacts": []})
        self.mock_session.post.return_value = _FakeResponse(
            200, {"Contacts": [{"ContactID": "auto-1", "Name": "Auto Created"}]}
        )
        c = self.connector.ensure_contact("Auto Created", vat="GB999")
        self.assertEqual(c["ContactID"], "auto-1")
        self.mock_session.post.assert_called_once()


# ── Phase B: Accounts API με cache ───────────────────────────────────────────


class TestAccounts(XeroConnectorTestBase):

    def _seed_connection(self):
        from datetime import datetime, timedelta, timezone
        tokens = xc.XeroTokens(
            access_token="seed-access",
            refresh_token="seed-refresh",
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            tenants=[{"tenantId": "tenant-uuid-1"}],
            active_tenant_id="tenant-uuid-1",
        )
        self.connector._save_tokens(tokens)

    def test_fetch_accounts_initial_call(self):
        self._seed_connection()
        accounts_data = {"Accounts": [
            {"AccountID": "a1", "Code": "200", "Name": "Sales", "Type": "REVENUE"},
            {"AccountID": "a2", "Code": "310", "Name": "Cost of Goods", "Type": "DIRECTCOSTS"},
        ]}
        self.mock_session.get.return_value = _FakeResponse(200, accounts_data)

        result = self.connector.fetch_accounts()
        self.assertEqual(len(result), 2)
        self.mock_session.get.assert_called_once()

        # Cache file δημιουργήθηκε
        cache_path = self.secrets_dir / xc.ACCOUNTS_CACHE_FILENAME
        self.assertTrue(cache_path.exists())

    def test_fetch_accounts_cache_hit(self):
        self._seed_connection()
        # Pre-populate cache file
        import json
        cache_path = self.secrets_dir / xc.ACCOUNTS_CACHE_FILENAME
        cache_path.write_text(json.dumps({
            "tenant_id": "tenant-uuid-1",
            "accounts": [{"AccountID": "cached-1", "Code": "999", "Name": "Cached"}],
        }), encoding="utf-8")

        result = self.connector.fetch_accounts()
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["AccountID"], "cached-1")
        self.mock_session.get.assert_not_called()  # Cache hit — no HTTP call

    def test_fetch_accounts_force_refresh(self):
        self._seed_connection()
        # Pre-populate cache file
        import json
        cache_path = self.secrets_dir / xc.ACCOUNTS_CACHE_FILENAME
        cache_path.write_text(json.dumps({
            "tenant_id": "tenant-uuid-1",
            "accounts": [{"AccountID": "stale-1"}],
        }), encoding="utf-8")

        self.mock_session.get.return_value = _FakeResponse(
            200, {"Accounts": [{"AccountID": "fresh-1", "Code": "200", "Name": "Fresh"}]}
        )
        result = self.connector.fetch_accounts(force_refresh=True)
        self.assertEqual(result[0]["AccountID"], "fresh-1")
        self.mock_session.get.assert_called_once()

    def test_fetch_accounts_cache_different_tenant_ignored(self):
        """Cache από άλλο tenant δεν πρέπει να επιστραφεί."""
        self._seed_connection()
        import json
        cache_path = self.secrets_dir / xc.ACCOUNTS_CACHE_FILENAME
        cache_path.write_text(json.dumps({
            "tenant_id": "DIFFERENT-TENANT",
            "accounts": [{"AccountID": "wrong-tenant"}],
        }), encoding="utf-8")

        self.mock_session.get.return_value = _FakeResponse(
            200, {"Accounts": [{"AccountID": "correct-tenant"}]}
        )
        result = self.connector.fetch_accounts()
        self.assertEqual(result[0]["AccountID"], "correct-tenant")
        self.mock_session.get.assert_called_once()


# ── Phase B: push_bill (core feature) ────────────────────────────────────────


class TestPushBill(XeroConnectorTestBase):

    def _seed_connection(self):
        from datetime import datetime, timedelta, timezone
        tokens = xc.XeroTokens(
            access_token="seed-access",
            refresh_token="seed-refresh",
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            tenants=[{"tenantId": "tenant-uuid-1"}],
            active_tenant_id="tenant-uuid-1",
        )
        self.connector._save_tokens(tokens)

    def _setup_happy_path_mocks(self):
        """Mocks για: contact lookup found + bill push success."""
        # 1ο GET = contacts lookup
        # 2ο POST = bill push
        self.mock_session.get.return_value = _FakeResponse(
            200, {"Contacts": [{"ContactID": "supplier-uuid", "Name": "ACME Ltd"}]}
        )
        self.mock_session.post.return_value = _FakeResponse(
            200, {"Invoices": [{
                "InvoiceID": "inv-uuid-1",
                "Status": "DRAFT",
                "InvoiceNumber": "INV-001",
                "Type": "ACCPAY",
            }]}
        )

    def test_push_bill_happy_path(self):
        self._seed_connection()
        self._setup_happy_path_mocks()

        result = self.connector.push_bill(
            supplier_name="ACME Ltd",
            invoice_number="INV-001",
            invoice_date="2026-05-15",
            due_date="2026-06-15",
            currency="GBP",
            line_items=[
                {"description": "Services", "quantity": 1, "unit_amount": 100.0, "account_code": "310"},
            ],
        )
        self.assertEqual(result["invoice_id"], "inv-uuid-1")
        self.assertEqual(result["status"], "DRAFT")
        self.assertIn("go.xero.com/AccountsPayable", result["deep_link"])
        self.assertIn("inv-uuid-1", result["deep_link"])

    def test_push_bill_json_payload_structure(self):
        self._seed_connection()
        self._setup_happy_path_mocks()

        self.connector.push_bill(
            supplier_name="ACME Ltd",
            invoice_number="INV-001",
            invoice_date="2026-05-15",
            line_items=[
                {"description": "Item 1", "quantity": 2, "unit_amount": 50.0, "account_code": "310"},
            ],
        )

        # Inspect το POST body του /Invoices
        push_call = self.mock_session.post.call_args
        self.assertEqual(push_call.args[0], xc.XERO_INVOICES_URL)
        bill = push_call.kwargs["json"]["Invoices"][0]
        self.assertEqual(bill["Type"], "ACCPAY")
        self.assertEqual(bill["Status"], "DRAFT")  # ΠΟΤΕ AUTHORISED auto
        self.assertEqual(bill["Contact"]["ContactID"], "supplier-uuid")
        self.assertEqual(bill["InvoiceNumber"], "INV-001")
        self.assertEqual(bill["Date"], "2026-05-15")
        self.assertEqual(len(bill["LineItems"]), 1)
        self.assertEqual(bill["LineItems"][0]["AccountCode"], "310")

    def test_push_bill_auto_creates_supplier(self):
        self._seed_connection()
        # GET επιστρέφει empty (supplier ΔΕΝ υπάρχει)
        # 1ο POST = create contact
        # 2ο POST = push bill
        self.mock_session.get.return_value = _FakeResponse(200, {"Contacts": []})
        self.mock_session.post.side_effect = [
            _FakeResponse(200, {"Contacts": [{"ContactID": "new-supplier", "Name": "New Co"}]}),
            _FakeResponse(200, {"Invoices": [{"InvoiceID": "inv-uuid-2", "Status": "DRAFT"}]}),
        ]

        result = self.connector.push_bill(
            supplier_name="New Co",
            supplier_vat="GB123",
            invoice_number="INV-002",
            invoice_date="2026-05-15",
            line_items=[
                {"description": "X", "quantity": 1, "unit_amount": 50.0, "account_code": "310"},
            ],
        )
        self.assertEqual(result["invoice_id"], "inv-uuid-2")
        # 2 POST calls = create contact + push bill
        self.assertEqual(self.mock_session.post.call_count, 2)

    def test_push_bill_missing_supplier_raises(self):
        self._seed_connection()
        with self.assertRaises(xc.XeroError):
            self.connector.push_bill(
                supplier_name="",
                invoice_number="X",
                invoice_date="2026-01-01",
                line_items=[{"description": "x", "unit_amount": 1, "account_code": "310"}],
            )

    def test_push_bill_no_line_items_raises(self):
        self._seed_connection()
        with self.assertRaises(xc.XeroError):
            self.connector.push_bill(
                supplier_name="X",
                invoice_number="Y",
                invoice_date="2026-01-01",
                line_items=[],
            )

    def test_push_bill_line_item_missing_account_code_raises(self):
        self._seed_connection()
        with self.assertRaises(xc.XeroError):
            self.connector.push_bill(
                supplier_name="X",
                invoice_number="Y",
                invoice_date="2026-01-01",
                line_items=[{"description": "x", "unit_amount": 1}],  # missing account_code
            )

    def test_push_bill_optional_fields(self):
        """due_date και currency είναι optional."""
        self._seed_connection()
        self._setup_happy_path_mocks()

        self.connector.push_bill(
            supplier_name="ACME Ltd",
            invoice_number="INV-003",
            invoice_date="2026-05-15",
            line_items=[{"description": "x", "unit_amount": 1, "account_code": "310"}],
        )
        bill = self.mock_session.post.call_args.kwargs["json"]["Invoices"][0]
        self.assertNotIn("DueDate", bill)
        self.assertNotIn("CurrencyCode", bill)


# ── Phase B: XeroRateLimiter ─────────────────────────────────────────────────


class TestRateLimiter(unittest.TestCase):

    def test_below_limit_no_wait(self):
        limiter = xc.XeroRateLimiter(max_per_minute=10)
        start = time.monotonic()
        for _ in range(5):
            limiter.wait_if_needed()
        elapsed = time.monotonic() - start
        self.assertLess(elapsed, 0.5)  # Πρέπει να είναι σχεδόν instant

    def test_tracks_calls(self):
        limiter = xc.XeroRateLimiter(max_per_minute=10)
        for _ in range(5):
            limiter.wait_if_needed()
        self.assertEqual(len(limiter._calls), 5)

    def test_cleanup_old_calls(self):
        """Calls > 60s παλιά καθαρίζονται."""
        limiter = xc.XeroRateLimiter(max_per_minute=10)
        # Inject fake old timestamps
        limiter._calls = [time.monotonic() - 70.0, time.monotonic() - 65.0]
        limiter.wait_if_needed()
        # Παλιά διαγράφηκαν, μόνο το τρέχον υπάρχει
        self.assertEqual(len(limiter._calls), 1)

    def test_at_limit_waits(self):
        """Όταν φτάσουμε στο limit, η wait_if_needed πρέπει να blocks."""
        limiter = xc.XeroRateLimiter(max_per_minute=3)
        # Fill window με 3 calls που έγιναν "πριν 59 sec"
        ago_59 = time.monotonic() - 59.0
        limiter._calls = [ago_59, ago_59 + 0.1, ago_59 + 0.2]

        start = time.monotonic()
        limiter.wait_if_needed()
        elapsed = time.monotonic() - start
        # Πρέπει να περίμενε ~1 sec (μέχρι ο πρώτος call να εξέλθει από το window)
        self.assertGreater(elapsed, 0.8)
        self.assertLess(elapsed, 2.5)


if __name__ == "__main__":
    unittest.main()
