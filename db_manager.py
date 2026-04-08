"""
Module 1: Τοπική Βάση Δεδομένων & Διαχείριση Ρυθμίσεων (Core Storage)
SQLite-based persistence layer for document metadata, user settings, and templates.
"""

import sqlite3
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, List, Dict, Any


# Default DB path for production
DEFAULT_DB_PATH = Path("/app/projects/data/app.db")


class DatabaseManager:
    """
    Manages all SQLite operations for the application.
    Supports in-memory DBs (for testing) and file-based DBs (for production).
    """

    def __init__(self, db_path: str = ":memory:"):
        """
        Initialize the database manager.
        :param db_path: Path to SQLite file, or ':memory:' for in-memory DB.
        """
        self.db_path = db_path
        self.conn: Optional[sqlite3.Connection] = None
        self._connect()
        self._create_tables()

    def _connect(self):
        """Establish the SQLite connection."""
        if self.db_path != ":memory:":
            Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(
            self.db_path,
            check_same_thread=False,
            isolation_level=None          # ← TRUE autocommit: κάθε SELECT βλέπει τα τελευταία δεδομένα
        )
        self.conn.row_factory = sqlite3.Row  # Return rows as dict-like objects
        self.conn.execute("PRAGMA journal_mode=WAL;")
        self.conn.execute("PRAGMA foreign_keys=ON;")

    def _create_tables(self):
        """Create all required tables if they don't exist."""
        with self.conn:
            # Documents table: stores metadata about uploaded/processed files
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS documents (
                    id                INTEGER PRIMARY KEY AUTOINCREMENT,
                    filename          TEXT    NOT NULL,
                    original_filename TEXT,
                    file_path         TEXT,
                    status            TEXT    NOT NULL DEFAULT 'Pending',
                    created_at        TEXT    NOT NULL,
                    updated_at        TEXT    NOT NULL,
                    schema_name       TEXT,
                    result_json       TEXT
                )
            """)
            # Migration: add original_filename column if missing
            try:
                self.conn.execute("ALTER TABLE documents ADD COLUMN original_filename TEXT")
                self.conn.commit()
            except Exception:
                pass  # Column already exists
            # Migration: add user_id column for data isolation
            try:
                self.conn.execute("ALTER TABLE documents ADD COLUMN user_id INTEGER DEFAULT NULL")
                self.conn.commit()
            except Exception:
                pass

            # Settings table: key-value store for user preferences
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS settings (
                    key         TEXT PRIMARY KEY,
                    value       TEXT NOT NULL,
                    updated_at  TEXT NOT NULL
                )
            """)

            # Templates / Schemas table: stores user-defined extraction schemas
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS templates (
                    id               INTEGER PRIMARY KEY AUTOINCREMENT,
                    name             TEXT    NOT NULL UNIQUE,
                    fields_json      TEXT    NOT NULL,
                    require_review   INTEGER NOT NULL DEFAULT 0,
                    supplier_pattern TEXT,
                    created_at       TEXT    NOT NULL,
                    updated_at       TEXT    NOT NULL
                )
            """)
            # Migration: add require_review column if missing (existing DBs)
            try:
                self.conn.execute("ALTER TABLE templates ADD COLUMN require_review INTEGER NOT NULL DEFAULT 0")
                self.conn.commit()
            except Exception:
                pass  # Column already exists
            # Migration: add supplier_pattern column if missing (existing DBs)
            try:
                self.conn.execute("ALTER TABLE templates ADD COLUMN supplier_pattern TEXT")
                self.conn.commit()
            except Exception:
                pass  # Column already exists
            # Migration: add user_id column for data isolation
            try:
                self.conn.execute("ALTER TABLE templates ADD COLUMN user_id INTEGER DEFAULT NULL")
                self.conn.commit()
            except Exception:
                pass

            # Activity Log table: ιστορικό δραστηριοτήτων Upload & Extract
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS activity_log (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    filename        TEXT    NOT NULL,
                    file_path       TEXT,
                    action          TEXT    NOT NULL,
                    total_invoices  INTEGER NOT NULL DEFAULT 0,
                    without_template INTEGER NOT NULL DEFAULT 0,
                    needs_approval  INTEGER NOT NULL DEFAULT 0,
                    no_approval     INTEGER NOT NULL DEFAULT 0,
                    result_json     TEXT,
                    created_at      TEXT    NOT NULL
                )
            """)
            # Migration: add file_path column if missing
            try:
                self.conn.execute("ALTER TABLE activity_log ADD COLUMN file_path TEXT")
                self.conn.commit()
            except Exception:
                pass
            # Migration: add updated_at column if missing
            try:
                self.conn.execute("ALTER TABLE activity_log ADD COLUMN updated_at TEXT")
                self.conn.commit()
            except Exception:
                pass
            # Migration: add user_id column for data isolation
            try:
                self.conn.execute("ALTER TABLE activity_log ADD COLUMN user_id INTEGER DEFAULT NULL")
                self.conn.commit()
            except Exception:
                pass

            # Users table: authentication and authorization
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id            INTEGER PRIMARY KEY AUTOINCREMENT,
                    username      TEXT    NOT NULL UNIQUE,
                    password_hash TEXT    NOT NULL,
                    role          TEXT    NOT NULL DEFAULT 'user',
                    created_at    TEXT    NOT NULL,
                    is_active     INTEGER NOT NULL DEFAULT 1
                )
            """)
            # Migrations: add user columns if missing (safe for multiple workers)
            try:
                cols = [row[1] for row in self.conn.execute("PRAGMA table_info(users)").fetchall()]
                if 'email' not in cols:
                    self.conn.execute("ALTER TABLE users ADD COLUMN email TEXT DEFAULT ''")
                if 'totp_secret' not in cols:
                    self.conn.execute("ALTER TABLE users ADD COLUMN totp_secret TEXT DEFAULT ''")
                if 'totp_enabled' not in cols:
                    self.conn.execute("ALTER TABLE users ADD COLUMN totp_enabled INTEGER DEFAULT 0")
                if 'terms_accepted_at' not in cols:
                    self.conn.execute("ALTER TABLE users ADD COLUMN terms_accepted_at TEXT DEFAULT ''")
                self.conn.commit()
            except Exception:
                pass  # Columns already exist (race condition with multiple workers)

            # ── Password resets table: OTP tokens ──
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS password_resets (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id    INTEGER NOT NULL,
                    otp_code   TEXT    NOT NULL,
                    created_at TEXT    NOT NULL,
                    expires_at TEXT    NOT NULL,
                    used       INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
            """)
            self.conn.commit()

            # ── Plans table: pricing tiers ──
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS plans (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    name            TEXT    NOT NULL UNIQUE,
                    display_name    TEXT    NOT NULL,
                    price_cents     INTEGER NOT NULL DEFAULT 0,
                    doc_limit       INTEGER NOT NULL DEFAULT 50,
                    page_limit      INTEGER NOT NULL DEFAULT 500,
                    features_json   TEXT,
                    stripe_price_id TEXT,
                    is_active       INTEGER NOT NULL DEFAULT 1,
                    sort_order      INTEGER NOT NULL DEFAULT 0,
                    created_at      TEXT    NOT NULL,
                    updated_at      TEXT    NOT NULL
                )
            """)

            # ── Subscriptions table: user plan assignments ──
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS subscriptions (
                    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id                 INTEGER NOT NULL,
                    plan_id                 INTEGER NOT NULL,
                    status                  TEXT    NOT NULL DEFAULT 'active',
                    stripe_subscription_id  TEXT,
                    stripe_customer_id      TEXT,
                    current_period_start    TEXT    NOT NULL,
                    current_period_end      TEXT    NOT NULL,
                    cancel_at_period_end    INTEGER NOT NULL DEFAULT 0,
                    created_at              TEXT    NOT NULL,
                    updated_at              TEXT    NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id),
                    FOREIGN KEY (plan_id) REFERENCES plans(id)
                )
            """)

            # ── Usage events table: telemetry (counters only, NEVER content) ──
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS usage_events (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id         INTEGER NOT NULL,
                    event_type      TEXT    NOT NULL,
                    quantity         INTEGER NOT NULL DEFAULT 1,
                    metadata_json   TEXT,
                    created_at      TEXT    NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
            """)

            # ── Usage summary table: pre-aggregated per billing period ──
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS usage_summary (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id         INTEGER NOT NULL,
                    period_start    TEXT    NOT NULL,
                    period_end      TEXT    NOT NULL,
                    docs_used       INTEGER NOT NULL DEFAULT 0,
                    pages_used      INTEGER NOT NULL DEFAULT 0,
                    updated_at      TEXT    NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id),
                    UNIQUE(user_id, period_start)
                )
            """)

            # ── Billing history table: mirrors Stripe invoices ──
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS billing_history (
                    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id             INTEGER NOT NULL,
                    stripe_invoice_id   TEXT,
                    amount_cents        INTEGER NOT NULL DEFAULT 0,
                    currency            TEXT    NOT NULL DEFAULT 'eur',
                    status              TEXT    NOT NULL DEFAULT 'open',
                    period_start        TEXT,
                    period_end          TEXT,
                    invoice_url         TEXT,
                    created_at          TEXT    NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
            """)

            # Migration: assign orphan data (user_id IS NULL) to first admin user
            try:
                admin = self.conn.execute(
                    "SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1"
                ).fetchone()
                if admin:
                    aid = admin["id"]
                    self.conn.execute("UPDATE documents SET user_id=? WHERE user_id IS NULL", (aid,))
                    self.conn.execute("UPDATE templates SET user_id=? WHERE user_id IS NULL", (aid,))
                    self.conn.execute("UPDATE activity_log SET user_id=? WHERE user_id IS NULL", (aid,))
                    self.conn.commit()
            except Exception:
                pass

    # ─── DOCUMENTS ────────────────────────────────────────────────────────────

    def insert_document(self, filename: str, file_path: str = None,
                         schema_name: str = None,
                         original_filename: str = None,
                         user_id: int = None) -> int:
        """Insert a new document record. Returns the new row id."""
        now = datetime.utcnow().isoformat()
        orig = original_filename or filename  # fallback: ίδιο με filename
        cursor = self.conn.execute(
            """INSERT INTO documents
               (filename, original_filename, file_path, status, created_at, updated_at, schema_name, user_id)
               VALUES (?, ?, ?, 'Pending', ?, ?, ?, ?)""",
            (filename, orig, file_path, now, now, schema_name, user_id)
        )
        self.conn.commit()
        return cursor.lastrowid

    def get_document(self, doc_id: int) -> Optional[Dict[str, Any]]:
        """Fetch a single document by ID. Returns a dict or None."""
        row = self.conn.execute(
            "SELECT * FROM documents WHERE id = ?", (doc_id,)
        ).fetchone()
        return dict(row) if row else None

    def update_document_status(self, doc_id: int, status: str,
                                result_json: str = None):
        """Update the status (and optionally result) of a document."""
        now = datetime.utcnow().isoformat()
        self.conn.execute(
            """UPDATE documents SET status=?, result_json=?, updated_at=?
               WHERE id=?""",
            (status, result_json, now, doc_id)
        )
        self.conn.commit()

    def delete_document(self, doc_id: int):
        """Delete a document record by ID."""
        self.conn.execute("DELETE FROM documents WHERE id=?", (doc_id,))
        self.conn.commit()

    def list_documents(self, status: str = None, user_id: int = None) -> List[Dict[str, Any]]:
        """Return documents, filtered by status and/or user_id."""
        conditions = []
        params = []
        if status:
            conditions.append("status = ?")
            params.append(status)
        if user_id is not None:
            conditions.append("user_id = ?")
            params.append(user_id)
        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
        rows = self.conn.execute(
            f"SELECT * FROM documents {where} ORDER BY created_at DESC",
            params
        ).fetchall()
        return [dict(r) for r in rows]

    # ─── SETTINGS ─────────────────────────────────────────────────────────────

    def set_setting(self, key: str, value: Any):
        """Upsert a setting value (serialized to JSON string)."""
        now = datetime.utcnow().isoformat()
        self.conn.execute(
            """INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
               ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at""",
            (key, json.dumps(value), now)
        )
        self.conn.commit()

    def get_setting(self, key: str, default=None) -> Any:
        """Retrieve a setting value, deserializing from JSON."""
        row = self.conn.execute(
            "SELECT value FROM settings WHERE key=?", (key,)
        ).fetchone()
        if row:
            return json.loads(row["value"])
        return default

    # ─── TEMPLATES ────────────────────────────────────────────────────────────

    def save_template(self, name: str, fields: List[Dict],
                       require_review: bool = False,
                       supplier_pattern: str = None,
                       user_id: int = None) -> int:
        """Save (insert or replace) an extraction template."""
        now = datetime.utcnow().isoformat()
        # Check if template exists for this user
        existing = None
        if user_id is not None:
            existing = self.conn.execute(
                "SELECT id FROM templates WHERE name=? AND user_id=?", (name, user_id)
            ).fetchone()
        else:
            existing = self.conn.execute(
                "SELECT id FROM templates WHERE name=?", (name,)
            ).fetchone()
        if existing:
            self.conn.execute(
                """UPDATE templates SET fields_json=?, require_review=?,
                   supplier_pattern=?, updated_at=? WHERE id=?""",
                (json.dumps(fields), int(require_review),
                 supplier_pattern.strip() if supplier_pattern else None,
                 now, existing["id"])
            )
            self.conn.commit()
            return existing["id"]
        else:
            cursor = self.conn.execute(
                """INSERT INTO templates (name, fields_json, require_review,
                   supplier_pattern, created_at, updated_at, user_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (name, json.dumps(fields), int(require_review),
                 supplier_pattern.strip() if supplier_pattern else None,
                 now, now, user_id)
            )
            self.conn.commit()
            return cursor.lastrowid

    def get_template(self, name: str, user_id: int = None) -> Optional[Dict]:
        """Fetch a template by name, optionally scoped to user."""
        if user_id is not None:
            row = self.conn.execute(
                "SELECT * FROM templates WHERE name=? AND user_id=?", (name, user_id)
            ).fetchone()
        else:
            row = self.conn.execute(
                "SELECT * FROM templates WHERE name=?", (name,)
            ).fetchone()
        if row:
            d = dict(row)
            d["fields"] = json.loads(d["fields_json"])
            d["require_review"] = bool(d.get("require_review", 0))
            d["supplier_pattern"] = d.get("supplier_pattern") or ""
            return d
        return None

    def list_templates(self, user_id: int = None) -> List[Dict]:
        """Return templates, optionally filtered by user_id."""
        if user_id is not None:
            rows = self.conn.execute(
                "SELECT * FROM templates WHERE user_id=? ORDER BY name", (user_id,)
            ).fetchall()
        else:
            rows = self.conn.execute(
                "SELECT * FROM templates ORDER BY name"
            ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["fields"] = json.loads(d["fields_json"])
            d["require_review"] = bool(d.get("require_review", 0))
            d["supplier_pattern"] = d.get("supplier_pattern") or ""
            result.append(d)
        return result

    def delete_template(self, name: str, user_id: int = None):
        """Delete a template by name, optionally scoped to user."""
        if user_id is not None:
            self.conn.execute("DELETE FROM templates WHERE name=? AND user_id=?", (name, user_id))
        else:
            self.conn.execute("DELETE FROM templates WHERE name=?", (name,))
        self.conn.commit()

    # ─── ACTIVITY LOG ──────────────────────────────────────────────────────────

    def insert_activity(self, filename: str, action: str,
                        total_invoices: int = 0, without_template: int = 0,
                        needs_approval: int = 0, no_approval: int = 0,
                        result_json: str = None, file_path: str = None,
                        user_id: int = None) -> int:
        """Insert a new activity log entry. Returns the new row id."""
        now = datetime.utcnow().isoformat()
        cursor = self.conn.execute(
            """INSERT INTO activity_log
               (filename, file_path, action, total_invoices, without_template,
                needs_approval, no_approval, result_json, created_at, updated_at, user_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (filename, file_path, action, total_invoices, without_template,
             needs_approval, no_approval, result_json, now, now, user_id)
        )
        self.conn.commit()
        return cursor.lastrowid

    def update_activity(self, activity_id: int, **kwargs) -> bool:
        """Update an activity log entry. Accepted kwargs: total_invoices,
        without_template, needs_approval, no_approval, result_json.
        Automatically sets updated_at to current UTC time."""
        allowed = {'total_invoices', 'without_template', 'needs_approval',
                   'no_approval', 'result_json'}
        fields = {k: v for k, v in kwargs.items() if k in allowed}
        if not fields:
            return False
        fields['updated_at'] = datetime.utcnow().isoformat()
        set_clause = ', '.join(f"{k} = ?" for k in fields)
        values = list(fields.values()) + [activity_id]
        self.conn.execute(
            f"UPDATE activity_log SET {set_clause} WHERE id = ?", values
        )
        self.conn.commit()
        return True

    def list_activities(self, limit: int = 50, user_id: int = None) -> List[Dict[str, Any]]:
        """Return recent activity log entries, optionally filtered by user_id."""
        if user_id is not None:
            rows = self.conn.execute(
                "SELECT * FROM activity_log WHERE user_id=? ORDER BY created_at DESC LIMIT ?",
                (user_id, limit)
            ).fetchall()
        else:
            rows = self.conn.execute(
                "SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?",
                (limit,)
            ).fetchall()
        return [dict(r) for r in rows]

    def get_activity(self, activity_id: int) -> Optional[Dict[str, Any]]:
        """Fetch a single activity log entry by ID."""
        row = self.conn.execute(
            "SELECT * FROM activity_log WHERE id = ?", (activity_id,)
        ).fetchone()
        return dict(row) if row else None

    # ─── USERS ────────────────────────────────────────────────────────────────

    def create_user(self, username: str, password_hash: str, role: str = 'user') -> int:
        """Create a new user. Returns the new user id."""
        now = datetime.utcnow().isoformat()
        cursor = self.conn.execute(
            """INSERT INTO users (username, password_hash, role, created_at)
               VALUES (?, ?, ?, ?)""",
            (username, password_hash, role, now)
        )
        self.conn.commit()
        return cursor.lastrowid

    def get_user_by_username(self, username: str) -> Optional[Dict[str, Any]]:
        """Fetch a user by username. Returns a dict or None."""
        row = self.conn.execute(
            "SELECT * FROM users WHERE username = ?", (username,)
        ).fetchone()
        return dict(row) if row else None

    def get_user_by_id(self, user_id: int) -> Optional[Dict[str, Any]]:
        """Fetch a user by ID. Returns a dict or None."""
        row = self.conn.execute(
            "SELECT * FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        return dict(row) if row else None

    def list_users(self) -> List[Dict[str, Any]]:
        """Return all users (safe fields only — no password_hash, no totp_secret)."""
        rows = self.conn.execute(
            "SELECT id, username, role, email, created_at, is_active, totp_enabled FROM users ORDER BY created_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]

    def user_stats(self) -> Dict[str, Any]:
        """Return detailed user statistics for admin dashboard."""
        now = self.conn.execute("SELECT datetime('now')").fetchone()[0]
        today = now[:10]
        # Week start (Monday)
        week_start = self.conn.execute(
            "SELECT date(?, '-' || ((strftime('%w', ?) + 6) % 7) || ' days')",
            (today, today)
        ).fetchone()[0]
        month_start = today[:7] + "-01"

        total     = self.conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        active    = self.conn.execute("SELECT COUNT(*) FROM users WHERE is_active = 1").fetchone()[0]
        inactive  = total - active
        admins    = self.conn.execute("SELECT COUNT(*) FROM users WHERE role = 'admin'").fetchone()[0]
        with_2fa  = self.conn.execute("SELECT COUNT(*) FROM users WHERE totp_enabled = 1").fetchone()[0]
        with_email = self.conn.execute("SELECT COUNT(*) FROM users WHERE email IS NOT NULL AND email != ''").fetchone()[0]

        today_count = self.conn.execute(
            "SELECT COUNT(*) FROM users WHERE created_at >= ?", (today + "T00:00:00",)
        ).fetchone()[0]
        week_count = self.conn.execute(
            "SELECT COUNT(*) FROM users WHERE created_at >= ?", (week_start + "T00:00:00",)
        ).fetchone()[0]
        month_count = self.conn.execute(
            "SELECT COUNT(*) FROM users WHERE created_at >= ?", (month_start + "T00:00:00",)
        ).fetchone()[0]

        # Registrations per day (last 30 days)
        daily = self.conn.execute("""
            SELECT date(created_at) as day, COUNT(*) as cnt
            FROM users
            WHERE created_at >= date('now', '-30 days')
            GROUP BY day ORDER BY day
        """).fetchall()

        return {
            "total": total, "active": active, "inactive": inactive,
            "admins": admins, "with_2fa": with_2fa, "with_email": with_email,
            "registered_today": today_count,
            "registered_this_week": week_count,
            "registered_this_month": month_count,
            "daily_registrations": [{"date": r[0], "count": r[1]} for r in daily],
        }

    def update_user_username(self, user_id: int, username: str):
        """Update a user's username. Raises if duplicate."""
        self.conn.execute(
            "UPDATE users SET username = ? WHERE id = ?",
            (username, user_id)
        )
        self.conn.commit()

    def update_user_password(self, user_id: int, password_hash: str):
        """Update a user's password hash."""
        self.conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (password_hash, user_id)
        )
        self.conn.commit()

    def update_user_email(self, user_id: int, email: str):
        """Update a user's email."""
        self.conn.execute(
            "UPDATE users SET email = ? WHERE id = ?",
            (email, user_id)
        )
        self.conn.commit()

    def set_totp_secret(self, user_id: int, secret: str):
        """Store TOTP secret for a user (not yet enabled)."""
        self.conn.execute(
            "UPDATE users SET totp_secret = ? WHERE id = ?",
            (secret, user_id)
        )
        self.conn.commit()

    def enable_totp(self, user_id: int):
        """Enable TOTP 2FA for a user."""
        self.conn.execute(
            "UPDATE users SET totp_enabled = 1 WHERE id = ?",
            (user_id,)
        )
        self.conn.commit()

    def disable_totp(self, user_id: int):
        """Disable TOTP 2FA and clear secret."""
        self.conn.execute(
            "UPDATE users SET totp_enabled = 0, totp_secret = '' WHERE id = ?",
            (user_id,)
        )
        self.conn.commit()

    def deactivate_user(self, user_id: int):
        """Deactivate a user by ID."""
        self.conn.execute(
            "UPDATE users SET is_active = 0 WHERE id = ?", (user_id,)
        )
        self.conn.commit()

    def activate_user(self, user_id: int):
        """Activate a user by ID."""
        self.conn.execute(
            "UPDATE users SET is_active = 1 WHERE id = ?", (user_id,)
        )
        self.conn.commit()

    def update_user_role(self, user_id: int, role: str):
        """Update a user's role."""
        self.conn.execute(
            "UPDATE users SET role = ? WHERE id = ?", (role, user_id)
        )
        self.conn.commit()

    # ─── PASSWORD RESET ────────────────────────────────────────────────────────

    def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        """Fetch a user by email address."""
        row = self.conn.execute(
            "SELECT * FROM users WHERE email = ? AND email != '' AND is_active = 1",
            (email,)
        ).fetchone()
        return dict(row) if row else None

    def create_password_reset(self, user_id: int, otp_code: str, expires_minutes: int = 10) -> int:
        """Create a password reset OTP. Invalidates any previous unused OTPs for this user."""
        self.conn.execute(
            "UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0",
            (user_id,)
        )
        now = datetime.utcnow()
        expires = now + timedelta(minutes=expires_minutes)
        cursor = self.conn.execute(
            """INSERT INTO password_resets (user_id, otp_code, created_at, expires_at, used)
               VALUES (?, ?, ?, ?, 0)""",
            (user_id, otp_code, now.isoformat(), expires.isoformat())
        )
        self.conn.commit()
        return cursor.lastrowid

    def verify_password_reset_otp(self, email: str, otp_code: str) -> Optional[Dict[str, Any]]:
        """Verify an OTP code for password reset. Returns user dict if valid, None otherwise."""
        user = self.get_user_by_email(email)
        if not user:
            return None
        row = self.conn.execute(
            """SELECT * FROM password_resets
               WHERE user_id = ? AND otp_code = ? AND used = 0
               AND expires_at > ?
               ORDER BY created_at DESC LIMIT 1""",
            (user['id'], otp_code, datetime.utcnow().isoformat())
        ).fetchone()
        if not row:
            return None
        # Mark OTP as used
        self.conn.execute(
            "UPDATE password_resets SET used = 1 WHERE id = ?", (row['id'],)
        )
        self.conn.commit()
        return user

    # ─── PLANS ────────────────────────────────────────────────────────────────

    def create_plan(self, name: str, display_name: str, price_cents: int = 0,
                    doc_limit: int = 50, page_limit: int = 500,
                    features_json: str = None, stripe_price_id: str = None,
                    sort_order: int = 0) -> int:
        """Create a new pricing plan. Returns the plan id."""
        now = datetime.utcnow().isoformat()
        cursor = self.conn.execute(
            """INSERT INTO plans
               (name, display_name, price_cents, doc_limit, page_limit,
                features_json, stripe_price_id, is_active, sort_order,
                created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)""",
            (name, display_name, price_cents, doc_limit, page_limit,
             features_json, stripe_price_id, sort_order, now, now)
        )
        self.conn.commit()
        return cursor.lastrowid

    def get_plan(self, plan_id: int) -> Optional[Dict[str, Any]]:
        """Fetch a plan by ID."""
        row = self.conn.execute(
            "SELECT * FROM plans WHERE id = ?", (plan_id,)
        ).fetchone()
        return dict(row) if row else None

    def get_plan_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        """Fetch a plan by internal name."""
        row = self.conn.execute(
            "SELECT * FROM plans WHERE name = ?", (name,)
        ).fetchone()
        return dict(row) if row else None

    def list_plans(self, active_only: bool = True) -> List[Dict[str, Any]]:
        """Return plans, optionally only active ones."""
        if active_only:
            rows = self.conn.execute(
                "SELECT * FROM plans WHERE is_active = 1 ORDER BY sort_order"
            ).fetchall()
        else:
            rows = self.conn.execute(
                "SELECT * FROM plans ORDER BY sort_order"
            ).fetchall()
        return [dict(r) for r in rows]

    def update_plan(self, plan_id: int, **kwargs) -> bool:
        """Update a plan. Allowed: display_name, price_cents, doc_limit,
        page_limit, features_json, stripe_price_id, is_active, sort_order."""
        allowed = {'display_name', 'price_cents', 'doc_limit', 'page_limit',
                   'features_json', 'stripe_price_id', 'is_active', 'sort_order'}
        fields = {k: v for k, v in kwargs.items() if k in allowed}
        if not fields:
            return False
        fields['updated_at'] = datetime.utcnow().isoformat()
        set_clause = ', '.join(f"{k} = ?" for k in fields)
        values = list(fields.values()) + [plan_id]
        self.conn.execute(
            f"UPDATE plans SET {set_clause} WHERE id = ?", values
        )
        self.conn.commit()
        return True

    # ─── SUBSCRIPTIONS ────────────────────────────────────────────────────────

    def create_subscription(self, user_id: int, plan_id: int,
                            period_start: str, period_end: str,
                            status: str = 'active',
                            stripe_subscription_id: str = None,
                            stripe_customer_id: str = None) -> int:
        """Create a new subscription. Returns the subscription id."""
        now = datetime.utcnow().isoformat()
        cursor = self.conn.execute(
            """INSERT INTO subscriptions
               (user_id, plan_id, status, stripe_subscription_id,
                stripe_customer_id, current_period_start, current_period_end,
                cancel_at_period_end, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)""",
            (user_id, plan_id, status, stripe_subscription_id,
             stripe_customer_id, period_start, period_end, now, now)
        )
        self.conn.commit()
        return cursor.lastrowid

    def get_active_subscription(self, user_id: int) -> Optional[Dict[str, Any]]:
        """Fetch the active subscription for a user (most recent active/trialing)."""
        row = self.conn.execute(
            """SELECT s.*, p.name as plan_name, p.display_name as plan_display_name,
                      p.price_cents, p.doc_limit, p.page_limit, p.features_json
               FROM subscriptions s
               JOIN plans p ON s.plan_id = p.id
               WHERE s.user_id = ? AND s.status IN ('active', 'trialing', 'past_due')
               ORDER BY s.created_at DESC LIMIT 1""",
            (user_id,)
        ).fetchone()
        return dict(row) if row else None

    def update_subscription(self, sub_id: int, **kwargs) -> bool:
        """Update a subscription. Allowed: plan_id, status,
        stripe_subscription_id, stripe_customer_id, current_period_start,
        current_period_end, cancel_at_period_end."""
        allowed = {'plan_id', 'status', 'stripe_subscription_id',
                   'stripe_customer_id', 'current_period_start',
                   'current_period_end', 'cancel_at_period_end'}
        fields = {k: v for k, v in kwargs.items() if k in allowed}
        if not fields:
            return False
        fields['updated_at'] = datetime.utcnow().isoformat()
        set_clause = ', '.join(f"{k} = ?" for k in fields)
        values = list(fields.values()) + [sub_id]
        self.conn.execute(
            f"UPDATE subscriptions SET {set_clause} WHERE id = ?", values
        )
        self.conn.commit()
        return True

    def get_subscription_by_stripe_id(self, stripe_sub_id: str) -> Optional[Dict[str, Any]]:
        """Fetch subscription by Stripe subscription ID."""
        row = self.conn.execute(
            "SELECT * FROM subscriptions WHERE stripe_subscription_id = ?",
            (stripe_sub_id,)
        ).fetchone()
        return dict(row) if row else None

    def list_subscriptions(self, status: str = None) -> List[Dict[str, Any]]:
        """List all subscriptions (admin), optionally filtered by status."""
        if status:
            rows = self.conn.execute(
                """SELECT s.*, u.username, u.email, p.name as plan_name
                   FROM subscriptions s
                   JOIN users u ON s.user_id = u.id
                   JOIN plans p ON s.plan_id = p.id
                   WHERE s.status = ?
                   ORDER BY s.created_at DESC""",
                (status,)
            ).fetchall()
        else:
            rows = self.conn.execute(
                """SELECT s.*, u.username, u.email, p.name as plan_name
                   FROM subscriptions s
                   JOIN users u ON s.user_id = u.id
                   JOIN plans p ON s.plan_id = p.id
                   ORDER BY s.created_at DESC"""
            ).fetchall()
        return [dict(r) for r in rows]

    # ─── USAGE TRACKING (TELEMETRY) ──────────────────────────────────────────

    def record_usage_event(self, user_id: int, event_type: str,
                           quantity: int = 1,
                           metadata_json: str = None) -> int:
        """Record a usage event AND update the summary. Returns event id."""
        now = datetime.utcnow().isoformat()
        # Insert event
        cursor = self.conn.execute(
            """INSERT INTO usage_events
               (user_id, event_type, quantity, metadata_json, created_at)
               VALUES (?, ?, ?, ?, ?)""",
            (user_id, event_type, quantity, metadata_json, now)
        )
        event_id = cursor.lastrowid
        # Update summary
        sub = self.get_active_subscription(user_id)
        if sub:
            p_start = sub['current_period_start']
            p_end = sub['current_period_end']
            if event_type == 'doc_processed':
                self.conn.execute(
                    """INSERT INTO usage_summary (user_id, period_start, period_end, docs_used, pages_used, updated_at)
                       VALUES (?, ?, ?, ?, 0, ?)
                       ON CONFLICT(user_id, period_start) DO UPDATE SET
                       docs_used = docs_used + ?, updated_at = ?""",
                    (user_id, p_start, p_end, quantity, now, quantity, now)
                )
            elif event_type == 'page_processed':
                self.conn.execute(
                    """INSERT INTO usage_summary (user_id, period_start, period_end, docs_used, pages_used, updated_at)
                       VALUES (?, ?, ?, 0, ?, ?)
                       ON CONFLICT(user_id, period_start) DO UPDATE SET
                       pages_used = pages_used + ?, updated_at = ?""",
                    (user_id, p_start, p_end, quantity, now, quantity, now)
                )
        self.conn.commit()
        return event_id

    def get_usage_summary(self, user_id: int) -> Optional[Dict[str, Any]]:
        """Get current period usage summary for a user."""
        sub = self.get_active_subscription(user_id)
        if not sub:
            return None
        row = self.conn.execute(
            """SELECT * FROM usage_summary
               WHERE user_id = ? AND period_start = ?""",
            (user_id, sub['current_period_start'])
        ).fetchone()
        if row:
            result = dict(row)
            result['doc_limit'] = sub['doc_limit']
            result['page_limit'] = sub['page_limit']
            return result
        # No usage yet this period
        return {
            'user_id': user_id,
            'period_start': sub['current_period_start'],
            'period_end': sub['current_period_end'],
            'docs_used': 0,
            'pages_used': 0,
            'doc_limit': sub['doc_limit'],
            'page_limit': sub['page_limit'],
        }

    def check_usage_limit(self, user_id: int, event_type: str,
                          quantity: int = 1) -> Dict[str, Any]:
        """Check if user can perform action within plan limits.
        Returns: {allowed: bool, docs_used, doc_limit, pages_used, page_limit, message}"""
        summary = self.get_usage_summary(user_id)
        if not summary:
            return {'allowed': False, 'message': 'No active subscription'}

        doc_limit = summary['doc_limit']
        page_limit = summary['page_limit']
        docs_used = summary['docs_used']
        pages_used = summary['pages_used']

        if event_type == 'doc_processed' and doc_limit != -1:
            if docs_used + quantity > doc_limit:
                return {
                    'allowed': False,
                    'docs_used': docs_used, 'doc_limit': doc_limit,
                    'pages_used': pages_used, 'page_limit': page_limit,
                    'message': f'Document limit reached ({docs_used}/{doc_limit})'
                }
        elif event_type == 'page_processed' and page_limit != -1:
            if pages_used + quantity > page_limit:
                return {
                    'allowed': False,
                    'docs_used': docs_used, 'doc_limit': doc_limit,
                    'pages_used': pages_used, 'page_limit': page_limit,
                    'message': f'Page limit reached ({pages_used}/{page_limit})'
                }

        return {
            'allowed': True,
            'docs_used': docs_used, 'doc_limit': doc_limit,
            'pages_used': pages_used, 'page_limit': page_limit,
            'message': 'OK'
        }

    def get_usage_history(self, user_id: int, limit: int = 12) -> List[Dict[str, Any]]:
        """Get usage history by period (last N periods)."""
        rows = self.conn.execute(
            """SELECT * FROM usage_summary
               WHERE user_id = ?
               ORDER BY period_start DESC LIMIT ?""",
            (user_id, limit)
        ).fetchall()
        return [dict(r) for r in rows]

    def reset_usage_for_period(self, user_id: int, period_start: str,
                               period_end: str):
        """Create a fresh usage summary for a new billing period."""
        now = datetime.utcnow().isoformat()
        self.conn.execute(
            """INSERT INTO usage_summary
               (user_id, period_start, period_end, docs_used, pages_used, updated_at)
               VALUES (?, ?, ?, 0, 0, ?)
               ON CONFLICT(user_id, period_start) DO UPDATE SET
               docs_used = 0, pages_used = 0, updated_at = ?""",
            (user_id, period_start, period_end, now, now)
        )
        self.conn.commit()

    # ─── BILLING HISTORY ──────────────────────────────────────────────────────

    def insert_billing_record(self, user_id: int, amount_cents: int,
                              status: str = 'open', currency: str = 'eur',
                              stripe_invoice_id: str = None,
                              period_start: str = None,
                              period_end: str = None,
                              invoice_url: str = None) -> int:
        """Insert a billing history record. Returns the record id."""
        now = datetime.utcnow().isoformat()
        cursor = self.conn.execute(
            """INSERT INTO billing_history
               (user_id, stripe_invoice_id, amount_cents, currency, status,
                period_start, period_end, invoice_url, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (user_id, stripe_invoice_id, amount_cents, currency, status,
             period_start, period_end, invoice_url, now)
        )
        self.conn.commit()
        return cursor.lastrowid

    def update_billing_record_by_stripe_id(self, stripe_invoice_id: str,
                                           **kwargs) -> bool:
        """Update a billing record by Stripe invoice ID."""
        allowed = {'amount_cents', 'status', 'invoice_url'}
        fields = {k: v for k, v in kwargs.items() if k in allowed}
        if not fields:
            return False
        set_clause = ', '.join(f"{k} = ?" for k in fields)
        values = list(fields.values()) + [stripe_invoice_id]
        self.conn.execute(
            f"UPDATE billing_history SET {set_clause} WHERE stripe_invoice_id = ?",
            values
        )
        self.conn.commit()
        return True

    def list_billing_history(self, user_id: int,
                             limit: int = 20) -> List[Dict[str, Any]]:
        """List billing history for a user."""
        rows = self.conn.execute(
            """SELECT * FROM billing_history
               WHERE user_id = ?
               ORDER BY created_at DESC LIMIT ?""",
            (user_id, limit)
        ).fetchall()
        return [dict(r) for r in rows]

    # ─── PLAN SEEDING ────────────────────────────────────────────────────────

    def seed_default_plans(self):
        """Insert default pricing plans if none exist."""
        existing = self.conn.execute("SELECT COUNT(*) as c FROM plans").fetchone()
        if existing['c'] > 0:
            return  # Plans already seeded

        defaults = [
            {
                'name': 'free', 'display_name': 'Free',
                'price_cents': 0, 'doc_limit': 50, 'page_limit': 500,
                'features_json': json.dumps({
                    'batch_upload': False, 'export_csv': True,
                    'export_xlsx': False, 'template_limit': 1,
                    'api_access': False, 'priority_processing': False,
                    'approval_workflow': False, 'label_editor': False
                }),
                'sort_order': 0
            },
            {
                'name': 'starter', 'display_name': 'Starter',
                'price_cents': 1900, 'doc_limit': 500, 'page_limit': 5000,
                'features_json': json.dumps({
                    'batch_upload': True, 'export_csv': True,
                    'export_xlsx': True, 'template_limit': 10,
                    'api_access': False, 'priority_processing': False,
                    'approval_workflow': True, 'label_editor': True
                }),
                'sort_order': 1
            },
            {
                'name': 'professional', 'display_name': 'Professional',
                'price_cents': 4900, 'doc_limit': 2000, 'page_limit': 20000,
                'features_json': json.dumps({
                    'batch_upload': True, 'export_csv': True,
                    'export_xlsx': True, 'template_limit': -1,
                    'api_access': True, 'priority_processing': True,
                    'approval_workflow': True, 'label_editor': True
                }),
                'sort_order': 2
            },
            {
                'name': 'business', 'display_name': 'Business',
                'price_cents': 9900, 'doc_limit': 10000, 'page_limit': 100000,
                'features_json': json.dumps({
                    'batch_upload': True, 'export_csv': True,
                    'export_xlsx': True, 'template_limit': -1,
                    'api_access': True, 'priority_processing': True,
                    'approval_workflow': True, 'label_editor': True
                }),
                'sort_order': 3
            },
            {
                'name': 'enterprise', 'display_name': 'Enterprise',
                'price_cents': 0, 'doc_limit': -1, 'page_limit': -1,
                'features_json': json.dumps({
                    'batch_upload': True, 'export_csv': True,
                    'export_xlsx': True, 'template_limit': -1,
                    'api_access': True, 'priority_processing': True,
                    'approval_workflow': True, 'label_editor': True
                }),
                'sort_order': 4
            },
        ]
        now = datetime.utcnow().isoformat()
        for p in defaults:
            self.conn.execute(
                """INSERT INTO plans
                   (name, display_name, price_cents, doc_limit, page_limit,
                    features_json, stripe_price_id, is_active, sort_order,
                    created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, NULL, 1, ?, ?, ?)""",
                (p['name'], p['display_name'], p['price_cents'],
                 p['doc_limit'], p['page_limit'], p['features_json'],
                 p['sort_order'], now, now)
            )
        self.conn.commit()

    def assign_free_plan(self, user_id: int) -> int:
        """Assign the Free plan to a user. Returns the subscription id."""
        from datetime import timedelta
        free_plan = self.get_plan_by_name('free')
        if not free_plan:
            self.seed_default_plans()
            free_plan = self.get_plan_by_name('free')
        now = datetime.utcnow()
        period_start = now.isoformat()
        period_end = (now + timedelta(days=30)).isoformat()
        return self.create_subscription(
            user_id=user_id,
            plan_id=free_plan['id'],
            period_start=period_start,
            period_end=period_end,
            status='active'
        )

    # ─── UTILITIES ────────────────────────────────────────────────────────────

    def close(self):
        """Close the database connection."""
        if self.conn:
            self.conn.close()
            self.conn = None

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


# ── Convenience factory for production use ──────────────────────────────────
def get_db(db_path: str = None) -> DatabaseManager:
    """Return a DatabaseManager instance pointing at the production DB."""
    path = db_path or str(DEFAULT_DB_PATH)
    return DatabaseManager(db_path=path)
