"""
Module 13: Xero Integration — Phase A (OAuth 2.0 PKCE + Token Management)

Παρέχει σύνδεση του FastWrite Desktop App με Xero Accounting μέσω
OAuth 2.0 Authorization Code flow με PKCE (RFC 7636). Δεν χρησιμοποιεί
client_secret — κατάλληλο για distributed desktop apps.

Phase A scope (αυτό το αρχείο):
    - PKCE code_verifier / code_challenge generation
    - Authorization URL building
    - Loopback HTTP server (port 5556) για callback
    - Token exchange (authorization_code → access/refresh tokens)
    - Encrypted token storage (Fernet, reuse .machine.key από KeyManager)
    - Automatic token refresh (60sec πριν expiry)
    - Tenant discovery (GET /connections)
    - Disconnect (delete encrypted token file)

Phase B (Bills push) και Phase C (UI integration) δεν υλοποιούνται εδώ.

Αναφορά design: xero_integration_design_v1.md (25 Μαΐου 2026, approved)

Σημείωση: Το CLIENT_ID διαβάζεται από το env var XERO_CLIENT_ID.
Πρέπει να οριστεί στο desktop/main.py πριν από το import του main_api
(όπως και το FASTWRITE_BASE_DIR).

Σημείωση HTML: Ο loopback callback handler περιέχει ένα μικρό inline HTML
snippet (~10 lines) για το user-facing success page. Αυτό είναι εξαίρεση
από τον κανόνα "no embedded HTML in Python" επειδή ο loopback server είναι
ephemeral (τρέχει 30sec max) και δεν έχει πρόσβαση στο /static directory
του main Flask app.
"""

from __future__ import annotations

import base64
import hashlib
import http.server
import json
import logging
import os
import secrets
import socket
import threading
import time
import urllib.parse
import webbrowser
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import requests
from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)


# ── Constants ───────────────────────────────────────────────────────────────

XERO_AUTH_URL = "https://login.xero.com/identity/connect/authorize"
XERO_TOKEN_URL = "https://identity.xero.com/connect/token"
XERO_CONNECTIONS_URL = "https://api.xero.com/connections"
XERO_REVOKE_URL = "https://identity.xero.com/connect/revocation"

LOOPBACK_HOST = "127.0.0.1"
LOOPBACK_PORT = 5556
REDIRECT_PATH = "/xero/callback"
REDIRECT_URI = f"http://localhost:{LOOPBACK_PORT}{REDIRECT_PATH}"

# Granular scopes (Xero apps δημιουργημένα μετά 2 Μαρτίου 2026)
DEFAULT_SCOPES = [
    "offline_access",
    "openid",
    "email",
    "profile",
    "accounting.invoices",
    "accounting.contacts.read",
    "accounting.contacts",
    "accounting.settings.read",
]

MACHINE_KEY_FILENAME = ".machine.key"
TOKEN_FILENAME = "xero_token.enc"

# Refresh access_token όταν απομένουν λιγότερα από αυτά τα δευτερόλεπτα.
TOKEN_REFRESH_LEEWAY_SEC = 60

# OAuth flow timeout (πόσο περιμένουμε τον user να κάνει login στο browser).
OAUTH_FLOW_TIMEOUT_SEC = 300  # 5 λεπτά

# HTTP timeout για κάθε call στο Xero identity / connections endpoint.
HTTP_TIMEOUT_SEC = 30


# ── Exceptions ──────────────────────────────────────────────────────────────


class XeroError(Exception):
    """Base exception για όλα τα Xero integration errors."""


class XeroConfigError(XeroError):
    """Λείπει configuration (π.χ. XERO_CLIENT_ID env var)."""


class XeroOAuthError(XeroError):
    """OAuth flow απέτυχε (user denial, state mismatch, network, κλπ)."""


class XeroTokenError(XeroError):
    """Token exchange ή refresh απέτυχε."""


class XeroNotConnectedError(XeroError):
    """Δεν υπάρχει αποθηκευμένο token — χρειάζεται OAuth flow."""


# ── Data Classes ────────────────────────────────────────────────────────────


