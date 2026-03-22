import sqlite3
import json
from datetime import datetime
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
        self.conn = sqlite3.connect(self.db_path, check_same_thread=False)
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

    # ─── DOCUMENTS ────────────────────────────────────────────────────────────

    def insert_document(self, filename: str, file_path: str = None,
                         schema_name: str = None,
                         original_filename: str = None) -> int:
        """Insert a new document record. Returns the new row id."""
        now = datetime.utcnow().isoformat()
        orig = original_filename or filename  # fallback: ίδιο με filename
        cursor = self.conn.execute(
            """INSERT INTO documents
               (filename, original_filename, file_path, status, created_at, updated_at, schema_name)
               VALUES (?, ?, ?, 'Pending', ?, ?, ?)""",
            (filename, orig, file_path, now, now, schema_name)
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

    def list_documents(self, status: str = None) -> List[Dict[str, Any]]:
        """Return all documents, optionally filtered by status."""
        if status:
            rows = self.conn.execute(
                "SELECT * FROM documents WHERE status=? ORDER BY created_at DESC",
                (status,)
            ).fetchall()
        else:
            rows = self.conn.execute(
                "SELECT * FROM documents ORDER BY created_at DESC"
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
                       supplier_pattern: str = None) -> int:
        """Save (insert or replace) an extraction template."""
        now = datetime.utcnow().isoformat()
        cursor = self.conn.execute(
            """INSERT INTO templates (name, fields_json, require_review, supplier_pattern, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(name) DO UPDATE SET
                   fields_json=excluded.fields_json,
                   require_review=excluded.require_review,
                   supplier_pattern=excluded.supplier_pattern,
                   updated_at=excluded.updated_at""",
            (name, json.dumps(fields), int(require_review),
             supplier_pattern.strip() if supplier_pattern else None, now, now)
        )
        self.conn.commit()
        return cursor.lastrowid

    def get_template(self, name: str) -> Optional[Dict]:
        """Fetch a template by name."""
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

    def list_templates(self) -> List[Dict]:
        """Return all saved templates."""
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

    def delete_template(self, name: str):
        """Delete a template by name."""
        self.conn.execute("DELETE FROM templates WHERE name=?", (name,))
        self.conn.commit()

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
