"""
KM-PRO-F4 · FastWrite «ΓΡΑΜΜΑΤΟΚΙΒΩΤΙΟ» — ο λογιστής διαβάζει το Kostometro PRO (14/10/2026)

Σχεδιασμός: Α350 §9.8 Ε · §9.9.3–9.9.5 · Α320 9/10 · Brief PRO ↔ FastWrite 12/10 (Φ4).
  · ΚΛΕΙΔΙ ΜΟΝΟ ΑΝΑΓΝΩΣΗΣ: ο υπολογιστής έχει δικό του ζεύγος P-256. Ο Boss του δίνει τα κλειδιά A
    κλειδωμένα προς το δημόσιο κλειδί του (ίδιο σχήμα με το H του manager). ΠΟΤΕ το Κ, ΠΟΤΕ οι 12 λέξεις.
  · ΓΡΑΜΜΑΤΟΚΙΒΩΤΙΟ: τραβάμε «ό,τι μετά το Ν», σε σελίδες. Κάθε γράμμα = ένα τιμολόγιο (κεφαλίδα + γραμμές
    + αντιστοίχιση) ή το βιβλίο τιμών. Νεότερη έκδοση αντικαθιστά την παλιά (upsert).
  · ΝΕΟΙ ΠΙΝΑΚΕΣ (χωριστή βάση kostometro.db): επιχειρήσεις · προμηθευτές · κωδικοί · τιμολόγια · γραμμές,
    με ευρετήρια και πλήρες κείμενο (FTS5). Αναζήτηση ΠΑΝΤΑ με σελιδοποίηση — ποτέ «όλα στη μνήμη».
  · XERO ΩΣ ΕΧΕΙ: κάθε τιμολόγιο γράφεται και ως κανονικό έγγραφο (documents) σε «Pending» — ένα βήμα πριν
    το Approved — με φωτογραφία και γραμμές. Εξαγωγές και «Push to Xero» δουλεύουν χωρίς καμία αλλαγή.
  · ΔΙΟΡΘΩΣΗ ΛΟΓΙΣΤΗ (Α320 9/10): ισχύει ΑΜΕΣΩΣ εδώ και στις εξαγωγές· φεύγει σφραγισμένη ΠΡΟΣ τον Boss.
    Αν ο Boss την αναιρέσει, το επόμενο γράμμα το λέει και η τιμή γυρίζει.
  · «ΑΛΛΑΞΕ Η ΑΝΤΙΣΤΟΙΧΙΣΗ»: όταν ο Boss αλλάξει «ίδιο με…» ή συσκευασία κωδικού, οι γραμμές του
    σημαδεύονται (από τι σε τι) ως ο λογιστής να πατήσει «Το είδα».
"""
import base64
import hashlib
import hmac
import json
import logging
import math
import os
import re
import secrets
import sqlite3
import threading
import time
import unicodedata
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

logger = logging.getLogger("km_mailbox")

DEFAULT_ORIGIN = os.environ.get("FASTWRITE_KM_ORIGIN", "https://fastwrite.tech")
# 🔴 Μόνο ΔΙΚΟΙ ΜΑΣ servers: σύνδεσμος προς άλλη διεύθυνση θα έστελνε τον κωδικό του υπολογιστή αλλού και θα
# «τάιζε» το FastWrite με ψεύτικα τιμολόγια (εύρημα αναθεώρησης 14/10). Το FASTWRITE_KM_ORIGIN προστίθεται (δοκιμές).
ALLOWED_ORIGINS = {"https://fastwrite.tech", "https://www.fastwrite.tech", "https://fastwrite-staging.stavrosfkallenos.workers.dev",
                   DEFAULT_ORIGIN.rstrip("/")}
RID_RE = re.compile(r"^[A-Za-z0-9_-]{1,80}$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
PAGE_LIMIT = 100           # γράμματα ανά αίτημα
PAGES_PER_RUN = 50         # σελίδες ανά γύρο (μετά συνεχίζει ο επόμενος γύρος)
SEARCH_MAX_SIZE = 100
SYNC_EVERY_S = 60
SEAL_INFO = b"kostometro/team-seal"
HDR_FIELDS = ("number", "date", "net", "vat", "total", "sup_vat")
LINE_FIELDS = ("code", "desc", "unit", "qty", "unit_price", "disc_pct", "line_net", "vat_pct")
NUM_FIELDS = {"net", "vat", "total", "qty", "unit_price", "disc_pct", "line_net", "vat_pct"}


# ═══ ΚΡΥΠΤΟΓΡΑΦΙΑ — ίδια bytes με το site/km-crypto.js (P-256 ECDH → HKDF-SHA256 → AES-GCM) ═══
def ec_new():
    return ec.generate_private_key(ec.SECP256R1())


def ec_pub_raw(priv) -> bytes:
    return priv.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)


def ec_priv_pem(priv) -> str:
    return priv.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                              serialization.NoEncryption()).decode()


def ec_priv_load(pem: str):
    return serialization.load_pem_private_key(pem.encode(), password=None)


def _ec_aes(priv, pub_raw: bytes, eph_raw: bytes) -> bytes:
    pub = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), pub_raw)
    shared = priv.exchange(ec.ECDH(), pub)
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=eph_raw, info=SEAL_INFO).derive(shared)


def seal(key: bytes, data: bytes) -> bytes:
    iv = os.urandom(12)
    return iv + AESGCM(key).encrypt(iv, data, None)


def open_sym(key: bytes, blob: bytes) -> bytes:
    if len(blob) < 13 + 16:
        raise ValueError("σφραγισμένο πολύ μικρό")
    return AESGCM(key).decrypt(blob[:12], blob[12:], None)


def seal_to(pub_raw: bytes, data: bytes) -> bytes:
    eph = ec_new()
    eph_raw = ec_pub_raw(eph)
    key = _ec_aes(eph, pub_raw, eph_raw)
    return eph_raw + seal(key, data)


def open_with(priv, blob: bytes) -> bytes:
    if len(blob) < 65 + 28:
        raise ValueError("σφραγισμένο πολύ μικρό")
    eph_raw = blob[:65]
    key = _ec_aes(priv, eph_raw, eph_raw)
    return open_sym(key, blob[65:])


# ═══ ΦΥΛΑΞΗ ΜΥΣΤΙΚΩΝ ΣΤΟΝ ΔΙΣΚΟ — Windows DPAPI (μόνο ο ίδιος χρήστης των Windows τα ανοίγει) ═══
def protect(text: str) -> str:
    if os.name != "nt":
        return text
    try:
        import ctypes
        from ctypes import wintypes

        class BLOB(ctypes.Structure):
            _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]
        raw = text.encode()
        buf = ctypes.create_string_buffer(raw, len(raw))
        bin_ = BLOB(len(raw), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))
        out = BLOB()
        if not ctypes.windll.crypt32.CryptProtectData(ctypes.byref(bin_), None, None, None, None, 0, ctypes.byref(out)):
            return text
        data = ctypes.string_at(out.pbData, out.cbData)
        ctypes.windll.kernel32.LocalFree(out.pbData)
        return "dpapi:" + base64.b64encode(data).decode()
    except Exception:  # noqa — χωρίς DPAPI μένει όπως ήταν (όπως και τα υπόλοιπα κλειδιά του FastWrite)
        return text


def unprotect(text: str) -> str:
    if not text or not text.startswith("dpapi:"):
        return text
    import ctypes
    from ctypes import wintypes

    class BLOB(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]
    raw = base64.b64decode(text[6:])
    buf = ctypes.create_string_buffer(raw, len(raw))
    bin_ = BLOB(len(raw), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))
    out = BLOB()
    if not ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(bin_), None, None, None, None, 0, ctypes.byref(out)):
        raise RuntimeError("DPAPI: δεν ανοίγει (άλλος χρήστης Windows;)")
    data = ctypes.string_at(out.pbData, out.cbData)
    ctypes.windll.kernel32.LocalFree(out.pbData)
    return data.decode()


def pub_code(pub_raw: bytes) -> str:
    """Ο κωδικός επιβεβαίωσης που βλέπει ΚΑΙ ο Boss στο κινητό (sha256 του δημόσιου κλειδιού)."""
    h = hashlib.sha256(pub_raw).hexdigest()[:8].upper()
    return h[:4] + "-" + h[4:]


def _safe(v, n=200):
    """Κείμενο τρίτου (του πελάτη) που μπαίνει σε οθόνες του FastWrite ΠΟΥ ΔΕΝ το «καθαρίζουν» (Έγγραφα)."""
    if v is None:
        return None
    return str(v).replace("<", "‹").replace(">", "›").replace('"', "”")[:n]