@dataclass
class XeroTokens:
    """In-memory representation των αποθηκευμένων Xero tokens και tenants."""

    access_token: str
    refresh_token: str
    expires_at: datetime  # UTC, με tz info
    token_type: str = "Bearer"
    id_token: Optional[str] = None
    scope: str = ""
    tenants: list[dict] = field(default_factory=list)
    active_tenant_id: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "access_token": self.access_token,
            "refresh_token": self.refresh_token,
            "expires_at": self.expires_at.isoformat(),
            "token_type": self.token_type,
            "id_token": self.id_token,
            "scope": self.scope,
            "tenants": self.tenants,
            "active_tenant_id": self.active_tenant_id,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "XeroTokens":
        expires_at_raw = data["expires_at"]
        expires_at = datetime.fromisoformat(expires_at_raw)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        return cls(
            access_token=data["access_token"],
            refresh_token=data["refresh_token"],
            expires_at=expires_at,
            token_type=data.get("token_type", "Bearer"),
            id_token=data.get("id_token"),
            scope=data.get("scope", ""),
            tenants=data.get("tenants", []),
            active_tenant_id=data.get("active_tenant_id"),
        )

    def is_expired(self, leeway_sec: int = TOKEN_REFRESH_LEEWAY_SEC) -> bool:
        return datetime.now(timezone.utc) >= self.expires_at - timedelta(seconds=leeway_sec)


# ── PKCE helpers ────────────────────────────────────────────────────────────


def generate_pkce_pair() -> tuple[str, str]:
    """
    Παράγει (code_verifier, code_challenge) κατά RFC 7636.

    code_verifier: 64 chars (entropy ~256 bits), unreserved URL-safe chars only
    code_challenge: base64url(SHA256(code_verifier)), no padding
    """
    # secrets.token_urlsafe(48) → ~64 chars base64url. Πάντα μέσα στο RFC range
    # 43-128 chars unreserved.
    code_verifier = secrets.token_urlsafe(48)
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    code_challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return code_verifier, code_challenge


def generate_state() -> str:
    """CSRF state parameter — random 32 chars URL-safe."""
    return secrets.token_urlsafe(32)




# ── Bills/Contacts/Accounts API endpoints (Phase B) ─────────────────────────

XERO_INVOICES_URL = "https://api.xero.com/api.xro/2.0/Invoices"
XERO_CONTACTS_URL = "https://api.xero.com/api.xro/2.0/Contacts"
XERO_ACCOUNTS_URL = "https://api.xero.com/api.xro/2.0/Accounts"

# Rate limit: Xero επιτρέπει 60 calls/min/tenant. Χρησιμοποιούμε 55 για safety margin.
RATE_LIMIT_PER_MINUTE = 55
ACCOUNTS_CACHE_FILENAME = "xero_accounts_cache.json"
ACCOUNTS_CACHE_TTL_SEC = 24 * 60 * 60  # 24 ώρες


class XeroRateLimiter:
    """
    Thread-safe sliding-window rate limiter για Xero API calls.

    Επιτρέπει max N calls μέσα σε rolling window 60 sec. Αν φτάσει το limit,
    η μέθοδος wait_if_needed() κάνει sleep μέχρι να ελευθερωθεί slot.

    Per design doc §8.3: 55 calls/min για safety margin (Xero limit = 60).
    """

    def __init__(self, max_per_minute: int = RATE_LIMIT_PER_MINUTE):
        self.max_per_minute = max_per_minute
        self._calls: list[float] = []  # timestamps των πρόσφατων calls
        self._lock = threading.Lock()

    def wait_if_needed(self) -> None:
        """Block αν χρειάζεται για να μη ξεπεραστεί το rate limit."""
        with self._lock:
            now = time.monotonic()
            # Καθαρίζουμε calls > 60 sec παλιά
            cutoff = now - 60.0
            self._calls = [t for t in self._calls if t > cutoff]

            if len(self._calls) >= self.max_per_minute:
                # Sleep μέχρι ο παλαιότερος call να βγει από το window
                sleep_for = self._calls[0] + 60.0 - now + 0.05  # +50ms padding
                if sleep_for > 0:
                    # Release lock κατά το sleep
                    pass
                # We release-and-reacquire pattern: sleep outside lock
            else:
                # Slot available — log this call
                self._calls.append(now)
                return

        # Sleep outside the lock
        time.sleep(sleep_for)
        # Recursive call για επαναξιολόγηση
        self.wait_if_needed()


# ── Loopback HTTP Server (callback receiver) ────────────────────────────────


# Inline HTML — βλ. module docstring για justification της εξαίρεσης.
_SUCCESS_HTML = """<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>FastWrite — Xero Connected</title></head>
<body style="font-family:sans-serif;background:#1a1a1a;color:#eee;text-align:center;padding:60px;">
<h1 style="color:#4ade80;">Επιτυχία!</h1>
<p>Συνδέθηκες στο Xero. Μπορείς να κλείσεις αυτό το παράθυρο και να επιστρέψεις στο FastWrite.</p>
</body></html>"""

