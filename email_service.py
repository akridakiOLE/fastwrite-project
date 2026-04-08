"""
Email Service: Resend integration for FastWrite
Handles transactional emails (password reset OTP, notifications).
"""

import json
import logging
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

logger = logging.getLogger(__name__)

# ── Configuration ──
RESEND_API_URL = "https://api.resend.com/emails"
FROM_EMAIL = "FastWrite <noreply@fastwrite.tech>"

# Load API key from secrets file
_api_key = None

def _get_api_key() -> str:
    """Load the Resend API key from secrets (lazy, cached)."""
    global _api_key
    if _api_key:
        return _api_key
    secret_path = Path("/app/projects/secrets/resend_api_key.txt")
    if not secret_path.exists():
        raise RuntimeError("Resend API key not found at /app/projects/secrets/resend_api_key.txt")
    _api_key = secret_path.read_text().strip()
    return _api_key


def send_email(to: str, subject: str, html: str) -> dict:
    """Send an email via Resend API. Returns the API response dict."""
    api_key = _get_api_key()
    payload = json.dumps({
        "from": FROM_EMAIL,
        "to": [to],
        "subject": subject,
        "html": html,
    }).encode("utf-8")

    req = Request(RESEND_API_URL, data=payload, method="POST")
    req.add_header("Authorization", f"Bearer {api_key}")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "FastWrite/1.0")

    try:
        with urlopen(req, timeout=10) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            logger.info(f"Email sent to {to}: {body.get('id', 'unknown')}")
            return body
    except HTTPError as e:
        error_body = e.read().decode("utf-8") if e.fp else str(e)
        logger.error(f"Resend API error ({e.code}): {error_body}")
        raise RuntimeError(f"Email sending failed: {error_body}")
    except URLError as e:
        logger.error(f"Resend connection error: {e}")
        raise RuntimeError(f"Email connection failed: {e}")


def send_password_reset_otp(to: str, otp_code: str, username: str) -> dict:
    """Send a password reset OTP email."""
    subject = f"FastWrite - Κωδικός Επαναφοράς: {otp_code}"
    html = f"""
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:480px;margin:0 auto;background:#0a0c10;color:#e8eaf0;padding:40px;border-radius:16px;">
      <h1 style="font-size:22px;margin-bottom:8px;">Fast<span style="color:#00e5a0;">Write</span></h1>
      <p style="color:#7c8299;font-size:14px;margin-bottom:24px;">Password Reset Request</p>
      <p style="font-size:14px;line-height:1.6;">
        Γεια σου <strong>{username}</strong>,<br><br>
        Λάβαμε αίτημα επαναφοράς κωδικού για τον λογαριασμό σου.
        Χρησιμοποίησε τον παρακάτω κωδικό:
      </p>
      <div style="background:#181c24;border:2px solid #00e5a0;border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
        <span style="font-size:36px;font-weight:700;letter-spacing:12px;color:#00e5a0;">{otp_code}</span>
      </div>
      <p style="font-size:13px;color:#7c8299;line-height:1.5;">
        Ο κωδικός λήγει σε <strong>10 λεπτά</strong>.<br>
        Αν δεν ζήτησες επαναφορά κωδικού, αγνόησε αυτό το email.
      </p>
      <hr style="border:none;border-top:1px solid #1e2330;margin:24px 0;">
      <p style="font-size:11px;color:#555;text-align:center;">
        &copy; FastWrite — AI Document Extractor<br>
        <a href="https://fastwrite.tech" style="color:#00e5a0;text-decoration:none;">fastwrite.tech</a>
      </p>
    </div>
    """
    return send_email(to, subject, html)
