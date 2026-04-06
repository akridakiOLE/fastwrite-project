"""
Authentication module: JWT token management and password hashing.
"""

import os
import secrets
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

import jwt
import bcrypt
from flask import request, jsonify, redirect

# ── JWT Secret: persist to file so it survives restarts ──────────────────────
_SECRET_FILE = Path("/app/projects/secrets/jwt_secret.key")

def _load_or_create_secret() -> str:
    """Load JWT secret from env, file, or create a new one and save it."""
    # 1. Environment variable takes priority
    env_secret = os.environ.get("FASTWRITE_SECRET")
    if env_secret:
        return env_secret
    # 2. Try to load from file
    try:
        if _SECRET_FILE.exists():
            stored = _SECRET_FILE.read_text().strip()
            if stored:
                return stored
    except Exception:
        pass
    # 3. Generate new secret and save to file
    new_secret = secrets.token_hex(32)
    try:
        _SECRET_FILE.parent.mkdir(parents=True, exist_ok=True)
        _SECRET_FILE.write_text(new_secret)
    except Exception:
        pass  # Fallback: use ephemeral secret
    return new_secret

JWT_SECRET = _load_or_create_secret()
JWT_ALGORITHM = "HS256"
TOKEN_EXPIRY_HOURS = 24
COOKIE_NAME = "fw_token"


def create_token(user_id: int, username: str, role: str = "user") -> str:
    """Create a JWT token for the given user."""
    payload = {
        "user_id": user_id,
        "username": username,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRY_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_token(token: str) -> dict | None:
    """Verify a JWT token. Returns user dict or None."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return {
            "user_id": payload["user_id"],
            "username": payload["username"],
            "role": payload.get("role", "user"),
        }
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


def hash_password(password: str) -> str:
    """Hash a password with bcrypt."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def check_password(password: str, hashed: str) -> bool:
    """Check a password against a bcrypt hash."""
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


def require_auth(f):
    """Decorator that checks fw_token cookie and returns 401 if invalid."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.cookies.get(COOKIE_NAME)
        if not token:
            return jsonify({"error": "Authentication required"}), 401
        user = verify_token(token)
        if not user:
            return jsonify({"error": "Invalid or expired token"}), 401
        request.current_user = user
        return f(*args, **kwargs)
    return decorated


def require_admin(f):
    """Decorator that checks fw_token cookie AND requires admin role."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.cookies.get(COOKIE_NAME)
        if not token:
            return jsonify({"error": "Authentication required"}), 401
        user = verify_token(token)
        if not user:
            return jsonify({"error": "Invalid or expired token"}), 401
        if user.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403
        request.current_user = user
        return f(*args, **kwargs)
    return decorated