_ERROR_HTML_TEMPLATE = """<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>FastWrite — Xero Error</title></head>
<body style="font-family:sans-serif;background:#1a1a1a;color:#eee;text-align:center;padding:60px;">
<h1 style="color:#f87171;">Σφάλμα σύνδεσης</h1>
<p>{message}</p>
<p>Επέστρεψε στο FastWrite και δοκίμασε ξανά.</p>
</body></html>"""


class _CallbackResult:
    """Thread-safe container για το αποτέλεσμα του OAuth callback."""

    def __init__(self) -> None:
        self.code: Optional[str] = None
        self.state: Optional[str] = None
        self.error: Optional[str] = None
        self.event = threading.Event()


class _LoopbackHandler(http.server.BaseHTTPRequestHandler):
    """HTTP handler για το /xero/callback — capture code + state, return HTML."""

    # Injected από run_loopback_server (class-level γιατί BaseHTTPRequestHandler
    # δεν επιτρέπει custom __init__ kwargs).
    result: _CallbackResult = None  # type: ignore[assignment]
    expected_state: str = ""

    def do_GET(self) -> None:  # noqa: N802 (stdlib API)
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != REDIRECT_PATH:
            self.send_response(404)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"Not Found")
            return

        params = urllib.parse.parse_qs(parsed.query)
        error = params.get("error", [None])[0]
        code = params.get("code", [None])[0]
        state = params.get("state", [None])[0]

        if error:
            self.result.error = f"Xero error: {error}"
            self._send_html(400, _ERROR_HTML_TEMPLATE.format(message=error))
        elif not code or not state:
            self.result.error = "Missing code or state in callback"
            self._send_html(400, _ERROR_HTML_TEMPLATE.format(message="Λείπει code ή state"))
        elif state != self.expected_state:
            # ΚΡΙΤΙΚΟ: state mismatch = πιθανή CSRF επίθεση. ΠΟΤΕ μη συνεχίσεις.
            self.result.error = "State mismatch (CSRF protection triggered)"
            self._send_html(400, _ERROR_HTML_TEMPLATE.format(message="State mismatch — CSRF check failed"))
        else:
            self.result.code = code
            self.result.state = state
            self._send_html(200, _SUCCESS_HTML)

        self.result.event.set()

    def _send_html(self, status: int, body: str) -> None:
        body_bytes = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body_bytes)))
        self.end_headers()
        self.wfile.write(body_bytes)

    def log_message(self, format: str, *args) -> None:  # noqa: A002 (stdlib API)
        # Πέρασμα στο logging αντί για stderr (no secret leakage)
        logger.debug("loopback %s - %s", self.address_string(), format % args)