# ═══ ΚΑΝΟΝΙΚΟΠΟΙΗΣΗ — ίδια λογική με το κινητό (norm + codeKey) ═══
_LOOK = str.maketrans({"Α": "A", "Β": "B", "Ε": "E", "Ζ": "Z", "Η": "H", "Ι": "I", "Κ": "K", "Μ": "M", "Ν": "N",
                       "Ο": "O", "Ρ": "P", "Τ": "T", "Υ": "Y", "Χ": "X"})


def norm(s) -> str:
    s = unicodedata.normalize("NFD", str(s or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s.replace("ς", "σ").lower()).strip()


def code_key(c) -> str:
    s = unicodedata.normalize("NFD", str(c or "").upper())
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return re.sub(r"[\s.\-/_]", "", s.translate(_LOOK))


def _num(v):
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    t = str(v).strip().replace("€", "").replace(" ", "")
    if "," in t and "." in t:
        t = t.replace(".", "").replace(",", ".") if t.rfind(",") > t.rfind(".") else t.replace(",", "")
    else:
        t = t.replace(",", ".")
    try:
        return float(t)
    except ValueError:
        return None


def _txt(v, n):
    """Κείμενο από το γράμμα: ΜΟΝΟ συμβολοσειρά/αριθμός, κομμένο — ποτέ λίστα/αντικείμενο στη βάση."""
    if v is None or isinstance(v, (dict, list, bool)):
        return None
    return str(v)[:n]


def _ymd(ms) -> str:
    try:
        return datetime.fromtimestamp(float(ms) / 1000).strftime("%Y-%m-%d")
    except Exception:
        return ""


# ═══ Η ΒΑΣΗ ═══
SCHEMA = """
CREATE TABLE IF NOT EXISTS km_link (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  acct_id     TEXT NOT NULL UNIQUE,
  api         TEXT NOT NULL,                 -- https://…/api/km/
  user_id     INTEGER,                       -- ο τοπικός χρήστης FastWrite που τη συνέδεσε
  name        TEXT,                          -- πώς μας λέει ο Boss
  biz         TEXT,                          -- πώς λέγεται η επιχείρηση (από το βιβλίο)
  office      TEXT,
  auth        TEXT NOT NULL,
  priv_pem    TEXT NOT NULL,
  boss_pub    TEXT,
  status      TEXT NOT NULL DEFAULT 'joined',  -- joined | active | revoked | error
  cursor      INTEGER NOT NULL DEFAULT 0,
  last_pull   TEXT,
  last_error  TEXT,
  created_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS km_suppliers (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id INTEGER NOT NULL,
  name    TEXT NOT NULL,
  nname   TEXT NOT NULL,
  vat     TEXT,
  UNIQUE (link_id, nname)
);
CREATE TABLE IF NOT EXISTS km_items (
  link_id INTEGER NOT NULL,
  key     TEXT NOT NULL,                     -- «προμηθευτής|c:κωδικός» όπως στο κινητό
  sup     TEXT, code TEXT, name TEXT,
  pid     TEXT, pname TEXT,
  per     REAL, base TEXT,
  PRIMARY KEY (link_id, key)
);
CREATE INDEX IF NOT EXISTS km_items_pid ON km_items (link_id, pid);
CREATE TABLE IF NOT EXISTS km_invoices (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id     INTEGER NOT NULL,
  rid         TEXT NOT NULL,
  supplier_id INTEGER,
  supplier    TEXT,
  sup_vat     TEXT,
  number      TEXT,
  inv_date    TEXT,                          -- YYYY-MM-DD
  net REAL, vat REAL, total REAL,
  approved    TEXT,                          -- auto | manual (Α350 §9.8 Ε: χωριστή σήμανση)
  by_name     TEXT,                          -- υπάλληλος που το έστειλε (αν όχι ο Boss)
  pages       INTEGER NOT NULL DEFAULT 1,
  photos      TEXT,                          -- json [ids]
  doc_id      INTEGER,                       -- το έγγραφο FastWrite (documents)
  fix_state   TEXT,                          -- pending | applied | undone
  fix_note    TEXT,
  map_changed INTEGER NOT NULL DEFAULT 0,
  deleted     INTEGER NOT NULL DEFAULT 0,
  seq         INTEGER,
  raw         TEXT,                          -- το τελευταίο γράμμα του Boss (για επαναφορά όταν απορριφθεί διόρθωση)
  doc_note    TEXT,                          -- το έγγραφο άλλαξε στα «Έγγραφα» — δεν γράφτηκε από πάνω
  updated_at  TEXT NOT NULL,
  UNIQUE (link_id, rid)
);
CREATE INDEX IF NOT EXISTS km_inv_date ON km_invoices (link_id, deleted, inv_date, id);
CREATE INDEX IF NOT EXISTS km_inv_sup ON km_invoices (supplier_id, inv_date);
CREATE INDEX IF NOT EXISTS km_inv_number ON km_invoices (number);
CREATE INDEX IF NOT EXISTS km_inv_flags ON km_invoices (map_changed, fix_state);
CREATE TABLE IF NOT EXISTS km_lines (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  inv_id      INTEGER NOT NULL,
  n           INTEGER NOT NULL,
  code TEXT, code_key TEXT, "desc" TEXT, unit TEXT,
  qty REAL, unit_price REAL, disc_pct REAL, line_net REAL, vat_pct REAL,
  per REAL, base TEXT, base_price REAL,
  item_key    TEXT, pid TEXT, pname TEXT,
  map_changed INTEGER NOT NULL DEFAULT 0,
  map_note    TEXT,
  fixed       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS km_lines_inv ON km_lines (inv_id, n);
CREATE INDEX IF NOT EXISTS km_lines_key ON km_lines (item_key);
CREATE INDEX IF NOT EXISTS km_lines_pid ON km_lines (pid);
CREATE INDEX IF NOT EXISTS km_lines_code ON km_lines (code_key);
CREATE TABLE IF NOT EXISTS km_fix_out (
  id        TEXT PRIMARY KEY,                -- 32 hex
  link_id   INTEGER NOT NULL,
  inv_id    INTEGER NOT NULL,
  rid       TEXT NOT NULL,
  payload   TEXT NOT NULL,
  state     TEXT NOT NULL,                   -- queued | sent | applied | undone
  at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS km_fix_state ON km_fix_out (link_id, state);
CREATE INDEX IF NOT EXISTS km_fix_inv ON km_fix_out (inv_id);
CREATE TABLE IF NOT EXISTS km_bad (            -- γράμματα που ΔΕΝ άνοιξαν: καραντίνα, ο δείκτης προχωρά
  link_id INTEGER NOT NULL, seq INTEGER NOT NULL, rid TEXT, err TEXT, at TEXT NOT NULL, PRIMARY KEY (link_id, seq)
);
CREATE TABLE IF NOT EXISTS km_photo_need (     -- φωτογραφίες που δεν κατέβηκαν: ξαναδοκιμάζονται σε κάθε γύρο
  link_id INTEGER NOT NULL, inv_id INTEGER NOT NULL, pid TEXT NOT NULL, tries INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (link_id, pid)
);
"""
FTS = """
CREATE VIRTUAL TABLE IF NOT EXISTS km_inv_fts USING fts5(txt, tokenize = 'unicode61 remove_diacritics 2');
CREATE VIRTUAL TABLE IF NOT EXISTS km_line_fts USING fts5(txt, tokenize = 'unicode61 remove_diacritics 2');
"""


class Store:
    """Η βάση του γραμματοκιβωτίου. Ένας γραφέας (κλείδωμα), πολλοί αναγνώστες."""

    def __init__(self, path):
        self.path = str(path)
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.conn = sqlite3.connect(self.path, check_same_thread=False, timeout=15)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.executescript(SCHEMA)
        for col in ("raw TEXT", "doc_note TEXT"):
            try:
                self.conn.execute("ALTER TABLE km_invoices ADD COLUMN " + col)
            except sqlite3.OperationalError:
                pass
        try:
            self.conn.executescript(FTS)
            self.fts = True
        except sqlite3.OperationalError:
            self.fts = False     # χωρίς FTS5 → αναζήτηση με LIKE στα κανονικοποιημένα (ίδια αποτελέσματα, πιο αργά)
        self.conn.commit()

    def q(self, sql, args=()):
        with self.lock:
            return [dict(r) for r in self.conn.execute(sql, args).fetchall()]

    def one(self, sql, args=()):
        with self.lock:
            r = self.conn.execute(sql, args).fetchone()
            return dict(r) if r else None

    def x(self, sql, args=()):
        with self.lock:
            c = self.conn.execute(sql, args)
            self.conn.commit()
            return c


# ═══ ΔΙΚΤΥΟ ═══
class Net:
    """Μικρός πελάτης HTTP (requests). Χωριστή κλάση για να αντικαθίσταται στα τεστ."""

    def __init__(self, timeout=30):
        import requests  # noqa: lazy
        self.s = requests.Session()
        self.timeout = timeout

    def call(self, method, url, headers=None, body=None):
        r = self.s.request(method, url, headers=headers or {}, data=body, timeout=self.timeout)
        ct = r.headers.get("Content-Type", "")
        if "json" in ct:
            try:
                return r.status_code, r.json()
            except ValueError:
                return r.status_code, {}
        return r.status_code, r.content


def parse_invite(text: str):
    """Σύνδεσμος «https://fastwrite.tech/kostometro/#km_acct=<32 hex>» ή σκέτος κωδικός → (api, code)."""
    t = (text or "").strip()
    m = re.search(r"km_acct=([0-9a-fA-F]{32})", t)
    code = m.group(1).lower() if m else None
    if not code:
        h = re.sub(r"[^0-9a-fA-F]", "", t)
        code = h.lower() if len(h) == 32 else None
    if not code:
        return None, None
    origin = DEFAULT_ORIGIN
    if t.lower().startswith("http"):
        u = urlparse(t)
        origin = (u.scheme + "://" + u.netloc) if u.netloc else ""
        if origin.rstrip("/") not in ALLOWED_ORIGINS:
            return None, None
    return origin.rstrip("/") + "/api/km/", code


# ═══ Ο ΜΗΧΑΝΙΣΜΟΣ ═══
class Mailbox:
    def __init__(self, store: Store, base_dir, net=None, docs=None):
        self.st = store
        self.base = Path(base_dir)
        self.net = net
        self.docs = docs            # DocsBridge ή None (στα τεστ)
        self.sync_lock = threading.Lock()

    # ── σύνδεση ──
    def _net(self):
        if self.net is None:
            self.net = Net()
        return self.net

    def connect(self, invite_text, office="", user_id=None, device="FastWrite · Windows"):
        api, code = parse_invite(invite_text)
        if not code:
            return {"ok": False, "error": "bad_code"}
        priv = ec_new()
        auth = secrets.token_hex(32)
        body = json.dumps({"code": code, "acct_auth": auth, "pub": base64.b64encode(ec_pub_raw(priv)).decode(),
                           "device": device, "office": (office or "")[:80]}).encode()
        try:
            stc, j = self._net().call("POST", api + "pro/a/join", {"Content-Type": "application/json"}, body)
        except Exception as e:  # noqa
            return {"ok": False, "error": "network", "detail": str(e)[:200]}
        if stc != 200 or not isinstance(j, dict) or not j.get("ok"):
            return {"ok": False, "error": (j or {}).get("error", "http %s" % stc) if isinstance(j, dict) else "http %s" % stc}
        self.st.x("""INSERT INTO km_link (acct_id, api, user_id, name, office, auth, priv_pem, boss_pub, status, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'joined', ?)""",
                  (j["acct_id"], api, user_id, j.get("name"), office, protect(auth), protect(ec_priv_pem(priv)), j.get("boss_pub"), _now()))
        link = self.st.one("SELECT * FROM km_link WHERE acct_id = ?", (j["acct_id"],))
        return {"ok": True, "link": self.link_view(link)}

    def _auth(self, l):
        return unprotect(l["auth"])

    def _priv(self, l):
        return ec_priv_load(unprotect(l["priv_pem"]))

    def link_view(self, l):
        n = self.st.one("SELECT COUNT(*) AS n FROM km_invoices WHERE link_id = ? AND deleted = 0", (l["id"],))["n"]
        fl = self.st.one("SELECT COUNT(*) AS n FROM km_invoices WHERE link_id = ? AND deleted = 0 AND map_changed = 1", (l["id"],))["n"]
        code = None
        try:
            if l["priv_pem"]:
                code = pub_code(ec_pub_raw(self._priv(l)))
        except Exception:  # noqa
            code = None
        return {"id": l["id"], "name": l["name"], "biz": l["biz"], "office": l["office"], "status": l["status"], "code": code,
                "invoices": n, "map_changed": fl, "last_pull": l["last_pull"], "last_error": l["last_error"],
                "api": l["api"], "cursor": l["cursor"]}

    def links(self, user_id=None):
        rows = self.st.q("SELECT * FROM km_link ORDER BY id") if user_id is None else \
            self.st.q("SELECT * FROM km_link WHERE user_id = ? OR user_id IS NULL ORDER BY id", (user_id,))
        return [self.link_view(l) for l in rows]

    def _hdr(self, l, json_body=True):
        h = {"X-Km-Acct": l["acct_id"], "X-Km-Acct-Auth": self._auth(l)}
        if json_body:
            h["Content-Type"] = "application/json"
        return h

    def _ring(self, l, wrap_b64):
        ring = json.loads(open_with(self._priv(l), base64.b64decode(wrap_b64)).decode())
        return {int(k): bytes.fromhex(v) for k, v in ring.items()}

    # ── ΣΥΓΧΡΟΝΙΣΜΟΣ ──
    def busy(self):
        return self.sync_lock.locked()

    def sync_all(self):
        out = []
        if not self.sync_lock.acquire(blocking=False):
            return [{"busy": True}]
        try:
            for l in self.st.q("SELECT * FROM km_link WHERE status != 'revoked' ORDER BY id"):
                try:
                    out.append(self.sync_link(l))
                except Exception as e:  # noqa — μία επιχείρηση δεν ρίχνει τις άλλες
                    logger.exception("[km] sync link %s", l["id"])
                    self.st.x("UPDATE km_link SET last_error = ? WHERE id = ?", (str(e)[:300], l["id"]))
                    out.append({"link": l["id"], "error": str(e)[:200]})
        finally:
            self.sync_lock.release()
        return out

    def sync_link(self, l):
        api = l["api"]
        stc, me = self._net().call("GET", api + "pro/a/me", self._hdr(l, False))
        if stc == 410:
            self.st.x("UPDATE km_link SET status = 'revoked', last_error = 'revoked' WHERE id = ?", (l["id"],))
            return {"link": l["id"], "revoked": True}
        if stc != 200 or not isinstance(me, dict) or not me.get("ok"):
            err = (me or {}).get("error", "http %s" % stc) if isinstance(me, dict) else "http %s" % stc
            self.st.x("UPDATE km_link SET last_error = ? WHERE id = ?", (err, l["id"]))
            return {"link": l["id"], "error": err}
        if me.get("boss_pub") and me["boss_pub"] != l["boss_pub"]:
            self.st.x("UPDATE km_link SET boss_pub = ? WHERE id = ?", (me["boss_pub"], l["id"]))
        m = me.get("me") or {}
        if m.get("status") != "active" or not m.get("wrap_a"):
            self.st.x("UPDATE km_link SET status = 'joined', last_error = NULL WHERE id = ?", (l["id"],))
            return {"link": l["id"], "waiting": True}
        if not me.get("pro"):
            self.st.x("UPDATE km_link SET last_error = 'not_pro' WHERE id = ?", (l["id"],))
            return {"link": l["id"], "error": "not_pro"}
        self.st.x("UPDATE km_link SET status = 'active' WHERE id = ?", (l["id"],))
        ring = self._ring(l, m["wrap_a"])
        got, cur = 0, l["cursor"]
        for _ in range(PAGES_PER_RUN):
            stc, pg = self._net().call("GET", api + "pro/a/mail?after=%d&limit=%d" % (cur, PAGE_LIMIT), self._hdr(l, False))
            if stc == 410:
                self.st.x("UPDATE km_link SET status = 'revoked' WHERE id = ?", (l["id"],))
                return {"link": l["id"], "revoked": True, "got": got}
            if stc != 200 or not pg.get("ok"):
                raise RuntimeError("mail %s %s" % (stc, pg.get("error") if isinstance(pg, dict) else ""))
            for e in pg["entries"]:
                key = ring.get(int(e["a_ver"]))
                if key is None:   # το κλειδί δεν έχει έρθει ΑΚΟΜΑ — σταματάμε εδώ, ο δείκτης δεν προχωρά (ξανά στον επόμενο γύρο)
                    raise RuntimeError("λείπει το κλειδί A v%s" % e["a_ver"])
                try:
                    data = json.loads(open_sym(key, base64.b64decode(e["body"])).decode())
                    if not isinstance(data, dict) or data.get("kind") != e.get("kind") or (data.get("rid") or "_book") != e.get("rid"):
                        raise ValueError("το περιεχόμενο δεν ταιριάζει με την ετικέτα του server")
                except Exception as x:  # noqa — ΚΑΡΑΝΤΙΝΑ: ένα χαλασμένο γράμμα δεν σταματά ΠΟΤΕ όλη τη ροή
                    self.st.x("INSERT OR REPLACE INTO km_bad (link_id, seq, rid, err, at) VALUES (?, ?, ?, ?, ?)",
                              (l["id"], int(e["seq"]), str(e.get("rid"))[:80], str(x)[:200], _now()))
                    continue
                self.apply(l, e, data, ring)
                got += 1
            cur = int(pg["next"])
            # 🔴 ο δείκτης γράφεται ΜΕΤΑ την εφαρμογή κάθε σελίδας: διακοπή στη μέση = ξανά η ίδια σελίδα (upsert, όχι διπλό)
            self.st.x("UPDATE km_link SET cursor = ?, last_pull = ?, last_error = NULL WHERE id = ?", (cur, _now(), l["id"]))
            if not pg.get("more"):
                break
        self.st.x("UPDATE km_link SET last_pull = ?, last_error = NULL WHERE id = ?", (_now(), l["id"]))
        l = self.st.one("SELECT * FROM km_link WHERE id = ?", (l["id"],))
        sent = self.push_fixes(l, ring)
        self.fix_states(l)
        self._retry_photos(l, ring)
        return {"link": l["id"], "got": got, "cursor": cur, "fixes_sent": sent}

    # ── εφαρμογή ενός γράμματος ──
    def apply(self, l, e, data, ring=None):
        kind = data.get("kind")      # 🔴 ΜΟΝΟ ό,τι λέει το σφραγισμένο περιεχόμενο — ποτέ η ετικέτα του server
        if kind == "book":
            return self._apply_book(l, data)
        if kind == "item":
            return self._apply_book(l, {"items": {data.get("key"): data}} if data.get("key") else {})
        if kind == "del":
            return self._apply_del(l, data.get("rid"))
        if kind == "inv":
            return self._apply_inv(l, e, data, ring)

    def _supplier(self, link_id, name, vat):
        nn = norm(name)
        with self.st.lock:
            r = self.st.conn.execute("SELECT id FROM km_suppliers WHERE link_id = ? AND nname = ?", (link_id, nn)).fetchone()
            if r:
                if vat:
                    self.st.conn.execute("UPDATE km_suppliers SET vat = ? WHERE id = ?", (vat, r["id"]))
                return r["id"]
            c = self.st.conn.execute("INSERT INTO km_suppliers (link_id, name, nname, vat) VALUES (?, ?, ?, ?)", (link_id, name or "—", nn, vat))
            return c.lastrowid

    def _apply_book(self, l, b):
        changed = 0
        with self.st.lock:
            if b.get("biz"):
                self.st.conn.execute("UPDATE km_link SET biz = ? WHERE id = ?", (b["biz"][:80], l["id"]))
            prods = b.get("prods") or {}
            for key, it in (b.get("items") or {}).items():
                pid = it.get("pid") or key
                pname = it.get("pname") or prods.get(pid) or it.get("name")
                pk = it.get("pack") or {}
                per, base = pk.get("per"), pk.get("base")
                old = self.st.conn.execute("SELECT * FROM km_items WHERE link_id = ? AND key = ?", (l["id"], key)).fetchone()
                if not pk and old:          # το βιβλίο δεν έχει (ακόμα) επιβεβαιωμένη συσκευασία → κρατάμε ό,τι ήρθε με τις γραμμές
                    per, base = old["per"], old["base"]
                if old:
                    note = map_change(key, old["pid"], old["pname"], old["per"], pid, pname, per)
                    changed += self._flag_key(l["id"], key, note, pid, pname, per, base)
                self.st.conn.execute(
                    """INSERT INTO km_items (link_id, key, sup, code, name, pid, pname, per, base) VALUES (?,?,?,?,?,?,?,?,?)
                       ON CONFLICT(link_id, key) DO UPDATE SET sup=excluded.sup, code=excluded.code, name=excluded.name,
                       pid=excluded.pid, pname=excluded.pname, per=excluded.per, base=excluded.base""",
                    (l["id"], key, it.get("sup"), it.get("code"), it.get("name"), pid, pname, per, base))
            self.st.conn.commit()
        return changed

    def _flag_key(self, link_id, key, note, pid, pname, per, base):
        """Νέα αντιστοίχιση ενός κωδικού → όλες οι γραμμές του ενημερώνονται· αν άλλαξε κάτι ουσιαστικό (note),
        σημαδεύονται «άλλαξε η αντιστοίχιση» (από τι σε τι) ως ο λογιστής να πατήσει «Το είδα»."""
        rows = self.st.conn.execute(
            """SELECT ln.id, ln.inv_id, ln.unit_price, ln.disc_pct FROM km_lines ln JOIN km_invoices i ON i.id = ln.inv_id
               WHERE i.link_id = ? AND ln.item_key = ?""", (link_id, key)).fetchall()
        for r in rows:
            bp = None
            if per and r["unit_price"] is not None:
                bp = round(r["unit_price"] * (1 - (r["disc_pct"] or 0) / 100) / per, 4)
            if note:
                self.st.conn.execute("""UPDATE km_lines SET pid = ?, pname = ?, per = ?, base = ?, base_price = ?, map_changed = 1, map_note = ?
                                        WHERE id = ?""", (pid, pname, per, base, bp, note, r["id"]))
                self.st.conn.execute("UPDATE km_invoices SET map_changed = 1 WHERE id = ?", (r["inv_id"],))
            else:
                self.st.conn.execute("UPDATE km_lines SET pid = ?, pname = ?, per = ?, base = ?, base_price = COALESCE(?, base_price) WHERE id = ?",
                                     (pid, pname, per, base, bp, r["id"]))
        return len(rows) if note else 0

    def _apply_del(self, l, rid):
        inv = self.st.one("SELECT * FROM km_invoices WHERE link_id = ? AND rid = ?", (l["id"], rid))
        if not inv:
            return
        self.st.x("UPDATE km_invoices SET deleted = 1, updated_at = ? WHERE id = ?", (_now(), inv["id"]))
        if self.st.fts:
            self.st.x("DELETE FROM km_inv_fts WHERE rowid = ?", (inv["id"],))
        if self.docs and inv["doc_id"]:
            self.docs.mark_deleted(inv["doc_id"])

    def _apply_inv(self, l, e, d, ring):
        rec = d.get("rec") or {}
        rid = d.get("rid")
        if not RID_RE.match(str(rid or "")):
            return None
        link_id = l["id"]
        inv = self.st.one("SELECT * FROM km_invoices WHERE link_id = ? AND rid = ?", (link_id, rid))
        # 🔴 ΟΙ ΔΙΚΕΣ ΜΑΣ ΔΙΟΡΘΩΣΕΙΣ ΠΟΥ Ο BOSS ΔΕΝ ΕΧΕΙ ΑΚΟΜΑ ΠΕΡΑΣΕΙ: ξαναμπαίνουν από πάνω («ισχύει αμέσως»).
        remote = {f.get("id"): f for f in (rec.get("fixes") or [])}
        mine = self.st.q("SELECT * FROM km_fix_out WHERE link_id = ? AND rid = ? ORDER BY at", (link_id, rid))
        lines_in = rec.get("lines") or []
        old_lines = {}
        if inv:
            for ln in self.st.q("SELECT * FROM km_lines WHERE inv_id = ?", (inv["id"],)):
                old_lines.setdefault(ln["item_key"], ln)
        with self.st.lock:
          try:
            sup_id = self._supplier(link_id, _txt(rec.get("supplier"), 120), _txt(rec.get("sup_vat"), 40))
            date = rec.get("date") if DATE_RE.match(str(rec.get("date") or "")) else _ymd(rec.get("invDate"))
            hdr = {"number": rec.get("number"), "date": date, "net": rec.get("net"), "vat": rec.get("vat"),
                   "total": rec.get("total"), "sup_vat": rec.get("sup_vat")}
            lines = [dict(x) for x in lines_in]
            fix_state, fix_note = None, None
            for f in mine:
                st = remote.get(f["id"], {}).get("st")
                if st == "undone":
                    self.st.conn.execute("UPDATE km_fix_out SET state = 'undone' WHERE id = ?", (f["id"],))
                    fix_state, fix_note = "undone", "↩ Ο ιδιοκτήτης αναίρεσε τη διόρθωσή σου (%s)" % f["at"][:16].replace("T", " ")
                    continue
                if st == "applied":
                    self.st.conn.execute("UPDATE km_fix_out SET state = 'applied' WHERE id = ?", (f["id"],))
                    fix_state, fix_note = "applied", "✔ Η διόρθωσή σου πέρασε στο κινητό του ιδιοκτήτη"
                    continue
                if f["state"] in ("queued", "sent"):
                    p = json.loads(f["payload"])
                    _overlay(hdr, lines, p)
                    fix_state, fix_note = "pending", "✏️ Η διόρθωσή σου ισχύει — περιμένει το κινητό του ιδιοκτήτη"
            if fix_state is None and inv:
                fix_state, fix_note = inv["fix_state"], inv["fix_note"]
            photos = [p for p in (d.get("ph") or []) if isinstance(p, str) and RID_RE.match(p)][:20]
            if hdr["date"] and not DATE_RE.match(str(hdr["date"])):
                hdr["date"] = None
            vals = (sup_id, _txt(rec.get("supplier"), 120), _txt(hdr["sup_vat"], 40), _txt(hdr["number"], 60), hdr["date"], _num(hdr["net"]),
                    _num(hdr["vat"]), _num(hdr["total"]), "auto" if rec.get("approved") == "auto" else "manual", _txt(rec.get("by"), 60),
                    max(1, len(photos)), json.dumps(photos), fix_state, fix_note, e.get("seq"), json.dumps({"e": {"seq": e.get("seq")}, "d": d}), _now())
            if inv:
                self.st.conn.execute("""UPDATE km_invoices SET supplier_id=?, supplier=?, sup_vat=?, number=?, inv_date=?, net=?, vat=?,
                    total=?, approved=?, by_name=?, pages=?, photos=?, fix_state=?, fix_note=?, seq=?, raw=?, updated_at=?, deleted=0 WHERE id=?""",
                                     vals + (inv["id"],))
                inv_id = inv["id"]
                if self.st.fts:   # ΠΡΙΝ σβηστούν οι γραμμές — αλλιώς μένουν ορφανές εγγραφές στο ευρετήριο κειμένου
                    self.st.conn.execute("DELETE FROM km_line_fts WHERE rowid IN (SELECT id FROM km_lines WHERE inv_id = ?)", (inv_id,))
                self.st.conn.execute("DELETE FROM km_lines WHERE inv_id = ?", (inv_id,))
            else:
                c = self.st.conn.execute("""INSERT INTO km_invoices (supplier_id, supplier, sup_vat, number, inv_date, net, vat, total,
                    approved, by_name, pages, photos, fix_state, fix_note, seq, raw, updated_at, link_id, rid) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                                         vals + (link_id, rid))
                inv_id = c.lastrowid
            any_flag = 0
            for n, ln in enumerate(lines[:500]):
                if not isinstance(ln, dict):
                    continue
                key = _txt(ln.get("key"), 200)
                ln["code"], ln["desc"], ln["unit"] = _txt(ln.get("code"), 40), _txt(ln.get("desc"), 200), _txt(ln.get("unit"), 20)
                ln["pid"], ln["pname"] = _txt(ln.get("pid"), 200), _txt(ln.get("pname"), 200)
                pk = ln.get("pack") if isinstance(ln.get("pack"), dict) else {}
                per, base = _num(pk.get("per")), (pk.get("base") if pk.get("base") in ("L", "kg", "pc") else None)
                flag, note = 0, None
                prev = old_lines.get(key) if key else None
                mc = map_change(key, prev["pid"], prev["pname"], prev["per"], ln.get("pid"), ln.get("pname"), per) if prev else None
                if mc:
                    flag, note = 1, mc
                elif prev and prev["map_changed"]:
                    flag, note = 1, prev["map_note"]      # σήμανση που δεν «είδε» ακόμα ο λογιστής μένει
                any_flag |= flag
                c = self.st.conn.execute("""INSERT INTO km_lines (inv_id, n, code, code_key, "desc", unit, qty, unit_price, disc_pct, line_net,
                    vat_pct, per, base, base_price, item_key, pid, pname, map_changed, map_note, fixed) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                                         (inv_id, n, ln.get("code"), code_key(ln.get("code")), ln.get("desc"), ln.get("unit"),
                                          _num(ln.get("qty")), _num(ln.get("unit_price")), _num(ln.get("disc_pct")), _num(ln.get("line_net")),
                                          _num(ln.get("vat_pct")), per, base, _num(ln.get("base_price")), key, ln.get("pid"), ln.get("pname"),
                                          flag, note, 1 if (ln.get("_fixed") or ln.get("afix")) else 0))
                if self.st.fts:
                    self.st.conn.execute("INSERT INTO km_line_fts (rowid, txt) VALUES (?, ?)",
                                         (c.lastrowid, norm(" ".join(str(x or "") for x in (ln.get("code"), code_key(ln.get("code")),
                                                                                              ln.get("desc"), ln.get("pname"), rec.get("supplier"))))))
                if key:
                    self.st.conn.execute(
                        """INSERT INTO km_items (link_id, key, sup, code, name, pid, pname, per, base) VALUES (?,?,?,?,?,?,?,?,?)
                           ON CONFLICT(link_id, key) DO UPDATE SET pid=excluded.pid, pname=excluded.pname, per=excluded.per, base=excluded.base""",
                        (link_id, key, rec.get("supplier"), ln.get("code"), ln.get("desc"), ln.get("pid"), ln.get("pname"), per, base))
            self.st.conn.execute("UPDATE km_invoices SET map_changed = ? WHERE id = ?", (1 if any_flag else 0, inv_id))
            if self.st.fts:
                self.st.conn.execute("DELETE FROM km_inv_fts WHERE rowid = ?", (inv_id,))
                self.st.conn.execute("INSERT INTO km_inv_fts (rowid, txt) VALUES (?, ?)",
                                     (inv_id, norm(" ".join([str(rec.get("supplier") or ""), str(hdr["number"] or ""), str(hdr["sup_vat"] or "")] +
                                                            [" ".join(str(x or "") for x in (ln.get("code"), code_key(ln.get("code")), ln.get("desc"), ln.get("pname")))
                                                             for ln in lines]))))
            self.st.conn.commit()
          except Exception:
            self.st.conn.rollback()   # 🔴 όλο το τιμολόγιο ή τίποτα — ποτέ «σβησμένες γραμμές» στη μέση
            raise
        # φωτογραφίες: κατεβαίνουν μία φορά (ο λογιστής βλέπει ΠΑΝΤΑ τη φωτογραφία — 6/10)
        paths = self._photos(l, photos, ring, inv_id) if ring else []
        if self.docs:
            self.docs.diverged = False
            doc_id = self.docs.upsert(l, self.st.one("SELECT * FROM km_invoices WHERE id = ?", (inv_id,)),
                                      self.st.q("SELECT * FROM km_lines WHERE inv_id = ? ORDER BY n", (inv_id,)), paths)
            if doc_id:
                self.st.x("UPDATE km_invoices SET doc_id = ?, doc_note = ? WHERE id = ?",
                          (doc_id, "⚠ Το έγγραφο #%d άλλαξε στα «Έγγραφα» — οι νέες τιμές του πελάτη ΔΕΝ γράφτηκαν από πάνω του." % doc_id
                           if self.docs.diverged else None, inv_id))
        return inv_id

    def photo_dir(self, link_id):
        p = self.base / "kostometro" / str(link_id)
        p.mkdir(parents=True, exist_ok=True)
        return p

    def _photos(self, l, ids, ring, inv_id=None):
        out = []
        d = self.photo_dir(l["id"])
        for pid in ids:
            if not RID_RE.match(pid or ""):
                continue
            f = d / (pid + ".jpg")
            if not f.exists():
                try:
                    stc, raw = self._net().call("GET", l["api"] + "pro/a/photo?id=" + pid, self._hdr(l, False))
                    if stc != 200 or not isinstance(raw, (bytes, bytearray)):
                        if inv_id:   # ΔΕΝ χάνεται: ξαναδοκιμάζεται σε κάθε γύρο
                            self.st.x("INSERT OR IGNORE INTO km_photo_need (link_id, inv_id, pid) VALUES (?, ?, ?)", (l["id"], inv_id, pid))
                        continue
                    img = None
                    for k in sorted(ring, reverse=True):
                        try:
                            img = open_sym(ring[k], bytes(raw))
                            break
                        except Exception:  # noqa
                            continue
                    if img is None:
                        continue
                    f.write_bytes(img)
                except Exception:  # noqa — η φωτογραφία ξαναδοκιμάζεται στον επόμενο γύρο
                    logger.exception("[km] photo %s", pid)
                    if inv_id:
                        self.st.x("INSERT OR IGNORE INTO km_photo_need (link_id, inv_id, pid) VALUES (?, ?, ?)", (l["id"], inv_id, pid))
                    continue
            if inv_id:
                self.st.x("DELETE FROM km_photo_need WHERE link_id = ? AND pid = ?", (l["id"], pid))
            out.append(str(f))
        return out

    def _retry_photos(self, l, ring):
        for x in self.st.q("SELECT * FROM km_photo_need WHERE link_id = ? AND tries < 50 ORDER BY tries LIMIT 50", (l["id"],)):
            self.st.x("UPDATE km_photo_need SET tries = tries + 1 WHERE link_id = ? AND pid = ?", (l["id"], x["pid"]))
            got = self._photos(l, [x["pid"]], ring, x["inv_id"])
            inv = self.st.one("SELECT * FROM km_invoices WHERE id = ?", (x["inv_id"],))
            if got and inv and self.docs and inv["doc_id"] and json.loads(inv["photos"] or "[]")[:1] == [x["pid"]]:
                self.docs.set_file(inv["doc_id"], got[0])

    # ── ΔΙΟΡΘΩΣΗ ΤΟΥ ΛΟΓΙΣΤΗ: ισχύει ΑΜΕΣΩΣ ──
    def fix(self, inv_id, h=None, l=None):
        inv = self.st.one("SELECT * FROM km_invoices WHERE id = ?", (inv_id,))
        if not inv or inv["deleted"]:
            return {"ok": False, "error": "no_invoice"}
        link = self.st.one("SELECT * FROM km_link WHERE id = ?", (inv["link_id"],))
        if not link or link["status"] == "revoked":
            return {"ok": False, "error": "revoked"}
        lines = self.st.q("SELECT * FROM km_lines WHERE inv_id = ? ORDER BY n", (inv_id,))
        cur = {"number": inv["number"], "date": inv["inv_date"], "net": inv["net"], "vat": inv["vat"], "total": inv["total"], "sup_vat": inv["sup_vat"]}
        ph, pl = {}, []
        for k, v in (h or {}).items():
            if k not in HDR_FIELDS:
                continue
            nv = _num(v) if k in NUM_FIELDS else ((str(v).strip() or None) if v is not None else None)
            if k == "date" and nv and not re.match(r"^\d{4}-\d{2}-\d{2}$", nv):
                return {"ok": False, "error": "bad_date"}
            # KM-PRO-F5 · το Σύνολο δεν αδειάζει (άδειο = «Εκκρεμές» στο κινητό = το τιμολόγιο φεύγει από το λογιστήριο)
            if k == "total" and nv is None:
                return {"ok": False, "error": "total_required"}
            if isinstance(nv, float) and not (math.isfinite(nv) and abs(nv) < 1e9):
                return {"ok": False, "error": "bad_number"}   # NaN/Infinity/1e400 → το κινητό δεν θα τα δεχόταν (acctValOk)
            if isinstance(nv, str) and len(nv) > 200:
                return {"ok": False, "error": "too_long"}
            if nv != cur[k]:
                ph[k] = [cur[k], nv]
        for x in (l or []):
            i, f = int(x.get("i", -1)), x.get("f")
            if f not in LINE_FIELDS or i < 0 or i >= len(lines):
                continue
            o = lines[i][f]
            nv = _num(x.get("n")) if f in NUM_FIELDS else ((str(x.get("n")).strip() or None) if x.get("n") is not None else None)
            if isinstance(nv, str) and len(nv) > 200:
                return {"ok": False, "error": "too_long"}   # KM-PRO-F5 · ίδιο όριο με το κινητό (acctValOk)
            if isinstance(nv, float) and not (math.isfinite(nv) and abs(nv) < 1e9):
                return {"ok": False, "error": "bad_number"}
            if nv != o:
                pl.append({"i": i, "f": f, "o": o, "n": nv})
        if not ph and not pl:
            return {"ok": False, "error": "nothing"}
        fid = secrets.token_hex(16)
        payload = {"id": fid, "rid": inv["rid"], "by": link["office"] or "λογιστής", "at": _now(),
                   "h": {("invDate" if k == "date" else k): v for k, v in ph.items()}, "l": pl}
        self.st.x("INSERT INTO km_fix_out (id, link_id, inv_id, rid, payload, state, at) VALUES (?, ?, ?, ?, ?, 'queued', ?)",
                  (fid, link["id"], inv_id, inv["rid"], json.dumps(payload), _now()))
        # εδώ, τώρα: στους πίνακες και στο έγγραφο (εξαγωγές / Xero)
        self._apply_local(inv, lines, payload)
        return {"ok": True, "id": fid, "h": ph, "l": pl}

    def _apply_local(self, inv, lines, payload):
        hdr = {"number": inv["number"], "date": inv["inv_date"], "net": inv["net"], "vat": inv["vat"], "total": inv["total"], "sup_vat": inv["sup_vat"]}
        ls = [dict(x) for x in lines]
        _overlay(hdr, ls, payload)
        with self.st.lock:
            self.st.conn.execute("""UPDATE km_invoices SET number=?, inv_date=?, net=?, vat=?, total=?, sup_vat=?, fix_state='pending',
                fix_note=?, updated_at=? WHERE id=?""", (hdr["number"], hdr["date"], _num(hdr["net"]), _num(hdr["vat"]), _num(hdr["total"]),
                                                       hdr["sup_vat"], "✏️ Η διόρθωσή σου ισχύει — περιμένει το κινητό του ιδιοκτήτη", _now(), inv["id"]))
            for ln in ls:
                if ln.get("_fixed"):
                    bp = ln.get("base_price")
                    if ln.get("per") and ln.get("unit_price") is not None:
                        bp = round(ln["unit_price"] * (1 - (ln.get("disc_pct") or 0) / 100) / ln["per"], 4)
                    self.st.conn.execute("""UPDATE km_lines SET code=?, code_key=?, "desc"=?, unit=?, qty=?, unit_price=?, disc_pct=?, line_net=?,
                        vat_pct=?, base_price=?, fixed=1 WHERE id=?""", (ln.get("code"), code_key(ln.get("code")), ln.get("desc"), ln.get("unit"),
                                                                     _num(ln.get("qty")), _num(ln.get("unit_price")), _num(ln.get("disc_pct")),
                                                                     _num(ln.get("line_net")), _num(ln.get("vat_pct")), bp, ln["id"]))
            self.st.conn.commit()
        if self.docs and inv["doc_id"]:
            l = self.st.one("SELECT * FROM km_link WHERE id = ?", (inv["link_id"],))
            self.docs.upsert(l, self.st.one("SELECT * FROM km_invoices WHERE id = ?", (inv["id"],)),
                             self.st.q("SELECT * FROM km_lines WHERE inv_id = ? ORDER BY n", (inv["id"],)), None)

    def push_fixes(self, l, ring=None):
        if not l.get("boss_pub") or not ring:
            return 0
        av = max(ring)
        sent = 0
        for f in self.st.q("SELECT * FROM km_fix_out WHERE link_id = ? AND state = 'queued' ORDER BY at", (l["id"],)):
            # 🔴 υπογραφή με το A (HMAC): το δημόσιο κλειδί του Boss το ξέρει κι ο server — ΜΟΝΟ κάτοχος του A φτιάχνει έγκυρη διόρθωση
            env = {"p": f["payload"], "av": av, "mac": hmac.new(ring[av], f["payload"].encode(), hashlib.sha256).hexdigest()}
            meta = base64.b64encode(seal_to(base64.b64decode(l["boss_pub"]), json.dumps(env).encode())).decode()
            stc, j = self._net().call("POST", l["api"] + "pro/a/fix", self._hdr(l), json.dumps({"id": f["id"], "meta": meta}).encode())
            if stc == 200 and isinstance(j, dict) and j.get("ok"):
                self.st.x("UPDATE km_fix_out SET state = 'sent' WHERE id = ?", (f["id"],))
                sent += 1
            elif stc == 410:
                self.st.x("UPDATE km_link SET status = 'revoked' WHERE id = ?", (l["id"],))
                break
        return sent

    def fix_states(self, l):
        stc, j = self._net().call("GET", l["api"] + "pro/a/fixes", self._hdr(l, False))
        if stc != 200 or not isinstance(j, dict) or not j.get("ok"):
            return
        for f in j.get("fixes") or []:
            if f.get("status") in ("applied", "undone"):
                self.st.x("UPDATE km_fix_out SET state = ? WHERE id = ? AND state IN ('sent', 'applied')", (f["status"], f["id"]))
            elif f.get("status") == "rejected":
                mine = self.st.one("SELECT * FROM km_fix_out WHERE id = ? AND state IN ('queued', 'sent')", (f["id"],))
                if not mine:
                    continue
                # δεν πέρασε (ο πελάτης είχε αλλάξει το τιμολόγιο στο μεταξύ ή η σύνδεση έκλεισε): γυρνάμε στο τελευταίο γράμμα του Boss
                self.st.x("UPDATE km_fix_out SET state = 'rejected' WHERE id = ?", (f["id"],))
                inv = self.st.one("SELECT * FROM km_invoices WHERE id = ?", (mine["inv_id"],))
                if inv and inv["raw"]:
                    r = json.loads(inv["raw"])
                    self._apply_inv(l, r["e"], r["d"], None)
                    self.st.x("UPDATE km_invoices SET fix_state = 'rejected', fix_note = ? WHERE id = ?",
                              ("⚠ Η διόρθωσή σου ΔΕΝ πέρασε: ο πελάτης είχε ήδη αλλάξει αυτό το τιμολόγιο. Δες τις τρέχουσες τιμές.", inv["id"]))

    def leave(self, link_id):
        l = self.st.one("SELECT * FROM km_link WHERE id = ?", (link_id,))
        if not l:
            return {"ok": False, "error": "no_link"}
        try:   # ο server ελευθερώνει τη θέση (ο Boss το βλέπει) — αν δεν απαντά, κλείνουμε τοπικά έτσι κι αλλιώς
            if l["auth"]:
                self._net().call("POST", l["api"] + "pro/a/leave", self._hdr(l), b"{}")
        except Exception:  # noqa
            pass
        # Τα τιμολόγια ΜΕΝΟΥΝ (είναι τα βιβλία του πελάτη)· σβήνει μόνο το κλειδί του υπολογιστή.
        self.st.x("UPDATE km_link SET status = 'revoked', priv_pem = '', auth = '', last_error = 'disconnected' WHERE id = ?", (link_id,))
        return {"ok": True}

    def seen(self, inv_id):
        self.st.x("UPDATE km_lines SET map_changed = 0 WHERE inv_id = ?", (inv_id,))
        self.st.x("UPDATE km_invoices SET map_changed = 0 WHERE id = ?", (inv_id,))
        return {"ok": True}

    # ── ΑΝΑΖΗΤΗΣΗ — ΠΑΝΤΑ με σελιδοποίηση και ευρετήρια ──
    def _fts_q(self, q):
        toks = [t for t in (x.replace('"', "") for x in re.split(r"\s+", norm(q))) if t]
        return " AND ".join('"%s"*' % t for t in toks[:8]) if toks else None

    def search(self, q="", link_id=None, supplier_id=None, date_from=None, date_to=None, flag=None, page=1, size=25, user_id=None):
        size = max(1, min(int(size or 25), SEARCH_MAX_SIZE))
        page = max(1, int(page or 1))
        where, args = ["i.deleted = 0"], []
        if user_id is not None:
            where.append("i.link_id IN (SELECT id FROM km_link WHERE user_id = ? OR user_id IS NULL)")
            args.append(user_id)
        if link_id:
            where.append("i.link_id = ?"); args.append(int(link_id))
        if supplier_id:
            where.append("i.supplier_id = ?"); args.append(int(supplier_id))
        if date_from:
            where.append("i.inv_date >= ?"); args.append(date_from)
        if date_to:
            where.append("i.inv_date <= ?"); args.append(date_to)
        if flag == "map":
            where.append("i.map_changed = 1")
        elif flag == "fix":
            where.append("i.fix_state IS NOT NULL")
        if q and q.strip():
            fq = self._fts_q(q) if self.st.fts else None
            if fq:
                where.append("i.id IN (SELECT rowid FROM km_inv_fts WHERE km_inv_fts MATCH ?)"); args.append(fq)
            else:
                like = "%" + norm(q) + "%"
                where.append("""(lower(i.supplier) LIKE ? OR i.number LIKE ? OR i.id IN (SELECT inv_id FROM km_lines WHERE lower("desc") LIKE ? OR code_key LIKE ?))""")
                args += [like, like, like, "%" + code_key(q) + "%"]
        w = " AND ".join(where)
        total = self.st.one("SELECT COUNT(*) AS n FROM km_invoices i WHERE " + w, args)["n"]
        rows = self.st.q("""SELECT i.id, i.link_id, i.rid, i.supplier, i.number, i.inv_date, i.net, i.vat, i.total, i.approved, i.by_name,
                            i.fix_state, i.fix_note, i.map_changed, i.doc_id, i.pages,
                            (SELECT COUNT(*) FROM km_lines WHERE inv_id = i.id) AS n_lines, k.biz, k.name AS link_name
                            FROM km_invoices i JOIN km_link k ON k.id = i.link_id WHERE """ + w +
                         " ORDER BY i.inv_date DESC, i.id DESC LIMIT ? OFFSET ?", args + [size, (page - 1) * size])
        return {"ok": True, "items": rows, "total": total, "page": page, "size": size, "pages": max(1, -(-total // size))}

    def search_lines(self, q="", link_id=None, date_from=None, date_to=None, page=1, size=25, user_id=None):
        size = max(1, min(int(size or 25), SEARCH_MAX_SIZE))
        page = max(1, int(page or 1))
        where, args = ["i.deleted = 0"], []
        if user_id is not None:
            where.append("i.link_id IN (SELECT id FROM km_link WHERE user_id = ? OR user_id IS NULL)")
            args.append(user_id)
        if link_id:
            where.append("i.link_id = ?"); args.append(int(link_id))
        if date_from:
            where.append("i.inv_date >= ?"); args.append(date_from)
        if date_to:
            where.append("i.inv_date <= ?"); args.append(date_to)
        if q and q.strip():
            fq = self._fts_q(q) if self.st.fts else None
            if fq:
                where.append("ln.id IN (SELECT rowid FROM km_line_fts WHERE km_line_fts MATCH ?)"); args.append(fq)
            else:
                like = "%" + norm(q) + "%"
                where.append("""(lower(ln."desc") LIKE ? OR ln.code_key LIKE ?)"""); args += [like, "%" + code_key(q) + "%"]
        w = " AND ".join(where)
        total = self.st.one("SELECT COUNT(*) AS n FROM km_lines ln JOIN km_invoices i ON i.id = ln.inv_id WHERE " + w, args)["n"]
        rows = self.st.q("""SELECT ln.*, i.supplier, i.inv_date, i.number, i.rid FROM km_lines ln JOIN km_invoices i ON i.id = ln.inv_id
                            WHERE """ + w + " ORDER BY i.inv_date DESC, ln.inv_id DESC, ln.n LIMIT ? OFFSET ?", args + [size, (page - 1) * size])
        return {"ok": True, "items": rows, "total": total, "page": page, "size": size, "pages": max(1, -(-total // size))}

    def invoice(self, inv_id):
        inv = self.st.one("""SELECT i.*, k.biz, k.name AS link_name FROM km_invoices i JOIN km_link k ON k.id = i.link_id WHERE i.id = ?""", (inv_id,))
        if not inv:
            return None
        inv["lines"] = self.st.q("SELECT * FROM km_lines WHERE inv_id = ? ORDER BY n", (inv_id,))
        inv["photos"] = json.loads(inv["photos"] or "[]")
        inv["fixes"] = self.st.q("SELECT id, state, at, payload FROM km_fix_out WHERE inv_id = ? ORDER BY at DESC", (inv_id,))
        return inv

    def suppliers(self, link_id=None, user_id=None):
        w, a = ["link_id IN (SELECT id FROM km_link WHERE user_id = ? OR user_id IS NULL)"], [user_id]
        if link_id:
            w.append("link_id = ?"); a.append(int(link_id))
        return self.st.q("SELECT id, name, vat FROM km_suppliers WHERE " + " AND ".join(w) + " ORDER BY nname LIMIT 1000", a)


def _overlay(hdr, lines, p):
    """Εφαρμόζει μια διόρθωση (payload) πάνω σε κεφαλίδα + γραμμές — ίδια για τοπικό και ξανα-εφαρμογή."""
    for k, v in (p.get("h") or {}).items():
        kk = "date" if k == "invDate" else k
        if kk in hdr:
            hdr[kk] = v[1]
    for x in p.get("l") or []:
        i = x.get("i")
        if isinstance(i, int) and 0 <= i < len(lines) and x.get("f") in LINE_FIELDS:
            lines[i][x["f"]] = x.get("n")
            lines[i]["_fixed"] = 1


def map_change(key, old_pid, old_pname, old_per, pid, pname, per):
    """Τι άλλαξε στην αντιστοίχιση ενός κωδικού — ή None αν τίποτα ουσιαστικό.
    ΔΕΝ είναι αλλαγή: (α) κωδικός χωρίς κεντρικό προϊόν που ΑΠΛΩΣ απέκτησε ένα με το ίδιο όνομα (π.χ. έγινε ο
    στόχος ενός «ίδιο με…»), (β) συσκευασία που έλειπε και τώρα συμπληρώθηκε. Αλλιώς ο λογιστής θα έβλεπε θόρυβο."""
    parts = []
    implicit = old_pid in (None, "", key)
    if old_pid != pid and not (implicit and (old_pname or "") == (pname or "")):
        parts.append("προϊόν «%s» → «%s»" % (old_pname or old_pid or "—", pname or pid or "—"))
    if old_per is not None and (old_per or None) != (per or None):
        parts.append("συσκευασία %s → %s" % (_fmt(old_per), _fmt(per)))
    return ("Άλλαξε η αντιστοίχιση: " + " · ".join(parts)) if parts else None


def _fmt(v):
    if v is None:
        return "—"
    return ("%g" % v).replace(".", ",")


def _now():
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


# ═══ ΓΕΦΥΡΑ ΠΡΟΣ ΤΑ ΕΓΓΡΑΦΑ ΤΟΥ FASTWRITE (Xero / εξαγωγές «ως έχει») ═══
class DocsBridge:
    """Κάθε τιμολόγιο Kostometro γίνεται κι ένα κανονικό έγγραφο FastWrite (status «Pending» = ένα βήμα πριν το Approved).
    Το result_json έχει τα ίδια ονόματα πεδίων που διαβάζουν οι εξαγωγές και το _extract_bill_data_from_doc (Xero)."""

    def __init__(self, db):
        self.db = db
        self.diverged = False

    @staticmethod
    def result(inv, lines):
        return {
            "supplier_name": _safe(inv["supplier"]), "supplier_vat": _safe(inv["sup_vat"]), "invoice_number": _safe(inv["number"]) or "",
            "invoice_date": inv["inv_date"] or "", "currency": "EUR",
            "subtotal": inv["net"], "vat_amount": inv["vat"], "total": inv["total"],
            "line_items": [{"code": _safe(ln["code"]), "description": _safe(ln["desc"]), "quantity": ln["qty"], "unit": _safe(ln["unit"]),
                            "unit_price": ln["unit_price"], "discount_pct": ln["disc_pct"], "amount": ln["line_net"],
                            "vat_pct": ln["vat_pct"]} for ln in lines],
            "_km_rid": inv["rid"], "_km_link": inv["link_id"], "_km_approved": inv["approved"],
        }

    def upsert(self, link, inv, lines, photo_paths):
        data = self.result(inv, lines)
        data["_km_fp"] = self.fp(data)
        name = _safe("Kostometro · %s · %s" % (inv["supplier"] or "—", inv["number"] or inv["inv_date"] or inv["rid"]))
        if inv.get("doc_id"):
            doc = self.db.get_document(inv["doc_id"])
            if doc:
                try:
                    old = json.loads(doc.get("result_json") or "{}")
                except ValueError:
                    old = {}
                # Το έγγραφο το άλλαξε κάποιος στα «Έγγραφα» (όχι από τη σελίδα Kostometro); ΔΕΝ το πατάμε σιωπηλά.
                if old.get("_km_fp") and old["_km_fp"] != self.fp(old):
                    self.diverged = True
                    return doc["id"]
                for k, v in old.items():           # ό,τι έγραψε το FastWrite (π.χ. _xero_invoice_id) ΜΕΝΕΙ
                    if k.startswith("_") and not k.startswith("_km_"):
                        data[k] = v
                self.db.update_document_status(doc["id"], doc.get("status") or "Pending", json.dumps(data, ensure_ascii=False))
                self.db.set_document_filename(doc["id"], name)
                if photo_paths and not doc.get("file_path"):
                    self.db._exec_write("UPDATE documents SET file_path = ? WHERE id = ?", (photo_paths[0], doc["id"]))
                return doc["id"]
        doc_id = self.db.insert_document(name, file_path=(photo_paths[0] if photo_paths else None), schema_name=None,
                                         original_filename=name, user_id=link.get("user_id"))
        self.db.update_document_status(doc_id, "Pending", json.dumps(data, ensure_ascii=False))
        return doc_id

    @staticmethod
    def fp(data):
        return hashlib.sha256(json.dumps({k: v for k, v in data.items() if not k.startswith("_")}, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]

    def set_file(self, doc_id, path):
        doc = self.db.get_document(doc_id)
        if doc and not doc.get("file_path"):
            self.db._exec_write("UPDATE documents SET file_path = ? WHERE id = ?", (path, doc_id))

    def mark_deleted(self, doc_id):
        doc = self.db.get_document(doc_id)
        if not doc:
            return
        try:
            data = json.loads(doc.get("result_json") or "{}")
        except ValueError:
            data = {}
        if data.get("_xero_invoice_id"):          # πήγε ήδη στο Xero: μένει, με σήμανση
            data["_km_deleted"] = True
            self.db.update_document_status(doc_id, doc.get("status") or "Pending", json.dumps(data, ensure_ascii=False))
        else:
            self.db.delete_document(doc_id)


def _int(v):
    try:
        return int(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _date(v):
    return v if v and DATE_RE.match(str(v)) else None


# ═══ FLASK — οι διαδρομές της σελίδας «Kostometro» (μόνο desktop) ═══
def register(app, db, base_dir, require_auth, start_thread=True, net=None):
    from flask import jsonify, request, send_file
    store = Store(Path(base_dir) / "data" / "kostometro.db")
    mb = Mailbox(store, base_dir, net=net, docs=DocsBridge(db))
    app.config["KM_MAILBOX"] = mb

    def uid():
        return request.current_user["user_id"]

    def own_inv(inv_id):
        inv = mb.invoice(inv_id)
        if not inv:
            return None
        link = store.one("SELECT user_id FROM km_link WHERE id = ?", (inv["link_id"],))
        if link and link["user_id"] not in (None, uid()):
            return None
        return inv

    @app.get("/api/km/status")
    @require_auth
    def km_status():
        return jsonify({"ok": True, "links": mb.links(uid()), "fts": store.fts, "busy": mb.busy()})

    @app.post("/api/km/connect")
    @require_auth
    def km_connect():
        b = request.get_json(silent=True) or {}
        r = mb.connect(b.get("link") or b.get("code") or "", office=b.get("office") or "", user_id=uid())
        if r.get("ok"):
            threading.Thread(target=mb.sync_all, daemon=True).start()
        return jsonify(r), (200 if r.get("ok") else 400)

    @app.post("/api/km/sync")
    @require_auth
    def km_sync():
        # στο παρασκήνιο: μεγάλη λήψη (χιλιάδες γράμματα + φωτογραφίες) δεν «παγώνει» την οθόνη · η σελίδα ρωτά /status
        if not mb.busy():
            threading.Thread(target=mb.sync_all, daemon=True).start()
        return jsonify({"ok": True, "started": True})

    @app.post("/api/km/links/<int:link_id>/disconnect")
    @require_auth
    def km_disconnect(link_id):
        l = store.one("SELECT * FROM km_link WHERE id = ?", (link_id,))
        if not l or l["user_id"] not in (None, uid()):
            return jsonify({"ok": False, "error": "no_link"}), 404
        return jsonify(mb.leave(link_id))

    @app.get("/api/km/suppliers")
    @require_auth
    def km_suppliers():
        return jsonify({"ok": True, "suppliers": mb.suppliers(_int(request.args.get("link")), uid())})

    @app.get("/api/km/invoices")
    @require_auth
    def km_invoices():
        a = request.args
        return jsonify(mb.search(q=a.get("q", ""), link_id=_int(a.get("link")), supplier_id=_int(a.get("sup")), date_from=_date(a.get("from")),
                                 date_to=_date(a.get("to")), flag=a.get("flag"), page=_int(a.get("page")) or 1, size=_int(a.get("size")) or 25, user_id=uid()))

    @app.get("/api/km/lines")
    @require_auth
    def km_lines():
        a = request.args
        return jsonify(mb.search_lines(q=a.get("q", ""), link_id=_int(a.get("link")), date_from=_date(a.get("from")), date_to=_date(a.get("to")),
                                       page=_int(a.get("page")) or 1, size=_int(a.get("size")) or 25, user_id=uid()))

    @app.get("/api/km/invoices/<int:inv_id>")
    @require_auth
    def km_invoice(inv_id):
        inv = own_inv(inv_id)
        if not inv:
            return jsonify({"ok": False, "error": "no_invoice"}), 404
        return jsonify({"ok": True, "invoice": inv})

    @app.get("/api/km/invoices/<int:inv_id>/photo/<int:n>")
    @require_auth
    def km_photo(inv_id, n):
        inv = own_inv(inv_id)
        if not inv or n < 0 or n >= len(inv["photos"]):
            return jsonify({"ok": False, "error": "no_photo"}), 404
        f = mb.photo_dir(inv["link_id"]) / (inv["photos"][n] + ".jpg")
        if not f.exists():
            return jsonify({"ok": False, "error": "not_downloaded"}), 404
        return send_file(str(f), mimetype="image/jpeg")

    @app.post("/api/km/invoices/<int:inv_id>/fix")
    @require_auth
    def km_fix(inv_id):
        if not own_inv(inv_id):
            return jsonify({"ok": False, "error": "no_invoice"}), 404
        b = request.get_json(silent=True) or {}
        r = mb.fix(inv_id, h=b.get("h") or {}, l=b.get("l") or [])
        if r.get("ok"):
            threading.Thread(target=mb.sync_all, daemon=True).start()
        return jsonify(r), (200 if r.get("ok") else 400)

    @app.post("/api/km/invoices/<int:inv_id>/seen")
    @require_auth
    def km_seen(inv_id):
        if not own_inv(inv_id):
            return jsonify({"ok": False, "error": "no_invoice"}), 404
        return jsonify(mb.seen(inv_id))

    if start_thread:
        def loop():
            while True:
                time.sleep(SYNC_EVERY_S)
                try:
                    mb.sync_all()
                except Exception:  # noqa
                    logger.exception("[km] sync loop")
        threading.Thread(target=loop, daemon=True, name="km-mailbox").start()
    return mb
