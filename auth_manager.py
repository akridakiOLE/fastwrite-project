"""
Authentication module: JWT token management and password hashing.
"""

import os
import secrets
from datetime import datetime, timedelta, timezone
from functools import wraps

import jwt
import bcrypt
from flask import request, jsonify, redirect

JWT_SECRET = os.environ.get("FASTWRITE_SECRET", secrets.token_hex(32))
JWT_ALGORITHM = "HS256"
TOKEN_EXPIRY_HOURS = 24
COOKIE_NAME = "fw_token"


def create_token(user_id: int, username: str) -> str:
    """Create a JWT token for the given user."""
    payload = {
        "user_id": user_id,
        "username": username,
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRY_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_token(token: str) -> dict | None:
    """Verify a JWT token. Returns user dict or None."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return {"user_id": payload["user_id"], "username": payload["username"]}
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