def _check_port_available(host: str, port: int) -> bool:
    """True αν μπορούμε να bind στο port, False αν είναι κατειλημμένο."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind((host, port))
        return True
    except OSError:
        return False


def run_loopback_server(expected_state: str, timeout_sec: int = OAUTH_FLOW_TIMEOUT_SEC) -> _CallbackResult:
    """
    Σηκώνει τον loopback server στο port 5556, περιμένει callback, και κλείνει.

    Επιστρέφει _CallbackResult με .code/.state ή .error.
    Raises XeroOAuthError αν timeout ή port unavailable.
    """
    if not _check_port_available(LOOPBACK_HOST, LOOPBACK_PORT):
        raise XeroOAuthError(
            f"Port {LOOPBACK_PORT} είναι κατειλημμένο. "
            "Κλείσε τυχόν άλλη εφαρμογή και δοκίμασε ξανά."
        )

    result = _CallbackResult()

    # Class-level injection (στατικά attributes του handler class).
    _LoopbackHandler.result = result
    _LoopbackHandler.expected_state = expected_state

    server = http.server.HTTPServer((LOOPBACK_HOST, LOOPBACK_PORT), _LoopbackHandler)
    server.timeout = 1.0  # poll interval — κάθε 1 sec το handle_request επιστρέφει

    def serve_until_done() -> None:
        # ValueError/OSError piαστά αν το socket έκλεισε από έξω (defensive)
        while not result.event.is_set():
            try:
                server.handle_request()
            except (ValueError, OSError) as e:
                logger.debug("loopback server stopped: %s", e)
                break

    thread = threading.Thread(target=serve_until_done, daemon=True)
    thread.start()

    completed = result.event.wait(timeout=timeout_sec)
    # ΣΕΙΡΑ: 1) σημάδεψε exit, 2) join (μέχρι 3sec ώστε in-flight handle να τελειώσει),
    # 3) μετά server_close. Αν το αντίστροφο, race → ValueError στο selector.register.
    result.event.set()
    thread.join(timeout=3.0)
    server.server_close()

    if not completed:
        raise XeroOAuthError(f"OAuth flow timeout μετά από {timeout_sec} sec")

    return result


# ── XeroConnector ───────────────────────────────────────────────────────────


class XeroConnector:
    """
    Διαχείριση Xero OAuth 2.0 PKCE flow και token storage για το FastWrite Desktop.

    Usage:
        connector = XeroConnector(secrets_dir=Path("C:/.../FastWrite/secrets"))
        if not connector.is_connected():
            connector.connect()  # ανοίγει browser, περιμένει OAuth callback
        access_token = connector.get_valid_access_token()
        active_tenant = connector.get_active_tenant_id()
    """

    def __init__(
        self,
        secrets_dir: Path,
        client_id: Optional[str] = None,
        scopes: Optional[list[str]] = None,
        http_session: Optional[requests.Session] = None,
    ):
        self.secrets_dir = Path(secrets_dir)
        self.secrets_dir.mkdir(parents=True, exist_ok=True)

        resolved_client_id = client_id or os.environ.get("XERO_CLIENT_ID", "").strip()
        if not resolved_client_id:
            raise XeroConfigError(
                "Λείπει το XERO_CLIENT_ID. Όρισέ το ως env var ή πέρασέ το στον constructor."
            )
        self.client_id = resolved_client_id
        self.scopes = scopes or DEFAULT_SCOPES

        self._http = http_session or requests.Session()
        self._fernet = Fernet(self._load_or_create_machine_key())

        self._token_path = self.secrets_dir / TOKEN_FILENAME
        self._cached_tokens: Optional[XeroTokens] = None
        self._rate_limiter = XeroRateLimiter()

    # ── Machine key (shared με KeyManager) ──────────────────────────────

    def _load_or_create_machine_key(self) -> bytes:
        """
        Reuses το ίδιο .machine.key file με το KeyManager.
        Αν δεν υπάρχει, δημιουργεί νέο (πρώτη εκτέλεση εφαρμογής).
        """
        key_path = self.secrets_dir / MACHINE_KEY_FILENAME
        if key_path.exists():
            return key_path.read_bytes().strip()

        new_key = Fernet.generate_key()
        key_path.write_bytes(new_key)
        try:
            os.chmod(key_path, 0o600)
        except (OSError, NotImplementedError):
            # chmod μπορεί να αποτύχει σε Windows (DACL αντί POSIX) — όχι κρίσιμο
            pass
        return new_key

    # ── PKCE & Auth URL ─────────────────────────────────────────────────

    def build_auth_url(self, code_challenge: str, state: str) -> str:
        """Φτιάχνει το authorization URL για το Xero login page."""
        params = {
            "response_type": "code",
            "client_id": self.client_id,
            "redirect_uri": REDIRECT_URI,
            "scope": " ".join(self.scopes),
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }
        return f"{XERO_AUTH_URL}?{urllib.parse.urlencode(params)}"

    # ── Async OAuth Flow (για Flask integration) ────────────────────────

    def start_oauth(self, open_browser: bool = True) -> str:
        """
        Ξεκινά τον OAuth flow σε background thread και επιστρέφει αμέσως
        το auth_url. Σχεδιασμένο για Flask endpoints που δεν πρέπει να
        μπλοκάρουν περιμένοντας τον user.

        Side effects:
            - Spawns daemon thread που τρέχει loopback server + token exchange
            - Αν open_browser=True, ανοίγει τον browser στο auth_url
            - Set _oauth_status = "in_progress"

        Status polling: get_oauth_status() returns
            {status: "idle"|"in_progress"|"completed"|"error", error: str|None}
        """
        code_verifier, code_challenge = generate_pkce_pair()
        state = generate_state()
        auth_url = self.build_auth_url(code_challenge, state)

        self._oauth_status = "in_progress"
        self._oauth_error = None

        def _runner() -> None:
            try:
                callback = run_loopback_server(state)
                if callback.error or not callback.code:
                    self._oauth_status = "error"
                    self._oauth_error = callback.error or "no_code_received"
                    return

                tokens = self._exchange_code_for_tokens(callback.code, code_verifier)
                tokens.tenants = self._fetch_tenants(tokens.access_token)
                if tokens.tenants and not tokens.active_tenant_id:
                    tokens.active_tenant_id = tokens.tenants[0].get("tenantId")

                self._save_tokens(tokens)
                self._oauth_status = "completed"
                logger.info("Xero OAuth completed (async): %d tenant(s)", len(tokens.tenants))
            except Exception as e:  # noqa: BLE001
                logger.exception("Xero OAuth background thread failed")
                self._oauth_status = "error"
                self._oauth_error = str(e)

        thread = threading.Thread(target=_runner, daemon=True, name="xero-oauth")
        thread.start()

        if open_browser:
            webbrowser.open(auth_url, new=2)

        return auth_url

    def get_oauth_status(self) -> dict:
        """
        Τρέχουσα κατάσταση του async OAuth flow.

        status:
            'idle' — δεν έχει ξεκινήσει ποτέ flow
            'in_progress' — flow τρέχει, περιμένει user
            'completed' — επιτυχία, tokens αποθηκευμένα
            'error' — απέτυχε (βλ. error field)
        """
        return {
            "status": getattr(self, "_oauth_status", "idle"),
            "error": getattr(self, "_oauth_error", None),
        }

    # ── Sync OAuth Flow (για CLI/tests) ─────────────────────────────────
    # ── Full OAuth Flow ─────────────────────────────────────────────────

    def connect(self, open_browser: bool = True) -> XeroTokens:
        """
        Εκτελεί ολόκληρο τον OAuth flow:
            1. Παράγει PKCE + state
            2. Σηκώνει loopback server
            3. Ανοίγει browser με το auth URL
            4. Περιμένει callback με code
            5. Ανταλλάσσει code → tokens
            6. Φέρνει tenants
            7. Αποθηκεύει encrypted

        Επιστρέφει το XeroTokens object. Raises XeroOAuthError ή XeroTokenError.
        """
        code_verifier, code_challenge = generate_pkce_pair()
        state = generate_state()
        auth_url = self.build_auth_url(code_challenge, state)

        logger.info("Starting Xero OAuth flow (loopback %s)", REDIRECT_URI)

        # Ανοίγουμε browser ΠΡΩΤΟΣ — ο run_loopback_server θα κάνει block
        # μέχρι να έρθει το callback. Ο browser ανοίγει async (νέο tab/window).
        if open_browser:
            webbrowser.open(auth_url, new=2)
        else:
            logger.info("OAuth URL (για manual debug): %s", auth_url)

        # Blocks το calling thread μέχρι callback ή timeout. Ο caller
        # ευθύνεται να το τρέξει σε background thread αν χρειάζεται UI responsiveness.
        callback = run_loopback_server(state)

        if callback.error or not callback.code:
            raise XeroOAuthError(callback.error or "Άγνωστο σφάλμα στο callback")

        tokens = self._exchange_code_for_tokens(callback.code, code_verifier)
        tokens.tenants = self._fetch_tenants(tokens.access_token)
        if tokens.tenants and not tokens.active_tenant_id:
            tokens.active_tenant_id = tokens.tenants[0].get("tenantId")

        self._save_tokens(tokens)
        logger.info("Xero connected: %d tenant(s)", len(tokens.tenants))
        return tokens

    # ── Token Exchange ──────────────────────────────────────────────────

    def _exchange_code_for_tokens(self, code: str, code_verifier: str) -> XeroTokens:
        """POST στο /connect/token με grant_type=authorization_code + PKCE."""
        payload = {
            "grant_type": "authorization_code",
            "client_id": self.client_id,
            "code": code,
            "redirect_uri": REDIRECT_URI,
            "code_verifier": code_verifier,
        }
        try:
            resp = self._http.post(XERO_TOKEN_URL, data=payload, timeout=HTTP_TIMEOUT_SEC)
        except requests.RequestException as e:
            raise XeroTokenError(f"Network error στο token exchange: {e}") from e

        if resp.status_code != 200:
            raise XeroTokenError(
                f"Token exchange απέτυχε (HTTP {resp.status_code}): {resp.text[:200]}"
            )

        return self._tokens_from_response(resp.json())

    def _refresh_token_request(self, refresh_token: str) -> XeroTokens:
        """POST στο /connect/token με grant_type=refresh_token."""
        payload = {
            "grant_type": "refresh_token",
            "client_id": self.client_id,
            "refresh_token": refresh_token,
        }
        try:
            resp = self._http.post(XERO_TOKEN_URL, data=payload, timeout=HTTP_TIMEOUT_SEC)
        except requests.RequestException as e:
            raise XeroTokenError(f"Network error στο refresh: {e}") from e

        if resp.status_code != 200:
            # 400 invalid_grant = refresh_token expired/revoked → user reconnect
            raise XeroTokenError(
                f"Refresh απέτυχε (HTTP {resp.status_code}): {resp.text[:200]}"
            )

        return self._tokens_from_response(resp.json())

    @staticmethod
    def _tokens_from_response(data: dict) -> XeroTokens:
        """Μετατρέπει το JSON response του Xero σε XeroTokens object."""
        expires_in = int(data.get("expires_in", 1800))
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
        return XeroTokens(
            access_token=data["access_token"],
            refresh_token=data["refresh_token"],
            expires_at=expires_at,
            token_type=data.get("token_type", "Bearer"),
            id_token=data.get("id_token"),
            scope=data.get("scope", ""),
        )

    # ── Tenants ─────────────────────────────────────────────────────────

    def _fetch_tenants(self, access_token: str) -> list[dict]:
        """GET /connections — επιστρέφει list of {tenantId, tenantType, tenantName, ...}."""
        try:
            resp = self._http.get(
                XERO_CONNECTIONS_URL,
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=HTTP_TIMEOUT_SEC,
            )
        except requests.RequestException as e:
            raise XeroTokenError(f"Network error στο /connections: {e}") from e

        if resp.status_code != 200:
            raise XeroTokenError(
                f"/connections απέτυχε (HTTP {resp.status_code}): {resp.text[:200]}"
            )

        return resp.json()

    # ── Storage (Fernet encrypt/decrypt) ────────────────────────────────

    def _save_tokens(self, tokens: XeroTokens) -> None:
        plaintext = json.dumps(tokens.to_dict()).encode("utf-8")
        ciphertext = self._fernet.encrypt(plaintext)
        self._token_path.write_bytes(ciphertext)
        try:
            os.chmod(self._token_path, 0o600)
        except (OSError, NotImplementedError):
            pass
        self._cached_tokens = tokens

    def _load_tokens(self) -> XeroTokens:
        if self._cached_tokens is not None:
            return self._cached_tokens

        if not self._token_path.exists():
            raise XeroNotConnectedError("Δεν υπάρχει αποθηκευμένο token. Κάνε connect πρώτα.")

        try:
            ciphertext = self._token_path.read_bytes()
            plaintext = self._fernet.decrypt(ciphertext)
        except InvalidToken as e:
            raise XeroTokenError(
                "Αποτυχία αποκρυπτογράφησης xero_token.enc — πιθανώς αλλαγμένο .machine.key"
            ) from e

        data = json.loads(plaintext.decode("utf-8"))
        self._cached_tokens = XeroTokens.from_dict(data)
        return self._cached_tokens

    # ── Public API ──────────────────────────────────────────────────────

    def is_connected(self) -> bool:
        """True αν υπάρχει encrypted token file (δεν validates expiry)."""
        return self._token_path.exists()

    def get_valid_access_token(self) -> str:
        """
        Επιστρέφει access_token. Αυτόματο refresh αν έχει λήξει.
        Raises XeroNotConnectedError αν δεν υπάρχει stored token.
        Raises XeroTokenError αν refresh αποτύχει.
        """
        tokens = self._load_tokens()
        if tokens.is_expired():
            logger.info("Access token expired — refreshing")
            new_tokens = self._refresh_token_request(tokens.refresh_token)
            # Διατήρηση tenants + active_tenant_id (δεν επιστρέφονται από refresh)
            new_tokens.tenants = tokens.tenants
            new_tokens.active_tenant_id = tokens.active_tenant_id
            self._save_tokens(new_tokens)
            tokens = new_tokens
        return tokens.access_token

    def get_tenants(self) -> list[dict]:
        """Λίστα authorized tenants. Raises XeroNotConnectedError."""
        return list(self._load_tokens().tenants)

    def get_active_tenant_id(self) -> Optional[str]:
        return self._load_tokens().active_tenant_id

    def set_active_tenant(self, tenant_id: str) -> None:
        tokens = self._load_tokens()
        valid_ids = {t.get("tenantId") for t in tokens.tenants}
        if tenant_id not in valid_ids:
            raise XeroError(f"Άγνωστο tenant_id: {tenant_id}")
        tokens.active_tenant_id = tenant_id
        self._save_tokens(tokens)


    # ── Contacts API (Phase B) ──────────────────────────────────────────

    def fetch_contacts(self, where: Optional[str] = None) -> list[dict]:
        """
        GET /api.xro/2.0/Contacts με optional `where` filter.
        Παράδειγμα where: 'Name="ACME Ltd"' ή 'TaxNumber="GB123"'.
        """
        access_token = self.get_valid_access_token()
        tenant_id = self.get_active_tenant_id()
        if not tenant_id:
            raise XeroError("Δεν υπάρχει active tenant")

        params = {"where": where} if where else None
        self._rate_limiter.wait_if_needed()
        try:
            resp = self._http.get(
                XERO_CONTACTS_URL,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Xero-Tenant-Id": tenant_id,
                    "Accept": "application/json",
                },
                params=params,
                timeout=HTTP_TIMEOUT_SEC,
            )
        except requests.RequestException as e:
            raise XeroTokenError(f"Network error στο /Contacts: {e}") from e

        if resp.status_code != 200:
            raise XeroTokenError(
                f"/Contacts απέτυχε (HTTP {resp.status_code}): {resp.text[:200]}"
            )
        return resp.json().get("Contacts", [])

    def find_contact_by_name(self, name: str) -> Optional[dict]:
        """Αναζήτηση contact με exact name match (case-insensitive)."""
        if not name or not name.strip():
            return None
        # Escape double quotes στο where clause
        safe_name = name.strip().replace('"', '\\"')
        contacts = self.fetch_contacts(where=f'Name="{safe_name}"')
        return contacts[0] if contacts else None

    def create_contact(self, name: str, vat: Optional[str] = None) -> dict:
        """
        POST /api.xro/2.0/Contacts — δημιουργεί νέο supplier contact.
        Απαιτεί scope `accounting.contacts` (όχι μόνο .read).
        """
        access_token = self.get_valid_access_token()
        tenant_id = self.get_active_tenant_id()
        if not tenant_id:
            raise XeroError("Δεν υπάρχει active tenant")

        body = {"Name": name.strip()}
        if vat and vat.strip():
            body["TaxNumber"] = vat.strip()

        self._rate_limiter.wait_if_needed()
        try:
            resp = self._http.post(
                XERO_CONTACTS_URL,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Xero-Tenant-Id": tenant_id,
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                json={"Contacts": [body]},
                timeout=HTTP_TIMEOUT_SEC,
            )
        except requests.RequestException as e:
            raise XeroTokenError(f"Network error στο create contact: {e}") from e

        if resp.status_code not in (200, 201):
            raise XeroTokenError(
                f"Create contact απέτυχε (HTTP {resp.status_code}): {resp.text[:200]}"
            )
        contacts = resp.json().get("Contacts", [])
        if not contacts:
            raise XeroTokenError("Xero δεν επέστρεψε contact στο response")
        logger.info("Δημιουργήθηκε supplier στο Xero: %s", name)
        return contacts[0]

    def ensure_contact(self, name: str, vat: Optional[str] = None) -> dict:
        """Lookup-or-create pattern. Επιστρέφει πάντα ένα contact dict."""
        existing = self.find_contact_by_name(name)
        if existing:
            return existing
        return self.create_contact(name, vat=vat)

    # ── Accounts API με 24h cache (Phase B) ─────────────────────────────

    def fetch_accounts(self, force_refresh: bool = False) -> list[dict]:
        """
        GET /api.xro/2.0/Accounts (Chart of Accounts).
        Cached σε disk file (xero_accounts_cache.json) με 24h TTL.
        """
        cache_path = self.secrets_dir / ACCOUNTS_CACHE_FILENAME

        if not force_refresh and cache_path.exists():
            try:
                age = time.time() - cache_path.stat().st_mtime
                if age < ACCOUNTS_CACHE_TTL_SEC:
                    cached = json.loads(cache_path.read_text(encoding="utf-8"))
                    if cached.get("tenant_id") == self.get_active_tenant_id():
                        return cached.get("accounts", [])
            except (json.JSONDecodeError, OSError) as e:
                logger.warning("Accounts cache read failed (refreshing): %s", e)

        access_token = self.get_valid_access_token()
        tenant_id = self.get_active_tenant_id()
        if not tenant_id:
            raise XeroError("Δεν υπάρχει active tenant")

        self._rate_limiter.wait_if_needed()
        try:
            resp = self._http.get(
                XERO_ACCOUNTS_URL,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Xero-Tenant-Id": tenant_id,
                    "Accept": "application/json",
                },
                timeout=HTTP_TIMEOUT_SEC,
            )
        except requests.RequestException as e:
            raise XeroTokenError(f"Network error στο /Accounts: {e}") from e

        if resp.status_code != 200:
            raise XeroTokenError(
                f"/Accounts απέτυχε (HTTP {resp.status_code}): {resp.text[:200]}"
            )
        accounts = resp.json().get("Accounts", [])

        # Save στο cache
        try:
            cache_path.write_text(
                json.dumps({"tenant_id": tenant_id, "accounts": accounts}, ensure_ascii=False),
                encoding="utf-8",
            )
        except OSError as e:
            logger.warning("Accounts cache write failed: %s", e)

        return accounts

    # ── Bills Push (Phase B core) ───────────────────────────────────────

    def push_bill(
        self,
        *,
        supplier_name: str,
        invoice_number: str,
        invoice_date: str,
        line_items: list[dict],
        supplier_vat: Optional[str] = None,
        due_date: Optional[str] = None,
        currency: Optional[str] = None,
        reference: str = "FastWrite import",
    ) -> dict:
        """
        Push extracted invoice ως ACCPAY Bill στο Xero σε κατάσταση DRAFT.

        ΠΟΤΕ auto-AUTHORISE — security/compliance issue (design doc §6.3).

        Args:
            supplier_name: όνομα του supplier (required, lookup/create automatic)
            invoice_number: invoice number
            invoice_date: YYYY-MM-DD
            line_items: list of dicts με keys: description, quantity, unit_amount, account_code
                        (account_code REQUIRED ανά line item)
            supplier_vat: optional VAT number για supplier creation
            due_date: optional YYYY-MM-DD
            currency: ISO 4217 (e.g. "EUR", "GBP"). Default = tenant default.
            reference: free-text reference (default "FastWrite import")

        Returns:
            {invoice_id, status, deep_link, raw_response}
        """
        # Validation
        if not supplier_name or not supplier_name.strip():
            raise XeroError("Λείπει supplier_name")
        if not line_items:
            raise XeroError("Bill δεν μπορεί να έχει 0 line items")
        for i, li in enumerate(line_items):
            for required in ("description", "unit_amount", "account_code"):
                if required not in li or li[required] in (None, ""):
                    raise XeroError(f"Line item {i}: λείπει '{required}'")

        # Ensure contact (lookup or auto-create)
        contact = self.ensure_contact(supplier_name, vat=supplier_vat)

        # Build Bill JSON
        bill = {
            "Type": "ACCPAY",  # Bills στο Xero
            "Status": "DRAFT",  # ΠΟΤΕ AUTHORISED auto
            "Contact": {"ContactID": contact["ContactID"]},
            "Date": invoice_date,
            "InvoiceNumber": invoice_number,
            "Reference": reference,
            "LineAmountTypes": "Exclusive",  # default: amounts exclude tax
            "LineItems": [
                {
                    "Description": str(li["description"])[:4000],  # Xero max 4000
                    "Quantity": float(li.get("quantity", 1)),
                    "UnitAmount": float(li["unit_amount"]),
                    "AccountCode": str(li["account_code"]),
                }
                for li in line_items
            ],
        }
        if due_date:
            bill["DueDate"] = due_date
        if currency:
            bill["CurrencyCode"] = currency

        # POST
        access_token = self.get_valid_access_token()
        tenant_id = self.get_active_tenant_id()
        if not tenant_id:
            raise XeroError("Δεν υπάρχει active tenant")

        self._rate_limiter.wait_if_needed()
        try:
            resp = self._http.post(
                XERO_INVOICES_URL,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Xero-Tenant-Id": tenant_id,
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                json={"Invoices": [bill]},
                timeout=HTTP_TIMEOUT_SEC,
            )
        except requests.RequestException as e:
            raise XeroTokenError(f"Network error στο push_bill: {e}") from e

        if resp.status_code not in (200, 201):
            raise XeroTokenError(
                f"Push bill απέτυχε (HTTP {resp.status_code}): {resp.text[:300]}"
            )

        data = resp.json()
        invoices = data.get("Invoices", [])
        if not invoices:
            raise XeroTokenError("Xero δεν επέστρεψε Invoice στο response")

        inv = invoices[0]
        invoice_id = inv.get("InvoiceID")
        deep_link = f"https://go.xero.com/AccountsPayable/Edit.aspx?InvoiceID={invoice_id}"
        logger.info("Push Bill OK: %s → %s (DRAFT)", invoice_number, invoice_id)
        return {
            "invoice_id": invoice_id,
            "status": inv.get("Status", "DRAFT"),
            "deep_link": deep_link,
            "raw_response": inv,
        }


    def disconnect(self) -> None:
        """
        Διαγραφή local token file. Επιπλέον best-effort revoke στο Xero
        (δεν blocking αν αποτύχει — το offline cleanup είναι το critical).
        """
        if self._cached_tokens:
            try:
                self._http.post(
                    XERO_REVOKE_URL,
                    data={"token": self._cached_tokens.refresh_token, "client_id": self.client_id},
                    timeout=HTTP_TIMEOUT_SEC,
                )
            except requests.RequestException as e:
                logger.warning("Xero token revoke απέτυχε (μη κρίσιμο): %s", e)

        if self._token_path.exists():
            self._token_path.unlink()
        self._cached_tokens = None
        logger.info("Xero disconnected, local token διαγράφηκε")
